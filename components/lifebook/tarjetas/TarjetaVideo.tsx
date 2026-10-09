/**
 * TarjetaVideo — tarjeta 53 de 54 · `bcim_chat_video_73`
 *
 * QUÉ ES: un **vídeo dentro del chat**. Portada, duración y botón de reproducir; al pulsarla se abre
 * el reproductor.
 *
 * ── UNA AUDITORÍA QUE VALIÓ LA PENA ──────────────────────────────────────────
 * El censo de componentes decía que esta tarjeta ya tenía equivalente en LifeBook:
 * `components/lifebook/VideoCoverSheet.tsx`. **Al abrir el fichero, no era verdad.** Esa hoja sirve
 * para **elegir el fotograma de portada al publicar un vídeo**, no para pintar un vídeo en el chat.
 * Coincidió por la palabra «video» en el nombre.
 *
 * Es el mismo error que cometí al principio de la campaña, pero al revés: entonces di por malo lo que
 * estaba bien por fiarme de una métrica; aquí habría dado por hecho algo que no existe. La regla que
 * lo evita es la misma: **abrir el fichero antes de juzgarlo**.
 *
 * FORMA DE LOS DATOS (del DSL): `dimension` (por ejemplo «1080*1920») · `coverPicture` · `duration`.
 *
 * ANATOMÍA DE LA REFERENCIA (6 nodos): contenedor **negro** con radio 12 · el ancho y el alto se
 * calculan a partir de `dimension`, con el lado corto limitado a 120 en horizontal y 160 en vertical
 * · la portada ocupa todo · la duración abajo a la derecha a 11 en blanco · botón de reproducir de
 * 30×30 con radio 15 y fondo negro al 50 %, centrado.
 *
 * DECISIONES:
 *  1. **La relación de aspecto sí se respeta**, y es lo único de la referencia que se copia con
 *     exactitud: un vídeo vertical y uno horizontal no pueden ocupar el mismo hueco, o la portada
 *     sale deformada. Se calcula desde `dimension` y se limita el lado corto.
 *  2. **El negro del contenedor se queda negro**: el negro puro no es aquí un color del tema, es la
 *     ausencia de imagen. Mientras carga la portada, un hueco claro deslumbra y uno oscuro no. Se
 *     declara con el token de sombra del tema, que ya es negro en los dos modos.
 *  3. El botón de reproducir lleva etiqueta de accesibilidad: es el único control de la tarjeta.
 *
 * CONTRATO: `cardType: 'video'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, interlineado, peso, radios, Tactil, tipografia, useTheme,
} from '@egrouteplan/ui-kit';

/** Lado corto máximo, como la referencia: 120 si el vídeo es horizontal, 160 si es vertical. */
const LADO_CORTO = 160;

/** De «1080*1920» saca la relación. Si no se puede leer, se asume vertical 9:16. */
function relacion(dimension?: string | null): number {
  const partes = String(dimension ?? '').split('*').map((n) => parseFloat(n));
  if (partes.length === 2 && partes[0] > 0 && partes[1] > 0) return partes[0] / partes[1];
  return 9 / 16;
}

export function TarjetaVideo({ portada, dimension, duracion, onReproducir }: {
  portada?: string | null;
  /** «ancho*alto», como lo manda la referencia. */
  dimension?: string | null;
  /** Segundos o texto ya formateado. */
  duracion?: string | number | null;
  onReproducir?: () => void;
}) {
  const { colors } = useTheme();
  const r = relacion(dimension);
  const horizontal = r > 1;

  const ancho = horizontal ? LADO_CORTO * r : LADO_CORTO;
  const alto = horizontal ? LADO_CORTO : LADO_CORTO / r;

  const etiqueta = typeof duracion === 'number'
    ? `${Math.floor(duracion / 60)}:${String(Math.floor(duracion % 60)).padStart(2, '0')}`
    : duracion;

  return (
    <Tactil
      onPress={onReproducir}
      accessibilityRole="button"
      accessibilityLabel={etiqueta ? `Reproducir vídeo, ${etiqueta}` : 'Reproducir vídeo'}
      style={[estilos.marco, { width: ancho, height: alto, backgroundColor: colors.shadow }]}
    >
      {portada ? (
        <Image source={portada} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      ) : null}

      <View style={[estilos.boton, { backgroundColor: alpha(colors.shadow, 0.5) }]}>
        <Text style={estilos.flecha}>▶</Text>
      </View>

      {etiqueta ? (
        <Text style={estilos.duracion} numberOfLines={1}>{etiqueta}</Text>
      ) : null}
    </Tactil>
  );
}

const estilos = StyleSheet.create({
  marco: { borderRadius: radios.md, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  /** 30×30 y radio `full`: es un círculo, y se declara como círculo. */
  boton: { width: 30, height: 30, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  flecha: { color: 'white', fontSize: tipografia.caption, lineHeight: interlineado.caption, fontWeight: peso.medio },
  duracion: {
    position: 'absolute', right: espaciado.e8, bottom: espaciado.e8,
    color: 'white', fontSize: tipografia.nota, lineHeight: interlineado.micro,
  },
});
