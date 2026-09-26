/**
 * ConductorHubScreen — "Ser Conductor": hub del conductor (EG Route Plan).
 * Tras completar el alta (documentos + aprobación), aquí elige qué función
 * desempeñará hoy. La elección se guarda como modo del día en el backend
 * (work-mode: city / intercity), que decide qué solicitudes recibe.
 *
 *  · 🚕 Taxi urbano       → modo 'city'      → /conductor (panel en línea)
 *  · 🚌 Ciudad a Ciudad   → modo 'intercity' → /intercity-publish
 *  · 🚚 Mudanza           → próximamente (sin producto aún, nunca stub)
 *
 * Ruta: /conductor-hub
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bus, CarTaxiFront, ChevronRight, Circle, ShieldCheck, Truck } from 'lucide-react-native';
import { alpha, espaciado, GhostButton, radios, tipografia, useTheme, peso, trazo, trazoIcono} from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';
import { driverApi } from '../api/driver';
import { brand } from '@egrouteplan/ui-kit';

type DriverStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'checking';

/** Pasos del alta (checklist estilo Uber Driver, ref-uber-driver.png). */
const ONBOARD_STEPS: Array<{ label: string; hint: string }> = [
  { label: 'Crea tu perfil', hint: 'Datos personales y contacto' },
  { label: 'Sube tu licencia', hint: 'Carné de conducir vigente' },
  { label: 'Verifica tu identidad', hint: 'DIP y selfie (KYC)' },
  { label: 'Registra tu vehículo', hint: 'Tipo, modelo y matrícula' },
  { label: 'Espera la aprobación', hint: 'Revisión del administrador' },
];

export default function ConductorHubScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useSession();

  const [status, setStatus] = useState<DriverStatus>('checking');
  const [mode, setMode] = useState<'city' | 'intercity' | 'both' | null>(null);
  const [vehicle, setVehicle] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setStatus('none'); return; }
    let alive = true;
    driverApi
      .status()
      .then((st) => {
        if (!alive) return;
        setStatus(st.status === 'none' && st.driver ? 'pending' : (st.status as DriverStatus));
        if (st.driver) {
          setMode((st.driver.work_mode as 'city' | 'intercity' | 'both') ?? null);
          const parts = [st.driver.vehicle_type, st.driver.vehicle_model, st.driver.vehicle_plate].filter(Boolean);
          setVehicle(parts.join(' · '));
        }
      })
      .catch(() => alive && setStatus('none'));
    return () => { alive = false; };
  }, [isAuthenticated]);

  /** Elige la función del día: guarda el modo y navega a su pantalla. */
  const choose = useCallback(async (m: 'city' | 'intercity', route: string) => {
    if (busy) return;
    setBusy(true);
    try { await driverApi.setWorkMode(m); } catch { /* offline: se navega igual, el modo se ajusta luego */ }
    router.push(route as any);
  }, [busy, router]);

  const s = styles(colors);

  const goAuth = () => router.push('/auth' as any);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cabecera */}
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Ser Conductor</Text>
        <View style={{ width: 22 }} />
      </View>

      {!isAuthenticated || status === 'none' || status === 'checking' ? (
        <ScrollView contentContainerStyle={[s.onboard, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
          {status === 'checking' && isAuthenticated ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={colors.text.primary} />
            </View>
          ) : (
            <>
              {/* Bienvenida estilo Uber Driver (ref-uber-driver.png) */}
              <View style={[s.welcomeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.statusIcon, { backgroundColor: alpha(colors.primary, 0.14) }]}>
                  <CarTaxiFront size={26} color={colors.text.primary} />
                </View>
                <Text style={[s.welcomeTitle, { color: colors.textPrimary }]}>
                  {isAuthenticated ? 'Te damos la bienvenida, conductor' : 'Zona del conductor'}
                </Text>
                <Text style={[s.welcomeSub, { color: colors.textSecondary }]}>
                  Completa los pasos para comenzar a generar ganancias.
                </Text>
              </View>

              {/* Checklist de onboarding */}
              <View style={[s.checklistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.checklistHeader, { borderBottomColor: colors.border }]}>
                  <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>Alta de conductor</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                    {isAuthenticated ? '0 de 5 completados' : 'Inicia sesión para empezar'}
                  </Text>
                </View>
                {ONBOARD_STEPS.map((stp, i) => (
                  <View key={stp.label} style={[s.checkRow, { borderBottomColor: colors.border }]}>
                    <Circle size={18} color={colors.textSecondary} strokeWidth={trazoIcono.base} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>{stp.label}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>{stp.hint}</Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.maximo }}>Paso {i + 1}</Text>
                  </View>
                ))}
              </View>

              <GhostButton
                title={isAuthenticated ? 'Empezar mi alta · crear perfil y documentos' : 'Iniciar sesión'}
                onPress={() => (isAuthenticated ? router.push('/driver-onboarding' as any) : goAuth())}
              />
              <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e4 }}>
                Aprobación por el administrador · Licencia, DIP y selfie
              </Text>
            </>
          )}
        </ScrollView>
      ) : status === 'pending' ? (
        <View style={s.center}>
          <ShieldCheck size={42} color={colors.text.secondary} />
          <Text style={[s.big, { color: colors.textPrimary }]}>Documentos en revisión</Text>
          <Text style={[s.body, { color: colors.textSecondary }]}>
            El administrador está revisando tu alta. Te avisaremos en cuanto estés aprobado para empezar a recibir funciones.
          </Text>
          <GhostButton title="Ver mi alta" onPress={() => router.push('/driver-onboarding' as any)} />
        </View>
      ) : status === 'rejected' ? (
        <View style={s.center}>
          <ShieldCheck size={42} color={colors.text.danger} />
          <Text style={[s.big, { color: colors.text.danger }]}>Alta rechazada</Text>
          <Text style={[s.body, { color: colors.textSecondary }]}>
            Algunos documentos no fueron aceptados. Revisa tu alta y vuelve a enviarlos.
          </Text>
          <GhostButton title="Revisar mi alta" onPress={() => router.push('/driver-onboarding' as any)} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
          {/* Estado del conductor */}
          <View style={[s.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.statusIcon, { backgroundColor: alpha(colors.success, 0.15) }]}>
              <ShieldCheck size={20} color={colors.text.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.success, fontWeight: peso.titulo, fontSize: tipografia.body }}>Conductor aprobado</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2 }}>
                {vehicle || 'Vehículo no registrado'} · Modo actual: {mode === 'intercity' ? 'Ciudad a Ciudad' : mode === 'city' ? 'Taxi urbano' : 'Ambos'}
              </Text>
            </View>
          </View>

          <Text style={[s.question, { color: colors.textPrimary }]}>¿Qué vas a hacer hoy?</Text>
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            Elige tu función. Lo recordamos como tu modo del día: en Taxi urbano recibirás solicitudes de ciudad; en Ciudad a Ciudad no.
          </Text>

          {/* 🚕 Taxi urbano */}
          <Pressable
            onPress={() => choose('city', '/conductor')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Taxi urbano: salir en línea y aceptar carreras de ciudad"
            style={({ pressed }) => [s.opt, { backgroundColor: colors.card, borderColor: colors.border, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            <View style={[s.optIcon, { backgroundColor: alpha(brand.success, 0.14) }]}>
              <CarTaxiFront size={24} color={colors.text.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Taxi urbano</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 16 }}>
                Sal en línea, recibe solicitudes en la ciudad y gestiona tus carreras.
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>

          {/* 🚌 Ciudad a Ciudad */}
          <Pressable
            onPress={() => choose('intercity', '/intercity-publish')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Ciudad a Ciudad: publicar y gestionar viajes interurbanos"
            style={({ pressed }) => [s.opt, { backgroundColor: colors.card, borderColor: colors.border, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            <View style={[s.optIcon, { backgroundColor: alpha(brand.primary, 0.14) }]}>
              <Bus size={24} color={colors.text.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Ciudad a Ciudad</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 16 }}>
                Publica viajes interurbanos (Malabo ↔ Bata, etc.), reservas y cobros.
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>

          {/* 🚚 Mudanza (próximamente, sin stub) */}
          <View style={[s.opt, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.55 }]}>
            <View style={[s.optIcon, { backgroundColor: alpha(colors.textSecondary, 0.12) }]}>
              <Truck size={24} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Mudanza</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 16 }}>
                Traslados de carga y mudanzas. Llegará pronto a tu zona.
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.rotulo, fontWeight: peso.maximo, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Próximamente
            </Text>
          </View>

          <GhostButton title="Perfil del conductor · ganancias y documentos" onPress={() => router.push('/driver-profile' as any)} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
    title: { fontSize: tipografia.cabecera, fontWeight: peso.maximo, color: c.textPrimary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e28, gap: espaciado.e12 },
    big: { fontSize: tipografia.title, fontWeight: peso.titulo, textAlign: 'center' },
    body: { fontSize: tipografia.body, lineHeight: 20, textAlign: 'center', fontWeight: peso.medio },
    content: { padding: espaciado.e20, gap: espaciado.e12 },
    statusCard: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderRadius: radios.lg, borderWidth: trazo.base, padding: espaciado.e14 },
    statusIcon: { width: 40, height: 40, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
    question: { fontSize: tipografia.subCabecera, fontWeight: peso.titulo, marginTop: espaciado.e8 },
    sub: { fontSize: tipografia.caption, lineHeight: 18, fontWeight: peso.medio, marginTop: -6 },
    opt: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e14, borderRadius: radios.panel, borderWidth: trazo.base, padding: espaciado.e16 },
    optIcon: { width: 52, height: 52, borderRadius: radios.lg, alignItems: 'center', justifyContent: 'center' },
    // Checklist onboarding (estilo Uber Driver)
    onboard: { padding: espaciado.e16, gap: espaciado.e12, flexGrow: 1 },
    welcomeCard: { alignItems: 'center', borderRadius: radios.panel, borderWidth: trazo.fino, padding: espaciado.e20, gap: espaciado.e6 },
    welcomeTitle: { fontSize: tipografia.cifra, fontWeight: peso.titulo, textAlign: 'center', marginTop: espaciado.e6 },
    welcomeSub: { fontSize: tipografia.body, color: c.textSecondary, textAlign: 'center', lineHeight: 18, fontWeight: peso.medio },
    checklistCard: { borderRadius: radios.panel, borderWidth: trazo.fino, paddingHorizontal: espaciado.e16, overflow: 'hidden' },
    checklistHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth },
  });
