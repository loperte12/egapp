# =============================================================================
# parche79 — CERRAR EL PAGO AL ENTREGAR (punto 5 de la ACCIÓN INMEDIATA)
#
# QUÉ PASA HOY: solo el efectivo contra entrega pone `payment_status = 'paid'`. Un pedido pagado EN
# TIENDA queda `pending` para siempre aunque la tienda ya tenga el dinero — medido: LB-260915-0009 y
# LB-260915-0015, entregados y sin cobrar (y `paid_at` a NULL). El vendedor no ve su caja y ninguna
# comisión es verificable.
#
# QUÉ HACE ESTE PARCHE: los métodos que SE PAGAN AL RECOGER —contra entrega y pago en tienda— se dan
# por cobrados al entregar. El resto (transferencia, facturación, depósito, monedero) NO se toca aquí,
# porque puede no estar cobrado todavía: eso lo marcará la tienda a mano con su justificante.
#
# Esa es la decisión del dueño (15/09/2026), elegida entre las tres que se le plantearon en
# docs/TANDA-R-ORDEN-Y-DINERO.md. Lo que queda pendiente de esa decisión es el botón de «marcar
# cobrado con justificante» para los otros métodos: NO existe todavía.
#
# Uso en el servidor:  python3 /root/parche79-cerrar-el-pago.py
# =============================================================================
import shutil
import sys

SELLO = 'cerrar-el-pago-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

A1 = """      const filas: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = ${cfg.to}, updated_at = now(),
          delivered_at = CASE WHEN ${cfg.to} = 'delivered' THEN now() ELSE delivered_at END,
          paid_at = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN now() ELSE paid_at END,
          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method = 'cash_on_delivery' THEN 'paid' ELSE payment_status END
         WHERE id = ${orderId}::uuid AND status = ${o.status}`;"""

N1 = """      /**
       * CERRAR EL PAGO AL ENTREGAR (punto 5 de la acción inmediata; decisión del dueño, 15/09/2026).
       *
       * Antes solo el efectivo contra entrega ponía `paid`: un pedido pagado en tienda se quedaba
       * `pending` para siempre aunque la tienda ya tuviera el dinero (medido en LB-260915-0009 y
       * LB-260915-0015: entregados, sin cobrar, con `paid_at` a NULL).
       *
       * Se dan por cobrados al entregar los métodos que se pagan al recoger: contra entrega y pago en
       * tienda. Los demás (transferencia, facturación, depósito, monedero) siguen como estaban: puede
       * que el dinero no esté cobrado, y darlo por cobrado sería inventarse un ingreso. Para esos
       * falta el botón de la tienda de marcar cobrado con justificante (todavía no existe).
       */
      const filas: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = ${cfg.to}, updated_at = now(),
          delivered_at = CASE WHEN ${cfg.to} = 'delivered' THEN now() ELSE delivered_at END,
          paid_at = CASE WHEN ${cfg.to} = 'delivered' AND payment_method IN ('cash_on_delivery','in_store') THEN now() ELSE paid_at END,
          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method IN ('cash_on_delivery','in_store') THEN 'paid' ELSE payment_status END
         WHERE id = ${orderId}::uuid AND status = ${o.status}`;"""


def main():
    src = open(P, encoding='utf-8').read()
    if "payment_method IN ('cash_on_delivery','in_store')" in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    if src.count(A1) != 1:
        print(f'FALLO: el anclaje no cuadra ({src.count(A1)} apariciones). NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(A1, N1))
    print('escrito orders.service.ts (entregar un pedido de contra entrega o de pago en tienda lo da por cobrado)')
    return 0


sys.exit(main())
