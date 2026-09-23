# =============================================================================
# parche60 — TALLAS Y MEDIDAS: el comerciante configura, la persona consulta
#
# QUÉ AÑADE (servidor)
#   · MERCHANT: `PUT commerce/products/:id/size-chart` → guarda las tablas de tallas del producto
#     (por sexo y tipo: mujer/hombre/unisex · arriba/abajo/vestido/calzado/accesorio) y las
#     devuelve. `GET` de la misma ruta para leerlas (público: las ve cualquiera que mire el producto).
#   · COMPRADOR: `GET/PUT commerce/my/measurements` y `DELETE` con `?category=` → sus medidas, por
#     categoría INDEPENDIENTE (cuerpo / pie). Nunca salen de su cuenta.
#   · La RECOMENDACIÓN: `POST commerce/products/:id/size-suggestion` compara las medidas con la
#     tabla DEL PRODUCTO y devuelve talla + razón + nivel de ajuste. Si esa tienda no ha configurado
#     su tabla, lo DICE en vez de inventarse una talla (es la regla del dueño).
#
# Requiere el DDL 015, ya aplicado.
# Uso en el servidor:  python3 /root/parche60-tallas.py
# =============================================================================
import shutil
import sys

SELLO = 'tallas-20260214'
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


ANCLA = """  /** La forma del cupón que ve la app (una sola, para que no haya dos verdades). */"""

METODOS = """  // ──────────────────────── TALLAS Y MEDIDAS ───────────────────────────────
  /**
   * MERCADO (tanda J) — LAS TABLAS DE TALLAS DEL PRODUCTO, que configura el comerciante.
   *
   * Se reemplazan enteras (como las variantes): la app manda la lista completa y así no hay que
   * borrar fila a fila. Un producto puede tener VARIAS tablas (una de mujer y otra de hombre).
   *
   * Lo que se comprueba aquí, porque es un dato del que depende una recomendación:
   *   · sexo (`women|men|unisex`) y tipo (`top|bottom|dress|shoes|accessory|other`) válidos;
   *   · los rangos van de menor a mayor y dentro de medidas humanas;
   *   · topes de tamaño (6 tablas y 60 tallas por tabla) para que nadie mande un libro.
   */
  async setSizeChart(userId: string, productId: string, dto: any) {
    const pid = this.uuidOrNull(productId) as string;
    const mio: any[] = await this.db.$queryRaw`
      SELECT p.id FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid AND s.owner_id = ${userId}::uuid LIMIT 1`;
    if (!mio[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe o no es tuyo');

    const GENEROS = ['women', 'men', 'unisex'];
    const TIPOS = ['top', 'bottom', 'dress', 'shoes', 'accessory', 'other'];
    const charts = (Array.isArray(dto?.charts) ? dto.charts : []).slice(0, 6);
    const normalizadas: { gender: string; kind: string; notes: string | null; rows: any[] }[] = [];

    for (const c of charts) {
      const gender = String(c?.gender ?? '').trim().toLowerCase();
      const kind = String(c?.kind ?? '').trim().toLowerCase();
      if (!GENEROS.includes(gender)) throw new DomainError('SIZE_CHART_GENDER_INVALID', 'El sexo de la tabla tiene que ser women · men · unisex');
      if (!TIPOS.includes(kind)) throw new DomainError('SIZE_CHART_KIND_INVALID', 'El tipo de tabla no es válido');
      const filas: any[] = [];
      for (const r of (Array.isArray(c?.rows) ? c.rows : []).slice(0, 60)) {
        const label = String(r?.sizeLabel ?? '').trim().slice(0, 20);
        if (!label) continue;
        // `medida()` devuelve el número o null: fuera de rango humano se rechaza en vez de guardarse.
        const par = (min: unknown, max: unknown, campo: string): [number | null, number | null] => {
          const a = this.medidaCm(min, campo);
          const b = this.medidaCm(max, campo);
          if (a !== null && b !== null && a > b) {
            throw new DomainError('SIZE_RANGE_INVALID', `En «${label}», ${campo}: el mínimo no puede ser mayor que el máximo`);
          }
          return [a, b];
        };
        const [chestMin, chestMax] = par(r?.chestMinCm, r?.chestMaxCm, 'el pecho');
        const [waistMin, waistMax] = par(r?.waistMinCm, r?.waistMaxCm, 'la cintura');
        const [hipMin, hipMax] = par(r?.hipMinCm, r?.hipMaxCm, 'la cadera');
        const [heightMin, heightMax] = par(r?.heightMinCm, r?.heightMaxCm, 'la altura');
        const [weightMin, weightMax] = par(r?.weightMinKg, r?.weightMaxKg, 'el peso');
        const [footLMin, footLMax] = par(r?.footLengthMinCm, r?.footLengthMaxCm, 'el largo del pie');
        const [footWMin, footWMax] = par(r?.footWidthMinCm, r?.footWidthMaxCm, 'el ancho del pie');
        filas.push({
          label, chestMin, chestMax, waistMin, waistMax, hipMin, hipMax,
          heightMin, heightMax, weightMin, weightMax, footLMin, footLMax, footWMin, footWMax,
        });
      }
      if (!filas.length) throw new DomainError('SIZE_CHART_EMPTY', `La tabla «${gender}/${kind}» no tiene ninguna talla`);
      normalizadas.push({ gender, kind, notes: this.clean(c?.notes, 200) || null, rows: filas });
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`DELETE FROM lifebook.product_size_charts WHERE product_id = ${pid}::uuid`;
      for (const c of normalizadas) {
        const creada: any[] = await tx.$queryRaw`
          INSERT INTO lifebook.product_size_charts (product_id, gender, kind, notes)
          VALUES (${pid}::uuid, ${c.gender}, ${c.kind}, ${c.notes})
          RETURNING id`;
        const chartId = creada[0]?.id;
        let pos = 1;
        for (const r of c.rows) {
          await tx.$executeRaw`
            INSERT INTO lifebook.product_size_rows
              (chart_id, size_label, position, chest_min_cm, chest_max_cm, waist_min_cm, waist_max_cm,
               hip_min_cm, hip_max_cm, height_min_cm, height_max_cm, weight_min_kg, weight_max_kg,
               foot_length_min_cm, foot_length_max_cm, foot_width_min_cm, foot_width_max_cm)
            VALUES
              (${chartId}::uuid, ${r.label}, ${pos}, ${r.chestMin}, ${r.chestMax}, ${r.waistMin}, ${r.waistMax},
               ${r.hipMin}, ${r.hipMax}, ${r.heightMin}, ${r.heightMax}, ${r.weightMin}, ${r.weightMax},
               ${r.footLMin}, ${r.footLMax}, ${r.footWMin}, ${r.footWMax})`;
          pos += 1;
        }
      }
    });

    return this.sizeChart(pid);
  }

  /** Una medida en cm/kg: número entero razonable, o null. Fuera de rango humano → error. */
  private medidaCm(v: unknown, campo: string): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new DomainError('SIZE_MEASURE_INVALID', `${campo} tiene que ser un número`);
    const entero = Math.round(n);
    if (entero < 1 || entero > 400) throw new DomainError('SIZE_MEASURE_INVALID', `${campo} está fuera de lo razonable`);
    return entero;
  }

  /** Las tablas de tallas de un producto (público: las mira quien va a comprar). */
  async sizeChart(productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const charts: any[] = await this.db.$queryRaw`
      SELECT id, gender, kind, notes FROM lifebook.product_size_charts
       WHERE product_id = ${pid}::uuid ORDER BY gender, kind`;
    if (!charts.length) return { charts: [] };
    const ids = charts.map((c) => c.id);
    const rows: any[] = await this.db.$queryRaw`
      SELECT chart_id, size_label, position, chest_min_cm, chest_max_cm, waist_min_cm, waist_max_cm,
             hip_min_cm, hip_max_cm, height_min_cm, height_max_cm, weight_min_kg, weight_max_kg,
             foot_length_min_cm, foot_length_max_cm, foot_width_min_cm, foot_width_max_cm
        FROM lifebook.product_size_rows WHERE chart_id = ANY(${ids}::uuid[]) ORDER BY position`;
    return {
      charts: charts.map((c) => ({
        id: c.id,
        gender: String(c.gender),
        kind: String(c.kind),
        notes: c.notes ?? null,
        rows: rows.filter((r) => String(r.chart_id) === String(c.id)).map((r) => ({
          sizeLabel: String(r.size_label),
          position: Number(r.position ?? 0),
          chestMinCm: r.chest_min_cm === null ? null : Number(r.chest_min_cm),
          chestMaxCm: r.chest_max_cm === null ? null : Number(r.chest_max_cm),
          waistMinCm: r.waist_min_cm === null ? null : Number(r.waist_min_cm),
          waistMaxCm: r.waist_max_cm === null ? null : Number(r.waist_max_cm),
          hipMinCm: r.hip_min_cm === null ? null : Number(r.hip_min_cm),
          hipMaxCm: r.hip_max_cm === null ? null : Number(r.hip_max_cm),
          heightMinCm: r.height_min_cm === null ? null : Number(r.height_min_cm),
          heightMaxCm: r.height_max_cm === null ? null : Number(r.height_max_cm),
          weightMinKg: r.weight_min_kg === null ? null : Number(r.weight_min_kg),
          weightMaxKg: r.weight_max_kg === null ? null : Number(r.weight_max_kg),
          footLengthMinCm: r.foot_length_min_cm === null ? null : Number(r.foot_length_min_cm),
          footLengthMaxCm: r.foot_length_max_cm === null ? null : Number(r.foot_length_max_cm),
          footWidthMinCm: r.foot_width_min_cm === null ? null : Number(r.foot_width_min_cm),
          footWidthMaxCm: r.foot_width_max_cm === null ? null : Number(r.foot_width_max_cm),
        })),
      })),
    };
  }

  /** MIS medidas (las del comprador), por categoría. Solo las ve su dueño. */
  async myMeasurements(userId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm,
             foot_length_cm, foot_width_cm, updated_at
        FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid`;
    const de = (cat: string) => {
      const f = filas.find((x) => String(x.category) === cat);
      if (!f) return null;
      return {
        category: cat,
        gender: f.gender ?? null,
        heightCm: f.height_cm === null ? null : Number(f.height_cm),
        weightKg: f.weight_kg === null ? null : Number(f.weight_kg),
        chestCm: f.chest_cm === null ? null : Number(f.chest_cm),
        waistCm: f.waist_cm === null ? null : Number(f.waist_cm),
        hipCm: f.hip_cm === null ? null : Number(f.hip_cm),
        footLengthCm: f.foot_length_cm === null ? null : Number(f.foot_length_cm),
        footWidthCm: f.foot_width_cm === null ? null : Number(f.foot_width_cm),
        updatedAt: f.updated_at ?? null,
      };
    };
    return { body: de('body'), feet: de('feet') };
  }

  /** Guardar MIS medidas de una categoría (`body` o `feet`). La otra no se toca. */
  async setMeasurements(userId: string, dto: any) {
    const category = String(dto?.category ?? '').trim().toLowerCase();
    if (!['body', 'feet'].includes(category)) {
      throw new DomainError('MEASURE_CATEGORY_INVALID', 'La categoría tiene que ser body o feet');
    }
    const genderRaw = String(dto?.gender ?? '').trim().toLowerCase();
    const gender = ['women', 'men'].includes(genderRaw) ? genderRaw : null;
    const m = (v: unknown, campo: string, max: number): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > max) {
        throw new DomainError('MEASURE_INVALID', `${campo} está fuera de lo razonable`);
      }
      return n;
    };
    const height = m(dto?.heightCm, 'La altura', 250);
    const weight = m(dto?.weightKg, 'El peso', 300);
    const chest = m(dto?.chestCm, 'El pecho', 200);
    const waist = m(dto?.waistCm, 'La cintura', 200);
    const hip = m(dto?.hipCm, 'La cadera', 200);
    const footL = m(dto?.footLengthCm, 'El largo del pie', 40);
    const footW = m(dto?.footWidthCm, 'El ancho del pie', 20);

    // Lo que hace falta de verdad para recomendar, según la categoría.
    if (category === 'body' && chest === null && waist === null && hip === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para la ropa hacen falta al menos el pecho, la cintura o la cadera');
    }
    if (category === 'feet' && footL === null) {
      throw new DomainError('MEASURE_REQUIRED', 'Para el calzado hace falta el largo del pie');
    }

    await this.db.$executeRaw`
      INSERT INTO lifebook.user_measurements
        (user_id, category, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, foot_length_cm, foot_width_cm, updated_at)
      VALUES
        (${userId}::uuid, ${category}, ${gender}, ${height}, ${weight}, ${chest}, ${waist}, ${hip}, ${footL}, ${footW}, now())
      ON CONFLICT (user_id, category) DO UPDATE SET
        gender = ${gender}, height_cm = ${height}, weight_kg = ${weight}, chest_cm = ${chest},
        waist_cm = ${waist}, hip_cm = ${hip}, foot_length_cm = ${footL}, foot_width_cm = ${footW},
        updated_at = now()`;
    return this.myMeasurements(userId);
  }

  /** Borrar MIS medidas (de una categoría, o todas). */
  async clearMeasurements(userId: string, category?: string | null) {
    const cat = String(category ?? '').trim().toLowerCase();
    if (cat && !['body', 'feet'].includes(cat)) {
      throw new DomainError('MEASURE_CATEGORY_INVALID', 'La categoría tiene que ser body o feet');
    }
    const borradas: number = cat
      ? await this.db.$executeRaw`DELETE FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid AND category = ${cat}`
      : await this.db.$executeRaw`DELETE FROM lifebook.user_measurements WHERE user_id = ${userId}::uuid`;
    return { ok: true, deleted: Number(borradas ?? 0), ...(await this.myMeasurements(userId)) };
  }

  /**
   * LA RECOMENDACIÓN DE TALLA (tanda J).
   *
   * Compara las medidas con la tabla DEL PRODUCTO que configuró el comerciante. No es magia: es
   * matching de rangos, y por eso:
   *   · si esa tienda NO ha configurado su tabla, se dice y NO se recomienda nada (inventarse una
   *     talla sería mentir);
   *   · la medida PRINCIPAL del tipo de prenda tiene que caer dentro del rango (pecho en arriba,
   *     cadera o cintura en abajo, largo del pie en calzado); las demás afinan;
   *   · el resultado es una SUGERENCIA con su razón y su nivel de ajuste, y el cliente puede
   *     elegir otra talla siempre.
   */
  async sizeSuggestion(productId: string, dto: any) {
    const pid = this.uuidOrNull(productId) as string;
    const kind = String(dto?.kind ?? '').trim().toLowerCase();
    const gender = String(dto?.gender ?? '').trim().toLowerCase();
    const TIPOS = ['top', 'bottom', 'dress', 'shoes', 'accessory', 'other'];
    if (!TIPOS.includes(kind)) throw new DomainError('SIZE_CHART_KIND_INVALID', 'Indica el tipo de prenda (top · bottom · dress · shoes)');
    if (!['women', 'men'].includes(gender)) throw new DomainError('SIZE_CHART_GENDER_INVALID', 'Indica si las medidas son de mujer o de hombre');

    const tablas = await this.sizeChart(pid);
    // Se busca la tabla del sexo pedido; si solo hay una «unisex», vale para los dos.
    const tabla = tablas.charts.find((c) => c.kind === kind && c.gender === gender)
      ?? tablas.charts.find((c) => c.kind === kind && c.gender === 'unisex');
    if (!tabla) {
      return {
        size: null,
        reason: 'Esta tienda todavía no ha configurado su tabla de tallas, así que no podemos recomendarte una.',
        chartAvailable: false,
      };
    }

    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const medidas = {
      height: num(dto?.heightCm), weight: num(dto?.weightKg), chest: num(dto?.chestCm),
      waist: num(dto?.waistCm), hip: num(dto?.hipCm), footLength: num(dto?.footLengthCm),
    };
    /** ¿La medida cae dentro del rango de esa talla? (si la talla no declara el rango, no cuenta) */
    const dentro = (valor: number | null, min: number | null, max: number | null): boolean | null => {
      if (valor === null || (min === null && max === null)) return null;
      if (min !== null && valor < min) return false;
      if (max !== null && valor > max) return false;
      return true;
    };
    const PRINCIPAL: Record<string, 'chest' | 'waist' | 'hip' | 'footLength'> = {
      top: 'chest', dress: 'chest', bottom: 'waist', shoes: 'footLength', accessory: 'waist', other: 'chest',
    };
    const principal = PRINCIPAL[kind];
    const valorPrincipal = medidas[principal];
    if (valorPrincipal === null) {
      return {
        size: null,
        reason: principal === 'footLength'
          ? 'Nos falta el largo de tu pie para poder recomendarte una talla.'
          : `Nos falta tu ${principal === 'chest' ? 'pecho' : principal === 'waist' ? 'cintura' : 'cadera'} para poder recomendarte una talla.`,
        chartAvailable: true,
      };
    }

    let mejor: any = null;
    let mejorPuntos = -1;
    for (const fila of tabla.rows) {
      const critico = dentro(valorPrincipal,
        fila[`${principal}MinCm` as keyof typeof fila] as number | null,
        fila[`${principal}MaxCm` as keyof typeof fila] as number | null);
      if (critico === false) continue; // la medida principal no entra: esa talla no es
      let puntos = critico === true ? 2 : 0;
      for (const [clave, campo] of [['height', 'height'], ['weight', 'weight'], ['chest', 'chest'], ['waist', 'waist'], ['hip', 'hip'], ['footLength', 'footLength']] as const) {
        if (clave === principal) continue;
        const r = dentro(medidas[clave as keyof typeof medidas], fila[`${campo}MinCm` as keyof typeof fila] as number | null, fila[`${campo}MaxCm` as keyof typeof fila] as number | null);
        if (r === true) puntos += 1;
        if (r === false) puntos -= 1;
      }
      if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = fila; }
    }

    if (!mejor) {
      return {
        size: null,
        reason: `Con tus medidas no hay ninguna talla de esta tabla que encaje. La tabla va de ${tabla.rows[0]?.sizeLabel} a ${tabla.rows[tabla.rows.length - 1]?.sizeLabel}: pregúntale a la tienda.`,
        chartAvailable: true,
      };
    }

    // Nivel de ajuste: dónde cae la medida principal dentro del rango de esa talla.
    const min = mejor[`${principal}MinCm` as keyof typeof mejor] as number | null;
    const max = mejor[`${principal}MaxCm` as keyof typeof mejor] as number | null;
    let fit = 'perfecto';
    if (min !== null && max !== null && max > min) {
      const pos = (valorPrincipal - min) / (max - min);
      fit = pos < 0.34 ? 'ajustado' : pos > 0.66 ? 'holgado' : 'perfecto';
    }
    const nombreMedida = principal === 'chest' ? 'pecho' : principal === 'waist' ? 'cintura' : principal === 'hip' ? 'cadera' : 'largo del pie';
    const extras: string[] = [];
    if (medidas.height) extras.push(`altura de ${medidas.height} cm`);
    if (medidas.weight) extras.push(`peso de ${medidas.weight} kg`);
    return {
      size: String(mejor.sizeLabel),
      fit,
      chartAvailable: true,
      reason: `Según tu ${nombreMedida} de ${valorPrincipal} cm${extras.length ? ` y tu ${extras.join(' y ')}` : ''}, la talla ${mejor.sizeLabel} es la que mejor encaja (ajuste ${fit}).`,
      matched: {
        chest: dentro(medidas.chest, mejor.chestMinCm, mejor.chestMaxCm),
        waist: dentro(medidas.waist, mejor.waistMinCm, mejor.waistMaxCm),
        hip: dentro(medidas.hip, mejor.hipMinCm, mejor.hipMaxCm),
        height: dentro(medidas.height, mejor.heightMinCm, mejor.heightMaxCm),
        footLength: dentro(medidas.footLength, mejor.footLengthMinCm, mejor.footLengthMaxCm),
      },
    };
  }

""" + ANCLA

SVC_EDITS = [('métodos de tallas y medidas', ANCLA, METODOS, 1)]

ANCLA_RUTAS = """  // ───────────────────────────── CUPONES ───────────────────────────────────
"""

RUTAS = """  // ──────────────────────── TALLAS Y MEDIDAS ───────────────────────────────
  /** Las tablas de tallas de un producto (público). */
  @Get('products/:id/size-chart')
  sizeChart(@Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.sizeChart(id);
  }

  /** El comerciante guarda las tablas de tallas de SU producto (mujer/hombre/unisex). */
  @Put('products/:id/size-chart')
  @UseGuards(JwtAuthGuard)
  setSizeChart(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setSizeChart(u.userId, id, dto ?? {});
  }

  /** La recomendación de talla a partir de MIS medidas (contra la tabla del producto). */
  @Post('products/:id/size-suggestion')
  @UseGuards(JwtAuthGuard)
  sizeSuggestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.sizeSuggestion(id, dto ?? {});
  }

  /** Mis medidas: ropa (`body`) y calzado (`feet`), por separado. */
  @Get('my/measurements')
  @UseGuards(JwtAuthGuard)
  myMeasurements(@CurrentUser() u: { userId: string }) {
    return this.commerce.myMeasurements(u.userId);
  }

  @Put('my/measurements')
  @UseGuards(JwtAuthGuard)
  setMeasurements(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.setMeasurements(u.userId, dto ?? {});
  }

  @Delete('my/measurements')
  @UseGuards(JwtAuthGuard)
  clearMeasurements(@CurrentUser() u: { userId: string }, @Query() q: Record<string, string>) {
    return this.commerce.clearMeasurements(u.userId, q?.category ?? null);
  }

""" + ANCLA_RUTAS

CTL_EDITS = [('rutas de tallas y medidas', ANCLA_RUTAS, RUTAS, 1)]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'sizeSuggestion' in svc or 'size-chart' in ctl:
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
