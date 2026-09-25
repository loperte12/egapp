/**
 * MonederoMovimientosScreen — historial completo del monedero (/monedero-movimientos).
 * Paginación por cursor del servidor y filtro por tipo de movimiento.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { espaciado, radios, Tactil, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { walletApi, type WalletTx } from '../api/wallet';
import { fmtXaf, txLabel, TxStatusChip } from './monedero';
import { brand } from '@egrouteplan/ui-kit';
import { EmptyState } from '@egrouteplan/ui-kit';
import { Volver } from '../components/Volver';

const FILTROS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Todos' },
  { id: 'DEPOSIT', label: 'Recargas' },
  { id: 'WITHDRAWAL', label: 'Retiradas' },
  { id: 'ESCROW_LOCK', label: 'Pagos' },
  { id: 'ESCROW_RELEASE', label: 'Cobros' },
  { id: 'ESCROW_REFUND', label: 'Reembolsos' },
  { id: 'FEE', label: 'Comisiones' },
];

export default function MonederoMovimientosScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filtro, setFiltro] = useState('');
  const [items, setItems] = useState<WalletTx[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (tipo: string) => {
    setLoading(true);
    try {
      const r = await walletApi.listTransactions(undefined, tipo || undefined, 25);
      setItems(r.items ?? []);
      setNextCursor(r.nextCursor ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(filtro); }, [filtro, cargar]);

  const cargarMas = async () => {
    if (!nextCursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const r = await walletApi.listTransactions(nextCursor, filtro || undefined, 25);
      setItems((prev) => [...prev, ...(r.items ?? [])]);
      setNextCursor(r.nextCursor ?? null);
    } catch {
      // silencioso: el botón sigue disponible para reintentar
    } finally {
      setCargandoMas(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Volver />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Movimientos</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8 }}>
          {FILTROS.map((f) => (
            <Tactil
              key={f.id}
              onPress={() => setFiltro(f.id)}
              style={[styles.filtro, { backgroundColor: filtro === f.id ? colors.primary : colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <Text style={{ color: filtro === f.id ? brand.white : colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{f.label}</Text>
            </Tactil>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingHorizontal: espaciado.e28 }}>{error}</Text>
          <Tactil onPress={() => void cargar(filtro)} style={[styles.retryBtn, { backgroundColor: colors.primary }]} accessibilityRole="button">
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Tactil>
        </View>
      ) : (
        /*
          LISTA VIRTUALIZADA (auditoría de diseño, D-04): antes era un ScrollView con .map(), que
          pinta y mantiene TODAS las filas. Con cientos de movimientos eso atasca justo la pantalla
          donde el usuario comprueba que su dinero está bien.
        */
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, margin: espaciado.e16, flexGrow: 0 }]}
          contentContainerStyle={{ paddingVertical: espaciado.e4 }}
          // Recicla lo que sale de pantalla y no monte todo de golpe.
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item: t }) => {
            const { label, sign } = txLabel(t);
            return (
              <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>{label}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e2 }}>
                    {new Date(t.createdAt).toLocaleString('es-GQ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: espaciado.e4 }}>
                  <Text style={{ color: sign === '+' ? brand.successPressed : colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                    {sign}{fmtXaf(Math.abs(Number(t.amount)))}
                  </Text>
                  <TxStatusChip status={t.status} />
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              compacto
              titulo="Todavía no hay movimientos de este tipo"
              texto="Cuando recargues, pagues o recibas un reembolso, aparecerán aquí con su fecha."
              accionLabel="Recargar con un agente"
              onAccion={() => router.push('/monedero-recargar')}
            />
          }
          ListFooterComponent={
            nextCursor ? (
              <Tactil onPress={() => void cargarMas()} style={[styles.masBtn, { borderColor: colors.border }]} accessibilityRole="button">
                {cargandoMas
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Cargar más</Text>}
              </Tactil>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e12 },
  retryBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e10 },
  filtro: { borderRadius: radios.full, borderWidth: 1, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7 },
  card: { borderRadius: 18, borderWidth: 1, padding: espaciado.e16 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth },
  masBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: espaciado.e12, alignItems: 'center', marginTop: espaciado.e14 },
});
