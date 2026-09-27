// =============================================================================
// lb39-merchant.service.ts — LIFE BOOK · PANEL DE LA TIENDA (Parte 39)
//
// Qué resuelve (evaluación de las entregas 36-37 del dueño):
//   · El resumen del panel se calcula EN EL SERVIDOR y con el «hoy» en hora de
//     MALABO (antes se contaba como ingreso lo que aún no se había cobrado).
//   · La tienda sale SIEMPRE del token: no hay ningún endpoint que acepte un
//     `shopId` por parámetro, así que nadie puede abrir el panel de otro.
//   · Edición RÁPIDA de precio y existencias: un comerciante que cambia el
//     precio o el stock **no puede perder la publicación** (el `PUT` completo
//     devuelve el producto a moderación). Aquí solo cambian precio y stock y el
//     estado se queda como estaba; el resto de campos sigue pasando por revisión.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../services/payment-auth.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
/* El aviso de reposición vive en el módulo de comercio: aquí solo se llama. */
import { LifebookCommerceService } from './commerce.service';

const STOCK_MODES = ['exact', 'approximate', 'on_request', 'unlimited'] as const;

/** Estados en los que un producto ya pasó la moderación (se puede tocar precio/stock). */
const YA_PUBLICADO = ['active', 'hidden', 'sold_out'];

@Injectable()
export class LifebookMerchantService {
  private readonly log = new Logger('LifebookMerchant');

  constructor(
    private readonly db: MobilityPrismaService,
    private readonly commerce: LifebookCommerceService,
  ) {}

  // ─────────────────────────── utilidades ────────────────────────────────────
  private uuid(v: unknown, field = 'Identificador'): string {
    const s = String(v ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      throw new DomainError('ID_INVALID', `${field} no válido`);
    }
    return s;
  }

  private one(value: unknown, allowed: readonly string[], fallback: string, code: string, msg: string): string {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return fallback;
    if (!allowed.includes(v)) throw new DomainError(code, msg);
    return v;
  }

  private money(v: unknown, field: string): number | null {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100_000_000) {
      throw new DomainError('PRICE_INVALID', `${field}: importe en XAF inválido (entero entre 0 y 100.000.000)`);
    }
    return n;
  }

  private num(v: unknown): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  // ─────────────────────────── RESUMEN DEL PANEL ─────────────────────────────
  /**
   * Resumen de «Mi tienda». Todo lo que devuelve es del usuario del token.
   *
   * Dinero: `paidTodayXaf` cuenta **solo entregado y cobrado** (contra entrega:
   * el pedido pasa a `paid` cuando la tienda confirma el código del comprador).
   * Lo que aún no se ha cobrado va aparte, en `pendingCodXaf`, para que el
   * comerciante no confunda facturación con caja.
   */
  async dashboard(userId: string) {
    const shops: any[] = await this.db.$queryRaw`
      SELECT id, name, logo_url, cover_url, city, barrio, region, is_active,
             verification_level, rating, rating_count, followers_count, created_at
        FROM lifebook.shops WHERE owner_id = ${userId}::uuid LIMIT 1`;
    const shop = shops[0] ?? null;
    if (!shop) {
      // Sin tienda no hay panel: la app ofrece crearla (no es un error).
      return { shop: null, alerts: null, orders: null, money: null, products: null };
    }

    // ── Pedidos: SOLO los de mi tienda ──────────────────────────────────────
    // Ojo: aquí NO se cuenta `seller_id = yo`. Los pedidos del modelo antiguo
    // (publicaciones, sin tienda) viven en «Pedidos → Ventas», no en el panel de
    // la tienda; y al ser `shop_id` un `ON DELETE SET NULL`, mezclarlos haría
    // que pedidos huérfanos aparecieran como ventas de la tienda.
    const o: any[] = await this.db.$queryRaw`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE o.status = 'created')::int AS new_orders,
        count(*) FILTER (WHERE o.status IN ('confirmed','preparing','in_transit','ready_pickup'))::int AS active_orders,
        count(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
        count(*) FILTER (WHERE o.status IN ('cancelled','declined'))::int AS cancelled,
        count(*) FILTER (WHERE o.status = 'disputed')::int AS disputed,
        count(*) FILTER (WHERE o.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Malabo') AT TIME ZONE 'Africa/Malabo')::int AS today,
        COALESCE(SUM(COALESCE(o.total_xaf, o.price_xaf, 0)) FILTER (
          WHERE o.status = 'delivered' AND o.payment_status = 'paid'
            AND COALESCE(o.delivered_at, o.updated_at) >= date_trunc('day', now() AT TIME ZONE 'Africa/Malabo') AT TIME ZONE 'Africa/Malabo'
        ), 0)::bigint AS paid_today,
        COALESCE(SUM(COALESCE(o.total_xaf, o.price_xaf, 0)) FILTER (
          WHERE o.status = 'delivered' AND o.payment_status = 'paid'
            AND COALESCE(o.delivered_at, o.updated_at) >= date_trunc('month', now() AT TIME ZONE 'Africa/Malabo') AT TIME ZONE 'Africa/Malabo'
        ), 0)::bigint AS paid_month,
        COALESCE(SUM(COALESCE(o.total_xaf, o.price_xaf, 0)) FILTER (
          WHERE o.payment_method = 'cash_on_delivery' AND o.payment_status <> 'paid'
            AND o.status NOT IN ('cancelled','declined')
        ), 0)::bigint AS cod_pending
        FROM lifebook.orders o
       WHERE o.shop_id = ${shop.id}::uuid`;

    // ── Catálogo ────────────────────────────────────────────────────────────
    const p: any[] = await this.db.$queryRaw`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE p.status = 'active')::int AS active,
        count(*) FILTER (WHERE p.status = 'pending')::int AS pending,
        count(*) FILTER (WHERE p.status = 'draft')::int AS draft,
        count(*) FILTER (WHERE p.status = 'hidden')::int AS hidden,
        count(*) FILTER (WHERE p.status = 'sold_out')::int AS sold_out,
        count(*) FILTER (WHERE p.status = 'rejected')::int AS rejected,
        count(*) FILTER (WHERE p.status = 'active' AND p.stock_mode IN ('exact','approximate')
                           AND p.stock_quantity <= 0)::int AS out_of_stock
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE s.owner_id = ${userId}::uuid`;

    // ── Mensajes sin leer (1:1 + grupos), igual que la bandeja de la app ────
    const m: any[] = await this.db.$queryRaw`
      SELECT (
        COALESCE((SELECT SUM(CASE WHEN c.user_a = ${userId}::uuid THEN c.unread_a ELSE c.unread_b END)
                    FROM lifebook.conversations c
                   WHERE c.kind = 'direct'
                     AND (c.user_a = ${userId}::uuid OR c.user_b = ${userId}::uuid)), 0)
        + COALESCE((SELECT count(*) FROM lifebook.messages msg
                      JOIN lifebook.group_members gm
                        ON gm.conversation_id = msg.conversation_id AND gm.user_id = ${userId}::uuid
                     WHERE msg.state = 'active' AND msg.sender_id <> ${userId}::uuid
                       AND (gm.last_read_at IS NULL OR msg.created_at > gm.last_read_at)
                       AND (gm.cleared_at IS NULL OR msg.created_at > gm.cleared_at)), 0)
      )::int AS unread`;

    const dia: any[] = await this.db.$queryRaw`
      SELECT to_char(now() AT TIME ZONE 'Africa/Malabo', 'YYYY-MM-DD') AS hoy,
             to_char(now() AT TIME ZONE 'Africa/Malabo', 'HH24:MI') AS hora`;

    const ped = o[0] ?? {};
    const pro = p[0] ?? {};

    return {
      shop: {
        id: shop.id,
        name: shop.name,
        logoUrl: shop.logo_url,
        coverUrl: shop.cover_url,
        city: shop.city,
        barrio: shop.barrio,
        region: shop.region,
        isActive: shop.is_active,
        verificationLevel: shop.verification_level,
        rating: this.num(shop.rating),
        ratingCount: this.num(shop.rating_count),
        followersCount: this.num(shop.followers_count),
        createdAt: shop.created_at,
      },
      alerts: {
        newOrders: this.num(ped.new_orders),
        activeOrders: this.num(ped.active_orders),
        disputed: this.num(ped.disputed),
        pendingProducts: this.num(pro.pending),
        rejectedProducts: this.num(pro.rejected),
        outOfStock: this.num(pro.out_of_stock),
        unreadMessages: this.num(m[0]?.unread),
      },
      orders: {
        today: this.num(ped.today),
        active: this.num(ped.active_orders),
        delivered: this.num(ped.delivered),
        cancelled: this.num(ped.cancelled),
        total: this.num(ped.total),
      },
      money: {
        currency: 'XAF' as const,
        paidTodayXaf: this.num(ped.paid_today),
        paidMonthXaf: this.num(ped.paid_month),
        pendingCodXaf: this.num(ped.cod_pending),
      },
      products: {
        total: this.num(pro.total),
        active: this.num(pro.active),
        pending: this.num(pro.pending),
        draft: this.num(pro.draft),
        hidden: this.num(pro.hidden),
        soldOut: this.num(pro.sold_out),
        rejected: this.num(pro.rejected),
        outOfStock: this.num(pro.out_of_stock),
      },
      // Las opiniones todavía no tienen tabla propia: se dice en vez de inventarlas.
      reviews: { available: false, rating: this.num(shop.rating), ratingCount: this.num(shop.rating_count) },
      serverDay: dia[0]?.hoy ?? null,
      serverTime: dia[0]?.hora ?? null,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────── EDICIÓN RÁPIDA (precio y stock) ───────────────────
  /**
   * Cambia precio y/o existencias SIN devolver el producto a moderación.
   * Solo para lo que ya está publicado (activo, oculto o agotado): si está en
   * borrador, en revisión o rechazado, el camino es la edición completa.
   */
  async quickEdit(userId: string, productIdRaw: string, dto: any) {
    const pid = this.uuid(productIdRaw, 'Producto');
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.id, p.title, p.status, p.price_mode, p.price_xaf, p.stock_mode, p.stock_quantity
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid AND s.owner_id = ${userId}::uuid LIMIT 1`;
    const p = rows[0];
    if (!p) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe o no es tuyo');
    if (!YA_PUBLICADO.includes(String(p.status))) {
      throw new DomainError(
        'PRODUCT_NOT_PUBLISHED',
        'Todavía no está publicado: edítalo completo y envíalo a revisión',
      );
    }

    const priceMode = String(p.price_mode);
    let price = p.price_xaf === null ? null : this.num(p.price_xaf);
    const tocaPrecio = dto?.priceXaf !== undefined;
    if (tocaPrecio) {
      price = this.money(dto.priceXaf, 'Precio');
      if (priceMode === 'on_request') {
        price = null; // «a consultar» no lleva precio
      } else if (price === null || price <= 0) {
        throw new DomainError('PRICE_REQUIRED', 'El precio tiene que ser mayor que cero (o marca «a consultar»)');
      }
    }

    const stockMode = dto?.stockMode !== undefined
      ? this.one(dto.stockMode, STOCK_MODES, String(p.stock_mode), 'STOCK_MODE_INVALID', 'Modo de existencias no válido')
      : String(p.stock_mode);
    const quiereCantidad = dto?.stockQuantity !== undefined && Number.isInteger(Number(dto.stockQuantity));
    if (dto?.stockQuantity !== undefined && !quiereCantidad) {
      throw new DomainError('STOCK_QUANTITY_INVALID', 'Las existencias tienen que ser un número entero');
    }
    const cantidad = quiereCantidad
      ? Math.max(0, Number(dto.stockQuantity))
      : this.num(p.stock_quantity);
    // Con existencias «a consultar» o «ilimitadas» la cantidad no significa nada.
    const cantidadFinal = stockMode === 'exact' || stockMode === 'approximate' ? cantidad : 0;

    const upd: any[] = await this.db.$queryRaw`
      UPDATE lifebook.products
         SET price_xaf = ${price},
             stock_mode = ${stockMode},
             stock_quantity = ${cantidadFinal},
             updated_at = now()
       WHERE id = ${pid}::uuid
       RETURNING id, title, status, price_mode, price_xaf, stock_mode, stock_quantity`;

    const r = upd[0];
    // Si con este cambio volvió a haber stock, se avisa a quien lo estaba esperando («avísame
    // cuando llegue»). El propio método mira si hay stock y si está publicado; con `catch` para
    // que un aviso no pueda tumbar la edición del comerciante.
    await this.commerce.avisarReposiciones(pid).catch(() => {});
    this.log.log(`producto ${pid} actualizado rápido (precio/stock) por ${userId}`);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      priceMode: r.price_mode,
      priceXaf: r.price_xaf === null ? null : this.num(r.price_xaf),
      stockMode: r.stock_mode,
      stockQuantity: this.num(r.stock_quantity),
      /** El estado NO cambia: la publicación sigue viva. */
      statusUnchanged: true,
    };
  }
}
