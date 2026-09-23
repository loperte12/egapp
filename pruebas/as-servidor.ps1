# Ejecuta un bloque de shell multilinea en el servidor por SSH, sin pelearse con el escapado.
# Uso:  pwsh -File pruebas\as-servidor.ps1 -Remoto ruta\script.sh
#       (el .sh vive en local y se envia al "bash -s" del servidor)
#
# OJO, dos trampas que ya me mordieron y por eso esto NO usa la tuberia de PowerShell:
#   Get-Content -Raw | ssh   -> PowerShell antepone un BOM y bash ve «for ... do» roto.
#   Get-Content      | ssh   -> cada linea viaja con \r y bash no reconoce «do\r».
# Con `cmd /c "ssh ... < archivo"` el archivo llega byte a byte: es lo unico que funciona.
param(
  [Parameter(Mandatory = $true)][string]$Remoto
)

$askpass = Join-Path $env:USERPROFILE '.ssh\askpass-servidor.cmd'
if (-not (Test-Path $askpass)) { Write-Error "Falta $askpass"; exit 2 }
if (-not (Test-Path -LiteralPath $Remoto)) { Write-Error "No existe $Remoto"; exit 2 }

# Normaliza a LF y quita BOM: el servidor es Linux.
$texto = (Get-Content -LiteralPath $Remoto -Raw)
$texto = $texto.TrimStart([char]0xFEFF) -replace "`r`n", "`n"
$tmp = Join-Path $env:TEMP ("as-remoto-" + [guid]::NewGuid().ToString('N') + ".sh")
[System.IO.File]::WriteAllText($tmp, $texto, (New-Object System.Text.ASCIIEncoding))

$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = 'localhost:0'

$opciones = '-o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no ' +
            '-o PreferredAuthentications=password -o NumberOfPasswordPrompts=1 -o ConnectTimeout=20'
& cmd /c "ssh $opciones root@8.218.88.237 `"bash -s`" < `"$tmp`"" 2>$null
$codigo = $LASTEXITCODE
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
exit $codigo
