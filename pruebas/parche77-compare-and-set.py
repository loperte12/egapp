# =============================================================================
# parche77 — COMPARE-AND-SET DEL ESTADO DEL PEDIDO (punto 4 de la ACCIÓN INMEDIATA)
#
# QUÉ PASA HOY: `orderAction` LEE el estado del pedido, valida la transición y luego hace
# `UPDATE … WHERE id = …` **sin mirar el estado**. Si entre la lectura y el UPDATE otro cambio entra
# (cancelar y entregar a la vez, o dos toques rápidos), los dos pasan y el pedido acaba en un estado
# que no se corresponde con lo que hizo nadie. Con dinero de por medio, esto no se puede dejar así.
#
# QUÉ HACE ESTE PARCHE: el UPDATE lleva la condición de que el estado siga siendo EL QUE SE LEYÓ
# (`AND status = ${o.status}`). Si no lo es, no actualiza ninguna fila y se corta con un error claro
# («el pedido cambió mientras lo mirabas»), en vez de pisar el cambio del otro.
#
# Lo mismo en `confirmDeliveryCode`: la confirmación del código no puede entregar un pedido que ya no
# está donde se leyó (p. ej. cancelado entre medias).
#
# Uso en el servidor:  python3 /root/parche77-compare-and-set.py
# =============================================================================
import shutil
import sys

SELLO = 'compare-and-set-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

# ── 1. El cambio de estado del panel (aceptar/preparar/enviar/listo/entregar/cancelar/reclamar) ──
A1 = """    await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`
        UPDATE lifebook.orders SET status = ${cfg.to}, updated_at = now(),
          delivered_at = CASE WHEN ${cfg.to} = 'delivered' THEN now() ELSE delivered_at END,
          paid_at = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN now() ELSE paid_at END,
          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN 'paid' ELSE payment_status END
         WHERE id = ${orderId}::uuid`;"""

N1 = """    await this.db.$transaction(async (tx: any) => {
      /**
       * COMPARE-AND-SET (punto 4 de la acción inmediata).
       *
       * El estado que se leyó arriba (`o.status`) va TAMBIÉN en el `WHERE`: si entre la lectura y este
       * UPDATE otro ha cambiado el pedido (cancelar y entregar a la vez, dos toques seguidos), no se
       * actualiza ninguna fila y se corta con un error claro, en vez de pisar el cambio del otro.
       */
      const filas: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = ${cfg.to}, updated_at = now(),
          delivered_at = CASE WHEN ${cfg.to} = 'delivered' THEN now() ELSE delivered_at END,
          paid_at = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN now() ELSE paid_at END,
          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN 'paid' ELSE payment_status END
         WHERE id = ${orderId}::uuid AND status = ${o.status}`;
      if (!filas) {
        throw new DomainError('ORDER_CHANGED', 'El pedido cambió mientras lo mirabas: vuelve a abrirlo');
      }"""

# ── 2. La entrega confirmando el código de contra entrega ────────────────────
A2 = """      await tx.$executeRaw`
        UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
               delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now()
         WHERE id = ${orderId}::uuid`;
      await this.sumarVentas(tx, orderId);"""

N2 = """      // Y aquí lo mismo: solo se entrega si sigue SIN estar entregado.
      const entregado: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
               delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now()
         WHERE id = ${orderId}::uuid AND status <> 'delivered'`;
      if (!entregado) {
        throw new DomainError('ORDER_CHANGED', 'Ese pedido ya no está pendiente de entrega: vuelve a abrirlo');
      }
      await this.sumarVentas(tx, orderId);"""

PIEZAS = [(A1, N1), (A2, N2)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'ORDER_CHANGED' in src:
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
    print('escrito orders.service.ts (el estado va en el WHERE: un cambio no pisa a otro)')
    return 0


sys.exit(main())
