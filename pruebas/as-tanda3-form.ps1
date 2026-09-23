# AS-28 · Verificacion determinista del formulario: recorre y ACUMULA lo visto en cada posicion.
# Si un campo del formulario no aparece en NINGUNA posicion, es que no existe.
# No publica nada: no toca el boton de publicar.
# Uso: powershell -File pruebas\as-tanda3-form.ps1
$doc = 'D:\egapp\.auditoria-servicios'
$appId = 'com.egrouteplan.app'

adb shell am force-stop $appId | Out-Null
Start-Sleep -Seconds 2
adb shell am start -n "$appId/.MainActivity" | Out-Null
Start-Sleep -Seconds 12
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-seller" | Out-Null
Start-Sleep -Seconds 10

$todo = ''
$pos = 0
for ($i = 0; $i -lt 8; $i++) {
  adb shell uiautomator dump /sdcard/t3.xml | Out-Null
  $f = Join-Path $doc ("dump-t3-form-pos{0}.xml" -f $i)
  adb pull /sdcard/t3.xml $f 2>$null | Out-Null
  $todo += (Get-Content -LiteralPath $f -Raw)
  $pos++
  adb shell input swipe 540 1700 540 700 400 | Out-Null
  Start-Sleep -Seconds 2
}
Write-Output ("Posiciones volcadas: " + $pos)
Write-Output ''

# Campos que el formulario DEBE tener (las 6 secciones del encargo)
$deben = @(
  'Publicar producto',
  '1 · Vendedor (arriba) · 2 · Producto',
  '2 · Producto',
  'Título * (ej: iPhone 11 64GB)',
  'Marca * (ej: Apple)',
  'Modelo * (ej: iPhone 11)',
  'SKU o código (opcional)',
  'Precio XAF * (ej: 12.500)',
  'Stock',
  'Categoría *',
  'Estado del artículo *',
  'Como nuevo',
  'Talla / medida (si aplica)',
  'Color (si aplica)',
  'Acepto ofertas',
  'Ver cómo quedará el anuncio',
  'Fotos * (mínimo 3',
  'fondo claro',
  '4 · Documentación',
  '5 · Entrega',
  '¿Cómo entregas? *',
  'Entrego yo',
  'Con agente',
  'Las dos',
  '6 · Condiciones',
  'Qué cobras: el precio completo',
  'no cobra comisión',
  'Acepto las condiciones de venta'
)
$faltan = 0
foreach ($p in $deben) {
  if ($todo -match [regex]::Escape($p)) { Write-Output "  OK    $p" }
  else { Write-Output "  FALTA $p"; $faltan++ }
}
Write-Output ''
Write-Output ("Campos ausentes: " + $faltan + " de " + $deben.Count)
Write-Output 'Volcados: .auditoria-servicios\dump-t3-form-pos*.xml'
