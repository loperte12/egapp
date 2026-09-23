# AS-24 · Comprobacion en el aparato de la tanda 2 (accion dominante, estado y minimo de fotos).
# Lee los TEXTOS y las MEDIDAS reales de cada pantalla. No compra, no anade al carrito.
# Uso: powershell -File pruebas\as-tanda2-verifica.ps1
#
# OJO: adb escribe en stderr cosas normales -> no se usa ErrorActionPreference=Stop, y `$pkg` esta
# prohibido (variable reservada de PowerShell).
$doc = 'D:\egapp\.auditoria-servicios'
$appId = 'com.egrouteplan.app'

function Volcar([string]$nombre) {
  adb shell uiautomator dump /sdcard/t2.xml | Out-Null
  adb pull /sdcard/t2.xml (Join-Path $doc "$nombre.xml") 2>$null | Out-Null
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

Write-Output '== 1) relanzar =='
adb shell am force-stop $appId | Out-Null
Start-Sleep -Seconds 2
adb shell am start -n "$appId/.MainActivity" | Out-Null
Start-Sleep -Seconds 12

Write-Output '== 2) ficha: UNA accion dominante y WhatsApp discreto =='
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-detail?id=9b5a03b5-9ed9-42ff-803a-41159ade8a10" | Out-Null
Start-Sleep -Seconds 9
$f1 = Volcar 'dump-t2-ficha'
Comprobar $f1 @('Comprar · 6.500 XAF', 'Añadir', 'Escribir por WhatsApp', 'Añadir a favoritos') @('🛒 Carrito')

Write-Output '== 3) medidas de la barra (la dominante debe ser la mas ancha y alta) =='
node 'D:\egapp\pruebas\as-lee-pantalla.cjs' $f1 | Select-String -Pattern 'WhatsApp|favoritos|Añadir al carrito|Comprar por'

Write-Output '== 4) formulario de publicacion (SOLO si la cuenta es vendedora activa) =='
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-seller" | Out-Null
Start-Sleep -Seconds 9
$f2 = Volcar 'dump-t2-seller'
$xml2 = Get-Content -LiteralPath $f2 -Raw
if ($xml2 -match [regex]::Escape('Publicar producto')) {
  Comprobar $f2 @('Estado del artículo *', 'Nuevo', 'Como nuevo', 'Buen estado', 'Para piezas', 'mínimo 3', 'hasta 6') @('Descripción (estado, características…)')
} else {
  Write-Output '  (esta cuenta NO es vendedora activa: el formulario solo existe con seller.status = active,'
  Write-Output '   ver ecomerse-seller.tsx:381. Se comprueba el catalogo en su lugar.)'
}

Write-Output '== 5) el estado y el VENDEDOR se ven en el catalogo =='
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse" | Out-Null
Start-Sleep -Seconds 9
$f3 = Volcar 'dump-t2-catalogo'
node 'D:\egapp\pruebas\as-lee-pantalla.cjs' $f3 | Select-String -Pattern 'Abacería|Vendedor E2E|Nuevo|Buen estado|Como nuevo|XAF'

Write-Output ''
Write-Output 'Volcados en .auditoria-servicios\dump-t2-*.xml'
