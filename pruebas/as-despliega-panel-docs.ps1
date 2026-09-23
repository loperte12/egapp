# Instala la pantalla de moderacion de documentacion en el panel web de admin.
#
# Decision de diseno: NO se toca el bundle minificado del panel. Se anade un archivo nuevo
# (assets/ecomerse-docs.js) y una linea <script> en index.html. Si algo va mal, la vuelta atras es
# restaurar index.html y borrar el archivo: el panel queda byte a byte como estaba.
$ErrorActionPreference = 'Stop'

$origen = 'D:\egapp\.auditoria-servicios\web-admin\ecomerse-docs.js'
$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
$sshP = 'D:\egapp\pruebas\as-servidor.ps1'

function Hash([string]$ruta) { (Get-FileHash -LiteralPath $ruta -Algorithm SHA256).Hash.ToLower() }
function Paso([string]$t) { Write-Output ''; Write-Output "=== $t ===" }

# --- 0) el archivo debe pasar una comprobacion de sintaxis antes de salir de aqui ---
Paso '0) sintaxis del JS'
& node --check $origen
if ($LASTEXITCODE -ne 0) { Write-Error "ecomerse-docs.js tiene errores de sintaxis." }
$hLocal = Hash $origen
Write-Output ("OK  sha256 {0}" -f $hLocal.Substring(0,16))

# --- 1) enviar ---
Paso '1) enviar el archivo'
$env:SSH_ASKPASS = $askpass; $env:SSH_ASKPASS_REQUIRE = 'force'; $env:DISPLAY = 'localhost:0'
& scp -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 $origen root@8.218.88.237:/tmp/ecomerse-docs.js 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { Write-Error 'scp fallo' }
Write-Output 'enviado a /tmp/ecomerse-docs.js'

# --- 2) instalar ---
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $env:TEMP "as-panel-$stamp"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$sh = Join-Path $dir 'instala.sh'
# El sello se escribe DENTRO del script: pasarlo como argumento por cmd/ssh se perdia (salio una
# carpeta «.bak-docs-» sin sello). Incrustarlo evita toda la pelea con el escapado.
$cuerpo = (Get-Content -LiteralPath 'D:\egapp\.auditoria-servicios\instala-panel-docs.sh' -Raw)
$cuerpo = ($cuerpo -replace "`r`n","`n") -replace 'STAMP=\$1', "STAMP=$stamp"
[System.IO.File]::WriteAllText($sh, $cuerpo, (New-Object System.Text.ASCIIEncoding))

Paso '2) instalar en el servidor'
$salida = & $sshP -Remoto $sh
$salida | ForEach-Object { Write-Output "  $_" }

# --- 3) el archivo que quedo en el servidor debe ser identico al mio ---
Paso '3) comprobar que el archivo servido es el mio'
$chk = Join-Path $dir 'chk.sh'
$cuerpoChk = @'
sha256sum /opt/mirror/web-admin/assets/ecomerse-docs.js
'@
[System.IO.File]::WriteAllText($chk, ($cuerpoChk -replace "`r`n","`n"), (New-Object System.Text.ASCIIEncoding))
$hRemoto = (& $sshP -Remoto $chk | Out-String).Trim().Split(' ')[0].ToLower()
Write-Output ("  local:    {0}" -f $hLocal.Substring(0,16))
Write-Output ("  servidor: {0}" -f $hRemoto.Substring(0,16))
if ($hRemoto -ne $hLocal) {
  Paso '3-bis) VUELTA ATRAS (el archivo no coincide)'
  $rb = Join-Path $dir 'rollback.sh'
  $cuerpoRb = @'
STAMP=$1
cd /opt/mirror/web-admin
cp .bak-docs-$STAMP/index.html index.html
rm -f assets/ecomerse-docs.js
echo "restaurado index.html y borrado el archivo"
'@
  [System.IO.File]::WriteAllText($rb, (($cuerpoRb -replace "`r`n","`n") + "`n" + "`n"), (New-Object System.Text.ASCIIEncoding))
  & $sshP -Remoto $rb
  Write-Error 'El archivo del servidor no coincide con el mio: se restauro el panel.'
}
Write-Output 'Coincide: el panel sirve exactamente mi archivo.'
Write-Output ''
Write-Output "LISTO  (copia del original: /opt/mirror/web-admin/.bak-docs-$stamp/)"
Write-Output "Pantalla: https://hk.egrouteplan.com/admin/ecomerse-docs"
