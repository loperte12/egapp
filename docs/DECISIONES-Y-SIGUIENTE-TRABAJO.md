# DECISIONES DEL DUEÑO Y SIGUIENTE TRABAJO (18/09/2026)

> Documento de relevo. El dueño ha decidido; aquí queda **qué se hace ahora**, quién lo hace y **cómo se
> comprueba**. Si algo de aquí contradice a otro documento, manda este (es posterior).

---

## 1. Las tres decisiones (ya no se preguntan más)

| Decisión | Qué se hace | Por qué |
|---|---|---|
| **Justificante al marcar cobrado** | **OBLIGATORIO para transferencia y facturación.** Sin imagen del comprobante, el pedido **no se puede marcar cobrado**. Contra entrega y pago en tienda **no se pide** (el dinero se ve en mano) | Un pedido marcado cobrado sin prueba es la palabra de la tienda contra la del comprador; el justificante es el único rastro, y ya existe el botón con rastro de quién y cuándo |
| **Ventana de reclamación** | **7 días desde la entrega.** Pasados 7 días ya no se abre reclamación | Es la misma garantía que ya usa **Ecomerse** en esta app: coherencia, y da tiempo real a probar lo recibido. La liquidación al vendedor no se cierra antes de que venza |
| **Por dónde seguimos** | **Pantallas de app cuyo servidor YA responde** (los 4 puntos de §2). El push espera a las cuentas del dueño; el cobro real, a los proveedores | Es lo más barato que queda: el trabajo de servidor está hecho y solo falta que el usuario lo vea y lo use |

**Consecuencia inmediata de la decisión 1:** hay que **reforzar el flujo de «marcar cobrado»** en la app:
si el método es transferencia o facturación y no hay justificante adjunto, el botón **no deja continuar** y
lo dice («hace falta el justificante»). Hoy el servidor ya guarda el rastro; falta la regla.

**Consecuencia inmediata de la decisión 2:** la ventana de 7 días se **comprueba en el servidor** (no solo
en la pantalla: una pantalla se puede saltar). Un pedido entregado hace más de 7 días **rechaza** la
reclamación con un mensaje claro.

---

## 2. Siguiente trabajo: las 4 pantallas (estado real)

| # | Pantalla | Estado |
|---|---|---|
| 1 | **Panel de dinero de la tienda** (vendido, comisión, pendiente de cobro, liquidación) | ✅ **Hecha**, compilada, instalada y medida en pantalla; los números cuadran contra el libro |
| 2 | **Campo del coste de envío** (cerrarlo antes de entregar, con `a_pagar_reparto`) | ✅ **Hecha** y medida |
| 3 | **Guardados fuera del perfil** | ✅ **Hecha** y medida |
| 4 | **Aviso de bajada de precio** («Bajó de 25 000 a 20 000 XAF») | ⏳ **Localizada, NO hecha.** El sitio exacto está en `docs/TANDA-T-ARREGLOS-DE-FONDO.md` → **T.21**. Resumen: (a) **leer entero el ayudante `avisarReposiciones`** (el patrón a copiar ya existe: es el «avísame cuando llegue»); (b) la bajada se detecta en el `UPDATE` del producto (`commerce.service.ts` ≈1380), donde el precio anterior **ya está leído** en `p.price_xaf`; (c) añadir tabla `price_drops` para que la bajada quede **registrada**, no solo avisada; (d) una línea en la pantalla de guardados. **NO** deducir la bajada de `old_price_xaf`: es un campo que el vendedor escribe a mano, no un registro de lo que pasó |

**Ninguna se empieza sin terminar la anterior**: un cambio, una compilación, una medida (`tsc --noEmit`
en 0 antes de `pm2 restart`, y medir **textos en el árbol**, no píxeles).

---

## 3. Los dos fallos abiertos: qué se hace exactamente

### 3.1 Ocho compras a la vez: la mitad fallan por tiempo — **la causa está localizada**

Leído el código de la transacción de compra (`orders.service.ts:255-347`). Dentro del cerrojo hay **una
lectura pesada que no debería estar ahí** y **tres bucles que multiplican los viajes a la base de datos**:

| Lo que hay dentro de la transacción | Coste | Qué hacer |
|---|---|---|
| `SELECT stock_quantity` **por línea**, antes de un `UPDATE` que ya comprueba el stock | 1 viaje extra por artículo, **y es el que se salta en silencio si la variante no existe** | **Quitarlo**: el `UPDATE ... WHERE stock_quantity >= n` ya basta |
| `INSERT` de líneas **una a una** (`for` de `order_items`) | 1 viaje por artículo | **Un solo INSERT multi-fila** |
| **`this.orderDetail(...)` dentro de la transacción** (`:342`) | Es una lectura **completa del pedido** (tienda, comprador, líneas) con el cerrojo puesto | **Sacarla fuera**: se lee después de confirmar. Es el cambio que más acorta el cerrojo |
| `nextOrderNo()` (mostrador atómico) | **Serializa las 8 compras**: la 8.ª espera a las 7 anteriores | **Sacar el número fuera de la transacción** con una **secuencia de Postgres** (`nextval`, que no bloquea). Los números seguirán siendo únicos; que queden huecos no importa (no son facturas) |
| Sin reintento ante conflicto | Un choque transitorio tumba la compra | **Reintentar 2-3 veces con espera creciente** en conflictos de escritura (`P2034`): la clave de idempotencia ya protege de duplicar |

**Cómo se hace, en orden y midiendo:** primero **cronometrar** la transacción por fases (registrar
milisegundos de cada paso) para saber cuánto pesa cada uno; después el cambio 1 (quitar el `SELECT`),
medir; después el 3 (sacar `orderDetail`), medir; y solo si aún falla, el 4 (secuencia). **No se suben
tiempos de espera a ojo**: eso esconde el problema, no lo arregla.

### 3.2 Cancelar un pedido ya cobrado — **el dinero no se toca, y eso hay que cerrarlo**

Hoy cancelar cambia el estado pero **el libro de cuentas se queda como estaba**: la comisión sigue
cobrada y el saldo del vendedor, igual. Es decir: **las cuentas mienten**.

Y antes de programar hay que separar **dos cosas que no son lo mismo**:

| Situación | Qué flujo | Qué pasa con el dinero |
|---|---|---|
| **Antes de entregar** (el pedido no ha salido) | **Cancelación** | Se **revierten los asientos**: se anula la comisión y lo pendiente del vendedor; el cobro queda como **`refund_pending`** (dinero a devolver) |
| **Después de entregar** | **Reclamación** (dentro de la ventana de **7 días** que has decidido) | Si se estima, se genera **devolución**: asiento inverso + `refund_pending` → `refunded` |

**Regla de dinero que propongo (dime si no te vale):** **la comisión solo se cobra en pedidos
entregados y no reclamados.** Por tanto:
* cancelado **antes** de entregar → **comisión revertida** (no se cobra);
* entregado y pasado el plazo de **7 días** sin reclamación → **se libera el saldo del vendedor** (ahí es
  cuando la comisión es firme);
* cancelado **después** de haber liquidado → queda como **deuda del vendedor** en su próximo pago.

**Detalle que abarata el trabajo:** la devolución reutiliza el **flujo de justificante** que ya existe: el
mismo botón y el mismo rastro de quién y cuándo. No hay que inventar nada nuevo, solo el asiento inverso.


---

## 4. Parte del dueño (no la puede hacer ningún agente)

1. **Escribir a los proveedores de cobro** (Maviance, Notch Pay, Getesa) — texto listo en §2.1 del
   informe de choque.
2. **Los tres números de la calle**: coste real de una entrega urbana, comisión que aguanta el vendedor, y
   ticket medio. Sin ellos el modelo de ingreso está a ciegas (referencia de partida: **8 % con mínimo
   500 XAF**, la misma comisión de Comida).
3. **Decidir quién hace la entrega** (vendedor o plataforma): de eso depende si el envío es un ingreso o
   solo un gasto.
4. **Probar OKOUME** (el competidor real, lanzado en Malabo el 18-ago-2026): apuntar si deriva a WhatsApp
   para cerrar el trato, si enseña stock y precio real, y si se puede pagar dentro.
