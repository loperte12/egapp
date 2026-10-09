/**
 * TarjetaSobre — tarjeta 40 de 54 · `bcim_chat_redpacket_124`
 *
 * QUÉ ES: un **sobre de dinero** (el «sobre rojo» de la tradición china: un regalo en metálico que
 * se manda por el chat). Título, subtítulo y una línea de descripción, y toda la tarjeta se pulsa
 * para abrirlo.
 *
 * FORMA DE LOS DATOS (del DSL, tres campos): `title` · `subTitle` · `description`.
 *
 * ANATOMÍA DE LA REFERENCIA (7 nodos): tarjeta de **210×86** con radio 12 · **una imagen de fondo**
 * que ocupa todo · el texto en un color crema claro y tres tamaños: título a 14 en peso medio,
 * subtítulo a 12 y descripción a 10 · todo el conjunto clicable.
 *
 * DECISIONES:
 *  1. **La imagen de fondo no se copia.** La referencia trae un PNG servido desde su CDN. Copiarlo
 *     significaría arrastrar un recurso ajeno y, además, **necesitar un segundo PNG para modo
 *     oscuro** — con el que el crema del texto dejaría de tener contraste garantizado. Aquí el sobre
 *     se dibuja con un **fondo tintado del color de éxito**, porque un sobre es dinero que se recibe:
 *     un BENEFICIO, igual que el cupón y el ahorro de la alerta de precio. El texto va en el color de
 *     texto del tema, que ya cumple AA sobre ese tinte.
 *  2. **Los tres textos mantienen su jerarquía** de la referencia (14 medio, 12, 10), que es lo que
 *     hace legible un objeto tan pequeño.
 *  3. El tamaño es el del patrón compartido, no 210×86 fijos.
 *
 * CONTRATO: `cardType: 'sobre'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  alpha, brand, espaciado, interlineado, peso, radios, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { Tactil } from '@egrouteplan/ui-kit';

export function TarjetaSobre({ titulo, subtitulo, descripcion, onAbrir }: {
  titulo: string;
  subtitulo?: string | null;
  descripcion?: string | null;
  onAbrir?: () => void;
}) {
  const { colors } = useTheme();

  const cuerpo = (
    <>
      <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={2}>{titulo}</Text>
      {subtitulo ? (
        <Text style={[estilos.subtitulo, { color: colors.textPrimary }]} numberOfLines={1}>{subtitulo}</Text>
      ) : null}
      {descripcion ? (
        <Text style={[estilos.descripcion, { color: colors.textSecondary }]} numberOfLines={2}>{descripcion}</Text>
      ) : null}
    </>
  );

  const estilo = [estilos.sobre, { backgroundColor: alpha(brand.success, 0.12), borderColor: alpha(brand.success, 0.35) }];

  if (onAbrir) {
    return (
      <Tactil onPress={onAbrir} accessibilityRole="button" accessibilityLabel={titulo} style={estilo}>
        {cuerpo}
      </Tactil>
    );
  }
  return <View style={estilo}>{cuerpo}</View>;
}

const estilos = StyleSheet.create({
  sobre: {
    width: 282, maxWidth: '100%', borderRadius: radios.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: espaciado.e14, paddingHorizontal: espaciado.e16,
  },
  titulo: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  subtitulo: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e4 },
  descripcion: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e4 },
});
