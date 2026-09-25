/**
 * TripsHistoryScreen — Historial de viajes (P6, 2026-09-08).
 * Según el rol: el pasajero ve sus viajes de taxi (completados/cancelados) con
 * el conductor; el conductor ve los suyos con el pasajero. Cada tarjeta muestra
 * fecha, origen → destino, precio, estado y (si aplica) la valoración enviada.
 * Ruta: /trips-history — accesible desde Perfil (pasajero) y Home conductor.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CarTaxiFront, Star, XCircle } from 'lucide-react-native';
import { EmptyState, espaciado, peso, Precio, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';
import { taxiApi, TripHistoryItem } from '../api/taxi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand } from '@egrouteplan/ui-kit';

const xaf = (n?: string | number | null) => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && v > 0 ? `${v.toLocaleString('es')} XAF` : '—';
};

const fmtDate = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function TripsHistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = useSession();
  const [asDriver, setAsDriver] = useState<boolean | null>(null);
  const [trips, setTrips] = useState<TripHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await taxiApi.history();
      setAsDriver(r.asDriver);
      setTrips(r.trips || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Historial de viajes</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={[s.center, { gap: espaciado.e10 }]}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={load} style={[s.retry, { borderColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontWeight: peso.maximo }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        /* Lista VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes un ScrollView con .map(), que
           mantenía TODOS los viajes en memoria. Es el historial que más crece. */
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.medio, marginBottom: espaciado.e6 }}>
              {asDriver ? 'Como CONDUCTOR' : 'Como PASAJERO'} · {trips.length} viaje{trips.length === 1 ? '' : 's'}
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              titulo="Todavía no tienes viajes"
              texto="Cuando completes o canceles un taxi, el viaje aparecerá aquí con su precio, el conductor y la fecha."
              accionLabel="Pedir un taxi"
              onAccion={() => router.push('/taxi' as never)}
            />
          }
          renderItem={({ item: t }) => {
            const done = t.status === 'completed';
            return (
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                  {done ? <CarTaxiFront size={16} color={brand.success} /> : <XCircle size={16} color={brand.danger} />}
                  <Text style={{ color: done ? brand.success : brand.danger, fontWeight: peso.titulo, fontSize: tipografia.body, flex: 1 }}>
                    {done ? 'Completado' : 'Cancelado'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>{fmtDate(done ? t.completed_at : t.cancelled_at) || fmtDate(t.created_at)}</Text>
                </View>

                <View style={{ marginTop: espaciado.e6, gap: espaciado.e2 }}>
                  <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, fontWeight: peso.medio }} numberOfLines={1}>
                    🟢 {t.pickup_address || 'Origen'}
                  </Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, fontWeight: peso.fuerte }} numberOfLines={1}>
                    🟠 {t.dropoff_address || 'Destino'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.fuerte }}>
                      {asDriver ? 'Pasajero' : 'Conductor'}: {t.counterpart_name || '—'}
                    </Text>
                    {t.vehicle_plate && (
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: peso.medio }}>
                        {t.vehicle_model || ''} {t.vehicle_plate ? `· ${t.vehicle_plate}` : ''}
                      </Text>
                    )}
                    {!done && t.cancelled_reason && (
                      <Text style={{ fontSize: tipografia.micro, color: brand.danger, fontWeight: peso.fuerte, marginTop: espaciado.e2 }}>
                        Motivo: {t.cancelled_reason}
                      </Text>
                    )}
                  </View>
                  <Precio valor={done ? t.final_price : t.requested_price} tamano="md" color={brand.secondary} />
                </View>

                {/* ── P1-c: detalle de LIQUIDACIÓN (qué se pagó, comisión y neto) ── */}
                {(() => {
                  const kind = t.settlement_kind;
                  if (!kind) return null;
                  const fare = Number(t.final_price ?? 0);
                  if (kind === 'CASH') {
                    return (
                      <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.fuerte, marginTop: espaciado.e6 }}>
                        💵 Pagado en efectivo al conductor · sin cargo en el monedero
                      </Text>
                    );
                  }
                  const fee = Number(t.fee_info?.fee ?? 0);
                  const net = Math.max(0, fare - fee);
                  const set = t.settlement ?? {};
                  const disputed = !!t.disputed_at;
                  const resolvedDisp = !!set.dispute?.resolved_at;
                  return (
                    <View style={{ marginTop: espaciado.e6, padding: espaciado.e8, borderRadius: radios.chip, backgroundColor: colors.surface, borderWidth: trazo.fino, borderColor: colors.border, gap: espaciado.e2 }}>
                      <Text style={{ fontSize: tipografia.caption, color: colors.textPrimary, fontWeight: peso.maximo }}>
                        Liquidación ({t.city ?? '—'}) · monedero
                      </Text>
                      {done ? (
                        <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.medio }}>
                          Tarifa {xaf(fare)} · comisión {xaf(fee)} · {asDriver ? 'cobraste' : 'al conductor'} {xaf(net)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.medio }}>
                          {Number(set.fee_to_driver ?? 0) > 0
                            ? `Cuota de absentismo ${xaf(set.fee_to_driver)} · devuelto ${xaf(set.refunded)}`
                            : (t.cancelled_by === 'DRIVER'
                              ? 'El conductor canceló: devolución íntegra al monedero'
                              : `Devuelto íntegramente: ${xaf(set.refunded ?? fare)}`)}
                        </Text>
                      )}
                      {disputed && (
                        <Text style={{ fontSize: tipografia.caption, color: resolvedDisp ? brand.success : brand.primary, fontWeight: peso.maximo }}>
                          {resolvedDisp
                            ? `⚖️ Disputa resuelta: ${String(set.dispute?.outcome ?? '').replace(/_/g, ' ').toLowerCase()}`
                            : '⚖️ Disputa abierta — en revisión'}
                        </Text>
                      )}
                    </View>
                  );
                })()}

                {done && (
                  <View style={{ marginTop: espaciado.e8, borderTopWidth: trazo.fino, borderTopColor: colors.border, paddingTop: espaciado.e6, flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
                    {t.my_rating != null ? (
                      <>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={14} color={n <= Number(t.my_rating) ? brand.warning : colors.border} fill={n <= Number(t.my_rating) ? brand.warning : 'transparent'} />
                        ))}
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginLeft: espaciado.e4, fontWeight: peso.medio }}>
                          {asDriver ? 'Te puntuaron' : 'Tu valoración'}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>
                        {asDriver ? 'Sin valoración del pasajero' : 'No puntuaste este viaje'}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
    title: { fontSize: tipografia.cabecera, fontWeight: peso.maximo, color: c.textPrimary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
    retry: { borderRadius: radios.full, borderWidth: trazo.fino, paddingHorizontal: espaciado.e22, paddingVertical: espaciado.e10 },
    content: { padding: espaciado.e16, gap: espaciado.e10, paddingBottom: 40 },
    card: { borderRadius: radios.lg, borderWidth: trazo.fino, padding: espaciado.e12 },
  });
