# =============================================================================
# parche76 — LA PRUEBA SOCIAL: `sales_count` (punto 2 de la ACCIÓN INMEDIATA)
#
# QUÉ PASA HOY: `lifebook.products.sales_count` existe desde el principio y **nunca se incrementa**
# (116 productos en 0). La ficha del producto enseña «N ventas» y esa prueba social está muerta.
#
# QUÉ HACE ESTE PARCHE: al ENTREGAR un pedido, suma las unidades a cada producto del pedido.
#   · dentro de la MISMA transacción que el cambio de estado (o quedan las dos cosas, o ninguna);
#   · en las DOS vías de entrega: el botón del vendedor (`orderAction('deliver')`) y la confirmación
#     del código de contra entrega (`confirmDeliveryCode`), que son excluyentes entre sí;
#   · por PRODUCTO (no por variante), que es lo que enseña la ficha;
#   · no hace falta restar nada al cancelar: un pedido entregado ya no se puede cancelar.
#
# Uso en el servidor:  python3 /root/parche76-ventas.py
# =============================================================================
import shutil
import sys

SELLO = 'ventas-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

# ── 1. Al entregar desde el panel del vendedor ───────────────────────────────
A1 = """         WHERE id = ${orderId}::uuid`;
      // Cancelar o rechazar devuelve el stock
      if (cfg.to === 'cancelled') {"""

N1 = """         WHERE id = ${orderId}::uuid`;
      /**
       * ENTREGAR SUMA LA VENTA (punto 2 de la acción inmediata).
       *
       * `sales_count` existía y nunca se tocaba: la ficha enseña «N ventas» y todos los productos
       * decían 0. Es la única señal honesta de que un producto se vende. Va aquí dentro, en la misma
       * transacción que el cambio de estado, para que no pueda quedar un pedido entregado sin su venta.
       * No hay que restar nada al cancelar: un pedido entregado ya no se puede cancelar.
       */
      if (cfg.to === 'delivered') await this.sumarVentas(tx, orderId);
      // Cancelar o rechazar devuelve el stock
      if (cfg.to === 'cancelled') {"""

# ── 2. Al confirmar el código de contra entrega ──────────────────────────────
A2 = """    await this.db.$executeRaw`
      UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
             delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now()
       WHERE id = ${orderId}::uuid`;"""

N2 = """    // En UNA transacción con la venta: si se cae a mitad, no queda entregado sin sumar la venta.
    await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`
        UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
               delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now()
         WHERE id = ${orderId}::uuid`;
      await this.sumarVentas(tx, orderId);
    });"""

# ── 3. El método que suma ────────────────────────────────────────────────────
A3 = """  /** Aviso en el chat comprador\u2194tienda (o con el comprador, si avisa el vendedor). */
  private async notify(o: any, autorId: string, texto: string) {"""

N3 = """  /**
   * SUMA LAS VENTAS DE UN PEDIDO ENTREGADO (punto 2 de la acción inmediata).
   *
   * Una sola consulta, por producto, con la cantidad total de cada línea. Se apoya en `order_items`
   * (la foto del momento de la compra), así que si el producto se renombra o cambia de precio la
   * cuenta sigue siendo la de lo que se vendió.
   */
  private async sumarVentas(tx: any, orderId: string) {
    await tx.$executeRaw`
      UPDATE lifebook.products p
         SET sales_count = COALESCE(p.sales_count, 0) + i.qty,
             updated_at = now()
        FROM (SELECT product_id, SUM(quantity)::int AS qty
                FROM lifebook.order_items
               WHERE order_id = ${orderId}::uuid AND product_id IS NOT NULL
               GROUP BY product_id) i
       WHERE p.id = i.product_id`;
  }

  /** Aviso en el chat comprador\u2194tienda (o con el comprador, si avisa el vendedor). */
  private async notify(o: any, autorId: string, texto: string) {"""

PIEZAS = [(A1, N1), (A2, N2), (A3, N3)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'sumarVentas' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n} → ' + viejo.strip().splitlines()[0][:70])
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
    print('escrito orders.service.ts (las ventas se suman al entregar, en las dos vías)')
    return 0


sys.exit(main())
