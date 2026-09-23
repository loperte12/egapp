## 11-bis. Estado de ejecución de la Fase 2 (17/09/2026)

| # | Acción | Estado | Qué se hizo |
|---|---|---|---|
| 14 | Escala única de tipo, espacio y radio | ✅ **Declarada** (migración pendiente) | Nuevo `packages/ui-kit/src/theme/escalas.ts` con `tipografia` (11/12/14/16/20/28), `espaciado` (4/8/12/16/24/32), `radios` (8/12/16/999) y `peso`. Exportadas por el kit y por el shim. **La app todavía no las usa**: sustituir 2.801 `fontSize` y 1.258 `borderRadius` es un barrido guiado que va por tandas, no de golpe |
| 15 | Peso 400 como base | ✅ **Declarado** | `peso.normal: '400'` ya existe en el kit. La app sigue sin usarlo en general: todo estaba en 500–900, y por eso nada destacaba |
| 16 | Colapsar las paletas paralelas | ✅ **Hecho** | **134 valores** de las familias paralelas sustituidos por tokens: 11 verdes de «éxito» → `success`, 16 ámbares → `warning`, rojos claros → `danger` y oscuros → `dangerText` (nuevo: `danger` como texto no llega a AA), azules → `primary`/`info`. Dos falsos positivos retirados por el camino: `#25D366` **no** era un verde de éxito (es la marca de WhatsApp) y `#adFade` **no era un color**: era el identificador de un degradado SVG que el analista de color contó como color |
| 16-bis | Un solo naranja y un solo blanco | ✅ **Hecho** | `#FF6B35` (**53 usos en 17 archivos**) → `brand.secondary`, el naranja oficial. Y **538 `#FFFFFF`** → `brand.white`: mismo valor exacto, cero cambio visual, pero desaparece el blanco escrito a mano. **Los literales de color bajan de 915 a 190** (−79 %) y la guardia `npm run diseno` queda fijada ahí |
| 17 | Naranja de acción principal | 🟡 **A medias, espera tu ojo** | El naranja ya es **uno** (el oficial). Queda una decisión de jerarquía: hoy hay **6 constantes `ACCENT` locales** y botones de acción principal en naranja (`btnPrimary`, `buyBtn`, `retryBtn`). La regla del kit es *azul avanza, naranja clasifica*; cambiarlo toca 17 archivos y prefiero que lo veas antes |
| 18 | Contraste AA | 🟡 **A medias** | `textSecondary` del tema claro pasa de **3,24:1 a 4,76:1** (cumple AA). **Falta tu validación** en los fondos de color: blanco sobre `secondary` da 2,57, sobre `primary` 3,66 y sobre `danger` 3,71. O se oscurecen los tokens (decisión de marca) o el texto de esos botones va en oscuro |
| 19-25 | Modales, errores en línea, listas, imágenes, estados vacíos, códigos de error y plegado del checkout | ⏳ Pendiente | Siguiente tanda |

### Lo que NO se tocó a propósito (y por qué)

- **Violetas y magentas** (`#E0439A`, `#8B5CF6`, `#7C3AED`, `#B57BFF`, `#FF7BAC`): **27 usos sin significado declarado**. Mapearlos a ciegas sería inventar semántica: hay que decidir qué son (¿creador? ¿social? ¿destacado?) y entonces darles token.
- **Grises de texto** (`#8E8E93`, `#86909C`, `#111827`, `#CBD5E1`): son el `textSecondary` viejo y compañía. Pasarlos a `colors.textSecondary` cambia el color según el tema, así que van con la migración de las escalas.
- **`#000000` (19)**: son `shadowColor` sueltos; la mayoría debería salir de la escala `elevation`.

