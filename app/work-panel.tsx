/**
 * work-panel — PARTE 1 · **HOY** DEL ENTORNO DE CONTROL DEL EMPLEADOR.
 *
 * ── PASO 3 DEL ESTÁNDAR (`ESTANDAR-ENTORNOS-DE-CONTROL.md` §5) ────────────────
 * El vertical de **Trabajo** vivía en UNA pantalla (`work-publish`, 31 KB) que mezclaba
 * publicar una oferta, ver las mías y contestar candidaturas. Es el mismo problema que tenían
 * el hotel y el mercado: **dos trabajos de naturaleza distinta en la misma pantalla**, y lo
 * urgente —una persona que ha escrito para un puesto y espera respuesta— se pierde entre lo
 * que puede esperar.
 *
 * Esta es la parte que **caduca**: quién ha escrito y sigue sin respuesta, y qué ofertas están
 * a punto de vencer. La parte de configurar (crear, editar, cerrar, duplicar) está en
 * «Gestión», y se llega con una sola puerta.
 *
 * ── Lo que NO se hace aquí, a propósito ───────────────────────────────────────
 * No se reescribe `work-publish`. Sigue funcionando y es la parte de Gestión; partirlo entero
 * es trabajo aparte. Lo que se construye aquí es la parte que faltaba, que es la que tiene
 * prisa: **la respuesta a los candidatos**.
 *
 * 🔒 Muestra teléfonos de personas que se han inscrito, así que lleva `useScreenGuard`
 * (bloqueo de capturas) y va detrás de la puerta de gestión, como el resto del área.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, GhostButton, PrimaryButton, useTheme, useScreenGuard, tipografia, radios } from '@egrouteplan/ui-kit';
import { ArrowLeft, Briefcase, ChevronRight, Phone, Settings, Users } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { workApi, type WorkJob, type WorkPlan } from '../api/work';
import { ApiError } from '../api/httpClient';

export default function WorkPanelScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

type Candidato = NonNullable<WorkJob['applicants']>[number];

/** Días que faltan hasta una fecha (negativo si ya pasó). */
function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

function Contenido() {
  useScreenGuard();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [ofertas, setOfertas] = useState<WorkJob[]>([]);
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      // En paralelo: si el plan falla (no hay plan contratado), las ofertas siguen valiendo.
      const [mis, miPlan] = await Promise.allSettled([workApi.myJobs(), workApi.myPlan()]);
      if (mis.status === 'fulfilled') setOfertas(mis.value ?? []);
      else throw mis.reason;
      setPlan(miPlan.status === 'fulfilled' ? miPlan.value : null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus ofertas.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const contestar = async (c: Candidato, decision: 'selected' | 'rejected') => {
    setOcupado(c.id);
    setAviso(null);
    try {
      await workApi.selectApplicant(c.id, decision);
      setAviso(decision === 'selected'
        ? `${c.fullName ?? 'El candidato'} queda seleccionado.`
        : `${c.fullName ?? 'El candidato'} queda descartado.`);
      await cargar(true);
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo guardar la decisión.');
    } finally {
      setOcupado(null);
    }
  };

  const confirmar = (c: Candidato, decision: 'selected' | 'rejected') => {
    const nombre = c.fullName ?? 'esta persona';
    Alert.alert(
      decision === 'selected' ? 'Seleccionar candidato' : 'Descartar candidato',
      decision === 'selected'
        ? `${nombre} quedará marcado como seleccionado.`
        : `${nombre} quedará descartado. La persona NO recibe un aviso automático.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        decision === 'selected'
          ? { text: 'Seleccionar', onPress: () => void contestar(c, decision) }
          : { text: 'Descartar', style: 'destructive', onPress: () => void contestar(c, decision) },
      ],
    );
  };

  const activas = ofertas.filter((o) => o.status !== 'closed');
  const cerradas = ofertas.length - activas.length;

  /** Candidaturas sin responder, con su oferta. Es LO URGENTE: alguien espera. */
  const porContestar = activas.flatMap((o) =>
    (o.applicants ?? [])
      .filter((a) => a.status !== 'selected' && a.status !== 'rejected')
      .map((a) => ({ oferta: o, candidato: a })));

  /** Ofertas que vencen pronto: si caducan, dejan de recibir candidaturas. */
  const porVencer = activas
    .map((o) => ({ o, dias: diasHasta(o.expiresAt) }))
    .filter((x) => x.dias !== null && x.dias <= 7)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));

  const empresa = activas[0]?.company ?? ofertas[0]?.company ?? 'Tu empresa';

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={12} style={styles.volver}>
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900' }}>Hoy</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={2}>
            {empresa} · lo que caduca, no lo que se configura
          </Text>
        </View>
      </View>

      {error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>{error}</Text>
          <GhostButton title="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          {/*
            La puerta a la otra parte: UNA sola. Es la misma forma que el panel del hotel y que
            el de la tienda, para que los tres entornos se reconozcan.
          */}
          <Pressable
            onPress={() => router.push('/work-gestion' as never)}
            accessibilityRole="button"
            accessibilityLabel="Gestión: ofertas, publicar y plan"
            style={[styles.puente, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={[styles.puenteIcono, { backgroundColor: alpha(colors.primary, 0.12) }]}>
              <Settings size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>Gestión</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 2 }}>
                Mis ofertas, publicar, cerrar y plan
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>

          {aviso ? (
            <View style={[styles.aviso, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.25) }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 19 }}>{aviso}</Text>
            </View>
          ) : null}

          {/* Resumen del día */}
          <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 14 }]}>
            <Text style={{ color: colors.textPrimary, fontSize: 15.5, fontWeight: '900' }}>
              {activas.length} oferta(s) activa(s){cerradas ? ` · ${cerradas} cerrada(s)` : ''}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 4, lineHeight: 18 }}>
              {porContestar.length
                ? `${porContestar.length} candidatura(s) sin responder`
                : 'No tienes candidaturas sin responder'}
              {plan ? ` · plan ${plan.planName} (${plan.activeJobs}/${plan.offerLimit} ofertas)` : ''}
              {plan?.expiresAt ? ` · vence el ${new Date(plan.expiresAt).toLocaleDateString('fr-FR')}` : ''}
            </Text>
          </View>

          {/* ── LO QUE CADUCA: gente esperando respuesta ── */}
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 20, marginBottom: 3 }}>
            Por contestar ({porContestar.length})
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: 10 }}>
            Alguien ha escrito para tu oferta y sigue sin respuesta.
          </Text>

          {porContestar.length ? porContestar.map(({ oferta, candidato }) => (
            <View
              key={candidato.id}
              style={[styles.tarjeta, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: '900' }}>
                {candidato.fullName ?? 'Candidato sin nombre'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 2 }} numberOfLines={2}>
                {oferta.title} · {oferta.city}
              </Text>
              {candidato.phone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Phone size={13} color={colors.textSecondary} />
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>{candidato.phone}</Text>
                </View>
              ) : null}
              {candidato.note ? (
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, lineHeight: 18, marginTop: 6 }} numberOfLines={4}>
                  «{candidato.note}»
                </Text>
              ) : null}
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 6 }}>
                Escribió el {new Date(candidato.createdAt).toLocaleDateString('fr-FR')}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={ocupado === candidato.id ? 'Guardando…' : 'Seleccionar'}
                    onPress={() => confirmar(candidato, 'selected')}
                    disabled={ocupado === candidato.id}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <GhostButton
                    title="Descartar"
                    onPress={() => confirmar(candidato, 'rejected')}
                    disabled={ocupado === candidato.id}
                  />
                </View>
              </View>
            </View>
          )) : (
            <View style={[styles.resumen, { borderColor: alpha(colors.success, 0.35), backgroundColor: alpha(colors.success, 0.07) }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>
                ✓ No hay nadie esperando respuesta
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 3 }}>
                Todas las candidaturas están contestadas.
              </Text>
            </View>
          )}

          {/* ── Ofertas que vencen: dejan de recibir candidaturas ── */}
          {porVencer.length ? (
            <>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 22, marginBottom: 3 }}>
                Se te acaban ({porVencer.length})
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: 10 }}>
                Cuando una oferta vence deja de aparecer y deja de recibir candidaturas.
              </Text>
              {porVencer.map(({ o, dias }) => (
                <Pressable
                  key={o.id}
                  onPress={() => router.push('/work-gestion' as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${o.title}, ${dias !== null && dias >= 0 ? `vence en ${dias} día(s)` : 'vencida'}`}
                  style={[styles.pendiente, { borderColor: alpha(colors.secondary, 0.35), backgroundColor: alpha(colors.secondary, 0.06) }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }} numberOfLines={2}>
                      {o.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 3 }}>
                      {o.city} · {o.applicantsCount} candidatura(s) ·{' '}
                      {dias !== null && dias >= 0 ? `vence en ${dias} día(s)` : 'vencida'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.secondary} />
                </Pressable>
              ))}
            </>
          ) : null}

          {!ofertas.length ? (
            <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 18 }]}>
              <Text style={{ color: colors.textPrimary, fontSize: 15.5, fontWeight: '900' }}>
                Todavía no has publicado ninguna oferta
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 18, marginTop: 6 }}>
                Una oferta es lo que ve quien busca trabajo: el puesto, lo que se pide, el salario y
                la ciudad. Aquí llegarán las candidaturas y desde aquí las contestarás.
              </Text>
              <View style={{ marginTop: 12 }}>
                <GhostButton title="Publicar una oferta" onPress={() => router.push('/work-publish' as never)} />
              </View>
            </View>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: 8 }}>
              Publicar, editar, cerrar o duplicar una oferta está en «Gestión».
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <GhostButton title="Gestión de ofertas" onPress={() => router.push('/work-gestion' as never)} />
              </View>
              <View style={{ flex: 1 }}>
                <GhostButton title="Ver mi plan" onPress={() => router.push('/work-planes' as never)} />
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 }}>
            <Briefcase size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, flex: 1 }}>
              Las ofertas y sus candidaturas se gestionan en Buscar Work. Conectarlas al catálogo de
              Life Book es el paso siguiente del estándar.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 }}>
            <Users size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, flex: 1 }}>
              Descartar no avisa a la persona: el aviso al candidato es decisión de producto.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  puente: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 56,
  },
  puenteIcono: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  aviso: { borderWidth: 1, borderRadius: radios.md, padding: 11, marginTop: 12 },
  resumen: { borderWidth: 1, borderRadius: 14, padding: 13 },
  tarjeta: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10 },
  pendiente: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: radios.md, padding: 12, marginBottom: 8, minHeight: 56,
  },
});
