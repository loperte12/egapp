# Motor KYC — Especificación de Ingeniería (Fase B) · EG Route Plan

> Capa sobre: auth unificada (Fase A) + `@egrouteplan/ui-kit` (primitivos).
> Documento hermano de `KYC-DESIGN.md` (visión producto). Este es el contrato de ingeniería.

---

## Pilar 1 · La Bóveda de Datos (Modelo relacional + criptografía PII)

### 1.1 Tablas (schema `mobility`, DDL en `escrow-wallet/sql/006_kyc_engine.sql`)

| Tabla | Rol | Claves de diseño |
|---|---|---|
| `kyc_submissions` | Agregado raíz del caso KYC | FSM (`status`), `idempotency_key` UNIQUE, PII cifrada por envelope, dedupe por `doc_number_hash`, cola de revisión por índice parcial |
| `kyc_documents` | Piezas documentales (binario en objeto) | `UNIQUE(submission_id, doc_type, side)` = idempotencia natural; `sha256` de integridad; OCR cifrado; el binario NUNCA pasa por el backend |
| `kyc_biometrics` | Pruebas de vida/face-match | `challenge_id` UNIQUE (anti-replay), scores, flags anti-spoof, proof cifrado |
| `kyc_audit_logs` | Ledger inmutable (Pilar 5) | Append-only por trigger + **hash-chain** (`prev_hash`/`entry_hash`) |
| `device_fingerprints` | Escudo contextual | `UNIQUE(user_id, device_id_hash)`, todo con hash |
| `aml_watchlist_hits` | Resultados PEP/sanciones | estado OPEN/CONFIRMED/FALSE_POSITIVE |

### 1.2 Envelope Encryption (campos JSONB sensibles)

```
KEK (KMS o env KYC_KEK_HEX en Fase 1) ──cifra──▶ DEK aleatoria por submission
DEK ──cifra──▶ AES-256-GCM { fullName, docNumber, ocrRaw, proofMeta }
BD guarda: pii_enc (ciphertext+tag+iv) + pii_dek_enc (DEK cifrada) + pii_kms_key_id (rotación)
```

- Utilidad implementada: `src/mobility/kyc/crypto/envelope.ts` (AES-256-GCM, KEK por env, interfaz `KmsProvider` para KMS real — Alibaba KMS/AWS KMS — sin cambiar consumidores).
- **Jamás** PII en logs, en `audit_logs.payload`, ni en URLs (storage keys son UUIDs opacos).
- Índices sobre PII solo con `sha256(valor + pepper)` (`doc_number_hash`).

### 1.3 Pre-signed URLs (binario fuera del backend)

```
App RN                        Backend                        S3/OSS/MinIO
  │  POST …/documents/presign    │                                │
  │ {docType,side,mime,sha256}   │                                │
  │◀ {uploadUrl, headers, key}   │                                │
  │  PUT binario (directo) ─────────────────────────────────────▶ │
  │  POST …/documents/complete   │                                │
  │ {key, sha256}                │ verifica sha256 + encola OCR   │
```

Límite 8 MB/pieza, MIME whitelist (`image/jpeg`, `image/png`, `image/webp`), URL TTL 5 min, objeto con SSE (cifrado en reposo) y ciclo de vida (borrado a los 90 días tras decisión final; inmediato tras anonimización).

---

## Pilar 2 · El Cerebro Asíncrono (FSM + orquestación)

### 2.1 Máquina de estados (tipada en `kyc.fsm.ts` y en `@egrouteplan/contracts`)

```
INITIATED ──docs completas──▶ OCR_PENDING ──ocr.ok──▶ LIVENESS_REQUIRED
     ▲                         │ocr.fail×3                 │liveness.ok
     │                         ▼                           ▼
  reintento ◀── OCR_FAILED   LIVENESS_FAILED ──▶ AML_CHECK ──┬─▶ APPROVED_L2 (o APPROVED_L1 menor)
                  (≤3 reintentos, idempotente)                ├─▶ MANUAL_REVIEW ──▶ APPROVED_* | REJECTED
                                                              └─▶ REJECTED
EXPIRED (documento vencido → notificación 30/7/1 días)
```

Invariantes: toda transición pasa por `KycFsmService.transition()` (valida contra la tabla de transiciones, escribe `kyc_audit_logs` con hash-chain, y publica al bus SSE). Ningún worker escribe `status` directamente.

### 2.2 Cola de workers (BullMQ + Redis)

| Cola | Worker | Idempotencia | Reintentos |
|---|---|---|---|
| `kyc-ocr` | `ocr.worker.ts` | `jobId = ocr:{submissionId}:{docType}:{side}:{sha256[:12]}` | 3 · backoff exp. |
| `kyc-liveness` | `liveness.worker.ts` | `jobId = live:{challengeId}` | 2 |
| `kyc-aml` | `aml.worker.ts` | `jobId = aml:{submissionId}:{payloadHash}` | 3 |
| `kyc-expiry` | barrido diario (cron) | por `submissionId+día` | — |

Dead-letter: `kyc-dlq` con alerta a soporte. Concurrencia: OCR 5 · liveness 3 · AML 10 (caja de 1,6 GB RAM).

### 2.3 Webhooks idempotentes de proveedores

`POST /v1/mobility/kyc/webhooks/:provider` — verifica firma HMAC del proveedor, persiste `webhook_events(provider, external_id UNIQUE, payload_hash)` antes de procesar (segunda entrega = `200 {deduped:true}`), y traduce al evento FSM correspondiente. Timeout del proveedor → responde 200 tras persistir (procesamiento async).

### 2.4 SSE para el StepHeader en tiempo real

`GET /v1/mobility/kyc/submissions/:id/events` (EventSource):
- Eventos: `status` (con `from/to/label` para el StepHeader), `document.ocr`, `biometry.score`, `aml.score`, `review.note`.
- Single-instance PM2: `EventEmitter` en proceso. Multi-instancia (futuro): Redis Pub/Sub con el mismo contrato.
- App RN: `useKycStatusStream(submissionId)` → mapea evento → `StepHeader` (paso actual azul, pasados verde, pendientes gris).

---

## Pilar 3 · El Rostro Nativo (Frontend, ui-kit, Anti-Spoofing)

### 3.1 Componentes (nuevos en `@egrouteplan/ui-kit`)

| Componente | Spec |
|---|---|
| `DocumentChoiceTree` | Renderiza `docOptions[]` **devueltas por el servidor** (árbol anti-tampering); tarjetas icono+1 línea; las inválidas no se atenúan: no existen |
| `CameraCapture` | Marco guía azul con esquinas animadas, detección de borde en vivo, overlay discreto de 1 línea, flash auto < 40 lux; variantes `document` / `selfie` |
| `LivenessChallengeView` | Óvalo guía + instrucción animada del desafío (parpadea/gira/lee 4 dígitos) + progreso de captura ≤ 3 s |
| `KycStatusBanner` | Sad paths: naranja ámbar para revisión manual (SLA 24-48 h, "te avisaremos"), rojo solo para rechazo; NUNCA bloqueos de pantalla completa |
| `StepHeader` (extensión) | Colores por estado: actual=azul, pasado=verde, pendiente=gris (ya cumple; se añade modo `review` ámbar) |

### 3.2 Detección de inyección de cámara (nivel nativo)

1. **Attestation de captura**: la app marca cada frame con `captureTimestamp` monótono del dispositivo + firma de sesión (HMAC con secreto efímero entregado con el challenge). Frames fuera de ventana (±500 ms) → rechazo.
2. **Señales de cámara virtual**: ausencia de metadatos de sensor (ISO/exposición) en la ráfaga, resolución/fps constantes sintéticos, sin ruido de sensor entre frames (varianza < umbral) → flag `VIRTUAL_CAMERA_SUSPECT`.
3. **Challenge-response físico**: 2 gestos aleatorios o 4 dígitos (TTL 90 s, firmados servidor) — un vídeo pregrabado no puede seguir el desafío.
4. `expo-camera` (sin módulos pesados); detección de root/jailbreak del Pilar 4 bloquea dispositivos comprometidos antes de llegar aquí.

### 3.3 Sad Paths sin bloqueo

| Sad path | UX (ui-kit) | Estado FSM |
|---|---|---|
| OCR ilegible | banner naranja + consejo 1 línea ("más luz, sin reflejos") + reintento en el punto | `OCR_FAILED` → `OCR_PENDING` |
| Liveness falla | guía animada del error concreto ("acerca el rostro") | `LIVENESS_FAILED` ×3 → `MANUAL_REVIEW` |
| Score medio / PEP | `KycStatusBanner` ámbar: "revisión en curso, te avisamos" + acceso a la app sin monedero | `MANUAL_REVIEW` (SLA 24–48 h) |
| Rechazo | pantalla roja con motivo humano + canal soporte (tel:/WhatsApp) | `REJECTED` |

---

## Pilar 4 · El Escudo Contextual (Riesgo y AML)

### 4.1 Ingesta device fingerprint (en registro, login y cada paso KYC)

`POST /v1/mobility/risk/device-signal` — body: `{deviceId, platform, osVersion, model, gpsLat?, gpsLng?, isRooted, isEmulator}`. Servidor añade IP/ASN. Todo con hash (`device_id_hash`).

### 4.2 Cruce PEP/Sanciones (asíncrono, `kyc-aml` worker)

- Fuente Fase 1: lista abierta consolidada (UNSC/OFAC SDN snapshot) en tabla local + motor fuzzy (Levenshtein + fonética ES) sobre `declared_full_name`.
- Proveedor real (Fase 2): puerto `WatchlistProvider` (ComplyAdvantage/Dow Jones) — mismo contrato.
- Todo hit → `aml_watchlist_hits` + `MANUAL_REVIEW` forzoso (nunca auto-rechazo por fuzzy match).

### 4.3 Matriz de riesgo → límites del Monedero (contrato Fase C)

| Señal | Puntos |
|---|---|
| Emulador detectado | +40 (y bloqueo de registro) |
| Root/jailbreak | +30 |
| ≥ 3 cuentas por `device_id_hash` | +25 |
| País IP ≠ país GPS ≠ país SIM | +15 |
| PEP/sanciones (hit) | revisión manual obligatoria |
| Face match 0.70–0.90 | +20 |

| `risk_score` | Nivel asignable | Límite diario wallet | Retirada agente |
|---|---|---|---|
| 0–29 | L2 estándar | 100.000 XAF | ✅ con justificación |
| 30–59 | L2 restringido | 50.000 XAF | solo tras revisión |
| 60–79 | L1 | 20.000 XAF | ❌ |
| ≥ 80 | rechazo/congelación | 0 | ❌ |

El monedero (Fase C) consulta `kyc_submissions.status` + `risk_score` (cache ≤ 60 s) antes de cada operación.

---

## Pilar 5 · La Ley Inmutable (Gobernanza y Auditoría)

### 5.1 `kyc_audit_logs` — ledger append-only con hash-chain

```
entry_hash = sha256(prev_hash + canonical(event|from|to|actor|created_at))
```
Trigger `BEFORE UPDATE OR DELETE → EXCEPTION` (mismo patrón que `ledger_entries` del monedero). Cadena verificable offline: `SELECT … ORDER BY created_at` recomputando hashes. `payload` = solo metadatos (sin PII jamás).

### 5.2 Derecho al Olvido sin romper la integridad financiera

`POST /v1/mobility/admin/kyc/:submissionId/anonymize` (ADMIN, doble control):
1. `anonymize_kyc_submission(id)`: pone `pii_enc=NULL, pii_dek_enc=NULL, doc_number_hash=sha256('anon:'+id)`, `declared_full_name='ANONIMIZADO'`, `anonymized_at=now()`.
2. Borrado de objetos binarios en storage (tarea inmediata `kyc-dlq` si falla).
3. `kyc_audit_logs` recibe evento `ANONYMIZE` (la cadena se conserva: el ledger nunca se borra, se **anonimiza**).
4. La integridad financiera (`service_orders`, `transactions` wallet) referencia `user_id`/hashes, nunca PII → permanece íntegra.
5. Retención: PII de submissions rechazadas se anonimiza a los 90 días automáticamente (cron `kyc-expiry`).

---

## Artefactos generados

| Artefacto | Ubicación |
|---|---|
| DDL completo | `escrow-wallet/sql/006_kyc_engine.sql` |
| Modelos Prisma | `escrow-wallet/prisma/mobility/schema.prisma` (extensión) |
| Contratos TS compartidos | `egrouteplan-app/packages/contracts` (`@egrouteplan/contracts`) |
| FSM tipada | `escrow-wallet/src/mobility/kyc/kyc.fsm.ts` |
| Puertos de proveedores | `escrow-wallet/src/mobility/kyc/providers/ports.ts` |
| Envelope crypto | `escrow-wallet/src/mobility/kyc/crypto/envelope.ts` |
| Workers BullMQ | `escrow-wallet/src/mobility/kyc/workers/*.worker.ts` |
| Webhooks + SSE | `escrow-wallet/src/mobility/kyc/webhooks.controller.ts` · `kyc-events.controller.ts` |
