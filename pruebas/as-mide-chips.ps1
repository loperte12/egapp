# AS-38 · Mide la ESTABILIDAD de la fila de chips de estado.
#
# Por que existe: el dueño reporto que la fila "se desplaza mas abajo en vez de estar en una posicion
# estable". Para juzgarlo hay que medir la MISMA fila en varios estados (pestaña y filtro) y comparar
# su `y`. Si cambia, es inestable; si no, el problema es otro.
#
# Uso: powershell -File pruebas\as-mide-chips.ps1
$doc = 'D:\egapp\.auditoria-servicios'
$appId = 'com.egrouteplan.app'

function Volcar([string]$nombre) {
  adb shell uiautomator dump /sdcard/ch.xml | Out-Null
  $f = Join-Path $doc "dump-chips-$nombre.xml"
  adb pull /sdcard/ch.xml $f 2>$null | Out-Null
  return $f
}
# Devuelve "y" de la fila de chips (el primer chip que aparezca) y del primer pedido/aviso de la lista.
function Medir([string]$ruta, [string]$etiqueta) {
  $xml = Get-Content -LiteralPath $ruta -Raw
  $m = [regex]::Match($xml, 'content-desc="Todos[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
  if (-not $m.Success) { $m = [regex]::Match($xml, 'content-desc="Pendientes[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') }
  if ($m.Success) {
    $y1 = [int]$m.Groups[2].Value; $y2 = [int]$m.Groups[4].Value
    $alto = $y2 - $y1
    # altura de texto: el nodo de texto del mismo chip
    Write-Output ("  {0,-26} chip y={1,-5} alto={2}px" -f $etiqueta, $y1, $alto)
  } else {
    Write-Output ("  {0,-26} NO se encontro la fila de chips" -f $etiqueta)
  }
}

adb shell am force-stop $appId | Out-Null
Start-Sleep -Seconds 2
adb shell am start -n "$appId/.MainActivity" | Out-Null
Start-Sleep -Seconds 12
adb shell am start -a android.intent.action.VIEW -d "egrouteplan://ecomerse-orders" | Out-Null
Start-Sleep -Seconds 9

Medir (Volcar 'compras') 'Compras, filtro Todos'
adb shell input tap 990 378 | Out-Null      # pestana Ventas
Start-Sleep -Seconds 4
Medir (Volcar 'ventas') 'Ventas, filtro Todos'
adb shell input tap 420 680 | Out-Null      # chip Pendientes (aprox, y=680 en el layout nuevo)
Start-Sleep -Seconds 4
Medir (Volcar 'ventas-pend') 'Ventas, filtro Pendientes'
adb shell input swipe 900 680 200 680 300 | Out-Null   # desplazar la fila
Start-Sleep -Seconds 3
Medir (Volcar 'ventas-despl') 'Ventas tras desplazar'
Write-Output ''
Write-Output 'Si los tres primeros valores de "chip y" coinciden, la fila es estable.'
Write-Output 'Volcados: .auditoria-servicios\dump-chips-*.xml'
