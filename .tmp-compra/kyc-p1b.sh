#!/usr/bin/env bash
# P1-a — ventanilla KYC de punta a punta con usuario nuevo (OTP leida del log [sms:dev]).
API=http://127.0.0.1:3000/api/v1
PHONE=+240555000111
echo '== resend-otp =='
curl -s -X POST $API/mobility/auth/resend-otp -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}" | head -c 160; echo
sleep 2
OTP=$(pm2 logs malabogo-api --lines 40 --nostream 2>/dev/null | grep -F "$PHONE" | tail -1 | grep -oE 'es [0-9]{6}' | grep -oE '[0-9]{6}')
echo "OTP=$OTP"
[ -z "$OTP" ] && { echo 'SIN OTP — abort'; exit 1; }
echo '== verify-phone =='
V=$(curl -s -X POST $API/mobility/auth/verify-phone -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"otp\":\"$OTP\"}")
AT=$(echo "$V" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
echo "token len=${#AT}"; [ ${#AT} -lt 20 ] && { echo "$V" | head -c 300; exit 1; }
echo '== set-password =='
curl -s -X POST $API/mobility/auth/set-password -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"password":"PruebaKyc2026"}' | head -c 160; echo
echo '== login =='
L=$(curl -s -X POST $API/mobility/auth/login -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"PruebaKyc2026\"}")
AT=$(echo "$L" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
RT=$(echo "$L" | grep -oE '"refreshToken":"[^"]+' | cut -d'"' -f4)
echo "access len=${#AT} refresh len=${#RT}"; [ ${#AT} -lt 20 ] && { echo "$L" | head -c 300; exit 1; }
echo '== wallet ANTES (debe existir con saldo 0 y limite por nivel 0) =='
curl -s $API/wallet -H "Authorization: Bearer $AT" | head -c 300; echo
echo '== submissions/me ANTES =='
curl -s -w ' [http %{http_code}]' $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT" | head -c 300; echo
echo '== POST submissions (iniciar expediente) =='
S=$(curl -s -X POST $API/mobility/kyc/submissions -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"fullName":"PRUEBA KYC AUTO","birthDate":"1995-01-01","nationality":"GQ","idempotencyKey":"kyc-prueba-20260916-b"}')
echo "$S" | head -c 500; echo
SID=$(echo "$S" | grep -oE '"id":"[0-9a-fA-F-]{36}"' | head -1 | grep -oE '[0-9a-fA-F-]{36}')
echo "== submissions/me DESPUES (sid=$SID) =="
curl -s $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT" | head -c 500; echo
echo '== presign documento =='
curl -s -X POST $API/mobility/kyc/submissions/$SID/documents/presign -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"docType":"PASSPORT","side":"front","mime":"image/jpeg","bytes":1000,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' | head -c 420; echo
echo "== FIN. Guarda estos datos para la app: phone=$PHONE pass=PruebaKyc2026 token_refresh=${RT:0:18}... =="
