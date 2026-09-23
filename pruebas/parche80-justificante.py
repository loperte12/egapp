# =============================================================================
# parche80 — LA TIENDA MARCA COBRADO, CON JUSTIFICANTE (segunda mitad del punto 5)
#
# QUÉ FALTA HOY: contra entrega y pago en tienda ya quedan `paid` al entregar (parche79), pero una
# transferencia, una facturación o un depósito se quedan `pending` PARA SIEMPRE: el dinero entra por
# fuera, la app no se entera, el vendedor no ve esa caja y ninguna comisión se puede cuadrar.
#
# QUÉ HACE ESTE PARCHE:
#   · `markPaid(userId, orderId, proofUrl, note)`: **solo la tienda del pedido** puede marcar cobrado.
#     Guarda el justificante (enlace de la foto ya subida), una nota con la referencia, QUIÉN lo marcó
#     (`paid_by`) y cuándo (`paid_at`), y avisa al comprador en el chat — si la tienda se equivoca, se ve.
#   · No se puede marcar un pedido CANCELADO ni uno que ya está cobrado (mensajes claros, no silencio).
#   · El justificante, si viene, tiene que ser un enlace http(s): nada de `javascript:` ni basura.
#   · `orderDetail` devuelve `paymentProofUrl` y `paymentNote`, para que el comprador pueda ver con qué
#     se dio por cobrado (transparencia; el rastro es de los dos).
#
# DECISIÓN QUE QUEDA ABIERTA (no me la invento): el justificante es **opcional**. Obligarlo bloquearía a
# una tienda que cobró en efectivo un depósito sin recibo. Si el dueño quiere que sea obligatorio, es
# cambiar `const justificante` por un `throw` cuando venga vacío: una línea, y hay que decirlo.
#
# Requiere la migración 79 (tres columnas). Se aplica después.
#
# Uso en el servidor:  python3 /root/parche80-justificante.py
# =============================================================================
import shutil
import sys

SELLO = 'justificante-del-cobro-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'
C = '/opt/mirror/app/src/lifebook/orders.controller.ts'

# ── 1. El método, justo después de la entrega por código ─────────────────────
ANCLA_METODO = """    await this.notify(o, userId, 'Pedido entregado y cobrado ✅');
    return this.orderDetail(orderId, userId);
  }
"""

NUEVO_METODO = """    await this.notify(o, userId, 'Pedido entregado y cobrado ✅');
    return this.orderDetail(orderId, userId);
  }

  /**
   * LA TIENDA MARCA COBRADO UN PEDIDO (segunda mitad del punto 5 de la acción inmediata).
   *
   * Los métodos que se pagan al recoger ya quedan cobrados al entregar. Los demás —transferencia,
   * facturación, depósito, monedero— los cobra la tienda por fuera: hasta ahora se quedaban `pending`
   * para siempre, el vendedor no veía esa caja y ninguna comisión se podía cuadrar.
   *
   * Lo marca SOLO la tienda del pedido. El justificante (el enlace de la foto ya subida) es opcional:
   * obligarlo bloquearía a quien cobró en efectivo sin recibo. Queda el rastro de quién lo marcó y
   * cuándo, y el comprador recibe el aviso en el chat: si la tienda se equivoca, se ve.
   */
  async markPaid(userId: string, orderIdRaw: string, proofUrl?: unknown, note?: unknown) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, userId);
    const esVendedor = o.shop_owner === userId || o.seller_id === userId;
    if (!esVendedor) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo la tienda puede marcar el cobro');
    if (o.status === 'cancelled') {
      throw new DomainError('ORDER_CANCELLED', 'Ese pedido está cancelado: no hay nada que cobrar');
    }
    if (o.payment_status === 'paid') {
      throw new DomainError('PAYMENT_ALREADY_PAID', 'Ese pedido ya está marcado como cobrado');
    }
    const justificante = String(proofUrl ?? '').trim() || null;
    if (justificante && !/^https?:\\/\\//i.test(justificante)) {
      throw new DomainError('PROOF_URL_INVALID', 'El justificante tiene que ser un enlace a la foto ya subida');
    }
    const texto = String(note ?? '').trim().slice(0, 300) || null;
    await this.db.$executeRaw`
      UPDATE lifebook.orders
         SET payment_status = 'paid', paid_at = now(), paid_by = ${userId}::uuid,
             payment_proof_url = ${justificante}, payment_note = ${texto}, updated_at = now()
       WHERE id = ${orderId}::uuid AND payment_status <> 'paid'`;
    await this.notify(o, userId, 'La tienda ha marcado tu pedido como cobrado ✅');
    return this.orderDetail(orderId, userId);
  }
"""

# ── 2. El justificante en el detalle (lo ven las dos partes) ─────────────────
ANCLA_DETALLE = """        paidAt: o.paid_at,
        deliveredAt: o.delivered_at,"""

NUEVO_DETALLE = """        paidAt: o.paid_at,
        /** Con qué se dio por cobrado: el enlace del justificante y la nota de la tienda. */
        paymentProofUrl: o.payment_proof_url ? String(o.payment_proof_url) : null,
        paymentNote: o.payment_note ? String(o.payment_note) : null,
        deliveredAt: o.delivered_at,"""

# ── 3. La ruta ───────────────────────────────────────────────────────────────
ANCLA_RUTA = """  /**
   * «ESCRIBIR A LA TIENDA»: deja la tarjeta de ESE pedido en el chat comprador↔tienda."""

NUEVA_RUTA = """  /** «MARCAR COBRADO»: la tienda cobra por fuera (transferencia, facturación…) y deja el justificante. */
  @Post(':id/mark-paid')
  @UseGuards(JwtAuthGuard)
  markPaid(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.markPaid(u.userId, id, body?.proofUrl, body?.note);
  }

  /**
   * «ESCRIBIR A LA TIENDA»: deja la tarjeta de ESE pedido en el chat comprador↔tienda."""


def aplicar(ruta, piezas):
    src = open(ruta, encoding='utf-8').read()
    problemas = []
    for viejo, _ in piezas:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'{ruta}: esperaba 1 aparición y hay {n} → ' + viejo.strip().splitlines()[0][:60])
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return False
    shutil.copyfile(ruta, f'{ruta}.bak-{SELLO}')
    print(f'respaldo: {ruta}.bak-{SELLO}')
    for viejo, nuevo in piezas:
        src = src.replace(viejo, nuevo)
    open(ruta, 'w', encoding='utf-8', newline='').write(src)
    return True


def main():
    if 'markPaid' in open(P, encoding='utf-8').read():
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    if not aplicar(P, [(ANCLA_METODO, NUEVO_METODO), (ANCLA_DETALLE, NUEVO_DETALLE)]):
        return 1
    if not aplicar(C, [(ANCLA_RUTA, NUEVA_RUTA)]):
        print('OJO: el servicio SÍ se escribió y el controlador NO. Revisar a mano.')
        return 1
    print('escrito orders.service.ts (markPaid) y orders.controller.ts (POST :id/mark-paid)')
    return 0


sys.exit(main())
