#!/usr/bin/env bash
cd /opt/mirror/app
echo '===== 1) INVENTARIO: quien escribe en el ledger hoy ====='
grep -rn 'transaction.create\|transactions.create' src --include='*.ts' 2>/dev/null | grep -v -e backup -e '.spec.' -e test | head -12
echo '-- quien llama a WalletService (deposit/withdraw/escrow) --'
grep -rln 'WalletService' src --include='*.ts' | grep -v backup | head -10
echo '-- taxi/bookings: pago al cerrar viaje? --'
grep -rn -i -e 'fare' -e 'pago' -e 'pay' src/mobility/mobility.service.ts 2>/dev/null | grep -v -i 'payed\|unpaid' | head -8
echo '-- quien anota la comision --'
grep -rn 'create' src/services/fee.service.ts 2>/dev/null | head -5
echo
echo '===== 2) GET /wallet: donde nace el dailyLimit que se ensena ====='
grep -n -B2 -A8 'dailyLimit' src/services/wallet.service.ts | head -30
echo
echo '===== 3) HK: sirve el SPA? mismo bundle? ====='
curl -s -o /dev/null -w 'https://hk.egrouteplan.com/wallet/ -> %{http_code}\n' https://hk.egrouteplan.com/wallet/
echo '-- index del origen (Alibaba) --'
grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' /opt/mirror/wallet-app/index.html | head -2
echo '-- index del espejo HK (via curl) --'
curl -s https://hk.egrouteplan.com/wallet/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -2
echo
echo '===== 4) JWT de hk vs origen: misma firma? (login minimo) ====='
T=$(curl -s -X POST http://127.0.0.1:3000/api/v1/mobility/auth/login -H 'Content-Type: application/json' -d '{"phone":"+240555000111","password":"PruebaKyc2026"}' | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
curl -s -o /dev/null -w 'token de ORIGEN contra HK /wallet/api/v1/mobility/auth/me -> %{http_code}\n' https://hk.egrouteplan.com/wallet/api/v1/mobility/auth/me -H "Authorization: Bearer $T"
curl -s -o /dev/null -w 'token de ORIGEN contra HK /wallet/api/v1/wallet -> %{http_code}\n' https://hk.egrouteplan.com/wallet/api/v1/wallet -H "Authorization: Bearer $T"
