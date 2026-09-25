/**
 * app/lifebook-guardados.tsx — MIS GUARDADOS (favoritos), FUERA DEL PERFIL.
 *
 * ── POR QUÉ EXISTE (encargo del dueño) ──────────────────────────────────────────
 * Los guardados vivían **solo** en la pestaña «Colección» del perfil propio: para ver lo que te había
 * gustado había que entrar en tu perfil. Esta pantalla los saca de ahí y se abre desde el **catálogo**
 * (el corazón de la cabecera), que es donde uno está mirando productos cuando quiere volver a uno.
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────────
 *   · Lista lo guardado con su precio y su estado (nuevo/usado), sin fotos: los datos que se usan aquí
 *     son los que el servidor manda a esta pantalla (`mySaved`), y no se inventa ninguno.
 *   · **Gestionar** = quitar de guardados ahí mismo (el mismo corazón que los puso) y abrir el producto.
 *   · Si no hay nada, lo dice y explica cómo se guarda («el corazón de un producto»).
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, EmptyState, espaciado, GhostButton, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { AlertCircle, ArrowLeft, Heart } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { commerceApi, type LbProductCard } from '../api/commerce';
import { lbXaf } from '../constants/lifebook';

export default function LifeBookGuardadosScreen() {
  return (
    <AuthGate>
      <GuardadosContent />
    </AuthGate>
  );
}

function GuardadosContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<LbProductCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const mounted = useRef(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await commerceApi.mySaved();
      if (mounted.current) { setItems(r.items ?? []); setError(null); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus guardados');
    } finally {
      if (mounted.current) setCargando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    cargar();
    return () => { mounted.current = false; };
  }, [cargar]));

  /** Quitar de guardados: el mismo «corazón» que los puso, desde aquí. */
  const quitar = async (id: string) => {
    if (quitando) return;
    setQuitando(id);
    try {
      await commerceApi.toggleSave(id);
      if (mounted.current) setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
    } catch (e) {
      Alert.alert('Guardados', e instanceof Error ? e.message : 'No se pudo quitar de guardados');
    } finally {
      if (mounted.current) setQuitando(null);
    }
  };

  if (error && !items) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24, gap: espaciado.e12 }]}>
        <AlertCircle size={34} color={colors.danger} />
        <Text style={{ color: colors.textPrimary, fontWeight: '800', textAlign: 'center' }}>{error}</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }
  if (!items) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle, marginLeft: espaciado.e10, flex: 1 }} numberOfLines={1}>
          Mis guardados
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700' }}>
          {items.length === 1 ? '1 producto' : `${items.length} productos`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e28 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.primary} />}
      >
        {items.length === 0 ? (
          /* Ya tenía título, explicación y salida: solo se pasa al kit (no se toca la copia). */
          <EmptyState
            icono={<Heart size={34} color={colors.textSecondary} />}
            titulo="Todavía no has guardado nada"
            texto="Lo que guardes con el corazón de un producto aparece aquí, sin tener que entrar en tu perfil."
            accionLabel="Ver el catálogo"
            onAccion={() => router.push('/lifebook-catalog' as never)}
          />
        ) : (
          items.map((p) => (
            <View key={p.id} style={[styles.tarjeta, { borderColor: alpha(colors.border, 0.6) }]}>
              <Pressable
                onPress={() => router.push({ pathname: '/lifebook-product/[id]', params: { id: p.id } } as never)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${p.title}`}
                style={{ flex: 1 }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }} numberOfLines={2}>
                  {p.title}
                </Text>
                {p.shortDescription ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }} numberOfLines={2}>
                    {p.shortDescription}
                  </Text>
                ) : null}
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800', marginTop: espaciado.e6 }}>
                  {p.priceXaf === null ? 'Precio a consultar' : lbXaf(p.priceXaf)}
                  {p.oldPriceXaf && p.priceXaf && p.oldPriceXaf > p.priceXaf ? (
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}>
                      {'  '}antes {lbXaf(p.oldPriceXaf)}
                    </Text>
                  ) : null}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                  {p.condition === 'used' ? 'Usado' : 'Nuevo'}
                  {p.stockMode === 'exact' ? '' : ' · a pedir'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => quitar(p.id)}
                hitSlop={8}
                disabled={quitando === p.id}
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${p.title} de guardados`}
                style={[styles.quitar, { borderColor: alpha(colors.border, 0.9) }]}
              >
                <Heart size={16} color={colors.primary} />
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>
                  {quitando === p.id ? 'Quitando…' : 'Quitar'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tarjeta: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14, padding: espaciado.e14, marginBottom: espaciado.e10,
  },
  quitar: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e8,
  },
});
