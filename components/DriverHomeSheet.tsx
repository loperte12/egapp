/**
 * DriverHomeSheet — Home del conductor estilo DiDi (P1, aprobado 2026-09-08).
 * Bottom-sheet de 3 pestañas REUTILIZANDO las pantallas existentes:
 *  · FLUJO DIARIO: ganancias hoy/semana/mes + resumen por tipo + enlace al
 *    historial completo (/driver-profile: periodos con rating y puntuación).
 *  · VIDA: comida rápida y comercio con tarjetas horizontales con imagen.
 *  · PERFIL: tema, idioma (ES/FR/EN pendiente por fases, anotado), normas y
 *    términos, y CERRAR SESIÓN (SOLO aquí, fuera del header del conductor).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BarChart3, ChevronRight, FileText, Globe, History, LogOut, Moon, ShieldCheck, ShoppingBag, Star,
  UserRound, Utensils, Wallet,
} from 'lucide-react-native';
import { alpha, elevation, espaciado, GhostButton, InlineError, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';
import { driverApi } from '../api/driver';
import { intercityApi } from '../api/intercity';
import { brand } from '@egrouteplan/ui-kit';

export type HomeTab = 'flujo' | 'vida' | 'perfil';

const TABS: Array<{ key: HomeTab; label: string; icon: any }> = [
  { key: 'flujo', label: 'Flujo diario', icon: BarChart3 },
  { key: 'vida', label: 'Vida', icon: Utensils },
  { key: 'perfil', label: 'Perfil', icon: UserRound },
];

const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'all', label: 'Total' },
] as const;

const xaf = (n: number | null | undefined) => `${Number(n || 0).toLocaleString('es')} XAF`;

export default function DriverHomeSheet({ visible, tab, onClose }: {
  visible: boolean; tab: HomeTab; onClose: () => void;
}) {
  const { colors, isDark, setMode } = useTheme();
  const router = useRouter();
  const { logout } = useSession();
  const [activeTab, setActiveTab] = useState<HomeTab>(tab);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof intercityApi.earnings>> | null>(null);
  const [loadingE, setLoadingE] = useState(false);
  const [errE, setErrE] = useState<string | null>(null);
  const [driver, setDriver] = useState<{ phone?: string; rating?: number; ratingCount?: number }>({});
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => { if (visible) setActiveTab(tab); }, [visible, tab]);

  const loadEarnings = useCallback(async () => {
    setLoadingE(true); setErrE(null);
    try {
      const [e, st] = await Promise.all([intercityApi.earnings(period), driverApi.status()]);
      setEarnings(e);
      setDriver({
        rating: Number((st.driver as any)?.rating_avg) || 0,
        ratingCount: Number((st.driver as any)?.rating_count) || 0,
      });
    } catch (e2) {
      setErrE(e2 instanceof Error ? e2.message : 'No se pudieron cargar las ganancias');
    } finally { setLoadingE(false); }
  }, [period]);

  useEffect(() => { if (visible && activeTab === 'flujo') loadEarnings(); }, [visible, activeTab, loadEarnings]);

  const handleLogout = async () => { await logout(); router.replace('/'); };

  const drRating = driver.rating ?? 0;
  const s = dhStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dh.overlay}>
        <Pressable style={dh.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" />
        <View style={[s.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {/* Manija */}
          <View style={[dh.handle, { backgroundColor: colors.border }]} />

          {/* Pestañas */}
          <View style={[s.tabs, { backgroundColor: alpha(colors.border, 0.28) }]}>
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = activeTab === t.key;
              return (
                <Pressable key={t.key} onPress={() => setActiveTab(t.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.tab, on && { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1 }]}>
                  <Icon size={16} color={on ? colors.primary : colors.textSecondary} />
                  <Text style={{ color: on ? colors.primary : colors.textSecondary, fontSize: tipografia.caption, fontWeight: '800' }} numberOfLines={1}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={dh.content} showsVerticalScrollIndicator={false}>
            {/* ── FLUJO DIARIO ─────────────────────────────────────────── */}
            {activeTab === 'flujo' && (
              <View style={{ gap: espaciado.e12 }}>
                <View style={[s.card, { borderColor: colors.border, gap: espaciado.e10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                    <Wallet size={18} color={colors.primary} />
                    <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle }}>Ganancias</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                    {PERIODS.map((p) => (
                      <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[s.chip, { flex: 1, borderColor: period === p.key ? colors.primary : colors.border, backgroundColor: period === p.key ? alpha(colors.primary, 0.08) : 'transparent' }]}>
                        <Text style={{ color: period === p.key ? colors.primary : colors.textSecondary, fontWeight: '800', fontSize: tipografia.caption }}>{p.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {loadingE && <ActivityIndicator color={colors.primary} />}
                  {errE ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={errE} /></View> : null}
                  {!loadingE && !errE && earnings && (
                    <>
                      <View style={{ alignItems: 'center', gap: espaciado.e2 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: '700' }}>NETO ({period === 'all' ? 'total' : period})</Text>
                        <Text style={{ color: colors.success, fontSize: 30, fontWeight: '900' }}>{xaf(earnings.totalNet)}</Text>
                      </View>
                      <View style={[s.statRow, { backgroundColor: alpha(colors.border, 0.2) }]}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>🚕 Taxi ciudad</Text>
                        <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.body }}>{earnings.city.trips} viajes · {xaf(earnings.city.net)}</Text>
                      </View>
                      <View style={[s.statRow, { backgroundColor: alpha(colors.border, 0.2) }]}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>🚌 Ciudad a Ciudad</Text>
                        <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.body }}>{earnings.intercity.bookings} reservas · {xaf(earnings.intercity.gross)}</Text>
                      </View>
                    </>
                  )}
                  <GhostButton title="Historial completo y puntuación" onPress={() => { onClose(); router.push('/driver-profile' as any); }} />
                  {/* P6: historial de viajes del conductor (taxi) */}
                  <Pressable
                    onPress={() => { onClose(); router.push('/trips-history' as any); }}
                    style={[s.linkRow, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Historial de viajes"
                  >
                    <History size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.body }}>Historial de viajes</Text>
                    <ChevronRight size={16} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                  </Pressable>
                </View>

                {/* Resumen de puntuación (honesto: solo si hay valoraciones) */}
                <View style={[s.card, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }]}>
                  <View style={[dh.ratingBox, { backgroundColor: alpha(brand.warning, 0.14) }]}>
                    <Star size={22} color={brand.warning} fill={brand.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15 }}>Puntuación</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: 1 }}>
                      {drRating > 0
                        ? `${drRating.toFixed(1)} ★ · ${driver.ratingCount} valoración(es)`
                        : 'Aún no tienes valoraciones suficientes.'}
                    </Text>
                  </View>
                  {drRating > 0 && <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '900' }}>{drRating.toFixed(1)}</Text>}
                </View>
              </View>
            )}

            {/* ── VIDA: comida y comercio (tarjetas con imagen) ─────────── */}
            {activeTab === 'vida' && (
              <View style={{ gap: espaciado.e12 }}>
                <Pressable onPress={() => { onClose(); router.push('/food' as any); }} style={[s.vidaCard, { backgroundColor: brand.secondary }]}>
                  <View style={dh.vidaTextWrap}>
                    <Text style={dh.vidaTitle}>🍔 Comida Rápida</Text>
                    <Text style={dh.vidaSub}>Restaurantes y pedidos en tu ciudad</Text>
                    <Text style={dh.vidaCta}>Ver restaurantes →</Text>
                  </View>
                  <View style={[dh.vidaArt, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                    <Utensils size={40} color={brand.white} />
                  </View>
                </Pressable>
                <Pressable onPress={() => { onClose(); router.push('/ecomerse' as any); }} style={[s.vidaCard, { backgroundColor: '#8B5CF6' }]}>
                  <View style={dh.vidaTextWrap}>
                    <Text style={dh.vidaTitle}>🛍️ Ecomerse</Text>
                    <Text style={dh.vidaSub}>Tiendas y productos de comercio</Text>
                    <Text style={dh.vidaCta}>Ver tiendas →</Text>
                  </View>
                  <View style={[dh.vidaArt, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                    <ShoppingBag size={40} color={brand.white} />
                  </View>
                </Pressable>
                <Pressable onPress={() => { onClose(); router.push('/food' as any); }} style={[s.vidaRow, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>😋 Ver pedidos recientes de comida</Text>
                  <ChevronRight size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            )}

            {/* ── PERFIL: tema · idioma · normas · logout SOLO aquí ─────── */}
            {activeTab === 'perfil' && (
              <View style={{ gap: espaciado.e12 }}>
                <View style={[s.card, { borderColor: colors.border, gap: 0 }]}>
                  <View style={[dh.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                    <Moon size={18} color={colors.primary} />
                    <Text style={{ flex: 1, color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Tema oscuro</Text>
                    <Switch value={isDark} onValueChange={(v) => setMode(v ? 'dark' : 'light')} trackColor={{ true: colors.primary }} />
                  </View>
                  <View style={[dh.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                    <Globe size={18} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Idioma</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>Español (Guinea Ecuatorial) · ES/FR/EN pendiente por fases</Text>
                    </View>
                    <ChevronRight size={16} color={colors.textSecondary} />
                  </View>
                  <Pressable onPress={() => setRulesOpen((v) => !v)} accessibilityRole="button" style={dh.row}>
                    <FileText size={18} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Normas y términos</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>{rulesOpen ? 'Toca para ocultar' : 'Toca para leer las normas de la comunidad'}</Text>
                    </View>
                    <ChevronRight size={16} color={colors.textSecondary} />
                  </Pressable>
                  {rulesOpen && (
                    <View style={{ padding: espaciado.e12, gap: espaciado.e6 }}>
                      {[
                        'Conduce con respeto y prudencia: la seguridad del pasajero es lo primero.',
                        'Respeta la tarifa de la app (algoritmo o presupuesto del pasajero): es el precio final.',
                        'Al terminar un viaje en efectivo confirma SIEMPRE que recibiste el dinero.',
                        'No fumes ni pidas pagos fuera de la app dentro del viaje.',
                        'En emergencias usa el botón de alerta: marca directamente al 24/7.',
                        'Mantén tus documentos de conductor al día (aviso automático de caducidad).',
                      ].map((r) => (
                        <Text key={r} style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, lineHeight: 18 }}>• {r}</Text>
                      ))}
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio, marginTop: espaciado.e4 }}>
                        Al usar EG Route Plan como conductor aceptas estos términos (versión v1.0).
                      </Text>
                    </View>
                  )}
                </View>

                <View style={[s.card, { borderColor: colors.border, gap: espaciado.e6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                    <ShieldCheck size={18} color={colors.primary} />
                    <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Conductor verificado</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}>
                    Tu cuenta de conductor está activa{drRating > 0 ? ` con ${drRating.toFixed(1)} ★` : ''}.
                  </Text>
                </View>

                <Pressable onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Cerrar sesión" style={[s.card, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06), flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }]}>
                  <LogOut size={18} color={colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 15 }}>Cerrar sesión</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>Solo desde aquí (por seguridad)</Text>
                  </View>
                  <ChevronRight size={16} color={colors.danger} />
                </Pressable>
              </View>
            )}

            {activeTab === 'perfil' && <Text style={{ color: colors.textSecondary, fontSize: 10.5, textAlign: 'center', fontWeight: peso.medio }}>EG Route Plan · Conductor · v1.0.0</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const dh = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: espaciado.e10, marginBottom: espaciado.e4 },
  content: { padding: espaciado.e16, paddingBottom: 36, gap: espaciado.e12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingVertical: espaciado.e13 },
  ratingBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  vidaTextWrap: { flex: 1, gap: espaciado.e2 },
  vidaTitle: { color: brand.white, fontSize: 21, fontWeight: '900' },
  vidaSub: { color: 'rgba(255,255,255,0.85)', fontSize: tipografia.caption, fontWeight: peso.medio },
  vidaCta: { color: brand.white, fontSize: tipografia.caption, fontWeight: '800', marginTop: espaciado.e6, textDecorationLine: 'underline' },
  vidaArt: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

const dhStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    sheet: {
      borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1,
      maxHeight: '86%', minHeight: 240,
      ...elevation.lg,
    },
    tabs: { flexDirection: 'row', gap: espaciado.e8, marginHorizontal: espaciado.e16, marginTop: espaciado.e8, borderRadius: 14, padding: espaciado.e5 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, borderRadius: 10, paddingVertical: espaciado.e9 },
    card: { borderRadius: radios.lg, borderWidth: 1.5, padding: espaciado.e14 },
    chip: { borderRadius: 10, borderWidth: 1.5, paddingVertical: espaciado.e7, alignItems: 'center' },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderRadius: radios.md, borderWidth: 1, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12 },
    vidaCard: {
      borderRadius: 20, padding: espaciado.e18, flexDirection: 'row', alignItems: 'center', gap: espaciado.e14,
      ...elevation.md,
    },
    vidaRow: { borderRadius: 14, borderWidth: 1.5, padding: espaciado.e13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  });
