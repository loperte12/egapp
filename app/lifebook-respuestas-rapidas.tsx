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
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { espaciado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { commerceApi, respuestasRapidasApi, type LbRespuestaRapida } from '../api/commerce';
import { messagesApi } from '../api/messages';

type TipoRespuesta = 'text' | 'product' | 'group';
interface Ref { id: string; label: string; iconUrl: string | null; }

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
  /** T1b: tipo y destino (texto · producto · grupo) + palabras clave. */
  const [tipo, setTipo] = useState<TipoRespuesta>('text');
  const [refs, setRefs] = useState<Ref[]>([]);
  const [refId, setRefId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState('');

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

  /** T1b: carga los destinos posibles según el tipo (mis productos · mis grupos). */
  useEffect(() => {
    let vivo = true;
    const cargarRefs = async () => {
      if (tipo === 'text') { setRefs([]); setRefId(null); return; }
      try {
        if (tipo === 'product') {
          const r = await commerceApi.myProducts();
          if (!vivo) return;
          setRefs((r.items ?? []).map((p) => ({ id: p.id, label: p.title, iconUrl: p.coverUrl ?? null })));
        } else {
          const r = await messagesApi.conversations();
          if (!vivo) return;
          setRefs((r.conversations ?? [])
            .filter((c) => c.kind === 'group')
            .map((c) => ({ id: c.id, label: c.title?.trim() || 'Grupo', iconUrl: c.photoUrl ?? null })));
        }
      } catch { if (vivo) setRefs([]); }
    };
    void cargarRefs();
    return () => { vivo = false; };
  }, [tipo]);

  const agregar = async () => {
    const t = texto.trim();
    const etiqueta = refs.find((x) => x.id === refId)?.label ?? '';
    if (tipo === 'text' ? t.length < 2 : !refId) return;
    setGuardando(true);
    try {
      await respuestasRapidasApi.guardar({
        text: t || etiqueta || 'Respuesta',
        scope,
        kind: tipo,
        refId: tipo === 'text' ? null : refId,
        iconUrl: refs.find((x) => x.id === refId)?.iconUrl ?? null,
        keywords: keywords.trim() || null,
      });
      setTexto(''); setRefId(null); setKeywords('');
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
              <View style={{ flex: 1, gap: 4, flexDirection: 'row', alignItems: 'center' }}>
                {r.iconUrl ? <Image source={{ uri: r.iconUrl }} style={{ width: 20, height: 20, borderRadius: 4 }} /> : null}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.text.primary, fontSize: tipografia.body }}>{r.text}</Text>
                  <Text style={{ color: colors.text.secondary, fontSize: tipografia.nota }}>
                    {(r.kind === 'product' ? 'Producto' : r.kind === 'group' ? 'Grupo' : 'Texto')}
                    {' · '}{r.scope === 'shop' ? 'Tienda · compartida' : 'Mía · personal'}
                    {r.keywords ? ` · #${r.keywords}` : ''}
                  </Text>
                </View>
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
            {(['text', 'product', 'group'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setTipo(k)}
                style={{
                  borderRadius: 999, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6,
                  backgroundColor: tipo === k ? colors.primary : colors.surface,
                }}
              >
                <Text style={{ color: tipo === k ? '#FFFFFF' : colors.text.primary, fontSize: tipografia.caption }}>
                  {k === 'text' ? 'Texto' : k === 'product' ? 'Producto' : 'Grupo'}
                </Text>
              </Pressable>
            ))}
          </View>

          {tipo !== 'text' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e6 }}>
              {refs.length ? refs.map((ref) => (
                <Pressable
                  key={ref.id}
                  onPress={() => setRefId(ref.id)}
                  style={{
                    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
                    borderColor: refId === ref.id ? colors.primary : colors.border,
                    backgroundColor: colors.surface, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e6,
                    flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, maxWidth: 220,
                  }}
                >
                  {ref.iconUrl ? <Image source={{ uri: ref.iconUrl }} style={{ width: 18, height: 18, borderRadius: 4 }} /> : null}
                  <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: tipografia.nota, maxWidth: 180 }}>{ref.label}</Text>
                </Pressable>
              )) : (
                <Text style={{ color: colors.text.secondary, fontSize: tipografia.nota }}>
                  {tipo === 'product' ? 'No tienes productos publicados.' : 'No participas en ningún grupo.'}
                </Text>
              )}
            </ScrollView>
          ) : null}

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

          <TextInput
            value={keywords}
            onChangeText={setKeywords}
            placeholder="Palabras clave separadas por comas (opcional)"
            placeholderTextColor={colors.text.secondary}
            style={{
              borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
              backgroundColor: colors.surface, color: colors.text.primary,
              paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, fontSize: tipografia.caption,
            }}
          />

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
              disabled={guardando || (tipo === 'text' ? texto.trim().length < 2 : !refId)}
              style={{
                borderRadius: 12, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
                backgroundColor: colors.primary, opacity: guardando || (tipo === 'text' ? texto.trim().length < 2 : !refId) ? 0.5 : 1,
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
