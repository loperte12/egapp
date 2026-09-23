# Publicidad dentro de los comentarios (estilo WeChat) — investigación y plan

Fecha: 2026-09-14. Estado: **investigación + plan**, no implementado.
Pregunta: meter publicidad dentro de la zona de comentarios, como hace WeChat.

---

## 1. Qué hace WeChat exactamente

WeChat puso **anuncios en la zona de comentarios** (`留言区广告`), y el creador cobra
**por exposición**. No es un anuncio pegado encima de los comentarios: es un
**espacio publicitario dentro de la zona de comentarios** de la publicación.
([DoNews](https://www.donews.com/news/detail/8/6038096.html),
[i黑马](https://www.iheima.com/article-386634.html),
[IT之家](https://m.ithome.com/html/879435.htm),
[凤凰科技](https://tech.ifeng.com/c/8mHi0i1ovW4))

Y en **视频号** (los canales de vídeo de WeChat) los anuncios también aparecen en la
**zona de comentarios del vídeo**: hay una página **oficial de WeChat** explicando
«motivos frecuentes por los que no se muestra un anuncio en la zona de comentarios
de un vídeo». Es decir, para WeChat esto es una superficie publicitaria con
inventario propio, no un adorno.
([ayuda oficial de WeChat](https://findeross.weixin.qq.com/cgi-bin/mmfindernodelivecrmwebbroker-bin/helper-center/pages/mJNuJ0FsqvcOmZ50))

**Lo que no he verificado**: la posición exacta del hueco (si va tras el primer
comentario, al final, o intercalado cada N), cuántos se muestran por publicación y
si el creador puede desactivarlos. Las fuentes son notas de prensa del lanzamiento,
no documentación de producto. Prefiero decirlo antes que inventarlo.

## 2. Lo que YA tenemos para hacerlo (medido)

No hace falta inventar el sistema de anuncios: existe y ya cuenta impresiones.

**`wallet.ads`** — 7 filas, gestionada por `src/ads/ads.service.ts`:

| Columna | Para qué sirve aquí |
|---|---|
| `title`, `subtitle`, `emoji`, `color`, `image_url` | el creativo del anuncio |
| `service_key`, `target_route`, `external_url` | a dónde lleva al pulsar |
| `cities` (array) | **segmentación por ciudad** — Malabo, Bata… |
| `active`, `starts_at`, `ends_at` | vigencia de la campaña |
| **`impressions`, `clicks`** | **el seguimiento ya está hecho** |
| `discount_pct`, `sort` | oferta y orden |

**Anuncios de usuarios en grupos** (`kind='ad'` en los mensajes del chat): título,
texto, precio, foto y enlace; **solo en grupos**, con límite de **15 al día** por
usuario (`AD_DAILY_LIMIT`) y errores ya definidos (`AD_ONLY_IN_GROUPS`,
`AD_LIMIT_REACHED` → 429, `AD_TEXT_REQUIRED`). Ese es el precedente de «un anuncio
como elemento dentro de una lista».

## 3. Diseño propuesto

### Lo que NO hay que hacer

**No meter el anuncio como una fila de `lifebook.comments`.** Contaminaría los
contadores («215 comentarios» contando anuncios), la paginación por cursor, el
`read_at` de los avisos y la moderación. Es tentador porque «ya se pinta solo», y
es justo el atajo que luego hay que deshacer.

### Lo que sí

**El servidor inyecta el anuncio al leer la lista de comentarios.** Un elemento más
de la respuesta, con su propio tipo:

```json
{ "comments": [
    { "id": "…", "type": "comment", "body": "…" },
    { "type": "ad", "ad": { "id": "…", "title": "…", "subtitle": "…",
                            "emoji": "🚕", "color": "ocean", "imageUrl": "…",
                            "route": "/mobility", "label": "Publicidad" } }
] }
```

Reglas que propongo (discutibles, son de producto):

1. **Etiqueta visible «Publicidad»**, siempre. Sin excepciones ni letra pequeña: es
   lo que hace WeChat y es lo que evita que el anuncio se lea como un comentario.
2. **Nunca al autor de la publicación** (se está anunciando en su propia casa) y
   **nunca si el autor cerró los comentarios** (`allow_comments = false`): si no hay
   conversación, no hay sitio donde anunciarse.
3. **Como mucho uno por hilo**, y **solo si hay al menos 3 comentarios**: en un hilo
   de dos líneas, un anuncio ocupa el 33 % de la pantalla.
4. **No cuenta como comentario**: no suma en el total, no mueve el cursor de
   paginación. Se inyecta en la primera página y ya.
5. **Segmentación por ciudad** con `wallet.ads.cities`, que ya existe.
6. **Medición**: `impressions` al servirlo y `clicks` al pulsarlo. Las columnas ya
   están; solo hay que incrementarlas.
7. Un anuncio sin relleno (`wallet.ads` vacío para esa ciudad) **no deja hueco**: no
   se manda nada, y la lista queda igual que hoy.

### Fase 2 (dinero)

WeChat paga al creador **por exposición**. Eso exige dos cosas que hoy no existen:
registrar exposiciones **por publicación** y liquidarlas. `wallet.billing_admin_actions`
ya existe como precedente de liquidación administrativa, así que el camino está
abierto, pero es una decisión de negocio (¿se reparte con el autor? ¿solo con
cuentas verificadas? ¿desde qué umbral?) y no la tomo yo.

## 4. Por qué esto encaja con el trabajo de esta ronda

El comentario con **publicación adjunta** que acabo de implementar deja puestas tres
piezas que el anuncio necesita y que, si no existieran, habría que hacer igual:

1. **`ref` resuelto por el servidor** con `{id, type, title, preview, thumb, author}`:
   la tarjeta del anuncio usa exactamente la misma forma.
2. **Filtrado por visor**: la tarjeta del adjunto ya se resuelve mirando quién mira
   (si no puede ver la publicación, no se le manda ni el título). El anuncio necesita
   lo mismo con su segmentación.
3. **Un tipo de elemento distinto dentro de la lista de comentarios**: hoy `ref`
   convive con los comentarios normales; el anuncio solo tiene que añadir
   `type: 'ad'` a esa misma idea.

O sea: el adjunto fue tiempo bien gastado, no un desvío.

## 5. Qué hacía falta para implementarlo — HECHO Y VERIFICADO

| Paso | Dónde | Estado |
|---|---|---|
| 1 | `lifebook.service.ts` → `commentsPage`: elegir 1 anuncio de `wallet.ads` para la ciudad del visor y meterlo en la respuesta en el campo `ad` | **hecho** |
| 2 | `ads.service.ts` → `paraComentarios(city)`: elegibilidad (activo, ventana, ciudad) + rotación por impresiones | **hecho** |
| 3 | `app.module.ts`: añadir `AdsModule` a los imports (**sin esto la API no arranca**: `AdsService` solo llegaba por `BillingModule`, que no lo reexporta) | **hecho** |
| 4 | App: tarjeta con su etiqueta «PUBLICIDAD», impresión al pintarse y clic al tocarlo (los mismos endpoints que el banner del Home) | **hecho** |
| 5 | Verificación | **`pruebas/lb51s-verificar-anuncio-en-comentarios.cjs` → 22 pasan, 0 fallan** ✔ y comprobado además **en el móvil** |

### Lo que se comprobó de verdad

Con datos reales y contra la API: con 1 y con 2 comentarios **no** hay anuncio; con 3
sí; el que mira (que no es el autor) lo recibe en la primera página con su id, título,
destino y contadores; **el autor no lo ve en su propia publicación**; con los
comentarios cerrados tampoco; al paginar (con cursor) no reaparece; **no cuenta como
comentario** (`total` sigue siendo 3, no 4); es de la ciudad de quien mira; y los
contadores se mueven (+1 impresión, +1 clic).

Y en el **Poco F5**, abriendo los comentarios de un vídeo ajeno con 6 comentarios: se
ve la etiqueta **PUBLICIDAD** con «Taxi 30 % esta semana» (de Malabo, que es la ciudad
del visor) justo después de los comentarios y antes de la caja de escribir.

**Un defecto que salió de aquí y se arregló:** la impresión se contaba **dos veces**
cuando la fila de la lista se repintaba (la tarjeta se remonta y el `useRef` se
reinicia). Ahora la cuenta va en un `Set` a nivel de módulo: una impresión por anuncio
y sesión. El anunciante paga por impresión; contarla dos veces es engañarle.

### Lo que sigue pendiente de decidir (es de negocio, no técnico)

Las mismas 4 preguntas de §6: si los anuncios son nuestros o de anunciantes, si se
reparte con el autor, si el autor puede desactivarlos, y si también van en los
comentarios de los **estados 24 h** (hoy solo en publicaciones y vídeos).

## 6. Decisiones que hacen falta (de negocio, no técnicas)

1. ¿Los anuncios son **nuestros** (`wallet.ads`, promocionar taxi/comida/alquiler) o
   de **anunciantes externos** que pagan? Con `wallet.ads` se puede empezar hoy.
2. ¿Se reparte con el autor de la publicación (como WeChat) o es ingreso de la casa?
3. ¿El autor puede **desactivar** la publicidad en sus publicaciones? (WeChat parece
   que sí lo controla; no lo he podido verificar.)
4. ¿También en los **comentarios de los estados 24 h** (la capa social que acabo de
   construir) o solo en publicaciones y vídeos?
