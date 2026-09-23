# Diagnóstico: imprime el bloque exacto de catalog() para comparar byte a byte.
p = '/opt/mirror/app/src/lifebook/commerce.service.ts'
src = open(p, encoding='utf-8').read()
i = src.find('items: page.map((p) => ({')
print('encontrado en', i)
if i > 0:
    ini = src.rfind('    return {', 0, i)
    fin = src.find('      total: page.length,', i)
    print('---- inicio', ini, 'fin', fin)
    bloque = src[ini:fin + len('      total: page.length,\n')]
    for n, linea in enumerate(bloque.split('\n'), 1):
        print(f'{n:3}| {linea!r}')
