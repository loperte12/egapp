/**
 * Respuestas rápidas del vendedor (T1).
 *
 * DOS ALCANCES, como se pidió:
 *   · «Tienda» → la frase la ve TODO el equipo que atiende la tienda (compartida).
 *   · «Mía»    → solo la ve quien la escribe.
 *
 * El chat las ofrece como chips encima del compositor; tocar una pone su texto para enviarlo.
 * Aquí se crean y se borran. La lista la sirve el servidor (`/lifebook/commerce/merchant/quick-replies`),
 * que es quien decide de qué tienda es cada uno: el móvil no manda ningún identificador de tienda.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { espaciado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { respuestasRapidasApi, type LbRespuestaRapida } from '../api/commerce';

export default function RespuestasRapidasScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<LbRespuestaRapida[]>([]);
  const [shopName, setShopName] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [scope, setScope] = useState<'shop' | 'user'>('shop');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await respuestasRapidasApi.listar();
      setItems(Array.isArray(r.items) ? r.items : []);
      setShopName(r.shopName ?? null);
    } catch (e) {
      Alert.alert('Respuestas rápidas', e instanceof Error ? e.message : 'No se pudieron cargar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const agregar = async () => {
    const t = texto.trim();
    if (t.length < 2) return;
    setGuardando(true);
    try {
      await respuestasRapidasApi.guardar({ text: t, scope });
      setTexto('');
      await cargar();
    } catch (e) {
      Alert.alert('Respuestas rápidas', e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = (r: LbRespuestaRapida) => {
    Alert.alert('Borrar frase', '¿Quitar esta respuesta rápida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          try { await respuestasRapidasApi.borrar(r.id, r.scope); await cargar(); }
          catch (e) { Alert.alert('Respuestas rápidas', e instanceof Error ? e.message : 'No se pudo borrar.'); }
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
        <Text style={{ color: colors.text.primary, fontSize: tipografia.subtitle, fontWeight: '700' }}>Respuestas rápidas</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: espaciado.e12, gap: espaciado.e8 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption, lineHeight: 18 }}>
            {shopName
              ? `De ${shopName}: las frases «Tienda» las ve todo el equipo; «Mía» solo tú.`
              : 'Tus frases personales. Si tienes tienda, aquí también verás las compartidas.'}
          </Text>

          {cargando ? <ActivityIndicator color={colors.primary} /> : null}

          {items.map((r) => (
            <View key={r.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderRadius: 12,
              borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
              backgroundColor: colors.surface, padding: espaciado.e10,
            }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.text.primary, fontSize: tipografia.body }}>{r.text}</Text>
                <Text style={{ color: colors.text.secondary, fontSize: tipografia.nota }}>
                  {r.scope === 'shop' ? 'Tienda · compartida' : 'Mía · personal'}
                </Text>
              </View>
              <Pressable onPress={() => borrar(r)} hitSlop={8} accessibilityLabel="Borrar frase">
                <Trash2 size={18} color={colors.text.secondary} />
              </Pressable>
            </View>
          ))}

          {!cargando && !items.length ? (
            <Text style={{ color: colors.text.secondary, fontSize: tipografia.body }}>
              Todavía no hay frases. Añade la primera abajo.
            </Text>
          ) : null}
        </ScrollView>

        <View style={{
          padding: espaciado.e12, paddingBottom: insets.bottom + 12, gap: espaciado.e8,
          backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
        }}>
          <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>
            {(['shop', 'user'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setScope(s)}
                style={{
                  borderRadius: 999, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6,
                  backgroundColor: scope === s ? colors.primary : colors.surface,
                }}
              >
                <Text style={{ color: scope === s ? '#FFFFFF' : colors.text.primary, fontSize: tipografia.caption }}>
                  {s === 'shop' ? 'Tienda (compartida)' : 'Mía (personal)'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: espaciado.e8, alignItems: 'flex-end' }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Nueva frase…"
              placeholderTextColor={colors.text.secondary}
              maxLength={300}
              multiline
              style={{
                flex: 1, minHeight: 40, maxHeight: 110, borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
                backgroundColor: colors.surface, color: colors.text.primary,
                paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e8,
              }}
            />
            <Pressable
              onPress={() => { void agregar(); }}
              disabled={guardando || texto.trim().length < 2}
              style={{
                borderRadius: 12, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
                backgroundColor: colors.primary, opacity: guardando || texto.trim().length < 2 ? 0.5 : 1,
              }}
            >
              {guardando
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={{ color: '#FFFFFF', fontSize: tipografia.body, fontWeight: '700' }}>Añadir</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
