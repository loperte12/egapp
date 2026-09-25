/**
 * MonederoScreen — monedero NATIVO (/monedero). P2, 17/09.
 *
 * Sustituye al WebView de la maqueta (datos falsos: «María», tarjeta de agente
 * MBO-0042 fija, teléfono de ayuda chino). Todo aquí es REAL: saldo, cupo de
 * hoy y últimos movimientos vienen de la API del monedero (hk), y las acciones
 * Recargar/Retirar abren los flujos nativos con agente de efectivo (OTP).
 *
 * Estructura pensada para rails: hoy «Agente de efectivo» es el único rail de
 * entrada/salida; Muni Dinero entrará como segundo rail sin rehacer pantallas.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ChevronRight, KeyRound, ShieldCheck, Wallet,
} from 'lucide-react-native';
import { EmptyState, espaciado, neutro, peso, Precio, radios, Tactil, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { walletApi, type WalletBalance, type WalletTx } from '../api/wallet';
import { brand } from '@egrouteplan/ui-kit';
import { Volver } from '../components/Volver';

export default function MonederoScreen() {
  return (
    <AuthGate>
      <MonederoContent />
    </AuthGate>
  );
}

/** Etiqueta legible por tipo de movimiento (signo según si entra o sale). */
export const TX_LABEL: Record<string, { label: string; sign: '+' | '−' }> = {
  DEPOSIT: { label: 'Recarga con agente', sign: '+' },
  WITHDRAWAL: { label: 'Retirada de efectivo', sign: '−' },
  ESCROW_LOCK: { label: 'Pago en garantía', sign: '−' },
  ESCROW_RELEASE: { label: 'Cobro liberado', sign: '+' },
  ESCROW_REFUND: { label: 'Reembolso de garantía', sign: '+' },
  FEE: { label: 'Comisión', sign: '−' },
  TRANSFER_IN: { label: 'Transferencia recibida', sign: '+' },
  TRANSFER_OUT: { label: 'Transferencia enviada', sign: '−' },
};

export const fmtXaf = (n: number) => `${Math.round(n).toLocaleString('es-GQ')} XAF`;

export function txLabel(t: WalletTx): { label: string; sign: '+' | '−' } {
  const base = TX_LABEL[t.type] ?? { label: t.type, sign: '+' as const };
  // El servidor manda `direction` (IN/OUT): si viene, manda sobre el mapa por tipo
  // (un ESCROW_RELEASE es IN para quien cobra y no existe OUT del otro lado, etc.).
  if (t.direction) return { label: base.label, sign: t.direction === 'IN' ? '+' : '−' };
  return base;
}

export function TxStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    COMPLETED: { bg: brand.successSoft, fg: brand.successPressed, label: 'Completado' },
    PENDING: { bg: brand.warningSoft, fg: brand.secondaryPressed, label: 'Pendiente' },
    FAILED: { bg: brand.dangerSoft, fg: brand.dangerPressed, label: 'Fallido' },
    CANCELLED: { bg: brand.dangerSoft, fg: brand.dangerPressed, label: 'Cancelado' },
  };
  const s = map[status] ?? { bg: neutro.n200, fg: neutro.n700, label: status };
  return (
    <View style={[chipStyles.chip, { backgroundColor: s.bg }]}>
      <Text style={[chipStyles.txt, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}
const chipStyles = StyleSheet.create({
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 },
  txt: { fontSize: tipografia.nota, fontWeight: peso.titulo },
});

function MonederoContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [b, t] = await Promise.all([walletApi.getWallet(), walletApi.listTransactions(undefined, undefined, 8)]);
      setBalance(b);
      setTxs(t.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el monedero');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Volver />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Monedero</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && !balance ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error && !balance ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingHorizontal: espaciado.e28 }}>{error}</Text>
          <Tactil onPress={() => void cargar()} style={[styles.retryBtn, { backgroundColor: colors.primary }]} accessibilityRole="button">
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Tactil>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          {/* Saldo */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
              <Wallet size={16} color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>Saldo disponible</Text>
            </View>
            <Precio valor={Number(balance?.balanceAvailable ?? 0)} tamano="xl" color={colors.textPrimary} style={{ marginTop: espaciado.e6 }} />
            {Number(balance?.balanceEscrow ?? 0) > 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e4 }}>
                En garantía: {fmtXaf(Number(balance?.balanceEscrow ?? 0))}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, marginTop: espaciado.e8 }}>
              <ShieldCheck size={12} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
                Hoy puedes recargar {fmtXaf(Number(balance?.today?.depositRemaining ?? balance?.dailyLimit ?? 0))} · retirar {fmtXaf(Number(balance?.today?.withdrawalRemaining ?? balance?.dailyLimit ?? 0))}
              </Text>
            </View>
          </View>

          {/* Acciones — rail de efectivo (Muni Dinero llegará como segundo rail) */}
          <View style={{ flexDirection: 'row', gap: espaciado.e12, marginTop: espaciado.e14 }}>
            <Tactil
              style={[styles.action, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/monedero-recargar')}
              accessibilityRole="button"
            >
              <ArrowDownToLine size={20} color={brand.white} />
              <Text style={styles.actionTxt}>Recargar</Text>
              <Text style={styles.actionHint}>con agente</Text>
            </Tactil>
            <Tactil
              style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: trazo.fino }]}
              onPress={() => router.push('/monedero-retirar')}
              accessibilityRole="button"
            >
              <ArrowUpFromLine size={20} color={colors.primary} />
              <Text style={[styles.actionTxt, { color: colors.textPrimary }]}>Retirar</Text>
              <Text style={[styles.actionHint, { color: colors.textSecondary }]}>efectivo</Text>
            </Tactil>
          </View>

          {/* Cambiar PIN */}
          <Tactil
            style={[styles.rowItem, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/monedero-pin')}
            accessibilityRole="button"
          >
            <KeyRound size={16} color={colors.textSecondary} />
            <Text style={{ flex: 1, color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, marginLeft: espaciado.e10 }}>PIN del monedero</Text>
            <ChevronRight size={16} color={colors.textSecondary} />
          </Tactil>

          {/* Últimos movimientos */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e20, marginBottom: espaciado.e8 }}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.cuerpo, fontWeight: peso.titulo }}>Últimos movimientos</Text>
            <Tactil onPress={() => router.push('/monedero-movimientos')} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Ver todos</Text>
            </Tactil>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: espaciado.e4 }]}>
            {txs.length === 0 ? (
              /* Vacío con salida (D-17): qué es, por qué está vacío y qué hacer ahora. */
              <EmptyState
                compacto
                titulo="Todavía no hay movimientos"
                texto="Aquí se apunta cada recarga, retirada y pago que hagas con el monedero."
                accionLabel="Recargar con un agente"
                onAccion={() => router.push('/monedero-recargar' as never)}
              />
            ) : txs.map((t) => {
              const { label, sign } = txLabel(t);
              return (
                <View key={t.id} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>{label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e2 }}>
                      {new Date(t.createdAt).toLocaleString('es-GQ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
            })}
          </View>
        </ScrollView>
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
  card: { borderRadius: radios.panel, borderWidth: trazo.fino, padding: espaciado.e16 },
  action: { flex: 1, borderRadius: radios.panel, paddingVertical: espaciado.e16, alignItems: 'center', gap: espaciado.e4 },
  actionTxt: { color: brand.white, fontSize: tipografia.fino, fontWeight: peso.titulo },
  actionHint: { color: 'rgba(255,255,255,0.75)', fontSize: tipografia.micro, fontWeight: peso.medio },
  rowItem: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radios.campo, borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e13, marginTop: espaciado.e14,
  },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth },
});
