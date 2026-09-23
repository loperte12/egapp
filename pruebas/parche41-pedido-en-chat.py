# =============================================================================
# parche41 — MERCADO, tanda E: EL PEDIDO VIVE EN EL CHAT
#
# Qué hace (servidor):
#   1. `orders.service.ts`
#      · `OrderInput.conversationId` (la conversación donde nació la compra).
#      · `conversacionDirecta()` y `publicarEnChat()` extraídos del `notify()` que ya existía.
#      · `publicarPedido()`: publica la TARJETA del pedido (`kind='order'`) en el chat
#        comprador↔tienda SIEMPRE y, si la compra nació en un grupo del comprador, también allí
#        con el aviso social («✅ {nombre} compró {producto}»).
#      · `createOrder()` la llama al final, solo si el pedido es NUEVO y sin poder tumbar la compra.
#   2. `lifebook.service.ts`
#      · `'order'` entra en los tipos por defecto y en los buscables.
#      · El JOIN con `lifebook.orders` en las dos consultas de mensajes: el ESTADO que se enseña es
#        el VIVO, resuelto al leer, no el del día de la compra.
#      · `serializeMessage` devuelve `orderRef` para que la app pinte la tarjeta.
#
# Uso en el servidor:  python3 /root/parche41-pedido-en-chat.py
# =============================================================================
import re
import shutil
import sys

SELLO = 'pedido-en-chat-20260214'
ORD = '/opt/mirror/app/src/lifebook/orders.service.ts'
LB = '/opt/mirror/app/src/lifebook/lifebook.service.ts'

fallos = []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def escribir(p, s):
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def respaldar(p):
    dst = f'{p}.bak-{SELLO}'
    shutil.copyfile(p, dst)
    print(f'respaldo: {dst}')


def aplicar(p, src, edits):
    for nombre, viejo, nuevo, veces in edits:
        n = src.count(viejo)
        if n != veces:
            fallos.append(f'{p.split("/")[-1]} [{nombre}]: esperaba {veces} apariciones y hay {n}')
            continue
        src = src.replace(viejo, nuevo)
        print(f'  ok · {nombre} ({n})')
    return src


# ─────────────────────────── orders.service.ts ───────────────────────────────
ORD_EDITS = []

ORD_EDITS.append((
    'OrderInput.conversationId',
    """  paymentMethod?: string;
  note?: string;
}
""",
    """  paymentMethod?: string;
  note?: string;
  /**
   * MERCADO (tanda E): conversación donde nació la compra. Si es un GRUPO del que el comprador es
   * miembro, el pedido se publica ahí como prueba social («✅ {nombre} compró {producto}»). El chat
   * con la tienda recibe la tarjeta SIEMPRE, tenga o no este campo.
   */
  conversationId?: string;
}
""",
    1,
))

ORD_EDITS.append((
    'createOrder publica la tarjeta',
    """    const result = 'replayed' in created ? created.replayed : created.created;
    this.log.log(`pedido ${result?.order?.code ?? '?'} creado por ${buyerId}`);
    return result;
""",
    """    const repetido = 'replayed' in created;
    const result = repetido ? created.replayed : created.created;
    this.log.log(`pedido ${result?.order?.code ?? '?'} creado por ${buyerId}`);
    /**
     * MERCADO (tanda E) — EL PEDIDO VIVE EN EL CHAT.
     *
     * Al crear el pedido se publica su TARJETA en la conversación, para que el comprador y la tienda
     * vean qué se pidió, cuánto y en qué estado va SIN salir del chat. Solo cuando el pedido es
     * NUEVO: en un reintento idempotente la tarjeta ya está publicada y repetirla sería ruido.
     *
     * Va DESPUÉS de la transacción y con `catch`: si el chat falla, la compra no se pierde. Nunca al
     * revés — un aviso no puede tumbar un pedido.
     */
    if (!repetido && result?.order) {
      await this.publicarPedido(result.order, buyerId, dto.conversationId)
        .catch((e) => this.log.warn(`el pedido se creó pero no se pudo publicar en el chat: ${(e as Error).message}`));
    }
    return result;
""",
    1,
))

NOTIFY_VIEJO = """  /** Aviso en el chat comprador↔tienda (o con el comprador, si avisa el vendedor). */
  private async notify(o: any, autorId: string, texto: string) {
    try {
      const otro = o.shop_owner === autorId ? o.buyer_id : o.shop_owner;
      if (!otro) return;
      let conv: any[] = await this.db.$queryRaw`
        SELECT id, user_a, user_b FROM lifebook.conversations
         WHERE kind = 'direct' AND ((user_a = ${autorId}::uuid AND user_b = ${otro}::uuid)
                                 OR (user_a = ${otro}::uuid AND user_b = ${autorId}::uuid)) LIMIT 1`;
      if (!conv[0]) {
        conv = await this.db.$queryRaw`
          INSERT INTO lifebook.conversations (kind, user_a, user_b)
          VALUES ('direct', ${autorId}::uuid, ${otro}::uuid) RETURNING id, user_a, user_b`;
      }
      const cuerpo = texto.slice(0, 300);
      await this.db.$executeRaw`
        INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
        VALUES (${conv[0].id}::uuid, ${autorId}::uuid, ${cuerpo}, 'system', '{}'::jsonb)`;
      // Refrescar la vista previa y el no leído, como hace el resto del chat
      const meIsA = conv[0].user_a === autorId;
      await this.db.$executeRaw`
        UPDATE lifebook.conversations
           SET last_message = ${cuerpo}, last_message_at = now(),
               unread_a = unread_a + CASE WHEN ${!meIsA} THEN 1 ELSE 0 END,
               unread_b = unread_b + CASE WHEN ${meIsA} THEN 1 ELSE 0 END
         WHERE id = ${conv[0].id}::uuid`;
    } catch (e) {
      this.log.warn(`no se pudo avisar del pedido: ${(e as Error).message}`);
    }
  }
"""

NOTIFY_NUEVO = """  /** Conversación 1 a 1 entre dos personas (se crea si no existe). */
  private async conversacionDirecta(a: string, b: string) {
    let conv: any[] = await this.db.$queryRaw`
      SELECT id, user_a, user_b FROM lifebook.conversations
       WHERE kind = 'direct' AND ((user_a = ${a}::uuid AND user_b = ${b}::uuid)
                               OR (user_a = ${b}::uuid AND user_b = ${a}::uuid)) LIMIT 1`;
    if (!conv[0]) {
      conv = await this.db.$queryRaw`
        INSERT INTO lifebook.conversations (kind, user_a, user_b)
        VALUES ('direct', ${a}::uuid, ${b}::uuid) RETURNING id, user_a, user_b`;
    }
    return conv[0] ?? null;
  }

  /**
   * Inserta un mensaje del SERVIDOR en una conversación y deja la vista previa al día.
   *
   * En 1 a 1 sube el contador de no leídos del otro; en un GRUPO el no leído lo lleva
   * `group_members.last_read_at`, así que ahí solo se refresca la vista previa.
   */
  private async publicarEnChat(conv: any, autorId: string, cuerpo: string, kind: string, payload: Record<string, unknown>) {
    const texto = cuerpo.slice(0, 300);
    await this.db.$executeRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${conv.id}::uuid, ${autorId}::uuid, ${texto}, ${kind}, ${JSON.stringify(payload)}::jsonb)`;
    if (String(conv.kind ?? 'direct') === 'group') {
      await this.db.$executeRaw`
        UPDATE lifebook.conversations SET last_message = ${texto}, last_message_at = now()
         WHERE id = ${conv.id}::uuid`;
      return;
    }
    const meIsA = conv.user_a === autorId;
    await this.db.$executeRaw`
      UPDATE lifebook.conversations
         SET last_message = ${texto}, last_message_at = now(),
             unread_a = unread_a + CASE WHEN ${!meIsA} THEN 1 ELSE 0 END,
             unread_b = unread_b + CASE WHEN ${meIsA} THEN 1 ELSE 0 END
       WHERE id = ${conv.id}::uuid`;
  }

  /**
   * MERCADO (tanda E) — publica la TARJETA del pedido (`kind='order'`).
   *
   *  1. En el chat comprador↔tienda SIEMPRE: es donde se habla de la entrega.
   *  2. En el GRUPO donde nació la compra, solo si de verdad es un grupo del comprador, con el
   *     aviso social («✅ {nombre} compró {producto}») que pide la especificación del Mercado.
   *
   * El payload guarda la FOTO del momento (título, variante, cantidad, importes) y el estado
   * inicial; el estado que se ve lo resuelve el servidor al LEER el mensaje, así que la tarjeta
   * nunca enseña un estado viejo.
   */
  private async publicarPedido(order: any, buyerId: string, conversationId?: string) {
    const yo: any[] = await this.db.$queryRaw`
      SELECT full_name FROM mobility.users WHERE id = ${buyerId}::uuid LIMIT 1`;
    const buyerName = yo[0]?.full_name ? String(yo[0].full_name) : 'Alguien';
    const items = (Array.isArray(order.items) ? order.items : []).slice(0, MAX_LINES).map((i: any) => ({
      title: String(i?.titleSnapshot ?? '').slice(0, 200),
      variant: i?.variantSnapshot ? String(i.variantSnapshot).slice(0, 140) : null,
      mediaUrl: i?.mediaUrl ? String(i.mediaUrl) : null,
      quantity: Number(i?.quantity ?? 1) || 1,
      lineTotalXaf: Number(i?.lineTotalXaf ?? 0) || 0,
    }));
    const base = {
      orderId: String(order.id),
      code: String(order.code ?? ''),
      buyerName,
      shopName: order.shop?.name ? String(order.shop.name) : null,
      items,
      totalXaf: Number(order.totalXaf ?? 0) || 0,
      deliveryMode: order.deliveryMode ? String(order.deliveryMode) : null,
      status: String(order.status ?? 'created'),
    };
    const tienda = String(order.shop?.ownerId ?? '');
    if (tienda && tienda !== buyerId) {
      const conv = await this.conversacionDirecta(buyerId, tienda);
      if (conv) await this.publicarEnChat(conv, buyerId, `🧾 Pedido ${base.code}`, 'order', { ...base, social: false });
    }
    // El grupo: solo si es un GRUPO y soy miembro (nunca se publica en un chat ajeno).
    const gid = String(conversationId ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gid)) return;
    const g: any[] = await this.db.$queryRaw`
      SELECT c.id, c.user_a, c.user_b, c.kind FROM lifebook.conversations c
       WHERE c.id = ${gid}::uuid AND c.kind = 'group'
         AND EXISTS (SELECT 1 FROM lifebook.group_members gm
                      WHERE gm.conversation_id = c.id AND gm.user_id = ${buyerId}::uuid) LIMIT 1`;
    if (!g[0]) return;
    const titulo = items[0]?.title ?? 'un producto';
    await this.publicarEnChat(g[0], buyerId, `✅ ${buyerName} compró «${titulo}»`, 'order', { ...base, social: true });
  }

  /** Aviso en el chat comprador↔tienda (o con el comprador, si avisa el vendedor). */
  private async notify(o: any, autorId: string, texto: string) {
    try {
      const otro = o.shop_owner === autorId ? o.buyer_id : o.shop_owner;
      if (!otro) return;
      const conv = await this.conversacionDirecta(autorId, otro);
      if (!conv) return;
      await this.publicarEnChat(conv, autorId, texto, 'system', {});
    } catch (e) {
      this.log.warn(`no se pudo avisar del pedido: ${(e as Error).message}`);
    }
  }
"""

ORD_EDITS.append(('notify + publicarPedido', NOTIFY_VIEJO, NOTIFY_NUEVO, 1))

# ─────────────────────────── lifebook.service.ts ─────────────────────────────
LB_EDITS = []

LB_EDITS.append((
    'DEFAULT_KINDS',
    "const DEFAULT_KINDS = ['text', 'image', 'post', 'sale', 'product', 'file', 'location', 'checkin', 'chain', 'vote', 'ad'];",
    "const DEFAULT_KINDS = ['text', 'image', 'post', 'sale', 'product', 'order', 'file', 'location', 'checkin', 'chain', 'vote', 'ad'];",
    1,
))

LB_EDITS.append((
    'columnas del pedido en las consultas de mensajes',
    """             pr.shop_id AS prod_shop, pr.status AS prod_status
      FROM lifebook.messages m""",
    """             pr.shop_id AS prod_shop, pr.status AS prod_status,
             o.order_no AS ord_no, o.status AS ord_status, o.total_xaf AS ord_total,
             o.delivery_mode AS ord_delivery, o.delivered_at AS ord_delivered
      FROM lifebook.messages m""",
    2,
))

LB_EDITS.append((
    'JOIN con los pedidos',
    """      LEFT JOIN lifebook.products pr ON m.kind = 'product' AND pr.id = (m.payload->>'productId')::uuid
""",
    """      LEFT JOIN lifebook.products pr ON m.kind = 'product' AND pr.id = (m.payload->>'productId')::uuid
      LEFT JOIN lifebook.orders o ON m.kind = 'order'
        AND o.id = CASE WHEN (m.payload->>'orderId') ~ '^[0-9a-f-]{36}$'
                        THEN (m.payload->>'orderId')::uuid ELSE NULL END
""",
    2,
))

LB_EDITS.append((
    'buscador del chat admite pedidos',
    "if (['image', 'file', 'post', 'sale', 'system', 'location', 'vote', 'chain', 'topic', 'checkin', 'ad'].includes(kind)) {",
    "if (['image', 'file', 'post', 'sale', 'system', 'order', 'location', 'vote', 'chain', 'topic', 'checkin', 'ad'].includes(kind)) {",
    1,
))

LB_EDITS.append((
    'tipos buscables',
    "    'text', 'image', 'file', 'post', 'sale', 'location', 'vote', 'chain', 'checkin', 'ad', 'system',\n",
    "    'text', 'image', 'file', 'post', 'sale', 'location', 'vote', 'chain', 'checkin', 'ad', 'system', 'order',\n",
    1,
))

LB_EDITS.append((
    'serializeMessage: orderRef',
    """        asking: payload.productAsking === true,
      };
    } else if (kind === 'image') {
""",
    """        asking: payload.productAsking === true,
      };
    } else if (kind === 'order') {
      /**
       * MERCADO (tanda E) — TARJETA DE PEDIDO.
       *
       * El ESTADO sale del JOIN con `lifebook.orders` (`ord_status`), NO del payload: así el mensaje
       * enseña el estado VIVO aunque se escribiera hace una semana (mismo criterio que el precio de
       * la tarjeta de producto, que se resuelve al leer). El artículo (título, variante, foto,
       * cantidad) sí es la foto del momento de la compra, que es la verdad histórica del pedido:
       * si el producto se borra, el pedido sigue contando qué se compró.
       */
      const items = Array.isArray(payload.items) ? (payload.items as any[]) : [];
      const vivo = m.ord_no !== null && m.ord_no !== undefined;
      out.orderRef = {
        id: String(payload.orderId ?? ''),
        code: vivo ? String(m.ord_no) : String(payload.code ?? ''),
        status: vivo ? String(m.ord_status ?? 'created') : String(payload.status ?? 'created'),
        totalXaf: Number(vivo ? m.ord_total : payload.totalXaf) || 0,
        deliveryMode: vivo && m.ord_delivery ? String(m.ord_delivery) : (payload.deliveryMode ? String(payload.deliveryMode) : null),
        createdAt: m.created_at ? String(m.created_at) : null,
        deliveredAt: vivo && m.ord_delivered ? String(m.ord_delivered) : null,
        buyerName: payload.buyerName ? String(payload.buyerName) : null,
        shopName: payload.shopName ? String(payload.shopName) : null,
        social: payload.social === true,
        items: items.slice(0, 20).map((i) => ({
          title: String(i?.title ?? ''),
          variant: i?.variant ? String(i.variant) : null,
          mediaUrl: i?.mediaUrl ? String(i.mediaUrl) : null,
          quantity: Number(i?.quantity ?? 1) || 1,
          lineTotalXaf: Number(i?.lineTotalXaf ?? 0) || 0,
        })),
      };
    } else if (kind === 'image') {
""",
    1,
))


def main():
    ord_src = leer(ORD)
    lb_src = leer(LB)
    if 'publicarPedido' in ord_src or 'orderRef' in lb_src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    respaldar(ORD)
    respaldar(LB)
    ord_src = aplicar(ORD, ord_src, ORD_EDITS)
    lb_src = aplicar(LB, lb_src, LB_EDITS)
    if fallos:
        print('\nNO SE ESCRIBE NADA. Fallos:')
        for f in fallos:
            print(' -', f)
        return 1
    escribir(ORD, ord_src)
    escribir(LB, lb_src)
    print('\nescritos los dos ficheros.')
    return 0


sys.exit(main())
