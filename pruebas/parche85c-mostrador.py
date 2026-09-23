# =============================================================================
# parche85c — EL NÚMERO DE PEDIDO SE APARTA CON UN MOSTRADOR (corrección del intento 2)
#
# LO QUE PASÓ, con el log delante:
#   1er intento (`parche85`): `pg_advisory_xact_lock` dentro de la transacción → Prisma no sabe leer el
#      `void` que devuelve el candado → **8 de 8 compras con HTTP 500** (P2010, «Failed to deserialize
#      column of type 'void'»).
#   2º intento (`parche85b`): el candado convertido a texto → **6 de 8 con HTTP 500** (P2028,
#      «Transaction already closed … timeout … 5000 ms»), porque el candado se queda sujeto hasta el
#      commit y las compras simultáneas se ponen EN FILA durante toda la creación del pedido.
#
# LO QUE HACE AHORA: el número se aparta en una **transacción corta** (una sola frase atómica) contra el
# mostrador `lifebook.order_counters`, y **fuera** de la transacción del pedido:
#
#     INSERT INTO lifebook.order_counters (day, ultimo) VALUES (día, 1)
#     ON CONFLICT (day) DO UPDATE SET ultimo = order_counters.ultimo + 1
#     RETURNING ultimo
#
#   · es atómico (la fila se bloquea microsegundos, no la transacción entera),
#   · el número queda **escrito**, así que el siguiente lo ve,
#   · y si el pedido fallara después, ese número se pierde y el siguiente continúa (un hueco es normal;
#     un número repetido, no).
#
# Uso en el servidor:  python3 /root/parche85c-mostrador.py
# =============================================================================
import shutil
import sys

SELLO = 'mostrador-numeros-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

# ── 1. La firma (ya no recibe la transacción: usa la suya) ───────────────────
A_FIRMA = """  private async nextOrderNo(tx: any): Promise<string> {"""
N_FIRMA = """  private async nextOrderNo(): Promise<string> {"""

# ── 2. La explicación, que ya no habla de candados ───────────────────────────
A_EXPLICA = """   * Ahora:
   *   · un **candado por día** (`pg_advisory_xact_lock`) serializa solo este cálculo —milisegundos— y
   *     dos compras del mismo día se ponen en fila para coger número; las de días distintos no se
   *     estorban, porque el candado es distinto;
   *   · y el número sale del **más alto que ya existe + 1**, no del recuento: si algún día se borra un
   *     pedido, contar daría un número ya usado.
   */"""

N_EXPLICA = """   * Ahora el número se aparta contra un **mostrador por día** (`lifebook.order_counters`) con una sola
   * frase atómica, en su PROPIA transacción corta y ANTES de abrir la del pedido:
   *   · atómica: la fila del mostrador se bloquea microsegundos, no la creación entera del pedido. Dos
   *     intentos anteriores (un candado dentro de la transacción) se quedaban con el candado hasta el
   *     commit, las compras simultáneas se ponían en fila durante toda la creación y Prisma cortaba por
   *     tiempo (>5 s): el comprador veía un error;
   *   · y el número queda ESCRITO: el siguiente lo ve. (Con un candado y dos transacciones cortas, las
   *     dos habrían leído el mismo `max`.)
   * Si el pedido fallara después de apartar el número, ese número se pierde y el siguiente continúa: un
   * hueco en la numeración es normal; un número repetido, no.
   */"""

# ── 3. El cuerpo: el mostrador en lugar del candado ─────────────────────────
A_CUERPO = """    // El candado se suelta solo al terminar la transacción (xact): no hay que acordarse de nada.
    // `::text` NO es decorativo: `pg_advisory_xact_lock` devuelve `void` y Prisma no sabe convertir
    // ese tipo (falla con «Failed to deserialize column of type 'void'») — con el candado se caían las
    // 8 compras simultáneas de la prueba. Convertido a texto, el candado hace lo mismo y no estorba.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'lb-orderno-' + day}))::text`;
    const rows: any[] = await tx.$queryRaw`
      SELECT coalesce(max(substring(order_no from '[0-9]+$')::int), 0) AS ultimo
        FROM lifebook.orders WHERE order_no LIKE ${prefijo + '%'}`;
    const n = Number(rows[0]?.ultimo ?? 0) + 1;
    return `${prefijo}${String(n).padStart(4, '0')}`;"""

N_CUERPO = """    // Una sola frase: atómica y con el número ya escrito. El `coalesce(...)` de la primera vez cuenta lo
    // que ya existe ese día, para no chocar con los pedidos anteriores (el índice es único).
    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.order_counters (day, ultimo)
      VALUES (${day}, coalesce((SELECT max(substring(order_no from '[0-9]+$')::int)
                                  FROM lifebook.orders WHERE order_no LIKE ${prefijo + '%'}), 0) + 1)
      ON CONFLICT (day) DO UPDATE SET ultimo = lifebook.order_counters.ultimo + 1, updated_at = now()
      RETURNING ultimo`;
    return `${prefijo}${String(Number(filas[0]?.ultimo ?? 1)).padStart(4, '0')}`;"""

# ── 4. El número se aparta ANTES de abrir la transacción ────────────────────
A_APARTAR = """    const created = await this.db.$transaction(async (tx: any) => {
      // 1) Reserva de la clave ANTES de tocar nada (idempotencia segura)"""

N_APARTAR = """    /**
     * EL NÚMERO SE APARTA AQUÍ, FUERA de la transacción del pedido.
     *
     * Esa es la clave de todo: si se aparta dentro, el bloqueo del mostrador se queda sujeto hasta el
     * commit y las compras simultáneas se ponen en fila durante toda la creación; Prisma corta por
     * tiempo (>5 s) y el comprador ve un error. Apartándolo antes, el bloqueo dura microsegundos.
     */
    const orderNoApartado = await this.nextOrderNo();

    const created = await this.db.$transaction(async (tx: any) => {
      // 1) Reserva de la clave ANTES de tocar nada (idempotencia segura)"""

# ── 5. Y se usa el que ya está apartado ─────────────────────────────────────
A_USO = """      // 4) Pedido + líneas
      const orderNo = await this.nextOrderNo(tx);"""

N_USO = """      // 4) Pedido + líneas (el número se apartó ANTES, en su transacción corta: ver `nextOrderNo`)
      const orderNo = orderNoApartado;"""

PIEZAS = [(A_FIRMA, N_FIRMA), (A_EXPLICA, N_EXPLICA), (A_CUERPO, N_CUERPO), (A_APARTAR, N_APARTAR), (A_USO, N_USO)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'order_counters' in src:
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
    print('escrito orders.service.ts (el número se aparta con el mostrador, antes de la transacción)')
    return 0


sys.exit(main())
