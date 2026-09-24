/**
 * components/lifebook/RuletaVertical.tsx — la RULETA de una medida (tanda L).
 *
 * POR QUÉ UNA RULETA Y NO UN CAMPO DE TEXTO. El dueño lo pidió así («ruletas verticales») y es lo
 * que usan las apps de comercio para medidas: elegir «168 cm» deslizando es más rápido y menos
 * propenso a errores que teclear tres números en un móvil. Además, al ser una lista cerrada, es
 * **imposible** mandar un pecho de 900 cm: el servidor lo rechazaría, y aquí ni se puede elegir.
 *
 * ── EL FALLO QUE HUBO QUE ARREGLAR (medido en el Poco F5) ─────────────────────────────────────
 * La primera versión NO DEJABA ELEGIR: la ruleta es un `ScrollView` vertical metido dentro del
 * `ScrollView` del asistente, y en Android **el de fuera se come el gesto**, así que el de dentro no
 * se movía nunca y la medida no cambiaba. Tres arreglos, para que no vuelva a pasar:
 *   1. `nestedScrollEnabled` en los dos scrolls: es lo que permite que un scroll vertical anidado
 *      funcione en Android.
 *   2. **Tocar un valor lo elige** (y la ruleta se centra en él). Con el dedo o sin él, siempre hay
 *      una forma de seleccionar que no depende de acertar con el gesto.
 *   3. El centrado inicial se hace cuando la ruleta ya tiene tamaño (`onLayout`), no con un
 *      temporizador que podía dispararse antes de que hubiera nada que desplazar.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { alpha, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';

const ALTO_FILA = 40;
const FILAS_VISIBLES = 5;
const ALTO = ALTO_FILA * FILAS_VISIBLES;

export default function RuletaVertical({
  etiqueta, sufijo, valores, valor, onChange, ancho = 96, onArrastre,
}: {
  etiqueta: string;
  sufijo?: string;
  valores: number[];
  valor: number;
  onChange: (v: number) => void;
  ancho?: number;
  /** Avisa al padre de si se está deslizando la ruleta (para no mover el panel a la vez). */
  onArrastre?: (activo: boolean) => void;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  const listo = useRef(false);

  /** Centra la ruleta en el valor elegido (al abrir con medidas guardadas, y si cambia desde fuera). */
  const centrar = (animado: boolean) => {
    const i = Math.max(0, valores.indexOf(valor));
    ref.current?.scrollTo({ y: i * ALTO_FILA, animated: animado });
  };
  useEffect(() => {
    if (listo.current) centrar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  const fijar = (y: number) => {
    const i = Math.min(valores.length - 1, Math.max(0, Math.round(y / ALTO_FILA)));
    const v = valores[i];
    if (v !== undefined && v !== valor) onChange(v);
  };

  return (
    <View style={{ width: ancho, alignItems: 'center' }}>
      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: '700', marginBottom: espaciado.e4, textAlign: 'center' }}>
        {etiqueta}
      </Text>
      <View style={[styles.caja, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.surface }]}>
        {/* La banda de la fila que cuenta (la del centro). */}
        <View
          pointerEvents="none"
          style={[styles.banda, { top: ALTO_FILA * 2, borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) }]}
        />
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ALTO_FILA}
          decelerationRate="fast"
          /* Android: sin esto, el scroll de fuera se come el gesto y la ruleta no se mueve. */
          nestedScrollEnabled
          onLayout={() => { if (!listo.current) { listo.current = true; centrar(false); } }}
          onTouchStart={() => onArrastre?.(true)}
          onTouchEnd={() => onArrastre?.(false)}
          onTouchCancel={() => onArrastre?.(false)}
          onScrollBeginDrag={() => onArrastre?.(true)}
          onMomentumScrollEnd={(e) => { fijar(e.nativeEvent.contentOffset.y); onArrastre?.(false); }}
          onScrollEndDrag={(e) => { fijar(e.nativeEvent.contentOffset.y); onArrastre?.(false); }}
          contentContainerStyle={{ paddingVertical: ALTO_FILA * 2 }}
        >
          {valores.map((v, i) => {
            const activo = v === valor;
            return (
              <Pressable
                key={v}
                /* Tocar un valor lo elige: siempre hay una forma de seleccionar sin depender del gesto. */
                onPress={() => { onChange(v); ref.current?.scrollTo({ y: i * ALTO_FILA, animated: true }); }}
                accessibilityLabel={`${etiqueta} ${v}${sufijo ? ` ${sufijo}` : ''}`}
                accessibilityState={{ selected: activo }}
                style={{ height: ALTO_FILA, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{
                  color: activo ? colors.primary : colors.textSecondary,
                  fontSize: activo ? 16 : 14,
                  fontWeight: activo ? '900' : '600',
                }}>
                  {v}{sufijo ? ` ${sufijo}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

/** Los valores de una medida, del mínimo al máximo (valores redondos, como los de una cinta métrica). */
export function rango(min: number, max: number, paso = 1): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v += paso) out.push(v);
  return out;
}

const styles = StyleSheet.create({
  caja: { width: '100%', height: ALTO, borderWidth: 1, borderRadius: radios.md, overflow: 'hidden' },
  banda: {
    position: 'absolute', left: 0, right: 0, height: ALTO_FILA,
    borderTopWidth: 1, borderBottomWidth: 1, zIndex: 1,
  },
});
