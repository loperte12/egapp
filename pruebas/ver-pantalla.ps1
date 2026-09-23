# ver-pantalla.ps1 — volcar la pantalla del aparato en texto legible.
# El agente que continúa no puede ver imágenes: esto es su «ojo». Devuelve, por nodo:
# índice, bounds (x1,y1,x2,y2) y el texto o la etiqueta accesible. Los bounds son lo que
# permite comprobar DE VERDAD el espaciado y la posición (no basta con que el texto exista).
#
# Uso:  powershell -File pruebas\ver-pantalla.ps1            (solo nodos con texto)
#       powershell -File pruebas\ver-pantalla.ps1 -Todo      (todos los nodos)
#       powershell -File pruebas\ver-pantalla.ps1 -Esperar 5 (espera antes de capturar)
param([int]$Esperar = 2, [switch]$Todo)
$ErrorActionPreference = 'Continue'
Start-Sleep -Seconds $Esperar

$remoto = '/sdcard/u.xml'
$local = 'D:\egapp\.tmp-verif\u.xml'
New-Item -ItemType Directory -Force -Path 'D:\egapp\.tmp-verif' | Out-Null

$ok = $false
for ($i = 1; $i -le 3 -and -not $ok; $i++) {
  $salida = (adb shell uiautomator dump $remoto 2>&1) -join ' '
  if ($salida -match 'dumped to') { $ok = $true } else { Start-Sleep -Seconds 2 }
}
if (-not $ok) { Write-Output "FALLO el volcado: $salida"; exit 1 }

adb pull $remoto $local 2>&1 | Out-Null
$xml = [xml](Get-Content -LiteralPath $local -Raw -Encoding UTF8)
if (-not $xml) { Write-Output 'FALLO: XML vacio'; exit 1 }

Write-Output ("paquete: {0}" -f (adb shell dumpsys window 2>&1 | Select-String -Pattern 'mCurrentFocus' | Select-Object -First 1))
$n = 0
foreach ($nodo in $xml.SelectNodes('//node')) {
  $t = $nodo.GetAttribute('text')
  $d = $nodo.GetAttribute('content-desc')
  $b = $nodo.GetAttribute('bounds')
  if ($Todo -or $t -or $d) {
    $etiqueta = if ($t) { $t } else { "[$d]" }
    Write-Output ("{0,3}  {1,-26}  {2}" -f $n, $b, $etiqueta)
  }
  $n++
}
Write-Output ("total nodos: {0}" -f $n)
