# Tanda K — «Elegir antes de comprar» (tallas, colores y todo lo demás)

> Estado: **servidor hecho y verificado (54/54 contra la API real)** · **app hecha y compilada**,
> pendiente de la comprobación en pantalla (se dice abajo lo que queda sin verificar). Fecha: 14/09/2026.

---

## 1. La investigación, antes de escribir nada

Se lanzó una investigación con búsquedas en español, inglés y chino y **descarga del HTML real** de
cada fuente. Lo que cambió el diseño:

| Pregunta | Lo que dicen las fuentes | Qué se hizo |
|---|---|---|
| ¿Un solo panel para «añadir al carrito» y «comprar»? | NutUI (UI oficial de JD) y Vant (Youzan) usan **un solo** selector: `btn-options: ['confirm','buy','cart']` y los eventos `buy-clicked` + `add-cart`. [NutUI `sku/doc.md`](https://github.com/jdf2e/nutui/blob/next/src/packages/__VUE/sku/doc.md) · [Vant Sku](https://www.w3cschool.cn/vantv1/vant-v1-sku.html) | Un único selector con «Al carrito» y «Comprar ahora» |
| ¿Cuántas fotos por color? | En Vant **solo el primer grupo de especificación admite imagen** (`imgUrl`); Adobe Commerce: «swatches are **synchronized to display the corresponding product image** when the swatch is selected». [Vant](https://www.w3cschool.cn/vantv1/vant-v1-sku.html) · [Adobe Commerce (merchdocs)](https://github.com/magento/merchdocs/blob/master/src/catalog/swatches.md) | La foto cambia al elegir color, y se exige foto real **por valor de color en cualquier posición** (no solo en el primer eje, como Vant) |
| ¿Se ve la miniatura equivocada? | Baymard (tests de usabilidad): el **54 %** de los sitios no cambia la miniatura a la variante buscada —«absolutely vital»— y el **57 %** no enseña todos los swatches en móvil. [Baymard 1](https://baymard.com/blog/color-and-variation-searches) · [Baymard 2](https://baymard.com/blog/mobile-interactive-color-swatches) | La miniatura, el resumen y el carrito cambian siempre |
| ¿Y si la combinación está agotada? | Dos patrones de Taobao conviven: **grisar** la especificación (`规格置灰不可选`) y cambiar el botón por «缺货中，提醒掌柜补货» (avisar para reponer). [Diseño de Taobao en UISDC](https://www.uisdc.com/hunter/0221368482.html) · [Algoritmo de grisado bidireccional](https://blog.csdn.net/2a4s6d8f0g/article/details/152493852) · [YH-UI SKU Selector](https://1079161148.github.io/yh-ui/components/sku-selector.html) (grisa solo cuando el stock de la combinación es 0) | Valores sin combinación en gris; y con la combinación agotada, en vez de dos botones apagados, **«Avísame cuando llegue» para ESA combinación** |
| ¿Se enseña en algún sitio lo que llevas elegido? | El mismo componente documenta `show-selected-summary`, que muestra arriba el resumen de lo seleccionado, y los modos de valor «texto / imagen / color». [YH-UI](https://1079161148.github.io/yh-ui/components/sku-selector.html) | El resumen «Color: Rojo · Talla: M» en la cabecera del selector y en la ficha |
| ¿Cómo se modelan las tallas? | Google Merchant Center: `size`, `size_system` (AU, BR, CN, DE, EU, FR, IT, JP, MEX, UK, US) y `size_type` (regular/petite/plus/tall/big/maternity). Amazon SP-API separa calzado (sistema, grupo de edad, género, clase, **ancho**) de prendas (prefijo por tipo: `Shirt Size` vs `Bottoms Size`). [Merchant Center](https://support.google.com/merchants/answer/6324492) · [Amazon SP-API](https://developer-docs.amazon.com/sp-api/docs/listings-items-guidance-for-complex-attributes) | Tabla por **sexo** y **tipo de prenda**, con medidas distintas (calzado pide largo y ancho del pie; arriba, pecho; abajo, cintura y cadera) |
| ¿Los valores «típicos» de una tabla? | Uniqlo separa *Body Measurement* de *Clothing Guide*, avisa de ±1–2 cm y mide «width, not circumference». [Uniqlo](https://faq-id.uniqlo.com/pkb_Home_UQ_ID?id=kA0Ie000000TP0n) | Botón «Rellenar tallas típicas» **marcado como orientativo** y editable |
| ¿Y los hoteles? | Booking.com: *tipo de habitación × plan tarifario (precio, cancelación, comidas) × ocupación (huéspedes, adultos/niños/infantiles)*. Trip.com y Ctrip resuelven el tipo de habitación **en una lista dentro de la ficha**, con fechas y ocupación como contexto. [Booking Partners](https://partner.booking.com/en-gb/help/rates-availability/rates-special-offers/understanding-and-setting-new-rate-plan) · [Trips/Ctrip: flujo 全部房型](https://ucdchina.com/snap/11122) | El alojamiento **no** usa este selector: sigue por fechas y huéspedes en la ficha del hotel |
| ¿Tamaño de los toques? | Apple 44×44 pt + 12/24 pt de margen; Google 48×48 dp con 8 dp de separación (≈9 mm); WCAG 2.5.5 pide 44 px CSS. [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) | Chips y botones del selector con **44 dp mínimo** |

**Lo que NO se pudo verificar** (de la investigación, dicho tal cual): no existe ningún dato creíble
de conversión o devoluciones por usar miniatura de foto en vez de cuadradito de color (solo blogs de
plugins de Shopify/WooCommerce, sin metodología; lo sólido es la evidencia de *usabilidad* de
Baymard); ninguna fuente oficial fija a partir de cuántos valores conviene pasar de chips a rejilla
o ruleta (solo orientación cualitativa de Apple y NN/g); las fichas de tallas de **hombre** con
manga y entrepierna no se pudieron leer (los sitios probados fallaron por HTTP 403/500/timeout), así
que la lista de medidas que se ofrece es la de Uniqlo (cuello, hombro, pecho, cintura, manga centro
espalda) más lo que pide Amazon por tipo de prenda; y **el selector de SKU concreto de Xiaohongshu,
Douyin y Pinduoduo no se pudo leer** (sus documentos oficiales se sirven con JavaScript o están
cerrados), así que el patrón que sigue esta tanda se apoya en el componente de **JD (NutUI)**, el de
**Youzan (Vant)** y el artículo del **equipo de diseño de Taobao** — no en una captura de la app de
Xiaohongshu.

---

## 2. Lo que se encontró en la base (y que cambió el plan)

Antes de tocar nada se miró el esquema real:

| Comprobación | Resultado |
|---|---|
| `product_variants.image_url`, `sku`, `weight_g`, `attributes jsonb` | **Ya existían**… y el API **ya los devolvía** |
| Variantes que usaban algo de eso | **0 de 25**: todas se llamaban «Talla 42», sin foto, con `attributes = {}` |
| Columnas con las que comparar una talla | **0** (lo de la tanda J: tablas de tallas creadas desde cero) |
| Tope de combinaciones | `VARIANTS_MAX = 20` (4 colores × 6 tallas = 24 no cabía) |

O sea: no faltaba dónde guardar, **faltaba la definición de los ejes**. Sin ella la app solo podía
enseñar la palabra «Talla 42», que es justo lo que el dueño rechazó. Por eso la tanda empieza por
los datos.

---

## 3. Lo que ya funciona (DDL 016 + API)

### A. Los ejes y sus valores

* `product_option_groups`: los ejes del producto («Color», «Talla», «Almacenamiento», «Formato»,
  «Tono», «Medida»…) con su tipo (`color` · `size` · `text`) y su orden. Máximo **3 ejes**.
* `product_option_values`: los valores de cada eje. En un eje de color, **cada valor lleva su FOTO**
  (`image_url`), y el servidor **no admite** un color sin foto ni una foto que no sea una de las
  fotos de ese producto.
* La combinación vive en la variante que ya existía: `product_variants.attributes` guarda
  `{"color":"Rojo","talla":"M"}` y su precio y su stock son los de ESA combinación.
* `categories.default_options`: los ejes **sugeridos por categoría** (ropa → Talla + Color; calzado →
  tallas de zapato; teléfonos → almacenamiento + color; comida → formato; coches → combustible…).
  **34 categorías** sembradas.

### B. Rutas

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET products/:id/options` | público | Los ejes con la foto de cada color y las combinaciones |
| `PUT products/:id/options` | el dueño | Guarda ejes y combinaciones **sin devolver la publicación a revisión** |
| `PUT products/:id/size-chart` · `GET` | dueño · público | Las tablas de tallas (tanda J) |
| `POST products/:id/size-suggestion` | con sesión | La recomendación de talla contra la tabla del producto |

### C. La foto del color viaja con la combinación

Al guardar las combinaciones, la foto del color se copia a la variante (`fotoDeCombinacion`), y el
**carrito prefiere esa foto** sobre la genérica. Así, quien compró la «Rojo · M» ve la prenda roja
en el carrito y en el pedido, sin cruzar tablas en cada lectura.

### D. Las combinaciones no se recrean

Corregir el precio de una talla **actualiza su fila** (misma combinación = misma fila) en lugar de
borrar y volver a crear todas: a nadie se le vacía el carrito por cambiar un precio. Y el estado del
producto no se toca (antes, el único camino para cambiar un precio devolvía la publicación a la cola
de moderación).

---

## 4. Verificación del servidor: `pruebas/lb60a-verificar-opciones.cjs` → **54 PASA · 0 FALLA**

```
1. EL COMERCIANTE CONFIGURA LOS EJES AL PUBLICAR   2 ejes (Talla + Color), 4 combinaciones, cada
                                                   color con SU foto real (dos fotos distintas)
2. SE LEE EN PÚBLICO                               sin sesión; la ficha trae ejes y combinaciones
3. LO QUE NO TIENE SENTIDO SE RECHAZA (400)        color sin foto · foto que no es del producto ·
                                                   foto de fuera · eje sin valores · 4 ejes ·
                                                   código repetido · tipo inventado · valor repetido
                                                   Y tras los fallos, lo bueno sigue intacto
4. UNA COMBINACIÓN QUE NO ENCAJA NO SE GUARDA      sin color · color inexistente · talla fantasma ·
                                                   combinación repetida · ejes sin combinaciones
5. CORREGIR UN PRECIO NO DEVUELVE A REVISIÓN       el estado no cambia y la combinación CONSERVA su id
6. EL CARRITO GUARDA LA COMBINACIÓN ELEGIDA        «Rojo · M», su precio y la foto del color
7. NADIE TOCA LO DE OTRO                           otra tienda → 404
8. EL ALOJAMIENTO SIGUE FUERA DE ESTE CAMINO       publicar una habitación por aquí → 409
                                                   (SERVICE_NOT_ORDERABLE: se da de alta en el panel)
```

---

## 5. La app

### Comerciante (antes de publicar, en el paso «Opciones»)

* **Ejes sugeridos por la categoría** en chips: se añaden de un toque (`+ Talla`, `+ Color`).
* Cada color **se elige con su foto**: se toca el hueco del color y se escoge entre las fotos que el
  comerciante ya subió. Si falta una foto, lo dice en rojo y **no deja publicar**.
* Cada eje de talla declara **qué parte de la prenda mide** (arriba · abajo · vestido · calzado ·
  accesorio) para que el asistente sepa con qué tabla comparar.
* **«Generar combinaciones»** hace el producto cartesiano y **conserva** los precios y el stock ya
  escritos; el comerciante solo rellena precio y stock de cada combinación.
* **Editor de tablas de tallas** dentro del publicador: por sexo (mujer · hombre · unisex) y tipo, con
  rangos mín–máx y solo las medidas que esa prenda usa (arriba → pecho; abajo → cintura y cadera;
  calzado → largo y ancho del pie). Botones «Rellenar tallas típicas» (orientativo) y «Empezar vacía».
* Al editar una publicación se cargan sus ejes y sus tablas.

### Comprador

* **«Comprar» y «Añadir al carrito» ya no compran directo**: los dos abren el selector.
* El selector enseña **la foto real del color elegido**, el precio y el stock de ESA combinación, los
  ejes con sus valores (los colores como miniaturas con foto, las tallas como chips), la cantidad con
  su tope real, y las dos salidas («Al carrito» / «Comprar ahora»).
* Una combinación que **no existe** sale apagada y tachada (no se puede tocar). Una que **existe pero
  está agotada** se puede tocar y lleva su etiqueta «agotado»: al elegirla, en vez de dos botones
  apagados aparece **«🔔 Avísame cuando llegue» de ESA combinación** (el servidor ya apunta la espera
  por variante desde la tanda G). Son dos cosas distintas y al principio las tenía mezcladas: si se
  apaga todo lo agotado, el comprador **nunca puede llegar** a pedir el aviso.
* La ficha enseña una fila con **lo que vas a comprar** (con la miniatura del color) y «Elegir/Cambiar».
* **Nada se elige por el comprador**: al cargar la ficha ya no se marca la primera opción (eso es lo
  que hacía que se comprara «la talla 42» sin querer). Solo se marca sola si el producto tiene una
  única combinación, porque entonces no hay nada que decidir.

### Alojamiento

No pasa por el selector: su botón sigue llevando a la ficha del hotel, que es donde se eligen fechas
y huéspedes y donde el servidor comprueba inventario, estancia mínima y capacidad. Verificado en la
API (409 al intentar publicar una habitación por el camino de productos).

---

## 6. Qué se comprobó EN PANTALLA (Poco F5) y qué NO

**Sí, visto en el teléfono** (APK instalado, cuenta ADMIN, producto de prueba de la tienda A):

| Comprobación | Resultado |
|---|---|
| Pulsar «Comprar» en la ficha abre el **selector** (ya no compra directo) | Sí: «12.000 XAF · Talla: S · 20 disponibles», chips de talla y fichas de color |
| Una **combinación agotada** sale apagada y no se puede tocar | Sí: «Color Azul (agotado)» con la talla S elegida; al elegir Azul, «Talla S (agotado)» |
| Una **combinación agotada** se distingue de una que no existe | Sí: «Talla L» y «Color Rojo» salen con su etiqueta roja «agotado» y **se pueden tocar**; con otra selección, el valor imposible sale apagado y tachado |
| Con la combinación agotada, el botón pasa a **«🔔 Avísame cuando llegue»** (de ESA combinación) | Sí: «Talla: L · Color: Rojo · Esa combinación está agotada» → botón «🔔 Avísame cuando llegue» (antes eran dos botones apagados) |
| El precio y el stock son **los de la combinación elegida** | Sí: al elegir «Azul · M» pasa a 13.500 XAF y «4 disponibles» |
| **Nada se elige por el comprador** | Sí: al abrir, «Elige lo que quieres» y «Elige Talla y Color para continuar» |
| Pide lo que falta en vez de adivinar | Sí: «Elige Color para continuar» |
| Los dos botones, dentro del selector | Sí: «Al carrito» y «Comprar ahora» |
| **Los colores enseñan la FOTO REAL** (no un cuadradito) | Sí, medido por píxeles: las dos fichas son dos fotos distintas y con detalle (media RGB 96,102,112 con luminancia 19–255 frente a 24,24,27 con 13–122), no un color plano |
| El **carrito** guarda la combinación con su precio | Sí: dos líneas del mismo producto, «Rojo · S» 12.000 XAF y «Azul · M» 13.500 XAF, con «Cambiar la opción» |
| La ficha enseña **lo que vas a comprar** con la miniatura del color | Sí: «Talla: M · Color: Azul · Lo que vas a comprar · Cambiar» |
| Comerciante: la categoría se elige en **dos niveles** (rama y subcategoría) | Sí: «1 · ¿De qué es?» con las ramas (Abacería, Ropa mujer, Ropa y calzado, Teléfonos…) |
| Comerciante: los ejes sugeridos por la categoría se añaden de un toque | Sí: chip «+ Formato» → eje «Formato» con sus 5 valores en chips quitables |
| Comerciante: eje propio con su **tipo** (Color · Talla · Otro) | Sí: se añadió «Color» y sale «Color · cada uno con su foto · 1 valor» |
| Comerciante: un color **sin foto no vale** | Sí: la ficha del valor sale «FALTA FOTO» en rojo con el aviso «Toca la foto de cada color y elige la foto REAL…» |
| Comerciante: la foto del color se elige **entre las fotos del producto** | Sí: se abrió «Foto real del color», se eligió la foto subida y el «FALTA FOTO» desapareció |
| Comerciante: las combinaciones se cuentan desde los ejes | Sí: «Combinaciones (5)» con «Generar combinaciones» |

**NO verificado en pantalla** (se dice tal cual):

* La tabla de combinaciones generada con sus campos de precio y stock (se vio el contador y el botón,
  **no** las filas rellenas).
* El **editor de tablas de tallas** dentro del publicador (está construido y compila; lo que sí está
  verificado es el API de las tablas: 41/41 en la tanda J y 54/54 aquí).
* Publicar el producto **desde el teléfono** hasta el final: la verificación de que los ejes llegan
  al servidor al publicar está hecha por API (`lb60a`, 54/54), no desde la pantalla.
* El precio de la ficha reflejando la combinación: se arregló al verlo (antes ponía 12.000 mientras
  el selector decía 13.500) y el arreglo está compilado e instalado, pero **no se volvió a mirar en
  pantalla** después del arreglo.
* El vídeo dentro del carrusel (sigue pendiente, punto 3 de abajo).
* El **aviso de reposición por combinación** se comprobó hasta que el botón aparece y llama al
  servidor; **no** se comprobó que el mensaje de aviso llegue al chat al reponer esa combinación
  (eso ya se verificó para el producto entero en la tanda G).

**Datos de prueba que quedan** (para poder mirarlo en el móvil):
«Camiseta de prueba (tallas y colores)» en la tienda de `+240222000123` (2 colores con foto real,
3 tallas, 6 combinaciones, stock distinto en cada una) y su nota en Acurenam. El carrito de la cuenta
del móvil tiene dos líneas de ese producto («Rojo · S» y «Azul · M»).

---

## 7. Lo que FALTA (y en qué orden)

1. **El asistente de talla dentro del selector** («¿No sabes tu talla?» → ruletas de medidas →
   recomendación con su razón y su nivel de ajuste → «Usar esta talla»). El servidor ya lo calcula
   (`POST products/:id/size-suggestion`) y las tablas ya se pueden configurar; falta la pantalla.
2. **La persistencia de las medidas** en la app («Usar mis últimas medidas: 168 cm / 60 kg / pecho 94»)
   y poder borrarlas desde ajustes. El servidor ya lo guarda.
3. **El vídeo dentro del carrusel de la ficha** (primera posición con ▶ y contado en el indicador):
   hoy los vídeos siguen filtrándose fuera. El indicador «1/5» ya existe.
4. **El color elegido en el carrito**: hoy el carrito enseña la combinación («Rojo · M») y su foto,
   pero cambiar de combinación desde el carrito sigue usando la lista de nombres, sin fotos.

## 8. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `backend/sql/016_opciones_del_producto.sql` (copia en `/opt/mirror/app/sql/lifebook/20260214_opciones_del_producto.sql`) |
| Servidor | `commerce.service.ts` (`prepararOpciones`, `validarCombinaciones`, `escribirOpciones`, `escribirCombinaciones`, `options`, `setOptions`, `fotoDeCombinacion`, `variantesShape`) · `commerce.controller.ts` (2 rutas) · `error.filter.ts` (13 códigos) |
| Parches | `parche62-opciones.py` · `parche63-opciones-rutas.py` · `parche64-combinaciones.py` · `parche65-foto-del-color.py` · `parche66-orden-ejes.py` · `parche67-categorias-ejes.py` |
| Prueba | `pruebas/lb60a-verificar-opciones.cjs` (54 comprobaciones) · `pruebas/red.cjs` (salida por el proxy del equipo) |
| App comerciante | `components/lifebook/publish/OptionGroupsEditor.tsx` · `SizeChartEditor.tsx` · `publish/StepExtras.tsx` · `state/commercePublish.ts` · `app/lifebook-sell.tsx` |
| App comprador | `components/lifebook/SelectorDeVariante.tsx` · `app/lifebook-product/[id].tsx` |
| API del cliente | `api/commerce.ts` (tipos `LbOptionGroup`, `LbOptionValue`, `LbOptionSuggestion`, `LbSizeChart`…, `commerceApi.options/setOptions/sizeChart/setSizeChart` y `tallasApi`) |

## 9. Errores por el camino (y cómo se resolvieron)

* **`TS2448: ejesParaFoto used before its declaration`**: al insertar el bloque de los ejes después
  del bucle de variantes, el bucle ya lo usaba. Con `tsc` emitiendo igualmente, el `dist` quedó con un
  `ReferenceError` latente que **habría roto publicar un producto con variantes**. Detectado y
  arreglado en el mismo turno (parche 66) moviendo el bloque arriba; desde entonces se revisa con
  `--noEmit` **antes** de emitir.
* **Parche que no arrancaba**: un `"` donde iba `'` en el mensaje de error de un parche (Python ni lo
  ejecutaba, y el helper de SSH se traga el `stderr`) → los parches nuevos se lanzan con `2>&1`.
* **Los valores sugeridos de la categoría llegan como texto** (`["XS","S"]`) y el editor leía
  `v.value`: habría publicado la palabra «undefined» como talla. Normalizado en la app.
* **La salida a internet de este equipo** va por un proxy local y el `fetch` de Node no lo usa: las
  pruebas fallaban con `UND_ERR_CONNECT_TIMEOUT` y parecía el servidor caído. `pruebas/red.cjs` lo
  detecta y lo usa solo si está.
* **La categoría no se podía elegir**: el asistente pintaba las hijas de **la primera rama** del tipo,
  así que en un producto físico solo salían las de «Abacería» (Arroz y granos, Aceite…) y «Ropa
  mujer», «Calzado» o «Teléfonos» eran **inalcanzables** —visto en el Poco F5—. Como los ejes
  sugeridos salen de la categoría, sin arreglar esto el comerciante de ropa no veía «Talla» ni
  «Color». Ahora se elige rama y luego subcategoría (`raizYCategoria` en `PublishParts.tsx`).
* **Una nota sin foto no sale en el feed**: `CreateNoteDto.media` son **cadenas en base64** y
  mandando `[{url, type}]` la nota se creaba con `media_ids = []` y no aparecía en el móvil (por eso
  la primera nota de prueba «no existía» en pantalla). La segunda se publicó con la foto en base64 y
  salió a la primera.
* **La búsqueda de Life Book es por ciudad**: el producto de prueba estaba en Malabo y el móvil en
  Acurenam, así que no aparecía; se pasó a Acurenam para poder abrirlo (el producto de verdad no
  tiene ese problema: se publica en la ciudad del comerciante).
