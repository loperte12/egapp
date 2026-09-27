/**
 * HotelCitySheet — la hoja para elegir la ciudad del alojamiento.
 *
 * POR QUÉ UNA HOJA CON LISTA Y NO UN CAMPO DE TEXTO. La búsqueda del servidor filtra por `city` y
 * compara por el nombre **exacto**. El campo de texto que había antes (`lifebook-hotel.tsx:205-214`)
 * mandaba lo tecleado tal cual, así que «Malab» devolvía **cero** alojamientos sin explicar por qué
 * —un vacío que parece «no hay hoteles» cuando en realidad es «está mal escrito»—. Eligiendo de la
 * lista de ciudades que el proyecto ya tiene (`LB_CITIES`, cabeceras de distrito y localidades con
 * contenido real), no se puede pedir una ciudad que no exista.
 *
 * Las ciudades NO se escriben aquí: se leen de `constants/lifebook.ts`, que es donde viven.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { alpha, espaciado, peso, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { Check, MapPin } from 'lucide-react-native';
import { Sheet, SheetHeader } from '../lifebook/ui/Sheet';
import { LB_CITIES } from '../../constants/lifebook';

export function HotelCitySheet({
  visible, onClose, ciudad, onElegir,
}: {
  visible: boolean;
  onClose: () => void;
  /** La ciudad elegida. Cadena vacía = «todas». */
  ciudad: string;
  onElegir: (ciudad: string) => void;
}) {
  const { colors } = useTheme();

  const fila = (valor: string, etiqueta: string, activo: boolean) => (
    <Pressable
      key={valor || 'todas'}
      onPress={() => { onElegir(valor); onClose(); }}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [styles.fila, {
        borderBottomColor: alpha(colors.border, 0.5),
        opacity: pressed ? 0.7 : 1,
      }]}
    >
      <MapPin size={17} color={activo ? colors.text.primary : colors.textSecondary} />
      <Text style={[styles.filaTxt, { color: activo ? colors.textPrimary : colors.textSecondary }]}>{etiqueta}</Text>
      {activo ? <Check size={17} color={colors.text.primary} /> : null}
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="¿Dónde buscas?" onClose={onClose} />
      <Text style={[styles.nota, { color: colors.textSecondary }]}>
        Estas son las ciudades que hay en la aplicación. Elige «Todas» para buscar en todo el país.
      </Text>
      <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
        {fila('', 'Todas las ciudades', ciudad === '')}
        {LB_CITIES.map((c) => fila(c, c, ciudad === c))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  nota: { fontSize: tipografia.caption, lineHeight: 18, marginBottom: espaciado.e10 },
  lista: { maxHeight: 360 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e4, borderBottomWidth: trazo.fino,
  },
  filaTxt: { flex: 1, fontSize: tipografia.body, fontWeight: peso.medio },
});
