/**
 * DocumentsScreen — Documentos según el rol (/documents).
 * · Pasajero: Documento de identidad · Teléfono verificado · Métodos de pago.
 * · Conductor: Licencia · Permiso del vehículo · Seguro · Revisión técnica ·
 *   Registro del vehículo (estados reales del alta: Pendiente/Subido/
 *   Verificado/Rechazado/Vencido).
 * Accesible desde /settings → "Mis documentos".
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, BadgeCheck, CircleAlert, CircleX, CreditCard, FileText, IdCard,
  OctagonAlert, Phone, ShieldCheck, Truck,
} from 'lucide-react-native';
import {alpha, espaciado, neutro, peso, radios, tipografia, useTheme} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { authApi, type MeProfile } from '../api/auth';
import { driverApi } from '../api/driver';
import { brand } from '@egrouteplan/ui-kit';

export default function DocumentsScreen() {
  return (
    <AuthGate>
      <DocumentsContent />
    </AuthGate>
  );
}

type DocState = 'Verificado' | 'Pendiente' | 'Subido' | 'Rechazado' | 'Vencido';

const STATE_STYLE: Record<DocState, { bg: string; fg: string }> = {
  Verificado: { bg: brand.successSoft, fg: brand.successPressed },
  Subido: { bg: brand.primarySoft, fg: brand.primaryPressed },
  Pendiente: { bg: brand.warningSoft, fg: brand.secondaryPressed },
  Rechazado: { bg: brand.dangerSoft, fg: brand.dangerPressed },
  Vencido: { bg: brand.dangerSoft, fg: brand.dangerPressed },
};

function Badge({ state }: { state: DocState }) {
  const s = STATE_STYLE[state];
  const Icon = state === 'Verificado' ? BadgeCheck : state === 'Rechazado' ? CircleX : state === 'Vencido' ? OctagonAlert : state === 'Pendiente' ? CircleAlert : ShieldCheck;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: s.bg }]}>
      <Icon size={12} color={s.fg} />
      <Text style={[badgeStyles.txt, { color: s.fg }]}>{state}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 },
  txt: { fontSize: tipografia.micro, fontWeight: peso.titulo },
});

function DocumentsContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [driverProgress, setDriverProgress] = useState<{ code: string; label: string; state: DocState }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await authApi.me();
        setProfile(me);
        if (me.role === 'DRIVER') {
          try {
            const prog = await driverApi.requirements();
            // Mapea el catálogo real a la lista legible de Documentos · Conductor.
            const want = ['driving_license', 'professional_license', 'plate_inspection', 'insurance_rc', 'itv'];
            const labelOf = (code: string) => prog.categories.flatMap((c) => c.docs).find((d) => d.code === code)?.label ?? code;
            const rows = want.map((code) => {
              const doc = prog.categories.flatMap((c) => c.docs).find((d) => d.code === code);
              let state: DocState = 'Pendiente';
              if (doc?.status === 'approved') state = 'Verificado';
              else if (doc?.status === 'rejected') state = 'Rechazado';
              else if (doc?.submitted) state = 'Subido';
              return { code, label: labelOf(code), state };
            });
            setDriverProgress(rows);
          } catch {
            setDriverProgress([]);
          }
        }
      } catch {
        // sin sesión / error → AuthGate redirige
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const roleLabel = profile?.role === 'DRIVER' ? 'Conductor' : profile?.role === 'ADMIN' ? 'Administrador' : 'Pasajero';

  const passengerDocs: Array<{ icon: any; label: string; hint: string; state: DocState; action?: () => void }> = [
    {
      icon: IdCard, label: 'Documento de identidad',
      hint: 'DNI o pasaporte vigente', state: profile?.kycLevel && profile.kycLevel >= 1 ? 'Verificado' : 'Pendiente',
      action: () => Alert.alert('Próximamente', 'La subida del DNI/pasaporte llegará con el módulo de identidad.'),
    },
    {
      icon: Phone, label: 'Teléfono verificado',
      hint: 'Verificado por SMS al crear la cuenta', state: profile?.status === 'ACTIVE' ? 'Verificado' : 'Pendiente',
    },
    {
      icon: CreditCard, label: 'Métodos de pago',
      hint: 'Monedero, tarjeta o efectivo', state: 'Pendiente',
      action: () => router.push('/monedero' as any),
    },
  ];

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isDriver = profile?.role === 'DRIVER';
  const driverDocs: Array<{ icon: any; label: string; hint: string; state: DocState; action?: () => void }> = [
    { icon: FileText, label: 'Licencia de conducir', hint: 'Vigente según categoría del vehículo', state: docStateOf('driving_license', driverProgress), action: () => router.push('/driver-onboarding' as any) },
    { icon: Truck, label: 'Permiso del vehículo', hint: 'Tarjeta de inspección / matrícula', state: docStateOf('plate_inspection', driverProgress), action: () => router.push('/driver-onboarding' as any) },
    { icon: ShieldCheck, label: 'Seguro del vehículo', hint: 'Responsabilidad civil vigente', state: docStateOf('insurance_rc', driverProgress), action: () => router.push('/driver-onboarding' as any) },
    { icon: CircleAlert, label: 'Revisión técnica (ITV)', hint: 'Al día para operar', state: docStateOf('itv', driverProgress), action: () => router.push('/driver-onboarding' as any) },
    { icon: IdCard, label: 'Registro / validez del vehículo', hint: 'Documentos del alta de conductor', state: docStateOf('professional_license', driverProgress), action: () => router.push('/driver-onboarding' as any) },
  ];

  const docs = isDriver ? driverDocs : passengerDocs;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Documentos</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.groupTitle}>{`Documentos · ${roleLabel}`}</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {docs.map((d, i) => {
            const Icon = d.icon;
            return (
              <Pressable
                key={d.label}
                onPress={d.action}
                disabled={!d.action}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? alpha(colors.border, 0.25) : 'transparent' },
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: alpha(colors.primary, 0.08) }]}>
                  <Icon size={19} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{d.label}</Text>
                  <Text style={[styles.rowHint, { color: colors.textSecondary }]} numberOfLines={1}>{d.hint}</Text>
                </View>
                <Badge state={d.state} />
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {isDriver
            ? 'Los estados reflejan tu alta de conductor real. Toca un documento para revisar o subirlo.'
            : 'Verifica tu identidad y añade métodos de pago para viajar y comprar sin límites.'}
        </Text>
      </ScrollView>
    </View>
  );
}

function docStateOf(code: string, progress: { code: string; state: DocState }[] | null): DocState {
  return progress?.find((p) => p.code === code)?.state ?? 'Pendiente';
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: tipografia.subCabecera, fontWeight: peso.titulo },
  content: { padding: espaciado.e16, gap: espaciado.e8 },
  groupTitle: { fontSize: tipografia.micro, fontWeight: peso.maximo, color: neutro.n600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: espaciado.e2 },
  group: { borderRadius: radios.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e13 },
  rowIcon: { width: 36, height: 36, borderRadius: radios.chip, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: tipografia.body, fontWeight: peso.maximo },
  rowHint: { fontSize: tipografia.micro, fontWeight: peso.medio, marginTop: espaciado.e2 },
  note: { fontSize: tipografia.caption, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e8, lineHeight: 17 },
});
