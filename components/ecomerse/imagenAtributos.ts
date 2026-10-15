/**
 * Imagen · resolución de atributos del widget `DXIMAGEVIEW` de Taobao
 * ==================================================================
 *
 * **Puro a propósito**, igual que `vistaAtributos.ts`: el oráculo de fidelidad importa este
 * módulo directamente, así que verifica el código real y no una copia.
 *
 * ## Lo que Taobao usa de verdad — medido sobre las 246 plantillas
 *
 * | Atributo | Plantillas | Mapeo en React Native |
 * |---|---|---|
 * | `TINTCOLOR` | **7** | `tintColor` de `expo-image` |
 * | `IMAGEBIZTYPE` | 7 | — servicio de imagen de Alibaba: no aplica |
 * | `ENABLESIZEINLAYOUTPARAMS` | 5 | layout |
 * | `IMAGEBIZID` | 5 | — servicio de imagen de Alibaba: no aplica |
 * | `LOADIMGWHENNULLCLEARIMG_ANDROID` | 4 | comportamiento de Android |
 * | `FUZZYMATCHCACHE` | 2 | `cachePolicy` |
 * | `BLURRADIUS` | 1 | `blurRadius` |
 * | `ONIMAGELOADCOMPLETE` | 1 | `onLoad` |
 * | `STRICTMATCHCACHE_ANDROID` | 1 | comportamiento de Android |
 * | `BACKGROUNDCOLOREXTRACTION` · `BLURSCALE_ANDROID` · `PROGRESSIVELOADING` · `ZOOMENABLED` | **0** | no ejercitados |
 *
 * **`DXIMAGEVIEW_IMAGEVIEW` NO es un atributo: es el ID DE TIPO del widget.** Y sí está en la
 * tabla (`6ade46eef017bb87`). Ese error de clasificación llevó a afirmar que los tipos de widget
 * no estaban en el APK; sí están, 13 de 21.
 *
 * ## ⚠️ Qué verifica el oráculo, y qué no
 *
 * El oráculo compara **valores por atributo**. Para los atributos de este componente el mapeo es
 * **pass-through** (el color de Taobao es el `tintColor` de RN), así que **el oráculo verifica
 * COBERTURA — que el atributo se implementa — no que el render sea correcto.**
 *
 * Verificar el render exige renderizar. **Decirlo es más útil que aparentar una garantía mayor.**
 */

// ─────────────────────────── las claves de Taobao ───────────────────────────

/**
 * Claves `long` de `DXIMAGEVIEW`, en hex de 16.
 *
 * **Verificadas contra `tabla-claves.json` por `mercado-fase1/o1-oraculo/test/claves.test.mjs`.**
 * Y esa comprobación existe porque **la primera versión de este fichero tenía los hex
 * INVENTADOS** — valores como `'6ff1a2b3c4d5e6f7'`, que es un patrón secuencial y no una clave
 * real. La revisión lo detectó antes de que llegara a nada.
 *
 * **Que un número copiado a mano esté mal es fácil. Que un test lo detecte, no.**
 *
 * ⚠️ `DXIMAGEVIEW_IMAGEVIEW` **no aparece aquí a propósito**: su valor (`6ade46eef017bb87`) es
 * el **ID DE TIPO** del widget, no una clave de atributo. Confundirlos fue el origen de la
 * afirmación falsa de que los tipos de widget no estaban en el APK.
 */
export const CLAVES_DXIMAGEVIEW = {
  BACKGROUNDCOLOREXTRACTION: '3d06d925fe582559',
  BLURRADIUS: '345d29e8b86b4627',
  BLURSCALE_ANDROID: 'ae1da36f1381e0ee',
  ENABLESIZEINLAYOUTPARAMS: '7c50f298771772b3',
  FUZZYMATCHCACHE: '3f2024f2d11fbc18',
  IMAGEBIZID: '2835e15db3e086df',
  IMAGEBIZTYPE: 'b0b65b816231fcd6',
  LOADIMGWHENNULLCLEARIMG_ANDROID: 'c16c5f9f884d3a2d',
  ONIMAGELOADCOMPLETE: '9248c1dc6ce5b98c',
  PROGRESSIVELOADING: '857e40f7bf87fa89',
  STRICTMATCHCACHE_ANDROID: 'f53ab2454b92bf92',
  TINTCOLOR: '6ff0bcc0397cd9c7',
  ZOOMENABLED: 'f9f4ae79f2fa1e7b',
  /**
   * Ajuste de la imagen. **Nombre de otra tabla: DXVIDEOVIEW_SCALETYPE.**
   *
   * ⚠️ El nombre engaña, como CORNERRADIUS: **no es de vídeo**. Medido:
   *
   * ` 
   * DXIMAGEVIEW x573   10afdde3 x71   7ab15da1 x31   e22bf82e x21     759 usos totales
   * DXVIDEOVIEW x0   <- el widget de vídeo NO TIENE NI UN NODO en el corpus
   * ` 
   *
   * **Es el ajuste de la IMAGEN.** Los valores del enumMap lo confirman:
   * =fitCenter · 1=fitXY · 2=centerCrop — y 2 es el más usado (345).
   *
   * Y DXVideoViewWidgetNode.java declara las constantes:
   * DXVIDEOVIEW_SCALETYPE = 1015096712691932083L · DXVIDEOVIEW_SCALETYPE_CENTERCROP = 2.
   */
  SCALETYPE: '0e165914fcab5bb3',
} as const;

/** El **ID DE TIPO** del widget `DXIMAGEVIEW`. No es un atributo. */
export const TIPO_DXIMAGEVIEW = '6ade46eef017bb87';

export type NombreAtributoImagen = keyof typeof CLAVES_DXIMAGEVIEW;

// ─────────────────────────── clasificación declarada ────────────────────────

/**
 * Qué hace el componente con cada atributo. **Declarado, no implícito.**
 *
 * - `prop`      — se mapea a una prop de `expo-image`, y el atributo se **cubre**
 * - `layout`    — es de medida: se implementa, pero el valor **no es comparable** (Yoga ≠ Android)
 * - `evento`    — callback; no hay valor que comparar
 * - `ajeno`     — del servicio de imágenes de Alibaba; **no aplica y se declara**
 * - `motor`     — comportamiento del lado Android; no tiene equivalente
 * - `no-usado`  — el corpus no lo ejercita: se implementa o no, pero **no se presenta como verificado**
 */
export type ClaseAtributoImagen = 'prop' | 'layout' | 'evento' | 'ajeno' | 'motor' | 'no-usado';

export const CLASE_IMAGEN: Record<NombreAtributoImagen, ClaseAtributoImagen> = {
  TINTCOLOR: 'prop',
  SCALETYPE: 'prop',   // ajuste de la imagen -> contentFit
  BLURRADIUS: 'prop',
  FUZZYMATCHCACHE: 'prop',
  ONIMAGELOADCOMPLETE: 'evento',
  ENABLESIZEINLAYOUTPARAMS: 'layout',
  // Del servicio de imagen de Alibaba. En el Mercado la imagen viene de Bitiful.
  IMAGEBIZTYPE: 'ajeno',
  IMAGEBIZID: 'ajeno',
  // Comportamiento del lado Android.
  LOADIMGWHENNULLCLEARIMG_ANDROID: 'motor',
  STRICTMATCHCACHE_ANDROID: 'motor',
  BLURSCALE_ANDROID: 'motor',
  // El corpus no los ejercita (0 usos): no se presentan como verificados.
  BACKGROUNDCOLOREXTRACTION: 'no-usado',
  PROGRESSIVELOADING: 'no-usado',
  ZOOMENABLED: 'no-usado',
};

/**
 * **NUESTRA extensión para la proporción de una imagen** (`ext:aspecto`), con la medida de Taobao
 * dentro: en las tarjetas del feed su `DXTEMPLATE_ASPECTRATIO` vale **1** —cuadradas—.
 *
 * Va aparte de `CLAVES_DXIMAGEVIEW` **a propósito**: aquella tabla es el vocabulario MEDIDO de Taobao
 * (doce claves con su hex y su procedencia), y esta no es suya. Mezclarlas convertiría una extensión
 * nuestra en una clave suya, que es justo lo que el `ext:` sirve para no hacer.
 */
export const CLAVE_ASPECTO = 'ext:aspecto';

/** Los que el componente **cubre** — el resto se declara. */
export function atributosCubiertos(): NombreAtributoImagen[] {  return (Object.keys(CLASE_IMAGEN) as NombreAtributoImagen[])
    .filter((n) => CLASE_IMAGEN[n] === 'prop' || CLASE_IMAGEN[n] === 'evento' || CLASE_IMAGEN[n] === 'layout');
}

/** Los que se declaran como no aplicables, con su motivo. */
export function atributosDeclarados(): Array<{ nombre: NombreAtributoImagen; clase: ClaseAtributoImagen; motivo: string }> {
  const MOTIVO: Record<string, string> = {
    ajeno: 'atributo del servicio de imágenes de Alibaba; el Mercado usa Bitiful',
    motor: 'comportamiento del lado Android; no tiene equivalente en React Native',
    'no-usado': 'el corpus de 246 plantillas no lo ejercita: no se presenta como verificado',
  };
  return (Object.keys(CLASE_IMAGEN) as NombreAtributoImagen[])
    .filter((n) => CLASE_IMAGEN[n] === 'ajeno' || CLASE_IMAGEN[n] === 'motor' || CLASE_IMAGEN[n] === 'no-usado')
    .map((n) => ({ nombre: n, clase: CLASE_IMAGEN[n], motivo: MOTIVO[CLASE_IMAGEN[n]] }));
}

// ─────────────────────────── resolución ─────────────────────────────────────

export type AtributosDxImagen = Record<string, number | string | boolean | null | undefined>;

export interface ResolucionImagen {
  /** `tintColor` de `expo-image`, si Taobao lo traía. */
  tintColor?: string;
  /** `blurRadius`, si Taobao lo traía. */
  blurRadius?: number;
  /** `cachePolicy` derivada de las banderas de caché de Taobao. */
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  /** `true` si Taobao pidió avisar al cargar. */
  avisarAlCargar: boolean;
  /**
   * **La proporción ancho:alto de la imagen** (`ext:aspecto`), si el árbol la trae.
   *
   * Es la medida de Taobao **`DXTEMPLATE_ASPECTRATIO`**: en las tarjetas del feed vale **1** —o sea
   * **cuadradas**— (medido en `metricas3.mjs`: `m_r_v1_trends_card_2025`, `m_r_v1_daily_outfit_content`,
   * `detail_v3_appraise`, `looked_dv3_item`; el 0,462 es un banner de splash).
   *
   * **Dónde vive la clave es una decisión nuestra, y se declara**: en Taobao es un atributo de la
   * PLANTILLA; aquí se pone en el nodo de la IMAGEN, que es la caja cuyo tamaño define. El mecanismo es
   * suyo (una proporción, no píxeles) y el sitio, nuestro.
   *
   * Con esto la tarjeta **deja de tener altura fija**: su alto sale del ancho que le da la rejilla, así
   * que la misma tarjeta mide igual en cualquier móvil. Es lo que Taobao consigue con la proporción y lo
   * que una altura en píxeles nunca consigue.
   */
  aspecto?: number;
  /**
   * Ajuste de la imagen, traducido a `contentFit` de `expo-image`.
   *
   * Viene de `SCALETYPE`. **Es una decisión declarada**, no una equivalencia demostrada:
   * `fitXY` de Android estira sin respetar proporción y el `fill` de flexbox hace lo mismo,
   * pero la medida por dentro no es idéntica.
   */
  ajuste?: 'contain' | 'fill' | 'cover';
}

/**
 * Canoniza un color al formato `#AARRGGBB`.
 *
 * Taobao manda el color como entero de 32 bits; `expo-image` acepta `#RRGGBB` o `#AARRGGBB`.
 */
export function canonizarColor(v: unknown): string | undefined {
  let hex: string | undefined;
  if (typeof v === 'string' && v.startsWith('#')) hex = v.slice(1).toUpperCase();
  else {
    let n: number | undefined;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && /^\d+$/.test(v)) n = Number(v);
    if (n === undefined || !Number.isFinite(n)) return undefined;
    hex = (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  if (hex.length === 6) return '#' + hex;
  if (hex.length === 8) return '#' + hex.slice(2) + hex.slice(0, 2); // AARRGGBB -> RRGGBBAA
  return '#' + hex;
}

/**
 * Convierte los atributos de Taobao en lo que `expo-image` necesita.
 *
 * **Sobre la caché.** Taobao tiene dos banderas (`FUZZYMATCHCACHE` y `STRICTMATCHCACHE_ANDROID`)
 * que describen su política de caché local. `expo-image` tiene `cachePolicy` con cuatro valores.
 * El mapeo es **una decisión nuestra**, no una equivalencia demostrada — y por eso se declara.
 */
export function resolverImagen(dx: AtributosDxImagen = {}): ResolucionImagen {
  const out: ResolucionImagen = { avisarAlCargar: false };

  // ── LA PROPORCIÓN (`ext:aspecto`) ─────────────────────────────────────────────────────────
  // Nuestra extensión, con la medida de Taobao dentro: en las tarjetas del feed su
  // `DXTEMPLATE_ASPECTRATIO` vale 1 (cuadradas). **Se ignora lo que no sea un número positivo**: una
  // proporción de 0 o negativa no es una proporción, y aplicarla daría una imagen de alto cero.
  const aspecto = dx[CLAVE_ASPECTO];
  const aspectoN = typeof aspecto === 'number' ? aspecto : typeof aspecto === 'string' ? Number(aspecto) : NaN;
  if (Number.isFinite(aspectoN) && aspectoN > 0) out.aspecto = aspectoN;

  const tinte = canonizarColor(dx[CLAVES_DXIMAGEVIEW.TINTCOLOR]);
  if (tinte) out.tintColor = tinte;

  const desenfoque = dx[CLAVES_DXIMAGEVIEW.BLURRADIUS];
  if (typeof desenfoque === 'number' && desenfoque > 0) out.blurRadius = desenfoque;
  else if (typeof desenfoque === 'string' && Number(desenfoque) > 0) out.blurRadius = Number(desenfoque);

  // Decisión declarada: caché difusa de Taobao → caché en memoria y disco.
  if (dx[CLAVES_DXIMAGEVIEW.FUZZYMATCHCACHE] !== undefined) out.cachePolicy = 'memory-disk';

  out.avisarAlCargar = dx[CLAVES_DXIMAGEVIEW.ONIMAGELOADCOMPLETE] !== undefined;

  // SCALETYPE: los tres valores del enumMap, traducidos a contentFit.
  // **Es una decisión declarada**, no una equivalencia demostrada: itXY de Android estira
  // sin respetar proporción, y el ill de flexbox hace lo mismo, pero la medida por dentro
  // es distinta.
  const esc = dx[CLAVES_DXIMAGEVIEW.SCALETYPE];
  const escN = typeof esc === 'number' ? esc : typeof esc === 'string' ? Number(esc) : undefined;
  if (escN === 0) out.ajuste = 'contain';      // fitCenter
  else if (escN === 1) out.ajuste = 'fill';    // fitXY
  else if (escN === 2) out.ajuste = 'cover';   // centerCrop

  return out;
}

export default { CLAVES_DXIMAGEVIEW, CLASE_IMAGEN, resolverImagen, canonizarColor, atributosCubiertos, atributosDeclarados };


