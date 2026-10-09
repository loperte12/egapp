/**
 * Piezas de las tarjetas de CUPÓN.
 *
 * POR QUÉ ESTÁN APARTE: la referencia tiene **tres tarjetas de cupón** (`coupon_19`,
 * `couponcardv2_222`, `couponclaim_112`) con tres envoltorios distintos —108, 84 y una tarjeta con
 * gráfico— pero **el mismo contenido**: un importe, un mínimo de gasto, un nombre, un tipo y una
 * validez. Lo que se repite de verdad no es el envoltorio, es el bloque del importe.
 *
 * Así que las tres tarjetas existen con el nombre de su referencia (para poder cotejarlas una a
 * una) pero comparten esto. Si algún día el importe de un cupón se pinta distinto, se cambia aquí
 * una vez y no en tres sitios.
 *
 * EL COLOR DEL IMPORTE ES UNA DECISIÓN DE IDENTIDAD, no un descuido. La referencia lo pinta en rojo
 * en las tres tarjetas. En LifeBook el rojo está reservado a emergencias, y un descuento no es una
 * urgencia: va en verde de éxito, porque un cupón es un BENEFICIO —dinero que el usuario se ahorra—.
 * El azul se descarta porque es ACCIÓN y el cupón no se pulsa, se usa; el naranja porque CLASIFICA,
 * no valora.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brand, espaciado, interlineado, peso, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';

/**
 * El importe de un cupón, con el mínimo de gasto debajo. Es lo que hace seguir leyendo.
 *
 * SOBRE EL TAMAÑO `mayor`: la referencia usa **32** en la tarjeta 13. La escala del kit llega a 32
 * solo por `emojiMedio`, que es un token de TAMAÑO DE SÍMBOLO —usarlo para una cifra sería mentir
 * sobre su nombre—. Se usa `hero` (30), que está declarado justo como «cifra de hero». La
 * diferencia es de 2 px y el nombre dice la verdad.
 */
export function ImporteCupon({ cantidad, simbolo = 'XAF', minimo, tamano = 'grande' }: {
  cantidad: string;
  /** Símbolo que precede a la cifra («XAF», «−», «%»). */
  simbolo?: string;
  minimo?: string | null;
  /** `grande` = 24 (tarjetas 11 y 12) · `mayor` = 30 (tarjeta 13, con gráfico). */
  tamano?: 'grande' | 'mayor';
}) {
  const cifra = tamano === 'mayor' ? estilos.cifraMayor : estilos.cifra;
  return (
    <View>
      <View style={estilos.lineaImporte}>
        <Text style={[estilos.simbolo, { color: brand.success }]} numberOfLines={1}>{simbolo}</Text>
        <Text style={[cifra, { color: brand.success }]} numberOfLines={1}>{cantidad}</Text>
      </View>
      {minimo ? (
        <Text style={[estilos.minimo, { color: brand.success }]} numberOfLines={1}>{minimo}</Text>
      ) : null}
    </View>
  );
}

/** Sello del tipo de cupón («Cupón», «Cupón de tienda»…). Clasifica, así que va en gris: no celebra. */
export function SelloTipoCupon({ texto }: { texto: string }) {
  const { colors } = useTheme();
  return (
    <View style={[estilos.sello, { borderColor: colors.textSecondary }]}>
      <Text style={[estilos.selloTexto, { color: colors.textSecondary }]} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  lineaImporte: { flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e2 },
  simbolo: { fontSize: tipografia.detalle, lineHeight: interlineado.caption, fontWeight: peso.medio, marginBottom: espaciado.e2 },
  cifra: { fontSize: tipografia.tituloFicha, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  cifraMayor: { fontSize: tipografia.hero, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  minimo: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e2 },
  sello: { borderRadius: radios.punta, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: espaciado.e2 },
  selloTexto: { fontSize: tipografia.nota, lineHeight: interlineado.micro },
});
