/**
 * TarjetaNoSoportada — tarjeta 3 de 54 · `bcim_chat_agentstreamreply_302`
 *
 * QUÉ ES: el respaldo. Cuando llega un mensaje que esta versión de la app no sabe pintar, en vez
 * de un hueco en blanco aparece un aviso discreto: «este mensaje no se puede mostrar, actualiza».
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE: es la pieza que hace segura la propuesta del tipo genérico.
 * Si el servidor manda un `cardType` que el cliente todavía no conoce —porque la tarjeta es nueva o
 * porque el usuario no ha actualizado—, **la conversación no se rompe**: se enseña este aviso y el
 * resto del chat sigue funcionando. Sin esto, cada tarjeta nueva es un riesgo de pantalla rota para
 * quien no ha actualizado.
 *
 * FORMA DE LOS DATOS (del DSL): `content.data.content.text` (el texto original, si lo hay) y una
 * línea fija traducida. La referencia además enseña el texto original en una burbuja aparte; aquí
 * eso no se hace, y a propósito: repetir un contenido que no se ha podido interpretar puede enseñar
 * algo a medias. Se dice que no se puede mostrar y ya.
 *
 * ANATOMÍA DE LA REFERENCIA (5 nodos): burbuja de texto (16/20) + tarjeta radio 12 con la línea de
 * respaldo (14/20, gris). Aquí queda solo la tarjeta: es un aviso, no un mensaje.
 *
 * CONTRATO: encaja en `system` sin tocar nada — un aviso generado por el servidor es exactamente
 * lo que ya significa ese tipo. **Es la primera de las 54 que no necesita contrato nuevo.**
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

/** Texto por defecto, en el idioma del producto. */
const AVISO = 'Este mensaje no se puede mostrar. Actualiza la app para verlo.';

export function TarjetaNoSoportada({ aviso, versionRequerida }: {
  /** Si el servidor manda un motivo, se usa; si no, el texto por defecto. */
  aviso?: string | null;
  /** Versión mínima, si el servidor la declara. Se añade al aviso, no lo sustituye. */
  versionRequerida?: string | null;
}) {
  const { colors } = useTheme();
  const texto = [aviso || AVISO, versionRequerida ? `Hace falta la versión ${versionRequerida} o posterior.` : null]
    .filter(Boolean).join(' ');

  return (
    <TarjetaEnChat>
      <View style={estilos.fila}>
        <Text style={[estilos.aviso, { color: colors.textSecondary }]} numberOfLines={3}>
          {texto}
        </Text>
      </View>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  fila: { alignItems: 'center' },
  aviso: { fontSize: tipografia.body, lineHeight: interlineado.amplio, textAlign: 'center' },
});
