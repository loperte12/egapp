# =============================================================================
# parche89b — CORRECCIÓN: `lifebook.orders` no tiene `currency`
#
# QUÉ PASÓ: la pieza de cobro (parche89) pedía `o.currency` en la consulta del pedido… y esa columna
# **no existe** en `lifebook.orders`, así que **todos** los `POST /money/charge` devolvían
# HTTP 500 INTERNAL_ERROR (8 comprobaciones en rojo en la prueba). La moneda del comercio es XAF y ya
# está escrita en todas partes (`lbXaf` en la app, `total_xaf` en la base): no hace falta leerla.
#
# Uso en el servidor:  python3 /root/parche89b-moneda.py
# =============================================================================
import shutil
import sys

SELLO = 'moneda-del-pedido-20260215'
P = '/opt/mirror/app/src/lifebook/payments.service.ts'

ANCLA = """      SELECT o.id, o.order_no, o.total_xaf, o.currency, o.buyer_id, o.status, o.payment_status
        FROM lifebook.orders o WHERE o.id = ${orderId}::uuid LIMIT 1`;"""

NUEVO = """      SELECT o.id, o.order_no, o.total_xaf, o.buyer_id, o.status, o.payment_status
        FROM lifebook.orders o WHERE o.id = ${orderId}::uuid LIMIT 1`;"""

ANCLA_MONEDA = """      currency: String(o.currency ?? 'XAF'),"""
NUEVO_MONEDA = """      // El comercio es XAF y está en todas partes (`total_xaf`, `lbXaf`): `orders` no tiene columna de
      // moneda, y pedirla reventaba la consulta (HTTP 500 en todos los cobros). No se inventa.
      currency: 'XAF',"""


def main():
    src = open(P, encoding='utf-8').read()
    if "currency: 'XAF'," in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    piezas = [(ANCLA, NUEVO), (ANCLA_MONEDA, NUEVO_MONEDA)]
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
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    for viejo, nuevo in piezas:
        src = src.replace(viejo, nuevo)
    open(P, 'w', encoding='utf-8', newline='').write(src)
    print('escrito payments.service.ts (sin la columna que no existe)')
    return 0


sys.exit(main())
