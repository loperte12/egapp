# =============================================================================
# parche74 — EL CUPÓN, EN LA CAJA (tanda Q)
#
# Lo que pidió el dueño: «avanza con cupones en la caja». Los cupones ya existían (la tienda los crea
# y la persona los recoge por código), pero **no se aplicaban en ningún sitio**: `discount_xaf` estaba
# en la tabla sin usarse y `POST /orders` no aceptaba ningún cupón.
#
# Este parche:
#   1. `orders.service.ts` — el pedido acepta `couponCode`; el descuento lo calcula el SERVIDOR
#      (`resolverCupon`): cupón de ESA tienda, activo, sin caducar, no agotado, no usado ya por esa
#      persona, con el mínimo de compra cumplido, y nunca mayor que la compra.
#   2. `orders.service.ts` — el cupón se marca USADO dentro de la transacción, con guardas (dos
#      compras a la vez no pueden gastar el mismo cupón dos veces) y se guarda en el pedido
#      (`discount_xaf`, `coupon_id`, `coupon_code`).
#   3. `orders.service.ts` — al CANCELAR (o rechazar la tienda) el cupón **vuelve**: misma idea que
#      devolver el stock. El pedido cancelado no puede haber gastado el cupón de nadie.
#   4. `orders.service.ts` — el detalle del pedido dice el descuento y el código del cupón.
#   5. `lifebook.service.ts` — la tarjeta del chat (el ticket de la tienda) lleva el descuento.
#
# Requiere la migración `pruebas/74-cupon-en-el-pedido.sql` (columnas `coupon_id` y `coupon_code`).
#
# Uso en el servidor:  python3 /root/parche74-cupon-en-la-caja.py
# =============================================================================
import shutil
import sys

SELLO = 'cupon-en-caja-20260215'
BASE = '/opt/mirror/app/src/lifebook'
ORDENES = f'{BASE}/orders.service.ts'
LIFEBOOK = f'{BASE}/lifebook.service.ts'

# ── 1. El DTO acepta el código del cupón ────────────────────────────────────
OA1 = """  paymentMethod?: string;
  note?: string;
  /**
   * MERCADO (tanda E): conversación donde nació la compra."""

ON1 = """  paymentMethod?: string;
  note?: string;
  /**
   * TANDA Q: código del cupón que la persona quiere aplicar. El descuento lo calcula el SERVIDOR
   * (`resolverCupon`), nunca la app: aquí solo viaja el código.
   */
  couponCode?: string;
  /**
   * MERCADO (tanda E): conversación donde nació la compra."""

# ── 2. El descuento, calculado en el servidor ───────────────────────────────
OA2 = """    const subtotalXaf = lineas.reduce((a, l) => a + l.lineTotalXaf, 0);
    const totalXaf = subtotalXaf + deliveryCostXaf;"""

ON2 = """    const subtotalXaf = lineas.reduce((a, l) => a + l.lineTotalXaf, 0);
    /**
     * EL CUPÓN (tanda Q). El descuento lo decide ESTE lado, nunca la app: un cupón no puede valer
     * más que la compra, ni de otra tienda, ni usarse dos veces. Si el código no sirve, se corta con
     * el motivo exacto y la app lo enseña tal cual.
     */
    const cupon = await this.resolverCupon(buyerId, shop.shop_id, dto.couponCode, subtotalXaf);
    const discountXaf = cupon?.discountXaf ?? 0;
    const totalXaf = Math.max(0, subtotalXaf + deliveryCostXaf - discountXaf);"""

# ── 3. El pedido guarda el cupón y el descuento ─────────────────────────────
OA3 = """          (order_no, shop_id, buyer_id, seller_id, status, payment_method, payment_status,
           delivery_mode, delivery_address, delivery_cost_xaf, subtotal_xaf, total_xaf,
           delivery_code, message, contact_mode, price_xaf, title)
        VALUES
          (${orderNo}, ${shop.shop_id}::uuid, ${buyerId}::uuid, ${shop.shop_owner}::uuid, 'created',
           ${paymentMethod}, ${paymentMethod === 'cash_on_delivery' ? 'on_delivery' : 'pending'},
           ${deliveryMode}, ${JSON.stringify({ city, zone, reference, ...(hasPin ? { lat, lng } : {}) })}::jsonb,
           ${deliveryCostXaf}, ${subtotalXaf}, ${totalXaf},
           ${deliveryCode}, ${[note, deliveryNote].filter(Boolean).join(' · ') || null}, 'inapp',
           ${totalXaf}, ${lineas[0].title})"""

ON3 = """          (order_no, shop_id, buyer_id, seller_id, status, payment_method, payment_status,
           delivery_mode, delivery_address, delivery_cost_xaf, subtotal_xaf, total_xaf,
           discount_xaf, coupon_id, coupon_code,
           delivery_code, message, contact_mode, price_xaf, title)
        VALUES
          (${orderNo}, ${shop.shop_id}::uuid, ${buyerId}::uuid, ${shop.shop_owner}::uuid, 'created',
           ${paymentMethod}, ${paymentMethod === 'cash_on_delivery' ? 'on_delivery' : 'pending'},
           ${deliveryMode}, ${JSON.stringify({ city, zone, reference, ...(hasPin ? { lat, lng } : {}) })}::jsonb,
           ${deliveryCostXaf}, ${subtotalXaf}, ${totalXaf},
           ${discountXaf}, ${cupon?.id ?? null}::uuid, ${cupon?.code ?? null},
           ${deliveryCode}, ${[note, deliveryNote].filter(Boolean).join(' · ') || null}, 'inapp',
           ${totalXaf}, ${lineas[0].title})"""

# ── 4. El cupón se marca usado DENTRO de la transacción ─────────────────────
OA4 = """      // 3) Pedido + líneas
      const orderNo = await this.nextOrderNo(tx);"""

ON4 = """      // 3) EL CUPÓN, si lo hay: se marca usado AQUÍ DENTRO, con guardas.
      //
      // Las dos guardas (`used_count < per_user_limit` y `used_count < max_uses`) son lo que impide
      // que dos compras a la vez gasten el mismo cupón dos veces: la segunda no actualiza ninguna
      // fila y la transacción entera se deshace (con el stock incluido).
      if (cupon) {
        const mio: number = await tx.$executeRaw`
          UPDATE lifebook.coupon_claims SET used_count = used_count + 1
           WHERE coupon_id = ${cupon.id}::uuid AND user_id = ${buyerId}::uuid
             AND used_count < (SELECT per_user_limit FROM lifebook.coupons WHERE id = ${cupon.id}::uuid)`;
        const suyo: number = await tx.$executeRaw`
          UPDATE lifebook.coupons SET used_count = used_count + 1
           WHERE id = ${cupon.id}::uuid AND (max_uses IS NULL OR used_count < max_uses)`;
        if (!mio || !suyo) {
          throw new DomainError('COUPON_USED_UP', 'Ese cupón se acaba de agotar: quítalo y vuelve a intentarlo');
        }
      }

      // 4) Pedido + líneas
      const orderNo = await this.nextOrderNo(tx);"""

# ── 5. Cancelar devuelve el cupón (como devuelve el stock) ──────────────────
OA5 = """          } else if (it.product_id) {
            await tx.$executeRaw`
              UPDATE lifebook.products SET stock_quantity = stock_quantity + ${Number(it.quantity)}, updated_at = now()
               WHERE id = ${it.product_id}::uuid AND stock_mode IN ('exact','approximate')`;
          }
        }
      }
    });"""

ON5 = """          } else if (it.product_id) {
            await tx.$executeRaw`
              UPDATE lifebook.products SET stock_quantity = stock_quantity + ${Number(it.quantity)}, updated_at = now()
               WHERE id = ${it.product_id}::uuid AND stock_mode IN ('exact','approximate')`;
          }
        }
        /**
         * Y EL CUPÓN VUELVE. Misma idea que el stock: si la compra se cancela (o la tienda la
         * rechaza), la persona no ha gastado su cupón y lo puede volver a usar. Se devuelve en las
         * DOS cuentas (la global del cupón y la de esa persona) y nunca por debajo de cero.
         */
        if (o.coupon_id) {
          await tx.$executeRaw`
            UPDATE lifebook.coupons SET used_count = GREATEST(0, used_count - 1)
             WHERE id = ${o.coupon_id}::uuid`;
          await tx.$executeRaw`
            UPDATE lifebook.coupon_claims SET used_count = GREATEST(0, used_count - 1)
             WHERE coupon_id = ${o.coupon_id}::uuid AND user_id = ${o.buyer_id}::uuid`;
        }
      }
    });"""

# ── 6. El detalle del pedido dice el descuento y el cupón ───────────────────
OA6 = """        subtotalXaf: Number(o.subtotal_xaf ?? 0) || Number(o.price_xaf ?? 0),
        totalXaf: Number(o.total_xaf ?? 0) || Number(o.price_xaf ?? 0),"""

ON6 = """        subtotalXaf: Number(o.subtotal_xaf ?? 0) || Number(o.price_xaf ?? 0),
        /** TANDA Q: lo que quitó el cupón (0 si no se usó ninguno). */
        discountXaf: Number(o.discount_xaf ?? 0),
        couponCode: o.coupon_code ? String(o.coupon_code) : null,
        totalXaf: Number(o.total_xaf ?? 0) || Number(o.price_xaf ?? 0),"""

# ── 7. El método que resuelve el cupón ──────────────────────────────────────
OA7 = """  // ───────────────────────────── ACCIONES ───────────────────────────────────
  async orderAction(userId: string, orderIdRaw: string, action: string) {"""

ON7 = """  /**
   * EL CUPÓN DE ESTA COMPRA (tanda Q). Un solo sitio decide el descuento.
   *
   * Devuelve `null` cuando no se manda código. Si el código no sirve para ESTA compra, corta con el
   * motivo exacto (la app lo enseña tal cual, sin inventarse nada):
   *   · no existe / no es de esta tienda · la tienda lo pausó · todavía no vale · caducado
   *   · agotado · ya lo usó esa persona · no lo ha recogido · no llega al mínimo de compra
   *
   * El descuento NUNCA es mayor que el subtotal (un cupón no puede dejar la compra en negativo), y
   * un `percent` se redondea HACIA ABAJO: el céntimo nunca lo pierde la tienda por redondeo.
   */
  private async resolverCupon(userId: string, shopId: string, codeRaw: unknown, subtotalXaf: number) {
    const code = String(codeRaw ?? '').trim().toUpperCase();
    if (!code) return null;
    const filas: any[] = await this.db.$queryRaw`
      SELECT c.*, k.used_count AS my_uses
        FROM lifebook.coupons c
        LEFT JOIN lifebook.coupon_claims k
               ON k.coupon_id = c.id AND k.user_id = ${userId}::uuid
       WHERE c.shop_id = ${shopId}::uuid AND upper(c.code::text) = ${code} LIMIT 1`;
    const c = filas[0];
    if (!c) throw new DomainError('COUPON_NOT_FOUND', 'Ese cupón no existe o no es de esta tienda');
    if (String(c.status) !== 'active') throw new DomainError('COUPON_PAUSED', 'La tienda ha pausado ese cupón');
    if (c.starts_at && new Date(c.starts_at).getTime() > Date.now()) {
      throw new DomainError('COUPON_NOT_STARTED', 'Ese cupón todavía no se puede usar');
    }
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
      throw new DomainError('COUPON_EXPIRED', 'Ese cupón ha caducado');
    }
    if (c.max_uses !== null && c.max_uses !== undefined && Number(c.used_count) >= Number(c.max_uses)) {
      throw new DomainError('COUPON_USED_UP', 'Ese cupón ya se ha agotado');
    }
    if (!c.my_uses && c.my_uses !== 0) {
      throw new DomainError('COUPON_NOT_CLAIMED', 'Recoge el cupón en tu cuenta antes de usarlo');
    }
    if (Number(c.my_uses) >= Number(c.per_user_limit ?? 1)) {
      throw new DomainError('COUPON_ALREADY_USED', 'Ya has usado ese cupón');
    }
    const minimo = Number(c.min_subtotal_xaf ?? 0) || 0;
    if (minimo > 0 && subtotalXaf < minimo) {
      throw new DomainError('COUPON_MIN_SUBTOTAL', `Ese cupón es para compras desde ${minimo} XAF`);
    }
    const valor = Number(c.value ?? 0) || 0;
    const bruto = String(c.kind) === 'percent' ? Math.floor((subtotalXaf * valor) / 100) : valor;
    const discountXaf = Math.max(0, Math.min(bruto, subtotalXaf));
    if (!discountXaf) return null;
    return { id: String(c.id), code: String(c.code), discountXaf };
  }

  // ───────────────────────────── ACCIONES ───────────────────────────────────
  async orderAction(userId: string, orderIdRaw: string, action: string) {"""

# ── 8. El ticket del chat dice el descuento ────────────────────────────────
OA8 = """    const ticket = {
      paymentMethod: order.paymentMethod ? String(order.paymentMethod) : null,
      deliveryAddress: (order.deliveryAddress ?? {}) as Record<string, unknown>,
      note: order.note ? String(order.note).slice(0, 300) : null,
    };"""

ON8 = """    const ticket = {
      paymentMethod: order.paymentMethod ? String(order.paymentMethod) : null,
      deliveryAddress: (order.deliveryAddress ?? {}) as Record<string, unknown>,
      note: order.note ? String(order.note).slice(0, 300) : null,
      // TANDA Q: la tienda tiene que saber que esa compra lleva descuento (cobra menos).
      discountXaf: Number(order.discountXaf ?? 0) || 0,
      couponCode: order.couponCode ? String(order.couponCode) : null,
    };"""

# ── 9. El orderRef que lee la app ──────────────────────────────────────────
OA9 = """        paymentMethod: payload.social === true ? null : (payload.paymentMethod ? String(payload.paymentMethod) : null),"""

ON9 = """        paymentMethod: payload.social === true ? null : (payload.paymentMethod ? String(payload.paymentMethod) : null),
        /** Lo que quitó el cupón (0 si no hubo), solo en la tarjeta del chat con la tienda. */
        discountXaf: payload.social === true ? null : (Number(payload.discountXaf ?? 0) || 0),
        couponCode: payload.social === true ? null : (payload.couponCode ? String(payload.couponCode) : null),"""

PIEZAS = [
    (ORDENES, [(OA1, ON1), (OA2, ON2), (OA3, ON3), (OA4, ON4), (OA5, ON5), (OA6, ON6), (OA7, ON7), (OA8, ON8)]),
    (LIFEBOOK, [(OA9, ON9)]),
]


def main():
    fuentes = {}
    problemas = []
    for ruta, cambios in PIEZAS:
        src = open(ruta, encoding='utf-8').read()
        fuentes[ruta] = src
        if 'resolverCupon' in src:
            print('PARECE YA APLICADO: no se toca nada.')
            return 1
        for viejo, _ in cambios:
            n = src.count(viejo)
            if n != 1:
                problemas.append(f'{ruta.split("/")[-1]}: esperaba 1 aparición y hay {n} → '
                                 + viejo.strip().splitlines()[0][:70])
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return 1

    for ruta, cambios in PIEZAS:
        src = fuentes[ruta]
        shutil.copyfile(ruta, f'{ruta}.bak-{SELLO}')
        print(f'respaldo: {ruta}.bak-{SELLO}')
        for viejo, nuevo in cambios:
            src = src.replace(viejo, nuevo)
        open(ruta, 'w', encoding='utf-8', newline='').write(src)
        print(f'escrito {ruta.split("/")[-1]}')
    print('parche74 aplicado: el cupón se aplica en la caja, se marca usado y vuelve si se cancela.')
    return 0


sys.exit(main())
