# =============================================================================
# parche82 — EL MOTIVO DE LA RECLAMACIÓN (segunda mitad del punto 7 de la §3)
#
# QUÉ PASA HOY: `dispute` cambia el pedido a `disputed` y **no guarda por qué**. La tienda ve «Pedido en
# reclamación» sin saber qué se le reclama, y el comprador tampoco puede explicarse. Con dinero de por
# medio, una reclamación sin motivo no se puede atender.
#
# QUÉ HACE ESTE PARCHE:
#   · La acción `dispute` exige un **motivo de al menos 10 caracteres** (si no, `DISPUTE_REASON_REQUIRED`).
#   · Se guarda el motivo y **cuándo** (`dispute_reason`, `disputed_at`) — la fecha es lo que hará falta
#     para la ventana de garantía del patrón de Ecomerse.
#   · El aviso del chat lleva el motivo («El comprador abrió una reclamación: “…”»), que es justo lo que
#     la tienda necesita leer sin abrir nada más.
#   · `orderDetail` devuelve `disputeReason` y `disputedAt` a las DOS partes: el comprador ve lo que
#     escribió y la tienda lo que se le reclama.
#
# Requiere la migración 81 (dos columnas). Se aplica después.
#
# Uso en el servidor:  python3 /root/parche82-motivo-reclamacion.py
# =============================================================================
import shutil
import sys

SELLO = 'motivo-reclamacion-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'
C = '/opt/mirror/app/src/lifebook/orders.controller.ts'

# ── 1. La firma y las comprobaciones de la acción ────────────────────────────
ANCLA_FIRMA = """  async orderAction(userId: string, orderIdRaw: string, action: string) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const a = String(action ?? '').trim().toLowerCase();
    const cfg = ACTIONS[a];
    if (!cfg) throw new DomainError('ACTION_INVALID', 'Acción no válida');"""

NUEVA_FIRMA = """  async orderAction(userId: string, orderIdRaw: string, action: string, reasonRaw?: unknown) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const a = String(action ?? '').trim().toLowerCase();
    const cfg = ACTIONS[a];
    if (!cfg) throw new DomainError('ACTION_INVALID', 'Acción no válida');
    /**
     * EL MOTIVO DE LA RECLAMACIÓN (punto 7 de la acción inmediata).
     *
     * Antes `dispute` cambiaba el estado y no guardaba nada: la tienda veía «Pedido en reclamación» sin
     * saber qué se le reclamaba, y el comprador no podía explicarse. Se exige un motivo con un mínimo
     * (10 caracteres) porque «no me llegó» o «está roto» son lo mínimo que hace falta para poder
     * contestar; el motivo se recorta a 500 caracteres.
     */
    let motivo: string | null = null;
    if (a === 'dispute') {
      motivo = String(reasonRaw ?? '').trim();
      if (motivo.length < 10) {
        throw new DomainError('DISPUTE_REASON_REQUIRED', 'Cuéntanos qué ha pasado (al menos 10 letras)');
      }
      motivo = motivo.slice(0, 500);
    }"""

# ── 2. Guardar el motivo en el mismo UPDATE del estado ───────────────────────
ANCLA_UPDATE = """          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method IN ('cash_on_delivery','in_store') THEN 'paid' ELSE payment_status END
         WHERE id = ${orderId}::uuid AND status = ${o.status}`;"""

NUEVO_UPDATE = """          payment_status = CASE WHEN ${cfg.to} = 'delivered' AND payment_method IN ('cash_on_delivery','in_store') THEN 'paid' ELSE payment_status END,
          dispute_reason = CASE WHEN ${motivo}::text IS NULL THEN dispute_reason ELSE ${motivo} END,
          disputed_at = CASE WHEN ${motivo}::text IS NULL THEN disputed_at ELSE now() END
         WHERE id = ${orderId}::uuid AND status = ${o.status}`;"""

# ── 3. El aviso del chat, con el motivo ──────────────────────────────────────
ANCLA_AVISO = """    const aviso = {"""

NUEVO_AVISO = """    // Con motivo (reclamación), el aviso lo lleva: es lo que la tienda necesita leer.
    if (a === 'dispute' && motivo) {
      await this.notify(o, userId, `El comprador abrió una reclamación: «${motivo}»`);
      return this.orderDetail(orderId, userId);
    }
    const aviso = {"""

# ── 4. El motivo en el detalle ───────────────────────────────────────────────
# OJO: `note: o.message,` aparece DOS veces (en el detalle y en la lista de «mis pedidos»): el anclaje
# tiene que llevar la línea siguiente del detalle, o el parche se niega a escribir (y hace bien).
ANCLA_DETALLE = """        note: o.message,
        items: items.map((i) => ({"""

NUEVO_DETALLE = """        note: o.message,
        /** La reclamación, con su motivo y su fecha (lo ven las dos partes). */
        disputeReason: o.dispute_reason ? String(o.dispute_reason) : null,
        disputedAt: o.disputed_at ?? null,
        items: items.map((i) => ({"""

# ── 5. El controlador pasa el motivo ─────────────────────────────────────────
ANCLA_CTRL = """  action(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.orderAction(u.userId, id, body?.action);
  }"""

NUEVO_CTRL = """  action(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.orderAction(u.userId, id, body?.action, body?.reason);
  }"""


def aplicar(ruta, piezas):
    src = open(ruta, encoding='utf-8').read()
    problemas = []
    for viejo, _ in piezas:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'{ruta}: esperaba 1 aparición y hay {n} → ' + viejo.strip().splitlines()[0][:60])
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return False
    shutil.copyfile(ruta, f'{ruta}.bak-{SELLO}')
    print(f'respaldo: {ruta}.bak-{SELLO}')
    for viejo, nuevo in piezas:
        src = src.replace(viejo, nuevo)
    open(ruta, 'w', encoding='utf-8', newline='').write(src)
    return True


def main():
    if 'DISPUTE_REASON_REQUIRED' in open(P, encoding='utf-8').read():
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    piezas = [(ANCLA_FIRMA, NUEVA_FIRMA), (ANCLA_UPDATE, NUEVO_UPDATE), (ANCLA_AVISO, NUEVO_AVISO), (ANCLA_DETALLE, NUEVO_DETALLE)]
    if not aplicar(P, piezas):
        return 1
    if not aplicar(C, [(ANCLA_CTRL, NUEVO_CTRL)]):
        print('OJO: el servicio SÍ se escribió y el controlador NO. Revisar a mano.')
        return 1
    print('escrito orders.service.ts (motivo obligatorio + aviso con el motivo + detalle) y orders.controller.ts')
    return 0


sys.exit(main())
