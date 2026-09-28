# UI-HOTEL-LISTADO-HANDOFF.md — Especificación de entrega

**Pantalla:** listado de hoteles (la home del módulo de alojamiento) · **29-sep-2026** · **Kai**
**Fichero del prototipo:** `docs/UI-HOTEL-LISTADO.html` · **Tokens:** `docs/design.md`

---

## 1. Qué se entrega

| Fichero | Qué es |
|---|---|
| `docs/UI-HOTEL-LISTADO.html` | el prototipo editable: 4 estados + la matriz de componentes. Cumple el protocolo `page-generate` de MasterGo (raíz única `<main>`, `data-name` en cada nodo, Flex puro, valores arbitrarios de Tailwind, FontAwesome). **Lleva comentarios de documentación: NO se envía tal cual** |
| `docs/UI-HOTEL-LISTADO-canvas.html` | **el payload que se envía al lienzo.** Derivado del anterior por `pruebas/prepara-canvas.cjs`: sin ningún comentario HTML, empieza en `<main` y acaba en `</main>`. Se regenera, no se edita a mano |
| `docs/UI-HOTEL-LISTADO-vista.html` | la misma pantalla **derivada para poder verla en un navegador** (el payload no lleva Tailwind compilado). Se regenera, no se edita a mano |
| `docs/design.md` | el sistema de diseño en tabla: color, tipografía, espaciado, radio, trazo, elevación y las reglas de contenido |
| este documento | medidas, matriz de variantes, contrato de dato por elemento y lo que falta |

**Verificado mecánicamente** (905 líneas): etiquetas balanceadas (`div` 279/279, `span` 143/143, `p` 34/34, `img` 6/6 autocerradas), **463 nodos con `data-name`**, cero clases de `margin`, cero formularios nativos, cero `table`, cero grid, cero `%`/`vw`/`vh`/`rem`/`em`/`calc` para medidas, y **todos los `<span>` y `<p>` con las cinco propiedades de texto** y los `<p>` con ancho limitado.

---

## 2. Lienzo

| Frame | `data-name` | Tamaño | Qué enseña |
|---|---|---|---|
| 1 | `frame-cargando` | 390 × 844 | 3 esqueletos |
| 2 | `frame-resultados` | 390 × **alto libre** | los 6 hoteles completos (no caben en 844: la tarjeta mide 358 × ~321 px) |
| 3 | `frame-vacio` | 390 × 844 | `EmptyState` |
| 4 | `frame-error` | 390 × 844 | `ErrorState` |
| — | `matriz` | ancho completo | los diez componentes con sus variantes |

El artboard completo mide **1720 px** de ancho (4 × 390 + 3 gaps de 32 + 2 padding de 32).

---

## 3. Medidas exactas del layout

| Qué | Valor | De dónde sale |
|---|---|---|
| Ancho de pantalla | 390 | referencia |
| Padding lateral | **16** | pedido + token `espaciado.e16` |
| Ancho de tarjeta | **358** | 390 − 16 − 16 |
| Foto de la tarjeta | **358 × 201** | **16:9 exacto** (358 ÷ 16 × 9 = 201,4) |
| Alto de la tarjeta | ~321 | 201 + cuerpo 120 |
| Gap entre tarjetas | **12** | pedido + token `espaciado.e12` |
| Radio de tarjeta y foto | **12** | pedido; token `radios.md` |
| Radio de chip / píldora | **10** / **8** | tokens `radios.chip` / `radios.sm` |
| Padding interno de la tarjeta | **12** | token `espaciado.e12` |
| Gap entre bloques de la tarjeta | **8** | token `espaciado.e8` |
| Alto del buscador | **44** | token `altura.punto` |
| Alto del chip | **36** | 36 |
| Ancho del chip | **auto** (lo manda el contenido), `shrink-0` | nunca se comprime ni pliega |
| Fila de chips | 358 útiles · **recorta en el filo** | los 3 chips suman ~383 px > 358 |
| Alto del botón de la tarjeta | **44** | token `altura.punto` |
| Botón primario de estado (vacío/error) | **46** | token `altura.control` |
| Favorito | **36 × 36**, radio 999 | superpuesto, `absolute top-[10px] right-[10px]` |
| Tramo de la TopBar | **56 + 44** | dos filas: ubicación/acciones y buscador |
| Borde de tarjeta y de chip | **1** | token `trazo.fino` |
| Sombra de tarjeta | **ninguna** | en oscuro, `card` sobre `background` ya se separa |

**Una divergencia deliberada respecto a tu enunciado:** pediste **una** barra superior con ubicación,
buscador, mapa, campana y perfil. «Malabo, Guinea Ecuatorial» mide ~190 px a 15 px; en una sola fila el
buscador se queda en menos de 90 px. Va **en dos filas** dentro de la misma TopBar, y en el lienzo está
dibujado así con su nota al lado.

**Los chips deslizan, no se pliegan.** La fila tiene 358 px útiles (`self-stretch` + `px-[16px]`) y los
tres chips suman ~383, así que el tercero queda **cortado por el filo del frame**: ese corte *es* el
gesto que dice «aquí hay más, desliza». Para que pase eso y no otra cosa hacen falta las dos piezas, y
las dos están puestas: `shrink-0` en cada chip —sin él Flex los comprime y la etiqueta se parte en dos
líneas **dentro** de su propia píldora, que es el defecto que se vio al medir— y `overflow-hidden` en la
fila, sin el cual el tercer chip se pinta fuera del móvil. El protocolo dice que un `<span>` es
auto-ancho y no pliega; el lienzo lo cumple, un navegador no.

---

## 4. Componentes y variantes

Todos existen en el HTML como bloque con `data-name`, y la matriz del lienzo los dibuja uno por fila.

| Componente | Variantes dibujadas |
|---|---|
| `TopBar` | completo + la nota de por qué dos filas |
| `SearchField` | vacío con placeholder · con valor (borrable) · enfocado · loading |
| `FilterChip` | default · pressed · **activo** (filtro puesto, con ✕) · disabled · loading |
| `HotelCard` | normal · **con promoción** · **sin nota publicada** · **sin disponibilidad** (apagada) · sin sello de verificado · con favorito guardado |
| `RatingBadge` | con nota · sin nota (`ratingPublished false`) · apagado · etiqueta de promoción · sin disponibilidad |
| `PriceTag` | normal · con promoción (precio tachado) · sin disponibilidad · loading (esqueleto) |
| `FavoriteButton` | default · pressed · guardado · disabled · loading |
| `EmptyState` | completo en el frame 3 + versión mini en la matriz |
| `ErrorState` | completo en el frame 4 + versión mini en la matriz |
| `SkeletonCard` | aislado en la matriz + 3 en el frame 1 |

---

## 5. Contrato de dato: qué alimenta cada elemento

**Columna de la derecha = lo que el servidor manda de verdad, medido** (`pruebas/_p2-search.json`,
`pruebas/_p2-ficha.json` y el contrato `docs/UI-HOTEL-CONTRATO-CAMPOS.md`).

| Elemento en pantalla | Campo real | ¿Llega en la lista? |
|---|---|---|
| Ubicación de la TopBar | parámetro `city` de la búsqueda | ✅ (lo elige el usuario) |
| Texto del buscador | parámetro `city` | ✅ |
| Foto de la tarjeta | `hotel.coverUrl`, y si falta, la 1.ª de `rooms[0].images[].url` | ✅ |
| Nombre | `hotel.name` | ✅ |
| Sello de verificado | `hotel.isVerified` / `verificationLevel` | ✅ |
| Barrio · ciudad | `hotel.barrio` · `hotel.city` | ✅ |
| Distancia | calculada en el cliente desde `hotel.lat` / `hotel.lng` | ✅ (es un cálculo, no un campo) |
| Píldora de nota | `hotel.rating` + `hotel.ratingCount`, **solo si `hotel.ratingPublished`** | ✅ |
| Píldoras de servicio | `rooms[].amenities` (`wifi`, `desayuno`, `aire`, `nevera`, `agua_caliente`…) | ✅ |
| Importe «desde» | `fromPricePerNightXaf` | ✅ |
| Impuestos | `rooms[].taxesXaf` de la habitación más barata | ✅ |
| «Sin disponibilidad» | `soldOut` | ✅ |
| Nº de tipos / huecos libres | `rooms.length` y `rooms[].freeUnits` | ✅ (pero `freeUnits` llega `null` **fuera** de la búsqueda con fechas) |

**Conclusión: el 100 % de lo que se ve en las tarjetas está sostenido por un campo que existe.** No hay
ningún hueco rellenado con un dato inventado.

---

## 6. Lo que hoy NO se puede pintar — y qué costaría

Esto es la parte que evita que el diseño prometa lo que el backend no da.

| Pieza pedida | Estado real | Coste |
|---|---|---|
| **Estrellas en la tarjeta** | `stars` existe, pero **solo en la ficha** (`HotelProfile`). **En la lista no llega** | 1 campo en la respuesta de `/hotels` |
| **Chip de Estrellas** | igual: no hay parámetro de filtro | 1 campo + 1 filtro |
| **Chip de Servicios** | el servidor **acepta `amenities` y lo ignora** (medido) | filtro real en backend |
| **Chip de Promociones** | **no existe ningún campo de promoción** | modelo + reglas de precio |
| **Chip de Orden** | **no existe `sort`**: `searchHotels` solo acepta `city`, `checkIn`, `checkOut`, `guests`, `units`, `minPrice`, `maxPrice`, `page`, `limit` | parámetro de orden |

**Decisión tomada:** se dibujan **solo los 3 chips con dato detrás** — `Precio` (`minPrice`/`maxPrice`),
`Distancia` y `Orden`, los dos últimos **ordenados en el cliente** sobre la página ya recibida. La
variante `disabled` del chip está dibujada igualmente en la matriz, con `Estrellas` dentro, para que el
día que el backend lo dé solo haya que quitar el `disabled`. **Nada de la pantalla miente.**

**Y una nota sobre el filtro de distancia:** ordenar en el cliente solo ordena **la página recibida**
(hoy `limit` 20). Es correcto para la primera página y engañoso a partir de la segunda. Si se quiere
«los 10 más cercanos de toda la ciudad», es backend.

---

## 7. Interacciones del prototipo

| Gesto | Qué pasa | A dónde va |
|---|---|---|
| **Tap en la tarjeta** (cualquier zona, salvo el corazón) | abre la ficha del alojamiento | `/lifebook-hotel-detalle?id=<shopId>` |
| **Tap en un chip** | abre la **hoja inferior** de opciones de ese filtro | hoja sobre la pantalla (`sheet #2E3338`) |
| **Tap en el corazón** | alterna el estado del botón, en el sitio, sin navegar | persiste en «guardados» |
| **Tap en «Ver habitaciones»** | entra a la elección de habitaciones | `/lifebook-hotel-detalle` (pestaña `Habitaciones`) |
| Tap en «Limpiar filtros» | deja la consulta en `city` + fechas | recarga |
| Tap en «Reintentar» | repite la última consulta | mismo estado |

**Un aviso de implementación:** el corazón está **dentro** del área tocable de la tarjeta. Hay que
cortar la propagación, o cada «me gusta» abre además la ficha.

---

## 8. Cómo subirlo a MasterGo

El lienzo **ya está conectado** (fichero `新文件`, `documentId 205808662226877`) y **la pantalla ya está
dentro**, como nodo **`3:166` «Hotel-Listado-390»**. Para reenviarla o regenerarla:

1. Abrir el fichero de destino en el cliente de MasterGo y comprobar **en el propio cliente** que el
   estado es «MCP 服务端启动并已连接». **Verlo en el navegador interno del agente no basta.**
2. `design_page` (obligatorio antes de cualquier envío; crea o reutiliza el nodo ancla).
3. `node pruebas/prepara-canvas.cjs` → genera el payload limpio `docs/UI-HOTEL-LISTADO-canvas.html`.
4. Enviar **ese** fichero con `submit_page_to_canvas` (`filePath`), no el fuente.

> ### ⚠️ La trampa que costó tres entregas fantasma
> **MasterGo NO ignora los comentarios HTML: los transcribe como capas de texto.** El payload empezaba
> por el comentario de documentación de cabecera, y lo que aterrizó en el lienzo fue **ese comentario
> pintado como texto** —hasta el `-->` final como carácter visible—, con el `<main>` sin pintarse nunca.
> Por eso `UI-HOTEL-LISTADO.html` **no se envía nunca tal cual**: lleva 22 comentarios, y cada uno sería
> una capa de basura.
>
> El error se disfrazó tres veces de éxito: las tres respuestas dijeron «✅ 设计稿生成已成功完成». La
> señal de que el envío está **aceptado de verdad** es otra: **`状态: accepted`** («画布仍在后台处理中»).
> Y la prueba definitiva es leer el nodo: el bueno se llama como el `data-name` del `<main>`.

Lo que **no** se ha hecho todavía: guardar los colores y los textos como **variables de MasterGo**
(`agent_update_variables`) y convertir los diez componentes en **componentes con variantes**
(`agent_create_component`). El HTML ya está preparado para ello: cada variante está aislada en su bloque
con nombre propio.

### Cómo se ha medido el render (sin lienzo)

El prototipo se ha revisado **en el píxel**, no a ojo. Tres herramientas nuevas en `pruebas/`, las tres
desde la raíz del repo:

| Comando | Qué hace |
|---|---|
| `node pruebas/prepara-vista-listado.cjs` | deriva `docs/UI-HOTEL-LISTADO-vista.html` (documento completo, con Tailwind y FontAwesome por CDN). **Comprueba que la vista conserva los mismos 463 nodos con `data-name`** que la fuente, y sustituye las imágenes `{{clave}}` por marcadores grises: en un navegador esas imágenes salen rotas y la revisión acaba mirando el iconito en vez del layout |
| `node pruebas/recorta-frame.cjs <frame>` | saca **un** frame de la vista a un fichero temporal. Hace falta porque Chrome headless fotografía **siempre desde el origen de la página**: no existe bandera para capturar «a partir de y=1400» |
| `node pruebas/captura-vista.cjs <archivo> <ancho> <alto> <salida.png> [factor]` | captura con las banderas correctas y luego **lee el tamaño real de la cabecera del PNG** |

**Trampa ya pagada:** en esta máquina Chrome headless saca las capturas a **2×** (la pantalla es HiDPI),
así que una ventana de 880×1000 produce un PNG de 1760×2000. Un fichero así rotulado «1:1» está midiendo
el doble. Por eso `captura-vista.cjs` fuerza el factor de escala **y verifica contra el PNG**, no contra
lo que Chrome dice que ha hecho.

La vista derivada **necesita internet** (Tailwind, FontAwesome e Inter vienen de CDN). Es una
herramienta de revisión: el entregable es `UI-HOTEL-LISTADO.html`.

---

## 9. Decisiones abiertas

1. **Formato del importe.** Tu enunciado escribe `12 500 XAF` (espacio). **La app ya usa punto**:
   `18.000 XAF`, y lo mide el `Precio` del kit. En el prototipo va **con punto**, por coherencia con el
   código desplegado. Si lo quieres con espacio, es **un cambio en el kit**, no en esta pantalla.
2. **Radio de la tarjeta.** Aquí es **12** (tu enunciado). En `components/HotelResultCard.tsx`, ya
   desplegado, es **18** (`radios.panel`). Unificar.
3. **La tarjeta nueva convive con la que ya existe.** El listado desplegado usa **fila horizontal con
   miniatura cuadrada 104×104**; esta maqueta usa **foto 16:9 arriba**. Son dos lenguajes para la misma
   lista. Hay que decidir cuál sobrevive, o la app tendrá dos tarjetas de hotel distintas.
4. **Estrellas en la tarjeta.** Fuera por falta de dato (§6). Si las quieres, es pedir un campo.
