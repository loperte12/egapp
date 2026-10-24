/**
 * Mis direcciones de entrega — libreta PROPIA de LifeBook (T13).
 *
 * Por qué existe: el checkout pedía ciudad + barrio + referencia en cada compra y no lo guardaba.
 * Aquí se guardan, se editan y una —y solo una— es la **predeterminada**; el checkout la propone
 * sola. La regla la garantiza la BASE (índice único parcial `uq_lb_addr_default`), no esta pantalla.
 *
 * GUINEA ECUATORIAL: no hay código postal. **Barrio** y **referencia** («frente a la farmacia»,
 * «portón azul») son obligatorios; provincia y municipio se piden pero no bloquean. El mapa está en
 * curso, así que no se exige pin. El destinatario puede ser otra persona (regalo/familia).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, MapPin, Pencil, Trash2 } from 'lucide-react-native';
import { espaciado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { direccionesApi, type LbDireccion } from '../api/commerce';
import { LB_CITIES } from '../constants/lifebook';

const ETIQUETAS = ['Casa', 'Trabajo', 'Familia', 'Otro'] as const;

export default function DireccionesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<LbDireccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<LbDireccion | null>(null);

  const [label, setLabel] = useState<string>('Casa');
  const [receiverName, setReceiverName] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [municipality, setMunicipality] = useState('Malabo');
  const [neighborhood, setNeighborhood] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await direccionesApi.listar();
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch (e) {
      Alert.alert('Direcciones', e instanceof Error ? e.message : 'No se pudieron cargar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const limpiar = () => {
    setEditando(null);
    setLabel('Casa');
    setReceiverName('');
    setPhone('');
    setProvince('');
    setMunicipality('Malabo');
    setNeighborhood('');
    setReference('');
    setNotes('');
  };

  const abrir = (d: LbDireccion) => {
    setEditando(d);
    setLabel(d.label ?? '');
    setReceiverName(d.receiverName);
    setPhone(d.phone ?? '');
    setProvince(d.province ?? '');
    setMunicipality(d.municipality ?? '');
    setNeighborhood(d.neighborhood);
    setReference(d.reference);
    setNotes(d.notes ?? '');
  };

  const guardar = async () => {
    if (receiverName.trim().length < 2 || neighborhood.trim().length < 2 || reference.trim().length < 3) {
      Alert.alert('Dirección', 'Hacen falta: nombre de quien recibe, barrio y una referencia.');
      return;
    }
    setGuardando(true);
    try {
      const cuerpo = {
        label: label.trim() || null,
        receiverName: receiverName.trim(),
        phone: phone.trim() || null,
        province: province.trim() || null,
        municipality: municipality.trim() || null,
        neighborhood: neighborhood.trim(),
        reference: reference.trim(),
        notes: notes.trim() || null,
      };
      if (editando) await direccionesApi.actualizar(editando.id, cuerpo);
      else await direccionesApi.crear(cuerpo);
      limpiar();
      await cargar();
    } catch (e) {
      Alert.alert('Dirección', e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const predeterminar = async (d: LbDireccion) => {
    try { await direccionesApi.predeterminar(d.id); await cargar(); }
    catch (e) { Alert.alert('Dirección', e instanceof Error ? e.message : 'No se pudo marcar.'); }
  };

  const borrar = (d: LbDireccion) => {
    Alert.alert('Borrar dirección', '¿Quitar esta dirección de tu libreta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          try { await direccionesApi.borrar(d.id); await cargar(); }
          catch (e) { Alert.alert('Dirección', e instanceof Error ? e.message : 'No se pudo borrar.'); }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{
        paddingTop: insets.top + 8, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8,
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
        backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={{ color: colors.text.primary, fontSize: tipografia.subtitle, fontWeight: '700' }}>Mis direcciones</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: espaciado.e12, gap: espaciado.e10 }} keyboardShouldPersistTaps="handled">
          {cargando ? <ActivityIndicator color={colors.primary} /> : null}

          {items.map((d) => (
            <View key={d.id} style={{
              borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
              borderColor: d.isDefault ? colors.primary : colors.border,
              backgroundColor: colors.surface, padding: espaciado.e10, gap: espaciado.e6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                <MapPin size={16} color={colors.primary} />
                <Text style={{ color: colors.text.primary, fontSize: tipografia.body, fontWeight: '700', flex: 1 }}>
                  {(d.label ?? 'Dirección') + (d.isDefault ? ' · predeterminada' : '')}
                </Text>
                {d.isDefault ? <Check size={16} color={colors.primary} /> : null}
              </View>
              <Text style={{ color: colors.text.primary, fontSize: tipografia.body }}>{d.receiverName}</Text>
              <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption }}>{d.line}</Text>
              {d.phone ? <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption }}>{d.phone}</Text> : null}
              <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e4 }}>
                {!d.isDefault ? (
                  <Pressable onPress={() => predeterminar(d)} accessibilityLabel="Marcar como predeterminada">
                    <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '700' }}>Predeterminada</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => abrir(d)} accessibilityLabel="Editar dirección">
                  <Pencil size={16} color={colors.text.secondary} />
                </Pressable>
                <Pressable onPress={() => borrar(d)} accessibilityLabel="Borrar dirección">
                  <Trash2 size={16} color={colors.text.secondary} />
                </Pressable>
              </View>
            </View>
          ))}

          <View style={{
            borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            backgroundColor: colors.card, padding: espaciado.e12, gap: espaciado.e8,
          }}>
            <Text style={{ color: colors.text.primary, fontSize: tipografia.body, fontWeight: '700' }}>
              {editando ? 'Editar dirección' : 'Nueva dirección'}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
              {ETIQUETAS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setLabel(t)}
                  style={{
                    borderRadius: 999, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6,
                    backgroundColor: label === t ? colors.primary : colors.surface,
                  }}
                >
                  <Text style={{ color: label === t ? '#FFFFFF' : colors.text.primary, fontSize: tipografia.caption }}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput value={receiverName} onChangeText={setReceiverName} placeholder="Nombre de quien recibe" placeholderTextColor={colors.text.secondary} maxLength={80} style={campo(colors)} />
            <TextInput value={phone} onChangeText={setPhone} placeholder="Teléfono (+240…)" placeholderTextColor={colors.text.secondary} keyboardType="phone-pad" maxLength={16} style={campo(colors)} />
            <TextInput value={municipality} onChangeText={setMunicipality} placeholder="Municipio (Malabo, Bata…)" placeholderTextColor={colors.text.secondary} maxLength={60} style={campo(colors)} />
            <TextInput value={province} onChangeText={setProvince} placeholder="Provincia (opcional)" placeholderTextColor={colors.text.secondary} maxLength={60} style={campo(colors)} />
            <TextInput value={neighborhood} onChangeText={setNeighborhood} placeholder="Barrio (Ej: Ela Nguema)" placeholderTextColor={colors.text.secondary} maxLength={120} style={campo(colors)} />
            <TextInput value={reference} onChangeText={setReference} placeholder="Referencia (frente a la farmacia, portón azul…)" placeholderTextColor={colors.text.secondary} maxLength={200} style={campo(colors)} />
            <TextInput value={notes} onChangeText={setNotes} placeholder="Notas para el repartidor (opcional)" placeholderTextColor={colors.text.secondary} maxLength={200} style={campo(colors)} />

            <View style={{ flexDirection: 'row', gap: espaciado.e8, alignItems: 'center' }}>
              <Pressable
                onPress={() => { void guardar(); }}
                disabled={guardando}
                style={{
                  borderRadius: 12, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
                  backgroundColor: colors.primary, opacity: guardando ? 0.5 : 1,
                }}
              >
                {guardando
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={{ color: '#FFFFFF', fontSize: tipografia.body, fontWeight: '700' }}>{editando ? 'Guardar cambios' : 'Añadir dirección'}</Text>}
              </Pressable>
              {editando ? (
                <Pressable onPress={limpiar} accessibilityLabel="Cancelar edición">
                  <Text style={{ color: colors.text.secondary, fontSize: tipografia.body }}>Cancelar</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={{ color: colors.text.secondary, fontSize: tipografia.nota }}>
              Ciudades disponibles: {LB_CITIES.slice(0, 4).join(' · ')}…
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const campo = (colors: ReturnType<typeof useTheme>['colors']) => ({
  borderRadius: 12,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  color: colors.text.primary,
  paddingHorizontal: espaciado.e10,
  paddingVertical: espaciado.e8,
  fontSize: tipografia.body,
});
