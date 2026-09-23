# Tanda L — «Saber tu talla» (el asistente) y el panel de opciones, según la especificación

> Estado: **app hecha, compilada e instalada**. Servidor: **nada que tocar** (el cálculo y el guardado
> de medidas ya estaban hechos y verificados en la tanda J: 41/41). Verificación en pantalla: abajo,
> separando lo medido de lo que no. Fecha: 15/09/2026.

---

## 0. L-bis — «falta lo del pie y el número de calzado; quita pecho, cintura y cadera»

Corrección del dueño sobre lo anterior, en dos partes.

### A. El calzado se pregunta por NÚMERO (y por largo de pie)

Quien compra zapatos **sabe su número**; casi nadie se mide el pie con una cinta. Ahora el asistente
para calzado tiene tres ruletas: **Número de calzado** (34–47), **Largo del pie** (cm) y **Ancho del
pie** (cm), con la equivalencia a la vista: «Talla 42 ≈ 26 cm de pie. Cada marca talla un poco
distinto: manda la tabla de esta tienda».

La equivalencia vive en **un solo sitio** (`constants/tallas.ts`) y la usan los dos lados: el
comerciante al rellenar sus tallas típicas y el comprador al dar su número. Si cada lado tuviera su
tabla, el 42 podría valer 26 cm en un sitio y 27 en otro y la recomendación saldría mal.

### B. Se quitan pecho, cintura y cadera (y esto obligó a tocar el servidor)

Se piden **altura y peso**, que es lo que la gente sabe de sí misma. Pero no bastaba con quitarlas de
la pantalla: la recomendación decidía con **una sola** medida (pecho arriba, cintura abajo, largo del
pie en calzado) y, sin ella, respondía «nos falta tu pecho» — el asistente se quedaba sin nada que
hacer. Así que el servidor cambia (parche 68):

* **La medida que decide se elige por orden**, de la que mejor predice la talla a la que peor:
  `pecho → cintura/cadera → altura → peso` en ropa, `largo del pie` en calzado. Se usa la primera que
  **el cliente haya dado** y que **la tabla de la tienda sepa leer**.
* **Arregla un fallo de verdad**: el bucle de afinado leía `weightMinCm`/`weightMaxCm`, columnas que
  **no existen** (el peso va en `weightMinKg`/`weightMaxKg`). Con `undefined`, la comparación salía
  siempre «dentro» y **el peso no se comparaba nunca**: daba los mismos puntos a todas las tallas.
* Si la tabla **no trae ninguna** medida comparable, se dice tal cual y no se recomienda nada.
* **Guardar** las medidas de ropa ya no exige pecho/cintura/cadera: con altura y peso basta.

En la app:

* El asistente pide **altura y peso**. El pecho, la cintura y la cadera quedan **detrás de un enlace
  opcional** («+ Añadir pecho, cintura o cadera»), porque hay tiendas cuya tabla mide así; si el
  servidor contesta que le falta una de esas, el enlace **se abre solo** en vez de dejar al cliente
  en un «nos falta tu pecho» sin salida.
* Los opcionales **empiezan en `null`**, no con un número por defecto: si se mandaran rellenos, el
  servidor los tomaría como si el cliente los hubiera dicho y la recomendación saldría de un número
  inventado. Y lo que **ya tuvieras guardado no se borra**: se conserva y se devuelve tal cual.
* Las **tablas típicas del comerciante** ahora rellenan también altura y peso (antes solo
  pecho/cintura). Sin eso, un comprador que da altura y peso no podría recibir recomendación de una
  tabla que solo midiera pecho. Pecho, cintura y cadera siguen ahí para quien los publique.

**Verificado contra la API real: `pruebas/lb61a-verificar-medida-que-decide.cjs` → 25 PASA · 0 FALLA**
(tabla sin pecho con altura y peso → talla M y lo explica con la altura; solo con el peso 80 → L y
«con el peso 50 → S», que es lo que demuestra que el peso **sí** se compara; tabla con pecho → manda
el pecho; tabla sin ninguna medida comparable → se dice; guardar altura y peso sin pecho → 200; sin
ninguna medida → 400).

### C. L-ter — «altura, peso y el número de calzado van juntos, el guardado será juntos» y «ancho y largo de pie sobran»

Tercera corrección del dueño sobre lo mismo, y esta toca el modelo de datos.

* **Un juego único.** Antes había dos filas por persona (`body` y `feet`) pensadas para ser
  independientes, y el asistente guardaba una u otra según la prenda: se podía acabar con la altura
  guardada y el número sin guardar. Ahora **se lee y se escribe un solo juego**: al guardar sin
  categoría se escribe en una única fila y se borra la de calzado, y `myMeasurements` devuelve el
  mismo juego en las dos claves (nada de lo que ya lo leía se rompe).
* **Lo que se pide son tres cosas y siempre las tres**: altura, peso y número de calzado. Da igual si
  miras una camiseta o unas zapatillas: tus medidas son tuyas y son las mismas.
* **Fuera el largo y el ancho del pie** («sobran»). El número se sigue comparando con la tabla de la
  tienda, que va en centímetros, así que la app hace la conversión por dentro (con la equivalencia de
  `constants/tallas.ts`) y lo dice en pantalla: «Talla 42 ≈ 26 cm de pie».
* **«Mis medidas» en el perfil** pasa a ser **un solo bloque** («168 cm · 65 kg · calzado 42») con
  **un solo botón de borrar**, en vez de dos bloques (ropa y calzado) con dos borrados.
* **Los botones del asistente van en un pie FIJO, fuera del scroll.** El dueño lo dijo tal cual:
  «entre los tres no hay un botón guardar, ni ajustar». Estaban dentro del mismo scroll que las
  ruletas y quedaban por debajo del borde: un botón al que hay que bajar deslizando, con ruletas
  dentro que también se deslizan, en la práctica no existe. Ahora se llaman **«Ajustar mi talla»**
  (calcula con la tabla de la tienda) y **«Guardar medidas»**, y se ven siempre.
* **Interfaz limpia, sin instrucciones** (petición del dueño: «evita escribir las instrucciones, no
  son necesarias»). Fuera los párrafos que explicaban cómo usar cada cosa: «Toca un valor para
  elegirlo», «Comparamos tus medidas con la tabla de ESTA tienda…», «Talla 42 ≈ 26 cm…», «Tus medidas
  se quedan en tu cuenta…», «Tabla de la tienda: mujer · 3 tallas…». Se quedan los rótulos, los
  valores, los avisos que SOLO salen cuando falta algo («Falta la foto real de ese color») y la
  recomendación con su razón, que es información, no instrucción. También se acortaron los textos del
  panel («Elige: Color», «¿No sabes tu talla?», «Máx. 2») y las ayudas del publicador.

**Un fallo que destapó la propia prueba** (y que se arregló en el parche 70): con el juego único,
una escritura «vieja» por categoría (`category: 'feet'`) creaba una fila que el lector unificado ya
no miraba — el dato se guardaba y **no se podía leer**. Ahora toda escritura **se mezcla con lo
guardado** y acaba en la misma fila: una app antigua que mande solo el calzado actualiza el número y
no borra la altura.

**Verificado contra la API real: 31 PASA · 0 FALLA** (los 25 de antes más: guardar de una vez y sin
categoría → altura, peso y calzado en el mismo juego; el mismo juego por las dos claves; releer;
guardar con solo el número; y que una escritura vieja de calzado no borre la altura).

---

### D. Lo que quedó SIN verificar en pantalla (y por qué)

> A partir de aquí **las pruebas en el móvil las hace el dueño**. El asistente con el pie fijo
> («Ajustar mi talla» / «Guardar medidas»), el borrado de «Mis medidas» y el calzado por número
> están **construidos, compilados e instalados**, pero no se llegaron a mirar en pantalla.

**Dos pedidos REALES que creó la automatización de las pruebas, y que se cancelaron.** Al verificar
tocando por coordenadas, dos toques cayeron en la barra inferior del panel (donde están «Al carrito»
y «Comprar now», a la misma altura que el botón de comprar de la ficha): se crearon **LB-260914-0009**
(Zapatillas 43, 26.000 XAF) y **LB-260914-0010** (Camiseta Rojo · M, 12.000 XAF). Los dos se
**cancelaron** y el stock quedó como estaba (40:2 · 41:3 · 42:0 · 43:1 · 44:0), con **cero pedidos
abiertos** en la cuenta del móvil (`pruebas/limpiar-pedido-accidental.cjs`). La app hizo lo que se le
pidió; el error fue de la prueba automatizada, y por eso a partir de aquí se prueba a mano.

Los datos de prueba están puestos (la camiseta con tabla de altura/peso y unas **zapatillas** con eje
de talla y tabla de calzado, las dos aprobadas y en una nota de Acurenam, creadas con
`pruebas/datos-tallas-demo.cjs`), pero **no se pudieron abrir en el móvil**: el teléfono resolvía
`hk.egrouteplan.com` a **198.18.0.13**, un rango falso que usa la app **Clash** (`com.follow.clash`,
que está instalada en el teléfono junto a ProtonVPN) cuando su túnel está caído. El resultado en la
app era «Error de red: Network request failed» en todas las pantallas: el problema es del **proxy del
teléfono**, no de la app ni del servidor (comprobado: la API responde 200 desde el equipo, desde el
propio servidor y por nginx, y el móvil hace ping al servidor). También afectó al equipo de trabajo:
los scripts de Node salían por un proxy local que empezó a cortar las conexiones
(`ECONNRESET`), así que los datos de prueba se crearon **lanzando el script desde el servidor**
(`LB_API=http://127.0.0.1:3000/api/v1 node /root/datos-tallas-demo.cjs`).

---

## 1. Qué resuelve (y por qué era el siguiente paso)

El comerciante ya podía escribir su tabla de tallas (tanda J) y el comprador ya elegía talla y color
(tanda K)… pero **nadie usaba la tabla**: para saber la talla había que adivinar. Esta tanda cierra el
circuito: se comparan las medidas de la persona con la tabla **de ese producto** y se dice la talla,
**por qué** y con qué ajuste.

Y de paso se ajustó el **panel de selección** a la especificación del dueño, que pedía cosas que aún
no cumplía (rango de precios, precio anterior tachado, agotados no seleccionables, cierre deslizando,
botón principal según de dónde se abrió, aviso de stock bajo).

## 2. El asistente de talla (`AsistenteDeTalla.tsx`)

* **Ruletas verticales** (`RuletaVertical.tsx`, sin librerías): un `ScrollView` con `snapToInterval`
  del alto de fila y una banda que marca la fila que cuenta. Se eligen deslizando, y al ser una lista
  cerrada **es imposible mandar un pecho de 900 cm** (el servidor lo rechazaría igual).

### 2-bis. El fallo de las ruletas (reportado por el dueño) y su arreglo

**Lo que pasaba**: «el asistente de talla no funciona correctamente, no permite seleccionar medidas».
La ruleta es un `ScrollView` vertical metido **dentro** del `ScrollView` del asistente, y en Android
**el de fuera se come el gesto**: el de dentro no se movía nunca y la medida no cambiaba.

**Lo que se hizo** (`RuletaVertical.tsx` + `AsistenteDeTalla.tsx`):

1. **`nestedScrollEnabled`** en los dos scrolls: es lo que permite que un scroll vertical anidado
   funcione en Android.
2. **Tocar un valor lo elige** (y la ruleta se centra en él). Con esto hay una forma de seleccionar
   que no depende de acertar con el gesto — y así se puede verificar.
3. El **centrado inicial** se hace cuando la ruleta ya tiene tamaño (`onLayout`), no con un
   temporizador que podía dispararse antes de que hubiera nada que desplazar.
4. Mientras se desliza una ruleta, **el scroll del panel se apaga** (si no, los dos se pelean), y se
   añadió la ayuda «Toca un valor para elegirlo, o deslízalo».

**Verificado en el Poco F5** (leyendo el estado `selected` del árbol de accesibilidad, no a ojo):

| Prueba | Resultado |
|---|---|
| **Tocar** un valor de la ruleta | Medición leída del árbol: pecho **95** · cintura **79** · cadera **98** · altura **175** |
| **Deslizar** dentro de la ruleta (swipe de 380 px) | Pecho **95 → 98 cm** (3 filas de 40 dp = 3 cm exactos) |
* **Solo las medidas que esa prenda usa**: calzado → largo y ancho del pie; parte de arriba →
  pecho (que decide), cintura, cadera, altura y peso; parte de abajo → cintura (que decide)…
  Es el mismo mapa que usa el servidor para decidir la talla.
* **Sexo**: las tablas son distintas para mujer y hombre; una tabla **unisex vale para los dos**.
* **«Ver mi talla»** → `POST products/:id/size-suggestion` → **talla + ajuste (ajustado/perfecto/
  holgado) + la razón** («Según tu pecho de 94 cm y tu altura de 168 cm, la talla L es la que mejor
  encaja»).
* **«Usar esta talla»** la marca en el bloque de tallas del panel. Si la tabla recomienda una talla
  que **ese producto no vende**, se dice tal cual en vez de marcarla.
* **Sin tabla configurada, no se inventa nada**: se dice que esa tienda todavía no la tiene y no se
  piden medidas para nada. El enlace «¿No sabes tu talla?» **solo aparece si la tienda tiene tabla**
  para ese tipo de prenda (se comprueba antes de ofrecerlo).
* **Las medidas se quedan en tu cuenta**: se guardan solo si lo pides, por categoría independiente
  (ropa / calzado) y el comerciante **nunca** las recibe: en el pedido solo viaja la talla elegida.

## 3. «Mis medidas» en el perfil

En **Perfil → Editar perfil → Gestión** hay ahora un bloque «Mis medidas» que enseña lo guardado de
ropa y de calzado por separado y permite **borrar** cada categoría (con confirmación). Es lo que
pedía el punto 4: «editarlas y poder borrarlas desde ajustes». (En esta app no hay una pantalla
llamada «Ajustes»: lo más parecido es «Editar perfil», y ahí está.)

## 4. El panel de selección, ajustado a la especificación

Lo que se añadió o cambió respecto a la tanda K:

| Punto de la especificación | Estado |
|---|---|
| Miniatura que cambia con la combinación elegida | Ya estaba ✓ |
| **Rango de precios** («12.000 – 13.500 XAF») cuando las combinaciones valen distinto y aún no se ha elegido | **Nuevo** |
| **Precio anterior tachado** — solo si de verdad es mayor que el que se enseña | **Nuevo** |
| Stock con matiz de «**quedan pocas unidades**» por debajo de 10 | **Nuevo** |
| Color seleccionado con borde de acento **y fondo tintado** | **Nuevo** (antes solo el borde) |
| **Agotado por combinación**: al elegir «Blanco», sus tallas sin stock se apagan; al cambiar a «Rojo» se liberan las otras | Ya estaba ✓ |
| Un color con **todas** sus tallas agotadas sale apagado entero | Ya estaba ✓ |
| Valores agotados **no seleccionables** (apagados y tachados) | **Cambiado**: antes se podían tocar |
| Cantidad con tope real y «**Máx. N piezas**» | **Nuevo** el texto |
| Botones apagados hasta tener todas las dimensiones | Ya estaba ✓ |
| Botón principal **según de dónde se abrió** (carrito o comprar); el otro queda al lado | **Nuevo** |
| Cierre con **X**, tocando fuera y **deslizando hacia abajo** | **Nuevo** el deslizamiento (tirador con `PanResponder`: el `Modal` de React Native no lo trae) |
| Al reabrir, **se mantiene lo que ya estaba elegido** en la ficha | **Nuevo** |
| «¿No sabes tu talla?» **dentro** del panel (no una pantalla nueva) | **Nuevo** (tanda L) |

**Lo que NO se hizo de la especificación, y por qué**:

* **Precio en rojo**: se usa el color primario del tema (es el que llevan todos los precios de la app,
  ficha incluida). Pintarlo de rojo solo aquí rompería la coherencia; si el dueño lo quiere rojo, es
  un cambio de tema, no de esta pantalla.
* **Tres formatos de color (texto / swatch circular / mini-foto) «según configuración»**: se usa
  siempre la **mini-foto real del producto**, que es lo que el dueño exigió en la tanda K («no vale
  sólo poner color, debe verse el producto de la foto real de este color»). Un cuadradito de color
  sería volver atrás.
* **«Comprar now» expande el panel al 90 % con el checkout embebido** (dirección, cupón, mensaje,
  desglose y «Pagar»): sigue **pendiente** y ya estaba documentado como el «nivel 3» del flujo
  embebido. Hoy «Comprar now» lleva a la caja a pantalla completa, que es lo que la propia
  especificación de Xiaohongshu permite.
* **Aviso de reposición**: como los valores agotados ya no se pueden seleccionar, el aviso no se
  ofrece «al elegir». Se ofrece **al tocar un valor agotado** (aparece «¿Te avisamos cuando vuelva?»
  con «Avisadme»), así que sigue habiendo salida sin contradecir la regla de no seleccionable.

## 5. Verificación

* **Servidor**: no se tocó nada. Lo que se usa ya estaba verificado: `size-suggestion` y las medidas
  por categoría en **41/41** (tanda J) y los ejes/combinaciones en **54/54** (tanda K).
* **En pantalla (Poco F5)**: ver la sección 6 — se dice qué se vio y qué no.
* `npx tsc --noEmit` limpio · `npm run rutas` en orden (103 rutas, sin enlaces rotos).

## 6. Lo que queda sin verificar

* **El asistente de calzado con el número de talla** y el de ropa con altura/peso, ya con las
  medidas nuevas: construidos, compilados e instalados, **sin ver en pantalla** porque el proxy del
  teléfono estaba caído (§0-C). Es lo primero que hay que mirar cuando el móvil vuelva a tener red.
* El **bloque «Mis medidas»** en «Editar perfil» y el borrado por categoría (el APK lo lleva; falta
  abrirlo y mirarlo).
* El **cierre deslizando** hacia abajo en el panel y el **precio anterior tachado** en pantalla.
* El aviso «¿Te avisamos cuando vuelva?» al tocar un valor agotado: construido, **no** visto en
  pantalla.
* Que el aviso por combinación llegue al chat al reponer (el botón llama al servidor, pero el aviso
  real no se ha esperado).
* **Ya verificado**: las ruletas (tocar y deslizar, con las medidas leídas del árbol), el asistente
  completo con su recomendación («Tu talla: M · ajuste holgado» + la razón con las medidas), «Usar
  esta talla» marcando la talla en el panel, el rango de precios «12.000 – 13.900 XAF», el precio de
  la combinación elegida («Quedan pocas unidades (2)») y «Máx. 2 piezas» según el stock real.

## 7. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Ruletas | `components/lifebook/RuletaVertical.tsx` |
| Asistente | `components/lifebook/AsistenteDeTalla.tsx` |
| Panel | `components/lifebook/SelectorDeVariante.tsx` (reescrito) |
| Ficha | `app/lifebook-product/[id].tsx` (`selectorModo`, `seleccionInicial`) |
| Mis medidas | `app/edit-profile.tsx` (`MisMedidasCard`) |
| API del cliente | `api/commerce.ts` (`tallasApi`: `misMedidas`, `guardarMedidas`, `borrarMedidas`, `sugerir`) |
