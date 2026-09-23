# =============================================================================
# parche50 — la COBERTURA del envío es una LISTA, no un valor
#
# Visto en la base: `coverage` es `text[]` y guarda `{same_city}` (y podría guardar
# `{same_city,national}`). El parche 48 la leía con `String(...)`, que con un solo valor acierta por
# casualidad pero con dos devuelve «same_city,national» y ninguna comparación encaja: una tienda que
# envía a todo el país se habría tratado como si no enviara a ningún sitio.
#
# Ahora se lee como lista y basta con que UNA de las coberturas permita el envío.
#
# Uso en el servidor:  python3 /root/parche50-cobertura-lista.py
# =============================================================================
import shutil
import sys

SELLO = 'cobertura-lista-20260214'
SVC = '/opt/mirror/app/src/lifebook/commerce.service.ts'

VIEJO = """      const cobertura = pol?.coverage ? String(pol.coverage) : null;
      const ciudadTienda = this.norm(pol?.origin_city ?? null);
      const regionTienda = pol?.origin_region ? String(pol.origin_region) : null;

      let envia = true;
      if (cobertura && miCiudad) {
        if (cobertura === 'same_city') envia = !!ciudadTienda && ciudadTienda === miCiudad;
        else if (cobertura === 'insular_region') envia = miRegion === 'insular';
        else if (cobertura === 'continental_region') envia = miRegion === 'continental';
        else envia = true; // national · international
      }"""

NUEVO = """      // La cobertura viene como LISTA (`{same_city}` o `{same_city,national}`): basta con que UNA
      // permita el envío.
      const coberturas: string[] = Array.isArray(pol?.coverage)
        ? (pol.coverage as unknown[]).map((c) => String(c))
        : (pol?.coverage ? [String(pol.coverage)] : []);
      const cobertura = coberturas.length ? coberturas.join(',') : null;
      const ciudadTienda = this.norm(pol?.origin_city ?? null);
      const regionTienda = pol?.origin_region ? String(pol.origin_region) : null;

      let envia = true;
      if (coberturas.length && miCiudad) {
        envia = coberturas.some((c) => {
          if (c === 'same_city') return !!ciudadTienda && ciudadTienda === miCiudad;
          if (c === 'insular_region') return miRegion === 'insular';
          if (c === 'continental_region') return miRegion === 'continental';
          return true; // national · international
        });
      }"""

VIEJO2 = """      g.shippingWarning = envia
        ? null
        : (cobertura === 'same_city' && ciudadTienda"""

NUEVO2 = """      g.shippingWarning = envia
        ? null
        : (coberturas.includes('same_city') && ciudadTienda"""


def main():
    src = open(SVC, encoding='utf-8').read()
    if 'coberturas.includes' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    fallos = []
    for nombre, viejo, nuevo in [('cobertura como lista', VIEJO, NUEVO), ('aviso con la lista', VIEJO2, NUEVO2)]:
        n = src.count(viejo)
        if n != 1:
            fallos.append(f'{nombre}: esperaba 1 aparición y hay {n}')
            continue
        src = src.replace(viejo, nuevo)
        print(f'  ok · {nombre}')
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
