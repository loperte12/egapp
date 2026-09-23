# =============================================================================
# parche63 — las rutas de las opciones del producto y sus códigos HTTP
#
#   GET  products/:id/options   → público (lo necesita el selector antes de comprar)
#   PUT  products/:id/options   → el comerciante, solo en SU producto
#
# Y los códigos nuevos con su HTTP: un color sin foto real o una combinación repetida son
# peticiones MAL FORMADAS (400), no el 422 del cajón por defecto.
#
# Uso en el servidor:  python3 /root/parche63-opciones-rutas.py
# =============================================================================
import shutil
import sys

SELLO = 'opciones-rutas-20260214'
CTRL = '/opt/mirror/app/src/lifebook/commerce.controller.ts'
ERR = '/opt/mirror/app/src/http/error.filter.ts'

A_CTRL = """  // ──────────────────────── TALLAS Y MEDIDAS ───────────────────────────────
  /** Las tablas de tallas de un producto (público). */"""

N_CTRL = """  // ─────────────── OPCIONES DEL PRODUCTO (tanda K) ─────────────────────────
  /**
   * Los ejes de elección de un producto: Color (con la foto real de cada color), Talla,
   * Almacenamiento, Formato… Es PÚBLICO porque lo necesita el selector que se abre al pulsar
   * «Comprar» o «Añadir al carrito»: hasta ahora esos botones compraban con la primera variante
   * que apareciera y nadie elegía talla ni color.
   */
  @Get('products/:id/options')
  options(@Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.options(id);
  }

  /** El comerciante guarda los ejes de SU producto (y sus combinaciones, si las manda). */
  @Put('products/:id/options')
  @UseGuards(JwtAuthGuard)
  setOptions(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setOptions(u.userId, id, dto ?? {});
  }

  // ──────────────────────── TALLAS Y MEDIDAS ───────────────────────────────
  /** Las tablas de tallas de un producto (público). */"""

A_ERR = """  VARIANT_DUPLICATED: HttpStatus.BAD_REQUEST,"""

N_ERR = """  VARIANT_DUPLICATED: HttpStatus.BAD_REQUEST,
  // Mercado (tanda K): los ejes de opciones y sus combinaciones. Todo esto es «petición mal
  // formada»: un color sin su foto real, una combinación repetida o una talla que no existe.
  OPTIONS_LIMIT: HttpStatus.BAD_REQUEST,
  OPTION_CODE_INVALID: HttpStatus.BAD_REQUEST,
  OPTION_CODE_DUPLICATED: HttpStatus.BAD_REQUEST,
  OPTION_KIND_INVALID: HttpStatus.BAD_REQUEST,
  OPTION_CHART_KIND_INVALID: HttpStatus.BAD_REQUEST,
  OPTION_VALUE_DUPLICATED: HttpStatus.BAD_REQUEST,
  OPTION_COLOR_PHOTO_REQUIRED: HttpStatus.BAD_REQUEST,
  OPTION_PHOTO_NOT_IN_PRODUCT: HttpStatus.BAD_REQUEST,
  OPTION_EMPTY: HttpStatus.BAD_REQUEST,
  VARIANTS_REQUIRED: HttpStatus.BAD_REQUEST,
  VARIANT_OPTION_MISSING: HttpStatus.BAD_REQUEST,
  VARIANT_OPTION_UNKNOWN: HttpStatus.BAD_REQUEST,
  VARIANT_COMBINATION_DUPLICATED: HttpStatus.BAD_REQUEST,"""


def main():
    ctrl = open(CTRL, encoding='utf-8').read()
    err = open(ERR, encoding='utf-8').read()

    if 'setOptions' in ctrl and 'OPTION_COLOR_PHOTO_REQUIRED' in err:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1

    problemas = []
    if ctrl.count(A_CTRL) != 1:
        problemas.append(f'controller: esperaba 1 aparición del bloque de tallas y hay {ctrl.count(A_CTRL)}')
    if err.count(A_ERR) != 1:
        problemas.append(f'error.filter: esperaba 1 aparición de VARIANT_DUPLICATED y hay {err.count(A_ERR)}')
    if 'OPTION_COLOR_PHOTO_REQUIRED' in err:
        problemas.append('error.filter: los códigos nuevos ya estaban')
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return 1

    shutil.copyfile(CTRL, f'{CTRL}.bak-{SELLO}')
    shutil.copyfile(ERR, f'{ERR}.bak-{SELLO}')
    print(f'respaldos: {CTRL}.bak-{SELLO} · {ERR}.bak-{SELLO}')
    open(CTRL, 'w', encoding='utf-8', newline='').write(ctrl.replace(A_CTRL, N_CTRL))
    open(ERR, 'w', encoding='utf-8', newline='').write(err.replace(A_ERR, N_ERR))
    print('escritos commerce.controller.ts y error.filter.ts')
    return 0


sys.exit(main())
