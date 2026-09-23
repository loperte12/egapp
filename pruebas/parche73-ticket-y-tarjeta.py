# =============================================================================
# parche73 — EL TICKET DEL PEDIDO Y EL BOTÓN «ESCRIBIR A LA TIENDA»
#
# Lo que reportó el dueño (docs/PENDIENTE-COMPRA-PAGO-Y-TICKET.md, puntos 2 y 3), ya diagnosticado:
#
#   · La TARJETA del pedido SÍ se publica al crear la compra y SÍ llega a la app (comprobado: 8
#     tarjetas con `orderRef` en la conversación que abre el botón). Lo que falta es que al pulsar
#     «escribir a la tienda» no se pone delante la de ESE pedido: en una conversación con varias
#     compras el comerciante no sabe de cuál se le habla.
#   · Y la tarjeta no lleva lo que hace falta para entregar y cobrar: el nombre viene pero la app no
#     lo pinta en el chat de la tienda, y **no hay forma de pago ni dirección** (el `orderRef` no las
#     servía).
#
# Este parche hace tres cosas:
#   1. `orders.service.ts` — la tarjeta del chat comprador↔tienda lleva forma de pago, dirección y
#      nota. La del GRUPO no las lleva (mismo `base`, sin el bloque `ticket`): la dirección de casa
#      de nadie es asunto de un grupo.
#   2. `orders.service.ts` — método nuevo `publicarTarjetaEnChat()`: vuelve a publicar la tarjeta de
#      ese pedido (solo comprador, tienda o admin; lo comprueba `publicOrder`).
#   3. `orders.controller.ts` — la ruta `POST /v1/lifebook/commerce/orders/:id/chat-card`.
#   4. `lifebook.service.ts` — el `orderRef` que lee la app sirve esas tres cosas (en las tarjetas de
#      grupo, en `null`).
#
# NO toca el dinero: el servidor ya guardaba bien la forma de pago y la dirección (se comprobó en la
# base). El fallo 1 (nadie elige la forma de pago) es de la APP: la caja marca sola la primera.
#
# Uso en el servidor:  python3 /root/parche73-ticket-y-tarjeta.py
# =============================================================================
import shutil
import sys

SELLO = 'ticket-pedido-20260215'
BASE = '/opt/mirror/app/src/lifebook'
ORDENES = f'{BASE}/orders.service.ts'
CONTROL = f'{BASE}/orders.controller.ts'
LIFEBOOK = f'{BASE}/lifebook.service.ts'

# ── orders.service.ts (1): la firma acepta la conversación y quién publica ───
OA1 = """  private async publicarPedido(order: any, buyerId: string, conversationId?: string) {"""

ON1 = """  private async publicarPedido(order: any, buyerId: string, conversationId?: string, chatDirecto?: any, actorId?: string) {"""

# ── orders.service.ts (2): el «ticket» va SOLO a la tarjeta de la tienda ─────
OA2 = """    const tienda = String(order.shop?.ownerId ?? '');
    if (tienda && tienda !== buyerId) {
      const conv = await this.conversacionDirecta(buyerId, tienda);
      if (conv) await this.publicarEnChat(conv, buyerId, `\U0001f9fe Pedido ${base.code}`, 'order', { ...base, social: false });
    }"""

ON2 = """    /**
     * LO QUE VE LA TIENDA (y NO lo que ve un grupo): el «ticket».
     *
     * Sin esto la tarjeta no decía ni cómo se paga ni dónde se entrega, y el comerciante no podía
     * preparar el pedido. La DIRECCIÓN es privada del comprador: va solo aquí, en el chat
     * comprador\u2194tienda; la del grupo se publica desde el mismo `base` pero SIN este bloque.
     */
    const ticket = {
      paymentMethod: order.paymentMethod ? String(order.paymentMethod) : null,
      deliveryAddress: (order.deliveryAddress ?? {}) as Record<string, unknown>,
      note: order.note ? String(order.note).slice(0, 300) : null,
    };
    const tienda = String(order.shop?.ownerId ?? '');
    if (tienda && tienda !== buyerId) {
      const conv = chatDirecto ?? await this.conversacionDirecta(buyerId, tienda);
      if (conv) {
        await this.publicarEnChat(conv, actorId ?? buyerId, `\U0001f9fe Pedido ${base.code}`, 'order', { ...base, ...ticket, social: false });
      }
    }"""

# ── orders.service.ts (3): el método del botón «escribir a la tienda» ────────
OA3 = """  /** Aviso en el chat comprador\u2194tienda (o con el comprador, si avisa el vendedor). */
  private async notify(o: any, autorId: string, texto: string) {"""

ON3 = """  /**
   * EL BOTÓN «ESCRIBIR A LA TIENDA»: vuelve a poner la TARJETA de ESE pedido en el chat.
   *
   * POR QUÉ (lo reportó el dueño): la tarjeta se publica al CREAR el pedido, así que en una
   * conversación con varias compras el comerciante no sabe de cuál se le habla, y en un pedido
   * anterior a la tarjeta no hay ninguna. Al pulsar el botón se pone delante la de ese pedido, ya con
   * el nombre, la forma de pago y la entrega.
   *
   * Autorización: `publicOrder` deja pasar solo al comprador, a la tienda o a un admin. NO se publica
   * en grupos: la dirección del comprador no es asunto de un grupo.
   */
  async publicarTarjetaEnChat(userId: string, orderIdRaw: string) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, userId);
    const comprador = String(o.buyer_id ?? '');
    const tienda = String(o.shop_owner ?? '');
    if (!comprador || !tienda) throw new DomainError('ORDER_NOT_FOUND', 'Ese pedido no tiene tienda');
    const detalle = (await this.orderDetail(orderId, userId)).order;
    const conv = await this.conversacionDirecta(comprador, tienda);
    if (!conv) throw new DomainError('CHAT_NOT_AVAILABLE', 'No se pudo abrir el chat del pedido');
    await this.publicarPedido(detalle, comprador, undefined, conv, userId);
    return { ok: true, conversationId: String(conv.id) };
  }

  /** Aviso en el chat comprador\u2194tienda (o con el comprador, si avisa el vendedor). */
  private async notify(o: any, autorId: string, texto: string) {"""

# ── orders.controller.ts: la ruta nueva ─────────────────────────────────────
CA1 = """  /** El vendedor confirma la entrega con el código que le da el comprador. */
  @Post(':id/confirm-code')
  @UseGuards(JwtAuthGuard)
  confirmCode(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.confirmDeliveryCode(u.userId, id, String(body?.code ?? ''));
  }
}"""

CN1 = """  /** El vendedor confirma la entrega con el código que le da el comprador. */
  @Post(':id/confirm-code')
  @UseGuards(JwtAuthGuard)
  confirmCode(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.confirmDeliveryCode(u.userId, id, String(body?.code ?? ''));
  }

  /**
   * «ESCRIBIR A LA TIENDA»: deja la tarjeta de ESE pedido en el chat comprador\u2194tienda.
   *
   * Devuelve la conversación, para que la app abra la buena y no otra del mismo comerciante.
   */
  @Post(':id/chat-card')
  @UseGuards(JwtAuthGuard)
  chatCard(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.publicarTarjetaEnChat(u.userId, id);
  }
}"""

# ── lifebook.service.ts: el orderRef que lee la app ─────────────────────────
LA1 = """        buyerName: payload.buyerName ? String(payload.buyerName) : null,
        shopName: payload.shopName ? String(payload.shopName) : null,
        social: payload.social === true,"""

LN1 = """        buyerName: payload.buyerName ? String(payload.buyerName) : null,
        shopName: payload.shopName ? String(payload.shopName) : null,
        social: payload.social === true,
        /**
         * EL TICKET (lo que pidió el dueño): forma de pago y dónde/cómo se entrega, además del
         * nombre que ya venía. En las tarjetas de GRUPO (`social`) van en `null` a propósito: la
         * dirección y la nota del comprador no tienen por qué verlas un grupo.
         */
        paymentMethod: payload.social === true ? null : (payload.paymentMethod ? String(payload.paymentMethod) : null),
        deliveryAddress: payload.social === true ? null : (payload.deliveryAddress ?? null),
        note: payload.social === true ? null : (payload.note ? String(payload.note) : null),"""

PIEZAS = [
    (ORDENES, [(OA1, ON1), (OA2, ON2), (OA3, ON3)]),
    (CONTROL, [(CA1, CN1)]),
    (LIFEBOOK, [(LA1, LN1)]),
]


def main():
    fuentes = {}
    problemas = []
    for ruta, cambios in PIEZAS:
        src = open(ruta, encoding='utf-8').read()
        fuentes[ruta] = src
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
    print('parche73 aplicado: la tarjeta del pedido lleva el ticket, y el botón la vuelve a poner.')
    return 0


sys.exit(main())
