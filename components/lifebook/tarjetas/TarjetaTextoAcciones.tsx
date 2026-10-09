/**
 * TarjetaTextoAcciones — tarjetas 25 y 29 de 54 · `bcim_chat_logisticagent_223` y
 * `bcim_chat_minorrefund_214`
 *
 * QUÉ ES: un texto con botones debajo. La forma más común del servicio al cliente: explica algo y
 * ofrece una o dos salidas («llamar», «ver el pedido»). Son dos tarjetas de la referencia con **la
 * misma forma** y distinto peso, así que van en un componente con dos variantes.
 *
 * QUÉ LAS DIFERENCIA EN LA REFERENCIA:
 *  · La 25 (`logisticagent_223`): texto a 14/18, separador de 0,5 y botones **centrados** a 14 en
 *    peso medio. Es un aviso normal.
 *  · La 29 (`minorrefund_214`): **título** a 16/24 en negrita, cuerpo a 16/22 y botones con borde y
 *    radio 14 a 12 en negrita. Es un aviso importante —una devolución— y se nota en que tiene
 *    título propio y el texto más grande.
 *
 * DECISIONES:
 *  1. **Una sola pieza con variante `destacado`**, no dos componentes casi iguales. La diferencia
 *     real es la presencia de título y el peso, y eso ya lo dicen los datos: si llega `titulo`, se
 *     pinta destacado. Así no hay dos ficheros que mantener en paralelo.
 *  2. **Los botones no se parten en dos columnas.** La referencia centra los de la 25 y alinea los
 *     de la 29; aquí se usa la fila del patrón, que envuelve si no caben. Un botón cortado a la
 *     mitad de una palabra es peor que un botón en la línea de abajo.
 *
 * CONTRATO: `cardType: 'texto-acciones'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';

export function TarjetaTextoAcciones({ titulo, texto, botones, destacado, onBoton }: {
  /** Si viene, la tarjeta se pinta en su variante destacada (título a 16 en negrita). */
  titulo?: string | null;
  /** Opcional: la tarjeta 37 (`queueguideleave_114`) es título y botones, sin cuerpo. */
  texto?: string | null;
  botones?: Array<{ etiqueta: string }>;
  /** Fuerza la variante destacada aunque no haya título. */
  destacado?: boolean;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();
  const esDestacado = destacado || Boolean(titulo);
  const acciones = botones ?? [];

  return (
    <TarjetaEnChat>
      {titulo ? (
        <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={3}>{titulo}</Text>
      ) : null}

      {texto ? (
        <Text
          style={[
            esDestacado ? estilos.textoDestacado : estilos.texto,
            { color: colors.textPrimary },
            titulo ? { marginTop: espaciado.e4 } : null,
          ]}
          numberOfLines={6}
        >
          {texto}
        </Text>
      ) : null}

      {acciones.length ? (
        <View style={estilos.acciones}>
          {acciones.map((b, i) => (
            <BotonPildora
              key={`${b.etiqueta}-${i}`}
              texto={b.etiqueta}
              contorno={esDestacado}
              onPress={onBoton ? () => onBoton(b.etiqueta) : undefined}
            />
          ))}
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.fuerte },
  texto: { fontSize: tipografia.body, lineHeight: interlineado.body },
  /** El aviso importante: 16/22 como la tarjeta 29. */
  textoDestacado: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e12 },
});
