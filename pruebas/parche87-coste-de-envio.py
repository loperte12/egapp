# =============================================================================
# parche87 — CERRAR EL COSTE DE ENVÍO EN EL TOTAL (punto 15 de la §3)
#
# QUÉ PASA HOY: si la política de envío de la tienda es `on_request` («se acuerda por el chat») o
# `calculated` («según la distancia»), el pedido se crea con **coste de entrega 0** y solo se añade un
# texto. El total que paga el comprador **no lleva el reparto**, así que:
#   · ese dinero se mueve por fuera, en mano, **sin ningún rastro**;
#   · no se puede comisionar ni cuadrar (el libro de cuentas escribe `a_pagar_reparto` con lo que diga
#     el pedido… que dice 0);
#   · y el comprador ve «A acordar» sin saber nunca cuánto era.
#
# QUÉ HACE ESTE PARCHE: la tienda puede **cerrar el coste del reparto** en el pedido, antes de entregar:
#
#     PATCH /lifebook/commerce/orders/:id/delivery-cost   { deliveryCostXaf }
#
#   · Solo la TIENDA del pedido.
#   · Solo mientras el pedido no esté entregado, cancelado ni en reclamación.
#   · Y **nunca si ya está cobrado**: si el dinero ya entró por un importe, cambiarlo después dejaría el
#     libro contando una cosa y el comprador habiendo pagado otra. Se dice con esas palabras.
#   · No vale para recogida en tienda: ahí no hay reparto que cobrar.
#   · Recalcula el total = productos − cupón + reparto, avisa al comprador en el chat (con el total
#     nuevo) y, al entregar, el libro escribe `a_pagar_reparto` con el importe REAL.
#
# LO QUE NO HACE: no inventa precios de reparto (ni distancias ni tarifas). El precio lo pone la tienda,
# que es quien reparte o quien lo contrata. Lo que se arregla es que ese precio **se pueda cerrar** y
# quede en el total y en el libro.
#
# Uso en el servidor:  python3 /root/parche87-coste-de-envio.py
# =============================================================================
import shutil
import sys

SELLO = 'coste-de-envio-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'
C = '/opt/mirror/app/src/lifebook/orders.controller.ts'

ANCLA_METODO = """  /**
   * LA TIENDA MARCA COBRADO UN PEDIDO (segunda mitad del punto 5 de la acción inmediata)."""

NUEVO_METODO = """  /**
   * CERRAR EL COSTE DEL REPARTO (punto 15 de la acción inmediata).
   *
   * Cuando la política de la tienda es «se acuerda por el chat» o «según la distancia», el pedido nace
   * con coste de entrega 0: ese dinero se movía por fuera y sin rastro, el total no lo llevaba y no
   * había forma de comisionarlo ni de cuadrarlo. Aquí la tienda lo cierra ANTES de entregar, y al
   * entregar el libro de cuentas escribe `a_pagar_reparto` con el importe de verdad.
   *
   * Reglas, y por qué:
   *   · solo la tienda del pedido (es su reparto);
   *   · no si ya está entregado, cancelado o en reclamación (el pedido ya no admite cambios de dinero);
   *   · **nunca si ya está cobrado**: si el comprador ya pagó un importe, cambiarlo después dejaría el
   *     libro contando una cosa y el comprador habiendo pagado otra;
   *   · no para recogida en tienda: no hay reparto que cobrar.
   * El precio lo pone la tienda (aquí no se inventan tarifas ni distancias).
   */
  async setDeliveryCost(userId: string, orderIdRaw: string, costRaw: unknown) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, userId);
    const esVendedor = o.shop_owner === userId || o.seller_id === userId;
    if (!esVendedor) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo la tienda puede fijar el coste del reparto');
    if (String(o.delivery_mode) === 'pickup') {
      throw new DomainError('DELIVERY_NOT_APPLICABLE', 'Ese pedido se recoge en la tienda: no hay reparto que cobrar');
    }
    if (['delivered', 'cancelled', 'declined', 'disputed'].includes(String(o.status))) {
      throw new DomainError('INVALID_STATE_TRANSITION', 'Ese pedido ya no admite cambios de dinero');
    }
    if (String(o.payment_status) === 'paid') {
      throw new DomainError('ORDER_ALREADY_PAID', 'Ese pedido ya está cobrado: el importe no se puede cambiar ahora');
    }
    const coste = Number(costRaw);
    if (!Number.isFinite(coste) || !Number.isInteger(coste) || coste < 0 || coste > 500000) {
      throw new DomainError('DELIVERY_COST_INVALID', 'El coste del reparto tiene que ser un número entero entre 0 y 500 000 XAF');
    }
    // El total se recalcula con la MISMA fórmula que al crear el pedido: productos − cupón + reparto.
    const productos = Math.max(0, Number(o.subtotal_xaf ?? o.price_xaf ?? 0) - Number(o.discount_xaf ?? 0));
    const total = productos + coste;
    await this.db.$executeRaw`
      UPDATE lifebook.orders SET delivery_cost_xaf = ${coste}, total_xaf = ${total}, updated_at = now()
       WHERE id = ${orderId}::uuid AND status NOT IN ('delivered','cancelled','declined','disputed')
         AND payment_status <> 'paid'`;
    await this.notify(o, userId, `La tienda ha fijado el reparto en ${coste} XAF: el total queda en ${total} XAF`);
    return this.orderDetail(orderId, userId);
  }

  /**
   * LA TIENDA MARCA COBRADO UN PEDIDO (segunda mitad del punto 5 de la acción inmediata)."""

ANCLA_RUTA = """  /** «VALORAR»: el comprador puntúa un pedido entregado (1-5) y mueve la nota de tienda y productos. */"""

NUEVA_RUTA = """  /** «CERRAR EL REPARTO»: la tienda fija el coste del envío antes de entregar (punto 15). */
  @Patch(':id/delivery-cost')
  @UseGuards(JwtAuthGuard)
  deliveryCost(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.setDeliveryCost(u.userId, id, body?.deliveryCostXaf);
  }

  /** «VALORAR»: el comprador puntúa un pedido entregado (1-5) y mueve la nota de tienda y productos. */"""


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
    if 'setDeliveryCost' in open(P, encoding='utf-8').read():
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    if not aplicar(P, [(ANCLA_METODO, NUEVO_METODO)]):
        return 1
    if not aplicar(C, [(ANCLA_RUTA, NUEVA_RUTA)]):
        print('OJO: el servicio SÍ se escribió y el controlador NO. Revisar a mano.')
        return 1
    print('escrito orders.service.ts (setDeliveryCost) y orders.controller.ts (PATCH :id/delivery-cost)')
    return 0


sys.exit(main())
