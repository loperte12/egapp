# Stremio (código abierto): qué podemos aprovechar y qué no

Fecha: 2026-09-14. Estado: **investigación**, no implementado.
Pregunta: `github.com/Stremio` — cómo lo podemos aprovechar.

---

## 1. Qué es Stremio (y qué no)

Un **centro multimedia de código abierto**: organiza y reproduce películas, series y
canales, con un **sistema de addons** para las fuentes de contenido. Tiene clientes
web, de escritorio y de TV; el núcleo (`stremio-core`) está en Rust y se compila a
WASM para reutilizar la misma lógica en todos los clientes.

**No es un servicio de contenido**: no aloja nada, agrega fuentes externas. Y ahí
está el aviso: buena parte de su ecosistema real son addons de torrents/P2P. Eso
**no se toca** (§4).

## 2. Lo primero que hay que mirar: las licencias

De esto depende qué se puede *copiar* y qué solo *leer*. Datos sacados del API de
GitHub (nombre, lenguaje, estrellas, licencia) sobre los **112 repositorios** de la
organización:

| Repositorio | Licencia | ¿Se puede usar su código? |
|---|---|---|
| `stremio-core` (Rust, 2,4k ⭐) | **MIT** | **Sí**, citando |
| `stremio-addon-sdk` (1,4k ⭐) | **MIT** | **Sí** |
| `stremio-addon-client`, `stremio-aggregators`, `stremio-addon-linter` | MIT | Sí |
| `stremio-beamup`, `stremio-official-addons`, `stremio-api-client` | MIT | Sí |
| **`stremio-web`** (13,9k ⭐) | **GPL-2.0** | **No**: copiar código obligaría a abrir **todo** nuestro cliente |
| `stremio-shell`, `stremio-linux-shell` (escritorio) | GPL-3.0 | No, por lo mismo |
| `stremio-service`, `server-docker` | GPL-2.0 | No |
| **`stremio-video`** (abstracción de reproductores) | **sin licencia** | **No**: sin licencia = todos los derechos reservados |
| `vlc-android`, `libmpv-android`, `ffmpeg-kit`, `node-matroska` | GPL-2.0 / LGPL-3.0 | No en una app cerrada sin cumplir obligaciones |
| `react-native-youtube2`, `react-native-orientation-view` | sin licencia | No |
| `media` (fork de AndroidX **Media3/ExoPlayer**) | Apache-2.0 | Se puede, **pero no hace falta**: `expo-video` ya usa Media3 por debajo |

**Conclusión de licencias:** lo aprovechable de verdad (`stremio-core`, el SDK de
addons) es **MIT**, así que se puede usar y adaptar. Lo más vistoso (`stremio-web`,
el reproductor) es GPL o no tiene licencia: **solo lectura como referencia**.

## 3. Lo que SÍ nos sirve, en concreto

### (a) Un hueco nuestro que ellos tienen resuelto: «seguir viendo»

Verificado en nuestro código, no supuesto: **no tenemos progreso de reproducción ni
«continuar viendo»**. Busqué `progress`, `position`, `resume`, `watched` en `api/` y
en el feed de vídeos: lo único que aparece es el progreso de **subida** y la
geolocalización. Con 62 vídeos, 12 series y 36 episodios, eso significa que **si
sales de un vídeo, empiezas de cero**.

Stremio lo resuelve con tres piezas (todas MIT o solo-lectura):

- `Library`: el estado del usuario (qué sigue, qué está viendo).
- `stremio-watched-bitfield`: guarda lo visto de una serie como un **bitfield** (un
  bit por episodio) en vez de una fila por episodio.
- `stremio-history-sync`: sincronizar la posición de reproducción entre dispositivos.

**Nuestra versión mínima, sin copiar código:** una tabla
`lifebook.watch_progress (user_id, post_id, position_sec, duration_sec, updated_at)`,
dos endpoints (`GET`/`PUT /lifebook/watch/:postId`) y una fila **«Seguir viendo»** al
principio del feed de vídeos. Para las series, un contador de episodios vistos por
serie: con 36 episodios no hace falta la optimización del bitfield, y decirlo es más
honesto que copiar una solución para un problema que no tenemos.

### (b) El contrato de contenido: el protocolo de addons (MIT)

Un `manifest.json` declara qué ofrece (`resources`: `catalog`, `meta`, `stream`,
`subtitles`, `addon_catalog`) y para qué tipos (`movie`, `series`, `channel`, `tv`);
después cada recurso se pide por HTTP y responde `{ metas }` o `{ streams }`.

**Hoy no necesitamos addons.** Pero es el contrato **probado** para el día que
queramos que un tercero (una televisión, un creador, un socio) publique catálogo
dentro de nuestra app sin darle acceso a nuestra base de datos. Y el diseño se puede
copiar legalmente (MIT).

### (c) Cómo está montado un núcleo que sirve a varios clientes

`stremio-core` es un **crate de Rust** con: `types`, `addon_transport`,
`state_types` (arquitectura inspirada en Elm: `Effects` y `Update`), `runtime`,
`environment` (fetch y almacenamiento como traits) y `models` (`Context`, `Library`,
`CatalogFiltered`). La lección para nosotros no es «migremos a Rust» (sería un
cambio enorme para una app Expo): es que su modelo de contenido tiene **un solo tipo
de elemento** (`MetaItem`) para película, serie y canal, y **un estado de usuario**
(`Library`) separado del catálogo. Nuestro backend tiene `posts` con `type` y
`series_episodes`, pero ningún estado de reproducción: es justo la pieza que falta.

### (d) Reproductor: no hay nada que ganar y sí mucho que perder

Su pila real es **AndroidX Media3/ExoPlayer** (Apache-2.0) —exactamente lo que ya usa
`expo-video` por debajo— más mpv/VLC (GPL/LGPL). Su `get-tracks-data` (TypeScript)
enseña a leer pistas de audio y subtítulos de MKV/MP4.

Conclusión: **seguir en Media3/ExoPlayer** y, si algún día hacen falta pistas de
subtítulos o MKV, construir nosotros la selección de pistas. Cambiar a mpv/VLC
obligaría a cumplir con GPL/LGPL en una app cerrada, a cambio de nada que hoy
echemos de menos.

## 4. Lo que NO hay que tocar

- **Motores P2P/torrent** (`enginefs`, `stremio-local-addon`, `rar-http`,
  `rar-stream`): riesgo legal y cero valor para una plataforma que aloja su propio
  contenido en su OSS.
- **`stremio-web` y los shells de escritorio** (GPL): leerlos como referencia de UI
  está bien; pegar código, no.
- **`stremio-video`** (sin licencia): no se puede copiar ni «inspirarse» pegando
  fragmentos.

## 5. Qué propongo

1. **«Seguir viendo» y progreso de reproducción** — una ronda: tabla, dos endpoints,
   fila en el feed de vídeos. Es lo único que hoy nos falta y que Stremio resolvió
   bien; y mejora directamente el feed inmersivo que ya construimos.
   **→ HECHO Y VERIFICADO (2026-09-14).** Tabla `lifebook.watch_progress` (DDL en
   `sql/lifebook/20260214_seguir_viendo.sql` + copia local `backend/sql/006_…`), y las
   rutas `POST/GET/DELETE /lifebook/watch/:postId` + `GET /lifebook/me/continue-watching`.
   Suite `pruebas/lb51t-verificar-seguir-viendo.cjs`: **26 pasan, 0 fallan**. Y en el
   Poco F5 se ve la fila **«Seguir viendo»** encima del primer vídeo con su barrita
   («rtttt, por el 15 %», exactamente el 90/600 guardado); el progreso que guardó la
   propia app quedó en la base (`Flow 1/18 s`), que es la prueba de que el camino de
   guardado funciona de punta a punta.
   Reglas decididas: «empezado» = más de 5 s; «terminado» = 90 % o más (y sale de la
   lista, pero **la fila no se borra**: marca que se vio); la fila solo se enseña en el
   primer vídeo, porque el feed es inmersivo y una fila fija estorba al deslizar.
2. **Episodios vistos por serie** (contador por serie, no bitfield) para las 12
   series.
3. **Una decisión de producto**: ¿queremos contenido de terceros en la app? Si algún
   día sí, el contrato a imitar es el de addons (MIT). Si no, se descarta y no se
   toca nada.

No propongo usar su código directamente en ninguna de las tres: la primera y la
segunda son nuestras y pequeñas, y la tercera es una decisión, no una integración.

## 6. Cómo lo he verificado (y qué no)

- **112 repositorios** de la organización listados por el API de GitHub (dos
  páginas): nombre, lenguaje, estrellas y **licencia de cada uno**.
- Licencia de `stremio-core` (**MIT**) y de `stremio-video` (**ninguna**) comprobadas
  contra el API, no contra un blog.
- README de `stremio-core` y de `stremio-addon-sdk` leídos en crudo (de ahí salen los
  módulos, los objetivos y los recursos del protocolo).
- Del lado nuestro: búsqueda de progreso/reanudar en `api/`, `app/lifebook-videos.tsx`
  y `app/lifebook-player.tsx` → **no existe**.

**No verificado / no comprobado:** el cliente Android de Stremio no aparece como
repositorio abierto en la organización (solo hay `stremio-core-kotlin`, que son
bindings), así que **no he podido ver su reproductor de Android**; y no he ejecutado
nada de Stremio, todo lo anterior es lectura de código, documentación y metadatos.
