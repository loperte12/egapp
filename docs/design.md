# design.md — Sistema de diseño de EG Route Plan

> **Fuente de verdad:** `packages/ui-kit/src/theme/` del repo `D:\egapp`. Este documento es su
> **espejo legible** para diseño y handoff; si hay discrepancia, manda **el código**.
> Los valores de esta tabla **no son inventados**: están extraídos de `colors.ts` y `escalas.ts`.

**Regla que gobierna todo:** en el código **no se escribe un literal de diseño a mano**. Ni un hex, ni
un `fontSize`, ni un `borderRadius`, ni un `fontWeight`, ni un `borderWidth`, ni un espaciado. Todo sale
de un token. La guardia `pruebas/verifica-diseno.cjs` cuenta los literales y **falla si sube el total**
(trinquete). Estado actual: `hex 0 · fontSize 0 · borderRadius 0 · fontWeight 0 · borderWidth 7 ·
espaciado 183 · precioFigura 5 · strokeWidth 0`.

---

## 1. Color

### 1.1 Marca y acentos (`brand`)

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#0066CC` | acción principal, selección, foco |
| `primaryPressed` | `#00529E` | estado pulsado del primario |
| `primaryDark` | `#5FA9EE` | **el primario como texto en tema oscuro** (el base no llega a 4,5) |
| `primarySoft` | `#0066CC14` | fondo de píldora/chip seleccionado |
| `secondary` | `#C2410C` / `secondaryDark` `#F08A4B` | precio, acentos cálidos, **promoción** |
| `success` | `#1E7A45` / `successDark` `#45B87A` | sello verificado, disponibilidad |
| `warning` | `#F59E0B` / `warningDark` `#F5B942` | estrella de la nota, avisos |
| `danger` | `#C62828` / `dangerDark` `#F58585` | error, no disponible |
| `like` | `#FF2442` | corazón del favorito **pulsado** |
| `guardado` | `#FFB800` | guardado |
| `info` | `#0EA5E9` | informativo |
| `lifebook` | `#8B5CF6` | acento del módulo LifeBook |
| `white` | `#FFFFFF` | texto sobre superficie sólida oscura |

> **Aviso de contraste:** en oscuro, **ningún acento base sirve como texto** (ratios 3,18–4,22). Los
> diez tienen variante `*Dark` y es la que se usa como color de texto. Los ratios verificados van
> escritos al lado de cada valor en `colors.ts`.

### 1.2 Superficies y texto

| Token | Oscuro | Claro |
|---|---|---|
| `background` | `#17171A` | `#FFFFFF` |
| `surface` | `#1E1E23` | `#F5F7FA` |
| `card` | `#232329` | `#FFFFFF` |
| `sheet` (4.º nivel: la hoja se abre **sobre** la tarjeta) | `#2E3338` | `#FFFFFF` |
| `textPrimary` | `#F2F3F5` | `#1D2129` |
| `textSecondary` | `#A9AEB8` | `#6B7280` |
| `border` | `rgba(255,255,255,0.08)` | `rgba(29,33,41,0.08)` |
| `overlay` | `rgba(0,0,0,0.55)` | `rgba(23,23,26,0.45)` |
| `shadow` | `#000000` | `#17171A` |

### 1.3 Escalera de superficies del listado (de fuera a dentro)

`background #17171A` → `card #232329` (la tarjeta) → `surface #1E1E23` (las píldoras de servicio, el
buscador, los chips sin activar) → `sheet #2E3338` (la hoja de filtros que se abre encima).

**La píldora de servicio es más oscura que la tarjeta a propósito**: se distingue del fondo de la
tarjeta sin añadir un borde.

---

## 2. Tipografía

| Token | px | Uso en el listado |
|---|---|---|
| `minimo` | 9.5 | (reservado) |
| `rotulo` | 9 | rótulos diminutos |
| `nota` | 10 | notas legales |
| `micro` | 10.5 | importe secundario, «por noche», impuestos, píldoras de servicio |
| `caption` | 12 | ubicación · distancia |
| `fino` | 14.5 | — |
| `body` | 14 | cuerpo de texto, párrafo de los estados vacío/error |
| `cuerpo` | 15 | texto de botón y de campo |
| `ancho` | 15.5 | **el nombre del hotel** |
| `subtitle` | 16 | — |
| `anchoFuerte` | 16.5 | — |
| `subCabecera` | 17 | — |
| `cabecera` | 18 | **título de EmptyState / ErrorState** |
| `title` | 20 | **el importe del precio** |
| `subtitulo` | 22 | — |
| `tituloFicha` | 24 | título de sección |
| `display` | 26 | — |
| `hero` | 30 / `heroGrande` 34 | portada |
| `cifra` | 19 / `cifraGrande` 21 / `kpi` 38 | cifras de dato |
| `emoji` | 40 · `emojiMedio` 32 · `emojiGrande` 46 | emoji-fallback de la foto |

**Pesos (`peso`):** `normal 400` · `medio 500` · `fuerte 700` · `maximo 800` · `titulo 900`.

**Reglas de uso en la pantalla de listado:**

- Nombre del hotel: `ancho` (15.5) + `maximo` (800). Dos líneas permitidas — el nombre lo escribe el
  hotelero y recortado no se sabe qué se está eligiendo.
- Importe del precio: `title` (20) + `maximo`, y color `text.secondary` (`#F08A4B` en oscuro). **Nunca
  el primario**: el azul es acción, no dato.
- Ubicación, distancia, servicios: `caption` (12) / `micro` (10.5) + `textSecondary`.
- Título de estado: `cabecera` (18) + `maximo`.

---

## 3. Espaciado

Escala: **`e2 e3 e4 e5 e6 e7 e8 e9 e10 e11 e12 e13 e14 e16 e18 e20 e22 e24 e26 e28 e30 e32`**.
**No existen `e1` ni `e15`** (error clásico al escribir de memoria).

Medidas de esta pantalla:

| Qué | Token | px |
|---|---|---|
| Padding general de la pantalla | `e16` | 16 |
| Gap entre tarjetas | `e12` | 12 |
| Padding interno de la tarjeta | `e12` | 12 |
| Gap entre bloques internos de la tarjeta | `e8` | 8 |
| Padding horizontal de una píldora | `e8` | 8 |
| Gap entre icono y texto de una píldora | `e4`/`e5` | 4–5 |
| Gap entre chips de filtro | `e8` | 8 |
| Gap entre el icono y el texto del buscador | `e10` | 10 |
| Padding del bloque vacío/error | `e32` | 32 |

---

## 4. Radio

| Token | px | Uso |
|---|---|---|
| `punta` | 4 | esqueleto de línea |
| `marca` | 6 | — |
| `sm` | 8 | **píldora de servicio**, etiqueta de promoción |
| `chip` | 10 | **chip de filtro**, píldora de nota, bloque de aviso |
| `md` | 12 | **tarjeta y su foto**, botones, buscador |
| `campo` | 14 | campos de entrada |
| `lg` | 16 | — |
| `panel` | 18 | el panel del hotelero y la tarjeta del buscador |
| `full` | 999 | favorito, avatar, círculo del icono de estado |

> **Decisión abierta:** la tarjeta del listado usa `md` (12) en este diseño y `panel` (18) en el código
> ya desplegado (`components/HotelResultCard.tsx`). Unificarlo es una decisión, no un descuido.

---

## 5. Trazo y elevación

**Anchos (`trazo`):** `fino 1` · `base 1.5` · `fuerte 2` · `marcado 2.5` · `anillo 3`.
**Trazo de icono (`trazoIcono`):** `fino 1.8` · `base 2` · `fuerte 2.2` · `acento 2.5` · `marcado 3`.

Son **dos escalas distintas** y confundirlas es el error más repetido del proyecto: `trazo` es para
bordes de caja, `trazoIcono` para el grosor invisible de un icono.

**Elevación (`elevation` / `elevationDark`) — tres niveles, no doce:**

| Nivel | Claro | Oscuro |
|---|---|---|
| `sm` | `0/1` · 2 px · 6 % · `#17171A` | `0/1` · 2 px · 24 % · `#000000` |
| `md` | `0/2` · 6 px · 10 % · `#17171A` | `0/2` · 6 px · 32 % · `#000000` |
| `lg` | `0/6` · 16 px · 16 % · `#17171A` | `0/6` · 16 px · 44 % · `#000000` |

**En esta pantalla la tarjeta NO lleva sombra:** en tema oscuro, `card #232329` sobre
`background #17171A` ya se separa, y un borde de `1 px` al 8 % cierra la silueta. Sombras apiladas en
una lista larga la ensucian y no aportan jerarquía.

**Alturas (`altura`):** `punto 44` · `control 46` · `campo 50` · `boton 52`.
**Iconos (`icono`):** `micro 12` · `sm 16` · `md 20` · `lg 24` · `hero 32`.

---

## 6. Los diez componentes y de qué token se compone cada uno

| Componente | Composición |
|---|---|
| **TopBar** | dos filas · padding `e16` · fondo `background` · borde inferior `trazo.fino` `border` |
| **SearchField** | alto `altura.punto` (44) · radio `md` · fondo `surface` · borde `trazo.fino` · icono `icono.sm` · texto `cuerpo` |
| **FilterChip** | alto 36 · radio `chip` · fondo `surface` · borde `trazo.fino` · texto `chips` 13/700 · icono `icono.micro` |
| **HotelCard** | radio `md` · fondo `card` · borde `trazo.fino` · foto 16:9 arriba · cuerpo padding `e12`, gap `e8` |
| **RatingBadge** | alto 22 · radio `chip` · fondo `primary` al 14 % · estrella `warning` · texto `micro` 800 |
| **PriceTag** | importe `title`/800 en `text.secondary` · «por noche · desde» `micro` 500 · impuestos `micro` 400 |
| **FavoriteButton** | 36×36 · radio `full` · fondo negro al 45 % · borde `trazo.fino` blanco al 20 % · corazón `like` |
| **EmptyState** | círculo 88 · icono `hero` · título `cabecera` · acción `primary` |
| **ErrorState** | círculo 88 con fondo `danger` al 14 % y borde al 33 % · icono `dangerDark` |
| **SkeletonCard** | misma silueta que HotelCard · bloques `sheet` · brillo con `linear-gradient` |

---

## 7. Reglas de contenido (no son de estilo, pero se incumplen igual)

1. **El importe llega calculado del servidor.** En la app no se hace aritmética de dinero. Aquí los
   números son de ejemplo porque es una maqueta; en la implementación vienen de la API.
2. **Formato de importe: punto de millar.** `18.000 XAF`, `12.500 XAF`. El `Precio` del kit ya lo hace;
   no se escribe a mano.
3. **Nada de datos inventados en pantalla.** Un campo que no llega se **deja fuera**, no se rellena.
   Ver `UI-HOTEL-LISTADO-HANDOFF.md` §5 para los cuatro que hoy no llegan.
4. **La nota solo se enseña si el servidor la publica** (`ratingPublished`): el umbral de reseñas es del
   servidor y no se copia en la app.
5. **Los nombres con sufijo numérico son EJEMPLO.** Es el único rastro que queda de los datos de prueba
   y **purgarlos sigue abierto**.
