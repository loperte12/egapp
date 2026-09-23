# lb46-ver-hotel.ps1 — la ficha del hotel EN EL APARATO: precio en la moneda del huésped, «Cómo llegar»,
# la nota de llegada y el taxi desde el aeropuerto.
#
# Lee el TEXTO REAL de la pantalla con uiautomator (no lo que yo espero) y comprueba los cuatro bloques.
# Si algo no sale, imprime la pantalla para poder verlo en vez de adivinar.
param(
  [string]$Shop = 'd8a2ece3-92b4-4959-8412-d26b5d698ade',
  [string]$Salida = 'D:\egapp\.tmp-hotel'
)
$ErrorActionPreference = 'Continue'
$adb = 'D:\SDK.android studio\platform-tools\adb.exe'
if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Path $Salida | Out-Null }

function Adb { param([string[]]$a) return (& $adb @a 2>&1) }
function Dump {
  param([string]$nombre)
  for ($i = 1; $i -le 3; $i++) {
    Adb @('shell','uiautomator','dump','/sdcard/lb46.xml') | Out-Null
    $crudo = (Adb @('shell','cat','/sdcard/lb46.xml')) -join "`n"
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
function Todo { param($nodos) return (($nodos | ForEach-Object { "$($_.text) $($_.'content-desc')" }) -join ' | ') }
function Buscar { param($nodos,[string]$patron)
  foreach ($n in $nodos) { if ("$($n.text) $($n.'content-desc')" -match $patron) { return $n } }
  return $null
}
function Centro { param($nodo)
  if ($nodo.bounds -notmatch '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') { return $null }
  return @{ x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2); y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2) }
}

$resultados = New-Object System.Collections.ArrayList
function Ok   { param([string]$n,[bool]$c,[string]$e='') $l = "{0} {1}{2}" -f $(if ($c) {'PASS'} else {'FAIL'}), $n, $(if ($e) { " ($e)" } else { '' }); [void]$resultados.Add($l); Write-Host $l -ForegroundColor $(if ($c) {'Green'} else {'Red'}) }
function Info { param([string]$t) Write-Host "INFO $t" -ForegroundColor Cyan }

Adb @('shell','input','keyevent','KEYCODE_WAKEUP') | Out-Null
Start-Sleep -Milliseconds 700
Info 'abriendo la ficha del hotel por deep link…'
Adb @('shell','am','start','-a','android.intent.action.VIEW','-d',"egrouteplan://lifebook-hotel-detalle?id=$Shop") | Out-Null
Start-Sleep -Seconds 7

# Se lee en dos posiciones: el encabezado (llegada, taxi, moneda) y la lista de habitaciones (precios).
$tam = (Adb @('shell','wm','size')) -join ''
$alto = if ($tam -match '(\d+)x(\d+)') { [int]$Matches[2] } else { 2374 }
$ancho = if ($tam -match '(\d+)x(\d+)') { [int]$Matches[1] } else { 1080 }

$textos = ''
for ($i = 1; $i -le 6; $i++) {
  $nodos = Dump "1-ficha-$i"
  $textos = $textos + ' || ' + (Todo $nodos)
  if ($textos -match 'Habitaciones \(\d+\)') { break }
  Adb @('shell','input','swipe',[string][int]($ancho/2),[string][int]($alto*0.75),[string][int]($ancho/2),[string][int]($alto*0.30),'350') | Out-Null
  Start-Sleep -Milliseconds 900
}
# Y se sube AL PRINCIPIO y se vuelve a leer: la pantalla puede quedar desplazada de una visita anterior
# y `uiautomator` solo devuelve lo visible — con el scroll abajo, «Cómo llegar» (que va arriba) no
# aparecía y la comprobación daba FAIL con el botón perfectamente puesto.
for ($i = 0; $i -lt 3; $i++) {
  Adb @('shell','input','swipe',[string][int]($ancho/2),[string][int]($alto*0.30),[string][int]($ancho/2),[string][int]($alto*0.80),'300') | Out-Null
  Start-Sleep -Milliseconds 700
}
$arriba = Dump '1-ficha-arriba'
$textos = (Todo $arriba) + ' || ' + $textos
Write-Host "──── pantalla: ficha del hotel ────"
Lineas $nodos | Select-Object -First 40 | ForEach-Object { Write-Host $_ }

Ok 'la ficha del hotel carga' ($textos -match 'Hotel Demo Malabo|Habitaciones')
Ok 'el hotel dice cómo se ENTRA (la nota de llegada)' ($textos -match 'puerta lateral, junto al parking')
Ok 'y lo titula para que se entienda («Al llegar»)' ($textos -match 'Al llegar')
Ok 'tiene el botón «Cómo llegar»' ($textos -match 'Cómo llegar')
Ok 'ofrece el TAXI desde el aeropuerto' (($textos -match 'Pedir taxi al hotel') -or ($textos -match 'Llegas al aeropuerto'))
Ok 'y dice el precio de referencia de la zona del aeropuerto' ($textos -match 'desde 1[ .]?500 XAF hasta 3[ .]?000 XAF') 'desde 1 500 XAF hasta 3 000 XAF'
Ok 'la habitación enseña el precio REAL en XAF' ($textos -match '\d[\d .]{2,} XAF')
Info "moneda: $(([regex]::Match($textos, '(China|España|Guinea Ecuatorial|Estados Unidos) · [^ |]+')).Value)"
Info "y el precio local: $(([regex]::Match($textos, '≈ [^ |]+')).Value)"

# El selector de país: hay que TOCARLO donde se ve. El botón vive justo debajo de «Habitaciones (N)»,
# así que se desplaza hasta que aparezca EN ESTE volcado y se toca con SUS coordenadas. Tocar con las
# coordenadas de otro volcado (u otra posición de scroll) hizo que el toque cayera en el botón del taxi.
$botonMoneda = $null
for ($i = 1; $i -le 6 -and -not $botonMoneda; $i++) {
  $nd = Dump "2-buscar-moneda-$i"
  $botonMoneda = Buscar $nd 'Elegir el país para ver los precios en su moneda'
  if (-not $botonMoneda) {
    Adb @('shell','input','swipe',[string][int]($ancho/2),[string][int]($alto*0.75),[string][int]($ancho/2),[string][int]($alto*0.30),'350') | Out-Null
    Start-Sleep -Milliseconds 900
  }
}
if ($botonMoneda) {
  $c = Centro $botonMoneda
  if ($c) {
    Adb @('shell','input','tap',[string]$c.x,[string]$c.y) | Out-Null
    Start-Sleep -Seconds 3
    $n2 = Dump '2-moneda'
    $t2 = Todo $n2
    Write-Host "──── selector de moneda ────"
    Lineas $n2 | Select-Object -Last 18 | ForEach-Object { Write-Host $_ }
    Ok 'el selector de país/moneda se abre y lista países con su moneda' ($t2 -match 'España|Guinea Ecuatorial|Estados Unidos') 'países visibles'
    Ok 'y avisa de que el pago es en francos (no engaña sobre la moneda del cobro)' ($t2 -match 'en francos|en XAF') ''
  }
} else { Ok 'encuentro el botón de la moneda' $false 'no encontrado' }

$fails = @($resultados | Where-Object { $_ -like 'FAIL*' }).Count
Write-Host ""
Write-Host ("{0}/{1} PASS{2}" -f ($resultados.Count - $fails), $resultados.Count, $(if ($fails) { " · $fails FAIL" } else { '' })) -ForegroundColor $(if ($fails) { 'Red' } else { 'Green' })
Write-Host "volcados en $Salida"
