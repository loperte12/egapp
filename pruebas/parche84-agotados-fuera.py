# =============================================================================
# parche84 — LOS AGOTADOS FUERA DEL ESCAPARATE (punto 10 de la §3)
#
# QUÉ PASA HOY: el catálogo (`listCatalog`) filtra por `p.status = 'active'` y **nada más**. Un producto
# con `stock_mode = 'exact'` y `stock_quantity = 0` sigue listado, así que el escaparate **enseña lo que
# no se puede comprar**: el comprador entra, se ilusiona y se encuentra «agotado» (y la tienda queda por
# mentirosa). La ficha ya lo dice bien —`commerce.service.ts` calcula el estado `agotado`— pero la
# rejilla no lo esconde.
#
# QUÉ HACE ESTE PARCHE: la condición «se puede comprar» entra en los TRES sitios públicos donde se cuenta
# o se lista lo que hay en una tienda, para que **no se contradigan** (un chip que dice «3 productos» y
# abre una rejilla con 2 es una trampa, y su propio comentario lo dice):
#   1. `listCatalog` — la rejilla del catálogo.
#   2. `shopCategories` — los chips por categoría del perfil público (`GET /shops/:id/categories`).
#   3. El detalle de la tienda — sus contadores `products` / `sales` / `services`.
#
# LA REGLA (solo se esconde lo que no se puede comprar):
#   · `stock_mode <> 'exact'` → NO se esconde nunca: «a pedido», «aproximado» y «sin límite» no se agotan.
#   · `stock_quantity > 0` → se ve.
#   · y si el producto tiene **tallas con stock**, se ve aunque el total esté a 0 (la talla sí se compra).
#
# La ficha del producto NO cambia: sigue abriéndose y sigue diciendo «agotado» (con su enlace, sus fotos
# y sus tallas). Lo que se quita es el escaparate, no la información.
#
# Uso en el servidor:  python3 /root/parche84-agotados-fuera.py
# =============================================================================
import shutil
import sys

SELLO = 'agotados-fuera-20260215'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

# ── 1. La rejilla del catálogo ───────────────────────────────────────────────
ANCLA_CATALOGO = """    const where: string[] = [`p.status = 'active'`, `s.is_active`];"""

NUEVO_CATALOGO = """    // Punto 10 de la acción inmediata: al escaparate no se asoma lo que no se puede comprar.
    // (La misma condición está en `shopCategories` y en el detalle de la tienda: si se cambia aquí,
    //  hay que cambiarla allí, o los contadores dirán una cosa y la rejilla otra.)
    const where: string[] = [`p.status = 'active'`, `s.is_active`,
      `(p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0
        OR EXISTS (SELECT 1 FROM lifebook.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0))`];"""

# ── 2. Los chips por categoría del perfil público ────────────────────────────
ANCLA_CHIPS = """      SELECT c.id, c.name, c.icon, count(*)::int AS cuantos
        FROM lifebook.products p
        JOIN lifebook.categories c ON c.id = p.category_id
       WHERE p.shop_id = ${sid}::uuid AND p.status = 'active'
       GROUP BY c.id, c.name, c.icon, c.sort_order"""

NUEVO_CHIPS = """      SELECT c.id, c.name, c.icon, count(*)::int AS cuantos
        FROM lifebook.products p
        JOIN lifebook.categories c ON c.id = p.category_id
       WHERE p.shop_id = ${sid}::uuid AND p.status = 'active'
         AND (p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0
              OR EXISTS (SELECT 1 FROM lifebook.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0))
       GROUP BY c.id, c.name, c.icon, c.sort_order"""

ANCLA_TOTAL = """      SELECT count(*)::int AS n FROM lifebook.products
       WHERE shop_id = ${sid}::uuid AND status = 'active'`;

    return {"""

NUEVO_TOTAL = """      SELECT count(*)::int AS n FROM lifebook.products p
       WHERE p.shop_id = ${sid}::uuid AND p.status = 'active'
         AND (p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0
              OR EXISTS (SELECT 1 FROM lifebook.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0))`;

    return {"""

# ── 3. Los contadores del detalle de la tienda ───────────────────────────────
ANCLA_CONTADORES = """        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active') AS products,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active' AND p.service_type IN ('physical','food')) AS sales,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active' AND p.service_type NOT IN ('physical','food')) AS services,"""

NUEVOS_CONTADORES = """        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active'
           AND (p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0
                OR EXISTS (SELECT 1 FROM lifebook.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0))) AS products,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active' AND p.service_type IN ('physical','food')
           AND (p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0
                OR EXISTS (SELECT 1 FROM lifebook.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0))) AS sales,
        (SELECT count(*)::int FROM lifebook.products p WHERE p.shop_id = ${s.id}::uuid AND p.status = 'active' AND p.service_type NOT IN ('physical','food')
           AND (p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0
                OR EXISTS (SELECT 1 FROM lifebook.product_variants v WHERE v.product_id = p.id AND v.stock_quantity > 0))) AS services,"""

PIEZAS = [
    (ANCLA_CATALOGO, NUEVO_CATALOGO),
    (ANCLA_CHIPS, NUEVO_CHIPS),
    (ANCLA_TOTAL, NUEVO_TOTAL),
    (ANCLA_CONTADORES, NUEVOS_CONTADORES),
]


def main():
    src = open(P, encoding='utf-8').read()
    if "p.stock_mode <> 'exact' OR coalesce(p.stock_quantity, 0) > 0" in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n} → ' + viejo.strip().splitlines()[0][:70])
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
    print('escrito commerce.service.ts (catálogo, chips y contadores sin lo agotado)')
    return 0


sys.exit(main())
