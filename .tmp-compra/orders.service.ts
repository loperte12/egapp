// =============================================================================
// lb36-orders.service.ts — LIFE BOOK · PEDIDOS DEL COMERCIO (Parte 36)
//
// Construido sobre lo que el dueño envió, con las correcciones necesarias:
//   · Extiende la tabla `lifebook.orders` que YA existía (44 pedidos antiguos).
//   · Autorización: el comprador o el vendedor del pedido; nadie más.
//   · El código de entrega lo ve SOLO el comprador (el vendedor lo confirma).
//   · Una sola idempotencia, por comprador, reservada DENTRO de la transacción.
//   · Stock atómico al crear y DEVUELTO al cancelar/rechazar.
//   · Importes y coste de envío calculados aquí (el cliente no manda dinero).
//   · Sin tiendas mezcladas: un pedido pertenece a UNA tienda.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { DomainError } from '../services/payment-auth.service';

const PAY_METHODS = ['cash_on_delivery', 'billing', 'likebook_wallet', 'in_store', 'deposit', 'transfer'] as const;
const DELIVERY_MODES = ['local_courier', 'taxi_moto', 'road', 'sea', 'air', 'pickup'] as const;
const MAX_LINES = 20;

/** Transiciones permitidas. `created` es el estado inicial del comercio. */
const ACTIONS: Record<string, { to: string; who: 'seller' | 'buyer' }> = {
  accept: { to: 'confirmed', who: 'seller' },
  decline: { to: 'cancelled', who: 'seller' },
  prepare: { to: 'preparing', who: 'seller' },
  send: { to: 'in_transit', who: 'seller' },
  ready: { to: 'ready_pickup', who: 'seller' },
  deliver: { to: 'delivered', who: 'seller' },
  cancel: { to: 'cancelled', who: 'buyer' },
  dispute: { to: 'disputed', who: 'buyer' },
};

const FROM: Record<string, string[]> = {
  accept: ['created'],
  decline: ['created'],
  prepare: ['confirmed'],
  send: ['preparing', 'confirmed'],
  ready: ['preparing', 'confirmed'],
  deliver: ['in_transit', 'ready_pickup'],
  cancel: ['created', 'confirmed', 'preparing'],
  dispute: ['confirmed', 'preparing', 'in_transit', 'ready_pickup', 'delivered'],
};

export interface OrderInput {
  items?: { productId?: string; variantId?: string | null; quantity?: number }[];
  deliveryMode?: string;
  deliveryAddress?: { city?: string; zone?: string; reference?: string; lat?: number; lng?: number } | null;
  paymentMethod?: string;
  note?: string;
  /**
   * TANDA Q: código del cupón que la persona quiere aplicar. El descuento lo calcula el SERVIDOR
   * (`resolverCupon`), nunca la app: aquí solo viaja el código.
   */
  couponCode?: string;
  /**
   * MERCADO (tanda E): conversación donde nació la compra. Si es un GRUPO del que el comprador es
   * miembro, el pedido se publica ahí como prueba social («✅ {nombre} compró {producto}»). El chat
   * con la tienda recibe la tarjeta SIEMPRE, tenga o no este campo.
   */
  conversationId?: string;
}

@Injectable()
export class LifebookOrdersService {
  private readonly log = new Logger('LifebookOrders');

  constructor(private readonly db: MobilityPrismaService) {}

  private uuid(v: unknown, field = 'Identificador'): string {
    const s = String(v ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      throw new DomainError('ID_INVALID', `${field} no válido`);
    }
    return s;
  }

  /** Hora de Malabo (UTC+1) para fechas y códigos. */
  private malabo(d = new Date()): Date {
    return new Date(d.getTime() + 60 * 60 * 1000);
  }

  private async nextOrderNo(tx: any): Promise<string> {
    const m = this.malabo();
    const day = `${String(m.getUTCFullYear()).slice(-2)}${String(m.getUTCMonth() + 1).padStart(2, '0')}${String(m.getUTCDate()).padStart(2, '0')}`;
    const rows: any[] = await tx.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.orders WHERE order_no LIKE ${'LB-' + day + '-%'}`;
    const n = Number(rows[0]?.n ?? 0) + 1;
    return `LB-${day}-${String(n).padStart(4, '0')}`;
  }

  // ───────────────────────────── CREAR ──────────────────────────────────────
  async createOrder(buyerId: string, dto: OrderInput, idemKey: string) {
    const key = String(idemKey ?? '').trim().slice(0, 120);
    if (!key) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key');

    // Camino rápido: si esa compra ya se completó, se devuelve su pedido.
    const prev: any[] = await this.db.$queryRaw`
      SELECT response FROM lifebook.idempotency_keys
       WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}
         AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`;
    if (prev[0]?.response) return prev[0].response;

    const rawItems = Array.isArray(dto.items) ? dto.items : [];
    if (!rawItems.length) throw new DomainError('ITEMS_REQUIRED', 'El pedido no tiene artículos');
    if (rawItems.length > MAX_LINES) throw new DomainError('ITEMS_LIMIT', `Como máximo ${MAX_LINES} artículos por pedido`);

    const deliveryMode = String(dto.deliveryMode ?? '').trim().toLowerCase();
    if (!(DELIVERY_MODES as readonly string[]).includes(deliveryMode)) {
      throw new DomainError('DELIVERY_MODE_INVALID', 'Forma de entrega no válida');
    }
    const paymentMethod = String(dto.paymentMethod ?? '').trim().toLowerCase();
    if (!(PAY_METHODS as readonly string[]).includes(paymentMethod)) {
      throw new DomainError('PAYMENT_METHOD_INVALID', 'Método de pago no válido');
    }
    const addr = (dto.deliveryAddress ?? {}) as Record<string, unknown>;
    const city = String(addr.city ?? '').trim().slice(0, 60);
    const zone = String(addr.zone ?? '').trim().slice(0, 60);
    const reference = String(addr.reference ?? '').trim().slice(0, 200);
    // Dirección obligatoria salvo recogida en tienda (si no, se pide reparto sin dirección).
    if (deliveryMode !== 'pickup' && (!city || (!zone && !reference))) {
      throw new DomainError('ADDRESS_REQUIRED', 'Indica ciudad y barrio o un punto de referencia para la entrega');
    }
    const lat = Number(addr.lat);
    const lng = Number(addr.lng);
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const note = dto.note ? String(dto.note).trim().slice(0, 300) : null;

    // Productos (con su tienda) y variantes en dos consultas
    const productIds = rawItems.map((i) => this.uuid(i?.productId, 'Producto'));
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.id, p.shop_id, p.title, p.price_xaf, p.price_mode, p.stock_mode, p.stock_quantity,
             p.status, p.media, p.service_type,
             s.is_active AS shop_active, s.name AS shop_name, s.owner_id AS shop_owner
        FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ANY(${productIds}::uuid[])`;
    const byId = new Map(rows.map((r) => [r.id, r]));

    const variantIds = rawItems.map((i) => i?.variantId).filter(Boolean).map((v) => this.uuid(v, 'Opción'));
    const variants: any[] = variantIds.length
      ? await this.db.$queryRaw`SELECT * FROM lifebook.product_variants WHERE id = ANY(${variantIds}::uuid[])`
      : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));

    // Validaciones y cálculo de líneas (SIEMPRE en servidor)
    let shopId: string | null = null;
    const lineas: {
      productId: string; variantId: string | null; title: string; variantName: string | null;
      mediaUrl: string | null; quantity: number; unitPriceXaf: number; lineTotalXaf: number;
      attributes: Record<string, unknown>; stockMode: string;
    }[] = [];

    for (const item of rawItems) {
      const pid = this.uuid(item?.productId, 'Producto');
      const product = byId.get(pid);
      if (!product) throw new DomainError('PRODUCT_NOT_AVAILABLE', 'Uno de los artículos ya no existe');
      if (product.status !== 'active') throw new DomainError('PRODUCT_NOT_AVAILABLE', `«${product.title}» ya no está disponible`);
      if (!product.shop_active) throw new DomainError('SHOP_INACTIVE', 'La tienda ya no está abierta');
      if (product.shop_owner === buyerId) throw new DomainError('CANNOT_BUY_OWN', 'No puedes comprarte tus propias publicaciones');
      // 🔒 Una HABITACIÓN no se pide: se reserva.
      //
      // La habitación de un hotel ES una publicación de Life Book (`service_type='hotel_room'`),
      // así que sin esta puerta entraba por aquí y se podía «comprar» una habitación como si fuera
      // un producto: cantidad 1, recogida en tienda, sin fechas, sin noches y **sin comprobar
      // disponibilidad** — saltándose `reservation_nights`, que es la única verdad contra la
      // sobreventa. Y el dinero entraba por el flujo de PEDIDOS, no por el de RESERVAS. Se
      // reprodujo de verdad: pedido LB-260911-0001 aceptado con 200/201 sobre una habitación.
      //
      // El camino correcto es `POST .../hotel/reservations`, que sí valida fechas, inventario,
      // estancia mínima, capacidad, cierre de fechas y señal. Por eso aquí se corta con un código
      // propio y un mensaje que dice a dónde ir.
      if (String(product.service_type) === 'hotel_room') {
        throw new DomainError('SERVICE_NOT_ORDERABLE',
          `«${product.title}» es alojamiento: se reserva por noches, no se pide. Elige las fechas en la ficha del hotel`);
      }
      if (!shopId) shopId = product.shop_id;
      else if (shopId !== product.shop_id) {
        throw new DomainError('MULTI_SHOP_NOT_SUPPORTED', 'Cada pedido es de una sola tienda: haz un pedido por tienda');
      }
      const quantity = Math.floor(Number(item?.quantity ?? 0));
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new DomainError('QUANTITY_INVALID', 'Cantidad no válida (1 a 99)');
      }
      if (product.price_mode === 'on_request' && product.price_xaf === null) {
        throw new DomainError('PRICE_ON_REQUEST', 'Ese artículo se presupuesta por el chat: escríbele a la tienda');
      }
      let unitPriceXaf = Number(product.price_xaf ?? 0);
      let variantName: string | null = null;
      let attributes: Record<string, unknown> = {};
      let variantId: string | null = null;
      if (item?.variantId) {
        const vid = this.uuid(item.variantId, 'Opción');
        const variant = variantById.get(vid);
        if (!variant || variant.product_id !== pid) {
          throw new DomainError('VARIANT_NOT_FOUND', `La opción elegida de «${product.title}» no existe`);
        }
        variantId = vid;
        variantName = variant.name;
        attributes = (variant.attributes ?? {}) as Record<string, unknown>;
        if (variant.price_xaf !== null && variant.price_xaf !== undefined) unitPriceXaf = Number(variant.price_xaf);
      }
      lineas.push({
        productId: pid,
        variantId,
        title: String(product.title).slice(0, 200),
        variantName: variantName ? String(variantName).slice(0, 140) : null,
        mediaUrl: (Array.isArray(product.media) ? product.media : [])[0]?.url ?? null,
        quantity,
        unitPriceXaf,
        lineTotalXaf: unitPriceXaf * quantity,
        attributes,
        stockMode: String(product.stock_mode ?? 'exact'),
      });
    }

    const shop = byId.get(lineas[0].productId);

    // El método de pago debe estar ACEPTADO y ACTIVO en esa tienda
    const pm: any[] = await this.db.$queryRaw`
      SELECT method, status FROM lifebook.shop_payment_methods WHERE shop_id = ${shop.shop_id}::uuid`;
    const aceptado = pm.find((m) => m.method === paymentMethod);
    if (!aceptado || aceptado.status !== 'active') {
      throw new DomainError('PAYMENT_METHOD_NOT_ACCEPTED', 'La tienda no acepta ese método de pago');
    }

    // Coste de entrega: recogida 0; política con coste fijo; si no, a acordar con la tienda
    const policies: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.shipping_policies WHERE shop_id = ${shop.shop_id}::uuid
       ORDER BY is_default DESC, created_at LIMIT 1`;
    const policy = policies[0] ?? null;
    let deliveryCostXaf = 0;
    let deliveryNote: string | null = null;
    if (deliveryMode !== 'pickup') {
      if (!policy || policy.cost_mode === 'on_request') {
        deliveryNote = 'El coste del envío se acuerda con la tienda por el chat';
      } else if (policy.cost_mode === 'fixed') {
        deliveryCostXaf = Number(policy.base_cost_xaf ?? 0);
      } else {
        deliveryNote = 'El coste del envío se calcula con la tienda según la distancia';
      }
    }

    const subtotalXaf = lineas.reduce((a, l) => a + l.lineTotalXaf, 0);
    /**
     * EL CUPÓN (tanda Q). El descuento lo decide ESTE lado, nunca la app: un cupón no puede valer
     * más que la compra, ni de otra tienda, ni usarse dos veces. Si el código no sirve, se corta con
     * el motivo exacto y la app lo enseña tal cual.
     */
    const cupon = await this.resolverCupon(buyerId, shop.shop_id, dto.couponCode, subtotalXaf);
    const discountXaf = cupon?.discountXaf ?? 0;
    const totalXaf = Math.max(0, subtotalXaf + deliveryCostXaf - discountXaf);
    // Código de entrega solo para contra entrega: es lo que confirma quien recibe.
    const deliveryCode = paymentMethod === 'cash_on_delivery' ? String(randomInt(1000, 9999)) : null;

    const created = await this.db.$transaction(async (tx: any) => {
      // 1) Reserva de la clave ANTES de tocar nada (idempotencia segura)
      const reservado: number = await tx.$executeRaw`
        INSERT INTO lifebook.idempotency_keys (user_id, endpoint, key)
        VALUES (${buyerId}::uuid, 'createOrder', ${key})
        ON CONFLICT (user_id, endpoint, key) DO NOTHING`;
      if (!reservado) {
        const cur: any[] = await tx.$queryRaw`
          SELECT response FROM lifebook.idempotency_keys
           WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key} LIMIT 1`;
        if (cur[0]?.response) return { replayed: cur[0].response };
        throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'Ese pedido ya se está creando, espera un momento');
      }

      // 2) Stock atómico (solo cuando se lleva la cuenta)
      for (const l of lineas) {
        if (l.variantId) {
          const v: any[] = await tx.$queryRaw`SELECT stock_quantity FROM lifebook.product_variants WHERE id = ${l.variantId}::uuid`;
          if (v[0] && Number(v[0].stock_quantity) >= 0) {
            const ok: number = await tx.$executeRaw`
              UPDATE lifebook.product_variants SET stock_quantity = stock_quantity - ${l.quantity}
               WHERE id = ${l.variantId}::uuid AND stock_quantity >= ${l.quantity}`;
            if (!ok) throw new DomainError('STOCK_INSUFFICIENT', `Ya no queda stock de «${l.title}» (${l.variantName ?? ''})`.trim());
          }
        } else if (l.stockMode === 'exact') {
          const ok: number = await tx.$executeRaw`
            UPDATE lifebook.products SET stock_quantity = stock_quantity - ${l.quantity}, updated_at = now()
             WHERE id = ${l.productId}::uuid AND stock_quantity >= ${l.quantity}`;
          if (!ok) throw new DomainError('STOCK_INSUFFICIENT', `Ya no queda stock de «${l.title}»`);
        } else if (l.stockMode === 'approximate') {
          await tx.$executeRaw`
            UPDATE lifebook.products SET stock_quantity = GREATEST(0, stock_quantity - ${l.quantity}), updated_at = now()
             WHERE id = ${l.productId}::uuid`;
        }
      }

      // 3) EL CUPÓN, si lo hay: se marca usado AQUÍ DENTRO, con guardas.
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
      const orderNo = await this.nextOrderNo(tx);
      const orderRows: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.orders
          (order_no, shop_id, buyer_id, seller_id, status, payment_method, payment_status,
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
           ${totalXaf}, ${lineas[0].title})
        RETURNING *`;
      const order = orderRows[0];

      for (const l of lineas) {
        await tx.$executeRaw`
          INSERT INTO lifebook.order_items
            (order_id, product_id, variant_id, title_snapshot, variant_snapshot, media_url,
             quantity, unit_price_xaf, line_total_xaf, attributes_snapshot)
          VALUES
            (${order.id}::uuid, ${l.productId}::uuid, ${l.variantId}::uuid, ${l.title}, ${l.variantName},
             ${l.mediaUrl}, ${l.quantity}, ${l.unitPriceXaf}, ${l.lineTotalXaf}, ${JSON.stringify(l.attributes)}::jsonb)`;
      }

      // La respuesta que se guarda y se devuelve es la MISMA que el detalle
      // (antes se guardaba la fila cruda y el cliente no la entendía).
      const publica = (await this.orderDetail(order.id, buyerId, tx)).order;
      await tx.$executeRaw`
        UPDATE lifebook.idempotency_keys SET response = ${JSON.stringify({ order: publica })}::jsonb, expires_at = now() + interval '2 days'
         WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}`;
      return { created: { order: publica } };
    });

    const repetido = 'replayed' in created;
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
  }

  // ───────────────────────────── LEER ───────────────────────────────────────
  /**
   * Pedido con sus datos de tienda y comprador.
   *
   * 🔒 **Aquí se comprueba QUIÉN puede verlo**, y no se deja en manos de quien
   * llame. Antes este método devolvía el pedido sin mirar el visor y eran los
   * llamantes quienes decidían: bastaba un camino nuevo que se olvidara de
   * comprobarlo para servir un pedido ajeno (es el fallo que se vio en la
   * revisión del `getOrder` recibido, donde un `if (requesterId && …)` dejaba la
   * puerta abierta cuando no llegaba la identidad). Ahora la puerta está cerrada
   * en el único sitio por el que se leen pedidos: comprador, tienda o admin.
   *
   * El código de entrega NO se toca aquí: quien lo entrega es `orderDetail`
   * (solo al comprador).
   */
  async publicOrder(orderId: string, viewerId: string | undefined, db: any = this.db) {
    const rows: any[] = await db.$queryRaw`
      SELECT o.*, s.name AS shop_name, s.logo_url AS shop_logo, s.owner_id AS shop_owner,
             u.full_name AS buyer_name, u.avatar_url AS buyer_avatar,
             (SELECT count(*)::int FROM lifebook.order_items i WHERE i.order_id = o.id) AS items_count
        FROM lifebook.orders o
        LEFT JOIN lifebook.shops s ON s.id = o.shop_id
        LEFT JOIN mobility.users u ON u.id = o.buyer_id
       WHERE o.id = ${orderId}::uuid LIMIT 1`;
    const o = rows[0];
    if (!o) throw new DomainError('ORDER_NOT_FOUND', 'El pedido no existe');

    // Sin identidad NO se lee: la ausencia de visor nunca amplía el acceso.
    const esComprador = !!viewerId && o.buyer_id === viewerId;
    const esVendedor = !!viewerId && (o.shop_owner === viewerId || o.seller_id === viewerId);
    if (!esComprador && !esVendedor) {
      const esAdmin = !!viewerId && (await this.isAdmin(viewerId));
      if (!esAdmin) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Este pedido no es tuyo');
    }
    return o;
  }

  async orderDetail(orderIdRaw: string, viewerId: string, db: any = this.db) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, viewerId, db);
    const esComprador = o.buyer_id === viewerId;
    const esVendedor = o.shop_owner === viewerId || o.seller_id === viewerId;
    const esAdmin = await this.isAdmin(viewerId);
    if (!esComprador && !esVendedor && !esAdmin) {
      throw new DomainError('NOT_ORDER_PARTICIPANT', 'Este pedido no es tuyo');
    }
    const items: any[] = await db.$queryRaw`
      SELECT id, product_id, variant_id, title_snapshot, variant_snapshot, media_url,
             quantity, unit_price_xaf, line_total_xaf
        FROM lifebook.order_items WHERE order_id = ${orderId}::uuid ORDER BY created_at`;
    return {
      order: {
        id: o.id,
        code: o.order_no,
        status: o.status,
        role: esComprador ? 'buyer' : esVendedor ? 'seller' : 'admin',
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        deliveryMode: o.delivery_mode,
        deliveryAddress: o.delivery_address ?? {},
        deliveryCostXaf: Number(o.delivery_cost_xaf ?? 0),
        subtotalXaf: Number(o.subtotal_xaf ?? 0) || Number(o.price_xaf ?? 0),
        /** TANDA Q: lo que quitó el cupón (0 si no se usó ninguno). */
        discountXaf: Number(o.discount_xaf ?? 0),
        couponCode: o.coupon_code ? String(o.coupon_code) : null,
        totalXaf: Number(o.total_xaf ?? 0) || Number(o.price_xaf ?? 0),
        // 🔒 El código se da SOLO al comprador: es él quien lo entrega al recibir.
        deliveryCode: esComprador ? o.delivery_code : null,
        note: o.message,
        items: items.map((i) => ({
          id: i.id,
          productId: i.product_id,
          variantId: i.variant_id,
          titleSnapshot: i.title_snapshot,
          variantSnapshot: i.variant_snapshot,
          mediaUrl: i.media_url,
          quantity: Number(i.quantity),
          unitPriceXaf: Number(i.unit_price_xaf),
          lineTotalXaf: Number(i.line_total_xaf),
        })),
        shop: o.shop_id ? { id: o.shop_id, name: o.shop_name, logoUrl: o.shop_logo, ownerId: o.shop_owner } : null,
        buyer: esVendedor ? { id: o.buyer_id, name: o.buyer_name, avatarUrl: o.buyer_avatar } : undefined,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        paidAt: o.paid_at,
        deliveredAt: o.delivered_at,
      },
    };
  }

  /** Mis pedidos: como comprador (`side=buyer`) o como vendedor (`side=seller`). */
  async myOrders(userId: string, side: string) {
    const comoVendedor = side === 'seller';
    const rows: any[] = comoVendedor
      ? await this.db.$queryRaw`
          SELECT o.*, s.name AS shop_name, u.full_name AS buyer_name,
                 (SELECT count(*)::int FROM lifebook.order_items i WHERE i.order_id = o.id) AS items_count,
                 (SELECT i.title_snapshot FROM lifebook.order_items i WHERE i.order_id = o.id ORDER BY i.created_at LIMIT 1) AS first_title,
                 (SELECT i.media_url FROM lifebook.order_items i WHERE i.order_id = o.id ORDER BY i.created_at LIMIT 1) AS first_media
            FROM lifebook.orders o
            LEFT JOIN lifebook.shops s ON s.id = o.shop_id
            LEFT JOIN mobility.users u ON u.id = o.buyer_id
           WHERE o.shop_id IN (SELECT id FROM lifebook.shops WHERE owner_id = ${userId}::uuid)
              OR o.seller_id = ${userId}::uuid
           ORDER BY o.created_at DESC LIMIT 80`
      : await this.db.$queryRaw`
          SELECT o.*, s.name AS shop_name, s.logo_url AS shop_logo,
                 (SELECT count(*)::int FROM lifebook.order_items i WHERE i.order_id = o.id) AS items_count,
                 (SELECT i.title_snapshot FROM lifebook.order_items i WHERE i.order_id = o.id ORDER BY i.created_at LIMIT 1) AS first_title,
                 (SELECT i.media_url FROM lifebook.order_items i WHERE i.order_id = o.id ORDER BY i.created_at LIMIT 1) AS first_media
            FROM lifebook.orders o
            LEFT JOIN lifebook.shops s ON s.id = o.shop_id
           WHERE o.buyer_id = ${userId}::uuid
           ORDER BY o.created_at DESC LIMIT 80`;
    return {
      side: comoVendedor ? 'seller' : 'buyer',
      orders: rows.map((o) => ({
        id: o.id,
        code: o.order_no,
        status: o.status,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        deliveryMode: o.delivery_mode,
        totalXaf: Number(o.total_xaf ?? 0) || Number(o.price_xaf ?? 0),
        deliveryCostXaf: Number(o.delivery_cost_xaf ?? 0),
        itemsCount: Number(o.items_count ?? 0),
        title: o.first_title ?? o.title ?? 'Pedido',
        mediaUrl: o.first_media,
        shop: o.shop_id ? { id: o.shop_id, name: o.shop_name, logoUrl: o.shop_logo } : null,
        buyer: comoVendedor ? { id: o.buyer_id, name: o.buyer_name } : undefined,
        note: o.message,
        createdAt: o.created_at,
      })),
    };
  }

  /**
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
  async orderAction(userId: string, orderIdRaw: string, action: string) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const a = String(action ?? '').trim().toLowerCase();
    const cfg = ACTIONS[a];
    if (!cfg) throw new DomainError('ACTION_INVALID', 'Acción no válida');
    const o = await this.publicOrder(orderId, userId);
    const esComprador = o.buyer_id === userId;
    const esVendedor = o.shop_owner === userId || o.seller_id === userId;
    if (cfg.who === 'seller' && !esVendedor) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo la tienda puede hacer eso');
    if (cfg.who === 'buyer' && !esComprador) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo el comprador puede hacer eso');
    if (!(FROM[a] ?? []).includes(o.status)) {
      throw new DomainError('INVALID_STATE_TRANSITION', `No se puede pasar de «${o.status}» con esa acción`);
    }
    // Entregar en efectivo exige el código que tiene el comprador
    if (a === 'deliver' && o.payment_method === 'cash_on_delivery' && !o.delivery_confirmed_at) {
      throw new DomainError('DELIVERY_CODE_REQUIRED', 'Pide al comprador su código de entrega y confírmalo');
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`
        UPDATE lifebook.orders SET status = ${cfg.to}, updated_at = now(),
          delivered_at = CASE WHEN ${cfg.to} = 'delivered' THEN now() ELSE delivered_at END,
          paid_at = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN now() ELSE paid_at END,
          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN 'paid' ELSE payment_status END
         WHERE id = ${orderId}::uuid`;
      // Cancelar o rechazar devuelve el stock
      if (cfg.to === 'cancelled') {
        const items: any[] = await tx.$queryRaw`
          SELECT product_id, variant_id, quantity FROM lifebook.order_items WHERE order_id = ${orderId}::uuid`;
        for (const it of items) {
          if (it.variant_id) {
            await tx.$executeRaw`
              UPDATE lifebook.product_variants SET stock_quantity = stock_quantity + ${Number(it.quantity)}
               WHERE id = ${it.variant_id}::uuid`;
          } else if (it.product_id) {
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
    });

    const aviso = {
      accept: 'La tienda aceptó tu pedido',
      decline: 'La tienda rechazó el pedido',
      prepare: 'Tu pedido está en preparación',
      send: 'Tu pedido va en camino',
      ready: 'Tu pedido está listo para recoger',
      deliver: 'Pedido entregado',
      cancel: 'El comprador canceló el pedido',
      dispute: 'El comprador abrió una reclamación',
    }[a];
    await this.notify(o, userId, aviso ?? 'El pedido cambió de estado');
    return this.orderDetail(orderId, userId);
  }

  /** El vendedor confirma la entrega con el código del comprador (contra entrega). */
  async confirmDeliveryCode(userId: string, orderIdRaw: string, code: string) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, userId);
    const esVendedor = o.shop_owner === userId || o.seller_id === userId;
    if (!esVendedor) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo la tienda puede confirmar la entrega');
    if (!o.delivery_code) throw new DomainError('DELIVERY_CODE_NOT_APPLICABLE', 'Este pedido no se paga al recibir');
    if (String(code ?? '').trim() !== String(o.delivery_code)) {
      throw new DomainError('DELIVERY_CODE_INVALID', 'El código no coincide con el del comprador');
    }
    if (o.status === 'delivered') throw new DomainError('INVALID_STATE_TRANSITION', 'Ese pedido ya está entregado');
    await this.db.$executeRaw`
      UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
             delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now()
       WHERE id = ${orderId}::uuid`;
    await this.notify(o, userId, 'Pedido entregado y cobrado ✅');
    return this.orderDetail(orderId, userId);
  }

  /** Conversación 1 a 1 entre dos personas (se crea si no existe). */
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
  private async publicarPedido(order: any, buyerId: string, conversationId?: string, chatDirecto?: any, actorId?: string) {
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
    /**
     * LO QUE VE LA TIENDA (y NO lo que ve un grupo): el «ticket».
     *
     * Sin esto la tarjeta no decía ni cómo se paga ni dónde se entrega, y el comerciante no podía
     * preparar el pedido. La DIRECCIÓN es privada del comprador: va solo aquí, en el chat
     * comprador↔tienda; la del grupo se publica desde el mismo `base` pero SIN este bloque.
     */
    const ticket = {
      paymentMethod: order.paymentMethod ? String(order.paymentMethod) : null,
      deliveryAddress: (order.deliveryAddress ?? {}) as Record<string, unknown>,
      note: order.note ? String(order.note).slice(0, 300) : null,
      // TANDA Q: la tienda tiene que saber que esa compra lleva descuento (cobra menos).
      discountXaf: Number(order.discountXaf ?? 0) || 0,
      couponCode: order.couponCode ? String(order.couponCode) : null,
    };
    const tienda = String(order.shop?.ownerId ?? '');
    if (tienda && tienda !== buyerId) {
      const conv = chatDirecto ?? await this.conversacionDirecta(buyerId, tienda);
      if (conv) {
        await this.publicarEnChat(conv, actorId ?? buyerId, `🧾 Pedido ${base.code}`, 'order', { ...base, ...ticket, social: false });
      }
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

  /**
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

  private async isAdmin(userId: string): Promise<boolean> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT 1 FROM mobility.users WHERE id = ${userId}::uuid AND role = 'ADMIN' LIMIT 1`;
    return !!rows[0];
  }
}
