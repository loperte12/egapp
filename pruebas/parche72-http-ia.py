# =============================================================================
# parche72 — los códigos del asistente, con su HTTP
#
# Sin esto salían como 422 (el cajón por defecto): «falta la clave» es un 503 (el servicio no está
# listo), «has agotado los mensajes de hoy» es un 429, y «no se pudo contactar con la IA» es un 502.
# El HTTP importa: la app decide con él si reintentar, avisar o decir que no está configurado.
#
# Uso en el servidor:  python3 /root/parche72-http-ia.py
# =============================================================================
import shutil
import sys

SELLO = 'http-ia-20260215'
P = '/opt/mirror/app/src/http/error.filter.ts'

VIEJO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,"""

NUEVO = """  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,
  // Asistente de IA (tanda M). El HTTP dice qué hacer: 503 = no está listo (falta la clave),
  // 429 = se acabó el cupo de hoy, 502 = el proveedor no contesta.
  AI_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_LIMIT: HttpStatus.TOO_MANY_REQUESTS,
  AI_MESSAGE_REQUIRED: HttpStatus.BAD_REQUEST,
  AI_UNREACHABLE: HttpStatus.BAD_GATEWAY,
  AI_FAILED: HttpStatus.BAD_GATEWAY,"""


def main():
    src = open(P, encoding='utf-8').read()
    if 'AI_NOT_CONFIGURED' in src:
        print('PARECE YA APLICADO: no se toca nada.')
        return 1
    n = src.count(VIEJO)
    if n != 1:
        print(f'FALLO: esperaba 1 aparición y hay {n}. NO SE ESCRIBE NADA.')
        return 1
    shutil.copyfile(P, f'{P}.bak-{SELLO}')
    print(f'respaldo: {P}.bak-{SELLO}')
    open(P, 'w', encoding='utf-8', newline='').write(src.replace(VIEJO, NUEVO))
    print('escrito error.filter.ts (los códigos del asistente)')
    return 0


sys.exit(main())
