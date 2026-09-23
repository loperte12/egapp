# Relevo — EG Route Plan (auditoría de diseño + ejecución)

Documento para el agente que continúa. Escrito el 17/09/2026. Todo lo que dice «hecho» está **compilado, instalado y verificado en el teléfono** salvo donde se indique.

---

## 1. Qué es esto y dónde está todo

App **React Native / Expo (SDK 53, expo-router)** en `D:\egapp`: super-app de Guinea Ecuatorial (taxi, comida, mercado «Ecomerse», Life Book, hotel, intercity, alquiler, trabajo y **monedero con dinero real**). Backend NestJS en `root@8.218.88.237` (`/opt/mirror/app`, pm2 `malabogo-api`) — **no se toca salvo que se pida**.

| Artefacto | Qué es |
|---|---|
| `D:\egapp\design-audit-report.md` | **El informe de la auditoría** (1.007 líneas): 60 hallazgos, tarjeta de 12 dimensiones, plan en 4 fases, el **estado de ejecución** en §11, §11-bis y §12, **§13 con las tandas del 17/09 por la noche** (las siete listas, §13.2 con una errata de este documento, §13.3 con las herramientas para verificar sin ver y §13.7 con la trampa del hueco de la cabecera), **§14, §16 y §17 con la difusión de `EmptyState`/`InlineError`**, **§15 con el checkout plegado**, **§18, §19, §19-bis, §19-ter y §19-quater con el `Sheet`** |
| `D:\egapp\.design-audit\{color,a11y,perf,flows-psychology}.md` | Informes de los 4 especialistas (todo lo citado en el informe sale de aquí) |
| `D:\egapp\pruebas\*.cjs` | Scripts de esta auditoría (cada cambio importante tiene el suyo, con su comentario de por qué) |
| `D:\egapp\.diseno-baseline.json` | Base de la guardia de diseño |
| `D:\egapp\packages\ui-kit\` | El kit de diseño (**paquete del workspace**, no `node_modules`): tokens, escalas y primitivas |

---

## 2. Reglas de la casa (no negociables)

1. **Nunca tocar `api/lifebook.ts` ni `components/FloatingFooter.tsx`.**
2. **Nada hardcodeado**: colores, tamaños y espaciados salen de tokens del kit.
3. **El dueño prueba en pantalla.** Tú no puedes ver imágenes (modelo sin entrada de imagen): verifica con `uiautomator` (ver §5) y deja capturas en `D:\egapp\capturas\` si hace falta.
4. **Di lo que NO está verificado.** Cuando te equivoques (pasará), corrígelo por escrito en el informe.
5. **Una cosa por tanda**: cambio → `tsc` → guardia → compilar → instalar → comprobar en el aparato. **No empezar una reestructuración que no puedas terminar y verificar.**
6. Los subagentes **funcionan** aquí solo si les obligas a *escribir su informe en un archivo* antes de cerrar (en esta sesión fallaron 9 veces sin eso).
7. **Los avisos de aprobación están desactivados**: no uses `sandbox_permissions`.

---

## 3. El entorno: esto te morderá si lo ignoras

### Compilar (ya funciona; no lo «arregles»)
```powershell
$env:GRADLE_USER_HOME = "D:\gradle-home"; $env:TEMP = "D:\temp-gradle"; $env:TMP = "D:\temp-gradle"
cd D:\egapp\android
.\gradlew.bat assembleRelease --console=plain --no-daemon      # ~1 min 20 s
adb install -r D:\egapp\android\app\build\outputs\apk\release\app-release.apk
adb shell am start -n com.egrouteplan.app/.MainActivity
```
- **C: está al 0 % de espacio.** Nunca compiles sin redirigir `GRADLE_USER_HOME` y `TEMP` a D: (ya hecho arriba).
- **`github.com`, `dl.google.com`, Maven Central y plugins.gradle.org están BLOQUEADOS** en esta red. Por eso `android/build.gradle` tiene **espejos de Aliyun** delante, y la distribución de Gradle se instaló a mano en `D:\gradle-home\wrapper` desde el **espejo de Tencent**. Hay un `networkTimeout=180000` en `gradle-wrapper.properties`.
- **No ejecutes `npx expo prebuild`**: regenera `android/` y **pisa esos arreglos**. Si necesitas un *dev build*, compila con `gradlew assembleDebug` desde la carpeta `android/` existente, y haz copia de `android/build.gradle`, `android/app/build.gradle` y `gradle-wrapper.properties` antes.

### Comprobar el código
```powershell
cd D:\egapp; npx tsc --noEmit          # debe quedar SIEMPRE limpio
npm run diseno                          # guardia: solo permite que la deuda baje
npm run diseno -- --base                # re-fija la base DESPUÉS de una mejora real
```
Guardia actual: `hex 190 · fontSize 3009 · borderRadius 1257`. **No puede subir.**

### Trampas de PowerShell en esta máquina (todas nos costaron un error)
- `[IO.File]::ReadAllText("ruta")` usa el directorio del **proceso**, no el de `cd`: **usa rutas absolutas**.
- Los corchetes son comodines: `Select-String -Path '...\lifebook-post\[id].tsx'` devuelve **0 falsos negativos**. Usa **`-LiteralPath`**.
- En comillas dobles, `\n` **no** es salto de línea (se escribió literal). Usa backtick-n o un `here-string`.
- `${V1}` dentro de comillas dobles se expande a vacío; la tecla backtick escapa.
- Para cirugía de texto, mejor un **script Node** (`pruebas/*.cjs`) que un one-liner.

### El teléfono
- Conectado por USB (`adb devices` → un dispositivo). Paquete **`com.egrouteplan.app`**.
- Verificar sin ver: `adb shell uiautomator dump /sdcard/u.xml` + `adb pull` + leer textos y `bounds`.
- **`adb shell input text` NO entra en los `TextInput` de este teléfono** (probado dos veces: el buscador del Mercado y el de Life Book; el texto se queda fuera y la pantalla no reacciona). Para llegar a un estado que necesita texto escrito: tócalo desde un chip/atajo de la app, o navega a una pantalla que ya lo traiga del servidor. **No pierdas una tanda intentándolo.**
- **Si el teléfono desaparece** (`adb: no devices/emulators found`), se arregla con `adb kill-server; adb start-server` (pasó a mitad de una tanda; el APK estaba bien).
- **Atajos ya hechos (no los reescribas):** `powershell -File pruebas\ver-pantalla.ps1` imprime la pantalla como texto (índice, `bounds`, texto) y `powershell -File pruebas\tocar.ps1 -Texto "…" [-Indice N]` toca por texto o etiqueta accesible, **desplazando y reintentando** si está bajo el pliegue. Los `bounds` son la única forma de comprobar posición y espaciado sin ver.
- **Trampa de `tocar.ps1` que ya costó un error:** cada control aparece **dos veces** en el volcado (contenedor + texto) y sus centros pueden diferir en 1 px; el script deduplica con tolerancia. Sin eso, `-Indice 1` vuelve a tocar el mismo chip (puse *origen* donde quería *destino* y la app pareció fallar cuando el fallo era del instrumento).

### El sandbox de la sesión (esto te bloquea todo si lo ignoras)
El espacio de trabajo para escritura es **el directorio de donde arranca DSH**, no el proyecto. Si arrancas DSH desde su carpeta de instalación, `D:\egapp` queda **fuera** y toda escritura falla con `[sandbox: file access denied under workspace-write mode]` — leer sí funciona, así que el fallo aparece tarde, al primer script. **Solución: chip Access del compositor → «Full access»** (o arrancar DSH con `D:\egapp` como carpeta de trabajo). Con «Full access», `approval` pasa a `never` y no hay que pedir permiso en cada tanda.
- Enlaces directos: `adb shell am start -a android.intent.action.VIEW -d "egrouteplan://monedero"`.
- `adb logcat -d | Select-String "ReactNativeJS.*Error"` para errores de JavaScript.

---

## 4. Lo que YA está hecho (no lo repitas)

**Fase 0 — defectos funcionales: 9 de 9.** Ruta del monedero (5 puntos de entrada, incluido el del dock), finales del KYC, accesibilidad del PIN, `anunciar()` multiplataforma, botón «Verificar mi identidad» en el monedero + CTA del vendedor al KYC real, **token de pago del carrito con PIN por tienda**, canal de soporte real (`constants/soporte.ts`), precio inventado de «Reservar Coche» fuera, y el sondeo del KYC que ya se para.

**Fase 1 — ganancias rápidas: 13 de 13.** 12 tokens nuevos en el kit; 441 blancos/negros normalizados; rojo de emergencia fuera de la decoración; 288 literales a tokens + **guardia `npm run diseno`**; mapa estado→color unificado; suelo de 13 px en las 9 pantallas de dinero; estados accesibles; primitivo **`Tactil`**; **PIN unificado** (`PinSheet` en el kit, `PinPad` retirado); escala de elevación (15 usos); áreas seguras en 13 pantallas; **hápticos** (`expo-haptics` instalado); menú de servicios con divulgación progresiva.

**Fase 2 — lo hecho:** escalas declaradas (`packages/ui-kit/src/theme/escalas.ts`: `tipografia`, `espaciado`, `radios`, `peso`); **paletas colapsadas** (134 valores a tokens; **hex 915 → 190**); un solo naranja y un solo blanco; **colores A1+B1 decididos y aplicados** (azul = acción; tokens oscurecidos hasta **AA con texto blanco**: 5,18–5,62:1); `expo-image` en `LazyImage`; **`mensajeDeError()`** (`constants/errores.ts`); `Sheet`, `InlineError`, `Aviso`, `EmptyState` construidos en el kit; **botón `Volver` seguro** (`components/Volver.tsx`, `ir.atras()` con salida al inicio); **4 listas virtualizadas** (movimientos del monedero, Mis tickets, historial de viajes, pedidos del mercado — todas verificadas con datos reales) y, en la tanda del 17/09 por la noche, **tres más**: el paso de resultados de Ciudad a Ciudad (`FlatList`) y las **dos pantallas de hotel** (`SectionList`, con las 5 reservas reales de la cuenta). La séptima forma del problema, `ecomerse-seller`, también está hecha (con las filas sin verificar: la cuenta no es vendedora activa). Ver `design-audit-report.md` §13. Además: `EmptyState` difundido en las pantallas de dinero (§14) y **el checkout plegado** (§15), con un primitivo nuevo del kit (`MasOpciones`) que usa por fin las escalas declaradas.

---

## 5. LO QUE QUEDA POR HACER (en el orden que recomiendo)

### A. Las 3 listas que no son un reemplazo directo — ✅ **LAS TRES HECHAS** (17/09 por la noche)
Estas **no** se arreglan cambiando `ScrollView` por `FlatList`: la lista es una sección dentro de un formulario o una máquina de pasos, y anidar listas virtualizadas **desactiva la virtualización** (React Native avisa). Las tres están hechas y compiladas; el detalle y lo que quedó sin poder verificar está en `design-audit-report.md` §13. **Antes de tocar cualquier otra lista, lee la trampa del hueco de la cabecera (§13.7 del informe): cuesta 10 minutos y se cuela en el 100 % de las conversiones.**

| Pantalla | Qué hay | Estado |
|---|---|---|
| `app/intercity.tsx:244` (`{trips.map((t) => (`) | Un `ScrollView` (L209) que es una **máquina de pasos**: `search` → `trips` → asientos → pasajero → confirmar | ✅ **HECHO Y VERIFICADO en el aparato.** El paso `trips` es ya un `FlatList` fuera del `ScrollView` (`{step !== 'trips' ? <ScrollView>…</ScrollView> : <FlatList …/>}`), con la cabecera en `ListHeaderComponent` y el vacío en `ListEmptyComponent`. Verificado con los **2 viajes reales de Bioko Norte → Bioko Sur**, midiendo el espaciado (36 px = 12 dp, el mismo que antes) y la ida y vuelta a los otros pasos. Script: `pruebas/fase2-lista-intercity.cjs`. Detalle en el informe §13.1 |
| `app/ecomerse-seller.tsx:456` (`{me.products.map((p) => (`) | `ScrollView` de **L275 a L500** con el formulario de alta, chips y **dos `ScrollView` horizontales anidados** (L370, L386); la lista es la última sección | ✅ **HECHO**: el formulario es la cabecera de la `FlatList`, el banner del plan su pie y cada producto una fila. Ojo con el `ref`: una `FlatList` **no** tiene `scrollTo`, usa `scrollToOffset`. Script: `pruebas/fase2-lista-ecomerse-seller.cjs`. ⚠️ **Las filas NO están verificadas en pantalla**: la cuenta del dueño no es vendedora activa (0 publicaciones), así que solo se comprobaron cabecera, pie y desplazamiento |
| `app/intercity-publish.tsx:370-391` | **Listas dentro de listas**: viajes publicados con sus reservas | ✅ **HECHO**: **viaje = fila, reserva = contenido de la fila** (una reserva no se puede tocar sin su viaje) y **ruta = sección** (`SectionList`). Los avisos de entrada van **antes** que los modos: el primer intento los puso después y un usuario sin cuenta habría visto la lista vacía. Scripts: `fase2-lista-intercity-publish.cjs` + `-orden.cjs` + `-indentacion.cjs`. ⚠️ La cuenta **no es conductora verificada**: el modo formulario (que cambia con el botón `+`) **no se ha podido abrir**, así que no está verificado en pantalla |

### B. Reservas del hotel — **CORREGIDO: sí son listas** (averiguado el 17/09 por la noche)
`app/lifebook-hotel-reservas.tsx:291` y `app/lifebook-hotel-panel.tsx:303`: este documento decía que su `{reservas.map((r) => (` está **FUERA** del `ScrollView` y que vivían «en otro contenedor». **Es falso.** Las líneas 291 y 303 son la **definición** del componente `Grupo`, y ese `Grupo` **se invoca desde dentro** del `ScrollView` (reservas: L246-269, tres secciones; panel: L270-273, cuatro). Se leyó la línea del `.map()` sin mirar quién lo llama.

**Son dos listas por secciones** → el instrumento es **`SectionList`**, no `FlatList`: secciones = los grupos, `renderSectionHeader` = el título con su contador, `ListHeaderComponent` = aviso/error/ocupación de hoy, `ListEmptyComponent` = el vacío. ✅ **HECHO Y VERIFICADO en el aparato el 17/09 por la noche** con las 5 reservas reales de la cuenta (2 próximas + 3 de historial). Script: `pruebas/fase2-lista-hotel.cjs`.

**Trampa que solo se ve en el aparato (te va a pasar en cualquier `SectionList`):** React Native cuenta **dos celdas por sección aunque no tenga filas** (`VirtualizedSectionList.js` L178-180), así que una sección vacía **sí dibuja su cabecera**: al principio salía un «En curso (0)» que el viejo `Grupo` ocultaba con su `return null`. Se arregla con `.filter((s) => s.data.length > 0)` (script `fase2-lista-hotel-secciones-vacias.cjs`). El `tsc` no lo ve.

Lección de método: una ancla de `grep` señala una línea; comprueba si es el **uso** o la **definición**.

### C. Difusión de lo construido (la deuda más repartida)
> **CENSO EXACTO, no cifras de memoria: `.design-audit/pendiente-C.md`.** Se regenera con `node pruebas/censo-pendiente-C.js`. A 17/09: **50 archivos con su propio `<Modal>`**, **68 vacíos escritos a mano**, y ya usan el kit **20 archivos con `EmptyState`** y **12 con `InlineError`**. Las cifras del informe («~65 archivos», «51 modales») eran aproximadas: usa el censo.
> **Antes de adoptar el kit en una pantalla que fuerza fondo OSCURO** (el feed de vídeo es negro a propósito): `EmptyState` e `InlineError` aceptan **`sobreOscuro`**, que pinta en blanco. Sin ese prop, el tema claro deja **texto oscuro sobre negro**. Se descubrió al ir a adoptar `lifebook-videos` (informe §20): la adopción «correcta» habría sido una regresión de accesibilidad.
> **Dos vacíos DUPLICADOS dentro de la app ya están fuera** (informe §21): `food.tsx` y `ecomerse.tsx` definían su propio componente llamado `EmptyState` con otra API. Se borraron y se usa el del kit. Para no perder nada al migrar, el kit ganó **`accionPrimaria`** (botón relleno cuando la acción del vacío es LA acción de la pantalla). Si vuelves a encontrar un `EmptyState` local, es el mismo caso: mira qué hacía que el del kit no hacía, **añádeselo al kit** y luego migra.
> **El error de `ecomerse.tsx` ya usa `InlineError`** (§22), con reintento. Queda su bloque de «No encontramos productos similares» (buscador por foto) y el mismo patrón en otras pantallas. Regla: **vacío y error son dos cosas distintas** y se ven distintas — el vacío explica qué lo llena, el error dice qué pasó y ofrece salir.
- **`EmptyState`.** Ojo: no todos los `length === 0` son vacíos de cara al usuario — varios son guardias internas (`if (lines.length === 0) return;`). Cuenta los **vacíos que ve el usuario y no ofrecen salida**. Criterio: **título + por qué está vacío + qué hacer ahora**. Orden: dinero, luego historiales, luego Life Book/social. El peor ejemplo citado en el informe —«Nada por aquí todavía» en `lifebook-inbox`— **ya está hecho**.
  Ya hechos: `monedero-movimientos`, `my-tickets`, `ecomerse-orders`, `trips-history`, y en las tandas del 17/09 (informe §14, §16 y §17) **`monedero`, `monedero-recargar`, `monedero-retirar`, `billing-status` (derechos y órdenes), `agente` (efectivo y recados), la BANDEJA de Life Book** —`lifebook-inbox` (sus tres pestañas), `lifebook-inbox-likes` y `lifebook-inbox-comments`, que incluía **el peor ejemplo del informe** («Nada por aquí todavía»)— **y los historiales**: `lifebook-orders`, `lifebook-guardados`, `lifebook-vistos` y `ecomerse-favorites`.
  **`InlineError` donde el vacío hacía de error:** `lifebook-vistos` enseñaba «No se pudo cargar» y ofrecía **«Ver el catálogo»** — la acción equivocada para un error. Ahora el error va con `InlineError` (**con reintento**) y el vacío con `EmptyState`. Verificado en el aparato cortando la red: antes no había forma de reintentar, ahora sí.
  **Dos reglas que salieron de ahí:**
  1. Donde el vacío es un **bloqueo de dinero**, la salida ya existe: `constants/soporte.ts` (`whatsappSoporte`). No hay que inventar un canal.
  2. Donde el vacío es una **espera** (el agente no provoca la operación, la confirma), la «acción» es **saber qué lo llena**. Un botón para cumplir la plantilla es relleno.
  **Descartado a propósito:** el vacío de repartidores de `food-orders.tsx:445` y los dos de `lifebook-inbox-followers.tsx` viven **dentro** de algo que ya tiene título (un modal, o una sección con su encabezado), y `EmptyState` exige título: adoptarlo duplicaría el encabezado.
  **Sin poder verificar (faltan datos de otro rol o la lista tiene contenido):** los vacíos de `monedero-recargar`/`monedero-retirar` (hay 4 agentes de efectivo reales), los dos de `agente.tsx` (la cuenta no tiene perfil de agente) y los tres de `lifebook-inbox` + los dos de `lifebook-inbox-comments` (esta cuenta tiene me gusta, seguidores, menciones y comentarios).
- **`InlineError`: 11 pantallas** lo usan; quedan los sitios donde el error no es una línea suelta (bloques con más estructura). Los `Alert` en pantallas de dinero bajaron de 34 a 12 (`food-checkout` 3, `ecomerse-checkout` 7, `billing-status` 2).
- **`Sheet`: adoptado en 6 pantallas** (`billing-status`, `ecomerse-orders` —§18—, `food-orders` —§19 y §19-quater—, `ecomerse-seller` —§19-bis— y `food-owner` —§19-ter—). Quedan ~45 archivos con su propio `<Modal>`: la migración va por tandas, **empezando por los modales de dinero**. El mejor candidato es el modal que **ya hace a mano** lo que el `Sheet` trae (cerrar al tocar fuera, respetar el botón de atrás, atrapar el foco, no cerrarse mientras trabaja): ahí el cambio es **quitar** código.
  - **Trampa 1 (en los dos sentidos):** dentro de `{cond && ( … )}` o en un `return`, solo cabe **una expresión**: el comentario va como `/* … */`. En hijos de JSX es al revés, `{/* … */}`. Y **cuidado al escribir eso mismo dentro de un script**: la secuencia `*/` cierra el bloque de comentario y el script no compila (pasó).
  - **Trampa 2 (la encontró el aparato):** una hoja inferior con **lista larga** se estiraba hasta ocupar la pantalla. Ya está arreglado en el kit (`hojaAbajo` con `maxHeight: '80%'`): si tocas esa hoja, no le quites el tope.
  - **Truco de los scripts:** ajusta los **imports por patrón** (no por línea exacta) y **no quites `Modal` del import si el archivo usa otro `<Modal>` en otro sitio** (el script de `food-owner` lo detecta y avisa en vez de romper el archivo).
  - **Prop tipada = el `tsc` te avisa:** `subtitle={order.restaurantName ?? undefined}` — con un `<Text>` suelto un `string | null` pasaba desapercibido.
  - **No verifiques el botón «Enviar»** de un modal de dinero: escribe de verdad en el backend del dueño.
  - **Sin verificar en pantalla (roles que esta cuenta no tiene):** los de `food-orders` y `food-owner` necesitan **cuenta de restaurante**. Son 3 de las 6 adopciones.
- **`Aviso`: sigue en 1 pantalla, y está bien así.** Revisados los `Alert` informativos que quedan en dinero (`billing-status:142`, `ecomerse-checkout:181`): **no** deben pasar a `Aviso`, porque es un *toast* que no se puede pulsar y se va en 2,6 s, y esos mensajes piden leer y actuar. `Aviso` es para lo que no pide nada («guardado», «copiado»), y en dinero casi no existe.

### D. El barrido de escalas (lo más mecánico y lo más visible)
`escalas.ts` está declarado y **la app ya lo usa en parte**: la **tanda 1** (informe §26) llevó **1.004 `fontSize` y 541 `borderRadius`** a la escala en **169 archivos**, y **sin mover un píxel** — se verificó comparando `bounds` antes y después, idénticos. Estado hoy: **`fontSize` 757 · `borderRadius` 709** (lo dice `npm run diseno`). Tanda 1: **1.004 `fontSize` + 541 `borderRadius`**, valores idénticos, **cero cambio visual medido** (comparando `bounds`). Tanda 2 (informe §27): los que sí mueven píxeles — `13` → 14 (584), `12,5` → 12 (332), `11,5` → 12 (283), `13,5` → 14 (174) — con política escrita (paso más cercano, empate hacia arriba) y **desplazamientos de 2-5 px confirmados en el aparato**.
- **Trampa que ya costó un susto:** en un barrido con regex, un lookahead `(?!\d)` **no excluye el punto**: `13(?!\d)` también captura el `13.5` y deja `tipografia.body.5`. Hay que usar `(?![\d.])`. El `tsc` lo cazó en ~150 archivos y se reparó con un script; **sustituye siempre en tandas que se puedan compilar en el momento**.
- **Lo que queda:** los valores a más de 1 px de cualquier paso (`9`, `10`, `14,5`, `15`, `17`, `22`…) — eso es **rediseñar tamaños**, va por pantallas y mirándolo — y el **espaciado** (46 valores, solo 47 % múltiplos de 4) → `espaciado`.
- **Lo que queda, y por qué no se hizo de golpe:** los **fraccionarios** (`11,5`, `12,5`, `13,5`) y el `13`. Llevarlos a la escala **mueve píxeles** (13 → 14), así que va **por pantallas y mirándolo**. Y el **espaciado** (46 valores, solo 47 % múltiplos de 4) → `espaciado`.
- **La receta que funcionó:** script por familias de valores que solo sustituya los **valores idénticos**, con la guardia vigilando, **y comparar `bounds` de una pantalla cuyos datos no cambien** antes y después. Esa comparación es la que demuestra «cero cambio visual» en vez de prometerlo.
- **La guardia empuja hacia la escala:** si añades un `fontSize: 34` a mano, **falla por archivo** aunque el total de la app baje. La solución buena no es re-fijar la base, es **usar el token** (`tipografia.display`).
> Aquí es donde por fin compensa un **development build** (recarga en caliente en vez de 1 m 20 s + 111 MB por cambio). Requisitos: copia de los 3 ficheros de `android/`, `gradlew assembleDebug` **sin prebuild**, y sufijo de `applicationId` para no pisar la app instalada.

### D-bis. Fallos FUNCIONALES encontrados de paso (no son diseño, pero son tuyos)
> ⚠️ **ANTES DE PERSEGUIR NINGUNO: COMPRUEBA QUE LA APP TIENE SESIÓN.** Al final de la jornada del 17/09 la app quedó **en la pantalla de inicio de sesión** (informe §29). Cuatro «fallos» distintos —el feed de vídeo con «Sesión inválida o expirada», la búsqueda por foto con error vacío (401), el sondeo `/lifebook/chat/unread` y ráfagas de `Network request failed`— **encajan todos con la sesión caducada**. Inicia sesión y repítelos antes de tocar nada.
- **La búsqueda por foto del Mercado NO funcionaba** (informe §23): verificado de principio a fin en el aparato. **Ya no se disfraza**: la app dice «No se pudo procesar la imagen» con «Elegir otra foto» en vez de «no encontramos productos similares». Descartados el `FormData` (el mismo patrón funciona en `lifebook.uploadFile`), el endpoint (existe: da 401, no 404) y el `auth: true` (lo lleva). **Sospechoso que queda: la sesión** (§29).
- **El feed de vídeo responde «Sesión inválida o expirada»** (informe §20). Por eso no carga.
- **Un viaje publicado sin ruta**: la cabecera dice «? → ? · 1 viaje» (informe §28). Si el servidor no guarda los distritos, todos los viajes se verán así.
- **El sondeo `/lifebook/chat/unread` falla de forma repetida** (informe §15), y la batería del sondeo está en la Fase 3.
- *(Corregido: los topes «0 XAF» del monedero NO eran un fallo — la cuenta estaba vacía. Hoy tiene 60.075 XAF y topes de 100.000.)*

### E. Fase 2, punto 25 — plegar el checkout ✅ **HECHO** (informe §15)
El informe pedía plegar «nota, cupón, hora, zona». **Tres de esos cuatro no eran lo que decía**: la **zona** define la tarifa y el **cupón** cambia el total (y el código documenta que el descuento debe verse antes de confirmar), así que plegarlos sería esconder información de dinero; **hora** no existe como campo en ninguno de los cuatro checkouts. Lo único accesorio es **la nota / mensaje al vendedor**, y se pliega en los tres checkouts que la tienen (`food-checkout`, `ecomerse-checkout` y `lifebook-carrito-checkout`, donde es una nota POR TIENDA).

Se hizo con un **primitivo nuevo del kit** —`packages/ui-kit/src/primitives/MasOpciones.tsx`— y no con tres copias a mano. Usa las escalas declaradas, expone `expanded` al lector de pantalla y **se abre solo si ya hay texto** (`abiertoInicial`), para que lo que escribió el usuario no quede escondido. Verificado en el aparato en `food-checkout` con un carrito real (abre, cierra y el enlace cambia de texto y de etiqueta accesible). **Sin verificar** los otros dos: sus carritos están vacíos. Script: `pruebas/fase2-plegar-checkout.cjs`.

### F. Fase 3 del informe (fondo, sin empezar)
Identidad visual única para los tres sub-mundos · **programa de accesibilidad real con VoiceOver/TalkBack** en los 12 flujos de dinero · decidir **modo oscuro** (completar o retirar; hoy es inerte) · auditoría de batería del sondeo · extraer los bloques de `conductor.tsx` (2.071 líneas) y `taxi.tsx` (2.068) · **guardia de diseño en CI** · jerarquía por pantalla.

---

## 6. Pendiente del DUEÑO (no lo hagas tú)

1. **Probar con el tamaño de fuente del sistema al máximo** y decir qué pantalla se descuadra (ahí va `maxFontSizeMultiplier`). Es la única validación de la Fase 1 que falta.
2. **Mirar en pantalla los colores A1+B1** (el naranja ahora es más profundo; el azul, más sólido) y decir si chirría.
3. **Confirmar el teléfono de soporte**: se puso `+8615504426087` (dio un número **+86**, China). Si quería el de Guinea Ecuatorial, se cambia en `constants/soportе.ts` (único sitio).
4. Decidir sobre el **dev build** (el análisis de riesgos está en el chat anterior: prebuild, `applicationId` compartido y mediciones de rendimiento engañosas).

---

## 7. Cómo se hace una tanda (receta probada)

1. Localiza el sitio con `grep`/`read` (**no adivines**: las cifras de los informes hay que confirmarlas al tocarlas; ya fallaron `#adFade`, las «7 listas» y las reservas del hotel).
2. Script en `pruebas/*.cjs` con **anclas exactas**; si un ancla no aparece, el script **no escribe** y lo dice.
3. `npx tsc --noEmit` → `npm run diseno` (si mejora, `-- --base`).
4. Compilar (`§3`) → instalar → `uiautomator dump` para comprobar en el aparato. **Y mide**: los `bounds` son la única forma de ver si el espaciado se conservó (así se descubrió la trampa nº 1 de abajo). `pruebas/ver-pantalla.ps1` y `pruebas/tocar.ps1` hacen el volcado y los toques.
5. `adb logcat -d | Select-String "ReactNativeJS.*Error"` → debe decir **ninguno**. Ojo: `--pid=<el de la app>` evita confundir tus fallos con los de otras apps del teléfono (había `FATAL EXCEPTION` de *otro* proceso).
6. Actualizar `design-audit-report.md` (§11/§11-bis y, desde el 17/09 por la noche, **§13**) con lo hecho **y con lo que se descubrió por el camino** — incluidas **tus propias erratas** y lo que **no** has podido verificar.

---

## 8. Trampas ya pagadas al virtualizar listas (no las vuelvas a pagar)

Todas costaron un error real en la sesión del 17/09 por la noche. El detalle, en `design-audit-report.md` §13.

1. **La cabecera no hereda el hueco.** `ListHeaderComponent={<>{a}{b}</>}` mete todo en **una celda**, y el `gap` de `contentContainerStyle` separa **celdas**, no hijos de una celda: los elementos de dentro quedan **pegados**. Envuelve la cabecera en un `View` con el gap que tenía el contenedor. (Se midió: dos textos de `intercity` pasaron de empezar y terminar en el mismo píxel a 36 px = 12 dp.) Afectó a 4 archivos, uno de ellos de la sesión anterior.
2. **En `SectionList`, una sección vacía SÍ dibuja su cabecera** (`VirtualizedSectionList.js` L178-180 cuenta 2 celdas por sección pase lo que pase). Salía un «En curso (0)» que el viejo `Grupo` ocultaba. Filtra: `.filter((s) => s.data.length > 0)`. El `tsc` no lo ve.
3. **El `gap` del contenedor manda en el espaciado.** Si el contenido viejo tenía huecos distintos según el nivel (12 entre bloques, 10 dentro), al virtualizar quedan **uniformes**: hay que elegir y **decirlo** (se eligió 12 y se avisó al dueño del cambio de 2 dp).
4. **`FlatList`/`SectionList` no tienen `scrollTo`**, tienen `scrollToOffset`. Y `stickySectionHeadersEnabled` va en **`false`** si los títulos nunca fueron pegajosos.
5. **El orden de las ramas importa.** Al partir una pantalla en «modo lista / modo formulario», los avisos de entrada (sin cuenta, sin alta) van **antes**: si no, un usuario sin sesión ve la lista. El compilador no lo detecta porque las dos ramas son válidas.
6. **Una ancla de `grep` señala una línea, no distingue uso de definición.** El informe y este documento dijeron dos veces que algo «estaba fuera de» un contenedor cuando la línea citada era la **definición** del componente, no el sitio donde se usa.
7. **Los números de línea caducan** en cuanto se toca el archivo. Los remates se hacen buscando por **contenido** (y comprobando el contenido antes de escribir), nunca por número de línea.
8. **Un fallo de `packageRelease` puede ser transitorio.** Reintenta antes de «arreglar» nada; y mira primero **C:**, que sigue con 0,67 GB libres.
