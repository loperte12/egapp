/**
 * TarjetaAviso — tarjeta 28 de 54 · `bcim_chat_logisticqueuetips_218`
 *
 * QUÉ ES: un aviso con un consejo. Lo usa logística para explicar una situación y añadir una
 * recomendación práctica. Tiene tres partes y en ese orden: **titular**, **explicación** y
 * **consejo**.
 *
 * FORMA DE LOS DATOS (del DSL): `top` (el titular) · `content` (la explicación) · `tip` (el
 * consejo).
 *
 * ANATOMÍA DE LA REFERENCIA (5 nodos): tarjeta de **343 de ancho** con radio 12 y padding 12 ·
 * titular a 16/20 en peso medio con 8 de separación · explicación a 14, en dos nodos (uno de texto
 * normal y otro de texto enriquecido) · consejo a 14/22 con 2 de separación.
 *
 * DECISIONES:
 *  1. **El consejo no se separa con una caja ni con un color.** La referencia lo distingue solo por
 *     el interlineado (22 frente a los 14 del cuerpo). Aquí se distingue por **posición y peso**, que
 *     es lo que el ojo ya usa: va el último y en el mismo color de texto. Un consejo no es un error
 *     ni una advertencia, así que no lleva ni rojo ni ámbar.
 *  2. **Los dos nodos de explicación se juntan en uno.** La referencia parte el texto en un `TextView`
 *     normal y un `SparkRichTextView` porque su motor necesita el segundo para el texto con formato.
 *     En React Native un solo `Text` con hijos hace lo mismo: partir el párrafo en dos nodos era una
 *     limitación de su motor, no una decisión de diseño.
 *  3. El ancho es el del patrón compartido, no los 343 fijos de la referencia.
 *
 * CONTRATO: `cardType: 'aviso'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaAviso({ titular, explicacion, consejo }: {
  titular?: string | null;
  explicacion?: string | null;
  /** Recomendación práctica. Va la última y sin adornos: no es un error. */
  consejo?: string | null;
}) {
  const { colors } = useTheme();
  if (!titular && !explicacion && !consejo) return null;

  return (
    <TarjetaEnChat>
      {titular ? (
        <Text style={[estilos.titular, { color: colors.textPrimary }]} numberOfLines={3}>{titular}</Text>
      ) : null}

      {explicacion ? (
        <Text
          style={[estilos.explicacion, { color: colors.textPrimary }, titular ? { marginTop: espaciado.e8 } : null]}
          numberOfLines={6}
        >
          {explicacion}
        </Text>
      ) : null}

      {consejo ? (
        <Text style={[estilos.consejo, { color: colors.textPrimary }]} numberOfLines={5}>{consejo}</Text>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  titular: { fontSize: tipografia.subtitle, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  explicacion: { fontSize: tipografia.body, lineHeight: interlineado.body },
  /** 14/22 como la referencia: el consejo se distingue por el aire, no por el color. */
  consejo: { fontSize: tipografia.body, lineHeight: interlineado.suelto, marginTop: espaciado.e2 },
});
