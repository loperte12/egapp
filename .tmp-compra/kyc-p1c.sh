#!/usr/bin/env bash
# P1-a (2a parte): subir documento y biometria con el sid BIEN parseado (submissionId).
API=http://127.0.0.1:3000/api/v1
PHONE=+240555000111
OTP=$(curl -s -X POST $API/mobility/auth/resend-otp -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}" >/dev/null; sleep 1; pm2 logs malabogo-api --lines 30 --nostream 2>/dev/null | grep -F "$PHONE" | tail -1 | grep -oE 'es [0-9]{6}' | grep -oE '[0-9]{6}')
V=$(curl -s -X POST $API/mobility/auth/verify-phone -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"otp\":\"$OTP\"}")
AT=$(echo "$V" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
L=$(curl -s -X POST $API/mobility/auth/login -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"PruebaKyc2026\"}")
AT=$(echo "$L" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
[ ${#AT} -lt 20 ] && { echo 'SIN TOKEN'; exit 1; }
ME=$(curl -s $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT")
SID=$(echo "$ME" | grep -oE '"submissionId":"[0-9a-fA-F-]{36}"' | grep -oE '[0-9a-fA-F-]{36}')
echo "SID=$SID"
H64=$(printf 'a%.0s' $(seq 64))
echo '== presign =='
P=$(curl -s -X POST $API/mobility/kyc/submissions/$SID/documents/presign -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"docType\":\"PASSPORT\",\"side\":\"front\",\"mime\":\"image/jpeg\",\"bytes\":1000,\"sha256\":\"$H64\"}")
echo "$P" | head -c 350; echo
URL=$(echo "$P" | grep -oE '"url":"[^"]+' | cut -d'"' -f4)
KEY=$(echo "$P" | grep -oE '"(storageKey|key)":"[^"]+' | cut -d'"' -f4)
echo "== PUT 1000 bytes a MinIO (key=$KEY) =="
head -c 1000 /dev/urandom > /tmp/kyc-prueba.bin
curl -s -o /dev/null -w 'put -> %{http_code}\n' -X PUT --data-binary @/tmp/kyc-prueba.bin -H 'Content-Type: image/jpeg' "$URL"
echo '== complete =='
curl -s -X POST $API/mobility/kyc/submissions/$SID/documents/complete -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"docType\":\"PASSPORT\",\"side\":\"front\",\"mime\":\"image/jpeg\",\"bytes\":1000,\"sha256\":\"$H64\",\"storageKey\":\"$KEY\"}" | head -c 300; echo
echo '== biometrics/challenge =='
C=$(curl -s -X POST $API/mobility/kyc/submissions/$SID/biometrics/challenge -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{}')
echo "$C" | head -c 250; echo
CH=$(echo "$C" | grep -oE '"challengeId":"[^"]+' | cut -d'"' -f4)
echo '== biometrics/verify (mock) =='
curl -s -X POST $API/mobility/kyc/submissions/$SID/biometrics/verify -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"challengeId\":\"$CH\",\"sessionSignature\":\"$H64\",\"framesSha256\":[\"$H64\"],\"captureTimestamps\":[$(date +%s%3N)]}" | head -c 300; echo
echo '== estado tras 4 s (workers) =='
sleep 4
curl -s $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT" | head -c 420; echo
echo '== wallet tras nivel =='
curl -s $API/wallet -H "Authorization: Bearer $AT" | head -c 250; echo
