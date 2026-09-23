/**
 * SEGMENTADO — control de opciones en fila, con el indicador que se desliza.
 *
 * DE DÓNDE VIENE
 * Del efecto «rubber-segment» de React Bits, que es web (CSS + Framer Motion). Aquí está reescrito
 * con Reanimated. El efecto ya se había prototipado en `app/banco-1-pastilla.tsx`, midiendo las filas
 * reales de la app (las pestañas de Seguido y el selector de orden del Mercado). Esto lo trae al kit
 * y lo limpia: el prototipo hacía **una pastilla que se llenaba desde abajo** (un círculo inscrito que
 * crecía), y eso vale para un botón suelto, pero en una fila de opciones lo correcto es que el
 * **indicador se deslice** de una opción a otra. Es lo que el ojo espera cuando elige entre hermanas.
 *
 * QUÉ SUSTITUYE (y por eso vale la pena)
 * La app tiene **tres** formas distintas de elegir en fila, cada una con su estilo:
 *   · `app/ecomerse-orders.tsx:249-258` (Compras/Ventas) y `:264-289` (filtros con contador)
 *   · `app/ecomerse.tsx:302-327` («Ordenar por»)
 *   · `app/ecomerse-favorites.tsx:118-125` (pestañas de Seguido)
 * Las tres miden `height: 36` y cambian de color de golpe, sin transición.
 *
 * ACCESIBILIDAD (lo que la auditoría exigió, y es obligatorio)
 *   · El grupo es `tablist` y cada opción `tab` con `accessibilityState={{ selected }}`. Ya se hacía
 *     así en el prototipo y en las pantallas, así que no se pierde nada.
 *   · **La información no depende del movimiento**: el color de la etiqueta y el relleno del
 *     indicador cambian igual con movimiento reducido. Solo se quita el deslizamiento.
 *   · El indicador lleva `pointerEvents="none"`: es decoración y no debe robar toques.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';
import { altura, radios, tipografia, peso } from '../theme/escalas';
import { curva, duracion } from '../theme/movimiento';
import { haptico } from '../feedback/hapticos';
import { useMovimientoReducido } from '../a11y/useMovimientoReducido';

export type SegmentoOpcion = {
  /** Identificador estable. Es el valor que se devuelve al elegir. */
  id: string;
  /** Lo que se lee. */
  etiqueta: string;
  /** Cuántos hay detrás, si procede (un filtro con resultados). Se pinta entre paréntesis. */
  cuenta?: number;
};

export type SegmentadoProps = {
  opciones: SegmentoOpcion[];
  valor: string;
  onCambio: (id: string) => void;
  /** Nombre del grupo para el lector de pantalla. Obligatorio: un grupo sin nombre no se entiende. */
  etiqueta: string;
  /** Vibración al cambiar. Por defecto sí; se puede apagar. */
  vibracion?: boolean;
  /** Si es `false`, no se puede interactuar (p. ej. mientras carga). */
  habilitado?: boolean;
};

export function Segmentado({
  opciones,
  valor,
  onCambio,
  etiqueta,
  vibracion = true,
  habilitado = true,
}: SegmentadoProps) {
  const { colors } = useTheme();
  const movReducido = useMovimientoReducido();
  /* Ancho real de la fila. Hace falta para saber cuánto mide cada segmento: se reparten a partes
     iguales, así que con el ancho total y cuántos hay ya se sabe dónde va el indicador. */
  const [anchoFila, setAnchoFila] = useState(0);
  const indice = Math.max(0, opciones.findIndex((o) => o.id === valor));
  const anchoSegmento = opciones.length > 0 && anchoFila > 0 ? anchoFila / opciones.length : 0;

  /* Posición del indicador. Se anima con `translateX`, que va en la GPU: nunca se anima `left` ni
     `width` (la auditoría encontró un caso de animar `width` en `conductor.tsx:1376` y no se repite). */
  const x = useSharedValue(0);

  const alMedir = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== anchoFila) setAnchoFila(w);
  };

  const alElegir = (id: string, i: number) => {
    if (!habilitado || id === valor) return;
    const destino = anchoSegmento * i;
    /* Con movimiento reducido el indicador SALTA a su sitio: no se queda a medias ni desaparece.
       Lo que se quita es el viaje, no el resultado. */
    x.value = movReducido
      ? destino
      : withTiming(destino, { duration: duracion.cambio, easing: curva.salida });
    if (vibracion) haptico('toque');
    onCambio(id);
  };

  const estiloIndicador = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      onLayout={alMedir}
      accessibilityRole="tablist"
      accessibilityLabel={etiqueta}
      style={[estilos.fila, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* El indicador va detrás del texto y no captura toques. */}
      {anchoSegmento > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            estilos.indicador,
            { width: anchoSegmento, backgroundColor: colors.primary },
            estiloIndicador,
          ]}
        />
      ) : null}

      {opciones.map((o, i) => {
        const activo = o.id === valor;
        return (
          <Pressable
            key={o.id}
            onPress={() => alElegir(o.id, i)}
            disabled={!habilitado}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo, disabled: !habilitado }}
            accessibilityLabel={o.cuenta !== undefined ? `${o.etiqueta}, ${o.cuenta}` : o.etiqueta}
            style={estilos.segmento}
          >
            <Text
              numberOfLines={1}
              style={[
                estilos.texto,
                /* El color dice el estado por sí solo. Con movimiento reducido esto es lo ÚNICO que
                   cambia, y por eso tiene que ser inconfundible. */
                { color: activo ? colors.card : colors.textSecondary },
              ]}
            >
              {o.cuenta !== undefined ? `${o.etiqueta} (${o.cuenta})` : o.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    height: altura.control,
    borderRadius: radios.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  indicador: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radios.sm,
  },
  segmento: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  texto: {
    fontSize: tipografia.caption,
    fontWeight: peso.fuerte,
  },
});
