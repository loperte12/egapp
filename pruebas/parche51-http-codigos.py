# =============================================================================
# parche51 — dos códigos de error del carrito y del aviso, con su HTTP
#
# `CANNOT_WATCH_OWN` («este producto es de tu tienda») salía como **422** por no estar en el mapa:
# es una petición mal formada (400), igual que `CANNOT_BUY_OWN`, que ya estaba.
# Y `CART_LINE_NOT_FOUND` («esa línea no está en tu carrito») es un **404**, no un 422.
#
# Uso en el servidor:  python3 /root/parche51-http-codigos.py
# =============================================================================
import shutil
import sys

SELLO = 'http-codigos-20260214'
P = '/opt/mirror/app/src/http/error.filter.ts'

VIEJO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,"""

NUEVO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,
  // Mercado (tandas D/G): no se compra ni se espera stock de la propia tienda.
  CANNOT_WATCH_OWN: HttpStatus.BAD_REQUEST,
  // «Esa línea no está en tu carrito»: no existe (para ti), no es una petición mal formada.
  CART_LINE_NOT_FOUND: HttpStatus.NOT_FOUND,"""


def main():
    src = open(P, encoding='utf-8').read()
    if 'CANNOT_WATCH_OWN' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    n = src.count(VIEJO)
    if n != 1:
        print(f'FALLO: esperaba 1 aparición y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(VIEJO, NUEVO))
    print('escrito error.filter.ts')
    return 0


sys.exit(main())
