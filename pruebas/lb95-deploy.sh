#!/bin/bash
# lb95-deploy.sh — despliega P1-c (liquidación de viajes) en el servidor.
# Pre: /root/p1c/ride-settlement.service.ts + /root/p1c/ride-settlement.controller.ts
#      /root/86-liquidacion-viajes.sql + /root/parche91-ride-settlement.py
set -uo pipefail
cd /opt/mirror/app

echo "== 0. pre =="
for f in /root/p1c/ride-settlement.service.ts /root/p1c/ride-settlement.controller.ts \
         /root/86-liquidacion-viajes.sql /root/parche91-ride-settlement.py; do
  [ -f "$f" ] || { echo "FALTA $f"; exit 1; }
done

echo "== 1. ficheros nuevos en su sitio =="
cp -v /root/p1c/ride-settlement.service.ts src/services/ride-settlement.service.ts
cp -v /root/p1c/ride-settlement.controller.ts src/http/ride-settlement.controller.ts

echo "== 2. SQL 86 (enums + políticas + columnas) — idempotente =="
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -v ON_ERROR_STOP=1 -f - < /root/86-liquidacion-viajes.sql | tail -8 || { echo "SQL-FALLO"; exit 1; }

echo "== 3. parche91 (verifica TODOS los anclajes antes de escribir) =="
python3 /root/parche91-ride-settlement.py || exit 1

echo "== 4. regenerar cliente prisma (wallet) =="
npx prisma generate 2>&1 | tail -4

echo "== 5. typecheck estricto =="
if npx tsc -p tsconfig.json --noEmit 2>&1 | head -40; then :; fi
TSC=$(npx tsc -p tsconfig.json --noEmit 2>&1 | grep -c "error TS" || true)
echo "TSC-ERRORES=$TSC"
if [ "$TSC" != "0" ]; then
  echo "TSC-FALLO — no se compila ni reinicia."
  exit 1
fi

echo "== 6. compilar y reiniciar =="
npx tsc -p tsconfig.json || { echo "BUILD-FALLO"; exit 1; }
pm2 restart malabogo-api --update-env >/dev/null 2>&1
sleep 4
pm2 ls | grep malabogo || true
echo "health: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1/auth/payment-token)"
echo "rides  (401 esperado): $(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/v1/rides/x/lock)"
echo "DEPLOY-HECHO"
