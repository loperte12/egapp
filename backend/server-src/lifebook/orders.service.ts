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
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { WalletService } from '../services/wallet.service';
import { DomainError } from '../services/payment-auth.service';
// El dinero del comercio, en un módulo puro (sin base de datos) para poder probarlo con números.
import { aConfigFee, computeOrderFees, type FeeConfig } from './orders-fees';

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

  constructor(
    private readonly db: MobilityPrismaService,
    // Parche 97: el monedero es la pasarela de pago del comercio (bloquear/liberar/devolver).
    private readonly wallets: WalletService,
  ) {}

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

  /**
   * EL NÚMERO DEL PEDIDO, SIN PELEAS (punto 13 de la acción inmediata).
   *
   * Antes se contaban los pedidos del día y se sumaba 1. Dos compras a la vez contaban lo mismo y
   * calculaban el MISMO número: la segunda chocaba con el índice único (`orders_order_no_key`) y el
   * comprador se quedaba sin pedido, con un error del servidor. El número no se repetía, pero **se
   * perdía la compra**.
   *
   * Ahora el número se aparta contra un **mostrador por día** (`lifebook.order_counters`) con una sola
   * frase atómica, en su PROPIA transacción corta y ANTES de abrir la del pedido:
   *   · atómica: la fila del mostrador se bloquea microsegundos, no la creación entera del pedido. Dos
   *     intentos anteriores (un candado dentro de la transacción) se quedaban con el candado hasta el
   *     commit, las compras simultáneas se ponían en fila durante toda la creación y Prisma cortaba por
   *     tiempo (>5 s): el comprador veía un error;
   *   · y el número queda ESCRITO: el siguiente lo ve. (Con un candado y dos transacciones cortas, las
   *     dos habrían leído el mismo `max`.)
   * Si el pedido fallara después de apartar el número, ese número se pierde y el siguiente continúa: un
   * hueco en la numeración es normal; un número repetido, no.
   */
  private async nextOrderNo(): Promise<string> {
    const m = this.malabo();
    const day = `${String(m.getUTCFullYear()).slice(-2)}${String(m.getUTCMonth() + 1).padStart(2, '0')}${String(m.getUTCDate()).padStart(2, '0')}`;
    const prefijo = 'LB-' + day + '-';
    // Una sola frase: atómica y con el número ya escrito. El `coalesce(...)` de la primera vez cuenta lo
    // que ya existe ese día, para no chocar con los pedidos anteriores (el índice es único).
    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.order_counters (day, ultimo)
      VALUES (${day}, coalesce((SELECT max(substring(order_no from '[0-9]+$')::int)
                                  FROM lifebook.orders WHERE order_no LIKE ${prefijo + '%'}), 0) + 1)
      ON CONFLICT (day) DO UPDATE SET ultimo = lifebook.order_counters.ultimo + 1, updated_at = now()
      RETURNING ultimo`;
    return `${prefijo}${String(Number(filas[0]?.ultimo ?? 1)).padStart(4, '0')}`;
  }

  /**
   * LA HUELLA DEL PEDIDO QUE SE ESTÁ PIDIENDO (punto 12 de la acción inmediata).
   *
   * La clave de idempotencia protege del doble toque… pero solo sirve si el contenido es el mismo. Antes
   * no se guardaba nada del contenido: reutilizar la clave con OTRO pedido devolvía el pedido anterior
   * **en silencio**, así que el comprador creía haber comprado una cosa y había comprado otra. Esta
   * huella (artículos, entrega, pago, dirección y cupón) es lo que permite detectarlo.
   *
   * NO entra la nota libre a propósito: cambiar una coma en el texto no debe romper un reintento.
   */
  private huellaDePedido(dto: OrderInput): string {
    const items = (Array.isArray(dto.items) ? dto.items : [])
      .map((i) => `${i.productId ?? ''}:${i.variantId ?? ''}x${Number(i.quantity) || 0}`)
      .sort();
    const a = (dto.deliveryAddress ?? {}) as Record<string, unknown>;
    const contenido = JSON.stringify({
      items,
      deliveryMode: String(dto.deliveryMode ?? '').trim().toLowerCase(),
      paymentMethod: String(dto.paymentMethod ?? '').trim().toLowerCase(),
      address: [a.city ?? '', a.zone ?? '', a.reference ?? ''].map((v) => String(v).trim()),
      couponCode: String(dto.couponCode ?? '').trim().toUpperCase(),
    });
    return createHash('sha256').update(contenido).digest('hex');
  }

  // ───────────────────────────── CREAR ──────────────────────────────────────
  async createOrder(buyerId: string, dto: OrderInput, idemKey: string, paymentToken?: string) {
    const key = String(idemKey ?? '').trim().slice(0, 120);
    if (!key) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key');

    // Camino rápido: si esa compra ya se completó, se devuelve su pedido.
    const huella = this.huellaDePedido(dto);
    const prev: any[] = await this.db.$queryRaw`
      SELECT response, request_hash FROM lifebook.idempotency_keys
       WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}
         AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`;
    if (prev[0]?.response) {
      // Misma clave y contenido DISTINTO: no se devuelve el pedido viejo en silencio.
      if (prev[0].request_hash && prev[0].request_hash !== huella) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó para otro pedido: manda una clave nueva');
      }
      return prev[0].response;
    }

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

    /**
     * EL NÚMERO SE APARTA AQUÍ, FUERA de la transacción del pedido.
     *
     * Esa es la clave de todo: si se aparta dentro, el bloqueo del mostrador se queda sujeto hasta el
     * commit y las compras simultáneas se ponen en fila durante toda la creación; Prisma corta por
     * tiempo (>5 s) y el comprador ve un error. Apartándolo antes, el bloqueo dura microsegundos.
     */
    /**
     * PAGO CON EL MONEDERO (parche 97): el dinero se RETIENE antes de crear el pedido.
     *
     * El token de pago (PIN, scope ESCROW_LOCK, importe exacto) se consume dentro de la
     * transacción del monedero, así que un token robado no sirve dos veces y no se puede pagar
     * un importe distinto al autorizado. La clave del cerrojo deriva de la Idempotency-Key del
     * pedido: un reintento del comprador no bloquea el dinero dos veces.
     */
    let lockTxId: string | null = null;
    if (paymentMethod === 'likebook_wallet') {
      if (!paymentToken) {
        throw new DomainError('PAYMENT_TOKEN_REQUIRED', 'Falta el token de pago del monedero: confirma con tu PIN');
      }
      const lock = await this.wallets.lockForCommerceOrder({
        userId: buyerId, amount: totalXaf, paymentToken, idempotencyKey: `lb-order:${key}`,
      });
      lockTxId = lock.transactionId;
    }

    const orderNoApartado = await this.nextOrderNo();

    let created: any;
    try {
    created = await this.db.$transaction(async (tx: any) => {
      // 1) Reserva de la clave ANTES de tocar nada (idempotencia segura)
      const reservado: number = await tx.$executeRaw`
        INSERT INTO lifebook.idempotency_keys (user_id, endpoint, key, request_hash)
        VALUES (${buyerId}::uuid, 'createOrder', ${key}, ${huella})
        ON CONFLICT (user_id, endpoint, key) DO NOTHING`;
      if (!reservado) {
        /**
         * La clave YA existía. Tres casos, y hay que distinguirlos (punto 12 de la acción inmediata):
         *   · misma clave, mismo contenido y sin caducar → se devuelve el pedido de antes (replay);
         *   · misma clave, contenido DISTINTO → se corta: reutilizar la clave con otro pedido devolvía
         *     el pedido anterior en silencio y el comprador creía haber comprado otra cosa;
         *   · caducada → se RECICLA y se sigue. Antes se contestaba «ese pedido ya se está creando» y
         *     el reintento legítimo se quedaba atascado para siempre.
         */
        const cur: any[] = await tx.$queryRaw`
          SELECT response, request_hash,
                 (expires_at IS NOT NULL AND expires_at <= now()) AS caducada
            FROM lifebook.idempotency_keys
           WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key} LIMIT 1`;
        const fila = cur[0];
        if (fila?.response && !fila.caducada) {
          if (fila.request_hash && fila.request_hash !== huella) {
            throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó para otro pedido: manda una clave nueva');
          }
          return { replayed: fila.response };
        }
        const reciclada: number = await tx.$executeRaw`
          UPDATE lifebook.idempotency_keys
             SET request_hash = ${huella}, response = NULL, expires_at = NULL, created_at = now()
           WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}
             AND expires_at IS NOT NULL AND expires_at <= now()`;
        if (!reciclada) {
          throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'Ese pedido ya se está creando, espera un momento');
        }
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

      // 4) Pedido + líneas (el número se apartó ANTES, en su transacción corta: ver `nextOrderNo`)
      const orderNo = orderNoApartado;
      const orderRows: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.orders
          (order_no, shop_id, buyer_id, seller_id, status, payment_method, payment_status,
           delivery_mode, delivery_address, delivery_cost_xaf, subtotal_xaf, total_xaf,
           discount_xaf, coupon_id, coupon_code,
           delivery_code, message, contact_mode, price_xaf, title)
        VALUES
          (${orderNo}, ${shop.shop_id}::uuid, ${buyerId}::uuid, ${shop.shop_owner}::uuid, 'created',
           ${paymentMethod}, ${paymentMethod === 'cash_on_delivery' ? 'on_delivery' : paymentMethod === 'likebook_wallet' ? 'paid' : 'pending'},
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
    } catch (e) {
      // El pedido no llegó a existir: el dinero retenido VUELVE al comprador.
      if (lockTxId) {
        await this.wallets.refundCommerceOrder({ lockTransactionId: lockTxId })
          .catch((r) => this.log.warn(`no se pudo devolver el cerrojo ${lockTxId}: ${(r as Error).message}`));
      }
      throw e;
    }

    const repetido = 'replayed' in created;
    const result = repetido ? created.replayed : created.created;
    // El cerrojo se enlaza con el pedido para poder liberarlo o devolverlo después.
    if (lockTxId && !repetido && result?.order?.id) {
      // Parche 105: si el enlace falla, el dinero VUELVE y el pedido queda visiblemente sin pagar.
      const enlace = await this.wallets.linkCommerceLockOrUndo({ transactionId: lockTxId, orderId: result.order.id });
      if (!enlace.linked) {
        await this.db.$executeRaw`UPDATE lifebook.orders SET payment_status = 'pending', updated_at = now() WHERE id = ${result.order.id}::uuid`;
        this.log.error(`pedido ${result.order.code}: cerrojo no enlazado (${enlace.refunded ? 'importe devuelto' : 'sin devolver, revisar'}) — marcado como no pagado`);
      }
    }
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
    // El desglose de dinero del pedido, si ya se entregó (se lo enseña al VENDEDOR, no al comprador).
    const comisiones: any[] = await db.$queryRaw`
      SELECT productos_xaf, entrega_xaf, total_xaf, comision_xaf, a_pagar_tienda_xaf, tope_aplicado, computed_at
        FROM lifebook.order_fees WHERE order_id = ${orderId}::uuid LIMIT 1`;
    const feeO = comisiones[0];

    // La reseña del pedido (si la hay): la escribe el comprador y la ven los dos.
    const resenas: any[] = await db.$queryRaw`
      SELECT id, rating, comment, created_at FROM lifebook.order_reviews
       WHERE order_id = ${orderId}::uuid LIMIT 1`;
    const rev = resenas[0];
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
        /** La reclamación, con su motivo y su fecha (lo ven las dos partes). */
        disputeReason: o.dispute_reason ? String(o.dispute_reason) : null,
        disputedAt: o.disputed_at ?? null,
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
        /** Lo que deja este pedido: comisión de la plataforma y lo que se le paga a la tienda. */
        fees: esComprador
          ? undefined
          : feeO
            ? {
                productosXaf: Number(feeO.productos_xaf),
                entregaXaf: Number(feeO.entrega_xaf),
                totalXaf: Number(feeO.total_xaf),
                comisionXaf: Number(feeO.comision_xaf),
                aPagarXaf: Number(feeO.a_pagar_tienda_xaf),
                topeAplicado: !!feeO.tope_aplicado,
                computedAt: feeO.computed_at,
              }
            : null,
        /** La valoración del pedido, si el comprador ya la escribió. */
        review: rev
          ? { id: rev.id, rating: Number(rev.rating), comment: rev.comment, createdAt: rev.created_at }
          : null,
        /** Con qué se dio por cobrado: el enlace del justificante y la nota de la tienda. */
        paymentProofUrl: o.payment_proof_url ? String(o.payment_proof_url) : null,
        paymentNote: o.payment_note ? String(o.payment_note) : null,
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
  async orderAction(userId: string, orderIdRaw: string, action: string, reasonRaw?: unknown) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const a = String(action ?? '').trim().toLowerCase();
    const cfg = ACTIONS[a];
    if (!cfg) throw new DomainError('ACTION_INVALID', 'Acción no válida');
    /**
     * EL MOTIVO DE LA RECLAMACIÓN (punto 7 de la acción inmediata).
     *
     * Antes `dispute` cambiaba el estado y no guardaba nada: la tienda veía «Pedido en reclamación» sin
     * saber qué se le reclamaba, y el comprador no podía explicarse. Se exige un motivo con un mínimo
     * (10 caracteres) porque «no me llegó» o «está roto» son lo mínimo que hace falta para poder
     * contestar; el motivo se recorta a 500 caracteres.
     */
    let motivo: string | null = null;
    if (a === 'dispute') {
      motivo = String(reasonRaw ?? '').trim();
      if (motivo.length < 10) {
        throw new DomainError('DISPUTE_REASON_REQUIRED', 'Cuéntanos qué ha pasado (al menos 10 letras)');
      }
      motivo = motivo.slice(0, 500);
    }
    const o = await this.publicOrder(orderId, userId);
    const esComprador = o.buyer_id === userId;
    const esVendedor = o.shop_owner === userId || o.seller_id === userId;
    if (cfg.who === 'seller' && !esVendedor) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo la tienda puede hacer eso');
    if (cfg.who === 'buyer' && !esComprador) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo el comprador puede hacer eso');
    if (!(FROM[a] ?? []).includes(o.status)) {
      throw new DomainError('INVALID_STATE_TRANSITION', `No se puede pasar de «${o.status}» con esa acción`);
    }
    /**
     * DECISIÓN DEL DUEÑO (18/09/2026): la ventana para reclamar son **7 días desde la entrega**, y se
     * comprueba AQUÍ, en el servidor: una pantalla se puede saltar. Es la misma garantía que ya usa
     * Ecomerse en esta app.
     */
    if (a === 'dispute' && o.delivered_at) {
      const dias = (Date.now() - new Date(o.delivered_at).getTime()) / (24 * 60 * 60 * 1000);
      if (dias > 7) {
        throw new DomainError(
          'DISPUTE_WINDOW_CLOSED',
          'Ya han pasado los 7 días para reclamar ese pedido: habla con la tienda por el chat',
        );
      }
    }
    // Entregar en efectivo exige el código que tiene el comprador
    if (a === 'deliver' && o.payment_method === 'cash_on_delivery' && !o.delivery_confirmed_at) {
      throw new DomainError('DELIVERY_CODE_REQUIRED', 'Pide al comprador su código de entrega y confírmalo');
    }

    await this.db.$transaction(async (tx: any) => {
      /**
       * COMPARE-AND-SET (punto 4 de la acción inmediata).
       *
       * El estado que se leyó arriba (`o.status`) va TAMBIÉN en el `WHERE`: si entre la lectura y este
       * UPDATE otro ha cambiado el pedido (cancelar y entregar a la vez, dos toques seguidos), no se
       * actualiza ninguna fila y se corta con un error claro, en vez de pisar el cambio del otro.
       */
      /**
       * CERRAR EL PAGO AL ENTREGAR (punto 5 de la acción inmediata; decisión del dueño, 15/09/2026).
       *
       * Antes solo el efectivo contra entrega ponía `paid`: un pedido pagado en tienda se quedaba
       * `pending` para siempre aunque la tienda ya tuviera el dinero (medido en LB-260915-0009 y
       * LB-260915-0015: entregados, sin cobrar, con `paid_at` a NULL).
       *
       * Se dan por cobrados al entregar los métodos que se pagan al recoger: contra entrega y pago en
       * tienda. Los demás (transferencia, facturación, depósito, monedero) siguen como estaban: puede
       * que el dinero no esté cobrado, y darlo por cobrado sería inventarse un ingreso. Para esos
       * falta el botón de la tienda de marcar cobrado con justificante (todavía no existe).
       */
      const filas: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = ${cfg.to}, updated_at = now(),
          delivered_at = CASE WHEN ${cfg.to} = 'delivered' THEN now() ELSE delivered_at END,
          paid_at = CASE WHEN ${cfg.to} = 'delivered' AND payment_method IN ('cash_on_delivery','in_store') THEN now() ELSE paid_at END,
          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method IN ('cash_on_delivery','in_store') THEN 'paid' ELSE payment_status END,
          dispute_reason = CASE WHEN ${motivo}::text IS NULL THEN dispute_reason ELSE ${motivo} END,
          disputed_at = CASE WHEN ${motivo}::text IS NULL THEN disputed_at ELSE now() END
         WHERE id = ${orderId}::uuid AND status = ${o.status}`;
      if (!filas) {
        throw new DomainError('ORDER_CHANGED', 'El pedido cambió mientras lo mirabas: vuelve a abrirlo');
      }
      /**
       * ENTREGAR SUMA LA VENTA (punto 2 de la acción inmediata).
       *
       * `sales_count` existía y nunca se tocaba: la ficha enseña «N ventas» y todos los productos
       * decían 0. Es la única señal honesta de que un producto se vende. Va aquí dentro, en la misma
       * transacción que el cambio de estado, para que no pueda quedar un pedido entregado sin su venta.
       * No hay que restar nada al cancelar: un pedido entregado ya no se puede cancelar.
       */
      if (cfg.to === 'delivered') await this.sumarVentas(tx, orderId);
      // Y el dinero, en la MISMA transacción de la entrega: entregado y asentado, o ni una cosa ni otra.
      if (cfg.to === 'delivered') await this.asentarDinero(tx, o);
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

    // Con motivo (reclamación), el aviso lo lleva: es lo que la tienda necesita leer.
    if (a === 'dispute' && motivo) {
      await this.notify(o, userId, `El comprador abrió una reclamación: «${motivo}»`);
      return this.orderDetail(orderId, userId);
    }
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
    // Parche 97: el dinero del monedero, DESPUÉS de que el pedido quede en firme.
    if (a === 'deliver') await this.liberarSiMonedero(orderId, o.seller_id);
    if (a === 'cancel' || a === 'decline') await this.devolverSiMonedero(orderId);
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
    if (o.status === 'delivered') throw new DomainError('INVALID_STATE_TRANSITION', 'Ese pedido ya está entregado');
    /**
     * CANDADO POR INTENTOS (punto 3 de la acción inmediata).
     *
     * 4 dígitos son 10 000 combinaciones y antes se podían probar todas seguidas. Con esto, el que
     * prueba a ciegas hace 5 intentos y se queda 15 minutos fuera: agotar el código le llevaría
     * semanas. El bloqueo se mira ANTES que el código, así que también frena al que acierta — si no,
     * el que prueba a ciegas seguiría probando sin freno y el candado no serviría de nada.
     * El mensaje no promete ninguna función que no exista: el código se lo sigue dando el comprador.
     */
    const intentos = Number(o.delivery_code_attempts ?? 0) || 0;
    if (o.delivery_code_locked_until && new Date(o.delivery_code_locked_until).getTime() > Date.now()) {
      throw new DomainError(
        'DELIVERY_CODE_LOCKED',
        'Demasiados intentos fallidos con ese código. Espera unos minutos y vuelve a probar con el que te dé el comprador',
      );
    }
    if (String(code ?? '').trim() !== String(o.delivery_code)) {
      const fallos = intentos + 1;
      await this.db.$executeRaw`
        UPDATE lifebook.orders
           SET delivery_code_attempts = ${fallos},
               delivery_code_locked_until = CASE WHEN ${fallos} >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
               updated_at = now()
         WHERE id = ${orderId}::uuid`;
      throw new DomainError('DELIVERY_CODE_INVALID', 'El código no coincide con el del comprador');
    }
    // En UNA transacción con la venta: si se cae a mitad, no queda entregado sin sumar la venta.
    await this.db.$transaction(async (tx: any) => {
      // Y aquí lo mismo: solo se entrega si sigue SIN estar entregado.
      const entregado: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
               delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now(),
               delivery_code_attempts = 0, delivery_code_locked_until = NULL
         WHERE id = ${orderId}::uuid AND status <> 'delivered'`;
      if (!entregado) {
        throw new DomainError('ORDER_CHANGED', 'Ese pedido ya no está pendiente de entrega: vuelve a abrirlo');
      }
      await this.sumarVentas(tx, orderId);
      // El dinero también aquí: es la otra forma de entregar (código de contra entrega).
      await this.asentarDinero(tx, o);
    });
    // Parche 97: entrega confirmada con el código → el monedero libera al vendedor.
    await this.liberarSiMonedero(orderId, o.seller_id);
    await this.notify(o, userId, 'Pedido entregado y cobrado ✅');
    return this.orderDetail(orderId, userId);
  }

  /**
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
    /**
     * DECISIÓN DEL DUEÑO (18/09/2026): JUSTIFICANTE OBLIGATORIO para transferencia y facturación.
     *
     * Cobrar por transferencia sin la imagen del comprobante es la palabra de la tienda contra la del
     * comprador. Contra entrega y pago en tienda no se pide, porque allí el dinero se ve en mano (y esos
     * dos métodos ya quedan cobrados solos al entregar).
     */
    const metodo = String(o.payment_method ?? '');
    if ((metodo === 'transfer' || metodo === 'billing') && !justificante) {
      throw new DomainError(
        'PAYMENT_PROOF_REQUIRED',
        'Hace falta la imagen del comprobante para dar por cobrado un pago por transferencia o facturación',
      );
    }
    if (justificante && !/^https?:\/\//i.test(justificante)) {
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

  /**
   * VALORAR UN PEDIDO ENTREGADO (punto 7 de la acción inmediata).
   *
   * `lifebook.products.rating`/`rating_count` y `lifebook.shops.rating`/`rating_count` existen desde
   * siempre y la app los pinta, pero **nadie los escribía**: la prueba social estaba muerta. Aquí se
   * escribe: una reseña por pedido, del comprador, y solo de un pedido **entregado** (valorar lo que no
   * ha llegado sería inventarse la experiencia).
   *
   * La nota que se guarda es la media ponderada por el número de votos que ya había: si una tienda tenía
   * 4 con 3 votos y entra un 5, queda 4,25 — no se sustituye la nota por la última, que es lo que
   * convertiría la valoración en un adorno.
   */
  async reviewOrder(userId: string, orderIdRaw: string, ratingRaw: unknown, commentRaw: unknown) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, userId);
    if (o.buyer_id !== userId) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo el comprador puede valorar el pedido');
    if (o.status !== 'delivered') {
      throw new DomainError('ORDER_NOT_DELIVERED', 'Solo se puede valorar un pedido entregado');
    }
    const rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new DomainError('RATING_INVALID', 'La nota tiene que ser un número entero de 1 a 5');
    }
    const comment = String(commentRaw ?? '').trim().slice(0, 500) || null;

    // La reseña y las notas se mueven EN LA MISMA TRANSACCIÓN: o cuenta en las dos, o en ninguna.
    await this.db.$transaction(async (tx: any) => {
      const creada: number = await tx.$executeRaw`
        INSERT INTO lifebook.order_reviews (order_id, shop_id, buyer_id, rating, comment)
        VALUES (${orderId}::uuid, ${o.shop_id}::uuid, ${userId}::uuid, ${rating}, ${comment})
        ON CONFLICT (order_id) DO NOTHING`;
      if (!creada) {
        throw new DomainError('REVIEW_ALREADY_DONE', 'Ya has valorado este pedido');
      }
      if (o.shop_id) {
        await tx.$executeRaw`
          UPDATE lifebook.shops
             SET rating = round((coalesce(rating, 0) * coalesce(rating_count, 0) + ${rating})
                                / (coalesce(rating_count, 0) + 1), 2),
                 rating_count = coalesce(rating_count, 0) + 1
           WHERE id = ${o.shop_id}::uuid`;
      }
      /**
       * Los productos del pedido también se valoran: es la nota que ve quien mira la ficha sin conocer
       * a nadie. Se mueve por producto (una sola vez por línea, aunque el pedido lleve 3 unidades).
       */
      await tx.$executeRaw`
        UPDATE lifebook.products p
           SET rating = round((coalesce(p.rating, 0) * coalesce(p.rating_count, 0) + ${rating})
                              / (coalesce(p.rating_count, 0) + 1), 2),
               rating_count = coalesce(p.rating_count, 0) + 1,
               updated_at = now()
         WHERE p.id IN (SELECT DISTINCT i.product_id FROM lifebook.order_items i
                         WHERE i.order_id = ${orderId}::uuid AND i.product_id IS NOT NULL)`;
    });

    await this.notify(o, userId, `El comprador ha valorado el pedido con ${rating} de 5 ⭐`);
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

  /**
   * SUMA LAS VENTAS DE UN PEDIDO ENTREGADO (punto 2 de la acción inmediata).
   *
   * Una sola consulta, por producto, con la cantidad total de cada línea. Se apoya en `order_items`
   * (la foto del momento de la compra), así que si el producto se renombra o cambia de precio la
   * cuenta sigue siendo la de lo que se vendió.
   */
  private async sumarVentas(tx: any, orderId: string) {
    await tx.$executeRaw`
      UPDATE lifebook.products p
         SET sales_count = COALESCE(p.sales_count, 0) + i.qty,
             updated_at = now()
        FROM (SELECT product_id, SUM(quantity)::int AS qty
                FROM lifebook.order_items
               WHERE order_id = ${orderId}::uuid AND product_id IS NOT NULL
               GROUP BY product_id) i
       WHERE p.id = i.product_id`;
  }

  /** Aviso en el chat comprador↔tienda (o con el comprador, si avisa el vendedor). */
  // ───────────────────────────── EL DINERO (punto 8) ───────────────────────

  /**
   * LA CONFIGURACIÓN DE COMISIÓN QUE MANDA PARA UNA TIENDA.
   *
   * Primero la suya (si tiene fila propia) y si no la general. Está en la base a propósito: el
   * porcentaje se cambia sin desplegar código, que es la regla que ya sigue Comida.
   */
  private async configDeComision(db: any, shopId: string | null): Promise<FeeConfig> {
    const filas: any[] = await db.$queryRaw`
      SELECT platform_percent, platform_min_xaf, max_total_percent
        FROM lifebook.commerce_fee_config
       WHERE (shop_id IS NOT NULL AND shop_id = ${shopId}::uuid) OR shop_id IS NULL
       ORDER BY (shop_id IS NOT NULL) DESC
       LIMIT 1`;
    return aConfigFee(filas[0]);
  }

  /**
   * ASENTAR EL DINERO DE UN PEDIDO ENTREGADO.
   *
   * Congela el desglose y escribe el asiento de doble partida. Va DENTRO de la transacción de la
   * entrega: un pedido entregado siempre tiene sus cuentas y uno no entregado nunca las tiene. Si ya
   * estaba asentado no se toca nada, así que un reintento no cuenta el dinero dos veces.
   */
  private async asentarDinero(tx: any, o: any) {
    const productos = Math.max(0, Number(o.subtotal_xaf ?? o.price_xaf ?? 0) - Number(o.discount_xaf ?? 0));
    const entrega = Math.max(0, Number(o.delivery_cost_xaf ?? 0));
    const cfg = await this.configDeComision(tx, o.shop_id ?? null);
    const f = computeOrderFees(productos, entrega, cfg);

    const filas: number = await tx.$executeRaw`
      INSERT INTO lifebook.order_fees
        (order_id, shop_id, productos_xaf, entrega_xaf, total_xaf, comision_xaf, a_pagar_tienda_xaf,
         tope_aplicado, platform_percent, platform_min_xaf)
      VALUES (${o.id}::uuid, ${o.shop_id}::uuid, ${f.productosXaf}, ${f.entregaXaf}, ${f.totalXaf},
              ${f.comisionXaf}, ${f.aPagarTiendaXaf}, ${f.topeAplicado},
              ${cfg.platformPercent}, ${cfg.platformMinXaf})
      ON CONFLICT (order_id) DO NOTHING`;
    if (!filas) return null; // ya estaba asentado: ni una línea más en el libro

    const memo = 'pedido ' + String(o.order_no ?? '');
    await tx.$executeRaw`
      INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
      VALUES (${o.id}::uuid, 'caja', ${f.totalXaf}, 0, ${memo})`;
    if (f.aPagarTiendaXaf > 0) {
      await tx.$executeRaw`
        INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
        VALUES (${o.id}::uuid, 'a_pagar_tienda', 0, ${f.aPagarTiendaXaf}, ${memo})`;
    }
    if (f.comisionXaf > 0) {
      await tx.$executeRaw`
        INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
        VALUES (${o.id}::uuid, 'comision_plataforma', 0, ${f.comisionXaf}, ${memo})`;
    }
    if (f.entregaXaf > 0) {
      await tx.$executeRaw`
        INSERT INTO lifebook.ledger_entries (order_id, cuenta, debe_xaf, haber_xaf, memo)
        VALUES (${o.id}::uuid, 'a_pagar_reparto', 0, ${f.entregaXaf}, ${memo})`;
    }
    return f;
  }

  /**
   * LIBERAR EL MONEDERO AL ENTREGAR (parche 97).
   *
   * Va FUERA de la transacción del pedido a propósito: el monedero es otro cliente de base de
   * datos y no puede compartir la transacción. La dirección del fallo es la SEGURA: si esto
   * falla, el dinero se queda RETENIDO (ni el vendedor cobra dos veces ni se pierde) y el
   * reintento es idempotente (`lb-release:<pedido>`). El asiento de Life Book ya se hizo dentro
   * de la transacción de la entrega, así que las dos contabilidades no se pisan: el monedero
   * mueve el dinero real y lifebook guarda el desglose de comisión.
   */
  private async liberarSiMonedero(orderId: string, sellerId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT payment_method, status FROM lifebook.orders WHERE id = ${orderId}::uuid`;
    if (!filas[0] || String(filas[0].payment_method) !== 'likebook_wallet') return;
    if (String(filas[0].status) !== 'delivered') return;
    const f: any[] = await this.db.$queryRaw`
      SELECT comision_xaf, a_pagar_tienda_xaf, entrega_xaf FROM lifebook.order_fees
       WHERE order_id = ${orderId}::uuid`;
    if (!f[0]) return;
    try {
      await this.wallets.releaseCommerceOrder({
        orderId, sellerId,
        sellerNet: Number(f[0].a_pagar_tienda_xaf),
        platformFee: Number(f[0].comision_xaf),
        deliveryHeld: Number(f[0].entrega_xaf),
      });
    } catch (e) {
      this.log.warn(`pedido ${orderId} entregado pero el monedero NO se liberó: ${(e as Error).message}`);
    }
  }

  /** DEVOLVER EL MONEDERO AL CANCELAR/RECHAZAR (parche 97). Idempotente. */
  private async devolverSiMonedero(orderId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT payment_method, status FROM lifebook.orders WHERE id = ${orderId}::uuid`;
    if (!filas[0] || String(filas[0].payment_method) !== 'likebook_wallet') return;
    if (String(filas[0].status) !== 'cancelled') return;
    try {
      await this.wallets.refundCommerceOrder({ orderId });
    } catch (e) {
      this.log.warn(`pedido ${orderId} cancelado pero el monedero NO se devolvió: ${(e as Error).message}`);
    }
  }

  /** Las cuentas de una tienda: lo vendido, la comisión, lo pendiente y las liquidaciones hechas. */
  private async cuentasDeTienda(shopId: string) {
    const totales: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos,
             coalesce(sum(f.total_xaf), 0)::int AS facturado,
             coalesce(sum(f.comision_xaf), 0)::int AS comision,
             coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS a_pagar
        FROM lifebook.order_fees f WHERE f.shop_id = ${shopId}::uuid`;
    const ultima: any[] = await this.db.$queryRaw`
      SELECT max(hasta) AS hasta FROM lifebook.settlements WHERE shop_id = ${shopId}::uuid`;
    const desde = ultima[0]?.hasta ?? null;
    /**
     * DECISIÓN DEL DUEÑO (18/09/2026): a la tienda **no se le paga antes de que venza la ventana de
     * reclamación** (7 días desde la entrega). Si el comprador todavía puede reclamar, ese dinero está en
     * el aire: se cuenta aparte (`enEsperaXaf`) y **no entra en lo que se liquida**.
     */
    const pendiente: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos, coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS importe
        FROM lifebook.order_fees f JOIN lifebook.orders o ON o.id = f.order_id
       WHERE f.shop_id = ${shopId}::uuid
         AND (${desde}::timestamptz IS NULL OR f.computed_at > ${desde}::timestamptz)
         AND o.delivered_at IS NOT NULL AND o.delivered_at <= now() - interval '7 days'`;
    const enEspera: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos, coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS importe
        FROM lifebook.order_fees f JOIN lifebook.orders o ON o.id = f.order_id
       WHERE f.shop_id = ${shopId}::uuid
         AND (${desde}::timestamptz IS NULL OR f.computed_at > ${desde}::timestamptz)
         AND (o.delivered_at IS NULL OR o.delivered_at > now() - interval '7 days')`;
    const liq: any[] = await this.db.$queryRaw`
      SELECT id, desde, hasta, importe_xaf, pedidos, estado, pagado_at, nota
        FROM lifebook.settlements WHERE shop_id = ${shopId}::uuid ORDER BY pagado_at DESC LIMIT 20`;
    return {
      pedidos: Number(totales[0]?.pedidos ?? 0),
      facturadoXaf: Number(totales[0]?.facturado ?? 0),
      comisionXaf: Number(totales[0]?.comision ?? 0),
      aPagarTotalXaf: Number(totales[0]?.a_pagar ?? 0),
      pendienteXaf: Number(pendiente[0]?.importe ?? 0),
      pendientePedidos: Number(pendiente[0]?.pedidos ?? 0),
      /** Lo que todavía NO se le puede pagar: la ventana de 7 días para reclamar no ha vencido. */
      enEsperaXaf: Number(enEspera[0]?.importe ?? 0),
      enEsperaPedidos: Number(enEspera[0]?.pedidos ?? 0),
      liquidaciones: liq.map((l) => ({
        id: l.id, desde: l.desde, hasta: l.hasta, importeXaf: Number(l.importe_xaf),
        pedidos: Number(l.pedidos), estado: l.estado, pagadoAt: l.pagado_at, nota: l.nota,
      })),
    };
  }

  /**
   * LO QUE LA PLATAFORMA LE DEBE A MI TIENDA. Es la respuesta a «¿gano dinero dentro de la app?»: sin
   * esto, el vendedor cobra en mano y no sabe si le cuadra.
   */
  async saldoDeMiTienda(userId: string, shopIdFiltro?: string) {
    const mias: any[] = await this.db.$queryRaw`
      SELECT id, name FROM lifebook.shops WHERE owner_id = ${userId}::uuid ORDER BY name`;
    if (!mias.length) throw new DomainError('NOT_SHOP_OWNER', 'No tienes ninguna tienda');
    const tienda = shopIdFiltro ? mias.find((t) => t.id === shopIdFiltro) : mias[0];
    if (!tienda) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Esa tienda no es tuya');
    return {
      shop: { id: tienda.id, name: tienda.name },
      tiendas: mias.map((t) => ({ id: t.id, name: t.name })),
      ...(await this.cuentasDeTienda(tienda.id)),
    };
  }

  /**
   * LIQUIDAR A UNA TIENDA: se le paga a mano (al principio es lo que hay) y queda registrado cuánto,
   * por qué pedidos y quién lo hizo. Solo el admin: es el dinero de la plataforma.
   */
  async liquidarTienda(adminId: string, shopIdRaw: string, nota?: unknown) {
    if (!(await this.isAdmin(adminId))) {
      throw new DomainError('NOT_ADMIN', 'Solo el administrador puede liquidar a una tienda');
    }
    const shopId = this.uuid(shopIdRaw, 'Tienda');
    const cuentas = await this.cuentasDeTienda(shopId);
    if (cuentas.pendienteXaf <= 0) {
      // Si lo único que hay es dinero «en espera», se dice por qué: la ventana de reclamación.
      if (cuentas.enEsperaXaf > 0) {
        throw new DomainError(
          'SETTLEMENT_WINDOW_OPEN',
          `Todavía no se le puede pagar: ${cuentas.enEsperaXaf} XAF esperan a que venzan los 7 días para reclamar`,
        );
      }
      throw new DomainError('NOTHING_TO_SETTLE', 'Esa tienda no tiene nada pendiente de cobrar');
    }
    const ultima: any[] = await this.db.$queryRaw`
      SELECT max(hasta) AS hasta FROM lifebook.settlements WHERE shop_id = ${shopId}::uuid`;
    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.settlements (shop_id, desde, hasta, importe_xaf, pedidos, nota, creado_por)
      VALUES (${shopId}::uuid, ${ultima[0]?.hasta ?? null}::timestamptz, now(), ${cuentas.pendienteXaf},
              ${cuentas.pendientePedidos}, ${String(nota ?? '').trim().slice(0, 300) || null}, ${adminId}::uuid)
      RETURNING id, shop_id, desde, hasta, importe_xaf, pedidos, estado, pagado_at, nota`;
    const l = filas[0];
    return {
      settlement: {
        id: l.id, shopId: l.shop_id, desde: l.desde, hasta: l.hasta, importeXaf: Number(l.importe_xaf),
        pedidos: Number(l.pedidos), estado: l.estado, pagadoAt: l.pagado_at, nota: l.nota,
      },
      cuentas: await this.cuentasDeTienda(shopId),
    };
  }

  /**
   * EL RESUMEN DE LA PLATAFORMA (solo el admin): cuánto se ha ganado de comisión, cuánto se debe a las
   * tiendas y —lo que de verdad avisa de un error— el **cuadre del libro**: si el debe y el haber no
   * coinciden, algo se asentó mal y hay que mirarlo antes de pagar a nadie.
   */
  async resumenDeLaPlataforma(adminId: string) {
    if (!(await this.isAdmin(adminId))) {
      throw new DomainError('NOT_ADMIN', 'Solo el administrador puede ver las cuentas de la plataforma');
    }
    const filas: any[] = await this.db.$queryRaw`
      SELECT s.id AS shop_id, s.name,
             count(f.order_id)::int AS pedidos,
             coalesce(sum(f.total_xaf), 0)::int AS facturado,
             coalesce(sum(f.comision_xaf), 0)::int AS comision,
             coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS a_pagar,
             coalesce((SELECT sum(l.importe_xaf) FROM lifebook.settlements l WHERE l.shop_id = s.id), 0)::int AS liquidado
        FROM lifebook.order_fees f
        JOIN lifebook.shops s ON s.id = f.shop_id
       GROUP BY s.id, s.name
       ORDER BY comision DESC`;
    const cuadre: any[] = await this.db.$queryRaw`
      SELECT coalesce(sum(debe_xaf), 0)::int AS debe, coalesce(sum(haber_xaf), 0)::int AS haber
        FROM lifebook.ledger_entries`;
    const debe = Number(cuadre[0]?.debe ?? 0);
    const haber = Number(cuadre[0]?.haber ?? 0);
    const tiendas = filas.map((r) => {
      const aPagar = Number(r.a_pagar ?? 0);
      const liquidado = Number(r.liquidado ?? 0);
      return {
        shopId: r.shop_id, nombre: r.name, pedidos: Number(r.pedidos ?? 0),
        facturadoXaf: Number(r.facturado ?? 0), comisionXaf: Number(r.comision ?? 0),
        aPagarXaf: aPagar, liquidadoXaf: liquidado, pendienteXaf: aPagar - liquidado,
      };
    });
    return {
      comisionTotalXaf: tiendas.reduce((n, t) => n + t.comisionXaf, 0),
      pendienteTotalXaf: tiendas.reduce((n, t) => n + t.pendienteXaf, 0),
      libro: { debeXaf: debe, haberXaf: haber, cuadra: debe === haber },
      tiendas,
    };
  }

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
