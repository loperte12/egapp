/**
 * BuscarScreen — búsqueda estilo DiDi con geocoder local (calles/avenidas/POIs).
 *  · Input gigante con autofoco + resultados en vivo del geocoder.
 *  · Chips de atajos: 🏠 Casa · 💼 Trabajo · ✈️ Aeropuerto (guardados) ·
 *    📍 Mi ubicación · Ciudades.
 *  · Modo: ?mode=destino (por defecto) o ?mode=origen — la selección vuelve
 *    a Taxi vía geoPick (singleton) para fijar origen o destino.
 * Ruta: /buscar?city=Malabo&mode=destino
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text,
  TextInput, View, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Briefcase, Home, MapPin, Navigation, Plane, Search, X,
} from 'lucide-react-native';
import { CITIES, SERVICES, type City } from '../constants/data';
import { alpha } from '../constants/colors';
import { espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { geocode, type GeoPlace } from '../api/geocode';
import { setGeoPick } from '../state/geoPick';
import { brand } from '@egrouteplan/ui-kit';

type Suggestion =
  | { kind: 'place'; place: GeoPlace }
  | { kind: 'city'; city: City }
  | { kind: 'service'; id: string; label: string; route: string; emoji?: string }
  | { kind: 'origin'; label: string };

const SAVED_KEYS = {
  casa: 'geo.saved.home',
  trabajo: 'geo.saved.work',
  aeropuerto: 'geo.saved.airport',
} as const;

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const TITLE_CASE = (s: string) =>
  s.replace(/\b\w/g, (ch) => ch.toUpperCase());

const KIND_LABEL: Record<string, string> = { road: 'Calle / avenida', poi: 'Lugar' };

interface SavedPlace { label: string; lat: number; lon: number; }

export default function BuscarScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { city: originCity, mode } = useLocalSearchParams<{ city?: string; mode?: string }>();
  const isOriginMode = mode === 'origen';
  const inputRef = useRef<TextInput>(null);
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<Partial<Record<keyof typeof SAVED_KEYS, SavedPlace>>>({});

  // Cargar destinos guardados (casa/trabajo/aeropuerto).
  useEffect(() => {
    (async () => {
      const out: typeof saved = {};
      for (const key of Object.keys(SAVED_KEYS) as Array<keyof typeof SAVED_KEYS>) {
        try {
          const raw = await AsyncStorage.getItem(SAVED_KEYS[key]);
          if (raw) out[key] = JSON.parse(raw);
        } catch { /* ignore */ }
      }
      setSaved(out);
    })();
  }, []);

  // Geocoder en vivo con debounce suave.
  useEffect(() => {
    const query = q.trim();
    if (norm(query).length < 2) { setPlaces([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await geocode(query);
      setPlaces(r);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pickPlace = (place: GeoPlace, saveKey?: keyof typeof SAVED_KEYS) => {
    const label = TITLE_CASE(place.name);
    const coord = [place.lon, place.lat] as [number, number];
    if (saveKey) {
      const sp: SavedPlace = { label, lat: place.lat, lon: place.lon };
      AsyncStorage.setItem(SAVED_KEYS[saveKey], JSON.stringify(sp)).catch(() => {});
      setSaved((prev) => ({ ...prev, [saveKey]: sp }));
      Alert.alert('Guardado', `${label} guardado como ${saveKey === 'casa' ? 'Casa' : saveKey === 'trabajo' ? 'Trabajo' : 'Aeropuerto'}.`);
      return;
    }
    // Vuelve a Taxi con el punto elegido (origen o destino).
    setGeoPick({ mode: (isOriginMode ? 'origen' : 'destino') as never, coord, label, ts: Date.now() });
    router.back();
  };

  const staticSuggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];
    const query = norm(q.trim());
    if (originCity) out.push({ kind: 'origin', label: originCity });
    if (!query) {
      for (const city of CITIES.slice(0, 5)) out.push({ kind: 'city', city });
      return out;
    }
    const svc = SERVICES.find(
      (s) => !s.comingSoon && (norm(s.label).includes(query) || query.includes(norm(s.label))),
    );
    if (svc) out.push({ kind: 'service', id: svc.id, label: svc.label, route: svc.route });
    for (const city of CITIES) {
      if (norm(city.name).includes(query) || norm(city.region).includes(query)) {
        out.push({ kind: 'city', city });
        if (out.filter((o) => o.kind === 'city').length >= 8) break;
      }
    }
    return out;
  }, [q, originCity]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const withPlaces: Suggestion[] = places.map((place) => ({ kind: 'place', place }));
    return [...withPlaces, ...staticSuggestions];
  }, [places, staticSuggestions]);

  const goSaved = async (key: keyof typeof SAVED_KEYS) => {
    const sp = saved[key];
    if (!sp) {
      // Sin guardado: busca un lugar típico y sugiere guardarlo.
      const term = key === 'casa' ? 'residencial' : key === 'trabajo' ? 'empresa' : 'aeropuerto';
      const r = await geocode(term);
      if (r.length) {
        Alert.alert(
          `Elige tu ${key === 'casa' ? 'Casa' : key === 'trabajo' ? 'Trabajo' : 'Aeropuerto'}`,
          `Usamos "${TITLE_CASE(r[0].name)}". Toca un resultado para guardarlo como ${key === 'casa' ? 'Casa' : key === 'trabajo' ? 'Trabajo' : 'Aeropuerto'}.`,
          [{ text: 'OK' }],
        );
        setQ(r[0].name);
        setPlaces(r);
      }
      return;
    }
    setGeoPick({ mode: key as never, coord: [sp.lon, sp.lat], label: sp.label, ts: Date.now() });
    router.back();
  };

  const pick = (s: Suggestion) => {
    if (s.kind === 'place') { pickPlace(s.place); return; }
    if (s.kind === 'service') { router.push(s.route as never); return; }
    if (s.kind === 'origin') {
      setGeoPick({ mode: 'origen', coord: originCity ? [0, 0] : [0, 0], label: originCity ?? 'Mi ubicación', ts: Date.now() } as never);
      router.push({ pathname: '/taxi', params: { city: originCity ?? 'Malabo' } } as never);
      return;
    }
    router.push({ pathname: '/taxi', params: { city: s.city.name } } as never);
  };

  const renderRow = ({ item }: { item: Suggestion }) => {
    const c = colors;
    if (item.kind === 'place') {
      return (
        <Pressable
          onPress={() => pick(item)}
          accessibilityRole="button"
          accessibilityLabel={`${isOriginMode ? 'Origen' : 'Destino'}: ${item.place.name}`}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: alpha(c.primary, 0.12) }]}>
            <MapPin size={18} color={isOriginMode ? brand.success : brand.danger} />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>
              {TITLE_CASE(item.place.name)}
            </Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>
              {KIND_LABEL[item.place.kind] ?? 'Lugar'} · {item.place.lat.toFixed(4)}, {item.place.lon.toFixed(4)}
            </Text>
          </View>
        </Pressable>
      );
    }
    if (item.kind === 'service') {
      return (
        <Pressable
          onPress={() => pick(item)}
          accessibilityRole="button"
          accessibilityLabel={`Ir a ${item.label}`}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: alpha(c.secondary, 0.12) }]}>
            <Text style={{ fontSize: tipografia.cabecera }}>{item.emoji ?? '🔎'}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>{item.label}</Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>Abrir servicio</Text>
          </View>
        </Pressable>
      );
    }
    if (item.kind === 'origin') {
      return (
        <Pressable
          onPress={() => pick(item)}
          accessibilityRole="button"
          accessibilityLabel={`Desde mi ubicación: ${item.label}`}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: alpha(c.primary, 0.12) }]}>
            <MapPin size={18} color={brand.success} />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>{item.label} · Ubicación actual</Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>Salir desde aquí</Text>
          </View>
        </Pressable>
      );
    }
    const city = item.city;
    return (
      <Pressable
        onPress={() => pick(item)}
        accessibilityRole="button"
        accessibilityLabel={`Ir a ${city.name}, ${city.region}`}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: alpha(c.primary, 0.1) }]}>
          <Navigation size={18} color={c.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>{city.name}</Text>
          <Text style={[styles.rowSub, { color: c.textSecondary }]} numberOfLines={1}>{city.region}</Text>
        </View>
      </Pressable>
    );
  };

  const shortcutBtn = (key: keyof typeof SAVED_KEYS, label: string, Icon: any, color: string) => (
    <Pressable
      key={key}
      onPress={() => goSaved(key)}
      accessibilityRole="button"
      accessibilityLabel={`Atajo: ${label}`}
      style={({ pressed }) => [styles.shortcut, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: alpha(color, 0.14) }]}>
        <Icon size={19} color={color} />
      </View>
      <Text style={[styles.shortcutLabel, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            placeholder={isOriginMode ? '¿Dónde estás?' : originCity ? `¿A dónde vas en ${originCity}?` : '¿A dónde vas?'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary }]}
            returnKeyType="search"
            autoFocus
            autoCorrect={false}
            accessibilityLabel="Buscar dirección"
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : q.length > 0 ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Atajos rápidos (DiDi: casa/trabajo/aeropuerto con iconos) */}
      <View style={[styles.shortcuts, { borderBottomColor: colors.border }]}>
        {shortcutBtn('casa', saved.casa ? saved.casa.label.split(' ').slice(0, 2).join(' ') : 'Casa', Home, brand.success)}
        {shortcutBtn('trabajo', saved.trabajo ? saved.trabajo.label.split(' ').slice(0, 2).join(' ') : 'Trabajo', Briefcase, brand.primary)}
        {shortcutBtn('aeropuerto', 'Aeropuerto', Plane, brand.danger)}
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={(s, i) => `${s.kind}-${i}`}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {q.trim() ? 'Resultados' : 'Para ti'}
          </Text>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary, fontSize: tipografia.body }}>
            {searching ? 'Buscando…' : `Sin resultados para "${q}"`}
          </Text>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 },
  backBtn: { padding: espaciado.e4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderWidth: trazo.fino, borderRadius: 14, paddingHorizontal: espaciado.e12, height: 48,
  },
  input: { flex: 1, fontSize: tipografia.subtitle, fontWeight: peso.medio, paddingVertical: 0 },
  shortcuts: { flexDirection: 'row', gap: espaciado.e10, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth },
  shortcut: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaciado.e7, borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e9 },
  shortcutIcon: { width: 30, height: 30, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { fontSize: tipografia.caption, fontWeight: peso.maximo, flexShrink: 1 },
  sectionTitle: { fontSize: tipografia.caption, fontWeight: peso.maximo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: espaciado.e6, marginTop: espaciado.e8, marginLeft: espaciado.e4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingVertical: espaciado.e10 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: peso.fuerte },
  rowSub: { fontSize: tipografia.caption, marginTop: 1 },
});
