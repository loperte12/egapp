# Tanda Q — CUPONES EN LA CAJA (y el botón de pagar que parecía muerto)

> Hecho el 15/09/2026. Dos encargos del dueño: **«avanza con cupones en la caja»** (el punto 5 del
> traspaso) y **«el flujo anterior no funciona: el botón confirmar/pagar no reacciona»**.

---

## 1. El botón que «no reaccionaba» — qué pasó de verdad

Lo primero fue buscar pruebas, no suposiciones. En la base y en los registros del servidor:

| Hora (servidor) | Qué se ve |
|---|---|
| 15:18:01 | `LB-260915-0001` creado con **`in_store`** (o sea: se eligió «Pago en tienda») · 13.500 XAF |
| 15:18:20 | se publica la tarjeta `🧾 Pedido LB-260915-0001` — eso **solo** lo hace el botón «Escribir a la tienda» de la pantalla del pedido |
| 15:18:33 | «El comprador canceló el pedido» |
| 15:23:24 | `LB-260915-0002` creado, también con **`in_store`** · 24.000 XAF (2 unidades) · cancelado |

Es decir: **el botón sí llamó y el pedido se creó** (dos veces, y con la forma de pago que se eligió a
mano: la elección obligatoria del punto 4 funcionaba). Lo que fallaba era **la respuesta cuando NO se
puede seguir**: sin forma de pago elegida, el aviso salía en un recuadro **arriba del todo del
ScrollView** —fuera de la pantalla cuando estás en el pie, que es donde está el botón—, así que pulsar
parecía no hacer nada. Y como en la tanda P se dejó de marcar una forma de pago por defecto, ese caso
pasó a ser lo normal.

**El arreglo (en las dos cajas):**

* El motivo se dice **en el pie**, junto al botón, y además la pantalla **se desplaza al sitio que
  falta** (las formas de pago, o la dirección del reparto).
* El botón **nunca está muerto**: si falta elegir, él mismo dice «Elige cómo pagas» y al pulsarlo lleva
  la vista a las formas de pago; solo se apaga si la tienda **no tiene ninguna forma de cobro**
  («Sin forma de pago», y se explica).
* Si hay **una sola** forma de pago, se marca sola: no hay nada que elegir y obligar a tocar sería un
  paso tonto.
* En la caja del carrito, si no hay nada marcado el botón dice «Elige productos» y al pulsarlo
  **vuelve al carrito** (antes se quedaba apagado sin decir nada).

## 2. Cupones en la caja

**Lo que ya había**: la tienda crea cupones (`lifebook.coupons`: porcentaje o importe fijo, con mínimo
de compra, tope de usos, límite por persona y caducidad) y la persona los recoge por código
(`coupon_claims`). **Lo que no había**: aplicarlos. `discount_xaf` estaba en `lifebook.orders` **sin
usarse en ningún sitio** y `POST /orders` no aceptaba ningún cupón.

### Servidor (parches 74 y 75 + migración 74)

| Fichero | Cambio |
|---|---|
| `lifebook/orders.service.ts` | `resolverCupon()`: **un solo sitio** decide el descuento. Comprueba que el cupón es de ESA tienda, activo, empezado, sin caducar, no agotado, no usado ya por esa persona, recogido por ella y con el mínimo de compra cumplido. Nunca descuenta más que la compra y el porcentaje se redondea **hacia abajo**. |
| `lifebook/orders.service.ts` | El pedido acepta `couponCode`; guarda `discount_xaf`, `coupon_id` y `coupon_code`; el total es `subtotal + envío − descuento`. |
| `lifebook/orders.service.ts` | El cupón se marca **usado dentro de la transacción**, con guardas (`used_count < per_user_limit` y `used_count < max_uses`): dos compras a la vez no pueden gastar el mismo cupón dos veces. |
| `lifebook/orders.service.ts` | Al **cancelar** (o si la tienda rechaza) **el cupón vuelve**, como vuelve el stock: en las dos cuentas y nunca por debajo de cero. |
| `lifebook/orders.service.ts` | El detalle del pedido dice `discountXaf` y `couponCode`. |
| `lifebook/commerce.service.ts` | Los cupones recogidos y el recién recogido dicen **`shopId`** (antes solo el nombre: comparar por nombre es frágil). |
| `lifebook/lifebook.service.ts` | La tarjeta del chat (el ticket de la tienda) lleva el descuento y el código. |
| `pruebas/74-cupon-en-el-pedido.sql` | `lifebook.orders` + `coupon_id` y `coupon_code` (se comprobaron permisos antes: `has_table_privilege` → sí para los dos usuarios). |

`tsc --noEmit` del servidor: **0 errores** antes de emitir; `pm2` reiniciado y `online`.

### App

| Fichero | Cambio |
|---|---|
| `components/lifebook/SelectorDeCupon.tsx` | **Nuevo.** Las chips de mis cupones de esa tienda (con el descuento que darían) y el campo para meter un código. Un cupón que no sirve **se enseña apagado con el motivo** («Desde 5.000 XAF»): esconderlo haría pensar que se ha perdido. |
| `app/lifebook-checkout.tsx` | Sección «Cupón» + el descuento en el pie y en el total. |
| `app/lifebook-carrito-checkout.tsx` | Un cupón **por tienda** (cada tienda recibe su pedido), con el descuento en el bloque y en el total. |
| `api/commerce.ts` | `cuponesApi.mios()` / `recoger()`, `descuentoDeCupon()` y `cuponAplicable()` (la misma regla que el servidor, en una sola función) y `couponCode` en la creación del pedido. |
| `app/lifebook-order/[id].tsx` | El pedido enseña la fila del cupón: «Cupón PRUEBA… −1.200 XAF». |
| `components/lifebook/OrderCardEnChat.tsx` | El ticket de la tienda dice «Cupón −X»: la tienda **cobra menos** y tiene que verlo ahí. |
| `components/lifebook/ProductoEnChatSheet.tsx`, `app/lifebook-carrito.tsx`, `app/lifebook-user.tsx` | Se quitaron los textos que decían que **los cupones no existían** (ya no es verdad). |

**El descuento que se cobra lo decide el servidor, siempre**: la app solo lo enseña antes de pagar, con
la misma regla, para que la pantalla y el cobro no puedan decir cosas distintas.

## 3. Lo verificado contra la API real

`pruebas/lb72a-cupon-en-la-caja.cjs` (lanzado desde el servidor, porque la red del equipo no llega;
usa el comprador de pruebas BERNARDO, **no** la cuenta del móvil):

```
=== 1. EL CUPÓN DE LA TIENDA ===   OK producto → tienda d8a2ece3… · precio 12000 XAF
  (el cupón PRUEBA135085 estaba pausado: se ha activado para la prueba)
=== 2. RECOGER EL CUPÓN ===       OK HTTP 201 · dice su tienda (shopId) · usable=true
=== 3. PEDIR CON EL CUPÓN ===     OK descuento 1200 (10 % de 12000)
                                  OK total = 12000 + 0 − 1200 = 10800
                                  OK el pedido guarda el código · LB-260915-0003
=== 4. NO SE GASTA DOS VECES ===  OK repetir → HTTP 422 COUPON_ALREADY_USED
=== 5. CANCELAR DEVUELVE EL CUPÓN === OK el cupón vuelve a usable=true y mis usos a 0
TODO OK
```

Además: `tsc --noEmit` de la app → **0 errores**; APK compilado e instalado.

## 4. Lo que NO queda verificado

* **En pantalla**: elegir el cupón en la caja, meter un código, y ver el descuento en el pie y en el
  total. Y que el botón ahora sí responde cuando falta elegir la forma de pago. **Lo prueba el dueño**
  (los toques automáticos ya crearon pedidos reales dos veces).
* **Un pedido con cupón de REPARTO** y **una compra del carrito con dos tiendas y un cupón en cada
  una**: probado con un pedido de recogida de una sola tienda.
* **Que el cupón se devuelva al rechazar la tienda** (`decline`): se probó con la cancelación del
  comprador; las dos pasan por el mismo sitio (`cfg.to === 'cancelled'`), pero solo se ha ejecutado una.
* **La pantalla de «Mis cupones»** no existe: los cupones se recogen y se aplican en la caja. Si el
  dueño quiere una pantalla aparte, es otra tanda.

## 5. Notas sobre los datos de prueba

* Se activó el cupón **`PRUEBA135085`** (10 %, mínimo 5.000 XAF, tope 5 usos, 1 por persona) de
  «Hotel Demo Malabo», que estaba pausado, para poder probar. **Sigue activo**: sirve para que el dueño
  lo pruebe en su móvil (en la caja, campo «¿Tienes un código?» → `PRUEBA135085`).
* El pedido de la prueba (`LB-260915-0003`) queda **cancelado** y el cupón devuelto.
* Aparece un pedido **`LB-F69C43`** («Botella térmica», estado `requested`, total 0, **sin forma de
  pago**) creado hoy a las 15:24 por la cuenta del móvil. Es del **modelo antiguo** (`post_id`, 46 filas
  así en la base) y **no lo crea ni la app ni el servidor actual**: no he encontrado ninguna ruta que lo
  inserte. No se ha tocado. Si el dueño no lo reconoce, conviene mirarlo aparte.
