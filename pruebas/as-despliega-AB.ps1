# AS-36 · Despliegue del backend de la tanda A+B (ordenacion del catalogo + pedidos por estado).
#
# Misma receta que la tanda 4, con una mejora: al final compara el SHA256 del fichero EN EL SERVIDOR
# con el del fichero LOCAL. Sin eso, "he subido el fichero" no es una prueba de nada.
#
# Uso: powershell -File pruebas\as-despliega-AB.ps1
$ErrorActionPreference = 'Continue'
$ssh = 'D:\egapp\pruebas\servidor-ssh.ps1'
$subir = 'D:\egapp\pruebas\servidor-subir.ps1'
$base = 'D:\egapp\.auditoria-servicios\backend'
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$SALUD = 'https://hk.egrouteplan.com/api/v1/mobility/health'

# Ficheros a desplegar. Rutas CON separador normal (el script resuelve las barras).
$ficheros = @(
  @{ local = "$base\src\ecomerse\ecomerse.service.ts";    remoto = '/opt/mirror/app/src/ecomerse/ecomerse.service.ts' },
  @{ local = "$base\src\ecomerse\ecomerse.controller.ts"; remoto = '/opt/mirror/app/src/ecomerse/ecomerse.controller.ts' },
  @{ local = "$base\src\ecomerse\ecomerse.dto.ts";        remoto = '/opt/mirror/app/src/ecomerse/ecomerse.dto.ts' }
)

function Salud([string]$url) {
  try { $r = Invoke-WebRequest -Uri $url -TimeoutSec 20 -UseBasicParsing; return ($r.StatusCode -eq 200) } catch { return $false }
}
function LocalesHasheados {
  $h = @{}
  foreach ($f in $ficheros) { $h[(Split-Path $f.remoto -Leaf)] = (Get-FileHash -LiteralPath $f.local -Algorithm SHA256).Hash.ToLower() }
  return $h
}
function RemotosHasheados {
  $script = 'sha256sum ' + (($ficheros | ForEach-Object { $_.remoto }) -join ' ')
  $salida = & $ssh -Comando $script
  $h = @{}
  foreach ($l in $salida) {
    if ($l -match '^([0-9a-f]{64})\s+(.+)$') { $h[(Split-Path $Matches[2].Trim() -Leaf)] = $Matches[1] }
  }
  return $h
}

Write-Output '== 1) salud ANTES =='
if (-not (Salud $SALUD)) { Write-Output '  La API no responde antes de empezar. NO se despliega.'; exit 1 }
Write-Output "  API en pie"

$localAntes = LocalesHasheados
$remotoAntes = RemotosHasheados
Write-Output '== 2) comparacion ANTES (para saber que cambia de verdad) =='
foreach ($k in $localAntes.Keys) {
  $igual = $localAntes[$k] -eq $remotoAntes[$k]
  Write-Output ("  {0,-26} {1}" -f $k, ($(if ($igual) { 'IDENTICO en el servidor' } else { 'DIFIERE (se va a actualizar)' })))
}

Write-Output '== 3) copia de seguridad en el servidor =='
foreach ($f in $ficheros) { & $ssh -Comando ("cp -n " + $f.remoto + " " + $f.remoto + ".bak-AB-" + $sello) | Out-Null }
Write-Output ("  copias creadas: " + ((& $ssh -Comando ("ls /opt/mirror/app/src/ecomerse/*.bak-AB-" + $sello + " 2>/dev/null | wc -l")) -join ''))

Write-Output '== 4) subiendo =='
foreach ($f in $ficheros) {
  Write-Output ("  -> " + (Split-Path $f.local -Leaf))
  & $subir -Local $f.local -Remoto $f.remoto | Out-Null
}

Write-Output '== 5) comprobando que el servidor tiene EXACTAMENTE mis ficheros =='
$remotoDespues = RemotosHasheados
$todoIgual = $true
foreach ($k in $localAntes.Keys) {
  $igual = $localAntes[$k] -eq $remotoDespues[$k]
  if (-not $igual) { $todoIgual = $false }
  Write-Output ("  {0,-26} {1}" -f $k, ($(if ($igual) { 'COINCIDE (sha256)' } else { 'NO COINCIDE' })))
}
if (-not $todoIgual) { Write-Output '  Los ficheros no coinciden: NO se compila nada.'; exit 1 }

Write-Output '== 6) compilando =='
$build = & $ssh -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json 2>&1 | tail -25; echo "EXITCODE:$?"'
$build | ForEach-Object { "  $_" }
if ((($build | Out-String) -match 'error TS') -or -not (($build | Out-String) -match 'EXITCODE:0')) {
  Write-Output '  COMPILACION FALLIDA: vuelta atras.'
  foreach ($f in $ficheros) { & $ssh -Comando ("cp " + $f.remoto + ".bak-AB-" + $sello + " " + $f.remoto) | Out-Null }
  & $ssh -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json >/dev/null 2>&1; pm2 restart malabogo-api >/dev/null 2>&1; sleep 10' | Out-Null
  Write-Output ("  restaurado. API en pie: " + (Salud $SALUD))
  exit 1
}
Write-Output '  compilado sin errores'

Write-Output '== 7) reinicio y salud =='
& $ssh -Comando 'pm2 restart malabogo-api >/dev/null 2>&1; sleep 12; pm2 list --no-color | grep malabogo-api' | ForEach-Object { "  $_" }
Start-Sleep -Seconds 3
$ok = Salud $SALUD
Write-Output ("  salud: " + $ok)
if (-not $ok) {
  Write-Output '  VUELTA ATRAS AUTOMATICA'
  foreach ($f in $ficheros) { & $ssh -Comando ("cp " + $f.remoto + ".bak-AB-" + $sello + " " + $f.remoto) | Out-Null }
  & $ssh -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json >/dev/null 2>&1; pm2 restart malabogo-api >/dev/null 2>&1; sleep 12' | Out-Null
  Write-Output ("  restaurado, API en pie: " + (Salud $SALUD))
  exit 1
}
Write-Output ''
Write-Output ('DESPLIEGUE CORRECTO · copias: *.bak-AB-' + $sello)
