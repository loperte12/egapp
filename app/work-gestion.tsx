/**
 * work-gestion — PARTE 2 · **GESTIÓN** DEL ENTORNO DE CONTROL DEL EMPLEADOR.
 *
 * Misma forma que `lifebook-hotel-gestion` (hotel) y `lifebook-merchant-gestion` (mercado):
 * resumen + **lo que falta** + filas de configuración + una puerta a «Hoy». Los tres entornos se
 * tienen que reconocer de un vistazo; si cada vertical inventara su estructura, el estándar
 * (`ESTANDAR-ENTORNOS-DE-CONTROL.md`) no serviría de nada.
 *
 * ── Lo que esta pantalla dice, y que hoy no dice nadie ────────────────────────
 *  · **Ofertas vencidas que siguen abiertas**: no aparecen, no reciben candidaturas y el
 *    empleador cree que siguen publicadas.
 *  · **Ofertas sin candidaturas**: puede ser normal, o puede ser que falte el salario o los
 *    requisitos. Se enseña para poder decidir, no para alarmar.
 *  · **El plan**: cuántas ofertas permite y cuándo vence. Si el plan agotó su límite, publicar
 *    fallará — mejor saberlo aquí.
 *
 * No hace peticiones nuevas: `myJobs()` y `myPlan()` ya devuelven todo esto.
 *
 * Sigue habiendo una deuda anotada: `work-publish` (31 KB) mezcla publicar una oferta, ver las
 * mías y contestar candidaturas. Esta pantalla le quita las dos últimas responsabilidades de
 * encima, pero **partirlo entero es trabajo aparte** y no se hace a escondidas aquí.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, radios, tipografia, useScreenGuard, useTheme } from '@egrouteplan/ui-kit';
import {
  ArrowLeft, Briefcase, ChevronRight, Clock, CreditCard, Plus, TriangleAlert, Users,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { workApi, type WorkJob, type WorkPlan } from '../api/work';
import { ApiError } from '../api/httpClient';

export default function WorkGestionScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

/** Días que faltan hasta una fecha (negativo si ya pasó). */
function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

interface Pendiente { clave: string; texto: string; porque: string; }

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

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [mis, miPlan] = await Promise.allSettled([workApi.myJobs(), workApi.myPlan()]);
      if (mis.status === 'fulfilled') setOfertas(mis.value ?? []);
      else throw mis.reason;
      setPlan(miPlan.status === 'fulfilled' ? miPlan.value : null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la gestión.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const activas = ofertas.filter((o) => o.status !== 'closed');
  const cerradas = ofertas.length - activas.length;
  const vencidas = activas.filter((o) => { const d = diasHasta(o.expiresAt); return d !== null && d < 0; });
  const sinCandidatos = activas.filter((o) => (o.applicantsCount ?? 0) === 0);
  const totalCandidaturas = ofertas.reduce((a, o) => a + (o.applicantsCount ?? 0), 0);

  const pendientes: Pendiente[] = [];
  if (vencidas.length) {
    pendientes.push({
      clave: 'vencidas',
      texto: `${vencidas.length} oferta(s) vencida(s) y sin cerrar`,
      porque: 'No aparecen y no reciben candidaturas, pero siguen contando en tu panel.',
    });
  }
  if (plan && plan.activeJobs >= plan.offerLimit) {
    pendientes.push({
      clave: 'limite',
      texto: 'Has llegado al límite de ofertas de tu plan',
      porque: `El plan ${plan.planName} permite ${plan.offerLimit}. Cierra una o cambia de plan.`,
    });
  }
  if (plan?.expiresAt && (diasHasta(plan.expiresAt) ?? 99) <= 7) {
    pendientes.push({
      clave: 'plan',
      texto: `Tu plan vence en ${diasHasta(plan.expiresAt)} día(s)`,
      porque: 'Al vencer, las ofertas dejan de publicarse.',
    });
  }
  if (ofertas.length && !totalCandidaturas) {
    pendientes.push({
      clave: 'sin-candidatos',
      texto: 'Ninguna oferta ha recibido candidaturas',
      porque: 'Revisa salario, requisitos y ciudad: son lo que decide que alguien escriba.',
    });
  }

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
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900' }}>Gestión</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={2}>
            {ofertas[0]?.company ?? 'Tu empresa'} · lo que se configura, no lo del día
          </Text>
        </View>
      </View>

      {error ? (
        <View style={{ padding: espaciado.e16 }}>
          <Text style={{ color: colors.textSecondary, marginBottom: espaciado.e12 }}>{error}</Text>
          <GhostButton title="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textPrimary, fontSize: 15.5, fontWeight: '900' }}>
              {activas.length} oferta(s) activa(s){cerradas ? ` · ${cerradas} cerrada(s)` : ''}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4, lineHeight: 18 }}>
              {totalCandidaturas} candidatura(s) en total
              {plan ? ` · plan ${plan.planName}: ${plan.activeJobs}/${plan.offerLimit} ofertas` : ' · sin plan contratado'}
              {plan?.expiresAt ? ` · vence el ${new Date(plan.expiresAt).toLocaleDateString('fr-FR')}` : ''}
            </Text>
          </View>

          {pendientes.length ? (
            <View style={{ marginTop: espaciado.e18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e8 }}>
                <TriangleAlert size={16} color={colors.secondary} />
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginLeft: espaciado.e7 }}>
                  Te falta por completar ({pendientes.length})
                </Text>
              </View>
              {pendientes.map((x) => (
                <View
                  key={x.clave}
                  style={[styles.pendiente, { borderColor: alpha(colors.secondary, 0.35), backgroundColor: alpha(colors.secondary, 0.06) }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>{x.texto}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3, lineHeight: 17 }}>{x.porque}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : ofertas.length ? (
            <View style={[styles.resumen, { borderColor: alpha(colors.success, 0.35), backgroundColor: alpha(colors.success, 0.07), marginTop: espaciado.e18 }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>
                ✓ Tus ofertas están en orden
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
                Sin vencidas abiertas, dentro del plan y con candidaturas.
              </Text>
            </View>
          ) : null}

          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: espaciado.e22, marginBottom: espaciado.e8 }}>
            Configurar
          </Text>

          <Fila
            icono={<Briefcase size={18} color={colors.primary} />}
            titulo="Mis ofertas y publicar"
            detalle={ofertas.length
              ? `${ofertas.length} oferta(s) · crear, editar, cerrar y duplicar`
              : 'Publica la primera oferta: puesto, requisitos, salario y ciudad'}
            onPress={() => router.push('/work-publish' as never)}
          />
          <Fila
            icono={<Users size={18} color={colors.primary} />}
            titulo="Candidaturas"
            detalle={totalCandidaturas
              ? `${totalCandidaturas} en total · contéstalas en «Hoy»`
              : 'Todavía no ha escrito nadie'}
            onPress={() => router.push('/work-panel' as never)}
          />
          <Fila
            icono={<CreditCard size={18} color={colors.primary} />}
            titulo="Plan y precios"
            detalle={plan
              ? `${plan.planName} · ${plan.offerLimit} oferta(s) y destacados`
              : 'Sin plan contratado: mira lo que incluye cada uno'}
            onPress={() => router.push('/work-planes' as never)}
          />
          <Fila
            icono={<Plus size={18} color={colors.primary} />}
            titulo="Publicar una oferta nueva"
            detalle="Aparece en Buscar Work al enviarla"
            onPress={() => router.push('/work-publish' as never)}
          />

          <View style={{ marginTop: espaciado.e22 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e8 }}>
              Quién ha escrito y sigue sin respuesta está en la otra parte, «Hoy».
            </Text>
            <GhostButton title="Ir a «Hoy» (candidaturas)" onPress={() => router.push('/work-panel' as never)} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7, marginTop: espaciado.e18 }}>
            <Clock size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, flex: 1 }}>
              Trabajo vive hoy fuera de Life Book (módulo propio). Traerlo al catálogo —oferta como
              publicación, empresa como tienda— es el paso siguiente del estándar.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Fila({ icono, titulo, detalle, onPress }: {
  icono: React.ReactNode; titulo: string; detalle: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={[styles.fila, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={[styles.filaIcono, { backgroundColor: alpha(colors.primary, 0.12) }]}>{icono}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>{titulo}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 17 }}>{detalle}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  resumen: { borderWidth: 1, borderRadius: 14, padding: espaciado.e13 },
  pendiente: { borderWidth: 1, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e11,
    borderWidth: 1, borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56,
  },
  filaIcono: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
