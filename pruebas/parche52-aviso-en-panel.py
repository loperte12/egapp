# =============================================================================
# parche52 — el aviso de reposición también cuando el vendedor repone desde el PANEL
#
# POR QUÉ
# El parche 48 avisaba al reponer por dos caminos: editar el producto (`PUT`, que devuelve la
# publicación a moderación) y volver a publicarlo. Pero el camino que un comerciante usa de verdad
# todos los días es **«Precio y stock»** (`PATCH /commerce/merchant/products/:id/quick`), que existe
# justo para eso. Sin él, reponer stock desde el panel NO avisaba a nadie.
#
# QUÉ HACE
#   1. `avisarReposiciones` pasa a ser público en `LifebookCommerceService`.
#   2. `LifebookMerchantService` lo recibe por inyección (los dos son providers del mismo módulo) y
#      lo llama al terminar la edición rápida. El propio método comprueba si hay stock y si el
#      producto está publicado, así que llamarlo siempre es seguro; y va con `catch` para que un
#      aviso no pueda tumbar la edición del comerciante.
#
# Uso en el servidor:  python3 /root/parche52-aviso-en-panel.py
# =============================================================================
import shutil
import sys

SELLO = 'aviso-en-panel-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'
MER = '/opt/mirror/app/src/lifebook/merchant.service.ts'

fallos = []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def aplicar(p, src, edits):
    for nombre, viejo, nuevo, veces in edits:
        n = src.count(viejo)
        if n != veces:
            fallos.append(f'{p.split("/")[-1]} [{nombre}]: esperaba {veces} apariciones y hay {n}')
            continue
        src = src.replace(viejo, nuevo)
        print(f'  ok · {nombre} ({n})')
    return src


SVC_EDITS = [
    (
        'avisarReposiciones público',
        '  private async avisarReposiciones(productId: string): Promise<number> {',
        '  async avisarReposiciones(productId: string): Promise<number> {',
        1,
    ),
]

MER_EDITS = [
    (
        'import del servicio de comercio',
        "import { MobilityPrismaService } from '../mobility/mobility-prisma.service';",
        "import { MobilityPrismaService } from '../mobility/mobility-prisma.service';\n"
        "/* El aviso de reposición vive en el módulo de comercio: aquí solo se llama. */\n"
        "import { LifebookCommerceService } from './commerce.service';",
        1,
    ),
    (
        'inyección',
        '  constructor(private readonly db: MobilityPrismaService) {}',
        '  constructor(\n'
        '    private readonly db: MobilityPrismaService,\n'
        '    private readonly commerce: LifebookCommerceService,\n'
        '  ) {}',
        1,
    ),
    (
        'avisar tras la edición rápida',
        """    const r = upd[0];
    this.log.log(`producto ${pid} actualizado rápido (precio/stock) por ${userId}`);""",
        """    const r = upd[0];
    // Si con este cambio volvió a haber stock, se avisa a quien lo estaba esperando («avísame
    // cuando llegue»). El propio método mira si hay stock y si está publicado; con `catch` para
    // que un aviso no pueda tumbar la edición del comerciante.
    await this.commerce.avisarReposiciones(pid).catch(() => {});
    this.log.log(`producto ${pid} actualizado rápido (precio/stock) por ${userId}`);""",
        1,
    ),
]


def main():
    svc = leer(SVC)
    mer = leer(MER)
    if 'avisarReposiciones(pid)' in mer:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    shutil.copyfile(SVC, f'{SVC}.bak-{SELLO}')
    shutil.copyfile(MER, f'{MER}.bak-{SELLO}')
    print(f'respaldo: {SVC}.bak-{SELLO}')
    print(f'respaldo: {MER}.bak-{SELLO}')
    svc = aplicar(SVC, svc, SVC_EDITS)
    mer = aplicar(MER, mer, MER_EDITS)
    if fallos:
        print('\nNO SE ESCRIBE NADA. Fallos:')
        for f in fallos:
            print(' -', f)
        return 1
    open(SVC, 'w', encoding='utf-8', newline='').write(svc)
    open(MER, 'w', encoding='utf-8', newline='').write(mer)
    print('\nescritos los dos ficheros.')
    return 0


sys.exit(main())
