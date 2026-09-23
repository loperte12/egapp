# lb45-ver-repartidor.ps1 — la pantalla REAL del repartidor en el aparato: ¿ve la dirección, el botón
# de llegar y el punto de encuentro?
#
# El pedido de prueba ya está asignado a la cuenta que tiene la sesión abierta en el móvil
# (+240222000123), así que basta abrir la pantalla del repartidor por deep link y leer lo que se ve.
# Se lee el TEXTO REAL de los nodos y el estado de los botones (pulsable o no), no lo que yo espero.
param(
  [string]$Salida = 'D:\egapp\.tmp-repartidor'
)
$ErrorActionPreference = 'Continue'
$adb = 'D:\SDK.android studio\platform-tools\adb.exe'
if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Path $Salida | Out-Null }

function Adb { param([string[]]$a) return (& $adb @a 2>&1) }
function Dump {
  param([string]$nombre)
  for ($i = 1; $i -le 3; $i++) {
    Adb @('shell','uiautomator','dump','/sdcard/lb45.xml') | Out-Null
    $crudo = (Adb @('shell','cat','/sdcard/lb45.xml')) -join "`n"
    $j = $crudo.IndexOf('<hierarchy')
    if ($j -gt 0) { $crudo = $crudo.Substring($j) }
    try { $doc = [xml]$crudo; break } catch { if ($i -eq 3) { Write-Host "✖ volcado no válido" -ForegroundColor Red; return @() }; Start-Sleep -Seconds 2 }
  }
  if ($nombre) { Set-Content -Path (Join-Path $Salida "$nombre.xml") -Value $crudo -Encoding utf8 }
  return $doc.SelectNodes('//node')
}
function Lineas { param($nodos)
  foreach ($n in $nodos) {
    if (-not ($n.text -or $n.'content-desc')) { continue }
    $etq = if ($n.'content-desc') { "desc=«$($n.'content-desc')»" } else { "texto=«$($n.text)»" }
    "    $etq enabled=$($n.enabled) clickable=$($n.clickable)"
  }
}
function Centro { param($nodo)
  if ($nodo.bounds -notmatch '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') { return $null }
  return @{ x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2); y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2) }
}
function Buscar { param($nodos,[string]$patron)
  foreach ($n in $nodos) { if ("$($n.text) $($n.'content-desc')" -match $patron) { return $n } }
  return $null
}
function Todo { param($nodos) return (($nodos | ForEach-Object { "$($_.text) $($_.'content-desc')" }) -join ' | ') }

$resultados = New-Object System.Collections.ArrayList
function Ok   { param([string]$n,[bool]$c,[string]$e='') $l = "{0} {1}{2}" -f $(if ($c) {'PASS'} else {'FAIL'}), $n, $(if ($e) { " ($e)" } else { '' }); [void]$resultados.Add($l); Write-Host $l -ForegroundColor $(if ($c) {'Green'} else {'Red'}) }
function Info { param([string]$t) Write-Host "INFO $t" -ForegroundColor Cyan }

Adb @('shell','input','keyevent','KEYCODE_WAKEUP') | Out-Null
Start-Sleep -Milliseconds 700
Info 'abriendo la pantalla del repartidor por deep link…'
Adb @('shell','am','start','-a','android.intent.action.VIEW','-d','egrouteplan://food-rider') | Out-Null
Start-Sleep -Seconds 6

# La entrega está MÁS ABAJO: la pantalla empieza por los requisitos, la semana y el perfil. Como
# `uiautomator dump` solo devuelve lo visible, hay que desplazarse hasta la tarjeta (o el resultado
# sería un FAIL falso: la primera pasada dio 1/7 con el reparto perfectamente asignado).
$tam = (Adb @('shell','wm','size')) -join ''
$alto = if ($tam -match '(\d+)x(\d+)') { [int]$Matches[2] } else { 2374 }
$ancho = if ($tam -match '(\d+)x(\d+)') { [int]$Matches[1] } else { 1080 }
$nodos = @()
for ($i = 1; $i -le 6; $i++) {
  $nodos = Dump "1-repartidor-$i"
  if ((Todo $nodos) -match 'Entregar en|Hotel Bah') { Info "la tarjeta de la entrega aparece tras $($i - 1) desplazamiento(s)"; break }
  Adb @('shell','input','swipe',[string][int]($ancho/2),[string][int]($alto*0.75),[string][int]($ancho/2),[string][int]($alto*0.30),'350') | Out-Null
  Start-Sleep -Milliseconds 900
}
Write-Host "──── pantalla del repartidor ────"
Lineas $nodos | ForEach-Object { Write-Host $_ }
$texto = Todo $nodos

Ok 'la pantalla del repartidor carga con la entrega asignada' ($texto -match 'Hotel Bah|Entregar en')
Ok 'el repartidor ve la DIRECCIÓN de entrega' ($texto -match 'Entregar en: Hotel Bah')
Ok 've la nota del cliente (detalle que evita llamadas)' ($texto -match 'no tocar el timbre')
Ok 'tiene el botón «Cómo llegar»' ($texto -match 'Cómo llegar')
Ok 'y como el pedido TIENE pin, el botón no dice «dirección escrita»' (-not ($texto -match 'Cómo llegar \(dirección escrita\)'))
Ok 'tiene el botón de «Punto de encuentro»' ($texto -match 'Punto de encuentro')

# Abrir el formulario del punto de encuentro y leer lo que se ve de verdad
$boton = Buscar $nodos 'Indicar el punto de encuentro|Punto de encuentro'
if ($boton) {
  $c = Centro $boton
  if ($c) {
    Adb @('shell','input','tap',[string]$c.x,[string]$c.y) | Out-Null
    Start-Sleep -Seconds 2
    $nodos2 = Dump '2-punto-encuentro'
    Write-Host "──── formulario del punto de encuentro ────"
    Lineas $nodos2 | ForEach-Object { Write-Host $_ }
    $t2 = Todo $nodos2
    Ok 'el formulario del punto de encuentro se abre' ($t2 -match 'Dónde os encontr|Donde os encontr|puerta lateral|portal')
    Ok 'ofrece usar la ubicación del repartidor' ($t2 -match 'Usar mi ubicación')
    Ok 'y ofrece avisar al cliente' ($t2 -match 'Avisar al cliente')
    Ok 'explica que el cliente lo verá y recibirá SMS' ($t2 -match 'recibirá un SMS|lo verá en su pedido')
  }
} else { Ok 'encuentro el botón del punto de encuentro' $false 'no encontrado' }

$fails = @($resultados | Where-Object { $_ -like 'FAIL*' }).Count
Write-Host ""
Write-Host ("{0}/{1} PASS{2}" -f ($resultados.Count - $fails), $resultados.Count, $(if ($fails) { " · $fails FAIL" } else { '' })) -ForegroundColor $(if ($fails) { 'Red' } else { 'Green' })
Write-Host "volcados en $Salida"
