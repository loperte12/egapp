#!/usr/bin/env python3
# AS-42 · Extrae y desescapa los textos del bundle del panel de admin, para saber qué secciones
# tiene DE VERDAD (los textos van en \uXXXX y no se leen con grep).
import re
import glob

RUTA = '/opt/mirror/web-admin/assets/'
for f in sorted(glob.glob(RUTA + '*.js')):
    s = open(f, encoding='utf-8', errors='replace').read()
    # Desescapar \uXXXX y \n para poder leer el español
    s2 = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
    print('=' * 70)
    print('FICHERO:', f, '(', len(s), 'bytes )')
    print('=' * 70)

    # 1) Contexto de 'ecomerse'
    print('--- apariciones de "ecomerse" ---')
    for m in re.finditer('ecomerse', s2):
        i = m.start()
        trozo = s2[max(0, i - 130):i + 130].replace('\n', ' ')
        print('  ...' + trozo + '...')
        print('  ' + '-' * 60)

    # 2) Etiquetas de navegación plausibles (palabras capitalizadas en español)
    print('--- textos de interfaz (muestra) ---')
    etiquetas = set()
    for m in re.finditer(r'"([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ,.:·()/-]{6,45})"', s2):
        t = m.group(1).strip()
        if any(k in t for k in ('Mercado', 'Documentaci', 'Moderaci', 'Vendedor', 'Pedido', 'Producto',
                                'Tienda', 'Comercio', 'Plan', 'Categoría', 'Revisi', 'Aprobar',
                                'Rechazar', 'Factura', 'Certificado', 'Restaurante', 'Repartidor')):
            etiquetas.add(t)
    for t in sorted(etiquetas)[:60]:
        print('  ' + t)
