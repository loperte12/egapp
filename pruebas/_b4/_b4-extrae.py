# -*- coding: utf-8 -*-
# ═══════════════════════════════════════════════════════════════════════════════
# B-2/B-3 · EXTRACTOR del registro de la ventana.
#
# Coge la salida de `_b2-trae.sh` y separa sus tres cosas:
#
#   @DDL <sha256> <bytes> ... @DDL-FIN   -> el volcado del esquema, tal cual salio
#   @INICIO <ruta> <sha> <bytes> ... @FIN -> un fichero que FALTA, para versionar
#   @TENGO <ruta> <sha> <bytes>           -> uno que ya esta: se COMPRUEBA, no se escribe
#
# Todas las verificaciones son por sha256 **y** por numero de bytes, y ninguna es
# opcional: si algo no cuadra, se aborta sin escribir ese fichero. Un fichero versionado
# con la huella equivocada es peor que no versionarlo, porque parece verificado.
#
# uso:  python _b2-extrae.py <registro> [--destino DIR] [--ddl FICHERO]
# ═══════════════════════════════════════════════════════════════════════════════
import base64
import gzip
import hashlib
import os
import re
import sys

RAIZ = os.path.dirname(os.path.abspath(__file__))

# Por defecto se escribe donde tiene que quedar versionado.
DESTINO_DEF = r'D:\egapp\backend\server-src\lifebook'
# El volcado NO se escribe en backend/sql/ directamente: un pg_dump en crudo no es una
# migracion del repo (no es idempotente y no lleva el porque). Es material de partida.
DDL_DEF = os.path.join(RAIZ, '_b2-ddl-crudo.sql')


def sha256_b(b):
    return hashlib.sha256(b).hexdigest()


def normaliza(s):
    return s.strip()


def main():
    args = sys.argv[1:]
    if not args:
        print('falta el registro:  python _b2-extrae.py <registro>')
        return 2
    registro = args[0]
    destino = DESTINO_DEF
    ddl_salida = DDL_DEF
    if '--destino' in args:
        destino = args[args.index('--destino') + 1]
    if '--ddl' in args:
        ddl_salida = args[args.index('--ddl') + 1]

    if not os.path.exists(registro):
        print('no existe el registro: %s' % registro)
        return 2

    texto = open(registro, 'r', encoding='utf-8', errors='replace').read()
    lineas = texto.split('\n')

    errores = []
    escritos = []
    tenidos = []

    # ── volcado del esquema ────────────────────────────────────────────────────
    m = re.search(r'^@DDL ([0-9a-f]{64}) (\d+)\s*$', texto, re.M)
    if not m:
        errores.append('no encuentro la cabecera @DDL en el registro')
    else:
        sha_esp, bytes_esp = m.group(1), int(m.group(2))
        resto = texto[m.end():]
        fin = resto.find('@DDL-FIN')
        if fin == -1:
            errores.append('@DDL sin su @DDL-FIN: el registro esta cortado')
        else:
            b64 = re.sub(r'\s+', '', resto[:fin])
            try:
                gz = base64.b64decode(b64, validate=True)
                crudo = gzip.decompress(gz)
            except Exception as e:
                crudo = b''
                errores.append('no se pudo decodificar/descomprimir el DDL: %s' % e)
            if crudo:
                if len(crudo) != bytes_esp:
                    errores.append('DDL: bytes %d, se esperaban %d' % (len(crudo), bytes_esp))
                elif sha256_b(crudo) != sha_esp:
                    errores.append('DDL: sha256 NO cuadra (%s)' % sha256_b(crudo)[:16])
                else:
                    # La carpeta del DDL se crea igual que la de los modulos: si no, el
                    # primer uso con un --ddl en un directorio nuevo revienta AQUI, con la
                    # ventana ya gastada. Lo cazo la prueba con registro sintetico.
                    os.makedirs(os.path.dirname(os.path.abspath(ddl_salida)), exist_ok=True)
                    with open(ddl_salida, 'wb') as f:
                        f.write(crudo)
                    escritos.append(('DDL', ddl_salida, len(crudo), sha256_b(crudo)))

    # ── ficheros: @INICIO ... @FIN y @TENGO ────────────────────────────────────
    i = 0
    while i < len(lineas):
        L = lineas[i]
        m = re.match(r'^@INICIO (\S+) ([0-9a-f]{64}) (\d+)\s*$', L)
        if m:
            ruta, sha_esp, bytes_esp = m.group(1), m.group(2), int(m.group(3))
            i += 1
            b64 = []
            while i < len(lineas) and normaliza(lineas[i]) != '@FIN':
                b64.append(normaliza(lineas[i]))
                i += 1
            if i >= len(lineas):
                errores.append('@INICIO %s sin @FIN: registro cortado' % ruta)
                break
            try:
                datos = base64.b64decode(''.join(b64), validate=True)
            except Exception as e:
                errores.append('%s: base64 invalido (%s)' % (ruta, e))
                i += 1
                continue
            if len(datos) != bytes_esp:
                errores.append('%s: bytes %d, se esperaban %d' % (ruta, len(datos), bytes_esp))
            elif sha256_b(datos) != sha_esp:
                errores.append('%s: sha256 NO cuadra (%s)' % (ruta, sha256_b(datos)[:16]))
            else:
                sal = os.path.join(destino, ruta.replace('/', os.sep))
                os.makedirs(os.path.dirname(sal), exist_ok=True)
                with open(sal, 'wb') as f:
                    f.write(datos)
                escritos.append((ruta, sal, len(datos), sha256_b(datos)))
        else:
            m2 = re.match(r'^@TENGO (\S+) ([0-9a-f]{64}) (\d+)\s*$', L)
            if m2:
                ruta, sha_esp, bytes_esp = m2.group(1), m2.group(2), int(m2.group(3))
                local = os.path.join(destino, ruta.replace('/', os.sep))
                if not os.path.exists(local):
                    errores.append('@TENGO %s: el servidor dice que ya lo tengo, y no esta en %s' % (ruta, local))
                else:
                    b = open(local, 'rb').read()
                    if len(b) != bytes_esp or sha256_b(b) != sha_esp:
                        errores.append('@TENGO %s: NO cuadra con la copia local (servidor %s / local %s)'
                                       % (ruta, sha_esp[:16], sha256_b(b)[:16]))
                    else:
                        tenidos.append((ruta, len(b)))
        i += 1

    # ── informe ────────────────────────────────────────────────────────────────
    print('=== B-2/B-3 · extractor ===')
    print('registro: %s' % registro)
    print()
    if tenidos:
        print('YA LOS TENGO (comprobados contra el servidor, NO se han escrito):')
        for ruta, n in tenidos:
            print('  OK %-44s %8d B' % (ruta, n))
        print()
    if escritos:
        print('ESCRITOS:')
        for que, donde, n, h in escritos:
            print('  %-18s %8d B  %s  %s' % (que, n, h[:16], donde))
        print()
    print('resumen: escritos=%d  ya_tenidos=%d  errores=%d' % (len(escritos), len(tenidos), len(errores)))
    if errores:
        print()
        print('*** %d ERROR(ES): NO des por bueno ningun fichero sin resolverlos ***' % len(errores))
        for e in errores:
            print('  - %s' % e)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
