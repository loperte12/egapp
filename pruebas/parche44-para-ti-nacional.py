# =============================================================================
# parche44 — «PARA TI» NO PUEDE SER UNA PANTALLA EN BLANCO
#
# EL FALLO (medido)
# `feedForYou` decía en su comentario «ciudad del perfil + nacional», pero el código solo filtraba
# `p.city = <mi ciudad>`. La cuenta del teléfono tiene ciudad **«Acurenam»**, donde no hay ni una
# publicación: «Para ti» devolvía **0 publicaciones** aunque hay 774 en Malabo, 161 en Bata y 29
# vídeos públicos. Por eso el feed de VÍDEOS salía en blanco («Todavía no hay vídeos aquí») y no se
# pudo ver el sticker del producto, que estaba hecho.
#
# QUÉ CAMBIA
# Si mi ciudad no tiene NADA público, «Para ti» sigue con lo **nacional** (todas las ciudades). La
# decisión se toma al principio de la paginación y no cambia a mitad: así el cursor por fecha sigue
# siendo válido y no se saltan publicaciones.
#
# Uso en el servidor:  python3 /root/parche44-para-ti-nacional.py
# =============================================================================
import shutil
import sys

SELLO = 'para-ti-nacional-20260214'
SVC = '/opt/mirror/app/src/lifebook/lifebook.service.ts'

fallos = []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def escribir(p, s):
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


VIEJO = """  /** Feed "Para ti" (ciudad del perfil + nacional, simples). */
  async feedForYou(userId: string, opts: { cursor?: string; limit?: number; type?: string }) {
    const u: any[] = await this.db.$queryRaw`SELECT city FROM mobility.users WHERE id=${userId}::uuid`;
    const city = u[0]?.city ?? 'Malabo';
    return this.feedCity(city, { ...opts, viewerId: userId });
  }
"""

NUEVO = """  /**
   * Feed "Para ti" (ciudad del perfil + nacional, simples).
   *
   * 🔴 Lo que estaba pasando: el comentario prometía «ciudad del perfil + nacional», pero el código
   * solo filtraba `p.city = <mi ciudad>`. La cuenta del teléfono tiene ciudad **«Acurenam»**, donde
   * no hay ni una publicación, así que «Para ti» devolvía **0 publicaciones** (Malabo 774, Bata 161,
   * Luba 2, Acurenam 0) y el feed de VÍDEOS salía en blanco aunque hubiera 29 vídeos públicos.
   *
   * Ahora, si mi ciudad no tiene nada público, «Para ti» sigue con lo NACIONAL. La decisión se toma
   * UNA vez, al empezar a paginar, para que el cursor por fecha siga siendo válido: no se cambia de
   * feed a mitad de página (eso sí que se saltaría publicaciones).
   */
  async feedForYou(userId: string, opts: { cursor?: string; limit?: number; type?: string }) {
    const u: any[] = await this.db.$queryRaw`SELECT city FROM mobility.users WHERE id=${userId}::uuid`;
    const city = String(u[0]?.city ?? '').trim() || 'Malabo';
    const args: unknown[] = [city];
    let cond = `p.city = $1 AND p.state = 'active' AND p.visibility = 'public'`;
    if (opts.type) { args.push(opts.type); cond += ` AND p.type = $${args.length}`; }
    const hay: any[] = await this.db.$queryRawUnsafe(`SELECT 1 FROM lifebook.posts p WHERE ${cond} LIMIT 1`, ...args);
    if (hay[0]) return this.feedCity(city, { ...opts, viewerId: userId });
    return this.feedNational({ ...opts, viewerId: userId });
  }

  /** Feed NACIONAL: lo público de cualquier ciudad (el «+ nacional» que promete «Para ti»). */
  async feedNational(opts: { cursor?: string; limit?: number; viewerId?: string; type?: string }) {
    const args: unknown[] = [];
    let conds = `p.state='active' AND p.visibility='public'`;
    if (opts.type) { args.push(opts.type); conds += ` AND p.type = $${args.length}`; }
    return this.feedPage(conds, args, { cursor: opts.cursor, limit: opts.limit, viewerId: opts.viewerId });
  }
"""


def main():
    src = leer(SVC)
    if 'feedNational' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    n = src.count(VIEJO)
    if n != 1:
        print(f'FALLO: esperaba 1 aparición de feedForYou y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(SVC, f'{SVC}.bak-{SELLO}')
    print(f'respaldo: {SVC}.bak-{SELLO}')
    escribir(SVC, src.replace(VIEJO, NUEVO))
    print('escrito lifebook.service.ts')
    return 0


sys.exit(main())
