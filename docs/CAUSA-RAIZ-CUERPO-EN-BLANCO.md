# CAUSA RAÍZ del «cuerpo que no se pinta» — `PrimaryButton` con `width: '100%'` dentro de una fila

**15/09/2026 · resuelto y verificado en el móvil para `lifebook-checkout` (la caja del producto).**

> Completa a `docs/BUG-CAJA-DEL-PRODUCTO-SIN-CUERPO.md` (el traspaso de la investigación) y responde a
> `docs/AUDITORIA-CUERPO-QUE-NO-SE-PINTA.md` (la auditoría independiente): **sus dos sospechosos
> estructurales NO son la causa** (ni el botón flotante de Cucucul en el layout raíz, ni
> `expo-speech-recognition`): no hace falta tocar nada de eso.

## 1. La causa, en una frase

`PrimaryButton` del kit trae **`width: '100%'`** (`node_modules/@egrouteplan/ui-kit/src/primitives/PrimaryButton.tsx`,
línea 102) porque está pensado para ir **a lo ancho de una columna**. Al meterlo en una **fila**
(`flexDirection: 'row'`) junto a una columna con `flex: 1`, ese `100%` se queda con **todo** el ancho,
la columna se aplasta a ~0 px, sus textos se parten **letra por letra** y crecen miles de píxeles de
alto; el pie se traga la pantalla y el cuerpo (`flex: 1`) se queda con **0 px** → **el cuerpo sale en
blanco**.

## 2. Medido en el móvil (Poco F5, no en teoría)

Con la caja rota (medido el 15/09 con marcas de color en cada caja):

| Qué | Valor medido |
|---|---|
| Caja del cuerpo (`ScrollView style={{flex: 1}}`) | **0 px de alto** (ni nodo en el árbol, ni un píxel de su fondo) |
| Contenedor del pie | **2.110 px de alto** (de y=244 a y=2.354) |
| Botón del kit dentro del pie | **984 px de ancho** (él solo) |
| Columna de totales (`flex: 1`) | ~0-56 px de ancho → sus 4 textos, altísimos |
| Textos en el árbol de accesibilidad | **2** (solo la cabecera y el botón) |
| Franja del cuerpo | 100 % color de página liso |

Después del arreglo, en la misma pantalla:

| Qué | Valor medido |
|---|---|
| Textos en el árbol | **24** (artículo, «¿Cómo lo recibes?», las 5 formas de pago, «Falta elegir cómo pagas.», Cupón, Nota) |
| Pie | y=**2.078-2.186** (abajo, donde debe) |
| Artículo (banda 320-520) | **91 % de píxeles con contenido**, color de tarjeta (35,35,41) |
| Cupón / pie | 17,6 % / 31 % de píxeles con contenido |

## 3. El arreglo (en `app/lifebook-checkout.tsx`, en el pie)

```jsx
{/* El botón va en su propia caja: el 100% del kit pasa a ser el de la caja. */}
<View style={{ width: 176 }}>
  <PrimaryButton title={…} disabled={…} loading={…} onPress={confirmar} />
</View>
```

No se toca el kit a propósito: `width: '100%'` es correcto para las demás pantallas, que lo usan en
columna. El arreglo es local y no cambia nada más.

## 4. Por qué el carrito sí funcionaba (y por qué parecía un misterio)

`app/lifebook-carrito-checkout.tsx` tiene **el mismo esqueleto** (`View flex:1` + cabecera +
`ScrollView flex:1` + pie) pero su pie usa un **`Pressable` normal** (`styles.cta`), **no**
`PrimaryButton`. Por eso pintaba: ahí no había ningún `width: '100%'` comiéndose la fila.

Y encaja con la regresión: el fallo apareció cuando se rehizo el pie de la caja (tanda P/Q,
15/09 15:16+), justo al meter el CTA del kit dentro de la fila de totales.

## 5. Qué queda (sin verificar, no lo doy por hecho)

* **`lifebook-order/[id]` (el detalle del pedido) sigue roto** y **no** es este patrón: sus botones sí
  van envueltos (`<View style={{flex:1}}>` en el pie, y el de «Confirmar entrega y cobro» dentro de
  una columna). Hay que medirlo y bisecarlo aparte. Es la pantalla donde el comprador ve **su código de
  entrega**, así que es la siguiente.
* No he probado en pantalla: confirmar el pedido de verdad (no lo toco: cada toque crea un pedido
  real), ni el cupón aplicado en esta caja, ni el resto de pantallas de la lista «sin verificar» de la
  auditoría (`lifebook-orders`, `lifebook-carrito`, `lifebook-ai`, `lifebook-inbox`).

## 6. Trampas de medición que me mordieron (para el siguiente)

1. **El enlace directo no siempre navega**: `am start -d egrouteplan://…` puede dejarte en la pantalla
   anterior. **Comprobar un texto único de la pantalla ANTES de creer cualquier medida** (yo medí el
   «Taxi» creyendo que era la caja).
2. **`uiautomator` no lista lo que no se dibuja** (y al revés, puede listar nodos sin píxeles): cruzar
   siempre árbol y píxeles.
3. **El color de página es (23,23,26)** y las tarjetas del tema son casi iguales (35,35,41): contar
   píxeles distintos del fondo **no** basta para decir «sano»; lo que decide es **cuántos textos hay en
   el árbol y dónde está el pie**.
4. **Poner un color propio a cada caja** (cabecera / cuerpo / pie) es lo que resolvió el caso: con los
   colores se ve qué caja ocupa qué, sin adivinar. Y una marca en la **cabecera** (que sí pinta) sirve
   para saber si el APK instalado es de verdad el que acabas de compilar.
