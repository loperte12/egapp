// =============================================================================
// lb33-commerce.service.ts — LIFE BOOK · COMERCIO (Parte 33)
// Tienda + producto/servicio: crear tienda, publicar, catálogo, ficha, moderación.
//
// Decisiones de arquitectura (verificadas, no supuestas):
//   · Vive en el SERVICIO DE LIFE BOOK (/opt/mirror/app/src/lifebook) → sus rutas
//     cuelgan de /wallet/api/v1/lifebook/commerce/* (el montaje que ya existe, sin
//     tocar nginx).
//   · SQL en crudo con $queryRaw/$executeRaw y placeholders — convención de Life Book.
//   · lifebook.* y wallet.* están en el MISMO Postgres → ecomerse_seller_id es FK real.
//   · Dinero entero XAF · ids uuid · fechas timestamptz.
//   · Publicar deja el producto en moderación ('pending'), nunca publicado.
//   · El dueño de la tienda sale del TOKEN: no hay forma de publicar en tienda ajena.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { DomainError } from '../services/payment-auth.service';

// ── Catálogos (una sola fuente en el servidor) ───────────────────────────────
const SERVICE_TYPES = ['physical', 'food', 'hotel_room', 'rental', 'job', 'local_service'] as const;
const SELLER_TYPES = ['local', 'national', 'international'] as const;
const REGIONS = ['continental', 'insular', 'other'] as const;
const STOCK_MODES = ['exact', 'approximate', 'on_request', 'unlimited'] as const;
const CONDITIONS = ['new', 'used', 'made_to_order'] as const;
const PRICE_MODES = ['fixed', 'from', 'on_request'] as const;
const PAY_METHODS = ['cash_on_delivery', 'billing', 'likebook_wallet', 'in_store', 'deposit', 'transfer'] as const;
const COST_MODES = ['fixed', 'calculated', 'on_request'] as const;
const COVERAGE = ['same_city', 'continental_region', 'insular_region', 'national', 'international'] as const;
const TRANSPORT = ['local_courier', 'road', 'sea', 'air', 'pickup', 'taxi_moto'] as const;
/** Métodos que la plataforma acepta hoy y su estado REAL (lo decide el servidor). */
const METHOD_STATUS: Record<string, string> = {
  cash_on_delivery: 'active',
  billing: 'active',
  transfer: 'active',
  in_store: 'active',
  deposit: 'active',
  likebook_wallet: 'coming_soon', // el monedero aún no existe como módulo
};
const SELLER_STATUSES = ['draft', 'pending', 'active', 'rejected', 'hidden', 'sold_out'] as const;
const MEDIA_MAX = 10;
const TAGS_MAX = 6;
const TAG_MAX_LEN = 24;
const DESC_MAX = 4000;
const VARIANTS_MAX = 20;
const ATTRS_MAX = 20;

export interface ShopInput {
  name?: string;
  categoryId?: string | null;
  sellerType?: string;
  country?: string;
  city?: string;
  barrio?: string;
  region?: string;
  addressReference?: string;
  lat?: number;
  lng?: number;
  description?: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  paymentMethods?: string[];
  openingHours?: Record<string, unknown>;
  shippingPolicy?: {
    name?: string;
    coverage?: string[];
    transportModes?: string[];
    estimatedTime?: string;
    costMode?: string;
    baseCostXaf?: number;
    perKmXaf?: number;
    shipsInternational?: boolean;
    internationalNote?: string;
  } | null;
}

export interface ProductInput {
  categoryId?: string | null;
  serviceType?: string;
  title?: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceMode?: string;
  priceXaf?: number | null;
  oldPriceXaf?: number | null;
  stockMode?: string;
  stockQuantity?: number;
  condition?: string;
  originCity?: string;
  originBarrio?: string;
  originRegion?: string;
  shipsInternational?: boolean;
  shippingPolicyId?: string | null;
  media?: { url?: string; type?: string; position?: number; width?: number; height?: number }[];
  tags?: string[];
  variants?: { name?: string; priceXaf?: number | null; stockQuantity?: number; sku?: string | null; imageUrl?: string | null; weightG?: number | null; attributes?: Record<string, unknown> }[];
  attributes?: { key?: string; value?: string }[];
}

@Injectable()
export class LifebookCommerceService {
  private readonly log = new Logger('LifebookCommerce');

  constructor(private readonly db: MobilityPrismaService) {}

  // ─────────────────────────── utilidades ────────────────────────────────────
  private clean(v: unknown, max: number): string {
    return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  /**
   * Filtro anti-spam para TEXTOS largos (descripciones, notas): nada de
   * teléfonos, correos ni enlaces. Es la norma de la comunidad de Life Book.
   */
  private text(v: unknown, max: number, field: string): string {
    const t = String(v ?? '').trim().slice(0, max);
    if (/\b(\+?\d[\d\s-]{6,})\b/.test(t) || /@[a-z0-9.-]+\.[a-z]{2,}/i.test(t) || /https?:\/\//i.test(t)) {
      throw new DomainError('TEXT_FORBIDDEN', `${field}: no se permiten teléfonos, correos ni enlaces`);
    }
    return t;
  }

  /**
   * Título de producto: se bloquean enlaces y TELÉFONOS DE VERDAD (con prefijo +
   * o con separadores), pero se permiten números sueltos, que son legítimos en un
   * catálogo (tallas, modelos, referencias: «Zapatillas 120191902», «Modelo 4425»).
   * Antes se aplicaba el filtro agresivo y rechazaba productos normales.
   */
  private title(v: unknown, max = 140): string {
    const t = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
    const telefonoReal = /(\+\d[\d\s-]{6,})|(\b\d{3}[\s-]\d{3}[\s-]\d{2,}\b)/;
    if (telefonoReal.test(t) || /@[a-z0-9.-]+\.[a-z]{2,}/i.test(t) || /https?:\/\//i.test(t)) {
      throw new DomainError('TEXT_FORBIDDEN', 'El título no puede incluir teléfonos, correos ni enlaces');
    }
    return t;
  }

  private one<T>(value: T | undefined, allowed: readonly string[], fallback: string, code: string, msg: string): string {
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

  private uuidOrNull(v: unknown): string | null {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      throw new DomainError('ID_INVALID', 'Identificador no válido');
    }
    return s;
  }

  /**
   * Fotos del producto. Parte 34: se **rechaza** si se pasa del tope (antes se
   * recortaba en silencio y las fotos «desaparecían»), y si la URL es absoluta
   * tiene que ser de NUESTRO almacén (no se aceptan fotos alojadas fuera).
   */
  private media(v: unknown): { url: string; type: string; position: number; width?: number; height?: number }[] {
    const arr = Array.isArray(v) ? v : [];
    if (arr.length > MEDIA_MAX) {
      throw new DomainError('MEDIA_LIMIT', `Como máximo ${MEDIA_MAX} archivos por publicación`);
    }
    const base = (process.env.MINIO_PUBLIC_BASE || 'https://hk.egrouteplan.com/storage').replace(/\/+$/, '');
    const baseHost = base.replace(/^https?:\/\//, '').split('/')[0];
    const out: { url: string; type: string; position: number; width?: number; height?: number }[] = [];
    for (const raw of arr) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const url = String(item.url ?? '').trim().slice(0, 400);
      // Se aceptan rutas internas (/storage/…) y URLs de nuestro dominio.
      // NO se aceptan data: (base64) ni fotos alojadas en otros sitios.
      if (!url) continue;
      const propia = url.startsWith('/')
        || url.startsWith(base)
        || (() => { try { return new URL(url).host === baseHost; } catch { return false; } })();
      if (!propia) throw new DomainError('MEDIA_URL_INVALID', 'Sube las fotos a Life Book (no se admiten enlaces externos)');
      const type = String(item.type ?? 'image').toLowerCase() === 'video' ? 'video' : 'image';
      out.push({
        url,
        type,
        position: out.length,
        ...(Number.isFinite(Number(item.width)) ? { width: Math.round(Number(item.width)) } : {}),
        ...(Number.isFinite(Number(item.height)) ? { height: Math.round(Number(item.height)) } : {}),
      });
    }
    return out;
  }

  private tags(v: unknown): string[] {
    const arr = Array.isArray(v) ? v : [];
    const out: string[] = [];
    for (const t of arr) {
      const s = this.clean(t, TAG_MAX_LEN).toLowerCase().replace(/^#/, '');
      if (s && !out.includes(s)) out.push(s);
      if (out.length >= TAGS_MAX) break;
    }
    return out;
  }

  /** ¿El usuario tiene tienda de Ecomerse verificada? (mismo Postgres, consulta cruzada) */
  private async ecomerseSellerId(userId: string): Promise<string | null> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT id FROM wallet.ecomerse_sellers
       WHERE user_id = ${userId}::uuid AND status = 'active' LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  private async shopOf(userId: string): Promise<any | null> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.shops WHERE owner_id = ${userId}::uuid LIMIT 1`;
    return rows[0] ?? null;
  }

  // ─────────────────────────── CATEGORÍAS ────────────────────────────────────
  /** Árbol de categorías activas (2 niveles) con sus atributos por defecto. */
  async categories() {
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, parent_id, code, name, icon, service_type, default_attributes, sort_order
        FROM lifebook.categories WHERE active
       ORDER BY sort_order, name`;
    const roots = rows.filter((r) => !r.parent_id);
    return {
      categories: roots.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        icon: r.icon,
        serviceType: r.service_type,
        defaultAttributes: r.default_attributes ?? [],
        children: rows
          .filter((c) => c.parent_id === r.id)
          .map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            icon: c.icon,
            serviceType: c.service_type,
            defaultAttributes: c.default_attributes ?? [],
          })),
      })),
    };
  }

  // ─────────────────────────── TIENDA ────────────────────────────────────────
  private shopShape(s: any, pm: any[], sp: any[], extra: Record<string, unknown> = {}) {
    return {
      id: s.id,
      ownerId: s.owner_id,
      name: s.name,
      logoUrl: s.logo_url,
      coverUrl: s.cover_url,
      categoryId: s.category_id,
      sellerType: s.seller_type,
      country: s.country,
      city: s.city,
      barrio: s.barrio,
      region: s.region,
      addressReference: s.address_reference,
      lat: s.lat === null ? null : Number(s.lat),
      lng: s.lng === null ? null : Number(s.lng),
      description: s.description,
      contactMode: s.contact_mode,
      openingHours: s.opening_hours ?? {},
      verificationLevel: s.verification_level,
      isVerified: s.is_verified,
      rating: Number(s.rating ?? 0),
      ratingCount: Number(s.rating_count ?? 0),
      followersCount: Number(s.followers_count ?? 0),
      isActive: s.is_active,
      ecomerse: !!s.ecomerse_seller_id,
      createdAt: s.created_at,
      paymentMethods: pm.map((m) => ({ method: m.method, status: m.status, label: m.note ?? null })),
      shippingPolicies: sp.map((p) => ({
        id: p.id,
        name: p.name,
        originCity: p.origin_city,
        originBarrio: p.origin_barrio,
        originRegion: p.origin_region,
        coverage: p.coverage ?? [],
        transportModes: p.transport_modes ?? [],
        estimatedTime: p.estimated_time,
        costMode: p.cost_mode,
        baseCostXaf: Number(p.base_cost_xaf ?? 0),
        perKmXaf: Number(p.per_km_xaf ?? 0),
        shipsInternational: p.ships_international,
        internationalNote: p.international_note,
        isDefault: p.is_default,
      })),
      ...extra,
    };
  }

  private async shopChildren(shopId: string) {
    const pm: any[] = await this.db.$queryRaw`
      SELECT method, status, note FROM lifebook.shop_payment_methods
       WHERE shop_id = ${shopId}::uuid ORDER BY method`;
    const sp: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.shipping_policies WHERE shop_id = ${shopId}::uuid
       ORDER BY is_default DESC, created_at`;
    return { pm, sp };
  }

  /** Mi tienda (crea el comerciante su escaparate). Una tienda por persona. */
  async myShop(userId: string) {
    const shop = await this.shopOf(userId);
    if (!shop) return { shop: null };
    const { pm, sp } = await this.shopChildren(shop.id);
    const stats: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${shop.id}::uuid AND p.status = 'active') AS active_products,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${shop.id}::uuid AND p.status = 'pending') AS pending_products`;
    return {
      shop: this.shopShape(shop, pm, sp, {
        activeProducts: Number(stats[0]?.active_products ?? 0),
        pendingProducts: Number(stats[0]?.pending_products ?? 0),
      }),
    };
  }

  // ═══════════════════════ TANDA D: EL CARRITO ═══════════════════════════════

  /**
   * El carrito de quien tiene la sesión, con los datos de cada producto y los totales.
   *
   * Se devuelve todo lo que la pantalla necesita para pintar (título, foto, precio, tienda) y
   * los totales ya calculados, para que la app no tenga que sumar y equivocarse.
   * Los productos que ya no están activos **no se cuentan** (ni en el total): un carrito no
   * puede cobrar algo retirado.
   */
  /**
   * EL CARRITO, agrupado por TIENDA y con la verdad de cada línea.
   *
   * Lo que la especificación pide y aquí se cumple:
   *   · **Un solo carrito** (no hay «carrito del grupo» ni «de la tienda»): sale de `cart_items`
   *     por usuario, y por eso está sincronizado con la CUENTA, no con el dispositivo.
   *   · **Agrupado por tienda** (`groups`), que es como se enseña y como se paga después
   *     (un pedido por tienda). El orden de los grupos es por nombre de tienda para que no baile.
   *   · Cada línea dice **por qué no se puede pagar**, si es el caso, en vez de desaparecer:
   *     `agotado` · `no_disponible` · `eliminado`. Una línea cuyo producto ya no existe SE QUEDA
   *     (con su foto guardada) como recordatorio, y solo se va si la persona la quita.
   *   · **`priceChanged`**: el precio de hoy contra el de cuando se añadió
   *     (`unit_price_xaf`), con el anterior para tacharlo.
   *   · **`maxQuantity`**: el tope real de esa línea (stock de la variante o del producto) para que
   *     el «+» se apague donde debe, no en un 99 inventado.
   */
  async myCart(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT ci.id, ci.quantity, ci.variant_id, ci.created_at, ci.unit_price_xaf,
             ci.title_snapshot, ci.media_snapshot, ci.source_kind, ci.source_id, ci.source_label,
             p.id AS product_id, p.title, p.short_description, p.price_mode, p.price_xaf,
             p.old_price_xaf, p.media, p.currency, p.service_type, p.status AS product_status,
             p.stock_mode, p.stock_quantity,
             s.id AS shop_id, s.name AS shop_name, s.logo_url AS shop_logo,
             s.is_verified AS shop_verified, s.verification_level AS shop_level,
             v.id AS var_id, v.name AS var_name, v.price_xaf AS var_price, v.stock_quantity AS var_stock
        FROM lifebook.cart_items ci
        LEFT JOIN lifebook.products p ON p.id = ci.product_id
        LEFT JOIN lifebook.shops s ON s.id = p.shop_id
        LEFT JOIN lifebook.product_variants v ON v.id = ci.variant_id
       WHERE ci.user_id = ${userId}::uuid
       ORDER BY s.name NULLS LAST, ci.created_at DESC`;

    const items = filas.map((r) => {
      const sinProducto = !r.product_id;
      const hoy = r.var_price === null || r.var_price === undefined
        ? (r.price_xaf === null || r.price_xaf === undefined ? null : Number(r.price_xaf))
        : Number(r.var_price);
      const cuando = r.unit_price_xaf === null || r.unit_price_xaf === undefined
        ? null
        : Number(r.unit_price_xaf);
      const cantidad = Number(r.quantity ?? 1);
      const stockVar = r.var_stock === null || r.var_stock === undefined ? null : Number(r.var_stock);
      const stockProd = r.stock_mode === 'exact' ? Number(r.stock_quantity ?? 0) : null;

      // Por qué esta línea no se puede pagar (o sí). El orden importa: primero lo que la hace
      // imposible del todo (ya no existe / ya no se vende) y después el stock.
      let status = 'ok';
      if (sinProducto) status = 'eliminado';
      else if (r.product_status === 'sold_out') status = 'agotado';
      else if (r.product_status !== 'active') status = 'no_disponible';
      else if (r.var_id && stockVar !== null && stockVar <= 0) status = 'agotado';
      else if (!r.var_id && stockProd !== null && stockProd <= 0) status = 'agotado';

      const disponible = status === 'ok';
      const tope = r.var_id ? stockVar : stockProd;
      const precio = sinProducto ? cuando : hoy;
      const media = Array.isArray(r.media) ? r.media : [];

      return {
        id: r.id,
        productId: r.product_id ?? null,
        variantId: r.variant_id ?? null,
        variantName: r.var_name ?? null,
        title: r.title ?? r.title_snapshot ?? 'Producto',
        shortDescription: r.short_description ?? null,
        priceMode: r.price_mode ?? 'fixed',
        priceXaf: precio,
        /** El precio del día en que se añadió (para «Precio cambió» y el tachado). */
        addedPriceXaf: cuando,
        priceChanged: !sinProducto && cuando !== null && hoy !== null && cuando !== hoy,
        oldPriceXaf: r.old_price_xaf === null || r.old_price_xaf === undefined ? null : Number(r.old_price_xaf),
        currency: String(r.currency ?? 'XAF').trim(),
        coverUrl: sinProducto
          ? (r.media_snapshot ?? null)
          : (media[0]?.url ?? r.media_snapshot ?? null),
        serviceType: r.service_type ?? 'physical',
        quantity: cantidad,
        /** Tope real de esta línea (99 = sin stock declarado). */
        maxQuantity: tope === null ? 99 : Math.max(0, Math.min(99, tope)),
        lineTotalXaf: precio === null ? null : precio * cantidad,
        available: disponible,
        status,
        statusLabel: status === 'eliminado' ? 'Producto eliminado'
          : status === 'agotado' ? 'Agotado'
            : status === 'no_disponible' ? 'Ya no está a la venta'
              : null,
        /** De dónde salió: es lo que permite «Precio del grupo» o «Precio de live». */
        sourceKind: r.source_kind ?? 'ficha',
        sourceId: r.source_id ?? null,
        sourceLabel: r.source_label ?? null,
        shop: r.shop_id
          ? {
            id: r.shop_id, name: r.shop_name, logoUrl: r.shop_logo,
            isVerified: !!r.shop_verified, verificationLevel: r.shop_level,
          }
          : null,
        addedAt: r.created_at,
      };
    });

    // Agrupado por tienda (los productos que ya no tienen tienda van a un grupo sin tienda).
    const groups: any[] = [];
    const porTienda = new Map<string, any>();
    for (const it of items) {
      const clave = it.shop?.id ?? 'sin-tienda';
      let g = porTienda.get(clave);
      if (!g) {
        g = { shop: it.shop, items: [], count: 0, subtotalXaf: 0, problems: 0 };
        porTienda.set(clave, g);
        groups.push(g);
      }
      g.items.push(it);
      g.count += it.quantity;
      if (it.lineTotalXaf !== null) g.subtotalXaf += it.lineTotalXaf;
      if (!it.available) g.problems += 1;
    }

    // Con qué se puede pagar en CADA tienda del carrito, en UNA consulta para todas: la caja
    // genera un pedido por tienda y cada tienda acepta sus métodos.
    const tiendas = groups.map((g: any) => g.shop?.id).filter(Boolean);
    const pms: any[] = tiendas.length
      ? await this.db.$queryRaw`
          SELECT shop_id, method, status FROM lifebook.shop_payment_methods
           WHERE shop_id = ANY(${tiendas}::uuid[]) ORDER BY method`
      : [];
    for (const g of groups as any[]) {
      g.paymentMethods = pms
        .filter((m) => String(m.shop_id) === String(g.shop?.id))
        .map((m) => ({ method: String(m.method), status: String(m.status) }));
    }

    // La ENTREGA también es de cada tienda: su política de envío manda. Sin esto, la caja del
    // carrito enseñaría formas de entrega que esa tienda no ofrece, o un envío «a consultar» que
    // en realidad es fijo. Se saca en una consulta para todas las tiendas del carrito.
    const politicas: any[] = tiendas.length
      ? await this.db.$queryRaw`
          SELECT DISTINCT ON (shop_id) shop_id, transport_modes, cost_mode, base_cost_xaf
            FROM lifebook.shipping_policies
           WHERE shop_id = ANY(${tiendas}::uuid[])
           ORDER BY shop_id, is_default DESC, created_at`
      : [];
    for (const g of groups as any[]) {
      const pol = politicas.find((x) => String(x.shop_id) === String(g.shop?.id)) ?? null;
      const modos = Array.isArray(pol?.transport_modes) ? (pol.transport_modes as unknown[]).map((m) => String(m)) : [];
      g.deliveryModes = ['pickup', ...modos.filter((m) => m !== 'pickup')];
      g.deliveryCostMode = pol?.cost_mode ? String(pol.cost_mode) : null;
      g.deliveryCostXaf = pol?.base_cost_xaf === null || pol?.base_cost_xaf === undefined ? null : Number(pol.base_cost_xaf);
    }

    // Los productos «a consultar» (sin precio) no se pueden totalizar: se avisa en vez de
    // contar 0, que daría un total falso.
    const conPrecio = items.filter((i) => i.lineTotalXaf !== null);
    const cobrables = conPrecio.filter((i) => i.available);
    return {
      groups,
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      lines: items.length,
      /** Total de TODO el carrito (lo que se puede totalizar). */
      totalXaf: conPrecio.reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0),
      /** Total de lo que SÍ se puede pagar hoy (sin agotados ni eliminados). */
      totalDisponibleXaf: cobrables.reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0),
      /** Cuántas líneas tienen algún problema (no seleccionables). */
      problems: items.filter((i) => !i.available).length,
      /** `true` si hay algo sin precio: el total no es el definitivo. */
      hasOnRequest: items.some((i) => i.lineTotalXaf === null),
    };
  }

  /**
   * Añadir (o cambiar la cantidad de) un producto. Cantidad 1..99.
   * No se puede añadir un producto **de tu propia tienda**: comprarse a uno mismo no es una
   * compra, y además descuadraría las ventas.
   */
  async addToCart(
    userId: string,
    dto: {
      productId?: string; variantId?: string | null; quantity?: number;
      /** De dónde se añade: ficha | chat | grupo | live | mercado (por defecto, ficha). */
      sourceKind?: string; sourceId?: string | null; sourceLabel?: string | null;
    },
  ) {
    const pid = this.uuidOrNull(dto?.productId) as string;
    const prod: any[] = await this.db.$queryRaw`
      SELECT p.id, p.status, p.shop_id, p.title, p.price_xaf, p.media, s.owner_id
        FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid LIMIT 1`;
    if (!prod[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe');
    if (prod[0].status !== 'active') throw new DomainError('PRODUCT_NOT_ACTIVE', 'Ese producto ya no está a la venta');
    if (String(prod[0].owner_id) === userId) throw new DomainError('CANNOT_BUY_OWN', 'Ese producto es de tu propia tienda');

    const vid = dto?.variantId ? (this.uuidOrNull(dto.variantId) as string) : null;
    let precioVariante: number | null = null;
    if (vid) {
      const v: any[] = await this.db.$queryRaw`
        SELECT id, price_xaf FROM lifebook.product_variants
         WHERE id = ${vid}::uuid AND product_id = ${pid}::uuid LIMIT 1`;
      if (!v[0]) throw new DomainError('VARIANT_NOT_FOUND', 'Esa variante no es de este producto');
      precioVariante = v[0].price_xaf === null || v[0].price_xaf === undefined ? null : Number(v[0].price_xaf);
    }

    // La FOTO del momento: precio, título e imagen. Es lo que permite decir «Precio cambió» y
    // seguir contando qué era si la tienda borra el producto. En un re-toque (ON CONFLICT) NO se
    // pisa: el precio de referencia es el de la PRIMERA vez que se añadió.
    const medio = Array.isArray(prod[0].media) ? prod[0].media : [];
    const precio = precioVariante ?? (prod[0].price_xaf === null ? null : Number(prod[0].price_xaf));
    const tipo = ['ficha', 'chat', 'grupo', 'live', 'mercado'].includes(String(dto?.sourceKind))
      ? String(dto?.sourceKind)
      : 'ficha';
    const fuente = dto?.sourceId ? (this.uuidOrNull(dto.sourceId) as string) : null;
    const etiqueta = dto?.sourceLabel ? String(dto.sourceLabel).slice(0, 120) : null;

    const cant = Math.max(1, Math.min(99, Number(dto?.quantity ?? 1) || 1));
    await this.db.$executeRaw`
      INSERT INTO lifebook.cart_items
        (user_id, product_id, variant_id, quantity, unit_price_xaf, title_snapshot, media_snapshot,
         source_kind, source_id, source_label)
      VALUES
        (${userId}::uuid, ${pid}::uuid, ${vid}::uuid, ${cant}::smallint, ${precio},
         ${String(prod[0].title ?? '').slice(0, 200)}, ${medio[0]?.url ? String(medio[0].url).slice(0, 400) : null},
         ${tipo}, ${fuente}::uuid, ${etiqueta})
      ON CONFLICT (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET quantity = ${cant}::smallint, updated_at = now()`;
    return this.myCart(userId);
  }

  /** Cambiar la cantidad de una línea (0 o menos = quitarla). */
  async setCartQuantity(userId: string, productId: string, quantity: unknown) {
    const pid = this.uuidOrNull(productId) as string;
    const cant = Number(quantity ?? 1) || 0;
    if (cant <= 0) {
      await this.db.$executeRaw`
        DELETE FROM lifebook.cart_items WHERE user_id = ${userId}::uuid AND product_id = ${pid}::uuid`;
    } else {
      await this.db.$executeRaw`
        UPDATE lifebook.cart_items SET quantity = ${Math.min(99, cant)}::smallint, updated_at = now()
         WHERE user_id = ${userId}::uuid AND product_id = ${pid}::uuid`;
    }
    return this.myCart(userId);
  }

  /** Quitar una línea del carrito. */
  async removeFromCart(userId: string, productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    await this.db.$executeRaw`
      DELETE FROM lifebook.cart_items WHERE user_id = ${userId}::uuid AND product_id = ${pid}::uuid`;
    return this.myCart(userId);
  }

  /** Vaciar el carrito entero. */
  async clearCart(userId: string) {
    await this.db.$executeRaw`DELETE FROM lifebook.cart_items WHERE user_id = ${userId}::uuid`;
    return this.myCart(userId);
  }

  /**
   * Cambiar UNA LÍNEA por su id: cantidad y/o variante.
   *
   * Por id y no por producto porque el mismo producto puede estar dos veces con variantes
   * distintas (la tabla lo permite): quitar «por producto» se llevaba las dos.
   *
   * Al CAMBIAR DE VARIANTE se refresca el precio de referencia: es una decisión nueva de la
   * persona, no un cambio de precio de la tienda, y marcarlo como «Precio cambió» sería ruido.
   */
  async setCartLine(userId: string, lineId: string, dto: { quantity?: unknown; variantId?: string | null }) {
    const id = this.uuidOrNull(lineId) as string;
    const linea: any[] = await this.db.$queryRaw`
      SELECT id, product_id, variant_id FROM lifebook.cart_items
       WHERE id = ${id}::uuid AND user_id = ${userId}::uuid LIMIT 1`;
    if (!linea[0]) throw new DomainError('CART_LINE_NOT_FOUND', 'Esa línea no está en tu carrito');

    if (dto?.variantId !== undefined) {
      const vid = dto.variantId ? (this.uuidOrNull(dto.variantId) as string) : null;
      let precio: number | null = null;
      if (vid) {
        const v: any[] = await this.db.$queryRaw`
          SELECT id, price_xaf FROM lifebook.product_variants
           WHERE id = ${vid}::uuid AND product_id = ${linea[0].product_id}::uuid LIMIT 1`;
        if (!v[0]) throw new DomainError('VARIANT_NOT_FOUND', 'Esa variante no es de este producto');
        precio = v[0].price_xaf === null || v[0].price_xaf === undefined ? null : Number(v[0].price_xaf);
      } else {
        const p: any[] = await this.db.$queryRaw`
          SELECT price_xaf FROM lifebook.products WHERE id = ${linea[0].product_id}::uuid LIMIT 1`;
        precio = p[0]?.price_xaf === null || p[0]?.price_xaf === undefined ? null : Number(p[0].price_xaf);
      }
      await this.db.$executeRaw`
        UPDATE lifebook.cart_items SET variant_id = ${vid}::uuid, unit_price_xaf = ${precio}, updated_at = now()
         WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`;
    }

    if (dto?.quantity !== undefined) {
      const cant = Math.floor(Number(dto.quantity ?? 1) || 0);
      if (cant <= 0) {
        await this.db.$executeRaw`
          DELETE FROM lifebook.cart_items WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`;
      } else {
        await this.db.$executeRaw`
          UPDATE lifebook.cart_items SET quantity = ${Math.max(1, Math.min(99, cant))}::smallint, updated_at = now()
           WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`;
      }
    }
    return this.myCart(userId);
  }

  /** Quitar UNA línea del carrito (por su id). */
  async removeCartLine(userId: string, lineId: string) {
    const id = this.uuidOrNull(lineId) as string;
    await this.db.$executeRaw`
      DELETE FROM lifebook.cart_items WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`;
    return this.myCart(userId);
  }

  /**
   * Acciones EN BLOQUE del modo «Editar»: quitar varias líneas y/o moverlas a favoritos.
   *
   * «Mover a favoritos» = guardarlas (`product_saves`, que es la lista de guardados que ya existe)
   * y quitarlas del carrito. Se hace en una transacción: o se guardan y salen, o no pasa nada.
   */
  async cartBulk(userId: string, dto: { remove?: unknown; toFavorites?: unknown }) {
    const limpiar = (v: unknown): string[] =>
      (Array.isArray(v) ? v : []).map((x) => this.uuidOrNull(x)).filter(Boolean).slice(0, 100) as string[];
    const quitar = limpiar(dto?.remove);
    const guardar = limpiar(dto?.toFavorites);
    let movidos = 0;

    await this.db.$transaction(async (tx: any) => {
      if (guardar.length) {
        const filas: any[] = await tx.$queryRaw`
          SELECT DISTINCT product_id FROM lifebook.cart_items
           WHERE user_id = ${userId}::uuid AND id = ANY(${guardar}::uuid[]) AND product_id IS NOT NULL`;
        for (const f of filas) {
          await tx.$executeRaw`
            INSERT INTO lifebook.product_saves (user_id, product_id)
            VALUES (${userId}::uuid, ${f.product_id}::uuid)
            ON CONFLICT (user_id, product_id) DO NOTHING`;
          movidos += 1;
        }
        await tx.$executeRaw`
          DELETE FROM lifebook.cart_items WHERE user_id = ${userId}::uuid AND id = ANY(${guardar}::uuid[])`;
      }
      if (quitar.length) {
        await tx.$executeRaw`
          DELETE FROM lifebook.cart_items WHERE user_id = ${userId}::uuid AND id = ANY(${quitar}::uuid[])`;
      }
    });

    const carrito = await this.myCart(userId);
    return { ...carrito, movedToFavorites: movidos };
  }

  /**
   * TANDA A — LA TARJETA DE LA TIENDA PARA EL PERFIL, en UNA petición.
   *
   * El perfil necesita, de golpe: el nombre comercial (que NO es el nombre del usuario), el
   * logo, la descripción, la puntuación y hasta 3 productos destacados. Se devuelve todo
   * junto para que abrir un perfil cueste una petición y no cinco.
   *
   * Si el usuario no tiene tienda ACTIVA se devuelve `{ shop: null }`: la app NO debe pintar
   * una tarjeta vacía (la especificación lo dice: si no hay, no hay hueco).
   */
  async userShopCard(ownerId: string) {
    const shop = await this.shopOf(ownerId);
    if (!shop || !shop.is_active) return { shop: null, featured: [] };

    // Solo productos ACTIVOS y ya destacados. `featured_position` ordena (1,2,3).
    const filas: any[] = await this.db.$queryRaw`
      SELECT id, title, short_description, long_description, price_mode, price_xaf, old_price_xaf,
             media, sales_count, rating, rating_count, currency, featured_position
        FROM lifebook.products
       WHERE shop_id = ${shop.id}::uuid
         AND status = 'active'
         AND featured_position IS NOT NULL
       ORDER BY featured_position
       LIMIT 3`;

    return {
      shop: {
        id: shop.id,
        ownerId: shop.owner_id,
        name: shop.name,                       // el nombre COMERCIAL, no el del usuario
        logoUrl: shop.logo_url,
        coverUrl: shop.cover_url,
        description: shop.description ?? null,
        city: shop.city ?? null,
        isVerified: !!shop.is_verified,
        // `ratingCount` es el que manda: sin reseñas no se enseña puntuación.
        rating: Number(shop.rating ?? 0),
        ratingCount: Number(shop.rating_count ?? 0),
        followersCount: Number(shop.followers_count ?? 0),
      },
      featured: filas.map((p) => ({
        id: p.id,
        title: p.title,
        shortDescription: p.short_description ?? null,
        priceMode: p.price_mode,
        priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
        oldPriceXaf: p.old_price_xaf === null ? null : Number(p.old_price_xaf),
        currency: String(p.currency ?? 'XAF').trim(),
        coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
        salesCount: Number(p.sales_count ?? 0),
        rating: Number(p.rating ?? 0),
        ratingCount: Number(p.rating_count ?? 0),
        position: Number(p.featured_position),
      })),
    };
  }

  /**
   * TANDA A — ELEGIR A MANO LOS DESTACADOS (lo pidió el dueño: «es su decisión qué quiere
   * que se vea primero»). Máximo 3, y solo productos SUYOS y activos: el id de la tienda
   * sale del token, nunca del cuerpo, así que no se puede destacar en la tienda de otro.
   *
   * Los ids llegan EN ORDEN: el primero es el que se ve primero. Lo que no venga en la
   * lista se apaga, y así no hay que borrar de uno en uno.
   */
  async setFeatured(userId: string, ids: unknown) {
    const shop = await this.shopOf(userId);
    if (!shop) throw new DomainError('SHOP_NOT_FOUND', 'Todavía no tienes tienda');

    const crudos = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
    // Sin repetidos y como mucho 3 (si mandan más, se quedan los tres primeros: es más
    // útil que rechazar toda la petición y perder lo que sí habían elegido).
    const lista = [...new Set(crudos)].slice(0, 3);

    if (lista.length) {
      const mios: any[] = await this.db.$queryRaw`
        SELECT id::text AS id FROM lifebook.products
         WHERE shop_id = ${shop.id}::uuid AND status = 'active'`;
      const validos = new Set(mios.map((r) => String(r.id)));
      const ajeno = lista.find((id) => !validos.has(id));
      if (ajeno) {
        throw new DomainError('PRODUCT_NOT_MINE',
          'Solo puedes destacar productos activos de tu propia tienda');
      }
    }

    // Primero se apaga todo (evita chocar con el índice único de (tienda, posición)),
    // después se colocan los elegidos en su orden.
    await this.db.$executeRaw`
      UPDATE lifebook.products SET featured_position = NULL
       WHERE shop_id = ${shop.id}::uuid AND featured_position IS NOT NULL`;
    for (let i = 0; i < lista.length; i++) {
      await this.db.$executeRaw`
        UPDATE lifebook.products SET featured_position = ${i + 1}::smallint
         WHERE id = ${lista[i]}::uuid AND shop_id = ${shop.id}::uuid`;
    }
    return this.userShopCard(userId);
  }

  async createShop(userId: string, dto: ShopInput) {
    const existing = await this.shopOf(userId);
    if (existing) throw new DomainError('SHOP_EXISTS', 'Ya tienes una tienda creada');

    const name = this.clean(dto.name, 80);
    if (name.length < 2) throw new DomainError('SHOP_NAME_REQUIRED', 'Ponle un nombre a la tienda (mín. 2 letras)');
    const description = dto.description ? this.text(dto.description, 600, 'Descripción') : null;
    const city = this.clean(dto.city, 60) || null;
    const barrio = this.clean(dto.barrio, 60) || null;
    const sellerType = this.one(dto.sellerType, SELLER_TYPES, 'local', 'SELLER_TYPE_INVALID', 'Tipo de vendedor no válido');
    const region = dto.region ? this.one(dto.region, REGIONS, 'other', 'REGION_INVALID', 'Región no válida') : null;
    const categoryId = this.uuidOrNull(dto.categoryId);
    if (categoryId) await this.assertCategory(categoryId);
    const lat = Number(dto.lat);
    const lng = Number(dto.lng);
    if (dto.lat !== undefined && (lat === null || !Number.isFinite(lat) || lat < -90 || lat > 90)) throw new DomainError('LAT_INVALID', 'Latitud no válida');
    if (dto.lng !== undefined && (lng === null || !Number.isFinite(lng) || lng < -180 || lng > 180)) throw new DomainError('LNG_INVALID', 'Longitud no válida');
    const ecomerse = await this.ecomerseSellerId(userId);

    const rows: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.shops
        (owner_id, ecomerse_seller_id, category_id, name, logo_url, cover_url, seller_type, country,
         city, barrio, region, address_reference, lat, lng, description, opening_hours,
         verification_level, is_verified)
      VALUES
        (${userId}::uuid, ${ecomerse}::uuid, ${categoryId}::uuid, ${name},
         ${this.clean(dto.logoUrl, 400) || null}, ${this.clean(dto.coverUrl, 400) || null},
         ${sellerType}, ${this.clean(dto.country, 40) || 'GQ'}, ${city}, ${barrio}, ${region},
         ${this.clean(dto.addressReference, 200) || null},
         ${Number.isFinite(lat) ? lat : null}, ${Number.isFinite(lng) ? lng : null},
         ${description}, ${JSON.stringify(dto.openingHours ?? {})}::jsonb,
         ${ecomerse ? 'verified' : 'basic'}, ${!!ecomerse})
      RETURNING *`;
    const shop = rows[0];

    // Métodos de pago: el comerciante DECLARA cuáles acepta; el ESTADO lo pone el servidor.
    const methods = Array.isArray(dto.paymentMethods) ? dto.paymentMethods.slice(0, PAY_METHODS.length) : [];
    const chosen = methods.length ? methods : ['cash_on_delivery'];
    const seen = new Set<string>();
    for (const raw of chosen) {
      const m = String(raw ?? '').trim().toLowerCase();
      if (!m || seen.has(m)) continue;
      if (!(PAY_METHODS as readonly string[]).includes(m)) {
        throw new DomainError('PAYMENT_METHOD_INVALID', `Método de pago no disponible: ${m}`);
      }
      seen.add(m);
      await this.db.$executeRaw`
        INSERT INTO lifebook.shop_payment_methods (shop_id, method, status)
        VALUES (${shop.id}::uuid, ${m}, ${METHOD_STATUS[m] ?? 'coming_soon'})
        ON CONFLICT (shop_id, method) DO NOTHING`;
    }

    const sp = dto.shippingPolicy ?? null;
    if (sp) await this.insertShippingPolicy(shop.id, shop.city, shop.barrio, shop.region, sp);

    const { pm, sp: policies } = await this.shopChildren(shop.id);
    return { shop: this.shopShape(shop, pm, policies) };
  }

  /** Normaliza los campos de una política de envío (se usa al crear y al editar). */
  private policyFields(
    sp: NonNullable<ShopInput['shippingPolicy']>,
    city: string | null, barrio: string | null, region: string | null,
  ) {
    const coverage = (Array.isArray(sp.coverage) ? sp.coverage : [])
      .map((c) => String(c).toLowerCase()).filter((c) => (COVERAGE as readonly string[]).includes(c)).slice(0, COVERAGE.length);
    const modes = (Array.isArray(sp.transportModes) ? sp.transportModes : [])
      .map((c) => String(c).toLowerCase()).filter((c) => (TRANSPORT as readonly string[]).includes(c)).slice(0, TRANSPORT.length);
    const costMode = this.one(sp.costMode, COST_MODES, 'on_request', 'COST_MODE_INVALID', 'Modo de coste no válido');
    const base = this.money(sp.baseCostXaf ?? 0, 'Coste base') ?? 0;
    const perKm = this.money(sp.perKmXaf ?? 0, 'Coste por km') ?? 0;
    return {
      name: this.clean(sp.name, 60) || 'Estándar',
      city, barrio, region,
      coverage, modes,
      estimatedTime: this.clean(sp.estimatedTime, 60) || null,
      costMode, base, perKm,
      shipsInternational: !!sp.shipsInternational,
      internationalNote: sp.internationalNote ? this.text(sp.internationalNote, 300, 'Nota internacional') : null,
    };
  }

  private async insertShippingPolicy(
    shopId: string, city: string | null, barrio: string | null, region: string | null, sp: NonNullable<ShopInput['shippingPolicy']>,
  ) {
    const f = this.policyFields(sp, city, barrio, region);
    return this.db.$executeRaw`
      INSERT INTO lifebook.shipping_policies
        (shop_id, name, origin_city, origin_barrio, origin_region, coverage, transport_modes,
         estimated_time, cost_mode, base_cost_xaf, per_km_xaf, ships_international, international_note, is_default)
      VALUES
        (${shopId}::uuid, ${f.name}, ${f.city}, ${f.barrio}, ${f.region},
         ${f.coverage}::text[], ${f.modes}::text[], ${f.estimatedTime}, ${f.costMode},
         ${f.base}, ${f.perKm}, ${f.shipsInternational}, ${f.internationalNote}, true)`;
  }

  /**
   * Edita la política de envío **en su sitio** (Parte 34).
   * Antes se borraba y se volvía a crear, y como los productos la referencian con
   * `ON DELETE SET NULL`, **al tocar el envío de la tienda los productos ya
   * publicados se quedaban sin entrega**. Lo destapó el E2E al probar el camino
   * que usa el asistente.
   */
  private async updateShippingPolicyInPlace(
    shopId: string, city: string | null, barrio: string | null, region: string | null,
    sp: NonNullable<ShopInput['shippingPolicy']>,
  ): Promise<boolean> {
    const existente: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.shipping_policies WHERE shop_id = ${shopId}::uuid
       ORDER BY is_default DESC, created_at LIMIT 1`;
    if (!existente[0]) return false;
    const f = this.policyFields(sp, city, barrio, region);
    await this.db.$executeRaw`
      UPDATE lifebook.shipping_policies SET
        name = ${f.name}, origin_city = ${f.city}, origin_barrio = ${f.barrio}, origin_region = ${f.region},
        coverage = ${f.coverage}::text[], transport_modes = ${f.modes}::text[],
        estimated_time = ${f.estimatedTime}, cost_mode = ${f.costMode},
        base_cost_xaf = ${f.base}, per_km_xaf = ${f.perKm},
        ships_international = ${f.shipsInternational}, international_note = ${f.internationalNote},
        is_default = true, updated_at = now()
      WHERE id = ${existente[0].id}::uuid`;
    return true;
  }

  async updateShop(userId: string, dto: ShopInput) {
    const shop = await this.shopOf(userId);
    if (!shop) throw new DomainError('SHOP_NOT_FOUND', 'Todavía no tienes tienda');
    const name = dto.name !== undefined ? this.clean(dto.name, 80) : shop.name;
    if (name.length < 2) throw new DomainError('SHOP_NAME_REQUIRED', 'El nombre de la tienda es obligatorio');
    const region = dto.region !== undefined
      ? (dto.region ? this.one(dto.region, REGIONS, 'other', 'REGION_INVALID', 'Región no válida') : null)
      : shop.region;
    const categoryId = dto.categoryId !== undefined ? this.uuidOrNull(dto.categoryId) : shop.category_id;
    if (categoryId) await this.assertCategory(categoryId);
    const lat = dto.lat !== undefined ? Number(dto.lat) : null;
    const lng = dto.lng !== undefined ? Number(dto.lng) : null;
    if (dto.lat !== undefined && (lat === null || !Number.isFinite(lat) || lat < -90 || lat > 90)) throw new DomainError('LAT_INVALID', 'Latitud no válida');
    if (dto.lng !== undefined && (lng === null || !Number.isFinite(lng) || lng < -180 || lng > 180)) throw new DomainError('LNG_INVALID', 'Longitud no válida');

    const rows: any[] = await this.db.$queryRaw`
      UPDATE lifebook.shops SET
        name = ${name},
        description = ${dto.description !== undefined ? (dto.description ? this.text(dto.description, 600, 'Descripción') : null) : shop.description},
        category_id = ${categoryId}::uuid,
        logo_url = ${dto.logoUrl !== undefined ? (this.clean(dto.logoUrl, 400) || null) : shop.logo_url},
        cover_url = ${dto.coverUrl !== undefined ? (this.clean(dto.coverUrl, 400) || null) : shop.cover_url},
        city = ${dto.city !== undefined ? (this.clean(dto.city, 60) || null) : shop.city},
        barrio = ${dto.barrio !== undefined ? (this.clean(dto.barrio, 60) || null) : shop.barrio},
        region = ${region},
        address_reference = ${dto.addressReference !== undefined ? (this.clean(dto.addressReference, 200) || null) : shop.address_reference},
        lat = ${dto.lat !== undefined ? (typeof lat === 'number' && Number.isFinite(lat) ? lat : null) : shop.lat},
        lng = ${dto.lng !== undefined ? (typeof lng === 'number' && Number.isFinite(lng) ? lng : null) : shop.lng},
        opening_hours = ${dto.openingHours !== undefined ? JSON.stringify(dto.openingHours) : JSON.stringify(shop.opening_hours ?? {})}::jsonb,
        seller_type = ${dto.sellerType !== undefined ? this.one(dto.sellerType, SELLER_TYPES, shop.seller_type, 'SELLER_TYPE_INVALID', 'Tipo de vendedor no válido') : shop.seller_type},
        updated_at = now()
      WHERE owner_id = ${userId}::uuid
      RETURNING *`;

    if (Array.isArray(dto.paymentMethods)) {
      for (const raw of dto.paymentMethods) {
        const m = String(raw ?? '').trim().toLowerCase();
        if (!(PAY_METHODS as readonly string[]).includes(m)) continue;
        await this.db.$executeRaw`
          INSERT INTO lifebook.shop_payment_methods (shop_id, method, status)
          VALUES (${shop.id}::uuid, ${m}, ${METHOD_STATUS[m] ?? 'coming_soon'})
          ON CONFLICT (shop_id, method) DO NOTHING`;
      }
      await this.db.$executeRaw`
        DELETE FROM lifebook.shop_payment_methods
         WHERE shop_id = ${shop.id}::uuid AND method <> ALL(${dto.paymentMethods.map((m) => String(m).toLowerCase())}::text[])`;
    }
    if (dto.shippingPolicy) {
      // Se edita en su sitio para no dejar sin entrega a los productos ya publicados.
      const editada = await this.updateShippingPolicyInPlace(
        shop.id, rows[0].city, rows[0].barrio, rows[0].region, dto.shippingPolicy,
      );
      if (!editada) {
        await this.insertShippingPolicy(shop.id, rows[0].city, rows[0].barrio, rows[0].region, dto.shippingPolicy);
      }
    }
    const { pm, sp } = await this.shopChildren(shop.id);
    return { shop: this.shopShape(rows[0], pm, sp) };
  }

  /** Ficha pública de la tienda (con pestañas: catálogo, notas, opiniones, info). */
  async shopPublic(shopId: string, viewerId?: string) {
    const sid = this.uuidOrNull(shopId) as string;
    const rows: any[] = await this.db.$queryRaw`
      SELECT s.*, u.full_name AS owner_name, u.avatar_url AS owner_avatar, u.city AS owner_city,
             EXISTS(SELECT 1 FROM lifebook.follows f
                     WHERE f.followee_id = s.owner_id AND f.follower_id = ${viewerId ?? null}::uuid) AS following
        FROM lifebook.shops s
        JOIN mobility.users u ON u.id = s.owner_id
       WHERE s.id = ${sid}::uuid LIMIT 1`;
    const s = rows[0];
    if (!s || (!s.is_active && s.owner_id !== viewerId)) throw new DomainError('SHOP_NOT_FOUND', 'La tienda no existe');

    const { pm, sp } = await this.shopChildren(s.id);
    const stats: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active') AS products,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active' AND p.service_type IN ('physical','food')) AS sales,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active' AND p.service_type NOT IN ('physical','food')) AS services,
        (SELECT count(*)::int FROM lifebook.shop_follows f WHERE f.shop_id = ${s.id}::uuid) AS followers,
        (SELECT count(*)::int FROM lifebook.shop_follows f WHERE f.user_id = ${viewerId ?? null}::uuid AND f.shop_id = ${s.id}::uuid) AS followed_by_me`;

    return {
      shop: this.shopShape(s, pm, sp, {
        owner: {
          id: s.owner_id,
          name: s.owner_name,
          avatarUrl: s.owner_avatar,
          city: s.owner_city,
        },
        following: !!s.following,
        followedByMe: Number(stats[0]?.followed_by_me ?? 0) > 0,
        stats: {
          products: Number(stats[0]?.products ?? 0),
          sales: Number(stats[0]?.sales ?? 0),
          services: Number(stats[0]?.services ?? 0),
          followers: Number(stats[0]?.followers ?? 0),
        },
      }),
    };
  }

  // ─────────────────────────── PUBLICAR ──────────────────────────────────────
  private async assertCategory(categoryId: string): Promise<any> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, parent_id, service_type FROM lifebook.categories WHERE id = ${categoryId}::uuid AND active LIMIT 1`;
    if (!rows[0]) throw new DomainError('CATEGORY_NOT_FOUND', 'La categoría no existe');
    return rows[0];
  }

  /**
   * Publica un producto o servicio EN LA TIENDA DEL USUARIO (nunca en otra).
   * Queda en 'pending' hasta que la moderación lo apruebe.
   *
   * Parte 34 — idempotencia a prueba de DOBLE TOQUE SIMULTÁNEO: la clave se
   * reserva con `INSERT … ON CONFLICT DO NOTHING` **dentro de la misma
   * transacción** que crea el producto. Si la reserva no entra, ya hay otra
   * petición con esa clave: se devuelve su respuesta guardada o, si aún está en
   * curso, 409 `IDEMPOTENCY_IN_PROGRESS`. Si el alta falla, la transacción se
   * deshace y la clave queda libre para reintentar.
   */
  async createProduct(userId: string, dto: ProductInput, idemKey?: string) {
    const key = this.clean(idemKey, 120);
    if (key) {
      const prev: any[] = await this.db.$queryRaw`
        SELECT response FROM lifebook.idempotency_keys
         WHERE user_id = ${userId}::uuid AND endpoint = 'createProduct' AND key = ${key}
           AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`;
      if (prev[0]?.response) return prev[0].response;
    }

    const shop = await this.shopOf(userId);
    if (!shop) throw new DomainError('SHOP_REQUIRED', 'Crea tu tienda antes de publicar');
    if (!shop.is_active) throw new DomainError('SHOP_INACTIVE', 'Tu tienda está desactivada');

    const serviceType = this.one(dto.serviceType, SERVICE_TYPES, 'physical', 'SERVICE_TYPE_INVALID', 'Tipo de publicación no válido');
    const title = this.title(dto.title, 140);
    if (title.length < 3) throw new DomainError('TITLE_REQUIRED', 'El título necesita al menos 3 letras');
    const short = dto.shortDescription ? this.text(dto.shortDescription, 200, 'Descripción corta') : null;
    const long = dto.longDescription ? this.text(dto.longDescription, DESC_MAX, 'Descripción') : null;
    const priceMode = this.one(dto.priceMode, PRICE_MODES, 'fixed', 'PRICE_MODE_INVALID', 'Modo de precio no válido');
    const price = this.money(dto.priceXaf, 'Precio');
    if (priceMode !== 'on_request' && (price === null || price <= 0)) {
      throw new DomainError('PRICE_REQUIRED', 'Indica el precio (o marca «a consultar»)');
    }
    // Parte 34: si llega 0, se entiende «sin descuento» (antes un cliente que
    // mandaba 0 al dejar el campo vacío recibía OLD_PRICE_INVALID y no podía publicar).
    const oldPriceRaw = this.money(dto.oldPriceXaf, 'Precio anterior');
    const oldPrice = oldPriceRaw !== null && oldPriceRaw > 0 ? oldPriceRaw : null;
    if (oldPrice !== null && price !== null && oldPrice <= price) {
      throw new DomainError('OLD_PRICE_INVALID', 'El precio anterior debe ser mayor que el actual');
    }
    const stockMode = this.one(dto.stockMode, STOCK_MODES, 'exact', 'STOCK_MODE_INVALID', 'Modo de existencias no válido');
    const stock = Number.isInteger(Number(dto.stockQuantity)) ? Math.max(0, Number(dto.stockQuantity)) : 0;
    const condition = this.one(dto.condition, CONDITIONS, 'new', 'CONDITION_INVALID', 'Estado del producto no válido');
    const region = dto.originRegion
      ? this.one(dto.originRegion, REGIONS, 'other', 'REGION_INVALID', 'Región no válida')
      : (shop.region ?? null);
    const categoryId = this.uuidOrNull(dto.categoryId);
    if (categoryId) await this.assertCategory(categoryId);
    const media = this.media(dto.media);
    // Venta física: al menos una foto (igual que la venta de Life Book).
    if (serviceType === 'physical' && media.length === 0) {
      throw new DomainError('MEDIA_REQUIRED', 'La venta necesita al menos una foto');
    }
    // 🔒 El ALOJAMIENTO no se publica por aquí (Parte 42-e).
    //
    // `hotel_room` es un tipo de servicio válido de Life Book y este alta lo aceptaba, pero
    // creaba SOLO la publicación: sin la fila de `lifebook.room_types`, que es donde viven el
    // inventario, el calendario, la estancia mínima, la señal y la retención. El resultado era
    // una publicación de «Alojamiento» en el catálogo que **no se puede reservar** (el buscador
    // de hotel solo lista tipos de habitación reales) y que, desde esta misma parte, tampoco se
    // puede «pedir» (`SERVICE_NOT_ORDERABLE`): un callejón sin salida visible para el huésped.
    // Medido: `POST /products {serviceType:'hotel_room'}` respondía 201.
    //
    // El alta correcta es `POST …/hotel/my/room-types`, que crea publicación Y tipo de
    // habitación en una sola transacción.
    if (serviceType === 'hotel_room') {
      throw new DomainError('SERVICE_NOT_ORDERABLE',
        'El alojamiento se da de alta desde el panel del hotel (habitaciones), no desde «Vender»: una habitación necesita inventario, calendario y señal');
    }
    const tags = this.tags(dto.tags);
    // Validar hijos ANTES de escribir: si algo falla, no queda nada a medias.
    this.validateChildren(dto);
    const shippingPolicyId = this.uuidOrNull(dto.shippingPolicyId);
    if (shippingPolicyId) {
      const own: any[] = await this.db.$queryRaw`
        SELECT 1 FROM lifebook.shipping_policies WHERE id = ${shippingPolicyId}::uuid AND shop_id = ${shop.id}::uuid LIMIT 1`;
      if (!own[0]) throw new DomainError('SHIPPING_POLICY_NOT_FOUND', 'Esa política de envío no es de tu tienda');
    }

    // Alta + hijos + reserva de clave + respuesta guardada: TODO en una transacción.
    const result = await this.db.$transaction(async (tx: any) => {
      if (key) {
        const reservado: number = await tx.$executeRaw`
          INSERT INTO lifebook.idempotency_keys (user_id, endpoint, key)
          VALUES (${userId}::uuid, 'createProduct', ${key})
          ON CONFLICT (user_id, endpoint, key) DO NOTHING`;
        if (!reservado) {
          const cur: any[] = await tx.$queryRaw`
            SELECT response FROM lifebook.idempotency_keys
             WHERE user_id = ${userId}::uuid AND endpoint = 'createProduct' AND key = ${key} LIMIT 1`;
          if (cur[0]?.response) return { replayed: cur[0].response };
          throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'Esa publicación ya se está enviando, espera un momento');
        }
      }

      const rows: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.products
          (shop_id, category_id, service_type, title, short_description, long_description, price_mode,
           price_xaf, old_price_xaf, stock_mode, stock_quantity, condition, status,
           origin_city, origin_barrio, origin_region, ships_international, shipping_policy_id, media, tags)
        VALUES
          (${shop.id}::uuid, ${categoryId}::uuid, ${serviceType}, ${title}, ${short}, ${long}, ${priceMode},
           ${price}, ${oldPrice}, ${stockMode}, ${stock}, ${condition}, 'pending',
           ${this.clean(dto.originCity, 60) || shop.city}, ${this.clean(dto.originBarrio, 60) || shop.barrio},
           ${region}, ${!!dto.shipsInternational}, ${shippingPolicyId}::uuid,
           ${JSON.stringify(media)}::jsonb, ${tags}::text[])
        RETURNING id`;
      const newId = rows[0].id as string;
      await this.replaceChildren(newId, dto, tx);
      const created = await this.product(newId, userId, { countView: false, db: tx });

      if (key) {
        await tx.$executeRaw`
          UPDATE lifebook.idempotency_keys
             SET response = ${JSON.stringify(created)}::jsonb, expires_at = now() + interval '1 day'
           WHERE user_id = ${userId}::uuid AND endpoint = 'createProduct' AND key = ${key}`;
      }
      return { created };
    });

    return 'replayed' in result ? result.replayed : result.created;
  }

  /**
   * Valida variantes y atributos ANTES de tocar la base. Sin esto, un duplicado
   * dejaba el producto a medio crear (el INSERT ya se había hecho) → el E2E lo
   * destapó: ahora los errores de validación no escriben nada, y además todo el
   * alta va en una transacción.
   */
  private validateChildren(dto: ProductInput) {
    const variants = Array.isArray(dto.variants) ? dto.variants : [];
    if (variants.length > VARIANTS_MAX) {
      throw new DomainError('VARIANTS_LIMIT', `Como máximo ${VARIANTS_MAX} opciones por producto`);
    }
    const names = new Set<string>();
    const skus = new Set<string>();
    for (const v of variants) {
      const name = this.clean(v?.name, 120);
      if (!name) throw new DomainError('VARIANT_NAME_REQUIRED', 'Cada opción necesita un nombre');
      const norm = name.toLowerCase();
      if (names.has(norm)) throw new DomainError('VARIANT_DUPLICATED', `La opción «${name}» está repetida`);
      names.add(norm);
      this.money(v?.priceXaf, `Precio de «${name}»`);
      const sku = this.clean(v?.sku, 60).toLowerCase();
      if (sku) {
        if (skus.has(sku)) throw new DomainError('VARIANT_DUPLICATED', `El código «${sku}» está repetido`);
        skus.add(sku);
      }
    }
    const attrs = Array.isArray(dto.attributes) ? dto.attributes : [];
    if (attrs.length > ATTRS_MAX) {
      throw new DomainError('ATTRIBUTES_LIMIT', `Como máximo ${ATTRS_MAX} detalles por producto`);
    }
    const keys = new Set<string>();
    for (const a of attrs) {
      const k = this.clean(a?.key, 40);
      if (!k) continue;
      const norm = k.toLowerCase();
      if (keys.has(norm)) throw new DomainError('ATTRIBUTE_DUPLICATED', `El detalle «${k}» está repetido`);
      keys.add(norm);
    }
  }

  private async replaceChildren(productId: string, dto: ProductInput, db: any = this.db) {
    const variants = Array.isArray(dto.variants) ? dto.variants.slice(0, VARIANTS_MAX) : [];
    if (variants.length) {
      await db.$executeRaw`DELETE FROM lifebook.product_variants WHERE product_id = ${productId}::uuid`;
      const seen = new Set<string>();
      let position = 0;
      for (const v of variants) {
        const name = this.clean(v?.name, 120);
        if (!name) continue;
        const norm = name.toLowerCase();
        if (seen.has(norm)) throw new DomainError('VARIANT_DUPLICATED', `La opción «${name}» está repetida`);
        seen.add(norm);
        const vPrice = this.money(v?.priceXaf, `Precio de «${name}»`);
        const vStock = Number.isInteger(Number(v?.stockQuantity)) ? Math.max(0, Number(v.stockQuantity)) : 0;
        const weight = Number.isInteger(Number(v?.weightG)) ? Math.max(0, Number(v.weightG)) : null;
        const img = this.clean(v?.imageUrl, 400) || null;
        await db.$executeRaw`
          INSERT INTO lifebook.product_variants
            (product_id, name, price_xaf, stock_quantity, sku, image_url, weight_g, attributes, position)
          VALUES (${productId}::uuid, ${name}, ${vPrice}, ${vStock}, ${this.clean(v?.sku, 60) || null}, ${img},
                  ${weight}, ${JSON.stringify(v?.attributes ?? {})}::jsonb, ${position})`;
        position += 1;
      }
    }
    const attrs = Array.isArray(dto.attributes) ? dto.attributes.slice(0, ATTRS_MAX) : [];
    if (attrs.length) {
      await db.$executeRaw`DELETE FROM lifebook.product_attributes WHERE product_id = ${productId}::uuid`;
      const seen = new Set<string>();
      let order = 0;
      for (const a of attrs) {
        const k = this.clean(a?.key, 40);
        const v = this.clean(a?.value, 200);
        if (!k || !v) continue;
        const norm = k.toLowerCase();
        if (seen.has(norm)) throw new DomainError('ATTRIBUTE_DUPLICATED', `El detalle «${k}» está repetido`);
        seen.add(norm);
        await db.$executeRaw`
          INSERT INTO lifebook.product_attributes (product_id, key, value, display_order)
          VALUES (${productId}::uuid, ${k}, ${v}, ${order})`;
        order += 1;
      }
    }
  }

  /** Editar mi producto → vuelve a moderación (como Ecomerse). */
  async updateProduct(userId: string, productId: string, dto: ProductInput) {
    const pid = this.uuidOrNull(productId) as string;
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.* FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid AND s.owner_id = ${userId}::uuid LIMIT 1`;
    const p = rows[0];
    if (!p) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe o no es tuyo');

    const title = dto.title !== undefined ? this.title(dto.title, 140) : p.title;
    if (title.length < 3) throw new DomainError('TITLE_REQUIRED', 'El título necesita al menos 3 letras');
    const priceMode = dto.priceMode !== undefined
      ? this.one(dto.priceMode, PRICE_MODES, p.price_mode, 'PRICE_MODE_INVALID', 'Modo de precio no válido')
      : p.price_mode;
    const price = dto.priceXaf !== undefined ? this.money(dto.priceXaf, 'Precio') : (p.price_xaf === null ? null : Number(p.price_xaf));
    if (priceMode !== 'on_request' && (price === null || price <= 0)) {
      throw new DomainError('PRICE_REQUIRED', 'Indica el precio (o marca «a consultar»)');
    }
    const oldPriceRaw = dto.oldPriceXaf !== undefined
      ? this.money(dto.oldPriceXaf, 'Precio anterior')
      : (p.old_price_xaf === null ? null : Number(p.old_price_xaf));
    const oldPrice = oldPriceRaw !== null && oldPriceRaw > 0 ? oldPriceRaw : null;
    if (oldPrice !== null && price !== null && oldPrice <= price) {
      throw new DomainError('OLD_PRICE_INVALID', 'El precio anterior debe ser mayor que el actual');
    }
    const categoryId = dto.categoryId !== undefined ? this.uuidOrNull(dto.categoryId) : p.category_id;
    if (categoryId) await this.assertCategory(categoryId);
    const media = dto.media !== undefined ? this.media(dto.media) : (p.media ?? []);
    if (p.service_type === 'physical' && media.length === 0) {
      throw new DomainError('MEDIA_REQUIRED', 'La venta necesita al menos una foto');
    }
    this.validateChildren(dto);

    const rows2: any[] = await this.db.$transaction(async (tx: any) => {
      const updated: any[] = await tx.$queryRaw`
      UPDATE lifebook.products SET
        title = ${title},
        short_description = ${dto.shortDescription !== undefined ? (dto.shortDescription ? this.text(dto.shortDescription, 200, 'Descripción corta') : null) : p.short_description},
        long_description = ${dto.longDescription !== undefined ? (dto.longDescription ? this.text(dto.longDescription, DESC_MAX, 'Descripción') : null) : p.long_description},
        category_id = ${categoryId}::uuid,
        price_mode = ${priceMode},
        price_xaf = ${price},
        old_price_xaf = ${oldPrice},
        stock_mode = ${dto.stockMode !== undefined ? this.one(dto.stockMode, STOCK_MODES, p.stock_mode, 'STOCK_MODE_INVALID', 'Modo de existencias no válido') : p.stock_mode},
        stock_quantity = ${dto.stockQuantity !== undefined && Number.isInteger(Number(dto.stockQuantity)) ? Math.max(0, Number(dto.stockQuantity)) : p.stock_quantity},
        condition = ${dto.condition !== undefined ? this.one(dto.condition, CONDITIONS, p.condition, 'CONDITION_INVALID', 'Estado no válido') : p.condition},
        origin_city = ${dto.originCity !== undefined ? (this.clean(dto.originCity, 60) || null) : p.origin_city},
        origin_barrio = ${dto.originBarrio !== undefined ? (this.clean(dto.originBarrio, 60) || null) : p.origin_barrio},
        ships_international = ${dto.shipsInternational !== undefined ? !!dto.shipsInternational : p.ships_international},
        media = ${JSON.stringify(media)}::jsonb,
        tags = ${dto.tags !== undefined ? this.tags(dto.tags) : p.tags}::text[],
        status = CASE WHEN ${p.status} IN ('active','hidden','sold_out') THEN 'pending' ELSE ${p.status} END,
        rejection_reason = NULL,
        updated_at = now()
      WHERE id = ${pid}::uuid
      RETURNING id`;
      if (dto.variants !== undefined || dto.attributes !== undefined) {
        await this.replaceChildren(updated[0].id, dto, tx);
      }
      return updated;
    });
    return this.product(pid, userId, { countView: false });
  }

  /** El vendedor oculta, reactiva o marca agotado (nunca se auto-aprueba). */
  /**
   * Acciones del vendedor sobre su producto (Parte 37 — cierra un agujero):
   * antes `activate` ponía el producto en `active` **desde cualquier estado**, así
   * que un vendedor podía **auto-aprobarse** una publicación que estaba en
   * revisión (`pending`) o rechazada. Ahora cada acción declara **desde qué
   * estados** es válida y, si no lo es, se explica en vez de cambiar el estado.
   *   · `hide`      · ocultar (desde activo o agotado)
   *   · `activate`  · reactivar (solo desde oculto o agotado: ya pasó moderación)
   *   · `sold_out`  · marcar agotado (desde activo u oculto)
   *   · `draft`     · guardar como borrador (retirar de circulación)
   *   · `publish`   · enviar a revisión (desde borrador o rechazado)
   */
  async setProductStatus(userId: string, productId: string, action: string) {
    const pid = this.uuidOrNull(productId) as string;
    const a = String(action ?? '').trim().toLowerCase();
    const map: Record<string, { to: string; from: string[]; aviso: string }> = {
      hide: { to: 'hidden', from: ['active', 'sold_out'], aviso: 'Solo se puede ocultar lo que está publicado' },
      activate: { to: 'active', from: ['hidden', 'sold_out'], aviso: 'Para publicarlo tiene que pasar antes por revisión (envíalo a revisión)' },
      sold_out: { to: 'sold_out', from: ['active', 'hidden'], aviso: 'Solo se puede marcar agotado lo que está publicado u oculto' },
      draft: { to: 'draft', from: ['pending', 'active', 'hidden', 'sold_out', 'rejected'], aviso: 'No se puede guardar como borrador en ese estado' },
      publish: { to: 'pending', from: ['draft', 'rejected'], aviso: 'Solo se envían a revisión los borradores o lo rechazado' },
    };
    const cfg = map[a];
    if (!cfg) throw new DomainError('ACTION_INVALID', 'Acción no válida (hide · activate · sold_out · draft · publish)');
    const rows: any[] = await this.db.$queryRaw`
      UPDATE lifebook.products p SET
        status = CASE WHEN p.status = ANY(${cfg.from}::text[]) THEN ${cfg.to} ELSE p.status END,
        rejection_reason = CASE WHEN ${cfg.to} = 'pending' THEN NULL ELSE p.rejection_reason END,
        published_at = CASE WHEN ${cfg.to} = 'active' AND p.published_at IS NULL THEN now() ELSE p.published_at END,
        updated_at = now()
      FROM lifebook.shops s
      WHERE p.id = ${pid}::uuid AND s.id = p.shop_id AND s.owner_id = ${userId}::uuid
      RETURNING p.id, p.status`;
    if (!rows[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe o no es tuyo');
    // La actualización es condicional: si el estado no llegó al destino, la acción
    // no aplicaba desde ese estado y se explica (antes se cambiaba igual).
    if (rows[0].status !== cfg.to) {
      throw new DomainError('INVALID_STATE_TRANSITION', `${cfg.aviso} (ahora está en «${rows[0].status}»)`);
    }
    return { id: rows[0].id, status: rows[0].status };
  }

  async deleteProduct(userId: string, productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const rows: any[] = await this.db.$queryRaw`
      DELETE FROM lifebook.products p
       USING lifebook.shops s
       WHERE p.id = ${pid}::uuid AND s.id = p.shop_id AND s.owner_id = ${userId}::uuid
      RETURNING p.id`;
    if (!rows[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe o no es tuyo');
    return { deleted: true, id: rows[0].id };
  }

  // ─────────────────────────── CATÁLOGO Y FICHA ──────────────────────────────
  private productShape(p: any, variants: any[], attrs: any[], shipping: any | null, shop: any, pm: any[], extra: Record<string, unknown> = {}) {
    return {
      id: p.id,
      shopId: p.shop_id,
      categoryId: p.category_id,
      serviceType: p.service_type,
      title: p.title,
      shortDescription: p.short_description,
      longDescription: p.long_description,
      priceMode: p.price_mode,
      priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
      oldPriceXaf: p.old_price_xaf === null ? null : Number(p.old_price_xaf),
      currency: String(p.currency ?? 'XAF').trim(),
      stockMode: p.stock_mode,
      stockQuantity: Number(p.stock_quantity ?? 0),
      condition: p.condition,
      status: p.status,
      rejectionReason: p.rejection_reason,
      originCity: p.origin_city,
      originBarrio: p.origin_barrio,
      originRegion: p.origin_region,
      shipsInternational: p.ships_international,
      media: Array.isArray(p.media) ? p.media : [],
      tags: p.tags ?? [],
      rating: Number(p.rating ?? 0),
      ratingCount: Number(p.rating_count ?? 0),
      salesCount: Number(p.sales_count ?? 0),
      viewsCount: Number(p.views_count ?? 0),
      savesCount: Number(p.saves_count ?? 0),
      createdAt: p.created_at,
      publishedAt: p.published_at,
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        priceXaf: v.price_xaf === null ? null : Number(v.price_xaf),
        stockQuantity: Number(v.stock_quantity ?? 0),
        sku: v.sku,
        imageUrl: v.image_url,
        weightG: v.weight_g,
        attributes: v.attributes ?? {},
        position: Number(v.position ?? 0),
      })),
      attributes: attrs.map((a) => ({ key: a.key, value: a.value })),
      shippingPolicy: shipping
        ? {
            id: shipping.id,
            name: shipping.name,
            originCity: shipping.origin_city,
            originBarrio: shipping.origin_barrio,
            originRegion: shipping.origin_region,
            coverage: shipping.coverage ?? [],
            transportModes: shipping.transport_modes ?? [],
            estimatedTime: shipping.estimated_time,
            costMode: shipping.cost_mode,
            baseCostXaf: Number(shipping.base_cost_xaf ?? 0),
            perKmXaf: Number(shipping.per_km_xaf ?? 0),
            shipsInternational: shipping.ships_international,
            internationalNote: shipping.international_note,
          }
        : null,
      paymentMethods: pm.map((m) => ({ method: m.method, status: m.status, note: m.note ?? null })),
      shop: {
        id: shop.id,
        ownerId: shop.owner_id,
        name: shop.name,
        logoUrl: shop.logo_url,
        coverUrl: shop.cover_url,
        sellerType: shop.seller_type,
        verificationLevel: shop.verification_level,
        isVerified: shop.is_verified,
        city: shop.city,
        barrio: shop.barrio,
        region: shop.region,
        lat: shop.lat === null || shop.lat === undefined ? null : Number(shop.lat),
        lng: shop.lng === null || shop.lng === undefined ? null : Number(shop.lng),
        rating: Number(shop.rating ?? 0),
        ratingCount: Number(shop.rating_count ?? 0),
        followersCount: Number(shop.followers_count ?? 0),
        isMine: !!extra.isMine,
      },
      isMine: !!extra.isMine,
      savedByMe: !!extra.savedByMe,
      ...extra,
    };
  }

  /** Ficha completa. Cuenta visita solo si NO es el dueño. Acepta un cliente
   *  transaccional (`db`) para poder construir la respuesta dentro de la misma
   *  transacción del alta (idempotencia). */
  async product(productId: string, viewerId?: string, opts: { countView?: boolean; db?: any } = {}) {
    const db = opts.db ?? this.db;
    const pid = this.uuidOrNull(productId) as string;
    // OJO: las columnas de la tienda van con alias (shop_*). Si se hiciera
    // `p.*, s.*` chocarían los nombres (id, status, rating, created_at…) y la
    // ficha devolvería datos de la tienda como si fueran del producto.
    const rows: any[] = await db.$queryRaw`
      SELECT p.*,
             s.id AS shop_row_id, s.owner_id, s.name AS shop_name, s.logo_url AS shop_logo,
             s.cover_url AS shop_cover, s.seller_type AS shop_seller_type,
             s.verification_level AS shop_level, s.is_verified AS shop_verified,
             s.city AS shop_city, s.barrio AS shop_barrio, s.region AS shop_region,
             s.lat AS shop_lat, s.lng AS shop_lng, s.rating AS shop_rating,
             s.rating_count AS shop_rating_count, s.followers_count AS shop_followers,
             s.is_active AS shop_active
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    const isMine = !!viewerId && row.owner_id === viewerId;
    if (row.status !== 'active' && !isMine) {
      throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    }
    const shopRow = {
      id: row.shop_row_id,
      owner_id: row.owner_id,
      name: row.shop_name,
      logo_url: row.shop_logo,
      cover_url: row.shop_cover,
      seller_type: row.shop_seller_type,
      verification_level: row.shop_level,
      is_verified: row.shop_verified,
      city: row.shop_city,
      barrio: row.shop_barrio,
      region: row.shop_region,
      lat: row.shop_lat,
      lng: row.shop_lng,
      rating: row.shop_rating,
      rating_count: row.shop_rating_count,
      followers_count: row.shop_followers,
      is_active: row.shop_active,
    };

    const variants: any[] = await db.$queryRaw`
      SELECT * FROM lifebook.product_variants WHERE product_id = ${pid}::uuid ORDER BY position, name`;
    const attrs: any[] = await db.$queryRaw`
      SELECT key, value FROM lifebook.product_attributes WHERE product_id = ${pid}::uuid ORDER BY display_order, key`;
    const shippingRows: any[] = row.shipping_policy_id
      ? await db.$queryRaw`SELECT * FROM lifebook.shipping_policies WHERE id = ${row.shipping_policy_id}::uuid LIMIT 1`
      : [];
    const pm: any[] = await db.$queryRaw`
      SELECT method, status, note FROM lifebook.shop_payment_methods WHERE shop_id = ${row.shop_id}::uuid ORDER BY method`;
    const savedRows: any[] = viewerId
      ? await db.$queryRaw`
          SELECT 1 FROM lifebook.product_saves
           WHERE product_id = ${pid}::uuid AND user_id = ${viewerId}::uuid LIMIT 1`
      : [];

    if (opts.countView !== false && !isMine) {
      // Una escritura por visita; nunca cuenta al dueño.
      this.db.$executeRaw`
        UPDATE lifebook.products SET views_count = views_count + 1 WHERE id = ${pid}::uuid`.catch(() => {});
      // El HISTORIAL de productos NO se escribe aquí: esta ruta es pública (sesión opcional) y con
      // el token caducado la petición sale sin identidad y la visita se perdía en silencio —visto
      // en el teléfono—. Se apunta en `POST /commerce/products/:id/view`, que EXIGE sesión: así, si
      // el token caducó, el cliente recibe 401, refresca y reintenta. Un solo sitio escribe.
    }

    return {
      product: this.productShape(row, variants, attrs, shippingRows[0] ?? null, shopRow, pm, {
        isMine,
        savedByMe: !!savedRows[0],
      }),
    };
  }

  /** Catálogo público con filtros y paginación por cursor (como el resto de la app). */
  async catalog(q: {
    q?: string; city?: string; serviceType?: string; categoryId?: string;
    priceMin?: string | number; priceMax?: string | number; sort?: string;
    cursor?: string; limit?: string | number; shopId?: string;
  }) {
    const limit = Math.min(30, Math.max(1, Number(q.limit ?? 20) || 20));
    const text = this.clean(q.q, 60);
    const city = this.clean(q.city, 60);
    const serviceType = q.serviceType ? this.one(q.serviceType, SERVICE_TYPES, '', 'SERVICE_TYPE_INVALID', 'Tipo no válido') : '';
    const categoryId = q.categoryId ? (this.uuidOrNull(q.categoryId) as string) : '';
    const shopId = q.shopId ? (this.uuidOrNull(q.shopId) as string) : '';
    const priceMin = q.priceMin !== undefined && q.priceMin !== '' ? (this.money(q.priceMin, 'Precio mínimo') ?? 0) : null;
    const priceMax = q.priceMax !== undefined && q.priceMax !== '' ? (this.money(q.priceMax, 'Precio máximo') ?? 0) : null;
    const sort = ['recent', 'price_asc', 'price_desc', 'rating'].includes(String(q.sort)) ? String(q.sort) : 'recent';
    const cursor = this.clean(q.cursor, 60);

    // Se construye con placeholders numerados: nada de interpolar valores.
    const args: unknown[] = [];
    const where: string[] = [`p.status = 'active'`, `s.is_active`];
    if (serviceType) { args.push(serviceType); where.push(`p.service_type = $${args.length}`); }
    if (categoryId) {
      args.push(categoryId);
      where.push(`(p.category_id = $${args.length}::uuid OR c.parent_id = $${args.length}::uuid)`);
    }
    if (shopId) { args.push(shopId); where.push(`p.shop_id = $${args.length}::uuid`); }
    if (city) { args.push(city); where.push(`(p.origin_city = $${args.length} OR s.city = $${args.length})`); }
    if (priceMin !== null) { args.push(priceMin); where.push(`(p.price_xaf IS NULL OR p.price_xaf >= $${args.length})`); }
    if (priceMax !== null) { args.push(priceMax); where.push(`(p.price_xaf IS NULL OR p.price_xaf <= $${args.length})`); }
    if (text) {
      args.push(`%${text.toLowerCase()}%`);
      // El mismo patrón vale para todas las columnas: se añaden la TIENDA y la CATEGORÍA, que
      // es lo que un visitante espera («Hotel Demo», «habitación») y antes no encontraba nada.
      where.push(`(lower(p.title) LIKE $${args.length} OR lower(coalesce(p.short_description,'')) LIKE $${args.length}
                   OR lower(coalesce(p.long_description,'')) LIKE $${args.length}
                   OR lower(s.name) LIKE $${args.length}
                   OR lower(coalesce(c.name,'')) LIKE $${args.length}
                   OR EXISTS(SELECT 1 FROM unnest(p.tags) tg WHERE lower(tg) LIKE $${args.length}))`);
    }
    if (cursor) { args.push(cursor); where.push(`p.created_at < $${args.length}::timestamptz`); }
    args.push(limit + 1);

    const orderBy = sort === 'price_asc' ? 'p.price_xaf ASC NULLS LAST, p.created_at DESC'
      : sort === 'price_desc' ? 'p.price_xaf DESC NULLS LAST, p.created_at DESC'
        : sort === 'rating' ? 'p.rating DESC, p.created_at DESC'
          : 'p.created_at DESC';

    const sql = `
      SELECT p.id, p.title, p.service_type, p.price_mode, p.price_xaf, p.old_price_xaf, p.condition,
             p.stock_mode, p.stock_quantity, p.media, p.tags, p.rating, p.rating_count, p.sales_count,
             p.short_description, p.currency,
             p.origin_city, p.origin_region, p.ships_international, p.created_at, p.status,
             s.id AS shop_id, s.name AS shop_name, s.logo_url AS shop_logo, s.city AS shop_city,
             s.region AS shop_region, s.is_verified AS shop_verified, s.verification_level AS shop_level,
             s.rating AS shop_rating, s.rating_count AS shop_rating_count, s.owner_id AS shop_owner
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
        LEFT JOIN lifebook.categories c ON c.id = p.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${args.length}`;

    const rows: any[] = await this.db.$queryRawUnsafe(sql, ...args);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? new Date(page[page.length - 1].created_at).toISOString() : null;

    return {
      items: page.map((p) => this.cardDeProducto(p)),
      nextCursor,
      total: page.length,
    };
  }

  /**
   * MERCADO (tanda F) — LA TARJETA DE LA REJILLA, en un solo sitio.
   *
   * Esta conversión (fila de base → tarjeta) vivía dentro de `catalog()`. El HISTORIAL DE
   * PRODUCTOS enseña exactamente la misma rejilla —lo pide la especificación—, así que vive aquí
   * y la usan las dos. Así no pueden divergir: si mañana la tarjeta lleva un campo más, lo llevan
   * las dos, y el tipo que ve la app dice la verdad en los dos sitios.
   */
  private cardDeProducto(p: any) {
    return {
      id: p.id,
      title: p.title,
      serviceType: p.service_type,
      priceMode: p.price_mode,
      priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
      oldPriceXaf: p.old_price_xaf === null ? null : Number(p.old_price_xaf),
      condition: p.condition,
      stockMode: p.stock_mode,
      stockQuantity: Number(p.stock_quantity ?? 0),
      media: Array.isArray(p.media) ? p.media : [],
      coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
      // La «descripción corta» que pide la rejilla YA está en la base
      // (`products.short_description`): solo no se mandaba. El comerciante la escribe al
      // publicar; aquí solo se transporta (el texto largo NO se manda a la rejilla).
      shortDescription: p.short_description ?? null,
      currency: String(p.currency ?? 'XAF').trim(),
      tags: p.tags ?? [],
      rating: Number(p.rating ?? 0),
      ratingCount: Number(p.rating_count ?? 0),
      salesCount: Number(p.sales_count ?? 0),
      originCity: p.origin_city,
      originRegion: p.origin_region,
      shipsInternational: p.ships_international,
      createdAt: p.created_at,
      status: p.status,
      shop: {
        id: p.shop_id,
        name: p.shop_name,
        logoUrl: p.shop_logo,
        city: p.shop_city,
        region: p.shop_region,
        isVerified: p.shop_verified,
        verificationLevel: p.shop_level,
        rating: Number(p.shop_rating ?? 0),
        ratingCount: Number(p.shop_rating_count ?? 0),
      },
    };
  }

  /** Productos de una tienda: el público ve los activos; el dueño, TODOS los suyos. */
  async shopProducts(shopId: string, viewerId: string | undefined,
                     opts: { cursor?: string; limit?: string | number; serviceType?: string; categoryId?: string } = {}) {
    const sid = this.uuidOrNull(shopId) as string;
    const rows: any[] = await this.db.$queryRaw`
      SELECT s.owner_id FROM lifebook.shops s WHERE s.id = ${sid}::uuid LIMIT 1`;
    if (!rows[0]) throw new DomainError('SHOP_NOT_FOUND', 'La tienda no existe');
    const isOwner = !!viewerId && rows[0].owner_id === viewerId;

    if (isOwner) return this.myProducts(viewerId as string, sid);

    return this.catalog({
      shopId: sid,
      cursor: opts.cursor,
      limit: opts.limit,
      serviceType: opts.serviceType,
      // TANDA B: la fila de categorías del perfil filtra por aquí.
      categoryId: opts.categoryId,
    } as any);
  }

  /** Mis productos (cualquier estado) — panel del comerciante. */
  async myProducts(userId: string, onlyShopId?: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.id, p.title, p.service_type, p.status, p.price_mode, p.price_xaf, p.media,
             p.stock_mode, p.stock_quantity, p.created_at, p.updated_at, p.rejection_reason,
             p.views_count, p.saves_count, p.sales_count, p.shop_id,
             (SELECT count(*)::int FROM lifebook.product_variants v WHERE v.product_id = p.id) AS variants,
               p.short_description, p.currency
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE s.owner_id = ${userId}::uuid
         AND (${onlyShopId ?? null}::uuid IS NULL OR p.shop_id = ${onlyShopId ?? null}::uuid)
       ORDER BY p.created_at DESC LIMIT 200`;
    return {
      items: rows.map((p) => ({
        id: p.id,
        title: p.title,
        serviceType: p.service_type,
        status: p.status,
        rejectionReason: p.rejection_reason,
        priceMode: p.price_mode,
        priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
        coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
        // La «descripción corta» que pide la rejilla YA está en la base
        // (`products.short_description`): solo no se mandaba. El comerciante la escribe al
        // publicar; aquí solo se transporta (el texto largo NO se manda a la rejilla).
        shortDescription: p.short_description ?? null,
        currency: String(p.currency ?? 'XAF').trim(),
        stockMode: p.stock_mode,
        stockQuantity: Number(p.stock_quantity ?? 0),
        variants: Number(p.variants ?? 0),
        viewsCount: Number(p.views_count ?? 0),
        savesCount: Number(p.saves_count ?? 0),
        salesCount: Number(p.sales_count ?? 0),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    };
  }

  // ─────────────────────────── GUARDAR / SEGUIR ─────────────────────────────
  async toggleSave(userId: string, productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const exists: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.product_saves WHERE user_id = ${userId}::uuid AND product_id = ${pid}::uuid LIMIT 1`;
    if (exists[0]) {
      await this.db.$executeRaw`DELETE FROM lifebook.product_saves WHERE user_id = ${userId}::uuid AND product_id = ${pid}::uuid`;
      await this.db.$executeRaw`UPDATE lifebook.products SET saves_count = GREATEST(0, saves_count - 1) WHERE id = ${pid}::uuid`;
      return { saved: false };
    }
    const prod: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.products WHERE id = ${pid}::uuid AND status = 'active' LIMIT 1`;
    if (!prod[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    await this.db.$executeRaw`
      INSERT INTO lifebook.product_saves (user_id, product_id) VALUES (${userId}::uuid, ${pid}::uuid)
      ON CONFLICT DO NOTHING`;
    await this.db.$executeRaw`UPDATE lifebook.products SET saves_count = saves_count + 1 WHERE id = ${pid}::uuid`;
    return { saved: true };
  }

  async mySaved(userId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.id, p.title, p.price_mode, p.price_xaf, p.media, p.service_type, p.created_at,
             s.id AS shop_id, s.name AS shop_name, s.logo_url AS shop_logo
        FROM lifebook.product_saves sv
        JOIN lifebook.products p ON p.id = sv.product_id
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE sv.user_id = ${userId}::uuid AND p.status = 'active'
       ORDER BY sv.created_at DESC LIMIT 60`;
    return {
      items: rows.map((p) => ({
        id: p.id,
        title: p.title,
        serviceType: p.service_type,
        priceMode: p.price_mode,
        priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
        coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
        // La «descripción corta» que pide la rejilla YA está en la base
        // (`products.short_description`): solo no se mandaba. El comerciante la escribe al
        // publicar; aquí solo se transporta (el texto largo NO se manda a la rejilla).
        shortDescription: p.short_description ?? null,
        currency: String(p.currency ?? 'XAF').trim(),
        createdAt: p.created_at,
        shop: { id: p.shop_id, name: p.shop_name, logoUrl: p.shop_logo },
      })),
    };
  }

  /**
   * MERCADO (tanda F) — APUNTAR UNA VISITA (con sesión).
   *
   * Es la ÚNICA puerta que escribe el historial. Exige sesión a propósito: si el token está
   * caducado, el cliente recibe 401 y su maquinaria de refresco reintenta; en la lectura pública
   * (`GET products/:id`) la petición salía anónima y la visita se perdía sin que nadie lo supiera.
   *
   * Nunca se apunta al dueño (mirar lo tuyo no es un «visto») ni a un producto que ya no está a la
   * venta. Devuelve `registrada: false` con el motivo en vez de fallar: es un dato de conveniencia,
   * no una operación que deba romper nada.
   */
  async registrarVista(userId: string, productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const fila: any[] = await this.db.$queryRaw`
      SELECT p.id, p.status, s.owner_id
        FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid LIMIT 1`;
    if (!fila[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    if (fila[0].owner_id === userId) return { ok: true, registrada: false, motivo: 'es_tuya' };
    if (String(fila[0].status) !== 'active') return { ok: true, registrada: false, motivo: 'no_disponible' };
    const veces: number = await this.db.$executeRaw`
      INSERT INTO lifebook.product_views (user_id, product_id, first_seen_at, viewed_at, times)
      VALUES (${userId}::uuid, ${pid}::uuid, now(), now(), 1)
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET viewed_at = now(), times = lifebook.product_views.times + 1`;
    return { ok: true, registrada: true, veces: Number(veces ?? 0) };
  }

  /**
   * MERCADO (tanda F) — «VISTOS HACE POCO»: el historial de productos de quien mira.
   *
   * Devuelve la MISMA tarjeta que el catálogo (`cardDeProducto`) porque la rejilla es la misma, más
   * lo propio del historial: cuándo lo vio y cuántas veces.
   *
   * 🔒 Un producto que ya NO está a la venta se devuelve con `available: false`, NO se esconde: si
   * alguien lo miró y desapareció, es más honesto decirlo que borrarlo de su historial sin avisar.
   * La app lo pinta apagado y no deja comprarlo.
   */
  async myViews(userId: string, limit = 40) {
    const n = Math.min(80, Math.max(1, Number(limit) || 40));
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.id, p.title, p.service_type, p.price_mode, p.price_xaf, p.old_price_xaf, p.condition,
             p.stock_mode, p.stock_quantity, p.media, p.tags, p.rating, p.rating_count, p.sales_count,
             p.short_description, p.currency, p.status,
             p.origin_city, p.origin_region, p.ships_international, p.created_at,
             s.id AS shop_id, s.name AS shop_name, s.logo_url AS shop_logo, s.city AS shop_city,
             s.region AS shop_region, s.is_verified AS shop_verified, s.verification_level AS shop_level,
             s.rating AS shop_rating, s.rating_count AS shop_rating_count,
             v.viewed_at, v.times
        FROM lifebook.product_views v
        JOIN lifebook.products p ON p.id = v.product_id
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE v.user_id = ${userId}::uuid
       ORDER BY v.viewed_at DESC
       LIMIT ${n}`;
    return {
      items: rows.map((p) => ({
        ...this.cardDeProducto(p),
        viewedAt: p.viewed_at,
        times: Number(p.times ?? 1),
        available: p.status === 'active',
      })),
      total: rows.length,
    };
  }

  /** Vaciar MI historial de productos: es mi rastro, lo borro yo. */
  async clearViews(userId: string) {
    const borradas: number = await this.db.$executeRaw`
      DELETE FROM lifebook.product_views WHERE user_id = ${userId}::uuid`;
    return { ok: true, deleted: Number(borradas ?? 0) };
  }

  /**
   * TANDA B — LAS CATEGORÍAS DE UNA TIENDA, con cuántos productos hay en cada una.
   *
   * Es lo que pinta la fila de chips del tab «Productos» del perfil. Solo salen las
   * categorías que el comerciante USA de verdad (no las 193 de la plataforma) y solo se
   * cuentan los productos ACTIVOS: un chip que lleva a una rejilla vacía es una trampa.
   *
   * «Todo» no viaja desde aquí: lo pone la app con `total`, porque «Todo» no es una categoría
   * de la base sino la ausencia de filtro.
   */
  async shopCategories(shopId: string) {
    const sid = this.uuidOrNull(shopId) as string;
    const tienda: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.shops WHERE id = ${sid}::uuid AND is_active LIMIT 1`;
    if (!tienda[0]) throw new DomainError('SHOP_NOT_FOUND', 'La tienda no existe');

    const filas: any[] = await this.db.$queryRaw`
      SELECT c.id, c.name, c.icon, count(*)::int AS cuantos
        FROM lifebook.products p
        JOIN lifebook.categories c ON c.id = p.category_id
       WHERE p.shop_id = ${sid}::uuid AND p.status = 'active'
       GROUP BY c.id, c.name, c.icon, c.sort_order
       ORDER BY c.sort_order NULLS LAST, count(*) DESC, c.name`;

    const total: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.products
       WHERE shop_id = ${sid}::uuid AND status = 'active'`;

    return {
      total: Number(total[0]?.n ?? 0),
      categories: filas.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon ?? null,
        count: Number(c.cuantos ?? 0),
      })),
    };
  }

  async toggleFollow(userId: string, shopId: string) {
    const sid = this.uuidOrNull(shopId) as string;
    const shop: any[] = await this.db.$queryRaw`
      SELECT id, owner_id FROM lifebook.shops WHERE id = ${sid}::uuid AND is_active LIMIT 1`;
    if (!shop[0]) throw new DomainError('SHOP_NOT_FOUND', 'La tienda no existe');
    if (shop[0].owner_id === userId) throw new DomainError('CANNOT_FOLLOW_SELF', 'No puedes seguir tu propia tienda');
    const exists: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.shop_follows WHERE user_id = ${userId}::uuid AND shop_id = ${sid}::uuid LIMIT 1`;
    if (exists[0]) {
      await this.db.$executeRaw`DELETE FROM lifebook.shop_follows WHERE user_id = ${userId}::uuid AND shop_id = ${sid}::uuid`;
      await this.db.$executeRaw`UPDATE lifebook.shops SET followers_count = GREATEST(0, followers_count - 1) WHERE id = ${sid}::uuid`;
      return { following: false };
    }
    await this.db.$executeRaw`
      INSERT INTO lifebook.shop_follows (user_id, shop_id) VALUES (${userId}::uuid, ${sid}::uuid) ON CONFLICT DO NOTHING`;
    await this.db.$executeRaw`UPDATE lifebook.shops SET followers_count = followers_count + 1 WHERE id = ${sid}::uuid`;
    return { following: true };
  }

  // ─────────────────────────── MODERACIÓN ───────────────────────────────────
  /** Cola de moderación (ADMIN). */
  async pendingProducts(limit = 40) {
    const n = Math.min(100, Math.max(1, Number(limit) || 40));
    const rows: any[] = await this.db.$queryRaw`
      SELECT p.id, p.title, p.service_type, p.price_mode, p.price_xaf, p.media, p.created_at,
             p.status, p.rejection_reason, s.id AS shop_id, s.name AS shop_name, s.is_verified,
             u.id AS owner_id, u.full_name AS owner_name,
               p.short_description, p.currency
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
        JOIN mobility.users u ON u.id = s.owner_id
       WHERE p.status IN ('pending','rejected')
       ORDER BY p.created_at DESC LIMIT ${n}`;
    return {
      items: rows.map((p) => ({
        id: p.id,
        title: p.title,
        serviceType: p.service_type,
        priceMode: p.price_mode,
        priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
        coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
        // La «descripción corta» que pide la rejilla YA está en la base
        // (`products.short_description`): solo no se mandaba. El comerciante la escribe al
        // publicar; aquí solo se transporta (el texto largo NO se manda a la rejilla).
        shortDescription: p.short_description ?? null,
        currency: String(p.currency ?? 'XAF').trim(),
        status: p.status,
        rejectionReason: p.rejection_reason,
        createdAt: p.created_at,
        shop: { id: p.shop_id, name: p.shop_name, isVerified: p.is_verified },
        owner: { id: p.owner_id, name: p.owner_name },
      })),
    };
  }

  /** Aprueba, rechaza u oculta (ADMIN). */
  async moderate(productId: string, action: string, reason?: string) {
    const pid = this.uuidOrNull(productId) as string;
    const a = String(action ?? '').trim().toLowerCase();
    if (!['approve', 'reject', 'hide'].includes(a)) {
      throw new DomainError('ACTION_INVALID', 'Acción no válida (approve · reject · hide)');
    }
    const status = a === 'approve' ? 'active' : a === 'reject' ? 'rejected' : 'hidden';
    const why = a === 'reject' ? (this.clean(reason, 300) || 'No cumple las normas de la comunidad') : null;
    const rows: any[] = await this.db.$queryRaw`
      UPDATE lifebook.products SET
        status = ${status},
        rejection_reason = ${why},
        published_at = CASE WHEN ${status} = 'active' AND published_at IS NULL THEN now() ELSE published_at END,
        updated_at = now()
      WHERE id = ${pid}::uuid
      RETURNING id, status`;
    if (!rows[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    this.log.log(`moderación producto ${pid} → ${status}`);
    return { id: rows[0].id, status: rows[0].status };
  }
}
