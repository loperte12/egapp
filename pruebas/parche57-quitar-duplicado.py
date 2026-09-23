# =============================================================================
# parche57 — quitar el SHOP_REQUIRED duplicado
#
# El parche 56 añadió `SHOP_REQUIRED: BAD_REQUEST` sin saber que ya existía más abajo como
# CONFLICT: TypeScript no deja dos claves iguales en el mismo objeto y el build no se aplicó.
# Se queda el que ya estaba (409: «no puedes porque ya tienes tienda / te falta tienda» es un
# conflicto con el estado, no una petición mal formada).
#
# Uso en el servidor:  python3 /root/parche57-quitar-duplicado.py
# =============================================================================
import sys

P = '/opt/mirror/app/src/http/error.filter.ts'
LINEA = "  SHOP_REQUIRED: HttpStatus.BAD_REQUEST,\n"


def main():
    src = open(P, encoding='utf-8').read()
    n = src.count(LINEA)
    if n != 1:
        print(f'FALLO: esperaba 1 línea duplicada y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(LINEA, ''))
    print('quitada la línea duplicada de SHOP_REQUIRED')
    return 0


sys.exit(main())
