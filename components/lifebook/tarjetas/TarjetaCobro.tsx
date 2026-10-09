/**
 * TarjetaCobro — tarjeta 43 de 54 · `bcim_chat_smallpayment_50`
 *
 * QUÉ ES: el aviso de un **cobro pequeño** recibido. No es un pedido ni un pago: es dinero que entra
 * por un motivo concreto, y la tarjeta dice **cuánto** y **por qué**, con un botón para actuar.
 *
 * FORMA DE LOS DATOS (del DSL): `amount` · `reason` · `status` (que decide qué dice y cómo se pinta
 * el botón).
 *
 * ANATOMÍA DE LA REFERENCIA (12 nodos): tarjeta radio 12 con **borde de 0,5** · titular a 15/26 en
 * peso medio con padding propio de 16/12 · separador de 1 · dos líneas a 14/22 con la etiqueta en
 * gris y el valor en el color de texto («Importe:», «Motivo:») · botón de píldora de 25 de alto.
 *
 * DECISIONES:
 *  1. **El importe es lo primero que se lee.** En la referencia va en una línea de par etiqueta/valor
 *     como el motivo, así que el ojo no distingue lo importante. Aquí el importe va destacado en
 *     negrita y el motivo debajo en gris: lo que el usuario viene a ver es cuánto.
 *  2. **El estado manda en el botón**: la referencia trae `status` y cambia texto y color según él.
 *     Se respeta, y el color sale del tono semántico de la casa — ámbar si está pendiente, verde si
 *     se completó. Nunca rojo: un cobro no es una emergencia.
 *  3. La etiqueta y el valor se separan por color, como en la tarjeta de cancelación.
 *
 * CONTRATO: `cardType: 'cobro'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat, type Tono } from './piezas';

export function TarjetaCobro({ importe, motivo, estado, tonoEstado, onPagar }: {
  /** Ya formateado («30 000 XAF»). */
  importe: string;
  motivo?: string | null;
  /** Texto del botón; lo manda el servidor según su estado. */
  estado?: string | null;
  tonoEstado?: Tono;
  onPagar?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <Text style={[estilos.titular, { color: colors.textPrimary }]} numberOfLines={2}>
        Tienes un cobro pendiente
      </Text>

      <View style={[estilos.separador, { backgroundColor: colors.border }]} />

      <Text style={[estilos.importe, { color: colors.textPrimary }]} numberOfLines={1}>{importe}</Text>

      {motivo ? (
        <Text style={[estilos.motivo, { color: colors.textSecondary }]} numberOfLines={2}>{motivo}</Text>
      ) : null}

      {onPagar ? (
        <View style={estilos.accion}>
          <BotonPildora
            texto={estado ?? 'Pagar'}
            tono={tonoEstado}
            onPress={onPagar}
          />
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  titular: { fontSize: tipografia.cuerpo, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  separador: { height: StyleSheet.hairlineWidth, marginTop: espaciado.e12, marginBottom: espaciado.e12 },
  /** El importe manda: es lo que el usuario viene a ver. */
  importe: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.fuerte },
  motivo: { fontSize: tipografia.body, lineHeight: interlineado.body, marginTop: espaciado.e4 },
  accion: { flexDirection: 'row', marginTop: espaciado.e12 },
});
