# Ficha de producto — la barra de abajo y sus botones

> Estado: **cambios hechos, compilados y MEDIDOS en el Poco F5**. Fecha: 14/09/2026.
> Nace de tres avisos del dueño seguidos, mirando la misma pantalla.

---

## 1. Lo que dijo el dueño y lo que se hizo

| Aviso | Qué pasaba de verdad | Qué se cambió |
|---|---|---|
| «El botón *Avísame cuando llegue* se ve mal ajustada y muy grande» | Era un `PrimaryButton` de **alto fijo 52 dp** (`packages/ui-kit`, pensado para botones a lo ancho de la pantalla) metido en una barra de botones de **44 dp**. Medido: **510 × 156 px = 170 × 52 dp** al lado de tres círculos de 132 × 132 px (44 dp) | El CTA de la barra es ahora una píldora de **44 dp** con el mismo alto que los iconos. Medido después: **510 × 132 px** y toda la fila centrada en la misma línea |
| «Esta interfaz ya había un botón de carrito con ícono, no es necesario volver a agregar otro» | La barra tenía **dos** controles de carrito pegados: el icono (abre el carrito, con globito de cuántas cosas llevas) y un botón «+ Carrito» (añadía el producto) | La barra se queda con **un solo** control de carrito (el icono). «Añadir al carrito» se movió **a la zona del precio y las opciones**, contorneado y de 40 dp, donde no compite con el CTA azul |
| «*Preguntar a la tienda* y el botón de ícono mensaje realizan la misma función; sería mejor eliminar uno y agregar uno de comprar» | Con el producto agotado, el CTA decía «Preguntar a la tienda» y **hacía lo mismo que el icono de mensaje**: abrir el chat con la tienda y mandarle la tarjeta del producto | **Una sola puerta al chat.** El icono de mensaje solo sale cuando el botón principal **no** es ya el chat. Y el CTA dejó de disfrazarse: si está agotado dice **«Agotado»** (apagado) |

**La causa de fondo del «Agotado»**: no era un fallo de la app. Los pedidos de mis pruebas retenían
la última unidad de la variante «Talla 42» (stock 0). Cancelé el pedido de prueba
(`LB-260914-0003`) y la unidad volvió al stock: el producto está **a la venta otra vez** y su ficha
enseña «Comprar».

## 2. La regla, en una tabla

| Estado del producto | Barra inferior (medida) | Botón principal |
|---|---|---|
| **Con precio y existencias** | Guardar · **Escribir a la tienda** · Mi carrito (globito) · **Comprar** | «Comprar» → caja |
| **Agotado** | Guardar · **Escribir a la tienda** · Mi carrito · **Agotado** (apagado) | Apagado; la salida es el chat |
| **Servicio / «a consultar»** | Guardar · Mi carrito · **Solicitar** | El propio botón **es el chat** → sin icono de mensaje |
| **Es mi publicación** | Guardar · Mi carrito · **Es tu publicación** (apagado) | Sin icono de mensaje: no me escribo a mí mismo |

En los tres primeros casos la barra tiene **un solo camino** para cada cosa: un carrito, un chat y
una acción principal.

## 3. Medido en el Poco F5 (volcado de UI, no impresiones)

```
Producto con existencias (d47de72c)
  302,1651   508x120   «Añadir al carrito»            ← en la zona del precio (169 × 40 dp)
  108,2278   132x132   «Guardar»
  270,2278   132x132   «Escribir a la tienda»
  432,2278   132x132   «Mi carrito, 2 productos»
  783,2278   510x132   «Comprar»                       ← 170 × 44 dp, ya del alto de la barra

Agotado (1e0ff38e)
  108,2278   132x132   «Guardar»
  270,2278   132x132   «Escribir a la tienda»          ← se queda: es la única forma de preguntar
  432,2278   132x132   «Mi carrito, 2 productos»
  783,2278   510x132   «Agotado»                       ← apagado, sin duplicar el chat

Es mi publicación (c05d515e)
  108,2278   132x132   «Guardar»
  270,2278   132x132   «Mi carrito, 2 productos»       ← sin icono de mensaje
  702,2278   672x132   «Es tu publicación»
```

Antes de estos cambios, el CTA medía **156 px (52 dp)** mientras los iconos medían 132 px (44 dp).

## 4. Lo que NO está verificado / pendiente

1. **El caso «servicio a consultar» con existencias** no se ha podido ver en pantalla: en los datos
   de prueba, los servicios «a consultar» están a 0 de stock, así que salen por la rama «Agotado».
   La rama está escrita y compila, pero **no vista en el teléfono**.
2. **«Agotado» es un botón apagado**, no un «Avísame cuando llegue»: no existe todavía un aviso
   automático de reposición (haría falta una tabla de interesados y notificaciones). El chat queda al
   lado para preguntar.
3. **No hay selector de cantidad en la ficha**: «Añadir al carrito» añade 1 unidad (la cantidad se
   cambia en el carrito o en la caja).
4. **El carrito no se vacía solo**: en las pruebas quedaron 2 productos dentro (se ve en el globito).

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Ficha | `app/lifebook-product/[id].tsx` (flags `ctaEsElChat`, `mostrarIconoChat`, `etiquetaCta`, `ctaActivo`; estilos `ctaBtn` y `anadirBtn`) |
| Botón grande del sistema | `packages/ui-kit/src/primitives/PrimaryButton.tsx` (alto 52 dp: intacto, sigue usándose donde toca) |
