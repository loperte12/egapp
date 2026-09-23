# =============================================================================
# parche86 — UN CUPÓN QUE TODAVÍA NO EMPIEZA NO SE PUEDE RECOGER (punto 14 de la §3)
#
# QUÉ PASA HOY: `claimCoupon` (commerce.service.ts) comprueba que el cupón esté activo, que no haya
# caducado y que no esté agotado… pero **no mira `starts_at`**. Así que un cupón de una promoción que
# empieza la semana que viene se puede **recoger hoy**: se guarda en la cuenta del comprador, y al ir a
# pagar salta `COUPON_NOT_STARTED` con **otro** mensaje y sin decir cuándo vale. El comprador cree que
# tiene un cupón y no lo tiene.
#
# QUÉ HACE ESTE PARCHE: la misma comprobación que ya hace el pago (`resolverCupon`), en el momento de
# recogerlo, y **diciendo la fecha**: «Ese cupón todavía no se puede usar: empieza el …».
#
# Es el mismo error (`COUPON_NOT_STARTED`) que devuelve el pago, para que la app no tenga que aprender
# dos códigos distintos para lo mismo.
#
# Uso en el servidor:  python3 /root/parche86-cupon-que-no-empieza.py
# =============================================================================
import shutil
import sys

SELLO = 'cupon-que-no-empieza-20260215'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

ANCLA = """    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
      throw new DomainError('COUPON_EXPIRED', 'Ese cupón ha caducado');
    }"""

NUEVO = """    /**
     * PUNTO 14 DE LA ACCIÓN INMEDIATA: un cupón que TODAVÍA NO EMPIEZA no se recoge.
     *
     * Antes se recogía igual (no se miraba `starts_at`) y el fallo aparecía al pagar, con otro mensaje
     * y sin decir cuándo vale: el comprador creía tener un cupón que no tenía. Ahora se corta al
     * recogerlo, con el mismo código que usa el pago (`COUPON_NOT_STARTED`) y con la fecha dentro.
     */
    if (c.starts_at && new Date(c.starts_at).getTime() > Date.now()) {
      const cuando = new Date(c.starts_at).toLocaleDateString('es-ES');
      throw new DomainError('COUPON_NOT_STARTED', `Ese cupón todavía no se puede usar: empieza el ${cuando}`);
    }
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
      throw new DomainError('COUPON_EXPIRED', 'Ese cupón ha caducado');
    }"""


def main():
    src = open(P, encoding='utf-8').read()
    if 'COUPON_NOT_STARTED' in src:
        print('PARECE YA APLICADO (o ya existía en este fichero): no se toca nada.')
        return 1
    if src.count(ANCLA) != 1:
        print(f'FALLO: el anclaje no cuadra ({src.count(ANCLA)} apariciones). NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(ANCLA, NUEVO))
    print('escrito commerce.service.ts (recoger un cupón comprueba su fecha de inicio)')
    return 0


sys.exit(main())
