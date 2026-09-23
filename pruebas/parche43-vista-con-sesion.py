# =============================================================================
# parche43 — MERCADO, tanda F (bis): LA VISITA SE APUNTA CON UNA LLAMADA PROPIA
#
# POR QUÉ (fallo real, medido)
# En la primera versión la visita se apuntaba DENTRO de `GET /commerce/products/:id`, que es una
# ruta PÚBLICA con sesión opcional. Problema: si el token acaba de caducar, la app manda esa
# petición **sin** identidad (el cliente solo reintenta cuando recibe 401, y esta ruta responde 200
# igual), así que la visita NO se apuntaba y la app no tenía forma de saberlo.
#
# Se vio en el teléfono: en el log de nginx, el mismo segundo salían
#   GET /commerce/my/cart  → 401 (token caducado)
#   GET /commerce/products/<id> → 200 (pública: sin identidad)
#   POST /mobility/auth/refresh → 200
# y la tabla `product_views` seguía VACÍA tras abrir la ficha.
#
# QUÉ CAMBIA
#   · `POST /commerce/products/:id/view` (exige sesión) apunta la visita. Si el token está caducado,
#     el cliente recibe 401 → refresca → reintenta (la maquinaria que ya existe) y la visita no se
#     pierde.
#   · La escritura se QUITA de `GET /commerce/products/:id`: un solo sitio escribe el historial, así
#     que la visita no se cuenta dos veces. El contador público (`views_count`) se queda donde estaba.
#
# Uso en el servidor:  python3 /root/parche43-vista-con-sesion.py
# =============================================================================
import shutil
import sys

SELLO = 'vista-con-sesion-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'
CTL = '/opt/mirror/app/src/lifebook/commerce.controller.ts'

fallos = []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def escribir(p, s):
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def respaldar(p):
    dst = f'{p}.bak-{SELLO}'
    shutil.copyfile(p, dst)
    print(f'respaldo: {dst}')


def aplicar(p, src, edits):
    for nombre, viejo, nuevo, veces in edits:
        n = src.count(viejo)
        if n != veces:
            fallos.append(f'{p.split("/")[-1]} [{nombre}]: esperaba {veces} apariciones y hay {n}')
            continue
        src = src.replace(viejo, nuevo)
        print(f'  ok · {nombre} ({n})')
    return src


# ── 1) el historial deja de escribirse en la lectura pública ─────────────────
VISTA_VIEJA = """      /**
       * MERCADO (tanda F) — EL HISTORIAL DE PRODUCTOS.
       *
       * Además del contador público (`views_count`, que no dice QUIÉN), se apunta quién lo miró:
       * es lo que hace posible el «viste esto ayer» y lo que la persona puede borrar. Una fila por
       * persona y producto (no una por visita): se refresca la fecha y se suma al contador.
       *
       * Va SIN `await` y con `catch`: abrir una ficha no puede fallar porque el historial tropiece.
       * Y nunca se apunta al dueño: mirar lo tuyo no es un «visto».
       */
      if (viewerId) {
        this.db.$executeRaw`
          INSERT INTO lifebook.product_views (user_id, product_id, first_seen_at, viewed_at, times)
          VALUES (${viewerId}::uuid, ${pid}::uuid, now(), now(), 1)
          ON CONFLICT (user_id, product_id)
          DO UPDATE SET viewed_at = now(), times = lifebook.product_views.times + 1`.catch(() => {});
      }
    }
"""

VISTA_NUEVA = """      // El HISTORIAL de productos NO se escribe aquí: esta ruta es pública (sesión opcional) y con
      // el token caducado la petición sale sin identidad y la visita se perdía en silencio —visto
      // en el teléfono—. Se apunta en `POST /commerce/products/:id/view`, que EXIGE sesión: así, si
      // el token caducó, el cliente recibe 401, refresca y reintenta. Un solo sitio escribe.
    }
"""

# ── 2) el método que apunta la visita ────────────────────────────────────────
ANCLA_MIVIEWS = """  /**
   * MERCADO (tanda F) — «VISTOS HACE POCO»: el historial de productos de quien mira.
"""

METODO_NUEVO = """  /**
   * MERCADO (tanda F) — APUNTAR UNA VISITA (con sesión).
   *
   * Es la ÚNICA puerta que escribe el historial. Exige sesión a propósito: si el token está
   * caducado, el cliente recibe 401 y su maquinaria de refresco reintenta; en la lectura pública
   * (`GET products/:id`) la petición salía anónima y la visita se perdía sin que nadie lo supiera.
   *
   * Nunca se apunta al dueño (mirar lo tuyo no es un «visto») ni a un producto que ya no está a la
   * venta. Devuelve `registrada: false` con el motivo en vez de fallar: es un dato de conveniencia,
   * no una operación que deba romper nada.
   */
  async registrarVista(userId: string, productId: string) {
    const pid = this.uuidOrNull(productId) as string;
    const fila: any[] = await this.db.$queryRaw`
      SELECT p.id, p.status, s.owner_id
        FROM lifebook.products p JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE p.id = ${pid}::uuid LIMIT 1`;
    if (!fila[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe');
    if (fila[0].owner_id === userId) return { ok: true, registrada: false, motivo: 'es_tuya' };
    if (String(fila[0].status) !== 'active') return { ok: true, registrada: false, motivo: 'no_disponible' };
    const veces: number = await this.db.$executeRaw`
      INSERT INTO lifebook.product_views (user_id, product_id, first_seen_at, viewed_at, times)
      VALUES (${userId}::uuid, ${pid}::uuid, now(), now(), 1)
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET viewed_at = now(), times = lifebook.product_views.times + 1`;
    return { ok: true, registrada: true, veces: Number(veces ?? 0) };
  }

""" + ANCLA_MIVIEWS

# ── 3) la ruta ───────────────────────────────────────────────────────────────
ANCLA_RUTAS = """  // ─────────────────── HISTORIAL DE PRODUCTOS (tanda F) ────────────────────
"""

RUTA_NUEVA = """  // ─────────────────── HISTORIAL DE PRODUCTOS (tanda F) ────────────────────
  /**
   * Apuntar que he mirado este producto. Exige sesión (ver el comentario del servicio): es lo que
   * hace que un token caducado NO se trague la visita.
   */
  @Post('products/:id/view')
  @UseGuards(JwtAuthGuard)
  registrarVista(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.registrarVista(u.userId, id);
  }

""" + ANCLA_RUTAS

SVC_EDITS = [
    ('quitar la escritura de la ruta pública', VISTA_VIEJA, VISTA_NUEVA, 1),
    ('registrarVista', ANCLA_MIVIEWS, METODO_NUEVO, 1),
]
CTL_EDITS = [
    ('ruta products/:id/view', ANCLA_RUTAS, RUTA_NUEVA, 1),
]


def main():
    svc = leer(SVC)
    ctl = leer(CTL)
    if 'registrarVista' in svc or 'registrarVista' in ctl:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    respaldar(SVC)
    respaldar(CTL)
    svc = aplicar(SVC, svc, SVC_EDITS)
    ctl = aplicar(CTL, ctl, CTL_EDITS)
    if fallos:
        print('\nNO SE ESCRIBE NADA. Fallos:')
        for f in fallos:
            print(' -', f)
        return 1
    escribir(SVC, svc)
    escribir(CTL, ctl)
    print('\nescritos los dos ficheros.')
    return 0


sys.exit(main())
