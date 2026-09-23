# =============================================================================
# parche48 — «AVÍSAME CUANDO LLEGUE» + «NO LLEGA A TU ZONA»
#
# QUÉ HACE (servidor)
#   1. AVISO DE REPOSICIÓN, de verdad:
#      · `POST   commerce/products/:id/interest`  → apunta que espero stock (producto o variante);
#      · `DELETE commerce/products/:id/interest`  → dejo de esperar;
#      · `product()` devuelve `watching` para que la ficha lo enseñe;
#      · al reponer (el vendedor cambia el stock o vuelve a publicar), se **avisa por el chat
#        comprador↔tienda** con un mensaje de sistema, una sola vez por persona y variante.
#   2. ZONA DE ENVÍO: la política de la tienda manda. Si la tienda no envía a la zona del comprador,
#      el grupo del carrito lo dice (`shippingWarning`) y **solo se ofrece recoger en tienda** —
#      que sigue siendo posible— en vez de dejar comprar un envío que no existe.
#
# Requiere el DDL 013, ya aplicado.
# Uso en el servidor:  python3 /root/parche48-aviso-y-zona.py
# =============================================================================
import shutil
import sys

SELLO = 'aviso-y-zona-20260214'
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


# ── 1) mapa ciudad → región ────────────────────────────────────────────────
ANCLA_COVERAGE = "const COVERAGE = ['same_city', 'continental_region', 'insular_region', 'national', 'international'] as const;"

MAPA_REGION = ANCLA_COVERAGE + """

/**
 * De qué REGIÓN es cada ciudad: es lo que permite saber si una tienda envía o no a donde vive el
 * comprador (la política de envío guarda la COBERTURA, no una lista de ciudades).
 * Guinea Ecuatorial tiene dos regiones: Insular (Bioko, Annobón) y Continental (Río Muni).
 */
const CIUDAD_REGION: Record<string, 'insular' | 'continental'> = {
  // Insular
  malabo: 'insular', luba: 'insular', riaba: 'insular', 'san antonio de pale': 'insular', annobon: 'insular',
  // Continental
  bata: 'continental', 'ebebiyin': 'continental', mongomo: 'continental', acurenam: 'continental',
  evinayong: 'continental', aconibe: 'continental', mbini: 'continental', niefang: 'continental',
  micomeseng: 'continental', 'mengomeyen': 'continental', djibloho: 'continental', oyala: 'continental',
  nsok: 'continental', nsork: 'continental', 'bidjabidjan': 'continental',
};"""

# ── 2) myCart: cobertura + aviso de zona ───────────────────────────────────
POL_VIEJO = """          SELECT DISTINCT ON (shop_id) shop_id, transport_modes, cost_mode, base_cost_xaf
            FROM lifebook.shipping_policies
           WHERE shop_id = ANY(${tiendas}::uuid[])
           ORDER BY shop_id, is_default DESC, created_at`"""

POL_NUEVO = """          SELECT DISTINCT ON (shop_id) shop_id, transport_modes, cost_mode, base_cost_xaf,
                 coverage, origin_city, origin_region
            FROM lifebook.shipping_policies
           WHERE shop_id = ANY(${tiendas}::uuid[])
           ORDER BY shop_id, is_default DESC, created_at`"""

ZONA_VIEJO = """    for (const g of groups as any[]) {
      const pol = politicas.find((x) => String(x.shop_id) === String(g.shop?.id)) ?? null;
      const modos = Array.isArray(pol?.transport_modes) ? (pol.transport_modes as unknown[]).map((m) => String(m)) : [];
      g.deliveryModes = ['pickup', ...modos.filter((m) => m !== 'pickup')];
      g.deliveryCostMode = pol?.cost_mode ? String(pol.cost_mode) : null;
      g.deliveryCostXaf = pol?.base_cost_xaf === null || pol?.base_cost_xaf === undefined ? null : Number(pol.base_cost_xaf);
    }
"""

ZONA_NUEVO = """    // ¿La tienda ENVÍA a donde vive el comprador? Su política de envío guarda la COBERTURA.
    // Sin ciudad en el perfil no se puede juzgar, y entonces NO se avisa en falso.
    const yo: any[] = await this.db.$queryRaw`
      SELECT city FROM mobility.users WHERE id = ${userId}::uuid LIMIT 1`;
    const miCiudad = this.norm(yo[0]?.city);
    const miRegion = miCiudad ? (CIUDAD_REGION[miCiudad] ?? null) : null;

    for (const g of groups as any[]) {
      const pol = politicas.find((x) => String(x.shop_id) === String(g.shop?.id)) ?? null;
      const modos = Array.isArray(pol?.transport_modes) ? (pol.transport_modes as unknown[]).map((m) => String(m)) : [];
      const cobertura = pol?.coverage ? String(pol.coverage) : null;
      const ciudadTienda = this.norm(pol?.origin_city ?? null);
      const regionTienda = pol?.origin_region ? String(pol.origin_region) : null;

      let envia = true;
      if (cobertura && miCiudad) {
        if (cobertura === 'same_city') envia = !!ciudadTienda && ciudadTienda === miCiudad;
        else if (cobertura === 'insular_region') envia = miRegion === 'insular';
        else if (cobertura === 'continental_region') envia = miRegion === 'continental';
        else envia = true; // national · international
      }
      // Sin política, el envío se acuerda por el chat: no se bloquea nada.
      g.shipsToBuyer = envia;
      g.shippingCoverage = cobertura;
      g.shippingWarning = envia
        ? null
        : (cobertura === 'same_city' && ciudadTienda
          ? `Esta tienda solo entrega en ${pol?.origin_city} · puedes recoger en tienda`
          : regionTienda
            ? `Esta tienda no envía a la Región ${miRegion === 'insular' ? 'Insular' : 'Continental'} · puedes recoger en tienda`
            : 'Esta tienda no envía a tu zona · puedes recoger en tienda');
      // Si no envía, la ÚNICA entrega posible es recoger: no se ofrece un envío que no existe.
      g.deliveryModes = envia ? ['pickup', ...modos.filter((m) => m !== 'pickup')] : ['pickup'];
      g.deliveryCostMode = pol?.cost_mode ? String(pol.cost_mode) : null;
      g.deliveryCostXaf = pol?.base_cost_xaf === null || pol?.base_cost_xaf === undefined ? null : Number(pol.base_cost_xaf);
    }
"""

# ── 3) product(): ¿estoy esperando stock? ──────────────────────────────────
WATCH_VIEJO = """    const savedRows: any[] = viewerId
      ? await db.$queryRaw`
          SELECT 1 FROM lifebook.product_saves
           WHERE product_id = ${pid}::uuid AND user_id = ${viewerId}::uuid LIMIT 1`
      : [];
"""

WATCH_NUEVO = WATCH_VIEJO + """    const watchRows: any[] = viewerId
      ? await db.$queryRaw`
          SELECT 1 FROM lifebook.product_interest
           WHERE product_id = ${pid}::uuid AND user_id = ${viewerId}::uuid AND notified_at IS NULL LIMIT 1`
      : [];
"""

EXTRA_VIEJO = """      product: this.productShape(row, variants, attrs, shippingRows[0] ?? null, shopRow, pm, {
        isMine,
        savedByMe: !!savedRows[0],
      }),"""

EXTRA_NUEVO = """      product: this.productShape(row, variants, attrs, shippingRows[0] ?? null, shopRow, pm, {
        isMine,
        savedByMe: !!savedRows[0],
        /** MERCADO (tanda G): `true` si esta persona pidió que se le avise al reponer. */
        watching: !!watchRows[0],
      }),"""

SHAPE_VIEJO = """      savedByMe: !!extra.savedByMe,"""
SHAPE_NUEVO = """      savedByMe: !!extra.savedByMe,
      /** `true` si espero stock: la ficha lo enseña («Te avisamos»). */
      watching: !!extra.watching,"""

# ── 4) avisar al reponer ───────────────────────────────────────────────────
UPD_VIEJO = """      return updated;
    });
    return this.product(pid, userId, { countView: false });
  }
"""

UPD_NUEVO = """      return updated;
    });
    // Si con este cambio volvió a haber stock, se avisa a quien lo estaba esperando.
    await this.avisarReposiciones(pid);
    return this.product(pid, userId, { countView: false });
  }
"""

STATUS_VIEJO = """    if (rows[0].status !== cfg.to) {
      throw new DomainError('INVALID_STATE_TRANSITION', `${cfg.aviso} (ahora está en «${rows[0].status}»)`);
    }
    return { id: rows[0].id, status: rows[0].status };
  }
"""

STATUS_NUEVO = """    if (rows[0].status !== cfg.to) {
      throw new DomainError('INVALID_STATE_TRANSITION', `${cfg.aviso} (ahora está en «${rows[0].status}»)`);
    }
    // Publicar de nuevo (o desmarcar «agotado») es una forma de reponer: se avisa a quien esperaba.
    if (rows[0].status === 'active') await this.avisarReposiciones(pid);
    return { id: rows[0].id, status: rows[0].status };
  }
"""

# ── 5) métodos nuevos ──────────────────────────────────────────────────────
ANCLA_METODOS = """  /**
   * MERCADO (tanda F) — APUNTAR UNA VISITA (con sesión).
"""

METODOS = """  /**
   * MERCADO (tanda G) — «AVÍSAME CUANDO LLEGUE».
   *
   * Apunta que esta persona quiere saber cuándo vuelve a haber stock. Se apunta **por variante**
   * cuando el producto tiene opciones: quien espera la «Talla 42» no quiere que le avisen por la
   * «Talla 40».
   *
   * Si ya se puede comprar, NO se apunta nada y se dice: apuntar una espera que no existe sería
   * mentirle. Y al dueño no se le apunta (no se espera a uno mismo).
   */
  async watchProduct(userId: string, productId: string, variantId?: string | null) {
    const pid = this.uuidOrNull(productId) as string;
    const fila: any[] = await this.db.$queryRaw`
      SELECT p.id, p.status, p.stock_mode, p.stock_quantity, s.owner_id
        FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid LIMIT 1`;
    if (!fila[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe');
    if (String(fila[0].owner_id) === userId) {
      throw new DomainError('CANNOT_WATCH_OWN', 'Este producto es de tu tienda: repón el stock tú mismo');
    }

    const vid = variantId ? (this.uuidOrNull(variantId) as string) : null;
    let hayStock: boolean;
    if (vid) {
      const v: any[] = await this.db.$queryRaw`
        SELECT stock_quantity FROM lifebook.product_variants
         WHERE id = ${vid}::uuid AND product_id = ${pid}::uuid LIMIT 1`;
      if (!v[0]) throw new DomainError('VARIANT_NOT_FOUND', 'Esa opción no es de este producto');
      hayStock = Number(v[0].stock_quantity ?? 0) > 0;
    } else {
      hayStock = String(fila[0].stock_mode) !== 'exact' || Number(fila[0].stock_quantity ?? 0) > 0;
    }
    if (String(fila[0].status) === 'active' && hayStock) {
      return { ok: true, watching: false, available: true, mensaje: 'Ya está disponible: puedes comprarlo ahora mismo.' };
    }

    await this.db.$executeRaw`
      INSERT INTO lifebook.product_interest (user_id, product_id, variant_id)
      VALUES (${userId}::uuid, ${pid}::uuid, ${vid}::uuid)
      ON CONFLICT (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET notified_at = NULL, created_at = now()`;
    return {
      ok: true, watching: true, available: false,
      mensaje: 'Te avisamos por el chat con la tienda en cuanto vuelva a haber.',
    };
  }

  /** Dejar de esperar stock (la persona cambia de idea o ya lo compró en otro sitio). */
  async unwatchProduct(userId: string, productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const quitadas: number = await this.db.$executeRaw`
      DELETE FROM lifebook.product_interest
       WHERE user_id = ${userId}::uuid AND product_id = ${pid}::uuid`;
    return { ok: true, watching: false, quitadas: Number(quitadas ?? 0) };
  }

  /**
   * AVISA a quien esperaba stock, UNA vez por persona y variante.
   *
   * El aviso va por el **chat comprador↔tienda** como mensaje de sistema (el mismo canal que usa el
   * pedido): es donde la persona va a mirar y donde puede responder. Si la conversación no existe,
   * se crea.
   *
   * Nunca puede romper la operación del vendedor: todo va dentro de un try/catch y, si algo falla,
   * se queda sin avisar (y se apunta en el log) en vez de tumbar el cambio de stock.
   */
  private async avisarReposiciones(productId: string): Promise<number> {
    try {
      const pendientes: any[] = await this.db.$queryRaw`
        SELECT i.user_id, i.variant_id, p.id AS product_id, p.title, p.status,
               p.stock_mode, p.stock_quantity, s.owner_id AS vendedor,
               v.name AS variant_name, v.stock_quantity AS variant_stock
          FROM lifebook.product_interest i
          JOIN lifebook.products p ON p.id = i.product_id
          JOIN lifebook.shops s ON s.id = p.shop_id
          LEFT JOIN lifebook.product_variants v ON v.id = i.variant_id
         WHERE i.product_id = ${productId}::uuid AND i.notified_at IS NULL`;
      let avisados = 0;
      for (const it of pendientes) {
        if (String(it.status) !== 'active') continue;
        const stock = it.variant_id
          ? Number(it.variant_stock ?? 0)
          : (String(it.stock_mode) === 'exact' ? Number(it.stock_quantity ?? 0) : 1);
        if (stock <= 0) continue;
        const texto = it.variant_name
          ? `✅ Ya hay stock de «${it.title}» (${it.variant_name}). Vuelve a estar disponible.`
          : `✅ «${it.title}» vuelve a estar disponible.`;
        await this.avisarEnChat(String(it.user_id), String(it.vendedor), texto, { productId: String(it.product_id) });
        await this.db.$executeRaw`
          UPDATE lifebook.product_interest SET notified_at = now()
           WHERE user_id = ${it.user_id}::uuid AND product_id = ${productId}::uuid
             AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = COALESCE(${it.variant_id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`;
        avisados += 1;
      }
      return avisados;
    } catch (e) {
      this.log.warn(`no se pudo avisar de la reposición: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Mensaje de SISTEMA en el chat comprador↔tienda (se crea la conversación si no existe). */
  private async avisarEnChat(comprador: string, vendedor: string, texto: string, payload: Record<string, unknown>) {
    let conv: any[] = await this.db.$queryRaw`
      SELECT id, user_a, user_b FROM lifebook.conversations
       WHERE kind = 'direct' AND ((user_a = ${comprador}::uuid AND user_b = ${vendedor}::uuid)
                               OR (user_a = ${vendedor}::uuid AND user_b = ${comprador}::uuid)) LIMIT 1`;
    if (!conv[0]) {
      conv = await this.db.$queryRaw`
        INSERT INTO lifebook.conversations (kind, user_a, user_b)
        VALUES ('direct', ${comprador}::uuid, ${vendedor}::uuid) RETURNING id, user_a, user_b`;
    }
    const cuerpo = texto.slice(0, 300);
    await this.db.$executeRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${conv[0].id}::uuid, ${vendedor}::uuid, ${cuerpo}, 'system', ${JSON.stringify(payload)}::jsonb)`;
    const compradorEsA = conv[0].user_a === comprador;
    await this.db.$executeRaw`
      UPDATE lifebook.conversations
         SET last_message = ${cuerpo}, last_message_at = now(),
             unread_a = unread_a + CASE WHEN ${!compradorEsA} THEN 1 ELSE 0 END,
             unread_b = unread_b + CASE WHEN ${compradorEsA} THEN 1 ELSE 0 END
       WHERE id = ${conv[0].id}::uuid`;
  }

""" + ANCLA_METODOS

SVC_EDITS = [
    ('mapa ciudad→región', ANCLA_COVERAGE, MAPA_REGION, 1),
    ('política con cobertura', POL_VIEJO, POL_NUEVO, 1),
    ('aviso de zona en el carrito', ZONA_VIEJO, ZONA_NUEVO, 1),
    ('¿espero stock?', WATCH_VIEJO, WATCH_NUEVO, 1),
    ('productShape con watching', SHAPE_VIEJO, SHAPE_NUEVO, 1),
    ('extra.watching', EXTRA_VIEJO, EXTRA_NUEVO, 1),
    ('avisar tras editar el producto', UPD_VIEJO, UPD_NUEVO, 1),
    ('avisar al volver a publicar', STATUS_VIEJO, STATUS_NUEVO, 1),
    ('métodos de espera y aviso', ANCLA_METODOS, METODOS, 1),
]

# ── 6) rutas ───────────────────────────────────────────────────────────────
ANCLA_RUTAS = """  /** Vaciar mi historial de productos. */
  @Delete('my/views')
  @UseGuards(JwtAuthGuard)
  clearViews(@CurrentUser() u: { userId: string }) {
    return this.commerce.clearViews(u.userId);
  }
"""

RUTAS = ANCLA_RUTAS + """
  // ─────────────── AVISO DE REPOSICIÓN («avísame cuando llegue») ────────────
  /** Apunta que quiero saber cuándo vuelve a haber stock (producto o variante). */
  @Post('products/:id/interest')
  @UseGuards(JwtAuthGuard)
  watchProduct(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.watchProduct(u.userId, id, dto?.variantId ?? null);
  }

  /** Dejo de esperar stock. */
  @Delete('products/:id/interest')
  @UseGuards(JwtAuthGuard)
  unwatchProduct(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.unwatchProduct(u.userId, id);
  }
"""

CTL_EDITS = [
    ('rutas de aviso de reposición', ANCLA_RUTAS, RUTAS, 1),
]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'avisarReposiciones' in svc or 'interest' in ctl:
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
