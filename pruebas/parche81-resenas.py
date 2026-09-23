# =============================================================================
# parche81 — RESEÑAS DEL PEDIDO (punto 7 de la §3)
#
# QUÉ PASA HOY: `lifebook.products` y `lifebook.shops` tienen `rating` y `rating_count` y la app los
# enseña, pero **nadie los escribe**. Sin valoraciones, un desconocido no compra: es la prioridad 2 de
# §A.7 del documento de negocio.
#
# QUÉ HACE ESTE PARCHE:
#   · `POST /lifebook/commerce/orders/:id/review` con `{ rating, comment }`.
#   · Solo el COMPRADOR del pedido, y solo si está **entregado**.
#   · Una reseña por pedido (`UNIQUE (order_id)`): el doble toque no cuenta dos veces ni reescribe la
#     nota; si ya está valorado, se corta con un mensaje claro.
#   · La nota de 1 a 5 es obligatoria; el comentario es opcional y se recorta a 500 caracteres.
#   · Al guardarla se mueven la nota de la TIENDA y la de los PRODUCTOS del pedido, como **media
#     ponderada por `rating_count`** redondeada a 2 decimales (si una nota era 4 con 3 votos y entra un
#     5, queda 4,25; no se inventa una nota nueva).
#   · `orderDetail` devuelve `review`, para que el comprador vea lo que escribió y la tienda lo que le
#     han puesto: el rastro es de los dos.
#
# Requiere la migración 80 (la tabla). Se aplica después.
#
# Uso en el servidor:  python3 /root/parche81-resenas.py
# =============================================================================
import shutil
import sys

SELLO = 'resenas-del-pedido-20260215'
P = '/opt/mirror/app/src/lifebook/orders.service.ts'
C = '/opt/mirror/app/src/lifebook/orders.controller.ts'

# ── 1. El método, detrás de `markPaid` ───────────────────────────────────────
ANCLA_METODO = """    await this.notify(o, userId, 'La tienda ha marcado tu pedido como cobrado ✅');
    return this.orderDetail(orderId, userId);
  }
"""

NUEVO_METODO = """    await this.notify(o, userId, 'La tienda ha marcado tu pedido como cobrado ✅');
    return this.orderDetail(orderId, userId);
  }

  /**
   * VALORAR UN PEDIDO ENTREGADO (punto 7 de la acción inmediata).
   *
   * `lifebook.products.rating`/`rating_count` y `lifebook.shops.rating`/`rating_count` existen desde
   * siempre y la app los pinta, pero **nadie los escribía**: la prueba social estaba muerta. Aquí se
   * escribe: una reseña por pedido, del comprador, y solo de un pedido **entregado** (valorar lo que no
   * ha llegado sería inventarse la experiencia).
   *
   * La nota que se guarda es la media ponderada por el número de votos que ya había: si una tienda tenía
   * 4 con 3 votos y entra un 5, queda 4,25 — no se sustituye la nota por la última, que es lo que
   * convertiría la valoración en un adorno.
   */
  async reviewOrder(userId: string, orderIdRaw: string, ratingRaw: unknown, commentRaw: unknown) {
    const orderId = this.uuid(orderIdRaw, 'Pedido');
    const o = await this.publicOrder(orderId, userId);
    if (o.buyer_id !== userId) throw new DomainError('NOT_ORDER_PARTICIPANT', 'Solo el comprador puede valorar el pedido');
    if (o.status !== 'delivered') {
      throw new DomainError('ORDER_NOT_DELIVERED', 'Solo se puede valorar un pedido entregado');
    }
    const rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new DomainError('RATING_INVALID', 'La nota tiene que ser un número entero de 1 a 5');
    }
    const comment = String(commentRaw ?? '').trim().slice(0, 500) || null;

    // La reseña y las notas se mueven EN LA MISMA TRANSACCIÓN: o cuenta en las dos, o en ninguna.
    await this.db.$transaction(async (tx: any) => {
      const creada: number = await tx.$executeRaw`
        INSERT INTO lifebook.order_reviews (order_id, shop_id, buyer_id, rating, comment)
        VALUES (${orderId}::uuid, ${o.shop_id}::uuid, ${userId}::uuid, ${rating}, ${comment})
        ON CONFLICT (order_id) DO NOTHING`;
      if (!creada) {
        throw new DomainError('REVIEW_ALREADY_DONE', 'Ya has valorado este pedido');
      }
      if (o.shop_id) {
        await tx.$executeRaw`
          UPDATE lifebook.shops
             SET rating = round((coalesce(rating, 0) * coalesce(rating_count, 0) + ${rating})
                                / (coalesce(rating_count, 0) + 1), 2),
                 rating_count = coalesce(rating_count, 0) + 1
           WHERE id = ${o.shop_id}::uuid`;
      }
      /**
       * Los productos del pedido también se valoran: es la nota que ve quien mira la ficha sin conocer
       * a nadie. Se mueve por producto (una sola vez por línea, aunque el pedido lleve 3 unidades).
       */
      await tx.$executeRaw`
        UPDATE lifebook.products p
           SET rating = round((coalesce(p.rating, 0) * coalesce(p.rating_count, 0) + ${rating})
                              / (coalesce(p.rating_count, 0) + 1), 2),
               rating_count = coalesce(p.rating_count, 0) + 1,
               updated_at = now()
         WHERE p.id IN (SELECT DISTINCT i.product_id FROM lifebook.order_items i
                         WHERE i.order_id = ${orderId}::uuid AND i.product_id IS NOT NULL)`;
    });

    await this.notify(o, userId, `El comprador ha valorado el pedido con ${rating} de 5 ⭐`);
    return this.orderDetail(orderId, userId);
  }
"""

# ── 2. La reseña en el detalle (la ven las dos partes) ───────────────────────
ANCLA_DETALLE = """    return {
      order: {
        id: o.id,
        code: o.order_no,"""

NUEVO_DETALLE = """    // La reseña del pedido (si la hay): la escribe el comprador y la ven los dos.
    const resenas: any[] = await db.$queryRaw`
      SELECT id, rating, comment, created_at FROM lifebook.order_reviews
       WHERE order_id = ${orderId}::uuid LIMIT 1`;
    const rev = resenas[0];
    return {
      order: {
        id: o.id,
        code: o.order_no,"""

ANCLA_RESENA_EN_DETALLE = """        paidAt: o.paid_at,"""

NUEVA_RESENA_EN_DETALLE = """        paidAt: o.paid_at,
        /** La valoración del pedido, si el comprador ya la escribió. */
        review: rev
          ? { id: rev.id, rating: Number(rev.rating), comment: rev.comment, createdAt: rev.created_at }
          : null,"""

# ── 3. La ruta ───────────────────────────────────────────────────────────────
ANCLA_RUTA = """  /** «MARCAR COBRADO»: la tienda cobra por fuera (transferencia, facturación…) y deja el justificante. */"""

NUEVA_RUTA = """  /** «VALORAR»: el comprador puntúa un pedido entregado (1-5) y mueve la nota de tienda y productos. */
  @Post(':id/review')
  @UseGuards(JwtAuthGuard)
  review(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.reviewOrder(u.userId, id, body?.rating, body?.comment);
  }

  /** «MARCAR COBRADO»: la tienda cobra por fuera (transferencia, facturación…) y deja el justificante. */"""


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
    if 'reviewOrder' in open(P, encoding='utf-8').read():
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    if not aplicar(P, [(ANCLA_METODO, NUEVO_METODO), (ANCLA_DETALLE, NUEVO_DETALLE), (ANCLA_RESENA_EN_DETALLE, NUEVA_RESENA_EN_DETALLE)]):
        return 1
    if not aplicar(C, [(ANCLA_RUTA, NUEVA_RUTA)]):
        print('OJO: el servicio SÍ se escribió y el controlador NO. Revisar a mano.')
        return 1
    print('escrito orders.service.ts (reviewOrder + review en el detalle) y orders.controller.ts (POST :id/review)')
    return 0


sys.exit(main())
