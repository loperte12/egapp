/**
 * LocationPickerSheet — Parte 24 (G2): compartir una UBICACIÓN en el chat.
 *
 * Dos caminos, como pidió el diseño:
 *  · **Mi ubicación** → GPS (`expo-location`) + el geocoder inverso real del
 *    mirror para poner el nombre de la calle o del lugar.
 *  · **Buscar sitio** → el mismo buscador de calles/avenidas/POIs que usa
 *    «Crear ruta» (`api/geocode.ts`), con resultados reales de Malabo y Bata.
 *
 * Devuelve `{ label, lat, lng }` y el chat lo envía como `kind='location'`
 * (el servidor valida el rango de las coordenadas y exige la etiqueta).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { Crosshair, MapPin, Radio, Search, X } from 'lucide-react-native';
import * as Location from 'expo-location';
import { geocode, pickReverseLabel, reverseGeocode, type GeoPlace } from '../../api/geocode';
import { LB_PLACE_KIND_LABEL } from '../../constants/lifebook';
import { formaHoja } from './ui/Sheet';

export interface LbPickedLocation {
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Envía la ubicación al chat (el padre la manda como mensaje `location`). */
  onSubmit: (loc: LbPickedLocation) => void;
  /** Compartir mi ubicación en vivo durante la ruta (Fase G4: aún no existe). */
  isGroup?: boolean;
  /** Título de la hoja (la quedada la reutiliza con otro texto). */
  title?: string;
  /** Texto del botón de GPS. */
  myLocationLabel?: string;
  /** Parte 28 (G4): compartir la ubicación EN VIVO durante la ruta. */
  onLive?: () => void;
}

export function LocationPickerSheet({ visible, onClose, onSubmit, title, myLocationLabel, onLive }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults(null); setError(null); }
  }, [visible]);

  /* ── Buscador real (geocoder del mirror, igual que en Crear ruta) ── */
  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 2) { setResults(null); setSearching(false); return; }
    const mine = ++seq.current;
    setSearching(true);
    try {
      const res = await geocode(t);
      if (mine === seq.current) setResults(res);
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => { runSearch(query); }, 350);
    return () => clearTimeout(t);
  }, [query, runSearch, visible]);

  /** Mi ubicación: GPS + nombre real del punto (calle o lugar más cercano). */
  const useMyLocation = async () => {
    setError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Necesito permiso de ubicación para compartir dónde estás.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = Number(pos.coords.latitude);
      const lng = Number(pos.coords.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError('No pude leer tu posición. Prueba a buscar el sitio por su nombre.');
        return;
      }
      const rev = await reverseGeocode(lng, lat).catch(() => []);
      const name = pickReverseLabel(rev) ?? rev[0]?.name ?? null;
      const label = name ? `Mi ubicación · ${name}` : `Mi ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      onSubmit({ label, lat, lng });
    } catch {
      setError('No pude obtener tu ubicación. Busca el sitio por su nombre.');
    } finally {
      setLocating(false);
    }
  };

  const pick = (p: GeoPlace) => {
    const label = String(p.name ?? '').trim() || 'Ubicación compartida';
    onSubmit({ label, lat: Number(p.lat), lng: Number(p.lon) });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', flex: 1 }}>
            {title ?? 'Compartir ubicación'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={useMyLocation}
          disabled={locating}
          accessibilityLabel="Compartir mi ubicación actual"
          style={({ pressed }) => [styles.myLoc, {
            backgroundColor: alpha(colors.primary, 0.10),
            borderColor: alpha(colors.primary, 0.28),
            opacity: pressed || locating ? 0.75 : 1,
          }]}
        >
          {locating
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Crosshair size={20} color={colors.primary} />}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>
              {locating ? 'Buscando tu posición…' : (myLocationLabel ?? 'Mi ubicación actual')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              Con el nombre real de la calle o del lugar.
            </Text>
          </View>
        </Pressable>

        {/* Parte 28 (G4): ubicación en vivo durante la ruta */}
        {onLive ? (
          <Pressable
            onPress={onLive}
            accessibilityLabel="Compartir mi ubicación en vivo durante la ruta"
            style={({ pressed }) => [styles.myLoc, {
              backgroundColor: alpha(colors.secondary, 0.10),
              borderColor: alpha(colors.secondary, 0.28),
              opacity: pressed ? 0.75 : 1,
            }]}
          >
            <Radio size={20} color={colors.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Ubicación en vivo</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                Se actualiza sola durante la ruta; la puedes parar cuando quieras.
              </Text>
            </View>
          </Pressable>
        ) : null}

        <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar calle, avenida o sitio…"
            placeholderTextColor={colors.textSecondary}
            style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body }}
            accessibilityLabel="Buscar un sitio"
          />
          {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        {error ? (
          <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>{error}</Text>
        ) : null}

        {results === null && query.trim().length < 2 ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingVertical: espaciado.e16 }}>
            Escribe al menos 2 letras: busca calles, avenidas y sitios reales de Malabo y Bata.
          </Text>
        ) : null}

        {results !== null && results.length === 0 && !searching ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', paddingVertical: espaciado.e18 }}>
            No hay sitios que coincidan. Prueba con el nombre de la calle.
          </Text>
        ) : null}

        {(results ?? []).length > 0 ? (
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {(results ?? []).map((r, i) => (
              <Pressable
                key={`${r.name}-${i}`}
                onPress={() => pick(r)}
                accessibilityLabel={`Compartir ${r.name}`}
                style={({ pressed }) => [styles.row, {
                  borderBottomColor: alpha(colors.border, 0.5),
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MapPin size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: '700', fontSize: tipografia.body }}>{r.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                    {LB_PLACE_KIND_LABEL[r.kind] ?? 'Lugar'} · {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e12 },
  myLoc: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderWidth: 1, borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e12,
  },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e11, borderBottomWidth: StyleSheet.hairlineWidth },
});
