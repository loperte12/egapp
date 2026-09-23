# =============================================================================
# parche85 — DOS COMPRAS A LA VEZ NO PUEDEN PELEARSE POR EL NÚMERO DE PEDIDO
#            (punto 13 de la §3)
#
# QUÉ DECÍA EL DOCUMENTO: «`order_no` único — `count(*) + 1`, **sin índice único**; dos compras a la vez
# pueden repetir número».
#
# QUÉ HE COMPROBADO (y hay que corregirlo): el índice **YA EXISTE** y es único
# (`orders_order_no_key ON lifebook.orders (order_no)`), y no hay ni un número repetido entre los 187
# pedidos. O sea: la frase «sin índice único» del documento es **falsa**.
#
# PERO EL FALLO ES REAL, con otro síntoma: como el número se calcula **contando** los pedidos del día,
# dos transacciones simultáneas cuentan lo mismo y calculan **el mismo número**; la segunda choca con el
# índice único y el comprador ve un **error del servidor** en vez de su pedido. No se repite el número
# (el índice lo impide), pero **se pierde la compra**.
#
# QUÉ HACE ESTE PARCHE: el número se calcula dentro de un **candado por día**
# (`pg_advisory_xact_lock`), que serializa solo ese cálculo (milisegundos) y lo deja limpio:
#   · candado por día (dos compras de días distintos no se estorban),
#   · y el número sale del **más alto que ya existe + 1**, no del recuento: si algún día se borra un
#     pedido, contar daría un número ya usado.
#
# Uso en el servidor:  python3 /root/parche85-numero-de-pedido.py
# =============================================================================
import shutil
import sys

SELLO = 'numero-de-pedido-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

ANCLA = """  private async nextOrderNo(tx: any): Promise<string> {
    const m = this.malabo();
    const day = `${String(m.getUTCFullYear()).slice(-2)}${String(m.getUTCMonth() + 1).padStart(2, '0')}${String(m.getUTCDate()).padStart(2, '0')}`;
    const rows: any[] = await tx.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.orders WHERE order_no LIKE ${'LB-' + day + '-%'}`;
    const n = Number(rows[0]?.n ?? 0) + 1;
    return `LB-${day}-${String(n).padStart(4, '0')}`;
  }"""

NUEVO = """  /**
   * EL NÚMERO DEL PEDIDO, SIN PELEAS (punto 13 de la acción inmediata).
   *
   * Antes se contaban los pedidos del día y se sumaba 1. Dos compras a la vez contaban lo mismo y
   * calculaban el MISMO número: la segunda chocaba con el índice único (`orders_order_no_key`) y el
   * comprador se quedaba sin pedido, con un error del servidor. El número no se repetía, pero **se
   * perdía la compra**.
   *
   * Ahora:
   *   · un **candado por día** (`pg_advisory_xact_lock`) serializa solo este cálculo —milisegundos— y
   *     dos compras del mismo día se ponen en fila para coger número; las de días distintos no se
   *     estorban, porque el candado es distinto;
   *   · y el número sale del **más alto que ya existe + 1**, no del recuento: si algún día se borra un
   *     pedido, contar daría un número ya usado.
   */
  private async nextOrderNo(tx: any): Promise<string> {
    const m = this.malabo();
    const day = `${String(m.getUTCFullYear()).slice(-2)}${String(m.getUTCMonth() + 1).padStart(2, '0')}${String(m.getUTCDate()).padStart(2, '0')}`;
    const prefijo = 'LB-' + day + '-';
    // El candado se suelta solo al terminar la transacción (xact): no hay que acordarse de nada.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'lb-orderno-' + day}))`;
    const rows: any[] = await tx.$queryRaw`
      SELECT coalesce(max(substring(order_no from '[0-9]+$')::int), 0) AS ultimo
        FROM lifebook.orders WHERE order_no LIKE ${prefijo + '%'}`;
    const n = Number(rows[0]?.ultimo ?? 0) + 1;
    return `${prefijo}${String(n).padStart(4, '0')}`;
  }"""


def main():
    src = open(P, encoding='utf-8').read()
    if 'pg_advisory_xact_lock' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    if src.count(ANCLA) != 1:
        print(f'FALLO: el anclaje no cuadra ({src.count(ANCLA)} apariciones). NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(ANCLA, NUEVO))
    print('escrito orders.service.ts (candado por día + el número sale del más alto, no del recuento)')
    return 0


sys.exit(main())
