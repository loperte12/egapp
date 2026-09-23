# =============================================================================
# parche56 — los códigos de los cupones, con su HTTP
#
# Sin esto, todos los errores de cupón salían como **422** (el cajón por defecto): una petición mal
# formada (código corto, valor 0, 100 %) no es un 422, y un código repetido es un **409**.
# El cliente necesita distinguirlos para decir qué pasa.
#
# Uso en el servidor:  python3 /root/parche56-http-cupones.py
# =============================================================================
import shutil
import sys

SELLO = 'http-cupones-20260214'
P = '/opt/mirror/app/src/http/error.filter.ts'

VIEJO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,"""

NUEVO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,
  // Mercado (tanda H2): cupones. Petición mal formada ≠ conflicto ≠ no existe.
  COUPON_CODE_REQUIRED: HttpStatus.BAD_REQUEST,
  COUPON_CODE_INVALID: HttpStatus.BAD_REQUEST,
  COUPON_KIND_INVALID: HttpStatus.BAD_REQUEST,
  COUPON_VALUE_INVALID: HttpStatus.BAD_REQUEST,
  COUPON_PERCENT_TOO_HIGH: HttpStatus.BAD_REQUEST,
  COUPON_EXPIRY_INVALID: HttpStatus.BAD_REQUEST,
  COUPON_STATUS_INVALID: HttpStatus.BAD_REQUEST,
  SHOP_REQUIRED: HttpStatus.BAD_REQUEST,
  COUPON_CODE_TAKEN: HttpStatus.CONFLICT,
  COUPON_EXPIRED: HttpStatus.CONFLICT,
  COUPON_USED_UP: HttpStatus.CONFLICT,
  COUPON_NOT_FOUND: HttpStatus.NOT_FOUND,"""


def main():
    src = open(P, encoding='utf-8').read()
    if 'COUPON_CODE_TAKEN' in src:
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
