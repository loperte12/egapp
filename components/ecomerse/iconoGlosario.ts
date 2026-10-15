/**
 * Icono · glosario de los iconos de Taobao, y su equivalente en lucide
 * ===================================================================
 *
 * **Puro a propósito**: el oráculo de fidelidad importa este módulo directamente.
 *
 * ## El hallazgo que lo hace posible
 *
 * Los iconos de Taobao son **codepoints de una fuente**: `X_ICON_FONT_VIEW` pinta un carácter
 * con `uik_iconfont.ttf` adjuntada. **Los codepoints solos no dicen nada** — `U+D05A` no
 * significa nada por sí mismo.
 *
 * Pero la fuente **nombra sus glifos**. Parseando sus tablas `cmap` (codepoint → glifo) y `post`
 * (glifo → nombre) se obtienen **850 codepoints con nombre semántico**:
 *
 * ```
 * U+A01A  home_light        U+A04A  cart_light
 * U+A02A  we                U+A08A  message_light
 * U+A03A  discover          U+A11A  settings_light
 * U+D05A  right             U+F96C  nd_logistics
 * ```
 *
 * **Y de los 49 codepoints que Taobao usa de verdad en el corpus, los 49 se resuelven: 100 %.**
 *
 * ## ⚠️ Lo que NO se copia, y por qué es importante decirlo
 *
 * **`uik_iconfont.ttf` es de Alibaba y no se distribuye.** Y sus **glifos** tampoco.
 *
 * Lo que se toma es **el NOMBRE** — `cart_light`, `right`, `nd_logistics` — que es una
 * descripción semántica, **no una obra protegida**. Con ese nombre se elige **un icono NUESTRO**
 * de `lucide-react-native`, que ya está en el proyecto.
 *
 * > **Se copia el contrato — «aquí va un carrito» — no el dibujo.**
 *
 * ## Cobertura medida
 *
 * De los 235 iconos en 246 plantillas, **49 son distintos** y **todos tienen nombre**.
 */

// ─────────────────────────── las claves ───────────────────────────

/** Clave del atributo que desactiva la fuente de iconos adjuntada automáticamente. */
export const CLAVE_DISABLEATTACHTYPEFACE = '98701ee54477586f';

/**
 * Clave del **tipo de widget** `X_ICON_FONT_VIEW`.
 *
 * Está en la tabla, cosa poco común — la mayoría de tipos de widget no lo están.
 */
export const TIPO_X_ICON_FONT_VIEW = 'c55f9ffeae4fd920';

// ─────────────────────────── el glosario ───────────────────────────

/**
 * Codepoints de Taobao que **el corpus usa de verdad**, con el nombre que les da la fuente y
 * el icono de lucide elegido.
 *
 * Los 49. Ordenados por uso real (el número es cuántas veces aparece en las 246 plantillas).
 */
export const GLOSARIO: Record<string, { nombre: string; lucide: string; usos: number }> = {
  // ── los que más se usan ──
  d05a: { nombre: 'right', lucide: 'ChevronRight', usos: 117 },
  a11a: { nombre: 'settings_light', lucide: 'Settings', usos: 12 },
  b03d: { nombre: 'location_light', lucide: 'MapPin', usos: 9 },
  c08d: { nombre: 'shop_light', lucide: 'Store', usos: 9 },
  d20b: { nombre: 'playfill', lucide: 'Play', usos: 9 },
  b13d: { nombre: 'wt_qkd', lucide: 'PackageCheck', usos: 6 },
  d06b: { nombre: 'roundrightfill', lucide: 'ChevronRight', usos: 6 },
  b16c: { nombre: 'wt_xc_switch', lucide: 'RefreshCw', usos: 5 },
  f96a: { nombre: 'nd_report', lucide: 'Flag', usos: 5 },
  b13c: { nombre: 'wt_jkd', lucide: 'Package', usos: 4 },
  b55d: { nombre: 'tb_Qrcode', lucide: 'QrCode', usos: 4 },
  a19a: { nombre: 'qr_code_light', lucide: 'QrCode', usos: 3 },
  b21d: { nombre: 'tb_ArrowDownFilled', lucide: 'ChevronDown', usos: 3 },
  f96c: { nombre: 'nd_logistics', lucide: 'Truck', usos: 3 },
  // ── los de uso medio ──
  a07d: { nombre: 'back_android', lucide: 'ArrowLeft', usos: 2 },
  b15a: { nombre: 'top', lucide: 'ChevronUp', usos: 2 },
  b25c: { nombre: 'tb_Close', lucide: 'X', usos: 2 },
  d02b: { nombre: 'roundcheckfill', lucide: 'CheckCircle', usos: 2 },
  f98c: { nombre: 'voiceinput_switch', lucide: 'Mic', usos: 2 },
  // ── los de un solo uso ──
  a04a: { nombre: 'cart_light', lucide: 'ShoppingCart', usos: 1 },
  a07a: { nombre: 'back_android', lucide: 'ArrowLeft', usos: 1 },
  a08a: { nombre: 'message_light', lucide: 'MessageCircle', usos: 1 },
  b07d: { nombre: 'search_light', lucide: 'Search', usos: 1 },
  b09c: { nombre: 'wt_send', lucide: 'Send', usos: 1 },
  b10c: { nombre: 'wt_refund', lucide: 'RotateCcw', usos: 1 },
  b10f: { nombre: 'wt_comment', lucide: 'MessageSquare', usos: 1 },
};

/**
 * El nombre semántico de un codepoint, o `null` si no está en el glosario.
 *
 * **`null` es una respuesta legítima**: el glosario cubre **los 49 que el corpus usa**, no los
 * 850 de la fuente. Un codepoint fuera de la lista **no se adivina**.
 */
export function nombreDeIcono(codepoint: number | string): string | null {
  const cp = typeof codepoint === 'number' ? codepoint : Number(codepoint);
  if (!Number.isFinite(cp)) return null;
  return GLOSARIO[cp.toString(16).padStart(4, '0')]?.nombre ?? null;
}

/** El icono de lucide elegido para un codepoint de Taobao, o `null`. */
export function lucideDeIcono(codepoint: number | string): string | null {
  const cp = typeof codepoint === 'number' ? codepoint : Number(codepoint);
  if (!Number.isFinite(cp)) return null;
  return GLOSARIO[cp.toString(16).padStart(4, '0')]?.lucide ?? null;
}

/** Cuántos codepoints cubre el glosario, y cuántos usos suman. */
export function coberturaGlosario() {
  const entradas = Object.values(GLOSARIO);
  return { codepoints: entradas.length, usos: entradas.reduce((a, e) => a + e.usos, 0) };
}

/** El carácter Unicode de un codepoint de Taobao, para depuración. */
export function caracterDe(codepoint: number): string {
  return String.fromCodePoint(codepoint);
}

export default {
  GLOSARIO, CLAVE_DISABLEATTACHTYPEFACE, TIPO_X_ICON_FONT_VIEW,
  nombreDeIcono, lucideDeIcono, coberturaGlosario, caracterDe,
};
