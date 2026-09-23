# =============================================================================
# parche90 — LAS DOS DECISIONES DEL DUEÑO (18/09/2026)
#
# ── DECISIÓN 1: EL JUSTIFICANTE ES OBLIGATORIO PARA TRANSFERENCIA Y FACTURACIÓN ──
# Un pedido marcado cobrado sin prueba es la palabra de la tienda contra la del comprador. A partir de
# ahora, si el método de pago es `transfer` o `billing`, `markPaid` **rechaza** el cobro sin justificante
# (`PAYMENT_PROOF_REQUIRED`). Contra entrega y pago en tienda NO se pide: allí el dinero se ve en mano
# (y además esos dos ya se cierran solos al entregar).
#
# ── DECISIÓN 2: LA VENTANA DE RECLAMACIÓN SON 7 DÍAS DESDE LA ENTREGA, EN EL SERVIDOR ──
#   · `dispute` se rechaza pasados 7 días desde `delivered_at` (`DISPUTE_WINDOW_CLOSED`). Se comprueba en
#     el SERVIDOR, no solo en la pantalla: una pantalla se puede saltar. Es la garantía que ya usa
#     Ecomerse en esta app.
#   · Y a la tienda NO se le paga antes de que esa ventana venza: el dinero que todavía se puede
#     reclamar se cuenta aparte (`enEsperaXaf`) y **no entra en lo que se liquida**. Si el comprador
#     todavía puede reclamar, ese dinero está en el aire.
#
# Uso en el servidor:  python3 /root/parche90-decisiones.py
# =============================================================================
import shutil
import sys

SELLO = 'decisiones-del-dueno-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

# ── 1. El justificante obligatorio ───────────────────────────────────────────
A_JUSTIF = """    const justificante = String(proofUrl ?? '').trim() || null;
    if (justificante && !/^https?:\\/\\//i.test(justificante)) {"""

N_JUSTIF = """    const justificante = String(proofUrl ?? '').trim() || null;
    /**
     * DECISIÓN DEL DUEÑO (18/09/2026): JUSTIFICANTE OBLIGATORIO para transferencia y facturación.
     *
     * Cobrar por transferencia sin la imagen del comprobante es la palabra de la tienda contra la del
     * comprador. Contra entrega y pago en tienda no se pide, porque allí el dinero se ve en mano (y esos
     * dos métodos ya quedan cobrados solos al entregar).
     */
    const metodo = String(o.payment_method ?? '');
    if ((metodo === 'transfer' || metodo === 'billing') && !justificante) {
      throw new DomainError(
        'PAYMENT_PROOF_REQUIRED',
        'Hace falta la imagen del comprobante para dar por cobrado un pago por transferencia o facturación',
      );
    }
    if (justificante && !/^https?:\\/\\//i.test(justificante)) {"""

# ── 2. La ventana de 7 días (la reclamación) ────────────────────────────────
A_VENTANA = """    if (!(FROM[a] ?? []).includes(o.status)) {
      throw new DomainError('INVALID_STATE_TRANSITION', `No se puede pasar de «${o.status}» con esa acción`);
    }"""

N_VENTANA = """    if (!(FROM[a] ?? []).includes(o.status)) {
      throw new DomainError('INVALID_STATE_TRANSITION', `No se puede pasar de «${o.status}» con esa acción`);
    }
    /**
     * DECISIÓN DEL DUEÑO (18/09/2026): la ventana para reclamar son **7 días desde la entrega**, y se
     * comprueba AQUÍ, en el servidor: una pantalla se puede saltar. Es la misma garantía que ya usa
     * Ecomerse en esta app.
     */
    if (a === 'dispute' && o.delivered_at) {
      const dias = (Date.now() - new Date(o.delivered_at).getTime()) / (24 * 60 * 60 * 1000);
      if (dias > 7) {
        throw new DomainError(
          'DISPUTE_WINDOW_CLOSED',
          'Ya han pasado los 7 días para reclamar ese pedido: habla con la tienda por el chat',
        );
      }
    }"""

# ── 3. A la tienda no se le paga antes de que la ventana venza ──────────────
A_PENDIENTE = """    const pendiente: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos, coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS importe
        FROM lifebook.order_fees f
       WHERE f.shop_id = ${shopId}::uuid
         AND (${desde}::timestamptz IS NULL OR f.computed_at > ${desde}::timestamptz)`;"""

N_PENDIENTE = """    /**
     * DECISIÓN DEL DUEÑO (18/09/2026): a la tienda **no se le paga antes de que venza la ventana de
     * reclamación** (7 días desde la entrega). Si el comprador todavía puede reclamar, ese dinero está en
     * el aire: se cuenta aparte (`enEsperaXaf`) y **no entra en lo que se liquida**.
     */
    const pendiente: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos, coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS importe
        FROM lifebook.order_fees f JOIN lifebook.orders o ON o.id = f.order_id
       WHERE f.shop_id = ${shopId}::uuid
         AND (${desde}::timestamptz IS NULL OR f.computed_at > ${desde}::timestamptz)
         AND o.delivered_at IS NOT NULL AND o.delivered_at <= now() - interval '7 days'`;
    const enEspera: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS pedidos, coalesce(sum(f.a_pagar_tienda_xaf), 0)::int AS importe
        FROM lifebook.order_fees f JOIN lifebook.orders o ON o.id = f.order_id
       WHERE f.shop_id = ${shopId}::uuid
         AND (${desde}::timestamptz IS NULL OR f.computed_at > ${desde}::timestamptz)
         AND (o.delivered_at IS NULL OR o.delivered_at > now() - interval '7 days')`;"""

A_DEVOLVER = """      pendienteXaf: Number(pendiente[0]?.importe ?? 0),
      pendientePedidos: Number(pendiente[0]?.pedidos ?? 0),"""

N_DEVOLVER = """      pendienteXaf: Number(pendiente[0]?.importe ?? 0),
      pendientePedidos: Number(pendiente[0]?.pedidos ?? 0),
      /** Lo que todavía NO se le puede pagar: la ventana de 7 días para reclamar no ha vencido. */
      enEsperaXaf: Number(enEspera[0]?.importe ?? 0),
      enEsperaPedidos: Number(enEspera[0]?.pedidos ?? 0),"""

# ── 4. Mensaje claro al intentar liquidar lo que está en espera ─────────────
A_LIQUIDAR = """    if (cuentas.pendienteXaf <= 0) {
      throw new DomainError('NOTHING_TO_SETTLE', 'Esa tienda no tiene nada pendiente de cobrar');
    }"""

N_LIQUIDAR = """    if (cuentas.pendienteXaf <= 0) {
      // Si lo único que hay es dinero «en espera», se dice por qué: la ventana de reclamación.
      if (cuentas.enEsperaXaf > 0) {
        throw new DomainError(
          'SETTLEMENT_WINDOW_OPEN',
          `Todavía no se le puede pagar: ${cuentas.enEsperaXaf} XAF esperan a que venzan los 7 días para reclamar`,
        );
      }
      throw new DomainError('NOTHING_TO_SETTLE', 'Esa tienda no tiene nada pendiente de cobrar');
    }"""

PIEZAS = [
    (A_JUSTIF, N_JUSTIF),
    (A_VENTANA, N_VENTANA),
    (A_PENDIENTE, N_PENDIENTE),
    (A_DEVOLVER, N_DEVOLVER),
    (A_LIQUIDAR, N_LIQUIDAR),
]


def main():
    src = open(P, encoding='utf-8').read()
    if 'PAYMENT_PROOF_REQUIRED' in src:
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
    print('escrito orders.service.ts (justificante obligatorio + ventana de 7 días + liquidación con espera)')
    return 0


sys.exit(main())
