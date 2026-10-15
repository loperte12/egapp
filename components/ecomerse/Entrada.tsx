/**
 * Entrada · el campo de texto del Mercado
 * =======================================
 *
 * Lo que en Taobao son **dos** widgets: `DXCartTextInputWidgetNode` y `DXTEXTINPUTVIEW`.
 * Ver `entradaAtributos.ts` para por qué hacen falta los dos.
 *
 * ## El problema de fondo, y cómo se resuelve
 *
 * **Un `TextInput` es estado, y un árbol servido por el servidor es declarativo.** Los tres
 * caminos posibles:
 *
 * | | |
 * |---|---|
 * | El árbol guarda el estado | **No.** Un árbol que se re-renderiza con cada tecla es un parpadeo por pulsación |
 * | El componente guarda el estado | **No.** La pantalla no puede leer lo escrito — y lo necesita para enviar |
 * | **La pantalla guarda el estado, el árbol lo declara** | **Sí** |
 *
 * Así que: **el valor entra por el binding (`$borrador`), y lo escrito sale por
 * `alCambiarTexto(nombre, valor, nodo)`.** El nombre del evento sale de `ONCHANGE`, igual que el
 * toque sale de `EVENT_TAP` — **el atributo es el mensajero, no hay un campo aparte.**
 *
 * ## Y por qué `TextInput` no se controla aquí
 *
 * Este componente **no tiene `useState`**. Si lo tuviera, el valor de la pantalla y el de dentro
 * se pelearían: cada tecla haría `setState` aquí y en la pantalla, y el cursor saltaría al final
 * en los campos multilínea. **El valor lo manda siempre la pantalla.** Es la misma decisión que
 * `Texto` con `children`: el dato viene de fuera.
 */

import React from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { estiloDeCaja } from './layoutAtributos';
import { resolverEntrada, CLAVES_ENTRADA, type AtributosDxEntrada } from './entradaAtributos';

export interface EntradaProps {
  /** Atributos de los dos widgets de entrada, por clave hex de Taobao. */
  dx?: AtributosDxEntrada;
  /** El valor actual. **Lo manda la pantalla**, normalmente resuelto de un binding. */
  valor?: string;
  /**
   * Se avisa al escribir. **El primer argumento es el nombre del evento** (`ONCHANGE`), igual
   * que en el toque: la pantalla decide qué hacer con ese nombre.
   */
  alCambiarTexto?: (nombre: string, valor: string) => void;
  /** Texto accesible. `ACCESSIBILITY_TEXT` del vocabulario compartido. */
  accesibilidad?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Entrada({ dx, valor, alCambiarTexto, accesibilidad, style, testID }: EntradaProps) {
  const r = resolverEntrada(dx);

  // El nombre del evento sale del atributo, como el toque. Sin nombre no se emite nada: **una
  // entrada que nadie escucha no debe fingir que avisa.**
  const nombreEvento = dx?.[CLAVES_ENTRADA.ONCHANGE];

  const estiloTexto: TextStyle = {};
  if (r.color) estiloTexto.color = r.color;
  if (r.tamano !== undefined) estiloTexto.fontSize = r.tamano;
  if (r.alineacion) estiloTexto.textAlign = r.alineacion;

  const escribir = (t: string) => {
    if (nombreEvento !== undefined && alCambiarTexto) alCambiarTexto(String(nombreEvento), t);
  };

  const campo = (
    <TextInput
      testID={testID}
      value={r.texto ?? valor ?? ''}
      onChangeText={escribir}
      placeholder={r.marcador}
      placeholderTextColor={r.colorMarcador}
      maxLength={r.maximoCaracteres}
      multiline={r.multilinea}
      // **La altura sólo se topa si es multilínea.** En una línea, `maxHeight` recorta el campo y
      // el texto se ve cortado por abajo — es lo que hacía `MULTILINEMAXHEIGHT` en Taobao.
      style={[estiloTexto, r.multilinea && r.alturaMaxima !== undefined
        ? { maxHeight: r.alturaMaxima, textAlignVertical: 'top' as const }
        : null]}
      accessibilityLabel={accesibilidad}
      // Sin `defaultValue`: el valor es siempre el de la pantalla (ver la nota de arriba).
      // Sin `keyboardType`/`returnKeyType`: sus enums de Taobao NO se encontraron, y adivinar un
      // teclado es peor que no ponerlo. Van declarados en `noImplementados`.
    />
  );

  // El contador `12/1000`: lo pide `ISSHOWHINTNUM` y **necesita el tope**, así que sin `MAXLENGTH`
  // no se pinta — un contador sin denominador no dice nada.
  const escrito = r.texto ?? valor ?? '';
  const conContador = r.mostrarContador && r.maximoCaracteres !== undefined;

  if (!conContador) {
    return <View style={[estiloDeCaja(dx) as StyleProp<ViewStyle>, style]}>{campo}</View>;
  }

  return (
    <View style={[estiloDeCaja(dx) as StyleProp<ViewStyle>, style]}>
      {campo}
      <Text style={[s.contador, r.colorContador ? { color: r.colorContador } : null]}>
        {escrito.length}
        {/* El total va aparte porque Taobao le da su PROPIO color (`TOTALNUMCOLOR`). */}
        <Text style={r.colorTotal ? { color: r.colorTotal } : undefined}>
          {`/${r.maximoCaracteres}`}
        </Text>
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  contador: { fontSize: 11, textAlign: 'right', marginTop: 2, opacity: 0.7 },
});

export default Entrada;

export { resolverEntrada, CLAVES_ENTRADA, TIPOS_ENTRADA, PROCEDENCIA } from './entradaAtributos';
export type { AtributosDxEntrada, ResolucionEntrada, NombreAtributoEntrada } from './entradaAtributos';
