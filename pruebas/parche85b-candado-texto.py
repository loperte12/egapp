# =============================================================================
# parche85b — CORRECCIÓN del candado del número de pedido (el `void` de Prisma)
#
# QUÉ PASÓ: el parche 85 puso el candado así:
#
#     await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'lb-orderno-' + day}))`;
#
# y **las 8 compras simultáneas de la prueba devolvieron HTTP 500**. El log del servidor lo dijo sin
# rodeos (por eso se mira el log antes de tocar nada):
#
#     PrismaClientKnownRequestError [P2010]
#     Raw query failed … Message: Failed to deserialize column of type 'void'.
#     If you're using $queryRaw … try casting this column to any supported Prisma type such as `String`.
#     at LifebookOrdersService.nextOrderNo (orders.service.ts:105)
#
# `pg_advisory_xact_lock` no devuelve nada (tipo `void`) y Prisma no sabe convertir eso a un valor de JS.
# La corrección es la que el propio mensaje propone: **convertirlo a texto** (`::text`). El candado
# funciona igual; lo único que cambia es que su resultado vacío viaja como una cadena.
#
# Uso en el servidor:  python3 /root/parche85b-candado-texto.py
# =============================================================================
import shutil
import sys

SELLO = 'candado-texto-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

ANCLA = """    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'lb-orderno-' + day}))`;"""

NUEVO = """    // `::text` NO es decorativo: `pg_advisory_xact_lock` devuelve `void` y Prisma no sabe convertir
    // ese tipo (falla con «Failed to deserialize column of type 'void'») — con el candado se caían las
    // 8 compras simultáneas de la prueba. Convertido a texto, el candado hace lo mismo y no estorba.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'lb-orderno-' + day}))::text`;"""


def main():
    src = open(P, encoding='utf-8').read()
    if '::text`;' in src and 'pg_advisory_xact_lock' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    if src.count(ANCLA) != 1:
        print(f'FALLO: el anclaje no cuadra ({src.count(ANCLA)} apariciones). NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(ANCLA, NUEVO))
    print('escrito orders.service.ts (el candado se convierte a texto antes de leerlo)')
    return 0


sys.exit(main())
