# Auditoría de diseño — micro-interacciones de React Bits

**Fecha:** 19/09/2026. **Alcance:** mapear dónde encaja cada micro-interacción de React Bits en las
pantallas que YA existen, y preparar el terreno para implementarlas.

**Método:** tres especialistas en paralelo (interacción y plataforma, accesibilidad, componentes y
tokens), cada uno leyendo los ficheros de conocimiento que le tocaban de la base de `design-audit`.
Todo hallazgo lleva fichero y línea. Lo que no se pudo comprobar está en §9.

**Esto NO repite `design-audit-report.md`** (17/09, 1.215 líneas, 12 dimensiones). Aquel informe ya
identificó dos hallazgos que son exactamente esta petición: **D-14** (animación casi ausente, 8
ficheros) y **D-15** («reducir movimiento» no se respeta, 0 referencias). Este documento cuelga de
ellos y los lleva a ejecución.

---

## 0. Estado medido al 26/09/2026

**Esta sección se añade después. El resto del documento es del 19/09 y se conserva tal cual**, porque sus
mediciones siguen siendo válidas; lo que ha cambiado es **cuánto de su propio plan se ha ejecutado** — y
ese resultado obliga a reordenar lo que queda.

Medido hoy sobre el árbol, no deducido del plan:

| Pieza del §8 | Estado real | Evidencia |
|---|---|---|
| **Fase 0** · tokens de movimiento | **CERRADA** | `packages/ui-kit/src/theme/movimiento.ts` — `duracion`, `curva`, `opacidad`, `umbral`, `resorte`, `repeticion` |
| **Fase 0** · `useMovimientoReducido()` | **CERRADA** | `packages/ui-kit/src/a11y/useMovimientoReducido.ts` (lee `isReduceMotionEnabled` y escucha `reduceMotionChanged`) |
| **Fase 0** · geometría a `escalas.ts` | **CERRADA** | `trazo` :326 · `trazoIcono` :383 · `altura` :433 · `icono` :451 |
| **Fase 0** · `peerDependencies` del kit | **CERRADA** | `packages/ui-kit/package.json` ya declara `react-native-reanimated`, `react-native-gesture-handler` y `expo-haptics` |
| **Fase 1** · los 3 componentes | **CONSTRUIDOS** | `micro/Segmentado.tsx` · `micro/Corazon.tsx` · `micro/Estrellas.tsx`, exportados en `src/index.ts:104-105` |
| **Fase 1** · su ADOPCIÓN | **0 ficheros. CERO.** | ninguna pantalla de `app/` ni de `components/` importa `Segmentado`, `Corazon` ni `Estrellas` |
| §7.8 · el banco temporal | **RESUELTO** | `app/banco-*.tsx` no existen; el baseline de diseño ya no los cuenta |
| Fases 2, 3 y 4 | **sin empezar** | — |

### 0.1 El hallazgo que reordena todo: se construyó sin adoptar

El §1.3 de este mismo informe avisaba de que `haptico` y `anunciar` existen desde el primer día, están
exportados… y tienen **0 usos**. Los tres componentes de la Fase 1 acaban de repetir ese camino exacto:

> **El kit ha crecido en tres controles y las pantallas no han cambiado en ninguna.**

Esto no es un detalle de proceso. La Fase 1 se justificó diciendo «1 componente → 5 pantallas»
(`pulse-heart`) y «1 → 4 flujos de dinero» (`peek-rating`). **Ninguna de esas dos frases se ha cumplido
todavía.** Mientras siga así, cada componente nuevo es inventario, no mejora: y la deuda de diseño que el
§7.9 pone en la mesa (190 hex · 753 `fontSize` · 709 `borderRadius`) no baja ni un punto.

**Consecuencia para el plan:** la adopción de lo ya construido es trabajo de la misma categoría que
construir lo que falta — no un paso posterior. Y **la pregunta §7.9 («¿sustituyen o se suman?») hay que
responderla ANTES de escribir el cuarto componente**, porque es la que decide si el resultado son 15
controles en uso o 15 controles huérfanos.

### 0.2 Los 15, nombre a nombre, contra el estado de hoy

| React Bits | Nombre en la casa | Sustituye / dónde entra | Estado 26/09 |
|---|---|---|---|
| `rubber-segment` | **`Segmentado`** | `ecomerse-orders.tsx:249,264` · `ecomerse.tsx:302` · `ecomerse-favorites.tsx:118` | Construido · **adopción 0** |
| `pulse-heart` | **`Corazon`** | `PostCard.tsx:215` · `CommentsSheet.tsx:183` · `lifebook-post/[id].tsx:936` · `lifebook-videos.tsx:906` · `lifebook-ai.tsx:451` | Construido · **adopción 0** |
| `peek-rating` | **`Estrellas`** | `taxi.tsx:1845` · `food-orders.tsx:757` · `ecomerse-orders.tsx:520` · `lifebook-hotel-perfil.tsx:249` | Construido · **adopción 0** |
| `code-slots` | *no se crea* | **ya cubierto** por `OtpInput.tsx` (`length` parametrizable, `:25`) | Sin trabajo |
| `spring-check` | — | `lifebook-carrito.tsx:41-68` (casilla 21×21) | Sin empezar |
| `jelly-radio` | — | `ecomerse-checkout.tsx:328,338,349` · `food-checkout.tsx:493` · `lifebook-carrito-checkout.tsx:439` | Sin empezar |
| `glide-select` | — | filas de `Sheet.tsx:47-87`; llamantes en `ecomerse-seller.tsx:1055` (24 ciudades), `food-owner.tsx:788`, `ecomerse.tsx:484`, `lifebook-explore.tsx:301` | Sin empezar |
| `hold-button` | — | las 4 pulsaciones largas ya existentes: `lifebook-videos.tsx:973` · `ServiceGrid.tsx:100` · `lifebook-carrito.tsx:477` · `lifebook-chat/[id].tsx:1608` | Sin empezar |
| `prompt-bar` | — | `lifebook-ai.tsx:568-579` · `lifebook-videos.tsx:1319-1331` | Sin empezar |
| `voice-pill` | — | `lifebook-ai.tsx:638-648` + el **micrófono muerto** de `SearchHeader.tsx:76` | Sin empezar |
| `swipe-toast` | *ampliar `Aviso`* | `Aviso.tsx:28-55`; hoy **1 sola pantalla** lo usa (`billing-status.tsx:383`) | Sin empezar |
| `squish-switch` | — | `alquiler.tsx:332` · `settings.tsx:142,209,220` (**+ 4 envoltorios a unificar**) | Sin empezar · el más caro |
| `slide-commit` | — | `conductor.tsx:1431` (oferta) y `:1664` (cobrar) · `intercity.tsx:344` · `taxi.tsx:1778` | Sin empezar |
| `fuse-button` | — | — | **RECHAZADO por escrito** (§3 y §4.4) |
| `balatro` | — | **no en `app/index.tsx`**; candidatos `auth.tsx:136` o `SocialHomeHeader.tsx:36-44` | **Bloqueado por decisión** (§4.1) |

**Recuento:** 3 construidos y sin adoptar · 1 ya cubierto por el kit · 9 por construir · 2 que no van
donde se pidió.

### 0.3 ¿Encajan sobre lo que YA está construido? Censo de los sitios REALES (26/09)

La §0.2 dice dónde entrarían. Esta dice **cuántos sitios existen hoy** — porque un componente que
sustituye a 30 sitios es deuda que baja, y uno que no sustituye a nada es inventario nuevo. Medido sobre
`app/` y `components/`:

| Familia | Sitios reales hoy | Dónde |
|---|---|---|
| **Interruptores** (`squish-switch`) | **27 `<Switch>` directos + 3 envoltorios distintos** | `PrefRow` en `status.tsx:166` · `SwitchRow` en `alquiler.tsx:328` · `ToggleRow` en `work.tsx:237`; el grueso repartido por `settings.tsx:143,210,221`, `lifebook-hotel-*`, `GroupManageSheet.tsx:532,544,584`, `ChatOptionsSheet.tsx:222,225` |
| **Segmentados** (`rubber-segment`) | **24 usos de `accessibilityRole="tab"` en 18 ficheros**; el componente del kit: **0 usos** | `ecomerse-orders.tsx` (3) · `ecomerse-favorites.tsx` · `ecomerse.tsx` · `lifebook.tsx` · `lifebook-catalog.tsx` (2) · `lifebook-user.tsx` (2) · `lifebook-inbox*.tsx` · `BarraTienda.tsx` · `PieDelMercado.tsx`… |
| **Casillas** (`spring-check`) | **4** con `accessibilityRole="checkbox"` | `tienda/publicar.tsx:759,959,994` · `ecomerse-direccion.tsx:260` |
| **Estrellas** (`peek-rating`) | **4 implementaciones**; el kit: **0 usos** | `taxi.tsx:1855` (**la única interactiva**, 5 toques) · `trips-history.tsx:185` (sólo lectura) · y `★` en texto en `CabeceraTienda.tsx:72`, `DriverHomeSheet.tsx:157`, `tienda/index.tsx:344` |
| **Corazón** (`pulse-heart`) | el kit: **0 usos** | los 5 sitios del §0.2 siguen con su propio `Heart` |
| **Radios** (`jelly-radio`) | **52 `accessibilityRole="radio"` en 19 ficheros — y 0 contenedores `radiogroup`** | selección exclusiva de verdad: direcciones de entrega en `ecomerse-checkout.tsx:456,529,539,550` · método de pago y entrega en `food-checkout.tsx:394,403,487,496` · planes en `ecomerse-planes.tsx:282`. **Corregido el 26/09: la primera versión de este apartado dijo «0 grupos de radio», y era FALSO** |
| **Selectores** (`glide-select`) | **2 de ciudad en hoja + el de variante** | `tienda/publicar.tsx:600` · `tienda/perfil.tsx:398` · `SelectorDeVariante` (comercio) |
| **Avisos** (`swipe-toast`) | **428 `Alert.alert`**: **318 informativos** + **110 con botones** | el diálogo del sistema es hoy el ÚNICO lenguaje de feedback de la app |
| **Destructivas** (`hold-button` / `slide-commit`) | **99 menciones** de eliminar/borrar/descartar/cancelar | `lifebook-carrito.tsx` (8) · `work-panel.tsx` · `edit-profile.tsx` · `ecomerse-direcciones.tsx` · `work-publish.tsx:176,186`… |
| **Voz** (`voice-pill`) | **3 micrófonos, y uno YA dicta** | `lifebook-ai.tsx:647` — funciona: `accessibilityLabel` alterna `'Dictar con la voz'` / `'Parar de dictar'` y tiene estado `selected`. Los otros dos **no son controles**: `lifebook-media.tsx:425` indica el tipo de archivo (podcast) y `SearchHeader.tsx:77` es **adorno** dentro del `Pressable` del buscador. Además hay **TTS real** en `api/voice` (`sayNavigation`, `stopAllVoice`, usado por `conductor.tsx`) |

**Lo que esto significa, sin adornos:**

1. **Cinco familias tienen sitio y volumen** (interruptores, segmentados, estrellas, corazón, selectores):
   son las que bajan duplicación. **Tres de ellas ya están construidas y con 0 adopción.**
2. **`jelly-radio` SÍ tiene sitio, y es el MAYOR de todos**: **52** controles de selección exclusiva sin un
   solo contenedor de grupo. **Corrijo aquí mi propia cifra**: la primera versión de este apartado decía «0
   grupos de radio», medida con un `grep` por **nombre de componente** (`Radio`, `Picker`, `Selector`). Con
   **rol de plataforma** son 52 sitios en 19 ficheros. La lección es idéntica a la de los segmentados: **un
   censo por nombre propio da falsos negativos; se cuenta por ROL.**
3. **`voice-pill` no se construye: se EXTRAE.** El micrófono de `lifebook-ai.tsx:647` **ya dicta** y
   alterna a «Parar de dictar». No es un anclaje muerto: es una implementación a la que le falta
   generalizarse. Escribir `voice-pill` aparte sería la segunda implementación de lo mismo.
4. **Una cambia de PATRÓN, no de componente**: `swipe-toast`. Los 318 informativos no son «toasts
   pendientes»: son el diálogo del sistema, que **bloquea**, y en muchos casos precede a un `return` de
   validación. Sustituirlos por un aviso no bloqueante cambia el flujo, y hacerlo a medias deja **tres
   dialectos de aviso** conviviendo (diálogo + toast + prompt-bar).
5. **Dos compiten entre sí**: `hold-button` y `slide-commit` resuelven el MISMO problema (confirmar algo
   irreversible). Adoptar los dos deja dos gestos para una sola idea.

**El terreno técnico está listo, medido:** `react-native-reanimated`, `react-native-gesture-handler` y
`expo-haptics` (**`~14.1.4`**) están instalados y en `package.json`; `packages/ui-kit/src` **sí entra en el
`tsconfig`** (`include: **/*.tsx`), así que `tsc` cubre lo que se escriba ahí. **No hay que instalar nada.**
Pero `hapticos.ts` (34 líneas) tiene **0 usos**: la háptica de la mitad de estos gestos está escrita y nunca
se ha encendido.

> El comentario de `lifebook-videos.tsx:84` («`expo-haptics` **no está instalado**») es **obsoleto**:
> medido hoy, está en `package.json:35` y en `node_modules/`.

> **Corrección de una cifra de la primera versión de este §0.3.** Se dijo «**9 ficheros** hacen
> segmentados a mano», salido de un `grep` que buscaba `activo`+`chip`. Medido en estricto —el
> contenedor o las opciones con **rol de plataforma**, `accessibilityRole="tab"`— son **24 usos en 18
> ficheros**. Los «9» mezclaban chips de filtro sin rol con otras cosas: `alquiler.tsx` y
> `ecomerse-direccion.tsx` tienen **0** roles `tab`. La cifra buena es **24 / 18**, y es **seis veces**
> lo que la propia cabecera de `Segmentado.tsx` declara (3 ficheros / 4 sitios).

### 0.4 El encaje real, sitio por sitio: los tres construidos NO son igual de buenos

Medido leyendo cada sitio, no la cabecera de cada componente:

**`Estrellas` — el mejor situado.** 3 interactivos + 2 de lectura:

| Sitio | Forma real | ¿Sustitución limpia? |
|---|---|---|
| `taxi.tsx:1852-1863` | 34 px · `gap e10` · `hitSlop 6` · rol **button** | Sí, salvo el rol (ver abajo) |
| `food-orders.tsx:757-763` | 32 px · `gap e6` + `hitSlop 4` | Sí — y **corrige un defecto real**: 8 px de área sobre 6 de hueco, zonas que se pisan |
| `ecomerse-orders.tsx:721-722` | 34 px · `hitSlop 8` · rol button | Sí |
| `trips-history.tsx:187-189` | 14 px, sólo lectura | Sí, con `interactivo={false}` |
| `conductor.tsx:1401-1402` | 11 px, sólo lectura | Sí, con `interactivo={false}` |
| `lifebook-hotel-perfil.tsx:249-259` | **no son estrellas: son píldoras `n★`** | **No es sustitución: cambia el aspecto** |

Los tres interactivos declaran **`accessibilityRole="button"`** donde corresponde un **`radiogroup` con
`radio`**: elegir 1 de 5 es una opción exclusiva, no cinco botones sueltos. `Estrellas` ya usa el rol
correcto, así que adoptarlo **mejora** la semántica — pero es un cambio que hay que declarar.

**`Segmentado` — el de más alcance, y su cabecera lo subestima 6×.** Declara 3 ficheros / 4 sitios; el
censo estricto da **24 / 18**. Pero **no todos son segmentados**: hay **pestañas de navegación** (cambian
de vista entera) mezcladas con **filtros en fila** (cambian un listado). Y **ni un solo contenedor del
árbol declara `tablist`**: hoy hay 24 roles `tab` **huérfanos**, sin grupo que los agrupe. Antes de
adoptar hay que separar los dos usos.

**`Corazon` — el peor, y su cabecera afirma lo contrario** («el que más arregla con menos código»).
Cubre **1 de 6**:

| Sitio | Forma real | Veredicto |
|---|---|---|
| `PostCard.tsx:215-225` | fila, corazón + **contador compacto** (`formatCount` → «1.2k») | Encaja, pero el kit pinta `String(cuenta)`: **pierde el formato** |
| `CommentsSheet.tsx:183-193` | **columna**, contador **debajo** del corazón | **No encaja**: el kit es fila |
| `lifebook-ai.tsx:451-458` | corazón + **texto** «Me gusta»/«Te gustó» | **No encaja**: el kit pinta número |
| `lifebook-post/[id].tsx:938-948` | `DetailActionButton` **genérico** (`label`+`count`+`icon`) | **No conviene**: meter un corazón específico dentro de un botón genérico |
| `lifebook-videos.tsx:906-911` | el **gesto** de doble toque (`doubleTapLike`) | **No es un botón** |
| `alquiler-detalle.tsx:431` · `ecomerse.tsx:218` · `ecomerse-detail.tsx:453` | corazones de **favorito** (guardar) | **Otra semántica** |

**Conclusión:** `Corazon` necesita **3 ampliaciones de contrato** antes de poder adoptarse en más de un
sitio — `orientacion: 'fila' \| 'columna'`, un `texto` alternativo al contador, y formato compacto — o
aceptar que **sólo entra en `PostCard`**. Su cabecera promete cinco superficies y mide una.

**Una regla transversal, nacida aquí:** las cabeceras de los tres componentes citan **números de línea**
del 19/09. El árbol se movió (A3.1 y A3.2 tocaron esos mismos ficheros) y hoy
`Estrellas.tsx:9` cita `ecomerse-orders.tsx:517-524` **donde ahora hay un `EmptyState`** — el selector
está en `:721-722`. **Un comentario que cita un número de línea caduca; hay que citar el ancla** (el
nombre del estilo, de la función o del componente).

### 0.5 Lo que se corrigió hoy en el kit, y por qué

`Estrellas.tsx` pintaba las estrellas puestas con **`brand.warning`**, mientras los cinco sitios que
sustituye pintan **`colors.text.warning`** (ámbar `#B45309`, que es como quedó en la tanda de contraste
**A3.2** y como se **verificó en el móvil**). Adoptarlo tal cual habría **cambiado el color de las
estrellas de cinco pantallas** y reabierto por la puerta de atrás una tanda cerrada.

**Corregido hoy** (`packages/ui-kit/src/micro/Estrellas.tsx`): el icono puesto usa `colors.text.warning`,
y el `import` de `brand`, que quedaba sin uso, se ha retirado. **Criterio: una sustitución no cambia lo
que el usuario ya ve.**

### 0.6 La decisión: no son 15 piezas, son CUATRO intenciones

**Decidido por mí el 26/09**, porque las dos preguntas de alcance quedaron sin respuesta y dejarlo abierto
bloqueaba el trabajo entero. Queda sujeto a corrección de Bernardo, pero está escrito para poder discutirlo
en concreto y no en abstracto.

El encargo llegó como una lista de 15 componentes de React Bits. Medida contra el árbol, la lista **no
describe 15 necesidades**: describe **cuatro intenciones** que se repiten con distinta cardinalidad. Y la
medida que lo demuestra es esta:

> **111 controles de selección** (25 `tab` + 52 `radio` + 27 `<Switch>` + 7 `checkbox`) **no tienen ni un
> solo contenedor de grupo declarado**: **0 `tablist`, 0 `radiogroup`** en toda la app.

| Intención | Pieza única | Sustituye a | Sitios |
|---|---|---|---|
| **Seleccionar** · exclusiva que cambia la vista | `Segmentado` | 25 `tab` sueltos | 18 ficheros |
| **Seleccionar** · exclusiva que elige un valor | `jelly-radio` | 52 `radio` sueltos | 19 ficheros |
| **Seleccionar** · sí/no inmediato | `squish-switch` | 27 `<Switch>` (**21 sin rol**) + 3 envoltorios | 19 ficheros |
| **Seleccionar** · opciones independientes | `spring-check` | 7 `checkbox` | 5 ficheros |
| **Seleccionar** · lista larga | `glide-select` | 2 de ciudad + variante | 3 |
| **Valorar** | `Estrellas` · `Corazon` | 37 menciones + 5-6 `Heart` propios | 8 + 3 |
| **Confirmar** · irreversible | `hold-button` **o** `slide-commit` — **uno, no los dos** | 104 acciones destructivas | 33 ficheros |
| **Informar** · con acción | `prompt-bar` | 110 `Alert.alert` con botones | — |
| **Informar** · descartar | `swipe-toast` | 318 `Alert.alert` informativos → **cambio de PATRÓN, no de pieza** | — |

**Los cuatro descartes, por escrito** (la doctrina del proyecto es declarar, no borrar en silencio):

- **`fuse-button`** — rechazado ya en §4.4: una mecha es una espera impuesta que no informa, y no tiene
  equivalente para lector de pantalla.
- **`balatro` en la home** — rechazado en §4.1: `app/index.tsx` es un mapa a pantalla completa con hoja de
  cristal encima; ahí no se ve y compite por fotogramas con el WebView.
- **`code-slots`** — ya cubierto: `OtpInput.tsx` tiene `length` parametrizable.
- **`voice-pill`** — no se construye: se **extrae** el dictado que ya funciona en `lifebook-ai.tsx:647`.

**El límite: DENTRO DE LO SELLADO.** Los gestos se construyen con `movimiento.ts` (duraciones y curvas),
`trazo`, `haptico` y la escala de `escalas.ts`, que **ya existen**. **Cero tokens nuevos, cero valores
nuevos.** El motivo no es conservadurismo: reabrir tokens invalidaría `A2`, `A3.1` y `A3.2` —las tres
verificadas en el móvil el 26/09— y obligaría a repetir el ciclo entero de medición y verificación. Un
cambio de valor ya tiene su puerta: **su propia fase, con acta**. Este rediseño no la necesita porque no
cambia lo que el usuario ve, cambia **cómo lo toca**.

**La tesis, en una frase:** el rediseño de las micro-interacciones no es cosmética. Es **cerrar la
semántica de la selección** — 111 controles que hoy se comportan como opciones exclusivas sin declararlo, y
de los cuales **21 interruptores ni siquiera tienen rol**. Los gestos (muelle, háptica, retención) son lo
último que se enchufa encima, no lo primero que se construye.

### 0.7 El error de destino que hay que evitar

El encargo llega pidiendo `src/components/micro/` y «variante TS+CSS». Las dos cosas son inviables, y por
razones ya medidas en este documento:

- **`src/` no existe** en `D:\egapp`. El destino real es `packages/ui-kit/src/micro/` (§1.2).
- **«TS+CSS» no existe en React Native**: no hay DOM, ni CSS, ni `:hover`, ni `@media`. Son 2.551 líneas
  de CSS reescritas a `StyleSheet` + Reanimated (§1.1).
- Y si aun así se creara `components/micro/`, la guarda **escanea esa carpeta y no está en su base**:
  cualquier `fontSize`, `borderRadius` o hex literal haría **fallar `npm run diseno` en la primera
  pasada** (§1.2).

---

## 1. Las cinco cosas que cambian el plan

### 1.1 No es un port: es una reescritura

Los 15 componentes de React Bits son **web puro**. Medido sobre el código descargado:

| Dato | Valor |
|---|---|
| Líneas de **CSS real** entre los 15 | **2.551** |
| Usan **`motion/react`** (Framer Motion) | 8 de 15 |
| Usan **`@hugeicons/react`** (iconos DOM) | 10 de 15 |
| Dependencias que la app NO tiene | `motion`, `framer-motion`, `@hugeicons/*` |

La app es **React Native**: no hay CSS, no hay DOM, no hay `:hover`, no hay
`@media (prefers-reduced-motion)`. **La «variante TS+CSS» que pide el encargo no existe.** Hay que
reescribir cada efecto con `StyleSheet` + Reanimated + gesture-handler.

Y hay norma de la casa que lo respalda (`app/lifebook-videos.tsx:143`):

> *«No se añade `expo-linear-gradient` por esto: el proyecto evita dependencias nuevas cuando se puede
> resolver con lo que ya hay»*

**Lo que la app sí tiene** (`package.json`): `react-native-reanimated 3.17.4`,
`react-native-gesture-handler 2.24.0`, `react-native-svg 15.11.2`, `expo-blur`, `expo-haptics`,
`expo-speech-recognition`, `lucide-react-native`. Es material de sobra: no hay que instalar nada.

### 1.2 La guarda de diseño NO vigila el ui-kit — y eso decide dónde va el código

`pruebas/verifica-diseno.cjs:29`:

```js
const EXCLUIDAS = [/node_modules/, /respaldo/, /^\.expo/, /packages[\\/]ui-kit/];
const ZONAS = ['app','components','core','api','state','utils','constants'];   // :27
```

**Consecuencia directa:** si los componentes van a `components/micro/` (como pide el encargo), esa
carpeta **se escanea y no está en la base** → **cualquier `fontSize: 14`, `borderRadius: 12` o hex
literal hace fallar `npm run diseno` en la primera pasada**.

Si van a `packages/ui-kit/src/micro/`, la guarda no los ve y el barril ya existe (`index.ts:1-49`).

**Y lo que la guarda NO vigila, que es donde de verdad se desmadra el código nuevo:** duraciones,
curvas, opacidades, `borderWidth`, tamaños de icono, umbrales de gesto. Ahí no hay red. Ese es el
argumento para escribir **tokens de movimiento ahora**, no después.

### 1.3 `haptico` y `anunciar` ya existen… y no los usa nadie

| Helper | Dónde | Usos en `app/` + `components/` |
|---|---|---|
| `haptico('toque'\|'exito'\|'aviso'\|'error')` | `feedback/hapticos.ts:15-33` | **0** |
| `anunciar()` (lector de pantalla, iOS+Android) | `feedback/anuncios.ts:13` | **0** |

Existen, están exportados (`index.ts:40-41`) y el kit los usa internamente (`PrimaryButton.tsx:45`,
`InlineError.tsx:42`, `Aviso.tsx:35`, `PinSheet.tsx:63`). **Son el precedente exacto de lo que le
pasará a estos 15 componentes si no se fuerza su adopción.**

### 1.4 No hay ni una sola animación con física de muelle — y el prototipo está en un fichero temporal

`withSpring` aparece **0 veces** en toda la app. Todo es `timing` lineal o `bezier`. Y:

- `LayoutAnimation` → **0**. `entering=` / `exiting=` / `layout=` de Reanimated → **0**.
- **La mitad del motion real de la app vive en pantallas que hay que borrar:**
  `app/banco-1-pastilla.tsx:42-43` (Reanimated + `Easing.bezier`) y `app/banco-2-ramas.tsx:59-60`,
  ambos con cabecera «⚠️ TEMPORAL: se borra cuando se decida el efecto».
- **`rubber-segment` ya está escrito y medido**: `banco-1-pastilla.tsx:136-137` usa
  `PESTANAS = ['Todo','Novedades',…]` y `ORDENES = ['Recomendado','Precio ↑',…]` con las medidas
  reales de `ecomerse-favorites` y del selector del Mercado (`:147-148`).

### 1.5 `aria` de la casa: lo básico está, lo que falta es justo lo que estos efectos tocan

| Dato | Valor | Exigido |
|---|---|---|
| `accessibilityRole` en `app/` | 532 | — |
| `accessibilityState` | **126** | — |
| `hitSlop` | 278 | — |
| `accessibilityHint` | **19** | — |
| `anunciar()` en `app/` | **0** | iOS lo necesita |
| `isReduceMotionEnabled` / `prefers-reduced-motion` | **0** | WCAG 2.3.3, 2.2.2 |
| Contraste del **riel OFF** de los interruptores (`colors.border`) | **1.17:1** claro · **1.24:1** oscuro | **3:1** (1.4.11) ❌ |
| Botón deshabilitado (`PrimaryButton.tsx:55`, opacidad 0.45) | 2.03:1 | exento, pero ilegible |

**El estado OFF de un interruptor hoy es casi invisible.** Un `squish-switch` con rebote encima de un
riel que no se lee sería **un adorno sobre algo que no se ve**: el efecto no arregla el problema, lo
disimula.

---

## 2. Inventario de lo que ya existe (para no duplicar)

### 2.1 Duplicaciones que hay que resolver antes de escribir nada

| # | Control | Situación real | Evidencia |
|---|---|---|---|
| 1 | **Interruptor** | ~30 `<Switch>` nativos con **4 envoltorios escritos a mano**, ninguno compartido | `alquiler.tsx:327` `SwitchRow` · `work.tsx:237` `ToggleRow` · `status.tsx:166` `PrefRow` · `rental/PriceCalculator.tsx:153` `ToggleRow`. `trackColor` inconsistente |
| 2 | **Casilla** | **Única implementación real**, 28 líneas, redonda 21×21 | `lifebook-carrito.tsx:42-69` y `:632` |
| 3 | **Opción única** | 15 usos a mano en **un solo fichero**, en 3 estilos | `ecomerse-seller.tsx:814,898` (`radio`) junto a `:717,915,950` (`checkbox`) · `edit-profile.tsx:66-70` |
| 4 | **Segmentado** | **No existe.** `StepHeader.tsx:36-54` es una barra de progreso, no un control | — |
| 5 | **Desplegable** | **No componible.** Siempre es «abrir `Sheet` o navegar» | Único con `expanded` correcto: `MasOpciones.tsx:57` |
| 6 | **Estrellas** | **4 implementaciones** distintas | selector `ecomerse-orders.tsx:517-524` · lectura `conductor.tsx:1401-1402` · texto `ecomerse-detail.tsx:142` · `ecomerse-favorites.tsx:223` |
| 7 | **Código de dígitos** | **YA CUBIERTO** por `OtpInput.tsx` (`length` ya parametrizable, `:25`) | solo 2 consumidores; `auth.tsx` usa `FormField` en su lugar |
| 8 | **Mantener pulsado** | 3 `onLongPress` sueltos, con **dos retardos distintos** | `lifebook-ai.tsx:403` (300) · `lifebook-carrito.tsx:477` (450) · `ServiceGrid.tsx:101` (450) |
| 9 | **Deslizar para confirmar** | **No existe** como componente | lo que hay es deslizar-para-cerrar (`SelectorDeVariante.tsx:233`) y deslizar-para-borrar (`lifebook-carrito.tsx:464`) |
| 10 | **Botón con mecha** | Prototipo completo **dentro de `app/`**, marcado temporal | `banco-1-pastilla.tsx:2,42-43,67-100` — y la guarda **ya cuenta** su fontSize y sus borderRadius |
| 11 | **Corazón** | No hay componente; el corazón de la barra **no anima** | `PostCard.tsx:223`, `CommentsSheet.tsx:189`. El gigante del doble toque es estático 650 ms |
| 12 | **Aviso** | **YA EXISTE `Aviso.tsx`** (158 consumidores) y le falta el gesto | `Aviso.tsx:19-26,28,33,49,73` |
| 13 | **Barra de sugerencia** | **No existe** | `buscar.tsx`, `lifebook-search.tsx`, `SearchHeader.tsx` |
| 14 | **Píldora de voz** | **No existe componente**, pero **la funcionalidad sí**, entera, en una pantalla | `lifebook-ai.tsx:20,168-184,192-214` |
| 15 | **Balatro (fondo)** | No hay nada equivalente | — |

### 2.2 Tokens disponibles (literales)

`packages/ui-kit/src/theme/escalas.ts`: `tipografia` (micro 11 · caption 12 · body 14 · subtitle 16 ·
title 20 · display 28), `peso` (normal/medio/fuerte/titulo), `espaciado` (xs 4 · sm 8 · md 12 · lg 16 ·
xl 24 · xxl 32), `radios` (sm 8 · md 12 · lg 16 · full 999).

`colors.ts`: `brand` con 21 claves (incluidas las variantes `*Pressed`, que **no usa nadie**), más
`lightColors`/`darkColors` con 8 claves de superficie, `elevation`/`elevationDark` (3 niveles) y
`alpha()`.

### 2.3 Tokens que FALTAN (y los valores a mano que ya hay por ahí)

| Familia | Valores escritos a mano hoy |
|---|---|
| **Duración** | 180 · **420** · **520** · 600 · 650 · 1900 · 2600 · 3200 |
| **Curva** | `Easing.bezier(0.33,1,0.68,1)` **duplicada literal** en `banco-1-pastilla.tsx:43` y `banco-2-ramas.tsx:60` |
| **Opacidad de estado** | 0.4 · 0.45 · 0.5 · 0.6 · 0.7 · 0.85 · 0.9 · 0.92 · **0.98** — **nueve valores para el mismo gesto de pulsar** |
| **Grosor de trazo** | hairline · 1 · 1.5 · 2 · 3 (y como prop: 1.8 · 2 · 2.2 · 3) |
| **Altura táctil** | 21 · 24 · 28 · 36 · 44 · 46 · 50 · 52 · 54 |
| **Tamaño de icono** | 18 valores distintos entre 9 y 92 |
| **Umbral de gesto** | deslizar 70 y 6 · mantener pulsado 300 y 450 |

**Sobre duraciones:** la base de la skill pide **≤200 ms para cambios de estado** (Rauno Freiberg) y
**<300 ms** para micro-interacciones (Emil Kowalski). Mis dos prototipos van a **420 y 520 ms**. La
salida correcta no es bajar todo a 200: es **separar dos familias** en el token, para que nadie
aplique 420 ms a un interruptor:

- `duracion.estado` → ≤200 ms (pulsar, marcar, cambiar de pestaña).
- `duracion.escenificado` → 300-500 ms (un relleno, un dibujado por etapas: lo que sí se mira).

---

## 3. Tabla de encaje — las 15, una por una

| Componente | Dónde encaja | Elemento exacto | Veredicto |
|---|---|---|---|
| **rubber-segment** | `ecomerse-orders.tsx:249-258` (Compras/Ventas) y `:264-289` (filtros); `ecomerse.tsx:302-327` (Ordenar por) · `ecomerse-favorites.tsx:118-125` | `s.segBtn` / `s.filtroChip` (`height: 36`, `:577`), ya con `role="tab"`/`"radio"` | **El mejor de los 15.** El efecto ya está escrito, medido y en el APK; solo falta mudarlo y borrar el banco |
| **pulse-heart** | `PostCard.tsx:215-225` + overlay `:229-233` · `lifebook-videos.tsx:906-911,1168` · `CommentsSheet.tsx:183-193` · `lifebook-post/[id].tsx:936` · `lifebook-ai.tsx:451` | el `<Heart size={15}>` del pie, el de 16 del comentario, el gigante de 76 | **1 componente → 5 pantallas**, y hoy el temporizador de 650 ms está **duplicado** (`PostCard.tsx:71` y `lifebook-videos.tsx:910`) |
| **peek-rating** | `taxi.tsx:1845-1856` · `food-orders.tsx:757-761` · `ecomerse-orders.tsx:520-521` · `lifebook-hotel-perfil.tsx:249-259` | cada `<Star>` (34/32/34) y las píldoras del hotel | **4 flujos de dinero y reputación** con el mismo control. Ya llevan `accessibilityState` (`food-orders.tsx:760`) |
| **code-slots** | **NO crear**: `OtpInput.tsx:49-70` (celdas 46×54) | las 6 celdas; hoy solo cambia el borde | Pero: `PinSheet.tsx:96`, `lifebook-order/[id].tsx:381`, `taxi.tsx:1928`, `conductor.tsx:1631` usan `letterSpacing` sobre un `TextInput` plano. **El código de 4 dígitos es lo que transfiere el dinero en efectivo** y no da ninguna confirmación |
| **voice-pill** | `lifebook-ai.tsx:638-648` (píldora 44×44, `:733`) | la píldora del micrófono; hoy solo cambia de color a rojo | **Arregla un problema real de confianza**: un micro encendido sin señal visual. + **un micrófono muerto** en `SearchHeader.tsx:76` (28×28, **sin `onPress`**) |
| **hold-button** | `lifebook-videos.tsx:973-980` · `ServiceGrid.tsx:100-104` · `lifebook-carrito.tsx:477` · `lifebook-chat/[id].tsx:1608` | las 4 pulsaciones largas **que ya existen** | No falta un botón: falta que **se vean**. Un anillo de progreso convierte un gesto secreto en descubrible |
| **glide-select** | `Sheet.tsx:47-87` y sus llamantes: `ecomerse-seller.tsx:1055` (24 ciudades), `food-owner.tsx:788`, `ecomerse.tsx:484`, `lifebook-explore.tsx:301` | las filas dentro del `Sheet` | Coste bajo (una hoja → muchas pantallas). Aporta solo si la hoja deja de ser un `map` sin entrada propia |
| **spring-check** | `lifebook-carrito.tsx:41-68` | la casilla redonda 21×21 y el `<Check>` que aparece sin transición | Un solo componente local → fácil. Es la pantalla donde se comprueba **qué se va a pagar** |
| **jelly-radio** | `ecomerse-checkout.tsx:328,338,349` (+ `food-checkout.tsx:493`, `lifebook-carrito-checkout.tsx:439`) | las 3 `methodCard`; hoy el borde cambia **instantáneo** | Elección única **sobre dinero**. Tres opciones repetidas en tres pantallas |
| **squish-switch** | `alquiler.tsx:332-339` y `settings.tsx:142,209,220` | el pulgar del `<Switch>` nativo | **El más caro de los 15.** `Switch` es nativo, no se puede animar desde JS. **Y el riel OFF no se ve (1.17:1).** No tocar sin meter antes un interruptor propio en el kit |
| **prompt-bar** | `lifebook-ai.tsx:568-579` y `lifebook-videos.tsx:1319-1331` | los chips de `SUGERENCIAS.map` y «Búsquedas relacionadas» | Aquí **la animación ES la semántica**: una entrada escalonada lee como sugerencia; un `map` estático lee como botones |
| **swipe-toast** | `Aviso.tsx:28-55` — **solo 1 pantalla lo usa** (`billing-status.tsx:383`) | el `Animated.View` del toast | **Ampliar `Aviso`**, no duplicarlo (158 consumidores). Y solo vale la pena **si el toast gana una acción** (Deshacer / Ver) |
| **slide-commit** | `conductor.tsx:1431-1448` y `:1664-1691` (oferta y «Terminar viaje y cobrar») · `intercity.tsx:344` · `taxi.tsx:1778` | los dos botones gigantes | **Sí, pero no donde parecía.** Ver §4.2 |
| **fuse-button** | — | — | **NO PORTAR.** Una mecha es una espera impuesta sin información, y no tiene equivalente no visual (un lector anuncia «botón», no «mecha ardiendo») |
| **balatro** | **NO en `app/index.tsx`** | — | Ver §4.3. Candidatos: `auth.tsx:136-137` o `SocialHomeHeader.tsx:36-44` |

**Resumen:** 12 tienen sitio natural, 2 tienen sitio pero flojo (`swipe-toast` sin acción,
`glide-select` sin entrada propia) y **1 no debe portarse** (`fuse-button`).

---

## 4. Los cuatro avisos que importan

### 4.1 El fondo Balatro en la home: ahí no se ve

`app/index.tsx` es un **mapa a pantalla completa** (`MapBackground`, `:187-199`) con una hoja de
cristal encima (`:265-286`, `BlurView intensity={36}`) y el dock (`:246`). Un fondo animado ahí:

- **no se vería** (está tapado por el mapa), y
- **competiría por fotogramas** con el WebView del mapa en gama media.

Y si algún día se viera, el texto encima dejaría de tener contraste estable — y el contraste **variable
por animación no es verificable**. La base de la skill lo marca como anti-patrón: *«glass effects that
make text unreadable»*.

**Dónde sí tiene sentido:** `auth.tsx:136-137` (hoy un `KeyboardAvoidingView` plano con
`colors.background`: **la pantalla sin marca de toda la app**) o el banner de
`SocialHomeHeader.tsx:36-44` (25 % de la pantalla, hoy `ImageBackground`).

### 4.2 `slide-commit` no cabe donde parecía

Dos razones, ambas ya documentadas en el propio repo:

1. **En el borde inferior, Android se queda los deslizamientos** (gesto de ir a inicio). Tu propio
   código lo dice: `lifebook-videos.tsx:1146` — *«ahí abajo el sistema se queda los deslizamientos»*.
2. **En el borde izquierdo compite con el swipe-back** del sistema (`platform-conventions.md:101`).

Y además incumple **WCAG 2.5.7** (toda operación de arrastre necesita alternativa de un solo puntero):
un `Gesture.Pan` **es inoperable con TalkBack/VoiceOver**. Si deslizar fuera la única forma de
confirmar un pago, **quien usa lector de pantalla no podría pagar**.

**Sitio válido: la oferta del conductor** (`conductor.tsx:1431`), que es centro de pantalla, no
scrollea (hay un mapa) y ya tiene una cuenta atrás que presiona el toque (`:1374`, «⏱ N s para
aceptar»). Ahí un gesto deliberado **protege** una decisión económica irreversible — pero **siempre
con un botón equivalente al lado**.

### 4.3 Los gestos que ya chocan con el scroll: hay 4 conflictos resueltos y con las reglas escritas

- `lifebook-videos.tsx:961-972` — por qué `Gesture.Race` y `activateAfterLongPress(280)`: *«un
  deslizamiento normal tampoco lo activa —el dedo se mueve antes de los 280 ms—»*.
- `SelectorDeVariante.tsx:233-236` — el arrastre solo se activa en el tirador y exige `|dy| > |dx|`.
- `AsistenteDeTalla.tsx:86` — *«mientras se desliza una ruleta, el scroll del panel se apaga»*.
- `lifebook.tsx:586-591` — el Pan horizontal de cambio de canal convive con el scroll del feed.

**Cualquier gesto nuevo entra en este campo minado.** La regla de la casa: el arrastre se activa
**después** de un umbral, y solo en el asa.

### 4.4 Lo que NO hay que portar

- **`fuse-button`** (ver §3): coste alto, beneficio negativo.
- **`balatro` en la home** (ver §4.1).
- **Todo lo que en React Bits se dispara con `hover`**: en táctil no existe. Ya lo decidimos una vez en
  `banco-1-pastilla.tsx:11-13`: *«en un móvil no hay ratón, así que el disparador es ELEGIR»*.
- **Coreografías con `layout`/`entering`/`exiting`** mientras `_layout.tsx:129-135` desactive la
  transición en 5 pantallas (`animation: 'none'`). Primero la transición, después el adorno.

---

## 5. Requisitos de accesibilidad (lo que hay que cumplir sí o sí)

| Efecto | Exige | Cómo se cumple aquí |
|---|---|---|
| Interruptor con rebote | 1.4.11 (3:1) · 4.1.2 · 2.5.8 | `role="switch"` + `state.checked` (patrón ya en `alquiler.tsx:336`). **El riel OFF necesita ≥3:1 propio**: `colors.border` no vale |
| Casilla con muelle | 2.5.8 · 4.1.2 | `role="checkbox"` + `checked` (patrón ya en `lifebook-carrito.tsx:55`) |
| Mantener pulsado | 2.5.7 · 2.5.1 | `onLongPress` **no se anuncia solo**: hace falta `onPress` equivalente y el progreso también en texto |
| Deslizar para confirmar | **2.5.7 (AA, nueva en 2.2)** | **Obligatorio un botón equivalente.** Precedente válido: `ZoomableImage.tsx:88` (botones) junto al pellizco de `:165` |
| Corazón que late | 4.1.2 · 1.4.1 | El latido **se suma** al relleno y al contador, no los sustituye. Ya se hace bien en `PostCard.tsx:220` |
| Avisos | 4.1.3 · 2.2.2 | `accessibilityLiveRegion` **solo funciona en Android**; en iOS hay que llamar `anunciar()`. Y la región debe **existir antes** del cambio (hoy `Aviso.tsx:41` la monta ya poblada) |
| Fondo animado | 1.4.3 · 1.4.11 · 2.2.2 | Garantizar el *scrim* (patrón ya existente: `lifebook-videos.tsx:1158-1161`) |
| **Todos** | 2.3.3 | Un único punto que lea `AccessibilityInfo.isReduceMotionEnabled()` + `reduceMotionChanged` |

### 5.1 Comportamiento con movimiento reducido

**Regla: solo el fondo decorativo puede APAGARSE. Los demás degradan a su estado final**, porque hoy
no hay ningún canal alternativo que comunique el cambio (solo 126 `accessibilityState` y 2 anuncios
activos en todo el repo).

| Efecto | Normal | Con movimiento reducido |
|---|---|---|
| Interruptor / casilla / radio / segmentado | Muelle con sobreimpulso | **Salto al estado final** (≤150 ms). Color y `accessibilityState` intactos |
| Mantener pulsado | Anillo animado | **El anillo NO se quita** (es información): progreso por pasos + anuncio de texto |
| Deslizar para confirmar | Recorrido animado | El recorrido salta, **el gesto no desaparece**, y el botón alternativo sigue |
| Corazón | Latido + relleno + contador | **Latido fuera**; quedan relleno (3.76:1 ✅) y contador |
| Aviso deslizable | Entra/sale deslizándose | Fundido corto (180 ms, ya existe en `Aviso.tsx:33`) |
| Fondo Balatro | Movimiento continuo | **Se apaga del todo** (es el único puramente decorativo) |
| **Radares ya existentes** (`taxi.tsx:156-167`, `conductor.tsx:201-205`) | Bucles infinitos 1.9 s y 3.2 s | **Deben parar** — y además ganar control de pausa: **hoy incumplen WCAG 2.2.2** (contenido en movimiento >5 s sin pausa). No es trabajo nuevo: es deuda ya existente |

---

## 6. Defectos que ya están en el código (y que estos efectos van a tocar)

| Defecto | Evidencia | Gravedad |
|---|---|---|
| **Riel OFF a 1.17:1** | `colors.border` en `alquiler.tsx:335` y `food-orders.tsx:761` | Alta: es el control que se quiere animar |
| **Bucles infinitos sin pausa** | `taxi.tsx:156-167` · `conductor.tsx:201-205` | Alta: WCAG 2.2.2 |
| **Estrellas con zonas de toque solapadas** | `food-orders.tsx:756-763`: `Star 32`, `gap 6`, `hitSlop 4` → 40×40 y los hitSlop **se pisan** | Alta: el toque es ambiguo |
| **Micrófono muerto en el buscador principal** | `SearchHeader.tsx:76` (28×28, `onPress` inexistente; el padre navega a `/buscar`) | Alta: falso affordance |
| **Toques por debajo de 44** | `lifebook-carrito.tsx:632` (21) · `SearchHeader.tsx:111` (28) · `CommentsSheet.tsx:187` (28) | Media |
| **Animación en `width`** (no GPU) | `conductor.tsx:1376`, con `useNativeDriver: false` en `:348` | Media: jank en la pantalla más cargada |
| **Tres rojos distintos para el mismo corazón** | `alquiler-detalle.tsx:431` (`danger`) · `ecomerse.tsx:218` (`textPrimary`) · `ecomerse-detail.tsx:453` (`like`) | Media |
| **`alpha()` reimplementada en local** y una llamada sin importar | `SearchHeader.tsx:84-91` y `:72` | Media |
| **`DocumentChoiceTree` exportado con 0 consumidores** | `index.ts:45` | Baja |
| **Fichero temporal que la guarda ya cuenta** | `banco-1-pastilla.tsx` en `.diseno-baseline.json` | Baja, pero hay que decidir: rescatar o borrar |

---

## 7. Decisions pendientes (del dueño, no mías)

1. **Alcance.** 15 efectos son ~2.551 líneas de CSS reescritas. Por valor ÷ esfuerzo, el orden es:
   `rubber-segment` → `pulse-heart` → `peek-rating` → `code-slots` → `voice-pill` → … y el más caro
   con diferencia es `squish-switch`.
2. **Dónde vive el código:** `packages/ui-kit/src/micro/` (recomendado: la guarda no lo escanea, el
   barril existe, y el `README.md:21-25` del kit dice que los equipos de producto no deben crear sus
   propios inputs) **o** `components/micro/` (lo que pide el encargo, pero cada número crudo hace
   fallar `npm run diseno`).
3. **Duraciones:** ¿los prototipos bajan a la banda de estado (≤200 ms) o se quedan en 420/520 como
   «escenificado»? Propuesta: dos familias de token, no un número único.
4. **Balatro:** ¿en `auth.tsx`, en el banner de `SocialHomeHeader`, o se descarta?
5. **El micrófono muerto de `SearchHeader`:** ¿se cablea con la píldora de voz (dictar el destino) o se
   quita?
6. **`fuse-button`:** ¿aceptas no portarlo?
7. **`Aviso`:** ampliarlo con gesto de descarte y acción (recomendado) o duplicarlo.
8. **`banco-1-pastilla.tsx`:** rescatar el efecto al kit y borrar el banco, o borrar sin más.
9. **Adopción:** ¿los componentes nuevos **sustituyen** los 4 envoltorios de interruptor, las 4
   variantes de estrellas y los 3 micrófonos? Si no, el inventario crece y la deuda de diseño
   (190 hex · 753 fontSize · 709 borderRadius) no baja. **`haptico` y `anunciar` llevan 0 usos: ese es
   el futuro de estos 15 si no se fuerza la sustitución.**

---

## 8. Plan de ejecución propuesto (a confirmar)

### Fase 0 — terreno (sin efectos todavía)
1. `packages/ui-kit/src/theme/movimiento.ts`: `duracion` (dos familias), `curva`, `opacidad`, `umbral`,
   `resorte`.
2. `useMovimientoReducido()` en el kit: `AccessibilityInfo.isReduceMotionEnabled()` +
   `reduceMotionChanged`. **Es el requisito que D-15 lleva pidiendo desde el 17/09.**
3. Ampliar `escalas.ts` con `trazo`, `altura`, `icono` (geometría que hoy está a mano).
4. Ampliar `peerDependencies` de `packages/ui-kit/package.json` con Reanimated, gesture-handler y
   expo-haptics (hoy no están declarados y el kit no compilaría fuera de esta app).

### Fase 1 — los que más arreglan con menos código
`rubber-segment` (mudar lo ya escrito y borrar el banco) · `pulse-heart` (1 → 5 pantallas) ·
`peek-rating` (1 → 4 flujos de dinero).

### Fase 2 — los que arreglan un problema real
`code-slots` (confirmación del cobro en efectivo, sin componente nuevo: extender `OtpInput`) ·
`voice-pill` + decidir el micrófono muerto · `hold-button` (hacer visible lo que ya existe).

### Fase 3 — los que dependen de arreglar antes otra cosa
`squish-switch` (exige resolver el riel a 1.17:1 y unificar 4 envoltorios) · `slide-commit` (exige
botón equivalente por 2.5.7) · `spring-check`, `jelly-radio`, `glide-select`, `prompt-bar`,
`swipe-toast` (solo si el toast gana acción).

### Fase 4 — decorativo
Balatro donde se decida.

**En toda fase:** `npm run diseno` tiene que quedar **igual o mejor**. Si un componente nuevo hace
subir el contador, es que tiene números a mano.

---

## 9. Lo que no se ha podido comprobar

- **No he visto ningún efecto en el móvil.** Las duraciones y las sensaciones están medidas en código,
  no observadas. El juicio final es del dueño.
- **Los contrastes son cálculo** sobre los valores de `colors.ts`, no medición en pantalla.
- **No se ha medido el coste real** de ninguna animación en Android de gama media. Los avisos de
  rendimiento de §4 se apoyan en precedentes del repo (`lifebook-videos.tsx:885-893`, que quitó una
  animación por batería), no en una medición propia.
- **Los conteos ≥250** (532 `accessibilityRole`, 278 `hitSlop`) son el total que reporta la búsqueda;
  el detalle listado es muestra, no inventario completo.
- **No se ha verificado si `expo-speech-recognition` expone amplitud de voz** para el anillo de la
  píldora. Si no la expone, la alternativa honesta es respirar al ritmo de la transcripción parcial,
  **no un medidor falso**.
