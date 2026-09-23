# Auditoría de rendimiento percibido — EG Route Plan (React Native / Expo)

**Alcance:** auditoría **solo sobre fuente** (`D:\egapp\app`, `D:\egapp\components`, `D:\egapp\api`, `D:\egapp\hooks`, `D:\egapp\packages`).
**Método:** lectura estática con `grep`/`read`. **No se ejecutó la app, no hubo dispositivo, no hay servidor local, no hay FPS ni métricas de memoria.**
**Regla de honestidad:** todo lo que depende de medir en hardware real está marcado como **requiere validación en dispositivo**. No se inventan cifras, milisegundos ni tamaños de payload; donde el código no permite saber un número, se dice explícitamente.

---

## 0. Verificación del contexto medido

El contexto de partida se verificó y **se corrigió**. Conteo reproducible limitado a las carpetas de fuente (`app/`, `components/`, `api/` — 228 archivos `.ts`/`.tsx`):

| Métrica | Valor aportado | Valor verificado | Veredicto |
|---|---|---|---|
| Apariciones de `.map(` en render | 543 | **602** en `app/`+`components/`+`api/` · **456** solo en `app/` · **644** en todo el árbol fuente | Aproximado. El número real es **mayor**, no menor |
| `ScrollView` vs `FlatList` | 431 / 90 | **167** `<ScrollView` · **58** `<FlatList` (228 archivos fuente) | **431 no se reproduce.** La proporción real es ≈ **2,9 : 1** (no 4,8 : 1) |
| `<Image>` RN vs `expo-image` | 122 / 44 | **138** `<Image` · **57** líneas de `expo-image` (imports + usos) | `expo-image` está **más** presente de lo indicado |
| `setInterval`/`setTimeout` | 53 en 26 archivos | **52** en **29** archivos (`app/`+`components/`: 18 `setInterval` + 34 `setTimeout`) | **Confirmado** (≈53). Los archivos con temporizadores son 29, no 26 |
| `ActivityIndicator` | 314 | **220** en `app/`+`components/`+`api/` · **226** en todo el árbol fuente | **Sobreestimado**; el real es ~220 |

> Conclusión de la verificación: el diagnóstico global de "app llena de `ScrollView` y `ActivityIndicator`" **se sostiene**, pero conviene corregir la magnitud. Hay bastante más `FlatList` y bastante más `expo-image` del que sugiere el contexto, y ambas cosas son buenas noticias. Los problemas reales no están en el *volumen* de estas construcciones, sino en **qué pantallas concretas** usan cada patrón — y ahí el patrón es muy claro (ver §1).

---

## 1. Listas largas reales, ordenadas por riesgo de atasco

Criterio de riesgo para un Android de gama baja (CPU y RAM limitadas, Hermes, sin GPU de sobra):
`riesgo = (nº de elementos que puede alcanzar) × (coste por fila) ÷ (¿virtualiza?)`.
Una lista **sin paginación del servidor y sin virtualización** con filas pesadas es el peor caso posible: crece toda la vida del usuario y se re-renderiza entera cada vez.

### 1.1 Ranking

| # | Lista | Pantalla (evidencia) | Contenedor | Paginación del servidor | Máximo que puede renderizar | ¿Virtualiza? | Imágenes remotas |
|---|---|---|---|---|---|---|---|
| **1** | **Historial de viajes de taxi** | `app/trips-history.tsx:74` (ScrollView) + `:83` `trips.map` | `ScrollView` + `.map()` | **NINGUNA** — `api/taxi.ts:94-95` → `GET /mobility/trips/history` sin `limit`, sin `cursor` | **Ilimitado.** Un viaje por trayecto completado/cancelado: un usuario diario acumula cientos en meses y miles en años | ❌ | No |
| **2** | **Mis tickets (Ciudad a Ciudad)** | `app/my-tickets.tsx:58` (ScrollView) + `:70` `tickets.map` | `ScrollView` + `.map()` | **NINGUNA** — `api/intercity.ts:105` → `GET /intercity/bookings/mine` sin `limit` | **Ilimitado.** Un ticket por reserva | ❌ | No |
| **3** | **Feed principal de Life Book** | `app/lifebook.tsx:943-945` `data={[{ left: leftCol, right: rightCol }]}` + `:950`/`:963` `.map` | `FlatList` **de UN SOLO ítem sintético** | Sí (cursor + `onEndReached` `:981`) | **Ilimitado**: cada página *se acumula dentro del único ítem* | ❌ **anulada por diseño** | **Sí** (`PostCard` con `expo-image`) |
| **4** | **Mis viajes intercity + reservas anidadas** | `app/intercity-publish.tsx:370` `groups.map` → `:375` `list.map` → `:391` `bookings.map` | `ScrollView` + **3 `.map()` anidados** | **NINGUNA** — `api/intercity.ts:91` → `GET /intercity/trips/mine` | **viajes × reservas.** 200 viajes × 6 reservas ≈ **1 200 filas** de texto | ❌ | No |
| **5** | **Pedidos del mercado (compras/ventas)** | `app/ecomerse-orders.tsx:160` (ScrollView) + `:197` `orders.map` | `ScrollView` + `.map()` | **NINGUNA** — `api/ecomerse.ts:117` → `/ecomerse/orders?as=` | **Ilimitado.** Un pedido por compra/venta | ❌ | No |
| **6** | **Movimientos del monedero** | `app/monedero-movimientos.tsx:111` (ScrollView) + `:117` `items.map` | `ScrollView` + `.map()` | **Sí, cursor de 25** (`api/wallet.ts:88`), pero `:67` **acumula** con `[...prev, ...]` | **Ilimitado por acumulación**: 25 → 50 → 75… cada pulsación de «Cargar más» | ❌ | No |
| **7** | **Mis publicaciones (tienda)** | `app/lifebook-merchant-products.tsx:249` (ScrollView) + `:269` `visibles.map` | `ScrollView` + `.map()` | **NINGUNA** — `api/commerce.ts:435` → `/my/products` | **Ilimitado** en un vendedor activo | ❌ | **Sí** (`:278`, expo-image) |
| **8** | **Viajes disponibles intercity** | `app/intercity.tsx:208` (ScrollView) + `:243` `trips.map` | `ScrollView` + `.map()` | **NINGUNA** | Acotado por la oferta de la ruta, **pero** `:121-122` agrega **todas las rutas** que devuelva el backend en un solo array | ❌ | **Sí** (`:248`, `:250`, `LazyImage`) |
| **9** | **Galería de fotos** | `components/PhotoGallery.tsx:94-101` (ScrollView horizontal paginado) + `:108` `urls.map` | `ScrollView` horizontal | N/A | Nº de fotos del inmueble/habitación. **Todas se montan y descargan a la vez** | ❌ | **Sí**, a ancho completo de pantalla |
| **10** | Habitaciones del hotel | `app/lifebook-hotel-habitaciones.tsx:182` + `:218` `visibles.map` | `ScrollView` + `.map()` | NINGUNA | Decenas (bajo) | ❌ | Sí (`:234` `LazyImage`) |
| **11** | Mis órdenes de planes | `app/billing-status.tsx:289` `orders.map` | `ScrollView` + `.map()` | NINGUNA (`api/billing.ts:42`) | Bajo (unas pocas al año) | ❌ | No |
| **12** | Cola del panel del agente | `app/agente.tsx:127` + `:159`/`:199` | `ScrollView` + 2 `.map()` | NINGUNA | **Bajo y auto-limitado** (solo tareas pendientes) | ❌ | No |

### 1.2 Las que **sí** están bien (contraste útil, no tocar)

Sirven de plantilla interna: el equipo ya sabe hacerlo.

| Lista | Evidencia | Patrón correcto |
|---|---|---|
| Restaurantes | `app/food.tsx:173-181` | `FlatList` + `keyExtractor` + `onEndReached` + esqueletos `:147` |
| Pedidos de comida | `app/food-orders.tsx:318-325` | `FlatList` + paginación + `OrdersSkeleton:771` |
| Catálogo del mercado | `app/ecomerse.tsx:181-189` | `FlatList` `numColumns={2}` + `keyExtractor` + esqueletos |
| Feed de vídeo vertical | `app/lifebook-videos.tsx:531,557,561` | `FlatList` + `getItemLayout` + `windowSize={3}` + `maxToRenderPerBatch={1}` — **el mejor de la app** |
| Perfil de usuario | `app/lifebook-user.tsx:432,884` | `FlatList` + `onEndReached` paginado |
| Alquileres | `app/alquiler.tsx:163-165` | `FlatList` + `data={filtered.slice(0, visibleCount)}` |
| Historial del panel de hotel | `app/lifebook-hotel-panel.tsx:273` | **`historial.slice(0, 20)`** — tope duro explícito ✅ |

### 1.3 El caso más grave: el feed principal

`app/lifebook.tsx:943-975` implementa el *masonry* de 2 columnas como una **`FlatList` con un único ítem**:

```jsx
<FlatList
  data={[{ left: leftCol, right: rightCol }]}   // ← UN solo ítem
  keyExtractor={() => 'masonry'}
  renderItem={({ item }) => (
    <View style={styles.masonryRow}>
      <View style={styles.masonryCol}>{item.left.map((post) => <PostCard … />)}</View>
      <View style={styles.masonryCol}>{item.right.map((post) => <PostCard … />)}</View>
    </View>
  )}
  onEndReached={loadMore}                        // :981
  onEndReachedThreshold={0.5}
/>
```

Esto es lo peor de ambos mundos: **se paga el coste de una `FlatList` y no se obtiene ninguna virtualización**. Con `data.length === 1` la lista **nunca puede reciclar nada**: renderiza el ítem entero, que contiene *todos* los posts de *todas* las páginas ya cargadas. `onEndReached` sigue funcionando (se dispara al llegar al final del ítem gigante), así que **la memoria crece indefinidamente mientras el usuario hace scroll**.

Agravante: cada `PostCard` monta `expo-image` con foto/vídeo (`components/lifebook/PostCard.tsx:116,195`). Con la virtualización anulada, **todas las imágenes del feed están montadas simultáneamente**.

El mismo truco aparece en:
- `app/lifebook-search.tsx:396` → `keyExtractor={() => 'search-masonry'}`
- `app/lifebook-explore.tsx:254` → `keyExtractor={() => 'explore'}`

**Mitigación honesta:** que el *masonry* sea la causa principal del atasco **requiere validación en dispositivo** (depende del número de posts cargados y del tamaño de las imágenes). Lo que **sí** es un hecho de código, no una hipótesis, es que la virtualización está estructuralmente anulada.

---

## 2. Imágenes remotas, `key` y trabajo pesado dentro del render

### 2.1 ¿Renderizan imágenes remotas?

| Lista | ¿Imagen remota? | Evidencia |
|---|---|---|
| 3. Feed Life Book | **Sí**, una o varias por tarjeta | `components/lifebook/PostCard.tsx:116,195` (`expo-image` + `cachePolicy="memory-disk"`) |
| 7. Mis publicaciones | Sí, miniatura por fila | `app/lifebook-merchant-products.tsx:278` |
| 8. Viajes intercity | Sí, avatar por tarjeta | `app/intercity.tsx:248,250` (`LazyImage`) |
| 9. Galería de fotos | Sí, **todas a ancho completo** | `components/PhotoGallery.tsx:109` |
| 10. Habitaciones del hotel | Sí, portada por fila | `app/lifebook-hotel-habitaciones.tsx:234` (`LazyImage`) |
| 1, 2, 4, 5, 6, 11, 12 | No (solo texto/iconos) | — |

**Dato clave sobre las no-imagen:** las listas **más peligrosas por crecimiento (1, 2, 4, 5, 6) no tienen imágenes**. Eso significa que su atasco es **100 % hilo de JS** (creación de nodos + formateo), no red ni decodificación. Es un problema más barato de arreglar que el del feed.

### 2.2 `key`: ¿estable o índice?

**Veredicto: en las listas largas la `key` es estable.** No hay un problema de reciclado por índice en las listas que importan:

| Lista | `key` | Estable |
|---|---|---|
| Historial de viajes | `trips-history.tsx:86` `key={t.id}` | ✅ |
| Mis tickets | `my-tickets.tsx:75` `key={t.id}` | ✅ |
| Feed Life Book | `lifebook.tsx:952,965` `key={post.id}` | ✅ |
| Viajes intercity (anidado) | `intercity-publish.tsx:376` `key={t.id}`, `:392` `key={b.id}` | ✅ |
| Pedidos del mercado | `ecomerse-orders.tsx:209` `key={o.id}`, `:216` `key={it.productId}` | ✅ |
| Movimientos del monedero | `monedero-movimientos.tsx:120` `key={t.id}` | ✅ |
| Mis publicaciones | `lifebook-merchant-products.tsx:275` `key={p.id}` | ✅ |

Los **38 usos de `key={i}`/`key={idx}`** que existen son, casi todos, legítimos: listas **estáticas** de longitud fija (esqueletos `[0,1,2].map`, estrellas de rating, teclado PIN, puntos de paginación). Los únicos discutibles son listas **mutables** donde el usuario borra elementos por el medio:

- `app/alquiler-publicar.tsx:486` — fotos de un anuncio, con `key={i}` y borrado por índice (`:138` `removePhoto`).
- `app/intercity-publish.tsx:510` — fotos de coche, `key={i}` con borrado `:512`.
- `app/ecomerse-seller.tsx:405` — `pPhotos.map((ph, i) => … key={i}` con borrado `:408`.

Al borrar el elemento *n*, React reutiliza el nodo de *n+1* en la posición *n*: es un **riesgo de correctitud y de re-render innecesario**, no de atasco. Cambiar a `key={uri}` o a un id local es trivial.

### 2.3 Trabajo pesado dentro del render

**a) Formateo de fecha/moneda por fila, en cada render, sin memoizar.**

Esto es el hallazgo transversal más repetido. Hermes no trae un `Intl` completo en todas las builds: construir un formateador de locale por fila y por render es caro.

| Evidencia | Qué se hace por fila |
|---|---|
| `app/monedero-movimientos.tsx:124` | `new Date(t.createdAt).toLocaleString('es-GQ', { day, month, year, hour, minute })` — **5 opciones de formato**, la variante más cara |
| `app/monedero.tsx:199` | Idem con 4 opciones (solo 8 filas, impacto bajo) |
| `app/my-tickets.tsx:83` | `toLocaleString('es')` **×2** por ticket (fecha + importe) |
| `app/trips-history.tsx:20,26,92,120` | `toLocaleString('es')` + `toLocaleDateString('es-ES', {…})` + `xaf()` por fila |
| `app/ecomerse-orders.tsx:262,294` | `toLocaleDateString('es')` + `toLocaleString('es', {…})` por pedido y por evento |
| **`app/intercity-publish.tsx:380,386,389`** | **`toLocaleDateString` + `toLocaleTimeString` + 2 `toLocaleString` = hasta 4 llamadas por viaje**, y además una por **cada reserva** en `:421` |
| `app/intercity.tsx:245,256,258,271,274` | `toLocaleString` + `toLocaleTimeString` + `toLocaleDateString` por viaje |

En `my-tickets.tsx` el efecto es directamente visible en el código: `openId` es estado del componente **padre** (`:24`) y las filas son JSX en línea, sin componente memoizado. **Al tocar un ticket para abrir su QR, se vuelven a ejecutar los `toLocaleString` de *todos* los tickets de la lista.** Lo mismo ocurre en `intercity-publish.tsx` cada vez que el sondeo de 15 s reemplaza el array `trips` (`:135`).

**b) `.filter().map()` encadenados y `filter`/`sort` sin memoizar en el render.**

| Evidencia | Observación |
|---|---|
| `app/lifebook-hotel-habitaciones.tsx:147-150` | `rooms.filter(…).slice().sort(…)` **en el cuerpo del render, sin `useMemo`** → se reordena en cada render (arrays pequeños: impacto bajo, pero es deuda) |
| `app/intercity-publish.tsx:140` | `trips.reduce((n, t) => n + (t.bookings?.filter(…).length ?? 0), 0)` **sin `useMemo`** → recorre viajes × reservas en cada render |
| `app/lifebook-merchant-products.tsx:96-101` | `visibles` **sí** usa `useMemo` ✅ (bien resuelto) |
| `app/lifebook.tsx:366-386` | `cards` y el reparto masonry **sí** usan `useMemo` ✅ (bien resuelto) |
| `app/intercity.tsx:121-123` | `Promise.all(rs.map(…)).flat()` + `Map` de deduplicación + `sort` por fecha — coste aceptable, pero ver §4.3 (cascada) |

**c) Cálculo O(n²) menor:** `app/documents.tsx:77,79` llama `labelOf()` y `prog.categories.flatMap((c) => c.docs).find(…)` dentro del `.map` sobre 5 códigos: 10 recorridos completos del catálogo. Con 5 elementos es irrelevante; se cita solo como patrón a no escalar.

---

## 3. Auditoría de los temporizadores

### 3.1 Hallazgo estructural: **no existe ninguna puerta por `AppState`**

```
grep -r "AppState" app/ components/ hooks/ api/ packages/   →  0 coincidencias en código propio
```

La única aparición de `AppState` en todo el árbol está en `node_modules/expo/src/dom/webview-wrapper.tsx`. **Ningún temporizador de la app se pausa cuando la app pasa a segundo plano.** Tampoco hay una puerta por foco en los *sondeos* (sí la hay para *cargar*, ver §4).

> **Requiere validación en dispositivo:** cuánto dura realmente el sondeo en segundo plano depende de cómo el SO limite el hilo de JS (Android suele seguir ejecutando `setInterval` un rato; iOS lo suspende antes). Lo que **no** es hipótesis es que la app no toma ninguna decisión al respecto: no hay código que lo intente.

### 3.2 Inventario completo

**Sonreos periódicos con petición de red (los que gastan batería y datos):**

| Archivo:línea | Intervalo | ¿Cleanup al desmontar? | ¿Para al perder foco / segundo plano? | ¿Para solo al terminar? |
|---|---|---|---|---|
| **`app/kyc/status.tsx:14` + `:40`** | **1 500 ms** ⚠️ | Sí (`:41-44`) | ❌ **No** | ❌ **No.** `isTerminal` se calcula (`:64`) y **solo se usa para pintar**; el intervalo nunca se detiene aunque el KYC ya esté `APPROVED`/`REJECTED` |
| **`components/DriverLiveMap.tsx:92` + `:180`** | **2 500 ms** | Sí (`:181`) | ❌ **No** (deps `[tripId]`, `:183`) | ✅ Sí, en `completed`/`cancelled` (`:132-139`) |
| **`app/taxi.tsx:132-141`** | **3 000 ms** | Sí (`:144`) | ❌ **No** | ✅ Sí, en `accepted`/`cancelled` (`:136-139`) |
| **`app/conductor.tsx:436`** | **4 000 ms** | Sí (`:437`) | ❌ **No** | ❌ No (sigue cada 4 s todo el turno) |
| **`app/lifebook-chat/[id].tsx:62` + `:220`** | **4 000 ms** | Sí (`:221`) | ❌ **No** | ❌ No |
| `app/lifebook-chat/[id].tsx:466` | variable | Sí | ❌ No | — |
| **`app/intercity-publish.tsx:136`** | 15 000 ms | Sí (`:137`) | ⚠️ **Pausa funcional, no por foco:** `:134` `if (mode !== 'list') return` ✅ | ✅ y además `mountedRef` (`:129-130`) — **el mejor patrón de sondeo de la app** |
| `app/food-orders.tsx:220` | 30 000 ms | Sí (`:221`) | ❌ No | ❌ No |
| `hooks/useUnreadChat.ts:23` + `:60` | 15 000 ms | ✅ Sí, **y se detiene con 0 suscriptores** (`:67-70`) | ❌ No en nativo. `:92-97` usa `visibilitychange`, que **solo existe en web** (el propio comentario lo admite) | N/A |
| `app/lifebook-hotel-panel.tsx:42` + `:86` | 20 000 ms | Sí (`:87`) | ❌ **No** — y usa **`useEffect`**, no `useFocusEffect` | ❌ No |
| `app/lifebook-hotel-reserva.tsx:43` + `:100` | 20 000 ms | Sí | ❌ No | ❌ No |
| `app/lifebook-merchant.tsx:44` + `:98` | 20 000 ms | Sí (`:99`) | ✅ **Sí: `useFocusEffect`** (`:95`) — modelo a copiar | — |
| `app/lifebook-hotel-reservas.tsx:90` | 30 000 ms | Sí | ❌ No | No se detiene al llegar al estado final |
| `hooks/useServerClock.ts:43` | 30 000 ms | Sí (`:46`) | ❌ No. Provoca **re-render completo** de quien lo use cada 30 s | N/A |
| `hooks/useWorkSearch.ts:79` | *debounce* 300 ms | Sí | N/A | N/A |
| `hooks/rental/useDebounce.ts:12` | *debounce* | Sí | N/A | N/A |
| `app/api/netprobe.ts:19,42` | timeout | Sí | N/A | N/A |

**Temporizadores de animación / simulación (no hacen red, pero ocupan el hilo de JS):**

| Archivo:línea | Intervalo | Observación |
|---|---|---|
| **`app/conductor.tsx:798`** | **250 ms** ⚠️ | **4 ticks/s.** Cada tick llama `setVehiclePos` (`:812`) y `navTick` → `setNavSpeed` (`:510`), y `mapRef.setNavView` (postMessage al WebView). En un componente de **1 981 líneas** con decenas de estados: **4 re-renders/s del árbol de la pantalla del conductor.** Solo se activa sin GPS real (`:791`), pero **si el permiso no está concedido se queda así indefinidamente** |
| `app/conductor.tsx:790` | 3 000 ms | Heartbeat GPS real (aceptable) |
| `app/conductor.tsx:350-354` | 15 000 ms | Countdown de oferta; **se autolimpia** (`:353`) ✅ |
| `app/conductor.tsx:707-711` | 60 000 ms | Modo noche del mapa; cleanup ✅ (también en `taxi.tsx:295-299`) |
| `app/lifebook-videos.tsx:817` | 15 000 ms | Autoguardado de progreso; **solo si `isActive && !paused`** ✅, cleanup ✅, y además guarda al perder foco y al desmontar (`:821-822`) — **ejemplar** |
| `app/conductor.tsx:443` | 6 000 ms | Aviso auto-borrable; cleanup ✅ |
| `components/status/StatusDetailModal.tsx:78,326` · `StatusChip.tsx:40` · `MapBackground.tsx:72` · `CommentsSheet.tsx:277` · `LocationPickerSheet.tsx:73` · `PostCard.tsx:70` | varios | Temporizadores puntuales de UI; todos con cleanup. `LocationPickerSheet.tsx:73` (debounce 350 ms de búsqueda) es correcto |

### 3.3 Los que más batería y datos consumen (por orden)

Cálculo de peticiones por hora **suponiendo que la pantalla permanece montada** (que es lo que hace el código; el efecto real del segundo plano **requiere validación en dispositivo**):

| # | Pantalla | Intervalo | Peticiones/hora | Por qué duele |
|---|---|---|---|---|
| **1** | `kyc/status.tsx` | 1 500 ms | **≈ 2 400** | Es el intervalo más agresivo de la app **y nunca se detiene**: el usuario puede dejar la pantalla de "estamos validando tu información" abierta y sigue sondeando para siempre, incluso tras aprobarse el KYC. Para un usuario en datos móviles prepago esto es el peor caso de la app |
| **2** | `conductor.tsx:436` | 4 000 ms | **≈ 900** | Es el **turno completo de trabajo** del conductor: turnos de 8 h × 900 = **~7 200 peticiones por turno**. Además, `load` (`:358-432`) es una función pesada que compara viaje a viaje |
| **3** | `DriverLiveMap.tsx` + `taxi.tsx` (**corren a la vez**) | 2 500 ms + 3 000 ms | **≈ 2 640 combinadas** | Efecto **multiplicado**: `useDriverLiveTrack` (`:180`) **y** `startPolling` (`:132`) son dos intervalos independientes; la mitigación de `taxi.tsx:255` (`tripId: status === 'accepted' ? tripId : null`) evita el solapamiento en `requested`, pero en `accepted` hay 2 sondeos simultáneos contra el mismo recurso |
| **4** | `lifebook-chat/[id].tsx:220` | 4 000 ms | ≈ 900 | `loadLatest` (`:205-211`) hace **varias** peticiones por tick: mensajes + `forzar()` de no leídos + `lifebookLiveApi.list` (`:210`). Es decir, **el intervalo más caro en número de llamadas por tick** |
| **5** | `lifebook-hotel-panel.tsx:86` | 20 000 ms | ≈ 180 | **Doble problema:** (a) `useEffect` en lugar de `useFocusEffect` → sigue sondeando con la pantalla tapada por otra; (b) cada tick hace `Promise.all([dashboard(), shopReservations()])` (`:70`), y `shopReservations` trae `limit=60` por defecto (`api/hotel.ts:429`) |
| **6** | `useUnreadChat` | 15 000 ms | ≈ 240 | Compartido entre 7 pantallas del dock. **Bien resuelto** (una sola petición en vuelo, temporizador único a nivel de módulo, `:36-37`, `:58-70`). El problema es solo que no hay `AppState` |

**Contraste positivo:** `agente.tsx` (panel del agente) **no tiene ningún temporizador**. Es refresco manual (`:112` botón + pull-to-refresh `:129`). Dado que la cola del agente es corta y auto-limitada (§1.1 #12), esta decisión es correcta y debería ser el ejemplo a seguir para paneles de baja frecuencia.

---

## 4. Estados de carga

### 4.1 ¿Esqueletos o spinner centrado? — **Ambos, y la división es reveladora**

**Con esqueletos (buen patrón, ~14 pantallas):**

| Pantalla | Evidencia |
|---|---|
| Feed Life Book | `lifebook.tsx:141` `SkeletonGrid`, usado en `:893` |
| Mercado | `ecomerse.tsx:534` `CardSkeleton`, `:547` `CatSkeletonGrid`, `:322` |
| Comida rápida | `food.tsx:342` `RestaurantSkeleton`, `:253` |
| Menú de restaurante | `food-menu.tsx:324` `MenuSkeleton`, `:120` |
| Pedidos de comida | `food-orders.tsx:771` `OrdersSkeleton`, `:398` |
| Panel del restaurante | `food-owner.tsx:888` `OwnerSkeleton`, `:437` |
| Favoritos | `ecomerse-favorites.tsx:235` `FavSkeleton` |
| Habitaciones del hotel | `lifebook-hotel-habitaciones.tsx:440` `EsqueletoTarjeta`, `:174` |
| Estado de facturación | `billing-status.tsx:399` `SkeletonHeader` |
| Otros | `ecomerse-seller.tsx:242`, `ecomerse-planes.tsx:146`, `work.tsx:125`, `food-rider.tsx:260`, `conductor.tsx:1824`, `lifebook-hotel-habitaciones.tsx:416` |

**Con spinner centrado a pantalla completa (~9 pantallas):** `agente.tsx:118`, `monedero.tsx:112`, `monedero-movimientos.tsx:102`, `trips-history.tsx:65`, `lifebook-merchant.tsx:112`, `lifebook-merchant-products.tsx:247`, `lifebook-hotel-panel.tsx:185`, `lifebook-hotel-reservas.tsx:183`, `lifebook-hotel-resultados.tsx:246`.

> Patrón claro: **la vertical de comercio/comida/social tiene esqueletos; la vertical de dinero y viajes (monedero, tickets, historial de viajes, paneles) tiene spinner.** Es exactamente al revés de lo deseable: las pantallas que el usuario más necesita sentir rápidas porque muestran **dinero real** son las que peor transición tienen.

### 4.2 Pantallas que se quedan "en blanco" al cargar

Ninguna pantalla queda literalmente en blanco: `AuthGate` y las rutas cubren ese caso. Pero **sí hay dos casos que se perciben como pantalla vacía**:

1. **`app/my-tickets.tsx:60`** — el peor de la app:
   ```jsx
   {loading && <Text …>Cargando…</Text>}
   ```
   Ni spinner, ni esqueleto: **una línea de texto gris**. Si el usuario tiene muchos tickets (caso #2 del ranking), pasa de "Cargando…" a una lista enorme de golpe, sin continuidad visual.
2. **`food.tsx:227`** — `loading ? null` dentro de `ListEmptyComponent`: mitiga bien porque los esqueletos ya vienen por `listData` (`:147`), pero deja la zona vacía si falla la carga inicial.

Además, **`monedero.tsx:111`** usa `loading && !balance` (no solo `loading`): durante un refresco con `silencioso = true` (`:85`) **no hay ningún indicador**, y si la red falla tampoco se ve el error porque `error && !balance` es falso → **el usuario ve el saldo antiguo sin saber si está actualizado**. Es una decisión defendible (evita parpadeo) pero conviene un indicador discreto.

### 4.3 Carga en cascada (esperar A para pedir B)

La app usa `Promise.all` de forma mayoritaria y disciplinada (**27 usos**, p. ej. `agente.tsx:69`, `monedero.tsx:87`, `billing-status.tsx:110`, `lifebook-hotel-panel.tsx:70`, `monedero-recargar.tsx:51`). Esto es **una buena nota para el equipo**. Aun así hay tres cascadas reales:

| Cascada | Evidencia | Coste | ¿Evitable? |
|---|---|---|---|
| **Rutas → N viajes** | `app/intercity.tsx:119-121`: `await intercityApi.routes(q)` **y después** `await Promise.all(rs.map((r) => intercityApi.trips(r.id, …)))` | **2 rondas de red secuenciales**; la 2.ª son **N peticiones en paralelo** (una por ruta). Con 12 rutas son **13 peticiones y 2 viajes de ida y vuelta** antes de ver un solo viaje | Parcialmente: las rutas deben conocerse primero, pero **N viajes para agregarlos y deduplicarlos en el cliente** sugiere que falta un endpoint agregador. El `sort` de `:123` también se hace en el cliente |
| **`me` → documentos de conductor** | `app/documents.tsx:70-74`: `await authApi.me()`, y **solo después**, si `role === 'DRIVER'`, `await driverApi.requirements()` | 2 viajes secuenciales, con spinner centrado. La 2.ª llamada **solo necesita `me.role`**, dato que ya se tiene | **Sí, trivialmente**: `Promise.all([me(), requirements()])` y descartar la 2.ª si no es DRIVER (o pedirla condicionalmente tras el 1.er await, pero sin bloquear el render del resto) |
| **`me` → tarjeta de tienda** | `app/lifebook-merchant-products.tsx:114-117`: `await authApi.me()` → `await tiendaApi.tarjeta(me.id)` | 2 viajes secuenciales al abrir el selector de destacados | Aquí **sí hay dependencia real de `me.id`**; es una cascada legítima. Se puede mitigar con caché del id de sesión (ya disponible en `useSession`) |

También hay una cascada encubierta por el sondeo: **`intercity-publish.tsx:135`** reemplaza `trips` con un array nuevo cada 15 s → invalida `groups` (`:147`) y **re-renderiza la lista completa de viajes + reservas cada 15 segundos**, aunque nada haya cambiado. Un simple *diff* por id (o `JSON` de ids) lo evitaría.

---

## 5. Imágenes: placeholder, `contentFit`, caché y tamaños

### 5.1 Hay dos librerías de imagen conviviendo, y no están repartidas al azar

| | `expo-image` | `LazyImage` (kit de alquiler) |
|---|---|---|
| Archivo | `import { Image } from 'expo-image'` | `components/rental/LazyImage.tsx` |
| Implementación real | nativa (Glide/Fresco + caché propia) | **`react-native` `Image` + `Animated.Image`** — `LazyImage.tsx:12,102,111` |
| `contentFit` | ✅ | ❌ (usa `resizeMode`, RN puro) |
| `cachePolicy` | ✅ `"memory-disk"` en 42 líneas | ❌ **ninguna** |
| Placeholder | ❌ ver §5.2 | ⚠️ solo un recuadro con emoji «Sin foto» / «⚠️ No se pudo cargar» (`:70-96`) |
| Prefetch | ✅ (`lifebook-chat/[id].tsx:123`, `lifebook-product/[id].tsx:143`, `lifebook-post/[id].tsx:432-433`) | ❌ |
| Indicador de carga | integrado | **un `ActivityIndicator` superpuesto por imagen** (`:124-128`) |
| Usado en | **37 archivos** importan `expo-image`: ecomerse, food, lifebook, chat, hoteles, publicación | **6 consumidores de `LazyImage`**: `alquiler-detalle.tsx`, `intercity.tsx`, `lifebook-hotel-habitaciones.tsx`, `PhotoGallery.tsx`, `HotelResultCard.tsx`, `PropertyCard.tsx` (`components/rental/LazyImage.tsx` es la definición) |

**Hallazgo:** `LazyImage` —la peor de las dos opciones— es la que se usa **exactamente en las pantallas con más imágenes remotas y más pesadas** (galerías de alquiler, portadas de hotel, avatares de viajes intercity). Además, su `ActivityIndicator` por imagen significa que **una lista de 20 propiedades con 20 fotos puede mostrar hasta 20 ruedas girando a la vez** — malo para el rendimiento y peor para la percepción.

Nota justa: en Android, RN `Image` **sí** aprovecha la caché de disco de Fresco por defecto. Por tanto **no** se puede afirmar que `LazyImage` no cachee nada; lo que se afirma (verificable en el código) es que **no declara política de caché, no usa `expo-image` y no tiene placeholder real**. Cuánta caché efectiva obtiene **requiere validación en dispositivo**.

### 5.2 Placeholder: **cero blurhash / thumbhash en toda la app**

```
grep "blurhash|thumbhash" en app/ components/ packages/  →  1 sola coincidencia en código propio:
  components/rental/LazyImage.tsx:7  «Opcional (no incluido por defecto): blurhash/thumbhash»
grep "placeholder={{" (placeholder de imagen con objeto)  →  0 coincidencias
```

Los 22 `placeholder=` del código son todos `TextInput`. **No existe ni un solo placeholder de imagen con degradado/hash.** El resultado visual es el esperado: hueco liso del color de superficie → salto a la imagen. En 3G/4G de Guinea Ecuatorial esto se traduce en listas de rectángulos vacíos.

### 5.3 Miniaturas a tamaño completo — el problema de datos móviles más caro

Está **documentado en el propio código**:

```js
// api/lifebook.ts:265-267
// El backend NO genera miniaturas: `thumbnailUrl` reutiliza la URL original
? { url, thumbnailUrl: url, aspectRatio: lbCardRatio(payload.coverRatio) }
```

Es decir: **la miniatura y la imagen completa son el mismo archivo**. Y `api/rental.ts:26` (`photos: Array<{ url: string; thumbnailUrl: string }>`) expone ambos campos, pero `PhotoGallery.tsx:74` (`absUrl(p ?? '')`) y `:109` usan `url` para todo.

Casos concretos donde se descarga una imagen grande para pintarla diminuta:

| Dónde | Se pinta a | Se descarga | Evidencia |
|---|---|---|---|
| Panel de la tienda, miniatura de producto | **40–56 px** | `coverUrl` completo | `lifebook-merchant-products.tsx:278` |
| Panel de planes del mercado | **40×40 px** | `p.photos[0]` completo | `ecomerse-planes.tsx:279` |
| Lista de productos del vendedor | **44×44 px** | `p.photos[0]` completo | `ecomerse-seller.tsx:462` |
| Chats, foto de producto citado | **44×44 px** | `p.coverUrl` completo | `lifebook-chat/[id].tsx:1235` |
| Carrito | logo + foto de línea | completo | `lifebook-carrito.tsx:303,355` |
| **Galería de alquiler/hotel** | **ancho de pantalla completo × N fotos, todas a la vez** | N imágenes a resolución completa | `PhotoGallery.tsx:108-110` |
| Avatar de viaje intercity | pequeño | `t.photos[0]` **o** `t.publisherPhoto` | `intercity.tsx:248,250` |

### 5.4 La que más afecta a datos móviles

**`components/PhotoGallery.tsx:94-112`.** Es la peor porque combina cuatro factores:

1. **Monta todas las fotos a la vez** dentro de un `ScrollView horizontal` con `pagingEnabled`: no hay reciclado ni carga diferida. Con 15 fotos, 15 descargas completas en cuanto se abre la ficha.
2. **Cada una al ancho completo de la pantalla** (`:109` `style={{ width: ancho, height: alto }}`, con `alto ≈ 0.62 × ancho`).
3. **Sin `contentFit`/`cachePolicy`** (es `LazyImage`).
4. **Sin miniatura real** (§5.3).
5. Y encima `GalleryDots` (`:28`) crea **un `<View>` por foto**, más el contador.

Se usa en `alquiler-detalle.tsx`, `lifebook-hotel-habitaciones.tsx`, `lifebook-hotel-detalle.tsx` y `lifebook-hotel-habitacion.tsx` — es decir, **en la ficha donde el usuario decide si alquila o reserva**. Un usuario con datos prepago que compara 5 alojamientos puede descargar decenas de imágenes a resolución completa para ver miniaturas.

**Segundo puesto: el feed de Life Book** (§1.3): virtualización anulada ⇒ todas las imágenes del feed montadas ⇒ la app descarga y decodifica fotos de posts que el usuario nunca llegará a ver.

---

## 6. Riesgos de bloqueo del hilo de UI

### 6.1 Listas anidadas / virtualización anulada

| Riesgo | Evidencia | Gravedad |
|---|---|---|
| **`FlatList` de un solo ítem (masonry)** | `app/lifebook.tsx:943-945`; réplicas en `lifebook-search.tsx:396` y `lifebook-explore.tsx:254` | 🔴 **Alta.** No es "una lista dentro de un ScrollView": es una `FlatList` que *parece* virtualizar y no virtualiza nada. El patrón es peor porque engaña a quien lee el código |
| **Listas de altura variable dentro de `ScrollView` vertical** | `trips-history.tsx:74`, `my-tickets.tsx:58`, `ecomerse-orders.tsx:160`, `monedero-movimientos.tsx:111`, `intercity.tsx:208`, `intercity-publish.tsx:320`, `lifebook-merchant-products.tsx:249`, `agente.tsx:127` | 🔴 **Alta** en las 5 primeras (crecimiento ilimitado) |
| **`ScrollView` anidados verticalmente de verdad** | `components/lifebook/RuletaVertical.tsx:71-77` (`nestedScrollEnabled`), `components/lifebook/AsistenteDeTalla.tsx:267` (`nestedScrollEnabled`, `maxHeight: 250`) | 🟡 **Baja–media, y bien gestionada**: están acotados (`maxHeight`) y documentados. No es un problema |
| **`ScrollView` horizontales dentro de listas** | `ecomerse.tsx:259,274`, `food.tsx:200,208`, `alquiler.tsx:111`, `monedero-movimientos.tsx:87`, `lifebook-user.tsx:587,810,848` … | 🟢 **Correcto.** Un `ScrollView` horizontal dentro de una lista **no** anula la virtualización vertical. Práctica habitual y aceptable |

### 6.2 Cálculos pesados en el hilo de JS

| Riesgo | Evidencia | Nota |
|---|---|---|
| **Bucle de simulación a 250 ms** | `app/conductor.tsx:798-819` | 🔴 El más alto en CPU sostenida: **4 re-renders/s** de un componente de 1 981 líneas + `setNavSpeed`/`setNavFromRemaining` (`:510`, `:483`) + `mapRef.setNavView` (mensaje al WebView) por tick. Mitigación parcial: `:812-815` compara la posición y **evita el `setState` si no cambió**. Pero cuando el coche se mueve (lo normal), cambia siempre. **Requiere validación en dispositivo** para saber si degrada el scroll en gama baja |
| **Mapa en `WebView` con postMessage** | `packages/map/src/mapWeb.tsx:60,154,163,185,203,224,234,241` | 🟡 El diseño está **bien pensado** (la interpolación corre dentro del WebView justo para no cruzar el puente 60 veces/s — ver el comentario en `DriverLiveMap.tsx:16-18`). El riesgo es el volumen de `JSON.stringify` de polilíneas (`:185,203,224`): **no se puede saber el tamaño sin medir** la ruta real → **requiere validación en dispositivo** |
| **Formateo de fecha/moneda por fila** | §2.3 | 🔴 Confirmado en código; el coste real por llamada en Hermes **requiere validación en dispositivo** |
| `JSON.parse` de payloads grandes | `api/httpClient.ts:81,188` — **un `res.json()` por respuesta**, sin JSON gigantes en el cliente. `state/session.tsx:36` parsea el payload del JWT (pequeño). `state/statusStore.tsx:72` y `app/buscar.tsx:69` parsean borradores de AsyncStorage (pequeños) | 🟢 **Sin riesgo de parseo masivo.** No hay ningún `JSON.parse` de un blob grande en el cliente. Hallazgo limpio |
| **`base64` de imágenes** | `packages/ui-kit/src/primitives/CameraCapture.tsx:36,108,139`, `kyc/capture.tsx:42`, `kyc/liveness.tsx:42`, `alquiler-publicar.tsx:125,141`, `intercity-publish.tsx:163`, `driver-onboarding.tsx:104`, `conductor.tsx:1135` | 🟡 **Riesgo real de pico de memoria**, no de "atasco" continuo: convertir una foto a base64 crea una cadena en JS (≈1,33× el tamaño del archivo) y en KYC además se hacen `base64ToBytes` + `hashBytes` **en el hilo de JS**. `alquiler-publicar.tsx:38` mide el tamaño en bytes y limita a ~700 KB por foto con `quality: 0.4` → **la mitigación existe y es razonable**. Pero `conductor.tsx:1135` y `driver-onboarding.tsx:106` construyen `data:image/jpeg;base64,…` para un match facial: el pico depende de la resolución de cámara → **requiere validación en dispositivo** |

### 6.3 Animaciones con `useNativeDriver: false`

```
grep "useNativeDriver: false" en app/ components/  →  1 coincidencia
  app/conductor.tsx:347
```

Solo **una**, y es de baja gravedad: `Animated.timing(countdown, { toValue: 0, duration: OFFER_SECONDS * 1000, useNativeDriver: false })` — una barra de progreso de 15 s que anima una propiedad de layout (ancho/escala). Corre en el hilo de JS durante 15 s **por cada oferta de viaje recibida**. Es un `false` probablemente obligado (si anima `width`, el driver nativo no lo soporta). **Recomendación:** convertirla a `transform: [{ scaleX }]`, que **sí** admite `useNativeDriver: true`.

Aparte, el resto de animaciones están bien: `taxi.tsx:159-160` usa `useNativeDriver: true` en el radar de búsqueda y limpia con `stopAnimation()` (`:165`); `LazyImage.tsx:52` usa `useNativeDriver: true` para el fade-in.

---

## 7. Resumen de hallazgos por severidad

| Severidad | Hallazgo | Evidencia |
|---|---|---|
| 🔴 | **7 listas de dinero/pedidos sin paginación de servidor y sin virtualización**, crecimiento ilimitado | `trips-history.tsx:83`, `my-tickets.tsx:70`, `ecomerse-orders.tsx:197`, `monedero-movimientos.tsx:117`, `lifebook-merchant-products.tsx:269`, `intercity-publish.tsx:370-391`, `intercity.tsx:243` |
| 🔴 | **Feed principal: `FlatList` de un ítem → virtualización anulada** (×3 pantallas) | `lifebook.tsx:943-945`, `lifebook-search.tsx:396`, `lifebook-explore.tsx:254` |
| 🔴 | **Cero gating por `AppState`** en 18 temporizadores, varios con red | `grep AppState` = 0 en código propio |
| 🔴 | **`kyc/status.tsx` sondea cada 1,5 s y nunca para**, ni al aprobarse | `:14`, `:40`, `:64` |
| 🔴 | **Miniaturas = archivo completo**, documentado por el propio equipo | `api/lifebook.ts:265-267` |
| 🔴 | **`PhotoGallery` descarga todas las fotos a ancho completo a la vez** | `PhotoGallery.tsx:94-110` |
| 🟠 | **Sin un solo placeholder blurhash/thumbhash** | `LazyImage.tsx:7` es solo un comentario |
| 🟠 | **`LazyImage` (RN `Image`) usado justo en las pantallas más pesadas en imágenes** | `LazyImage.tsx:12,102,111` + `intercity.tsx`, `alquiler-detalle.tsx`, `lifebook-hotel-habitaciones.tsx` |
| 🟠 | **`conductor.tsx` a 250 ms = 4 re-renders/s** de un componente de ~2 000 líneas | `:798-819` |
| 🟠 | **`intercity-publish.tsx` re-renderiza toda la lista cada 15 s** aunque nada cambie | `:135` → `:147` → `:370-391` |
| 🟠 | **Formateo `toLocale*` por fila y por render, sin memoizar** (peor caso: 4 llamadas/viaje + 1/reserva) | `intercity-publish.tsx:380,386,389,421`; `monedero-movimientos.tsx:124` |
| 🟠 | **`lifebook-hotel-panel.tsx` usa `useEffect` en lugar de `useFocusEffect`** para sondear | `:83-88` vs el modelo correcto en `lifebook-merchant.tsx:95` |
| 🟡 | Vertical de dinero/tickets **sin esqueletos**; `my-tickets.tsx` solo con el texto «Cargando…» | `my-tickets.tsx:60` |
| 🟡 | Cascadas evitables de red | `documents.tsx:70-74`, `intercity.tsx:119-121` |
| 🟡 | `key={i}` en listas mutables con borrado por índice | `alquiler-publicar.tsx:486`, `intercity-publish.tsx:510`, `ecomerse-seller.tsx:405` |
| 🟡 | `sort`/`reduce` sin `useMemo` en el render | `lifebook-hotel-habitaciones.tsx:147-150`, `intercity-publish.tsx:140` |
| 🟡 | Único `useNativeDriver: false` de la app, en animación de 15 s | `conductor.tsx:347` |
| 🟢 | **Sin `JSON.parse` de payloads grandes**; `Promise.all` mayoritario (27 usos); `key` estable en todas las listas largas; `intercity-publish`, `lifebook-videos` y `useUnreadChat` como modelos de temporizador; esqueletos en toda la vertical de comercio | ver §1.2, §2.2, §3.2, §4.1 |

### Lo que este informe **no** puede afirmar

Todo lo siguiente **requiere validación en dispositivo** (perfilado con Hermes/Perfetto en un Android de gama baja, y medición de bytes en proxy):

- Cuántos milisegundos cuesta cada una de estas listas al montarse, y a partir de qué número de elementos el scroll deja de ir a 60 fps.
- Cuánto sigue sondeando realmente la app en segundo plano y cuánto lo limita el SO.
- Cuántos MB de datos consume la galería de fotos o el feed en una sesión real.
- Si Hermes de esta build trae `Intl` completo (determina el coste real de los `toLocaleString`).
- El tamaño real de las polilíneas que se serializan al `WebView` del mapa.
- El pico de memoria de la conversión a base64 en KYC y en el match facial del conductor.

---

## Puntuación: 4/10

**Justificación.** La app **no está mal escrita**: usa `Promise.all` de forma disciplinada (27 usos, casi ninguna cascada), tiene `key` estable en todas las listas largas, la vertical de comercio/comida/social tiene esqueletos de carga en lugar de spinners, `expo-image` se usa con `contentFit` y `cachePolicy="memory-disk"` en **37 archivos**, hay `prefetch` en las fichas de detalle, no hay ni un `JSON.parse` de payload grande, y existen tres temporizadores ejemplares (`intercity-publish.tsx`, `lifebook-videos.tsx`, `useUnreadChat.ts`). El equipo demuestra que **conoce los patrones correctos**.

El 4/10 se debe a que **esos patrones no se aplican donde más importa**, y el reparto es sistemático, no aleatorio:

1. **Las 7 listas con crecimiento ilimitado son precisamente las de dinero y transacciones** — monedero, tickets, historial de viajes, pedidos, ventas, movimientos — y **ninguna virtualiza ni pagina del lado del servidor**. Son las pantallas donde un atasco se interpreta como "la app me ha perdido el dinero".
2. **El feed principal, la pantalla más usada de la app, tiene la virtualización estructuralmente anulada** por un truco de masonry con un único ítem sintético. Se paga el coste de `FlatList` sin recibir ninguno de sus beneficios.
3. **No hay una sola decisión de ciclo de vida respecto al segundo plano.** 18 temporizadores, uno de ellos a 1,5 s que nunca se detiene, en una app de prepago para un mercado donde los datos móviles son caros y la batería escasea.
4. **La miniatura y la foto completa son el mismo archivo**, y lo dice un comentario del propio backend. La consecuencia es que abrir una ficha de alquiler puede descargar 15 imágenes a pantalla completa para mostrar una tira de miniaturas.

Nada de esto es irrecuperable ni exige reescribir: son **cambios locales y de bajo riesgo** (sustituir `ScrollView`+`.map` por `FlatList`, memoizar formateos por `id`, añadir `key` con id, poner puertas de `AppState`, aplanar los dos masonry). De ahí que las 10 acciones siguientes tengan todas una relación beneficio/riesgo alta.

### Las 10 acciones de mejor relación beneficio/riesgo

| # | Acción | Dónde | Beneficio | Riesgo | Esfuerzo |
|---|---|---|---|---|---|
| **1** | **Parar el sondeo del KYC cuando llega a estado terminal** — añadir `if (isTerminal) { clearInterval(id); return; }` al final de cada tick (la variable `isTerminal` **ya existe** en `:64` y solo se usa para pintar) | `app/kyc/status.tsx:40-45` | 🔥 Elimina el sondeo más agresivo de la app (≈2 400 req/h → 0 al terminar). Cambio de 3 líneas | **Muy bajo**: la condición ya está calculada | 15 min |
| **2** | **Convertir el masonry del feed a una `FlatList` real de una columna por ítem**, o a dos `FlatList` sincronizadas, o a `@shopify/flash-list` con `masonry`. Como paso intermedio de coste casi nulo: **`initialNumToRender`+`windowSize` no sirven con 1 ítem**, así que toca cambiar `data` a `posts` y repartir las columnas por `index` en `renderItem` | `app/lifebook.tsx:943-945`; mismo patrón en `lifebook-search.tsx:396`, `lifebook-explore.tsx:254` | 🔥 Recupera la virtualización en la pantalla más usada: menos memoria, menos imágenes montadas, scroll estable con muchas páginas | **Medio**: el reparto en dos columnas (`leftCol`/`rightCol`, `:368-386`) hay que moverlo al `renderItem`. El cálculo ya está memoizado y se reutiliza | 3–5 h |
| **3** | **Meter una puerta de `AppState` única y compartida**: un hook `usePolling(fn, ms)` que registre `AppState.addEventListener('change', …)` y no dispare cuando `state !== 'active'`, refrescando **una vez** al volver a `active`. Sustituir los 18 `setInterval` por él | Nuevo `hooks/usePolling.ts`; consumidores: `conductor.tsx:436`, `DriverLiveMap.tsx:180`, `taxi.tsx:132`, `lifebook-chat/[id].tsx:220`, `lifebook-hotel-panel.tsx:86`, `lifebook-hotel-reserva.tsx:100`, `food-orders.tsx:220`, `useUnreadChat.ts:60` … | 🔥 El mayor ahorro de batería y datos de toda la lista, con un solo punto de cambio y sin tocar la lógica de cada pantalla | **Bajo**: el hook es aditivo; se migra pantalla a pantalla. Riesgo real: olvidar el refresco al volver (`'change'`→`'active'`), que hay que cubrir explícitamente | 1 día (hook + 8 migraciones) |
| **4** | **Pasar el historial de viajes y los tickets a `FlatList` paginada.** Cliente: `FlatList` con `onEndReached`; servidor: `?limit=&cursor=` en `/mobility/trips/history` y `/intercity/bookings/mine`. Mientras el backend no esté listo, **poner un tope duro en el cliente** copiando el patrón que ya existe en `lifebook-hotel-panel.tsx:273` (`historial.slice(0, 20)`) + un botón «Ver más» | `app/trips-history.tsx:74,83`; `app/my-tickets.tsx:58,70`; `api/taxi.ts:94`; `api/intercity.ts:105` | 🔥 Las dos listas con crecimiento más brutal y **cero** elementos a favor (sin imágenes, sin tope, sin virtualización). El `slice` de emergencia es 1 línea y ya tiene precedente en el código | **Bajo** (tope en cliente); **medio** si se toca el backend | 2 h (cliente) / 1 día (con cursor) |
| **5** | **Memoizar el formateo de fecha/moneda por fila**: extraer un `<TxRow>`, `<TicketRow>`, `<TripRow>` con `React.memo` y precalcular `fecha`/`importe` **una vez por elemento** (por `id`), en lugar de llamar `toLocale*` en línea dentro del `.map`. Empezar por los que hoy se re-renderizan al mínimo cambio de estado: `my-tickets.tsx` (al abrir un QR) e `intercity-publish.tsx` (cada 15 s) | `my-tickets.tsx:83`; `intercity-publish.tsx:380,386,389,421`; `monedero-movimientos.tsx:124`; `trips-history.tsx:20,26,92,120`; `ecomerse-orders.tsx:262,294`; `intercity.tsx:245,256,258,271,274` | 🔥 Ataca la causa raíz del coste por fila en **todas** las listas largas a la vez, y de paso arregla el re-render completo que hoy provoca abrir un ticket | **Bajo**: refactor mecánico, sin cambio de comportamiento visible | 3–4 h |
| **6** | **Miniaturas reales en el servidor** (`?w=200&q=70` o `thumbnailUrl` distinto) y, en el cliente, `expo-image` con `cachePolicy` en las miniaturas. Empezar por las de 40–56 px, que hoy bajan el archivo completo. Si el backend no puede en esta fase, **sustituir `LazyImage` por `expo-image` con `cachePolicy="memory-disk"`** en las miniaturas: es un cambio de una línea por uso | Cliente: `lifebook-merchant-products.tsx:278`, `ecomerse-planes.tsx:279`, `ecomerse-seller.tsx:462`, `lifebook-chat/[id].tsx:1235`, `lifebook-carrito.tsx:303,355`. Backend: `api/lifebook.ts:265-267` | 🔥 El mayor ahorro de **datos móviles** de la app, y el más visible para un usuario prepago | **Bajo** en cliente (1 línea por uso); **medio** en backend (pipeline de redimensionado) | 2 h cliente / 2–3 días backend |
| **7** | **`PhotoGallery`: carga diferida de fotos.** Montar solo la activa ± 1 (estado `activa` **ya existe**, `:71`), o cambiar el `ScrollView` horizontal por una `FlatList` horizontal con `windowSize={3}`; y no descargar a ancho completo si el contenedor es una miniatura (pasar `width` a `LazyImage` y servir una URL con tamaño) | `components/PhotoGallery.tsx:71,94-110` | 🔥 Corta de golpe N descargas a resolución completa en cada ficha de alquiler/hotel. Con `activa` ya en el estado, es un filtro de render | **Bajo–medio**: hay que cuidar el `pagingEnabled` y el `scrollTo` inicial (`:82`) para no romper el gesto | 3 h |
| **8** | **Añadir placeholder real a las imágenes**: `expo-image` acepta `placeholder={{ blurhash }}`; si el backend no emite hash, un **`backgroundColor` + `transition` ya es una mejora** y en `LazyImage` basta con sustituir el `ActivityIndicator` superpuesto por un `backgroundColor` y reservar el `aspectRatio`. El objetivo mínimo: **que no haya 20 ruedas girando a la vez** en una lista | `components/rental/LazyImage.tsx:124-128` (quitar el spinner por imagen); `intercity.tsx:248,250`; `lifebook-hotel-habitaciones.tsx:234`; `PhotoGallery.tsx:109` | 🟠 Gran mejora **percibida** (sensación de fluidez) con muy poco código; resuelve un problema de percepción, no de CPU | **Muy bajo**: es presentación pura. Único cuidado: reservar la altura para no provocar saltos de layout | 2 h |
| **9** | **Bajar el tick de simulación de 250 ms a 500–1000 ms** en `conductor.tsx:798` y **aplicar el mismo guard de igualdad que ya existe** (`:812-815`) también a `navTick`/`setNavSpeed` (`:510`) y a `setNavView`. Con `dtS` ya calculado (`:801`), el movimiento no se degrada visualmente | `app/conductor.tsx:798-819`, `:499-510` | 🟠 Reduce a la mitad o a un cuarto los 4 re-renders/s de un componente de ~2 000 líneas, sin perder suavidad (el WebView interpola igual) | **Bajo**: la variable `dtS` ya existe, el guard ya está probado en la línea 812, y hay `alive` (`:759,799`) para no dejar timers huérfanos | 1 h |
| **10** | **Poner un tope y un «Ver más» donde hoy no hay ninguno** en las listas menores que también crecen sin fin, y **unificar el criterio**: `intercity-publish.tsx` (agrupar por rango de fechas y mostrar solo los próximos viajes + «ver pasados»), `ecomerse-orders.tsx` (filtro por estado + tope), `lifebook-merchant-products.tsx` (usar el `filtro` que ya existe, `:73-101`). Además, en `intercity-publish.tsx:135` **comparar los ids antes de `setTrips`** para no invalidar `groups` (`:147`) cada 15 s | `intercity-publish.tsx:135,370-391`; `ecomerse-orders.tsx:197`; `lifebook-merchant-products.tsx:269` | 🟠 Cierra los 3 casos de crecimiento ilimitado que quedan y elimina un re-render completo de la lista cada 15 s en la pantalla del conductor intercity | **Bajo**: los datos y los filtros ya están en el estado; no hay cambio de API | 3 h |

**Orden sugerido de ejecución:** 1 → 4 → 3 → 5 → 2 → 9 → 6 → 7 → 8 → 10.
Las acciones **1, 4, 5, 9 y 10** son de riesgo bajo y se pueden hacer ya, sin backend ni rediseño. La **3** (puerta de `AppState`) es la de mayor impacto acumulado y no depende de nadie más. La **2** (masonry) es la de mayor impacto en la pantalla más usada, pero conviene hacerla después de la 5 para no mezclar dos refactores en el mismo feed. Las **6 y 7** son las que más ahorran datos móviles y las que más se notan en Guinea Ecuatorial; la 6 necesita al equipo de backend.
