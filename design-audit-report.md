# Auditoría de diseño — EG Route Plan (app móvil)

**Alcance:** `D:\egapp` — 103 rutas de pantalla (114 archivos `.tsx` en `app/`), 74 componentes (`components/`, 20 en raíz + 54 en `lifebook`/`rental`/`status`), **188 archivos analizados**.
**Método:** auditoría **basada en fuente** (conteo y lectura de código), sin ejecución en dispositivo y **sin capturas de pantalla**.
**Fecha:** sesión del 17/09/2026.
**Puntuación global: 4,4 / 10** (promedio simple de las 12 dimensiones; ponderando por criticidad del dinero —accesibilidad, flujos y rendimiento— baja a ~4,1). **60 hallazgos**, con un bloque de 15 defectos funcionales que hay que reparar antes que nada —**los dos primeros (ruta del monedero y final del KYC) ya están arreglados y verificados con `tsc`**.

---

## 0. Límites de esta auditoría (leer antes que nada)

Lo que **no** está verificado y por tanto no se afirma:

- **No hubo observación en pantalla.** No vi la app corriendo: ningún juicio sobre "se ve bien / se ve mal" está respaldado por imagen. Todo lo visual se deduce de valores en código.
- **No hubo medición de contraste real** en dispositivo (sol directo, brillo bajo) ni de fluidez real (FPS, memoria).
- **Las 9 auditorías especializadas por subagente fallaron** (color, tipografía, layout, accesibilidad, componentes, interacción, psicología, estilo visual/plataforma, flujos/rendimiento): los subagentes no devolvieron cierre en este entorno. Este informe es de **analista único**; la cobertura por dimensión es la que se declara en cada sección, y es menor de lo que sería con especialistas.
- **Las herramientas MCP `uiux_*` del skill no están disponibles** en esta instalación. Trabajé contra la base de conocimiento del skill leída directamente (`principles`, `anti-patterns`, `laws-of-ux`, `accessibility-guide`, `typography-theory`, `color-theory`, `component-patterns`, `trends-2026`, `advanced-polish`).
- Los números son **exactos** (conteos sobre el árbol de archivos actual); lo **interpretativo** es la puntuación.

### 0.1 Segundo despacho de especialistas y errata de medición

- **Segundo intento multiagente (con mitigación).** Se relanzaron 4 analistas —color, accesibilidad, rendimiento, flujos+psicología— con una regla nueva frente al fallo anterior: **cada uno debe escribir su informe en `D:\egapp\.design-audit\<tema>.md` antes de cerrar**, de modo que su trabajo sobreviva aunque el mensaje final no llegue. Los informes por especialista se conservan ahí y se citan desde este documento.
- **Errata: dos cifras de mi primer pase estaban mal.** Quedan corregidas en todo el informe:
  - **Controles pulsables: 1.163 `<Pressable>`** en `app/` + `components/` (**1.172** contando los 9 del kit), no 2.293. No hay ni un solo `TouchableOpacity` ni `<Button>` en la app, así que ese es el total real. Con **885** `accessibilityLabel`, la cobertura de nombre llega hasta el **76 %** en el mejor caso (y menos en la práctica, porque parte de esas etiquetas están en elementos no pulsables). Por eso **la dimensión de accesibilidad sube de 3 a 4**; lo que no mejora es lo demás: **137** estados accesibles (12 % de los pulsables), **3** `android_ripple`, **0** escalado de fuente, **0** respeto de "reducir movimiento".
  - **Componentes: 74 en total**, correcto (20 en la raíz + 54 en subcarpetas). Pantallas: **114 archivos `.tsx`** en `app/` = 103 rutas + 11 auxiliares/layouts.
- **Lo que la nueva medición añade** (y empeora el diagnóstico de componentes): **51 archivos** definen su propio `<Modal` y solo hay **1** hoja inferior estándar; **156 de 1.163** pulsables (13 %) dan feedback visual al pulsar; **3 primitivas del kit están sin usar** (`PinPad` y `DocumentChoiceTree` en 0 archivos, `OtpInput` y `LivenessChallengeView` en 1); 11 pantallas superan 700 líneas (máximo 2.071).
- **Cifras re-medidas en este segundo pase** (las del primer pase iban cortas o largas según el filtro; manda esta columna). Ámbito: `app/` + `components/` recursivo = 188 archivos.

| Métrica | Primer pase | **Medición corregida** |
|---|---|---|
| Archivos analizados | 177 | **188** |
| Literales de color | 661 en 112 archivos / 105 colores | **1.127 en 140 de 193 archivos / 113 colores** (806 fuera de paleta) |
| `useTheme()` | 276 usos / 167 archivos | **288 usos / 178 archivos** |
| `Alert.alert` | 354 en 67 archivos | **411 en 71 archivos** |
| `hitSlop` | 313 casos / 129 archivos | **328 casos / 134 archivos** |
| Marcas busy/disabled | "1.120" | **257 `disabled=` en 97 archivos** + ~533 marcas de carga |
| Indicadores de carga | 314 usos | **111 archivos** con `ActivityIndicator` |
| `KeyboardAvoidingView` | 24 archivos | **27 archivos** |
| Estados vacíos (`length === 0`) | 68 archivos | **71 archivos** (52 de ellos pantallas) |
| Animación / hápticos | 8 / 1 archivos | **8 / 1 archivos** (confirmado) |
| `.map(` en render | 543 | **602** |
| `ScrollView` vs `FlatList` | 431 / 90 | **167 / 58** |
| `ActivityIndicator` | 314 usos | **220** |
| Temporizadores | 53 en 26 archivos | **52 en 29 archivos** (esta sí cuadraba) |
| Hápticos | "1 archivo" | **0 reales**: `expo-haptics` **no está instalado** y el único archivo que lo menciona (`lifebook-videos.tsx:84,897`) lo dice en un comentario — *«no vibra: expo-haptics no está instalado»* |
| Escalado de fuente | "el texto no respeta el tamaño del sistema" | **FALSO**: `allowFontScaling` es **`true` por defecto** en RN (verificado en `Libraries/Text/Text.js:255`) y la app no lo desactiva en ningún sitio. Lo que falta es **tope** (`maxFontSizeMultiplier`), no permiso (ver D-01 corregido) |

---

## 1. Perfil de diseño del proyecto

| Aspecto | Estado observado |
|---|---|
| Arquitectura visual | `@egrouteplan/ui-kit` con tokens semánticos (`src/theme/colors.ts`): `primary #0084FF`, `secondary #FF7D00`, `success #27AE60`, `danger #F53F3F`, + 8 tokens neutros. Comentario del archivo: *"Semántica estricta… Modo oscuro sin negro puro (#17171A). WCAG AA para sol directo y nocturno."* |
| Adopción del tema | Alta en apariencia: `useTheme()` en **288 usos / 178 archivos** |
| Adopción real de tokens | Baja: **1.127 literales hex** en **140 de 193 archivos**, **113 colores distintos**; solo **321 (28,5 %)** son token oficial → **806 (71,5 %) fuera de paleta**. El literal más repetido es `#fff` (**387 usos, 89 archivos**) y **no es token** |
| Sistema tipográfico | Inexistente como escala: **37 `fontSize` distintos en 2.801 usos**; cuerpo real de la app entre **11 y 13 px** |
| Ritmo espacial | Sin rejilla: **46 valores de espaciado distintos**, solo **47 % múltiplos de 4** |
| Radios | **42 valores de `borderRadius` distintos** |
| Modo oscuro | Declarado en `colors.ts` y `ThemeContext.tsx`, pero referenciado en **solo 8 archivos** → prácticamente inerte |
| Accesibilidad | **885** etiquetas (hasta 76 % de los 1.163 pulsables) y **569** roles, pero solo **137** estados (12 %) y **3** `android_ripple`; **0** `allowFontScaling`; **0** manejo de "reducir movimiento" |
| Interacción | **411 `Alert.alert` en 71 archivos**; animación en 8 archivos; hápticos en **1 archivo**; solo **156 de 1.163** pulsables (13 %) dan feedback al pulsar |
| Sistema de componentes | 74 componentes, pero **51 archivos** definen su propio `<Modal` y solo existe **1** hoja inferior estándar; **14 de los 20** componentes de raíz se usan en ≤ 2 pantallas; **`PinPad` y `DocumentChoiceTree` sin usar** (`OtpInput` y `LivenessChallengeView`, 1 archivo cada uno) |
| Pantallas monolíticas | 11 pantallas pasan de 700 líneas: `conductor.tsx` 2.071, `taxi.tsx` 2.068, `edit-profile.tsx` 1.562, `lifebook.tsx` 1.467; media 453 |
| Profundidad y forma | **11** `shadowOpacity` y **12** `elevation` distintos en **16 archivos** con sombra escrita a mano; 42 radios |
| Listas | **602 `.map(` en render**; **167 `ScrollView` vs 58 `FlatList`**; y el feed principal anula la virtualización con un ítem sintético |
| Imágenes | **122 `<Image>` de RN vs 44 `expo-image`**; `LazyImage` (usado por alquiler, hoteles e intercity) es `Image` de RN sin caché ni `contentFit`; cero blurhash |
| Sondeo | **52 temporizadores en 29 archivos**, y **0 apariciones de `AppState`** en código propio |
| Imagen de marca | Tres identidades conviviendo (transporte azul, Life Book naranja `#FF6B35`, comida `#FF7D00`) |

**Diagnóstico de una línea:** el sistema de diseño **existe y está bien pensado**, pero el producto **lo ignora en la práctica**. No falta diseño: falta **disciplina de tokens**. Es el hallazgo raíz del que cuelgan la mitad de los demás.

---

## 2. Tarjeta de puntuación — 12 dimensiones

| # | Dimensión | Nota | Razón principal (evidencia) |
|---|---|---|---|
| 1 | **Color** | **4 / 10** | **806 de 1.127 ocurrencias (71,5 %) fuera de la paleta de 18 tokens**; **51 hex distintos para 5 significados** (11 verdes de éxito, 9 rojos, 16 ámbares, 10 azules); `#fff`×387 como literal más usado y sin token; rojo de emergencia usado de adorno en `conductor.tsx:1705`, nueve líneas antes del botón SOS real. *(El especialista de color puntúa 5/10; mantengo 4/10 por el uso del rojo de emergencia y la deriva de estados.)* |
| 2 | **Tipografía** | **4 / 10** | 37 tamaños; cuerpo a 11–13 px con tamaños fraccionarios (12.5×317, 11.5×284); **sin peso regular** (500–900) → jerarquía aplanada; texto que no respeta el tamaño de fuente del sistema |
| 3 | **Layout y espaciado** | **5 / 10** | 46 espaciados (53 % fuera de la rejilla de 4), 42 radios; 11 de 103 pantallas sin `useSafeAreaInsets` (incluye `auth`, `conductor-hub`, `driver-onboarding`, `driver-profile`, `landlord-profile`, `my-tickets`, `reserva`, `work-planes`, `work-publish`) |
| 4 | **Sistema de componentes** | **4 / 10** | Hay 9 primitivas reales y buenas, pero **`PinPad` y `DocumentChoiceTree` no se usan en ningún archivo**, `OtpInput` y `LivenessChallengeView` en uno solo, y el PIN de la app se resuelve con `components/PinSheet.tsx` (6 pantallas) **fuera del kit** → dos implementaciones de lo mismo. A la vez, **51 archivos** escriben su propio `<Modal` sin patrón común y **14 de los 20** componentes de raíz se usan en ≤ 2 pantallas |
| 5 | **Accesibilidad** | **4 / 10** | Los nombres están razonablemente cubiertos (**885** etiquetas para **1.163** pulsables, hasta 76 %), pero falta todo lo demás: **137** estados accesibles (12 %), **3** `android_ripple`, **sin tope de escalado** (no «sin escalado»: ver errata de D-01), **0** respeto de "reducir movimiento", **328** `hitSlop`. *(La Fase 1 ya añadió el anuncio de error y el foco modal del PIN.)* |
| 6 | **Interacción y feedback** | **4 / 10** | El error se comunica como **modal bloqueante** (`Alert.alert`) en **411 casos dentro de 71 archivos**; la carga sí existe (`ActivityIndicator` en 111 archivos) pero animación solo en 8 archivos y hápticos en 1; **257 `disabled=` en 97 archivos** → doble pulsación en pagos contenida, aunque solo el 13 % de los botones responde visualmente al toque |
| 7 | **Psicología y jerarquía** | **5 / 10** | Menú de servicios con **18 destinos** en una sola lista (Ley de Hick); checkouts con 12 puntos de decisión cada uno; precios y comisiones **sí** se muestran antes de confirmar (bueno: transparencia) |
| 8 | **Estilo visual e identidad** | **4 / 10** | Tres sub-marcas con naranjas distintos que se leen como apps diferentes; 42 radios y superficies planas → falta una gramática visual única |
| 9 | **Convenciones de plataforma** | **5 / 10** | Insets y `KeyboardAvoidingView` (27 archivos) en general bien; pero `<Image>` de RN (122) en vez de `expo-image`, sin hápticos nativos, sin modo oscuro efectivo, `hitSlop` solo en 328 casos (134 archivos) |
| 10 | **Flujos UX** | **4 / 10** | Entradas rotas y callejones verificados: el «Monedero» de la portada apunta a una ruta inexistente (D-31), el KYC no tiene puerta de entrada y termina en esa misma ruta (D-32/D-33), el alta se corta antes de crear la contraseña (D-34), 61 pantallas pierden el destino al autenticarse (D-38). *(El especialista puntúa 5/10; bajo a 4/10 por estos defectos.)* |
| 11 | **Rendimiento percibido** | **4 / 10** | Siete listas de dinero sin virtualizar ni paginar (D-04); el feed principal anula la virtualización con un ítem sintético (D-55); 52 temporizadores y **0 `AppState`** (D-13); el sondeo del KYC nunca se detiene (D-54); miniaturas a tamaño completo (D-12) |
| 12 | **Contenido y microcopy** | **6 / 10** | El mejor eje; pero códigos técnicos al usuario (D-42), textos de manual (D-44) y dos contadores que mienten (D-45) |

**Nota global: 4,4 / 10** — "base sólida, ejecución inconsistente, con defectos funcionales que hay que reparar antes de tocar el diseño". El techo es alto: los tokens correctos ya existen y los patrones buenos también (el equipo los usa en comercio, no en dinero).

---

## 3. Hallazgos principales (ordenados por impacto)

### Ranking de impacto (30 hallazgos emitidos)

| # | ID | Hallazgo | Dimensión | Severidad |
|---|---|---|---|---|
| 1 | D-01 | El texto **escala sin tope** (mi diagnóstico inicial, «no escala», era falso) | Accesibilidad | Media |
| 2 | D-30 | El contraste del propio kit no alcanza AA para texto normal | A11y/Color | Alta |
| 3 | D-05 | 71,5 % del color vive fuera de la paleta (806 de 1.127) | Color | Alta |
| 4 | D-06 | 37 tamaños de letra, 46 espaciados, 42 radios | Tipografía/Layout | Alta |
| 5 | D-04 | Listas largas sin virtualizar (543 `.map` en render) | Rendimiento | Alta |
| 6 | D-03 | El error se comunica con modal bloqueante (411 alertas) | Interacción | Alta |
| 7 | D-28 | El rojo de emergencia se usa de adorno, incluso junto al botón SOS | Color/Seguridad | Alta |
| 8 | D-19 | El kit construye primitivas que luego nadie adopta (el PIN tiene 2 implementaciones) | Componentes | Alta |
| 9 | D-26 | Al kit le faltan los tokens a los que migrar (bloquea el plan) | Color/Sistema | Alta |
| 10 | D-20 | 51 archivos con su propio `<Modal`: no hay patrón de diálogo | Componentes | Media-Alta |
| 11 | D-02 | Nombres accesibles sí (hasta 76 %), estados y tamaños táctiles no (12 %) | Accesibilidad | Media-Alta |
| 12 | D-25 | 51 colores para 5 significados: paletas paralelas completas | Color | Media-Alta |
| 13 | D-07 | Sin peso regular: todo es semibold o más | Tipografía | Media-Alta |
| 14 | D-08 | Tres identidades visuales en una sola app | Estilo visual | Media-Alta |
| 15 | D-27 | El naranja hace de acción principal contra la regla del kit | Color | Media-Alta |
| 16 | D-29 | El mismo estado (`refunded`) con dos colores en el mismo flujo | Color | Media |
| 17 | D-22 | 11 pantallas monolíticas (hasta 2.071 líneas) | Componentes | Media |
| 18 | D-10 | Menú de 18 destinos y checkouts de 12 decisiones | Psicología/Flujos | Media |
| 19 | D-21 | Solo el 13 % de los botones responde visualmente al pulsar | Interacción | Media |
| 20 | D-11 | 11 pantallas sin área segura (incluida `auth`) | Layout | Media |
| 21 | D-13 | 53 temporizadores de sondeo en 26 archivos | Rendimiento/Batería | Media |
| 22 | D-12 | 122 `<Image>` de RN frente a 44 `expo-image` | Rendimiento | Media |
| 23 | D-09 | Modo oscuro declarado pero inerte | Plataforma | Media |
| 24 | D-24 | El blanco se escribe de dos formas y una no es token (515 usos) | Color | Media-Baja |
| 25 | D-23 | Sombras y elevación a la deriva (11 y 12 valores distintos) | Estilo/Layout | Media-Baja |
| 26 | D-16 | Errores técnicos en crudo al usuario | Contenido | Media-Baja |
| 27 | D-14 | Animación casi ausente y hápticos olvidados | Interacción | Media-Baja |
| 28 | D-15 | "Reducir movimiento" no se respeta | Accesibilidad | Media-Baja |
| 29 | D-17 | Estados vacíos reconstruidos caso por caso (71 archivos) | Componentes | Media-Baja |
| 30 | D-18 | Nombre interno del proyecto en el SMS de verificación | Contenido/Marca | Baja |

> Se emitieron **30** hallazgos: 18 del primer pase, 5 de la medición de sistema de componentes (D-19 a D-23) y **7 del especialista de color** (D-24 a D-30). Todo lo que no alcanzó el umbral de evidencia está en la sección 8, no inflado como hallazgo.

### Bloque F — defectos funcionales verificados · PRIORIDAD ABSOLUTA (antes que cualquier trabajo de diseño)

Estos no son hallazgos de diseño: son **cosas rotas** que el especialista de flujos encontró leyendo el código y que **verifiqué yo mismo** con `grep` y `Test-Path`. Van por delante de todo el plan porque ninguna mejora visual compensa que un botón no lleve a ninguna parte. **60 hallazgos en total** (30 de diseño, 15 de este bloque, 8 de accesibilidad del bloque G, 2 de rendimiento y 5 del lado oferta en el bloque H). **D-31 y D-32 ya están arreglados y verificados.**

| ID | Defecto | Evidencia (verificada) | Impacto en el usuario | Arreglo | Esf. |
|---|---|---|---|---|---|
| **D-31** | **El «Monedero» de la portada apunta a una ruta que no existe** | `constants/data.ts:33` → `route: '/wallet'`; `app/wallet.tsx` **no existe** (`Test-Path` = False); `constants/rutas.ts:131` valida `/wallet` como si existiera; `_layout.tsx:128` registra la pantalla inexistente. Y **`/monedero` no está en el mapa de rutas** (`rutas.ts` no lo menciona) | Tocar «Monedero» muestra «No pudimos abrir esa pantalla» **con la ruta interna en crudo** (`ruta-fallida.tsx:44`). El monedero funciona, pero **no se llega a él desde la portada** | Apuntar `data.ts:33` a `/monedero`, añadir la entrada al mapa de `rutas.ts`, quitar el `Stack.Screen name="wallet"` | Bajo |
| **D-32** | **El KYC termina en esa misma ruta fantasma** | `kyc/index.tsx:104` y `kyc/status.tsx:85` → `router.replace('/wallet')` | Tras 4 pasos de verificación (documentos, selfie, prueba de vida) el usuario acaba en una pantalla de error, justo después de leer «¡Identidad verificada!» | Cambiar las dos llamadas a `/monedero` | Bajo |
| **D-33** | **El flujo KYC no tiene puerta de entrada** | 0 navegaciones a `/kyc` en código activo (verificado); solo `kyc/*` se llama entre sí. Y el dinero lo exige: `monedero-recargar.tsx:75-80` y `monedero-retirar.tsx:80-85` detectan `KYC_REQUIRED` y **pintan texto sin botón**. Peor: los CTA «Verificar identidad» llevan al alta de **conductor** (`ecomerse-seller.tsx:143,283`, `food-owner.tsx:459`, `food-rider.tsx:286` → `/driver-onboarding`) | El usuario no puede verificar su identidad ni desde el monedero ni desde donde se le pide, y si lo intenta acaba rellenando una licencia de conducir | Botón «Verificar mi identidad» en los avisos de KYC del monedero + entrada en Ajustes/Perfil, apuntando al KYC real | Medio |
| **D-34** | **El alta de cuenta se corta sola y deja cuentas sin contraseña** | `auth.tsx:37` `if (isAuthenticated) router.replace('/')` dentro de un efecto; `:89-90` llama `sessionLogin(...)` **y después** `setMode('password')` → el efecto ya redirigió. La pantalla «Crea tu contraseña» (`:199-211`) queda inutilizada | El usuario cree tener cuenta con contraseña y no la tiene; y **no existe «he olvidado mi contraseña»** (0 coincidencias de *olvid* en `app/`) | Separar «sesión para el alta» de «sesión completa»: no redirigir hasta que la contraseña esté creada (o marcar la cuenta como pendiente) | Medio |
| **D-35** | **«Reservar Coche» muestra como precio un número inventado** | `reserva.tsx:52` `estimate = (km) => 2000 + 200*km`; `:94-95` `setRouteKm(...)` **a partir de la longitud del texto** escrito (`(t.length % 4) * 2 + (dest.length % 3)`); se rotula «Precio estimado por algoritmo» (`:346`) bajo un icono «Seguro» (`:182`) y va en el botón de confirmar (`:421`) | El precio no depende de la ruta: dos destinos distintos dan la misma cifra y uno más lejano puede dar menos. Es lo más grave para la confianza: **el usuario decide pagar con una cifra sin fundamento** | Etiquetar como «sin calcular» y pedir presupuesto al conductor, o calcular distancia real | Medio |
| **D-36** | **El carrito de Life Book ofrece monedero y no puede cobrarlo** | `lifebook-carrito-checkout.tsx:223` llama `commerceOrdersApi.create({...})` **sin el tercer argumento** `paymentToken`, mientras `api/commerce.ts:658-668` documenta que **con pago por monedero el servidor exige `X-Payment-Token`** y el método se ofrece en `:231` (`paymentMethod: pago[clave]`, de los métodos activos). Además anuncia «Pago exitoso» (`:267`) antes de que la tienda confirme | Si el comprador elige «Monedero» en el carrito, el pedido **no se puede pagar**: la app ofrece un método que falla (o, peor, se cobra sin garantía si el servidor no lo bloquea) | Reutilizar el flujo de PIN + token que ya existe en `lifebook-checkout.tsx` y no anunciar éxito hasta que el servidor confirme | Medio |
| **D-37** | **Reembolsos enviados a un soporte que no existe** | `billing-status.tsx:137,145` y `kyc/status.tsx:101` dicen «contacta soporte para el reembolso»; en Ajustes, Ayuda/FAQ/Contactar soporte responden «Próximamente» (`settings.tsx:252-254`) | El usuario con un reembolso pendiente se queda sin canal: la app le manda a ningún sitio | Canal único real (teléfono/WhatsApp de soporte) o retirar la promesa | Bajo |
| **D-38** | **61 pantallas protegidas pierden el destino al autenticarse** | `AuthGate.tsx:19-23` hace `router.replace('/auth')` sin conservar la ruta pedida; al volver, `auth.tsx:37` manda a la Home | El usuario toca algo, le piden cuenta, entra… y aparece en la Home: tiene que recordar y repetir el camino | Guardar la ruta pedida y volver a ella tras entrar | Medio |
| **D-39** | **La emergencia exige tener cuenta** | `emergencia.tsx:27-32` está envuelta en `<AuthGate>` | Sin cuenta, tocar emergencia lleva a «Términos de uso» antes de poder llamar. *(Mitigado: el modal de la portada sí es público — `index.tsx:259` —, pero la pantalla de emergencia es inalcanzable.)* | Sacar la pantalla de emergencia del `AuthGate` | Bajo |
| **D-40** | **La comisión de retirada se enseña después de decidir, y el agente de efectivo no es localizable** | `monedero-retirar.tsx:116-120` muestra la tarifa solo en la pantalla del OTP; `monedero-recargar.tsx:158-159` y `monedero-retirar.tsx:164-165` muestran «{nombre} · {código} · {zona}» **sin teléfono, dirección ni horario** | El usuario decide retirar sin saber cuánto le cuesta, y debe entregar o recibir efectivo de alguien a quien no puede llamar ni encontrar | Mostrar comisión y neto **antes** de confirmar; añadir teléfono/ubicación del agente | Bajo |
| **D-41** | **Carga cognitiva fuera de escala en publicar y en el taxi** | **19 opciones** de presupuesto en `taxi.tsx:771-774`; **41 chips** en `lifebook-compose.tsx:273-356`; **37** en `StepDetails.tsx:65-125`; **33** en `StepShop.tsx:99-140`; ~22 decisiones en la portada (`ServiceGrid.tsx:37-191` + dock + flotantes) | Con 19 precios seguidos, en la calle, el usuario no elige: abandona o pulsa al azar. Con 41 chips, publicar un producto se siente como rellenar un formulario administrativo | 5–6 presupuestos con uno destacado y «otro importe»; partir los wizards en 3 pasos con progreso y guardar borrador | Medio |
| **D-42** | **Códigos técnicos en pantalla** | `driver-profile.tsx:102` → «Estado: **approved**»; `monedero.tsx:62` deja caer el estado crudo; `ruta-fallida.tsx:44` → «Destino: /wallet»; y errores nativos propagados desde `api/httpClient.ts:150` («Error de red (ENOTFOUND): Network request failed») que las pantallas pintan tal cual (`monedero.tsx:92`, `taxi.tsx:871`, …) | Inglés del backend, rutas internas y códigos del sistema operativo llegan al usuario: parece una app a medio hacer justo cuando algo ha fallado | Un archivo de traducción estado→frase y un mensaje de red en lenguaje humano | Bajo |
| **D-43** | **El escáner es un stub confeso, a 2 toques de la portada** | `components/MapTools.tsx:55-62` → `scanner.tsx:27-30`: «(Implementación con expo-camera + OCR en la siguiente iteración.)» | El usuario entra, lee una nota de desarrollo y sale | Ocultar la entrada hasta que exista | Bajo |
| **D-44** | **Microcopy de manual y controles que se explican en vez de rediseñarse** | «Toca el nivel activo otra vez para quitarlo» (`food-owner.tsx:689`); «Toca el mapa» (`work-publish.tsx:467`); «anuncio(s)» (`alquiler-publicar.tsx:193`); «Código ISO de 2 letras (p. ej. GQ)» (`kyc/index.tsx:162`); fechas a escribir como `AAAA-MM-DD` (`kyc/index.tsx:149`, `edit-profile.tsx:256`) | El texto hace de muleta de un control poco claro, y se pide al usuario escribir fechas como las escribe un programador | Selector de fecha, estados claros y textos que expliquen el porqué, no el cómo | Medio |
| **D-45** | **La app miente en dos contadores** | `conductor-hub.tsx:110` escribe a mano «**0 de 5 completados**» y `:115` pinta siempre el círculo vacío (un conductor con el alta enviada sigue viendo 0 de 5); `lifebook-carrito-checkout.tsx:267` anuncia «Pago exitoso» antes de que la tienda confirme | Progreso falso en el alta del conductor y confirmación de pago prematura: dos mentiras pequeñas que cuestan credibilidad | Calcular el progreso real y mover «Pago exitoso» a cuando el servidor confirma | Bajo |

**✅ ARREGLADO (17/09/2026) — D-31 y D-32.** Con luz verde del dueño se corrigieron **los cinco puntos de entrada rotos**: `constants/data.ts:33` → `/monedero`; `constants/rutas.ts` — se sustituyó la entrada fantasma `wallet` por `monedero: { ruta: '/monedero' }`; `app/_layout.tsx` — se eliminó el `Stack.Screen name="wallet"` de una pantalla inexistente; `app/kyc/index.tsx:104` y `app/kyc/status.tsx:85` → `/monedero`; y `core/useAppDock.ts:43`, donde **el dock también navegaba a `/wallet` por el guardián de rutas** (punto que no estaba en el informe del especialista y apareció al buscar todas las referencias). Verificado: **0 referencias** a la ruta fantasma, `npx tsc --noEmit` **sin errores** y —hallazgo colateral— los **tipos de ruta generados por Expo estaban obsoletos desde el 9 de octubre** (listaban `/wallet` y no conocían las pantallas del monedero, por lo que estas navegaban con `as any`); regenerados con Expo, ya conocen las 20 rutas `monedero*` y se pudieron **quitar los 4 casts `as any`**. **Pendiente: reconstruir el APK** para verlo en pantalla.

**Lo que este bloque NO afirma:** el defecto del alta (D-34) está **deducido** del orden de los efectos de React, no ejecutado; y en D-36 la reacción exacta del servidor ante un pedido sin token requiere prueba en dispositivo. Todo lo demás está verificado por lectura y conteo.

### Bloque G — accesibilidad de la entrada y del PIN (informe `a11y.md`, verificado por mí)

El especialista de accesibilidad cerró con 653 líneas y **confirma la corrección de mis cifras**: los 2.293 pulsables eran doble conteo (suma de etiquetas de apertura + cierre); son **1.172**. Confirma también etiquetas (823), roles (573), estados (136), `hitSlop` (325) y los 0 de escalado de fuente. **Puntúa 4/10** y falla **8 criterios WCAG de nivel A/AA**, con lo peor concentrado donde más duele:

| ID | Defecto | Evidencia | Impacto | Arreglo |
|---|---|---|---|---|
| **D-46** | **El campo del PIN no tiene nombre accesible** | `components/PinSheet.tsx:64-78`: el `TextInput` del PIN no lleva `accessibilityLabel`; su única pista es el `placeholder` «••••••» | Con lector de pantalla, el usuario oye un campo vacío sin saber que ahí va su PIN: **no puede pagar** | `accessibilityLabel="PIN de 6 dígitos"` + `accessibilityHint` |
| **D-47** | **Los errores de PIN no se anuncian** | `PinSheet.tsx:79-81` pinta el error en un `<Text>` sin `accessibilityLiveRegion` (y con el hex crudo `#F53F3F`, coherente con D-05) | «PIN incorrecto» o «PIN bloqueado» **nunca llegan** al usuario ciego: reintenta a ciegas hasta bloquearse | `accessibilityLiveRegion="assertive"` en el error |
| **D-48** | **En iOS no se anuncia nada en toda la app** | `announceForAccessibility` = **0 casos** en código de producto (verificado); los 8 anuncios del proyecto usan solo el equivalente de Android | Todos los avisos dinámicos (saldo, pedido, error) son invisibles para VoiceOver en el iPhone | Envoltorio en el kit que use el anuncio según plataforma |
| **D-49** | **Los dos campos de PIN de la creación son indistinguibles** | `monedero-pin.tsx:87` y `:99` | El usuario no sabe cuál es «nuevo» y cuál «repetir» | Etiquetas distintas y explícitas |
| **D-50** | **El agente de efectivo seleccionado no se comunica** | `monedero-recargar.tsx:144`, `monedero-retirar.tsx:150`: sin `accessibilityState` | El usuario elige agente y no recibe confirmación; no sabe si su elección cuenta | `accessibilityState={{ selected }}` |
| **D-51** | **Botones de cantidad de 28×28 sin zona táctil ampliada** | `ecomerse-checkout.tsx:480` (estilo 28×28) frente a los botones «Volver» del mismo archivo, que sí llevan `hitSlop={12}` | Añadir o quitar unidades es un ejercicio de puntería, justo antes de pagar | `hitSlop={12}` + 44 pt reales |
| **D-52** | **Formularios sin ayuda y sin error anunciable** | 135 `TextInput`, de los que solo 36 tienen etiqueta y **0 tienen `hint`**; 222 `ActivityIndicator` y **0 con nombre**; 134 imágenes y **131 sin nada** (y 0 con `accessible={false}`) | El usuario ciego rellena a ciegas y no sabe si la pantalla está cargando; el lector lee ruido de imágenes decorativas | Etiqueta + ayuda + estado en los campos, y nombre o exclusión en cargas e imágenes |
| **D-53** | **Sin jerarquía anunciable** | **1 solo** `accessibilityRole="header"` en toda la app | El lector no puede saltar por secciones: cada pantalla es una lista plana de 60 elementos | Rol de cabecera en títulos de pantalla y secciones |

**Los 10 arreglos urgentes del especialista suman 4–8 h y llevarían la accesibilidad de 4 a ~7.**

### Bloque H — lado oferta (segunda entrega del especialista de flujos)

El mismo especialista amplió su informe con el lado oferta (conductor, repartidor, restaurante, hotel, agente de caja). Cinco hallazgos nuevos, todos con evidencia `archivo:línea`:

| ID | Hallazgo | Evidencia | Impacto | Esf. |
|---|---|---|---|---|
| **D-56** | **Cámara denegada en el escáner del agente = el dinero no se libera** | `agente-escaner.tsx:37,49-51,92-99`: el permiso se explica bien («Para leer el código hace falta la cámara», `:96`) pero **no hay entrada manual del código** | El agente de caja no puede cerrar la entrega y **el pago queda retenido**: un permiso denegado bloquea una operación de dinero sin ninguna alternativa | Añadir tecleo manual del código (4 dígitos) |
| **D-57** | **El conductor navega en simulación sin que nadie se lo diga** | `locate.ts:44-59` vs `:66-68`: la ubicación **nunca se pide** al conductor (solo al pasajero), y `conductor.tsx:791-804` navega a **45 km/h simulados** | El conductor cree estar en ruta real; si actúa sobre esa información, es un riesgo físico, no estético | Aviso visible de «modo simulación» o pedir ubicación real |
| **D-58** | **El agente y el hotel no ven su comisión ni su neto** | `api/agent.ts` sin esos campos; `api/hotel.ts` y `lifebook-hotel-panel.tsx:355-384` tampoco | Quien trabaja para la plataforma no puede comprobar cuánto gana: la transparencia de precio que existe en el lado del cliente **no existe en el lado del negocio** | Añadir comisión y neto a los dos paneles |
| **D-59** | **El neto del conductor lleva un 10 % incrustado como respaldo** | `conductor.tsx:33,845-850`, con «≈» solo cuando el cálculo no es exacto (`:1437`) | Si el cálculo real falla, el conductor cobra según una cifra inventada del 10 % **sin que se note** | Hacer explícito el fallback o impedir aceptar sin cifra real |
| **D-60** | **El alta de conductor se queda en blanco, y el panel del agente no distingue el rol** | `driver-onboarding.tsx:92-93,382` (sin reintento si falla la carga); `agente.tsx:145` («Sin trabajo pendiente» no distingue «no eres agente» de «no hay tareas») | Un formulario vacío sin salida en el alta, y un usuario que no sabe si el problema es su rol o la falta de trabajo | Botón de reintento y mensaje de rol |

**También del lado oferta, y hay que conservarlo:** el repartidor tiene contabilidad con ganado/pendiente/deuda (`food-rider.tsx:297-326`), el conductor ve «ganas X XAF» **dentro del propio botón de aceptar** (`conductor.tsx:1437,1448`), el panel del hotel separa señal cobrada y por cobrar, y `food-rider.tsx:202` sí da salida cuando falta un permiso.

**Tres detalles más de la segunda entrega:**

- **Solo un flujo de toda la app muestra progreso:** `lifebook-sell.tsx:256-261`. Los demás wizards largos (publicar trabajo, alquiler, producto, viaje) no indican en qué paso está el usuario ni cuántos quedan.
- **Ninguna publicación guarda borrador**, y `work-publish.tsx:106` lo admite en un comentario mientras `:362` **deja el botón activo con la cuota agotada**: el usuario rellena el formulario entero para descubrir al final que no puede publicar.
- **El interurbano pide ~13 campos** incluyendo **DNI y domicilio** sin explicar para qué (`intercity.tsx:288-336`): datos personales sensibles pedidos sin finalidad declarada.

**Verificación cruzada:** el especialista comprobó con un script **39 citas `archivo:línea`** de su informe y **todas resultaron correctas**; los conteos de 114 pantallas, 74 componentes, 71 archivos con `length === 0` y 61 con `AuthGate` quedan confirmados. Sus dos puntuaciones: **flujos 5/10 · psicología 6/10**.

### Bloque A — dinero y confianza del usuario (prioridad máxima)

**D-01 · El texto escala sin tope · ACCESIBILIDAD · Media (corregido: mi diagnóstico inicial era falso)**
- **ERRATA IMPORTANTE.** Escribí que «el texto no respeta el tamaño de fuente del sistema». **Es falso.** En React Native, `allowFontScaling` **viene activado por defecto** — lo verifiqué en el código del RN instalado: `node_modules/react-native/Libraries/Text/Text.js:255` → `allowFontScaling: allowFontScaling !== false`. El texto **sí** crece con el ajuste del sistema, y la app **no lo desactiva en ningún sitio** (0 apariciones de `allowFontScaling={false}`). La ausencia de la prop en el código no era un defecto: era el valor por defecto funcionando.
- **Lo que sí es cierto:** no hay `maxFontSizeMultiplier` en ninguna parte, así que el texto **crece sin límite**. A tamaños de sistema muy grandes (×2 o más), un cuerpo de 11–13 px pasa a 22–26 px y las filas de altura fija, las pestañas y los botones con `height` fijo pueden recortarse o solaparse.
- **Lo que sigue siendo un problema real, aparte del escalado:** el cuerpo base de 11–13 px es pequeño para todos los usuarios, con o sin ajustes.
- **Ley:** Accesibilidad (WCAG 1.4.4), redimensionar texto.
- **Arreglo (replanteado):** subir el cuerpo de las pantallas de dinero (12→14) y **probar en dispositivo a tamaño de fuente máximo**; donde algo se rompa, poner `maxFontSizeMultiplier` (1,3–1,5) en vez de dejar crecimiento libre. **Requiere tu prueba en pantalla.**
- **Esfuerzo:** bajo (1 día). **Alcance:** transversal, empezando por monedero, checkouts y PIN.

**D-02 · Nombres accesibles sí, estados y tamaños táctiles no · ACCESIBILIDAD · Media-Alta**
- **Evidencia:** **885** `accessibilityLabel` para **1.163** `<Pressable>` (hasta 76 % de cobertura de nombre) y **569** roles, pero solo **137** `accessibilityState` (**12 %**) y **3** `android_ripple` en toda la app; `hitSlop` en **328** casos. *(Corrige la cifra del primer pase, que decía 36 % de etiquetas.)*
- **Impacto:** el lector de pantalla sí dirá "Pagar" en la mayoría de los casos —eso está bien—, pero **no dirá si un método de pago está seleccionado** ni si un botón está deshabilitado, que es donde el usuario ciego toma la decisión. Y los controles pequeños (iconos de cerrar, contadores de cantidad, casillas) no amplían su zona táctil.
- **Ley:** WCAG 4.1.2 (nombre, rol, valor), 2.5.5 (tamaño del objetivo), Ley de Fitts.
- **Arreglo mínimo:** declarar `accessibilityState` en los toggles de decisión (método de pago, zona de entrega, propina, cantidad) y `hitSlop` en los controles menores de 44 pt de las pantallas de dinero.
- **Esfuerzo:** medio (2–4 días). **Alcance:** monedero, checkouts, agente, perfil.

**D-03 · El error se comunica con modal bloqueante · INTERACCIÓN · Alta**
- **Evidencia:** **411** `Alert.alert` repartidos en **71 archivos** (cifra re-medida; el primer pase dijo 354 en 67).
- **Impacto:** cada fallo (saldo, red, PIN, límite) detiene la app y exige un toque extra para volver; en flujos de dinero el usuario pierde el contexto de lo que estaba haciendo.
- **Ley:** Ley de Doherty (feedback < 400 ms sin romper el flujo), Ley de Jakob.
- **Arreglo mínimo:** patrón único `inline-error` + `toast` en el kit; sustituir los `Alert` de las pantallas de dinero y dejar alert solo para confirmaciones destructivas.
- **Esfuerzo:** medio (4–6 días). **Alcance:** transversal, por lotes de 10 archivos.

**D-04 · Siete listas de dinero sin virtualizar ni paginar · RENDIMIENTO · Alta**
- **Evidencia (corregida por el especialista de rendimiento):** **602** `.map(` en render y **167 `ScrollView` frente a 58 `FlatList`** *(mi primer pase dijo 543 y 431/90: la proporción real es 2,9:1, no 4,8:1)*. Las siete listas sin paginación de servidor ni virtualización, todas de crecimiento ilimitado: historial de viajes (`trips-history.tsx:83`, `api/taxi.ts:94` sin `limit`), tickets (`my-tickets.tsx:70`), pedidos del mercado (`ecomerse-orders.tsx:197`), **movimientos del monedero** (`monedero-movimientos.tsx:117`), viajes intercity con reservas anidadas (`intercity-publish.tsx:370-391`, 3 `.map` anidados), publicaciones del vendedor y viajes disponibles. Las peores no tienen ni una imagen: su coste es 100 % hilo de JavaScript.
- **Impacto:** el historial de movimientos del monedero es una de ellas: al crecer, la pantalla que el usuario abre para comprobar que su dinero está donde debe se atasca. En pagos, la lentitud se lee como inseguridad.
- **Ley:** Doherty, rendimiento percibido.
- **Arreglo mínimo:** paginar por servidor y virtualizar esas siete (empezando por movimientos del monedero y pedidos).
- **Esfuerzo:** medio (3–5 días).

**D-55 · El feed principal tiene la virtualización estructuralmente anulada · RENDIMIENTO · Media**
- **Evidencia:** `lifebook.tsx:943-945` es una `FlatList` con **un solo ítem sintético** (`data={[{ left, right }]}`), de modo que **nunca puede reciclar filas** y cada página se acumula dentro. Mismo truco en `lifebook-search.tsx:396` y `lifebook-explore.tsx:254`.
- **Impacto:** parece optimizado y no lo está: la pantalla más visitada de la app crece sin límite en memoria. Es el tipo de defecto que no se ve hasta que un móvil modesto lleva diez minutos navegando.
- **Arreglo mínimo:** `numColumns={2}` en la `FlatList` (o `FlashList`) en lugar del par sintético.
- **Esfuerzo:** bajo-medio (1–2 días). **Alcance:** 3 archivos.

### Bloque B — coherencia visual (la raíz es la misma)

**D-05 · 71,5 % del color vive fuera de la paleta · COLOR · Alta**
- **Evidencia (re-medida por el especialista de color, ver `D:\egapp\.design-audit\color.md`):** **1.127** literales hex en **140 de 193** archivos, **113 valores distintos**; **806 (71,5 %) no son token**, repartidos en **95 bases únicas**. Reparto: `app/` 879 (640 fuera), `components/` 218 (165), `kit/` 30 (**solo 1 fuera**). Los más repetidos: `#fff`×387, `#ffffff`×128, `#ff6b35`×53, `#ff7d00`×45, `#10b981`×35, `#f53f3f`×30, `#27ae60`×29, `#0084ff`×28, `#ff2442`×27. *(Corrige mi primer pase, que dijo 661 literales y 105 colores.)*
- **Impacto:** el kit define una paleta correcta y luego el producto la ignora en tres de cada cuatro colores. El daño concreto: el mismo significado cambia de color según la pantalla (ver D-25 y D-29), y el rojo que el kit reserva a emergencias acaba decorando avisos (D-28).
- **Ley:** Estética-Usabilidad, Von Restorff (nada destaca si todo destaca).
- **Arreglo mínimo:** **primero crear los tokens que faltan** (D-26), luego sustituir por tokens los más repetidos y **prohibir hex fuera del kit** con una regla de lint.
- **Esfuerzo:** bajo-medio (2–3 días) + guardia permanente. Empezar por el blanco: 515 ocurrencias, cambio mecánico y sin riesgo visual.

**D-06 · 37 tamaños de letra, 46 espaciados, 42 radios · TIPOGRAFÍA/LAYOUT · Alta**
- **Evidencia:** ver §1. Tamaños fraccionarios (12.5, 11.5) indican ajuste a ojo pantalla por pantalla; 47 % de espaciados fuera de múltiplos de 4.
- **Impacto:** ninguna pantalla se parece exactamente a otra; el salto entre pantallas se percibe como "app hecha por partes". Además impide reutilizar componentes: cada ajuste se rehace.
- **Ley:** Ley de la Proximidad, consistencia (Jakob), 8-point grid.
- **Arreglo mínimo:** publicar **una sola escala**: tipo (12/14/16/20/28), espacio (4/8/12/16/24/32), radio (8/12/16/999) en el kit; codemod o barrido guiado.
- **Esfuerzo:** medio (4–5 días). **Alcance:** transversal.

**D-07 · Sin peso regular: todo es semibold o más · TIPOGRAFÍA · Media-Alta**
- **Evidencia:** solo 5 pesos en uso (500/600/700/800/900), ninguno 400.
- **Impacto:** si todo está en negrita, nada es importante: el precio, la comisión y una etiqueta secundaria compiten igual. Es la causa principal de la "falta de jerarquía" que se percibe.
- **Ley:** Von Restorff, jerarquía visual.
- **Arreglo mínimo:** introducir 400 como texto base y reservar 700+ para cifras y títulos.
- **Esfuerzo:** bajo (1 día) si se hace junto con D-06.

**D-08 · Tres identidades en una app · ESTILO VISUAL · Media-Alta**
- **Evidencia:** azul `#0084FF` (transporte/acción) + naranja Life Book `#FF6B35` + naranja comida `#FF7D00`, más verdes y rojos duplicados.
- **Impacto:** el usuario no reconoce "una" app de confianza; la marca se diluye justo donde debe transmitir solidez (dinero).
- **Ley:** Ley de Jakob, coherencia de marca.
- **Arreglo mínimo:** decidir **un** naranja de servicio y un **único** rol para el color; el sub-mundo (Life Book, comida) se distingue con etiqueta e iconografía, no con otro color base.
- **Esfuerzo:** bajo en decisión, medio en ejecución (parte de D-05).

**D-09 · Modo oscuro declarado pero inerte · PLATAFORMA · Media**
- **Evidencia:** `dark` presente en `colors.ts` y `ThemeContext.tsx`, pero referencias en solo 8 archivos.
- **Impacto:** o no existe (y hay código muerto) o existe a medias (y produce pantallas rotas). Ambas cosas erosionan la confianza; en uso nocturno, el blanco pleno deslumbra.
- **Arreglo mínimo:** decidir: completarlo con tokens en las 15 pantallas principales **o** retirarlo y dejar el tema claro único.
- **Esfuerzo:** bajo (decisión) / medio (ejecución).

**D-10 · Menú de 18 destinos y checkouts de 12 decisiones · PSICOLOGÍA/FLUJOS · Media**
- **Evidencia:** `components/ServicesDrawer.tsx` con 18 filas con `route`; `food-checkout.tsx` y `ecomerse-checkout.tsx` con 12 `Pressable` de decisión cada uno (554/625/482 líneas).
- **Impacto:** sobrecarga de elección antes de llegar a lo que el usuario quiere; en el checkout, cada decisión añadida reduce la conversión y aumenta el abandono a medio pagar.
- **Ley:** Ley de Hick, Ley de Miller (7±2), Tesler (la complejidad irreducible se coloca donde menos duele).
- **Arreglo mínimo:** agrupar el menú en 3 bloques con los 4 servicios más usados arriba y "ver todos"; en checkout, plegar lo accesorio (nota, cupón, hora) tras un "más opciones".
- **Esfuerzo:** bajo (1–2 días) para el menú; medio para checkout.

### Bloque C — acabado y plataforma

**D-11 · 13 pantallas sin área segura (la cifra real, no 11) · LAYOUT · Media**
- **Evidencia (corregida en la Fase 1):** ausencia de `useSafeAreaInsets` en `auth`, `conductor-hub`, `driver-onboarding`, `driver-profile`, `landlord-profile`, `my-tickets`, `reserva`, `work-planes`, `work-publish` **y, además, cuatro que la auditoría no detectó porque solo se escaneó el nivel raíz: `kyc/index`, `kyc/capture`, `kyc/liveness`, `kyc/status`**. Las de KYC llevaban **`paddingTop: 56` y `64` fijos** en vez de área segura.
- **Impacto:** contenido bajo la isla dinámica o la barra de gestos; en `auth` (primer contacto) el botón de acción podía quedar tapado, y en el KYC el contenido se descuadraba en móviles con isla.
- **Arreglo mínimo:** aplicarlo en `auth` y en las pantallas del conductor primero.
- **Esfuerzo:** bajo (medio día). **Riesgo:** nulo. — **✅ Ya aplicado en las 13.**

**D-12 · Imágenes sin caché, y las miniaturas descargan el archivo completo · RENDIMIENTO · Media**
- **Evidencia:** 122 `<Image>` de `react-native` frente a 44 `expo-image`; **`LazyImage` — que es justo lo que usan alquiler, hoteles e intercity — es `Image` de RN** (`LazyImage.tsx:12,102,111`), sin `contentFit`, sin `cachePolicy` y sin *placeholder*; **cero blurhash** en toda la app; `PhotoGallery.tsx:94-110` monta todas las fotos a ancho completo a la vez; y las miniaturas descargan el archivo completo, **documentado por el propio equipo** en el cliente de API.
- **Impacto:** cada visita a un catálogo vuelve a bajar las mismas fotos, y en datos móviles eso se paga en dinero y en espera. En una app cuyo público usa prepago, es un coste real para el usuario.
- **Arreglo mínimo:** migrar `LazyImage` a `expo-image` con `placeholder` y `contentFit` (un solo archivo arregla tres verticales) y virtualizar la galería.
- **Esfuerzo:** bajo-medio (2 días). **Requiere decisión tuya** si el redimensionado de miniaturas hay que hacerlo en el servidor.

**D-13 · Sondeo con temporizadores y sin saber si la app está en primer plano · RENDIMIENTO/BATERÍA · Media**
- **Evidencia (corregida):** **52 `setInterval`/`setTimeout` en 29 archivos** *(mi primer pase dijo 53 en 26; esta cifra sí cuadraba en orden de magnitud)*. Y **0 apariciones de `AppState`** en código propio: ningún sondeo sabe si la app está en segundo plano.
- **Impacto:** seguimiento de viaje y panel del agente refrescando en background → batería y datos; en zona con mala cobertura, más fallos visibles.
- **Arreglo mínimo:** bajar el tick más agresivo (250 ms), parar los temporizadores al perder foco y consultar `AppState`.
- **Esfuerzo:** bajo-medio (2 días). **Requiere validación en dispositivo.**
- **Contraste positivo (del especialista):** `intercity-publish.tsx:131-138`, `lifebook-videos.tsx:815-819` y `useUnreadChat.ts:58-70` son temporizadores **modelo**, y `food.tsx` / `food-orders.tsx` / `ecomerse.tsx` son `FlatList` paginadas con esqueletos. El equipo conoce los patrones correctos: los aplica en comercio y no en dinero.

**D-54 · El sondeo del KYC nunca se detiene · RENDIMIENTO/BATERÍA · Media-Alta**
- **Evidencia:** `kyc/status.tsx:14,40` refresca cada **1.500 ms y no se detiene nunca**, ni cuando el KYC ya está aprobado. La variable `isTerminal` existe en `:64` y **solo se usa para pintar**, no para parar el temporizador.
- **Impacto:** una pantalla que la gente deja abierta esperando la verificación se queda sondeando indefinidamente: batería, datos y peticiones al servidor sin motivo. Es el peor de los 52 temporizadores y el arreglo es una línea.
- **Arreglo mínimo:** parar el intervalo cuando `isTerminal` sea verdadero (y al perder foco).
- **Esfuerzo:** muy bajo (media hora). **Este es el arreglo con mejor relación beneficio/riesgo del informe técnico.**

**D-14 · Animación casi ausente y hápticos olvidados · INTERACCIÓN · Media-Baja**
- **Evidencia:** animaciones en 8 archivos (36 usos); **0 hápticos reales** — `expo-haptics` **no está instalado** y el único archivo que lo menciona lo hace para decir que no está.
- **Impacto:** la app se siente "seca": confirmar un pago no da ninguna señal física ni transición; se pierde la sensación de solidez que en dinero es confianza.
- **Arreglo mínimo:** háptico en los 6 botones críticos (pagar, confirmar PIN, recargar, retirar, aceptar viaje, publicar) y transición de éxito propia en lugar del alert.
- **Esfuerzo:** bajo (1 día). **Requiere validación táctil por el dueño.**

**D-15 · Reducir movimiento no se respeta · ACCESIBILIDAD · Media-Baja**
- **Evidencia:** 0 referencias a `isReduceMotionEnabled` / `AccessibilityInfo`.
- **Impacto:** usuarios con sensibilidad al movimiento no pueden desactivar animaciones.
- **Arreglo mínimo:** envoltorio de animación en el kit que consulte la preferencia del sistema.
- **Esfuerzo:** bajo (medio día).

**D-16 · Errores técnicos en crudo al usuario · CONTENIDO · Media-Baja**
- **Evidencia:** varios `Alert` muestran el mensaje del servidor tal cual; hay códigos en mayúsculas que llegan a la capa de UI.
- **Impacto:** "DAILY_LIMIT_EXCEEDED" no le dice a nadie qué hacer; el error debe decir qué pasó y qué hacer ahora.
- **Arreglo mínimo:** mapa de códigos → frase humana + acción sugerida, en un solo archivo de copy.
- **Esfuerzo:** bajo-medio (2 días).

**D-17 · Estados vacíos caso por caso · COMPONENTES · Media-Baja**
- **Evidencia:** lógica `length === 0` en **71 archivos** (52 de ellos pantallas), cada uno con su propio texto y diseño.
- **Impacto:** inconsistencia de tono y de aspecto en el momento en que el usuario está más perdido.
- **Arreglo mínimo:** `EmptyState` en el kit (icono, título, explicación, CTA) y adoptarlo progresivamente.
- **Esfuerzo:** bajo (1–2 días).

**D-18 · Nombre del producto en la plantilla de SMS · CONTENIDO/MARCA · Baja (verificar)**
- **Evidencia:** la plantilla de OTP del servidor arrastra el nombre interno del proyecto en lugar del nombre visible de la app.
- **Impacto:** el usuario recibe un código de un nombre que no reconoce → huele a fraude justo en el paso de seguridad.
- **Arreglo mínimo:** alinear la plantilla con el nombre visible.
- **Esfuerzo:** bajo. **A verificar** leyendo la plantilla antes de cambiarla.

### Bloque D — sistema de diseño y mantenibilidad (el coste de no tener un patrón)

**D-19 · El kit construye primitivas que luego nadie adopta · COMPONENTES · Alta**
- **Evidencia:** `PinPad` aparece en **0** archivos y `DocumentChoiceTree` en **0**; `OtpInput` y `LivenessChallengeView` en **1** cada uno. En paralelo, el PIN se resuelve con `components/PinSheet.tsx`, usado por **6** pantallas, y los campos con `FormField` solo en 21 archivos frente a 1.163 pulsables escritos a mano.
- **Impacto:** dos consecuencias reales. Primera: **el PIN tiene dos implementaciones** (la del kit, sin usar, y la que corre) — en seguridad eso significa que un arreglo en una no llega a la otra, y que el bloqueo, el número de intentos y el mensaje de error pueden divergir entre pantallas. Segunda: se pagó el coste de construir primitivas difíciles (liveness, árbol documental) para abandonarlas.
- **Ley:** consistencia interna, Ley de Jakob.
- **Arreglo mínimo:** decidir por cada primitiva huérfana: **adoptarla** (migrar `PinSheet` a `PinPad` o al revés, y borrar la otra) o **retirarla** del kit. No dejarla en tierra de nadie.
- **Esfuerzo:** bajo en decisión, medio en ejecución (2–3 días). **Requiere tu visto bueno** porque toca el flujo del PIN del monedero.

**D-20 · 51 archivos escriben su propio `<Modal` · COMPONENTES · Media-Alta**
- **Evidencia:** 51 de 114 archivos de `app/` contienen un `<Modal` propio; existe **1** sola referencia a hoja inferior (`bottomSheet`) en todo el proyecto.
- **Impacto:** cada modal decide por su cuenta el fondo oscurecido, la posición, el botón de cierre, el cierre al tocar fuera y si el lector de pantalla lo anuncia. Eso explica por qué la accesibilidad de los diálogos es irregular: no hay un sitio único donde arreglarla.
- **Ley:** consistencia, Ley de Jakob.
- **Arreglo mínimo:** un componente `Sheet`/`Dialog` en el kit (con cierre accesible, foco atrapado y etiqueta anunciada) y migrar por lotes, empezando por los 12 modales de dinero.
- **Esfuerzo:** medio (4–6 días, por lotes).

**D-21 · Solo el 13 % de los botones responde visualmente al pulsar · INTERACCIÓN · Media**
- **Evidencia:** **156** de **1.163** `<Pressable>` usan estilo de pulsado (`({ pressed })`); `android_ripple` en **3** casos.
- **Impacto:** en una app táctil, pulsar y no ver nada durante 200 ms se interpreta como "no ha cogido el toque" → el usuario pulsa dos veces. En pagos eso es exactamente el gesto que queremos evitar (aunque la protección anti-doble-envío ya existe en lógica, la sensación de inseguridad permanece).
- **Ley:** feedback inmediato, Ley de Doherty; Nielsen #1 (visibilidad del estado).
- **Arreglo mínimo:** un `Pressable` propio en el kit con estado pulsado por defecto y migrar los botones de dinero.
- **Esfuerzo:** bajo-medio (2 días). **Riesgo:** bajo.

**D-22 · 11 pantallas monolíticas · COMPONENTES/MANTENIBILIDAD · Media**
- **Evidencia:** `conductor.tsx` 2.071 líneas, `taxi.tsx` 2.068, `edit-profile.tsx` 1.562, `lifebook.tsx` 1.467, `lifebook-videos.tsx` 1.404, `lifebook-user.tsx` 1.048, `profile.tsx` 979, `food-owner.tsx` 937, `food-orders.tsx` 822, `lifebook-ai.tsx` 735, `lifebook-group-create.tsx` 712. Media del proyecto: 453 líneas por pantalla.
- **Impacto:** en un archivo de 2.000 líneas, cualquier cambio visual es arriesgado: así es como una pantalla se desvía del sistema sin que nadie lo note. Es también la razón por la que los 42 radios y los 46 espaciados conviven: nadie ve el conjunto.
- **Ley:** mantenibilidad como condición de la consistencia.
- **Arreglo mínimo:** extraer de `conductor.tsx` y `taxi.tsx` sus bloques visuales repetidos a componentes con nombre (tarjeta de viaje, fila de datos, cabecera de mapa).
- **Esfuerzo:** alto (1–2 semanas por pantalla). **Alcance:** empezar por 2, no por 11.

**D-23 · Sombras y elevación sin sistema · ESTILO/LAYOUT · Media-Baja**
- **Evidencia:** **11** valores distintos de `shadowOpacity` y **12** de `elevation` en **16** archivos que escriben sombra a mano.
- **Impacto:** la profundidad es lo que dice qué flota sobre qué; sin escala, dos tarjetas del mismo nivel se ven distintas y la interfaz pierde la sensación de orden.
- **Arreglo mínimo:** 3 niveles de elevación en el kit (`card`, `raised`, `overlay`) y sustituir las sombras manuales.
- **Esfuerzo:** bajo (1 día).

### Bloque E — añadido por el especialista de color (informe `color.md`)

**D-24 · El blanco se escribe de dos formas y una de ellas no es token · COLOR · Media-Baja (arreglo mecánico)**
- **Evidencia:** `#fff` aparece **387 veces en 89 archivos** y **no es token**; `#ffffff` aparece **128 veces** y sí lo es. Son **515 ocurrencias del mismo blanco**. Igual con `#000`×26, sin token.
- **Impacto:** no cambia cómo se ve hoy, pero hace que el inventario sea ilegible: cualquier migración futura tiene que perseguir dos formas del mismo valor. Es la deuda más barata de pagar de todo el informe.
- **Ley:** consistencia interna.
- **Arreglo mínimo:** normalizar `#fff`→`#FFFFFF`, `#000`→`colors.shadow` (**413 ocurrencias, cero riesgo visual**) y añadir el token que falta.
- **Esfuerzo:** bajo (medio día). **Riesgo:** nulo.

**D-25 · Paletas paralelas completas: 51 colores para 5 significados · COLOR · Media-Alta**
- **Evidencia:** por cada significado hay una familia entera de hex: **11 verdes** de éxito (104 usos), **9 rojos** de error (110 usos), **16 ámbares** de aviso (75 usos), **10 azules** de información (56 usos), **5 violetas/magentas** sin rol en el kit. El kit declara **un** token por significado → **el 77 % de los colores semánticos son invenciones locales**. Cuatro de los ámbares (`#F6B100`, `#F5B50A`, `#F5B800`, `#F5A623`) están a menos de 3° de matiz: **indistinguibles en pantalla y aun así cuatro valores distintos**.
- **Impacto:** el usuario aprende que "verde = bien" pero ve un verde distinto en cada módulo; en estados de pedido, reserva o factura eso se lee como descuido y resta credibilidad justo donde el usuario juzga si la app es fiable con su dinero.
- **Ley:** consistencia, Estética-Usabilidad.
- **Arreglo mínimo:** colapsar (11 verdes→1, 9 rojos→2: `danger` + `like`, 16 ámbares→1, 10 azules→2: `primary` + `info`).
- **Esfuerzo:** medio (2–3 días). Depende de D-26.

**D-26 · Al kit le faltan los tokens a los que migrar · COLOR/SISTEMA · Alta (bloqueante)**
- **Evidencia:** el kit **no tiene** tokens para `warning`, `info`, `like` ni escala de sombras. Por eso no existe destino para 16 ámbares, 10 azules de información ni 28 sombras: la paleta actual **no puede representar lo que el código ya hace**.
- **Impacto:** cualquier intento de "sustituir hex por tokens" en esas familias se queda sin destino y acabará inventando un token nuevo por pantalla. Es la razón por la que la Fase 1 debe empezar por aquí y no por el barrido.
- **Ley:** coherencia del sistema (condición previa).
- **Arreglo mínimo:** declarar en el kit `warning`, `warningPressed`, `onWarning`, `info`, `like`, `brandWhatsApp` y `shadow.sm/md/lg`.
- **Esfuerzo:** bajo (medio día) y **desbloquea el resto del plan**.

**D-27 · El naranja hace de acción principal, en contra de la regla del kit · COLOR · Media-Alta**
- **Evidencia:** `#FF6B35` con **53 usos en 17 archivos** y **6 constantes `ACCENT` locales**; pinta botones de acción principal (`btnPrimary`, `buyBtn`, `retryBtn`). La regla está escrita en `ui-kit/src/theme/colors.ts:3` (*azul = acción principal; naranja = servicios/proceso*) y la deuda está **reconocida en el propio código** (`food-menu.tsx:31-34`).
- **Impacto:** dos botones igual de importantes, uno azul y otro naranja, según el módulo: el usuario no puede aprender "el botón que avanza es el azul". En una super-app con ocho servicios, eso se paga en cada pantalla.
- **Ley:** Jakob, consistencia.
- **Arreglo mínimo:** azul para toda acción principal; el naranja se queda en categoría/identidad de servicio.
- **Esfuerzo:** medio (2–3 días, 17 archivos).

**D-28 · El rojo de emergencia se usa de adorno — y aparece junto al botón SOS · COLOR/SEGURIDAD · Alta**
- **Evidencia:** `app/conductor.tsx:1705` pinta el chip *"🔥 Zonas calientes (simulación) · sin demanda real aún"* con `rgba(245,63,63,0.92)`, es decir el `danger` de emergencia al 92 %, **nueve líneas antes del botón SOS real** (`conductor.tsx:1711`). Además, "me gusta" se pinta con **tres rojos distintos** (`#FF2442`, `#FF3B5C`, `#EF4444`) según el módulo.
- **Impacto:** **este es un riesgo funcional, no estético.** Si el rojo de emergencia también significa "simulación" y "me gusta", el conductor aprende a ignorarlo — y el botón que salva vidas pierde su señal. Es el hallazgo más caro del informe en términos de consecuencia real.
- **Ley:** Von Restorff (el color de alarma solo funciona si es exclusivo), consistencia.
- **Arreglo mínimo:** retirar `danger` de toda decoración (contadores, rankings, simulación) y dar a "me gusta" token propio (`like`).
- **Esfuerzo:** bajo-medio (1–2 días). **Prioridad máxima dentro de color.**

**D-29 · El mismo estado con dos colores en el mismo flujo · COLOR · Media**
- **Evidencia:** `refunded` (Reembolsada) es **rojo `#EF4444`** en `billing-status.tsx:35` y **gris `#64748B`** en `billing-checkout.tsx:44`; `billing-status.tsx:34` además inventa `reversed` → `#7C3AED`, un violeta que no existe en el kit. Mismo patrón en `documents.tsx:36-40` y `monedero.tsx:59-61`: cuatro estados distintos, un color, definidos en dos arrays independientes.
- **Impacto:** el usuario ve "reembolsado" en rojo (alarma) en una pantalla y en gris (neutro) en otra: ¿le devolvieron el dinero o hay un problema? Es exactamente la duda que no se puede tener con dinero.
- **Ley:** consistencia, ayuda a reconocer el estado (Nielsen #1).
- **Arreglo mínimo:** un único mapa estado→color en el kit, consumido por las dos pantallas.
- **Esfuerzo:** bajo (medio día).

**D-30 · El contraste del propio kit no alcanza AA para texto normal · ACCESIBILIDAD/COLOR · Alta**
- **Evidencia (ratios calculados con la fórmula WCAG 2.x, no medidos en pantalla):** blanco sobre `secondary` `#FF7D00` = **2,57**; sobre `success` `#27AE60` = **2,87**; sobre `#FF6B35` = **2,84**; sobre `#D97706` = **3,19**; sobre `primary` `#0084FF` = **3,66**; sobre `danger` `#F53F3F` = **3,71**. Y `textSecondary` `#86909C` sobre blanco = **3,24**. El umbral AA para texto normal es **4,5**.
- **Impacto:** **cuatro de los pares del propio kit fallan AA**, y el texto de la app es de 11–13 px (no es "texto grande", que se conforma con 3,0). En la práctica: las etiquetas blancas de los botones principales y los textos secundarios quedan por debajo del mínimo, y `components/rental/Badges.tsx` es el caso más expuesto (texto de 10–12 px sobre ámbar).
- **Ley:** WCAG 1.4.3 (contraste mínimo), accesibilidad.
- **Arreglo mínimo:** oscurecer ligeramente los tokens de color para que el blanco encima llegue a 4,5, o usar texto oscuro sobre los fondos cálidos; y subir `textSecondary` a un gris más oscuro.
- **Esfuerzo:** medio (2–3 días, con verificación en pantalla obligatoria). **Requiere tu validación visual**: los colores son decisión de marca.

---

## 4. Detalle por dimensión (12 fichas)

**1 · Color — 4/10.** *Observado:* **1.127** literales hex en 140 de 193 archivos, **113 valores distintos**, de los que **806 (71,5 %) no son token**; `#fff`×387 es el más usado y **no es token**; **51 hex reparten 5 significados** (11 verdes, 9 rojos, 16 ámbares, 10 azules, 5 violetas); el kit está **limpio** (1 solo literal no oficial de 30). *Diagnóstico:* el sistema está bien diseñado y **no se adopta**; peor aún, al kit **le faltan los tokens** (`warning`, `info`, `like`, sombras) a los que migrar, y su propio contraste no llega a AA. *Acción:* crear los tokens que faltan → normalizar el blanco → retirar el rojo de la decoración → colapsar paletas paralelas → corregir contraste. *Ley:* Estética-Usabilidad, Von Restorff. *(El especialista puntúa 5/10; mantengo 4/10 por D-28 y D-29.)*

**2 · Tipografía — 4/10.** *Observado:* 37 `fontSize` en 2.801 usos; los más usados son 12 (420), 13 (328), 12.5 (317), 11.5 (284), 11 (278); solo pesos 500–900. *Diagnóstico:* el cuerpo de la app vive por debajo del mínimo cómodo y con valores fraccionarios; sin peso 400 la jerarquía se aplana y ninguna cifra se distingue. *Acción:* una escala (12/14/16/20/28) + peso 400 base y 700+ para cifras; subir el cuerpo de dinero a 14. *Ley:* Jerarquía visual, Von Restorff.

**3 · Layout y espaciado — 5/10.** *Observado:* 46 espaciados (47 % múltiplos de 4), 42 radios, 11 pantallas sin `useSafeAreaInsets`. *Diagnóstico:* sin rejilla, las relaciones de proximidad quedan al azar y cada pantalla se ajusta a ojo; los radios de 42 valores distintos impiden percibir una misma familia de superficies. *Acción:* escala 4/8/12/16/24/32 y radios 8/12/16/999 en el kit; insets ya en `auth` y conductor. *Ley:* Proximidad, 8-point grid.

**4 · Sistema de componentes — 4/10.** *Observado:* 74 componentes, de los cuales solo 20 están en la raíz y **14 se usan en ≤ 2 pantallas**; `PinPad` y `DocumentChoiceTree` en **0** archivos, `OtpInput` y `LivenessChallengeView` en **1**; **51** archivos con `<Modal` propio y **1** sola hoja inferior; **71** archivos con su propio estado vacío. *Diagnóstico:* no falta kit, falta **adopción**: lo difícil se construyó y se abandonó, el PIN corre por duplicado (`PinSheet` fuera del kit) y cada diálogo se escribe de nuevo. *Acción:* decidir por cada primitiva huérfana (adoptar o retirar), unificar el PIN en una sola implementación, y añadir al kit `Sheet/Dialog`, `Card`, `ListRow`, `EmptyState`, `InlineError` y `Pressable` con estado pulsado. *Ley:* consistencia interna, Jakob.

**5 · Accesibilidad — 4/10.** *Observado:* **885** etiquetas / **1.163** pulsables (hasta 76 %), **569** roles, **137** estados (12 %), **328** `hitSlop`, **3** `android_ripple`, **sin tope de escalado**, **0** reducir-movimiento, 4 anuncios para lector de pantalla. *Diagnóstico:* lo básico (nombrar los botones) está razonablemente cubierto; lo que falta es lo que hace la app **usable de verdad** con accesibilidad activa: decir qué está seleccionado, que el error del PIN se anuncie y no forzar movimiento. *Acción:* escalado de fuente global, `accessibilityState` en los controles de decisión, objetivos ≥ 44 pt y respeto de reducir-movimiento. *Ley:* WCAG 1.4.4 / 2.5.5 / 4.1.2, Fitts.

**6 · Interacción y feedback — 4/10.** *Observado:* **411** `Alert.alert` en **71** archivos, indicadores de carga en 111 archivos, animación en 8 archivos, **0 hápticos reales**, **257** `disabled=` en 97 archivos, y solo **156 de 1.163** botones con estado pulsado. *Diagnóstico:* hay prevención de doble pago (bien) pero el error se comunica cortando el flujo, el éxito no tiene momento propio y el toque no responde: la app se siente seca y los fallos, bruscos. *Acción:* `InlineError`/`Toast` para errores no destructivos, hoja de éxito con háptico en los 6 botones críticos, `Pressable` del kit con estado pulsado y respeto de reducir-movimiento. *Ley:* Doherty, Peak-End, Nielsen #1.

**7 · Psicología y jerarquía — 5/10.** *Observado:* 18 destinos en `ServicesDrawer`, 12 decisiones por checkout, comisión y neto visibles antes de confirmar. *Diagnóstico:* carga de elección alta en la puerta de entrada y en el pago, compensada por una transparencia de precio que juega a favor de la confianza. *Acción:* menú en 3 bloques con 4 servicios destacados; en checkout, plegar nota/cupón/hora tras "más opciones". *Ley:* Hick, Miller, Tesler.

**8 · Estilo visual e identidad — 4/10.** *Observado:* azul `#0084FF`, naranja Life Book `#FF6B35`, naranja comida `#FF7D00`, más verdes y rojos duplicados, 42 radios, superficies planas. *Diagnóstico:* tres sub-marcas que se leen como tres apps; falta una gramática única de superficie, elevación y forma justo donde hace falta transmitir solidez (dinero). *Acción:* un naranja de servicio, un rol por color, escala de radios y sombras; los sub-mundos se distinguen por etiqueta e icono. *Ley:* Jakob, coherencia de marca.

**9 · Convenciones de plataforma — 5/10.** *Observado:* insets y `KeyboardAvoidingView` (27 archivos) en general bien; 122 `<Image>` de RN; sin hápticos; modo oscuro inerte; `hitSlop` en 328 casos repartidos en 134 archivos. *Diagnóstico:* lo estructural está bien resuelto; lo que "se siente nativo" (háptico, caché de imagen, tema del sistema, gestos) está a medias. *Acción:* `expo-image` en catálogo/hotel/KYC, hápticos en acciones críticas, decidir modo oscuro. *Ley:* Jakob.

**10 · Flujos UX — 4/10.** *Observado:* el «Monedero» de la portada apunta a una ruta inexistente (`data.ts:33` → `/wallet`), el KYC no tiene puerta de entrada y termina en esa misma ruta, el alta se corta antes de crear la contraseña (`auth.tsx:37` vs `:89-90`), 61 pantallas pierden el destino al autenticarse, la emergencia exige cuenta, y los estados vacíos existen en 71 archivos con tono desigual. *Diagnóstico:* la infraestructura está pensada (mapa de rutas, pantalla de ruta fallida, estados vacíos modélicos en comida y mercado) pero **el mapa se escribió a mano y contiene una ruta sin pantalla, lo que anula la única comprobación que había**. En dinero, eso se traduce en callejones sin salida. *Acción:* Fase 0 completa; después, conservar el destino al autenticarse y llevar KYC y PIN al onboarding con progreso guardado. *Ley:* Tesler, Peak-End, Jakob.

**11 · Rendimiento percibido — 4/10.** *Observado:* 602 `.map(` en render, 167 `ScrollView` vs 58 `FlatList`, 52 temporizadores en 29 archivos con **0 `AppState`**, siete listas de dinero sin paginar ni virtualizar, el feed con la virtualización anulada por un ítem sintético y miniaturas que descargan el archivo completo. *Diagnóstico:* no es mal código —el equipo usa `FlatList` paginada con esqueletos en comida y mercado— sino que **los patrones correctos se aplican en comercio y no en dinero**, que es justo donde un atasco se lee como "la app me ha perdido el dinero". *Acción:* paginar y virtualizar las siete listas, `numColumns` en el feed, parar el sondeo del KYC, `expo-image` en `LazyImage`. *Ley:* Doherty.

**12 · Contenido y microcopy — 6/10.** *Observado:* español consistente y claro; códigos técnicos que llegan a la UI; plantilla de SMS con el nombre interno del proyecto (por verificar). *Diagnóstico:* el mejor eje, con fugas puntuales en el peor sitio (errores y mensaje de seguridad). *Acción:* un solo archivo de copy con mapa código→frase humana + acción sugerida, y alinear la plantilla del SMS. *Ley:* Jakob, ayuda al error (Nielsen #9).

---

## 5. Lo que está bien (y conviene no romper)

1. **Los tokens correctos ya existen** y están documentados con semántica y criterio WCAG (`ui-kit/src/theme/colors.ts`). No hay que inventar un sistema: hay que **obedecerlo**.
2. **`useTheme()` en 288 usos / 178 archivos** → el equipo ya piensa en tokens; la fuga de hex es de ejecución, no de concepto.
3. **El kit tiene primitivas reales y buenas**, incluidas las difíciles: `PinPad`, `OtpInput`, `LivenessChallengeView`, `DocumentChoiceTree`, `KycStatusBanner`. Eso es más de lo que tiene la mayoría de apps en producción. *(Pero hay que adoptarlas o retirarlas: ver D-19.)*
4. **Un solo primitivo de toque en toda la app: 1.163 `<Pressable>`, cero `TouchableOpacity` y cero `<Button>`.** Eso es una base excelente: significa que corregir feedback y accesibilidad de pulsación se hace **en un sitio**, no en cinco. Es la mejor noticia del informe.
5. **Las pantallas de dinero más recientes (monedero, PIN, recargas, retiros) son las más consistentes con el tema.** El problema es histórico, no cultural.
6. **257 atributos `disabled=` en 97 archivos** → la protección contra doble pago está puesta en el código, no solo prometida.
7. **Transparencia de precio:** comisión y neto se muestran antes de confirmar. Es un acierto de confianza poco común.
8. **71 archivos con estado vacío** → el problema no es la ausencia, es la homogeneidad.
9. **Español consistente** en toda la app.

---

## 6. Plan de acción priorizado

### Fase 0 — Reparaciones críticas (horas, antes de cualquier trabajo de diseño)

| # | Acción | Cierra |
|---|---|---|
| 0.1 | ✅ **HECHO (17/09)** — Ruta del monedero: `data.ts:33` → `/monedero`, entrada `monedero` en `constants/rutas.ts`, quitado el `Stack.Screen name="wallet"` y el `/wallet` del dock (`useAppDock.ts:43`). Tipos de ruta de Expo regenerados y 4 `as any` eliminados. Verificado con `tsc --noEmit`. **Falta reconstruir el APK** | **D-31** |
| 0.2 | ✅ **HECHO (17/09)** — Los dos finales del KYC (`kyc/index.tsx:104`, `kyc/status.tsx:85`) ya van a `/monedero` | **D-32** |
| 0.3 | ✅ **HECHO** — Etiquetas y anuncio de error del PIN, etiquetas distintas en `monedero-pin`, `accessibilityState` en la elección de agente y `hitSlop` en los botones de cantidad del mercado | D-46 a D-51 |
| 0.4 | ✅ **HECHO** — Nuevo `anunciar()` en el kit (`feedback/anuncios.ts`): en iOS usa `announceForAccessibilityWithOptions` y en Android la llamada normal, así que **deja de haber avisos que solo suenan en un sistema**. Lo usa el error del PIN, que era el caso más grave | D-48 |
| 0.5 | ✅ **HECHO** — Cuando el monedero responde `KYC_REQUIRED`, recargar y retirar ya muestran un botón «Verificar mi identidad →» que va al KYC real. Y el CTA del vendedor (`ecomerse-seller.tsx`) ya **no** lleva al alta de **conductor**: va al KYC | D-33 |
| 0.6 | ✅ **HECHO** — El carrito pide el PIN del monedero y obtiene un **token por tienda** (el token va atado al importe exacto), lo envía a `create()` como tercer argumento y **olvida los tokens usados** (son de un solo uso). Si el envío está «a consultar» **no hay importe que firmar**: se dice claro y se ofrecen efectivo o pagar desde la ficha del producto, en vez de ofrecer un pago que no puede completarse | **D-36** |
| 0.7 | ✅ **HECHO** — Fuente única en `constants/soporte.ts` (`egrouteplan@gmail.com` · **+8615504426087**). Ajustes ya **no** dice «Próximamente»: cuatro filas que abren WhatsApp, escriben un correo, llaman o reportan un problema. Y los tres avisos de dinero que remitían a un soporte inexistente (`billing-status` ×3, `kyc/status`) llevan ya el contacto y un botón para pedir el reembolso por WhatsApp. *(Ojo: el número facilitado es **+86**, China; si querías el de Guinea Ecuatorial, se cambia en ese único archivo.)* | D-37 |
| 0.8 | ✅ **HECHO** — Fuera la función que calculaba el «precio» a partir de la **longitud del texto** escrito en origen/destino, fuera los «km aprox.» inventados y fuera el envío de ese número al servidor. Ahora la tarjeta dice «Tu presupuesto» si el usuario puso uno, o **«A convenir»**, con la frase «El conductor confirma el precio al aceptar. La app no lo estima.» | **D-35** |
| 0.9 | ✅ **HECHO** — El sondeo de `kyc/status` guarda su temporizador y **lo para en cuanto el estado es terminal**: antes seguía cada 1,5 s **para siempre**, incluso con el KYC aprobado (batería, datos y peticiones sin motivo). `isTerminal` existía y solo se usaba para pintar | **D-54** |

### Fase 1 — Ganancias rápidas (1–3 días, riesgo bajo, sin rediseño)

| # | Acción | Dimensión | Cierra |
|---|---|---|---|
| 1 | **Paso 0**: declarar en el kit los tokens que faltan — `warning`, `warningPressed`, `onWarning`, `info`, `like`, `brandWhatsApp`, `shadow.sm/md/lg` y el token del blanco. **Sin esto no hay destino al que migrar** | Color/Sistema | D-26 |
| 2 | Normalizar `#fff`→`#FFFFFF` y `#000`→`colors.shadow` (413 ocurrencias, cambio mecánico, cero riesgo visual) | Color | D-24 |
| 3 | **Retirar el rojo `danger` de toda decoración**, empezando por `conductor.tsx:1705` (junto al botón SOS), y dar token propio a "me gusta" | Color/Seguridad | D-28 |
| 4 | Congelar la paleta, sustituir por tokens los hex más repetidos de los 12 archivos de dinero y **lint que prohíbe hex fuera del kit** | Color | D-05 |
| 5 | Un único mapa estado→color en el kit (`refunded`, `reversed`, `documents`, `monedero`) | Color | D-29 |
| 6 | Escalado de fuente (`allowFontScaling` + `maxFontSizeMultiplier`) en las 12 pantallas de dinero | A11y | D-01 |
| 7 | `accessibilityState` en los toggles de decisión + `hitSlop` en los controles pequeños de dinero | A11y | D-02 |
| 8 | `Pressable` propio del kit con estado pulsado por defecto (hoy solo 156 de 1.163) | Interacción | D-21 |
| 9 | Decidir cada primitiva huérfana (adoptar o retirar) y **unificar el PIN en una sola implementación** | Componentes | D-19 |
| 10 | Tres niveles de elevación en el kit y retirada de las 16 sombras escritas a mano | Estilo | D-23 |
| 11 | `useSafeAreaInsets` en `auth` y pantallas del conductor | Layout | D-11 |
| 12 | Háptico + transición propia en los 6 botones críticos | Interacción | D-14 |
| 13 | Agrupar el menú de servicios en 3 bloques con 4 destacados | Psicología | D-10 (parte) |

### Fase 2 — Medio plazo (1–2 semanas, requiere decisiones de diseño)

| # | Acción | Dimensión | Cierra |
|---|---|---|---|
| 14 | Publicar escala única: tipo (12/14/16/20/28), espacio (4/8/12/16/24/32), radio (8/12/16/999) y barrido guiado | Tipo + Layout | D-06 |
| 15 | Introducir peso 400 como base y reservar 700+ para cifras y títulos | Tipografía | D-07 |
| 16 | **Colapsar las paletas paralelas**: 11 verdes→1, 9 rojos→2 (`danger` + `like`), 16 ámbares→1, 10 azules→2 (`primary` + `info`), retirar los violetas sin rol | Color | D-25 |
| 17 | **Retirar el naranja de toda acción principal** (17 archivos, 6 constantes `ACCENT`): azul avanza, naranja clasifica | Color | D-27 |
| 18 | **Corregir contraste a AA**: oscurecer tokens o usar texto oscuro sobre fondos cálidos; subir `textSecondary`. Verificación en pantalla obligatoria | A11y/Color | D-30 |
| 19 | `Sheet`/`Dialog` único en el kit (cierre accesible, foco atrapado) y migración de los modales de dinero | Componentes | D-20 |
| 20 | `InlineError` + `Toast` en el kit; sustituir los `Alert` de pantallas de dinero | Interacción | D-03 |
| 21 | Paginar y virtualizar las **siete listas de dinero** (movimientos del monedero, pedidos, tickets, historial de viajes, intercity, publicaciones, viajes disponibles) y poner `numColumns` en el feed para que recicle de verdad | Rendimiento | D-04/D-55 |
| 22 | Migrar catálogo/hotel/KYC a `expo-image` | Rendimiento | D-12 |
| 23 | `EmptyState` en el kit y adopción en 20 pantallas | Componentes | D-17 |
| 24 | Mapa de códigos de error → frase humana + acción | Contenido | D-16 |
| 25 | Plegar lo accesorio del checkout tras "más opciones" | Flujos | D-10 (resto) |

### Fase 3 — Fondo (3–6 semanas, programa, no parche)

| # | Acción | Dimensión | Cierra |
|---|---|---|---|
| 26 | **Identidad visual única** para los tres sub-mundos, con gramática de superficies, elevación y radios | Estilo | D-08/D-06 |
| 27 | **Programa de accesibilidad**: recorrido real con VoiceOver/TalkBack en los 12 flujos de dinero, objetivos táctiles ≥ 44 pt, anuncios de cambio de estado y respeto de "reducir movimiento" | A11y | D-02/D-15 |
| 28 | **Modo oscuro**: completarlo con tokens en las 15 pantallas principales **o** retirarlo y borrar el código muerto | Plataforma | D-09 |
| 29 | **Auditoría de sondeo y batería** en dispositivo; intervalos por estado de pantalla | Rendimiento | D-13 |
| 30 | **Extraer bloques visuales** de `conductor.tsx` (2.071 líneas) y `taxi.tsx` (2.068): tarjeta de viaje, fila de datos, cabecera de mapa | Componentes | D-22 |
| 31 | **Guardia de diseño en CI**: lint de hex/tamaños/espaciados + revisión de capturas en cada tanda | Transversal | todos |
| 32 | Rediseño de jerarquía por pantalla (una acción primaria clara por vista) | Jerarquía | D-07/D-10 |

---

## 7. Leyes de UX — cobertura

| Ley | Estado | Evidencia | Acción |
|---|---|---|---|
| **Hick** (menos opciones, más decisión) | ❌ Roto | 18 destinos en el menú; 12 decisiones en checkout | D-10 |
| **Miller** (7±2) | ❌ Roto | Checkouts con 12 puntos de decisión | D-10 |
| **Fitts** (objetivos fáciles de tocar) | ⚠️ Parcial | `hitSlop` en 328 casos; 3 `android_ripple`; 42 radios sin escala táctil; solo 13 % de los pulsables da feedback al pulsar (156/1.163) | D-02/D-21 |
| **Doherty** (< 400 ms, sin romper flujo) | ⚠️ Parcial | La carga existe (111 archivos con indicador) pero el error corta el flujo con modal (411 alertas en 71 archivos) | D-03/D-04 |
| **Von Restorff** (el contraste crea foco) | ❌ Roto | Sin peso 400: todo destaca igual; 113 colores compitiendo; y el rojo de emergencia también decora avisos y "me gusta" | D-07/D-05/D-28 |
| **Jakob** (convenciones conocidas) | ⚠️ Parcial | Insets y teclado bien; sin hápticos, sin modo oscuro, `<Image>` antiguo | D-09/D-12/D-14 |
| **Estética-Usabilidad** | ⚠️ Parcial | Buena base de tokens desperdiciada por 1.127 literales hex (806 fuera de paleta) | D-05/D-06 |
| **Tesler** (complejidad irreducible bien colocada) | ⚠️ Parcial | KYC y PIN en medio del flujo, donde más duele | D-10/§5 Fase 2 |
| **Peak-End** (el final manda) | ❌ Sin cubrir | La confirmación de pago es un `Alert`, no un momento de logro | D-14 |
| **Proximidad** (lo relacionado, junto) | ⚠️ Parcial | 46 espaciados sin rejilla → relaciones visuales al azar | D-06 |

---

## 8. Lo que solo se puede validar en dispositivo (needs-validation)

1. **Contraste real en pantalla.** Los ratios ya están **calculados** (D-30): varios pares del propio kit no llegan a AA para texto normal (blanco sobre `secondary` 2,57; sobre `primary` 3,66; `textSecondary` sobre blanco 3,24). Falta **medirlo renderizado** a pleno sol y con brillo bajo, y decidir si se oscurecen los tokens (decisión de marca, tuya).
2. Si 11–13 px es legible en los Android de gama baja que usa el mercado real.
3. Fluidez percibida en las listas con `ScrollView` con 50+ elementos (historial, catálogo).
4. Recorrido real de VoiceOver/TalkBack en: pago, PIN, recarga, retiro, checkout.
5. Estado visual real del modo oscuro donde ya se usa (8 archivos).
6. Sensación de los hápticos y de las transiciones propuestas.
7. Consumo de batería/datos del sondeo (**52 temporizadores en 29 archivos, con 0 `AppState`**): el KYC que nunca se detiene ya está identificado, pero el resto requiere medir.
8. Comportamiento real de los anuncios para lector de pantalla: **`announceForAccessibility` = 0 en el código**, así que en iOS se puede afirmar que hoy no se anuncia nada; en Android hay 8 usos que hay que oír para confirmar que suenan.
9. Texto exacto de la plantilla de SMS de verificación (D-18).
9. **Tu valoración en pantalla** de las decisiones de identidad (un solo naranja, sub-mundos sin color propio): esto es criterio de dueño, no de código.

---

## 9. Conclusión

La app **no tiene un problema de diseño: tiene un problema de adopción de su propio sistema**. El equipo ya escribió las reglas correctas en `ui-kit` y luego las incumplió **806 veces** (71,5 % de sus colores están fuera de paleta); construyó primitivas difíciles y las dejó sin usar; y en 51 archivos reescribió el mismo diálogo. El resultado es una app con buen esqueleto y superficie irregular.

Las cuatro cosas que más devuelven por hora invertida son: **(1)** reparar los quince defectos funcionales de la Fase 0 —empezando por la ruta del monedero y el final del KYC, que hoy llevan a una pantalla de error—; **(2)** obedecer la paleta (creando antes los tokens que faltan) y publicar una sola escala; **(3)** que el texto se pueda agrandar y los controles digan su estado, con el PIN etiquetado; **(4)** un solo patrón de diálogo, un solo `Pressable` con feedback y un solo PIN.

Lo mejor de este informe es que la corrección es **barata por diseño**: al haber **un único primitivo de toque (1.172 `<Pressable>`, cero `TouchableOpacity`, cero `<Button>`)**, arreglar feedback y accesibilidad de pulsación se hace en un sitio, no en cinco; los diez arreglos urgentes de accesibilidad suman 4–8 h; y normalizar el blanco son 413 cambios mecánicos sin riesgo visual. Nada exige rediseñar desde cero: exige cerrar la brecha entre lo que el sistema dice y lo que las pantallas hacen.

*(Informes por especialista: ver anexo §10.)*

---

## 10. Anexo — informes de especialistas

| Especialista | Estado | Informe | Puntuación propia | Aportación a este documento |
|---|---|---|---|---|
| **Color** | ✅ Cerrado | `D:\egapp\.design-audit\color.md` (456 líneas) | **5/10** | Corrigió el inventario (1.127 literales / 113 colores / 806 fuera de paleta), demostró que **el kit está limpio y el problema es de adopción**, y aportó D-24 a D-30 — incluidas las **lagunas de token que bloquean el plan** (D-26) y el **uso del rojo de emergencia junto al botón SOS** (D-28) |
| Accesibilidad | ✅ Cerrado | `D:\egapp\.design-audit\a11y.md` (653 líneas) | **4/10** | Confirmó mis cifras (y refutó los 2.293: eran doble conteo), falla **8 criterios WCAG A/AA** y aportó D-46 a D-53: el PIN sin nombre accesible, los errores de PIN que no se anuncian y **0 `announceForAccessibility`** (en iOS no funciona ningún anuncio) |
| Rendimiento | ✅ Cerrado | `D:\egapp\.design-audit\perf.md` | **4/10** | Corrigió 4 cifras mías (602 `.map`, 167/58 listas, 220 cargas, 52 temporizadores en 29 archivos) y aportó D-54 y D-55: **el sondeo del KYC nunca se detiene** y **el feed anula la virtualización** con un ítem sintético. Diagnóstico: *"el equipo conoce los patrones correctos y los aplica en comercio, no en dinero"* |
| Flujos y psicología | ✅ Cerrado | `D:\egapp\.design-audit\flows-psychology.md` | **Flujos 5/10 · Psicología 6/10** | El más valioso: encontró los **defectos funcionales del bloque F** — la ruta del monedero inexistente (D-31), el KYC sin puerta y con final roto (D-32/D-33), el alta que se corta (D-34), el precio inventado de «Reservar Coche» (D-35) y el carrito que ofrece monedero sin token de pago (D-36) — más el **lado oferta** del bloque H. Entregó en tres tandas y **verificó 39 de sus citas `archivo:línea` con un script: todas correctas** |

**Nota de método del especialista de color, relevante si alguien reutiliza el inventario:** el orden del alternador en la expresión regular importa — con `{6}` antes de `{8}` los colores con alfa (`#F53F3F55`) se cuentan como 6 dígitos y **inflan el conteo** (subía `#f53f3f` de 30 a 38). Y el fuente usa **MAYÚSCULAS**: buscar en minúsculas devuelve cero resultados. Ambas cosas explican por qué mi primer pase midió 661 literales en vez de 1.127.

---

## 11. Estado de ejecución de la Fase 1 (17/09/2026)

Ejecutada por bloques, con `npx tsc --noEmit` **sin errores** después de cada uno. **Nada está probado en pantalla todavía: hace falta reconstruir el APK.**

| # | Acción | Estado | Qué se hizo exactamente |
|---|---|---|---|
| 1.1 | Tokens que faltan | ✅ Hecho | **12 tokens nuevos** en `packages/ui-kit/src/theme/colors.ts` (exportados por el barrel del kit y por el shim `constants/colors.ts`): `warning`, `warningPressed`, `onWarning`, `info`, `infoPressed`, `onInfo`, `like`, `likePressed`, `whatsapp`, `neutral`, `neutralPressed`, `white`. `onWarning` y `onInfo` son oscuros **a propósito**: el blanco sobre ámbar no llega a AA. Además: `elevation` / `elevationDark` con **3 niveles** (había 12 valores de `elevation` y 11 de `shadowOpacity` a mano) y `alpha()` ahora acepta la forma corta `#fff` y **no devuelve `rgba(NaN…)`** ante un valor inesperado |
| 1.2 | Normalizar blanco y negro | ✅ Hecho | **441 literales en 98 archivos**: 411 `#fff` → `#FFFFFF` y 30 `#000` → `#000000`. Quedan **0** formas cortas |
| 1.3 | Sacar el rojo de emergencia de la decoración | ✅ Hecho | El chip «🔥 Zonas calientes (simulación)» (`conductor.tsx:1706`) y su botón flotante (`:1728`) pasan de `danger` al 92 % a **`warning` + `onWarning`**: el rojo vuelve a significar solo emergencia — y esto estaba **nueve líneas antes del botón SOS** |
| 1.4 | Tokens en los archivos de dinero | ✅ Hecho | **288 literales convertidos a `brand.*` en 65 archivos** (mismo valor que el token: **sin cambio visual**, y como los tokens de marca son idénticos en claro y oscuro, tampoco cambia el tema oscuro) + 53 atributos JSX pasados a `={brand.x}`. **Y la guardia que impide la recaída ya existe** (abajo) |
| 1.5 | Un único mapa estado→color | ✅ Hecho | `billing-status.tsx` y `billing-checkout.tsx` comparten ya los mismos tokens: **`refunded` era rojo en una pantalla y gris en la otra** → ahora `info` en ambas; `reversed` deja el violeta inventado por `neutral`; `approved` pasa al `success` oficial |
| 1.7 | Estados y etiquetas accesibles | ✅ Hecho | **Adelanto de la Fase 0 (D-46/D-47/D-50):** `PinSheet` ya tiene etiqueta en el PIN y en la contraseña, **el error se anuncia** (`accessibilityLiveRegion` + `role="alert"` + `announceForAccessibility` en iOS, que eran **0 en toda la app**) y el foco queda atrapado (`accessibilityViewIsModal`); `monedero-pin` distingue «PIN nuevo» de «Repite el PIN»; la elección de agente de efectivo comunica su estado (`selected`) con nombre, código y zona; los 14 controles del monedero declaran su estado pulsado; y el carrito de Life Book ya declara `radio` + `selected`/`disabled` en sus métodos de pago. **Corrección honesta de mi énfasis en D-02**: los checkouts de comida, mercado y Life Book **ya lo hacían bien** (`radio` + `checked`), y el componente `Chip` del kit también; el hueco real estaba en el monedero (agente y PIN) y en el carrito, no en los checkouts |
| 1.8 | Feedback al pulsar | ✅ Hecho | Nuevo primitivo **`Tactil`** en el kit (`packages/ui-kit/src/primitives/Tactil.tsx`), un `Pressable` con opacidad al pulsar por defecto. Adoptado en **14 controles de las 4 pantallas del monedero**. Nota: `PrimaryButton` y `GhostButton` del kit **ya lo hacían bien** (opacidad 0,9 + escala 0,98 + `accessibilityState`), así que el problema eran solo los `Pressable` escritos a mano |
| 1.10 | Escala de elevación | ✅ Hecho | **15 usos de `elevation.*` en 9 archivos**: se sustituyeron los grupos de sombra escritos a mano (`shadowColor` + `shadowOffset` + `shadowOpacity` + `shadowRadius` + `elevation`) por `...elevation.sm/md/lg`, eligiendo el nivel por el valor de `elevation` que tenía (≤2 → `sm`, 3–6 → `md`, ≥7 → `lg`). Incluye `conductor.tsx`, `taxi.tsx`, `lifebook.tsx`, `index.tsx`, `ServicesDrawer.tsx`, `DriverHomeSheet.tsx`, `FloatingFooter.tsx`, `SearchHeader.tsx` y `BotonCucucul.tsx`. **Quedan 4 casos a propósito**: `reserva.tsx:460` y `LocationBadge.tsx:43` usan el token del tema (`c.shadow` / `colors.shadow`), así que ya son correctos y cambiarlos por la escala fija perdería el modo oscuro; `LocationBadge.tsx:78` y `MapTools.tsx:110` están partidos en `Platform.select` (iOS/Android) y piden una decisión de diseño, no un reemplazo ciego |
| 1.11 | Áreas seguras | ✅ Hecho | **13 pantallas corregidas**: las 9 del informe (`auth` —**el primer contacto**—, `conductor-hub`, `driver-onboarding`, `driver-profile`, `landlord-profile`, `my-tickets`, `reserva`, `work-planes`, `work-publish`) **más 4 que la auditoría no vio** porque solo se escaneó el nivel raíz de `app/`: `kyc/index`, `kyc/capture`, `kyc/liveness` y `kyc/status`. Esas cuatro usaban **`paddingTop: 56` y `64` fijos**, un número mágico que se queda corto en móviles con isla dinámica; ahora usan `insets.top + 12/16`. Solo quedan fuera `+not-found` y `_layout` (casos límite, sin contenido propio que tapar) |

**Nota de método (nos pasó dos veces, conviene recordarlo):** al buscar por ruta en PowerShell, `[id]` se interpreta como **comodín de carácter**, así que `Select-String -Path '...\lifebook-post\[id].tsx'` devuelve 0 coincidencias **falsas**. Con eso llegué a creer que 7 rutas dinámicas no tenían áreas seguras: las 7 **sí** las tienen. Para ficheros con corchetes hay que usar `-LiteralPath`. Es el mismo tipo de trampa que el orden del alternador en el regex de color: un detalle de herramienta que cambia el resultado de una medición.
| 1.6 | Cuerpo de texto en dinero | ✅ Hecho (falta tu prueba) | **95 textos** de las 9 pantallas de dinero subidos a un **suelo de 13 px** (antes había 11, 11,5, 12 y 12,5): `monedero` (6), `monedero-recargar` (7), `monedero-retirar` (7), `monedero-movimientos` (3), `food-checkout` (22), `ecomerse-checkout` (14), `lifebook-checkout` (14), `lifebook-carrito-checkout` (20) y `PinSheet` (2). **Lo que queda es tuyo**: probar en el aparato con el **tamaño de fuente del sistema al máximo** y decirme qué pantalla se rompe; ahí pondré `maxFontSizeMultiplier` en vez de dejar crecimiento libre |
| 1.13 | Menú de servicios | ✅ Hecho | **Divulgación progresiva** en el grupo «Servicios»: los cuatro servicios de uso diario (taxi, comida, monedero, mercado) van siempre visibles y el resto (hasta 9 filas más) espera detrás de un enlace que dice cuántas quedan («Ver todos los servicios · 9»). **Las filas de rol no se esconden nunca** (centro de conductor, perfil conductor, panel de agente): esconderlas sería quitarle a un conductor su herramienta para acortar una lista. Con estado accesible (`expanded`) |
| 1.9 | Unificar el PIN | ✅ Hecho | **Había TRES implementaciones de PIN, no dos**: `PinPad` del kit (sin usar en ningún archivo), `components/PinSheet.tsx` (6 pantallas) y un **`PinPadModal` suelto dentro de `conductor.tsx:1783`**. El oficial pasa a ser **`PinSheet`, ahora dentro del kit** (con sus etiquetas, su anuncio de error y sus vibraciones); se retiró `PinPad.tsx`; las 6 pantallas importan ya de `@egrouteplan/ui-kit`; y se borró el fichero local. **Queda el tercero** (`PinPadModal` del viaje): es otra UX —teclado para confirmar el viaje— y unificarlo toca el flujo de dinero del taxi, así que queda propuesto para la Fase 3 **con pruebas**, no a escondidas |
| 1.12 | Hápticos | ✅ Hecho | **`expo-haptics` 14.1.4 instalado** (versión compatible con el SDK 53) y **autolinkado**. Nuevo helper `haptico()` en el kit (`feedback/hapticos.ts`): **si el dispositivo no tiene motor o el módulo falla, se ignora en silencio** — un adorno no puede tumbar un pago. Vibran: el botón principal del kit (todas las acciones principales de la app), la confirmación del PIN y **el PIN incorrecto, con una vibración distinta**. Antes había **0 hápticos reales** |

### Guardia de diseño — `npm run diseno`

El proyecto **no tenía ESLint instalado**, así que la regla de lint del plan se ha implementado como verificador propio, siguiendo la convención que ya existía en `pruebas/` (como `npm run rutas`):

- **`pruebas/verifica-diseno.cjs`** + `npm run diseno`, con base en `.diseno-baseline.json`.
- Es un **trinquete: solo permite que la deuda baje.** Si un archivo añade un literal de color, un `fontSize` o un `borderRadius` a mano, falla y dice exactamente qué archivo y cuánto (`app/monedero.tsx → hex: 9 → 10`) y devuelve código de salida 1.
- **Probado**: inyecté una recaída de prueba (un `#ABCDEF`, un `fontSize` y un `borderRadius`) y el guardián la detectó con salida 1; el archivo quedó intacto después.
- **Punto de partida del trinquete**: `hex: 928 · fontSize: 3031 · borderRadius: 1260`. A partir de aquí no puede subir.

### Añadido por el especialista de flujos (publicación, 3.ª entrega)

Refuerza D-41, D-44 y D-45 con evidencia nueva, verificada por él con script:
- **El botón miente**: en `alquiler-publicar.tsx:523` el botón «Publicar anuncio» **navega a otra pantalla** si la cuota está agotada (no avisa: hace otra cosa), y en `intercity-publish.tsx:542` el CTA simplemente queda muerto («Límite de plan alcanzado»).
- **El cobro del destacado llega después de publicar** (`work-publish.tsx:156`): se publica primero y se cobra después.
- **Ningún flujo guarda borrador, y está verificado**: `0` coincidencias de `persist` en el store; **8 de 9 flujos no avisan al salir** y solo `food-owner.tsx:153-165` protege de verdad.
- **Botón desactivado sin decir qué falta** (`lifebook-compose.tsx:161`), frente al buen patrón de `lifebook-sell.tsx:157,265`, que señala el campo culpable y salta a su paso.
- El wizard de Life Book es de **6 pasos (5 con tienda ya creada)** y sigue siendo **el único flujo de la app con indicador de progreso**.

### Cambios visibles que hay que mirar en pantalla

1. **Chip y botón de «zonas calientes»** (mapa del conductor): de rojo a **ámbar**.
2. **Estados de facturación**: `Aprobado` es un verde algo más profundo; **`Reembolsada` es azul informativo** (antes: rojo de error en una pantalla y gris en la otra); `Reversada` es gris (antes violeta).
3. **Corazones y favoritos**: un solo rojo (`like`) donde había tres distintos.
4. Los `#EF4444` restantes (títulos de error, insignias de urgente) pasan al rojo oficial `danger`: cambio imperceptible.

### Lo que queda en la Fase 1 y por qué

- **Queda una sola cosa de la Fase 1 y es tuya: la prueba de tamaño de fuente.** El suelo de 13 px ya está aplicado (95 textos en 9 pantallas de dinero); lo que no puedo verificar yo es qué se rompe con el **tamaño de fuente del sistema al máximo**. Ponlo al máximo, dime qué pantalla se descuadra y ahí pongo `maxFontSizeMultiplier`.
- **Documentado, no hecho**: queda un tercer camino de PIN, el `PinPadModal` del viaje dentro de `conductor.tsx` (teclado para confirmar el taxi). Unificarlo toca dinero del viaje y merece pruebas: Fase 3.

*(1.8, 1.10, 1.11 y 1.13 ya están hechos: ver la tabla de arriba.)*

---

## 11-bis. Estado de ejecución de la Fase 2 (17/09/2026)

| # | Acción | Estado | Qué se hizo |
|---|---|---|---|
| 14 | Escala única de tipo, espacio y radio | ✅ **Declarada** (migración pendiente) | Nuevo `packages/ui-kit/src/theme/escalas.ts` con `tipografia` (11/12/14/16/20/28), `espaciado` (4/8/12/16/24/32), `radios` (8/12/16/999) y `peso`. Exportadas por el kit y por el shim. **La app todavía no las usa**: sustituir 2.801 `fontSize` y 1.258 `borderRadius` es un barrido guiado que va por tandas, no de golpe |
| 15 | Peso 400 como base | ✅ **Declarado** | `peso.normal: '400'` ya existe en el kit. La app sigue sin usarlo en general: todo estaba en 500–900, y por eso nada destacaba |
| 16 | Colapsar las paletas paralelas | ✅ **Hecho** | **134 valores** de las familias paralelas sustituidos por tokens: 11 verdes de «éxito» → `success`, 16 ámbares → `warning`, rojos claros → `danger` y oscuros → `dangerText` (nuevo: `danger` como texto no llega a AA), azules → `primary`/`info`. Dos falsos positivos retirados por el camino: `#25D366` **no** era un verde de éxito (es la marca de WhatsApp) y `#adFade` **no era un color**: era el identificador de un degradado SVG que el analista de color contó como color |
| 16-bis | Un solo naranja y un solo blanco | ✅ **Hecho** | `#FF6B35` (**53 usos en 17 archivos**) → `brand.secondary`, el naranja oficial. Y **538 `#FFFFFF`** → `brand.white`: mismo valor exacto, cero cambio visual, pero desaparece el blanco escrito a mano. **Los literales de color bajan de 915 a 190** (−79 %) y la guardia `npm run diseno` queda fijada ahí |
| 17 | Naranja de acción principal | 🟡 **A medias, espera tu ojo** | El naranja ya es **uno** (el oficial). Queda una decisión de jerarquía: hoy hay **6 constantes `ACCENT` locales** y botones de acción principal en naranja (`btnPrimary`, `buyBtn`, `retryBtn`). La regla del kit es *azul avanza, naranja clasifica*; cambiarlo toca 17 archivos y prefiero que lo veas antes |
| 18 | Contraste AA | 🟡 **A medias** | `textSecondary` del tema claro pasa de **3,24:1 a 4,76:1** (cumple AA). **Falta tu validación** en los fondos de color: blanco sobre `secondary` da 2,57, sobre `primary` 3,66 y sobre `danger` 3,71. O se oscurecen los tokens (decisión de marca) o el texto de esos botones va en oscuro |
| 19 | Hoja de diálogo única | 🟡 **Construida y adoptada en 1 pantalla** | Nuevo `Sheet` en el kit: cierra al tocar fuera, respeta el botón de atrás, **atrapa el foco** (`accessibilityViewIsModal`), titula con rol de cabecera y **no se cierra mientras trabaja**. Sustituye al `Alert` de confirmación de cancelar una orden en facturación. Quedan **51 archivos** con su propio `<Modal>`: la migración es por tandas |
| 20 | Errores en línea en vez de modales | 🟡 **Construida y adoptada en 4 pantallas** | Nuevo `InlineError` (anuncia el error al lector de pantalla, vibra y ofrece **reintento**) + `Aviso` (el «toast» que no existía) + `useAviso()`. Adoptados en `monedero-recargar`, `monedero-retirar`, `food-checkout` y `billing-status`. Los `Alert` de las pantallas de dinero bajan de **34 a 12** |
| 22 | `expo-image` | ✅ **Hecho** | `LazyImage` —que usan **alquiler, hoteles e intercity**— pasa de `Image` de React Native a `expo-image` con **caché en disco** (`cachePolicy="memory-disk"`) y fundido propio. Un solo archivo arregla tres verticales. Detalle: expo-image llama `fill` a lo que RN llama `stretch`, y `Animated.Image` no entiende `contentFit`, así que se envuelve el componente (`ImagenAnimada`) |
| 23 | `EmptyState` en el kit | 🟡 **Construido y adoptado en 1 pantalla** | Nuevo `EmptyState` con título, explicación **y acción**. Adoptado en los movimientos del monedero: antes era un texto suelto («No hay movimientos de este tipo.») y ahora dice qué es, por qué está vacío y ofrece «Recargar con un agente». **Verificado en el dispositivo** |
| 24 | Códigos de error en lengua humana | ✅ **Hecho** | Nuevo `constants/errores.ts` con `mensajeDeError()`: mapea los códigos del servidor (`KYC_REQUIRED`, `PIN_LOCKED`, `INSUFFICIENT_FUNDS`, `DAILY_LIMIT_EXCEEDED`, `OUT_OF_STOCK`…) a frases que dicen **qué pasó y qué hacer**, detecta los fallos de red y **limpia el ruido técnico** (`(ENOTFOUND)`, «Network request failed»). Adoptado en el monedero, la comida y facturación |
| 21 | Listas de dinero virtualizadas | ✅ **Las 8 formas del problema, hechas** | **Verificadas con datos reales:** movimientos del monedero, Mis tickets, historial de viajes (**13 viajes**), pedidos del mercado (**un pedido real**), el paso de resultados de Ciudad a Ciudad (**2 viajes reales**, Bioko Norte → Bioko Sur), y las **dos pantallas de hotel**, que resultaron ser `SectionList` (**2 reservas próximas + 3 de historial**, §13.4). **Hechas con las filas sin poder verlas** (la cuenta no tiene la condición necesaria): `ecomerse-seller` (§13.5) y «Mis viajes» del conductor en `intercity-publish` (§13.6). Todas pasan de `ScrollView` + `.map()` a **`FlatList`/`SectionList`** con reciclado, conservando aspecto, recarga al tirar y vacío. **Hallazgo al llegar a la quinta:** `intercity.tsx:244` **no es el mismo caso** — su `ScrollView` no contiene una lista sino una **máquina de pasos** (`search` → `trips` → asientos → pasajero → confirmar), y la lista vive dentro del paso «trips». Anidar un `FlatList` ahí **desactivaría la virtualización** (React Native lo avisa), así que el arreglo correcto es que ese paso renderice un `FlatList` en vez del `ScrollView` con su cabecera y el formulario posterior como cabecera/pie. **Ya no queda pendiente**: ese paso se hizo el 17/09 por la noche (ver §13). Lo que **sí** era falso es lo que sigue: `lifebook-hotel-reservas.tsx:291` y `lifebook-hotel-panel.tsx:303` **no están «fuera del `ScrollView`»** — el `.map()` vive en el componente `Grupo`, que **se invoca desde dentro** del `ScrollView` (L246-269 en las reservas, L270-273 en el panel). El informe había leído la línea de la **definición** del componente, no la del **uso**: son dos listas por secciones más, no un contenedor aparte (ver §13). **Nada pendiente en esta fila** |
| 25 | Plegado del checkout | ⏳ Pendiente | Siguiente tanda |

### Lo que NO se tocó a propósito (y por qué)

- **Violetas y magentas** (`#E0439A`, `#8B5CF6`, `#7C3AED`, `#B57BFF`, `#FF7BAC`): **27 usos sin significado declarado**. Mapearlos a ciegas sería inventar semántica: hay que decidir qué son (¿creador? ¿social? ¿destacado?) y entonces darles token.
- **Grises de texto** (`#8E8E93`, `#86909C`, `#111827`, `#CBD5E1`): son el `textSecondary` viejo y compañía. Pasarlos a `colors.textSecondary` cambia el color según el tema, así que van con la migración de las escalas.
- **`#000000` (19)**: son `shadowColor` sueltos; la mayoría debería salir de la escala `elevation`.

---

## 12. La reconstrucción del APK: lo que exigió (17/09/2026)

El APK **se reconstruyó, se instaló y la app arrancó** en el dispositivo. No fue directo: la máquina tenía tres bloqueos reales que hubo que resolver. Queda escrito porque **volverá a pasar** en el próximo build.

| Bloqueo | Qué pasaba | Cómo se resolvió |
|---|---|---|
| **Gradle no existía** | El wrapper intentaba descargar Gradle 8.13 y dejaba un `.part` de 0 MB: su `networkTimeout` era de **10 s** para un fichero de 131 MB | `networkTimeout` subido a **180 s** en `android/gradle/wrapper/gradle-wrapper.properties` |
| **GitHub y los repositorios oficiales están bloqueados** | `services.gradle.org` **redirige a github.com** (que no responde); tampoco `dl.google.com`, `repo.maven.apache.org` ni `plugins.gradle.org`. El primer build moría resolviendo dependencias | **Espejos de Aliyun** delante en `android/build.gradle` (`google`, `public`, `gradle-plugin`), con los repositorios originales conservados detrás. La distribución de Gradle se bajó del **espejo de Tencent** y se instaló a mano en la caché del wrapper |
| **C: estaba al 0 % de espacio** (0 GB libres de 198,9) | `java.io.IOException: 磁盘空间不足` = **disco lleno** a mitad de build | La caché de Gradle (1,44 GB) se movió a **`D:\gradle-home`**, y el build corre con `GRADLE_USER_HOME` y `TEMP`/`TMP` apuntando a D:. Se limpiaron temporales (2,85 → 0,56 GB). **No borré datos de tus aplicaciones** (SodaClip, Doubao, Kingsoft, Feishu, Tencent…): C: sigue ajustado y conviene que lo mires tú |
| Cerrojos corruptos tras el movimiento | `Unexpected lock protocol found in lock file. Expected 3, found 0` | Se borró la caché de jars transformados (`caches/jars-9`) y los cerrojos huérfanos; Gradle la recrea |

**Consecuencia práctica:** de builds que morían a los 14 min, a **`BUILD SUCCESSFUL` en 4 min 56 s** (678 tareas). Los cambios de configuración necesarios están en `android/gradle/wrapper/gradle-wrapper.properties` y `android/build.gradle`, comentados.

**Comprobación de que el APK lleva los cambios**: se extrajo el bundle de JS del propio APK (`assets/index.android.bundle`, 6,05 MB) y se buscaron cadenas de la Fase 1 — `Tactil`, «Zonas calientes», «PIN del monedero», `/monedero` y `accessibilityLiveRegion`: **las cinco aparecen**.

---

## 13. Tandas del 17/09/2026 (noche) — continuación

### 13.1 La quinta lista: el paso de resultados de Ciudad a Ciudad (D-04/D-21)

Hecha y **verificada en el aparato con datos reales**. `app/intercity.tsx`, script `pruebas/fase2-lista-intercity.cjs`.

**Por qué no era un reemplazo directo** (y por qué el arreglo no es «cambiar `ScrollView` por `FlatList`»): la pantalla tenía **un solo `ScrollView` (L209)** que no contenía una lista, sino una **máquina de pasos** —`search` → `trips` → `passenger` → `confirm` → `ticket`—. La lista de viajes vivía **dentro** del paso «trips», así que meter ahí un `FlatList` sería anidar una lista virtualizada en un `ScrollView`, y React Native desactiva la virtualización exactamente en ese caso. Lo que cambia no es el contenedor de la lista: cambia **quién hace el scroll en el paso de resultados**.

```
{step !== 'trips' ? <ScrollView>…los cuatro pasos de formulario…</ScrollView> : <FlatList …/>}
```

El paso «trips» se movió al final, junto al cierre del `ScrollView`, para que el ternario no partiese en dos el resto de los pasos. **El orden de los pasos, el estado y la navegación no cambian**; la cabecera del paso va en `ListHeaderComponent` y el vacío en `ListEmptyComponent`.

**Espaciado: comprobado, no supuesto.** El bloque del paso tenía `gap: 12`; el `contentContainerStyle` que hereda de `s.content` tiene `gap: 16`. Para no cambiar el aspecto puse `gap: 12` explícito. Que `gap` separe de verdad las celdas de una `FlatList` **no hay que creérselo**: cada celda va envuelta en su propio `View` (`node_modules/@react-native/virtualized-lists/Lists/VirtualizedListCellRenderer.js`, L211-218), así que es un contenedor flex normal y sí las separa. Medido en el aparato: tarjeta 1 termina en y=1079 y la 2 empieza en 1115 → **36 px = 12 dp**, igual que antes entre cabecera y primera tarjeta (535 → 571).

**Verificación (con datos reales, no con el vacío):**

| Qué | Cómo | Resultado |
|---|---|---|
| Qué ruta tiene viajes | `GET /api/intercity/routes` + `/trips` de las 42 combinaciones de provincias | **Bioko Norte → Bioko Sur: 1 ruta, 2 viajes** (las demás, 0) |
| La lista dibuja los datos del servidor | Comparar el volcado con la respuesta de la API | Furgoneta · Toyota Hiace · GQ-E2E-01 · BERNARDO LOPERTE · 0 y 2 asientos libres · 6.000 XAF · alquiler 50.000 XAF — **coinciden uno a uno** |
| El vacío sigue existiendo | Ruta Litoral → Bioko Norte (0 viajes) | «No hay viajes publicados para esta ruta todavía», con su cabecera encima |
| La máquina de pasos no se rompió | Tocar un viaje → paso «pasajero» → «Volver» | Vuelve al listado con los 2 viajes |
| Sin errores de JavaScript | `adb logcat -d \| Select-String "ReactNativeJS.*(Error\|Warning)"` | **ninguno** |

### 13.2 Errata: las reservas del hotel **sí** son listas

El informe (§11-bis, fila 21) y RELEVO.md (§5-B) afirmaban que en `lifebook-hotel-reservas.tsx:291` y `lifebook-hotel-panel.tsx:303` el `reservas.map` estaba **fuera** del `ScrollView` —«viven en otro contenedor, averigua dónde antes de plantear nada»—. **Es falso**, y la causa del error es de método: las líneas 291 y 303 son la **definición** del componente `Grupo`, y el `Grupo` **se invoca desde dentro** del `ScrollView` (reservas: L246-269, tres secciones; panel: L270-273, cuatro secciones). Se leyó la línea del `.map()` sin leer quién lo llama.

Son, por tanto, **dos listas por secciones** (título de sección + tarjetas), y el instrumento correcto es **`SectionList`**, no `FlatList`: en las reservas hay tres secciones («En curso», «Próximas», «Historial») y en el panel cuatro («Requiere tu atención», «En casa hoy», «Próximas llegadas», «Historial», esta última ya recortada a 20), con la cabecera (aviso, error, ocupación de hoy) en `ListHeaderComponent` y el vacío en `ListEmptyComponent`. La lección se repite: **una ancla de `grep` señala una línea; hay que comprobar si esa línea es el uso o la definición.**

### 13.3 Herramientas nuevas para verificar sin ver

Dos ayudantes en `pruebas/`, porque el agente no puede ver imágenes y `uiautomator` a pelo obliga a leer XML:

- **`pruebas/ver-pantalla.ps1`** — vuelca la pantalla y la imprime como texto: índice, `bounds` y texto o etiqueta accesible. Los `bounds` son lo que permite comprobar **de verdad** posiciones y espaciado (fue lo que midió los 36 px).
- **`pruebas/tocar.ps1`** — toca por texto o etiqueta accesible (`-Texto`, `-Indice`, `-SoloBuscar`, `-SinDesplazar`), **desplazando y reintentando** si el control está bajo el pliegue (los formularios largos esconden el botón y el volcado solo trae lo visible).

**Dos trampas que costaron dos intentos fallidos** (van escritas aquí para que no vuelvan a costarlos):

1. **Cada control sale dos veces en el volcado** (nodo contenedor + nodo de texto), y sus centros pueden diferir en **1 px** (552 frente a 553). Deduplicar por coordenada exacta **no** sirve; hay que agrupar con tolerancia. Con el deduplicado mal hecho toqué dos veces el mismo chip y puse *origen* donde quería *destino*: la app buscó «Bioko Sur → Bioko Sur» y dijo, con razón, que no había rutas. **Se perdió un rato acusando a la app de un fallo que era del instrumento.**
2. Un `error !== 0` de `Select-String` en la tubería de PowerShell **no** significa que la compilación falló: el `BUILD SUCCESSFUL in 1m 19s` de Gradle iba en la misma salida.

### 13.4 Las dos listas de hotel: `SectionList` (17/09/2026, noche)

Hechas y verificadas. `app/lifebook-hotel-reservas.tsx` y `app/lifebook-hotel-panel.tsx`, script `pruebas/fase2-lista-hotel.cjs` (+ la corrección `fase2-lista-hotel-secciones-vacias.cjs`).

El instrumento es **`SectionList`**, no `FlatList`: la sección es el grupo («En curso», «Próximas», «Historial»), la fila es la reserva (la `Tarjeta` que ya existía), el título de sección pasa a `renderSectionHeader` —mismo `styles.seccion` y mismo contador entre paréntesis—, la cabecera de pantalla a `ListHeaderComponent` y el vacío a `ListEmptyComponent`. El componente `Grupo` desaparece: era el que hacía el `.map()` y el que ocultaba las secciones vacías. `stickySectionHeadersEnabled={false}` **a propósito**: los títulos nunca fueron pegajosos y no debían empezar a serlo.

**El defecto lo encontró el aparato, no el compilador.** Al abrir «Mis estancias» apareció **«En curso (0)»**, un título que antes **no** existía (el viejo `Grupo` hacía `return null` con la lista vacía). La causa está en React Native:

```
node_modules/@react-native/virtualized-lists/Lists/VirtualizedSectionList.js  L178-180
  // Add two for the section header and footer.
  itemCount += 2;
  itemCount += this.props.getItemCount(section.data);
```

Cuenta **dos celdas por sección pase lo que pase**, así que una sección sin filas conserva su cabecera. Se corrige filtrando `sections` con `.filter((s) => s.data.length > 0)`, que es exactamente lo que hacía el `return null`. **Sin abrir la pantalla no se habría visto**: el `tsc` estaba limpio y el `FlatList` del resto de listas no tiene este problema (una lista vacía no tiene celdas).

**Verificación (datos reales del usuario, 5 reservas):**

| Qué | Resultado |
|---|---|
| Secciones | «Próximas (2)» y «Historial (3)»; la sección vacía («En curso») **no** se dibuja tras el arreglo |
| Filas | Las 5 reservas con sus datos (código, hotel, habitación, fechas, total, señal, al llegar, estado y acciones) |
| El vacío de la cabecera sigue | Pestaña «Mi hotel»: «Tu hotel no tiene reservas todavía» |
| El panel del hotelero | `lifebook-hotel-panel`: cabecera (puerta a «Gestión», rejilla del día) + su vacío; sin títulos de sección porque las cuatro están vacías |
| Sin aviso de listas anidadas | `logcat`: **0** líneas `VirtualizedList`/`nested` |
| Sin errores de JavaScript | `logcat --pid` de la app: solo ruido del sistema (Oplus/Jank), **ninguna** línea de `ReactNativeJS` |

**Lo que cambia de aspecto, dicho sin adornos:** el hueco entre tarjetas de una misma sección pasa de **10 dp a 12 dp** (y el del título a su primera tarjeta, igual). El contenedor tenía `gap: 12` entre bloques y cada `Grupo` tenía `gap: 10` dentro; ahora el `gap: 12` del contenedor es uniforme. Son 2 dp (6 px en este teléfono) y quedan a favor de la coherencia, pero **es un cambio real y no lo he medido con tus ojos**: míralo.

### 13.5 «Mis productos» del vendedor (`ecomerse-seller`): hecho, **con una parte sin verificar**

`app/ecomerse-seller.tsx`, script `pruebas/fase2-lista-ecomerse-seller.cjs`. La lista era la ÚLTIMA sección de un formulario largo (requisitos + datos del negocio + publicar producto + productos rechazados + «Mis productos» + banner del plan), así que el formulario pasa a ser la **cabecera** de la lista, el banner su **pie** y cada producto una **fila**. Los dos `ScrollView` horizontales (categoría y subcategoría) se quedan: la virtualización solo se desactiva anidando listas de la **misma** dirección. Cambio de tipo obligado: el contenedor guardaba un `ref` para subir arriba al editar un producto (`scrollTo`), y una `FlatList` usa `scrollToOffset`.

**Lo que NO está verificado, dicho claro:** la cuenta del dueño **no es vendedora activa** («Aprobación del administrador: Sin solicitud», «0/8 publicaciones activas»), así que **las filas de producto no se han visto nunca en pantalla**: no hay productos que dibujar. Comprobado en el aparato: la cabecera completa (requisitos, negocio, alta), el **pie** (banner «🏪 Tienda Gratis · 0/8 publicaciones activas»), el desplazamiento, y `logcat` sin errores ni aviso de listas anidadas. El marcado de la fila es **el mismo de antes** (se cortó y se reinsertó, no se reescribió), pero *no* puedo decir que lo haya visto funcionar. Queda para cuando haya una cuenta de vendedor con productos.

### 13.6 La séptima lista: «Mis viajes» del conductor (`intercity-publish`)

Hecha. `app/intercity-publish.tsx`, scripts `pruebas/fase2-lista-intercity-publish.cjs` (+ dos remates: `-orden.cjs` y `-indentacion.cjs`).

Era la más delicada de las siete porque son **listas dentro de listas**: los viajes publicados y, dentro de cada viaje, sus reservas. Decisión: **el viaje es la FILA y la reserva es CONTENIDO de la fila** — una reserva no se puede tocar sin tocar su viaje (aceptar una tarifa, cobrar, cancelar); separarlas dejaría acciones huérfanas o repetiría el viaje en cada reserva. La **ruta** es la sección, porque `groups` ya venía agrupado por «origen → destino», así que el título con su contador pasa a `renderSectionHeader`. El banner del plan y el error eran comunes a los dos modos y se extrajeron a `cabeceraModos` para no duplicarlos.

**Verificado en el aparato:** la pantalla abre en el modo lista y dibuja su cabecera (el error del servidor: «Debes ser conductor verificado o agente para publicar viajes»), el título «Mis viajes» con su botón de recarga y el vacío («Aún no has publicado viajes. Pulsa + para crear uno»), con los huecos correctos, sin errores de JavaScript y sin el aviso de listas anidadas.

**Lo que NO está verificado, dicho claro:** esta cuenta **no es conductora verificada**, así que (a) no hay viajes publicados con reservas que dibujar y (b) **el botón que cambia al modo formulario no aparece**, porque solo se muestra con `driverOk === true`. El formulario está intacto (conserva su `ScrollView`), pero **no lo he visto funcionando después del cambio**: queda pendiente para una cuenta de conductor.

### 13.7 El hueco que la cabecera NO hereda (y dos errores míos)

Esto salió de **medir**, no de leer: en el paso de resultados de Ciudad a Ciudad, los `bounds` de los dos textos de la cabecera decían que uno terminaba y el otro empezaba **en el mismo píxel** (403 → 403). Estaban pegados.

La causa es una trampa de React Native que afecta a **toda** conversión a lista virtualizada:

> `ListHeaderComponent={<>{a}{b}</>}` mete los dos elementos en **una sola celda**. El `gap` de `contentContainerStyle` separa **celdas**, no hijos de una celda, y un fragmento no tiene estilo. Antes esos elementos eran hijos directos del contenedor con `gap`, así que sí estaban separados.

Se arregla envolviendo el contenido de la cabecera en un `View` con el **mismo gap que tenía el contenedor**. Afectaba a cuatro archivos: `intercity.tsx` (12), `lifebook-hotel-reservas.tsx` (12), `lifebook-hotel-panel.tsx` (12) y `my-tickets.tsx` (12, de la sesión anterior). **No** se tocaron los que no tenían gap que perder, comprobados uno a uno: `ecomerse-seller` y `ecomerse-orders` usan `padding` sin `gap`; `monedero-movimientos`, tampoco; `trips-history` tiene una sola línea en su cabecera. Script: `pruebas/fase2-cabecera-con-gap.cjs`.

**Medido antes y después** (mismo teléfono, mismos `bounds`, mismo desplazamiento):

| Pantalla | Antes | Después |
|---|---|---|
| `intercity`, paso de resultados | título termina en 403 · cuerpo empieza en **403** | título 403 · cuerpo empieza en **439** → 36 px = 12 dp |
| `lifebook-hotel-panel`, cabecera | «Llegadas hoy» en **708** | «Llegadas hoy» en **744** → 36 px = 12 dp |

**Error mío nº 1 (de estructura, no de estilo):** al hacer la séptima lista puse el modo «lista» **antes** de los dos avisos de entrada, así que un usuario sin cuenta o sin alta de conductor habría visto la lista vacía en vez de «Necesitas una cuenta de conductor». Lo cazó la lectura del archivo, no el compilador: `tsc` estaba limpio y las dos ramas eran válidas por separado. Corregido en `-orden.cjs`: primero los avisos, luego los modos, como estaba.

**Error mío nº 2:** el primer script de remate duplicó el encabezado de la rama que movía (`) : mode === 'list' ? (` seguido de otro `{mode === 'list' ? (`) y rompió el archivo. Lo dijo el `tsc` en el acto (`TS1005: ',' expected`), y el remate de indentación se rehízo buscando por **contenido** en vez de por número de línea — que es justo lo que había fallado (al quitar la línea duplicada, todos los números de abajo se movieron uno).

### 13.8 Un fallo de compilación que no era de compilación

`:app:packageRelease` falló una vez (`IncrementalSplitterRunnable`) y la carpeta del APK quedó vacía; el reintento inmediato dio `BUILD SUCCESSFUL in 34s` **sin tocar nada**. Antes de eso comprobé las dos causas conocidas de esta máquina: **D: tiene 501 GB libres** pero **C: está en 0,67 GB** (la trampa de §12 sigue ahí y sigue siendo lo primero que hay que mirar). Si vuelve a pasar, **reintentar es lo correcto, no «arreglar» nada**.

---

## 14. Difusión de `EmptyState` (D-17) — tandas 1 y 2

### Tanda 1 — el monedero

Script `pruebas/fase2-vacios-monedero.cjs`. Tres pantallas, aplicando el criterio del informe (**título + por qué está vacío + qué hacer ahora**):

| Pantalla | Antes | Ahora |
|---|---|---|
| `monedero.tsx` (últimos movimientos) | «Todavía no hay movimientos.» — una línea suelta, sin salida | «Todavía no hay movimientos» + «Aquí se apunta cada recarga, retirada y pago que hagas con el monedero» + **«Recargar con un agente»** |
| `monedero-recargar.tsx` | «No hay agentes activos ahora mismo.» | Título + por qué + **«Escribir a soporte»** |
| `monedero-retirar.tsx` | «No hay agentes activos ahora mismo.» | Título + por qué + **«Escribir a soporte»** |

**Lo importante de las dos últimas:** sin agente de efectivo el usuario **no puede entregar ni recoger su dinero**, así que un texto que solo informa es un callejón sin salida en una pantalla de dinero. La salida no hubo que inventarla: `constants/soporte.ts` ya existía de la Fase 0 (D-37) y se usa igual que en `billing-status`, `kyc/status` y `settings` (`void whatsappSoporte('…')` en el `onPress`).

**Verificado en el aparato:** el vacío del monedero, con sus tres partes y sus `bounds` (título en y=1544, explicación en 1632, botón en 1857). `logcat` sin errores.

**Lo que NO está verificado:** las dos ramas de «no hay agentes». En este backend **hay 4 agentes de efectivo activos** (TST-9341, TST-9582, TST-3635 y BERNARDO LOPERTE, con sus zonas), así que esa rama **no se dibuja** y no se puede ejercitar sin vaciar datos del servidor, que no es cosa mía. Lo comprobado en esas dos pantallas es que el camino **con** agentes sigue intacto (los 4 con nombre, código y zona, y su estado accesible).

### Tanda 2 — facturación y agente de efectivo

Script `pruebas/fase2-vacios-dinero.cjs`. Cuatro vacíos más:

| Pantalla | Antes | Ahora |
|---|---|---|
| `billing-status.tsx` (derechos) | Ya tenía título y explicación, **pero escritos a mano en 14 y 12 px** — y el 12 rompía el suelo de 13 px que la Fase 1 fijó para las pantallas de dinero | Al componente del kit (15 y 13,5), conservando `ModulePlans` **debajo y fuera**: el kit no tiene hueco para hijos sueltos, y una acción con varias opciones vive fuera |
| `billing-status.tsx` (órdenes) | «Aún no has realizado compras.» — una línea sin título ni salida | «Todavía no has comprado nada» + «Aquí aparecerá cada compra de plan, con su estado y su reembolso si lo hubiera» |
| `agente.tsx` (efectivo) | «Nada por confirmar.» | Título + qué lo llena (el código que enseña el cliente) |
| `agente.tsx` (recados) | «No tienes recados en curso.» | Título + qué lo llena (recoges el paquete y lo entregas; el comprador confirma) |

**Regla que sale de aquí y conviene no olvidar:** cuando el vacío es una **espera** —el agente no puede provocar una operación de efectivo, solo confirmarla cuando el cliente enseña el código—, la «acción» es **saber qué lo llena**. Poner un botón para cumplir la plantilla sería relleno. El criterio del informe es *título + por qué + qué hacer ahora*, y en una espera «qué hacer ahora» es «nada: esto se llena solo cuando pase X».

**Verificado en el aparato:** los dos vacíos de facturación, con sus `bounds` («Sin derechos activos» en y=672, su explicación en 760 y los botones de planes en 1030-1276; «Todavía no has comprado nada» en 1604 y su por qué en 1692). `logcat` sin errores.

**Lo que NO está verificado:** los dos vacíos de `agente.tsx`. Esta cuenta **no tiene perfil de agente** —la pantalla responde «Perfil de agente no disponible o suspendido»— así que no se dibujan. Mismo caso que los agentes de efectivo de la tanda 1: hacen falta datos de otro rol.

### Censo, criterio y guardia

**Censo honesto (el informe decía «~65 archivos»):** hoy hay **48 archivos** con alguna comparación `length === 0` y **80 coincidencias**, pero **no todas son estados vacíos de cara al usuario**: unas son guardias internas (`if (lines.length === 0) return;` en `ecomerse-checkout`, `if (soloMode || cart.length === 0) return;`). La cifra hay que confirmarla archivo por archivo; la cuenta buena es la de **vacíos que ve el usuario sin salida**, no la de coincidencias de grep.

**Revisado y descartado a propósito:** el vacío de repartidores de `food-orders.tsx:445` («No hay repartidores activos todavía. Aprueba uno desde el panel de administración.») **no** se pasa al kit: vive **dentro de un modal que ya tiene su propio título**, y `EmptyState` exige título, así que adoptarlo duplicaría el encabezado. Su texto ya dice qué pasa y qué hacer.

**Observación de paso (no arreglada, es de datos):** el monedero de esta cuenta está a 0 XAF y las dos pantallas dicen «Hoy puedes recargar hasta **0 XAF**» y «hoy puedes retirar hasta **0 XAF**». Con límite 0 el flujo no se puede ni empezar; conviene que el dueño mire de dónde salen esos topes (¿KYC? ¿límites sin cargar?).

**Guardia:** `npm run diseno` bajó de `fontSize 3009` a **3001** en las dos tandas (se retiraron literales al usar el kit), y la base se re-fijó con `npm run diseno -- --base` después de cada una. Ahora es **`hex 190 · fontSize 3001 · borderRadius 1257`**.

---

## 15. Fase 2 · punto 25 — Plegar el checkout

El informe pedía «mover lo accesorio (**nota, cupón, hora, zona**) detrás de un “más opciones” en los 4 checkouts». Al ir a hacerlo, **tres de esos cuatro no eran lo que el informe decía**, y plegarlos habría sido un error de diseño:

| Elemento | ¿Accesorio? | Por qué |
|---|---|---|
| **Nota / mensaje al vendedor** | **Sí** | No cambia la cifra, no es obligatorio, y ocupaba el mismo peso visual que la dirección y el pago. **Es lo único que se pliega** |
| **Zona de entrega** (`ecomerse-checkout`) | **No** | Su propia etiqueta lo dice: «define la tarifa». Elegir zona **cambia lo que pagas**; esconderla es esconder el precio |
| **Cupón** (`lifebook-checkout`, `lifebook-carrito-checkout`) | **No** | Cambia el total, y el código ya documenta la decisión contraria: «se piden MIS cupones al abrir la caja (no al pulsar pagar): **el descuento tiene que verse ANTES de confirmar**» |
| **Hora** | **No existe** | Se buscó en los cuatro checkouts: no hay ningún campo de hora (lo que hay es el horario del restaurante, que es informativo) |

**El primitivo, en el kit y no tres veces a mano:** `packages/ui-kit/src/primitives/MasOpciones.tsx` (+ export en el barrel). Tres copias del mismo despliegue sería justo el anti-patrón que la auditoría llama «el coste de no tener un patrón». Detalles que no son adorno:

- **`abiertoInicial`**: si el usuario ya escribió una nota, su texto no puede quedar escondido. Quien llama pasa `note.trim() !== ''`.
- **`accessibilityState={{ expanded }}`** y la etiqueta accesible cambian con el estado: un despliegue que no comunica si está abierto deja al lector de pantalla a ciegas (el fallo que corrigió la Fase 1).
- Las etiquetas se piden **enteras y en imperativo** («Añadir una nota para el restaurante»), no un «más opciones» a secas: el enlace dice qué va a aparecer.
- Usa las **escalas declaradas** (`tipografia.body`, `espaciado.xs/sm`, `peso.fuerte`), así que es código nuevo que no añade deuda de la Fase 2.

**Adoptado en los tres checkouts que tienen nota** (`pruebas/fase2-plegar-checkout.cjs`): `food-checkout` («restaurante»), `ecomerse-checkout` («vendedor») y `lifebook-carrito-checkout` (mensaje **por tienda**, porque cada tienda recibe su pedido).

**Verificado en el aparato** (`food-checkout`, con un carrito real de La Cocina de Mamá):

| Estado | Medición |
|---|---|
| Cerrado | Enlace «Añadir una nota para el restaurante ›» en y=1230-1321 · «Método de pago» en **1363** |
| Abierto (un toque) | El enlace pasa a «Ocultar la nota» y aparece el campo (`Ej: sin cebolla, llamar al llegar…`) en y=1345-1537 · «Método de pago» baja a **1579** |
| Otra vez cerrado | Vuelve el enlace de 918 px de ancho y «Método de pago» regresa a **1363** |

**Lo que NO está verificado:** los otros dos checkouts. `ecomerse-checkout` responde «Tu carrito está vacío» y `lifebook-carrito-checkout` «No hay nada que pagar: vuelve al carrito y marca algún producto», así que su cuerpo no se dibuja. Usan el mismo primitivo con las mismas props, pero **no los he visto**.

**Observación de paso (comprobada, y no es un fallo de esa pantalla):** al abrir `lifebook-carrito-checkout` con el carrito vacío apareció una vez **«Error de red: Network request failed»**. Al repetirlo **ya no salía**, y el backend responde (`GET /api/intercity/locations` → HTTP 200), así que fue un **corte momentáneo de la conexión del teléfono**, no un defecto de la pantalla. Lo único que falla de forma repetida en el registro de la app es el sondeo **`/lifebook/chat/unread`** (2 intentos), que es el que ya aparece en el informe de batería de la Fase 3: conviene mirarlo, pero no es diseño.

---

## 16. Difusión de `EmptyState` (D-17) — tanda 3: la bandeja de Life Book

Script `pruebas/fase2-vacios-bandeja.cjs`. Esta tanda existe por el **peor ejemplo del informe**: `lifebook-inbox` decía **«Nada por aquí todavía»** — sin decir qué es la pantalla, ni por qué está vacía, ni qué hacer. Seguía igual desde la auditoría. Cuatro vacíos en tres pantallas hermanas:

| Pantalla | Antes | Ahora |
|---|---|---|
| `lifebook-inbox.tsx` (3 pestañas) | Un icono y «Nada por aquí todavía» para las tres | «Todavía no tienes me gusta ni guardados» / «Todavía no tienes seguidores nuevos» / «Todavía no te han mencionado», cada una con su por qué. **Solo la primera lleva acción** («Crear una publicación») |
| `lifebook-inbox-likes.tsx` (2 pestañas) | Icono + título + explicación a mano, en 15 y 12,5 px | Al kit (misma copia, tipografía y espaciado coherentes) |
| `lifebook-inbox-comments.tsx` (comentarios) | Igual, a mano | Al kit, y la explicación dice además que se puede responder por mensaje |
| `lifebook-inbox-comments.tsx` (menciones) | Igual, a mano | Al kit |

**La regla de la tanda 2 se aplica aquí otra vez, y es la que decide el diseño:** una pestaña donde el usuario **puede hacer algo** lleva salida; una donde solo puede **esperar** no lleva botón inventado. «Me gusta · Guardados» es lo único que el usuario provoca —sin publicar no hay nada que reaccionar—, así que es la única con acción. En «Seguidores» y en «Comentarios y @» el vacío explica qué lo llena.

**Revisado y descartado a propósito:** `lifebook-inbox-followers.tsx`. Sus dos vacíos («Todavía no tienes seguidores nuevos.» y «No hay recomendaciones ahora mismo.») son vacíos **de sección**: van justo debajo de los títulos «TE HAN SEGUIDO» y «RECOMENDADOS PARA TI», y `EmptyState` exige título propio, así que adoptarlo **duplicaría el encabezado**. Mismo criterio que el vacío del modal de repartidores en `food-orders`.

**Verificado en el aparato:** la pestaña **«Guardados»** de `lifebook-inbox-likes`, que sí está vacía en esta cuenta: título «Todavía no has guardado publicaciones» en y=711-842 y explicación «Lo que guardes aparecerá aquí, solo para ti.» en 860-986. `logcat` sin errores.

**Lo que NO está verificado, y por qué:** los tres vacíos de `lifebook-inbox` y los dos de `lifebook-inbox-comments`, porque **esta cuenta tiene datos en todas esas pestañas** (me gusta de BERNARDO LOPERTE, cuatro menciones, un comentario). No se puede ejercitar el vacío sin borrar datos del servidor, que no es cosa mía. La copia y la estructura son las mismas que la variante verificada.

**Guardia:** bajó otra vez, de `fontSize 3001` a **2994** (los tres archivos tenían literales 12,5 y 15 escritos a mano), y la base se re-fijó. Ahora es **`hex 190 · fontSize 2994 · borderRadius 1257`**.

---

## 17. Difusión de `EmptyState` e `InlineError` — tanda 4: historiales y favoritos

Script `pruebas/fase2-vacios-historiales.cjs`. Cuatro pantallas, cinco vacíos: `lifebook-orders` (comprar/vender), `lifebook-guardados` (ya tenía título, explicación **y salida**: pasa al kit sin tocar la copia), `lifebook-vistos` y `ecomerse-favorites` (cuatro pestañas). Los tres primeros venían con literales 15 y 12,5 escritos a mano.

**El caso que importa es `lifebook-vistos`, y no es de estilo:** su estado vacío hacía **dos trabajos** con un solo bloque. Si fallaba la carga, el mismo bloque decía «No se pudo cargar» y ofrecía **«Ver el catálogo»** — la acción equivocada para un error: el catálogo no arregla que la petición haya fallado, y el usuario se quedaba **sin forma de reintentar**. Ahora son dos cosas distintas y se ven distintas:

- **error** → `InlineError`, que se anuncia al lector de pantalla, vibra y **ofrece reintento**;
- **vacío** → `EmptyState`, con su salida al catálogo.

**Verificado en el aparato con la red cortada a propósito** (datos móviles del teléfono desactivados y restaurados después, comprobando el estado antes y después):

| Situación | Antes | Ahora |
|---|---|---|
| Sin red | «No se pudo cargar» + **«Ver el catálogo»** | «Error de red: Network request failed» + **«Reintentar»** (medido: mensaje en y=484-610, botón en 758-999) |
| Red restaurada | — | La pantalla carga sola: «13 productos · lo último que miraste, primero», con sus precios y su acción «Borrar el historial» |

**Lo que NO se pudo pulsar:** el botón «Reintentar». Al volver la red, la pantalla **se recuperó sola** antes de que llegara el toque (el botón ya no estaba). El manejador es el mismo `cargar()` que usa el gesto de refrescar, que sí está ejercitado, pero **el toque del reintento no lo he visto**.

**Lo que NO está verificado, y por qué:** los cuatro vacíos. Estas pantallas **tienen datos** en esta cuenta: 2 productos guardados, 13 vistos y productos en **las cuatro** pestañas de favoritos. Sin borrar datos del servidor no hay forma de ejercitarlos.

**Guardia:** `fontSize` bajó de 2994 a **2988** en esta tanda y la base se re-fijó: **`hex 190 · fontSize 2988 · borderRadius 1257`**.

---

## 18. Difusión de `Sheet` — tanda 1: el modal de acciones del pedido

El informe pide empezar por los **modales de dinero**, y el de `ecomerse-orders` (cancelar un pedido, abrir una disputa, valorar una compra) era el candidato ideal por una razón concreta: **ya hacía a mano todo lo que trae el `Sheet`** —

- cerrar al tocar fuera (un `<Pressable>` a pantalla completa),
- respetar el botón de atrás (`onRequestClose`),
- `accessibilityViewIsModal` para atrapar el foco,
- y no cerrarse mientras trabaja (guardia con `modalBusyRef`).

Pero lo hacía **a su manera**, que es exactamente lo que el propio `Sheet` documenta como el problema: «51 archivos que escribían su propio `<Modal>`… cada uno decidía por su cuenta el fondo oscurecido, la posición, el cierre al tocar fuera y —lo más importante— si el lector de pantalla lo anunciaba». Con el `Sheet` ese comportamiento **se hereda** en vez de reescribirse.

**Se conservó todo el contenido** (las cinco estrellas, el campo de motivo, el botón «Cancelar» y el «Enviar» con su guardia de ocupado): el título y el subtítulo pasan a props del `Sheet`, que además los anuncia como cabecera. Los estilos `modalWrap` y `modalCard` quedaron muertos y se retiraron — de ahí que la guardia baje a 2986.

**Verificado en el aparato** (`ecomerse-orders`, con pedidos reales):

| Qué | Resultado |
|---|---|
| La hoja se abre al pulsar «Cancelar» | Título «Cancelar pedido» (y=1642-1719), subtítulo «El stock se restaura.» (1731-1796), el campo (1838-2102) y los botones «Cancelar»/«Enviar» (2168-2308) |
| Posición | Abajo, como estaba (`position="bottom"`), con el fondo oscurecido y su botón de cierre |
| Tocar fuera | **Cierra** y vuelve a «Mis pedidos» con sus importes |
| `logcat` | Sin errores de JavaScript ni caídas |

**Lo que NO está verificado:** el botón **«Enviar»** (mandaría una cancelación o una disputa **de verdad** al backend del dueño: eso no lo hago sin que me lo pidan) y la variante de **valorar compra** (las estrellas), porque los pedidos de esta cuenta están «Pendiente» y esa acción aparece en los entregados. Esa rama del contenido no se tocó —solo cambió el envoltorio—, pero no la he visto abrir.

**Guardia:** re-fijada en **`hex 190 · fontSize 2986 · borderRadius 1257`**.

---

## 19. Difusión de `Sheet` — tanda 2: asignar repartidor (`food-orders`)

`pruebas/fase2-sheet-repartidor.cjs`. Este modal es de dinero y de operación diaria: elige **quién lleva el pedido**. Estaba a mano con fondo oscurecido, cierre al tocar fuera y `accessibilityViewIsModal` — o sea, repetía lo que el `Sheet` trae, y sin anunciar el título como cabecera.

Se conservó todo el contenido: el estado de carga, el vacío, la lista de repartidores (que lleva su propio `marginBottom`, así que va envuelta en un `View` para que el `gap` del `Sheet` no doble el hueco) y el enlace «Cancelar». `tsc` limpio, guardia en **2985** y APK compilado e instalado.

**Un error mío que costó dos intentos:** puse el comentario como `{/* … */}` dentro de `{assignOrder && ( … )}`. Ahí solo cabe **una expresión**, así que un comentario JSX no es válido: tiene que ser un comentario JS normal (`/* … */`). El `tsc` lo dijo en el acto y quedó corregido **también en el script**, para que no se repita.

**Lo que NO está verificado, y por qué (dos razones distintas):**
1. **Esta cuenta no es de restaurante**, así que la lista de pedidos del local no tiene datos con los que abrir «Asignar repartidor».
2. Además, al abrir `food-orders` la pantalla respondió con **su propio estado de error** («📡 Algo salió mal») y el registro mostraba `Network request failed` repetido: el teléfono **tenía red activa** (`Active default network: 107`, datos móviles encendidos) pero las peticiones fallaban en ese momento. No es del cambio —ese error lo pinta la pantalla cuando falla la red—, pero significa que **hoy no se puede comprobar en pantalla**. Queda para cuando haya cuenta de restaurante y la conexión esté estable.

**Queda pendiente en el mismo archivo:** `ReviewModal` (el segundo modal de `food-orders`, con `animationType="fade"`). Se dejó a propósito para no mezclar dos cambios en una tanda que no se puede verificar.

### 19-bis. Tanda 3: el selector de ciudad (`ecomerse-seller`) y **un fallo del propio `Sheet`**

`pruebas/fase2-sheet-ciudad.cjs`. El selector de ciudad (para el negocio y para el producto) era un `<Modal>` a mano con su cabecera y su «X»; pasa al `Sheet`, que además anuncia el título como cabecera. La «X» desaparece a propósito: el `Sheet` se cierra tocando fuera y con el botón de atrás, que es su contrato. Se retiraron los cuatro estilos que quedaron muertos (`modalWrap`, `modalCard`, `modalHead`, `modalTitle`).

**Y aquí la comprobación en el aparato encontró un fallo del `Sheet`, no de la pantalla:** la hoja abierta **ocupaba la pantalla entera** (el título salía en y=0). El modal viejo tenía `maxHeight: '75%'` y el `Sheet` no traía tope, así que una lista larga —24 ciudades— estiraba la hoja hasta arriba y dejaba de parecer una hoja. **Se arregló en el kit**, no en la pantalla: `hojaAbajo` lleva ahora `maxHeight: '80%'`, con lo que el contenido de dentro desplaza (que es lo que hacía el modal a mano). Eso mejora también las otras dos hojas adoptadas, que podían crecer igual.

**Verificado en el aparato tras el arreglo:** título en y=538-615 y la lista desde 657, con las ciudades y sus regiones; `logcat` sin errores.

**Nota de `Aviso` (revisado y descartado a propósito):** los `Alert` informativos que quedan en pantallas de dinero **no** deben pasar a `Aviso`. `Aviso` es un *toast*: `pointerEvents="none"` y se va en 2,6 s, así que no se puede leer con calma ni pulsar. «Contacta soporte: correo y WhatsApp» (`billing-status:142`) o «Pedido creado» con su botón (`ecomerse-checkout:181`) **necesitan** que el usuario lea y actúe: convertirlos en un aviso que se desvanece sería empeorarlos. `Aviso` es para lo que no pide nada («guardado», «copiado»), y en dinero eso casi no existe.

### 19-ter. Tanda 4: el selector de ciudad de `food-owner`

`pruebas/fase2-sheet-ciudad-owner.cjs`. Mismo caso que el de `ecomerse-seller`: `<Modal>` a mano con fondo, cierre al tocar fuera, `accessibilityViewIsModal` y cabecera con su «X», sin anunciar el título como cabecera. Pasa al `Sheet`; la lista de ciudades **conserva su `maxHeight: 420`** además del tope del propio `Sheet`, así que la altura queda acotada por partida doble. Se retiraron los cuatro estilos muertos (`modalWrap`, `modalCard`, `modalHead`, `modalTitle`).

En este archivo el script **no** quitó `Modal` del import: hay **otro** modal más abajo, y el script lo detecta y avisa en vez de dejar el archivo roto. (`tsc` limpio, guardia en **2983**.)

**Lo que NO está verificado:** no se pudo abrir en el aparato. Esta cuenta **no es de restaurante** —la pantalla muestra «Requisitos para operar»— así que el formulario con el selector de ciudad no se dibuja. Lo comprobado es que la pantalla sigue abriendo y que el archivo compila.

**Pendiente en `food-orders`:** su `ReviewModal` (el modal de valorar, `animationType="fade"`). **Se dejó a propósito**: no llegué a ver su bloque de cierre completo y esta sesión ya me había roto dos archivos por trabajar con anclas a medias. Es el siguiente, con la lectura hecha de su cabecera (título «Valorar tu pedido», estrellas, texto de ayuda y botones «Cancelar»/«Enviar» con `busyRef`).

### 19-quater. Tanda 5: `ReviewModal` de `food-orders` (valorar el pedido) — el pendiente, cerrado

`pruebas/fase2-sheet-valorar.cjs`. Repetía a mano lo del `Sheet` (fondo, cierre al tocar fuera, `accessibilityViewIsModal`) y **no anunciaba el título como cabecera**; su propio `card` tampoco tenía tope de altura. El nombre del restaurante, que era un texto suelto bajo el título, pasa al **`subtitle`** (así se anuncia junto a la cabecera) y el `Sheet` recibe `busy={busy}`, que es la misma guardia `busyRef` que ya impedía enviar dos valoraciones seguidas. Se conservó todo el contenido: las estrellas con su estado accesible, el texto de ayuda y los dos botones. Se retiraron los tres estilos muertos (`s_rm.wrap`, `s_rm.card`, `s_rm.title`).

**Dos cosas que salieron aquí y merecen quedar escritas:**

1. **El `tsc` cazó un tipo:** `order.restaurantName` es `string | null` y `subtitle` pide `string | undefined` → `?? undefined`. Con el `Text` de antes no se notaba; con una prop tipada sí. Es el tipo de detalle que justifica migrar a componentes con contrato.
2. **Mi propio script no compilaba** porque su comentario de cabecera contenía `*/` (al escribir «no va como `{/* … */}`»), y eso **cierra el bloque de comentario**. Se reescribió. La trampa de los comentarios en JSX ya había costado dos intentos en el sentido contrario; ahora está pagada en los dos sentidos.

`tsc` limpio, guardia **`hex 190 · fontSize 2981 · borderRadius 1256`** (baja también el radio), APK compilado e instalado, y la pantalla `food-orders` abre con sus pestañas sin errores de JavaScript.

**Lo que NO está verificado:** el modal abierto. Para verlo hace falta un pedido **entregado** en una cuenta **de restaurante**, y esta no lo es. Es el mismo límite que con `food-orders` y `food-owner`: la mitad de estos modales son de roles que esta cuenta no tiene. **Queda para el dueño o para una cuenta de restaurante.**

---

## 20. El feed de vídeo: **el kit no servía sobre negro** (y se le dio lo que le faltaba)

`app/lifebook-videos.tsx`, script `pruebas/fase2-vacios-videos.cjs`. Este archivo llevaba en el censo desde el principio y **no era pereza**: al ir a adoptar el kit apareció un problema real que ninguna tanda anterior había tenido.

**El problema, con la evidencia delante:** la pantalla fuerza **fondo negro** (`backgroundColor: '#000000'` en `s.center`) y escribe su texto **en blanco a mano** (`brand.white` en `errTitle`, `rgba(255,255,255,0.7)` en `errSub`). El `EmptyState` y el `InlineError` del kit pintan con **los colores del tema** — en tema claro, texto oscuro. Adoptarlos tal cual habría dejado **texto oscuro sobre negro: ilegible**. Es decir, la adopción «correcta» según el informe habría sido una regresión de accesibilidad.

**Lo que se hizo, en vez de copiar los colores a mano otra vez:** darle al kit lo que le faltaba.

- `EmptyState` y `InlineError` aceptan ahora **`sobreOscuro`**: usan blanco (y blanco translúcido) en vez de los colores del tema. Está documentado en ambos componentes con el porqué, para que no se use por gusto sino porque la superficie es oscura de verdad.
- En esta pantalla se adoptan los dos con `sobreOscuro`, **conservando la copia** y el reintento. El error, además, ahora **se anuncia al lector de pantalla y vibra**, cosa que el bloque escrito a mano no hacía.
- Se retiraron los cuatro estilos que quedaron muertos (`errTitle`, `errSub`, `retry`, `retryText`).

**Verificado en el aparato, y salió una cosa que no esperaba:** al abrir el feed apareció **«No se pudieron cargar los vídeos. Sesión inválida o expirada»** con su **«Reintentar»**. O sea, la rama de error se dibuja con el componente del kit y su reintento ✓. **Y de paso quedó al descubierto un fallo real del backend**: el endpoint del feed de vídeo responde **«Sesión inválida o expirada»** con esta cuenta. No es de diseño y no lo arreglo yo, pero **conviene que lo mires**: el feed de vídeo no carga por eso, no por la pantalla.

**Lo que NO está verificado:** el **vacío** («Todavía no hay vídeos aquí»), porque el error ocurre antes de que la lista llegue a estar vacía. Y el **color blanco** no lo puedo ver (modelo sin visión): lo que verifico es que la rama que se dibuja es la que pasa `sobreOscuro`. **Míralo tú**: es un cambio que se ve.

**Guardia:** `fontSize` baja de 2981 a **2978** y `borderRadius` de 1256 a **1255** (los cuatro estilos muertos). Base re-fijada. El censo, regenerado: **20 archivos** con `EmptyState` del kit y **12** con `InlineError`.

---

## 21. Los dos `EmptyState` DUPLICADOS dentro de la app (`food.tsx` y `ecomerse.tsx`)

Scripts `pruebas/fase2-vacios-duplicados.cjs` y `-remate.cjs`. Este es el caso más claro —y más caro— del problema que la auditoría llama **«el coste de no tener un patrón»**: el kit hizo un `EmptyState`, y estos dos archivos **definían el suyo** con otra API (`title` / `subtitle` / `emoji` / `action: { label, kind, onPress }`). Tres formas de hacer lo mismo en el mismo producto, y la app sin una sola manera de enseñar un vacío.

**Antes de migrar hubo que darle al kit lo que estos vacíos ya hacían**, para que la adopción no perdiera nada:

- **`accionPrimaria`** (nuevo en `EmptyState`): los vacíos viejos distinguían la acción principal (`kind: 'primary'`, botón relleno) de la secundaria (`'ghost'`), y el kit solo tenía botón de contorno. Sin esto, «Registra tu restaurante» y «Publicar mi primer producto» —lo que se quiere que el usuario haga— habrían perdido el peso.
- `sobreOscuro` ya estaba de la tanda anterior.

Después se migraron los tres usos y **se borraron las dos definiciones locales**. Los estilos `s_empty` se revisaron uno a uno: en `food.tsx` se retiró el bloque entero; en `ecomerse.tsx` **se quedan** `btnPrimary` y `btnGhost` porque los usa **otra cosa** (el reintento de su rama de error y el botón de cerrar la previsualización de la imagen). El script comprueba los usos antes de borrar: no se quita un estilo porque su dueño haya desaparecido, se quita porque **ya no lo usa nadie**.

**Verificado en el aparato:** las dos pantallas siguen dibujándose con datos reales (`food`: «9 restaurantes»; `ecomerse`: sus productos) y `logcat` sin errores.

**Lo que NO está verificado, y lo intenté:** el **vacío** de ninguna de las dos. Ambas listas tienen datos, y mi intento de forzarlo —buscar `zzzqx` en el Mercado para que saliera «Sin resultados con estos filtros»— **no llegó a filtrar** (el texto no entró en el buscador). Queda por ver, y ahora es más fácil de ver que antes: es un solo componente.

**Siguiente en `ecomerse.tsx` (anotado, no a medias):** su **rama de error** sigue escrita a mano (📡 + «Algo salió mal» + reintento con estilo propio) y es candidata a `InlineError`, como se hizo en `lifebook-vistos`.

**Guardia:** `fontSize` 2978 → **2971** y `borderRadius` 1255 → **1253** (los literales de los dos vacíos y los estilos muertos de `food.tsx`). Base re-fijada.

---

## 22. La rama de error del catálogo (`ecomerse.tsx`) pasa a `InlineError`

Script `pruebas/fase2-error-ecomerse.cjs`. Era un bloque a mano: 📡 + «Algo salió mal» + el mensaje + un botón «Reintentar» con estilo propio (`s_empty.btnPrimary`). El `InlineError` del kit dice lo mismo y además **se anuncia al lector de pantalla y vibra**, cosa que el bloque a mano no hacía. Mismo criterio que en `lifebook-vistos` (§17): **el vacío y el error son dos cosas distintas y se ven distintas**.

Se conservó el sentido del texto («No pudimos cargar el catálogo.» + el mensaje del servidor) y el script comprobó los usos **antes** de borrar el estilo huérfano: `s_empty.btnPrimary` se retiró porque ya no lo usaba nadie, mientras que `btnGhost` se queda (lo usa el botón de volver del buscador por foto). `tsc` limpio y guardia **`fontSize 2967 · borderRadius 1252`**.

**Lo que NO está verificado, y lo intenté:** la rama de error. Corté los datos del teléfono y abrí el catálogo con la app recién arrancada: la pantalla **no llegó a pintar el error** (se quedó en carga y, al devolver la red, dibujó sus «9 productos»). O el catálogo conserva datos en memoria, o el fallo tardó más que mi espera. **No digo que funcione: digo que compila y que el camino con datos sigue bien.**

**Lo que queda de esta pantalla:** el bloque de «No encontramos productos similares» (buscador por foto) sigue escrito a mano y es candidato al mismo tratamiento.

---

## 23. La búsqueda por foto del Mercado: **dos defectos arreglados y el fallo de verdad, confirmado**

Script `pruebas/fase2-busqueda-foto.cjs`. El dueño lo dijo así: «creo que ni funciona de lejos». **Tenía razón, y además la app lo contaba mal.** Dos defectos, los dos en el código:

**1. Mientras busca, la pantalla se contradecía.** El encabezado del modo foto dice «🔍 Resultados de tu foto · Buscando productos similares…» y, a la vez, el `ListEmptyComponent` decía «No encontramos productos similares»: esa rama **no miraba `imageBusy`**. Lo primero que veía el usuario al elegir la foto era un «no hay nada» que además era falso.

**2. Un fallo se disfrazaba de «sin resultados».** En el `catch` de `searchByPhoto` se hacía `setImageResults([])` + un `Alert`, y `imageActive` seguía activo. Es decir: si la subida fallaba (red, servidor, formato), el usuario leía **«No encontramos productos similares. Prueba con otra foto más nítida»** — se le culpaba a su foto de un fallo que no era suyo. Es exactamente el patrón que persigue la auditoría (D-03/D-47).

**Lo que se hizo:** estado `imageError`; el fallo se enseña **en la pantalla** con `InlineError` (que lo anuncia y trae reintento, aquí «Elegir otra foto»), el `Alert` se retira, y **los tres estados quedan separados**: mientras busca → indicador de carga; si falla → error con salida; solo si de verdad no hay resultados → `EmptyState` del kit con «← Volver al catálogo». De paso, `s_empty` desapareció entero de este archivo.

**Verificado en el aparato, de principio a fin:**

| Paso | Resultado |
|---|---|
| Pulsar «Buscar por foto» | Se abre el **selector de fotos del sistema** ✓ (el punto de entrada funciona) |
| Elegir una foto | La app entra en modo foto y busca |
| Resultado | «🔍 Resultados de tu foto · 0 productos similares» **y** «No se pudo procesar la imagen. Prueba con otra foto más nítida.» con **«Elegir otra foto»** |

Ahí están las dos cosas a la vez: **el arreglo funciona** (un fallo ya no se disfraza de «sin resultados», y ofrece salir) y **la búsqueda por foto falla de verdad contra el backend**.

**Lo que NO pude averiguar: por qué falla — pero he descartado tres sospechosos** (y me corrijo: el primero que escribí aquí, el `FormData`, era falso):

| Sospechoso | Veredicto | Evidencia |
|---|---|---|
| La construcción del `FormData` | **Descartado** | `lifebook.uploadFile` (que sí sube ficheros) usa **exactamente el mismo patrón**: `form.append('file', { uri, name, type } as unknown as Blob)` |
| El endpoint no existe | **Descartado** | `POST /api/ecomerse/search/image` responde **401**, no 404: la ruta está |
| Falta `auth: true` en la llamada | **Descartado** | `api/ecomerse.ts:157-161` lo lleva, y el cliente adjunta `Authorization: Bearer` también con `FormData` (`httpClient.ts:114-122`) |

**Lo que sí queda, con la evidencia del registro:** la búsqueda **no** falló en la capa de red — el `[http]` del cliente registra los fallos de red con `[http] red falló en <ruta>`, **y esa línea no apareció**. Y el error llegó **sin mensaje**, que es lo que pasa cuando la respuesta es un **error HTTP cuyo cuerpo no trae mensaje**. El sospechoso que queda es un **401** (mi prueba sin token dio 401), o sea **la sesión/token de esa llamada**, no el código del cliente.

**Para cerrarlo hace falta tu lado:** mira en el servidor si el `POST /api/ecomerse/search/image` **llega** y con qué código responde. Con eso se sabe en un minuto si es sesión o es el servidor, y no hay que adivinar más. Mientras tanto, la app **ya dice la verdad** en vez de culpar a la foto.

**…y al final de la jornada apareció la pista buena, que puede cerrarlo todo: la sesión de esta cuenta se perdió.** La app abrió en la **pantalla de inicio de sesión** (teléfono prefijado `+240999`). Eso reencuadra los «fallos»:

| Lo que vi | Cómo encaja |
|---|---|
| El feed de vídeo: **«Sesión inválida o expirada»** | Es literalmente eso, y lo decía el servidor |
| La búsqueda por foto: error **sin mensaje**, y mi prueba sin token daba **401** | Un 401 por token caducado encaja con «sin cuerpo con mensaje» |
| El sondeo **`/lifebook/chat/unread`** fallando repetido | Endpoint autenticado |
| Ráfagas de `Network request failed` en varias pantallas | Coherente con sesión y red a la vez |

**Lo que hay que hacer ahora (es tuyo, y es rápido):** 1) **iniciar sesión otra vez** en el teléfono; 2) **repetir la búsqueda por foto** y **abrir el feed de vídeo** — si funcionan, los «fallos» eran la sesión, y mi arreglo de la búsqueda por foto (que ahora dice la verdad en vez de culpar a la foto) es lo único que hacía falta ahí; 3) si **siguen fallando con la sesión nueva**, entonces sí es del endpoint, y con el registro del servidor se cierra en un minuto.

**Lección para el informe:** antes de dar un fallo por «del backend» o «del código», **mira si la app sigue con sesión**. Cuatro pantallas me dieron síntomas distintos de lo mismo y las estuve tratando como cuatro casos.

*(Nota de la última tanda: el `Sheet` de reportar anuncio —`ecomerse-detail`— **compila, pasa la guardia y está instalado**, pero **no se pudo ejercitar en pantalla**: con la app pidiendo iniciar sesión no hay ficha de producto que abrir. No lo doy por verificado.)*

---

## 24. Tres vacíos pequeños del censo (y la guardia obligando a usar la escala)

Script `pruebas/fase2-vacios-pequenos.cjs`. Tres archivos que se leen enteros:

| Archivo | Antes | Ahora |
|---|---|---|
| `ecomerse-planes.tsx` | 🏪 + «Todavía no tienes tienda» + por qué + botón a mano | Al kit, **conservando la acción como primaria** («Abrir mi tienda» es LA acción de esa pantalla) |
| `food-menu.tsx` | 🍽️ + «Todavía no hay ítems en el menú» + por qué | Al kit, **sin acción**: es una espera (la carta la publica el restaurante), y aquí no se inventa botón |
| `alquiler-publicar.tsx` | «Aún no has publicado anuncios.» — una línea suelta, sin título ni por qué | Vacío del kit en forma **compacta** (vive dentro de la pantalla de publicar y no debe competir con el formulario) |

**La guardia hizo su trabajo y me obligó a hacerlo mejor.** Al primer intento **falló**:

```
FALLO: 1 archivo(s) han empeorado respecto a la base:
  app/alquiler-publicar.tsx → fontSize: 39 → 40
```

Yo había puesto `fontSize: 34` en el emoji del icono: **un literal más en ese archivo**, aunque el total de la app bajara (2965 → 2963). El trinquete es **por archivo**, no solo por total, así que no coló. La solución buena no era re-fijar la base sino **usar la escala que llevaba desde la Fase 2 declarada y sin usar**: `fontSize: tipografia.display`. Con eso el archivo no empeora, el total baja a **`fontSize 2962 · borderRadius 1250`**, y de paso queda **una pantalla usando por fin `escalas.ts`** — que es parte del punto D del plan.

**Verificado en el aparato:** compila, instala, las dos pantallas alcanzables abren y **`logcat` sin errores de JavaScript**.
**Lo que NO se vio:** los vacíos en sí. `ecomerse-planes` no dibujó ninguno de los textos que buscaba y `alquiler-publicar` se quedó en su cabecera «Publicar» (esta cuenta tiene anuncios, así que su rama de lista vacía no sale). Queda pendiente, como los otros vacíos: **el componente ya está verificado en otras pantallas**, lo que falta es ver estos tres casos concretos.

---

## 25. El vacío del buscador de Life Book (y uno que se deja a propósito)

Script `pruebas/fase2-vacio-buscador.cjs`. El de **resultados** pasa al kit (`compacto`, conservando la consulta entre comillas, que es información útil: «No encontramos contenido para "zzzqx". Intenta con otra palabra.»). El otro, «Todavía no hay tendencias en tu ciudad», **se deja a propósito**: va justo **debajo del título de su sección** («Tendencias en {ciudad}») y `EmptyState` exige título propio, así que adoptarlo **duplicaría el encabezado** — mismo criterio que en `food-orders` y `lifebook-inbox-followers`. Queda escrito para que no parezca un olvido.

`tsc` limpio, guardia **`fontSize 2960 · borderRadius 1250`** y **APK compilado e instalado** en el teléfono.

**Y un límite de herramienta que conviene que quede escrito:** no pude ver ese vacío. `adb shell input text` **no entra en los `TextInput`** de este teléfono: lo intenté en el buscador del Mercado y aquí, y en los dos casos el texto se quedó fuera (la pantalla siguió en «Recientes»). Para la próxima vez, la vía que **sí** funciona es la que ya se usó: buscar un dato en el servidor y navegar a una pantalla que lo muestre, o tocar un chip/atajo de la propia app en vez de teclear. **No es un fallo de la app: es de mi forma de tocarla.**

*(De paso: el teléfono se desconectó a mitad de la tanda —`adb: no devices/emulators found`— y volvió al reiniciar el servidor de adb con `adb kill-server; adb start-server`. Si vuelve a pasar, ese es el arreglo.)*

---

## 26. Punto D — Barrido de escalas, tanda 1: **1.545 literales a la escala, sin mover un píxel**

Script `pruebas/fase2-escalas-tanda1.cjs`. `escalas.ts` llevaba declarado desde la Fase 2 y **la app no lo usaba**: 2.960 `fontSize` y 1.250 `borderRadius` escritos a mano. Esta tanda lleva a la escala **solo los valores que valen exactamente lo mismo**:

| Antes | Ahora | | Antes | Ahora |
|---|---|---|---|---|
| `fontSize: 11` | `tipografia.micro` | | `borderRadius: 8` | `radios.sm` |
| `fontSize: 12` | `tipografia.caption` | | `borderRadius: 12` | `radios.md` |
| `fontSize: 14` | `tipografia.body` | | `borderRadius: 16` | `radios.lg` |
| `fontSize: 16` | `tipografia.subtitle` | | `borderRadius: 999` | `radios.full` |
| `fontSize: 20` | `tipografia.title` | | | |
| `fontSize: 28` | `tipografia.display` | | | |

**Resultado: 169 archivos, 1.004 `fontSize` y 541 `borderRadius`** convertidos. `tsc` limpio.

**Y aquí está la parte importante: cero cambio visual, y está MEDIDO, no supuesto.** Antes del barrido apunté los `bounds` de la pantalla de resultados de Ciudad a Ciudad (una cuyos datos no han cambiado); después del barrido son **idénticos al píxel**:

| Elemento | Antes | Después |
|---|---|---|
| Título «Viajes disponibles» | 315-403 | **315-403** |
| Texto de salida | 439-571 | **439-571** |
| Primera tarjeta | 607-1115 | **607-1115** |
| Segunda tarjeta | empieza en 1151 | **1151** |

**La guardia:** `fontSize` **2960 → 1956** (−1.004) y `borderRadius` **1250 → 709** (−541), sin que ningún archivo empeore. Base re-fijada.

**Lo que NO se toca en esta tanda, a propósito:** los fraccionarios (`11,5`, `12,5`, `13,5`) y el `13`. Llevarlos a la escala **mueve píxeles** (13 → 14, o 12,5 → 12), y eso es una decisión de diseño que se hace **por pantallas y mirándolo**. Meterlo ahora sería esconder un cambio visible dentro de un barrido que parece inocuo. Queda también el **espaciado** (46 valores, solo 47 % múltiplos de 4).

**Corrección de una observación mía anterior:** dije que el monedero mostraba «hoy puedes recargar hasta **0 XAF**» y que eso parecía un fallo. Al volver hoy, esa cuenta tiene **60.075 XAF**, «En garantía: 5.500 XAF» y topes de **100.000 XAF**, con movimientos reales («Cobro liberado», 17 sept). **Los ceros eran porque el monedero estaba vacío**, no un fallo. Queda corregido aquí para que nadie lo persiga.

---

## 27. Barrido de escalas, tanda 2: los valores que **sí** mueven píxeles (y un error mío, reparado)

Scripts `pruebas/fase2-escalas-tanda2.cjs` y `-repara.cjs`. La tanda 1 fue gratis (valores idénticos). Esta toca los valores que estaban **entre dos pasos** de la escala, con una **política escrita**:

| Antes | Ahora | Delta | Cuántos |
|---|---|---|---|
| `13` | `tipografia.body` (14) | **+1** | 584 |
| `12,5` | `tipografia.caption` (12) | −0,5 | 332 |
| `11,5` | `tipografia.caption` (12) | +0,5 | 283 |
| `13,5` | `tipografia.body` (14) | +0,5 | 174 |

**Política:** se redondea al paso más cercano y, en empate, **hacia arriba** (texto algo mayor antes que menor: la Fase 1 subió suelos de lectura a propósito). El `13` empata y sube a 14 — y además es lo que dice el propio `escalas.ts`: «el cuerpo de la app sube a 14 (antes vivía entre 11 y 13 px)».

**El error que cometí, y por qué el proceso lo cazó:** el patrón del `13` era `fontSize:\s*13(?!\d)`. El lookahead excluía otro **dígito** pero **no el punto**, así que también capturó el `13.5` y dejó **`fontSize: tipografia.body.5`** — que no es nada. El `tsc` lo dijo en el acto, en ~150 archivos (`TS1005 «',' expected»`), y se reparó con un script aparte: **174 sitios en 76 archivos**. Que el fallo fuera *evidente y ruidoso* es lo que se busca: una sustitución masiva que fallara en silencio sería mucho peor.

**La guardia:** `fontSize` **1956 → 757** (−1.199) y `borderRadius` sin cambios (709), sin que ningún archivo empeore. Base re-fijada.

**Verificado en el aparato:** compila, instala y el monedero dibuja con desplazamientos **pequeños y en la dirección prevista** — «Saldo disponible» pasa de 486 a 491 px de alto y de 526 a 560 de ancho (el texto creció: es lo que se pidió), y lo de abajo se desplaza 5 px en consecuencia. `logcat` sin errores de JavaScript.

**Dónde mirar primero** (archivos con más cambios, para el ojo del dueño): `taxi.tsx` (36), `GroupManageSheet.tsx` (35), `lifebook-chat/[id].tsx` (33), `food-checkout.tsx` (30), `food-rider.tsx` (26), `lifebook-order/[id].tsx` (26).

**Lo que NO se toca, y por qué:** los valores a **más de 1 px** de cualquier paso (`9`, `10`, `14,5`, `15`, `17`, `22`…). Llevarlos a la escala no es un barrido, es **rediseñar tamaños**, y algunos son excepciones legítimas (los emojis de 34-40 de los vacíos). Eso va por pantallas y mirándolo. Queda también el **espaciado** (46 valores, solo 47 % múltiplos de 4).

---

## 28. El vacío de «Mis viajes» (un cabo suelto mío) y una etiqueta rota

Script `pruebas/fase2-vacio-mis-viajes.cjs`. Cuando convertí el paso de «Mis viajes» en `SectionList` (informe §13.6) moví el aviso de «no hay viajes» a `ListEmptyComponent` **dejándolo como un `Text` pelado**: era el único vacío que quedaba así de una tanda mía. Ahora usa el componente del kit, y el texto cambia de sentido a mejor: el antiguo decía **«Pulsa + para crear uno»**, pero ese `+` **solo se dibuja con perfil de conductor aprobado** — el vacío mandaba a pulsar algo que puede no estar ahí. Ahora dice qué lo llena.

El emoji del icono usa `tipografia.subtitle` en vez de un número: la guardia **no sube** (`fontSize` sigue en 757).

**Dos cosas que salieron al ir a verificarlo:**

1. **No se pudo ver el vacío**: esta cuenta **ya tiene un viaje publicado** («4/4 asientos · Programado», «Pasajero E2E»), así que la lista no está vacía. Sin datos que borrar, no hay forma de ejercitarlo.
2. **Y salió una etiqueta rota de verdad**: la cabecera de sección de ese viaje dice **«? → ? · 1 viaje»**. Los `?` son los valores de reserva de la etiqueta (`t.route?.originDistrict ?? '?'`), o sea que **ese viaje no trae origen ni destino**. No es de diseño y no lo arreglo yo, pero **un viaje publicado sin ruta visible es un problema de datos que conviene mirar**: si el servidor no guarda los distritos, todos los viajes del conductor se verán así.
