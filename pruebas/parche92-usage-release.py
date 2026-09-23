#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# parche92-usage-release.py — decisión del dueño 17-09-2026 (diseño P1-c §2.2,
# línea 68): el RELEASE neto que cobra un conductor al liquidar un viaje entra
# como INGRESO suyo («depósito virtual») en el uso DEPOSIT de hoy del monedero.
# NUNCA bloquea el pago de un viaje en marcha: el asiento se escribe igual; lo
# que pasa a contar es el cupo cuando el conductor INTENTA depositar efectivo.
# Los ESCROW_REFUND (devoluciones al dueño del dinero) NO suman ingreso.
#
# Un solo ancla en src/services/wallet.service.ts (usageToday). Verifica antes
# de escribir; copia .bak-usage-release-20260917; idempotente por marcador.
import shutil, sys, io

F = '/opt/mirror/app/src/services/wallet.service.ts'
BAK = F + '.bak-usage-release-20260917'
MARK = 'P1-c ingreso virtual'

OLD = """    // WITHDRAWAL cuenta también las PENDING: el hold ya está comprometido.
    const rows: any[] = type === 'DEPOSIT'
      ? await tx.$queryRaw`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM transactions
          WHERE type = 'DEPOSIT'::tx_type AND status = 'COMPLETED'
"""

NEW = """    // WITHDRAWAL cuenta también las PENDING: el hold ya está comprometido.
    // P1-c """ + MARK + """ (dueño 17-09-2026): el RELEASE que cobra un
    // conductor por viaje liquidado entra como INGRESO suyo — «depósito virtual
    // neto de fee» del diseño §2.2 — y suma al cupo DEPOSIT de HOY. No bloquea
    // nunca un pago (el asiento se escribe igual): solo se nota al intentar
    // depositar efectivo por agente. Los ESCROW_REFUND NO suman: es el dinero
    // de uno volviendo, no un ingreso. (Afecta igual al vendedor del escrow
    // comercial: mismo principio, decidido por el dueño.)
    const rows: any[] = type === 'DEPOSIT'
      ? await tx.$queryRaw`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM transactions
          WHERE type IN ('DEPOSIT', 'ESCROW_RELEASE') AND status = 'COMPLETED'
"""

src = io.open(F, 'r', encoding='utf-8').read()
if MARK in src:
    print('SKIP: ya aplicado'); sys.exit(0)
n = src.count(OLD)
if n != 1:
    print('FALLO: ancla encontrada %d veces (se esperaba 1)' % n); sys.exit(1)
shutil.copyfile(F, BAK)
io.open(F, 'w', encoding='utf-8', newline='').write(src.replace(OLD, NEW))
print('OK: usageToday cuenta RELEASE como ingreso; copia en', BAK)
