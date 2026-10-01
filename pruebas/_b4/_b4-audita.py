# -*- coding: utf-8 -*-
# ═══════════════════════════════════════════════════════════════════════════════
# B-4/B-5 · AUDITORIA DEL GUION DE VENTANA, **SIN CONECTARSE**.
#
# La ventana se gasta con el paquete YA integro. Esto es lo que «integro» significa
# para este guion, y son trece comprobaciones:
#
#   1  sin BOM, y CERO bytes CR            (el servidor es Linux; un CR cambia la huella)
#   2  asignaciones con nombre valido      (con guion, bash lo lee como COMANDO: fallo 51)
#   3  cero acentos graves VIVOS           (fuera de comillas, es sustitucion de comando)
#   4  el SQL es de SOLO LECTURA           (la prueba que importa: no puede romper nada)
#   5  no hay pg_dump, y no debe haberlo   (esta ventana no trae esquema: ya se trajo en B-2)
#   6  un solo contenedor, el correcto
#   7  las tres huellas de partida son sha256 de verdad
#   8  `rm` solo borra un temporal de /tmp
#   9  el guion se ANUNCIA como solo lectura
#  10  la comprobacion 3 puede FALLAR       (un verificador que solo da OK no verifica)
#  11  el censo NO nombra columnas, y usa FRONTERAS DE PALABRA, y xpath con //
#        - sin to_jsonb, volveria a dar por hecho una columna que puede no existir
#        - sin \m..\M, un uuid cuenta como acierto (E y 2 son hexadecimales) y el censo
#          se infla solo: seria un numero publicado y falso
#        - sin // en el xpath, depende de como query_to_xml envuelva la fila: devolveria NULL
#  12  el PAYLOAD va DESPUES de todas las consultas
#        - es la mitigacion del intercalado: por SSH el stdout va en bloque y el stderr
#          de psql sin buffer, y en B-2 un error partio en dos el base64 de otra seccion
#  13  los 6 ficheros que YA estan versionados van por @TENGO, no por @INICIO
#        - por @INICIO se re-escribirian sin comprobar que el servidor dice lo mismo
#
# VIVE EN D: Y NO EN C: A PROPOSITO. El 27-sep el disco C: se quedo sin espacio y un
# `Edit` truncó un fichero a 0 bytes sin dar error de sintaxis: el worktree del
# workspace no es sitio fiable para las herramientas de una ventana.
# ═══════════════════════════════════════════════════════════════════════════════
import os
import re
import sys

RAIZ = os.path.dirname(os.path.abspath(__file__))
FICHERO = os.path.join(RAIZ, sys.argv[1] if len(sys.argv) > 1 else '_b4-trae.sh')

fallos = []
notas = []


def quita_comentario(linea):
    """Devuelve la parte de codigo de una linea de shell (fuera de comillas)."""
    fuera = []
    en_simple = False
    en_doble = False
    i = 0
    while i < len(linea):
        c = linea[i]
        if c == '\\':
            fuera.append(c)
            if i + 1 < len(linea):
                fuera.append(linea[i + 1])
            i += 2
            continue
        if c == "'" and not en_doble:
            en_simple = not en_simple
        elif c == '"' and not en_simple:
            en_doble = not en_doble
        elif c == '#' and not en_simple and not en_doble:
            break
        fuera.append(c)
        i += 1
    return ''.join(fuera)


def acentos_vivos(texto):
    """Cuenta acentos graves que bash EJECUTARIA: fuera de comentarios y de comillas simples."""
    n = 0
    for linea in texto.splitlines():
        codigo = quita_comentario(linea)
        sin_simple = re.sub(r"'[^']*'", '', codigo)
        n += sin_simple.count('`')
    return n


def sql_extraido(texto):
    """Saca el contenido de cada bloque de psql del tipo  -c "  ...  "  ."""
    trozos = []
    for m in re.finditer(r'-c\s+"', texto):
        ini = m.end()
        fin = texto.find('"', ini)
        if fin == -1:
            fin = len(texto)
        trozos.append(texto[ini:fin])
    return trozos


def imprime(n, titulo, ok, extra=''):
    print('%2d %-42s %s%s' % (n, titulo, 'OK' if ok else 'FALLO', extra))


# ── 0) el fichero existe y se lee como bytes ────────────────────────────────────
if not os.path.exists(FICHERO):
    print('*** FALLO: no existe %s ***' % FICHERO)
    sys.exit(2)
b = open(FICHERO, 'rb').read()
if len(b) == 0:
    print('*** FALLO: %s esta VACIO (0 bytes) ***' % FICHERO)
    sys.exit(2)
texto = b.decode('utf-8', 'replace')
print('auditando: %s  (%d bytes)' % (os.path.basename(FICHERO), len(b)))
print()

# ── 1) BOM y CR ────────────────────────────────────────────────────────────────
tiene_bom = b.startswith(b'\xef\xbb\xbf')
nb_cr = b.count(b'\r')
ok1 = not tiene_bom and nb_cr == 0
if tiene_bom:
    fallos.append('empieza con BOM (el servidor es Linux: sobra)')
if nb_cr:
    fallos.append('tiene %d bytes CR (tiene que ser 0: cambiaria la huella)' % nb_cr)
imprime(1, 'sin BOM y sin CR', ok1)

# ── 2) nombres de variable ─────────────────────────────────────────────────────
ids = re.findall(r'^\s*([A-Za-z_][A-Za-z0-9_-]*)="?', texto, re.M)
malos = sorted({i for i in ids if '-' in i})
if malos:
    fallos.append('nombres de variable con guion (bash los lee como COMANDO): %s' % ', '.join(malos))
imprime(2, 'asignaciones con nombre valido', not malos, '  (%d asignaciones)' % len(ids))

# ── 3) acentos graves vivos ────────────────────────────────────────────────────
vivos = acentos_vivos(texto)
if vivos:
    fallos.append('%d acento(s) grave(s) VIVOS: bash intentaria EJECUTAR lo de dentro' % vivos)
imprime(3, 'cero acentos graves vivos', not vivos, '' if not vivos else '  (%d)' % vivos)

# ── 4) el SQL es de solo lectura ───────────────────────────────────────────────
VERBOS = ('insert', 'update', 'delete', 'alter', 'drop', 'truncate', 'create',
          'grant', 'revoke', 'vacuum', 'reindex', 'cluster', 'call', 'copy',
          'lock', 'refresh', 'comment', 'security', 'set', 'reset', 'begin',
          'commit', 'rollback', 'savepoint', 'analyze', 'do')
trozos = sql_extraido(texto)
sucios = []
for t in trozos:
    bajo = t.lower()
    for v in VERBOS:
        if re.search(r'\b%s\b' % v, bajo):
            sucios.append((v, ' '.join(t.split())[:60]))
if not trozos:
    fallos.append('no se extrajo NI UN bloque SQL: la comprobacion no esta mirando nada')
if sucios:
    fallos.append('SQL con verbo de escritura: %s' % sucios[:3])
imprime(4, 'el SQL es de SOLO LECTURA', not sucios, '  (%d bloques SQL revisados)' % len(trozos))
if trozos:
    letra = sorted({w for t in trozos for w in re.findall(r'\b(select|pg_dump|query_to_xml)\b', t.lower())})
    notas.append('verbos encontrados en el SQL: %s' % (', '.join(letra) or 'ninguno'))

# ── 5) no debe haber pg_dump en esta ventana ───────────────────────────────────
hay_dump = 'pg_dump' in texto
if hay_dump:
    fallos.append('aparece pg_dump: esta ventana NO trae esquema (ya se trajo en B-2)')
imprime(5, 'sin pg_dump (el esquema ya bajo en B-2)', not hay_dump)

# ── 6) contenedores ────────────────────────────────────────────────────────────
conts = sorted(set(re.findall(r'docker exec -i\s+([A-Za-z0-9_.-]+)', texto)))
if conts != ['mirror-postgres']:
    fallos.append('contenedores citados: %s  (se esperaba solo mirror-postgres)' % conts)
imprime(6, 'un solo contenedor, el correcto', conts == ['mirror-postgres'], '  (%s)' % (', '.join(conts) or 'ninguno'))

# ── 7) las huellas de partida son sha256 ───────────────────────────────────────
huellas = re.findall(r'^([A-Z][A-Z0-9_]*)=([0-9a-fA-F]+)\s*$', texto, re.M)
malas = [(n, v) for n, v in huellas if len(v) != 64]
if not huellas:
    fallos.append('no hay huellas de partida: el guion no comprobaria sobre que escribe')
for n, v in malas:
    fallos.append('huella %s no es sha256 (%d caracteres)' % (n, len(v)))
imprime(7, 'las huellas de partida son sha256', bool(huellas) and not malas, '  (%d huellas)' % len(huellas))

# ── 8) rm solo del temporal ────────────────────────────────────────────────────
temporales = set(re.findall(r'^\s*([A-Za-z_][A-Za-z0-9_]*)="?(/tmp/[^"\s]*)"?\s*$', texto, re.M))
nombres_tmp = {n for n, _ in temporales}
comandos_rm = re.findall(r'^\s*rm\b[^\n]*', texto, re.M)
malos_rm = []
for c in comandos_rm:
    destinos = re.findall(r'\$([A-Za-z_][A-Za-z0-9_]*)', c)
    if not destinos or any(d not in nombres_tmp for d in destinos):
        malos_rm.append(c.strip())
if malos_rm:
    fallos.append('hay un rm que no borra un temporal declarado en /tmp: %s' % malos_rm)
# SOLO la recursion es peligrosa: un rm -f de un temporal declarado en /tmp es lo previsto.
peligrosos = re.findall(r'rm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+[^\n]*', texto)
if peligrosos:
    fallos.append('hay rm RECURSIVO: %s' % peligrosos)
if not nombres_tmp:
    fallos.append('ningun temporal apunta a /tmp: el rm declarado podria caer fuera')
imprime(8, 'rm solo borra un temporal de /tmp', not malos_rm and not peligrosos,
        '  (%d rm, %d temporales)' % (len(comandos_rm), len(nombres_tmp)))

# ── 9) el guion se anuncia como solo lectura ───────────────────────────────────
ok9 = 'SOLO LECTURA' in texto.upper()
if not ok9:
    fallos.append('el guion no se anuncia como SOLO LECTURA')
imprime(9, 'se anuncia como solo lectura', ok9)

# ── 10) la prueba 3 tiene que poder fallar ─────────────────────────────────────
prueba = 'echo "la clave es `clave-secreta` y sigue"'
if acentos_vivos(prueba) < 1:
    fallos.append('la comprobacion de acentos graves es VACUA: no detecta una sustitucion de comando')
    imprime(10, 'la prueba 3 puede fallar', False, '  (es vacua)')
else:
    imprime(10, 'la prueba 3 puede fallar', True, '  (detecta %d en la linea de prueba)' % acentos_vivos(prueba))

# ── 11) el censo no nombra columnas, usa fronteras de palabra y xpath con // ───
censo = [t for t in trozos if 'pg_class' in t]
TITULO11 = r'el censo: to_jsonb + \m\M + xpath con //'
if not censo:
    fallos.append('no encuentro la consulta del censo (la que recorre pg_class)')
    imprime(11, TITULO11, False, '  (no la encuentro)')
else:
    c = censo[0]
    sin_tojsonb = 'to_jsonb' not in c
    sin_fronteras = ('\\m' not in c) or ('\\M' not in c)
    sin_xpath = '//row/' not in c
    if sin_tojsonb:
        fallos.append('el censo NO usa to_jsonb: volveria a nombrar columnas que pueden no existir')
    if sin_fronteras:
        fallos.append('el censo NO usa fronteras de palabra: un uuid contaria como acierto y el censo se infla')
    if sin_xpath:
        fallos.append('el censo usa xpath SIN //: depende de como query_to_xml envuelva la fila')
    imprime(11, TITULO11, not sin_tojsonb and not sin_fronteras and not sin_xpath,
            '  (to_jsonb=%s, \\m\\M=%s, //row=%s)'
            % ('si' if not sin_tojsonb else 'NO', 'si' if not sin_fronteras else 'NO',
               'si' if not sin_xpath else 'NO'))
    # y la lista de tablas tiene que estar acotada a los 5 esquemas, no a "todas"
    if 'n.nspname IN' not in c:
        fallos.append('el censo no acota los esquemas: recorrería toda la base')
    else:
        cola = c.split('n.nspname IN')[1][:120]
        notas.append('esquemas del censo: %s' % (', '.join(re.findall(r"'([a-z]+)'", cola)) or 'ninguno'))

# ── 12) el payload va DESPUES de las consultas ─────────────────────────────────
pos_ini = texto.find('@INICIO')
pos_ultima_c = max([m.start() for m in re.finditer(r'-c\s+"', texto)] or [-1])
ok12 = pos_ini != -1 and pos_ini > pos_ultima_c
if pos_ini == -1:
    fallos.append('no hay ni un @INICIO: no se traeria ningun fichero (era el objetivo)')
elif not ok12:
    fallos.append('hay @INICIO ANTES de la ultima consulta: es la causa del intercalado de B-2')
imprime(12, 'el payload va tras todas las consultas', ok12,
        '  (@INICIO en %d, ultima consulta en %d)' % (pos_ini, pos_ultima_c))

# ── 13) los 6 ya versionados van por @TENGO ────────────────────────────────────
ESPERADOS_TENGO = {
    'hotel.service.ts', 'reservations.service.ts', 'hotel-merchant.service.ts',
    'hotel.controller.ts', 'hotel-merchant.controller.ts', 'dto/hotel-reservation.dto.ts',
}
m_caso = re.search(r'case "\$rel" in(.*?)\)\s*\n', texto, re.S)
rama = m_caso.group(1) if m_caso else ''
en_tengo = {x for x in ESPERADOS_TENGO if x in rama}
faltan_tengo = ESPERADOS_TENGO - en_tengo
if faltan_tengo:
    fallos.append('estos ya versionados NO van por @TENGO (se re-escribirian sin comprobar): %s'
                  % sorted(faltan_tengo))
imprime(13, 'los 6 versionados van por @TENGO', not faltan_tengo, '  (%d de 6)' % len(en_tengo))

# ── Veredicto ──────────────────────────────────────────────────────────────────
print()
for n in notas:
    print('   nota: %s' % n)
print()
if fallos:
    print('*** %d FALLO(S): NO se gasta la ventana ***' % len(fallos))
    for f in fallos:
        print('   - %s' % f)
    sys.exit(1)
print('*** EL PAQUETE ESTA INTEGRO: 13 de 13. Se puede pedir la ventana. ***')
