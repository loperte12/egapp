# Ejecuta un comando en el servidor de produccion por SSH.
# Uso:  pwsh -File pruebas\servidor-ssh.ps1 -Comando "pm2 list --no-color"
#       pwsh -File pruebas\servidor-ssh.ps1 -Comando "cat /opt/mirror/app/package.json" -Salida
# La clave vive en %USERPROFILE%\.ssh\askpass-servidor.cmd (fuera del repo).
param(
  [Parameter(Mandatory = $true)][string]$Comando,
  [string]$Salida = ''
)

$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
if (-not (Test-Path $askpass)) {
  Write-Error "Falta $askpass (debe contener '@echo <clave>' en una linea)."
  exit 2
}

$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = 'localhost:0'

$args = @(
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'PubkeyAuthentication=no',
  '-o', 'PreferredAuthentications=password',
  '-o', 'NumberOfPasswordPrompts=1',
  '-o', 'ConnectTimeout=20',
  'root@8.218.88.237',
  $Comando
)

if ($Salida) {
  ssh @args 2>$null | Out-File -FilePath $Salida -Encoding utf8
  exit $LASTEXITCODE
}

ssh @args 2>$null
exit $LASTEXITCODE
