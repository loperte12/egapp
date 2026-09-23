# =============================================================================
# parche47 — LA CAJA DEL CARRITO SABE CÓMO SE ENTREGA EN CADA TIENDA
#
# POR QUÉ
# El carrito se paga con un pedido por tienda, y la entrega la decide CADA tienda (su política de
# envío): no hay una «forma de entrega del carrito». Sin este dato, la caja del carrito tendría que
# adivinar, o enseñar formas de entrega que esa tienda no ofrece.
#
# QUÉ AÑADE (en cada grupo de `myCart`)
#   · `deliveryModes`: las formas de entrega reales de esa tienda (+ «recoger en tienda» siempre);
#   · `deliveryCostMode` y `deliveryCostXaf`: si el envío es fijo, a calcular o a consultar, para
#     poder decir el precio ANTES de pagar y no después.
#
# Uso en el servidor:  python3 /root/parche47-entrega-del-carrito.py
# =============================================================================
import shutil
import sys

SELLO = 'entrega-del-carrito-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'

VIEJO = """    for (const g of groups as any[]) {
      g.paymentMethods = pms
        .filter((m) => String(m.shop_id) === String(g.shop?.id))
        .map((m) => ({ method: String(m.method), status: String(m.status) }));
    }
"""

NUEVO = """    for (const g of groups as any[]) {
      g.paymentMethods = pms
        .filter((m) => String(m.shop_id) === String(g.shop?.id))
        .map((m) => ({ method: String(m.method), status: String(m.status) }));
    }

    // La ENTREGA también es de cada tienda: su política de envío manda. Sin esto, la caja del
    // carrito enseñaría formas de entrega que esa tienda no ofrece, o un envío «a consultar» que
    // en realidad es fijo. Se saca en una consulta para todas las tiendas del carrito.
    const politicas: any[] = tiendas.length
      ? await this.db.$queryRaw`
          SELECT DISTINCT ON (shop_id) shop_id, transport_modes, cost_mode, base_cost_xaf
            FROM lifebook.shipping_policies
           WHERE shop_id = ANY(${tiendas}::uuid[])
           ORDER BY shop_id, is_default DESC, created_at`
      : [];
    for (const g of groups as any[]) {
      const pol = politicas.find((x) => String(x.shop_id) === String(g.shop?.id)) ?? null;
      const modos = Array.isArray(pol?.transport_modes) ? (pol.transport_modes as unknown[]).map((m) => String(m)) : [];
      g.deliveryModes = ['pickup', ...modos.filter((m) => m !== 'pickup')];
      g.deliveryCostMode = pol?.cost_mode ? String(pol.cost_mode) : null;
      g.deliveryCostXaf = pol?.base_cost_xaf === null || pol?.base_cost_xaf === undefined ? null : Number(pol.base_cost_xaf);
    }
"""


def main():
    src = open(SVC, encoding='utf-8').read()
    if 'deliveryModes = ' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    n = src.count(VIEJO)
    if n != 1:
        print(f'FALLO: esperaba 1 aparición y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(SVC, f'{SVC}.bak-{SELLO}')
    print(f'respaldo: {SVC}.bak-{SELLO}')
    open(SVC, 'w', encoding='utf-8', newline='').write(src.replace(VIEJO, NUEVO))
    print('escrito commerce.service.ts')
    return 0


sys.exit(main())
