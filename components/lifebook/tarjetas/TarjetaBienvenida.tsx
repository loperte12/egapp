/**
 * TarjetaBienvenida — tarjeta 14 de 54 · `bcim_chat_cswelcomemsg_209`
 *
 * QUÉ ES: el saludo con el que se abre una conversación con una tienda o un servicio. Avatar
 * redondo, el mensaje de bienvenida y el nombre de quien atiende.
 *
 * FORMA DE LOS DATOS (del DSL, solo tres campos): `avatarUrl` · `welcomeMessage` · `name`.
 *
 * ANATOMÍA DE LA REFERENCIA (4 nodos): bloque centrado con 16 arriba y abajo · avatar de 64 con
 * **radio 32** —o sea, un círculo— y borde de 0,5 · mensaje a 14/18 en peso medio y centrado ·
 * nombre a 12/20 en gris y centrado.
 *
 * POR QUÉ NO LLEVA TARJETA: es el único de los que llevo visto que **no dibuja un contenedor**. En
 * la referencia no hay fondo, ni borde, ni radio: el avatar y el texto flotan centrados en la
 * conversación. Copiar eso es lo correcto — una bienvenida no es un objeto que se pueda abrir ni
 * pulsar, es una presentación. Meterla en una tarjeta la convertiría en algo que parece que hace
 * algo.
 *
 * DECISIÓN: el avatar usa `radios.full` en vez de un 32 literal. Es un círculo, y un círculo se
 * declara como tal: así sigue siéndolo si mañana cambia el tamaño.
 *
 * CONTRATO: encaja en `system` sin tocar nada, como la tarjeta 3. Es la segunda de las 54 que no
 * necesita ampliar el contrato.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { espaciado, interlineado, peso, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';

export function TarjetaBienvenida({ avatarUrl, mensaje, nombre }: {
  avatarUrl?: string | null;
  mensaje: string;
  nombre?: string | null;
}) {
  const { colors } = useTheme();

  return (
    <View style={estilos.bloque}>
      {avatarUrl ? (
        <Image
          source={avatarUrl}
          style={[estilos.avatar, { borderColor: colors.border }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : null}

      <Text style={[estilos.mensaje, { color: colors.textPrimary }]} numberOfLines={3}>{mensaje}</Text>
      {nombre ? (
        <Text style={[estilos.nombre, { color: colors.textSecondary }]} numberOfLines={1}>{nombre}</Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { alignItems: 'center', paddingVertical: espaciado.e16, maxWidth: 282 },
  /** Radio `full`: es un círculo, y se declara como círculo. */
  avatar: { width: 64, height: 64, borderRadius: radios.full, borderWidth: StyleSheet.hairlineWidth, marginBottom: espaciado.e12 },
  mensaje: { fontSize: tipografia.body, lineHeight: interlineado.body, fontWeight: peso.medio, textAlign: 'center', marginBottom: espaciado.e4 },
  nombre: { fontSize: tipografia.caption, lineHeight: interlineado.amplio, textAlign: 'center' },
});
