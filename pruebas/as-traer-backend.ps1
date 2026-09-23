# AS-01 · Trae una copia de SOLO LECTURA del backend en produccion a un espejo local.
# No escribe nada en el servidor: empaqueta src/ y prisma/ en /tmp y lo descarga por scp.
# Uso: pwsh -File pruebas\as-traer-backend.ps1
param(
  [string]$Destino = 'D:\egapp\.auditoria-servicios\backend'
)

$ErrorActionPreference = 'Stop'
$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
if (-not (Test-Path $askpass)) { Write-Error "Falta $askpass"; exit 2 }

# La clave del script askpass es una linea tipo:  @echo <clave>
$linea = (Get-Content -LiteralPath $askpass | Where-Object { $_ -match '@echo' } | Select-Object -First 1)
if (-not $linea) { Write-Error "No encontre '@echo' en $askpass"; exit 2 }
$clave = ($linea -replace '^.*@echo\s+', '').Trim()
if (-not $clave) { Write-Error "Clave vacia en $askpass"; exit 2 }

$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = 'localhost:0'

$host_ = 'root@8.218.88.237'
$remoto = '/tmp/as-backend.tar.gz'
$comunes = @('-o', 'StrictHostKeyChecking=accept-new', '-o', 'PubkeyAuthentication=no', '-o', 'PreferredAuthentications=password', '-o', 'NumberOfPasswordPrompts=1', '-o', 'ConnectTimeout=20')

Write-Output '== 1/4 empaquetando en el servidor (solo lectura) =='
& ssh @comunes $host_ "cd /opt/mirror/app && tar czf $remoto --exclude=node_modules --exclude=dist --exclude='*.bak*' src prisma package.json tsconfig.json ecosystem.config.js ecosystem.config.cjs && ls -la $remoto && sha256sum $remoto"
if ($LASTEXITCODE -ne 0) { Write-Error 'Fallo el empaquetado remoto'; exit 1 }

Write-Output '== 2/4 descargando =='
New-Item -ItemType Directory -Path $Destino -Force | Out-Null
$local = Join-Path $Destino 'as-backend.tar.gz'
& scp @comunes $host_":$remoto" $local
if ($LASTEXITCODE -ne 0) { Write-Error 'Fallo el scp'; exit 1 }

Write-Output '== 3/4 extrayendo en local =='
tar xzf $local -C $Destino
if ($LASTEXITCODE -ne 0) { Write-Error 'Fallo el tar local'; exit 1 }

Write-Output '== 4/4 limpiando el /tmp del servidor =='
& ssh @comunes $host_ "rm -f $remoto"

Write-Output '== resultado =='
Get-ChildItem -LiteralPath $Destino | Select-Object Mode, Length, Name | Format-Table -AutoSize | Out-String -Width 200
Write-Output ("ficheros .ts: " + (Get-ChildItem -LiteralPath (Join-Path $Destino 'src') -Recurse -File -Filter *.ts).Count)
Write-Output ("hash local:    " + (Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash.ToLower())
