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

---

## 16 · Favorito y carrito AL CONTRATO (15/10) — y el análisis de las categorías de Taobao

### Las dos acciones: lo que impedía que la rejilla sustituyera a la lista

```
{ "tipo": "Icono", "valor": "Heart",
  "atributos": { "47d68a4bafe73f71": "$item.id",      // ONPRESS → el id (la navegación sigue igual)
                 "ext:accion": "ext:favorito" } }      // y la ACCIÓN, en su propio atributo
```

| pieza | dónde | por qué así |
|---|---|---|
| **La clave** | `valorAtributos.ts` → `CLAVES_VALOR.ACCION = 'ext:accion'` | `ext:` no es estilo: **es imposible confundirla con una clave de Taobao** (16 hex). Es el sitio donde ya viven las extensiones (`ext:tabla`, `ext:defecto`, `ext:separador`) |
| **Los valores** | `ACCIONES = { FAVORITO: 'ext:favorito', CARRITO: 'ext:carrito' }` | declarados por el **cliente**; el servidor los usa, no los inventa |
| **El id** | sigue en `ONPRESS` | **la navegación no se rompe**: un id no dice qué hacer, pero sí a quién |
| **El puente** | `FranjaServidor` lee `ext:accion` del nodo y llama a `alAccion(accion, id, datos)` | **el `Renderizador` no se toca**: la acción es un atributo resuelto como cualquier otro. Sin `alAccion`, el toque se trata como toque normal — **nunca se pierde en silencio** |
| **La ejecución** | `app/ecomerse-ui.tsx` → `useAccionesProducto` | **las acciones REALES de la app** (puerta de sesión, vuelta atrás si la API falla, guarda de combinaciones), no una copia |

Y un arreglo que salió al hacerlo: **el `Icono` ignoraba el vocabulario de TEXTO.** Su propia
documentación dice que `X_ICON_FONT_VIEW` **es un `TextView`** y que hereda `TEXT`/`TEXTCOLOR`/
`TEXTSIZE`; el componente leía `dx` solo para los márgenes, así que **un icono con `TEXTCOLOR` salía
negro sobre la tarjeta oscura** — invisible. Ahora resuelve color y tamaño con `resolverTexto`, el
mismo que usa el `Texto`. *(El formato de Taobao `#AARRGGBB` se canoniza a `#RRGGBBAA`, que es lo que
entiende React Native.)*

**Verificado en producción** (`codeSha256 bacae0a6…`, Active, 89.285.117 B): el árbol sirve **4 nodos
de acción** (2 columnas × [corazón, carrito]) con `Heart` / `ShoppingCart`, y
`verificar-produccion.mjs` sigue en EXIT=0. Oráculo **107/107** (6 nuevos).

### El análisis de las categorías: `mercado-fase1/re-e-categorias/`

**Informe completo**: `INFORME-CATEGORIAS-TAOBAO.md` (+ `analizar.mjs`, `hallazgos.mjs`,
`pestanas.mjs`, `lista-tabs.mjs` y sus `out/*.txt`, reproducibles).

Lo esencial, medido sobre el APK:

- **Las páginas son CONTENEDORES de secciones**: `awesome/container_*.json` traen
  `sections[]` con `sectionBizCode` + `item` + **`template { name, url, version, columnType }`**
  (plantilla **remota** y versionada) + `style.styleData.*`. La portada son 2 secciones
  (`categoryTab` + `DXSearchBar`) y la portada de contenido está en `container_newface_home_sub.json`
  (99 KB, 10 secciones).
- **Las categorías son PESTAÑAS, y son dato**: `sections[0].content.tabs[]` con `text` (闪购, 国补,
  年货节…), `tabId`, `pageUrl`, `searchParams`, y por pestaña `labelImg/labelSelectImg/labelDarkImg`,
  `aspectRatio`, fatiga de GIF… El **tema** son **31 tokens** claro/oscuro
  (`textColor #31192D` / `darkTextColor #FFFFFF`, `textSelectColor #FF5500`, `tabIndicatorColor
  #FF5000`, `tabIndicatorType: smile`, arcos, `tabBgColor`…) y **cuatro tipos de pestaña**
  (`argsTypeMap: text|img|gif|bubble`).
- **La barra de pestañas también es dato**: `tabmenu_cache.json` trae las pestañas inferior y superior
  con `channelType`, `jumpUrl`, `spm` y **colores claro/oscuro por estado**.
- **La pantalla de 关注 sí agrupa varios estilos**: la página es `cardList` por áreas
  (`headArea` → `tabArea` → `feedArea`), las **8 pestañas** son categorías por `subChannelType`
  (**listas de IDs reales de Taobao**), y 关注 tiene **9 tarjetas/estados** con su `span`
  (título, directo, visitas frecuentes, menú, recomendación, «ver más», **estado vacío**, push).
  Catálogo: 41 plantillas, **span 1 → 10 y span 2 → 31**.
- **Lo que NO hay, y es el hallazgo**: ni una clase de categorías en las 4.525 clases decompiladas, ni
  la página 分类 en la caché. **「汽车」 aparece 3 veces y las tres son títulos de producto**; «分类»
  13 veces, todas nombres de experimentos o escenas. **La taxonomía llega de `mtop` en tiempo de
  ejecución**: el APK guarda el molde y una muestra, no el árbol de categorías.

**Y la conclusión de alcance, que confirma lo que decías**: replicar la portada de Taobao entera exige
decodificar `homepage/*` y su lenguaje de expresiones — **RE de varios turnos**. Este informe deja el
molde medido, el plan por pasos y los huecos dichos.

**Siguiente, en orden** (del §8 del informe): (1) **widget de pestañas** con los tokens medidos;
(2) **`span` por tarjeta** en `Lista` (span 1 y 2 mezclados, como Taobao); (3) **tarjetas
heterogéneas** (un árbol distinto por elemento, no uno por lista); (4) la pantalla de categorías con
**la taxonomía del Mercado** (`department/family/leaf`), no con IDs de Taobao.

---

## 17 · El widget de PESTAÑAS (15/10) — punto (1), hecho

### La forma: en Taobao esto es una SECCIÓN, aquí es un widget

Medido en `awesome/container_newface_home_main.json`: la barra es `sectionBizCode: "categoryTab"`, con
las pestañas en `content.tabs[]` (**son dato**) y el tema en `style.styleData.tabs` (31 tokens). Aquí
es el tipo **`Pestanas`**, y **su alias es el nombre real de la sección** — así un árbol generado desde
una captura de Taobao no se descarta por llamarse como se llama. *(La lista blanca pasó de 13 a 14
tipos: el test que la fija avisó, como debía, y se actualizó con el porqué.)*

```
{ "tipo": "Pestanas", "valor": "$categorias",        // las pestañas llegan por `valor`, como en `Lista`
  "atributos": { "4fa0a53cf9ff05cd": "#FFA9AEB8",     // color normal (clave COMPARTIDA con `Texto`)
                 "5db0637a915fa268": 12,
                 "ext:coloractiva": "#FFFFFFFF", "ext:tamanoactiva": 13,
                 "ext:indicador": true, "ext:colorindicador": "#FFFF5000",
                 "ext:tipoindicador": "line", "ext:negritaactiva": true,
                 "ext:espacio": 12, "ext:activa": 0 } }
```

### Cada token, con el token de Taobao al lado

Donde Taobao ya tiene un **atributo compartido**, se usa el suyo (16 hex). Donde no —porque es tema de
la sección— va una extensión `ext:` **y en `pestanasAtributos.ts` queda escrito de qué token sale**
(`PROCEDENCIA`), que es lo que hace comprobable la fidelidad en vez de prometerla:

| en el árbol | Taobao (`style.styleData.tabs`) |
|---|---|
| `ext:coloractiva` | `textSelectColor` |
| `ext:tamanoactiva` | `textSelectSize` |
| `ext:colorindicador` | `tabIndicatorColor` |
| `ext:tipoindicador` | `tabIndicatorType` (`line` · `dot`; **`smile` no**) |
| `ext:indicador` | `showTabIndicator` |
| `ext:negritaactiva` | `selectedIsBold` |
| `ext:espacio` | `tabSpaceConfig.phoneSpace` |
| `ext:activa` | — (Taobao lo manda por pestaña; aquí es el índice inicial) |

⚠️ **El formato de las claves lo cazó el propio test**: la casa exige `ext:` + **minúsculas**
(`/^ext:[a-z]+$/`, la regla de la red del contrato). Se declararon en camelCase y **se renombraron**.

### Los números: el mecanismo es de Taobao, las medidas son las de aquí

| | Taobao | aquí | por qué |
|---|---|---|---|
| hueco | `phoneSpace` **11** | **12** (`espaciado.e12`) | el carril que esto sustituye ya usa 12: cambiarlo movería un píxel de una barra que ya está en la calle |
| rótulo | `textSize` **16** | **12** (`tipografia.caption`) | con **18 pestañas** la fila se recorre deslizando; un rótulo grande convierte cada pestaña en un bloque |
| activa | `textSelectSize` **18** | **13** | el mismo motivo, un peldaño por encima |

Y **lo que NO se pinta se declara**: `tabIndicatorType: "smile"` (son los arcos `leftArcImgUrl` /
`arcImgRatio`, **imágenes de Alibaba**) **se degrada a `line` y se anota** en `noImplementados` — la
regla de la casa es copiar el contrato, no el dibujo. Los tipos de pestaña `img` · `gif` · `bubble`
(`argsTypeMap`) tampoco están: hoy hacen falta pestañas de texto con emoji.

### Lo que se reutilizó del carril que YA existía

`app/ecomerse.tsx:698` (`Pestana`) tenía tres decisiones pagadas con un fallo cada una, y se mantienen:
**el subrayado se pinta siempre** (transparente cuando no toca: si no, la fila baila de alto al
cambiar), **`accessibilityRole="tab"` con `selected`** (que un lector de pantalla lo sepa, no que lo
adivine por el color), y **`emoji + etiqueta` en un solo `Texto`** con `numberOfLines={1}`.

### Las categorías son las REALES

`GET /api/ecomerse/ui/categorias?tema=claro|oscuro` → **19 pestañas**: «Recomendado» (id `''` = sin
filtro, como abre el listado) **+ los 18 departamentos del árbol del Mercado**, con sus emojis
(👔 Hombre, 👗 Mujer, 🍼 Bebés y niños, 🍎 Alimentación…). Salen de `EcomerseService.categories()`, que
es **la misma fuente que el listado**: no hay dos verdades sobre qué departamentos existen. Se monta en
`/ecomerse-ui`, y al tocar **usa el filtro del propio listado** (`useEcomerseStore().setCategoryFilter`
+ navegar a `/ecomerse`) — no un camino nuevo.

**Verificado en producción** (`codeSha256 bf4011f6…`, Active, 89.286.279 B): las 19 pestañas llegan,
la primera es «Recomendado» sin id, no hay ids repetidos, los dos temas se pintan distinto y el árbol
es **idéntico** al del servidor local. Oráculo **122/122** (15 nuevos).

### Siguiente

1. **`span` por tarjeta** en `Lista` (span 1 y 2 mezclados, como Taobao).
2. **Tarjetas heterogéneas**: un árbol distinto por elemento, no uno por lista.
3. **Migrar el carril del listado** a esta sección (`PestanasDepartamentos` se borra): hoy hay dos
   barras, la del cliente y la servida, y la servida ya hace lo mismo con el tema del servidor.
4. La pantalla de categorías con la taxonomía del Mercado y sus tres niveles.

---

## 18 · El carril migrado, los emojis fuera y el APK instalado (15/10)

### 1 · Se decodificó cómo pinta Taobao una pestaña: **la etiqueta es TEXTO**

`re-e-categorias/out/pestanas-detalle.txt` vuelca **las 12 pestañas enteras** de la portada (关注 ·
推荐 · 闪购 · 国补 · 年货节 · 飞猪 · 穿搭 · 居家 · 美食 · 数码 · 新品 · 运动). Lo que dicen, y es lo
que se copió:

| | Taobao |
|---|---|
| **el rótulo** | **`text`, texto** — nunca un emoji |
| **el icono** | **7 de las 12 NO llevan icono.** Cuando lo llevan **es un PNG de 92×80** (`labelImg` / `labelSelectImg`, con sus variantes `Dark`), a un lado (`labelLocation: right`), con su hueco (`imgPadding: 10`) y su proporción (`labelAspectRatio: 1.15`) |
| **emoji** | **ninguno, en ninguna de las 12** |

Así que **el emoji era invención nuestra**: iba pegado al nombre («👗 Mujer») y salía del campo `icon`
del departamento, que guarda un emoji. Se ha quitado del rótulo, y el widget **sí sabe pintar la
imagen** de Taobao cuando la haya: `imagen` / `imagenactiva` / `ubicacion` / `separacion` / `aspecto`,
con el alto del tema (`ext:altoimagen` ← `imageTabHeightAp` = **31**). **El servidor solo manda esas
claves si el icono es una URL**; hoy guarda un emoji, así que las pestañas salen **de texto** — que es
exactamente lo que son **7 de las 12** de Taobao. *(Si algún día se quiere icono, el camino es darle
una imagen al departamento, no inventar dibujos ni copiar los de Alibaba.)*

### 2 · El subrayado curvo (`smile`) ahora se pinta

Taobao manda `tabIndicatorType: "smile"` con **dos imágenes de arco** (`leftArcImgUrl`,
`rightArcImgUrl`, `arcImgRatio: 0.48`) de su CDN. Antes se degradaba a `line` y se declaraba; ahora
**se pinta una cápsula** —el mismo contrato (subrayado curvo), con píxeles nuestros— y
`INDICADORES_NO_IMPLEMENTADOS` queda vacío. **No se copian sus arcos**: eso no es copiar el contrato,
es copiar el dibujo.

### 3 · El carril del listado está MIGRADO (y el viejo, borrado)

`app/ecomerse.tsx` ya no tiene `PestanasDepartamentos` / `Pestana` / `PestanasEsqueleto`: el carril lo
manda el servidor. Lo que se conservó, pagado con un fallo cada cosa: **la fila desliza** (18
pestañas comprimidas serían 18 rótulos cortados), **el subrayado se pinta siempre** (si no, la fila
baila de alto), **`accessibilityRole="tab"` con `selected`** y **«Recomendado» la primera** (es el
estado «sin departamento»).

**Y la pestaña activa la dice el SERVIDOR**: la ruta va con `?activa=<id>` y el índice sale de los
datos (`ext:activa`), que es como Taobao lo manda (`isDefaultSelected`, medido en 推荐). Volver a
pulsar la pestaña puesta sigue quitando el filtro (`chooseCat` alterna). **Lo que se pierde**: el
esqueleto de carga del carril (ahora aparece cuando llega; la cabecera puede dar un salto pequeño) —
un esqueleto que no mide lo que va a medir es una promesa falsa.

### 4 · El APK: compilado, instalado y **verificado en el móvil**

```
gradlew assembleRelease   → FALLA: falta `hermesc` (el bundle JS se genera, el bytecode .hbc no)
gradlew assembleDebug     → BUILD SUCCESSFUL (11m 19s, 212,6 MB)  ← es el camino de la casa
adb install -r app-debug.apk + Metro (npx expo start) + adb reverse tcp:8081
```

**Lo verificado en pantalla** (Mercado real, `/ecomerse`):

- El carril servido **se pinta**: `Recomendado · Hombre · Mujer · Bebés y niños · Ali…`, **en texto y
  sin un solo emoji**, con la activa en blanco y negrita y las demás en gris.
- **El subrayado `smile` naranja** bajo la pestaña activa — se ve en la captura (nuestro dibujo).
- **El toque llega**: al pulsar una pestaña el listado entró en «Cargando…», que es el filtro
  cambiando (`chooseCat`), o sea que el canal de eventos del widget funciona.
- La franja servida («Del servidor · 9 · productos») y las rejillas siguen pintándose.

**Lo que NO se pudo verificar en pantalla, y por qué**: que el carril **cambie de pestaña activa** tras
el toque. Se juntaron dos cosas: (a) el móvil **no alcanzaba `api.egrouteplan.com`** en ese momento
—lo dice la sonda de la propia app: `netprobe FAIL api-domain … Aborted` mientras baidu y taobao daban
200—, así que la recarga de la sección no llegaba y el widget conservaba el último árbol bueno
(**degradar, no inventar**); (b) tras varias recargas los toques dejaron de registrarse. **Server-side
sí está verificado**: `?activa=<id>` devuelve `ext:activa` con el índice correcto
(`verificar-produccion.mjs`, EXIT=0) y el oráculo cubre el resolutor del widget. Queda apuntado como lo
primero que hay que mirar con la red del móvil en condiciones.

**Nota de fontanería del APK**: el móvil se caía del `adb` a cada paso porque estaba en **«solo
carga»**; hay que elegir transferencia de archivos en el diálogo de USB. Y para capturar:
`cmd /c "adb exec-out screencap -p > f.png"` — con el `>` de PowerShell el PNG sale corrupto.

### Verificación

`tsc` **5** (los de siempre) · `rutas` **0** · `logica` **0** · `diseño` **en verde** · oráculo
**124/124** · producción **EXIT=0** (con `?activa`, sin emojis, `smile` y `altoimagen 31`).
Desplegado: `codeSha256 2fde9acd…`, Active, 89.286.898 B.

---

## 19 · El `span` por tarjeta: la rejilla ya puede ser irregular (15/10)

### 1 · Qué dice Taobao, medido

`re-e-categorias/out/span.txt` vuelca las plantillas enteras. **El `span` NO es atributo de la lista
ni del elemento: es un campo de cada ENTRADA DE PLANTILLA**, junto a `name`, `url4Android` y
`version4Android`:

```json
{ "name": "taolive_morelive_entry_202303", "span": "1", "url4Android": "https://…", "version4Android": 17 }
```

| fichero | span 1 | span 2 | vacío |
|---|---|---|---|
| catálogo de seguidos (`bottoming_template_list.json`, 41) | 10 | **31** | 0 |
| `template_list.json` (29) | 24 | 2 | 3 |

Es **texto** (`"1"`, `"2"`, `""`) en las 77 apariciones del corpus, y `""` —o sin `span`— significa
una columna. O sea: **el ancho es una decisión del DISEÑO de la tarjeta**, y la mezcla es real
(el catálogo de seguidos es mayoriariamente de tarjetas anchas).

### 2 · Por qué cambió la forma de la rejilla

Antes eran **dos `Lista` en un contenedor de fila**. Con dos listas independientes **una tarjeta ancha
no existe**: no cabe en ninguna de las dos. Así que ahora es **UNA `Lista` con dos columnas y cada
tarjeta diciendo cuántas ocupa** (`ext:span`), que es lo que hace el reciclador de Taobao: una lista
donde cada elemento sabe su ancho.

```
Lista (DX_GRID_LAYOUT_COLUMN_COUNT: 2, hueco 12)
  └── tarjeta (plantilla)  →  ext:span: "$item.span"
```

Y el reparto en filas es **lógica pura** (`listaAtributos.filasPorSpan`, testeable sin pintar nada):
las estrechas entran de dos en dos, y **una ancha cierra la fila abierta antes de ponerse ella** —si
no, quedaría un hueco muerto a su izquierda— y va sola.

### 3 · De qué dato real sale el ancho (nada inventado)

Taobao lo decide por plantilla; el Mercado no tiene plantillas por tarjeta, así que se ancla en **lo
que sí es un dato suyo**, en este orden:

1. **`isFeatured`** — el «destacado» del Mercado (con su `featuredUntil`). Es el análogo directo de la
   tarjeta grande de Taobao.
2. **Más de una foto** — una tarjeta con galería necesita el ancho.

⚠️ **Hoy el catálogo real no tiene NINGÚN destacado (0 de 9) y todos tienen 1 foto**, así que **la
rejilla sale uniforme**: no se inventa una mezcla que los datos no piden. Comprobado: el reparto que
produce la pantalla con los datos de hoy es el de siempre (5 filas de dos + una suelta). El día que
marquen un producto como destacado, su tarjeta pasa a ancho completo **sin tocar una línea**.

Para poder **ver** la rejilla irregular sin tocar el catálogo, el **servidor de pruebas** tiene una
palanca declarada: `?destacar=<n>` (o la variable `UI_DESTACAR`). El controlador desplegado **no la
tiene**. Con `UI_DESTACAR=2` el reparto que produce es:

```
fila 1 → [ANCHA]    Foto upload E2E
fila 2 → [ANCHA]    Producto cuota 4
fila 3 → [estrecha] Producto cuota 3   |  [estrecha] Producto cuota 2
fila 4 → [estrecha] Producto cuota 1   |  [estrecha] Supermercado Martínez
fila 5 → [estrecha] Farmacia E2E v4.2  |  [estrecha] Arroz 25kg E2E v3
fila 6 → [estrecha] Producto E2E Monedero
```

### 4 · Y la red del contrato se arregló por el camino

Al entrar la rejilla en la red (`claves.test.mjs` la **recorre** ahora, antes no lo hacía) saltó que
la comprobación de formato de claves exigía `^[0-9a-f]{16}$`… y **las claves de Taobao pueden ser
decimales con signo**: `DX_GRID_LAYOUT_COLUMN_SPACING = -7076735627431451296` (el hueco entre
columnas, justo la que estrena la rejilla) o `DXRECYCLERLAYOUT_ONENDREACHED = -2277119638481222228`.
La regla se corrigió **con la medida delante**, y la rejilla dejó de ser el único árbol del contrato
que no pasaba por la red.

**Lo que sigue sin implementar y se declara**: `ABILITY_SPAN` **salió** de la lista de no
implementados (el `span` por elemento ya se pinta).

### Verificación

`tsc` **5** · `rutas` **0** · `logica` **0** · `diseño` **en verde** · oráculo **127/127** (3 nuevos:
la forma, el reparto puro, la política del `span`, y la red ampliada) · producción **EXIT=0**
(`rejilla`: raíz `Lista`, dos columnas, `ext:span` por tarjeta, fichas con span 1|2, sin claves
fantasma). Desplegado: `codeSha256 0c4158d4…`, Active, 89.287.661 B.

⚠️ **Lo que NO se pudo verificar en esa sesión: la pantalla del móvil.** El teléfono se cayó del `adb`
otra vez (`wait-for-device` esperando 12 minutos) y la comprobación visual quedó cortada. Lo que sí
está comprobado sin el móvil es **el reparto exacto que producirá** (la tabla de arriba, calculada con
la misma función que usa el widget) y la forma del árbol en producción.

---

## 20 · Verificado en el móvil, con el teléfono conectado (15/10, segunda sesión)

Con el móvil ya estable se cerró todo lo que quedaba apuntado. **Las dos capturas están en
`docs/evidencia/`.**

### El carril de categorías, servido y con una pestaña que NO es la primera

`egrouteplan://ecomerse-ui` (la pantalla no está enlazada: se entra por el esquema) con el servidor
local y `UI_DESTACAR=2`. En
`151025-carril-servido-hombre-activa.png`:

- El carril **se pinta servido**: `Recomendado · Hombre · Mujer · Bebés y niños · Alim…`, **sin un
  solo emoji**, con la activa en blanco y negrita.
- **La activa es «Hombre», que NO es la primera**: la eligió el servidor con `?activa` y su índice
  salió de los datos (`ext:activa`). Es lo que Taobao manda por pestaña (`isDefaultSelected`) y lo que
  aquí no se podía comprobar en la sesión anterior por la red del móvil.
- **El subrayado `smile` naranja** bajo la activa: el dibujo es nuestro (una cápsula), el contrato es
  el de Taobao.

### La rejilla irregular, EN PANTALLA

En `151025-rejilla-span-en-el-movil.png` se ve el reparto exacto que había calculado, sin el móvil:

```
Producto cuota 4                     ← ANCHA, a todo el ancho
Producto cuota 3 | Producto cuota 2  ← dos ESTRECHAS en pareja
```

Es la primera vez que el `span` por tarjeta se ve funcionando: **una tarjeta que ocupa las dos
columnas y otra que ocupa una**, en la misma lista. *(Con los datos reales —sin destacados— la
rejilla sale uniforme, así que esto se ve con la palanca `UI_DESTACAR` del servidor de pruebas.)*

⚠️ **Y se ve también lo que falta**: en la tarjeta ancha, **la imagen no crece con ella** — se queda
pequeña y centrada, con mucho hueco alrededor. Es lo esperado: ancha y estrecha **comparten una sola
plantilla**, y el `span` solo reparte el ancho. Taobao no hace eso: allí la tarjeta ancha **es otra
plantilla** (41 plantillas: 10 estrechas y 31 anchas). Eso es exactamente el siguiente paso
(**tarjetas heterogéneas**), y la captura es su justificación.

### Y el toque del carril, de punta a punta

En `151025-toque-filtra-el-mercado.png`: al tocar una pestaña, el Mercado **queda filtrado por ese
departamento** — se ven sus **familias reales** (Ropa de arriba, Vestidos y faldas, Pantalones,
Chaquetas y abrigos, Lencería y ropa de casa, Tallas grandes, Calzado de mujer, Bolsos y complementos,
Ropa tradicional) y **«0 productos»** con su estado vacío (cierto: el catálogo no tiene ningún producto
en Mujer). O sea: carril servido → toque → filtro del listado → datos reales. **El canal de eventos
del widget funciona.**

*(Nota para la próxima sesión: el `adb reverse` de 8081/8788 **se pierde cada vez que el móvil se
reconecta**, y sin él la app no alcanza ni Metro ni el servidor local — las dos secciones de la
pantalla se quedan sin pintar sin decir por qué. Rehacer el `reverse` justo antes de relanzar.)*

---

## 21 · Tarjetas HETEROGÉNEAS: la tarjeta ancha es OTRA tarjeta (15/10)

### 1 · Lo medido: cada elemento dice qué tarjeta usa

`re-e-categorias/out/plantillas.txt`. En el feed de descubrimiento de Taobao
(`live_flexalocal/discovery_video_list_new.json`) **la misma lista trae varias tarjetas**, y quien lo
dice es **el elemento**, con `templateName`:

| cuántas | `templateName` |
|---|---|
| 11× | `taolive_discovery_feed_live_v2` ← la tarjeta normal |
| 1× | `taolive_discovery_feed_goods_card_v2` ← **una tarjeta DISTINTA en la misma lista** |
| 1× | `taolive_discovery_head_card_2024` (la cabecera) |
| 1× | `taolive_discovery_subtab_card_2024` (las pestañas) |

Y cada elemento lleva, junto a él, `area`, `type`, `uniqueID`, `cardStyle`, `designLocation`,
`noLeftRightSpace`, `noBottomSpace`. **El `span`, en cambio, sigue viajando en la entrada de
plantilla** (`{name, span, url4Android}`): el ancho es del diseño de la tarjeta, no del dato.

### 2 · Lo que cambió en el contrato

| antes (15/10, mañana) | ahora |
|---|---|
| `Lista` con **UNA** plantilla | `Lista` con **DOS** plantillas, cada una con su `templateName` |
| el `ext:span` era un **binding por elemento** (`$item.span`) | el `ext:span` es **constante de cada plantilla** |
| el dato llevaba `span` | el dato lleva **`templateName`** (y el ancho no viaja en el dato) |

Y el reparto en filas **no cambió**: sigue siendo `filasPorSpan` (las estrechas de dos en dos, la
ancha cierra la fila abierta y va sola). Lo que cambió es **de dónde sale el ancho**.

**Elegir la plantilla es lógica pura** (`listaAtributos.elegirPlantilla`), y tiene su degradación
declarada: si un elemento nombra una plantilla que no está —o no nombra ninguna— se pinta **la
primera** (la estrecha) y el nombre desconocido se declara. Una tarjeta con el diseño por defecto es
mejor que un hueco en la lista.

### 3 · Las dos tarjetas del Mercado

| plantilla | `span` | imagen | título |
|---|---|---|---|
| `mercado_tarjeta_estrecha` | 1 | 150 | 12 |
| `mercado_tarjeta_ancha` | 2 | **210** | **14** |

Los **nombres son nuestros** (con espacio de nombres, al estilo de los de Taobao) y **el mecanismo es
de Taobao**; los números son una decisión de diseño, escrita y no escondida en un `.dx`. La ancha va
**segunda** y la estrecha **primera** a propósito: es la que se usa por defecto.

**Quién decide qué tarjeta le toca a cada producto**: la misma política real de la víspera —
`isFeatured` (el «destacado» del Mercado) o **más de una foto**. Hoy **0 de 9 están destacados** y
todos tienen 1 foto, así que la rejilla sale uniforme: no se inventa una mezcla que los datos no
piden. La palanca `?destacar=` / `UI_DESTACAR` del servidor de pruebas sigue sirviendo para verlo.

### 4 · La red del contrato: tercera forma de clave

Al meter `templateName` en el árbol, `claves.test.mjs` lo habría llamado «MAL FORMADA»: **no es hex ni
decimal**. Y es una clave legal de Taobao: un **nombre registrado**, como `item_data`, `isRepeat`,
`repeatMode`, `columnGap` o `sticky`, que el vocabulario del cliente ya declaraba. La regla de la red
ahora acepta **las tres formas** —16 hex, decimal con signo y nombre registrado— y sigue cazando lo
que no sea ninguna de las tres. *(Es la segunda vez que la red se corrige por una medida: la anterior
fue la clave negativa del hueco de columna.)*

### 5 · Verificado en el móvil

`151025-tarjetas-heterogeneas-en-el-movil.png`, en el mismo encuadre:

- **«Producto cuota 4»**: tarjeta **ancha**, a todo el ancho, con su imagen (210) ocupándolo.
- **«Producto cuota 3 | Producto cuota 2»**: dos tarjetas **estrechas** en pareja, con la suya (150).

Son **dos diseños distintos**, no la misma tarjeta con más ancho. *(Con la palanca puesta: los dos
primeros productos son destacados.)*

⚠️ **Y la prueba en el móvil encontró un defecto que las pruebas no**: la imagen **no crecía con la
tarjeta** — se quedaba con su tamaño natural, pequeña y centrada, y la ancha no se veía ancha por
dentro. Faltaba `LAYOUT_WIDTH: -1` (ocupar el ancho del hueco) en la imagen de la plantilla. Arreglado
en los dos servidores y **vuelto a desplegar**. *(Las fotos tampoco cargan: el host
`hk.egrouteplan.com` no responde desde el móvil, y el widget enseña su marcador — está documentado en
el propio servidor.)*

### Verificación

`tsc` **5** · `rutas` **0** · `logica` **0** · `diseño` **en verde** · oráculo **128/128** (la forma con
dos plantillas, `elegirPlantilla` con su degradación, la política de la tarjeta, y el recuento de
acciones: dos plantillas × dos acciones) · producción **EXIT=0** (dos plantillas con su nombre y su
span, la imagen de la ancha mayor —210 vs 150—, cada ficha eligiendo una de las dos, y el ancho fuera
del dato). Desplegado: `codeSha256 29d8e4ae…`, Active, 89.288.186 B.

### Siguiente

Mudar a **A** (el Mercado) lo que todavía solo pinta su cliente: el badge PRO, «Como nuevo» y el
contador de favoritos —como contenido del árbol—, y **borrar la rejilla del cliente**
(`RejillaFamilias` y la `FlatList` de tarjetas). Cuando eso pase, `/ecomerse-ui` se queda como pantalla
de desarrollo o se borra: su trabajo era demostrar que *el servidor manda*, y ya lo demuestra.

---

## 22 · EL ÁRBOL LLEGA A A: el Mercado es una pantalla de secciones (15/10)

### 1 · Qué cambió, en una frase

**El Mercado ya no tiene lista de productos.** La `FlatList` de tarjetas del cliente se fue y en su
sitio está la sección servida `rejilla` —la misma que se probó en `/ecomerse-ui`, con sus dos
plantillas—. La pantalla se queda con el marco: la cabecera de búsqueda, el carril de departamentos,
la rejilla de familias y el pie.

Y con eso la estructura cambia de forma, porque ya no hay nada que virtualizar en el cliente: **un
`ScrollView` con secciones dentro**, no una lista con cabecera. Es lo que Taobao hace con su
`DXRecyclerLayout` de secciones, y es lo que el contrato venía pidiendo desde el primer día.

### 2 · Los cables que había que atar (y se ataron)

| cable | cómo se ató |
|---|---|
| **los filtros** | viajan en la ruta: `rejilla?departamento=…&familia=…&buscar=…`. El servidor los traduce a los del API (`consultaDeCatalogo`) y devuelve **el mismo catálogo filtrado**. Sin esto, migrar habría *perdido* el filtrado |
| **el contador** («9 productos») | sale de las fichas que trajo el servidor. Contarlas en el cliente sería volver a tener la lista aquí |
| **esqueleto y «0 productos»** | la sección avisa de su estado (`alEstado`: `cargando`/`lista`/`vacia`/`error`) |
| **vacío ≠ error** | `pedirUi` devolvía `null` para todo. Ahora dice **por qué** (`alFallar`: `red`/`respuesta`/`contrato`), sin cambiar el `null`: decir «no hay productos» cuando falló la red es **una afirmación falsa sobre el catálogo** |
| **tirar para recargar y reintentar** | `recarga` (un contador, no un booleano: dos recargas seguidas tienen que ser dos peticiones) |
| **el corazón y el carrito** | el árbol pide `ext:favorito`/`ext:carrito` y aquí se ejecutan **las acciones de verdad**. Se tradujo la ficha con `productoDeFicha`, **un puente compartido** con `/ecomerse-ui` en vez de dos copias |
| **el carrusel «🔥 Recomendados»** | **se retiró**: era el mismo carrusel que la franja servida —los mismos productos dos veces, uno del servidor y otro pedido aparte— |
| **la franja** | pasó de hermana fija a **primera sección dentro del scroll**: toda la pantalla desplaza como una cosa |

### 3 · El defecto que encontró el móvil (y que ningún test podía ver)

Al abrir el Mercado migrado, la consola soltó dos veces:

```
ERROR VirtualizedLists should never be nested inside plain ScrollViews with the same orientation
because it can break windowing and other functionality
```

**No es un aviso de estilo: es el reciclado de listas rompiéndose de verdad.** La sección montaba su
`FlatList` dentro del `ScrollView` de la pantalla.

El arreglo se hizo **en el widget**, que es quien tiene que saberlo: `Lista` acepta
`virtualizar={false}` y entonces pinta sus filas como `View`s (con el **mismo reparto**, `filasPlanas`),
dejando que **desplace el de fuera**. La bandera se hereda por `Renderizador` (`virtualizar`) y
`FranjaServidor` la expone como `desplazable`; el Mercado pasa `false` en sus tres secciones y
`/ecomerse-ui` sigue con el valor por defecto **porque allí cada sección es su propio scroll** —
medido: con el log limpio y solo el Mercado abierto, **0 avisos**.

### 4 · Y otro cable que llevaba tiempo torcido: `onEndReached`

El resolver marcaba `ON_END_REACHED` dentro de `noImplementados` («declarado y no emitido») y
`Lista.tsx` lo cableaba **justo cuando aparecía ahí**: funcionaba por casualidad, con una condición que
se leía invertida. Ahora tiene su propio campo (`pideFinDeLista`): el evento **sí se puede emitir**; lo
que faltaba era un manejador, y lo pone la pantalla. *(La rejilla servida, al no virtualizar, hoy no
puede emitirlo: cuando haya paginación, el fin de lista lo tendrá que detectar la pantalla.)*

### 5 · Verificado en el móvil

- `151025-mercado-servido-carril-rejilla.png` — el Mercado tal cual queda: cabecera fija, **franja
  servida**, **carril servido** con «Recomendado» activo y su subrayado, **«9 productos»** (del
  servidor) y la **rejilla servida** de tarjetas con corazón y carrito.
- `151025-mercado-filtro-vacio.png` — se toca «Hombre»: la pestaña se activa, aparecen **las familias
  de Hombre** (del cliente: es taxonomía), el contador dice **«0 productos»** y sale el vacío del kit
  —**«Sin resultados con estos filtros»**—. O sea: filtro → sección → `arbol: null` → `vacia` → el
  vacío de la pantalla. **El estado vacío es del servidor, no una lista rancia.**

### 6 · Lo que sigue siendo del cliente, y por qué

| pieza | por qué |
|---|---|
| la cabecera (buscar, cámara, favoritos, carrito, tiendas) | es cromo de la pantalla, no catálogo |
| la **rejilla de familias** | es **taxonomía** (110 familias, tercer escalón aparte) y la pantalla la usa para navegar |
| la **búsqueda por foto** | sus resultados vienen de **otro endpoint** y no son el catálogo: tiene su propio ciclo (elegir foto → subir → buscar) |

### 7 · Pendiente

- **El contenido de la tarjeta** que solo sabe pintar el cliente: badge **PRO**, **«Como nuevo»** y el
  **contador de favoritos**. Migrar la rejilla los perdió: llevarlos al árbol es el siguiente paso, y
  es contenido (una clave más, `ext:`), no estructura.
- **Paginación**: ver §4.
- **`/ecomerse-ui`**: ya no demuestra nada que el Mercado no haga. Se queda como banco de pruebas
  hasta que se decida borrarlo.

### Verificación

`tsc` **5** · `rutas` **0** · `logica` **0** · `diseño` **en verde** · oráculo **132/132** (los filtros
de la sección contra el API, el puente compartido —`fichaSeccion.test.mjs`—, y el aviso de fin de
lista con su campo propio) · producción **EXIT=0**, con el filtro comprobado contra el API del
catálogo (mismo filtro, mismo número). Desplegado: `codeSha256 29d8e4ae…`.

---

## 23 · MEDIR A TAOBAO ANTES DE CLONARLO: tamaño, huecos y barra pegada (15/10)

### 1 · La medición, y por qué hubo que rehacerla

La primera pasada usó la tabla de claves de `t1b-alidx-v2` (755 entradas, la del APK que se decompiló
en la línea `re-d`). **0 de 916 claves del corpus estaban ahí**: son **versiones distintas de Taobao**,
y los hashes no viajan entre versiones. La tabla que corresponde al corpus está dentro de él
(`t1c-vocabulario/out/vocabulario.json`, `clavesConNombre`: 88 claves) y es la que usan
`metricas2.mjs` y `metricas3.mjs`.

**Esto es una trampa que conviene recordar**: una tabla de claves sirve para UNA versión. Mezclarlas
habría dado «medidas» inventadas con aspecto de dato.

### 2 · Lo medido (`out/metricas2.txt`, `out/metricas3.txt`)

| qué | valor en Taobao | dónde se midió | lo que teníamos |
|---|---|---|---|
| hueco entre columnas de un catálogo de 2 | **8** (3 plantillas) y 7 (1) | `m_r_sub_feedback_detail_2025`, `buy_v2_item_ext`, `detail_v4_clothing_matching_purchase` | **12** ← el doble |
| proporción de la foto de una tarjeta | **1 (cuadrada)** | `m_r_v1_trends_card_2025`, `m_r_v1_daily_outfit_content`, `detail_v3_appraise`, `looked_dv3_item` | altura fija 150 |
| radio de la tarjeta del feed | **6** | `DXIMAGESPAN_CORNERRADIUS` (864 usos) | 10 |
| rejilla de accesos de la Home | **5 columnas, hueco 12** | `m_h_icons_low_purchase`, `m_h_v5_dojo_icons_d3_2026` | — (pendiente) |
| barra de búsqueda | plantilla **`m_h_searchBar_slim_protocol_version`**; radio **10** (8,5 y 7 dentro, 3 en el detalle) | `homepage/m_h_searchBar_slim…` | 12 |
| ancho de un elemento de barra | 61 (filas de iconos), 167,5 / 165,5 / 169 (barras de 2) | `m_r_sub_feedback_detail_2025`, `buy_v2_item_ext` | — |
| el feed trae tarjetas DISTINTAS | `newface_main_sub_separator` (1 nodo), `cai_ad_ketuo` (publicidad), `m_r_item_video_2024_d3`, `m_r_item_live_d3`… | `informationFlow` | — (mecanismo listo, ver §4) |
| 关注 (seguir) | `taolive_channel_follow_*` (6 plantillas: tarjeta, título, vacío, cargar más) | `live_channel_flexalocal` | — (pendiente) |

### 3 · Lo que se cambió con eso, en los DOS servidores

- **`ext:aspecto`** — la proporción, nuestra clave con la medida de Taobao dentro. El cliente la
  resuelve en `imagenAtributos.resolverImagen` y el widget la aplica (`{width:'100%', aspectRatio}`):
  **la tarjeta deja de tener altura en píxeles**, así que su alto sale del ancho de su hueco y **mide
  bien en cualquier móvil** — que es lo que Taobao consigue con la proporción.
  *(En Taobao es un atributo de la PLANTILLA; aquí vive en la IMAGEN. Es una decisión, y está escrita
  en el código.)*
- **Hueco 8** (columna y fila) y **radio 6**, medidos. El `MARGIN_BOTTOM` de cada tarjeta **se fue**:
  la separación la reparte la lista (`ROW_SPACING`), no cada tarjeta — tenerla en los dos sitios era
  contarla dos veces, y era parte del «hueco de más» que se veía.
- **Margen lateral 8**: el corpus no le da nombre propio (`leftGap`/`rightGap` son de otra tabla), así
  que se usa el mismo 8 del hueco **y se declara como decisión**.
- **Buscador**: `radios.chip` (10) en vez de `radios.md` (12) — el radio medido, con el token que existe
  para eso.
- **La barra de departamentos se queda pegada** (`stickyHeaderIndices={[1]}`): su sitio pasa a ser el
  **segundo hijo directo** del scroll, con fondo del tema y `zIndex`. Es lo que hace Taobao con
  `categoryTab`, y lo que se pidió: con 18 departamentos, perderlos al bajar obligaba a subir para
  cambiar de categoría.

### 4 · Verificado en el móvil

- `151025-tarjetas-medidas-taoBao.png` — las tarjetas **cuadradas**, más grandes y con el hueco
  medido: el mismo catálogo ocupa menos alto y las fotos ya no son más altas que anchas.
- `151025-barra-pegada-al-desplazar.png` — en pleno desplazamiento (Farmacia · Arroz · Monedero) el
  carril sigue anclado bajo el buscador. **Y 0 avisos de listas anidadas** (el arreglo de §22 sigue
  en pie con la barra movida).
- `151025-medidas-taoBao.txt` — la salida cruda de la medición, para que se pueda rehacer.

### 5 · Lo que queda de la lista, con su medida ya hecha

| punto | estado |
|---|---|
| **tamaño y huecos de las tarjetas** | ✅ hecho y verificado |
| **barra de categorías estable al bajar** | ✅ hecho y verificado |
| **buscador al estilo de Taobao** | ✅ radio medido; el resto (alto 40) es decisión nuestra declarada |
| **los servicios de la Home en la cabecera** | ⏳ falta. **La medida está**: 5 columnas con hueco 12. El catálogo existe (`components/ServiceGrid.tsx`, `REJILLA`, 3 filas de 5) y hay que exportar su primera fila y pintarla tras el buscador |
| **la categoría de 关注 (seguidos)** | ⏳ falta, y **necesita dato antes que UI**: el corpus enseña sus 6 plantillas (`taolive_channel_follow_*`), pero hace falta saber si el API del Mercado tiene «tiendas seguidas»; sin eso, una pestaña de seguidos sería una pestaña que no puede enseñar nada |
| **el feed entre las tarjetas** | ⏳ el **mecanismo ya está** (`templateName` por elemento + varias plantillas, §21) y el corpus confirma que Taobao intercala tarjetas de OTRO tipo (`newface_main_sub_separator`, publicidad, vídeo, directo). Falta el contenido real que intercalar: hoy el catálogo no tiene ni un destacado (0 de 9) ni una tienda con tarjeta propia |

### Verificación

`tsc` **5** · `rutas` **0** · `logica` **0** · `diseño` **en verde** · oráculo **133/133** (con el test
nuevo que fija la geometría MEDIDA: hueco 8, radio 6, proporción 1, sin altura fija, y la misma clave
`ext:aspecto` en cliente y los dos servidores) · producción **EXIT=0** con la geometría comprobada en
el desplegado. Desplegado: `codeSha256 29d8e4ae…` + el cambio de geometría.

---

## 24 · CONSTRUIR EL ÁRBOL NUEVO Y SUSTITUIR: sí, y para 关注 el dato NO está (15/10)

### 1 · La estrategia: sí, con el orden bien puesto

Construir la sección aparte, probarla y **sustituir** la pantalla vieja es lo que se hizo con la
rejilla y funcionó. Y sí: con los widgets ya en el cliente, **una pantalla nueva no obliga a tocar el
contrato** — la de seguidos se armó con `Contenedor`, `Imagen`, `Texto` e `Icono`, que ya existían.

Pero el orden no es «árbol → sustituto», es **`DATO → árbol → sustituto`**, y para 关注 el primer
paso **no está hecho**:

### 2 · El hallazgo: el endpoint de seguidos NO existe

El cliente lo declara (`api/ecomerse.ts`) y la UI lo usa (`BotonSeguirTienda.tsx`,
`ecomerse-perfil-tiendas.tsx`). En producción, medido hoy:

| petición | respuesta |
|---|---|
| `GET /api/ecomerse/sellers/following` | **400 «Tienda inválida»** |
| `GET /api/ecomerse/sellers/following/ids` | **404** |
| `GET /api/ecomerse/sellers` | 200 ✓ (el censo: 2 tiendas) |
| `GET /api/ecomerse/sellers/abc` | 400 «Tienda inválida» |

**Lo que pasa**: el backend tiene `sellers` y `sellers/:id` —y su propio comentario explica que la ruta
literal gana— pero **no tiene NINGUNA ruta de seguidos**: `sellers/:id` se come `following` y lo trata
como un id de tienda. O sea: **el botón de seguir tiendas y la pantalla de «mis tiendas seguidas» están
llamando a rutas que no existen.** No es un fallo del árbol ni del cliente: falta el backend.

Y no falta por olvido de una tabla: **el lado `lifebook` SÍ lo tiene** (`POST /commerce/shops/:id/follow`,
`toggleFollow`, `shop_follows`, y hasta el error `CANNOT_FOLLOW_SELF`) — es el lado **ecomerse** el que
nunca lo implementó. *(Se comprobó con `grep` sobre el backend espejo entero: cero rutas y cero tablas de
follows en `ecomerse`.)*

**Consecuencia para el plan**: una pestaña 关注 hoy no tendría nada que enseñar. Construirla sería
enseñar una pestaña vacía con aspecto de función — justo lo que esta línea de trabajo evita.

### 3 · Lo que SÍ se dejó hecho y verificado: las secciones **de quien pregunta**

Es lo que hacía falta para 关注 y para **cualquier** pantalla de usuario (favoritos, pedidos, mis
tiendas), así que se hizo una vez:

- **`httpClient.tokenActual()`** — el token lo entrega quien lo guarda y lo rota. Leerlo desde fuera
  sería una segunda copia de la lógica de refresco.
- **`pedirUi(ruta, …, { conSesion })` + `FranjaServidor conSesion`** — la petición de una sección lleva
  el mismo `Authorization: Bearer` que cualquier otra.
- **`Cache-Control: private, no-store`** en esas rutas. **No es un detalle de rendimiento**: una
  respuesta con las tiendas que sigue alguien, guardada en una caché compartida, se le sirve al
  siguiente que pregunte. Las públicas siguen con su `public, max-age=30`.
- **El árbol de seguidos** (`arbolDeSiguiendo`): lista de una columna, tarjeta de tienda con foto
  cuadrada (la proporción medida), nombre, seguidores y el botón de **dejar de seguir** como
  `ext:accion`. La acción quedó **declarada en el vocabulario del cliente** (`ACCIONES.DEJAR_DE_SEGUIR`),
  que es lo que el oráculo exige: una acción sin declarar es un toque que no hace nada.
- Sin token, la sección devuelve **«nada»** (`arbol: null`), no una lista inventada ✓.

**No se desplegó la ruta**: hoy devolvería siempre «nada» porque el dato no existe. Un endpoint que no
puede contestar es superficie sin valor; se despliega cuando exista el backend.

### 4 · Lo que sigue, en orden

1. **Backend de seguidos de ecomerse** (tabla + `POST /sellers/:id/follow`, `GET /sellers/following`,
   `GET /sellers/following/ids`), copiando la forma del lado `lifebook` que ya funciona. **Sin esto no
   hay 关注, y es lo único que falta.**
2. **La pestaña 关注 en el Mercado** (servida), con la sección que ya está construida; y borrar la
   pantalla vieja (`ecomerse-perfil-tiendas.tsx`) en el mismo commit que la sustituye.
3. Los dos puntos que quedaron de §23: **los servicios de la Home en la cabecera** (5 columnas, hueco
   12 — medido) y **el feed entre tarjetas** (el mecanismo está; falta contenido real que intercalar).

### Verificación

`tsc` **5** · `logica` **0** · `diseño` **en verde** · oráculo **138/138** (5 pruebas nuevas: el árbol
sólo con widgets de la lista blanca, la acción declarada, **sin token no hay datos** contra el API de
verdad, la cabecera privada, y el cliente pidiendo la sección con sesión).

---

## 25 · EL MÉTODO: mirar la lógica de negocio, y encima clonar Taobao (15/10)

### 1 · El método, dicho por quien manda

> «Miramos la lógica de negocio que hay detrás de las pantallas antiguas; sobre esa lógica construimos
> mediante la clonación de Taobao y así sustituir por las pantallas antiguas.»

Traducido a trabajo: **la lógica no se reinventa ni se copia, se EXTRAE a un sitio compartido**; y la
forma (qué se ve, cómo se coloca, cuánto mide) sale de Taobao. El día que la pantalla vieja se borre, lo
que valía de ella ya no está dentro de ella.

### 2 · La primera aplicación: los servicios en la cabecera

Lo pidió así: **«dos filas con 5 servicios en cada fila; las que sobran se agregan dentro de “Más
servicios” como icono, como en Taobao»**.

**La lógica que había detrás** (estaba dentro de `ServiceGrid`, la rejilla de la Home) tenía cuatro
casos que **no se ven** al mirar la pantalla, y todos se respetaron:

| caso | qué hace |
|---|---|
| **Perfiles** | hay servicios con más de un perfil (taxi → pasajero/conductor): si ya se eligió, va directo; si no, **pregunta**; y **mantener pulsado** vuelve a preguntar. Se recuerda por dispositivo. |
| **Urgencia** | `tone: 'emergency'` **no navega**: abre el modal de emergencia. Es la diferencia entre «ir a una pantalla» y «avisar ahora». |
| **«Próximamente»** | la celda está deshabilitada y **lo dice**. |
| **Navegación validada** | la ruta pasa por el validador — así se cazó un `/emergencia` que no existía. |

Se **extrajeron** a `components/servicios/useServicios.ts` (+ el modal a `SelectorDePerfil.tsx`), y
**`ServiceGrid` ahora los usa**: en la Home ya no hay una copia. El Mercado pinta
`components/servicios/FilaServicios.tsx`, que es **el mismo hook y el mismo modal** — no un clon.

**Lo que se ve** (`151025-servicios-en-la-cabecera.png`): dos filas de cinco, **doce** de hueco (la
medida de Taobao para su rejilla de accesos, §23), la décima plaza **«Más servicios»**… y dentro
(`151025-mas-servicios.png`) **«6 servicios más»** con la misma rejilla y el mismo comportamiento —
incluida la emergencia, que sale en rojo porque su tono es urgente.

Y los servicios van **los primeros del scroll** (bajo la barra de búsqueda, que sí es fija): es el orden
de Taobao —accesos, banner, pestañas pegadas, feed— y así no le roban a la pantalla dos filas
permanentes.

### 3 · El reparto es lógica pura, y tiene su prueba

`components/servicios/repartoServicios.ts` decide **quién se ve y quién va dentro**, y de ahí sale una
cuenta que no es de estilo:

- Con 15 servicios y 2×5, **se ven NUEVE**: la décima plaza **es** «Más servicios». Ver diez obligaría a
  que el botón se saliera de la rejilla.
- **Si todo cabe, no hay botón**: con 9 servicios «Más servicios» desaparece solo. Un botón que abre un
  panel vacío es peor que no tenerlo.

Su prueba encontró **un fallo real antes que el móvil**: con cero plazas, `slice(0, -1)` quitaba el
último servicio en vez de no dar ninguno. Está arreglado y con su caso cubierto.

### 4 · Lo que sigue

1. **关注 (seguidos)**: **bloqueado en el backend** — el endpoint no existe (§24). El árbol y la sección
   con sesión ya están hechos y probados; falta el dato.
2. **El feed entre tarjetas**: el mecanismo está; falta contenido real que intercalar.
3. La sustitución de la pantalla vieja de seguidos (`ecomerse-perfil-tiendas.tsx`) va **en el mismo
   commit** que enseñe la nueva funcionando.

### Verificación

`tsc` **5** · `logica` **0** · `diseño` **en verde** · oráculo **144/144** (6 pruebas nuevas: el reparto
2×5 con sus casos raros, que el catálogo son quince y cada uno con id/rótulo/icono/ruta, que **la
rejilla de la Home no cita ningún id que no exista** —una plaza vacía en silencio—, y que la Home y el
Mercado usan **el mismo** hook y el mismo selector, sin decidir perfiles ni urgencia por su cuenta).

---

## 26 · 关注: el carril de feed, y los dos defectos visuales (16/10)

### 1 · 关注 estaba sin sitio, y eso ya tiene arreglo

Lo pedido: **«sigue con 关注»**. Y lo primero que hizo falta no fue una lista: fue **el carril que
elige el feed**. En Taobao hay **dos** carriles de pestañas y no son lo mismo:

| carril | qué hace |
|---|---|
| **feed** (`推荐` · `关注`) | elige **qué feed** se ve. Va arriba y se queda pegado. |
| **categorías** (`categoryTab`, 12) | filtra **dentro** del feed. |

Aquí solo existía el segundo. Así que **«Siguiendo» no tenía dónde ponerse** — no era un descuido de
estilo. Ya está: `ui/feeds` sirve el carril (mismas `Pestanas`, la activa sale de los datos) y la
pantalla monta **los dos pegados**, el de feed arriba, como Taobao (`stickyHeaderIndices={[1, 2]}`).

**Y el feed de Siguiendo se sirve**: `ui/siguiendo`, con **la sesión del usuario** y con
**`Cache-Control: private, no-store`**. Las dos cosas, comprobadas **en producción**:

```
GET /api/ecomerse/ui/feeds?activo=siguiendo  → 200 · public, max-age=60 · activa: 1 (Siguiendo)
GET /api/ecomerse/ui/siguiendo               → 200 · private, no-store · arbol: null
GET /api/ecomerse/ui/siguiendo (con token)   → 200 · private, no-store · arbol: null
```

**Ese `null` es la verdad, no un fallo**: el endpoint de seguidos **no existe** en el backend de
ecomerse (§24). La pestaña enseña su vacío —«Aquí verás las tiendas que sigues»— y **no rellena con
nada inventado**. El día que el endpoint exista, esto se llena **sin tocar una línea del cliente**: la
llamada ya va con la cabecera reenviada.

### 2 · Los iconos, «más vivos»: el guardián de diseño tenía razón

Lo pedido: los servicios «deberían tomar el aspecto que Taobao lleva, más vivos». El rasgo que se clona
es que **Taobao no los pinta monocromos**: su rejilla de accesos es un mosaico de colores.

**La primera versión que escribí traía quince colores a mano —y el guardián de diseño la puso en rojo
en el acto** (`components/servicios/colorServicio.ts → hex: 0 → 15`). Y tenía razón: un color suelto en
una pantalla no cambia con el tema, no pasa el contraste que el kit ya calculó y nadie puede reajustarlo
en un sitio. Quedó así: se declara **el token** de cada servicio (`info`, `warning`, `success`…) y el
color lo resuelve el tema. Con quince servicios y diez tokens, algunos repiten — lo que se busca es el
mosaico, no quince tonos únicos. **La urgencia manda**: `emergencia` va con el `danger` del tema.

### 3 · El hueco entre el carril y las tarjetas

Lo pedido: «todavía hay mucho espacio de separación entre las categorías y las tarjetas». Medido dónde
estaba: el contador aportaba **16 arriba + 10 abajo** y la rejilla **8 más** → **unos 47 dp** entre el
carril y la primera tarjeta. Se veía como un hueco que no separaba nada.

Queda en **4 + 4 + 4 ≈ 25 dp**. Los 4 del contador son **decisión declarada** (el corpus no trae una
medida para «separación entre las pestañas y el feed»); los 4 de la rejilla van por su propio camino
(`MARGEN_SUPERIOR`, aparte del lateral, que sí es 8 y alinea con la pantalla). Lo que separa de verdad
es la línea del contador. **Comprobado en producción**: `rejilla` sirve `db779dc86d8bd514: 4`.

### 4 · Lo que queda

1. **El endpoint de seguidos** (tabla + 3 rutas) es **lo único** que falta para que 关注 enseñe datos.
2. ✅ **La comprobación en el móvil ya está hecha** (el teléfono volvió a conectarse a mitad del
   cierre): **los iconos salen con su color** —el mosaico: taxi azul, conductor rojo, monedero ámbar,
   tienda verde…— (`161025-iconos-vivos-y-carril-de-feed.png`), **el hueco se fue** (el contador queda
   pegado al carril y a las tarjetas) y los **dos carriles se apilan pegados** al desplazar, el de feed
   arriba y el de categorías debajo (`161025-doble-carril-pegado-y-hueco-ajustado.png`), con **0
   avisos** de listas anidadas. Queda sin fotografiar el **vacío de 关注**: los toques se iban a las
   tarjetas; lo que lo sostiene es que producción responde `arbol: null` y el vacío es el mismo
   `EmptyState` que el de la rejilla, ya visto en pantalla.
3. El **feed entre tarjetas** sigue esperando contenido real que intercalar.
4. La pantalla vieja de seguidos se borra **en el mismo commit** que la sustituya.

### Verificación

`tsc` **5** · `logica` **0** · `diseño` **en verde** (con el fichero de color, que empezó en rojo) ·
oráculo **148/148** · producción: `feeds` 200 con la activa, `siguiendo` **private/no-store** y «nada»,
`rejilla` con el margen 4 · la paridad de los dos servidores comprobada en **tres** árboles (rejilla,
feeds y siguiendo), no solo en uno.
