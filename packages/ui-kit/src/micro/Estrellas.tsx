/**
 * ESTRELLAS — valoración con estrellas, en cascada.
 *
 * DE DÓNDE VIENE
 * Del efecto «peek-rating» de React Bits (web). Reescrito con Reanimated.
 *
 * QUÉ SUSTITUYE (y por qué importa)
 * El mismo control está escrito **cuatro veces** en cuatro flujos distintos, y ninguno anima:
 *   · `app/ecomerse-orders.tsx:517-524` — el selector (estrella de 34, `brand.warning`)
 *   · `app/food-orders.tsx:757-761` — el selector de comida (32)
 *   · `app/taxi.tsx:1845-1856` — el del viaje (34)
 *   · `app/lifebook-hotel-perfil.tsx:249-259` — las píldoras del hotel
 * Y una quinta de solo lectura: `app/conductor.tsx:1401-1402` (11 px, apagada).
 * No es un control cualquiera: **es el gesto que decide la reputación del conductor, del restaurante y
 * del vendedor.**
 *
 * LA CASCADA ES LO QUE APORTA, no el adorno
 * Al elegir la 3.ª, las tres primeras se encienden **en orden, con 40 ms entre una y otra**. Eso hace
 * que el ojo cuente cuántas has puesto. Hoy el problema es real: `ecomerse-orders.tsx:214` tiene que
 * avisar con un `Alert` si la valoración es menor que 1, porque el usuario no se entera de lo que ha
 * elegido. La cascada resuelve eso sin añadir texto.
 *
 * POR QUÉ HAY UN SOLO VALOR COMPARTIDO Y NO CINCO
 * La forma evidente sería un `useSharedValue` por estrella dentro de un `map`. **Eso está mal**: son
 * hooks, y llamarlos dentro de un bucle rompe las reglas de React (y el número de estrellas puede
 * cambiar). Así que el progreso de todas vive en **un solo array de números** en un único valor
 * compartido, y cada estrella se lee de su casilla con `useAnimatedStyle`. Un hook, cinco lecturas.
 *
 * ACCESIBILIDAD (lo que la auditoría exigió)
 *   · `role="radio"` por estrella y `state.selected`, como ya se hacía bien en `food-orders.tsx:760`.
 *   · **Zonas de toque que NO se pisan.** El fallo encontrado: `food-orders.tsx:756-763` usa `gap: 6`
 *     con `hitSlop={4}` → 8 px de área sobre 6 de hueco, **se solapan** y el toque es ambiguo. Aquí la
 *     separación es de 8 px y el `hitSlop` solo se agranda cuando la estrella es pequeña.
 *   · **El color no es la única señal**: el relleno cambia y el texto de al lado dice el número.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Star } from 'lucide-react-native';

import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/colors';
import { espaciado, peso, tipografia, trazoIcono} from '../theme/escalas';
import { curva, duracion, resorte } from '../theme/movimiento';
import { haptico } from '../feedback/hapticos';
import { useMovimientoReducido } from '../a11y/useMovimientoReducido';

/** Retardo entre una estrella y la siguiente de la cascada. */
const PASO_CASCADA = 40;

export type EstrellasProps = {
  /** Cuántas estrellas hay puestas (0 = ninguna). */
  valor: number;
  /** Se llama con la estrella elegida. */
  onElegir: (n: number) => void;
  /** Cuántas estrellas como máximo. Cinco por defecto. */
  total?: number;
  /** Tamaño de cada estrella. */
  tamano?: number;
  /** Si es `false`, solo se lee (para mostrar una valoración ya dada). */
  interactivo?: boolean;
  /** Texto bajo las estrellas. Si no se pasa, no se pinta. */
  texto?: string;
  /** Nombre de lo que se valora, para el lector de pantalla («Valorar a Juan»). */
  queSeValora?: string;
};

export function Estrellas({
  valor,
  onElegir,
  total = 5,
  tamano = 32,
  interactivo = true,
  texto,
  queSeValora,
}: EstrellasProps) {
  const { colors } = useTheme();
  const movReducido = useMovimientoReducido();

  /* UN solo valor compartido con la escala de cada estrella. Ver la cabecera: un hook por estrella
     dentro de un `map` rompería las reglas de React. */
  const escalas = useSharedValue<number[]>(new Array(total).fill(1));

  const alElegir = (n: number) => {
    if (!interactivo) return;
    if (!movReducido) {
      /* La cascada: cada estrella hasta la elegida rebota con PASO_CASCADA de retardo sobre la
         anterior; las demás vuelven a su sitio. Se reconstruye el array entero (no se muta) porque un
         valor compartido solo se anima si se le ASIGNA algo nuevo. */
      const siguiente = new Array(total).fill(1).map((_, i) => {
        if (i >= n) return withTiming(1, { duration: duracion.cambio, easing: curva.salida });
        return withSequence(
          withDelay(i * PASO_CASCADA, withSpring(1.2, resorte.rebotar)),
          withSpring(1, resorte.asentar),
        );
      });
      escalas.value = siguiente;
    }
    haptico('toque');
    onElegir(n);
  };

  return (
    <View
      accessibilityRole={interactivo ? 'radiogroup' : 'none'}
      accessibilityLabel={queSeValora ? `Valorar ${queSeValora}` : undefined}
      style={estilos.caja}
    >
      <View style={estilos.fila}>
        {Array.from({ length: total }, (_, i) => (
          <Estrella
            key={i}
            indice={i}
            total={total}
            puesta={valor >= i + 1}
            escalas={escalas}
            tamano={tamano}
            interactivo={interactivo}
            movReducido={movReducido}
            colorPuesta={brand.warning}
            colorApagada={colors.border}
            queSeValora={queSeValora}
            onElegir={alElegir}
          />
        ))}
      </View>
      {texto ? (
        <Text style={[estilos.texto, { color: colors.textSecondary }]} numberOfLines={2}>
          {texto}
        </Text>
      ) : null}
    </View>
  );
}

function Estrella({
  indice,
  total,
  puesta,
  escalas,
  tamano,
  interactivo,
  movReducido,
  colorPuesta,
  colorApagada,
  queSeValora,
  onElegir,
}: {
  indice: number;
  total: number;
  puesta: boolean;
  escalas: { value: number[] };
  tamano: number;
  interactivo: boolean;
  movReducido: boolean;
  colorPuesta: string;
  colorApagada: string;
  queSeValora?: string;
  onElegir: (n: number) => void;
}) {
  const n = indice + 1;

  /* Cada estrella se lee de SU casilla del array. El rebote se dispara cambiando el array desde el
     padre, así que aquí solo se traduce a un `scale`. */
  const estilo = useAnimatedStyle(() => {
    const v = escalas.value[indice];
    return { transform: [{ scale: typeof v === 'number' ? v : 1 }] };
  });

  return (
    <Pressable
      onPress={() => onElegir(n)}
      disabled={!interactivo}
      /* El área táctil: si la estrella es pequeña se agranda SIN invadir la vecina (separación de 8,
         hitSlop de 4). Es el fallo que la auditoría encontró y aquí no se repite. */
      hitSlop={tamano >= 32 ? 0 : espaciado.e4}
      accessibilityRole={interactivo ? 'radio' : 'image'}
      accessibilityState={interactivo ? { selected: puesta } : undefined}
      accessibilityLabel={
        interactivo
          ? `${n} de ${total}${queSeValora ? `, valorar ${queSeValora}` : ''}`
          : `${n} de ${total} estrellas`
      }
    >
      <Animated.View style={estilo}>
        <Star
          size={tamano}
          color={puesta ? colorPuesta : colorApagada}
          fill={puesta ? colorPuesta : 'transparent'}
          strokeWidth={trazoIcono.base}
        />
      </Animated.View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  caja: { alignItems: 'flex-start' },
  /* La separación es de 8 y no de 6 a propósito: es el hueco mínimo entre objetivos que pide la guía
     de plataforma, y es lo que permite agrandar el área táctil sin pisar la estrella vecina. */
  fila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  texto: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e4 },
});
