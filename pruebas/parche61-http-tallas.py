# =============================================================================
# parche61 — los códigos de tallas y medidas, con su HTTP
#
# Sin esto salían como **422** (el cajón por defecto), pero son peticiones MAL FORMADAS: una talla
# con el rango al revés, un pecho de 900 cm o un sexo que no existe son 400, no 422.
#
# Uso en el servidor:  python3 /root/parche61-http-tallas.py
# =============================================================================
import shutil
import sys

SELLO = 'http-tallas-20260214'
P = '/opt/mirror/app/src/http/error.filter.ts'

VIEJO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,"""

NUEVO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,
  // Mercado (tanda J): tablas de tallas y medidas corporales. Todo esto es «petición mal formada».
  SIZE_CHART_GENDER_INVALID: HttpStatus.BAD_REQUEST,
  SIZE_CHART_KIND_INVALID: HttpStatus.BAD_REQUEST,
  SIZE_CHART_EMPTY: HttpStatus.BAD_REQUEST,
  SIZE_RANGE_INVALID: HttpStatus.BAD_REQUEST,
  SIZE_MEASURE_INVALID: HttpStatus.BAD_REQUEST,
  MEASURE_CATEGORY_INVALID: HttpStatus.BAD_REQUEST,
  MEASURE_INVALID: HttpStatus.BAD_REQUEST,
  MEASURE_REQUIRED: HttpStatus.BAD_REQUEST,"""


def main():
    src = open(P, encoding='utf-8').read()
    if 'SIZE_CHART_GENDER_INVALID' in src:
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
