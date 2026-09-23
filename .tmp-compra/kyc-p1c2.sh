#!/usr/bin/env bash
# P1-a (2a parte, corregida): hash REAL del documento, campos del presign a la vista.
API=http://127.0.0.1:3000/api/v1
PHONE=+240555000111
OTP=$(curl -s -X POST $API/mobility/auth/resend-otp -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}" >/dev/null; sleep 1; pm2 logs malabogo-api --lines 30 --nostream 2>/dev/null | grep -F "$PHONE" | tail -1 | grep -oE 'es [0-9]{6}' | grep -oE '[0-9]{6}')
V=$(curl -s -X POST $API/mobility/auth/verify-phone -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"otp\":\"$OTP\"}")
L=$(curl -s -X POST $API/mobility/auth/login -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"PruebaKyc2026\"}")
AT=$(echo "$L" | grep -oE '"accessToken":"[^"]+' | cut -d'"' -f4)
[ ${#AT} -lt 20 ] && { echo 'SIN TOKEN'; exit 1; }
ME=$(curl -s $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT")
SID=$(echo "$ME" | grep -oE '"submissionId":"[0-9a-fA-F-]{36}"' | grep -oE '[0-9a-fA-F-]{36}')
echo "SID=$SID"
head -c 1000 /dev/urandom > /tmp/kyc-prueba.jpg
H=$(sha256sum /tmp/kyc-prueba.jpg | cut -d' ' -f1)
echo "sha256=$H"
echo '== presign =='
P=$(curl -s -X POST $API/mobility/kyc/submissions/$SID/documents/presign -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"docType\":\"PASSPORT\",\"side\":\"front\",\"mime\":\"image/jpeg\",\"bytes\":1000,\"sha256\":\"$H\"}")
echo "$P" | head -c 500; echo
URL=$(echo "$P" | grep -oE '"(uploadUrl|url)":"[^"]+' | head -1 | cut -d'"' -f4)
KEY=$(echo "$P" | grep -oE '"(storageKey|key)":"[^"]+' | head -1 | cut -d'"' -f4)
echo "== PUT a $KEY =="
curl -s -o /dev/null -w 'put -> %{http_code}\n' -X PUT --data-binary @/tmp/kyc-prueba.jpg -H 'Content-Type: image/jpeg' "$URL"
echo '== complete =='
C0=$(curl -s -X POST $API/mobility/kyc/submissions/$SID/documents/complete -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"docType\":\"PASSPORT\",\"side\":\"front\",\"mime\":\"image/jpeg\",\"bytes\":1000,\"sha256\":\"$H\",\"storageKey\":\"$KEY\"}")
echo "$C0" | head -c 300; echo
echo '== challenge =='
C=$(curl -s -X POST $API/mobility/kyc/submissions/$SID/biometrics/challenge -H "Authorization: Bearer $AT")
echo "$C" | head -c 260; echo
CH=$(echo "$C" | grep -oE '"(challengeId|id)":"[^"]+' | head -1 | cut -d'"' -f4)
H64=$(printf 'a%.0s' $(seq 64))
echo '== verify (firma mock) =='
curl -s -X POST $API/mobility/kyc/submissions/$SID/biometrics/verify -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"challengeId\":\"$CH\",\"sessionSignature\":\"$H64\",\"framesSha256\":[\"$H64\"],\"captureTimestamps\":[$(date +%s%3N)]}" | head -c 320; echo
echo '== estado tras 5 s =='
sleep 5
curl -s $API/mobility/kyc/submissions/me -H "Authorization: Bearer $AT" | head -c 480; echo
echo '== wallet tras nivel =='
curl -s $API/wallet -H "Authorization: Bearer $AT" | head -c 260; echo
