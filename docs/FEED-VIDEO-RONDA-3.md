# Feed inmersivo — tercera ronda (tu prueba en el aparato)

**Parte 51-d · 13 de septiembre de 2026**

> Lo pedido en esta ronda: comentarios **dentro** del feed sin salir, «相关搜索» en español,
> investigar cómo lo hacen otras plataformas, y —tras probar el build— **arreglar tres cosas
> que estaban mal**.

---

## 1. Lo que TÚ detectaste probando, y era culpa mía

Los tres primeros son de la ronda anterior y los introduje yo. Van primero porque son fallos
reales que ya has visto.

### 1.1 «El feed se resiste» y «se ve el vídeo de al lado»

**Causa:** puse `disableIntervalMomentum` y `decelerationRate="fast"` razonando que un gesto
rápido podía saltarse páginas. **Era una hipótesis equivocada y no la comprobé antes de
enviarla.** `disableIntervalMomentum` hace exactamente lo contrario de lo que yo quería: obliga
a la lista a parar en el índice siguiente **ignorando la velocidad del dedo**, o sea que el
gesto se frena en seco —«se resiste»— y puede quedarse en una posición intermedia, que es
cuando se ven los dos vídeos a la vez.

**Arreglo:** las dos props fuera. Se queda `pagingEnabled` a secas, que es lo que ya funcionaba.
La lección queda escrita en el código, junto a las props, en vez de en un cuaderno aparte.

### 1.2 «Una capa negra transparente que cubre la parte inferior del vídeo»

**Causa:** el `scrim` era un rectángulo **plano**: `rgba(0,0,0,0.42)`, 250 px de alto, con el
borde superior recto. Sobre un vídeo que ya no tiene bandas negras, ese borde se ve como lo que
es: una capa pegada encima.

**Arreglo:** `BottomScrim` — 10 franjas de opacidad creciente, de casi transparente arriba al
0,62 abajo. A la vista es un degradado continuo, sin borde. **Sin dependencias nuevas**:
`expo-linear-gradient` no está instalado y añadirlo por esto no compensa (el proyecto ya evita
dependencias nuevas cuando hay salida).

### 1.3 Tirones al cambiar de vídeo (y una causa más que no habías visto)

Al leer el tamaño real del vídeo (`player.videoTrack.size`) para decidir si llenar o encajar la
pantalla, creaba un **objeto nuevo en cada evento**. `statusChange` se dispara muchas veces
(carga, buffer, listo…), así que la página se re-renderizaba sin parar: eso se nota como tirones
justo al pasar de un vídeo a otro.

**Arreglo:** devolver **el mismo objeto** cuando el tamaño no ha cambiado. React se salta el
render si el estado es idéntico por referencia.

---

## 2. Un fallo de verdad que encontré midiendo: los vídeos NO repetían

Esto no lo habías reportado, y es importante para un feed inmersivo.

`p.loop` se ponía **sólo** dentro del `setup` de `useVideoPlayer`. Medido en el aparato, eso no
basta: el clip se reproducía y **al llegar al final se quedaba clavado en el último fotograma**.
En un feed que se navega deslizando, un vídeo parado se ve como una pantalla muerta.

De hecho **este fallo me hizo perder un buen rato persiguiendo un fantasma**: varias veces medí
«el vídeo se congela» y lo atribuí a la hoja de comentarios o al `Modal`, cuando lo que pasaba
era que el clip había terminado y no volvía a empezar.

**Arreglo:** el bucle se sincroniza con un efecto, igual que ya se hacía con el silencio, para
que se aplique cuando el reproductor está listo y no sólo al construirlo.

**Verificado:** se entra al feed, y **28 segundos después** (más que cualquier clip corto) el
vídeo sigue avanzando — franjas vivas al 54-81 %. Antes, a esa altura, estaba congelado.

---

## 3. Comentarios dentro del feed, sin salir

Antes, el botón de comentarios hacía `router.push('/lifebook-post/[id]')`: te sacaba del feed y,
al perder el foco, **el vídeo se pausaba**. Leer los comentarios paraba el vídeo y rompía el
inmersivo, que es justo lo contrario de lo que se pidió.

Ahora se pinta **la misma `CommentsSheet` que usa el detalle** (sin duplicar el componente)
encima del vídeo, y no se navega a ningún sitio: se queda el foco, así que el vídeo sigue.

### 3.1 El detalle técnico que lo hace posible (y que casi lo impide)

La hoja es un `Modal`, o sea **otra ventana**. El `surfaceView` que `expo-video` usa por defecto
**no compone con nada que lo tape**: el vídeo se vería como un agujero NEGRO detrás de los
comentarios. La propia doc de `expo-video` lo dice con estas palabras al describir
`textureView`: *«Should be used in cases where the SurfaceView is not supported or causes issues
(for example, **overlapping video views**)»*.

Así que el `VideoView` del feed usa `surfaceType="textureView"`. Cuesta más batería y es el
precio de poder leer los comentarios con el vídeo debajo. (En la ronda anterior se había quitado
`textureView` porque ya no hacía falta para el zoom; ahora vuelve por un motivo distinto y real.)

### 3.2 Que la hoja NO tape el vídeo

Dos ajustes que sólo tienen sentido en el feed, y por eso son **props opcionales** de la hoja
(el detalle de la publicación sigue con sus valores de siempre, sin cambios):

| Prop | Detalle | Feed | Por qué |
|---|---|---|---|
| `dimBackdrop` | 0,45 | **0** | El velo oscuro ayuda a leer en el detalle, pero aquí debajo hay un vídeo reproduciéndose: taparlo es lo contrario de lo que se quiere |
| `maxHeightPct` | 80 | **55** | Con el 80 %, unos cuantos comentarios tapaban el vídeo ENTERO y el usuario dejaba de ver un vídeo para ver una lista |

**Medido:** el vídeo por encima de la hoja tiene brillo 231,9 y máximo 255 (con el velo del 45 %
el máximo se quedaba clavado en 140: esa era la firma del velo). Y el borde superior de la hoja
queda en y≈1159-1543, o sea que el vídeo conserva entre 830 y 1200 px de pantalla.

---

## 4. «相关搜索» no puede estar en chino

Traducido a **«Búsquedas relacionadas»**. Y la misma revisión encontró **más chino visible del
que se había reportado**, en otra pantalla:

| Fichero | Estaba | Ahora |
|---|---|---|
| `app/lifebook-videos.tsx` | `相关搜索` (visible) | Búsquedas relacionadas |
| `app/lifebook-videos.tsx` | `全屏观看` (accesibilidad) | Ver a pantalla completa |
| `app/ecomerse-favorites.tsx` | pestañas `全部 · 上新 · 分类 · 买过 · 特别关注` | Todo · Novedades · Categorías · Comprados · Especiales |
| `app/ecomerse-favorites.tsx` | `Alert.alert('特别关注')`, «aparecerán en 买过» | «Especiales», «aparecerán en Comprados» |

Regla que queda escrita en el código: **los nombres de las plataformas de referencia (小红书,
美团外卖, DiDi) se quedan en los COMENTARIOS**, porque explican de dónde sale cada decisión. Lo
que no se queda en chino es **nada que el usuario pueda leer** — y `accessibilityLabel` cuenta,
porque un lector de pantalla lo dice en voz alta.

El estudio de cómo lo hacen otras plataformas está en
`docs/BUSQUEDAS-RELACIONADAS-INVESTIGACION.md`. El resumen incómodo: las búsquedas relacionadas
de verdad salen del **comportamiento** (lo que la gente busca después de ver esto), y con 11
usuarios eso no existe. Lo nuestro usa los campos de la propia publicación, que es el mecanismo
de arranque, no el bueno. Y **0 de 3 vídeos tienen temas**, así que la fila se caía a ciudad,
autor y título.

---

## 5. Un solo estado de ver vídeo — con una excepción que NO se puede evitar

El dueño pidió que **el reproductor a pantalla completa desapareciera**: sólo debe existir el
feed inmersivo.

Hecho: fuera el icono «Ver a pantalla completa» del feed, fuera el reproductor de vídeo de
publicación (`VideoPlayerView`), y `/lifebook-player?kind=video` redirige al feed. Un vídeo de
PUBLICACIÓN tiene ahora un único estado.

**Pero no se pudo borrar del todo, y hay que decirlo:** consultado el servidor, existen
**12 series con 36 episodios, todos con vídeo**. Un **episodio de serie no es una publicación**:
vive en `lifebook.series_episodes`, con su `video_url` en columna propia, y el feed sólo sabe de
publicaciones. Borrar el reproductor sin darles salida habría dejado **36 vídeos imposibles de
ver**.

Se valoró y se descartó meter el episodio en el feed como «publicación sintética»: obligaría a
que el camino MÁS USADO de la app lleve condiciones para elementos que no son publicaciones (sin
me gusta, sin comentarios, sin autor), o sea complejidad en el sitio más caliente para satisfacer
una preferencia de interfaz. La solución tomada: el reproductor queda **acotado a episodios**
(`EpisodePlayerView`), aislado y sin tocar el feed.

**Pendiente de tu decisión:** si los episodios deben moverse al feed, eso es trabajo aparte.
Lo que sí está cumplido es que **no hay dos pantallas para el mismo contenido**.

---

## 6. Corregido de la ronda anterior

- **Vídeo largo que no se podía reproducir.** Se me coló al quitar el reproductor externo: el
  efecto de reproducción exigía `!esLargo`, y como el toque ya no abría nada, un vídeo de más de
  60 s **no había forma de arrancarlo**. Ahora la pausa inicial del largo es un ESTADO y el toque
  la quita: sigue sin autoreproducirse (no descarga 900 MB sin permiso) pero se reproduce cuando
  el usuario lo pide.
- **Selección del perfil del vídeo**: «Toca para reproducirlo» en vez de «Toca para verlo con
  controles».

---

## 7. Lo que NO pude verificar (dicho claro)

- **Si el vídeo sigue avanzando mientras la hoja de comentarios está abierta.** Mis mediciones
  salen contradictorias y el estado de la hoja no se deja fijar de forma fiable por `adb`: unas
  veces el toque no la abre, otras se cierra antes de medir. Lo que sí está medido es que **no
  la tapa** (sin velo, altura acotada) y que **el vídeo está compuesto dentro de la ventana de
  la app** (`dumpsys SurfaceFlinger` no lista ninguna capa de vídeo aparte, que es la firma de
  `textureView`). El «sigue reproduciéndose» no lo firmo sin verlo.
- **La fluidez del gesto.** Es una sensación: lo único que puedo medir es que el ajuste que la
  empeoraba ya no está.

---

## 8. Un problema de acceso, para que lo sepas

A partir de las 12:40, **SSH al servidor dejó de responder**: el TCP conecta (`Test-NetConnection`
da abierto en el 22) pero el handshake se queda en `Connection timed out`. La red va bien (ping
46 ms) y la API responde por HTTPS. Lo más probable es un bloqueo temporal por mis conexiones
seguidas. **No bloquea nada pendiente**: el arreglo del API (404/400) está desplegado y
verificado desde antes.
