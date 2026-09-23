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
