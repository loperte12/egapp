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
};

/** Las formas de subrayado que SÍ se pintan. **`smile` (Taobao) no está: son sus imágenes.** */
export const TIPOS_INDICADOR = Object.freeze(['line', 'dot'] as const);
export type TipoIndicador = (typeof TIPOS_INDICADOR)[number];

/** El tipo que Taobao manda y que NO se implementa (se declara, no se sustituye callando). */
export const INDICADOR_NO_IMPLEMENTADO = 'smile';

/** Los campos de un DATO de pestaña. **Nombres cortos, como los de la ficha de producto.** */
export const CAMPOS_PESTANA = Object.freeze({
  ID: 'id',
  ETIQUETA: 'etiqueta',
  EMOJI: 'emoji',
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
    else if (tipoCrudo === INDICADOR_NO_IMPLEMENTADO) {
      // Se pinta `line` — **la barra no se queda sin subrayado por un tipo que no sabemos dibujar** —
      // y se declara, que es la diferencia entre degradar y mentir.
      noImplementados.push(`INDICADOR_${tipoCrudo.toUpperCase()}`);
    } else {
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
    noImplementados,
  };
}

/** La etiqueta de una pestaña: **`emoji + etiqueta`**, que es como la pinta hoy el Mercado. */
export function etiquetaDePestana(dato: unknown): string {
  if (!dato || typeof dato !== 'object') return '';
  const o = dato as Record<string, unknown>;
  const etiqueta = typeof o[CAMPOS_PESTANA.ETIQUETA] === 'string' ? String(o[CAMPOS_PESTANA.ETIQUETA]) : '';
  const emoji = typeof o[CAMPOS_PESTANA.EMOJI] === 'string' ? String(o[CAMPOS_PESTANA.EMOJI]) : '';
  return emoji ? `${emoji} ${etiqueta}` : etiqueta;
}

/** El id de una pestaña, tal cual viene del dato. */
export function idDePestana(dato: unknown): string {
  if (!dato || typeof dato !== 'object') return '';
  const v = (dato as Record<string, unknown>)[CAMPOS_PESTANA.ID];
  return v === undefined || v === null ? '' : String(v);
}

export default {
  CLAVES_PESTANAS, PROCEDENCIA, TIPOS_INDICADOR, CAMPOS_PESTANA,
  resolverPestanas, etiquetaDePestana, idDePestana,
};
