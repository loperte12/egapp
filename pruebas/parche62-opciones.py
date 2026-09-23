# =============================================================================
# parche62 — OPCIONES DEL PRODUCTO (tanda K): los ejes, sus valores y la foto real de cada color
#
# QUÉ ARREGLA
#   · Pulsar «Comprar» o «Añadir al carrito» compraba DIRECTO con la primera variante que
#     apareciera (`p.variants?.[0]`): nadie elegía talla ni color. Para poder elegir, el servidor
#     tiene que saber qué ejes tiene el producto y qué valores tiene cada eje.
#   · Un eje de COLOR sin foto real era posible: el dueño lo rechazó explícitamente («no vale sólo
#     poner color, debe verse el producto de la foto real de este color»). Aquí se exige la foto Y
#     que sea UNA DE LAS FOTOS DE ESTE PRODUCTO.
#   · `product_variants` ya tenía `attributes jsonb` e `image_url`, y el API ya los devolvía: no
#     había que inventar estructura nueva para la combinación, solo definirla y validarla.
#   · El tope de combinaciones era 20: con 4 colores × 6 tallas (24) el comerciante no podía
#     guardar su producto. Sube a 60.
#
# Uso en el servidor:  python3 /root/parche62-opciones.py
# =============================================================================
import shutil
import sys

SELLO = 'opciones-producto-20260214'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

# ───────────────────────────── 1. topes y listas ─────────────────────────────
A1 = """const VARIANTS_MAX = 20;
const ATTRS_MAX = 20;"""
N1 = """const VARIANTS_MAX = 60;
const ATTRS_MAX = 20;
// Mercado (tanda K): los ejes de elección (Color, Talla, Almacenamiento…). Tres ejes bastan para
// cualquier producto real de la app y evitan el laberinto de combinaciones.
const OPTION_GROUPS_MAX = 3;
const OPTION_VALUES_MAX = 30;
const OPTION_KINDS = ['color', 'size', 'text'];
const OPTION_CHART_KINDS = ['top', 'bottom', 'dress', 'shoes', 'accessory', 'other'];"""

# ───────────────────── 2. el campo `options` en la entrada ───────────────────
A2 = """  variants?: { name?: string; priceXaf?: number | null; stockQuantity?: number; sku?: string | null; imageUrl?: string | null; weightG?: number | null; attributes?: Record<string, unknown> }[];"""
N2 = A2 + """
  options?: {
    code?: string; label?: string; kind?: string; chartKind?: string | null;
    values?: { value?: string; label?: string | null; imageUrl?: string | null; hex?: string | null }[];
  }[];"""

# ─────────────────── 3. la validación pasa a ser asíncrona ───────────────────
A3 = """  private validateChildren(dto: ProductInput) {"""
N3 = """  private async validateChildren(dto: ProductInput) {"""

A4 = """    this.validateChildren(dto);"""
N4 = """    await this.validateChildren(dto);"""

# ───────────── 4. dentro de validateChildren: validar los ejes ───────────────
A5 = """    const attrs = Array.isArray(dto.attributes) ? dto.attributes : [];
    if (attrs.length > ATTRS_MAX) {"""
N5 = """    // LOS EJES DE OPCIONES (tanda K). Se validan ANTES de escribir nada: una tabla de ejes a
    // medias (o un color sin su foto) dejaría la ficha mintiendo.
    if (dto.options !== undefined) {
      const grupos = await this.prepararOpciones(dto, null, this.db);
      this.validarCombinaciones(grupos, dto.variants);
    }
    const attrs = Array.isArray(dto.attributes) ? dto.attributes : [];
    if (attrs.length > ATTRS_MAX) {"""

# ───────── 5. replaceChildren: escribir los ejes y validar variantes ─────────
A6 = """    const attrs = Array.isArray(dto.attributes) ? dto.attributes.slice(0, ATTRS_MAX) : [];"""
N6 = """    // LOS EJES (tanda K): se reemplazan enteros, como las variantes.
    if (dto.options !== undefined) {
      const nuevos = await this.prepararOpciones(dto, productId, db);
      this.validarCombinaciones(nuevos, dto.variants);
      await this.escribirOpciones(productId, nuevos, db);
    } else if (Array.isArray(dto.variants) && dto.variants.length) {
      // Cambian las variantes y los ejes ya estaban guardados: la combinación tiene que encajar
      // con los ejes que hay. Si no, se podría comprar una talla que no existe.
      const guardados = await this.leerOpcionesCrudas(productId, db);
      if (guardados.length) this.validarCombinaciones(guardados, dto.variants);
    }
    const attrs = Array.isArray(dto.attributes) ? dto.attributes.slice(0, ATTRS_MAX) : [];"""

# ───────────── 6. al editar: los ejes también se reemplazan ──────────────────
A7 = """      if (dto.variants !== undefined || dto.attributes !== undefined) {"""
N7 = """      if (dto.variants !== undefined || dto.attributes !== undefined || dto.options !== undefined) {"""

# ───────────────── 7. la ficha lee también los ejes ──────────────────────────
A8 = """    const attrs: any[] = await db.$queryRaw`
      SELECT key, value FROM lifebook.product_attributes WHERE product_id = ${pid}::uuid ORDER BY display_order, key`;"""
N8 = A8 + """
    // MERCADO (tanda K): los ejes con sus valores, en UNA sola lectura con la ficha (el selector
    // de «elegir antes de comprar» necesita los dos a la vez para saber qué combinación hay).
    const optionGroups: any[] = await db.$queryRaw`
      SELECT id, code, label, kind, chart_kind FROM lifebook.product_option_groups
       WHERE product_id = ${pid}::uuid ORDER BY position`;
    const optionValues: any[] = optionGroups.length
      ? await db.$queryRaw`
          SELECT group_id, value, label, image_url, hex FROM lifebook.product_option_values
           WHERE group_id = ANY(${optionGroups.map((g) => g.id)}::uuid[]) ORDER BY position`
      : [];"""

A9 = """        /** MERCADO (tanda H): cuántas personas esperan stock (solo para el dueño). */
        waitingCount: isMine ? Number(esperanRows[0]?.n ?? 0) : undefined,"""
N9 = """        /** MERCADO (tanda K): los ejes de elección, con la foto real de cada color. */
        options: this.optionsShape(optionGroups, optionValues),
        /** MERCADO (tanda H): cuántas personas esperan stock (solo para el dueño). */
        waitingCount: isMine ? Number(esperanRows[0]?.n ?? 0) : undefined,"""

# ─────────────── 8. los métodos nuevos (sección tanda K) ─────────────────────
A10 = """  /** La forma del cupón que ve la app (una sola, para que no haya dos verdades). */"""
N10 = """  // ─────────────────────── OPCIONES DEL PRODUCTO (tanda K) ──────────────────
  /**
   * MERCADO (tanda K) — «ELEGIR ANTES DE COMPRAR».
   *
   * Lo comprobado en la base antes de escribir esto: `product_variants` YA tenía `image_url`,
   * `sku`, `weight_g` y `attributes jsonb` —y el API ya los devolvía—, pero NADIE los usaba: las
   * 25 variantes que había eran todas «Talla 42», sin foto, con `attributes = {}`. Lo que faltaba
   * no era dónde guardar: era **la definición de los ejes**. Sin ella la app solo podía enseñar la
   * palabra «Talla 42», que es justo lo que el dueño rechazó.
   *
   * Aquí se validan los ejes y, sobre todo, la regla que sostiene la promesa de la ficha:
   *   · un eje de COLOR necesita la foto real de ese color **y esa foto tiene que ser UNA DE LAS
   *     FOTOS DE ESTE PRODUCTO** (ni un cuadradito de color, ni una imagen de fuera);
   *   · si hay ejes, cada variante tiene que decir su valor en CADA eje y ninguna combinación se
   *     puede repetir: una talla que no existe no se puede comprar, así que no se puede guardar.
   */
  private async prepararOpciones(dto: any, productId: string | null, db: any = this.db) {
    const crudos = Array.isArray(dto?.options) ? dto.options : [];
    if (crudos.length > OPTION_GROUPS_MAX) {
      throw new DomainError('OPTIONS_LIMIT', `Como máximo ${OPTION_GROUPS_MAX} ejes de opciones (por ejemplo Color y Talla)`);
    }

    // El catálogo de fotos de ESTE producto: un color solo puede llevar una foto que sea suya.
    const fotos = new Set<string>();
    if (productId) {
      const filas: any[] = await db.$queryRaw`
        SELECT media FROM lifebook.products WHERE id = ${productId}::uuid LIMIT 1`;
      for (const m of (Array.isArray(filas[0]?.media) ? filas[0].media : [])) {
        if (m?.url) fotos.add(String(m.url));
      }
    } else {
      for (const m of (Array.isArray(dto?.media) ? dto.media : [])) {
        if (m?.url) fotos.add(String(m.url));
      }
    }

    const codigos = new Set<string>();
    const grupos: any[] = [];
    for (const g of crudos) {
      const code = String(g?.code ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      if (code.length < 2) {
        throw new DomainError('OPTION_CODE_INVALID', 'Cada eje necesita un nombre corto (por ejemplo «color» o «talla»)');
      }
      if (codigos.has(code)) throw new DomainError('OPTION_CODE_DUPLICATED', `El eje «${code}» está repetido`);
      codigos.add(code);
      const label = this.clean(g?.label, 40) || code;
      const kind = this.clean(g?.kind, 10).toLowerCase();
      if (!OPTION_KINDS.includes(kind)) {
        throw new DomainError('OPTION_KIND_INVALID', `El tipo del eje «${label}» tiene que ser color · size · text`);
      }
      const chartKind = kind === 'size' ? (this.clean(g?.chartKind, 10).toLowerCase() || null) : null;
      if (chartKind && !OPTION_CHART_KINDS.includes(chartKind)) {
        throw new DomainError('OPTION_CHART_KIND_INVALID', 'El tipo de tabla del eje de tallas no es válido');
      }

      const valores: any[] = [];
      const vistos = new Set<string>();
      for (const v of (Array.isArray(g?.values) ? g.values : [])) {
        if (valores.length >= OPTION_VALUES_MAX) break;
        const value = this.clean(v?.value, 40);
        if (!value) continue;
        const clave = value.toLowerCase();
        if (vistos.has(clave)) {
          throw new DomainError('OPTION_VALUE_DUPLICATED', `En «${label}» el valor «${value}» está repetido`);
        }
        vistos.add(clave);
        const imageUrl = this.clean(v?.imageUrl, 400) || null;
        if (kind === 'color') {
          if (!imageUrl) {
            throw new DomainError('OPTION_COLOR_PHOTO_REQUIRED', `El color «${value}» necesita su foto real del producto en ese color`);
          }
          if (fotos.size && !fotos.has(imageUrl)) {
            throw new DomainError('OPTION_PHOTO_NOT_IN_PRODUCT', `La foto del color «${value}» no es una de las fotos de este producto`);
          }
        }
        valores.push({ value, label: this.clean(v?.label, 60) || null, imageUrl, hex: this.clean(v?.hex, 9) || null });
      }
      if (!valores.length) throw new DomainError('OPTION_EMPTY', `El eje «${label}» no tiene ningún valor`);
      grupos.push({ code, label, kind, chartKind, values: valores });
    }

    return grupos;
  }

  /** Cada variante, un valor de cada eje, y ninguna combinación repetida. */
  private validarCombinaciones(grupos: any[], variantes: any) {
    if (!grupos.length) return;
    const lista = Array.isArray(variantes) ? variantes : [];
    if (!lista.length) {
      throw new DomainError('VARIANTS_REQUIRED', 'Si hay ejes de opciones (color, talla…) hay que crear las combinaciones con su precio y su stock');
    }
    const codigos = new Set(grupos.map((g) => g.code));
    const combos = new Set<string>();
    for (const v of lista) {
      const attrs = (v?.attributes && typeof v.attributes === 'object') ? v.attributes as Record<string, unknown> : {};
      const nombre = this.clean(v?.name, 120) || 'una combinación';
      const partes: string[] = [];
      for (const g of grupos) {
        const val = this.clean(attrs[g.code], 40);
        if (!val) throw new DomainError('VARIANT_OPTION_MISSING', `A «${nombre}» le falta «${g.label}»`);
        const ok = g.values.some((x: any) => String(x.value).toLowerCase() === val.toLowerCase());
        if (!ok) throw new DomainError('VARIANT_OPTION_UNKNOWN', `«${val}» no es un valor de «${g.label}»`);
        partes.push(val.toLowerCase());
      }
      for (const clave of Object.keys(attrs)) {
        if (!codigos.has(String(clave).toLowerCase())) {
          throw new DomainError('VARIANT_OPTION_UNKNOWN', `La combinación «${nombre}» usa un eje que no existe: «${clave}»`);
        }
      }
      const combo = partes.join('|');
      if (combos.has(combo)) {
        throw new DomainError('VARIANT_COMBINATION_DUPLICATED', `La combinación «${partes.join(' · ')}» está repetida`);
      }
      combos.add(combo);
    }
  }

  /** Los ejes guardados, en la misma forma que los manda la app. */
  private async leerOpcionesCrudas(productId: string, db: any = this.db) {
    const grupos: any[] = await db.$queryRaw`
      SELECT id, code, label, kind, chart_kind FROM lifebook.product_option_groups
       WHERE product_id = ${productId}::uuid ORDER BY position`;
    if (!grupos.length) return [];
    const valores: any[] = await db.$queryRaw`
      SELECT group_id, value, label, image_url, hex FROM lifebook.product_option_values
       WHERE group_id = ANY(${grupos.map((g) => g.id)}::uuid[]) ORDER BY position`;
    return grupos.map((g) => ({
      code: String(g.code),
      label: String(g.label),
      kind: String(g.kind),
      chartKind: g.chart_kind ? String(g.chart_kind) : null,
      values: valores
        .filter((v) => String(v.group_id) === String(g.id))
        .map((v) => ({ value: String(v.value), label: v.label ?? null, imageUrl: v.image_url ?? null, hex: v.hex ?? null })),
    }));
  }

  /** Escribe los ejes (borra los anteriores: la app manda la lista completa). */
  private async escribirOpciones(productId: string, grupos: any[], db: any = this.db) {
    await db.$executeRaw`DELETE FROM lifebook.product_option_groups WHERE product_id = ${productId}::uuid`;
    let posGrupo = 0;
    for (const g of grupos) {
      const creado: any[] = await db.$queryRaw`
        INSERT INTO lifebook.product_option_groups (product_id, code, label, kind, chart_kind, position)
        VALUES (${productId}::uuid, ${g.code}, ${g.label}, ${g.kind}, ${g.chartKind}, ${posGrupo})
        RETURNING id`;
      const gid = creado[0].id;
      let posValor = 0;
      for (const v of g.values) {
        await db.$executeRaw`
          INSERT INTO lifebook.product_option_values (group_id, value, label, image_url, hex, position)
          VALUES (${gid}::uuid, ${v.value}, ${v.label}, ${v.imageUrl}, ${v.hex}, ${posValor})`;
        posValor += 1;
      }
      posGrupo += 1;
    }
  }

  /** La forma de los ejes que ve la app. */
  private optionsShape(grupos: any[], valores: any[]) {
    return (grupos ?? []).map((g) => ({
      id: g.id,
      code: String(g.code),
      label: String(g.label),
      kind: String(g.kind),
      chartKind: g.chart_kind ? String(g.chart_kind) : null,
      values: (valores ?? [])
        .filter((v) => String(v.group_id) === String(g.id))
        .map((v) => ({
          value: String(v.value),
          label: v.label ?? null,
          imageUrl: v.image_url ?? null,
          hex: v.hex ?? null,
        })),
    }));
  }

  /** Los ejes de un producto (público: los necesita el selector antes de comprar). */
  async options(productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const grupos: any[] = await this.db.$queryRaw`
      SELECT id, code, label, kind, chart_kind FROM lifebook.product_option_groups
       WHERE product_id = ${pid}::uuid ORDER BY position`;
    if (!grupos.length) return { options: [] };
    const valores: any[] = await this.db.$queryRaw`
      SELECT group_id, value, label, image_url, hex FROM lifebook.product_option_values
       WHERE group_id = ANY(${grupos.map((g) => g.id)}::uuid[]) ORDER BY position`;
    return { options: this.optionsShape(grupos, valores) };
  }

  /** El comerciante guarda los ejes de SU producto (y sus combinaciones, si las manda). */
  async setOptions(userId: string, productId: string, dto: any) {
    const pid = this.uuidOrNull(productId) as string;
    const mio: any[] = await this.db.$queryRaw`
      SELECT p.id FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid AND s.owner_id = ${userId}::uuid LIMIT 1`;
    if (!mio[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe o no es tuyo');

    // Las combinaciones se comprueban contra las variantes de AHORA si la app no manda otras:
    // si no, se podrían guardar ejes que no encajan con lo que ya se vende.
    let variantes = Array.isArray(dto?.variants) ? dto.variants : null;
    if (!variantes) {
      const filas: any[] = await this.db.$queryRaw`
        SELECT name, attributes FROM lifebook.product_variants WHERE product_id = ${pid}::uuid ORDER BY position`;
      variantes = filas.map((f) => ({ name: f.name, attributes: f.attributes ?? {} }));
    }
    const grupos = await this.prepararOpciones({ options: dto?.options, media: dto?.media }, pid, this.db);
    this.validarCombinaciones(grupos, variantes);

    await this.db.$transaction(async (tx: any) => {
      await this.escribirOpciones(pid, grupos, tx);
    });
    return this.options(pid);
  }

  /** La forma del cupón que ve la app (una sola, para que no haya dos verdades). */"""

PIEZAS = [(A1, N1), (A2, N2), (A3, N3), (A4, N4), (A5, N5), (A6, N6), (A7, N7), (A8, N8), (A9, N9), (A10, N10)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'OPTION_GROUPS_MAX' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1

    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        esperado = 2 if viejo == A4 else 1
        if n != esperado:
            problemas.append(f'esperaba {esperado} aparición(es) y hay {n}: {viejo.splitlines()[0][:70]}')
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return 1

    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    for viejo, nuevo in PIEZAS:
        src = src.replace(viejo, nuevo)
    open(P, 'w', encoding='utf-8', newline='').write(src)
    print('escrito commerce.service.ts (ejes de opciones + tope de combinaciones)')
    return 0


sys.exit(main())
