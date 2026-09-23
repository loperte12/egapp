# =============================================================================
# parche53 — aprobar un producto repuesto también avisa
#
# POR QUÉ
# El comerciante repone existencias y, si tocó el producto entero (variantes incluidas), la
# publicación vuelve a revisión: hasta que un administrador la aprueba, el producto NO está a la
# venta. Ese «aprobar» es, de hecho, el momento en que vuelve a estar disponible… y era el único
# camino de reposición que no avisaba a quien lo esperaba.
#
# QUÉ HACE
# `moderate()` llama a `avisarReposiciones` cuando el producto queda en `active`. El método
# comprueba por su cuenta si hay stock, así que aprobar algo agotado no avisa a nadie (correcto).
#
# Uso en el servidor:  python3 /root/parche53-aprobar-avisa.py
# =============================================================================
import shutil
import sys

SELLO = 'aprobar-avisa-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'

VIEJO = """    if (!rows[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    this.log.log(`moderación producto ${pid} → ${status}`);
    return { id: rows[0].id, status: rows[0].status };"""

NUEVO = """    if (!rows[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    // Aprobar es el momento en que vuelve a estar a la venta: si hay quien esperaba stock, se le
    // avisa. (El propio método mira si de verdad hay existencias.)
    if (rows[0].status === 'active') await this.avisarReposiciones(pid);
    this.log.log(`moderación producto ${pid} → ${status}`);
    return { id: rows[0].id, status: rows[0].status };"""


def main():
    src = open(SVC, encoding='utf-8').read()
    if 'Aprobar es el momento' in src:
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
