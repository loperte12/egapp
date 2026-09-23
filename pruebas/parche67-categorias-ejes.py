# =============================================================================
# parche67 — la categoría también sugiere EJES de opciones (tanda K)
#
# Igual que la categoría ya sugiere los detalles que hay que rellenar (`default_attributes`), ahora
# sugiere los EJES de elección: «Ropa mujer» propone Talla + Color, «Calzado» propone tallas de
# zapato, «Teléfonos y tablets» propone almacenamiento + color… Así el comerciante no tiene que
# inventarse la estructura de su producto: la añade de un toque y la ajusta.
#
# La columna `categories.default_options` y sus valores ya están en la base (DDL 016); esto solo
# los saca por el API.
#
# Uso en el servidor:  python3 /root/parche67-categorias-ejes.py
# =============================================================================
import shutil
import sys

SELLO = 'categorias-ejes-20260214'
P = '/opt/mirror/app/src/lifebook/commerce.service.ts'

A1 = """      SELECT id, parent_id, code, name, icon, service_type, default_attributes, sort_order
        FROM lifebook.categories WHERE active"""
N1 = """      SELECT id, parent_id, code, name, icon, service_type, default_attributes, default_options, sort_order
        FROM lifebook.categories WHERE active"""

A2 = """        defaultAttributes: r.default_attributes ?? [],
        children: rows"""
N2 = """        defaultAttributes: r.default_attributes ?? [],
        // Tanda K: los EJES que sugiere la categoría (Talla, Color, Almacenamiento, Formato…).
        defaultOptions: r.default_options ?? [],
        children: rows"""

A3 = """            serviceType: c.service_type,
            defaultAttributes: c.default_attributes ?? [],
          })),"""
N3 = """            serviceType: c.service_type,
            defaultAttributes: c.default_attributes ?? [],
            defaultOptions: c.default_options ?? [],
          })),"""

PIEZAS = [(A1, N1), (A2, N2), (A3, N3)]


def main():
    src = open(P, encoding='utf-8').read()
    if 'defaultOptions' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    problemas = []
    for viejo, _ in PIEZAS:
        n = src.count(viejo)
        if n != 1:
            problemas.append(f'esperaba 1 aparición y hay {n}: ' + viejo.splitlines()[0][:70])
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
    print('escrito commerce.service.ts (la categoría sugiere ejes)')
    return 0


sys.exit(main())
