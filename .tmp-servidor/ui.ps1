# Vuelca la pantalla del telefono y lista los textos con sus coordenadas.
# Uso: pwsh -File .tmp-servidor\ui.ps1
param([string]$Xml = "D:\egapp\.tmp-servidor\ui.xml")

$adb = "C:\Users\nisang12\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
& $adb pull /sdcard/ui.xml $Xml 2>$null | Out-Null
if (-not (Test-Path $Xml)) { Write-Host 'no se pudo volcar la pantalla'; exit 1 }

[xml]$doc = Get-Content $Xml -Encoding UTF8
$nodos = $doc.SelectNodes('//node')
foreach ($n in $nodos) {
  $t = $n.GetAttribute('text')
  $d = $n.GetAttribute('content-desc')
  if ([string]::IsNullOrWhiteSpace($t) -and [string]::IsNullOrWhiteSpace($d)) { continue }
  $b = $n.GetAttribute('bounds')   # [x1,y1][x2,y2]
  $m = [regex]::Match($b, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
  if (-not $m.Success) { continue }
  $x1 = [int]$m.Groups[1].Value; $y1 = [int]$m.Groups[2].Value
  $x2 = [int]$m.Groups[3].Value; $y2 = [int]$m.Groups[4].Value
  $cx = [int](($x1 + $x2) / 2); $cy = [int](($y1 + $y2) / 2)
  $w = $x2 - $x1; $h = $y2 - $y1
  $etiqueta = if ([string]::IsNullOrWhiteSpace($t)) { "«$d»" } else { $t }
  Write-Host ("{0,4},{1,4}  {2,4}x{3,-4}  {4}" -f $cx, $cy, $w, $h, $etiqueta)
}
