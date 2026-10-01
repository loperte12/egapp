# Migración Alibaba Cloud → Vercel (acta, 01-oct-2026)

**Situación:** la suscripción de Alibaba Cloud deja de ser fiable por precio. Plazo: **7 días**.
**Decisión de Bernardo:** Vercel conectado a GitHub; OSRM a Oracle Cloud Always Free.

## 0. La aclaración que ordena todo el plan

**El APK no se despliega en Vercel.** El APK se compila igual que siempre y vive en el móvil; el
JS va dentro. Lo que hay que re-alojar es:

| Pieza | Hoy (Alibaba) | Destino |
| --- | --- | --- |
| API NestJS (`/wallet/api/v1/*`) | proceso Node con nginx | **Vercel** (función serverless) |
| PostgreSQL (`egrouteplan`: mobility, wallet, lifebook) | contenedor en el servidor | **Neon** (Postgres gestionado, free tier) |
| Archivos (fotos/vídeos, MinIO autohospedado) | MinIO en 127.0.0.1:9000 | **Cloudflare R2** (S3-compatible, mismo SDK) |
| Redis (solo caché de feed) | ioredis | **Apagado al principio** (ver §4.3) |
| Cron de reservas (`@Cron */15`) | en el proceso | **Vercel Cron** |
| Mapa WebView (`assets/map-v2.html`), estilos | nginx estático | **Vercel** (estáticos) |
| Tiles `/maps/tiles` | nginx estático | Vercel estáticos si caben (≤250 MB); si no, R2 |
| **OSRM** (`/routing/route/v1`) | binario C++ + datos OSM | **NO corre en Vercel** → VM Oracle Always Free |
| Descarga del APK (si se quiere por link) | — | GitHub Releases o estático en Vercel |

**Por qué el APK ya compilado no se recompila:** la app llama a `https://hk.egrouteplan.com`
fijo (`api/config.ts:11`). Si el dominio se re-apunta a Vercel, la misma cadena sigue sirviendo
todo — API, mapa, tiles. La única regla es que Vercel reproduzca los caminos EXACTOS.

## 1. Veredicto de la auditoría (medido en `backend/server-src`)

- ✅ **Sin WebSockets** en todo el backend: el chat es polling HTTP — serverless viable.
- ✅ **Un solo `@Cron` real** (`reservations.service.ts:893`, `*/15 * * * *`, cobros y expiración
  de retenciones). Migrable a Vercel Cron con una ruta interna protegida.
- ⚠️ **Redis** (`lifebook.service.ts:295`): SOLO caché de feed por ciudad (`lb:feed:city:*`,
  invalidada en `:4115`), y con degradación elegante (`redisOk=false` → sigue sin caché).
  → Se migra APAGADO; Upstash después si el feed lo pide.
- ⚠️ **MinIO** (`media.service.ts`, `MINIO_ENDPOINT` interno + `MINIO_PUBLIC_ENDPOINT` público):
  el código ya usa `@aws-sdk/client-s3` → **R2 es drop-in** (cambiar endpoint y claves).
  **Excepción real:** `ffprobe`/`ffmpeg` (verificación de duración/códec de vídeo y miniatura)
  **no existen en las lambdas de Vercel** → degradar a verificación HEAD (bytes y MIME) con
  `SKIP_PROBE=1` (parche de 4 líneas, §4.4) hasta decidir dónde corre el probe.
- ❌ **OSRM** (`api/config.ts:24`): motor de rutas del taxi — binario + datos OSM. En Oracle
  Always Free (ARM, 4 OCPU, 24 GB RAM, gratis) cabe sobrado: el extract de Guinea Ecuatorial es
  pequeño. El `vercel.json` reescribe `/routing/*` a esa VM.
- ❗ **El repo está en Gitee** (`gitee.com/Bernardo12/egapp.git`): Vercel solo mira GitHub.
  Espejo privado a GitHub (§3, día 1).
- ❗ **El repo local es un ESPEJO PARCIAL** del proyecto del servidor (falta `main.ts`,
  `app.module.ts`, `package.json`, `prisma/schema.prisma`): el scaffolding de
  `backend/deploy-vercel/` se copia AL PROYECTO DEL SERVIDOR y se ajusta contra su `main.ts`
  (las dos líneas marcadas «AJUSTAR» en `api-index.ts`).

## 2. Coste previsto

| Servicio | Free tier | Suficiente porque |
| --- | --- | --- |
| Vercel Hobby | 0 USD | datos de prueba; **PRO 20 USD/mes si el timeout de 10 s corta cobros** (vercel.json pide 60 s) |
| Neon free | 0,5 GB | la base de pruebas cabe de sobra |
| R2 free | 10 GB + salida gratis | fotos de hoteles/productos; el vídeo largo de 2 GB es ejemplo |
| Oracle Always Free | 0 USD | 4 OCPU ARM + 24 GB RAM — OSRM + quizá los tiles si pesan |
| **Total** | **0–20 USD/mes** | frente al coste actual de Alibaba |

## 3. Plan de los 7 días

**Día 1 — espejo y cuentas.**
- Espejo privado a GitHub (desde la máquina de Bernardo):
  `git clone --mirror git@gitee.com:Bernardo12/egapp.git && cd egapp.git && git push --mirror https://github.com/<tu>/egapp.git`
  (luego Vercel → New Project → repo egapp → **Root Directory: el proyecto Nest del servidor**).
- Crear: cuenta Neon (project + cadena POOLER), Cloudflare R2 (buckets `lb-media`, `lb-docs`
  + API token), Oracle Cloud (VM ARM Ubuntu).

**Día 2 — base de datos.**
- En el servidor: `pg_dump -Fc egrouteplan > egrouteplan.dump` (incluye `mobility`, `wallet`,
  `lifebook`; OJO roles/extensiones: `gen_random_uuid()` es core, sin problema).
- En Neon: `pg_restore --no-owner --role=<rol> -d <cadena-pooler> egrouteplan.dump`.
- Verificar: `SELECT count(*) FROM lifebook.reservations;` y que los schemas existen.

**Día 3 — la API a Vercel.**
- Copiar `deploy-vercel/api-index.ts` → `api/index.ts` del proyecto Nest (ajustar «AJUSTAR»),
  `deploy-vercel/vercel.json` → raíz del proyecto (ajustar `OSRM_ORACLE_HOST`).
- Variables de entorno en Vercel (inventario REAL medido por grep, §5; faltan las del core
  que solo están en el servidor: `DATABASE_URL`, `JWT_*`…).
- Deploy de prueba y `curl https://hk…vercel.app/wallet/api/v1/lifebook/commerce/hotel/hotels?city=Malabo`.

**Día 4 — archivos (R2) y el parche de media.**
- `MINIO_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com`, claves R2, buckets nuevos.
- Las URLs YA GUARDADAS en la base apuntan a `hk.egrouteplan.com/<camino-nginx>`: decidir
  (a) reescribir el camino de nginx en `vercel.json` hacia R2, o (b) `UPDATE` global de prefijos
  en la base. Verificar en el servidor el camino real de nginx antes de elegir.
- Aplicar `SKIP_PROBE=1` (§4.4).

**Día 5 — OSRM en Oracle + dominio.**
- VM ARM Ubuntu: `docker run -t -v ~/osrm-data:/data -p 5000:5000 osrm/osrm-backend osrm-routed
  --algorithm mld /data/ecuatorial-guinea-latest.osrm` (extract de Geofabrik + `osrm-extract`
  + `osrm-partition` + `osrm-customize`). Abrir solo el 5000.
- Vercel: añadir dominio `hk.egrouteplan.com` (CNAME) y bajar el TTL del DNS **hoy mismo**
  (día 1) para que el corte sea rápido.

**Día 6 — pruebas con el APK REAL** (el que ya está instalado, sin recompilar):
- Hoteles: buscar → ficha → reservar → mis reservas. Chat: abrir hilo con un hotel.
- Mapa: listado → «Ver en mapa» (el WebView carga `assets/map-v2.html` del dominio nuevo).
- Taxi: pedir ruta (OSRM por el rewrite). Wallet: login + saldo.
- Comprobar que las fotos antiguas cargan (R2/rewrite).

**Día 7 — corte.**
- Vercel al día con la DB final (re-dump si hubo movimiento), dominio apuntado, VM Oracle
  encendida, y SOLO ENTONCES parar/apagar Alibaba. Guardar el dump como respaldo.

## 4. Adaptaciones mínimas (código, todas pequeñas)

### 4.1 Wrapper serverless — `backend/deploy-vercel/api-index.ts` (escrito, copiar y ajustar)
Sin `app.listen()`: Nest se construye UNA vez por instancia y `@vendia/serverless-express`
adapta Express. Añadir `@vendia/serverless-express` a las dependencias del proyecto servidor.

### 4.2 Vercel Cron sustituye al `@Cron` del proceso — `vercel.json` (escrito)
Vercel Cron llama con **GET**; el endpoint actual es POST admin. Añadir en el proyecto servidor
una ruta interna `GET /wallet/api/v1/internal/expire-stale` que acepte
`Authorization: Bearer ${CRON_SECRET}` y llame al mismo método del servicio. (Ver `vercel.json`,
sección `crons`.)

### 4.3 Redis: apagado
`REDIS_HOST` vacío → el servicio ya degrada solo (`redisOk=false`). Cero código. El feed va
directo a Postgres (Neon, milisegundos); Upstash después si hiciera falta.

### 4.4 ffprobe/ffmpeg fuera de la lambda — parche propuesto (4 líneas)
En `media.service.ts`, la verificación real (`/complete`: HEAD + ffprobe) queda así con
`SKIP_PROBE=1`: si la variable viene puesta, se salta `ffprobe` y se acepta el HEAD (bytes y
MIME). Provisional y HONESTO: la duración la dice el cliente hasta que el probe corra en la VM
Oracle (ahí sí hay binarios). El parche se escribe cuando se sincronice el espejo (pedirme).

## 5. Variables de entorno para Vercel (inventario medido por grep en server-src)

`AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_DAILY_MESSAGES, AI_VISION_BASE_URL, AI_VISION_KEY,
AI_VISION_MODEL` · `MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_ENDPOINT, MINIO_PUBLIC_ENDPOINT,
MINIO_PUBLIC_BASE, MINIO_REGION, MINIO_BUCKET_MEDIA, MINIO_BUCKET_DOCS` ·
`MEDIA_MAX_*` (opcional, tienen defaults) · `HOTEL_TRANSFER_HOLD_HOURS, LB_INACTIVE_SWEEP_MS` ·
`REDIS_*` (NO llevar: apagado) · **+ las del core que solo viven en el servidor:
`DATABASE_URL` (cadena POOLER de Neon con `?sslmode=require`), JWT/secretos, `CRON_SECRET` (nueva)`.**

## 6. Riesgos dichos antes de que muerdan

1. **Timeout 10 s (Hobby)** en cobros/reservas con transacción larga → si muerde, PRO (20 USD).
2. **Cold start** de la lambda (1-2 s la primera petición tras estar fría) — el APK lo nota solo
   al abrir la app tras horas; aceptable para una app de prueba.
3. **ffprobe degradado** — duración de vídeo confiada al cliente (provisional).
4. **Camino público de MinIO** — hay que mapearlo a R2 el día 4 o las fotos viejas dan 404.
5. **El cron de Vercel dispara GET sin cookies** — la ruta interna debe protegerse con
   `CRON_SECRET`, no con el guard de JWT.
6. **Gitee→GitHub** — el espejo es ciego a partir de ahí: decidir cuál queda como origen
   (recomendación: GitHub como origen mientras dure la migración; gitee recibe push espejo).
