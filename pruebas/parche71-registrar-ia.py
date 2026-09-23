# =============================================================================
# parche71 — registrar el ASISTENTE DE IA en la app NestJS (tanda M)
#
# Los dos ficheros nuevos se suben aparte (`ai.service.ts` y `ai.controller.ts` a
# /opt/mirror/app/src/lifebook/); este parche solo los DECLARA en `http/app.module.ts`, que es donde
# este proyecto registra todos los controladores y servicios (no hay módulos por carpeta).
# Sin esto, el código está pero las rutas no existen.
#
# Uso en el servidor:  python3 /root/parche71-registrar-ia.py
# =============================================================================
import shutil
import sys

SELLO = 'asistente-ia-20260215'
P = '/opt/mirror/app/src/http/app.module.ts'

A1 = """import { LifebookMerchantController } from '../lifebook/merchant.controller';"""

N1 = """import { LifebookAiController } from '../lifebook/ai.controller';
import { LifebookAiService } from '../lifebook/ai.service';
import { LifebookMerchantController } from '../lifebook/merchant.controller';"""

A2 = """    LifebookCommerceController,
    LifebookOrdersController,"""

N2 = """    LifebookCommerceController,
    LifebookAiController,
    LifebookOrdersController,"""

A3 = """    LifebookCommerceService,
    LifebookOrdersService,"""

N3 = """    LifebookCommerceService,
    LifebookAiService,
    LifebookOrdersService,"""

PIEZAS = [(A1, N1), (A2, N2), (A3, N3)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'LifebookAiController' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n}: ' + viejo.splitlines()[0][:70])
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
    print('escrito app.module.ts (el asistente de IA, declarado)')
    return 0


sys.exit(main())
