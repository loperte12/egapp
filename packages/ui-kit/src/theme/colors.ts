/**
 * TOKENS DE COLOR OFICIALES — EG Route Plan (viven en @egrouteplan/ui-kit).
 * Semántica estricta: azul=acción principal · naranja=servicios/proceso ·
 * verde=éxito · rojo=SOLO emergencia. Modo oscuro sin negro puro (#17171A).
 * WCAG AA para sol directo y nocturno.
 */

/**
 * DECISIÓN DEL DUEÑO (17/09/2026) — A1 + B1:
 *   · A1: el azul es la ACCIÓN principal; el naranja CLASIFICA (categoría, sello, servicio).
 *   · B1: estos valores están oscurecidos para que el texto BLANCO encima cumpla AA (4,5:1).
 *     Antes el naranja daba 2,57 y el azul 3,66: las etiquetas de los botones no se leían al sol.
 */
export const brand = {
  primary: '#0066CC',
  primaryPressed: '#00529E',
  secondary: '#C2410C',
  secondaryPressed: '#9A3412',
  success: '#1E7A45',
  successPressed: '#176035',
  danger: '#C62828',
  dangerPressed: '#A31F1F',
  /**
   * AVISO — ámbar. Destino de los 16 ámbares distintos que había repartidos por la app
   * (`#F59E0B`, `#F6B100`, `#F5B50A`, `#F5B800`, `#F5A623`…). Cuatro de ellos estaban a menos
   * de 3° de matiz entre sí: indistinguibles en pantalla y aun así cuatro valores.
   */
  warning: '#F59E0B',
  warningPressed: '#D97706',
  /** Texto sobre `warning`: oscuro, porque el blanco sobre ámbar no llega a AA (2,1:1). */
  onWarning: '#451A03',
  /** INFORMACIÓN — azul de aviso, deliberadamente distinto del azul de ACCIÓN (`primary`). */
  info: '#0EA5E9',
  infoPressed: '#0284C7',
  /** Texto sobre `info`: oscuro, por la misma razón que en `warning`. */
  onInfo: '#082F49',
  /**
   * «ME GUSTA» / favorito. NO es un error: el rojo de error es `danger`, reservado a lo crítico.
   * Antes había tres rojos distintos para el mismo corazón (`#FF2442`, `#FF3B5C`, `#EF4444`).
   * Uso gráfico (icono): cumple el 3:1 de componentes, no el 4,5:1 de texto.
   */
  like: '#FF2442',
  likePressed: '#E01E39',
  /** Estado «guardado»: la estrella y el marcador activos. NO es `warning` (a 11/441 de él): una
   *  estrella guardada no avisa de nada. Es un estado con nombre propio, como `like`. */
  guardado: '#FFB800',
  /** Marca de WhatsApp para el botón de contacto. Uso gráfico, nunca como texto. */
  whatsapp: '#25D366',
  /**
   * NEUTRO — estado sin carga emocional (cancelado, expirado, revertido). Es el gris que sí
   * cumple AA sobre blanco (4,76:1), a diferencia de `textSecondary`.
   */
  neutral: '#64748B',
  neutralPressed: '#475569',
  /**
   * Variantes OSCURAS para texto sobre fondo claro. Faltaban: el código usaba #991B1B y
   * #78350F a mano justamente porque danger (3,4:1) y warning no llegan a AA como texto.
   * Con estos tokens, el rojo de un aviso se puede leer y sigue siendo rojo.
   */
  dangerText: '#991B1B',
  warningText: '#78350F',
  /* ---------------------------------------------------------------------------------------------
     ESTADO TRANSLÚCIDO — el mismo color de estado a tres intensidades, en vez de doce valores a mano.
     POR QUÉ EXISTEN (auditoría de tokens, H1b, 25/09/2026): la app tenía DOCE valores de alfa
     escritos a mano que significaban solo TRES cosas — fondo de una tarjeta o aviso de estado
     (`0C`/`0F`/`10`/`14`/`18`), borde suave (`33`) y borde de énfasis (`55`/`66`). Doce valores, tres
     intenciones: dos avisos del mismo tipo se veían distintos y la interfaz perdía el orden.
     Además estaban construidos sobre bases que NO eran las del kit (`#F53F3F`, `#27AE60`, `#F6B100`,
     `#F5A623`), así que un aviso translúcido y el sólido de al lado no eran el mismo color.
     REGLA: son DELTAS del token de estado — se derivan de `danger`/`success`/`warning`, así el tinte
     sigue al color y no hay una cuarta paleta escondida en el código.
     Alfa: `Soft` 8 % (7,8 real) · `SoftBorde` 20 % · `SoftFuerte` 33 %.
     Sobre blanco, la diferencia con los literales que sustituyen es de ≤7 de 441 niveles.
     --------------------------------------------------------------------------------------------- */
  primarySoft: '#0066CC14',
  successSoft: '#1E7A4514',
  successSoftBorde: '#1E7A4533',
  successSoftFuerte: '#1E7A4555',
  warningSoft: '#F59E0B14',
  warningSoftBorde: '#F59E0B33',
  warningSoftFuerte: '#F59E0B55',
  dangerSoft: '#C6282814',
  dangerSoftBorde: '#C6282833',
  dangerSoftFuerte: '#C6282855',
  /* ---------------------------------------------------------------------------------------------
     TEXTO DE MARCA SOBRE FONDO OSCURO.
     POR QUÉ EXISTEN: los colores de marca de arriba se diseñaron para LLEVAR texto blanco encima, y
     ahí cumplen (blanco sobre #0066CC = 5,57). Pero usados como TEXTO o icono sobre el fondo oscuro
     #17171A suspenden el mínimo AA de 4,5:1 — medido el 23/09/2026: primary 3,21 · success 3,34 ·
     danger 3,18 · secondary 3,45 · neutral 3,76.
     El kit ya tenía la variante del caso contrario (dangerText y warningText, «para texto sobre fondo
     claro»); lo que faltaba era ésta. Estos seis cierran el hueco.
     REGLA: los tokens base NO se tocan — se usan como RELLENO o con texto blanco encima. Estos, SOLO
     como texto o icono sobre fondo oscuro. Contraste medido sobre #17171A / #1E1E23 / #232329.
     --------------------------------------------------------------------------------------------- */
  primaryDark: '#4D9AEB', // 6,08 · 5,31
  successDark: '#45B87A', // 7,15 · 6,24
  dangerDark: '#F26D6D', // 6,12 · 5,35
  secondaryDark: '#F08A4B', // 7,19 · 6,28
  neutralDark: '#B0B8C4', // 8,94 · 8,30 · 7,81
  warningDark: '#F5B942', // 10,14 · 8,86
  /** Blanco de superficie. Destino de las 554 ocurrencias de blanco escrito a mano. */
  white: '#FFFFFF',
  /* ---------------------------------------------------------------------------------------------
     IDENTIDAD DE PRODUCTO — colores que NO son de la paleta de marca y aun así son legítimos.
     POR QUÉ EXISTEN (auditoría de tokens, H1, 25/09/2026): en la app había tres familias de color
     que no eran ni marca ni neutro, y se escribían a mano en 14 ficheros:
       · VIOLETA (#8B5CF6 / #7C3AED) — el acento de lifebook: grupos, vídeo, mapas, hojas de driver.
       · ROSA    (#E0439A) — el acento SOCIAL: comercio, cultura, podcast, música, disputa.
       · NEGRO   (#000000) — el fondo de los visores a pantalla completa (vídeo, escáner, fotos).
     Decisión de Bernardo (25/09): NO son accidentes, son identidad → entran como tokens de marca.
     Se unifican a UNO por familia: el violeta tenía 5 valores distintos (#8B5CF6, #7C3AED, #B57BFF,
     #7B4BE0, #C08BFF) y el rosa 3 (#E0439A, #E0397B, #FF7BAC) — el mismo color a ojos del usuario.
     `lifebookFuerte` es la variante oscura, para cuando el violeta va sobre fondo claro.
     --------------------------------------------------------------------------------------------- */
  lifebook: '#8B5CF6',
  lifebookFuerte: '#7C3AED',
  social: '#E0439A',
  /** Fondo de los visores a pantalla completa. NO es `shadow`: sombra es un valor de elevación. */
  visor: '#000000',
  /** Acento de SERVICIO (alquiler, envío de paquete, delivery). Tercer acento de categoría, junto a
   *  `lifebook` (violeta) y `social` (rosa). No cabía en `success`: está a 46/441 de él y sobre un
   *  chip de categoría ese salto SE VE (uno es verde bosque y el otro un verde menta vivo). */
  servicio: '#00A870',
  /* ---------------------------------------------------------------------------------------------
     DECORATIVO — colores de ADORNO, no de semántica. No significan estado ni marca: son el color
     de un avatar, un degradado de cabecera, el fondo de una tarjeta de diagnóstico.
     POR QUÉ EXISTEN: en la auditoría aparecieron 17 colores de un solo uso a más de 20/441 de
     cualquier peldaño, casi todos en `diagnostics.tsx` y `edit-profile.tsx`. Unificarlos al rojo
     o al verde de estado sería un ERROR semántico: un avatar rosa no es un error.
     REGLA: si el color comunica algo (estado, marca, categoría), NO va aquí.
     --------------------------------------------------------------------------------------------- */
  decoRosa: '#FFB3B3',
  /** Variante clara de `decoRosa`: fondos y rellenos de adorno. */
  decoRosaClaro: '#FFD2D2',
  decoMenta: '#ADFADE',
  decoArena: '#F6EEDC',
  /** Ámbar suave, distinto del `warning` de aviso. */
  decoAmbar: '#FFE08A',
  /** Azul cielo claro: extremo claro del degradado de portada. */
  decoCielo: '#DFEAF2',
  /** Rosa fuerte de adorno (distinto de `social`: es decoración, no categoría). */
  decoRosaFuerte: '#FF7BAC',
  /** Violeta claro de adorno (variante clara de `lifebook`). */
  decoVioletaClaro: '#B57BFF',
  /** Brasa: los dos fondos de la pantalla de diagnóstico. Son NEGROS CÁLIDOS (rojo de fondo), y por
   *  eso no valía `shadow` ni `neutro.n900`: un negro cálido no es un gris. Unificar al rojo de
   *  estado sería un error semántico — esa pantalla no es un error rojo, es una pantalla oscura. */
  decoBrasa: '#1A0A0A',
  decoBrasaClaro: '#2A1010',
  /** Índigo del aviso de «pedido programado» de food-orders. Un solo uso, y es un acento de
   *  categoría, no de estado: `info` está a 85/441 y se leería como otro color. */
  decoIndigo: '#6366F1',
} as const;

export interface ThemeColors {
  primary: string;
  primaryPressed: string;
  secondary: string;
  secondaryPressed: string;
  success: string;
  successPressed: string;
  danger: string;
  dangerPressed: string;
  /** Tokens añadidos en la Fase 1 de la auditoría de diseño: existían en el código, no en el kit. */
  warning: string;
  warningPressed: string;
  onWarning: string;
  info: string;
  infoPressed: string;
  onInfo: string;
  like: string;
  likePressed: string;
  guardado: string;
  whatsapp: string;
  dangerText: string;
  warningText: string;
  /** Estado translúcido a tres intensidades (Soft 8 % · SoftBorde 20 % · SoftFuerte 33 %).
   *  Ver el bloque en `brand`: son deltas de `primary`/`success`/`warning`/`danger`. */
  primarySoft: string;
  successSoft: string;
  successSoftBorde: string;
  successSoftFuerte: string;
  warningSoft: string;
  warningSoftBorde: string;
  warningSoftFuerte: string;
  dangerSoft: string;
  dangerSoftBorde: string;
  dangerSoftFuerte: string;
  neutral: string;
  neutralPressed: string;
  /** Solo para usar como TEXTO o icono sobre fondo oscuro. Ver el bloque en `brand`. */
  primaryDark: string;
  successDark: string;
  dangerDark: string;
  secondaryDark: string;
  neutralDark: string;
  warningDark: string;
  white: string;
  /** Identidad de producto: acento de lifebook y de lo social. Ver el bloque en `brand`. */
  lifebook: string;
  lifebookFuerte: string;
  social: string;
  /** Fondo de visores a pantalla completa (vídeo, escáner). */
  visor: string;
  /** Acento de servicio: alquiler, paquete, delivery. Ver el bloque en `brand`. */
  servicio: string;
  /** Adorno sin semántica (avatares, degradados, diagnósticos). Ver el bloque en `brand`. */
  decoRosa: string;
  decoRosaClaro: string;
  decoMenta: string;
  decoArena: string;
  decoAmbar: string;
  decoCielo: string;
  decoRosaFuerte: string;
  decoVioletaClaro: string;
  decoBrasa: string;
  decoBrasaClaro: string;
  decoIndigo: string;
  textPrimary: string;
  textSecondary: string;
  background: string;
  surface: string;
  card: string;
  /** 4.º nivel de superficie: la HOJA que se abre SOBRE una tarjeta. Antes no existía y se usaba `card`,
   *  así que una hoja sobre una tarjeta no se distinguía de lo que tapaba. */
  sheet: string;
  border: string;
  overlay: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  ...brand,
  textPrimary: '#1D2129',
  /**
   * 4,76:1 sobre blanco (antes 3,24:1, por debajo del mínimo AA de 4,5 para texto normal).
   * Auditoría de diseño, D-30: el texto secundario se lee, o no es texto.
   */
  textSecondary: '#6B7280',
  background: '#FFFFFF',
  surface: '#F5F7FA',
  card: '#FFFFFF',
  /** Hoja en claro: mismo blanco que la tarjeta — lo que la separa es la sombra, no el color. */
  sheet: '#FFFFFF',
  border: 'rgba(29, 33, 41, 0.08)',
  overlay: 'rgba(23, 23, 26, 0.45)',
  shadow: '#17171A',
};

export const darkColors: ThemeColors = {
  ...brand,
  textPrimary: '#F2F3F5',
  textSecondary: '#A9AEB8',
  background: '#17171A',
  surface: '#1E1E23',
  card: '#232329',
  /** 4.º nivel: la hoja se abre SOBRE la tarjeta (#232329) y tiene que distinguirse de ella. */
  sheet: '#2E3338',
  border: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000000',
};

/**
 * ELEVACIÓN — tres niveles, no doce.
 * Antes había 12 valores de `elevation` y 11 de `shadowOpacity` escritos a mano en 16 archivos:
 * dos tarjetas del mismo nivel se veían distintas y la interfaz perdía el orden.
 * Uso: `style={[styles.card, elevation.md]}` (con `useTheme().isDark` → `elevationDark`).
 */
export interface ElevationStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const elevation: Record<'sm' | 'md' | 'lg', ElevationStyle> = {
  sm: { shadowColor: '#17171A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#17171A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  lg: { shadowColor: '#17171A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 8 },
};

/** El mismo sistema en tema oscuro: la sombra es negra y más opaca para leerse sobre el fondo. */
export const elevationDark: Record<'sm' | 'md' | 'lg', ElevationStyle> = {
  sm: { shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.24, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.32, shadowRadius: 6, elevation: 3 },
  lg: { shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.44, shadowRadius: 16, elevation: 8 },
};

/**
 * RAMPA DE NEUTROS.
 *
 * POR QUÉ EXISTE: el kit tenía `textPrimary`, `textSecondary`, `border` y `surface` sueltos y **ninguna
 * rampa**. Faltaba color para tres cosas reales: el borde en modo oscuro, los estados apagados
 * (deshabilitado, cancelado) y los separadores internos de una tarjeta.
 *
 * AVISO, y está medido: **`n600` NO vale como texto secundario sobre fondo claro** — da 3,27 y suspende
 * el 4,5:1 de AA. Para eso se queda `textSecondary` (#6B7280, 4,83). La rampa es para **bordes,
 * separadores y rellenos apagados**, no para texto.
 *
 * Y `n1100` **no es el fondo de la app**: el fondo oscuro es `#17171A` por decisión del dueño
 * («modo oscuro sin negro puro»). La rampa no lo sustituye.
 */
export const neutro = {
  n100: '#FAFAFA',
  n200: '#F2F2F2',
  n300: '#E5E5E6',
  n400: '#D0D1D2',
  n500: '#B1B2B4',
  n600: '#898B8F',
  n700: '#686A6F',
  n800: '#4F5155',
  n900: '#3B3C40',
  n1000: '#2C2D30',
  n1100: '#18191B',
} as const;

/** Tintes con alfa (RN no soporta color-mix). */
export function alpha(hex: string, opacity: number): string {
  let h = hex.replace('#', '').trim();
  // Acepta la forma corta (`#FFFFFF` → `ffffff`): en el código había 387 usos de `#FFFFFF`.
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  // Un valor inesperado devuelve el color tal cual en vez de `rgba(NaN, …)`, que rompía el estilo.
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
