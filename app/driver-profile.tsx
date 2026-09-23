/**
 * DriverProfileScreen — Perfil del Conductor (EG Route Plan).
 * Aloja las OPCIONES del conductor (fuera del panel de trabajo):
 * Ganancias (ciudad + intercity por período), Documentos con caducidades,
 * Vehículo, Emergencia y Cerrar sesión. Ruta: /driver-profile
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Wallet, FileWarning, Truck, Siren, ChevronRight, ShieldCheck, Percent } from 'lucide-react-native';
import { useTheme, GhostButton, alpha, brand, InlineError, tipografia, radios } from '@egrouteplan/ui-kit';
import { driverApi, DocExpiry } from '../api/driver';
import { intercityApi, DriverEarnings } from '../api/intercity';
import { absUrl } from '../api/config';
import { billingApi } from '../api/billing';
import EmergencyModal from '../components/EmergencyModal';

const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'all', label: 'Total' },
] as const;

const xaf = (n: number) => `${Number(n || 0).toLocaleString('es')} XAF`;

export default function DriverProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [expiries, setExpiries] = useState<DocExpiry[]>([]);
  const [vehicle, setVehicle] = useState<{
    vehicle_type?: string; vehicle_plate?: string; vehicle_model?: string;
    vehicle_color?: string; vehicle_photo_url?: string | null; // P1a
  } | null>(null);
  const [status, setStatus] = useState<string>('checking');
  const [workMode, setWorkMode] = useState<'city' | 'intercity' | 'both'>('both');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [e, st] = await Promise.all([intercityApi.earnings(period), driverApi.status()]);
      setEarnings(e);
      setStatus(st.status);
      if (st.driver) {
        setVehicle({
          vehicle_type: st.driver.vehicle_type,
          vehicle_plate: st.driver.vehicle_plate,
          vehicle_model: st.driver.vehicle_model,
          vehicle_color: st.driver.vehicle_color,
          vehicle_photo_url: st.driver.vehicle_photo_url ?? null,
        });
        setWorkMode((st.driver.work_mode as 'city' | 'intercity' | 'both') ?? 'both');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    }
  }, [period]);

  const changeMode = async (m: 'city' | 'intercity' | 'both') => {
    const prev = workMode;
    setWorkMode(m);
    try {
      await driverApi.setWorkMode(m);
    } catch {
      setWorkMode(prev);
      setError('No se pudo guardar el modo');
    }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    driverApi.expiries().then((r) => setExpiries(r.expiries.filter((x) => x.status !== 'ok'))).catch(() => {});
  }, []);

  const s = styles(colors);
  const expCount = expiries.filter((x) => x.status === 'expired').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Perfil del conductor</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        {/* Identidad */}
        <View style={[s.card, { borderColor: colors.border, alignItems: 'center', gap: 6 }]}>
          <View style={[s.avatar, { backgroundColor: alpha(colors.primary, 0.15) }]}>
            <ShieldCheck size={26} color={colors.primary} />
          </View>
          <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 17 }}>Conductor</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.caption }}>Estado: {status}</Text>
          {vehicle && (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                {vehicle.vehicle_type ?? '—'} {vehicle.vehicle_model ?? ''} {vehicle.vehicle_plate ? `· ${vehicle.vehicle_plate}` : ''}
              </Text>
              {vehicle.vehicle_color && (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                  Color: {vehicle.vehicle_color}
                </Text>
              )}
              {vehicle.vehicle_photo_url && !vehicle.vehicle_photo_url.startsWith('captured://') && (
                <View style={{ width: 120, height: 84, borderRadius: 10, overflow: 'hidden', marginTop: 2, borderWidth: 1, borderColor: colors.border }}>
                  <Image source={{ uri: absUrl(vehicle.vehicle_photo_url) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </View>
              )}
            </>
          )}
        </View>

        {/* Ganancias */}
        <View style={[s.card, { borderColor: colors.border, gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Wallet size={18} color={colors.primary} />
            <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle }}>Mis ganancias</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PERIODS.map((p) => (
              <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[s.chip, { borderColor: period === p.key ? colors.primary : colors.border, backgroundColor: period === p.key ? alpha(colors.primary, 0.08) : colors.card }]}>
                <Text style={{ color: period === p.key ? colors.primary : colors.textPrimary, fontWeight: '800', fontSize: tipografia.caption }}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <View style={{ marginTop: 10 }}><InlineError mensaje={error} /></View> : null}
          {earnings && (
            <>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: '700' }}>NETO ({period === 'all' ? 'total' : period})</Text>
                <Text style={{ color: colors.success, fontSize: 30, fontWeight: '900' }}>{xaf(earnings.totalNet)}</Text>
              </View>
              <View style={[s.statRow, { backgroundColor: alpha(colors.border, 0.2) }]}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>🚕 Taxi ciudad</Text>
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.body }}>{earnings.city.trips} viajes · {xaf(earnings.city.net)} neto</Text>
              </View>
              <View style={[s.statRow, { backgroundColor: alpha(colors.border, 0.2) }]}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>🚌 Ciudad a Ciudad</Text>
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.body }}>{earnings.intercity.bookings} reservas pagadas · {xaf(earnings.intercity.gross)}</Text>
              </View>
              {earnings.intercity.pendingCollection > 0 && (
                <Text style={{ color: colors.secondary, fontWeight: '800', fontSize: tipografia.caption }}>
                  💵 Pendiente de cobro: {earnings.intercity.pendingCollection} reserva(s)
                </Text>
              )}
              {earnings.commissionDebt && earnings.commissionDebt.pendingXaf > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Percent size={14} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontWeight: '800', fontSize: tipografia.caption, flex: 1 }}>
                    Comisión por liquidar (5% intercity): {xaf(earnings.commissionDebt.pendingXaf)}
                  </Text>
                  <Pressable
                    onPress={async () => {
                      try {
                        const r = await billingApi.settleCommissions();
                        router.push({ pathname: '/billing-checkout', params: { orderId: r.orderId } } as any);
                      } catch (e) {
                        Alert.alert('Liquidar comisión', e instanceof Error ? e.message : 'No se pudo iniciar');
                      }
                    }}
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radios.sm }}
                  >
                    <Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: '800' }}>Liquidar</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>

        {/* Modo del día */}
        <View style={[s.card, { borderColor: colors.border, gap: 10 }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle }}>Modo del día</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
            ¿Qué servicio harás hoy? Se recuerda hasta que lo cambies. Si eliges Ciudad a Ciudad, no recibirás solicitudes de taxi de ciudad.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['city', '🚕 Taxi ciudad'], ['intercity', '🚌 Ciudad a Ciudad'], ['both', '🔄 Ambos']] as const).map(([v, l]) => (
              <Pressable key={v} onPress={() => changeMode(v)} style={[s.chip, { flex: 1, borderColor: workMode === v ? colors.primary : colors.border, backgroundColor: workMode === v ? alpha(colors.primary, 0.08) : colors.card }]}>
                <Text style={{ color: workMode === v ? colors.primary : colors.textPrimary, fontWeight: '800', fontSize: tipografia.caption, textAlign: 'center' }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Documentos */}
        <View style={[s.card, { borderColor: colors.border, gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <FileWarning size={18} color={expCount > 0 ? colors.danger : colors.primary} />
            <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle }}>Documentos</Text>
          </View>
          {expiries.length === 0 && <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>Sin caducidades próximas.</Text>}
          {expiries.map((e) => (
            <Text key={e.docType} style={{ color: e.status === 'expired' ? colors.danger : colors.secondary, fontSize: tipografia.body, fontWeight: '700' }}>
              {e.status === 'expired' ? `⚠ ${e.label}: VENCIDO (${e.expiresAt.slice(0, 10)})` : `⏳ ${e.label}: caduca en ${e.daysLeft} días`}
            </Text>
          ))}
          <GhostButton title="Ver / completar mi alta" onPress={() => router.push('/driver-onboarding' as any)} />
        </View>

        {/* Emergencia */}
        <Pressable onPress={() => setEmergencyOpen(true)} style={[s.card, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.05), flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <Siren size={20} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 15, flex: 1 }}>Emergencia · marcación directa 24/7</Text>
          <ChevronRight size={18} color={colors.danger} />
        </Pressable>

        {/* Cerrar sesión: SOLO en Perfil (bottom-sheet Home del conductor) —
            decisión del dueño 2026-09-08. Aquí se muestra un aviso. */}
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: '600', textAlign: 'center', marginTop: 2 }}>
          🔒 Cerrar sesión: disponible en Perfil del conductor (menú Home, pestaña Perfil).
        </Text>
      </ScrollView>

      <EmergencyModal visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    content: { padding: 20, gap: 14 },
    card: { borderRadius: radios.lg, borderWidth: 1.5, padding: 16 },
    avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    chip: { borderRadius: radios.md, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  });
