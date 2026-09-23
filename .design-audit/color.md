# Auditoría de color — EG Route Plan

**Ámbito:** auditoría **solo de fuente** (sin ejecutar la app, sin servidor, sin navegador).
**Fecha de análisis:** sesión actual. **Herramientas:** `grep` + `read` + conteo programático sobre los archivos fuente.
**Árboles analizados (exactamente estos tres):**

| Árbol | Ruta | Archivos `.ts`/`.tsx` |
|---|---|---|
| Pantallas | `D:\egapp\app\` | 107 |
| Componentes | `D:\egapp\components\` | 73 |
| Kit de diseño | `D:\egapp\node_modules\@egrouteplan\ui-kit\src\` | 13 |

**No auditado** (fuera del ámbito pedido): `backend/`, `api/`, `services/`, `state/`, `hooks/`, `utils/`, `constants/`, `core/`, `packages/`, `android/`, `respaldo/`, `pruebas/`, `egrouteplan-app/`.
`constants/colors.ts` **sí** se revisó porque es el shim de tokens: solo re-exporta de `@egrouteplan/ui-kit` (`constants/colors.ts:6`), sin literales.

### Método de conteo (importante para la fiabilidad de las cifras)

- Se contaron literales con la expresión `#[0-9A-Fa-f]{8}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}` **con el alternador de 8 dígitos primero**.
  Esto importa: en un primer pase con el orden invertido, los hex de 8 dígitos con alfa (`#F53F3F55`) se contaban como 6 dígitos (`#F53F3F`), inflando su cifra de 30 a 38. **Las cifras de este informe son las del conteo corregido** y están verificadas por muestreo con `grep`.
- El fuente usa hex en **MAYÚSCULAS** (`'#F53F3F'`). Un `grep '#f53f3f'` devuelve **0 resultados**; hay que buscar en mayúsculas. Se normalizó todo a minúsculas para agrupar.
- **Dos formas de contar, ambas reportadas:**
  - **Literal exacto**: el string tal cual aparece (`#fff` y `#ffffff` son dos literales distintos).
  - **Base RGB**: se normaliza el hex de 8 dígitos a su base de 6 (`#F53F3F55` → `#f53f3f`) para medir "el mismo color". `#fff` y `#ffffff` **no** se fusionan (son literales distintos, aunque el mismo color).
- **Limitación declarada:** el conteo es textual sobre el fuente. No distingue un color *renderizado* de uno en un `StyleSheet` muerto, un comentario o una rama inalcanzable. No se midió contraste contra render real: los ratios de la §8 se **calcularon** con la fórmula WCAG 2.x, no se midieron en pantalla.

---

## 1. Inventario real de literales hex

### 1.1 Totales

| Métrica | Valor |
|---|---|
| Ocurrencias de literal hex | **1127** |
| Valores únicos (literal exacto) | **125** |
| Valores únicos (base RGB, fusiona alfa) | **113** |
| De ellos, literales de 8 dígitos (alfa) | 19 ocurrencias / **12 valores** |
| Archivos con ≥1 hex | **140** (de 193 analizados) |
| Archivos con ≥1 hex **NO oficial** | **104** |
| Ocurrencias que son token oficial | **321** (28,5 %) |
| Ocurrencias **NO oficiales** | **806** (71,5 %) |
| Bases únicas NO oficiales | **95** |

Evidencia del CSV completo: `D:\Users\nisang12\AppData\Local\Temp\eg-color-out\hex-raw2.csv` (1127 filas, una por ocurrencia, con archivo y línea).

### 1.2 Desglose por árbol

| Árbol | Ocurrencias | Únicos (base) | Archivos con hex | Ocurrencias NO oficiales | Bases únicas NO oficiales |
|---|---|---|---|---|---|
| `app/` | **879** | 95 | 86 | 640 | 82 |
| `components/` | **218** | 38 | 50 | 165 | 30 |
| `ui-kit/src/` | **30** | 19 | 4 | **1** | **1** |
| **Total** | **1127** | **113** | **140** | **806** | **95** |

El kit está prácticamente limpio: de sus 30 literales, **29 son tokens oficiales declarados en su propio `colors.ts`** y el único no oficial es `#FFF` (`primitives/CameraCapture.tsx:206`), que es el mismo blanco de `background: '#FFFFFF'` escrito corto. Es decir: **el problema no está en el kit, está en su adopción.** Ningún primitivo del kit consume `colors.*` de su propio tema (usan literales), lo cual es una decisión de arquitectura, no una fuga de paleta.

### 1.3 Los 20 valores más repetidos (conteo exacto y desglose)

| # | Literal | Total | `app/` | `components/` | `kit/` | Archivos | ¿Token oficial? |
|---|---|---|---|---|---|---|---|
| 1 | `#fff` | **387** | 289 | 97 | 1 | 89 | **NO** |
| 2 | `#ffffff` | **128** | 89 | 30 | 9 | 48 | SÍ (`background`/`card`) |
| 3 | `#ff6b35` | **53** | 53 | 0 | 0 | 17 | **NO** |
| 4 | `#ff7d00` | **45** | 39 | 5 | 1 | 19 | SÍ (`secondary`) |
| 5 | `#10b981` | **35** | 33 | 2 | 0 | 17 | **NO** |
| 6 | `#f53f3f` (solo 6 díg.) | **30** | 23 | 6 | 1 | 13 | SÍ (`danger`) |
| 7 | `#27ae60` (solo 6 díg.) | **29** | 25 | 3 | 1 | 9 | SÍ (`success`) |
| 8 | `#0084ff` | **28** | 22 | 5 | 1 | 14 | SÍ (`primary`) |
| 9 | `#ff2442` | **27** | 12 | 15 | 0 | 13 | **NO** |
| 10 | `#000` | **26** | 15 | 11 | 0 | 14 | **NO** |
| 11 | `#ef4444` | **18** | 17 | 1 | 0 | 8 | **NO** |
| 12 | `#f59e0b` | **17** | 16 | 1 | 0 | 8 | **NO** |
| 13 | `#64748b` | **11** | 11 | 0 | 0 | 4 | **NO** |
| 14 | `#0ea5e9` | **11** | 11 | 0 | 0 | 5 | **NO** |
| 15 | `#00b26a` | **9** | 8 | 1 | 0 | 3 | **NO** |
| 16 | `#d93636` | **9** | 8 | 0 | 1 | 7 | SÍ (`dangerPressed`) |
| 17 | `#8e8e93` | **8** | 7 | 1 | 0 | 5 | **NO** |
| 18 | `#25d366` | **8** | 7 | 1 | 0 | 7 | **NO** |
| 19 | `#ff3b5c` | **8** | 8 | 0 | 0 | 3 | **NO** |
| 20 | `#f6b100` (solo 6 díg.) | **8** | 8 | 0 | 0 | 3 | **NO** |
| — | `#f5b50a` | 8 | 8 | 0 | 0 | 3 | **NO** (empate en 8) |

**Si se cuenta por base RGB** (fusionando los 19 literales con alfa), el orden de los más repetidos cambia en los puestos 6, 7 y 20:

| Literal base | Total base | Variantes de alfa encontradas |
|---|---|---|
| `#f53f3f` | **38** | `#f53f3f`(30) + `#f53f3f55`(3) + `#f53f3f14`(2) + `#f53f3f10`(2) + `#f53f3f0c`(1) |
| `#27ae60` | **36** | `#27ae60`(29) + `#27ae6033`(2) + `#27ae6018`(2) + `#27ae6010`(1) + `#27ae6055`(1) + `#27ae600f`(1) |
| `#f6b100` | **10** | `#f6b100`(8) + `#f6b10033`(1) + `#f6b1000f`(1) |

**Hallazgo inmediato:** el literal **más repetido de todo el proyecto es `#fff` (387 veces, en 89 archivos)** y **no es un token**. El token equivalente (`#ffffff`, vía `background`/`card`) existe y se usa 128 veces. Es decir, hay **515 ocurrencias del mismo color blanco escritas de dos maneras**. El shim `alpha()` del kit ya normaliza hex de 3 y 6 dígitos (`theme/colors.ts:63-68`), así que la ambigüedad no rompe el runtime — pero sí rompe cualquier búsqueda/reemplazo y la lectura de "¿este blanco es el token?".

Los diez archivos con más literales no oficiales:

| Archivo | Ocurrencias no oficiales |
|---|---|
| `app/conductor.tsx` | 71 |
| `app/taxi.tsx` | 42 |
| `app/ecomerse-orders.tsx` | 27 |
| `app/lifebook-videos.tsx` | 27 |
| `app/billing-status.tsx` | 25 |
| `components/lifebook/GroupManageSheet.tsx` | 23 |
| `app/food-orders.tsx` | 22 |
| `app/profile.tsx` | 19 |
| `app/ecomerse.tsx` | 18 |
| `app/ecomerse-seller.tsx` | 18 |

De los 86 archivos de `app/` que contienen algún hex, **solo 19 no contienen ningún hex no oficial** (usan exclusivamente tokens). Son la lista de referencia de "cómo se hace bien": `app/emergencia.tsx`, `app/index.tsx`, `app/_layout.tsx`, `app/reserva.tsx`, `app/ruta-fallida.tsx`, `app/conductor-hub.tsx`, `app/monedero-pin.tsx`, `app/monedero-recargar.tsx`, `app/monedero-retirar.tsx`, `app/lifebook-merchant.tsx` y nueve pantallas del módulo hotel (`lifebook-hotel*.tsx`) más dos de inbox (`lifebook-inbox-comments.tsx`, `lifebook-inbox-likes.tsx`).

---

## 2. Paleta oficial (`ui-kit/src/theme/colors.ts`) vs literales reales

El kit declara **18 valores oficiales** (8 en `brand` + 10 en los dos temas):

```ts
brand = { primary:'#0084FF', primaryPressed:'#006BD6', secondary:'#FF7D00',
          secondaryPressed:'#E56E00', success:'#27AE60', successPressed:'#1E8E4E',
          danger:'#F53F3F', dangerPressed:'#D93636' }          // colors.ts:8-17
lightColors: textPrimary '#1D2129', textSecondary '#86909C', background '#FFFFFF',
             surface '#F5F7FA', card '#FFFFFF', border rgba(29,33,41,0.08),
             overlay rgba(23,23,26,0.45), shadow '#17171A'      // colors.ts:38-48
darkColors:  textPrimary '#F2F3F5', textSecondary '#A9AEB8', background '#17171A',
             surface '#1E1E23', card '#232329', border rgba(255,255,255,0.08),
             overlay rgba(0,0,0,0.55), shadow '#000000'         // colors.ts:50-60
```

### 2.1 Verificación valor por valor — hex que **SÍ** son token oficial

| Literal | Token oficial | Ocurrencias | Evidencia de uso (ejemplo) |
|---|---|---|---|
| `#FFFFFF` | `background` / `card` (light) | 128 | `app/ecomerse-checkout.tsx` (varios) |
| `#FF7D00` | `secondary` | 45 | `app/lifebook-inbox.tsx:195` |
| `#F53F3F` | `danger` | 30 (+8 con alfa) | `app/taxi.tsx:1278`, `app/conductor.tsx:1866` |
| `#27AE60` | `success` | 29 (+7 con alfa) | `app/conductor.tsx:1919` |
| `#0084FF` | `primary` | 28 | `app/lifebook-inbox.tsx:195` |
| `#D93636` | `dangerPressed` | 9 | `app/documents.tsx:39` |
| `#1E8E4E` | `successPressed` | 6 | — |
| `#86909C` | `textSecondary` (light) | 6 | — |
| `#17171A` | `shadow` (light) | 6 | `app/index.tsx:290`, `components/MapTools.tsx:110` |
| `#F5F7FA` | `surface` (light) | 3 | — |
| `#1D2129` | `textPrimary` (light) | 3 | — |
| `#006BD6` | `primaryPressed` | 3 | — |
| `#E56E00` | `secondaryPressed` | 4 | — |
| `#000000` | `shadow` (dark) | 1 | — |
| `#F2F3F5` | `textPrimary` (dark) | 1 | `kit/theme/colors.ts:52` |
| `#A9AEB8` | `textSecondary` (dark) | 1 | `kit/theme/colors.ts:53` |
| `#1E1E23` | `surface` (dark) | 1 | `kit/theme/colors.ts:55` |
| `#232329` | `card` (dark) | 1 | `kit/theme/colors.ts:56` |
| **Total** | | **321** | |

**Observación crítica:** de 321 usos de token, **el 89 % (286) son de solo 5 colores** (`#FFFFFF`, `#FF7D00`, `#F53F3F`, `#27AE60`, `#0084FF`). Los 13 tokens restantes se usan entre 1 y 9 veces. Y varios tokens oficiales **nunca se usan como literal** (se consumen solo vía `colors.*`), lo cual es correcto.

### 2.2 Valores que **NO** son token oficial

**95 bases únicas** (806 ocurrencias). Composición:

- **`#FFF`** — el no-token nº1 (387 usos). Es un **alias no declarado** de `background`/`card`.
- **97 colores ausentes de la paleta**, de los cuales los más graves por su rol semántico son:
  - Verdes de éxito: `#10B981`, `#00B26A`, `#25D366`, `#2BC26A`, `#16A34A`, `#22A55A`, `#059669`, `#00A86B`, `#3DD68C`, `#ADFADE`
  - Rojos: `#EF4444`, `#FF2442`, `#FF3B5C`, `#FF6B6B`, `#FF5A26`, `#D93B2B`, `#991B1B`
  - Ámbares/avisos: `#F59E0B`, `#F6B100`, `#F5B50A`, `#F5A623`, `#F5B800`, `#FFB400`, `#FFD166`, `#B45309`, `#B25E00`, `#FFB020`, `#F6C026`, `#F07F13`, `#92400E`, `#78350F`, `#F5C518`
  - Azules: `#0EA5E9`, `#2563EB`, `#4FA8FF`, `#00C2FF`, `#6366F1`, `#0284C7`, `#2B6BE4`, `#0A6CFF`, `#3D8BFF`
  - Naranja: `#FF6B35` (el nº3 del inventario)
  - Violeta/magenta sin rol declarado en el kit: `#8B5CF6`, `#7C3AED`, `#B57BFF`, `#E0439A`, `#FF7BAC`
- **Alias de gris/negro divergentes**: `#000` (26 usos, cuando el token es `#000000` y **no** está en `lightColors`), `#141414`, `#eee`, `#ccc`, `#f5f5f5`, `#f2f2f2`, `#eaeaea`, `#8E8E93`.

**Conclusión de §2:** el kit define 18 tokens; el código real usa **113 colores distintos**. La paleta oficial cubre el **28,5 %** de las ocurrencias. El sistema de tokens existe y es correcto, pero está **mayoritariamente ignorado fuera del kit**.

---

## 3. Agrupación de los NO oficiales por familia + duplicados semánticos

Familias calculadas por matiz HSL sobre las 95 bases no oficiales (una base con saturación < 0,10 se clasifica como gris/neutro). Dos correcciones manuales sobre la clasificación automática, justificadas por el uso semántico real: `#10B981` y `#059669` (matiz 160-161°, clasificados como "cian" por el algoritmo) son **verdes de ÉXITO** en el código (`billing-status.tsx:31`), así que se contabilizan en la familia VERDE; `#0EA5E9` se queda en la familia AZUL/cian de información porque se usa como estado "en revisión".

| Familia | Hex distintos | Ocurrencias |
|---|---|---|
| **GRIS/NEUTRO** | 26 | 461 |
| **NARANJA/ÁMBAR** (aviso + naranja de marca) | 22 | 135 |
| **AZUL/CIAN** (información/acción) | 24 | 61 |
| **VERDE** (éxito) | 10 | 81 |
| **ROJO** (error/peligro) | 12 | 138 |
| **VIOLETA/MAGENTA/ROSA** (sin rol en el kit) | 7 | 26 |
| **Total** | **95** | **806** |

### 3.1 Duplicados semánticos — varios hex para el MISMO significado

Esta es la patología central. Por cada significado hay una **paleta paralela** completa:

| Significado (rol) | Hex distintos | Ocurrencias | Archivos | Hex y conteo |
|---|---|---|---|---|
| **ÉXITO / verde** | **11** | 104 | 38 | `#27ae60`(36), `#10b981`(35), `#00b26a`(9), `#25d366`(8), `#2bc26a`(6), `#16a34a`(4), `#22a55a`(2), `#059669`(1), `#adfade`(1), `#3dd68c`(1), `#00a86b`(1) |
| **ERROR / rojo** | **9** | 110 | 46 | `#f53f3f`(38), `#ff2442`(27), `#ef4444`(18), `#d93636`(9), `#ff3b5c`(8), `#ff6b6b`(3), `#ff5a26`(3), `#d93b2b`(2), `#991b1b`(2) |
| **AVISO / ámbar** | **16** | 75 | 23 | `#f59e0b`(17), `#f6b100`(10), `#f5b50a`(8), `#f5a623`(7), `#f5b800`(5), `#d97706`(5), `#ffb400`(4), `#ffd166`(4), `#b45309`(3), `#b25e00`(3), `#ffb020`(2), `#f6c026`(2), `#f07f13`(2), `#78350f`(1), `#92400e`(1), `#f5c518`(1) |
| **INFORMACIÓN / azul** | **10** | 56 | 24 | `#0084ff`(28, el token), `#0ea5e9`(11), `#2563eb`(5), `#4fa8ff`(4), `#6366f1`(2), `#00c2ff`(2), `#0284c7`(1), `#2b6be4`(1), `#0a6cff`(1), `#3d8bff`(1) |
| **SIN ROL EN EL KIT (violeta/magenta)** | **5** | 16 | 9 | `#e0439a`(6), `#8b5cf6`(5), `#7c3aed`(3), `#b57bff`(1), `#ff7bac`(1) |

**Total: 51 hex distintos repartidos en 5 significados.** El kit solo declara **un** token por significado (`success`, `danger`, `secondary`, `primary`). Es decir, el 77 % de los colores semánticos del proyecto son invenciones locales.

#### Evidencia de los duplicados más dañinos, uno por uno

**(a) ÉXITO — 10 verdes no oficiales para "correcto".**
El token `success` es `#27AE60` y se usa 36 veces, pero:
- `app/billing-status.tsx:31` → `approved: { label: 'Aprobado', color: '#10B981' }` (verde esmeralda, distinto al token)
- `app/billing-checkout.tsx:40` → `approved: ... color: '#10B981'` (mismo desvío, otro archivo)
- `app/conductor.tsx:1919,1948,1965` → botones de acción positiva (`btnYes`, `goOnlineBtn`, `acceptBtn`) en `#27AE60` (token, correcto)
- `app/driver-onboarding.tsx:35` → `{ label: 'Verde', hex: '#22A55A' }`
- `components/rental/Badges.tsx:51` → `backgroundColor: '#059669'` para "Verificación avanzada"
- `app/ecomerse-checkout.tsx:350`, `app/food-checkout.tsx:508`, `app/lifebook-checkout.tsx:488` → los tres usan `'#16a34a'` **inline** para "saldo suficiente", mientras `app/monedero.tsx` y `app/documents.tsx` usan `#FDECEC`/`#D93636` para lo mismo en negativo.

**(b) ERROR — el rojo es el peor caso, con 9 rojos para 3 significados distintos.**
Hay que separar dos significados que el código confunde en un solo grupo de color:
- **Error/peligro real** → debería ser `danger` `#F53F3F`. Usado 38 veces (`app/conductor.tsx:1866`, `app/taxi.tsx:1278`).
- **"Me gusta" / favorito (NO es error)** → `#FF2442` (27), `#FF3B5C` (8), `#EF4444` (2). Tres hex distintos para el mismo corazón:
  - `app/lifebook-ai.tsx:453` y `components/lifebook/CommentsSheet.tsx:188` → `#FF2442`
  - `app/ecomerse-detail.tsx:344`, `app/ecomerse-favorites.tsx:225`, `app/ecomerse.tsx:166` → `#FF3B5C`
  - `app/alquiler-detalle.tsx:430` → `#EF4444`
  Los tres son "corazón activo" y los tres son colores diferentes. `app/lifebook-videos.tsx:122` incluso declara `const LIKE_RED = '#FF2442';` (una constante local para un token que el kit no tiene).

**(c) AVISO — 16 ámbares para "atención", el peor dispersado.**
- `app/billing-status.tsx:28` → `pending_payment: '#F59E0B'`
- `app/taxi.tsx:1667`-equivalente y `app/trips-history.tsx` → `'#F6B100'` (10 usos, 3 archivos)
- `app/lifebook-user.tsx:229` → `'#F5B50A'` (8 usos)
- `app/conductor.tsx:1203` → `'#F5A623'` (7 usos, todos en el mismo archivo)
- `components/DriverHomeSheet.tsx` → `'#F5B800'` (5 usos)
- `components/rental/Badges.tsx:13` → `'#f59e0b'` como **color de marca de "Destacado"**
Cuatro de estos (`#F6B100`, `#F5B50A`, `#F5B800`, `#F5A623`) están a menos de 3° de matiz entre sí: son **invisibles como diferencia en pantalla** y aun así son cuatro tokens paralelos.

**(d) Duplicados literales del mismo archivo lógico (mismo componente, dos colores).**
- `app/documents.tsx:39-40` define `Rechazado: { fg: '#D93636' }` y `Vencido: { fg: '#D93636' }`, y `app/monedero.tsx:59-60` repite `FAILED`/`CANCELLED` con `'#D93636'`: cuatro estados distintos de dos módulos, un solo color, **definido en dos arrays independientes** (`documents.tsx:36-40` y `monedero.tsx:59-61`).
- **La prueba más clara de deriva**: `app/billing-status.tsx:35` mapea el estado `refunded` (Reembolsada) a **rojo `#EF4444`**, mientras `app/billing-checkout.tsx:44` mapea el **mismo estado** `refunded` a **gris `#64748B`**. Dos pantallas del mismo flujo, mismo estado del backend, dos colores y dos semánticas opuestas. Además `billing-status.tsx:34` inventa `reversed` → `#7C3AED`, un violeta que no existe en el kit.

---

## 4. Violaciones de la semántica declarada por el propio kit

El comentario de cabecera del kit declara la regla (`ui-kit/src/theme/colors.ts:3-4`):

> `Semántica estricta: azul=acción principal · naranja=servicios/proceso · verde=éxito · rojo=SOLO emergencia.`

### 4.1 Naranja como color de ACCIÓN PRINCIPAL (violación masiva y sistemática)

`#FF6B35` (**53 usos en 17 archivos**) es el naranja no oficial que sustituye al azul `primary` en los botones de acción principal. Como el propio código documenta en `app/food-menu.tsx:31-34`:

```
// Acento del flujo de servicios (naranja), consistente con la home de Comida y
// Ecomerse. Nota DS: migración a token del theme (secondary #FF7D00) sería un
// repintado global del marketplace — pendiente como ronda de design system.
const ACCENT = '#FF6B35';
```

Es decir: **el desvío está conscientemente registrado y aplazado.** `const ACCENT = '#FF6B35'` está declarado como constante local en **6 pantallas distintas**: `app/food-checkout.tsx:49`, `app/food-menu.tsx:34`, `app/food-orders.tsx:35`, `app/food-owner.tsx:41`, `app/food-rider.tsx:33`, `app/lifebook-hotel-detalle.tsx:28`.

Botones de **acción principal** pintados con el naranja (deberían ser `primary` azul según la regla del kit):

| Archivo:línea | Evidencia |
|---|---|
| `app/ecomerse.tsx:582` | `btnPrimary: { ... backgroundColor: '#FF6B35' ...}` |
| `app/ecomerse.tsx:530` | `addBtn: { ... backgroundColor: '#FF6B35' }` (botón "añadir al carrito") |
| `app/food.tsx:406` | `btnPrimary: { ... backgroundColor: '#FF6B35' }` |
| `app/food-checkout.tsx:610` | `btnPrimary: { ... backgroundColor: '#FF6B35' }` |
| `app/ecomerse-detail.tsx:353` | `style={[s.buyBtn, { backgroundColor: canBuy ? '#FF6B35' : colors.border }]}` (botón COMPRAR) |
| `app/work.tsx:258` | `retryBtn: { ... backgroundColor: '#FF6B35' }` |
| `app/billing-status.tsx:202` | `<Pressable ... accessibilityRole="button" ... backgroundColor: '#FF6B35' ...>` (botón **Reintentar** tras un error) |
| `app/ecomerse-orders.tsx:191` | `Pressable ... backgroundColor: '#FF6B35'` (acción de recuperación de error) |
| `app/ecomerse-detail.tsx:112` | `Pressable onPress={load} ... backgroundColor: '#FF6B35'` (reintentar) |

Además, en esos mismos archivos el azul del kit **sí** se usa a veces, produciendo inconsistencia *dentro del mismo archivo*: `app/ecomerse-seller.tsx:489` usa `alpha('#FF6B35', 0.12)` en la rama `shopPlan?.badge` y `alpha(colors.primary, 0.07)` en la otra — el mismo contenedor cambia de familia de color según un booleano.

### 4.2 Rojo usado como decoración o aviso NO crítico (violación de "rojo=SOLO emergencia")

**(a) El caso más grave: un aviso de simulación con el mismo rojo que el SOS.** En `app/conductor.tsx:1705` hay una franja que dice literalmente *"🔥 Zonas calientes (simulación) · sin demanda real aún"* pintada con `backgroundColor: 'rgba(245,63,63,0.92)'` — es decir `danger #F53F3F` con alfa 0.92. Y **nueve líneas más abajo**, en el mismo bloque de render y el mismo mapa, está el botón de emergencia real (`app/conductor.tsx:1711-1713`, comentado `EMERGENCIA (mapa): marcación directa 24/7`). Un aviso informativo y el botón de emergencia comparten color e intensidad.

**(b) Rojo como insignia de "me gusta" (decoración pura, cero criticidad).** El rojo es el color de marca de la interacción social en Lifebook:
- `app/lifebook-messages.tsx:448` → `backgroundColor: '#FF2442'` para un **contador de no leídos** (número de mensajes).
- `app/ecomerse.tsx:591` → `cartBadge: { ... backgroundColor: '#FF3B5C' }` (contador de carrito).
- `app/work.tsx:257` → `filterBadge: { ... backgroundColor: '#F53F3F' }` (contador de filtros activos).
- `app/lifebook-search.tsx:498` → `color: i < 3 ? '#FF2442' : colors.textSecondary` (el **color del ranking** de una lista de búsqueda: el top-3 se pinta rojo).
- `components/lifebook/ReportSheet.tsx:89-92` → el botón **"Bloquear usuario"** usa `alpha('#FF2442', 0.1)`/`'#FF2442'` con el literal crudo, mientras **el resto del mismo componente usa tokens correctamente** (`colors.overlay`:58, `colors.card`:59, `alpha(colors.textPrimary, 0.2)`:60, `colors.primary`:69, `alpha(colors.primary, 0.06)`:77). Es el ejemplo perfecto de fuga local.

**(c) Rojo como color de un botón de reintento de red (error no crítico).**
- `app/lifebook-videos.tsx:1346` → `retry: { marginTop: 18, backgroundColor: '#FF2442', ... }` — un fallo de red se pinta con el rojo de "me gusta".

**(d) Rojo como color de un selector de color de coche (decoración).**
- `app/driver-onboarding.tsx:33` → `{ label: 'Rojo', hex: '#D93B2B' }` y `app/taxi.tsx:1311` → `rojo: '#D93B2B'`. Aquí el rojo describe un coche, no una alarma: es correcto conceptualmente, pero debería venir de una paleta de datos (swatches), no del rojo semántico. Nótese que los 10 swatches de coche son **10 literales hex inventados** (`driver-onboarding.tsx:28-39`) duplicados casi línea a línea en `taxi.tsx:1310-1311`.

**(e) Rojo como decoración de fila "vencida" en texto secundario de baja importancia.**
- `app/agente.tsx:181` → `color: vencida ? '#D93636' : colors.textSecondary` (un `Text` de 11 px).
- `app/lifebook-messages.tsx:434` → `position:'absolute' ... backgroundColor: '#F53F3F'` (un punto de notificación).

### 4.3 Azul = acción principal: cumplimiento parcial

El azul se respeta donde el resto del archivo también es disciplinado (`app/emergencia.tsx` usa `colors.primary` en `:110-113`, `colors.danger` en `:53,59,60,77,78,85,87`). Pero se erosiona por azules paralelos:
- `app/conductor.tsx:1477` → `#0A6CFF` y `app/conductor.tsx:2056` → `#3D8BFF`: dos azules de acción en el mismo archivo, junto a `colors.primary` (`#0084FF`) usado en `:1468,1536`. Tres azules casi idénticos.
- `app/driver-onboarding.tsx:34` → `{ label: 'Azul', hex: '#2563EB' }` (swatch).
- `app/lifebook-user.tsx:452` → `#2B6BE4` en un gradiente.

**Balance de §4:** la regla del kit se cumple en los módulos "nuevos" (hotel, monedero, emergencia, index) y se viola sistemáticamente en marketplace/comida/ecomerse (naranja como acción) y en Lifebook (rojo como social). La violación no es accidental: es una **decisión de producto divergente** registrada como deuda en `food-menu.tsx:31-34`.

---

## 5. Tabla de mapeo propuesta (hex más repetidos → token destino)

Criterio: `primary` azul para acción; `secondary` naranja para servicios/proceso; `success` verde para éxito; `danger` rojo solo emergencia; y **tokens nuevos** que el kit necesita declarar para los roles que hoy no cubre (marca social, aviso, info, gris). "Token nuevo" = propuesta a añadir a `ThemeColors`; no implica que exista hoy.

| Hex actual | N | Rol real en el código | Token destino | Acción |
|---|---|---|---|---|
| `#fff` | 387 | blanco de texto/superficie | `#FFFFFF` (`background`/`card`) | **normalizar a `#FFFFFF`** o a `colors.card`/`colors.background`. Unificar con el literal #2 |
| `#ffffff` | 128 | ídem | ya es token | conservar |
| `#ff6b35` | 53 | acento de marketplace/comida (acción) | `secondary` `#FF7D00` para lo *de proceso*; **`primary` `#0084FF` para botones de acción** | revisar caso a caso: `btnPrimary`/`buyBtn`/`retryBtn` → `primary`; chips y precios → `secondary` |
| `#ff7d00` | 45 | `secondary` | ya es token | conservar |
| `#10b981` | 35 | éxito ("Aprobado") | `success` `#27AE60` | sustituir |
| `#f53f3f` | 38 (base) | peligro/emergencia | `danger` | conservar (es token); **retirar de contadores e insignias decorativas** |
| `#27ae60` | 36 (base) | éxito | ya es token | conservar |
| `#0084ff` | 28 | acción principal | ya es token | conservar y **extender** a los botones hoy naranjas |
| `#ff2442` | 27 | "me gusta"/social + (mal) error de red | **token nuevo `like`** (p. ej. `#FF2442`) | declarar; sustituir `#FF3B5C`/`#EF4444` del corazón por él. `lifebook-videos.tsx:1346` (retry) → `primary` |
| `#000` | 26 | sombra / fondo oscuro | `shadow` (`#17171A`) / `background` dark | sustituir; en `shadowColor` usar `colors.shadow` |
| `#ef4444` | 18 | error (rechazo/disputa) y corazón | `danger` `#F53F3F` (error) / `like` (corazón) | dividir por rol |
| `#f59e0b` | 17 | aviso/pendiente | **token nuevo `warning`** (p. ej. `#F59E0B`) | declarar; absorber los otros 15 ámbares |
| `#64748b` | 11 | estado neutro/cancelado | `textSecondary` `#86909C` | sustituir |
| `#0ea5e9` | 11 | info "en revisión" | **token nuevo `info`** (p. ej. `#0EA5E9`) | declarar |
| `#00b26a` | 9 | éxito (taxi/buscar) | `success` `#27AE60` | sustituir |
| `#d93636` | 9 | `dangerPressed` | ya es token | conservar |
| `#8e8e93` | 8 | gris de icono inactivo | `textSecondary` `#86909C` | sustituir |
| `#25d366` | 8 | **verde de marca WhatsApp** | **token nuevo `brandWhatsApp`** | declarar explícitamente: es un color de tercero, no de EG Route Plan |
| `#ff3b5c` | 8 | "me gusta" (ecomerse) | `like` (el mismo token nuevo) | sustituir |
| `#f6b100` | 10 (base) | aviso (taxi) | `warning` | sustituir |
| `#f5b50a` | 8 | aviso (lifebook) | `warning` | sustituir |
| `#f5a623` | 7 | aviso (conductor) | `warning` | sustituir |
| `#f5b800` | 5 | aviso (DriverHomeSheet) | `warning` | sustituir |
| `#d97706` | 5 | "Premium" / aviso reforzado | `warning` + variante pressed | sustituir |
| `#ffb400` | 4 | aviso/estado | `warning` | sustituir |
| `#ffd166` | 4 | acento decorativo | `warning` claro (nuevo) | sustituir |
| `#4fa8ff` | 4 | azul claro decorativo | `alpha(primary, ...)` | sustituir por `alpha(colors.primary, x)` |
| `#16a34a` | 4 | éxito (saldo) | `success` | sustituir |
| `#8b5cf6` | 5 | acento de categoría | **token nuevo `accent`/categoría** | declarar o eliminar |
| `#111827` | 5 | texto casi negro | `textPrimary` `#1D2129` | sustituir |
| `#2563eb` | 5 | azul de acción/swatch | `primary` `#0084FF` | sustituir |
| `#cbd5e1` | 5 | borde claro | `border` | sustituir |
| `#e0439a` | 6 | acento magenta | **token nuevo `accent`** | declarar o eliminar |
| `#2bc26a` | 6 | éxito (conductor) | `success` | sustituir |
| `#7c3aed` | 3 | estado "reversada" | **token nuevo** o `textSecondary` | decidir semántica primero |
| `#b45309` / `#b25e00` / `#92400e` / `#78350f` | 3/3/1/1 | texto sobre fondo ámbar | variante *on-warning* (nuevo) | declarar como par texto/fondo de `warning` |

**Tokens nuevos que el kit necesita (mínimo viable):** `warning`, `warningPressed`, `onWarning`, `info`, `like`, `brandWhatsApp`, y una decisión sobre el violeta/magenta (`accent`). Sin `warning` e `info` es imposible migrar el 100 % del código: hoy no existe destino para 16 ámbares ni para los azules de "en revisión".

**Prioridad de migración sugerida** (por impacto = ocurrencias × facilidad):
1. `#fff` → `#FFFFFF` (387 usos, reemplazo mecánico y sin riesgo, el shim ya los trata igual).
2. `#10b981` → `success` (35 usos, 2 archivos dominan).
3. `#ff6b35` → `primary`/`secondary` (53 usos, requiere decisión de producto, ya registrada).
4. Los 16 ámbares → `warning` (75 usos; primero declarar el token).
5. Los 3 rojos de "corazón" → `like` (35 usos).

---

## 6. Degradados, sombras y alfa que no pueden salir de los tokens

### 6.1 Degradados (`react-native-svg` `LinearGradient` + `Stop`)

El proyecto **no usa `expo-linear-gradient`** a propósito (documentado en `app/lifebook-videos.tsx:142`: *"No se añade `expo-linear-gradient` por esto: el proyecto evita dependencias nuevas"*), así que todos los degradados son SVG. Encontrados **6 degradados reales**, todos con paradas en literales hex que **no pueden salir de los tokens actuales** (el kit no define ningún token de degradado):

| Archivo:línea | Paradas |
|---|---|
| `app/lifebook-user.tsx:451-455` | `#2B6BE4` → `#0084FF` → `#00C2FF` (3 paradas, 2 no oficiales) |
| `app/lifebook-user.tsx:462-465` | `transparent` → `rgba(0,0,0,0.62)` (scrim) |
| `components/status/StatusDetailModal.tsx:153-156` | `{c1}` → `{c2}` (hex inyectados por props) |
| `components/status/StatusDetailModal.tsx:166-169` | `#000` con `stopOpacity 0` → `0.72` (scrim) |
| `components/status/StatusRingAvatar.tsx:55-58` | `{c1}` → `{c2}` (anillo de historia, hex por props) |
| `components/SocialHomeHeader.tsx:131-134` | `#16202E`→`#0F1620` (oscuro) / `#DFEAF2`→`#F6EEDC` (claro) — **4 hex no oficiales** |
| `components/SocialHomeHeader.tsx:143-146` y `204-207` | `fadeTo` con `stopOpacity 0` → `0.85` (2 scrims) |

**Conclusión:** ningún degradado es derivable de tokens. Hacen falta (a) tokens de degradado explícitos, o (b) un helper que componga degradados desde `colors.primary`/`secondary`/`surface` con `alpha()`. Los scrims (`rgba(0,0,0,0.62)`, `rgba(0,0,0,0.72)`, `rgba(0,0,0,0.55)`) duplican conceptualmente el token `overlay` (`rgba(23,23,26,0.45)`) sin usarlo.

### 6.2 Sombras

- **28 líneas con `shadowColor`**, con **solo 2 valores distintos**: `#000` (12 veces) y `#17171A` (2 veces). El token `colors.shadow` existe (`#17171A` claro / `#000000` oscuro) y **solo se usa en 2 sitios correctamente** (`components/LocationBadge.tsx:43`, `app/reserva.tsx:460`); el resto usa el literal `'#000'` a pelo (`app/conductor.tsx:1937,1982,1989,2026`, `components/FloatingFooter.tsx:130`, `components/SearchHeader.tsx:106`, `components/ServicesDrawer.tsx:385`, `components/DriverHomeSheet.tsx:287,298`, `components/lifebook/BotonCucucul.tsx:52`, `app/taxi.tsx:1023`, `app/lifebook.tsx:1406`…).
- **`shadowOpacity` toma 9 valores distintos sin escala**: 0.05, 0.06, 0.08, 0.12, 0.14, 0.15, 0.16, 0.18, 0.2, 0.22, 0.25. Igual con `shadowRadius` (6, 8, 10, 12, 14, 16, 20, 24) y `elevation` (1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 18, 20). **47 líneas con `elevation`.**
- **Ninguno de estos valores es un token.** El kit no exporta ninguna escala de sombra/elevación, así que esto es una laguna del kit, no solo una fuga. Recomendación: 3-4 niveles (`shadow.sm/md/lg`) que fijen a la vez `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset` y `elevation`.

### 6.3 Alfa

- **700 llamadas a `alpha()` del kit** (en 137 archivos) frente a **275 usos manuales de `rgba()`/`rgb()`** (en 64 archivos). O sea: la mayoría del alfa ya es token-based (bueno), pero queda un tercio manual.
- **106 valores `rgba()` literales distintos.** Los más repetidos y su problema:
  - `rgba(0,0,0,0.45)` (25×) y `rgba(0,0,0,0.55)` (17×) → deberían ser `colors.overlay` (`rgba(23,23,26,0.45)`) y `darkColors.overlay` (`rgba(0,0,0,0.55)`). **42 usos que reimplementan el token `overlay`.**
  - `rgba(255,255,255,0.85)` (16×), `0.9` (10×), `0.18` (9×), `0.95` (8×), `0.16` (6×), `0.35` (5×), `0.7` (5×), `0.55` (5×), `0.62` (5×), `0.8` (5×)… → no existe ningún token `onPrimary`/`textOnDark`; hay ~15 niveles de blanco translúcido sin escala.
  - `rgba(245,63,63,0.92)` (4×) → **es `danger` con alfa**, escrito a mano (`app/conductor.tsx:1160,1705,1717`). Debería ser `alpha(colors.danger, 0.92)`.
  - `rgba(0,132,255,0.12)` / `0.14` / `0.08` / `0.18` / `0.45` / `0.92` (3+3+1+1+1+1) → **es `primary` con alfa**, escrito a mano (`app/conductor.tsx:1468,1536`, `app/ecomerse-detail.tsx:408`, `app/ecomerse.tsx:519`, `components/status/StatusDetailModal.tsx:300`, `components/LocationBadge.tsx:36`, `components/MapTools.tsx:84`). **10 usos que reimplementan `alpha(colors.primary, x)`.**
  - `rgba(16,185,129,0.12)` (3×) → `success`… pero de `#10B981`, que no es el token: es el verde no oficial con alfa. Doble desvío.
  - `rgba(255,107,53,0.14)` (2×) → `#FF6B35` con alfa.
- **3 archivos reimplementan la propia función `alpha()` del kit en local**: `app/reserva.tsx:445`, `app/taxi.tsx:56`, `components/SearchHeader.tsx:89` — las tres con el literal `return \`rgba(${r}, ${g}, ${b}, ${opacity})\`` cuando `@egrouteplan/ui-kit` ya la exporta (`theme/colors.ts:63-68`). **Duplicación de utilidad, no solo de color.**
- **19 literales de 8 dígitos** (`#F53F3F55`, `#27AE6033`, `#f5a62366`, `#f6b10033`, …) que son **hex-con-alfa escrito a mano**. 15 de ellos derivan de un token oficial y 4 de colores no oficiales (`#f5a62366`, `#f6b10033`, `#f6b1000f`). Todos deberían ser `alpha(token, x)`. Nótese que el sufijo de alfa es ilegible para un revisor humano (`55` = 33 %, `18` = 9 %).

---

## 7. Resumen ejecutivo de hallazgos

| # | Hallazgo | Magnitud |
|---|---|---|
| 1 | **113 colores distintos** en el código frente a **18 tokens** declarados | 806/1127 ocurrencias (71,5 %) fuera de paleta |
| 2 | **`#fff` es el literal más repetido (387)** y no es token; convive con `#ffffff` (128) | 515 ocurrencias del mismo blanco |
| 3 | **Paletas semánticas paralelas completas**: 11 verdes de éxito, 9 rojos de error, 16 ámbares de aviso, 10 azules de info | 51 hex para 5 significados |
| 4 | **Naranja `#FF6B35` como acción principal** viola la regla del kit | 53 usos / 17 archivos / 6 constantes `ACCENT` locales |
| 5 | **Rojo como decoración**, incl. aviso de *simulación* con el mismo color que el SOS | `conductor.tsx:1705` vs `:1711`; `like` en 3 rojos distintos |
| 6 | **Mismo estado, dos colores**: `refunded` es rojo en `billing-status.tsx:35` y gris en `billing-checkout.tsx:44` | deriva confirmada en el mismo flujo |
| 7 | **El kit no tiene tokens para `warning`, `info`, `like` ni sombras** | bloquea la migración del 100 % de ámbar/info |
| 8 | **El kit está limpio** (1 solo literal no oficial de 30); el problema es de adopción, no de definición | `CameraCapture.tsx:206` (`#FFF`) |

---

## 8. Observación adicional (no pedida): contraste calculado

No forma parte del encargo, pero el inventario lo permite y afecta al riesgo real. Ratios **calculados** con la fórmula WCAG 2.x (no medidos en pantalla):

| Par | Ratio | Umbral AA texto normal (4,5) |
|---|---|---|
| `#FFFFFF` sobre `secondary` `#FF7D00` (token oficial) | **2,57** | ✗ |
| `#FFFFFF` sobre `success` `#27AE60` (token oficial) | **2,87** | ✗ |
| `#FFFFFF` sobre `#FF6B35` (ACCENT de marketplace) | **2,84** | ✗ |
| `#FFFFFF` sobre `#D97706` (`PremiumBadge`, `Badges.tsx:25-26`) | **3,19** | ✗ |
| `#FFFFFF` sobre `primary` `#0084FF` (token oficial) | **3,66** | ✗ |
| `#FFFFFF` sobre `danger` `#F53F3F` (token oficial) | **3,71** | ✗ |
| `#78350F` sobre `#F59E0B` (`FeaturedBadge`, `Badges.tsx:13-14`) | **4,22** | ✗ (casi) |
| `#86909C` sobre `#FFFFFF` (`textSecondary` oficial) | **3,24** | ✗ |
| `#10B981` sobre `#FFFFFF` | **2,54** | ✗ |
| `#64748B` sobre `#FFFFFF` | **4,76** | ✓ |
| `#92400E` sobre `#FFFFFF` | **7,09** | ✓ |
| `#991B1B` sobre `#FFFFFF` | **8,31** | ✓ |

Interpretación: varias combinaciones **del propio kit** no alcanzan AA para texto normal (aunque sí para texto grande ≥18,66 px bold, umbral 3,0). Los badges de `components/rental/Badges.tsx` son el caso más expuesto porque son texto pequeño (10-12 px) sobre fondo ámbar. **No es un hallazgo del inventario de literales**, es una consecuencia de la paleta; se reporta aparte y se recomienda una pasada de contraste con medidas reales antes de tocar los tokens.

---

## Puntuación: 5/10

**Razones del 5:**

**A favor (lo que sostiene la nota por encima del suspenso):**
- El kit **define** una paleta correcta, pequeña, con semántica explícita y comentada (`colors.ts:1-6`), con modo claro y oscuro, y con una función `alpha()` propia para evitar `color-mix` (los tokens están bien pensados, no son el problema).
- Existe un **shim de compatibilidad** (`constants/colors.ts`) que permite migrar sin romper imports, y el kit **exporta** todo lo necesario.
- **700 llamadas a `alpha()` frente a 275 `rgba()` manuales**: la mayoría del alfa ya es token-based. La cultura de tokens existe.
- Hay **19 pantallas de `app/` que usan exclusivamente tokens**, incluida `app/emergencia.tsx` — que es un modelo ejemplar precisamente en el caso más crítico.
- La deuda está **documentada en el propio código** (`food-menu.tsx:31-34`), lo que indica conciencia y un plan, no caos.

**En contra (por lo que no llega a 7-8):**
- **71,5 % de las ocurrencias de color están fuera de la paleta.** Para una super-app que declara "semántica estricta", que casi tres de cada cuatro colores ignoren el sistema es la definición de un design system **no adoptado**.
- **113 colores frente a 18 tokens**: no estamos ante "algunas excepciones", estamos ante **paletas paralelas completas**. Cinco significados (éxito, error, aviso, info, social) tienen entre 9 y 16 variantes cada uno.
- **Violaciones directas de la regla que el kit escribe en su primera línea**: naranja como acción principal en 17 archivos, y rojo —que el kit reserva a "SOLO emergencia"— usado en contadores de carrito, rankings de búsqueda y avisos de simulación. La coincidencia entre el chip de simulación (`conductor.tsx:1705`) y el botón SOS (`:1711`) es un fallo funcional de seguridad, no solo estético.
- **Deriva semántica confirmada en el mismo flujo**: el estado `refunded` es rojo en una pantalla y gris en otra.
- **Lagunas del kit que bloquean la solución**: sin tokens `warning`, `info`, `like` ni escala de sombras, no existe destino al que migrar 16 ámbares, 10 azules de info ni 28 sombras. El sistema actual **no puede** representar lo que el código ya hace.
- Se **duplican utilidades** propias del kit (`alpha()` reimplementada en 3 archivos) y se usa `#fff`/`#000` en lugar de los tokens declarados.

**Qué subiría la nota a 8-9** (en orden de retorno):
1. Declarar en el kit `warning`, `warningPressed`, `onWarning`, `info`, `like`, `brandWhatsApp` y una escala `shadow.sm/md/lg` — **sin esto la migración es imposible**.
2. Normalizar `#fff`→`#FFFFFF` y `#000`→`colors.shadow`: 413 ocurrencias, cambio casi mecánico, cero riesgo visual.
3. Colapsar las paletas paralelas: 11 verdes→1, 9 rojos→2 (`danger` + `like`), 16 ámbares→1, 10 azules→2 (`primary` + `info`).
4. Sacar el rojo de toda decoración (contadores, rankings, simulación) y el naranja de todo botón de acción principal.
