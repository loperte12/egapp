/**
 * TarjetaCuponCompacto — tarjeta 12 de 54 · `bcim_chat_couponcardv2_222`
 *
 * QUÉ ES: el cupón en su versión corta. Importe a la izquierda, una muesca de separación y los
 * datos a la derecha. Es la tarjeta que cabe en una línea de conversación sin comerse la pantalla:
 * 84 de alto frente a los 108 de la tarjeta 11.
 *
 * FORMA DE LOS DATOS (del DSL): `discountType` (el símbolo que precede a la cifra) · `name` ·
 * `couponType` · `status` · el importe y el mínimo de gasto · la fecha de validez.
 *
 * ANATOMÍA DE LA REFERENCIA (17 nodos): tarjeta de 84 de alto con radio **10** · columna del
 * importe de 86 con el símbolo a 14 y la cifra a 24 · una imagen de muesca de 8 de ancho
 * (`coupon-divide.png`) que hace el corte del cupón · columna de datos con el sello del tipo
 * (radio 2, borde 0,5, texto a 10), el nombre a 14 y la validez a 10.
 *
 * DECISIÓN: la referencia separa las dos mitades con una **imagen de muesca**. Aquí no se copia el
 * PNG: se dibuja el corte con una línea del color del borde del tema, que además funciona en modo
 * oscuro sin necesitar un segundo recurso. La forma del cupón se puede hacer con tokens.
 *
 * Y el radio 10 no se inventa: es `radios.chip` del kit, que existe para «chip de filtro».
 *
 * PENDIENTE DE CONTRATO: cupón. El backend ya tiene tabla y endpoints; falta poder mandarlo al chat.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';
import { ImporteCupon, SelloTipoCupon } from './piezas-cupon';

export interface DatosCuponCompacto {
  name?: string | null;
  couponType?: string | null;
  /** Símbolo que precede a la cifra. La referencia lo llama `discountType`. */
  discountType?: string | null;
  discount: string;
  threshold?: string | null;
  validoHasta?: string | null;
}

export function TarjetaCuponCompacto({ datos, etiquetaTipo, onUsar }: {
  datos: DatosCuponCompacto;
  etiquetaTipo?: string | null;
  onUsar?: () => void;
}) {
  const { colors } = useTheme();
  const tipo = etiquetaTipo ?? datos.couponType;

  return (
    <TarjetaEnChat
      onPress={onUsar}
      etiquetaAccesible={datos.name ? `Cupón ${datos.name}` : 'Cupón'}
      style={estilos.compacta}
    >
      <View style={estilos.fila}>
        <View style={estilos.izquierda}>
          <ImporteCupon
            cantidad={datos.discount}
            simbolo={datos.discountType ?? 'XAF'}
            minimo={datos.threshold}
          />
        </View>

        {/* La muesca: el corte del cupón, con el borde del tema en vez de un PNG. */}
        <View style={[estilos.muesca, { backgroundColor: colors.border }]} />

        <View style={estilos.derecha}>
          <View style={estilos.nombreLinea}>
            {tipo ? <SelloTipoCupon texto={tipo} /> : null}
            {datos.name ? (
              <Text style={[estilos.nombre, { color: colors.textPrimary }]} numberOfLines={2}>{datos.name}</Text>
            ) : null}
          </View>
          {datos.validoHasta ? (
            <Text style={[estilos.validez, { color: colors.textSecondary }]} numberOfLines={1}>
              Válido hasta {datos.validoHasta}
            </Text>
          ) : null}
        </View>
      </View>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** Radio 10 de la referencia: `radios.chip`. El resto lo pone el armazón compartido. */
  compacta: { borderRadius: radios.chip },
  fila: { flexDirection: 'row', alignItems: 'center' },
  izquierda: { minWidth: 86 },
  muesca: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: espaciado.e12 },
  derecha: { flex: 1, minWidth: 0 },
  nombreLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginBottom: espaciado.e6 },
  nombre: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio },
  validez: { fontSize: tipografia.nota, lineHeight: interlineado.micro },
});
