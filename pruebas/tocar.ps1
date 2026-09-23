# tocar.ps1 — tocar en el aparato por texto o etiqueta accesible, sin ver la pantalla.
# Vuelca la pantalla, busca el nodo cuyo text o content-desc coincida EXACTAMENTE, y toca su centro.
# Si no lo encuentra, desplaza hacia abajo y reintenta (los formularios largos esconden el botón
# bajo el pliegue y el volcado de uiautomator solo trae lo visible).
#
# Uso:  powershell -File pruebas\tocar.ps1 -Texto "Buscar viajes"
#       powershell -File pruebas\tocar.ps1 -Texto "Litoral" -Indice 1      (2ª coincidencia)
#       powershell -File pruebas\tocar.ps1 -Texto "Litoral" -SoloBuscar    (no toca: solo lista)
#       powershell -File pruebas\tocar.ps1 -Texto "X" -SinDesplazar        (no desplaza)
param(
  [Parameter(Mandatory = $true)][string]$Texto,
  [int]$Indice = 0,
  [switch]$SoloBuscar,
  [switch]$SinDesplazar,
  [int]$Intentos = 4
)
$ErrorActionPreference = 'Continue'
$local = 'D:\egapp\.tmp-verif\u.xml'
New-Item -ItemType Directory -Force -Path 'D:\egapp\.tmp-verif' | Out-Null

function Buscar-Coincidencias {
  adb shell uiautomator dump /sdcard/u.xml 2>&1 | Out-Null
  adb pull /sdcard/u.xml $local 2>&1 | Out-Null
  $xml = [xml](Get-Content -LiteralPath $local -Raw -Encoding UTF8)
  if (-not $xml) { return @() }
  $hallados = @()
  $vistos = @{}
  foreach ($n in $xml.SelectNodes('//node')) {
    $t = $n.GetAttribute('text'); $d = $n.GetAttribute('content-desc')
    if ($t -eq $Texto -or $d -eq $Texto) {
      $b = $n.GetAttribute('bounds')
      if ($b -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
        $x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
        $y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
        # Cada control sale DOS veces en el volcado (contenedor + texto) y sus centros pueden
        # diferir en 1-2 px (552 vs 553): se agrupan con tolerancia. Sin esto, -Indice 1 vuelve
        # a tocar el mismo control y se cambia el campo equivocado (nos pasó con las provincias).
        $clave = "{0},{1}" -f [int]($x / 12), [int]($y / 12)
        if (-not $vistos.ContainsKey($clave)) {
          $vistos[$clave] = $true
          $hallados += [pscustomobject]@{ x = $x; y = $y; bounds = $b }
        }
      }
    }
  }
  return $hallados
}

for ($i = 1; $i -le $Intentos; $i++) {
  $hallados = @(Buscar-Coincidencias)
  if ($hallados.Count -gt $Indice) { break }
  if ($SoloBuscar -or $SinDesplazar -or $i -eq $Intentos) {
    Write-Output ("coincidencias de '{0}': {1}" -f $Texto, $hallados.Count)
    Write-Output 'NO SE TOCA: no hay esa coincidencia'
    exit 1
  }
  Write-Output ("  '{0}' no visible (intento {1}): desplazo" -f $Texto, $i)
  adb shell input swipe 540 1900 540 900 300 | Out-Null
  Start-Sleep -Seconds 2
}

Write-Output ("coincidencias de '{0}': {1}" -f $Texto, $hallados.Count)
$i = 0
foreach ($h in $hallados) { Write-Output ("  {0}: {1} -> centro {2},{3}" -f $i, $h.bounds, $h.x, $h.y); $i++ }
if ($SoloBuscar) { exit 0 }

$destino = $hallados[$Indice]
adb shell input tap $destino.x $destino.y | Out-Null
Write-Output ("tocado '{0}' [{1}] en {2},{3}" -f $Texto, $Indice, $destino.x, $destino.y)
