# =============================================================================
# parche55 — CUPONES (primera mitad): la tienda los crea y la persona los recoge
#
# QUÉ HACE (servidor)
#   · MERCHANT: crear un cupón de mi tienda (`POST commerce/merchant/coupons`), listarlos con sus
#     usos (`GET`) y pausarlos/activarlos (`PATCH .../:id`). La tienda sale SIEMPRE del token.
#   · COMPRADOR: recoger un cupón por su código (`POST commerce/coupons/claim`) y ver los míos
#     (`GET commerce/my/coupons`) con su estado (usable · caducado · agotado · usado).
#
# LO QUE **NO** HACE TODAVÍA (segunda mitad, siguiente paso)
#   · aplicarlo en el carrito y en la caja (descuento en el desglose y `order_coupons`);
#   · la pantalla para que el comerciante los cree.
# Por eso el carrito todavía NO enseña cupones: enseñar un descuento que no se puede usar sería
# mentir. Las reglas de dinero, en cambio, ya están en el servidor y con topes.
#
# Requiere el DDL 014, ya aplicado.
# Uso en el servidor:  python3 /root/parche55-cupones-1.py
# =============================================================================
import shutil
import sys

SELLO = 'cupones-1-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'
CTL = '/opt/mirror/app/src/lifebook/commerce.controller.ts'

fallos = []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def aplicar(p, src, edits):
    for nombre, viejo, nuevo, veces in edits:
        n = src.count(viejo)
        if n != veces:
            fallos.append(f'{p.split("/")[-1]} [{nombre}]: esperaba {veces} apariciones y hay {n}')
            continue
        src = src.replace(viejo, nuevo)
        print(f'  ok · {nombre} ({n})')
    return src


# ── métodos nuevos, antes de «GUARDAR / SEGUIR» ──────────────────────────────
ANCLA = """  // ─────────────────────────── GUARDAR / SEGUIR ─────────────────────────────
"""

METODOS = """  // ───────────────────────────── CUPONES ───────────────────────────────────
  /**
   * MERCADO (tanda H2) — EL CUPÓN DE LA TIENDA, creado por su dueño.
   *
   * Reglas que se aplican aquí (y no en la app, porque es dinero):
   *   · `percent` (1-90 %) o `amount` (XAF). Un «100 %» no es un cupón, es un regalo: se corta a 90.
   *   · `minSubtotalXaf`: mínimo de compra para que valga.
   *   · `maxUses` (tope total) y `perUserLimit` (tope por persona).
   *   · `expiresAt` opcional.
   * El código es único por tienda y no distingue mayúsculas (MALABO10 = malabo10).
   */
  async createCoupon(userId: string, dto: any) {
    const tienda = await this.shopOf(userId);
    if (!tienda) throw new DomainError('SHOP_REQUIRED', 'Necesitas una tienda para crear cupones');
    const code = String(dto?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    if (code.length < 4) throw new DomainError('COUPON_CODE_INVALID', 'El código necesita al menos 4 letras o números');
    const title = this.clean(dto?.title, 80) || `Cupón ${code}`;
    const kind = String(dto?.kind ?? 'percent').trim().toLowerCase();
    if (!['percent', 'amount'].includes(kind)) throw new DomainError('COUPON_KIND_INVALID', 'Tipo de cupón no válido (percent · amount)');
    const value = Math.floor(Number(dto?.value ?? 0));
    if (!Number.isFinite(value) || value <= 0) throw new DomainError('COUPON_VALUE_INVALID', 'El valor del cupón tiene que ser mayor que cero');
    if (kind === 'percent' && value > 90) throw new DomainError('COUPON_PERCENT_TOO_HIGH', 'Un porcentaje mayor del 90 % no es un cupón');
    const minSubtotal = Math.max(0, Math.floor(Number(dto?.minSubtotalXaf ?? 0) || 0));
    const maxUses = dto?.maxUses === null || dto?.maxUses === undefined || dto?.maxUses === ''
      ? null
      : Math.max(1, Math.floor(Number(dto.maxUses) || 1));
    const perUser = Math.max(1, Math.floor(Number(dto?.perUserLimit ?? 1) || 1));
    let expires: string | null = null;
    if (dto?.expiresAt) {
      const d = new Date(String(dto.expiresAt));
      if (Number.isNaN(d.getTime())) throw new DomainError('COUPON_EXPIRY_INVALID', 'Fecha de caducidad no válida');
      expires = d.toISOString();
    }

    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.coupons
        (shop_id, code, title, kind, value, min_subtotal_xaf, max_uses, per_user_limit, expires_at, created_by)
      VALUES
        (${tienda.id}::uuid, ${code}, ${title}, ${kind}, ${value}, ${minSubtotal},
         ${maxUses}, ${perUser}, ${expires}::timestamptz, ${userId}::uuid)
      ON CONFLICT (shop_id, upper(code::text)) DO NOTHING
      RETURNING id, code, title, kind, value, min_subtotal_xaf, max_uses, used_count, per_user_limit,
                starts_at, expires_at, status, created_at`;
    if (!filas[0]) throw new DomainError('COUPON_CODE_TAKEN', `Ya tienes un cupón con el código ${code}`);
    return { coupon: this.couponShape(filas[0]) };
  }

  /** Los cupones de MI tienda, con cuántas veces se ha usado cada uno. */
  async myCoupons(userId: string) {
    const tienda = await this.shopOf(userId);
    if (!tienda) throw new DomainError('SHOP_REQUIRED', 'Necesitas una tienda para tener cupones');
    const filas: any[] = await this.db.$queryRaw`
      SELECT c.*, (SELECT count(*)::int FROM lifebook.coupon_claims k WHERE k.coupon_id = c.id) AS claims
        FROM lifebook.coupons c
       WHERE c.shop_id = ${tienda.id}::uuid
       ORDER BY c.created_at DESC LIMIT 100`;
    return { items: filas.map((c) => ({ ...this.couponShape(c), claims: Number(c.claims ?? 0) })) };
  }

  /** Pausar o volver a activar un cupón (no se borra: los usos quedan). */
  async setCouponStatus(userId: string, couponId: string, status: unknown) {
    const tienda = await this.shopOf(userId);
    if (!tienda) throw new DomainError('SHOP_REQUIRED', 'Necesitas una tienda');
    const cid = this.uuidOrNull(couponId) as string;
    const s = String(status ?? '').trim().toLowerCase();
    if (!['active', 'paused'].includes(s)) throw new DomainError('COUPON_STATUS_INVALID', 'Estado no válido (active · paused)');
    const filas: any[] = await this.db.$queryRaw`
      UPDATE lifebook.coupons SET status = ${s}
       WHERE id = ${cid}::uuid AND shop_id = ${tienda.id}::uuid
       RETURNING id, code, title, kind, value, min_subtotal_xaf, max_uses, used_count, per_user_limit,
                 starts_at, expires_at, status, created_at`;
    if (!filas[0]) throw new DomainError('COUPON_NOT_FOUND', 'Ese cupón no existe o no es de tu tienda');
    return { coupon: this.couponShape(filas[0]) };
  }

  /**
   * RECOGER un cupón por su código. Queda vinculado a la CUENTA (no al dispositivo), que es lo que
   * pide la especificación para los cupones que se cogen en el chat.
   */
  async claimCoupon(userId: string, codeRaw: unknown) {
    const code = String(codeRaw ?? '').trim().toUpperCase();
    if (!code) throw new DomainError('COUPON_CODE_REQUIRED', 'Escribe el código del cupón');
    const filas: any[] = await this.db.$queryRaw`
      SELECT c.*, s.name AS shop_name
        FROM lifebook.coupons c JOIN lifebook.shops s ON s.id = c.shop_id
       WHERE upper(c.code::text) = ${code} AND c.status = 'active'
       ORDER BY c.created_at LIMIT 1`;
    const c = filas[0];
    if (!c) throw new DomainError('COUPON_NOT_FOUND', 'Ese cupón no existe o ya no está activo');
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
      throw new DomainError('COUPON_EXPIRED', 'Ese cupón ha caducado');
    }
    if (c.max_uses !== null && Number(c.used_count) >= Number(c.max_uses)) {
      throw new DomainError('COUPON_USED_UP', 'Ese cupón ya se ha agotado');
    }
    const ya: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.coupon_claims WHERE coupon_id = ${c.id}::uuid AND user_id = ${userId}::uuid LIMIT 1`;
    if (!ya[0]) {
      await this.db.$executeRaw`
        INSERT INTO lifebook.coupon_claims (coupon_id, user_id) VALUES (${c.id}::uuid, ${userId}::uuid)
        ON CONFLICT (coupon_id, user_id) DO NOTHING`;
    }
    return {
      ok: true,
      alreadyHad: !!ya[0],
      coupon: {
        ...this.couponShape(c),
        shopName: c.shop_name ?? null,
        mensaje: ya[0]
          ? 'Ya tenías este cupón en tu cuenta.'
          : 'Cupón guardado en tu cuenta: se aplica al pagar.',
      },
    };
  }

  /**
   * MIS cupones: los que he recogido, con su estado real (por eso se mira todo aquí y no en la app).
   */
  async myClaimedCoupons(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT c.*, k.used_count AS my_uses, k.claimed_at, s.name AS shop_name
        FROM lifebook.coupon_claims k
        JOIN lifebook.coupons c ON c.id = k.coupon_id
        JOIN lifebook.shops s ON s.id = c.shop_id
       WHERE k.user_id = ${userId}::uuid
       ORDER BY k.claimed_at DESC LIMIT 100`;
    const ahora = Date.now();
    return {
      items: filas.map((c) => {
        const caducado = !!c.expires_at && new Date(c.expires_at).getTime() < ahora;
        const agotado = c.max_uses !== null && Number(c.used_count) >= Number(c.max_uses);
        const mios = Number(c.my_uses ?? 0) >= Number(c.per_user_limit ?? 1);
        const usable = c.status === 'active' && !caducado && !agotado && !mios;
        return {
          ...this.couponShape(c),
          shopName: c.shop_name ?? null,
          myUses: Number(c.my_uses ?? 0),
          claimedAt: c.claimed_at,
          usable,
          reason: usable ? null
            : c.status !== 'active' ? 'La tienda lo ha pausado'
              : caducado ? 'Caducado'
                : agotado ? 'Se agotó'
                  : 'Ya lo has usado',
        };
      }),
    };
  }

  /** La forma del cupón que ve la app (una sola, para que no haya dos verdades). */
  private couponShape(c: any) {
    return {
      id: c.id,
      code: String(c.code ?? ''),
      title: String(c.title ?? ''),
      kind: String(c.kind ?? 'percent'),
      value: Number(c.value ?? 0),
      minSubtotalXaf: Number(c.min_subtotal_xaf ?? 0),
      maxUses: c.max_uses === null || c.max_uses === undefined ? null : Number(c.max_uses),
      usedCount: Number(c.used_count ?? 0),
      perUserLimit: Number(c.per_user_limit ?? 1),
      startsAt: c.starts_at ?? null,
      expiresAt: c.expires_at ?? null,
      status: String(c.status ?? 'active'),
      createdAt: c.created_at ?? null,
    };
  }

""" + ANCLA

SVC_EDITS = [('métodos de cupones', ANCLA, METODOS, 1)]

# ── rutas ────────────────────────────────────────────────────────────────────
ANCLA_RUTAS = """  // ─────────────── AVISO DE REPOSICIÓN («avísame cuando llegue») ────────────
"""

RUTAS = """  // ───────────────────────────── CUPONES ───────────────────────────────────
  /** Crear un cupón de mi tienda (la tienda sale del token). */
  @Post('merchant/coupons')
  @UseGuards(JwtAuthGuard)
  createCoupon(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.createCoupon(u.userId, dto ?? {});
  }

  /** Mis cupones (los de mi tienda), con sus usos. */
  @Get('merchant/coupons')
  @UseGuards(JwtAuthGuard)
  myCoupons(@CurrentUser() u: { userId: string }) {
    return this.commerce.myCoupons(u.userId);
  }

  /** Pausar o reactivar un cupón mío. */
  @Patch('merchant/coupons/:id')
  @UseGuards(JwtAuthGuard)
  setCouponStatus(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setCouponStatus(u.userId, id, dto?.status);
  }

  /** Recoger un cupón por su código: queda en MI cuenta. */
  @Post('coupons/claim')
  @UseGuards(JwtAuthGuard)
  claimCoupon(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.claimCoupon(u.userId, dto?.code);
  }

  /** Los cupones que he recogido, con su estado. */
  @Get('my/coupons')
  @UseGuards(JwtAuthGuard)
  myClaimedCoupons(@CurrentUser() u: { userId: string }) {
    return this.commerce.myClaimedCoupons(u.userId);
  }

""" + ANCLA_RUTAS

CTL_EDITS = [('rutas de cupones', ANCLA_RUTAS, RUTAS, 1)]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'createCoupon' in svc or 'coupons/claim' in ctl:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    svc = aplicar(SVC, svc, SVC_EDITS)
    ctl = aplicar(CTL, ctl, CTL_EDITS)
    if fallos:
        print('\nNO SE ESCRIBE NADA. Fallos:')
        for f in fallos:
            print(' -', f)
        return 1
    shutil.copyfile(SVC, f'{SVC}.bak-{SELLO}')
    shutil.copyfile(CTL, f'{CTL}.bak-{SELLO}')
    print(f'respaldo: {SVC}.bak-{SELLO}')
    print(f'respaldo: {CTL}.bak-{SELLO}')
    open(SVC, 'w', encoding='utf-8', newline='').write(svc)
    open(CTL, 'w', encoding='utf-8', newline='').write(ctl)
    print('\nescritos los dos ficheros.')
    return 0


sys.exit(main())
