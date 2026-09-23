# AS-27 · Comprobacion en el aparato de la tanda 3 (formulario de publicar, 6 secciones).
# Lee los textos y medidas reales. NO publica nada: no toca el boton de publicar.
# Uso: powershell -File pruebas\as-tanda3-verifica.ps1
$doc = 'D:\egapp\.auditoria-servicios'
$appId = 'com.egrouteplan.app'

function Volcar([string]$nombre) {
  adb shell uiautomator dump /sdcard/t3.xml | Out-Null
  adb pull /sdcard/t3.xml (Join-Path $doc "$nombre.xml") 2>$null | Out-Null
  return (Join-Path $doc "$nombre.xml")
}
function Comprobar([string]$rutaXml, [string[]]$deben, [string[]]$noDeben) {
  $xml = Get-Content -LiteralPath $rutaXml -Raw
  foreach ($p in $deben) {
    if ($xml -match [regex]::Escape($p)) { Write-Output "  OK    aparece: $p" }
    else { Write-Output "  FALLA no aparece: $p" }
  }
  foreach ($p in $noDeben) {
    if ($xml -match [regex]::Escape($p)) { Write-Output "  FALLA sigue apareciendo: $p" }
    else { Write-Output "  OK    ya no aparece: $p" }
  }
}

Write-Output '== 1) relanzar y abrir Mi tienda =='
adb shell am force-stop $appId | Out-Null
Start-Sleep -Seconds 2
adb shell am start -n "$appId/.MainActivity" | Out-Null
Start-Sleep -Seconds 12
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-seller" | Out-Null
Start-Sleep -Seconds 10
$f1 = Volcar 'dump-t3-form-1'

$xml1 = Get-Content -LiteralPath $f1 -Raw
if ($xml1 -match [regex]::Escape('Publicar producto')) {
  Write-Output '  cuenta VENDEDORA: el formulario se ha abierto'
  # OJO: un volcado de uiautomator es SOLO lo que esta en pantalla. El formulario es largo, asi que
  # cada bloque se comprueba en el volcado donde de verdad se ve, no todos en el primero.
  Comprobar $f1 @(
    '2 · Producto',
    '1 · Vendedor (arriba)',
    'Marca * (ej: Apple)',
    'Modelo * (ej: iPhone 11)',
    'SKU o código (opcional)'
  ) @('Descripción (estado, características…)')
} else {
  Write-Output '  (esta cuenta no es vendedora activa: el formulario solo existe con seller.status = active)'
}

Write-Output '== 1-bis) bloque central: estado, talla, ofertas y vista previa =='
adb shell input swipe 540 1700 540 800 400; Start-Sleep -Seconds 3
$f1b = Volcar 'dump-t3-form-1b'
Comprobar $f1b @('Estado del artículo *', 'Como nuevo', 'Talla / medida (si aplica)', 'Color (si aplica)', 'Acepto ofertas', 'Ver cómo quedará el anuncio')

Write-Output '== 1-ter) fotos y la seccion 4 declarada pendiente =='
adb shell input swipe 540 1700 540 900 400; Start-Sleep -Seconds 3
$f1c = Volcar 'dump-t3-form-1c'
Comprobar $f1c @('Sección 4 · Documentación', 'Fotos * (mínimo 3', 'fondo claro')

Write-Output '== 2) secciones 5 y 6 (bajando) =='
adb shell input swipe 540 1700 540 600 400; Start-Sleep -Seconds 2
adb shell input swipe 540 1700 540 600 400; Start-Sleep -Seconds 2
adb shell input swipe 540 1700 540 600 400; Start-Sleep -Seconds 3
$f2 = Volcar 'dump-t3-form-2'
Comprobar $f2 @('5 · Entrega', '¿Cómo entregas? *', 'Entrego yo', 'Con agente', 'Las dos', '6 · Condiciones', 'Acepto las condiciones de venta')

Write-Output '== 3) la seccion 4 se declara pendiente, no se finge =='
Comprobar $f2 @('Pendiente de servidor')

Write-Output ''
Write-Output 'Volcados en .auditoria-servicios\dump-t3-*.xml'
