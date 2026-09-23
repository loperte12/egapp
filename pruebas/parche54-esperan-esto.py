# =============================================================================
# parche54 — «N personas esperan esto»: el dato que faltaba para el comerciante
#
# POR QUÉ
# El aviso de reposición ya apunta quién espera un producto (`lifebook.product_interest`), pero el
# dato solo servía para avisar. El comerciante no puede verlo: no sabe si reponer una talla merece
# la pena. Es el mismo dato, puesto delante de quien decide.
#
# QUÉ AÑADE (servidor)
#   · `myProducts` (panel de la tienda) devuelve `waitingCount` por producto: cuánta gente espera
#     stock AHORA (esperas sin avisar todavía).
#   · `product()` lo devuelve también, pero **solo para el dueño** (`isMine`): al comprador no se le
#     enseña cuántos más están esperando (es información de la tienda, no un contador público que
#     pueda inflarse a propósito).
#
# Uso en el servidor:  python3 /root/parche54-esperan-esto.py
# =============================================================================
import shutil
import sys

SELLO = 'esperan-esto-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'

fallos = []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def aplicar(src, edits):
    for nombre, viejo, nuevo, veces in edits:
        n = src.count(viejo)
        if n != veces:
            fallos.append(f'[{nombre}]: esperaba {veces} apariciones y hay {n}')
            continue
        src = src.replace(viejo, nuevo)
        print(f'  ok · {nombre} ({n})')
    return src


EDITS = [
    (
        'contar esperas en myProducts',
        """             p.views_count, p.saves_count, p.sales_count, p.shop_id,
             (SELECT count(*)::int FROM lifebook.product_variants v WHERE v.product_id = p.id) AS variants,
               p.short_description, p.currency""",
        """             p.views_count, p.saves_count, p.sales_count, p.shop_id,
             (SELECT count(*)::int FROM lifebook.product_variants v WHERE v.product_id = p.id) AS variants,
               p.short_description, p.currency,
             /* Tanda H: cuánta gente espera stock AHORA (esperas sin avisar todavía). */
             (SELECT count(*)::int FROM lifebook.product_interest i
               WHERE i.product_id = p.id AND i.notified_at IS NULL) AS waiting_count""",
        1,
    ),
    (
        'devolverlo en la lista',
        """        viewsCount: Number(p.views_count ?? 0),
        savesCount: Number(p.saves_count ?? 0),
        salesCount: Number(p.sales_count ?? 0),""",
        """        viewsCount: Number(p.views_count ?? 0),
        savesCount: Number(p.saves_count ?? 0),
        salesCount: Number(p.sales_count ?? 0),
        /** Cuánta gente está esperando que vuelva a haber stock. */
        waitingCount: Number(p.waiting_count ?? 0),""",
        1,
    ),
    (
        'contar esperas para el dueño en la ficha',
        """    const watchRows: any[] = viewerId
      ? await db.$queryRaw`
          SELECT 1 FROM lifebook.product_interest
           WHERE product_id = ${pid}::uuid AND user_id = ${viewerId}::uuid AND notified_at IS NULL LIMIT 1`
      : [];""",
        """    const watchRows: any[] = viewerId
      ? await db.$queryRaw`
          SELECT 1 FROM lifebook.product_interest
           WHERE product_id = ${pid}::uuid AND user_id = ${viewerId}::uuid AND notified_at IS NULL LIMIT 1`
      : [];
    // Cuánta gente espera stock: SOLO se lo decimos al dueño. Al comprador no se le enseña (es
    // información de la tienda, y un contador público se puede inflar a propósito).
    const esperanRows: any[] = isMine
      ? await db.$queryRaw`
          SELECT count(*)::int AS n FROM lifebook.product_interest
           WHERE product_id = ${pid}::uuid AND notified_at IS NULL`
      : [];""",
        1,
    ),
    (
        'pasarlo al shape',
        """        /** MERCADO (tanda G): `true` si esta persona pidió que se le avise al reponer. */
        watching: !!watchRows[0],""",
        """        /** MERCADO (tanda G): `true` si esta persona pidió que se le avise al reponer. */
        watching: !!watchRows[0],
        /** MERCADO (tanda H): cuántas personas esperan stock (solo para el dueño). */
        waitingCount: isMine ? Number(esperanRows[0]?.n ?? 0) : undefined,""",
        1,
    ),
    (
        'publicarlo en productShape',
        """      /** `true` si espero stock: la ficha lo enseña («Te avisamos»). */
      watching: !!extra.watching,""",
        """      /** `true` si espero stock: la ficha lo enseña («Te avisamos»). */
      watching: !!extra.watching,
      /** Cuántas personas esperan stock (solo llega al dueño; al comprador, `undefined`). */
      waitingCount: extra.waitingCount === undefined ? undefined : Number(extra.waitingCount),""",
        1,
    ),
]


def main():
    src = leer(SVC)
    if 'waitingCount' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    src = aplicar(src, EDITS)
    if fallos:
        print('\nNO SE ESCRIBE NADA. Fallos:')
        for f in fallos:
            print(' -', f)
        return 1
    shutil.copyfile(SVC, f'{SVC}.bak-{SELLO}')
    print(f'respaldo: {SVC}.bak-{SELLO}')
    open(SVC, 'w', encoding='utf-8', newline='').write(src)
    print('escrito commerce.service.ts')
    return 0


sys.exit(main())
