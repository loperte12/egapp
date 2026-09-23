# compilar-apk.ps1 — compila e instala el APK, con BLOQUEO para que dos personas no se pisen.
#
# ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────
# Hay UN proyecto, UN APK y UN móvil. Si dos builds corren a la vez en el mismo directorio:
#   · se pelean por el bundle de Metro y por el directorio de salida, y
#   · el caché de Gradle (`GRADLE_USER_HOME`) es COMPARTIDO, así que el segundo espera o falla con
#     «Timeout waiting to lock journal-1.lock» (ya pasó).
# Y si dos personas instalan con el MISMO `applicationId`, la segunda instalación **reemplaza** la
# app de la primera.
#
# Este script resuelve las dos cosas:
#   1. **Bloqueo**: si hay otro build en marcha (fichero de bloqueo reciente), no arranca y lo dice.
#   2. **App propia opcional**: con `-Sufijo .comida -Nombre "EG Comida"` se instala como una app
#      DISTINTA, que convive con la del otro en el mismo móvil.
#
# Uso:
#   .\compilar-apk.ps1                          → compila e instala la app normal (EG Route Plan)
#   .\compilar-apk.ps1 -SoloCompilar            → compila y no instala
#   .\compilar-apk.ps1 -Sufijo .comida -Nombre "EG Comida"   → la app propia, en paralelo
param(
  [switch]$SoloCompilar,
  [string]$Sufijo = '',
  [string]$Nombre = 'EG Route Plan'
)

$ErrorActionPreference = 'Stop'
$PROYECTO = 'D:\egapp'
$BLOQUEO  = Join-Path $PROYECTO '.build-lock.txt'
$MINUTOS_DE_Gracia = 25   # un build tarda ~1-2 min; 25 es margen de sobra para no bloquear por un cierre brusco

# ── 1. ¿Hay otro build en marcha? ───────────────────────────────────────────────
if (Test-Path $BLOQUEO) {
  $info = Get-Content $BLOQUEO -Raw
  $partes = $info -split '\|'
  $desde = $null
  [void][datetime]::TryParse($partes[1], [ref]$desde)
  $edad = if ($desde) { (New-TimeSpan -Start $desde -End (Get-Date)).TotalMinutes } else { 999 }
  if ($edad -lt $MINUTOS_DE_Gracia) {
    Write-Host "🔒 Hay un build en marcha (o lo hubo hace $([math]::Round($edad,1)) min):" -ForegroundColor Yellow
    Write-Host "   $info" -ForegroundColor Yellow
    Write-Host "   Espera a que termine. Si sabes que ya no corre, borra $BLOQUEO" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "· había un bloqueo viejo ($([math]::Round($edad,0)) min): se reemplaza"
}

"$env:USERNAME|$(Get-Date -Format o)|sufijo=$Sufijo" | Set-Content -Path $BLOQUEO -Encoding UTF8
Write-Host "🔒 bloqueo tomado por $env:USERNAME" -ForegroundColor Green

try {
  # ── 2. Compilar ───────────────────────────────────────────────────────────────
  # Estas tres variables son las que hacen que el build funcione; sin ellas Gradle no encuentra
  # ni el JDK, ni el SDK, ni el caché (y el caché compartido es lo que obliga al bloqueo).
  $env:JAVA_HOME        = 'D:\Java\jdk-17'
  $env:ANDROID_HOME     = 'D:\SDK.android studio'
  $env:GRADLE_USER_HOME = 'D:\gradle-home'
  # Y esta cuarta es obligatoria, no opcional: sin `NODE_ENV=production`, Expo avisa de que
  # «The NODE_ENV environment variable is required but was not specified. … Using only .env.local
  # and .env» y el empaquetado del bundle no es el de producción. Faltaba aquí, así que este script
  # fallaba aunque los builds a mano (que sí la ponían) funcionaran.
  $env:NODE_ENV         = 'production'

  $args = @('assembleRelease', "-PprojectRoot=$PROYECTO")
  if ($Sufijo) {
    $args += "-PappIdSuffix=$Sufijo"
    $args += "-PappName=$Nombre"
  }

  Write-Host "· compilando ($($args -join ' '))" -ForegroundColor Cyan
  Push-Location (Join-Path $PROYECTO 'android')
  try {
    # Mismo caso documentado abajo con `adb`: gradlew escribe progreso NORMAL en
    # stderr («Starting a Gradle Daemon», avisos del JDK) y con 'Stop' eso mata el
    # script aunque el build salga verde (pasó 2026-09-17). Se baja la preferencia
    # solo aquí y se decide por el TEXTO de la salida.
    $prefG = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $salidaGradle = try { (& .\gradlew @args --console=plain 2>&1 | Out-String) } finally { $ErrorActionPreference = $prefG }
    ($salidaGradle -split "`r?`n" | Select-String -Pattern 'BUILD|FAILED|error:|> Task .*FAILED' | Select-Object -Last 4)
    if ($salidaGradle -notmatch 'BUILD SUCCESSFUL') {
      throw 'El build de Gradle no terminó en verde (ver líneas arriba).'
    }
  } finally { Pop-Location }

  $apk = Join-Path $PROYECTO 'android\app\build\outputs\apk\release\app-release.apk'
  $f = Get-Item $apk
  Write-Host "· APK: $($f.FullName)  ($([math]::Round($f.Length/1MB,1)) MB, $($f.LastWriteTime))" -ForegroundColor Cyan

  # ── 3. Instalar ───────────────────────────────────────────────────────────────
  if (-not $SoloCompilar) {
    $adb = 'D:\SDK.android studio\platform-tools\adb.exe'
    $paquete = "com.egrouteplan.app$Sufijo"
    # `adb` escribe avisos NORMALES en stderr («daemon not running; starting now at tcp:5037»). Con
    # `$ErrorActionPreference='Stop'`, PowerShell 5.1 convierte eso en un error TERMINANTE aunque se
    # redirija con 2>&1: pasó — el build quedaba hecho, no se instalaba nada, y el error no describía el
    # problema real. Aquí se baja la preferencia solo para estas llamadas y se decide por el TEXTO.
    $prefAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $salidaAdb = (& $adb devices 2>&1 | Out-String)
      if ($salidaAdb -notmatch '(?m)\bdevice\s*$') {
        Write-Host "⚠ no hay ningún móvil conectado por USB: no se instala" -ForegroundColor Yellow
        Write-Host "   (adb dice: $($salidaAdb.Trim() -replace "`r?`n", ' · '))" -ForegroundColor Yellow
        exit 2
      }
      Write-Host "· instalando $paquete" -ForegroundColor Cyan
      (& $adb install -r $apk 2>&1) | Select-Object -Last 2
      (& $adb shell "dumpsys package $paquete" 2>&1) | Select-String -Pattern 'versionName|lastUpdateTime' | Select-Object -First 2
    } finally {
      $ErrorActionPreference = $prefAnterior
    }
  }
} finally {
  Remove-Item $BLOQUEO -ErrorAction SilentlyContinue
  Write-Host "🔓 bloqueo liberado" -ForegroundColor Green
}
