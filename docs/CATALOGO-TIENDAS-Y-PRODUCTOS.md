# Catálogo «Tiendas y servicios» — tarjetas, chips y buscador

> Estado: **arreglado y medido en el Poco F5**. Fecha: 14/09/2026.
> Lo dijo el dueño: *«las tarjetas que se ubican en Tiendas y Productos… el motor de búsqueda no
> está bien hecho y los chips de Todo, Producto… tampoco están diseñados… cada vez tienes que
> diseñar tan grandes las tarjetas, se ve mal, horrible»*. Los tres defectos eran reales y se
> midieron antes y después (volcado de pantalla + píxeles).

## 1. Los CHIPS estaban aplastados (el defecto más grave)

| | Antes | Ahora |
|---|---|---|
| Alto del chip | **17 dp** (51 px) | **32 dp** (96 px) |
| Texto («✨ Todo») | **4 px de alto**, cortado | **20 dp de alto**, entero |
| Ancho del primer chip | **26 dp** (el texto no cabía) | **84 dp** |
| Dónde empezaba la fila | x = 0 (pegado al borde) | x = 14 dp (su margen) |

**Causa**: el `ScrollView` horizontal de los chips **se encogía**. En React Native los hijos de un
contenedor en columna tienen `flexShrink: 1` por defecto, así que el listado de abajo (que sí tiene
`flex: 1`) le robaba el sitio: los chips quedaban de 17 dp y el texto se cortaba. Además, el primer
chip no tenía ancho mínimo y se quedaba en 26 dp.

**Arreglo**: `flexGrow: 0, flexShrink: 0` y alto mínimo en la fila; `minHeight: 32` y
`minWidth: 78` en cada chip. Se midió después: primer chip `[42,449][293,545]` (84 × 32 dp) con su
texto `[84,467][251,526]` (56 × 20 dp).

## 2. Las TARJETAS eran demasiado altas

| | Antes | Ahora |
|---|---|---|
| Alto de la celda | **253 dp** (758 px) | **208 dp** (625 px) |
| Foto | 130 dp | **108 dp** |
| Líneas de texto | 5 (título, precio, tachado, tienda+vendidos, ciudad) | **3** (título, precio con tachado en la misma línea, tienda+vendidos) |

Lo que se quitó y por qué: la línea de **ciudad** no ayuda a decidir y engordaba la tarjeta. En su
sitio va la **descripción corta** (`products.short_description`), que es lo que la especificación de
la rejilla pide y que el comerciante ya escribe al publicar. También se apretó el relleno
(8 → 7 dp) y se bajaron un punto los tamaños secundarios.

## 3. El BUSCADOR no encontraba lo que la gente busca

**Lo que estaba mal**: el servidor buscaba solo en el título, la descripción corta, la larga y las
etiquetas **del producto**. Buscar «Hotel Demo» (una tienda) o «habitación» (una categoría) no
encontraba nada, aunque el visitante sepa perfectamente lo que quiere.

**Arreglo (servidor)**: la búsqueda incluye también el **nombre de la tienda** (`s.name`) y el
**nombre de la categoría** (`c.name`), con el mismo patrón parametrizado y en minúsculas.

Medido contra el API real:

| Búsqueda | Antes | Ahora |
|---|---|---|
| «hotel» (nombre de tienda) | 0 | **20** |
| «habitaci» (categoría/producto) | 0 | **8** |
| «tienda admin» (tienda) | 0 | **20** |
| «zapatillas» / «madera» (no existe) | 0 | 0 (correcto) |

**Arreglo (pantalla)**:

* una línea que **dice qué pasa**: «Buscando «hotel»…» mientras busca y «20 resultados para
  «hotel»» al terminar; sin búsqueda, «20+ productos y servicios»;
* un **✕ para borrar** la búsqueda de un toque (antes, letra a letra);
* el campo ya no lleva el texto larguísimo «¿Qué buscas? (zapatillas, fontanero, habitación…)»,
  que ocupaba media pantalla: ahora «Busca producto, comida o servicio…» con etiqueta de
  accesibilidad propia.

## 4. Lo que NO se ha tocado (y por qué)

* **La disposición sigue siendo de 2 columnas.** Con tarjetas de 208 dp se ven dos por fila y
  algo de la siguiente; pasar a 3 columnas haría las fotos de 100 dp y el texto de 9-10 puntos,
  ilegible en un móvil. Si aun así las quieres más pequeñas, se puede bajar la foto a 90 dp.
* **El panel del comerciante** (lista de publicaciones) tiene sus propias tarjetas grandes: no se
  han tocado porque el dueño hablaba de «Tiendas y Productos» (el catálogo). Si también las
  quiere más compactas, es el mismo trabajo en otra pantalla.
* **No se ha podido ver con los ojos** (no puedo leer imágenes): todo lo de arriba está medido con
  el volcado de pantalla y con píxeles del capturador, no «a ojo».

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Pantalla del catálogo (tarjetas, chips, buscador) | `D:\egapp\app\lifebook-catalog.tsx` |
| Búsqueda por tienda y categoría | `/opt/mirror/app/src/lifebook/commerce.service.ts` (`catalog`) |
| Copia de seguridad del servicio | `commerce.service.ts.bak-buscador-20260214` |
