# =============================================================================
# parche66 — arreglo de orden: `ejesParaFoto` se usaba antes de declararse
#
# El parche 65 dejó el bloque de los ejes DESPUÉS del bucle de variantes, y el bucle ya usaba
# `ejesParaFoto` (TS2448: used before its declaration). En JavaScript una `let` así lanza
# ReferenceError en tiempo de ejecución, o sea que **publicar un producto con variantes habría
# fallado**. Aquí el bloque se mueve ARRIBA del bucle, que es donde tiene que estar: primero se
# validan y escriben los ejes, y después las combinaciones (que heredan la foto del color).
#
# Uso en el servidor:  python3 /root/parche66-orden-ejes.py
# =============================================================================
import shutil
import sys

SELLO = 'orden-ejes-20260214'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

BLOQUE = """    // LOS EJES (tanda K): se reemplazan enteros, como las variantes.
    let ejesParaFoto: any[] = [];
    if (dto.options !== undefined) {
      const nuevos = await this.prepararOpciones(dto, productId, db);
      this.validarCombinaciones(nuevos, dto.variants);
      await this.escribirOpciones(productId, nuevos, db);
      ejesParaFoto = nuevos;
    } else if (Array.isArray(dto.variants) && dto.variants.length) {
      // Cambian las variantes y los ejes ya estaban guardados: la combinación tiene que encajar
      // con los ejes que hay. Si no, se podría comprar una talla que no existe.
      const guardados = await this.leerOpcionesCrudas(productId, db);
      if (guardados.length) this.validarCombinaciones(guardados, dto.variants);
      ejesParaFoto = guardados;
    }
"""

VIEJO_1 = BLOQUE + """    const attrs = Array.isArray(dto.attributes) ? dto.attributes.slice(0, ATTRS_MAX) : [];"""
NUEVO_1 = """    const attrs = Array.isArray(dto.attributes) ? dto.attributes.slice(0, ATTRS_MAX) : [];"""

VIEJO_2 = """    const variants = Array.isArray(dto.variants) ? dto.variants.slice(0, VARIANTS_MAX) : [];
    if (variants.length) {"""
NUEVO_2 = BLOQUE + """
    const variants = Array.isArray(dto.variants) ? dto.variants.slice(0, VARIANTS_MAX) : [];
    if (variants.length) {"""


def main():
    src = open(P, encoding='utf-8').read()
    if src.index('let ejesParaFoto') < src.index('const variants = Array.isArray(dto.variants) ? dto.variants.slice(0, VARIANTS_MAX)'):
        print('PARECE YA APLICADO (el bloque ya está arriba): no se toca nada.')
        return 1
    problemas = []
    for viejo in (VIEJO_1, VIEJO_2):
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
    src = src.replace(VIEJO_1, NUEVO_1).replace(VIEJO_2, NUEVO_2)
    open(P, 'w', encoding='utf-8', newline='').write(src)
    print('escrito commerce.service.ts (los ejes se preparan antes que las combinaciones)')
    return 0


sys.exit(main())
