# =============================================================================
# parche42 — MERCADO, tanda F: HISTORIAL DE PRODUCTOS («vistos hace poco»)
#
# Qué hace (servidor):
#   1. `commerce.service.ts`
#      · `cardDeProducto()`: la conversión fila→tarjeta de la rejilla sale de `catalog()` y pasa a
#        ser un método, para que el historial enseñe EXACTAMENTE la misma tarjeta.
#      · `product()`: además del contador público `views_count`, apunta QUIÉN lo miró en
#        `lifebook.product_views` (sin `await`, con `catch`, nunca al dueño).
#      · `myViews()` y `clearViews()`: leer y borrar el historial propio.
#   2. `commerce.controller.ts`: rutas `GET my/views` y `DELETE my/views`.
#
# Requiere la tabla `lifebook.product_views` (sql 011), ya aplicada.
# Uso en el servidor:  python3 /root/parche42-historial-productos.py
# =============================================================================
import shutil
import sys

SELLO = 'historial-productos-20260214'
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


PLANTILLA_TARJETA = """@id: p.id,
@title: p.title,
@serviceType: p.service_type,
@priceMode: p.price_mode,
@priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
@oldPriceXaf: p.old_price_xaf === null ? null : Number(p.old_price_xaf),
@condition: p.condition,
@stockMode: p.stock_mode,
@stockQuantity: Number(p.stock_quantity ?? 0),
@media: Array.isArray(p.media) ? p.media : [],
@coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
@// La «descripción corta» que pide la rejilla YA está en la base
@// (`products.short_description`): solo no se mandaba. El comerciante la escribe al
@// publicar; aquí solo se transporta (el texto largo NO se manda a la rejilla).
@shortDescription: p.short_description ?? null,
@currency: String(p.currency ?? 'XAF').trim(),
@tags: p.tags ?? [],
@rating: Number(p.rating ?? 0),
@ratingCount: Number(p.rating_count ?? 0),
@salesCount: Number(p.sales_count ?? 0),
@originCity: p.origin_city,
@originRegion: p.origin_region,
@shipsInternational: p.ships_international,
@createdAt: p.created_at,
@status: p.status,
@shop: {
@  id: p.shop_id,
@  name: p.shop_name,
@  logoUrl: p.shop_logo,
@  city: p.shop_city,
@  region: p.shop_region,
@  isVerified: p.shop_verified,
@  verificationLevel: p.shop_level,
@  rating: Number(p.shop_rating ?? 0),
@  ratingCount: Number(p.shop_rating_count ?? 0),
@},
"""


def cuerpo(sangria: int) -> str:
    """El cuerpo de la tarjeta con la sangría que toque (dentro de catalog() va 8; en el método, 6)."""
    return PLANTILLA_TARJETA.replace('@', ' ' * sangria)


CATALOGO_VIEJO = (
    "    return {\n      items: page.map((p) => ({\n"
    + cuerpo(8)
    + "      })),\n      nextCursor,\n      total: page.length,\n    };\n  }\n"
)

CATALOGO_NUEVO = (
    "    return {\n      items: page.map((p) => this.cardDeProducto(p)),\n"
    "      nextCursor,\n      total: page.length,\n    };\n  }\n"
    "\n"
    "  /**\n"
    "   * MERCADO (tanda F) — LA TARJETA DE LA REJILLA, en un solo sitio.\n"
    "   *\n"
    "   * Esta conversión (fila de base → tarjeta) vivía dentro de `catalog()`. El HISTORIAL DE\n"
    "   * PRODUCTOS enseña exactamente la misma rejilla —lo pide la especificación—, así que vive aquí\n"
    "   * y la usan las dos. Así no pueden divergir: si mañana la tarjeta lleva un campo más, lo llevan\n"
    "   * las dos, y el tipo que ve la app dice la verdad en los dos sitios.\n"
    "   */\n"
    "  private cardDeProducto(p: any) {\n"
    "    return {\n"
    + cuerpo(6)
    + "    };\n  }\n"
)

VISTA_VIEJA = """    if (opts.countView !== false && !isMine) {
      // Una escritura por visita; nunca cuenta al dueño.
      this.db.$executeRaw`
        UPDATE lifebook.products SET views_count = views_count + 1 WHERE id = ${pid}::uuid`.catch(() => {});
    }
"""

VISTA_NUEVA = """    if (opts.countView !== false && !isMine) {
      // Una escritura por visita; nunca cuenta al dueño.
      this.db.$executeRaw`
        UPDATE lifebook.products SET views_count = views_count + 1 WHERE id = ${pid}::uuid`.catch(() => {});
      /**
       * MERCADO (tanda F) — EL HISTORIAL DE PRODUCTOS.
       *
       * Además del contador público (`views_count`, que no dice QUIÉN), se apunta quién lo miró:
       * es lo que hace posible el «viste esto ayer» y lo que la persona puede borrar. Una fila por
       * persona y producto (no una por visita): se refresca la fecha y se suma al contador.
       *
       * Va SIN `await` y con `catch`: abrir una ficha no puede fallar porque el historial tropiece.
       * Y nunca se apunta al dueño: mirar lo tuyo no es un «visto».
       */
      if (viewerId) {
        this.db.$executeRaw`
          INSERT INTO lifebook.product_views (user_id, product_id, first_seen_at, viewed_at, times)
          VALUES (${viewerId}::uuid, ${pid}::uuid, now(), now(), 1)
          ON CONFLICT (user_id, product_id)
          DO UPDATE SET viewed_at = now(), times = lifebook.product_views.times + 1`.catch(() => {});
      }
    }
"""

ANCLA_CATEGORIAS = """  /**
   * TANDA B — LAS CATEGORÍAS DE UNA TIENDA, con cuántos productos hay en cada una.
"""

METODOS_NUEVOS = """  /**
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

""" + ANCLA_CATEGORIAS

SVC_EDITS = [
    ('catalog usa cardDeProducto + método nuevo', CATALOGO_VIEJO, CATALOGO_NUEVO, 1),
    ('product() apunta el historial', VISTA_VIEJA, VISTA_NUEVA, 1),
    ('myViews + clearViews', ANCLA_CATEGORIAS, METODOS_NUEVOS, 1),
]

ANCLA_GUARDADOS = """  // ───────────────────────── GUARDADOS Y SEGUIR ─────────────────────────────
"""

RUTAS_NUEVAS = """  // ─────────────────── HISTORIAL DE PRODUCTOS (tanda F) ────────────────────
  /** Lo que YO he mirado, lo último primero (la misma rejilla del catálogo). */
  @Get('my/views')
  @UseGuards(JwtAuthGuard)
  myViews(@CurrentUser() u: { userId: string }, @Query() q: Record<string, string>) {
    return this.commerce.myViews(u.userId, Number(q.limit ?? 40));
  }

  /** Vaciar mi historial de productos. */
  @Delete('my/views')
  @UseGuards(JwtAuthGuard)
  clearViews(@CurrentUser() u: { userId: string }) {
    return this.commerce.clearViews(u.userId);
  }

""" + ANCLA_GUARDADOS

CTL_EDITS = [
    ('rutas my/views', ANCLA_GUARDADOS, RUTAS_NUEVAS, 1),
]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'myViews' in svc or 'my/views' in ctl:
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
