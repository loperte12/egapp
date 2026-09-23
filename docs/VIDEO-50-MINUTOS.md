# Vídeo de 50 minutos en Life Book

**Parte 50 · 12-13 de septiembre de 2026**

> Lo pedido: *«ampliamos el vídeo a 50 minutos»*.
>
> Lo que había: el tope era **60 segundos / 120 MB**. La app lo decía, el backend lo
> comprobaba con `ffprobe` y el feed estaba construido alrededor de eso.
>
> Lo que hay ahora: **dos perfiles de vídeo**, corto (1 min / 120 MB) y largo (**50 min /
> 1200 MB**), con subida directa al almacenamiento, progreso real, verificación del archivo
> por el servidor y un trato distinto en el feed. Y un fallo que solo apareció al probar el
> camino completo de la app: el vídeo subía entero y **moría al publicar**.

---

## 1. Lo que se midió ANTES de construir, porque cambia la decisión

### 1.1 La subida por el camino público va a ~0,65 MB/s

Se midió dos veces, con dos ficheros distintos y con meses de diferencia en el código:

| Prueba | Fichero | Tiempo | Velocidad |
|---|---|---|---|
| Primera (215 MB sintético) | 215,3 MB | 336 s | **0,64 MB/s** |
| Confirmación (5 min de 720p realista) | 88,6 MB | 137,1 s | **0,65 MB/s** |

Dos medidas independientes que dan el mismo número no son casualidad: **hay un techo de
unos 5,2 Mbit/s en el camino público del servidor**, no en la conexión del usuario. La
cuenta que importa:

| Tamaño del vídeo | Tiempo de subida a 0,65 MB/s |
|---|---|
| 90 MB (5 min de 720p) | **2,3 min** |
| 300 MB | 7,7 min |
| **900 MB (50 min de 720p)** | **23,2 min** |
| 1200 MB (el tope técnico) | 31,0 min |

**Esto es lo único que cambia la decisión de producto y sigue abierto.** El tope de 50
minutos *funciona*, pero subir 900 MB tarda ~23 minutos con la pantalla abierta. Las
opciones están en §7.

### 1.2 Leer el archivo por dentro en vez de por internet: 0,64 → 210 MB/s

`ffprobe` y la miniatura los hace el **servidor** sobre el archivo que acaba de subir. Se
hacían con la URL pública, es decir: el servidor salía a internet y volvía a entrar en su
propio MinIO, que está en la misma máquina. Con un archivo de 215 MB eso reventaba
`/complete` (EPIPE). Ahora el servidor firma **contra `127.0.0.1`** (`signedGetInterno`),
que es disco: **210 MB/s**. `/complete` de 215 MB pasó de morir a tardar **0,215 s**.

La URL que recibe la app sigue siendo la pública: la app sí necesita alcanzarla desde fuera.

### 1.3 nginx cortaba a los 60 s

`proxy_read_timeout 60s` en `/wallet/api/`. Una subida de 215 MB por el camino viejo tardaba
336 s y nginx cortaba la conexión antes. Subido a **300 s** en `/wallet/api/` y `/api/`.
(copia: `/etc/nginx/sites-enabled/nginx-mirror.antes-timeout-*`)

---

## 2. El fallo que solo se ve probando el camino de la app

**El vídeo subía entero (900 MB), el póster se generaba… y al publicar: `400 durationSec must
not be greater than 60`.**

El servicio tenía el tope bueno desde el primer día:

```ts
const VIDEO_SEC_MAX = 3600;                    // lifebook.service.ts
video_long: { maxSec: 3000, maxBytes: 1200 MB } // media.service.ts
```

Pero el **DTO del controlador** cortaba antes de que el servicio llegara a ver la petición:

```ts
// lifebook.controller.ts · class VideoDto
@IsInt() @Min(1) @Max(60)      // ← aquí moría todo
durationSec!: number;
```

Ninguna prueba del lado del servidor podía encontrarlo: las nueve que ya pasaban
comprobaban el servicio de media (que sí aceptaba 3000 s), no la puerta del controlador.
Se encontró al escribir una prueba que hace **exactamente** lo que hace la app, en el mismo
orden: billete → subida → cierre → publicar.

Arreglado a `@Max(3000)` — **3000, no 3600**: el tope real del almacén son 3000 s
(`MEDIA_MAX_VIDEO_LONG_SEC`) y lo comprueba `ffprobe` sobre el archivo. Poner 3600 aquí
dejaría al DTO prometiendo algo que el almacén no acepta.

- `lifebook.controller.ts`: `dbb7d078f0a9e6e1a3092e56322a74c3` → **`c52cabc5ce713f4e7e47c1c2f98cb26c`**
- copia: `/opt/mirror/backups/lifebook.controller.ts.antes-video50-*`

---

## 3. Los dos perfiles, y por qué no uno solo

Subir el tope del perfil corto a 50 minutos habría estropeado el feed para todos: un feed
inmersivo solo funciona si los clips cargan al instante. Así que son **dos decisiones
distintas**:

| | Corto | Largo |
|---|---|---|
| Duración | 1 min (60 s) | **50 min (3000 s)** |
| Peso | 120 MB | **1200 MB** |
| Para qué | el feed, se ve al instante | clases, reportajes, partidos |
| En el feed | se reproduce solo, en bucle | **no se reproduce solo** (ver §5) |

En el `.env` del servidor:

```
MEDIA_MAX_VIDEO_SHORT_MB=120
MEDIA_MAX_VIDEO_LONG_SEC=3000
MEDIA_MAX_VIDEO_LONG_MB=1200
```

**El tope bueno es el del servidor, y lo impone el almacén**: la URL firmada lleva una
condición `content-length-range` que MinIO aplica él mismo. La app no es la que decide: pide
el billete, lee `maxBytes`/`maxSec` de la respuesta y avisa con **esos** números. Si mañana
cambia el `.env`, la app se entera sola en vez de mentir con una constante.

---

## 4. La app: subida directa al almacenamiento, con progreso

### 4.1 Dos caminos de subida, a propósito

| Tipo | Camino | Por qué |
|---|---|---|
| Imagen (≤10 MB) · Audio (≤60 MB) | `POST /lifebook/media/upload` (multipart contra el API), como siempre | Pequeños, y ese camino ya va fino |
| **Vídeo** | **URL firmada → el archivo va directo del móvil a MinIO** | 900 MB atravesando el proceso del API, sin progreso y sin reanudar, no es viable |

Ficheros nuevos:

- **`api/lifebookMediaReal.ts`** — el cliente de la subida firmada: `billete`, `cerrar`,
  `cuota`, `borrar`, `lecturaFirmada`, y `subirArchivoFirmado()` con progreso.
- `constants/lifebook.ts` — `LB_VIDEO_PERFILES` (corto/largo), `lbPerfilVideo()`, `lbPeso()`.
- `app/lifebook-media.tsx` — selector de perfil, elección del perfil según la duración,
  barra de progreso, avisos de peso/datos.
- `app/lifebook-videos.tsx` — el feed deja de tratar un largo como un clip.

### 4.2 Tres detalles que no son estilo

1. **El archivo va el ÚLTIMO en el formulario.** MinIO ignora lo que venga detrás y la
   firma deja de cuadrar. El orden es parte del contrato, no una preferencia.
2. **No se fija la cabecera `Content-Type` del formulario.** La política compara el campo
   `Content-Type` del formulario, no la cabecera; si se fija a mano, el runtime no puede
   poner su `boundary` y la subida falla con 403.
3. **La duración que se publica es la que devuelve el servidor**, no la que traía el
   selector: `asset.duration` viene a 0 en vídeos grandes. Publicar un dato que el
   servidor ya midió con `ffprobe` es gratis y siempre es correcto.

### 4.3 Lo que se le dice al usuario antes de gastar sus datos

- El perfil **se elige solo**: si el vídeo dura más de 60 s, salta a «Vídeo largo».
- Más de **250 MB** → aviso explícito de datos móviles y de que puede tardar.
- Barra de progreso con **MB subidos / total, %, MB/s y minutos que faltan**.
- El servidor rechaza lo que no cabe y el mensaje dice **el número real**, no uno fijo.

### 4.4 Si algo falla después de subir, se borra

Si el vídeo se subió y falló la publicación, la app hace `DELETE` del objeto: un vídeo de
900 MB no puede quedarse ocupando disco por un fallo de un segundo. Sin eso, solo lo
limpiaría el barrido de huérfanos.

---

## 5. El feed: un vídeo de 50 minutos NO es un clip

El feed inmersivo (B1) hace autoplay del visible, en bucle, y el siguiente con un desliz.
Meter un vídeo de 50 minutos ahí es lo peor de los dos mundos: se **descarga entero** (900 MB)
mientras el usuario mira, al terminar **vuelve a empezar** como si fuera un clip, y sin barra
de progreso no hay forma de saber por dónde va.

Ahora, a partir de 60 s (`LARGO_DESDE_SEC`, el mismo umbral que el backend):

- **no** se reproduce solo: se ve su portada con la duración y un botón ▶;
- **no** entra en bucle (`loop = false`);
- un toque **abre el reproductor** completo (controles nativos, con barra y pantalla
  completa), en vez de pausar algo que no estaba reproduciéndose.

El umbral es el mismo del backend a propósito: «corto» significa lo mismo en todas partes.

---

## 6. Pruebas

### 6.1 `lb50c-contrato-app.cjs` — el contrato app↔servidor · **18/18 PASS**

Hace exactamente lo que hace la app, con el mismo orden y los mismos cuerpos: cuota →
billete → subida multipart (campos y archivo el último) → cierre → lectura con `Range` →
publicar → borrar. El vídeo de prueba dura **62 s a propósito**: pasa del perfil corto, así
que si el camino largo no funcionara, falla aquí y no en el móvil de un usuario.

Lo que encontró en la primera pasada: **2 FAIL**, los dos `durationSec must not be greater
than 60`. Eso es el fallo de §2.

### 6.2 `lb50f-prueba-dto-video.cjs` — la puerta, por los dos lados · **10/10 PASS**

Un cambio de tope tiene dos formas de estar mal y las dos se comprueban:

- 3000 s **se acepta** (el tope exacto de 50 min) · 3001 s **se rechaza** (no se promete de más)
- 60 s **sigue aceptándose** (el corto de siempre no se rompió)
- 0, negativo, decimal y texto **se siguen rechazando**
- sin duración **se rechaza** (no hay valor por defecto silencioso)
- el podcast de 45 min **no se tocó** (`PodcastDto` sigue con su 3600)

### 6.3 `lb50-prueba-video50.cjs` — el camino del servidor · **9/9 PASS** (antes del DTO)

Además de lo anterior: un vídeo **real de 49 minutos** sube y se verifica
(`durationSec=2940`, códec, dimensiones, póster); un archivo de **51 minutos declarado como
50** se rechaza con «El archivo dura 3060 s y el máximo es 3000 s»; 215 MB suben por la URL
firmada y `/complete` responde en 0,215 s; la lectura pública devuelve 206.

### 6.4 `lb50g-medir-subida.cjs` — la medición de §1.1

Genera un 720p realista (la tasa que daría 900 MB en 50 min), lo sube por el camino real y
convierte el número en tiempos para 90 / 300 / 900 / 1200 MB.

---

## 7. Lo que sigue abierto (decisiones, no tareas)

### 7.1 ¿900 MB o menos? — **hace falta decidir**

El tope de 50 min funciona, pero medido: **900 MB son ~23 minutos de subida** y **1200 MB,
31 minutos**, con la pantalla abierta y sin poder reanudar si se corta. Opciones:

| Opción | Efecto |
|---|---|
| **Dejarlo en 50 min / 1200 MB** | Funciona. Se publican vídeos largos; algunos tardarán media hora |
| **Bajar el perfil largo a ~10 min / 200 MB** | 5 minutos de subida. Cubre la mayoría de los casos reales |
| **Subir el ancho de banda del servidor** | Es la causa raíz: ~5 Mbit/s. Con 50 Mbit/s, 900 MB son 2,5 min |
| **Subida reanudable en segundo plano** | El usuario puede salir de la pantalla. Es trabajo aparte |

Recomendación: **medir la velocidad real desde el móvil** (el número de §1.1 es del servidor
hacia sí mismo; el móvil puede ir más rápido o más lento) y decidir con ese dato.

### 7.2 No se puede borrar una publicación — **riesgo real con vídeos de 900 MB**

No existe `DELETE /lifebook/posts/:id`. Se pueden borrar me gusta, comentarios, guardados…
pero **no lo que uno publica**. Con vídeos de 50 minutos y 29 GB de disco, un usuario que
publique 900 MB por error **no tiene forma de quitarlo**. Es un agujero de antes, pero este
cambio lo hace caro. Hay que decidir si se añade.

### 7.3 El API acepta cualquier URL de vídeo

`POST /lifebook/posts/video` acepta cualquier `videoUrl` http y una `durationSec` de hasta
3000 s **sin comprobar que corresponda a una subida verificada del que publica**. Antes el
tope era 60 s; ahora la misma puerta deja pasar una promesa más grande. La comprobación
razonable sería exigir que la URL esté en `lifebook.media_uploads` como `ready` y del mismo
usuario. No se cambió porque puede romper flujos que hoy funcionan (productos, documentos,
posts con URLs de otros proveedores): es decisión de producto.

### 7.4 Detección de `faststart`

Un MP4 cuyo índice está al final no empieza a reproducirse hasta descargar buena parte. Con
50 minutos eso se nota. Detectarlo es barato (`ffprobe` ya está en el camino); remuxear
`-movflags +faststart` cuesta CPU en un servidor de 2 vCPU. Sin implementar: primero medir
cuántos archivos reales lo necesitan.

### 7.5 Cuota por persona

`MEDIA_MAX_PER_DAY=40` y `MEDIA_MAX_PENDING_MB=5120` son globales, no por tamaño: 40 subidas
de 1200 MB son **48 GB** y el disco tiene 29 GB libres. Hay que decidir si se limita por
bytes y por persona antes de que alguien lo descubra a base de llenar el disco.

---

## 8. Cambios, para poder volver atrás

### Servidor (`8.218.88.237`, `/opt/mirror/app`)

| Fichero | Antes | Ahora |
|---|---|---|
| `src/lifebook/media.service.ts` | `77d48008…` | **`69403b07db08f2ed5cadac34ece084ce`** |
| `src/lifebook/lifebook.controller.ts` | `dbb7d078f0a9e6e1a3092e56322a74c3` | **`c52cabc5ce713f4e7e47c1c2f98cb26c`** |
| `.env` | — | `MEDIA_MAX_VIDEO_LONG_SEC=3000`, `MEDIA_MAX_VIDEO_LONG_MB=1200` |
| `nginx/sites-enabled/mirror` | `proxy_read_timeout 60s` | **`300s`** |

Copias en `/opt/mirror/backups/*antes-video50-*` y `*antes-timeout-*`.

### App (`D:\egapp`)

| Fichero | Qué |
|---|---|
| `api/lifebookMediaReal.ts` | **nuevo** — cliente de la subida firmada con progreso |
| `constants/lifebook.ts` | `LB_VIDEO_PERFILES`, `lbPerfilVideo()`, `lbPeso()`, `maxSec` en `MEDIA_KIND_ACCEPT` |
| `app/lifebook-media.tsx` | perfil corto/largo, barra de progreso, avisos, duración verificada |
| `app/lifebook-videos.tsx` | el feed no reproduce solo los largos; botón y no bucle |

`npx tsc --noEmit` limpio. APK compilado (110,6 MB, `app-release.apk`).

### Herramientas de prueba (en `server-fix/` y `/tmp` del servidor)

`lb50c-contrato-app.cjs` · `lb50d-parche-video-dto.cjs` · `lb50e-borrar-post-prueba.cjs` ·
`lb50f-prueba-dto-video.cjs` · `lb50g-medir-subida.cjs` · `lb50c-62s.mp4`
