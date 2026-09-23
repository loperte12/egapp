# =============================================================================
# parche89 — REGISTRAR LA PIEZA DE COBRO (punto 9 de la §3)
#
# Solo toca `app.module.ts`: importa y registra el controlador de la pieza de cobro
# (`payments.controller.ts`) y su servicio (`payments.service.ts`). Los dos ficheros se suben aparte.
#
# Uso en el servidor:  python3 /root/parche89-pieza-de-cobro.py
# =============================================================================
import shutil
import sys

SELLO = 'pieza-de-cobro-20260215'
M = '/opt/mirror/app/src/http/app.module.ts'

A_IMPORT = """import { LifebookOrdersMoneyController } from '../lifebook/orders-money.controller';"""
N_IMPORT = """import { LifebookOrdersMoneyController } from '../lifebook/orders-money.controller';
import { LifebookPaymentsController } from '../lifebook/payments.controller';
import { LifebookPaymentsService } from '../lifebook/payments.service';"""

A_CTRL = """    LifebookOrdersMoneyController,"""
N_CTRL = """    LifebookOrdersMoneyController,
    LifebookPaymentsController,"""

# El servicio se registra donde estén los demás proveedores de lifebook. Si no hay lista de providers
# con ese nombre, el parche lo dice en vez de adivinar.
A_PROV = """    LifebookOrdersService,"""
N_PROV = """    LifebookOrdersService,
    LifebookPaymentsService,"""


def main():
    src = open(M, encoding='utf-8').read()
    if 'LifebookPaymentsService' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    piezas = [(A_IMPORT, N_IMPORT), (A_CTRL, N_CTRL), (A_PROV, N_PROV)]
    problemas = []
    for viejo, _ in piezas:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n} → ' + viejo.strip()[:60])
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return 1
    shutil.copyfile(M, f'{M}.bak-{SELLO}')
    print(f'respaldo: {M}.bak-{SELLO}')
    for viejo, nuevo in piezas:
        src = src.replace(viejo, nuevo)
    open(M, 'w', encoding='utf-8', newline='').write(src)
    print('escrito app.module.ts (controlador y servicio de la pieza de cobro)')
    return 0


sys.exit(main())
