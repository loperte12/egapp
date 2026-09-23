#!/usr/bin/env bash
# P1-a — prueba de punta a punta de la ventanilla KYC con un usuario NUEVO sin expediente.
API=http://127.0.0.1:3000/api/v1
PHONE=+240555000111
echo '== register =='
R=$(curl -s -X POST $API/mobility/auth/register -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"fullName\":\"PRUEBA KYC AUTO\"}")
echo "$R" | head -c 300; echo
OTP=$(echo "$R" | grep -oE '"devCode":"[0-9]{6}"' | grep -oE '[0-9]{6}' | head -1)
if [ -z "$OTP" ]; then
  echo '(sin devCode: intento leer la OTP de sms_logs)'
  C=$(docker ps -qf name=postgres | head -1)
  OTP=$(docker exec $C psql -U postgres -d malabogo -tAc "select params from sms_logs where phone='$PHONE' order by created_at desc limit 1" 2>/dev/null | grep -oE '[0-9]{6}' | head -1)
fi
echo "OTP=$OTP"
[ -z "$OTP" ] && { echo 'SIN OTP — abort'; exit 1; }
echo '== verify-phone =='
V=$(curl -s -X POST $API/mobility/auth/verify-phone -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"otp\":\"$OTP\"}")
AT=$(echo "$V" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
echo "token len=${#AT}"; [ ${#AT} -lt 20 ] && { echo "$V" | head -c 300; exit 1; }
echo '== set-password =='
curl -s -X POST $API/mobility/auth/set-password -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"password":"PruebaKyc2026"}' | head -c 200; echo
echo '== login =='
L=$(curl -s -X POST $API/mobility/auth/login -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"PruebaKyc2026\"}")
AT=$(echo "$L" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
echo "token len=${#AT}"; [ ${#AT} -lt 20 ] && { echo "$L" | head -c 300; exit 1; }
echo '== submissions/me ANTES de iniciar =='
curl -s -w ' [http %{http_code}]' $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT" | head -c 300; echo
echo '== POST submissions (iniciar expediente) =='
S=$(curl -s -X POST $API/mobility/kyc/submissions -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"fullName":"PRUEBA KYC AUTO","birthDate":"1995-01-01","nationality":"GQ","idempotencyKey":"kyc-prueba-20260916-a"}')
echo "$S" | head -c 450; echo
SID=$(echo "$S" | grep -oE '"id":"[0-9a-fA-F-]{36}"' | head -1 | grep -oE '[0-9a-fA-F-]{36}')
echo "== submissions/me DESPUES (sid=$SID) =="
curl -s $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT" | head -c 450; echo
echo '== presign documento =='
curl -s -X POST $API/mobility/kyc/submissions/$SID/documents/presign -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"docType":"PASSPORT","side":"front","mime":"image/jpeg","bytes":1000,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' | head -c 400; echo
echo '== FIN. token de prueba para el dueño (login manual): phone=$PHONE pass=PruebaKyc2026 =='
