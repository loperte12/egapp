# =============================================================================
# parche65 — la combinación se lleva su foto real del color
#
# El color guarda su foto en el eje (`product_option_values.image_url`). Si esa foto no viaja con
# la combinación, el carrito y el pedido enseñan la foto genérica del producto aunque el cliente
# haya comprado la prenda roja: justo lo que el dueño rechazó. Al escribir las combinaciones, la
# foto del color se copia a la variante, y el carrito la prefiere. Una sola lectura, sin cruces.
#
# Uso en el servidor:  python3 /root/parche65-foto-del-color.py
# =============================================================================
import shutil
import sys

SELLO = 'foto-del-color-20260214'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

# 1) El carrito prefiere la foto de la combinación.
A1 = """             v.id AS var_id, v.name AS var_name, v.price_xaf AS var_price, v.stock_quantity AS var_stock"""
N1 = """             v.id AS var_id, v.name AS var_name, v.price_xaf AS var_price, v.stock_quantity AS var_stock,
             v.image_url AS var_image"""

A2 = """        coverUrl: sinProducto
          ? (r.media_snapshot ?? null)
          : (media[0]?.url ?? r.media_snapshot ?? null),"""
N2 = """        // La foto de la COMBINACIÓN elegida manda: quien compró la «Rojo · M» tiene que ver la
        // prenda roja en el carrito, no la foto genérica del producto (tanda K).
        coverUrl: sinProducto
          ? (r.media_snapshot ?? null)
          : (r.var_image ?? media[0]?.url ?? r.media_snapshot ?? null),"""

# 2) Los ejes quedan a mano en replaceChildren para poder heredar la foto.
A3 = """    // LOS EJES (tanda K): se reemplazan enteros, como las variantes.
    if (dto.options !== undefined) {
      const nuevos = await this.prepararOpciones(dto, productId, db);
      this.validarCombinaciones(nuevos, dto.variants);
      await this.escribirOpciones(productId, nuevos, db);
    } else if (Array.isArray(dto.variants) && dto.variants.length) {
      // Cambian las variantes y los ejes ya estaban guardados: la combinación tiene que encajar
      // con los ejes que hay. Si no, se podría comprar una talla que no existe.
      const guardados = await this.leerOpcionesCrudas(productId, db);
      if (guardados.length) this.validarCombinaciones(guardados, dto.variants);
    }"""
N3 = """    // LOS EJES (tanda K): se reemplazan enteros, como las variantes.
    let ejesParaFoto: any[] = [];
    if (dto.options !== undefined) {
      const nuevos = await this.prepararOpciones(dto, productId, db);
      this.validarCombinaciones(nuevos, dto.variants);
      await this.escribirOpciones(productId, nuevos, db);
      ejesParaFoto = nuevos;
    } else if (Array.isArray(dto.variants) && dto.variants.length) {
      // Cambian las variantes y los ejes ya estaban guardados: la combinación tiene que encajar
      // con los ejes que hay. Si no, se podría comprar una talla que no existe.
      const guardados = await this.leerOpcionesCrudas(productId, db);
      if (guardados.length) this.validarCombinaciones(guardados, dto.variants);
      ejesParaFoto = guardados;
    }"""

# 3) La variante hereda la foto del color al crearse desde el publicador.
A4 = """          INSERT INTO lifebook.product_variants
            (product_id, name, price_xaf, stock_quantity, sku, image_url, weight_g, attributes, position)
          VALUES (${productId}::uuid, ${name}, ${vPrice}, ${vStock}, ${this.clean(v?.sku, 60) || null}, ${img},
                  ${weight}, ${JSON.stringify(v?.attributes ?? {})}::jsonb, ${position})`;"""
N4 = """          INSERT INTO lifebook.product_variants
            (product_id, name, price_xaf, stock_quantity, sku, image_url, weight_g, attributes, position)
          VALUES (${productId}::uuid, ${name}, ${vPrice}, ${vStock}, ${this.clean(v?.sku, 60) || null},
                  ${img ?? this.fotoDeCombinacion(ejesParaFoto, v?.attributes)},
                  ${weight}, ${JSON.stringify(v?.attributes ?? {})}::jsonb, ${position})`;"""

# 4) Y también al actualizarse por la ruta de opciones.
A5 = """      const img = this.clean(v?.imageUrl, 400) || null;
      const attrs = (v?.attributes && typeof v.attributes === 'object') ? v.attributes : {};
      const id = porFirma.get(firma(attrs));"""
N5 = """      const attrs = (v?.attributes && typeof v.attributes === 'object') ? v.attributes : {};
      // Si la combinación no trae foto propia, hereda la del color elegido.
      const img = this.clean(v?.imageUrl, 400) || this.fotoDeCombinacion(grupos, attrs);
      const id = porFirma.get(firma(attrs));"""

# 5) El ayudante.
A6 = """  /** Las combinaciones con la misma forma que en la ficha (una sola verdad para la app). */"""
N6 = """  /**
   * La foto REAL del color elegido, para que la combinación la lleve consigo.
   *
   * El color guarda su foto en el eje (`product_option_values.image_url`). Copiarla a la variante
   * hace que el carrito, el pedido y el chat enseñen la prenda del color que se compró sin cruzar
   * tablas en cada lectura.
   */
  private fotoDeCombinacion(grupos: any[], attrs: any): string | null {
    const a = (attrs && typeof attrs === 'object') ? attrs as Record<string, unknown> : {};
    for (const g of (grupos ?? [])) {
      if (String(g?.kind) !== 'color') continue;
      const val = String(a[g.code] ?? '').trim().toLowerCase();
      if (!val) continue;
      const v = (Array.isArray(g.values) ? g.values : []).find((x: any) => String(x?.value ?? '').trim().toLowerCase() === val);
      if (v?.imageUrl) return String(v.imageUrl);
    }
    return null;
  }

  /** Las combinaciones con la misma forma que en la ficha (una sola verdad para la app). */"""

PIEZAS = [(A1, N1), (A2, N2), (A3, N3), (A4, N4), (A5, N5), (A6, N6)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'fotoDeCombinacion' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n}: {viejo.splitlines()[0][:70]}')
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
    print('escrito commerce.service.ts (la combinación se lleva su foto)')
    return 0


sys.exit(main())
