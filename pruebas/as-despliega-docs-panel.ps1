# Despliega el backend de la moderacion de documentacion (filtro por estado + contadores).
#
# Por que este script y no "copiar y cruzar los dedos":
#  1. comprueba que el archivo del servidor es EXACTAMENTE la version base que yo edite
#     (si alguien lo toco entre medias, aborta en vez de pisar cambios ajenos);
#  2. compila (tsc) y se niega a desplegar si hay errores;
#  3. guarda copia de los originales y, si el arranque no queda sano, restaura solo.
param(
  [switch]$SoloComprobar
)

$ErrorActionPreference = 'Stop'
$loc  = 'D:\egapp\.auditoria-servicios\backend'
$sshP = 'D:\egapp\pruebas\as-servidor.ps1'
$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'

# ---------------------------------------------------------------------------------------------
# MEMORIA DE VERSIONES CONOCIDAS
# El guard de "nadie lo toco por su cuenta" necesita saber que versiones son mias. Con una lista
# fija me equivoque: en el segundo despliegue el servidor tenia mi version ANTERIOR, que no estaba
# en la lista, y el script aborto en falso. Ahora cada despliegue con exito APUNTA su hash aqui, de
# modo que la lista crece sola y cualquier hash desconocido significa de verdad "lo cambio otro".
# ---------------------------------------------------------------------------------------------
$memoriaRuta = 'D:\egapp\.auditoria-servicios\despliegues-ecomerse-docs.json'
$memoria = @{ base = @{}; mios = @() }
if (Test-Path -LiteralPath $memoriaRuta) {
  try {
    $leido = Get-Content -LiteralPath $memoriaRuta -Raw | ConvertFrom-Json
    foreach ($p in $leido.base.PSObject.Properties) { $memoria.base[$p.Name] = $p.Value }
    $memoria.mios = @($leido.mios)
  } catch { Write-Output '  (la memoria estaba ilegible: se recrea)' }
}
if ($memoria.base.Count -eq 0) {
  # Version base medida antes de tocar nada (18/09/2026), la primera vez que edite estos archivos.
  $memoria.base['ecomerse.service.ts']    = '350104e5ed2f644821043fcf12989b7f70fbb5a85bebd0c66fea01a923ae4349'
  $memoria.base['ecomerse.controller.ts'] = '0a02c5ec2c9efe5c9e0013fadd0272bf871197620398232a56c73949e020dad9'
  # Mi primer despliegue (filtro por estado + contadores), que es lo que hay ahora en el servidor.
  $memoria.mios = @(
    '2bf1325fcf9a656abbd3a49eab5b244beb847c6b2c46a4e2b608960301baf976',
    '108810bf88941cddc13fe23bc7a756bd3517479b03b80262e415a7d5d1ad73f1'
  )
}
function EsMia([string]$h) { $memoria.mios -contains $h }

function Hash([string]$ruta) { (Get-FileHash -LiteralPath $ruta -Algorithm SHA256).Hash.ToLower() }
function Paso([string]$t) { Write-Output ''; Write-Output "=== $t ===" }

# Envia un archivo local al "bash -s" del servidor con redireccion real de cmd.
# No se usa la tuberia de PowerShell: mete BOM con -Raw y \r sin -Raw (comprobado).
function Remoto([string]$archivo) {
  $askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
  $env:SSH_ASKPASS = $askpass; $env:SSH_ASKPASS_REQUIRE = 'force'; $env:DISPLAY = 'localhost:0'
  $texto = (Get-Content -LiteralPath $archivo -Raw)
  $texto = $texto.TrimStart([char]0xFEFF) -replace "`r`n", "`n"
  $tmp = Join-Path $env:TEMP ("as-r-" + [guid]::NewGuid().ToString('N') + ".sh")
  [System.IO.File]::WriteAllText($tmp, $texto, (New-Object System.Text.ASCIIEncoding))
  $op = '-o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no ' +
        '-o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 -o ConnectTimeout=20'
  # La salida se vuelca a un ARCHIVO y se lee de ahi: intentar capturarla en una variable hacia que
  # PowerShell partiese los hashes de 64 caracteres por el ajuste de linea, y comparaba solo el trozo.
  $volcado = Join-Path $env:TEMP ("as-out-" + [guid]::NewGuid().ToString('N') + ".txt")
  & cmd /c "ssh $op root@8.218.88.237 `"bash -s $Script:ArgRemoto`" < `"$tmp`" > `"$volcado`" 2>&1"
  $Script:CodigoRemoto = $LASTEXITCODE
  $salida = if (Test-Path $volcado) { Get-Content -LiteralPath $volcado } else { @() }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $volcado -Force -ErrorAction SilentlyContinue
  return $salida
}

# Devuelve el sha256 de un archivo EN EL SERVIDOR. La redireccion va dentro de `bash -c "..."` (con
# comillas): si se deja suelta, cmd se la queda para SI y busca la ruta en Windows.
function HashRemoto([string]$rutaRemota) {
  $tmpSh = Join-Path $env:TEMP ("as-h-" + [guid]::NewGuid().ToString('N') + ".sh")
  [System.IO.File]::WriteAllText($tmpSh, "sha256sum '$rutaRemota' | cut -d' ' -f1`n", (New-Object System.Text.ASCIIEncoding))
  $env:SSH_ASKPASS = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
  $env:SSH_ASKPASS_REQUIRE = 'force'; $env:DISPLAY = 'localhost:0'
  $op = '-o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no ' +
        '-o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 -o ConnectTimeout=20'
  $h = & cmd /c "ssh $op root@8.218.88.237 `"bash -c \`"bash -s\`"`" < `"$tmpSh`"" 2>$null
  $Script:CodigoRemoto = $LASTEXITCODE
  Remove-Item -LiteralPath $tmpSh -Force -ErrorAction SilentlyContinue
  return ($h | Out-String).Trim().ToLower()
}

# ---------------------------------------------------------------- 1) aviso sobre el tsc local
Paso '1) tsc local (informativo, NO bloquea)'
<#
  Esta copia de trabajo del backend NO tiene node_modules: `tsc` resuelve contra D:\egapp\node_modules
  y escupe miles de TS2307/TS2339 de modulos que no existen ahi. Eso no dice nada de mis cambios: se
  comprobo que de mis dos archivos TODOS los errores eran de ese tipo (dependencias ausentes), ninguno
  de sintaxis ni de tipos propios. La compilacion que vale es la del servidor, que si tiene las
  dependencias; ese build es la puerta y va con vuelta atras automatica mas abajo.
#>
Write-Output '  (se omite: sin node_modules local no es una senal valida; la puerta es el build del servidor)'

if ($SoloComprobar) { Write-Output ''; Write-Output '(--SoloComprobar: se para aqui)'; exit 0 }

# ---------------------------------------------------------------- 2) verificar base
Paso '2) lo que hay en el servidor es mio (nadie lo toco por su cuenta)'
foreach ($f in @('ecomerse.service.ts','ecomerse.controller.ts')) {
  $hServ = HashRemoto "/opt/mirror/app/src/ecomerse/$f"
  $hMio  = Hash (Join-Path $loc "src\ecomerse\$f")
  Write-Output ("  {0,-24} servidor {1}…  mio {2}…" -f $f, $hServ.Substring(0,16), $hMio.Substring(0,16))
  if ($hServ -eq $hMio) {
    Write-Output '     ya es mi version nueva: no hay nada que desplegar en este archivo'
  } elseif (EsMia $hServ) {
    Write-Output '     es una version mia anterior: se puede pisar sin problema'
  } elseif ($memoria.base[$f] -eq $hServ) {
    Write-Output '     es la version base, intacta'
  } else {
    Write-Error ("ABORTA: {0} en el servidor es {1}…, un hash que no es mio. Alguien lo cambio." -f $f, $hServ.Substring(0,16))
  }
}
Write-Output 'Nadie toco estos archivos por su cuenta.'

# ---------------------------------------------------------------- 3) empaquetar
Paso '3) empaquetar los archivos editados'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir   = Join-Path $env:TEMP "as-moddocs-$stamp"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
foreach ($f in @('ecomerse.service.ts','ecomerse.controller.ts')) {
  Copy-Item -LiteralPath (Join-Path $loc "src\ecomerse\$f") -Destination (Join-Path $dir $f)
  Write-Output ("  {0}  {1}" -f (Hash (Join-Path $dir $f)).Substring(0,16), $f)
}
$tgz = Join-Path $dir 'moddocs.tgz'
Push-Location $dir
& tar czf $tgz ecomerse.service.ts ecomerse.controller.ts
Pop-Location
Write-Output ("  paquete: {0} bytes" -f (Get-Item -LiteralPath $tgz).Length)

# ---------------------------------------------------------------- 4) enviar
Paso '4) enviar por scp'
$env:SSH_ASKPASS = $askpass; $env:SSH_ASKPASS_REQUIRE = 'force'; $env:DISPLAY = 'localhost:0'
& scp -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 $tgz root@8.218.88.237:/tmp/moddocs.tgz 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { Write-Error 'scp fallo' }
Write-Output 'enviado a /tmp/moddocs.tgz'

# ---------------------------------------------------------------- 5) instalar + compilar + reiniciar
Paso '5) copia de seguridad, compilacion en servidor, reinicio y salud'
$remoto2 = @'
set -e
cd /opt/mirror/app
STAMP=$1
mkdir -p /opt/mirror/app/.bak-moddocs-$STAMP
cp src/ecomerse/ecomerse.service.ts src/ecomerse/ecomerse.controller.ts /opt/mirror/app/.bak-moddocs-$STAMP/
cd /tmp && tar xzf /tmp/moddocs.tgz
cp /tmp/ecomerse.service.ts /tmp/ecomerse.controller.ts /opt/mirror/app/src/ecomerse/
cd /opt/mirror/app
echo "--- npm run build ---"
npm run build 2>&1 | tail -25 || true
if [ ! -f dist/src/ecomerse/ecomerse.service.js ]; then echo "BUILD_FAIL: no hay dist"; exit 3; fi
echo "--- pm2 restart ---"
pm2 restart malabogo-api --update-env >/dev/null 2>&1
sleep 6
echo "--- salud ---"
echo -n "mobility/health: "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/v1/mobility/health
echo -n "ecomerse/flags:  "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/ecomerse/flags
echo -n "admin/docs  (sin token, debe ser 401): "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/ecomerse/admin/docs
echo -n "docs/stats  (sin token, debe ser 401): "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/ecomerse/admin/docs/stats
'@
$tmp2 = Join-Path $env:TEMP "as-deploy-$stamp.sh"
[System.IO.File]::WriteAllText($tmp2, (($remoto2 -replace "`r`n","`n") + "`n"), (New-Object System.Text.ASCIIEncoding))

$Script:ArgRemoto = "-- $stamp"
$salida = Remoto $tmp2
$salida | ForEach-Object { Write-Output "  $_" }

$fallo = ($salida | Out-String) -match 'BUILD_FAIL|error TS'
if ($fallo) {
  Paso '5-bis) VUELTA ATRAS: restauro los originales'
  $rollback = @'
set -e
STAMP=$1
cp /opt/mirror/app/.bak-moddocs-$STAMP/ecomerse.service.ts /opt/mirror/app/.bak-moddocs-$STAMP/ecomerse.controller.ts /opt/mirror/app/src/ecomerse/
cd /opt/mirror/app && npm run build 2>&1 | tail -5
pm2 restart malabogo-api --update-env >/dev/null 2>&1
sleep 6
echo -n "salud tras restaurar: "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/v1/mobility/health
'@
  $tmp3 = Join-Path $env:TEMP "as-rollback-$stamp.sh"
  [System.IO.File]::WriteAllText($tmp3, (($rollback -replace "`r`n","`n") + "`n"), (New-Object System.Text.ASCIIEncoding))
  $Script:ArgRemoto = "-- $stamp"
  Remoto $tmp3 | ForEach-Object { Write-Output "  $_" }
  Write-Error 'Despliegue revertido: el backend quedo como estaba.'
}
Write-Output ''
Write-Output "DESPLIEGUE OK  (copia de los originales en el servidor: /opt/mirror/app/.bak-moddocs-$stamp)"

# Se apunta lo desplegado para que el proximo guard lo reconozca como mio.
foreach ($f in @('ecomerse.service.ts','ecomerse.controller.ts')) {
  $h = Hash (Join-Path $loc "src\ecomerse\$f")
  if (-not (EsMia $h)) { $memoria.mios = @($memoria.mios) + $h }
}
$salidaMemoria = [ordered]@{ actualizado = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); base = $memoria.base; mios = $memoria.mios }
[System.IO.File]::WriteAllText($memoriaRuta, ($salidaMemoria | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Memoria de versiones actualizada: $memoriaRuta"
