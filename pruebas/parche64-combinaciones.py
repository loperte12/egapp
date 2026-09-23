# =============================================================================
# parche64 — las COMBINACIONES se guardan sin recrearlas, y se devuelven con los ejes
#
# POR QUÉ (dos cosas que se descubren al implementar la pantalla del comerciante):
#   1. `PUT products/:id/options` solo guardaba los EJES. El precio y el stock de cada combinación
#      viven en `product_variants`, y el único camino que los escribía era `PUT products/:id`,
#      que además **devuelve la publicación a revisión**. Corregir el precio de la talla L no puede
#      costarle al comerciante volver a la cola de moderación. Ahora las combinaciones se guardan
#      por la ruta de opciones y el estado del producto NO se toca.
#   2. Se borraban y recreaban TODAS las variantes (identificadores nuevos). Con combinaciones eso
#      es peor que antes: quien tuviera la «Rojo · M» en el carrito la perdería por cambiar el
#      precio de la «Azul · L». Ahora se ACTUALIZA la fila de la combinación que ya existe (misma
#      combinación = misma fila) y solo se borran las que desaparecen de verdad.
#
# Uso en el servidor:  python3 /root/parche64-combinaciones.py
# =============================================================================
import shutil
import sys

SELLO = 'combinaciones-20260214'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

A1 = """    const grupos = await this.prepararOpciones({ options: dto?.options, media: dto?.media }, pid, this.db);
    this.validarCombinaciones(grupos, variantes);

    await this.db.$transaction(async (tx: any) => {
      await this.escribirOpciones(pid, grupos, tx);
    });
    return this.options(pid);
  }"""

N1 = """    const grupos = await this.prepararOpciones({ options: dto?.options, media: dto?.media }, pid, this.db);
    this.validarCombinaciones(grupos, variantes);

    await this.db.$transaction(async (tx: any) => {
      await this.escribirOpciones(pid, grupos, tx);
      // El precio y el stock de cada combinación viven en `product_variants`. Se guardan por aquí
      // —y NO por `PUT products/:id`, que devuelve la publicación a revisión—: corregir el precio
      // de una talla no puede costarle al comerciante volver a la cola de moderación.
      if (Array.isArray(dto?.variants)) {
        await this.escribirCombinaciones(pid, grupos, dto.variants, tx);
      }
    });
    // Si con este cambio volvió a haber stock en alguna combinación, se avisa a quien esperaba.
    if (Array.isArray(dto?.variants)) await this.avisarReposiciones(pid);
    return { ...(await this.options(pid)), variants: await this.variantesShape(pid) };
  }

  /**
   * Las combinaciones del producto.
   *
   * Se ACTUALIZA la fila de la combinación que ya existía (misma combinación = misma fila) en vez
   * de borrar y recrear todo: así, cambiar el precio de la «Azul · L» no le vacía el carrito a
   * quien tenía la «Rojo · M». Solo se borran las combinaciones que desaparecen de la lista.
   */
  private async escribirCombinaciones(productId: string, grupos: any[], variantes: any[], db: any = this.db) {
    const firma = (attrs: any) => grupos.map((g) => String(attrs?.[g.code] ?? '').toLowerCase()).join('|').trim();
    const actuales: any[] = await db.$queryRaw`
      SELECT id, attributes FROM lifebook.product_variants WHERE product_id = ${productId}::uuid`;
    const porFirma = new Map<string, string>();
    for (const a of actuales) porFirma.set(firma(a.attributes ?? {}), String(a.id));

    const usados = new Set<string>();
    const vistos = new Set<string>();
    let position = 0;
    for (const v of variantes.slice(0, VARIANTS_MAX)) {
      const name = this.clean(v?.name, 120);
      if (!name) throw new DomainError('VARIANT_NAME_REQUIRED', 'Cada combinación necesita un nombre');
      const clave = name.toLowerCase();
      if (vistos.has(clave)) throw new DomainError('VARIANT_DUPLICATED', `La combinación «${name}» está repetida`);
      vistos.add(clave);
      const vPrice = this.money(v?.priceXaf, `Precio de «${name}»`);
      const vStock = Number.isInteger(Number(v?.stockQuantity)) ? Math.max(0, Number(v.stockQuantity)) : 0;
      const weight = Number.isInteger(Number(v?.weightG)) ? Math.max(0, Number(v.weightG)) : null;
      const img = this.clean(v?.imageUrl, 400) || null;
      const attrs = (v?.attributes && typeof v.attributes === 'object') ? v.attributes : {};
      const id = porFirma.get(firma(attrs));
      if (id && !usados.has(id)) {
        usados.add(id);
        await db.$executeRaw`
          UPDATE lifebook.product_variants
             SET name = ${name}, price_xaf = ${vPrice}, stock_quantity = ${vStock},
                 sku = ${this.clean(v?.sku, 60) || null}, image_url = ${img}, weight_g = ${weight},
                 attributes = ${JSON.stringify(attrs)}::jsonb, position = ${position}
           WHERE id = ${id}::uuid`;
      } else {
        await db.$executeRaw`
          INSERT INTO lifebook.product_variants
            (product_id, name, price_xaf, stock_quantity, sku, image_url, weight_g, attributes, position)
          VALUES (${productId}::uuid, ${name}, ${vPrice}, ${vStock}, ${this.clean(v?.sku, 60) || null}, ${img},
                  ${weight}, ${JSON.stringify(attrs)}::jsonb, ${position})`;
      }
      position += 1;
    }

    const sobran = actuales.map((a) => String(a.id)).filter((id) => !usados.has(id));
    for (const id of sobran) {
      await db.$executeRaw`
        DELETE FROM lifebook.product_variants WHERE id = ${id}::uuid AND product_id = ${productId}::uuid`;
    }
  }

  /** Las combinaciones con la misma forma que en la ficha (una sola verdad para la app). */
  private async variantesShape(productId: string, db: any = this.db) {
    const filas: any[] = await db.$queryRaw`
      SELECT * FROM lifebook.product_variants WHERE product_id = ${productId}::uuid ORDER BY position, name`;
    return filas.map((v) => ({
      id: v.id,
      name: v.name,
      priceXaf: v.price_xaf === null ? null : Number(v.price_xaf),
      stockQuantity: Number(v.stock_quantity ?? 0),
      sku: v.sku,
      imageUrl: v.image_url,
      weightG: v.weight_g,
      attributes: v.attributes ?? {},
      position: Number(v.position ?? 0),
    }));
  }"""

A2 = """    if (!grupos.length) return { options: [] };
    const valores: any[] = await this.db.$queryRaw`
      SELECT group_id, value, label, image_url, hex FROM lifebook.product_option_values
       WHERE group_id = ANY(${grupos.map((g) => g.id)}::uuid[]) ORDER BY position`;
    return { options: this.optionsShape(grupos, valores) };
  }"""

N2 = """    if (!grupos.length) return { options: [], variants: await this.variantesShape(pid) };
    const valores: any[] = await this.db.$queryRaw`
      SELECT group_id, value, label, image_url, hex FROM lifebook.product_option_values
       WHERE group_id = ANY(${grupos.map((g) => g.id)}::uuid[]) ORDER BY position`;
    // Las combinaciones van con los ejes: el selector necesita las dos cosas a la vez para saber
    // qué se puede comprar y qué está agotado.
    return { options: this.optionsShape(grupos, valores), variants: await this.variantesShape(pid) };
  }"""

PIEZAS = [(A1, N1), (A2, N2)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'escribirCombinaciones' in src:
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
    print('escrito commerce.service.ts (combinaciones sin recrear)')
    return 0


sys.exit(main())
