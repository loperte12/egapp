# RELEVO — entrega a otro agente

**Fecha:** 18/09/2026. **De:** sesión de auditoría de servicios de EG Route Plan.
**Para:** el agente que continúa.

Este documento existe para que no tengas que reconstruir nada. Todo lo que dice está **medido**, no
supuesto; y donde no lo está, lo digo expresamente en §9.

---

## 0. Lo primero: un problema que te vas a encontrar

**El SSH al servidor está fallando ahora mismo** (`ssh: Connection timed out`, exit 255), **pero el
servicio está sano**. Comprobado hace un momento desde esta máquina:

| Comprobación | Resultado |
|---|---|
| Puerto 22 de `hk.egrouteplan.com` | abierto (TCP conecta) |
| Puerto 443 y 80 | abiertos |
| `https://hk.egrouteplan.com/admin-docs/` | **HTTP 200** |
| `https://hk.egrouteplan.com/admin/` | **HTTP 200** |
| `https://hk.egrouteplan.com/api/ecomerse/admin/docs` | **HTTP 401** (correcto: exige token) |
| `https://hk.egrouteplan.com/api/v1/mobility/health` | **HTTP 200** |

Es decir: **la app y el panel funcionan**; lo que no funciona es entrar por SSH a administrar. Ya
pasó una vez a mitad de sesión y se recuperó solo; luego volvió a caer. Sospechas por orden:

1. **fail2ban o similar** bloqueando la IP por los muchos intentos de conexión de esta sesión.
2. `sshd` con `MaxStartups` lleno, o el servidor bajo carga.
3. Problema de red puntual entre esta máquina y el servidor.

**Qué hacer:** probar SSH desde otra red/IP; si sigue, entrar por la consola web del proveedor
(Alibaba) y mirar `journalctl -u ssh`, `fail2ban-client status sshd`, `systemctl status sshd`.

**Nada de lo que sigue depende de que SSH esté caído**: el código y los guiones están en local.

---

## 1. Qué es este proyecto (en una frase)

Super-app **EG Route Plan** (Guinea Ecuatorial): app React Native/Expo en `D:\egapp`, backend NestJS +
Postgres en un servidor de Hong Kong. El trabajo de esta sesión fue **auditar los servicios** y luego
**arreglar el servicio de comercio (Mercado)** comparándolo con la plataforma china 得物/Dewu.

---

## 2. Dónde está cada cosa (mapa)

| Qué | Dónde |
|---|---|
| App móvil | `D:\egapp` (React Native, Expo SDK 53, expo-router) |
| Kit de UI | `D:\egapp\packages\ui-kit` |
| Backend (copia de trabajo local) | `D:\egapp\.auditoria-servicios\backend` |
| Backend (el de verdad) | `/opt/mirror/app` en el servidor |
| Informe de auditoría | `D:\egapp\auditoria-servicios.md` (97 hallazgos) |
| Comparación con Dewu | `D:\egapp\.auditoria-servicios\design-compare-mercado-vs-dewu.md` |
| Guiones de despliegue y prueba | `D:\egapp\pruebas\` |
| Copia del panel compilado | `D:\egapp\.auditoria-servicios\web-admin\` |

**Servidor (importante, hay dos y se confunden):**

| Nombre | IP | Qué es |
|---|---|---|
| `hk.egrouteplan.com` | `8.218.88.237` | **El sistema vivo.** Es a donde apunta la app |
| `egrouteplan.com` | `106.14.104.146` | Shanghái, otro servidor. **Bloqueado por ICP de Alibaba** |

Solo se toca el de Hong Kong.

---

## 3. Cómo se entra al servidor (cuando SSH funcione)

Hay un ayudante que ya resuelve las trampas de PowerShell y SSH:

```
pwsh -File D:\egapp\pruebas\as-servidor.ps1 -Remoto <ruta-de-un-.sh>
```

Ejecuta ese `.sh` (que vive en tu disco) en el servidor. **Usa esto y no `Get-Content | ssh`:** esa
forma mete un BOM al principio y bash ve `for … do` roto. Costó media sesión averiguarlo.

La clave SSH está en `%USERPROFILE%\.ssh\askpass-servidor.cmd` (fuera del repo), con el formato
`@echo <clave>`.

Los despliegues usan `pruebas\as-despliega-*.ps1`, que siguen el mismo patrón: comprobar que lo que
hay en el servidor es tuyo → empaquetar → enviar → **compilar como puerta** → reiniciar → comprobar
salud → y **volver atrás solo** si algo falla.

---

## 4. Lo que quedó HECHO y verificado

### 4.1 Auditoría de servicios
`D:\egapp\auditoria-servicios.md` — 97 hallazgos (10 transversales + 87 por servicio, 16 críticos).
Las citas se verifican con `pruebas\as-verifica-citas.cjs` (73 citas, todas comprobadas).

### 4.2 Mejora del Mercado (tandas 1-4 del plan de diseño)
- **Backend:** migración `backend/sql/019_ecomerse_publicacion.sql` **aplicada en producción**
  (añade `handling_hours`, `returns_accepted` y la tabla `wallet.ecomerse_product_docs`).
- **API:** cola de moderación `GET /api/ecomerse/admin/docs` (con filtro `?status=`),
  `GET /api/ecomerse/admin/docs/stats` y `PUT /api/ecomerse/admin/docs/:id`.
  **Desplegado y probado**: 32 pruebas de API en verde.
- **App:** bloque de dinero «Dónde está tu dinero», ficha de especificaciones, documentación del
  anuncio, tarjeta con vendedor y contador de interés, selector de orden, pestañas de estado en
  pedidos con contadores, pantalla de publicación con 6 secciones.

### 4.3 La consola de documentación — **lo más reciente**
Se descartó meterla dentro del panel (su código fuente **no existe** en ningún sitio: es un bundle
compilado de 1,38 MB) y se hizo **página propia**:

| | |
|---|---|
| **Dirección** | `https://hk.egrouteplan.com/admin-docs/` |
| **Entrada** | teléfono + contraseña (la misma puerta que el panel) |
| Fichero | `/opt/mirror/docs-admin/index.html` (un solo archivo, sin dependencias) |
| Dirección vieja | `/admin/ecomerse-docs` → redirige a la nueva |

**Verificado en Chrome real con sesión de administrador: 36 pruebas, 0 fallos.** Incluye aprobar,
rechazar con motivo obligatorio, que un rechazo sin motivo **no llama al servidor**, y que sin sesión
no se enseña la cola.

Ficheros: `consola-docs\index.html`, `backend\src\http\ecomerse-docs-admin.controller.ts`
(añadido a `app.module.ts`), y las suites `pruebas\verifica-consola-chrome.cjs` y
`pruebas\verifica-consola-decisiones.cjs`.

**El panel de administración quedó intacto**: no se tocó su bundle, y se le retiró el `<script>` que
se le había añadido. Sus rutas (`/admin/`, `/admin/dashboard`, `/admin/ecomerse-admin`, `/admin/lb-mod`)
responden 200.

---

## 5. LO QUE QUEDA — el trabajo pendiente

### 5.1 La reconciliación del dinero varado (esto es lo que te toca)

Documento completo: **`D:\egapp\.auditoria-servicios\TANDA-1-PLAN-RECONCILIACION.md`** (léelo; tiene la
causa raíz ya localizada, los 5 pasos y las consultas de verificación).

**El problema:** 60 cerrojos de escrow sin salida por **227.000 XAF**. Origen: 5 de `escrow_orders`,
39 de viajes de taxi (31 de ellos en estado `completed`), 13 de pedidos de Life Book, 2 de comida y 1
sin fila que lo explique. **No hay dinero de usuarios reales**: todo es de cuentas de prueba, de la
cuenta semilla o de monederos sin dueño.

**La causa raíz (ya localizada, no la busques otra vez):** en
`src/services/ride-settlement.service.ts`, `sweepAll()` (líneas ~862-866) solo mira viajes en
`accepted`/`in_progress`/`arrived`, así que **nunca le pasa un `completed` a `repairOne()`**. El camino
que sí lo arreglaría existe (líneas ~958-962) y es **inalcanzable**. Encima termina en
`.catch(() => undefined)` (línea ~961), que si falla **no deja rastro**.

**Segundo problema, independiente:** ningún barrido se dispara solo. En el servidor no hay nada
programado de la aplicación (solo `sync-traffic.js`, `lb-backup.sh` y timers del sistema).

### 5.2 Las tres decisiones que el dueño ya tomó (no las vuelvas a preguntar)

1. **Orden: primero el código, después reconciliar.** Con el `catch` mudo puesto, una reconciliación
   que falle a mitad no dejaría rastro.
2. **Los 3 monederos huérfanos (50.000 + 20.000 + 10.000 XAF, sin fila en `mobility.users`): dejarlos
   intactos y anotarlos como incidencia de datos.** No se les toca el dinero.
3. Se descartó meter la consola dentro del panel (ver §4.3).

### 5.3 Los pasos, en orden

| # | Paso | Estado |
|---|---|---|
| 1 | Restaurar el respaldo en una base de usar y tirar (`temp_ensayo`) | **Pendiente. Ni empezado** |
| 2 | Script de reconciliación **con modo ensayo por defecto** (sin `--aplicar` no escribe) | Pendiente |
| 3 | Arreglo de código: `sweepAll` cubre los `completed` con cerrojo sin liquidar; el `catch` deja rastro | Pendiente |
| 4 | Desplegar con salud + vuelta atrás automática | Pendiente |
| 5 | Reconciliar producción y verificar (escrow de 223.000 a ~0, sin saldos negativos) | Pendiente |

El respaldo ya existe: `/opt/mirror/backups/egrouteplan_2026-09-18_0420.dump` (21 MB, verificado con
`pg_restore --list`). La base ocupa 56 MB, así que ensayar es barato.

**Criterios de éxito:** (a) 0 cerrojos sin salida; (b) ningún `balance_available` ni `balance_escrow`
negativo; (c) las claves de idempotencia nuevas respetan `${ref}:release` / `${ref}:refund`, para que
un reintento sea un reintento y no un segundo asiento.

### 5.4 Un detalle que la sesión anterior NO consiguió

**No se comprobó el estado del dinero hoy.** El diagnóstico es del 18/09 y los comandos de
comprobación fallaron por el SSH caído justo al final. **Lo primero que debes hacer es volver a medir**:
60 cerrojos / 227.000 XAF / escrow 223.000 son cifras de ayer, y entre medias se ha tocado el módulo de
comercio (nada que mueva dinero, pero **verifícalo, no lo supongas**).

---

## 6. Trabajo menor que queda suelto

- **Fichero huérfano en el panel:** `/opt/mirror/web-admin/assets/ecomerse-docs.js` (23 KB) ya no se
  carga (se retiró su `<script>`). Es inocuo; se puede borrar para dejar el panel como estaba.
- **En el informe de auditoría quedan hallazgos sin arreglar**, entre ellos: T-02 (el `ValidationPipe`
  no valida los cuerpos en línea), T-08, T-09, rutas de liberación de comida y comercio, LC-01, LH-01.
  Están todos en `auditoria-servicios.md`.

---

## 7. Trampas que ya costaron tiempo (léelas antes de pelearte)

1. **`Get-Content | ssh` rompe los guiones** (BOM). Usa `as-servidor.ps1`.
2. **`docker exec` sin `-i` no lee la entrada**: los `INSERT` con heredoc no llegan a Postgres y no da
   error. Fue el fallo de una prueba entera.
3. **El contenedor NO se llama `malabo-postgres`, se llama `mirror-postgres`.** Y la base se llama
   `egrouteplan`, no `malabogo` (el usuario sí es `malabogo`).
4. **PowerShell 5.1:** no admite `??` ni ternarios; `$pkg` es palabra reservada; `-LiteralPath` para
   rutas con corchetes; los here-strings se comen los `\n`.
5. **Las suites de Chrome son para Windows** (usan `process.env.TEMP`, que en Linux es `undefined`).
   No las lances en el servidor.
6. **`git clone` desde github está bloqueado** en esta red (Connection reset), pero la API REST y
   `raw.githubusercontent.com` sí funcionan.
7. **`toLocaleString('es')` no es fiable para dinero**: Node agrupa `18500` → `18.500` pero deja
   `6500` → `6500`, y Chrome los agrupa los dos. Para cifras se usa un separador propio.
8. **Bash y los acentos:** comparar textos con acentos con `case`/`grep` desde un `.sh` enviado por
   SSH da falsos negativos. Compara en bytes o evita acentos.

---

## 8. Cómo se verifica todo (no te fíes de que "parece que va")

```powershell
# App: tipos y deuda de diseño
cd D:\egapp
npx tsc --noEmit
npm run diseno                      # guarda de diseño; --base para re-fijar

# API de la consola de documentación (32 pruebas, contra producción)
pwsh -File D:\egapp\pruebas\as-servidor.ps1 -Remoto D:\egapp\.auditoria-servicios\corre-verificacion-docs.sh

# Consola en navegador real (Windows)
node D:\egapp\pruebas\verifica-consola-chrome.cjs <adminId> <jwtSecret>
node D:\egapp\pruebas\verifica-consola-decisiones.cjs <adminId> <jwtSecret>
```

El `adminId` y el `JWT_SECRET` se sacan así (el secreto se lee en el servidor y no sale de ahí):

```bash
# en el servidor
grep -o '^JWT_SECRET=.*' /opt/mirror/app/.env | sed 's/^JWT_SECRET=//'
docker exec mirror-postgres psql -U postgres -d egrouteplan -t -A -c \
  "SELECT id, phone FROM mobility.users WHERE role='ADMIN';"
```

Hay **dos administradores**: `+240999888777` (`ec6bb87f-d1a8-48ea-8eb3-cb29c013274f`) y
`+240555000999` (`b33e8df4-eb2b-4ea7-97ce-7d38bde3e348`).

**Aviso sobre las pruebas de dinero:** la suite de decisiones crea documentos de prueba y **los borra
al terminar**. Si algo se interrumpe a medias, deja la cola sucia. Comprueba el estado antes y después.

---

## 9. Lo que NO está comprobado (dilo tal cual, no lo adornes)

- **No se ha probado la entrada de la consola con la contraseña real.** Se verificó con una sesión
  firmada y se comprobó que una contraseña equivocada se rechaza (`Credenciales inválidas`), pero el
  formulario con la contraseña buena **no se ha usado nunca**. Que lo pruebe el dueño.
- **No se ha reproducido una liquidación fallida** ni se ha visto la excepción: el `catch` mudo es un
  **sospechoso, no una prueba**.
- **No se sabe por qué** esos 31 viajes quedaron `completed` sin liquidar.
- **No se ha averiguado** la diferencia de 4.000 XAF entre el escrow de los monederos (223.000) y los
  cerrojos sin salida (227.000).
- **No se ha ejecutado ninguna escritura** de reconciliación, ni en producción ni en copia: el paso 1
  del plan no se ha empezado.
- El estado del dinero **no se ha vuelto a medir hoy** (ver §5.4).

---

## 10. Estado de los datos en producción (limpieza)

En la cola de documentación queda **un solo documento**: `FAC-2026-0918` (factura de compra, 6.500 XAF)
sobre «Producto cuota 4», en estado **`pending`**. Es el documento de prueba del briefing, y se dejó
como estaba. Los documentos de prueba de las suites **ya se borraron**.

En la app hay otras cuentas de prueba del briefing (vendedores `Abacería E2E v3` y `Vendedor E2E
Monedero`, etc.). **Ese es el juego de datos con el que se prueba**; no lo borres sin pedirlo.
