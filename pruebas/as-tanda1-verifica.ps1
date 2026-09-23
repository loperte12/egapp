# AS-20 · Comprobacion en el aparato de la tanda 1 («el dinero se ve»).
# Abre el Mercado, la ficha y los pedidos, y lee los textos reales de cada pantalla.
# No toca dinero: no compra, no anade al carrito, no crea pedidos.
# Uso: powershell -File pruebas\as-tanda1-verifica.ps1
#
# OJO: `adb` escribe en stderr cosas normales, asi que NO se usa ErrorActionPreference=Stop
# (abortaria el script) y el nombre `$pkg` esta prohibido: es una variable reservada de PowerShell.
$doc = 'D:\egapp\.auditoria-servicios'
$appId = 'com.egrouteplan.app'

function Volcar([string]$nombre) {
  adb shell uiautomator dump /sdcard/t1.xml | Out-Null
  adb pull /sdcard/t1.xml (Join-Path $doc "$nombre.xml") 2>$null | Out-Null
  return (Join-Path $doc "$nombre.xml")
}

function Comprobar([string]$rutaXml, [string[]]$deben, [string[]]$noDeben) {
  $xml = Get-Content -LiteralPath $rutaXml -Raw
  foreach ($p in $deben) {
    if ($xml -match [regex]::Escape($p)) { Write-Output "  OK    aparece: $p" }
    else { Write-Output "  FALLA no aparece: $p" }
  }
  foreach ($p in $noDeben) {
    if ($xml -match [regex]::Escape($p)) { Write-Output "  FALLA sigue apareciendo (no deberia): $p" }
    else { Write-Output "  OK    ya no aparece: $p" }
  }
}

Write-Output '== 1) relanzar la app =='
adb shell am force-stop $appId | Out-Null
Start-Sleep -Seconds 2
adb shell am start -n "$appId/.MainActivity" | Out-Null
Start-Sleep -Seconds 12

Write-Output '== 2) home del Mercado =='
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse" | Out-Null
Start-Sleep -Seconds 9
$f1 = Volcar 'dump-t1-mercado-home'
Comprobar $f1 @('No le pagamos al vendedor hasta que recibas el pedido') @('Garantía de 7 días en pedidos por Ecomerse')

Write-Output '== 3) ficha de producto =='
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-detail?id=9b5a03b5-9ed9-42ff-803a-41159ade8a10" | Out-Null
Start-Sleep -Seconds 9
$f2 = Volcar 'dump-t1-ficha'
Comprobar $f2 @('Dónde está tu dinero', 'Pagas', 'Lo retenemos', 'El vendedor aún no lo tiene', 'tienes 7 días para reclamar', 'Si compras por WhatsApp, la garantía no cubre el trato') @('Garantía EG Route Plan de 7 días si pagas por la app')

Write-Output '== 4) mis pedidos (pantalla completa) =='
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-orders" | Out-Null
Start-Sleep -Seconds 8
$f3 = Volcar 'dump-t1-pedidos'
node 'D:\egapp\pruebas\as-lee-pantalla.cjs' $f3 | Select-Object -First 16

Write-Output ''
Write-Output 'Volcados en .auditoria-servicios\dump-t1-*.xml'
