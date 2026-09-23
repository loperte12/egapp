# Sube un fichero local al servidor de produccion por SCP.
# Uso:  pwsh -File pruebas\servidor-subir.ps1 -Local "D:\egapp\x.py" -Remoto "/root/x.py"
param(
  [Parameter(Mandatory = $true)][string]$Local,
  [Parameter(Mandatory = $true)][string]$Remoto
)

$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
if (-not (Test-Path $askpass)) {
  Write-Error "Falta $askpass (debe contener '@echo <clave>' en una linea)."
  exit 2
}

$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = 'localhost:0'

scp -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no `
    -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 -o ConnectTimeout=20 `
    $Local "root@8.218.88.237:$Remoto" 2>$null
exit $LASTEXITCODE
