/**
 * pestanasAtributos · la barra de PESTAÑAS del Mercado
 * =====================================================
 *
 * ## De dónde sale esto (medido, no inventado)
 *
 * **Taobao no tiene un widget de pestañas.** Su barra es una **SECCIÓN** de la página:
 *
 * ```
 * awesome/container_newface_home_main.json
 *   sections[0].sectionBizCode = "categoryTab"     ← la barra
 *   sections[0].content.tabs[]                     ← las pestañas (son DATO)
 *   sections[0].style.styleData.tabs{…}            ← el tema (31 tokens)
 * ```
 *
 * Y las pestañas de verdad, sacadas de ese fichero (`re-e-categorias/out/lista-tabs.txt`):
 * 闪购 (`eleme`), 国补 (`zhengfubutie`), 年货节, fliggy… cada una con `tabId`, `text`, `pageUrl`,
 * `searchParams` y sus imágenes de etiqueta normal/seleccionada/**y en oscuro**.
 *
 * ## Por qué aquí es un WIDGET y no una sección
 *
 * Porque el contrato del Mercado pinta **árboles**, y una barra tiene que poder vivir **dentro de
 * cualquier pantalla** (el listado la lleva pegada a la barra de búsqueda desde antes que esto
 * existiera: `app/ecomerse.tsx:674`, `PestanasDepartamentos`). El alias del tipo es **el nombre real
 * de la sección** (`categoryTab`), para que un árbol generado desde una captura de Taobao no se
 * descarte por llamarse como se llama.
 *
 * ## Cada token, con su token de Taobao al lado
 *
 * Donde Taobao ya tiene un atributo compartido, **se usa el suyo** (16 hex). Donde no —porque es
 * tema de la sección, no atributo de un widget— va una extensión `ext:` **y aquí queda escrito de
 * qué token sale**, para poder comprobarlo:
 *
 * | en el árbol | token de Taobao (`style.styleData.tabs`) | qué es |
 * |---|---|---|
 * | `4fa0a53cf9ff05cd` (compartida) | `textColor` | color normal |
 * | `5db0637a915fa268` (compartida) | `textSize` | tamaño normal |
 * | `ext:colorSeleccionado` | `textSelectColor` | color de la pestaña activa |
 * | `ext:tamanoSeleccionado` | `textSelectSize` | tamaño de la activa |
 * | `ext:indicadorColor` | `tabIndicatorColor` | color del subrayado |
 * | `ext:indicador` | `showTabIndicator` | si se pinta |
 * | `ext:indicadorTipo` | `tabIndicatorType` | forma (`line`, `dot`; `smile` **no** está) |
 * | `ext:negritaSeleccionada` | `selectedIsBold` | negrita en la activa |
 * | `ext:espacio` | `tabSpaceConfig.phoneSpace` | hueco entre pestañas |
 * | `ext:seleccionada` | — | **cuál está activa** (índice); es lo único que Taobao no manda aquí |
 *
 * ## Lo que NO se copia, y por qué
 *
 * - **`tabIndicatorType: "smile"`, con sus arcos** (`leftArcImgUrl`, `rightArcImgUrl`, `arcImgRatio`)
 *   son **imágenes de Alibaba**. La casa tiene su regla: «se copia el contrato, no el dibujo». Aquí
 *   el tipo se acepta pero **se pinta `line`** y se **declara** en `noImplementados` — no se
 *   sustituye en silencio por algo que parece otra cosa.
 * - **`argsTypeMap` (`text` · `img` · `gif` · `bubble`)**: los cuatro tipos de pestaña de Taobao. Hoy
 *   el Mercado necesita **texto con emoji**; los otros tres se declaran como no implementados.
 * - **`sysFormPackIndex`, `dyFormSubId`, `menuCode`, `spm`**: fontanería de su editor y su
 *   seguimiento, no pintado.
 *
 * Este módulo es **PURO y autocontenido** (sin imports): así se prueba en Node en un segundo. **Los
 * colores se devuelven tal cual vienen** (formato Taobao `#AARRGGBB`); el widget los canoniza con el
 * mismo `canonizarColor` que usa el `Texto`.
 */

/** Las claves de la barra. **Las compartidas van con la clave de Taobao; las nuestras, con `ext:`.** */
export const CLAVES_PESTANAS = {
  // ── del vocabulario COMPARTIDO (Taobao) ──
  TEXTCOLOR: '4fa0a53cf9ff05cd',
  TEXTSIZE: '5db0637a915fa268',
  BACKGROUNDCOLOR: 'd8dd7d9b3cd5482e',
  PADDING_LEFT: 'fabdd4832f84d66d',
  PADDING_RIGHT: '2cd1cba4de1111e1',
  // ── extensiones nuestras: el TEMA de la barra (Taobao lo manda en `style.styleData.tabs`) ──
  // **El formato es el de la casa** (`ext:` + una palabra en minúsculas), que es lo que comprueba la
  // red del contrato en el oráculo: así es imposible confundirlas con una clave de Taobao (16 hex).
  SELECCIONADA: 'ext:activa',
  COLOR_SELECCIONADO: 'ext:coloractiva',
  TAMANO_SELECCIONADO: 'ext:tamanoactiva',
  INDICADOR: 'ext:indicador',
  INDICADOR_COLOR: 'ext:colorindicador',
  INDICADOR_TIPO: 'ext:tipoindicador',
  NEGRITA_SELECCIONADA: 'ext:negritaactiva',
  ESPACIO: 'ext:espacio',
  /**
   * **El alto de la imagen de una pestaña.** En Taobao es `imageTabHeightAp` (= **31**) del tema de la
   * sección; el ancho de cada imagen sale de su propio aspecto (`labelAspectRatio` de la pestaña).
   */
  ALTO_IMAGEN: 'ext:altoimagen',
} as const;

export type NombreAtributoPestanas = keyof typeof CLAVES_PESTANAS;

/** De qué token de Taobao sale cada extensión. **Es la trazabilidad de la fidelidad.** */
export const PROCEDENCIA: Record<NombreAtributoPestanas, string> = {
  TEXTCOLOR: 'style.styleData.tabs.textColor (compartida con el vocabulario de texto)',
  TEXTSIZE: 'style.styleData.tabs.textSize (compartida)',
  BACKGROUNDCOLOR: 'style.styleData.tabs.tabBgColor / bgColor (compartida con la caja)',
  PADDING_LEFT: 'vocabulario de caja (compartida)',
  PADDING_RIGHT: 'vocabulario de caja (compartida)',
  SELECCIONADA: '— (Taobao manda `selected` por pestaña en la respuesta; aquí es un índice inicial)',
  COLOR_SELECCIONADO: 'style.styleData.tabs.textSelectColor',
  TAMANO_SELECCIONADO: 'style.styleData.tabs.textSelectSize',
  INDICADOR: 'style.styleData.tabs.showTabIndicator',
  INDICADOR_COLOR: 'style.styleData.tabs.tabIndicatorColor',
  INDICADOR_TIPO: 'style.styleData.tabs.tabIndicatorType',
  NEGRITA_SELECCIONADA: 'style.styleData.tabs.selectedIsBold',
  ESPACIO: 'style.styleData.tabs.tabSpaceConfig.phoneSpace',
  ALTO_IMAGEN: 'style.styleData.tabs.imageTabHeightAp (= 31)',
};

/**
 * Las formas de subrayado que SÍ se pintan.
 *
 * **`smile` está, y se pinta con nuestros píxeles.** En Taobao son **dos imágenes de arco**
 * (`leftArcImgUrl`, `rightArcImgUrl`, `arcImgRatio: 0.48`) alojadas en su CDN; la regla de la casa es
 * copiar el contrato, no el dibujo, así que aquí es **una cápsula** (subrayado curvo con los extremos
 * redondeados) del color del tema. Antes se degradaba a `line` y se declaraba en `noImplementados`;
 * ahora se pinta lo que Taobao dice que hay, con lo nuestro.
 */
export const TIPOS_INDICADOR = Object.freeze(['line', 'smile', 'dot'] as const);
export type TipoIndicador = (typeof TIPOS_INDICADOR)[number];

/** Los tipos de indicador que Taobao tiene y que NO se pintan. **Hoy, ninguno.** */
export const INDICADORES_NO_IMPLEMENTADOS: readonly string[] = Object.freeze([]);

/**
 * Los campos de un DATO de pestaña. **Nombres cortos, como los de la ficha de producto.**
 *
 * Medido en las **12 pestañas** de la portada de Taobao (`out/pestanas-detalle.txt`): **el rótulo es
 * TEXTO** (关注 · 推荐 · 闪购 · 国补 · 年货节 · 飞猪 · 穿搭 · 居家 · 美食 · 数码 · 新品 · 运动) y
 * **7 de las 12 no llevan imagen**. Cuando la llevan, **no es un emoji: es un PNG de 92×80**
 * (`labelImg` / `labelSelectImg`, con su `labelDarkImg`/`labelDarkSelectImg` según el modo), colocado
 * a un lado (`labelLocation`, medido: `right`) con su hueco (`imgPadding: 10`) y su proporción
 * (`labelAspectRatio: 1.15`).
 */
export const CAMPOS_PESTANA = Object.freeze({
  ID: 'id',
  /** El rótulo. **En Taobao es TEXTO**, nunca un emoji. */
  ETIQUETA: 'etiqueta',
  /** La imagen del rótulo, **como URL** (Taobao manda `labelImg`). */
  IMAGEN: 'imagen',
  /** La imagen con la pestaña activa (Taobao: `labelSelectImg`). */
  IMAGEN_ACTIVA: 'imagenactiva',
  /** De qué lado va la imagen: `left` · `right` · `top` · `bottom` (Taobao: `labelLocation`). */
  UBICACION: 'ubicacion',
  /** El hueco entre la imagen y el rótulo (Taobao: `imgPadding`, medido 10). */
  SEPARACION: 'separacion',
  /** Ancho/alto de la imagen (Taobao: `labelAspectRatio`, medido 1.15). */
  ASPECTO: 'aspecto',
} as const);

export type AtributosDxPestanas = Record<string, number | string | boolean | null | undefined>;

export interface ResolucionPestanas {
  /** Índice de la pestaña activa al pintar. `0` si no se dice. */
  seleccionada: number;
  /** Color normal, tal cual llegó (`#AARRGGBB` de Taobao). */
  color?: string;
  colorSeleccionado?: string;
  tamano: number;
  tamanoSeleccionado?: number;
  indicador: boolean;
  indicadorColor?: string;
  indicadorTipo: TipoIndicador;
  negritaSeleccionada: boolean;
  espacio?: number;
  fondo?: string;
  paddingLados?: number;
  /** Alto de la imagen de una pestaña (`imageTabHeightAp`). El ancho sale del aspecto de cada una. */
  altoImagen?: number;
  /** Lo que la barra pidió y no se pinta. **Se declara para no fingir que sí.** */
  noImplementados: string[];
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const texto = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const bool = (v: unknown, porDefecto: boolean): boolean => {
  if (v === undefined || v === null || v === '') return porDefecto;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return porDefecto;
};

/**
 * Resuelve la barra. **No lanza nunca y no descarta lo que no entiende**: lo anota.
 */
export function resolverPestanas(dx: AtributosDxPestanas = {}): ResolucionPestanas {
  const noImplementados: string[] = [];

  const tipoCrudo = texto(dx[CLAVES_PESTANAS.INDICADOR_TIPO]);
  let indicadorTipo: TipoIndicador = 'line';
  if (tipoCrudo) {
    if ((TIPOS_INDICADOR as readonly string[]).includes(tipoCrudo)) indicadorTipo = tipoCrudo as TipoIndicador;
    else {
      // **Se pinta `line` y se declara**: la barra no se queda sin subrayado por un tipo que no
      // sabemos dibujar, y quien lea el diagnóstico sabe que ahí falta algo. Degradar no es mentir
      // mientras se diga.
      noImplementados.push(`INDICADOR_DESCONOCIDO(${tipoCrudo})`);
    }
  }

  const seleccionada = Math.max(0, Math.trunc(num(dx[CLAVES_PESTANAS.SELECCIONADA]) ?? 0));

  return {
    seleccionada,
    color: texto(dx[CLAVES_PESTANAS.TEXTCOLOR]),
    colorSeleccionado: texto(dx[CLAVES_PESTANAS.COLOR_SELECCIONADO]),
    // El tamaño normal tiene defecto (lo comparte con el `Texto`, y si no se dice, 14 como el resto).
    tamano: num(dx[CLAVES_PESTANAS.TEXTSIZE]) ?? 14,
    tamanoSeleccionado: num(dx[CLAVES_PESTANAS.TAMANO_SELECCIONADO]),
    indicador: bool(dx[CLAVES_PESTANAS.INDICADOR], true),
    indicadorColor: texto(dx[CLAVES_PESTANAS.INDICADOR_COLOR]),
    indicadorTipo,
    negritaSeleccionada: bool(dx[CLAVES_PESTANAS.NEGRITA_SELECCIONADA], true),
    espacio: num(dx[CLAVES_PESTANAS.ESPACIO]),
    fondo: texto(dx[CLAVES_PESTANAS.BACKGROUNDCOLOR]),
    paddingLados: num(dx[CLAVES_PESTANAS.PADDING_LEFT]),
    altoImagen: num(dx[CLAVES_PESTANAS.ALTO_IMAGEN]),
    noImplementados,
  };
}

/**
 * El rótulo de una pestaña: **el texto, tal cual**.
 *
 * **Antes se le pegaba un emoji delante, y eso era invención nuestra**: medido en las 12 pestañas de
 * Taobao, el rótulo es texto y, cuando hay icono, **es un PNG** que va aparte (`labelImg`). El emoji
 * desaparece de aquí; si una pestaña lleva imagen, va en su campo y la pinta el widget.
 */
export function etiquetaDePestana(dato: unknown): string {
  if (!dato || typeof dato !== 'object') return '';
  const o = dato as Record<string, unknown>;
  return typeof o[CAMPOS_PESTANA.ETIQUETA] === 'string' ? String(o[CAMPOS_PESTANA.ETIQUETA]) : '';
}

/** La imagen de la pestaña: la de activa si la tiene y está activa; si no, la normal. `null` si no hay. */
export function imagenDePestana(dato: unknown, activa: boolean): string | null {
  if (!dato || typeof dato !== 'object') return null;
  const o = dato as Record<string, unknown>;
  const normal = typeof o[CAMPOS_PESTANA.IMAGEN] === 'string' && o[CAMPOS_PESTANA.IMAGEN] ? String(o[CAMPOS_PESTANA.IMAGEN]) : null;
  if (!activa) return normal;
  const seleccionada = typeof o[CAMPOS_PESTANA.IMAGEN_ACTIVA] === 'string' && o[CAMPOS_PESTANA.IMAGEN_ACTIVA]
    ? String(o[CAMPOS_PESTANA.IMAGEN_ACTIVA]) : null;
  return seleccionada ?? normal;
}

/** De qué lado va la imagen. **Medido en Taobao: `labelLocation: "right"`.** */
export function ubicacionDePestana(dato: unknown): 'left' | 'right' | 'top' | 'bottom' {
  const o = (dato && typeof dato === 'object' ? dato : {}) as Record<string, unknown>;
  const v = o[CAMPOS_PESTANA.UBICACION];
  return v === 'left' || v === 'top' || v === 'bottom' ? v : 'right';
}

/** El hueco entre la imagen y el rótulo. Medido en Taobao: `imgPadding: 10`. */
export function separacionDePestana(dato: unknown): number {
  const o = (dato && typeof dato === 'object' ? dato : {}) as Record<string, unknown>;
  return num(o[CAMPOS_PESTANA.SEPARACION]) ?? 10;
}

/** Ancho/alto de la imagen. Medido en Taobao: `labelAspectRatio: 1.15` (el PNG es 92×80). */
export function aspectoDePestana(dato: unknown): number {
  const o = (dato && typeof dato === 'object' ? dato : {}) as Record<string, unknown>;
  const a = num(o[CAMPOS_PESTANA.ASPECTO]);
  return a !== undefined && a > 0 ? a : 1;
}

/** El id de una pestaña, tal cual viene del dato. */
export function idDePestana(dato: unknown): string {
  if (!dato || typeof dato !== 'object') return '';
  const v = (dato as Record<string, unknown>)[CAMPOS_PESTANA.ID];
  return v === undefined || v === null ? '' : String(v);
}

export default {
  CLAVES_PESTANAS, PROCEDENCIA, TIPOS_INDICADOR, INDICADORES_NO_IMPLEMENTADOS, CAMPOS_PESTANA,
  resolverPestanas, etiquetaDePestana, imagenDePestana, ubicacionDePestana, separacionDePestana,
  aspectoDePestana, idDePestana,
};
