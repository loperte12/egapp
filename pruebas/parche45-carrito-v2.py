# =============================================================================
# parche45 — EL CARRITO v2 (agrupado por tienda, con la verdad de cada línea)
#
# QUÉ CAMBIA (servidor)
#   1. `myCart` deja de ser una lista plana:
#      · agrupa por TIENDA (`groups`);
#      · cada línea dice su ESTADO (`ok | agotado | no_disponible | eliminado`) y por qué, más
#        `maxQuantity` para que el «+» se apague al llegar al stock;
#      · detecta «PRECIO CAMBIÓ» comparando el precio de hoy con el de cuando se añadió;
#      · una línea cuyo producto ya no existe SIGUE en el carrito (foto guardada) en vez de
#        desaparecer sola.
#   2. `addToCart` guarda la foto del momento (precio, título, imagen) y de dónde salió
#      (`source_kind`: ficha | chat | grupo | live | mercado).
#   3. Nuevas rutas por LÍNEA (por id, no por producto: un producto puede estar dos veces con
#      variantes distintas):
#        PATCH  my/cart/line/:id   → cantidad y/o cambiar la variante
#        DELETE my/cart/line/:id   → quitar esa línea
#        POST   my/cart/bulk       → quitar varias y/o moverlas a favoritos (modo editar)
#
# Requiere el DDL 012 (`20260214_carrito_v2.sql`), ya aplicado.
# Uso en el servidor:  python3 /root/parche45-carrito-v2.py
# =============================================================================
import shutil
import sys

SELLO = 'carrito-v2-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'
CTL = '/opt/mirror/app/src/lifebook/commerce.controller.ts'

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


# ─────────────────────────── 1. myCart ───────────────────────────────────────
CART_VIEJO = """  async myCart(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT ci.id, ci.quantity, ci.variant_id, ci.created_at,
             p.id AS product_id, p.title, p.short_description, p.price_mode, p.price_xaf,
             p.old_price_xaf, p.media, p.currency, p.service_type,
             s.id AS shop_id, s.name AS shop_name, s.logo_url AS shop_logo,
             v.id AS var_id, v.name AS var_name, v.price_xaf AS var_price
        FROM lifebook.cart_items ci
        JOIN lifebook.products p ON p.id = ci.product_id
        JOIN lifebook.shops s ON s.id = p.shop_id
        LEFT JOIN lifebook.product_variants v ON v.id = ci.variant_id
       WHERE ci.user_id = ${userId}::uuid AND p.status = 'active'
       ORDER BY ci.created_at DESC`;

    const items = filas.map((r) => {
      const unitario = r.var_price === null || r.var_price === undefined
        ? (r.price_xaf === null ? null : Number(r.price_xaf))
        : Number(r.var_price);
      const cantidad = Number(r.quantity ?? 1);
      return {
        id: r.id,
        productId: r.product_id,
        variantId: r.variant_id,
        variantName: r.var_name ?? null,
        title: r.title,
        shortDescription: r.short_description ?? null,
        priceMode: r.price_mode,
        priceXaf: unitario,
        oldPriceXaf: r.old_price_xaf === null ? null : Number(r.old_price_xaf),
        currency: String(r.currency ?? 'XAF').trim(),
        coverUrl: (Array.isArray(r.media) ? r.media : [])[0]?.url ?? null,
        serviceType: r.service_type,
        quantity: cantidad,
        lineTotalXaf: unitario === null ? null : unitario * cantidad,
        shop: { id: r.shop_id, name: r.shop_name, logoUrl: r.shop_logo },
        addedAt: r.created_at,
      };
    });

    // Los productos «a consultar» (sin precio) no se pueden totalizar: se avisa en vez de
    // contar 0, que daría un total falso.
    const conPrecio = items.filter((i) => i.lineTotalXaf !== null);
    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      lines: items.length,
      totalXaf: conPrecio.length ? conPrecio.reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0) : 0,
      /** `true` si hay algo sin precio: el total no es el definitivo. */
      hasOnRequest: items.some((i) => i.lineTotalXaf === null),
    };
  }
"""

CART_NUEVO = """  /**
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
"""

# ─────────────────────────── 2. addToCart ────────────────────────────────────
ADD_VIEJO = """  async addToCart(userId: string, dto: { productId?: string; variantId?: string | null; quantity?: number }) {
    const pid = this.uuidOrNull(dto?.productId) as string;
    const prod: any[] = await this.db.$queryRaw`
      SELECT p.id, p.status, p.shop_id, s.owner_id
        FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid LIMIT 1`;
    if (!prod[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe');
    if (prod[0].status !== 'active') throw new DomainError('PRODUCT_NOT_ACTIVE', 'Ese producto ya no está a la venta');
    if (String(prod[0].owner_id) === userId) throw new DomainError('CANNOT_BUY_OWN', 'Ese producto es de tu propia tienda');

    const vid = dto?.variantId ? (this.uuidOrNull(dto.variantId) as string) : null;
    if (vid) {
      const v: any[] = await this.db.$queryRaw`
        SELECT id FROM lifebook.product_variants WHERE id = ${vid}::uuid AND product_id = ${pid}::uuid LIMIT 1`;
      if (!v[0]) throw new DomainError('VARIANT_NOT_FOUND', 'Esa variante no es de este producto');
    }

    const cant = Math.max(1, Math.min(99, Number(dto?.quantity ?? 1) || 1));
    await this.db.$executeRaw`
      INSERT INTO lifebook.cart_items (user_id, product_id, variant_id, quantity)
      VALUES (${userId}::uuid, ${pid}::uuid, ${vid}::uuid, ${cant}::smallint)
      ON CONFLICT (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET quantity = ${cant}::smallint, updated_at = now()`;
    return this.myCart(userId);
  }
"""

ADD_NUEVO = """  async addToCart(
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
"""

# ───────────────────── 3. métodos nuevos (línea y bloque) ────────────────────
ANCLA_FIN_CARRITO = """  /** Vaciar el carrito entero. */
  async clearCart(userId: string) {
    await this.db.$executeRaw`DELETE FROM lifebook.cart_items WHERE user_id = ${userId}::uuid`;
    return this.myCart(userId);
  }
"""

METODOS_NUEVOS = ANCLA_FIN_CARRITO + """
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
"""

SVC_EDITS = [
    ('myCart v2', CART_VIEJO, CART_NUEVO, 1),
    ('addToCart con fuente y foto', ADD_VIEJO, ADD_NUEVO, 1),
    ('métodos por línea y en bloque', ANCLA_FIN_CARRITO, METODOS_NUEVOS, 1),
]

# ─────────────────────────── 4. rutas ────────────────────────────────────────
ANCLA_RUTA_CARRITO = """  @Delete('my/cart')
  @UseGuards(JwtAuthGuard)
  clearCart(@CurrentUser() u: { userId: string }) {
    return this.commerce.clearCart(u.userId);
  }
"""

RUTAS_NUEVAS = ANCLA_RUTA_CARRITO + """
  /** Cambiar la cantidad (y/o la variante) de UNA línea del carrito, por su id. */
  @Patch('my/cart/line/:id')
  @UseGuards(JwtAuthGuard)
  setCartLine(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setCartLine(u.userId, id, dto ?? {});
  }

  /** Quitar UNA línea del carrito, por su id. */
  @Delete('my/cart/line/:id')
  @UseGuards(JwtAuthGuard)
  removeCartLine(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.removeCartLine(u.userId, id);
  }

  /**
   * Modo «Editar» del carrito: quitar varias líneas y/o moverlas a favoritos.
   * Va por aquí y no línea a línea para que sea UNA operación (o se hace entera, o no se hace).
   */
  @Post('my/cart/bulk')
  @UseGuards(JwtAuthGuard)
  cartBulk(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.cartBulk(u.userId, dto ?? {});
  }
"""

CTL_EDITS = [
    ('rutas por línea y en bloque', ANCLA_RUTA_CARRITO, RUTAS_NUEVAS, 1),
]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'cartBulk' in svc or 'my/cart/bulk' in ctl:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    respaldar(SVC)
    respaldar(CTL)
    svc = aplicar(SVC, svc, SVC_EDITS)
    ctl = aplicar(CTL, ctl, CTL_EDITS)
    if fallos:
        print('\nNO SE ESCRIBE NADA. Fallos:')
        for f in fallos:
            print(' -', f)
        return 1
    escribir(SVC, svc)
    escribir(CTL, ctl)
    print('\nescritos los dos ficheros.')
    return 0


sys.exit(main())
