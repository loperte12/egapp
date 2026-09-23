# =============================================================================
# parche88 — IDEMPOTENCIA: LA HUELLA DEL CONTENIDO Y LA CLAVE CADUCADA
#            (punto 12 de la §3)
#
# QUÉ PASA HOY (dos cosas, las dos con consecuencia para el comprador):
#  1. **No se guarda nada del contenido.** Reutilizar la misma clave con OTRO pedido devuelve el pedido
#     anterior **en silencio**: el comprador cree haber comprado una cosa y ha comprado otra.
#  2. **Dentro de la transacción, la lectura de la clave no filtra la caducidad.** Una clave caducada
#     (hay 173 de 244 en la tabla) se trata como «pedido en curso» y el reintento legítimo se queda con
#     «Ese pedido ya se está creando, espera un momento»… para siempre.
#
# QUÉ HACE ESTE PARCHE:
#   · `huellaDePedido(dto)` — SHA-256 de los artículos, la entrega, el pago, la dirección y el cupón.
#     **La nota libre NO entra**: cambiar una coma en el texto no debe romper un reintento legítimo.
#   · La clave se reserva CON su huella. Si llega la misma clave:
#       – con el MISMO contenido y sin caducar → se devuelve el pedido de antes (replay, como debe ser);
#       – con contenido DISTINTO → `IDEMPOTENCY_KEY_REUSED` («Esa clave ya se usó para otro pedido»),
#         en vez de devolver el pedido viejo en silencio;
#       – **caducada** → se RECICLA (se limpia su respuesta y se sigue creando), en vez de quedarse
#         atascada para siempre. Las claves viejas sin huella (`NULL`) no se comparan: no hay con qué.
#   · El camino rápido (antes de abrir la transacción) compara la huella igual que el de dentro.
#
# Requiere la migración 85 (la columna). Se aplica después.
#
# Uso en el servidor:  python3 /root/parche88-idempotencia.py
# =============================================================================
import shutil
import sys

SELLO = 'idempotencia-huella-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

# ── 1. El import de `createHash` ─────────────────────────────────────────────
A_IMPORT = """import { randomInt, randomUUID } from 'node:crypto';"""
N_IMPORT = """import { createHash, randomInt, randomUUID } from 'node:crypto';"""

# ── 2. La huella, justo antes de crear ───────────────────────────────────────
A_HUELLA = """  // ───────────────────────────── CREAR ──────────────────────────────────────
  async createOrder(buyerId: string, dto: OrderInput, idemKey: string) {"""

N_HUELLA = """  /**
   * LA HUELLA DEL PEDIDO QUE SE ESTÁ PIDIENDO (punto 12 de la acción inmediata).
   *
   * La clave de idempotencia protege del doble toque… pero solo sirve si el contenido es el mismo. Antes
   * no se guardaba nada del contenido: reutilizar la clave con OTRO pedido devolvía el pedido anterior
   * **en silencio**, así que el comprador creía haber comprado una cosa y había comprado otra. Esta
   * huella (artículos, entrega, pago, dirección y cupón) es lo que permite detectarlo.
   *
   * NO entra la nota libre a propósito: cambiar una coma en el texto no debe romper un reintento.
   */
  private huellaDePedido(dto: OrderInput): string {
    const items = (Array.isArray(dto.items) ? dto.items : [])
      .map((i) => `${i.productId ?? ''}:${i.variantId ?? ''}x${Number(i.quantity) || 0}`)
      .sort();
    const a = (dto.deliveryAddress ?? {}) as Record<string, unknown>;
    const contenido = JSON.stringify({
      items,
      deliveryMode: String(dto.deliveryMode ?? '').trim().toLowerCase(),
      paymentMethod: String(dto.paymentMethod ?? '').trim().toLowerCase(),
      address: [a.city ?? '', a.zone ?? '', a.reference ?? ''].map((v) => String(v).trim()),
      couponCode: String(dto.couponCode ?? '').trim().toUpperCase(),
    });
    return createHash('sha256').update(contenido).digest('hex');
  }

  // ───────────────────────────── CREAR ──────────────────────────────────────
  async createOrder(buyerId: string, dto: OrderInput, idemKey: string) {"""

# ── 3. El camino rápido, con huella ──────────────────────────────────────────
A_RAPIDO = """    const prev: any[] = await this.db.$queryRaw`
      SELECT response FROM lifebook.idempotency_keys
       WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}
         AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`;
    if (prev[0]?.response) return prev[0].response;"""

N_RAPIDO = """    const huella = this.huellaDePedido(dto);
    const prev: any[] = await this.db.$queryRaw`
      SELECT response, request_hash FROM lifebook.idempotency_keys
       WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}
         AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`;
    if (prev[0]?.response) {
      // Misma clave y contenido DISTINTO: no se devuelve el pedido viejo en silencio.
      if (prev[0].request_hash && prev[0].request_hash !== huella) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó para otro pedido: manda una clave nueva');
      }
      return prev[0].response;
    }"""

# ── 4. La reserva dentro de la transacción ───────────────────────────────────
A_RESERVA = """      const reservado: number = await tx.$executeRaw`
        INSERT INTO lifebook.idempotency_keys (user_id, endpoint, key)
        VALUES (${buyerId}::uuid, 'createOrder', ${key})
        ON CONFLICT (user_id, endpoint, key) DO NOTHING`;
      if (!reservado) {
        const cur: any[] = await tx.$queryRaw`
          SELECT response FROM lifebook.idempotency_keys
           WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key} LIMIT 1`;
        if (cur[0]?.response) return { replayed: cur[0].response };
        throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'Ese pedido ya se está creando, espera un momento');
      }"""

N_RESERVA = """      const reservado: number = await tx.$executeRaw`
        INSERT INTO lifebook.idempotency_keys (user_id, endpoint, key, request_hash)
        VALUES (${buyerId}::uuid, 'createOrder', ${key}, ${huella})
        ON CONFLICT (user_id, endpoint, key) DO NOTHING`;
      if (!reservado) {
        /**
         * La clave YA existía. Tres casos, y hay que distinguirlos (punto 12 de la acción inmediata):
         *   · misma clave, mismo contenido y sin caducar → se devuelve el pedido de antes (replay);
         *   · misma clave, contenido DISTINTO → se corta: reutilizar la clave con otro pedido devolvía
         *     el pedido anterior en silencio y el comprador creía haber comprado otra cosa;
         *   · caducada → se RECICLA y se sigue. Antes se contestaba «ese pedido ya se está creando» y
         *     el reintento legítimo se quedaba atascado para siempre.
         */
        const cur: any[] = await tx.$queryRaw`
          SELECT response, request_hash,
                 (expires_at IS NOT NULL AND expires_at <= now()) AS caducada
            FROM lifebook.idempotency_keys
           WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key} LIMIT 1`;
        const fila = cur[0];
        if (fila?.response && !fila.caducada) {
          if (fila.request_hash && fila.request_hash !== huella) {
            throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó para otro pedido: manda una clave nueva');
          }
          return { replayed: fila.response };
        }
        const reciclada: number = await tx.$executeRaw`
          UPDATE lifebook.idempotency_keys
             SET request_hash = ${huella}, response = NULL, expires_at = NULL, created_at = now()
           WHERE user_id = ${buyerId}::uuid AND endpoint = 'createOrder' AND key = ${key}
             AND expires_at IS NOT NULL AND expires_at <= now()`;
        if (!reciclada) {
          throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'Ese pedido ya se está creando, espera un momento');
        }
      }"""

PIEZAS = [(A_IMPORT, N_IMPORT), (A_HUELLA, N_HUELLA), (A_RAPIDO, N_RAPIDO), (A_RESERVA, N_RESERVA)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'huellaDePedido' in src:
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
    print('escrito orders.service.ts (huella del contenido + reciclado de la clave caducada)')
    return 0


sys.exit(main())
