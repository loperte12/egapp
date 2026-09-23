# Like Book · organización en bloques (2026-09-12)

> Petición del dueño: arreglar una lista de cosas de Like Book. Este documento la reparte en **dos
> bloques**: el **A** lo lleva el agente de plataforma (servidor, medios, arranque de la app) y el **B** el
> agente de Life Book (cliente y UX). Cada punto dice **qué está medido hoy**, **qué hay que hacer**,
> **cómo se comprueba** y **qué hay que investigar ANTES** (el dueño insistió: *investigar, no suponer*).

---

## 0. Lo que ya está medido (para no volver a discutirlo)

| Cosa | Estado real, medido en el código |
|---|---|
| Vídeo | El servidor admite `video_long` hasta 60 min / 2 GB y verifica la duración **real** con `ffprobe`; la app solo publica «vídeo corto» (120 MB / 60 s) y sube **por multipart a la API**, que pasa por nginx con `client_max_body_size 130m`. Existe subida directa a MinIO con **presign + `/complete` + cuota**, pero la app no la usa para publicar. |
| Reproductor | Es una **pantalla aparte** (`/lifebook-player`). El feed no reproduce nada. |
| Fase de edición | **No existe**: se elige archivo, título y descripción, y se publica. |
| Compartir | Solo hay `Share.share({ message })` (texto) en alquiler y ofertas de trabajo. Las publicaciones de Life Book **no tienen compartir**. |
| Mensajes | `api/messages.ts` tiene menciones **a nivel de bandeja** (comentarios/publicaciones). En el chat **no hay** citar (引用), multiselección (多选), ni traducción. |
| Grupos | `lifebook-groups.tsx` + `lifebook-group-create.tsx` existen; **no hay foto de grupo**. |
| Destello blanco | `app.json`: `backgroundColor: "#F5F7FA"` (casi blanco) con `userInterfaceStyle: "automatic"` ⇒ en modo oscuro la **ventana nativa** sigue clara. El `<Stack>` raíz no define `contentStyle`, así que el navegador pinta **su** fondo (claro) durante la transición. Y **15 de 87** pantallas no fijan `colors.background`. El tema **no** se carga tarde (el `ThemeProvider` del ui-kit arranca en `'system'` sin `AsyncStorage`), así que el destello no viene de ahí. |
| Barra superior | `lifebook.tsx` lleva barra de búsqueda ancha + ciudad + icono de mensajes. Canales como pestañas de texto; feed *masonry* de 2 columnas; hay **polling de no leídos** ya montado (línea ~270). |
| Perfiles | **Dos superficies para la misma persona**: `/profile` (`profile.tsx`, 53 KB, se entra desde el ☰) y `/lifebook-user?id=…` (`lifebook-user.tsx`, con portada, badge, Seguir y pestañas Notas · Ventas · Todo; si es tu perfil muestra «Editar perfil»). Además `edit-profile.tsx` (56 KB) es el editor. |

---

## BLOQUE A — para el agente de plataforma (yo)

### A1 · Vídeo hasta 50 minutos
**Hecho ya:** decisión de calidad tomada (720p ≈ 900 MB).
**Falta:** techo de 50 min (3000 s) y ~1 GB por archivo; **subida directa a MinIO con progreso**
(presign → POST a `https://hk.egrouteplan.com/storage/…` → `/complete`), nginx con
`client_max_body_size` alto **y `proxy_request_buffering off`** en `/storage/` (si no, nginx bufferiza
1 GB en disco y corta), **remux a `faststart`** al cerrar (ffmpeg `-c copy`: sin recodificar) para que
empiece a verse sin descargarlo entero, aviso de datos móviles, y cuota por persona.
**Se comprueba:** subida real de un vídeo de ~50 min desde el móvil con progreso y sin cortes; un vídeo de
51 min se rechaza; la reproducción arranca en el primer segundo (no tras descargar todo).
**Investigar antes:** cuánto tarda `-c copy` con un archivo de 900 MB en el disco actual (medirlo, no
estimarlo) y si conviene hacerlo en el mismo `/complete` o en cola.

### A2 · El destello blanco (el «gran bug» de carga)
**Causa medida:** tres capas, todas de arranque, no de contenido:
1. `app.json` → `backgroundColor: "#F5F7FA"` con `userInterfaceStyle: "automatic"`: en oscuro la ventana
   nativa sigue casi blanca.
2. `<Stack>` sin `contentStyle`: el navegador pinta su fondo claro en cada transición.
3. 15 pantallas sin `backgroundColor: colors.background`.
**Arreglo:** fondo del contenedor raíz y `contentStyle` **con el color del tema**; `expo-system-ui` para
el fondo nativo en caliente; `app.json` con un fondo que no deslumbre en oscuro; y las 15 pantallas que
faltan. **Se comprueba en el aparato**: grabación de pantalla cambiando de espacio en modo oscuro, y
`logcat` sin parpadeos; no vale «se ve mejor».
**Investigar antes:** cómo deja Android la ventana durante las transiciones en esta versión de Expo y si
`expo-video` (ya en plugins) mete su propio fondo.

### A3 · Compartir de verdad (plataforma)
**Hoy:** solo texto, y solo en dos pantallas ajenas a Life Book.
**Hace falta:** enlaces profundos por contenido (`https://hk.egrouteplan.com/lb/<id>` que abra la app si
está instalada y la web si no), **ficha Open Graph con imagen** (portada de la publicación) para que al
pegar en WhatsApp salga tarjeta y no una URL pelada, y endpoint de tarjeta de compartir.
**Se comprueba:** pegar el enlace en WhatsApp y ver imagen + título (captura), y que abre la app.
**Investigar antes:** si nginx ya sirve `/lb/` y cómo se generan las imágenes OG (ffmpeg está instalado).

### A4 · Traducción de mensajes (servidor)
**Hace falta:** endpoint de traducción por mensaje con **caché** por (mensaje, idioma) e idioma preferido
por usuario; y **nada de inventar**: si no hay proveedor configurado, responder «no disponible» en vez de
una traducción falsa.
**Investigar antes:** proveedor (Google/DeepL/Azure), coste por carácter, y **si el tráfico desde Hong
Kong es viable**; idiomas a cubrir (español, francés, inglés, chino, fang/NDOWE probablemente no tengan
proveedor — decirlo, no fingirlo).

### A5 · Los dos perfiles (el conflicto de raíz)
**Hoy:** `/profile` y `/lifebook-user?id=…` muestran a la misma persona con datos y diseños distintos.
**Hace falta:** decidir **cuál es la fuente de verdad** de cada campo en el servidor (identidad, foto,
bio, enlaces, contadores de seguidores, contenido) y que una superficie sea la «ficha» y la otra solo la
vista de Life Book, o unificarlas en una.
**Se comprueba:** un mismo cambio de bio/foto se ve igual en las dos entradas, y los contadores cuadran.
**Decisión del dueño pendiente:** ¿un perfil único con pestañas (estilo Xiaohongshu) o dos con roles
claros (personal vs. Life Book)?

---

## BLOQUE B — para el agente de Life Book (cliente y UX)

> Regla de la casa: **investigar la referencia antes de diseñar**, y comprobar en el aparato. Nada de
> «lo he puesto y debería verse».

### B1 · Vídeo inmersivo: deslizar de vídeo a vídeo
Hoy hay que **entrar a `/lifebook-player`**. Lo que se pide es como TikTok/小红书: en el propio feed,
**deslizar hacia arriba/abajo** pasa de un vídeo al siguiente, sin entrar en ningún sitio.
**Hace falta:** lista vertical paginada con **autoplay del que está visible** (y pausa del resto),
doble toque = me gusta, silencio al entrar y botón para activar sonido, precarga del siguiente, gesto de
vuelta, y que no se cargue todo de golpe.
**Investigar antes:** el «沉浸式» de 小红书 y el **自动连播** que 小红书 y 抖音 añadieron a la vez
([análisis](https://m.163.com/dy/article/L14VDM880511805E.html?spss=adap_pc),
[diseño de contenido inmersivo](https://www.yuque.com/wedesign/323/arvwgo2web6ys4bi),
[prácticas de inmersión en 小红书](https://blog.csdn.net/2402_87628679/article/details/152477254)).
**Ojo:** `/lifebook-player` se queda para el detalle; el feed no debe perder su posición al volver.

### B2 · Fase de edición al publicar
Hoy se publica el archivo tal cual. Falta el paso intermedio que 小红书 sí tiene: **recortar el vídeo**
(inicio/fin), **elegir portada**, filtros/ajustes básicos, **texto y etiquetas sobre el vídeo**, ordenar
varias fotos y **guardar borrador**.
**Investigar antes:** el flujo real de publicación de 小红书
([guía de publicación](https://www.php.cn/faq/2215817.html),
[flujo completo por pasos](https://www.renrendoc.com/paper/526637754.html),
[publicar vídeo](https://www.vivozhijia.com/wz/870363.html)) y qué se puede hacer **en el móvil sin
servidor** (recorte y portada se pueden hacer en local; no mandar el vídeo dos veces).

### B3 · «Siguiendo»: las personas que sigues arriba
Se pide que en la pestaña de seguidos aparezcan **los perfiles que sigues** en la parte superior (como
小红书), con su estado («nuevo») y acceso directo.
**Investigar antes:** cómo ordena y presenta 小红书 la relación de seguidos
([reconstrucción de la lógica de «关注»](https://www.uisdc.com/hunter/0221468526.html)) y **de dónde sale
la lista** (¿`/lifebook/users/:id/following`? ¿ya existe? medirlo antes de inventar el endpoint).

### B4 · Buscador como icono, no como barra
Quitar la barra ancha de `lifebook.tsx` y dejar un **icono de búsqueda junto al de mensajes**; el campo
de texto se abre en su pantalla (`/lifebook-search`, que ya existe).
**Se comprueba:** en el aparato, el icono abre el buscador y la barra no ocupa sitio.

### B5 · Mensajes como WeChat
- **引用 (citar)**: responder citando el mensaje, con su autor y una línea del original.
- **提醒 (@ con aviso)**: mencionar a alguien y **avisarle** (aunque tenga el grupo silenciado).
- **多选 (selección múltiple)**: seleccionar varios y reenviar/borrar.
- **Traducción**: consumir el endpoint del **Bloque A4**; si no hay traducción, decirlo.
- **Foto de grupo**: hoy no se puede poner. Como WeChat, **por defecto una rejilla con las fotos de los
  miembros** (2×2, 3×3…) y opción de poner una propia.
**Investigar antes:** el comportamiento de WeChat en 引用 / 合并转发 / 提醒
([引用回复 y 合并转发](https://m.vivozhijia.com/wz/883934.html),
[actualizaciones recientes](https://www.ithome.com/0/838/520.htm)) y la **rejilla de grupo**
([composición de avatares de grupo](https://wenku.csdn.net/doc/6he1i3j4gf),
[avatares de grupo en WeChat](https://m.sohu.com/a/933741678_100071398/),
[rejilla 2×2/3×3](https://pub.dev/packages/nine_grid_view)).

### B6 · Compartir dentro de Life Book
Hoja de compartir en cada publicación: **compartir en un chat**, copiar enlace, y el enlace que construye
el Bloque A3. Y **recibir** los enlaces profundos (abrir la publicación desde fuera).

### B7 · Cambiar de espacio sin incomodidad
Hoy pasar de un espacio a otro se siente mal (recargas, saltos de scroll, vuelta atrás lenta).
**Hace falta:** conservar la posición del feed al volver, no recargar lo que ya está, gesto de atrás, y
transiciones sin destello (**coordinado con A2**).
**Investigar antes:** cómo resuelve 小红书 la vuelta al feed conservando scroll y estado.

### B8 · Aviso de mensajes entrantes en el footer
Mostrar en el pie **si hay mensajes nuevos** (punto/contador). Ya hay sondeo de no leídos en
`lifebook.tsx` (~línea 270): reutilizarlo y que se actualice al entrar y salir del chat.

---

## Orden propuesto (y por qué)

| # | Punto | Quién | Por qué en este orden |
|---|---|---|---|
| 1 | **A2** destello blanco | A | Toca toda la app y molesta en cada pantalla; es lo primero que ve cualquiera. |
| 2 | **A1** vídeo 50 min | A | Ya está en marcha y es la fontanería que necesita todo lo demás (incluida la grabación futura). |
| 3 | **B4** icono de búsqueda + **B8** aviso de mensajes | B | Barato, visible, sin dependencias. |
| 4 | **B1** vídeo inmersivo | B | La queja más grande de uso diario. |
| 5 | **B2** fase de edición | B | Sin esto, lo que se publica se ve pobre. |
| 6 | **B5** mensajes WeChat (citar/avisar/multiselección/grupo) | B (traducción: A4) | Peso alto, se puede ir por partes. |
| 7 | **A3 + B6** compartir | A + B | Necesita enlaces y tarjeta antes de la hoja. |
| 8 | **A5** los dos perfiles | A + B | Es el conflicto de fondo: mejor decidirlo con calma que a parches. |
| 9 | **B3** seguidos arriba, **B7** navegación | B | Pulido, después de lo anterior. |

**Coordinación:** A2 y B7 se tocan (transiciones): los hace el mismo que el fondo. Y **B5 necesita A4**
para la traducción: primero el endpoint, luego el botón.

## Decisiones que hacen falta del dueño

1. **Perfiles**: ¿un perfil único con pestañas (estilo 小红书) o dos superficies con roles claros?
2. **Vídeo**: confirmado 720p/~900 MB. ¿Hay que **limitar cuántos vídeos largos** puede subir cada
   persona al mes (el disco tiene 29 GB libres)?
3. **Traducción**: ¿se paga proveedor (Google/DeepL) o se deja «no disponible» hasta que haya presupuesto?
4. **Compartir**: ¿el enlace debe abrir la **web** cuando no esté la app (habría que montar la web) o solo
   invitar a descargarla?
