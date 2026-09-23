# =============================================================================
# parche75 — el cupón dice DE QUÉ TIENDA es (tanda Q)
#
# La caja tiene que enseñar solo los cupones que valen en la tienda donde se está comprando. El
# servidor ya devolvía el NOMBRE de la tienda, pero no su id: comparar por nombre es frágil (dos
# tiendas pueden llamarse igual). Este parche añade `shopId` a los cupones recogidos y al cupón que
# se acaba de recoger.
#
# Uso en el servidor:  python3 /root/parche75-tienda-del-cupon.py
# =============================================================================
import shutil
import sys

SELLO = 'tienda-del-cupon-20260215'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

A1 = """          ...this.couponShape(c),
          shopName: c.shop_name ?? null,
          myUses: Number(c.my_uses ?? 0),"""

N1 = """          ...this.couponShape(c),
          /** De qué tienda es: la caja solo enseña los que valen donde se está comprando. */
          shopId: String(c.shop_id),
          shopName: c.shop_name ?? null,
          myUses: Number(c.my_uses ?? 0),"""

A2 = """      coupon: {
        ...this.couponShape(c),
        shopName: c.shop_name ?? null,"""

N2 = """      coupon: {
        ...this.couponShape(c),
        shopId: String(c.shop_id),
        shopName: c.shop_name ?? null,"""

PIEZAS = [(A1, N1), (A2, N2)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'shopId: String(c.shop_id)' in src:
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
    print('escrito commerce.service.ts (el cupón ya dice de qué tienda es)')
    return 0


sys.exit(main())
