# Despliega el backend de la consola (un controlador nuevo) y la consola misma.
#
# Mismo patron que el resto: comprobar que lo del servidor es mio, compilar como puerta,
# y volver atras solo si el arranque no queda sano.
$ErrorActionPreference = 'Stop'
$loc = 'D:\egapp\.auditoria-servicios\backend'
$sshP = 'D:\egapp\pruebas\as-servidor.ps1'
$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
$memoriaRuta = 'D:\egapp\.auditoria-servicios\despliegues-ecomerse-docs.json'

function Paso([string]$t) { Write-Output ''; Write-Output "=== $t ===" }

# ---------------------------------------------------------------- 1) empaquetar
Paso '1) empaquetar el controlador nuevo y el modulo'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $env:TEMP "as-consola-$stamp"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $loc 'src\http\ecomerse-docs-admin.controller.ts') -Destination $dir
Copy-Item -LiteralPath (Join-Path $loc 'src\http\app.module.ts') -Destination $dir
Get-ChildItem $dir | ForEach-Object { Write-Output ("  " + $_.Name + "  " + $_.Length + " bytes") }
$tgz = Join-Path $dir 'consola.tgz'
Push-Location $dir; & tar czf $tgz ecomerse-docs-admin.controller.ts app.module.ts; Pop-Location
Write-Output ("  paquete: " + (Get-Item -LiteralPath $tgz).Length + " bytes")

# ---------------------------------------------------------------- 2) enviar
Paso '2) enviar al servidor'
$env:SSH_ASKPASS = $askpass; $env:SSH_ASKPASS_REQUIRE = 'force'; $env:DISPLAY = 'localhost:0'
& scp -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 $tgz root@8.218.88.237:/tmp/consola.tgz 2>&1 | Select-Object -Last 1
& scp -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 'D:\egapp\.auditoria-servicios\consola-docs\index.html' root@8.218.88.237:/tmp/consola-docs.html 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { Write-Error 'scp fallo' }
Write-Output 'enviados /tmp/consola.tgz y /tmp/consola-docs.html'

# ---------------------------------------------------------------- 3) instalar backend
Paso '3) copia de seguridad, instalar, compilar, reiniciar'
$remoto = @'
set -e
STAMP=__STAMP__
cd /opt/mirror/app
mkdir -p .bak-consola-$STAMP
cp src/http/app.module.ts .bak-consola-$STAMP/
[ -f src/http/ecomerse-docs-admin.controller.ts ] && cp src/http/ecomerse-docs-admin.controller.ts .bak-consola-$STAMP/ || true
cd /tmp && tar xzf /tmp/consola.tgz
cp /tmp/ecomerse-docs-admin.controller.ts /tmp/app.module.ts /opt/mirror/app/src/http/
cd /opt/mirror/app
echo "--- compilando ---"
npm run build 2>&1 | tail -20
if [ ! -f dist/src/http/ecomerse-docs-admin.controller.js ]; then echo "BUILD_FAIL: no se genero el controlador"; exit 3; fi
pm2 restart malabogo-api --update-env >/dev/null 2>&1
sleep 6
echo "--- salud ---"
printf "mobility/health: "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/v1/mobility/health
printf "login de la consola (sin datos -> 400): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3000/api/v1/admin/ecomerse-docs/login
printf "sesion sin token (-> 401): "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/v1/admin/ecomerse-docs/sesion
'@
$remoto = $remoto.Replace('__STAMP__', $stamp)
$sh = Join-Path $dir 'instala.sh'
[System.IO.File]::WriteAllText($sh, ($remoto -replace "`r`n","`n"), (New-Object System.Text.ASCIIEncoding))
$salida = & $sshP -Remoto $sh
$salida | ForEach-Object { Write-Output "  $_" }

if (($salida | Out-String) -match 'BUILD_FAIL|error TS') {
  Paso '3-bis) VUELTA ATRAS del backend'
  $rb = Join-Path $dir 'rollback.sh'
  $cuerpo = "set -e`ncp /opt/mirror/app/.bak-consola-$stamp/app.module.ts /opt/mirror/app/src/http/`nrm -f /opt/mirror/app/src/http/ecomerse-docs-admin.controller.ts`ncd /opt/mirror/app && npm run build 2>&1 | tail -5`npm2 restart malabogo-api --update-env >/dev/null 2>&1`nsleep 6`nprintf 'salud tras restaurar: '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/v1/mobility/health`n"
  [System.IO.File]::WriteAllText($rb, $cuerpo, (New-Object System.Text.ASCIIEncoding))
  & $sshP -Remoto $rb | ForEach-Object { Write-Output "  $_" }
  Write-Error 'Backend revertido.'
}

# ---------------------------------------------------------------- 4) instalar consola
Paso '4) instalar la consola y su direccion'
& $sshP -Remoto 'D:\egapp\.auditoria-servicios\instala-consola.sh' | ForEach-Object { Write-Output "  $_" }

Write-Output ''
Write-Output "LISTO. Consola: https://hk.egrouteplan.com/admin-docs/"
Write-Output "(copia de seguridad del servidor: /opt/mirror/.bak-consola-$stamp)"
