#!/usr/bin/env bash
cd /opt/mirror/app
echo '== quien implementa SmsSender (mock o twilio) =='
grep -n -i -e 'SmsSender' -e 'class.*Sender' -e 'mock' src/services/otp.service.ts | head -14
echo '== SMS_PROVIDER del entorno (valor si, no secretos) =='
grep -m1 '^SMS_PROVIDER=' .env
grep -m1 '^NODE_ENV=' .env
echo '== otp.service: como manda el codigo =='
grep -n -A6 -e 'sendOtp\|async send' src/services/otp.service.ts | head -40
echo '== registro en pm2 log del codigo (mock loguea?) =='
pm2 logs malabogo-api --lines 300 --nostream 2>/dev/null | grep -i -e '555000111' -e 'otp' | tail -8
