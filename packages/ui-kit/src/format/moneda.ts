/**
 * MONEDA — el formateo del franco CFA, en un solo sitio.
 *
 * POR QUÉ EXISTE: `formatXAF` vivía en `app/utils/formatHelpers.ts` y devolvía
 * `${n.toLocaleString('es-GQ')} XAF`, con **un espacio normal entre la cifra y la unidad**. Un
 * espacio normal es un punto de corte válido para el motor de texto, así que en cuanto la caja se
 * quedaba estrecha el precio se partía en dos líneas: «6.500» arriba y «XAF» debajo. Se vio en el
 * carrusel de recomendados del Mercado, donde la tarjeta mide 92 dp de ancho.
 *
 * El defecto no era de esa tarjeta: era del formateo, y por eso se copiaba a cada sitio que
 * pintaba un precio con poco ancho. Aquí se arregla donde nace.
 *
 * DOS DECISIONES:
 *
 * 1. **Espacio duro (U+00A0) en vez de espacio normal.** La cifra y la unidad son una sola cosa:
 *    «6.500 XAF» no es «6.500» y «XAF», es un importe. Con espacio duro, ningún contenedor puede
 *    separarlas, ni siquiera el texto corrido de un pedido.
 *
 * 2. **El separador de miles se calcula, no se pide al sistema.** `toLocaleString('es-GQ')` depende
 *    del ICU que traiga el motor de JavaScript del dispositivo; en un móvil sin ese juego de datos
 *    el resultado cambia de «6.500» a «6,500» sin avisar. Como XAF no tiene céntimos en la práctica
 *    (la unidad mínima es 1 franco), el formato es siempre el mismo: entero, punto cada tres cifras.
 *    Escribirlo así quita una dependencia del entorno a cambio de nada.
 *
 * Uso:
 *   formateaXAF(250000)   → '250.000\u00A0XAF'   (una sola pieza, incapaz de partirse)
 *   formateaXAF(null)     → '—\u00A0XAF'
 *   partesXAF(250000)     → { numero: '250.000', unidad: 'XAF' }
 *
 * `partesXAF` existe para quien necesite pintar la unidad en cuerpo menor —el patrón habitual del
 * comercio, y lo que hace `primitives/Precio.tsx`—, en vez de componer a mano sobre la cadena ya
 * formateada.
 */

/**
 * Espacio duro: impide el salto de línea y no se colapsa. Se exporta porque los textos de producto
 * que juntan una cifra y una palabra («6.500 XAF / unidad») necesitan el mismo pegamento.
 */
export const ESPACIO_DURO = '\u00A0';

/** Código ISO de la moneda local. La app lo usa en toda la interfaz; cambiarlo es una decisión de producto. */
export const MONEDA_XAF = 'XAF';

/** Texto que se muestra cuando no hay importe. */
export const SIN_IMPORTE = '—' + ESPACIO_DURO + MONEDA_XAF;

export interface PartesMoneda {
  /** Cifra ya formateada con separador de miles, sin unidad y sin espacios. */
  numero: string;
  /** Unidad, sin espacio delante. */
  unidad: string;
}

/**
 * Convierte un importe en sus dos partes. Devuelve `null` si no hay un número utilizable, para que
 * quien pinte decida qué enseñar en su lugar.
 */
export function partesXAF(valor: number | string | null | undefined): PartesMoneda | null {
  const n = typeof valor === 'string' ? Number(valor) : Number(valor);
  if (valor == null || !Number.isFinite(n)) return null;
  const redondeado = Math.round(n);
  const signo = redondeado < 0 ? '-' : '';
  const digitos = String(Math.abs(redondeado)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { numero: signo + digitos, unidad: MONEDA_XAF };
}

/** Importe completo, en una sola pieza indivisible. */
export function formateaXAF(valor: number | string | null | undefined): string {
  const p = partesXAF(valor);
  if (!p) return SIN_IMPORTE;
  return p.numero + ESPACIO_DURO + p.unidad;
}
