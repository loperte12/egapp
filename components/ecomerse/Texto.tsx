/**
 * Texto · el componente de texto del Mercado, portado del vocabulario de Taobao
 * =============================================================================
 *
 * El componente **más usado** del Mercado: `TEXT`, `TEXTCOLOR` y `TEXTSIZE` aparecen
 * **220 veces cada uno** en las 246 plantillas reales.
 *
 * Como los demás, toda la resolución vive en `textoAtributos.ts`, que es **puro**, para que
 * el oráculo de fidelidad importe la lógica real en vez de una copia.
 *
 * ## Sirve para cinco widgets de Taobao, no solo uno
 *
 * Las claves del vocabulario de texto son **compartidas** (`DXRICHTEXT_TEXTSIZE ==
 * DXTEXTSPAN_TEXTSIZE == DXMEGAPRICEVIEW_TEXTSIZE`), así que este componente cubre
 * `DXRICHTEXT`, `DXTEXTSPAN`, `DXCARTTEXTSPAN`, `DXCARTTEXTINPUT` y `DXMEGAPRICEVIEW`.
 *
 * `DXTEXTVIEW` **no tiene atributos propios** — su única entrada en la tabla es su ID de tipo.
 */

import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverTexto, type AtributosDxTexto } from './textoAtributos';

export interface TextoProps {
  /** El texto. Si viene `dx`, `TEXT` manda. */
  children?: React.ReactNode;
  /** Atributos del vocabulario de texto, por clave hex de Taobao. */
  dx?: AtributosDxTexto;
  style?: StyleProp<TextStyle>;
  alPulsar?: () => void;
  testID?: string;
  /** Número máximo de líneas, si no viene en `dx`. */
  lineasMaximas?: number;
}

/**
 * El texto del Mercado.
 *
 * ```tsx
 * <Texto dx={{ '00000008e396ac59': 'Vestido', '5db0637a915fa268': 14 }} />
 * ```
 */
export function Texto({ children, dx, style, alPulsar, testID, lineasMaximas }: TextoProps) {
  const r = resolverTexto(dx);

  const estilo: TextStyle = {};
  if (r.color) estilo.color = r.color;
  if (r.tamano !== undefined) estilo.fontSize = r.tamano;
  if (r.alineacion) estilo.textAlign = r.alineacion;
  if (r.negrita) estilo.fontWeight = 'bold';
  if (r.cursiva) estilo.fontStyle = 'italic';
  if (r.familia) estilo.fontFamily = r.familia;
  if (r.peso && !r.negrita) estilo.fontWeight = r.peso as TextStyle['fontWeight'];
  if (r.interlineado !== undefined) estilo.lineHeight = r.interlineado;
  if (r.sombra) {
    if (r.sombra.color) estilo.textShadowColor = r.sombra.color;
    if (r.sombra.radio !== undefined) estilo.textShadowRadius = r.sombra.radio;
    if (r.sombra.desplazamiento !== undefined) {
      estilo.textShadowOffset = { width: 0, height: r.sombra.desplazamiento };
    }
  }

  // `MAXLINES`: Taobao usa `-1` para «sin límite», y se traduce a no poner `numberOfLines`.
  const max = r.lineasMaximas ?? lineasMaximas;

  return (
    <Text
      testID={testID}
      style={[estiloDeCaja(dx), estilo, r.anchoMaximo !== undefined ? { maxWidth: r.anchoMaximo } : null, style]}
      numberOfLines={max}
      ellipsizeMode={r.truncado}
      onPress={r.tieneToque ? alPulsar : undefined}
      adjustsFontSizeToFit={r.ajustarTamano || undefined}
      // Sin `allowFontScaling`: Taobao tiene `ENABLETEXTSIZESTRATEGY` para esto, pero su
      // semántica no la hemos verificado. Decidirlo sería una suposición.
    >
      {r.contenido ?? children}
    </Text>
  );
}

export default Texto;

export { resolverTexto, canonizarColor, CLAVES_TEXTO, GRAVEDAD, TRUNCADO } from './textoAtributos';
export type { AtributosDxTexto, ResolucionTexto, NombreAtributoTexto } from './textoAtributos';
