#!/usr/bin/env bash
cd /opt/mirror/app
DBU=$(grep -m1 '^DATABASE_URL=' .env | sed -E 's|.*://([^:@]+).*|\1|')
DBN=$(grep -m1 '^DATABASE_URL=' .env | sed -E 's|.*:5432/([^?]+).*|\1|')
echo "user=$DBU db=$DBN"
echo '== UPDATE =='
docker exec mirror-postgres psql -U "$DBU" -d "$DBN" -c "UPDATE wallets SET daily_limit = 1000000 WHERE daily_limit <= 100000;" || echo 'PSQL FAIL'
echo '== BUILD =='
npm run build >/tmp/build-1m.log 2>&1 && echo BUILD_OK || { echo BUILD_FAIL; tail -25 /tmp/build-1m.log; }
echo '== RESTART =='
pm2 restart malabogo-api --update-env >/dev/null 2>&1 && echo RESTARTED || echo RESTART_FAIL
sleep 7
T=$(curl -s -X POST http://127.0.0.1:3000/api/v1/mobility/auth/login -H 'Content-Type: application/json' -d '{"phone":"+240555000111","password":"PruebaKyc2026"}' | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
echo '== GET /wallet (L2 de prueba, espera dailyLimit 1000000) =='
curl -s http://127.0.0.1:3000/api/v1/wallet -H "Authorization: Bearer $T" | head -c 230; echo
