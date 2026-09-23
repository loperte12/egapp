# Parámetros para una auditoría de servicios (otro chat)

Lo que hay que darle al agente nuevo. **Adjunta este fichero** y añade al principio tu encargo concreto (qué servicios y con qué profundidad). Todo lo de aquí es lo que en este chat costó descubrir.

---

## 1. Tu encargo: lo único que tienes que escribir tú

Rellena estas cinco líneas en el mensaje inicial:

```
Audita, en modo SOLO LECTURA sobre el código de D:\egapp, estos servicios: <taxi, comida, Life Book, monedero, hotel, intercity, alquiler, trabajo…>
Profundidad: <superficial | media | exhaustiva>
Ámbito: <solo app | solo backend | app + backend>
Salida: <solo hallazgos | hallazgos + arreglos>
Entregable: <ruta del informe>
```

Recomendado si quieres lo mismo que en la auditoría de diseño: **ámbito app + backend**, **profundidad exhaustiva**, **salida: solo hallazgos** (los arreglos, en tandas aparte y con tu visto bueno).

---

## 2. Contexto del proyecto (no lo redescubras)

- **App**: React Native / Expo SDK 53, `expo-router`, en `D:\egapp` (~103 pantallas en `app/`, 74 componentes, kit de diseño propio en `packages/ui-kit` — **es un paquete del workspace, no está en `node_modules`**).
- **Backend**: NestJS 10 + Prisma 5.22 sobre Postgres 16, en **`root@8.218.88.237`** (dominio `hk.egrouteplan.com`), despliegue en **`/opt/mirror/app`**, proceso pm2 **`malabogo-api`** en el puerto 3000 con prefijo global `api`. **Sin git**: la referencia de fuente son hashes sha256 por fichero.
- **Dos clientes Prisma**: `PrismaService` (esquema `wallet`) y `MobilityPrismaService` (`mobility`/`lifebook`). Los roles de base de datos están aislados por esquema: el rol de `wallet` **no** tiene permiso sobre `mobility`.
- **Modelo de dinero**: `ESCROW_LOCK` → `ESCROW_RELEASE` (+`FEE`) → `ESCROW_REFUND`. `transactions.idempotency_key` es `@unique`. Hay una restricción de tabla (`tx_shape_chk`): LOCK solo con emisor, RELEASE/REFUND con ambos, FEE solo con emisor — **inventar la forma da error 23514 de Postgres**.
- **Segundo factor del dinero**: `POST /v1/auth/payment-token` (ámbitos `DEPOSIT`, `WITHDRAWAL`, `ESCROW_LOCK`, `DISPUTE_CONFIRM`, `TRIP`), token de 90 s, un solo uso, **atado al importe y a la referencia**; los PIN son Argon2id.
- **Superficie ya auditada** (para no repetir trabajo):
  - Seguridad del monedero: `C:\Users\nisang12\security-audit-skill\egrouteplan-wallet\run-1\` (28 unidades, 8 hallazgos F1–F8, todos corregidos y verificados) y `run-2\` (13 unidades, 1 hallazgo F9).
  - Diseño de toda la app: `D:\egapp\design-audit-report.md` (60 hallazgos, 12 dimensiones, plan en 4 fases) + informes por especialista en `D:\egapp\.design-audit\`.
  - **Lee esas dos cosas primero**: casi todo lo evidente ya está dentro, y repetirlo haría que el informe pareciera nuevo sin serlo.

---

## 3. Accesos y herramientas que ya existen (dáselos tal cual)

| Necesidad | Cómo |
|---|---|
| Comando en el servidor | `& "D:\egapp\pruebas\servidor-ssh.ps1" -Comando "<comando>"` (la clave está en `%USERPROFILE%\.ssh\askpass-servidor.cmd`) |
| Subir un fichero | `& "D:\egapp\pruebas\servidor-subir.ps1" -Local "<ruta local>" -Remoto "<ruta remota>"` |
| Comprobar la app en el teléfono | `adb` (un dispositivo conectado), paquete **`com.egrouteplan.app`** |
| Ver una pantalla sin verla | `adb shell uiautomator dump /sdcard/u.xml` + `adb pull` + leer textos y `bounds` |
| Abrir una pantalla concreta | `adb shell am start -a android.intent.action.VIEW -d "egrouteplan://monedero"` |
| Errores de JavaScript | `adb logcat -d \| Select-String "ReactNativeJS.*Error"` |
| Compilar el APK | Ver §4 (¡no lo haga a su manera!) |
| Pruebas e2e ya escritas | `D:\egapp\pruebas\lb*.cjs` (decenas: monedero, comida, hotel, cupones, idempotencia…) |
| Web del proyecto | `https://hk.egrouteplan.com/sitio/` se sirve desde **`/opt/mirror/site/`** (nginx `alias`, con `no-cache`) |

**Cuentas y datos de prueba**: conductor `+240555000003` / `123456` (agente MBO-0042) · pasajero `+240555000111` / `PruebaKyc2026` (PIN 246810) · admin `+240555000999` / `PruebaKyc2026` · tienda de prueba «Tienda Hotel 079171» (del conductor) y «Tienda Admin 152394750» (del admin, producto `5cd82555-a006-49f7-be2b-b081aebb1621`).

---

## 4. Entorno: lo que le hará perder horas si no lo sabe

**Compilar la app** (tarda ~1 m 20 s y ya funciona):
```powershell
$env:GRADLE_USER_HOME = "D:\gradle-home"; $env:TEMP = "D:\temp-gradle"; $env:TMP = "D:\temp-gradle"
cd D:\egapp\android; .\gradlew.bat assembleRelease --console=plain --no-daemon
adb install -r D:\egapp\android\app\build\outputs\apk\release\app-release.apk
```
- **C: está al 0 % de espacio**: nunca compilar sin redirigir `GRADLE_USER_HOME` y `TEMP` a D:.
- **`github.com`, `dl.google.com`, Maven Central y plugins.gradle.org están BLOQUEADOS** en esta red. Por eso `android/build.gradle` lleva **espejos de Aliyun** y la distribución de Gradle se instaló a mano (espejo de Tencent). **No ejecutar `npx expo prebuild`**: pisa esos arreglos. El registro de npm sí funciona (apunta a `npmmirror`).
- **Comprobar el código**: `npx tsc --noEmit` (debe quedar limpio) y `npm run diseno` (guardia de diseño: solo permite que la deuda baje; `-- --base` para re-fijarla tras una mejora).
- **Trampas de PowerShell de esta máquina**: `[IO.File]::ReadAllText` usa el directorio del **proceso** (usar rutas absolutas) · los corchetes son comodines, `[id]` exige **`-LiteralPath`** · en comillas dobles `\n` **no** es salto de línea y `$(date …)` lo expande PowerShell (usar comillas simples) · **PowerShell 5.1 no soporta el ternario `? :`** y un error de parseo **aborta el script entero sin ejecutarlo** · para cirugía de texto, mejor un script Node en `pruebas/*.cjs`.
- **Los subagentes fallan** en este entorno (nueve intentos sin cierre en la auditoría de diseño) **salvo que se les obligue a escribir su informe en un fichero** antes de terminar. Si se delega, con esa regla.
- El modelo **no puede leer imágenes**: nada de «mira esta captura»; se verifica con volcados de accesibilidad.

---

## 5. Reglas de la casa (ponlas tal cual)

1. **No tocar `api/lifebook.ts` ni `components/FloatingFooter.tsx`.**
2. **Nada hardcodeado**: colores, tamaños y espaciados salen de tokens del kit (`packages/ui-kit`).
3. **El dueño prueba en pantalla**; el agente verifica con `uiautomator` y deja capturas si hace falta.
4. **Di lo que NO está verificado.** Y si el propio informe se equivoca, **corrígelo por escrito** (en este chat el analista de color contó un identificador de degradado SVG como si fuera un color, y las cifras heredadas fallaron tres veces: hay que **confirmar cada dato al tocarlo**).
5. **Una cosa por tanda** y con `tsc` + compilación + instalación + comprobación en el aparato detrás. **No empezar una reestructuración que no se pueda terminar y verificar.**
6. **Los avisos de aprobación están desactivados**: no usar `sandbox_permissions`.
7. Para el backend: cada despliegue **con comprobación de salud y vuelta atrás automática** (en este chat un cambio de inyección de dependencias tumbó la API en producción).

---

## 6. Qué debe entregar (formato que ya funcionó)

1. **Inventario de lo auditado** (unidades: servicio × superficie) y **qué quedó fuera** con el motivo.
2. **Hallazgos** con: id, severidad, evidencia `archivo:línea`, impacto en el usuario, ley o criterio que se incumple, arreglo mínimo, esfuerzo y ámbito.
3. **Un apartado explícito de «no verificable sin ejecutar»** (nada de afirmar lo que no se comprobó).
4. **Informe en markdown** en una ruta fija, más **un fichero por especialista** si se delega.
5. Nada de arreglar sin permiso si el encargo era «solo hallazgos».

---

## 7. Estado actual del código (por si el otro chat arranca con preguntas)

- `npx tsc --noEmit` **limpio**; guardia de diseño fijada en **`hex 190 · fontSize 3009 · borderRadius 1257`**.
- **Fase 0 (defectos funcionales de dinero): 9 de 9 hechas.** Fase 1 (ganancias rápidas de diseño): **13 de 13**. Fase 2 (sistema): colores unificados, escalas declaradas, 4 listas virtualizadas, `Sheet`/`InlineError`/`Aviso`/`EmptyState` en el kit y difundiéndose.
- **Pendiente conocido**: 3 listas con listas dentro de formularios (`intercity.tsx:244`, `ecomerse-seller.tsx:456`, `intercity-publish.tsx:370-391`), reservas del hotel (`lifebook-hotel-reservas.tsx:291`, `lifebook-hotel-panel.tsx:303` — su `map` está **fuera** del `ScrollView`), difusión de `EmptyState` (~65 archivos), barrido de 2.809 `fontSize` y 1.257 `borderRadius` a la escala del kit.
- **Pendiente del dueño**: prueba con el tamaño de fuente del sistema al máximo; mirar en pantalla los colores nuevos; confirmar el teléfono de soporte (quedó `+8615504426087`, un **+86**).
- El relevo técnico completo de la auditoría de diseño está en **`D:\egapp\RELEVO.md`**.
