# lb49-medir-destello.ps1 — mide el destello blanco con NÚMEROS, no con opiniones.
#
# ── CÓMO ────────────────────────────────────────────────────────────────────────
# Un destello es un pantallazo casi blanco en medio de una app oscura. Se capturan varios pantallazos
# seguidos **desde el propio móvil** (una sola orden por USB y el bucle dentro del aparato, que es lo que
# permite pillarlos: cada `screencap` tarda ~150 ms) y luego se mide la luma media de cada imagen aquí.
#
# `screenrecord` NO sirve en este ROM («Unable to open … Permission denied»): se usa `screencap`, que sí.
#
# Uso:
#   .\lb49-medir-destello.ps1 -Modo arranque    (app cerrada → abrir y capturar el arranque)
#   .\lb49-medir-destello.ps1 -Modo navegar     (tocar los canales del feed y capturar los cambios)
param(
  [ValidateSet('arranque','navegar')][string]$Modo = 'arranque',
  [int]$Capturas = 10,
  [int]$CadaMs = 120,
  [string]$Etiqueta = 'antes'
)
$ErrorActionPreference = 'Continue'
$adb = 'D:\SDK.android studio\platform-tools\adb.exe'
$pkg = 'com.egrouteplan.app'
$dir = 'D:\egapp\.tmp-destello'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

function Adb { param([string[]]$a) return (& $adb @a 2>&1) }

# ── 1. La ráfaga, dentro del aparato (una orden, N capturas) ───────────────────
Adb @('shell','rm','-f','/sdcard/d1.png','/sdcard/d2.png','/sdcard/d3.png','/sdcard/d4.png','/sdcard/d5.png','/sdcard/d6.png','/sdcard/d7.png','/sdcard/d8.png','/sdcard/d9.png','/sdcard/d10.png','/sdcard/d11.png','/sdcard/d12.png') | Out-Null

if ($Modo -eq 'arranque') {
  Adb @('shell','am','force-stop',$pkg) | Out-Null
  Start-Sleep -Milliseconds 600
  # Se lanza la app EN PARALELO con el bucle de capturas: si se lanzara antes, el arranque ya habría pasado.
  $cmd = "(: ; am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n $pkg/.MainActivity >/dev/null 2>&1) & " +
         "for i in 1 2 3 4 5 6 7 8 9 10 11 12; do screencap -p /sdcard/d`$i.png; done; echo FIN"
} else {
  # Navegar: se toca el canal «Siguiendo» (398,401) y «Cerca» (642,401) mientras se captura.
  $cmd = "(sleep 0.4; input tap 398 401; sleep 0.5; input tap 642 401; sleep 0.5; input tap 142 401 >/dev/null 2>&1) & " +
         "for i in 1 2 3 4 5 6 7 8 9 10 11 12; do screencap -p /sdcard/d`$i.png; done; echo FIN"
}
Write-Host "· capturando ($Modo)…" -ForegroundColor Cyan
Adb @('shell',$cmd) | Out-Null
Start-Sleep -Milliseconds 400

# ── 2. Traerlas y medir la luma de cada una ────────────────────────────────────
Add-Type -AssemblyName System.Drawing
$filas = @()
for ($i = 1; $i -le 12; $i++) {
  $local = Join-Path $dir "$Etiqueta-$i.png"
  Adb @('pull',"/sdcard/d$i.png",$local) | Out-Null
  if (-not (Test-Path $local)) { continue }
  try {
    $bmp = [System.Drawing.Bitmap]::FromFile($local)
    $suma = 0.0; $n = 0
    # Muestreo: uno de cada 16 píxeles en horizontal y vertical (rápido y suficiente para una media).
    for ($y = 0; $y -lt $bmp.Height; $y += 16) {
      for ($x = 0; $x -lt $bmp.Width; $x += 16) {
        $p = $bmp.GetPixel($x, $y)
        $suma += 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
        $n++
      }
    }
    $bmp.Dispose()
    $luma = [math]::Round($suma / [math]::Max(1, $n), 1)
    $filas += [pscustomobject]@{ F = $i; Luma = $luma; Blanco = ($luma -gt 200) }
  } catch { Write-Host "  (no se pudo medir el $i : $($_.Exception.Message))" -ForegroundColor Yellow }
  Remove-Item $local -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "════ $Modo · etiqueta «$Etiqueta» ════" -ForegroundColor Yellow
$filas | ForEach-Object {
  $barra = '#' * [int]([math]::Round($_.Luma / 8))
  $marca = if ($_.Blanco) { '  ← CASI BLANCO' } else { '' }
  Write-Host ("  {0,2}  luma {1,5}  {2}{3}" -f $_.F, $_.Luma, $barra, $marca)
}
$blancos = @($filas | Where-Object { $_.Blanco }).Count
$max = ($filas | Measure-Object -Property Luma -Maximum).Maximum
Write-Host ""
Write-Host ("  pantallazos: {0} · casi blancos (>200): {1} · luma máxima: {2}" -f $filas.Count, $blancos, $max) -ForegroundColor $(if ($blancos -gt 0) { 'Red' } else { 'Green' })
Write-Host "  (0 = negro · 255 = blanco puro)"
