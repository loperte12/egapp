#!/usr/bin/env bash
cd /opt/mirror/app
echo '== claves del .env (solo nombres) =='
grep -oE '^[A-Z_]+=' .env | head -22
echo '== donde vive la OTP (codigo) =='
grep -rn -i 'otp' src/mobility/mobility-auth.controller.ts 2>/dev/null | head -8
for f in $(grep -rli 'otp' src/mobility --include='*.ts' | grep -v controller | grep -v backup | head -3); do echo "-- $f"; grep -n -i -e 'otp' -e 'sms' -e 'dev' "$f" | head -6; done
DBURL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
MURL=$(grep -m1 '^MOBILITY_DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
echo '== sms_logs recientes =='
psql "$DBURL" -tAc "select phone,template,left(params::text,90),created_at from sms_logs order by created_at desc limit 2" 2>&1 | head -4
echo '== tablas con columnas otp en cada base =='
echo "main:"; psql "$DBURL" -tAc "select table_name||'.'||column_name from information_schema.columns where column_name ilike '%otp%' limit 8" 2>&1 | head -9
echo "mobility:"; psql "$MURL" -tAc "select table_name||'.'||column_name from information_schema.columns where column_name ilike '%otp%' limit 8" 2>&1 | head -9
