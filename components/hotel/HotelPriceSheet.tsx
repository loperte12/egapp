/**
 * HotelPriceSheet — la hoja del filtro de precio (por noche).
 *
 * POR QUÉ ES UN FILTRO DE PRIMER NIVEL. En la referencia el precio es una de las tres lentes con
 * las que se mira la lista (`价格·星级`), no un extra escondido. Y en este proyecto **ya funciona**:
 * el cliente manda `minPrice`/`maxPrice` desde hace tiempo (`api/hotel.ts:415-416`) y el servidor
 * los aplica. Lo único que faltaba era la interfaz.
 *
 * Se separan los valores que se ESCRIBEN de los que se APLICAN: si se buscara a cada tecla,
 * teclear «25000» lanzaría cinco búsquedas y la lista parpadearía. Igual que en
 * `/lifebook-hotel-resultados`, que es donde este patrón se probó primero.
 *
 * LO QUE NO TIENE: ordenación. `sort` **no existe** en el DTO de la búsqueda (responde 400), así que
 * no hay control de orden, ni aquí ni en la barra. Un mando que devuelve 400 es peor que no tenerlo.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormField, GhostButton, PrimaryButton, espaciado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { Sheet, SheetHeader } from '../lifebook/ui/Sheet';

export function HotelPriceSheet({
  visible, onClose, min, max, onAplicar, onQuitar,
}: {
  visible: boolean;
  onClose: () => void;
  min?: number;
  max?: number;
  onAplicar: (min?: number, max?: number) => void;
  onQuitar: () => void;
}) {
  const { colors } = useTheme();
  const [minTexto, setMinTexto] = useState('');
  const [maxTexto, setMaxTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Al abrir, los campos muestran lo que está aplicado (si no, el usuario no ve qué filtró).
  useEffect(() => {
    if (!visible) return;
    setMinTexto(min !== undefined ? String(min) : '');
    setMaxTexto(max !== undefined ? String(max) : '');
    setError(null);
  }, [visible, min, max]);

  const aplicar = () => {
    const nMin = minTexto.trim() ? Number(minTexto.replace(/[^0-9]/g, '')) : undefined;
    const nMax = maxTexto.trim() ? Number(maxTexto.replace(/[^0-9]/g, '')) : undefined;
    if (nMin !== undefined && !Number.isFinite(nMin)) { setError('El precio mínimo no es un número.'); return; }
    if (nMax !== undefined && !Number.isFinite(nMax)) { setError('El precio máximo no es un número.'); return; }
    if (nMin !== undefined && nMax !== undefined && nMin > nMax) {
      setError('El mínimo no puede ser mayor que el máximo.');
      return;
    }
    setError(null);
    onAplicar(nMin, nMax);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Precio por noche" onClose={onClose} />
      <View style={styles.par}>
        <View style={{ flex: 1 }}>
          <FormField
            label="Desde (XAF)" value={minTexto} onChangeText={setMinTexto}
            keyboardType="number-pad" placeholder="Sin mínimo"
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormField
            label="Hasta (XAF)" value={maxTexto} onChangeText={setMaxTexto}
            keyboardType="number-pad" placeholder="Sin tope"
          />
        </View>
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.text.danger }]}>{error}</Text>
      ) : null}
      <Text style={[styles.nota, { color: colors.textSecondary }]}>
        Es el precio por noche, antes de limpieza y tasas. Deja un campo vacío para no poner tope por
        ese lado.
      </Text>
      <View style={styles.botones}>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Aplicar" onPress={aplicar} />
        </View>
        <View style={{ flex: 1 }}>
          <GhostButton title="Quitar" onPress={() => { onQuitar(); onClose(); }} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  par: { flexDirection: 'row', gap: espaciado.e10 },
  error: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8 },
  nota: { fontSize: tipografia.caption, lineHeight: 18, marginTop: espaciado.e10 },
  botones: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12 },
});
