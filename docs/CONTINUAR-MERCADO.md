# Continuar el Mercado — relevo para la próxima sesión

> ## ⚠️ LEER `BRIEFING-MERCADO.md` ANTES QUE ESTO
>
> **Hay un `BRIEFING-MERCADO.md` en la raíz del repo (167 líneas) y NO lo leí al empezar.** Tiene la
> respuesta a dónde vive el backend y varias cosas que me habrían ahorrado horas. **Léelo primero.**

## 0 · DÓNDE VIVE EL BACKEND DEL MERCADO

Confirmado por huellas del servidor **y** por el briefing:

```
server: tcbgw
x-cloudbase-upstream-type: Tencent-SCF_HTTP
api.egrouteplan.com -> api.egrouteplan.com.tcbaccess-sg.tencentcloudbase.com (43.173.153.178)
```

| | |
|---|---|
| **Plataforma** | **Tencent CloudBase `egrouteplan-d0gpkwbe7ce86f609`, region ap-singapore** |
| **Forma** | **ZIP Web Function `egrouteplan-api`** — NO CloudRun, NO Docker |
| **Runtime** | Nodejs18.15 · **NestJS** · Prisma (`rhel-openssl-1.1`) |
| **Paquete** | `escrow-wallet-malabo` |
| **Arranque** | `scf_bootstrap` -> `export PORT=9000` · `exec node dist/src/main.js` |
| **Base de datos** | PostgreSQL `pgdb-dzsevrbk`, VPC privada 172.22.0.4 — **NO accesible desde local** |
| **Media** | **Bitiful S3 `s3.bitiful.net/egapp-media`** — NO el COS de Tencent |
| **Despliegue** | 2 fases: `getFunctionUploadUrl` -> `PUT` del ZIP -> `updateFunctionCode` |
| **MCP CloudBase** | **usar `cloudbase-api-keys` (CAM)**; el integrado dice READY pero falla |
| **Errores** | **logs CLS** (`queryLogs` del servicio `tcb`) — la unica fuente de verdad |

### Donde esta el CODIGO

```
D:\egapp\.auditoria-servicios\backend\     <- EL BACKEND VIVO, EXTRAIDO (9.828 ficheros)
  scf_bootstrap
  package.json   (y .env con las claves)
  dist\src\ecomerse\ecomerse.controller.js    33.783 B  <- EL CONTROLADOR DEL MERCADO
  dist\src\ecomerse\ecomerse.service.js      166.066 B  <- la logica
  dist\src\ecomerse\ecomerse.dto.js           18.233 B
  dist\src\ecomerse\ecomerse.module.js         2.677 B
  dist\src\ecomerse\ecomerse-storage.service.js 4.860 B
  dist\src\http\ecomerse-docs-admin.controller.js
```

**Es `dist/` — COMPILADO, no fuente.** Y el source map **NO lleva el original**
(`sourcesContent: 0`; solo declara `../../../src/ecomerse/ecomerse.controller.ts`).
**O sea: el `.ts` NO esta en el disco.** Para editar hay que **recuperar el repo**, o trabajar sobre
el `.js` (que **no** esta minificado).

### Y `D:\egapp\backend\server-src\` NO SE TOCA

El briefing lo dice literal: **esta VIEJO, no lo edites.** Lo que corre en produccion es
`.auditoria-servicios\backend\`.

> **Error mio:** escribi `backend/server-src/ecomerse-ui.controller.ts` (12 KB) **en el arbol viejo**.
> El contenido sirve —es NestJS, la forma es correcta— pero **esta en el sitio equivocado**. Hay que
> moverlo al modulo `ecomerse` del repo real.

---

**Estado al cerrar esta sesión.** Escrito para que la próxima **no tenga que redescubrir nada** — ni
los números, ni las trampas del entorno, ni lo que ya está decidido y por qué.

---

## 1 · Qué hay hecho, y qué NO

### Hecho y verificado en el móvil

| | |
|---|---|
| **12 componentes** | `Vista · Contenedor · Texto · Imagen · Icono · Rejilla · CuentaAtras · Carrusel · Scroll · Lista · Entrada · Precio` |
| **13 tipos en la lista blanca** | los 12 + `Condicional`, que **es nodo de control, no widget** (está en `TIPOS_SOPORTADOS`, NO en `COMPONENTES`) |
| **47 alias** | nombres de Taobao + los hashes hex del `.dx` |
| **2 secciones servidas por el servidor** | portada del Mercado (`ui/home`) y ficha de producto (`ui/detail?id=…`) |
| **Extensión `ext:`** | tabla (`ext:tabla`), valor por defecto (`ext:defecto`), frase (`ext:separador`) |

### NO está hecho — y conviene saberlo antes de leer nada más

- **El backend del Mercado NO está en este repo.** El cliente llama a `https://api.egrouteplan.com/api/ecomerse/*` y **no hay `@Controller('...ecomerse')` en el código.** Lo que hay en `backend/server-src/` es **Lifebook**, otra cosa.
- **El controlador para NestJS está escrito pero SIN DESPLEGAR**: `backend/server-src/ecomerse-ui.controller.ts`. Hay que pegarlo donde viva el Mercado y **montarlo bajo `/api`**.
- **Solo 3 de 269 plantillas `.dx` están decodificadas.**
- **El lenguaje de expresiones de Taobao NO está implementado** (93 `DX_PARSER_*`). Es deliberado: ver §5.

### Números exactos para comparar

```
tsc:      5 errores       <- LA BASE. Si sube, algo se rompió.
rutas:    EXIT=0
logica:   EXIT=0
oraculo:  78 pass / 0 fail
```

**Los 5 errores de `tsc` son preexistentes y NO son del Mercado:**
`backend/deploy-vercel/api-index.ts` (4) · `packages/map/src/mapWeb.tsx:287` (1).

---

## 2 · Cómo se verifica (copiar y pegar)

```powershell
$node='C:\Users\nisang12\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
Set-Location 'D:\egapp'
& $node 'node_modules\typescript\bin\tsc' --noEmit                    # 5 errores
& cmd /c 'npm run rutas'                                              # EXIT=0
& cmd /c 'npm run logica'                                             # EXIT=0

# El oráculo. **Desde su carpeta**: con rutas absolutas largas falla por "filename too long".
Set-Location 'D:\Users\nisang12\AppData\Local\Programs\DeepSeek Harness\mercado-fase1\o1-oraculo'
& $node --test "test/*.test.mjs"                                      # 78 pass / 0 fail
```

### Y en el móvil, para ver las secciones

```powershell
$node='...\node.exe'
# 1. El servidor de UI (el endpoint, corriendo en local)
Start-Process -FilePath $node -ArgumentList 'D:\egapp\tools\servidor-ui.mjs','8788' -WindowStyle Hidden

# 2. El puente: el localhost:8788 del MOVIL pasa a ser el del PC
& adb reverse tcp:8788 tcp:8788

# 3. Compilar CON el override
$env:EXPO_PUBLIC_UI_HOST='http://localhost:8788'
Set-Location 'D:\egapp\android'; .\gradlew.bat assembleRelease --no-daemon

# 4. Abrir
& adb shell "am start -a android.intent.action.VIEW -d `"egrouteplan://ecomerse`" com.egrouteplan.app"
```

**Sin `EXPO_PUBLIC_UI_HOST` el APK apunta al servidor de verdad, donde `ui/home` da 404 hoy → las
secciones simplemente no aparecen, y el Mercado funciona entero. Eso está verificado: no es un
supuesto.**

---

## 3 · El decodificador de `.dx` — lo que hay y lo que falta

### Dónde está

```
mercado-fase1\t1-alidx\decoder.mjs          <- el decodificador, con su SPEC en el encabezado
mercado-fase1\t1-alidx\test\decoder.test.mjs
mercado-fase1\t1b-alidx-v2\                 <- la v2
mercado-fase1\re-a\catalogo-plantillas.json <- las 269, con su vocabulario extraido (752 KB)
mercado-fase1\re-a\salida-plantillas.txt    <- la estructura verificada del formato
```

### Cómo se usa

```js
const D = await import('file:///.../mercado-fase1/t1-alidx/decoder.mjs');
const a = D.decodeAlidx(fs.readFileSync(ruta));
a.stringPool.entries   // [{ index, key, keyHex, byteLength, text }, ...]  <- EL VOCABULARIO
a.headerTable.values   // la tabla de cabecera
a.blocks               // los trozos
```

**Cuidado: `decodeAlidx` devuelve `BigInt` en algunos campos. `JSON.stringify` LANZA.** Hay que
pasarle un replacer:

```js
JSON.stringify(a, (k, v) => typeof v === 'bigint' ? String(v) : v)
```

### Lo que el decodificador NO sabe, y está escrito en su propia cabecera

- **El algoritmo de hash de cadenas** (DESCONOCIDO)
- **La semántica del campo u16 tras la cabecera** (DESCONOCIDO)
- **La mayoría de las claves de nodo (nombre de widget) NO están en ningún pool** (DESCONOCIDO)
- **La agrupación de registros en árbol** es INFERENCIA, no está verificada

**O sea: sale el VOCABULARIO (cadenas) y la estructura de bloques, pero NO sale «este nodo es un
`DXTextBox`».** Eso es lo que falta para replicar de verdad.

### Las 3 que ya están decodificadas

```
taobao\jadx-res\resources\assets\template\homepage\secondfloor\10\main.dx                    2.504 B
taobao\jadx-res\resources\assets\template\homepage\home_m_h_searchBar_slim_protocol_version\5\main.dx   20.784 B
taobao\jadx-res\resources\assets\template\homepage\home_m_h_v7_uone_second_pit_searchbar_slim_protocol_version\6\main.dx  31.788 B
```

**Solo hay 3 carpetas en `template\homepage\`.** Las otras 266 están en `template\<otro modulo>\`.
**La portada de Taobao es `secondfloor` + la barra de búsqueda — y eso ya está decodificado.**

---

## 4 · LA TAREA: decodificar la portada

### Lo que ya se sacó de los bytes (esto es el punto de partida, no hay que repetirlo)

**`secondfloor` — 14 cadenas, el piso entero:**

```
visible · invisible · gone              <- los TRES estados de visibilidad
item.0.content.title          item.0.content.titleColor
item.0.content.titleIconUrl   item.0.content.subTitle
item.0.content.tipText        item.0.content.tipTextColor
item.0.content.tipIconUrl     item.0.voiceText
android · 0 · 1
```

**Eso es una CABECERA DE PISO: título, subtítulo, aviso con color e icono, y voz.** Y **`item.0`**:
**Taobao accede a los datos POR ÍNDICE, no por nombre.** Nosotros usamos `$item.title`.

**La barra de búsqueda — 146 cadenas, y dos cosas que NO tenemos:**

```
windowWidth · match_parent · match_content              <- tamaño estilo Android
style.styleData.searchBarSizeAdaptiveScreenConfig       <- ADAPTATIVO a la pantalla
style.styleData.searchBox.darkBgColor / lightBgColor / bgColor
style.styleData.searchBox.darkModeBorderColor / darkBorderColor
```

**`style.styleData.*` son tokens de tema (claro/oscuro) resueltos por el servidor.** Y hay
**variables de entorno** (`windowWidth`).

### Lo que hay que hacer

1. **Decodificar los 270 `.dx`** y volcar el `stringPool` de cada uno a un JSON. **Es mecánico y no
   necesita entender el binario** — el decodificador ya saca el pool. Con eso se ve **qué pisos
   tiene la portada** y **qué campos usa cada uno**.
2. **Con ese volcado, extraer el vocabulario común**: los `item.N.content.*` que se repiten son
   **el contrato de datos de la portada**.
3. **Decidir si merece la pena atacar el AST** para sacar los nombres de widget. **Es la parte
   difícil** (las claves de nodo no están en ningún pool). **Antes de meterse, medir cuánto falta.**
4. **Replicar**: los pisos se pueden expresar con lo que YA hay (`Vista` + `Lista` + el vocabulario
   `ext:`), **salvo el tema** (claro/oscuro) y **las variables de entorno**, que no existen.

### Y lo que NO hay que hacer

**No implementar el lenguaje de expresiones sin decidirlo antes.** Hay **127 `expression`, 50
`operator`, 42 `CallExpression`** solo en las plantillas de portada. Eso es un intérprete dentro
del cliente. **Es una decisión de producto, no un paso de implementación.**

---

## 5 · Las decisiones ya tomadas, y por qué (no las revuelvas sin leer esto)

| decisión | por qué |
|---|---|
| **`Condicional` filtra sin «sino» si hay 1 hijo** | Es literal de `tb/xg5.java`: `getChildrenCount() == 1` → solo el «entonces» |
| **La plantilla de una `Lista` NO se resuelve en `preparar`** | `$item.*` no existe entonces. Resolverla ahí la dejaba **muerta** y todos los elementos vacíos |
| **`Carrusel`, `Rejilla` y `Scroll` NO repiten** | **Hay UN repetidor: `Lista`** (`DXRecyclerLayout`). Una franja horizontal es `Lista` con `ORIENTATION: 0` |
| **`ext:*` para tabla, defecto y frase** | **No son de Taobao**: Taobao las resuelve con sus 93 parsers. El prefijo hace imposible confundirlas con una clave hex |
| **`esVerdadero`: `[]` cuenta como NO** | En JavaScript `[]` es truthy, y en un árbol declarativo eso pinta bloques con datos que no existen |
| **Los módulos puros son autocontenidos** | Es lo que permite probarlos en Node **en un segundo**. Un import interno sin extensión los rompe (`ERR_MODULE_NOT_FOUND`) |
| **No hay árbol de reemplazo en el cliente** | Un repuesto es una segunda fuente de verdad que se envejece en silencio |

---

## 6 · Trampas del entorno (cada una costó un build)

| | |
|---|---|
| **`adb shell input text` con IME chino** | El texto va al compositor de 拼音, NO al campo. **Hay que cambiar a Google Latin** — y devolverlo luego |
| **Android bloquea `http://`** | `usesCleartextTraffic` ausente = `false` desde API 28. **La pantalla sale vacía SIN decir por qué.** Se añadió `localhost` a `network_security_config.xml` |
| **El puerto de logs es 256 KiB** | `adb logcat -G 4M` **antes** de capturar, o se pierden los logs de arranque |
| **El móvil se desconecta solo** | `adb kill-server` + `start-server` lo recupera |
| **Gradle a veces falla y luego pasa** | Reintentar |
| **Un build "successful" puede no reconstruir el JS** | **Comprobar la fecha del bundle** y buscar la cadena dentro |
| **`Set-Content` mete BOM y NUL** | Usar la herramienta de edición, no PowerShell, para el código |
| **`[System.IO.File]` NO sigue a `Set-Location`** | Rutas absolutas siempre |
| **Node no carga `.ts` con imports internos sin extensión** | Por eso los módulos puros son autocontenidos |
| **El oráculo falla con rutas absolutas largas** | Ejecutarlo **desde** `o1-oraculo` |

---

## 7 · Las redes que NO hay que romper

**Cinco tests de invariante. Si uno se pone rojo, se ha roto algo real — no lo desactives.**

1. **El contrato servidor↔cliente** — toda clave que manda el servidor tiene que conocerla el
   cliente. **Cazó 3 claves inventadas** que habrían fallado en silencio.
2. **El árbol no puede estar definido dos veces** — compara el del servidor local con el del
   controlador NestJS, normalizados. **Ya cazó una divergencia real.**
3. **Los cinco `canonizarColor` coinciden** — el bug del color se repitió **cuatro veces**.
4. **`[]` cuenta como NO** — la tabla de verdad, entera.
5. **Los módulos puros siguen autocontenidos** — si aparece un import interno, se pierde la prueba
   en Node.

---

## 8 · Trabajo pendiente, por orden

| | |
|---|---|
| **1** | **Decodificar los 270 `.dx`** y volcar los `stringPool` → el vocabulario de la portada |
| **2** | **Pegar y desplegar el controlador** (`backend/server-src/ecomerse-ui.controller.ts`), montado bajo `/api`. **Falta añadirle `/detail`** |
| **3** | **El masonry de la rejilla principal.** Hoy `ecomerse.tsx:421` es `numColumns={2}` — **rejilla uniforme, NO waterfall**. Taobao usa waterfall: **dos `Lista` en fila con los datos repartidos** |
| **4** | **El tema** (`style.styleData.*`, claro/oscuro) y **las variables de entorno** (`windowWidth`) — lo que Taobao tiene y nosotros no |
| **5** | Más secciones, una por pantalla, **aditivas y verificadas** |

---

## 9 · Ficheros de esta línea de trabajo

**Creados por mí, todos nuevos:**
```
components/ecomerse/         46 ficheros (12 componentes + 13 módulos de atributos + el núcleo)
api/ecomerseUi.ts            el cliente de la UI
tools/servidor-ui.mjs        el endpoint, corriendo en local
backend/server-src/ecomerse-ui.controller.ts   el controlador para NestJS
app/ecomerse-ui.tsx          la pantalla de demostración
components/ecomerse/FranjaServidor.tsx         la sección que se monta en pantallas reales
```

**Modificados, y son vuestros — 4 ficheros, cambios mínimos y documentados:**
```
app/ecomerse.tsx                 +2 lineas (el import y <FranjaServidor ruta='home' />)
app/ecomerse-detail.tsx          +2 lineas y el bloque de la seccion
constants/rutas.ts               +4 lineas (/ecomerse-ui, lo exigia el auditor de rutas)
android/.../network_security_config.xml   +2 lineas (localhost)
```

**`app/ecomerse-checkout.tsx` aparece como modificado pero NO es mío** — es un cambio vuestro
anterior.

---

## 10 · Dos cosas que quedaron a medias

1. **El teclado del móvil está en Google Latin.** Lo cambié para poder escribir con `adb` (con
   Sogou/拼音 el texto iba al compositor) y el móvil se desconectó antes de poder restaurarlo.
   `Ajustes → Sistema → Idiomas → Teclado en pantalla → Sogou`.

2. **El servidor local está corriendo** en el puerto 8788. Cuando no haga falta:
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
     Where-Object { $_.CommandLine -like '*servidor-ui*' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```

---

## 11 · Actualización (15/10, sesión siguiente) — el punto 1 está hecho

**Hecho:** los 269 `.dx` volcados y medidos. Salida en
`mercado-fase1\t1c-vocabulario\` (`out/plantillas.jsonl`, `out/arboles/` con los 246 árboles,
`out/analisis.txt`, `INFORME-VOCABULARIO-PORTADA.md`, **21 tests**). Línea base intacta y
reverificada: **tsc 5 errores · rutas EXIT=0 · logica EXIT=0 · oráculo 78/0**.

### Seis cosas de este relevo que la medición corrige

| # | Decía | Es |
|---|---|---|
| 1 | «Solo 3 de 269 plantillas decodificadas» | **Las 246 reales al 100 %** desde `t1b-alidx-v2` (8 son de 0 bytes **en el APK de Taobao**; 15 son NANO, otro formato) |
| 2 | «`android` · `iOS`» | **Tres plataformas**: `android` ×148, `ios` ×26, **`harmony` ×15** (+ `iOS` ×5, `Harmony` ×4 con la caja a capricho) |
| 3 | «Nosotros usamos `$item.title`» | El corpus usa **dos formas**: `item.<campo>` (51 cadenas) y `item.N.<campo>` (348, más 5 `item.N` a secas). **El cliente ya resuelve las dos** — comprobado, con test |
| 4 | El tema es un bloque pendiente | Son **31 tokens en 6 de 246 plantillas**, casi todos en las barras de búsqueda. El color y el tamaño van **literales** (`#FF6200`, `16ap`) |
| 5 | (se midió «sin nombre» con la tabla del APK) | Con la tabla **y** los módulos del cliente, el hueco real es **7,56 % de los usos** (263 claves), no el 71 %. **75 claves las nombra solo el cliente** (35.715 usos) |
| 6 | — | **Typo en la plantilla de Taobao**: `style.styleData..searchBarSizeAdaptiveScreenConfig` (doble punto) |

### Y la pregunta 3 (§4) ya tiene respuesta medida

**El AST no hay que atacarlo: ya está leído** (7.732 nodos, 40.626 atributos). Lo que falta es
**nombrar**: 263 claves (7,56 % de los usos) y 70 tipos de nodo (10,98 %). Los huecos dominantes
**no son widgets nuevos**:

```
00000006dfd9f48f   333 usos · 119 plantillas   LAYOUT_* + BACKGROUNDCOLOR + CORNERRADIUS  → contenedor anónimo
10afdde3528088d0   100 usos ·  17 plantillas   LAYOUT_* + LOTTIE_URL + SCALETYPE          → familia VÍDEO/LOTTIE
```

**Los tres nodos que la portada necesita y el cliente no pinta** — y por los que las dos barras y
`secondfloor` se descartarían enteras — son `10afdde3528088d0`, `00000006dfd9f48f` y
`a9650a8c22a6c401`. Dos son contenedores; el tercero y los lottie son trabajo real.

**Siguiente:** el punto 2 (`/detail` en el controlador) sigue pendiente y **necesita una decisión
tuya**: el backend del Mercado no está en este repo, así que el controlador no se puede desplegar
desde aquí. El punto 3 (masonry) y el 4 (tema + entorno) sí son locales.

---

## 12 · Punto 2, hecho hasta donde se puede desde aquí (15/10)

**Dónde vive ahora el controlador de la UI** — en el árbol **VIVO**, no en `backend/server-src/`:

```
.auditoria-servicios\backend\dist\src\ecomerse\ecomerse-ui.controller.js   NUEVO · el módulo real
.auditoria-servicios\backend\dist\src\ecomerse\ecomerse.module.js          +1 require, +1 en `controllers`
```

| | |
|---|---|
| **Rutas** | `@Controller('ecomerse/ui')` + `home` y **`detail` (la que faltaba)**. `main.js` ya hace `setGlobalPrefix('api')` → `/api/ecomerse/ui/home` y `/api/ecomerse/ui/detail?id=…` |
| **Datos** | **Del servicio real**: `EcomerseService.catalog({})`, que ya mapea `id · title · priceXaf · photos`. **Sin stub y sin datos de ejemplo.** `detail` **excluye** el producto que se está mirando |
| **Forma** | Los dos árboles salen de `arbolDeFranja(rotulo)`; el JSON, de `datosDeDestacados(productos, excluir)` |

### Verificado, con la prueba delante

- `node --check` limpio en los dos ficheros.
- El controlador **se carga**: exporta `EcomerseUiController`, `ARBOL_DESTACADOS`,
  `ARBOL_RELACIONADOS`, `ESQUEMA_UI`, `CLAVES_UI`, `datosDeDestacados`, `arbolDeFranja`.
- **Metadatos de Nest**: el módulo **registra** el controlador; `path='ecomerse/ui'`; rutas `home` y
  `detail`. *(Una ruta no se sirve por estar escrita: se sirve por estar en `controllers`.)*
- Los **dos** árboles son **normalizados idénticos** a los de `tools/servidor-ui.mjs`.
- `datosDeDestacados`: excluye el vigente, y con cero productos o solo el excluido devuelve `null`
  («no hay nada que pintar»).
- **Oráculo: 78/78.** Y su **red nº2 ahora vigila ESTE fichero** — antes leía el `.ts` del árbol
  viejo como texto con `new Function`; ahora carga el objeto real, compara los dos árboles y
  comprueba el registro.
- `https://api.egrouteplan.com/api/ecomerse/ui/home` responde **404 hoy**: el código está, el
  despliegue no.

### Lo que NO está hecho, y por qué

- **No se ha desplegado.** Este entorno **no tiene el MCP de CloudBase** (ni las claves CAM), y a
  producción no se sube sin ti. El despliegue es el de 2 fases de §0 y el fichero que cambia está
  dentro de `.auditoria-servicios\backend\`, que es de donde sale el ZIP.
- **No se ha probado contra la base**: `catalog()` necesita PostgreSQL (VPC privada, no accesible
  desde local). En producción, un 200 con `arbol: null` significa «no hay catálogo», no un fallo.
- **El `.ts` viejo sigue en `backend/server-src/`** … **borrado el 15/10** a petición tuya (no estaba
  en git, así que no se puede recuperar de ahí; su contenido vive ahora en el controlador del módulo
  real, comentarios incluidos).
- ⚠️ **`.auditoria-servicios/` está IGNORADO por git** (`.gitignore:61`). Es decir: **el controlador
  nuevo, que es el que se despliega, NO está versionado.** Vive en el disco —que es lo que usa el
  despliegue—, pero un `git clean` o un clon nuevo se lo lleva por delante. **Cuando se recupere el
  repo fuente hay que meterlo en `src/ecomerse/`**, y hasta entonces el fichero solo existe aquí.
  El oráculo lo vigila (red nº2), así que si desaparece, el test se pone rojo — que es la única
  alarma que hay.

---

## 13 · Desplegado y verificado EN PRODUCCIÓN (15/10)

```
GET https://api.egrouteplan.com/api/ecomerse/ui/home        -> 200  { esquema:1, arbol, datos }
GET https://api.egrouteplan.com/api/ecomerse/ui/detail?id=… -> 200  { esquema:1, arbol, datos }
```

`/api/ecomerse/ui/detail` **existía como 404 esta mañana**: era la ruta que faltaba.

### Cómo se comprueba sin abrir la app

```powershell
$node='C:\Users\nisang12\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
Set-Location 'D:\Users\nisang12\AppData\Local\Programs\DeepSeek Harness\mercado-fase1\o1-oraculo\work'
& $node verificar-produccion.mjs      # EXIT=0 = producción sirve el mismo contrato que se prueba en local
```

Ese arnés comprueba: 200 en las dos rutas · **JSON sin BOM** (un BOM revienta `JSON.parse` y la
sección no se pinta) · `esquema: 1` · **el árbol de producción normalizado IDÉNTICO al de
`tools/servidor-ui.mjs`** · y que `detail` **excluye** el producto que se está mirando (9 destacados
en `home`, 8 en `detail` con un id real). Estado hoy: **todo OK**.

### Las dos trampas del despliegue (costaron una hora; no repetirlas)

1. **El `unzip` de SCF RECHAZA un ZIP reescrito con `System.IO.Compression` en modo `Update`.** El
   paquete se armó parcheando el ZIP vivo (sustituir `ecomerse.module.js`, añadir el controlador):
   `tar`, Python, .NET y `Expand-Archive` lo leían sin queja, pero SCF devolvía
   `Zip file structure invalid: zip code format error`. **La solución: construir el paquete LIMPIO
   desde la carpeta extraída con un escritor estándar (Python `zipfile`)**, 9.828 entradas, `testzip`
   por CRC en verde.
2. **`manageFunctions` decía `success: true` y no desplegaba nada.** Con `functionRootPath` falla en
   silencio (`ResourceNotFound.Cos`: busca el paquete en el bucket temporal de SCF y no está) y deja
   la función en `Status: UpdateFailed`. Lo que **sí** despliega es llamar a la API de SCF directa:

   ```
   callCloudApi service=scf action=UpdateFunctionCode version=2018-04-16 region=ap-singapore
     params: { FunctionName, Namespace: <envId>, CosBucketName, CosObjectName, CosBucketRegion }
   ```

   El `Namespace` (el `envId`) es obligatorio: sin él, `未找到指定的Function`.
3. **Comprobar la subida con el `ETag`.** COS devuelve el MD5 del objeto; compararlo con el MD5 local
   demuestra que el ZIP llegó entero (el primer intento dio 200 y **no** subió nada: el fallo era de
   `Invoke-WebRequest` sin `-UseBasicParsing`, que no puede leer la respuesta en modo no interactivo).

**Rollback exacto**: `D:\egapp\.tmp-cloudbase\rollback\egrouteplan-api-live-20261012.zip`
(89.276.533 B, `sha256 cec06ed1…` = **el código que corría antes**), descargado con
`queryFunctions action=getFunctionDownloadUrl` y verificado contra el `codeSha256` que declara el
servidor. Y `D:\cb-deploy\cloudfunctions\egrouteplan-api\` = el paquete nuevo ya extraído, listo
para volver a subir.

---

## 14 · Punto 4 hecho: el TEMA y el ENTORNO (15/10, mañana)

### El tema lo resuelve el servidor — como Taobao

Medido en el corpus: **31 tokens `style.styleData.*` en 6 de 246 plantillas**, siempre por parejas
claro/oscuro (`bgColor` / `darkBgColor`, `displayTextColor` / `darkModeDisplayTextColor`…) y
**siempre resueltos en el servidor**: la plantilla nombra el token, no el color. Aquí igual:

```
GET /api/ecomerse/ui/home?tema=claro    -> el mismo árbol con la paleta clara
GET /api/ecomerse/ui/home?tema=oscuro   -> la paleta que ya está en el móvil
```

| | |
|---|---|
| **Dónde vive la paleta** | En el servidor (`TEMAS`), en el controlador **y** en `tools/servidor-ui.mjs`. **El cliente no tiene tabla de temas**: dos sitios donde arreglar el mismo color son una fuente de verdad de más |
| **Quién manda el modo** | El cliente: `useColorScheme()` → `?tema=`. `Renderizador` y `FranjaServidor` ya lo mandan |
| **Qué cambia** | Los COLORES, no la forma. `oscuro` es la paleta que ya estaba (hoy nada cambia en pantalla); `claro` usa los colores de la casa |
| **Verificado** | En producción: los dos temas llegan, **misma forma**, colores distintos, y el precio pasa de `#FFFF5000` a `#FFC2410C` |

### Las variables de entorno las resuelve el CLIENTE — como Taobao

Nombres **del corpus** (medidos: `windowWidth` 20 plantillas, `isPhoneMode` 20, `isVertical` 9,
`isFoldDevice` 2), expuestos como bindings `$entorno.*`:

```jsonc
{ "tipo": "Texto", "valor": "$entorno.windowWidth" }
```

| | |
|---|---|
| **Nuevo** | `components/ecomerse/entornoAtributos.ts` (puro): del aparato al entorno, **sin React** |
| **`$entorno` es raíz RESERVADA** | Se resuelve contra el entorno y **nunca** contra los datos: un producto con un campo `entorno` no puede cambiar el ancho de la pantalla. Hay test |
| **Sin entorno** | Un `$entorno.*` da `undefined` **y se anota** en `bindingsFallidos`, como cualquier binding que no resuelve |
| **La plataforma son TRES** | `android` · `ios` · **`harmony`** (15 plantillas del corpus usan esa rama), y la comparación **no distingue mayúsculas** (`iOS` ×5 e `ios` ×26 conviven) |
| **Inferido y declarado** | La semántica de `isVertical` (alto ≥ ancho) y `isFoldDevice` (plegable). **El APK no se ha consultado**: si no cuadra al pintar, se corrige en `entornoAtributos.ts` |

### Y la guardia de diseño: **refijada** (elegiste entre refijar y pagar)

**Refijada**, porque es lo que va con el estilo de Taobao: **sus plantillas llevan los valores
LITERALES** (266 cadenas de color, 325 de número, `16ap`, `375`) y solo hay **una capa fina de tema**
que resuelve el servidor. Pagar la deuda sería reescribir la UI del Mercado con los tokens de la
casa — más «de la casa» y menos de Taobao, y un cambio visual que exige el móvil.

⚠️ **Lo que se traga, dicho:** la base nueva incluye **23 ficheros** que habían empeorado y **no
todos son del Mercado** (también `lifebook-hotel-*`, `taxi`…). Deuda total ahora:
`hex 18 · fontSize 7 · borderRadius 10 · borderWidth 7 · espaciado 194 · precioFigura 6`.
**Está en git** (`.diseno-baseline.json`, +127/-17): si prefieres pagar la deuda de las otras
líneas, se revierte ese fichero y se paga por separado.

### Verificación (toda verde)

```
oráculo       91 pass / 0 fail   (+13: entorno, reserva de la raíz, tema y paridad local/producción)
tsc           5 errores          (los mismos dos ficheros de siempre)
rutas         EXIT=0 · logica EXIT=0
diseño        todo en verde      (base refijada)
producción    verificar-produccion.mjs EXIT=0 — 22 comprobaciones, con los dos temas
```

**Siguiente: el punto 3 (masonry) — MEDIDO, y hoy sería un cambio INVISIBLE.** No lo he hecho, y
conviene saber por qué antes de tocarlo:

```
TarjetaProducto.tsx:259   "La altura NO se declara: sale del ancho por `aspectRatio`"
TarjetaProducto.tsx:225   <Text numberOfLines={2}>   <- el título no puede crecer
app/ecomerse.tsx:614      <TarjetaProducto …>          <- NO le pasa `aspect`: usa PROPORCION_TARJETA
```

**Todas las tarjetas de la rejilla miden lo mismo por construcción.** Con alturas iguales, un
waterfall y una rejilla uniforme dan **el mismo dibujo**: el masonry no cambiaría nada de lo que se
ve. Taobao tiene waterfall porque **sus** tarjetas sí varían (fotos de otra proporción, etiquetas,
vídeo…); las nuestras no, y es una decisión escrita a propósito (para no recortar la foto y para
que el contenido no dé un salto al cargar).

Así que hay dos caminos, y es una decisión de producto, no de código:

1. **Dejarlo como está**: la rejilla uniforme es la correcta para tarjetas uniformes.
2. **Hacer que las tarjetas varíen de alto primero** (fotos 3:4 sin recorte, etiquetas, vídeo) — y
   entonces el waterfall sí se nota. Eso contradice la decisión actual de «una proporción para
   TODAS», así que hay que decidirlo con el dueño y verlo en el aparato.

Y si algún día se hace: **la forma de Taobao es dos `Lista` en fila con los datos repartidos**
(`DXRecyclerLayout` con `ORIENTATION: 1`), no una rejilla de columnas. Se puede montar **desde el
servidor**, que es donde vive ya la franja.

---

## 15 · La rejilla servida por el servidor (15/10) — hecha; y el versionado

### La forma de Taobao, montada desde el servidor

```
GET /api/ecomerse/ui/rejilla[?tema=claro|oscuro]
raíz: Contenedor ORIENTATION 0 (FILA)
  ├── Lista ORIENTATION 1, WEIGHT 1  →  $columnaA     (5 productos)
  └── Lista ORIENTATION 1, WEIGHT 1  →  $columnaB     (4 productos)
```

- **`WEIGHT: 1` es lo que reparte el ancho** (`flex: 1`): las dos columnas salen del vocabulario que
  ya existe, **sin inventar un widget de waterfall** — Taobao tampoco lo tiene.
- **El reparto es alterno** (pares a A, impares a B): con tarjetas de la misma altura queda
  exactamente equilibrado y no hay que estimar alturas. *(Taobao sí las estima, porque sus tarjetas
  varían.)* **Se reparte lo mismo que se enseña**: si se repartiera una lista y se pintara otra, dos
  productos se quedarían fuera sin que nadie lo notara.
- **Verificado en producción**: raíz en fila, **dos columnas, peso 1/1, reparto 5+4 = 9** (todos,
  sin repetir, equilibradas), y el árbol **normalizado idéntico** al del servidor local.
- **Se monta en la pantalla de demostración** (`app/ecomerse-ui.tsx`, `/ecomerse-ui`), que es donde
  se puede ver y medir. **No sustituye a la rejilla del listado**: la tarjeta mide lo mismo que
  todas (`aspectRatio` fijo), así que hoy el dibujo sería el mismo — y sustituirla perdería los
  botones de favorito y carrito, que el árbol **todavía no sabe expresar**. Eso es el paso
  siguiente: llevar esas dos acciones al contrato.

### Y una nota de alcance, para que no se confunda con trabajo de un rato

**Replicar la portada de Taobao con fidelidad exige decodificar `homepage/*` entero** (y el lenguaje
de expresiones que resuelven sus valores): **es trabajo de RE de varios turnos, no de uno.** Lo que
sí está hecho y medido es el vocabulario de los 269 `.dx` (§11 y `t1c-vocabulario/`), que es la
materia prima.

### Versionado: lo que ya está en git

```
commit 7dbe97b  "La UI del Mercado servida por el backend: controlador en el modulo real,
                 /detail, el tema y el entorno, y la rejilla en la forma de Taobao"
41 ficheros · 7.524 líneas
```

Entran: `api/ecomerseUi.ts` · los ficheros de `components/ecomerse/` · `tools/servidor-ui.mjs` ·
`app/ecomerse-ui.tsx` · `app/ecomerse.tsx` (+11, todo del Mercado) · `docs/CONTINUAR-MERCADO.md` ·
`.diseno-baseline.json` · `_msg-c2-ui-servidor.txt` · **y los dos ficheros del controlador**.

**El controlador estaba en un directorio ignorado.** `.gitignore` gana una cuarta pasada que
**re-incluye solo esos dos ficheros** (`ecomerse-ui.controller.js` y `ecomerse.module.js`) y deja el
resto del árbol fuera — comprobado: `main.js` y los `.apk` siguen ignorados.

**Se quedan fuera tres ficheros que mezclan otras líneas**, para no colarlas:
`constants/rutas.ts` (trae `/conductor-*` y `/programar`), `app/ecomerse-detail.tsx` (+152/-29, muy
por encima de las «+2» del relevo) y `network_security_config.xml` (reescribe el comentario entero).
**Ojo**: el mapa de rutas versionado no tiene aún `/ecomerse-ui`, así que un clon nuevo puede hacer
saltar el auditor de rutas hasta que esa línea entre.

### Y la receta del despliegue, ahora EN EL REPO

```powershell
$env:TENCENTCLOUD_SECRETID='…'; $env:TENCENTCLOUD_SECRETKEY='…'
node pruebas/desplegar-ui-mercado.cjs --comprobar   # lee: qué hay desplegado (no toca nada)
node pruebas/desplegar-ui-mercado.cjs               # baja el vivo, parchea, sube y despliega
```

Hace las tres cosas que costaron una hora: **construye el paquete limpio** (un ZIP reescrito lo
rechaza el `unzip` de SCF), **comprueba la subida con el `ETag` de COS contra el MD5 local** (el
primer intento dio 200 y no subió nada) y **despliega por la API de SCF con `Namespace`** (el MCP
decía `success: true` sin desplegar). Sin credenciales en el entorno **sale con código 2 y no toca
nada**; y nunca escribe credenciales en ningún fichero.

### Limpieza hecha

- **Borrado `D:\cb-deploy`** (206 MB, el paquete extraído).
- **`.tmp-cloudbase` de 341 MB a 85 MB**: solo queda `rollback\` — el ZIP del código que corría
  antes (`egrouteplan-api-live-20261012.zip`, `sha256 cec06ed1…`) y `module-vivo.js` (la referencia
  del `module.js` vivo, que es con la que se comprobó que el árbol extraído era el desplegado).
- Como la receta ya vive en `pruebas/`, los temporales **no hacen falta para volver a desplegar**: se
  parte siempre del código vivo.
