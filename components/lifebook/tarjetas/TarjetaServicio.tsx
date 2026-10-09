/**
 * TarjetaServicio — tarjeta 26 de 54 · `bcim_chat_logisticcustomserviceunhandle_216`
 *
 * QUÉ ES: el mensaje de un servicio. Lleva su logotipo, quién escribe, a quién representa y el
 * texto. Es lo que permite saber **de un vistazo que quien habla no es una persona**, antes de
 * leer nada.
 *
 * FORMA DE LOS DATOS (del DSL): `titleLogo` (el icono del servicio) · `title` (el servicio) ·
 * `subTitle` (la persona o el equipo) · `content` (el mensaje).
 *
 * ANATOMÍA DE LA REFERENCIA (16 nodos): tarjeta de **255 de ancho** con radio 12 y padding 10 ·
 * cabecera horizontal con el icono de 16, el título a 14 en peso medio, un **separador vertical de
 * 0,5 por 12** y el subtítulo a 14 en peso medio · debajo, el contenido a 14/20 en gris apagado.
 *
 * DECISIONES:
 *  1. **El separador vertical entre servicio y persona se conserva.** Es un detalle pequeño y hace
 *     algo importante: deja claro que son **dos datos distintos** —quién escribe y desde dónde— y no
 *     una frase partida. Se declara con el alto del propio texto y el trazo del kit.
 *  2. **El contenido va en gris secundario, no en el color principal**, como la referencia. La
 *     cabecera es la identidad y el cuerpo es el mensaje: si los dos pesan igual, el usuario tiene
 *     que leer todo para saber quién le habla.
 *  3. El ancho es el del patrón compartido, no los 255 fijos de la referencia.
 *
 * CONTRATO: `cardType: 'servicio'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaServicio({ logo, servicio, persona, contenido }: {
  logo?: string | null;
  servicio: string;
  persona?: string | null;
  contenido?: string | null;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <View style={estilos.cabecera}>
        {logo ? (
          <Image source={logo} style={estilos.logo} contentFit="cover" transition={0} />
        ) : null}
        <Text style={[estilos.servicio, { color: colors.textPrimary }]} numberOfLines={1}>{servicio}</Text>
        {persona ? (
          <>
            <View style={[estilos.separador, { backgroundColor: colors.textSecondary }]} />
            <Text style={[estilos.servicio, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
              {persona}
            </Text>
          </>
        ) : null}
      </View>

      {contenido ? (
        <Text style={[estilos.contenido, { color: colors.textSecondary }]} numberOfLines={6}>{contenido}</Text>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginBottom: espaciado.e4 },
  logo: { width: 16, height: 16 },
  servicio: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  /** Separa «el servicio» de «la persona»: dos datos, no una frase partida. */
  separador: { width: StyleSheet.hairlineWidth, height: 12, marginHorizontal: espaciado.e8, opacity: 0.6 },
  contenido: { fontSize: tipografia.body, lineHeight: interlineado.amplio },
});
