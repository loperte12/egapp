# =============================================================================
# parche78 — CANDADO POR INTENTOS EN EL CÓDIGO DE ENTREGA (punto 3 de la ACCIÓN INMEDIATA)
#
# QUÉ PASA HOY: `confirmDeliveryCode` compara el código y nada más. Cuatro dígitos son 10 000
# combinaciones y se pueden probar todas seguidas: la tienda podría marcar «entregado y cobrado» un
# pedido que el comprador nunca recibió. En contra entrega eso es quedarse con el dinero.
#
# QUÉ HACE ESTE PARCHE:
#   · Cada fallo cuenta (`delivery_code_attempts`). Al 5º fallo seguido, el pedido queda bloqueado
#     15 minutos (`delivery_code_locked_until`) y NO se admite ningún intento más, ni el correcto.
#     Así el que prueba a ciegas hace 5 intentos cada cuarto de hora: agotar las 10 000 combinaciones
#     le llevaría semanas, y el comprador se daría cuenta mucho antes.
#   · Entregar bien pone el contador a 0.
#
# El candado se comprueba ANTES de mirar el código, y por eso frena también al que acierta: es lo que
# lo hace servir de algo. Si se dejara pasar el código correcto durante el bloqueo, el que prueba a
# ciegas seguiría probando sin freno.
#
# Requiere la migración 78 (las dos columnas). Se aplica después.
#
# Uso en el servidor:  python3 /root/parche78-codigo-de-entrega.py
# =============================================================================
import shutil
import sys

SELLO = 'intentos-codigo-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'

A1 = """    if (!o.delivery_code) throw new DomainError('DELIVERY_CODE_NOT_APPLICABLE', 'Este pedido no se paga al recibir');
    if (String(code ?? '').trim() !== String(o.delivery_code)) {
      throw new DomainError('DELIVERY_CODE_INVALID', 'El código no coincide con el del comprador');
    }
    if (o.status === 'delivered') throw new DomainError('INVALID_STATE_TRANSITION', 'Ese pedido ya está entregado');"""

N1 = """    if (!o.delivery_code) throw new DomainError('DELIVERY_CODE_NOT_APPLICABLE', 'Este pedido no se paga al recibir');
    if (o.status === 'delivered') throw new DomainError('INVALID_STATE_TRANSITION', 'Ese pedido ya está entregado');
    /**
     * CANDADO POR INTENTOS (punto 3 de la acción inmediata).
     *
     * 4 dígitos son 10 000 combinaciones y antes se podían probar todas seguidas. Con esto, el que
     * prueba a ciegas hace 5 intentos y se queda 15 minutos fuera: agotar el código le llevaría
     * semanas. El bloqueo se mira ANTES que el código, así que también frena al que acierta — si no,
     * el que prueba a ciegas seguiría probando sin freno y el candado no serviría de nada.
     * El mensaje no promete ninguna función que no exista: el código se lo sigue dando el comprador.
     */
    const intentos = Number(o.delivery_code_attempts ?? 0) || 0;
    if (o.delivery_code_locked_until && new Date(o.delivery_code_locked_until).getTime() > Date.now()) {
      throw new DomainError(
        'DELIVERY_CODE_LOCKED',
        'Demasiados intentos fallidos con ese código. Espera unos minutos y vuelve a probar con el que te dé el comprador',
      );
    }
    if (String(code ?? '').trim() !== String(o.delivery_code)) {
      const fallos = intentos + 1;
      await this.db.$executeRaw`
        UPDATE lifebook.orders
           SET delivery_code_attempts = ${fallos},
               delivery_code_locked_until = CASE WHEN ${fallos} >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
               updated_at = now()
         WHERE id = ${orderId}::uuid`;
      throw new DomainError('DELIVERY_CODE_INVALID', 'El código no coincide con el del comprador');
    }"""

A2 = """      const entregado: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
               delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now()
         WHERE id = ${orderId}::uuid AND status <> 'delivered'`;"""

N2 = """      const entregado: number = await tx.$executeRaw`
        UPDATE lifebook.orders SET status = 'delivered', payment_status = 'paid',
               delivery_confirmed_at = now(), delivered_at = now(), paid_at = now(), updated_at = now(),
               delivery_code_attempts = 0, delivery_code_locked_until = NULL
         WHERE id = ${orderId}::uuid AND status <> 'delivered'`;"""

PIEZAS = [(A1, N1), (A2, N2)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'DELIVERY_CODE_LOCKED' in src:
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
    print('escrito orders.service.ts (5 fallos seguidos → 15 minutos sin admitir intentos)')
    return 0


sys.exit(main())
