# =============================================================================
# parche49 — el comparador de ciudades que faltaba (`norm`)
#
# El parche 48 usa `this.norm(...)` para comparar la ciudad del comprador con la del origen de la
# tienda (para saber si el envío llega o no), pero ese método no existía: `tsc` lo cazó y el build
# no se aplicó. Se añade al lado de `clean`.
#
# «Ebebiyín» y «ebebiyin» son la misma ciudad: compararlas a pelo habría dejado a gente sin envío.
#
# Uso en el servidor:  python3 /root/parche49-norm.py
# =============================================================================
import shutil
import sys

SELLO = 'norm-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'

VIEJO = """  // ─────────────────────────── utilidades ────────────────────────────────────
  private clean(v: unknown, max: number): string {
    return String(v ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);
  }
"""

NUEVO = """  // ─────────────────────────── utilidades ────────────────────────────────────
  private clean(v: unknown, max: number): string {
    return String(v ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);
  }

  /**
   * Normaliza un texto para COMPARAR (ciudades): minúsculas, sin acentos y sin espacios de sobra.
   * «Ebebiyín» y «ebebiyin» son la misma ciudad; compararlas a pelo dejaba a gente sin envío.
   * Devuelve `null` si no hay nada que comparar.
   */
  private norm(v: unknown): string | null {
    const s = String(v ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
    if (!s) return null;
    return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  }
"""


def main():
    src = open(SVC, encoding='utf-8').read()
    if 'private norm(' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    n = src.count(VIEJO)
    if n != 1:
        print(f'FALLO: esperaba 1 aparición y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(SVC, f'{SVC}.bak-{SELLO}')
    print(f'respaldo: {SVC}.bak-{SELLO}')
    open(SVC, 'w', encoding='utf-8', newline='').write(src.replace(VIEJO, NUEVO))
    print('escrito commerce.service.ts')
    return 0


sys.exit(main())
