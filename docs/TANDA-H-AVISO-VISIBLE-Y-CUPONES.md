# Tanda H — el aviso, a la vista (y cupones: primera mitad)

> Estado: **los dos arreglos medidos en el Poco F5** y **los cupones verificados 35/35** contra la
> API real. Fecha: 14/09/2026.
> `api/lifebook.ts` y `components/FloatingFooter.tsx` siguen sin tocarse.

---

## 1. El fallo que viste: la letra no cabía en el botón

**Lo que pasaba**: el CTA de la ficha mide **170 dp** (los tres iconos de la izquierda y sus huecos
no se tocan) y el texto «Te avisamos cuando llegue» medía **146 dp** de ancho… justo el hueco
disponible (170 − 12 de relleno a cada lado). Al borde, la letra salía cortada.

**Lo que se hizo**:

| Estado | Antes | Ahora | Medido |
|---|---|---|---|
| Esperando | «Te avisamos cuando llegue» | **«Te avisamos ✓»** | **109 dp** (antes 146) |
| Sin esperar | «Avísame cuando llegue» | **«Avísame si llega»** | **121 dp** (antes 146) |

El texto largo se queda en la **etiqueta de accesibilidad** («Avísame cuando llegue»), así que quien
use lector de pantalla sigue oyendo la frase entera. Además el texto lleva `flexShrink` y
`numberOfLines`: si algún día no cupiera, se recorta **con puntos suspensivos** en vez de salirse.

## 2. «N personas esperan esto» — el dato, delante de quien decide

El aviso de reposición ya apuntaba quién espera stock, pero **el comerciante no lo veía**. Ahora sí,
y solo él:

| Dónde | Qué se ve |
|---|---|
| Ficha del producto (dueño) | **«🔔 1 persona espera este producto»** + «Al reponer existencias se les avisa solos por el chat con la tienda» |
| Panel «Mis productos» | **«🔔 N esperan stock»** en la tarjeta, junto a las vistas y los guardados |

**Al comprador no se le enseña**: es información de la tienda y un contador público se puede inflar a
propósito. En el servidor, `waitingCount` solo se calcula y se devuelve si el visor es el dueño.

Medido: con una espera real de otra cuenta, el panel y la ficha del dueño devuelven
`waitingCount: 1` y la ficha del comprador `undefined`.

## 3. Cupones — primera mitad (hecha y verificada)

**DDL 014** (`sql/lifebook/20260214_cupones.sql`):

* `coupons` → el cupón de cada tienda: `percent` (1-90 %) o `amount`, **mínimo de compra**, tope de
  usos totales, **tope por persona**, vigencia y estado (`active | paused`). El código es **único por
  tienda** y no distingue mayúsculas.
* `coupon_claims` → el cupón **recogido por una persona** (los del chat quedan vinculados a su
  cuenta, como pide la especificación).
* `order_coupons` + `orders.discount_xaf` → **ya creados** para poder aplicar el descuento en la caja
  sin volver a tocar el esquema.

**Servidor**:

| Ruta | Qué hace |
|---|---|
| `POST /commerce/merchant/coupons` | La tienda crea un cupón (la tienda sale del token) |
| `GET /commerce/merchant/coupons` | Sus cupones, con usos y cuánta gente los ha recogido |
| `PATCH /commerce/merchant/coupons/:id` | Pausar / reactivar (no se borra: los usos quedan) |
| `POST /commerce/coupons/claim` | Recoger un cupón por su código → queda en la cuenta |
| `GET /commerce/my/coupons` | Mis cupones, con su estado real y **el motivo** cuando no valen |

**Las reglas están en el servidor, no en la app** (es dinero): un «100 %» se rechaza, un valor 0 se
rechaza, un código repetido da 409, uno pausado no se puede recoger, y recoger dos veces el mismo no
lo duplica.

### Verificación: `pruebas/lb57a-verificar-cupones.cjs` → **35 PASA · 0 FALLA**

```
1. LA TIENDA CREA UN CUPÓN              código en mayúsculas · activo · 0 usos · sale en su lista
2. CÓDIGO ÚNICO POR TIENDA              409 COUPON_CODE_TAKEN (y sin distinguir mayúsculas)
3. UN «100 %» NO ES UN CUPÓN            400 COUPON_PERCENT_TOO_HIGH · valor 0 → COUPON_VALUE_INVALID
4. SIN TIENDA NO SE CREAN               (probado con la cuenta que no tiene tienda)
5. SE RECOGE Y QUEDA EN LA CUENTA       «Cupón guardado en tu cuenta: se aplica al pagar»
6. RECOGERLO DOS VECES NO LO DUPLICA    alreadyHad: true y sigue habiendo uno
7. UN CUPÓN PAUSADO NO SE RECOGE        y en «mis cupones» deja de ser usable, con el motivo
8. CÓDIGO QUE NO EXISTE                 404 COUPON_NOT_FOUND · sin código → 400
9. CADA TIENDA TIENE LOS SUYOS          no se ve ni se toca el cupón de otra tienda
```

## 4. Lo que queda de los cupones (segunda mitad, siguiente paso)

1. **Aplicar el descuento en la caja**: `POST /commerce/orders` con `couponCode` → validar contra el
   subtotal de esa tienda, guardar `discount_xaf`, escribir en `order_coupons` y subir los contadores
   (usos totales y del usuario). El esquema ya está listo.
2. **El carrito**: la fila de cupón entre la lista y el total, con la hoja de «aplicables» y «no
   aplicables **con el motivo**» (mínimo no alcanzado, tienda distinta, caducado, ya usado).
   **Hoy el carrito NO enseña cupones a propósito**: enseñar un descuento que todavía no se puede
   usar sería mentir.
3. **La pantalla del comerciante** para crearlos (hoy se crean por API).
4. **Recoger cupones desde el chat** (el servidor ya los vincula a la cuenta; falta el botón).

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `/opt/mirror/app/sql/lifebook/20260214_cupones.sql` (copia local `backend/sql/014_cupones.sql`) |
| Servidor | `commerce.service.ts` (`createCoupon`, `myCoupons`, `setCouponStatus`, `claimCoupon`, `myClaimedCoupons`, `couponShape`) · `commerce.controller.ts` (las cinco rutas) · `http/error.filter.ts` (los códigos de cupón con su HTTP) |
| Parches | `parche54-esperan-esto.py`, `parche55-cupones-1.py`, `parche56-http-cupones.py`, `parche57-quitar-duplicado.py` |
| App | `app/lifebook-product/[id].tsx` (etiquetas del CTA y aviso al dueño) · `app/lifebook-merchant-products.tsx` («N esperan stock») · `api/commerce.ts` (`waitingCount`) |
| Prueba | `pruebas/lb57a-verificar-cupones.cjs` (35 comprobaciones) |

## 6. Un detalle aprendido (para el próximo que toque el mapa de errores)

`error.filter.ts` ya tenía `SHOP_REQUIRED` más abajo: al añadirlo otra vez, TypeScript no compila
(**claves duplicadas en un objeto**) y el build no se aplica, pero `pm2` sigue diciendo «online» con
la versión vieja. Conviene comprobar `tsc` **y** que el arranque no traiga errores antes de dar algo
por desplegado.
