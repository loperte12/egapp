# «Nuestro Netflix» en EG Route Plan — plan por fases, con números medidos

Fecha: 2026-09-14. Estado: **plan**. Nada implementado de esto.

Pregunta del dueño: montar nuestro propio Netflix aprovechando el código abierto de
Stremio, como una sección más de la app. Lo que sigue es mi valoración con datos
reales de nuestra base, no con estimaciones de folleto.

## 0. Resumen en tres frases

1. **La idea es buena y la sección cabe**, pero no como «un Netflix»: como una
   sección de **series y vídeos** sobre lo que ya tenemos (28 vídeos, 22 series con
   **66 episodios**, 22 podcasts).
2. **De Stremio se aprovecha el modelo, no el código**: su núcleo (`stremio-core`) y
   el SDK de addons son **MIT** y se pueden usar; su app web es **GPL-2.0** y su capa
   de reproductor **no tiene licencia**, así que no se tocan.
3. **El problema de verdad no es el reproductor: es el peso de los archivos.** Hoy
   guardamos el vídeo **tal cual se sube**: medido, **16 Mbps de media y hasta 43
   Mbps**, con un archivo **4K**. Un vídeo de 3,6 minutos pesa ~430 MB. Sin
   transcodificar, esto no se puede ver en un móvil con datos caros.

## 1. Lo que tenemos hoy (medido en la base)

| Dato | Valor |
|---|---|
| Vídeos activos | **28** |
| Series | **22**, con **66 episodios** |
| Podcasts | **22** |
| Archivos subidos (`media_uploads`) | **23**, **264 MB** en total |
| Archivos con duración y peso registrados | 6 → **252 MB en 6 minutos** |
| **Bitrate medio** | **16 162 kbps** |
| **Bitrate máximo** | **43 110 kbps** |
| Resoluciones | 160×120 · 720×1582 · **3840×2160 (4K)** |
| Códecs | h264 (4) · hevc (2) · sin dato (17) |
| Duración máxima / media | 218 s (3,6 min) / 61 s |
| Tope que decidimos para un vídeo largo | 50 min · 1 200 MB |

**Diagnóstico: subimos originales sin procesar.** Nadie mira un 4K a 43 Mbps en un
teléfono, y menos con los datos que cuestan aquí. Esto es la pieza que hay que
arreglar **antes** de hablar de catálogo.

## 2. La cuenta que decide todo (con nuestro propio dato de red)

Medimos **0,21 MB/s** de subida y el móvil declara ~4,5 Mbps. Con eso:

| Cómo se sirva un vídeo de 50 min | Peso | Tiempo de descarga a 0,21 MB/s | 1 000 reproducciones |
|---|---|---|---|
| Como está hoy (16 Mbps) | **6 000 MB** | **~8 horas** (imposible) | 6 TB |
| El tope actual de subida | 1 200 MB | **~95 min** | 1,2 TB |
| **Escalón móvil 360p (~400 kbps)** | **~150 MB** | **~12 min** | **150 GB** |
| Escalón 240p (~250 kbps) | ~94 MB | ~7 min | 94 GB |

Dos consecuencias que no son opinión:

- **El bitrate es la palanca, no el catálogo.** Bajar de 16 Mbps a 400 kbps es **40
  veces menos datos**, y para ver en un móvil no se pierde nada apreciable.
- **La descarga por wifi para ver luego** no es un adorno en este mercado: es la
  diferencia entre verlo o no verlo. (Las publicaciones ya llevan un permiso
  `allowDownload`, o sea que el concepto existe; falta el flujo.)

Coste de salida del CDN, para poner orden de magnitud: a ~0,02-0,05 $/GB,
**1 000 reproducciones** de un vídeo largo cuestan **~0,3-1,5 $** con escalón móvil y
**~24-60 $** sirviéndolo a 16 Mbps. Es la diferencia entre un producto viable y una
factura que asusta.

## 3. Fase 1 — la sección, con lo que ya hay (no necesita infraestructura nueva)

**Qué se construye:**

1. **Entrada «Series»** junto a los canales del feed (una pestaña o un chip; el
   backend ya tiene `type='serie'` y `series_episodes`).
2. **Estanterías** (filas horizontales): «Seguir viendo» (ya tiene endpoint, hecho
   esta ronda), «Series», «Vídeos nuevos», «Podcasts».
3. **Ficha de serie** con su lista de episodios y el siguiente sin ver.
4. **Búsqueda** dentro de vídeos y series (la búsqueda de Life Book ya existe; hay que
   comprobar que cubre estos tipos).
5. **Descargar para ver sin datos** (wifi → ver luego), respetando `allowDownload`.

**Qué NO se toca:** ni almacenamiento, ni CDN, ni reproductor. Todo esto se apoya en
lo que ya funciona (OSS + `expo-video`/Media3 + `watch_progress`).

**Verificación:** suite contra la API (estanterías y ficha devuelven lo esperado) y
medición en el aparato (que se entre en la sección, se reanude y se navegue).

## 4. Fase 2 — transcodificar (la inversión que hace posible el vídeo largo)

- **ffmpeg** al recibir un vídeo → escalones **240p / 360p / 480p / 720p** en HLS
  (`.m3u8` + segmentos) + una copia del original para descarga.
- El reproductor **ya reproduce HLS** (Media3), así que aquí no hay que cambiar de
  player: hay que **servirle bien el contenido**.
- `media_uploads` ya guarda `codec`, `width`, `height`, `bytes`, `duration_sec`, o
  sea que hay dónde anotar lo que genere el transcodificador.
- **Coste de CPU:** un vídeo de 50 min tarda del orden de 1-2 h de CPU por escalón en
  un servidor modesto. Se resuelve con una **cola** (transcodificar de madrugada, y el
  vídeo aparece como «procesando» hasta que está listo).
- **Métrica que hay que tomar antes de prometer nada:** bytes servidos por
  reproducción, antes y después.

## 5. Fase 3 — dinero y contenido

- **Dinero**: el monedero ya existe, y el sistema de publicidad que acabamos de montar
  (`wallet.ads` con **impresiones y clics** + el hueco dentro de los comentarios) es un
  mini servidor de anuncios: un catálogo gratis con anuncios no necesita monetización
  nueva. Alternativa: suscripción con el monedero.
- **Contenido: este es el cuello de botella real, no la técnica.** «Nuestro Netflix»
  necesita contenido que **podamos distribuir**: producción propia con creadores
  locales, dominio público, licencias de televisiones/sellos, o UGC con reparto para
  el creador. Sin eso, la sección se queda en lo que suban los usuarios — que es
  exactamente la Fase 1.

## 6. Lo que NO hay que hacer (y por qué)

- **Nada de P2P ni de torrents.** El ecosistema real de Stremio son addons de
  torrents; nosotros alojamos nuestro contenido. Esto no es una preferencia: es la
  diferencia entre un producto y un problema legal.
- **No meter `stremio-core`** (Rust/WASM) como núcleo de una app Expo: sería reescribir
  nuestra capa de estado para nada.
- **No cambiar de reproductor**: `stremio-video` no tiene licencia, y mpv/VLC son
  GPL/LGPL (obligaciones para una app cerrada). Media3/ExoPlayer ya hace lo que
  necesitamos.
- **No copiar la interfaz de Netflix**: nuestra gente entra desde el móvil, con datos
  caros y pantallas pequeñas. Estanterías simples + descarga + buen escalón móvil vale
  más que un escaparate.

## 7. Lo que necesito decidir contigo

1. **¿Por dónde entramos?** Mi recomendación: **Fase 1** (sección con lo que hay) y,
   en paralelo, **medir y montar el transcodificador** de la Fase 2, porque sin él el
   vídeo largo no se puede ver.
2. **¿De quién es el contenido?** Propio, licenciado o de los usuarios. Es lo que
   decide si esto es una sección o un negocio.
3. **¿Gratis con anuncios o de pago?** Con `wallet.ads` ya se puede hacer gratis con
   anuncios sin construir nada nuevo.
4. **¿Cuánto se puede gastar al mes en salida de CDN?** Con ese número se elige el
   techo de calidad y si se permite 720p.

## 8. Lo que NO he verificado

- **El peso real de los vídeos que se sirven hoy uno por uno**: solo 6 de 23 archivos
  tienen `bytes` y `duration_sec`; los otros 17 están sin dato, así que el bitrate
  medio sale de esos 6.
- **Las tarifas reales del CDN** que usemos (depende del proveedor y del contrato):
  los 0,02-0,05 $/GB son un orden de magnitud público, no nuestra factura.
- **El tiempo de transcodificación en NUESTRO servidor**: no lo he medido; lo de 1-2 h
  por escalón es la referencia habitual, y habría que medirlo con un vídeo real de
  50 min antes de prometer plazos.
- **Qué reproduce el parque real de teléfonos** (hevc, 4K): no lo he probado en el
  Poco F5 ni en otros aparatos.
