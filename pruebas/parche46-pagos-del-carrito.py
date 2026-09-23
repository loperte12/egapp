# =============================================================================
# parche46 — LA CAJA DEL CARRITO SABE CON QUÉ SE PAGA EN CADA TIENDA
#
# POR QUÉ
# El carrito se paga con **un pedido por tienda**, y cada tienda acepta SUS formas de pago. La caja
# del carrito no puede adivinar ni inventarse una lista única: la pantalla tiene que enseñar, en
# cada bloque, lo que esa tienda acepta de verdad (y si está activo o no).
#
# QUÉ AÑADE
# `myCart` devuelve, en cada grupo, `paymentMethods: [{ method, status }]`, sacado en UNA consulta
# para todas las tiendas del carrito (no una por grupo).
#
# Uso en el servidor:  python3 /root/parche46-pagos-del-carrito.py
# =============================================================================
import shutil
import sys

SELLO = 'pagos-del-carrito-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'

VIEJO = """    // Los productos «a consultar» (sin precio) no se pueden totalizar: se avisa en vez de
    // contar 0, que daría un total falso.
    const conPrecio = items.filter((i) => i.lineTotalXaf !== null);
    const cobrables = conPrecio.filter((i) => i.available);"""

NUEVO = """    // Con qué se puede pagar en CADA tienda del carrito, en UNA consulta para todas: la caja
    // genera un pedido por tienda y cada tienda acepta sus métodos.
    const tiendas = groups.map((g: any) => g.shop?.id).filter(Boolean);
    const pms: any[] = tiendas.length
      ? await this.db.$queryRaw`
          SELECT shop_id, method, status FROM lifebook.shop_payment_methods
           WHERE shop_id = ANY(${tiendas}::uuid[]) ORDER BY method`
      : [];
    for (const g of groups as any[]) {
      g.paymentMethods = pms
        .filter((m) => String(m.shop_id) === String(g.shop?.id))
        .map((m) => ({ method: String(m.method), status: String(m.status) }));
    }

    // Los productos «a consultar» (sin precio) no se pueden totalizar: se avisa en vez de
    // contar 0, que daría un total falso.
    const conPrecio = items.filter((i) => i.lineTotalXaf !== null);
    const cobrables = conPrecio.filter((i) => i.available);"""


def main():
    src = open(SVC, encoding='utf-8').read()
    if 'paymentMethods = pms' in src:
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
