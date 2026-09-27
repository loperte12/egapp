/**
 * HotelGuestsSheet — la hoja de «cuántos van y en cuántas habitaciones».
 *
 * POR QUÉ UNA HOJA. En la referencia (Meituan) la ocupación es **una celda de la misma línea** que
 * las fechas —`1间·1成人`— y se toca para cambiarla. Antes esto eran dos bloques con contadores
 * siempre desplegados dentro del formulario, que es una de las razones por las que el buscador
 * ocupaba media pantalla antes de la primera tarjeta.
 *
 * Los dos contadores son los mismos que ya existían en la pantalla; se mudan aquí para que el
 * buscador pueda estar cerrado y la hoja abierta, sin duplicar el control.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { espaciado, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { Sheet, SheetHeader } from '../lifebook/ui/Sheet';

/** Los topes NO se inventan aquí: son los que ya usaba el buscador (20 huéspedes, 10 habitaciones). */
const MAX_HUESPEDES = 20;
const MAX_HABITACIONES = 10;

function Contador({
  etiqueta, ayuda, valor, min, max, onCambio,
}: {
  etiqueta: string; ayuda: string; valor: number; min: number; max: number;
  onCambio: (v: number) => void;
}) {
  const { colors } = useTheme();
  const boton = (texto: string, delta: number, deshabilitado: boolean) => (
    <Pressable
      onPress={() => !deshabilitado && onCambio(Math.min(max, Math.max(min, valor + delta)))}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'Añadir' : 'Quitar'} ${etiqueta}`}
      accessibilityState={{ disabled: deshabilitado }}
      style={[styles.boton, {
        borderColor: colors.border, backgroundColor: colors.surface, opacity: deshabilitado ? 0.35 : 1,
      }]}
    >
      <Text style={[styles.botonTxt, { color: colors.textPrimary }]}>{texto}</Text>
    </Pressable>
  );
  return (
    <View style={styles.fila}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.etq, { color: colors.textPrimary }]}>{etiqueta}</Text>
        <Text style={[styles.ayuda, { color: colors.textSecondary }]}>{ayuda}</Text>
      </View>
      <View style={styles.acciones}>
        {boton('−', -1, valor <= min)}
        <Text style={[styles.valor, { color: colors.textPrimary }]}>{valor}</Text>
        {boton('+', 1, valor >= max)}
      </View>
    </View>
  );
}

export function HotelGuestsSheet({
  visible, onClose, huespedes, habitaciones, onHuespedes, onHabitaciones,
}: {
  visible: boolean;
  onClose: () => void;
  huespedes: number;
  habitaciones: number;
  onHuespedes: (v: number) => void;
  onHabitaciones: (v: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="¿Quién viaja?" onClose={onClose} />
      <Contador
        etiqueta="Huéspedes"
        ayuda="Los que duermen. El hotel decide si un niño cuenta."
        valor={huespedes} min={1} max={MAX_HUESPEDES} onCambio={onHuespedes}
      />
      <Contador
        etiqueta="Habitaciones"
        ayuda="Cuántas necesitas. Cada una se cobra aparte."
        valor={habitaciones} min={1} max={MAX_HABITACIONES} onCambio={onHabitaciones}
      />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Listo"
        style={[styles.listo, { borderColor: colors.border }]}
      >
        <Text style={[styles.listoTxt, { color: colors.textPrimary }]}>Listo</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    paddingVertical: espaciado.e14, borderBottomWidth: trazo.fino,
  },
  etq: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  ayuda: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 },
  boton: { width: 36, height: 36, borderWidth: trazo.fino, borderRadius: radios.chip, alignItems: 'center', justifyContent: 'center' },
  botonTxt: { fontSize: tipografia.cabecera, fontWeight: peso.maximo, lineHeight: 20 },
  valor: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo, minWidth: 22, textAlign: 'center' },
  listo: {
    marginTop: espaciado.e16, borderWidth: trazo.fino, borderRadius: radios.md,
    paddingVertical: espaciado.e12, alignItems: 'center',
  },
  listoTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
});
