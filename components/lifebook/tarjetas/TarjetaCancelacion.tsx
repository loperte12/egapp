/**
 * TarjetaCancelacion — tarjeta 33 de 54 · `bcim_chat_packagecancel_61`
 *
 * QUÉ ES: el aviso de que **se ha pedido cancelar un pedido**. Enseña de qué pedido se trata —la
 * tienda y el número— para que quien lo lea sepa a cuál se refiere sin salir del chat.
 *
 * FORMA DE LOS DATOS (del DSL): `package_id` · `ack` (el acuse) · y del pedido ya resuelto por el
 * servidor: `sellerPkgData.shopName` · `statusCode` · `handling` · `csstatus` ·
 * `newSkuList[0].image`.
 *
 * ANATOMÍA DE LA REFERENCIA (25 nodos): tarjeta radio 12 con padding 12 · título a **13/16** en peso
 * medio · separador de 0,5 · fila con la foto del artículo de **48** y radio 5 · a la derecha dos
 * líneas etiquetadas a **11/16**: «Tienda:» y «Pedido:», con la etiqueta en gris apagado y el valor
 * en el color de texto.
 *
 * DECISIONES:
 *  1. **La etiqueta y el valor se separan por color, no por posición.** La referencia ya lo hace así
 *     y es lo correcto: sin el gris en «Tienda:», las dos líneas se leen como cuatro datos sueltos en
 *     vez de como dos pares. Se conserva tal cual.
 *  2. **El número de pedido se puede copiar.** Es el dato que el usuario tiene que dar por teléfono o
 *     pegar en una reclamación; que haya que teclearlo de memoria es un dato perdido. La referencia
 *     no lo ofrece; aquí sí, con la pieza de dato compartida.
 *  3. **No se usa el rojo.** Una cancelación no es una emergencia: es un trámite. El estado va en el
 *     tono semántico que corresponda (ámbar si está pendiente, verde si se resolvió).
 *
 * CONTRATO: `cardType: 'cancelacion'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, interlineado, peso, radios, Tactil, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaCancelacion({ imagen, tienda, pedido, onCopiar }: {
  imagen?: string | null;
  tienda?: string | null;
  pedido?: string | null;
  onCopiar?: (valor: string) => void;
}) {
  const { colors } = useTheme();
  if (!tienda && !pedido) return null;

  return (
    <TarjetaEnChat>
      <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
        Solicitud de cancelación
      </Text>

      <View style={[estilos.separador, { backgroundColor: colors.border }]} />

      <View style={estilos.fila}>
        {imagen ? (
          <Image source={imagen} style={estilos.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <View style={[estilos.foto, { backgroundColor: alpha(colors.primary, 0.08) }]} />
        )}

        <View style={estilos.datos}>
          {tienda ? (
            <Text style={estilos.linea} numberOfLines={1}>
              <Text style={[estilos.etiqueta, { color: colors.textSecondary }]}>Tienda: </Text>
              <Text style={{ color: colors.textPrimary }}>{tienda}</Text>
            </Text>
          ) : null}

          {pedido ? (
            /* El número de pedido se copia: es el dato que se da por teléfono o se pega en una
               reclamación. Teclearlo de memoria es un dato perdido. */
            <Tactil
              onPress={onCopiar ? () => onCopiar(pedido) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`Copiar el número de pedido ${pedido}`}
              style={estilos.copiables}
            >
              <Text style={estilos.linea} numberOfLines={1}>
                <Text style={[estilos.etiqueta, { color: colors.textSecondary }]}>Pedido: </Text>
                <Text style={{ color: colors.textPrimary }}>{pedido}</Text>
              </Text>
            </Tactil>
          ) : null}
        </View>
      </View>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** 13/16 como la referencia: es un rótulo, no un titular. */
  titulo: { fontSize: tipografia.detalle, lineHeight: interlineado.caption, fontWeight: peso.medio },
  separador: { height: StyleSheet.hairlineWidth, marginTop: espaciado.e12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e12 },
  /** 48 y radio 5 de la referencia. */
  foto: { width: 48, height: 48, borderRadius: radios.punta },
  datos: { flex: 1, minWidth: 0 },
  copiables: { marginTop: espaciado.e2 },
  /** 11/16 como la referencia, con el kit: `nota` es 10 y `micro` 10,5 — se usa `nota`. */
  linea: { fontSize: tipografia.nota, lineHeight: interlineado.caption },
  etiqueta: { fontWeight: peso.normal },
});
