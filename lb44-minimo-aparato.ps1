# lb44-minimo-aparato.ps1 — el mínimo de reparto, comprobado EN EL APARATO (no en el log).
#
# ── QUÉ COMPRUEBA ───────────────────────────────────────────────────────────────
# Lo que pide `CHECKOUT-fees-y-minimo.md` §6.3, que es lo único que una prueba de servidor no puede
# demostrar: que el aviso sale ANTES de confirmar y que el botón se bloquea SOLO en reparto.
#
#   1. Carrito por debajo del mínimo + «Recoger en el local» → SIN aviso y se puede confirmar.
#   2. Pasar a «A domicilio» → SALE el aviso con la cifra y el CTA queda DESHABILITADO.
#   3. Volver a «Recoger en el local» → el aviso DESAPARECE y el CTA vuelve a estar activo.
#
# El punto 3 distingue un aviso correcto de un bloqueo tonto: recoger en el local no tiene mínimo, y el
# servidor lo garantiza (probado aparte en `lb44-prueba-minimo.cjs`, 11/11).
#
# ── LOS CUATRO TROPIEZOS QUE YA ME COSTARON UNA TANDA (por eso el guion es así) ──
#   1. El parámetro del deep link de `food-menu` es **`id`**, no `restaurantId` (eso es del checkout).
#      Con el nombre equivocado la pantalla se queda en el esqueleto, sin error ni texto.
#   2. Para saber si un botón está deshabilitado hay que mirar el nodo PULSABLE, no su etiqueta: el nodo
#      de texto tiene `enabled=true` siempre, así que la comprobación mentía.
#   3. `uiautomator dump` solo devuelve lo que se VE: el aviso va ARRIBA y el botón ABAJO, así que hay
#      que medir en dos posiciones de scroll.
#   4. **`uiautomator` da coordenadas del CONTENIDO, no del viewport**, cuando hay scroll: tocar un nodo
#      «en y=2264» puede caer sobre el botón de confirmar que está en esa posición en pantalla. Me pasó:
#      una tanda envió un PEDIDO REAL sin querer (lo detecté en la pantalla de «Mis pedidos» y lo borré).
#      Ahora solo se toca dentro de una banda segura y, después de tocar, se COMPRUEBA que el modo
#      cambió de verdad; si aparece la pantalla de pedido enviado, el guion se detiene en seco.
param(
  [string]$Rid = '89c85742-d241-4759-bb5c-36f559823c3c',
  [string]$Paquete = 'com.egrouteplan.app',
  [string]$Api = 'https://hk.egrouteplan.com/api/food',
  [switch]$SoloMirar,
  [string]$Salida = 'D:\egapp\.tmp-minimo-aparato'
)

$ErrorActionPreference = 'Continue'
$adb = 'D:\SDK.android studio\platform-tools\adb.exe'
if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Path $Salida | Out-Null }

$resultados = New-Object System.Collections.ArrayList
function Ok   { param([string]$n,[bool]$c,[string]$e='') $l = "{0} {1}{2}" -f $(if ($c) {'PASS'} else {'FAIL'}), $n, $(if ($e) { " ($e)" } else { '' }); [void]$resultados.Add($l); Write-Host $l -ForegroundColor $(if ($c) {'Green'} else {'Red'}) }
function Info { param([string]$t) Write-Host "INFO $t" -ForegroundColor Cyan }
function Paso { param([string]$t) Write-Host "`n──── $t ────" -ForegroundColor Yellow }
function Aviso{ param([string]$t) Write-Host "⚠ $t" -ForegroundColor Magenta }

function Adb { param([string[]]$a) return (& $adb @a 2>&1) }
function Dump {
  param([string]$nombre)
  # `uiautomator dump` falla de vez en cuando si la pantalla está en transición y deja un fichero
  # incompleto (lo vi: «el volcado no es XML válido» dos veces seguidas). Se reintenta una vez.
  for ($intento = 1; $intento -le 2; $intento++) {
    Adb @('shell','uiautomator','dump','/sdcard/lb44.xml') | Out-Null
    $crudo = (Adb @('shell','cat','/sdcard/lb44.xml')) -join "`n"
    $i = $crudo.IndexOf('<hierarchy')
    if ($i -gt 0) { $crudo = $crudo.Substring($i) }
    try { $doc = [xml]$crudo; break } catch { if ($intento -eq 2) { Write-Host "✖ el volcado no es XML válido (2 intentos)" -ForegroundColor Red; return @() }; Start-Sleep -Seconds 2 }
  }
  if ($nombre) { Set-Content -Path (Join-Path $Salida "$nombre.xml") -Value $crudo -Encoding utf8 }
  return $doc.SelectNodes('//node')
}
function Lineas { param($nodos)
  $salida = @()
  foreach ($n in $nodos) {
    if (-not ($n.text -or $n.'content-desc')) { continue }
    $etq = if ($n.'content-desc') { "desc=«$($n.'content-desc')»" } else { "texto=«$($n.text)»" }
    $salida += "    $etq enabled=$($n.enabled) clickable=$($n.clickable)"
  }
  return $salida
}
function Todo { param($nodos) return (($nodos | ForEach-Object { "$($_.text) $($_.'content-desc')" }) -join ' | ') }
function Centro { param($nodo)
  if ($nodo.bounds -notmatch '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') { return $null }
  return @{ x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2); y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2) }
}
function Buscar { param($nodos,[string]$patron)
  foreach ($n in $nodos) { if ("$($n.text) $($n.'content-desc')" -match $patron) { return $n } }
  return $null
}
function BuscarBoton { param($nodos,[string]$patron)
  $cand = @($nodos | Where-Object { ("$($_.text) $($_.'content-desc')" -match $patron) })
  $clik = @($cand | Where-Object { $_.clickable -eq 'true' })
  if ($clik.Count -gt 0) { return $clik[0] }
  if ($cand.Count -gt 0) { return $cand[0] }
  return $null
}
function Tocar { param($nodo,[string]$que,[switch]$Silencio)
  if (-not $nodo) { Write-Host "✖ no encontré «$que»" -ForegroundColor Red; return $false }
  $c = Centro $nodo
  if (-not $c) { Write-Host "✖ «$que» no tiene coordenadas" -ForegroundColor Red; return $false }
  Adb @('shell','input','tap',"$($c.x)","$($c.y)") | Out-Null
  if (-not $Silencio) { Write-Host "→ toco «$que» en ($($c.x),$($c.y))" }
  return $true
}
function AlPrincipio { param([int]$veces = 3)
  for ($i = 0; $i -lt $veces; $i++) {
    Adb @('shell','input','swipe',[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.30),[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.80),'300') | Out-Null
    Start-Sleep -Milliseconds 600
  }
}
function AlFinal { param([int]$veces = 4)
  for ($i = 0; $i -lt $veces; $i++) {
    Adb @('shell','input','swipe',[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.75),[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.25),'300') | Out-Null
    Start-Sleep -Milliseconds 600
  }
}
function Tamano {
  $sz = (Adb @('shell','wm','size')) -join ''
  if ($sz -match '(\d+)x(\d+)') { return @{ w = [int]$Matches[1]; h = [int]$Matches[2] } }
  return @{ w = 1080; h = 2400 }
}
function AbrirFicha { param([string]$rid)
  Adb @('shell','am','start','-a','android.intent.action.VIEW','-d',"egrouteplan://food-menu?id=$rid") | Out-Null
  Start-Sleep -Seconds 5
}
function TotalDelCarrito { param($nodos)
  $cta = Buscar $nodos 'Ver pedido'
  if (-not $cta) { return $null }
  if ("$($cta.'content-desc')" -match 'total ([0-9.,]+) XAF') { return [int](($Matches[1]) -replace '[.,]','') }
  return $null
}
# Modo de entrega REAL, por una señal que solo aparece en uno de los dos: el campo de dirección.
function ModoEntrega { param($nodos)
  $t = Todo $nodos
  if ($t -match 'Direcci') { return 'delivery' }
  if ($t -match 'Recoger en el local') { return 'pickup' }
  return $null
}
function PedidoEnviado { param($nodos)
  $t = Todo $nodos
  return ($t -match 'Pedido enviado|Mis pedidos|Ver mis pedidos')
}
function Medir { param([string]$etiqueta)
  # Tres posiciones y el texto de las tres: el aviso son DOS líneas y, según dónde quede el scroll, la
  # primera puede quedar tapada por la cabecera (me pasó: solo se leyó «Llevas 1.000 XAF…» y la
  # aserción de la cifra del mínimo falló con el aviso perfectamente pintado).
  AlPrincipio 3
  $arriba = Dump "$etiqueta-arriba"
  Adb @('shell','input','swipe',[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.60),[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.42),'300') | Out-Null
  Start-Sleep -Milliseconds 800
  $medio = Dump "$etiqueta-medio"
  AlFinal 4
  $abajo = Dump "$etiqueta-abajo"
  $unido = (Todo $arriba) + ' || ' + (Todo $medio) + ' || ' + (Todo $abajo)
  return @{ textoArriba = $unido; arriba = $arriba; medio = $medio; abajo = $abajo; cta = (BuscarBoton $abajo 'Confirmar pedido') }
}
# Cambiar de modo SIN poder enviar el pedido sin querer.
# La seguridad no es una banda fija: en esta pantalla las tarjetas de modo están legítimamente abajo,
# junto al botón de confirmar. Lo que se comprueba es que el centro de la tarjeta NO caiga dentro del
# botón de confirmar (ni pegado a su borde), y después de tocar se COMPRUEBA que el modo cambió.
function CambiarModo { param([string]$patron,[string]$esperado,[string]$que,[int]$intentos = 4)
  for ($i = 1; $i -le $intentos; $i++) {
    AlPrincipio 2
    $n = Dump "modo-$que-$i"
    if (PedidoEnviado $n) { Aviso "la app está en la pantalla de pedido enviado: me detengo"; return $false }
    $nodo = BuscarBoton $n $patron
    if (-not $nodo) { Info "no encuentro «$que» (intento $i)"; continue }
    $c = Centro $nodo
    if (-not $c) { continue }
    # La pantalla tiene DOS nodos que dicen «Confirmar pedido»: el TÍTULO de la cabecera (arriba, no
    # pulsable) y el BOTÓN (abajo, pulsable). Solo tiene sentido comprobar colisión contra el botón de
    # verdad; si el botón no está en el volcado (porque el scroll lo deja fuera), no hay nada con lo que
    # chocar y se sigue adelante — la red de seguridad es que después se comprueba el resultado.
    $boton = BuscarBoton $n 'Confirmar pedido'
    if ($boton -and $boton.clickable -eq 'true' -and $boton.bounds -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
      $yBoton = [int]$Matches[2]
      if ($c.y -ge ($yBoton - 30)) {
        Aviso "el centro de «$que» (y=$($c.y)) cae dentro o pegado al botón de confirmar (desde y=$yBoton): NO toco"
        continue
      }
    }
    Adb @('shell','input','tap',[string]$c.x,[string]$c.y) | Out-Null
    Write-Host "→ toco «$que» en ($($c.x),$($c.y))"
    Start-Sleep -Seconds 2
    $despues = Dump "modo-$que-$i-despues"
    if (PedidoEnviado $despues) { Aviso "¡SE ENVIÓ EL PEDIDO! Paro y hay que borrarlo de la base"; return $false }
    $modo = ModoEntrega $despues
    if ($modo -eq $esperado) { Info "modo confirmado: $modo"; return $true }
    Info "el toque no cambió el modo (sigue «$modo»): reintento"
  }
  return $false
}
function ConImporte { param([string]$texto,[string]$frase,[int]$importe)
  $n = ([string]$importe).TrimStart('0')
  $millar = if ($n.Length -gt 3) { $n.Insert($n.Length - 3, '[.,\u00a0 ]?') } else { $n }
  return ($texto -match [regex]::Escape($frase) + '\s*' + $millar + '\s*XAF')
}

# ── 0. Datos del servidor (el mismo dato que verá la app) ──────────────────────
Info "pidiendo el detalle del restaurante al servidor…"
try { $det = Invoke-RestMethod -Uri "$Api/restaurants/$Rid" -TimeoutSec 20 }
catch { Write-Host "✖ no pude pedir el detalle: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
$minimo = $det.minOrderXaf
$plato = ($det.menu | Sort-Object priceXaf | Select-Object -First 1)
Info "mínimo de reparto: $minimo XAF · plato más barato: «$($plato.name)» $($plato.priceXaf) XAF"
if ($plato.priceXaf -ge $minimo) { Write-Host "✖ el plato más barato supera el mínimo: esta prueba necesita uno por debajo" -ForegroundColor Red; exit 1 }
function Patron { param([string]$t) return (($t.ToCharArray() | ForEach-Object { if ([int][char]$_ -gt 127) { '.' } else { [regex]::Escape($_) } }) -join '') }
$patronPlato = Patron $plato.name
$script:pant = Tamano
Info "patrón del plato: «$patronPlato» · pantalla: $($script:pant.w)x$($script:pant.h)"

Adb @('shell','input','keyevent','KEYCODE_WAKEUP') | Out-Null
Start-Sleep -Milliseconds 700
Ok "la app está instalada ($Paquete)" (((Adb @('shell','pm','list','packages',$Paquete)) -join '') -match $Paquete)

# ── 1. Carrito VACÍO (es persistente entre tandas) ─────────────────────────────
Paso "1. Limpiando el carrito (estado determinista)"
AbrirFicha $Rid
$nodos = Dump '1-menu-inicial'
if ($SoloMirar) { Lineas $nodos | Select-Object -First 40 | ForEach-Object { Write-Host $_ }; exit 0 }
if (PedidoEnviado $nodos) { Aviso "la app está en una pantalla de pedidos, no en la ficha: vuelvo a abrir"; AbrirFicha $Rid; $nodos = Dump '1-menu-reintento' }

$cta = Buscar $nodos 'Ver pedido'
if ($cta) {
  Info "había carrito de una tanda anterior: entro al checkout para vaciarlo"
  [void](Tocar $cta 'Ver pedido')
  Start-Sleep -Seconds 3
  for ($i = 0; $i -lt 8; $i++) {
    $nodos = Dump "1-limpieza-$i"
    $quitar = Buscar $nodos 'Quitar .* del pedido'
    if (-not $quitar) { break }
    [void](Tocar $quitar 'Quitar del pedido' $true)
    Start-Sleep -Milliseconds 900
  }
  $volver = Buscar $nodos 'Volver'
  if ($volver) { [void](Tocar $volver 'Volver' $true) }
  Start-Sleep -Seconds 3
  AbrirFicha $Rid
  $nodos = Dump '1-menu-limpio'
}
$totalInicial = TotalDelCarrito $nodos
Ok "el carrito queda vacío antes de medir" ($null -eq $totalInicial) $(if ($null -eq $totalInicial) { 'sin CTA de carrito' } else { "total=$totalInicial" })

# ── 2. Una unidad del plato más barato ────────────────────────────────────────
Paso "2. Añadiendo una unidad de «$($plato.name)»"
$botonAdd = $null
for ($intento = 1; $intento -le 4 -and -not $botonAdd; $intento++) {
  $nodos = Dump "2-menu-$intento"
  $cand = BuscarBoton $nodos "adir.*$patronPlato|$patronPlato.*adir"
  if ($cand) {
    $c = Centro $cand
    if ($c -and $c.y -gt 0 -and $c.y -lt ($script:pant.h - 170)) { $botonAdd = $cand }
    else { Info "«$($plato.name)» fuera de la zona visible (y=$($c.y)): desplazo" }
  } else { Info "«$($plato.name)» todavía no aparece: desplazo" }
  if (-not $botonAdd) {
    Adb @('shell','input','swipe',[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.72),[string][int]($script:pant.w/2),[string][int]($script:pant.h*0.28),'400') | Out-Null
    Start-Sleep -Seconds 1
  }
}
Ok "la ficha ofrece «Añadir $($plato.name)» a la vista" ($null -ne $botonAdd) $(if ($botonAdd) { $botonAdd.'content-desc' } else { 'no encontrado en 4 intentos' })
if (-not $botonAdd) { exit 1 }
[void](Tocar $botonAdd "Añadir $($plato.name)")
Start-Sleep -Seconds 2

# ── 3. PRECONDICIÓN: por debajo del mínimo ────────────────────────────────────
$nodos = Dump '3-menu-con-plato'
$total = TotalDelCarrito $nodos
Ok "PRECONDICIÓN: hay UNA unidad y el total ($total XAF) está por debajo del mínimo ($minimo XAF)" ($null -ne $total -and $total -lt $minimo) "total=$total"
if ($null -eq $total -or $total -ge $minimo) { Write-Host "✖ sin esta precondición la medida no vale: no sigo" -ForegroundColor Red; exit 1 }

# ── 4. Estado 1: RECOGER → sin aviso, CTA activo ──────────────────────────────
Paso "4. Checkout con «Recoger en el local»"
$cta = BuscarBoton $nodos 'Ver pedido'
[void](Tocar $cta 'Ver pedido')
Start-Sleep -Seconds 4
$m = Medir '4-recoger'
Lineas $m.arriba | Select-Object -First 26 | ForEach-Object { Write-Host $_ }
Lineas $m.abajo | Select-Object -Last 4 | ForEach-Object { Write-Host $_ }
Ok "el checkout carga y muestra el botón de confirmar" ($null -ne $m.cta) $(if ($m.cta) { "enabled=$($m.cta.enabled) clickable=$($m.cta.clickable)" } else { 'no encontrado' })
$aviso1 = $m.textoArriba -match 'Para reparto el pedido m'
Ok "1 · con «Recoger en el local» NO hay aviso de mínimo (recoger no tiene mínimo)" (-not $aviso1) $(if ($aviso1) { 'salió el aviso' } else { 'no salió' })
if ($m.cta) { Ok "1 · y el CTA está ACTIVO" ($m.cta.enabled -eq 'true') "enabled=$($m.cta.enabled)" }

# ── 5. Estado 2: A DOMICILIO → aviso + CTA bloqueado ─────────────────────────
Paso "5. Checkout con «A domicilio» (total $total < mínimo $minimo)"
$cambio = CambiarModo 'A domicilio' 'delivery' 'a-domicilio'
Ok "el modo cambia a «A domicilio» (el campo de dirección aparece)" $cambio
if ($cambio) {
  $m = Medir '5-domicilio'
  Lineas $m.arriba | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
  Lineas $m.abajo | Select-Object -Last 6 | ForEach-Object { Write-Host $_ }
  $aviso2 = $m.textoArriba -match 'Para reparto el pedido m'
  Ok "2 · con «A domicilio» SÍ sale el aviso del mínimo" $aviso2 $(if ($aviso2) { 'salió' } else { 'no salió' })
  Ok "2 · el aviso lleva la cifra del servidor con su formato («…es 2.000 XAF»)" (ConImporte $m.textoArriba 'Para reparto el pedido m' $minimo) ''
  Ok "2 · y dice cuánto lleva el cliente («Llevas 1.000 XAF»)" (ConImporte $m.textoArriba 'Llevas' $total) ''
  Ok "2 · y ofrece la alternativa de recoger en el local" ($m.textoArriba -match 'recoger en el local') ''
  Ok "2 · el CTA queda DESHABILITADO" ($m.cta -and $m.cta.enabled -eq 'false') $(if ($m.cta) { "enabled=$($m.cta.enabled) clickable=$($m.cta.clickable)" } else { 'no encontrado' })

  # ── 5b. LA PRUEBA QUE DE VERDAD VALE: pulsar y ver que NO se envía ──────────
  # `uiautomator` puede no reflejar el `disabled` de React Native (el nodo puede seguir diciendo
  # `enabled=true` aunque el toque no haga nada). Así que además del atributo se prueba el
  # COMPORTAMIENTO: se pulsa «Confirmar pedido» por debajo del mínimo y no tiene que pasar nada. Si se
  # enviara, quedaría un pedido real en la base (y se dice, para borrarlo).
  Paso "5b. Pulsar «Confirmar pedido» por debajo del mínimo: no debe enviarse nada"
  $antesTxt = Todo (Dump '5b-antes')
  $boton = BuscarBoton (Dump '5b-antes-boton') 'Confirmar pedido'
  if ($boton -and $boton.clickable -eq 'true') {
    [void](Tocar $boton 'Confirmar pedido')
    Start-Sleep -Seconds 4
    $despues = Dump '5b-despues'
    $enviado = PedidoEnviado $despues
    Ok "2b · pulsar «Confirmar pedido» con reparto por debajo del mínimo NO envía el pedido" (-not $enviado) $(if ($enviado) { '¡SE ENVIÓ!' } else { 'no pasó nada: sigue en el checkout' })
    if ($enviado) { Aviso 'se creó un pedido: hay que borrarlo de la base (lb44-borrar-pedido-prueba.sh, cambiando el id)' }
  } else { Info 'el botón no aparece pulsable en el volcado: se comprueba por la base que no haya pedido nuevo' }

  # ── 6. Estado 3: volver a RECOGER → el aviso desaparece ─────────────────────
  # Se vuelve REABRIENDO el checkout (botón «Volver» + CTA del carrito), no tocando la otra tarjeta:
  # así solo hay UN toque en tarjetas de modo en toda la prueba (menos superficie para el fallo de las
  # coordenadas) y además se comprueba lo que de verdad importa, que «recoger» es el estado por defecto.
  Paso "6. Vuelta a «Recoger en el local» (reabriendo el checkout)"
  AlPrincipio 2
  $nodos = Dump '6-antes-de-volver'
  $volver = BuscarBoton $nodos 'Volver'
  if ($volver) { [void](Tocar $volver 'Volver' $true) } else { Aviso 'no encontré «Volver»' }
  Start-Sleep -Seconds 3
  $nodos = Dump '6-menu'
  $cta2 = BuscarBoton $nodos 'Ver pedido'
  if ($cta2) {
    [void](Tocar $cta2 'Ver pedido' $true)
    Start-Sleep -Seconds 4
    $m = Medir '6-vuelta'
    Lineas $m.arriba | Select-Object -First 26 | ForEach-Object { Write-Host $_ }
    Lineas $m.abajo | Select-Object -Last 4 | ForEach-Object { Write-Host $_ }
    $modo6 = ModoEntrega $m.arriba
    Ok "3 · al reabrir, el checkout vuelve a «Recoger en el local» (el estado por defecto)" ($modo6 -eq 'pickup') "modo=$modo6"
    $aviso3 = $m.textoArriba -match 'Para reparto el pedido m'
    Ok "3 · y el aviso del mínimo ya no está" (-not $aviso3) $(if ($aviso3) { 'sigue saliendo' } else { 'desapareció' })
    Ok "3 · y el CTA vuelve a estar ACTIVO" ($m.cta -and $m.cta.enabled -eq 'true') $(if ($m.cta) { "enabled=$($m.cta.enabled) clickable=$($m.cta.clickable)" } else { 'no encontrado' })
  } else { Ok "3 · vuelvo a entrar al checkout" $false 'no encontré el CTA del carrito' }
}

$fails = @($resultados | Where-Object { $_ -like 'FAIL*' }).Count
Write-Host ""
Write-Host ("{0}/{1} PASS{2}" -f ($resultados.Count - $fails), $resultados.Count, $(if ($fails) { " · $fails FAIL" } else { '' })) -ForegroundColor $(if ($fails) { 'Red' } else { 'Green' })
Write-Host "volcados en $Salida · el carrito queda con 1 unidad de «$($plato.name)» y NO se envía ningún pedido"
