# parche91b — dos dotes tras el primer tsc de parche91:
#   1) mobility.controller: this.bad solo acepta (code, message) — la suspensión
#      llevaba un tercer argumento (details). Se mete en el mensaje.
#   2) error.filter: CITY_REQUIRED ya estaba mapeado (tanda anterior) — quito el
#      duplicado que añadió parche91.
# Uso: python3 /root/parche91b-fix.py
import sys

MO = '/opt/mirror/app/src/mobility/mobility.controller.ts'
MO_OLD = """      throw this.bad('DRIVER_SUSPENDED', 'Cuenta de conductor suspendida por cancelaciones', {
        suspended_until: dbl[0].suspended_until,
      });"""
MO_NEW = """      throw this.bad('DRIVER_SUSPENDED',
        `Cuenta de conductor suspendida por cancelaciones hasta ${new Date(dbl[0].suspended_until).toISOString()}`);"""

EF = '/opt/mirror/app/src/http/error.filter.ts'
EF_OLD = """  DRIVER_SUSPENDED: HttpStatus.FORBIDDEN,
  CITY_REQUIRED: HttpStatus.BAD_REQUEST,
  FARE_INVALID: HttpStatus.BAD_REQUEST,"""
EF_NEW = """  DRIVER_SUSPENDED: HttpStatus.FORBIDDEN,
  FARE_INVALID: HttpStatus.BAD_REQUEST,"""

problemas = []
textos = {}
for path, viejo, _ in ((MO, MO_OLD, MO_NEW), (EF, EF_OLD, EF_NEW)):
    src = open(path, encoding='utf-8').read()
    c = src.count(viejo)
    if c != 1:
        problemas.append(f'{path}: {c} apariciones')
    textos[path] = src
if problemas:
    print('FALLO (no escribo):', problemas)
    sys.exit(1)
for path, viejo, nuevo in ((MO, MO_OLD, MO_NEW), (EF, EF_OLD, EF_NEW)):
    src = textos[path].replace(viejo, nuevo)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(f'parchado: {path}')
print('LISTO')
