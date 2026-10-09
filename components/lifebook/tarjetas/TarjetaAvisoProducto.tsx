/**
 * TarjetaAvisoProducto — tarjetas 34, 35 y 36 de 54 · `bcim_chat_preorderchecksuccess_96`,
 * `bcim_chat_preorderpaid_94` y `bcim_chat_promptorder_108`
 *
 * QUÉ ES: un aviso sobre un producto. La forma más repetida del comercio en el chat: una frase que
 * dice qué pasa y, debajo, el artículo al que se refiere. **Tres tarjetas de la referencia con la
 * misma anatomía**, así que van en un componente.
 *
 * LAS TRES, EN LA REFERENCIA:
 *  · La 34 (`preorderchecksuccess_96`): «El producto ya se puede pedir, toca pagar para ver el
 *    pedido» + bloque del artículo de 58 de alto con el precio.
 *  · La 35 (`preorderpaid_94`): «Ya he pagado, envía cuanto antes» + el mismo bloque, con un velo
 *    sobre la foto. Datos: `image`, `name`, `price` — idénticos a la 34.
 *  · La 36 (`promptorder_108`): «El pedido que consulto» + **estado** a la derecha + bloque de 56.
 *    Datos: `state`, `noteTitle`, `noteImage` y los de campaña.
 *
 * ANATOMÍA COMÚN: tarjeta radio 12 con padding 12, toda ella clicable · frase 14/20 en peso medio ·
 * bloque del artículo con fondo suave, radio 8, foto de 58 (56 en la 36) y el nombre a 14/22.
 *
 * DECISIONES:
 *  1. **El velo sobre la foto de la 35 no se copia.** La referencia lo pone para dar a entender que
 *     el pedido está en curso, pero oscurecer la foto de un artículo **no informa de nada**: el
 *     estado ya lo dice la frase de arriba. Y un velo calculado a ojo cambia el aspecto del producto
 *     según la foto que sea. Lo que sí se conserva es la información: la frase.
 *  2. **La foto es 56 en las tres**, no 58 en dos y 56 en una. Un píxel de diferencia entre tarjetas
 *     hermanas es exactamente el tipo de deriva que la auditoría encontró en la app.
 *  3. El estado de la 36 va en la cabecera con el tono semántico de la casa.
 *
 * CONTRATO: `cardType: 'aviso-producto'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BloquePedido, CabeceraTarjeta, TarjetaEnChat, type Tono } from './piezas';

export function TarjetaAvisoProducto({ texto, estado, tonoEstado, imagen, producto, precio, onAbrir, onBoton }: {
  /** La frase que dice qué pasa. Es lo único que cambia entre las tres tarjetas. */
  texto: string;
  /** Estado a la derecha del texto (lo usa la tarjeta 36). */
  estado?: string | null;
  tonoEstado?: Tono;
  imagen?: string | null;
  producto: string;
  precio?: string | null;
  onAbrir?: () => void;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat onPress={onAbrir ?? (onBoton ? () => onBoton(texto) : undefined)} etiquetaAccesible={texto}>
      {/* Con estado va la cabecera del patrón; sin él, la frase manda sola. */}
      {estado ? (
        <CabeceraTarjeta titulo={texto} estado={estado} tono={tonoEstado} />
      ) : (
        <Text style={[estilos.texto, { color: colors.textPrimary }]} numberOfLines={3}>{texto}</Text>
      )}

      <BloquePedido
        imagen={imagen}
        titulo={producto}
        detalle={precio ? (
          <Text style={[estilos.precio, { color: colors.textPrimary }]} numberOfLines={1}>{precio}</Text>
        ) : null}
        onPress={onAbrir}
        etiquetaAccesible={producto}
      />
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  texto: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio, marginBottom: espaciado.e10 },
  precio: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte, marginTop: espaciado.e2 },
});
