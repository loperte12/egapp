# =============================================================================
# parche58 — EL SITIO DE LA NOTA (POI) Y EL FEED POR DISTANCIA (tanda I)
#
# EL HALLAZGO QUE MANDA AQUÍ (medido antes de tocar nada)
#   De 1.006 publicaciones activas, **0 tienen coordenadas** y **0 tienen nombre de sitio**; solo 62
#   tienen barrio. Es decir: los chips «附近 / 3km / 全城» no podían funcionar, porque no hay ni un
#   dato con el que calcular una distancia. Cualquier filtro por radio habría dado un feed vacío… o
#   habría que inventarse las distancias.
#
# QUÉ HACE ESTE PARCHE (el camino crítico)
#   1. `createNote` acepta `placeName`, `placeLat`, `placeLng` y los guarda en `payload`
#      (`{ placeName, lat, lng }`). Sin coordenadas válidas NO se guarda sitio: mejor sin POI que con
#      uno falso.
#   2. El feed (`channel=nearby`) acepta `lat`, `lng`, `radiusKm`, `sort` y `since`:
#      · con `radiusKm` se queda solo con lo que TIENE coordenadas y está dentro del radio
#        (distancia real, fórmula del círculo máximo, calculada en SQL);
#      · `sort=distance` ordena por cercanía; `sort=hot` por interacción; por defecto, lo más nuevo;
#      · `since=1h|24h|7d|30d` filtra por fecha.
#   3. Cada tarjeta devuelve `placeName` y `distanceKm` (redondeado a 100 m) cuando se pidió con
#      posición: es lo que enseña «3,2 km» en la tarjeta.
#
# LO QUE **NO** HACE (siguiente paso, y por qué)
#   · La app todavía no pide el sitio al publicar ni pinta los chips de distancia: eso va en la
#     siguiente tanda. El servidor ya está listo y probado para cuando la app lo mande.
#
# Uso en el servidor:  python3 /root/parche58-poi-y-distancia.py
# =============================================================================
import shutil
import sys

SELLO = 'poi-y-distancia-20260214'
SVC = '/opt/mirror/app/src/lifebook/lifebook.service.ts'
CTL = '/opt/mirror/app/src/lifebook/lifebook.controller.ts'

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


# ── 1) createNote acepta el sitio ────────────────────────────────────────────
NOTA_DTO = """    linkType?: string; linkId?: string;
    /** TANDA C: productos de MI tienda que van dentro de la nota. */
    productIds?: string[];
  }) {"""

NOTA_DTO_NUEVO = """    linkType?: string; linkId?: string;
    /** TANDA C: productos de MI tienda que van dentro de la nota. */
    productIds?: string[];
    /** TANDA I: el SITIO exacto de la nota (POI). Sin esto no puede salir en «cerca de mí». */
    placeName?: string; placeLat?: number; placeLng?: number;
  }) {"""

NOTA_PAYLOAD = """              ${JSON.stringify({ topics: (dto.topics ?? []).slice(0, 5), coverRatio: Number(dto.coverRatio) > 0 ? Number(dto.coverRatio) : undefined })}::jsonb,"""

NOTA_PAYLOAD_NUEVO = """              ${JSON.stringify({
                topics: (dto.topics ?? []).slice(0, 5),
                coverRatio: Number(dto.coverRatio) > 0 ? Number(dto.coverRatio) : undefined,
                /* TANDA I: el sitio de la nota. Es lo que permite «qué hay cerca»: sin coordenadas,
                   una distancia calculada sería inventada. */
                ...(this.sitioDe(dto.placeName, dto.placeLat, dto.placeLng) ?? {}),
              })}::jsonb,"""

HELPER_ANCLA = """  /**
   * TANDA C — enganchar productos a una nota."""

HELPER = """  /**
   * TANDA I — EL SITIO DE LA NOTA (POI).
   *
   * Una nota sin sitio exacto no puede salir en «cerca de mí» ni en «toda la ciudad»: no se sabe
   * dónde está. Se guarda el nombre del lugar y sus coordenadas; si las coordenadas no son válidas
   * NO se guarda el sitio (mejor sin POI que con uno falso, que pondría la nota en un mapa donde no
   * está).
   */
  private sitioDe(name: unknown, lat: unknown, lng: unknown): { placeName: string; lat: number; lng: number } | null {
    const n = this.cleanText(name, 120);
    const la = Number(lat);
    const ln = Number(lng);
    if (!n || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
    if (la === 0 && ln === 0) return null; // «0,0» es el mar: casi siempre es un dato que falta
    return { placeName: n, lat: la, lng: ln };
  }

  /** El radio que pide la app: «附近» (~1 km), «3km», o nada para TODA la ciudad. */
  private geoDe(q: { lat?: string | number; lng?: string | number; radiusKm?: string | number }): { lat: number; lng: number; radiusKm: number | null } | null {
    if (q?.lat === undefined || q?.lng === undefined || q?.lat === '' || q?.lng === '') return null;
    const lat = Number(q.lat);
    const lng = Number(q.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const r = q?.radiusKm === undefined || q?.radiusKm === '' ? null : Number(q.radiusKm);
    return { lat, lng, radiusKm: r !== null && Number.isFinite(r) && r > 0 ? r : null };
  }

  /** `since=1h|24h|7d|30d` → el intervalo de Postgres (o null si no se pide). */
  private sinceDe(since: unknown): string | null {
    switch (String(since ?? '').trim().toLowerCase()) {
      case '1h': return '1 hour';
      case '24h': return '24 hours';
      case '7d': return '7 days';
      case '30d': return '30 days';
      default: return null;
    }
  }

""" + HELPER_ANCLA

# ── 2) feedChannel: radio, orden y fecha ─────────────────────────────────────
CANAL_FIRMA = """  async feedChannel(viewerId: string, q: { channel?: string; city?: string; type?: string; cursor?: string; limit?: number }) {"""

CANAL_FIRMA_NUEVO = """  async feedChannel(viewerId: string, q: {
    channel?: string; city?: string; type?: string; cursor?: string; limit?: number;
    /** TANDA I: mi posición y el radio («附近» ≈ 1 km, «3km», o nada = toda la ciudad). */
    lat?: string | number; lng?: string | number; radiusKm?: string | number;
    /** `distance` (más cerca primero) · `hot` (más interacción) · por defecto, lo más nuevo. */
    sort?: string;
    /** `1h` · `24h` · `7d` · `30d`. */
    since?: string;
  }) {"""

CANAL_NEARBY = """    if (channel === 'nearby') {
      args.push(city);
      base.push(`p.city=$${args.length}`);
      // «Comercio» dentro de Ciudad = las ventas DE MI CIUDAD.
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }
    } else if (channel === 'today') {"""

CANAL_NEARBY_NUEVO = """    if (channel === 'nearby') {
      args.push(city);
      base.push(`p.city=$${args.length}`);
      // «Comercio» dentro de Ciudad = las ventas DE MI CIUDAD.
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }

      /**
       * TANDA I — «CERCA DE MÍ» Y «TODA LA CIUDAD».
       *
       * Si la app manda mi posición, se calcula la distancia REAL (círculo máximo) y, si además
       * manda un radio, se queda con lo que está dentro. Las notas SIN coordenadas quedan fuera
       * cuando se pide un radio: no se puede prometer una distancia que no se sabe. En «toda la
       * ciudad» (sin radio) sí salen todas las de la ciudad, con o sin sitio.
       */
      const geo = this.geoDe(q);
      let distExpr: string | null = null;
      if (geo) {
        args.push(geo.lat);
        const iLat = args.length;
        args.push(geo.lng);
        const iLng = args.length;
        // Se comprueba el formato antes de convertir: un `payload` raro no puede tumbar el feed.
        base.push(`(p.payload->>'lat') ~ '^-?[0-9.]+$' AND (p.payload->>'lng') ~ '^-?[0-9.]+$'`);
        distExpr = `(6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians($${iLat}::float8)) * cos(radians((p.payload->>'lat')::float8)) *
            cos(radians((p.payload->>'lng')::float8) - radians($${iLng}::float8)) +
            sin(radians($${iLat}::float8)) * sin(radians((p.payload->>'lat')::float8))))))`;
        if (geo.radiusKm !== null) {
          args.push(geo.radiusKm);
          base.push(`${distExpr} <= $${args.length}`);
        }
      }
      const since = this.sinceDe(q.since);
      if (since) base.push(`p.created_at > now() - interval '${since}'`);
      return this.feedPage(base.join(' AND '), args, {
        cursor: q.cursor, limit: q.limit, viewerId, channel,
        distExpr, sort: q.sort ?? null,
        /** Con orden por distancia o por interacción el cursor por fecha no vale: no se pagina. */
        sinCursor: (q.sort === 'distance' && !!distExpr) || q.sort === 'hot',
      });
    } else if (channel === 'today') {"""

# ── 3) feedPage: distancia en el SELECT y orden ──────────────────────────────
PAGE_FIRMA = """  private async feedPage(whereSql: string, args: unknown[], opts: { cursor?: string; limit?: number; viewerId?: string; channel?: string | null }) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 15) || 15, 1), 40);
    const cursorIdx = args.length + 1;
    const orderCursor = opts.cursor ? `AND p.created_at < $${cursorIdx}::timestamptz` : '';"""

PAGE_FIRMA_NUEVO = """  private async feedPage(whereSql: string, args: unknown[], opts: {
    cursor?: string; limit?: number; viewerId?: string; channel?: string | null;
    /** TANDA I: la expresión de distancia (SQL) para pintarla y ordenar por ella. */
    distExpr?: string | null;
    sort?: string | null;
    /** Órdenes que no son por fecha: el cursor por fecha no aplica. */
    sinCursor?: boolean;
  }) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 15) || 15, 1), 40);
    const cursorIdx = args.length + 1;
    const orderCursor = opts.cursor && !opts.sinCursor ? `AND p.created_at < $${cursorIdx}::timestamptz` : '';"""

PAGE_SELECT = """             p.tone, p.media_ids, jsonb_array_length(p.media_ids) AS media_count, p.payload, p.service_link, p.visibility, p.state, p.created_at,"""

PAGE_SELECT_NUEVO = """             p.tone, p.media_ids, jsonb_array_length(p.media_ids) AS media_count, p.payload, p.service_link, p.visibility, p.state, p.created_at,
             ${opts.distExpr ? `${opts.distExpr} AS distance_km` : 'NULL::float8 AS distance_km'},"""

PAGE_ORDER = """      WHERE ${whereSql}${blockCond} ${orderCursor}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}`,"""

PAGE_ORDER_NUEVO = """      WHERE ${whereSql}${blockCond} ${orderCursor}
      ORDER BY ${opts.sort === 'distance' && opts.distExpr
        ? 'distance_km ASC NULLS LAST'
        : opts.sort === 'hot'
          ? `(SELECT count(*) FROM lifebook.likes l WHERE l.post_id = p.id)
             + (SELECT count(*) FROM lifebook.comments c WHERE c.post_id = p.id AND c.state = 'active')
             + (SELECT count(*) FROM lifebook.bookmarks bm WHERE bm.post_id = p.id) DESC, p.created_at DESC`
          : 'p.created_at DESC'}
      LIMIT ${limit + 1}`,"""

# ── 4) la tarjeta: sitio y distancia ────────────────────────────────────────
FEED_CAMPOS = """      topics,
      tags: topics,
      payload: row.payload ?? {},"""

FEED_CAMPOS_NUEVO = """      topics,
      tags: topics,
      payload: row.payload ?? {},
      /**
       * TANDA I: el SITIO de la nota y a qué distancia está de mí (solo llega si el feed se pidió
       * con mi posición). `distanceKm` se redondea a 100 m: «3,2 km» es lo que se enseña, no 3,1974.
       */
      placeName: typeof row.payload?.placeName === 'string' ? row.payload.placeName : null,
      distanceKm: row.distance_km === null || row.distance_km === undefined
        ? null
        : Math.round(Number(row.distance_km) * 10) / 10,"""

SVC_EDITS = [
    ('createNote acepta el sitio', NOTA_DTO, NOTA_DTO_NUEVO, 1),
    ('guardar el sitio en payload', NOTA_PAYLOAD, NOTA_PAYLOAD_NUEVO, 1),
    ('helper sitioDe/geoDe/sinceDe', HELPER_ANCLA, HELPER, 1),
    ('firma de feedChannel', CANAL_FIRMA, CANAL_FIRMA_NUEVO, 1),
    ('radio/orden/fecha en nearby', CANAL_NEARBY, CANAL_NEARBY_NUEVO, 1),
    ('firma de feedPage', PAGE_FIRMA, PAGE_FIRMA_NUEVO, 1),
    ('distancia en el SELECT', PAGE_SELECT, PAGE_SELECT_NUEVO, 1),
    ('orden por distancia o interacción', PAGE_ORDER, PAGE_ORDER_NUEVO, 1),
    ('sitio y distancia en la tarjeta', FEED_CAMPOS, FEED_CAMPOS_NUEVO, 1),
]

# ── 5) el controlador pasa los parámetros nuevos ────────────────────────────
CTL_VIEJO = """  @Get('posts/feed')
  @UseGuards(JwtAuthGuard)
  feed(@Query() q: { channel?: string; city?: string; type?: string; cursor?: string; limit?: string }, @CurrentUser() actor: { userId: string }) {
    if (q.channel) {
      // Parte 3: canales (for_you|following|nearby|today|debates|food|taxi|work|rental|sales|culture|music|sports).
      return this.lb.feedChannel(actor.userId, {
        channel: q.channel, city: q.city, type: q.type,
        cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined,
      });
    }"""

CTL_NUEVO = """  @Get('posts/feed')
  @UseGuards(JwtAuthGuard)
  feed(@Query() q: {
    channel?: string; city?: string; type?: string; cursor?: string; limit?: string;
    /** TANDA I: mi posición, el radio, el orden y la ventana de tiempo del feed de Ciudad. */
    lat?: string; lng?: string; radiusKm?: string; sort?: string; since?: string;
  }, @CurrentUser() actor: { userId: string }) {
    if (q.channel) {
      // Parte 3: canales (for_you|following|nearby|today|debates|food|taxi|work|rental|sales|culture|music|sports).
      return this.lb.feedChannel(actor.userId, {
        channel: q.channel, city: q.city, type: q.type,
        cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined,
        lat: q.lat, lng: q.lng, radiusKm: q.radiusKm, sort: q.sort, since: q.since,
      });
    }"""

CTL_EDITS = [('el controlador pasa radio/orden/fecha', CTL_VIEJO, CTL_NUEVO, 1)]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'sitioDe' in svc:
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
