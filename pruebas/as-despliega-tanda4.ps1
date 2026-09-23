# AS-33 · Despliegue del backend de la tanda 4 CON vuelta atras automatica.
#
# Regla de la casa: cada despliegue con comprobacion de salud y vuelta atras automatica
# (en una sesion anterior un cambio de inyeccion de dependencias tumbo la API en produccion).
#
# Que hace, en orden:
#   1. Comprueba que la API responde AHORA (si ya esta caida, no se toca nada).
#   2. Copia de seguridad con fecha de cada fichero que se va a sustituir.
#   3. Sube los ficheros nuevos.
#   4. Compila (tsc). Si falla la compilacion -> vuelta atras y sale.
#   5. Reinicia pm2 y espera.
#   6. Comprueba salud. Si falla -> vuelta atras (restaura los .bak, recompila, reinicia) y sale.
#
# Uso: pwsh -File pruebas\as-despliega-tanda4.ps1
$ErrorActionPreference = 'Continue'
$ssh = 'D:\egapp\pruebas\servidor-ssh.ps1'
$subir = 'D:\egapp\pruebas\servidor-subir.ps1'
$base = 'D:\egapp\.auditoria-servicios\backend'
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$SALUD = 'https://hk.egrouteplan.com/api/v1/mobility/health'
$FLAGS = 'https://hk.egrouteplan.com/api/ecomerse/flags'

# Ficheros a desplegar: local -> remoto
$ficheros = @(
  @{ local = "$base\src\ecomerse\ecomerse.dto.ts";    remoto = '/opt/mirror/app/src/ecomerse/ecomerse.dto.ts' },
  @{ local = "$base\src\ecomerse\ecomerse.service.ts"; remoto = '/opt/mirror/app/src/ecomerse/ecomerse.service.ts' },
  @{ local = 'D:\egapp\backend\sql\019_ecomerse_publicacion.sql'; remoto = '/opt/mirror/app/sql/019_ecomerse_publicacion.sql' }
)

function Salud([string]$url) {
  try { $r = Invoke-WebRequest -Uri $url -TimeoutSec 20 -UseBasicParsing; return ($r.StatusCode -eq 200) }
  catch { return $false }
}

Write-Output '== 1) salud ANTES del despliegue =='
if (-not (Salud $SALUD)) { Write-Output '  La API no responde ya antes de tocar nada. NO se despliega.'; exit 1 }
Write-Output "  API en pie ($SALUD)"

Write-Output '== 2) copia de seguridad en el servidor =='
foreach ($f in $ficheros) {
  & $ssh -Comando ("cp -n " + $f.remoto + " " + $f.remoto + ".bak-tanda4-" + $sello) | Out-Null
}
& $ssh -Comando ("ls -la /opt/mirror/app/src/ecomerse/ | grep tanda4-" + $sello + " | wc -l")

Write-Output '== 3) subiendo ficheros =='
foreach ($f in $ficheros) {
  Write-Output ("  -> " + (Split-Path $f.local -Leaf))
  & $subir -Local $f.local -Remoto $f.remoto | Out-Null
}
# El SQL va tambien a la carpeta sql/ del servidor como historial, ademas de a /tmp para aplicarlo.

Write-Output '== 4) compilando en el servidor =='
$build = & $ssh -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json 2>&1 | tail -20; echo "EXITCODE:$?"'
$build | ForEach-Object { "  $_" }
$buildTxt = ($build | Out-String)
if ($buildTxt -match 'error TS' -or $buildTxt -notmatch 'EXITCODE:0') {
  Write-Output '  LA COMPILACION HA FALLADO: se restaura todo.'
  foreach ($f in $ficheros) { & $ssh -Comando ("cp " + $f.remoto + ".bak-tanda4-" + $sello + " " + $f.remoto) | Out-Null }
  & $ssh -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json >/dev/null 2>&1; pm2 restart malabogo-api >/dev/null 2>&1; sleep 8' | Out-Null
  exit 1
}
Write-Output '  compilado sin errores'

Write-Output '== 5) reiniciando la API =='
& $ssh -Comando 'pm2 restart malabogo-api >/dev/null 2>&1; sleep 12; pm2 list --no-color | grep malabogo-api' | ForEach-Object { "  $_" }

Write-Output '== 6) salud DESPUES del despliegue =='
Start-Sleep -Seconds 4
$okSalud = Salud $SALUD
$okFlags = Salud $FLAGS
Write-Output ("  salud: " + $okSalud + " · flags del mercado: " + $okFlags)

if (-not ($okSalud -and $okFlags)) {
  Write-Output '  LA API NO RESPONDE: VUELTA ATRAS AUTOMATICA'
  foreach ($f in $ficheros) { & $ssh -Comando ("cp " + $f.remoto + ".bak-tanda4-" + $sello + " " + $f.remoto) | Out-Null }
  & $ssh -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json >/dev/null 2>&1; pm2 restart malabogo-api >/dev/null 2>&1; sleep 12' | Out-Null
  $rec = Salud $SALUD
  Write-Output ("  restaurado. API en pie otra vez: " + $rec)
  if (-not $rec) { Write-Output '  ATENCION: la API sigue caida tras restaurar. Revisar a mano: pm2 logs malabogo-api' }
  exit 1
}

Write-Output ''
Write-Output 'DESPLIEGUE CORRECTO. Copias en el servidor: *.bak-tanda4-'$sello
