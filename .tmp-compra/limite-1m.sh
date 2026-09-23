#!/usr/bin/env bash
set -e
cd /opt/mirror/app
cp src/services/kyc-gate.service.ts src/services/kyc-gate.service.ts.bak-limite-1m-20260916
cp src/services/wallet.service.ts src/services/wallet.service.ts.bak-limite-1m-20260916
# 1) politica L2: 100k -> 1M diario (por-op sigue 100k, PER_OPERATION_LIMIT manda)
sed -i 's/level: 2, dailyLimit: 100_000, perOpMax: 100_000/level: 2, dailyLimit: 1_000_000, perOpMax: 100_000/' src/services/kyc-gate.service.ts
# 2) provisioned: la columna nacia con default 100000 -> que nazca en 1M
sed -i 's/await tx.wallet.create({ data: { userId: user.id } });/await tx.wallet.create({ data: { userId: user.id, dailyLimit: 1_000_000 } });/' src/services/kyc-gate.service.ts
# 3) etiqueta honesta: el GET muestra el limite EFECTIVO min(columna, politica)
sed -i "s/await this.gate.enforce(userId, 'READ');/const pol = await this.gate.enforce(userId, 'READ');/" src/services/wallet.service.ts
sed -i 's/const limit = Number(wallet.dailyLimit);/const limit = Math.min(Number(wallet.dailyLimit), pol.dailyLimit);/' src/services/wallet.service.ts
grep -n -e 'dailyLimit: 1_000_000' -e 'Math.min(Number(wallet.dailyLimit), pol' src/services/kyc-gate.service.ts src/services/wallet.service.ts
# 4) columnas existentes: subir a 1M las de default viejo (la politica del gate sigue recortando a L0/L1)
DBU=$(grep -m1 '^DATABASE_URL=' .env | sed -E 's|.*://([^:@]+).*|\1|')
DBN=$(grep -m1 '^DATABASE_URL=' .env | sed -E 's|.*/([^/?]+)\??$|\1|; s|\?.*||')
docker exec mirror-postgres psql -U "$DBU" -d "$DBN" -c "UPDATE wallets SET daily_limit = 1000000 WHERE daily_limit <= 100000;"
# 5) compilar y reiniciar
npm run build >/tmp/build-1m.log 2>&1 && echo BUILD_OK || { echo BUILD_FAIL; tail -20 /tmp/build-1m.log; exit 1; }
pm2 restart malabogo-api --update-env >/dev/null && echo RESTARTED
sleep 6
# 6) verificacion: usuario L2 de prueba debe ver ahora su limite real
T=$(curl -s -X POST http://127.0.0.1:3000/api/v1/mobility/auth/login -H 'Content-Type: application/json' -d '{"phone":"+240555000111","password":"PruebaKyc2026"}' | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
curl -s http://127.0.0.1:3000/api/v1/wallet -H "Authorization: Bearer $T" | head -c 220; echo
