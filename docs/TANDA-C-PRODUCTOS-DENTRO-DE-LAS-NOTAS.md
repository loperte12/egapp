# Tanda C — Productos dentro de las notas

> Estado: **servidor verificado (21/21)** y **app verificada en el teléfono** (la barra dentro
> de la nota y el selector del compositor, leídos de la pantalla). Queda pendiente el sticker
> sobre el vídeo. Fecha: 14/09/2026.
> Tercera de las tandas aprobadas (A: tarjeta de tienda — hecha · B: tab de productos — hecha ·
> **C: productos en las notas** · D: carrito y tarjeta de producto en el chat).

## 0. UN FALLO GRAVE QUE INTRODUJO ESTA TANDA (encontrado y arreglado)

El dueño avisó: *«hay un error en la pantalla»*. La app mostraba la pantalla roja de arranque:

> **«Rendered more hooks than during the previous render»** — en `PostContent`.

**Causa**: puse los hooks de los productos (`useState` + `useEffect`) **junto al texto que
pintan**, y en esa pantalla hay `return` tempranos por encima (cargando / publicación no
encontrada). En unos renderizados los hooks se ejecutaban y en otros no: React exige el mismo
orden SIEMPRE, así que la pantalla se rompía **entera** (no solo la barra de productos).

**Arreglo**: los hooks suben arriba, con los demás (línea ~198, antes del primer `return`).
Comprobado después: la app arranca normal y la nota abre bien.

**Lección para no repetirlo**: ya me pasó lo mismo en `lifebook-user.tsx` en la misma sesión.
**Todo hook nuevo va ARRIBA del componente, nunca junto al trozo de pantalla que pinta.**

## 0.bis Lo que ahora SÍ está verificado en pantalla (Poco F5)

Nota de demostración **«Mi rutina de la mañana»** (pública, 2 productos, temas `#rutina #malabo`),
leída del volcado de pantalla — **en este orden exacto**:

```
Mi rutina de la mañana                  (título)
Así empiezo el día en Malabo: …          (texto)
Producto pedidos 224163567 · 10.000 XAF  [Ver]     ← producto 1
Producto pedidos 222579699 · 10.000 XAF  [Ver]     ← producto 2
#rutina   #malabo                        (hashtags DESPUÉS de los productos)
Malabo · hace 12 min · 0 Me gusta …
```

Y el **selector del compositor**: al publicar una nota aparece «Productos en esta nota
(opcional)» y, al tocarlo, «Productos en esta nota» con el aviso *«Se verán DENTRO de la nota,
debajo del texto, en el orden en que los elijas (máximo 9). Solo puedes enganchar productos de
tu propia tienda»* y la lista de mis productos, cada uno tocable.

La colocación pedida («debajo del texto, antes de los hashtags») queda por tanto comprobada
posición a posición, no «debería».


## 1. Qué pide la especificación y qué se ha construido

| Lo pedido | Estado |
|---|---|
| Un producto **dentro** de la nota (el vínculo no existía: el compositor no tenía por dónde engancharlo) | Tabla `lifebook.post_products` + `productIds` al publicar |
| En **notas de imagen**: barra horizontal **debajo del texto y antes de los hashtags**, con miniatura, nombre, precio y botón «Ver»; se apilan si hay varios | Pintada justo entre el texto (`lifebook-post/[id].tsx:551`) y los temas (`:553`), apilada, con «Ver» |
| En **notas de vídeo**: **sticker superpuesto** abajo a la izquierda + enlace en la descripción | **HECHO Y VISTO EN PANTALLA** (14/09/2026). Sale la barra (el «enlace en la descripción») **y** el sticker sobre el reproductor: cerrado enseña miniatura, precio y «+N»; al tocarlo se abre con el nombre, el precio, «y N productos más» y **«Comprar»** |
| Varios productos por nota (la plataforma recomienda 6-9) | Máximo **9** (servidor y app). El selector lo avisa |
| Solo productos **de la tienda del autor** | El servidor lo comprueba; un producto ajeno o retirado **se ignora** (la nota no se pierde por un id malo) |

## 2. Servidor (hecho y verificado)

* **DDL**: `lifebook.post_products (post_id, product_id, position)`, con **CASCADE en los dos
  lados** (si se borra la nota o el producto, el vínculo se va con ellos) y permisos como el
  resto del esquema.
* `POST /lifebook/posts` acepta `productIds` (máx. 9, sin repetidos, solo activos del autor).
* **`GET /lifebook/posts/:id/products`** (público) → las tarjetas listas para pintar.
* **`PUT /lifebook/posts/:id/products`** (solo el autor) → cambiarlos sin reeditar la nota.

`pruebas/lb52a-verificar-productos-en-nota.cjs` → **21 comprobaciones, 0 fallos**: la nota se
publica con productos · se leen **en orden** · traen título, precio, foto y descripción corta ·
un producto **ajeno se ignora** y lo mío no se pierde · **otro no puede cambiarlos (403)** · más
de 9 → se quedan 9 · quitarlos no borra la nota · una nota sin productos se publica igual · al
borrar la nota, sus vínculos desaparecen.

## 3. App (hecha, compilada e instalada)

| Fichero | Qué se añadió |
|---|---|
| `api/lifebookProductos.ts` (**nuevo**) | `deNota`, `guardar`, `misProductos` y `publicarNota` (la misma ruta que `createNote`, con `productIds`) |
| `app/lifebook-compose.tsx` | Fila «Productos en esta nota (opcional)» + selector con selección **numerada** (el orden es el que se ve) y tope de 9; al publicar manda los ids |
| `app/lifebook-post/[id].tsx` | Los productos se piden al abrir la nota y se pintan **bajo el texto y antes de los hashtags**, con foto, nombre, precio y botón «Ver» → ficha del producto |

## 4. Cerrado el 14/09/2026: el sticker del vídeo, visto por fin (y dos fallos por el camino)

Lo único que quedaba de esta tanda era **ver el sticker en pantalla**. Se ha cerrado, y por el
camino aparecieron **dos fallos de verdad**:

### 4.1 Por qué el feed de vídeos salía VACÍO: «Para ti» estaba roto

`feedForYou` decía en su comentario «ciudad del perfil + nacional», pero el código solo filtraba
`p.city = <mi ciudad>`. La cuenta del teléfono tiene ciudad **«Acurenam»**, donde no hay ni una
publicación: «Para ti» devolvía **0 publicaciones** (medido: Malabo 774, Bata 161, Luba 2, Acurenam 0)
y el feed de vídeos salía en blanco aunque hubiera **29 vídeos públicos**. Por eso el sticker,
que estaba hecho desde la tanda C, no se había podido ver nunca: **no era el sticker, era el feed**.

Arreglado (`parche44-para-ti-nacional.py`): si mi ciudad no tiene nada público, «Para ti» sigue con lo
nacional. La decisión se toma una vez, al empezar a paginar, para que el cursor por fecha siga siendo
válido. Después: `for_you` devuelve 10 vídeos donde antes devolvía 0.

### 4.2 El sticker tapaba el nombre de la tienda

El dueño lo vio: «la tarjeta del producto no está bien posicionada, tapa el nombre de la tienda».
Era cierto y estaba **medido en contra**: el sticker iba `position: absolute` con
`bottom: insets.bottom + 130` dentro del bloque de abajo… pero ese bloque **crece hacia arriba** según
lo que lleve (título de dos líneas + chips de «Búsquedas relacionadas»), así que 130 dp fijos caían
justo encima de la fila del autor. En el Poco F5, sticker y nombre acababan los dos en **y≈1944**.

Ahora va **en el flujo, por encima del nombre**, dentro del mismo bloque anclado abajo: el nombre
está a y=1944 y el sticker (cerrado) a y=1820 — 76 px de aire, y al abrirse crece hacia ARRIBA sin
mover el texto. Medido antes/después en el mismo vídeo.

### 4.3 Y el selector de productos al publicar un VÍDEO

Faltaba: un vídeo solo podía llevar productos **por API**. Ahora el compositor de vídeo tiene la fila
«PRODUCTOS DEL VÍDEO (opcional)» y la **misma hoja** que usa el compositor de notas
(`components/lifebook/SelectorDeProductos.tsx`, extraída de `lifebook-compose.tsx` para que las dos
pantallas no puedan divergir). La publicación del vídeo va por `api/lifebookProductos.ts`
(`publicarVideo`) porque el `createVideo` de `api/lifebook.ts` no admite `productIds` — y ese fichero
no se toca.

**Verificado de punta a punta en el teléfono**: se eligió un vídeo de 38 s (18 MB) de la galería, se
marcaron **2 productos** («Listo (2)», con el 1 y el 2 numerados), se publicó desde la app (subida
real con progreso «100 % · 0,5 MB/s») y el vídeo salió en el feed con el **sticker del primer
producto, su precio y «+1»**, y en la ficha de la publicación con la barra de los dos productos.


## 4-bis. Lo que decía esta sección ANTES de cerrarlo (se deja como estaba, para que se vea qué faltaba)

0. **EL STICKER DEL VÍDEO: hecho en código, NO visto en pantalla.** Es lo único de esta tanda que
   quedaba así, y conviene saber por qué:
   * **Servidor: hecho y comprobado.** `createVideo` acepta `productIds` y los engancha (se
     reutiliza `linkProducts`: solo productos activos de la tienda del autor, máximo 9). Probado
     contra el API: un vídeo de prueba devuelve
     `1: Producto pedidos 224163567 | 2: Producto pedidos 222579699`.
   * **App: hecho.** El sticker se pide solo para el vídeo que se está viendo (una petición al
     cambiar de vídeo, ninguna si no lleva productos), se pinta **encima del vídeo y abajo a la
     izquierda** con la miniatura y el precio, y al tocarlo se abre con el nombre y **«Comprar»**
     (lleva a la ficha, que es donde se compra de verdad). Compila y está instalado.
   * **No se ha visto porque el feed de vídeos aparece VACÍO** con ese vídeo: «Todavía no hay
     vídeos aquí», incluso arrancando la app en frío y con el canal que el API sí lo incluye.
     Comprobado contra el API que el vídeo **sí está** en `type=video`, en `nearby&city=Malabo` y
     en `following`… pero **no en `for_you`, que devuelve 0 publicaciones** para esta cuenta.
     Dos pistas concretas para la próxima vez: (a) el feed puede estar descartando el vídeo
     porque **su archivo no existe** en el servidor (el de prueba apunta a un `mp4` que no está),
     y (b) **`for_you` vacío para esta cuenta** es raro y merece mirarse aparte.
   * Falta además el **selector de productos al publicar un VÍDEO** (`app/lifebook-media.tsx`):
     hoy un vídeo solo puede llevar productos por API.

   > **RESUELTO el 14/09/2026** (sección 4): la «pista (b)» era la buena — `for_you` filtraba por una
   > ciudad sin publicaciones— y el selector de vídeo ya existe. Lo de «el archivo no existe» no era
   > el problema: el feed descartaba **todo** por el canal, no ese vídeo en particular.

1. **El sticker sobre el vídeo no está hecho** (solo la barra, que es el «enlace en la
   descripción» de la especificación). Falta además el selector de productos en el flujo de
   **publicar vídeo** (`app/lifebook-media.tsx`), que hoy no lo tiene. → **Hecho, ver sección 4.**

2. **Corrección a lo que dije antes sobre el enlace profundo.** Escribí que
   `egrouteplan://lifebook-post/<uuid>` tenía un «defecto real de encaminamiento» porque abría
   la pantalla en «No se encontró esta publicación» sin pedir nada al servidor. **Ya no es
   así**: con el fallo de hooks arreglado, el mismo enlace **abre la nota correctamente**
   (comprobado: título, los dos productos con «Ver» y los hashtags). Es decir, **no había tal
   defecto de encaminamiento**: era el mismo fallo de hooks, que dejaba la pantalla en su
   estado de reserva. Se deja escrito para que nadie lo busque donde no está.
3. **Hallazgo aparte, sin tocar**: la app **reintentó en bucle** una imagen inexistente
   (`GET /storage/lb-images/e2e.jpg` → 404, más de 12 veces seguidas). No es de esta tanda, pero
   gasta batería.
4. **La app se quedó sin red** un rato durante la verificación (cambió su IP pública) y mostró
   «Usuario no encontrado»: no es un fallo de la tanda, pero conviene saberlo para no confundirlo
   con uno.

## 5. Cómo comprobarlo a mano (para la próxima vez)

La nota de demostración sigue publicada y es pública:
**«Mi rutina de la mañana»** (`8e7e6458-b4f1-4c2d-b380-01d2286733c4`), con 2 productos y los
temas `#rutina #malabo`. Se ve entrando al perfil de **Usuario EG Route Plan** → pestaña Notas
(o desde el feed). El camino del compositor: Life Book → publicar nota → «Productos en esta
nota (opcional)».

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL (servidor) | `/opt/mirror/app/sql/lifebook/20260214_productos_en_notas.sql` |
| Enlazar/leer/cambiar | `/opt/mirror/app/src/lifebook/lifebook.service.ts` (`linkProducts`, `postProducts`, `setPostProducts`) |
| Rutas + campo del DTO | `/opt/mirror/app/src/lifebook/lifebook.controller.ts` (`posts/:id/products`, `productIds`) |
| Código de error | `/opt/mirror/app/src/http/error.filter.ts` (`NOT_YOUR_POST` → 403) |
| API de la app | `D:\egapp\api\lifebookProductos.ts` |
| Compositor | `D:\egapp\app\lifebook-compose.tsx` |
| Barra en la nota | `D:\egapp\app\lifebook-post\[id].tsx` |
| Prueba | `D:\egapp\pruebas\lb52a-verificar-productos-en-nota.cjs` |
| Copias de seguridad | `lifebook.service.ts.bak-tanda-c-productos-20260214`, `lifebook.controller.ts.bak-…` |
