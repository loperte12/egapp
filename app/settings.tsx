/**
 * SettingsScreen — página independiente de AJUSTES (/settings).
 * Se abre desde la barra del Perfil o el drawer ☰. NUNCA lista de ajustes
 * inline en el perfil. Grupos: Apariencia · Idioma · Documentos (según rol,
 * → /documents) · Soporte · Sesión.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SOPORTE, escribirASoporte, whatsappSoporte, llamarASoporte } from '../constants/soporte';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Ban, Bell, Check, ChevronRight, Clock, Eye, FileWarning, Flag, Globe, Headset,
  HelpCircle, Languages, LogOut, Mail, MapPin, Moon, Phone, Siren, Type, X,
} from 'lucide-react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { Volver } from '../components/Volver';
import { AuthGate } from '../core/AuthGate';
import { useSession } from '../state/session';
import { authApi, type MeProfile } from '../api/auth';
import { lifebookSettingsApi, type LbSettings } from '../api/lifebook';
import { LB_CITIES, LB_NOTIF_ROWS, LB_PRIVACY_KEYS, LB_VIS_LABEL } from '../constants/lifebook';
import EmergencyModal from '../components/EmergencyModal';
import { formaHoja } from '../components/lifebook/ui/Sheet';

export default function SettingsScreen() {
  return (
    <AuthGate>
      <SettingsContent />
    </AuthGate>
  );
}

const LANG_OPTIONS = [
  { code: 'es-GQ', label: 'Español (Guinea Ecuatorial)' },
  { code: 'fr', label: 'Francés' },
  { code: 'pt', label: 'Portugués' },
  { code: 'fang', label: 'Fang' },
  { code: 'bubi', label: 'Bubi' },
];

function SettingsContent() {
  const { colors, isDark, setMode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useSession();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState('es-GQ');
  const [fontOpen, setFontOpen] = useState(false);
  const [fontSize, setFontSize] = useState('Normal');
  const [notifOpen, setNotifOpen] = useState(false);
  const [notif, setNotif] = useState('Activadas');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [lb, setLb] = useState<LbSettings | null>(null);
  const [lbPick, setLbPick] = useState<null | { title: string; group: 'privacy' | 'publish'; key: string; options: Array<{ label: string; value: string }>; current: string }>(null);
  const [cityOpen, setCityOpen] = useState(false);

  useEffect(() => {
    authApi.me().then(setProfile).catch(() => {});
    lifebookSettingsApi.get().then(setLb).catch(() => {});
  }, []);

  const lbSave = (group: 'privacy' | 'publish' | 'notifications' | 'content', patch: Record<string, unknown>) => {
    setLb((prev) => {
      if (!prev) return prev;
      const curGroup = (prev as unknown as Record<string, Record<string, unknown>>)[group] ?? {};
      return { ...prev, [group]: { ...curGroup, ...patch } } as LbSettings;
    });
    lifebookSettingsApi.patch({ [group]: patch } as never).catch(() => {
      Alert.alert('Ajustes de Life Book', 'No se pudo guardar. Inténtalo de nuevo.');
      lifebookSettingsApi.get().then(setLb).catch(() => {});
    });
  };

  const openPrivacyPick = (key: string, label: string, nobody: boolean) => {
    const values = key === 'location' || key === 'email'
      ? ['public', 'followers', 'nobody']
      : key === 'messages'
        ? ['public', 'followers', 'private', 'nobody']
        : ['public', 'followers', 'private'];
    const current = (lb?.privacy as Record<string, string> | undefined)?.[key] ?? 'public';
    setLbPick({
      title: label, group: 'privacy', key,
      options: values.filter((v) => v !== 'nobody' || nobody).map((v) => ({ label: LB_VIS_LABEL[v] ?? v, value: v })),
      current,
    });
  };

  const roleLabel = profile?.role === 'DRIVER' ? 'Conductor' : profile?.role === 'ADMIN' ? 'Administrador' : 'Pasajero';

  const doLogout = async () => {
    await logout();
    router.replace('/');
  };

  const selectSheet = (title: string, options: string[], current: string, onPick: (o: string) => void, onClose: () => void, allowAll = true, visible = false) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheetCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
        </View>
        {options.map((o) => {
          const active = o === current;
          return (
            <Pressable
              key={o}
              onPress={() => { onPick(o); onClose(); }}
              disabled={!allowAll && !active}
              style={({ pressed }) => [styles.sheetRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
            >
              <Text style={[styles.sheetRowTxt, { color: active ? colors.primary : colors.textPrimary }]}>{o}</Text>
              {active ? <Check size={18} color={colors.primary} /> : (!allowAll ? <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: peso.fuerte }}>Próximamente</Text> : null)}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Cabecera */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Volver />
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Ajustes</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {/* APARIENCIA */}
        <Text style={styles.groupTitle}>Apariencia</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row
            icon={Moon}
            label="Tema oscuro"
            right={<Switch value={isDark} onValueChange={(v) => setMode(v ? 'dark' : 'light')} trackColor={{ true: colors.primary }} accessibilityLabel="Tema oscuro" />}
            hint={isDark ? 'Activado' : 'Desactivado'}
          />
          <Row icon={Type} label="Tamaño de texto" hint={fontSize} onPress={() => setFontOpen(true)} />
          <Row icon={Bell} label="Notificaciones visuales" hint={notif} onPress={() => setNotifOpen(true)} last />
        </View>

        {/* IDIOMA */}
        <Text style={styles.groupTitle}>Idioma</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row icon={Languages} label="Idioma" hint={LANG_OPTIONS.find((l) => l.code === lang)?.label} onPress={() => setLangOpen(true)} last />
        </View>

        {/* DOCUMENTOS según rol → /documents */}
        <Text style={styles.groupTitle}>{`Documentos · ${roleLabel}`}</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row
            icon={FileWarning}
            label="Mis documentos"
            hint={profile ? `${roleLabel} · estados y vencimientos` : ''}
            onPress={() => router.push('/documents' as any)}
            last
          />
        </View>

        {/* ESTADO 24H → /status */}
        <Text style={styles.groupTitle}>Estado 24h</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row
            icon={Clock}
            label="Mi estado 24h"
            hint="Publicar, cambiar y ajustes"
            onPress={() => router.push('/status' as any)}
            last
          />
        </View>

        {/* LIFE BOOK — ajustes del módulo */}
        {lb && (
          <>
            <Text style={styles.groupTitle}>Life Book · Privacidad</Text>
            <View style={[styles.group, { backgroundColor: colors.card }]}>
              {LB_PRIVACY_KEYS.map((p, i) => {
                const val = (lb.privacy as Record<string, string>)[p.key] ?? 'public';
                return (
                  <Row
                    key={p.key}
                    icon={Eye}
                    label={p.label}
                    hint={LB_VIS_LABEL[val] ?? val}
                    onPress={() => openPrivacyPick(p.key, p.label, p.nobody)}
                    last={i === LB_PRIVACY_KEYS.length - 1}
                  />
                );
              })}
            </View>
            <Text style={styles.groupTitle}>Life Book · Notificaciones</Text>
            <View style={[styles.group, { backgroundColor: colors.card }]}>
              {LB_NOTIF_ROWS.map((n, i) => {
                const on = !!((lb.notifications as Record<string, boolean>)[n.key]);
                return (
                  <Row
                    key={n.key}
                    icon={Bell}
                    label={n.label}
                    hint={on ? 'Activado' : 'Apagado'}
                    last={i === LB_NOTIF_ROWS.length - 1}
                    right={<Switch value={on} onValueChange={(v) => lbSave('notifications', { [n.key]: v })} trackColor={{ true: colors.primary }} accessibilityLabel={n.label} />}
                  />
                );
              })}
            </View>
            <Text style={styles.groupTitle}>Life Book · Contenido</Text>
            <View style={[styles.group, { backgroundColor: colors.card }]}>
              <Row
                icon={Eye}
                label="Filtro de contenido sensible"
                hint={lb.content.sensitiveFilter ? 'Activado' : 'Apagado'}
                right={<Switch value={lb.content.sensitiveFilter} onValueChange={(v) => lbSave('content', { sensitiveFilter: v })} trackColor={{ true: colors.primary }} accessibilityLabel="Filtro de contenido sensible" />}
              />
              <Row
                icon={MapPin}
                label="Ciudades preferidas"
                hint={lb.content.cities?.join(' · ') || 'Ninguna'}
                onPress={() => setCityOpen(true)}
              />
              <Row
                icon={Eye}
                label="Visibilidad por defecto al publicar"
                hint={LB_VIS_LABEL[lb.publish.defaultVisibility] ?? lb.publish.defaultVisibility}
                onPress={() => setLbPick({
                  title: 'Visibilidad por defecto al publicar', group: 'publish', key: 'defaultVisibility',
                  options: ['public', 'followers', 'private'].map((v) => ({ label: LB_VIS_LABEL[v] ?? v, value: v })),
                  current: lb.publish.defaultVisibility,
                })}
              />
              <Row
                icon={Ban}
                label="Usuarios bloqueados"
                hint="Ver y administrar"
                onPress={() => router.push('/lifebook-blocks' as never)}
                last
              />
            </View>
          </>
        )}

        {/* SOPORTE */}
        <Text style={styles.groupTitle}>Soporte</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {/*
            SOPORTE REAL (auditoría de diseño, D-37). Aquí había cuatro filas que respondían
            «Próximamente» mientras tres pantallas de dinero decían «contacta soporte». Se
            sustituyen por los tres canales que existen de verdad y el reporte de problemas.
          */}
          <Row icon={Headset} label="Ayuda por WhatsApp" hint={SOPORTE.telefono} onPress={() => { void whatsappSoporte('Hola, necesito ayuda con EG Route Plan.'); }} />
          <Row icon={Mail} label="Escribir un correo" hint={SOPORTE.email} onPress={() => { void escribirASoporte('Ayuda con EG Route Plan'); }} />
          <Row icon={Phone} label="Llamar al soporte" hint={SOPORTE.telefono} onPress={() => { void llamarASoporte(); }} />
          <Row icon={Flag} label="Reportar un problema" onPress={() => { void escribirASoporte('Problema en la app', 'Cuéntanos qué pasó (qué hacías, qué esperabas y qué salió):\n\n'); }} last />
        </View>
        <Pressable
          onPress={() => setEmergencyOpen(true)}
          style={({ pressed }) => [styles.emergency, { backgroundColor: pressed ? alpha(colors.danger, 0.14) : alpha(colors.danger, 0.08) }]}
        >
          <Siren size={19} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: peso.maximo, fontSize: tipografia.body }}>Emergencia</Text>
        </Pressable>

        {/* SESIÓN */}
        <View style={[styles.group, { marginTop: espaciado.e16, backgroundColor: colors.card }]}>
          <Row icon={LogOut} label="Cerrar sesión" danger centered onPress={() => setConfirmLogout(true)} last />
        </View>

        <Text style={[styles.version, { color: colors.textSecondary }]}>EG Route Plan · v1.0.0</Text>
      </ScrollView>

      {/* Confirmación de cierre de sesión */}
      <Modal visible={confirmLogout} transparent animationType="fade" onRequestClose={() => setConfirmLogout(false)} statusBarTranslucent>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.confirmCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>¿Cerrar sesión?</Text>
            <Text style={[styles.confirmBody, { color: colors.textSecondary }]}>Podrás volver a entrar con tu teléfono y contraseña cuando quieras.</Text>
            <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e16 }}>
              <Pressable onPress={() => setConfirmLogout(false)} style={[styles.confirmBtn, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo }}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={doLogout} style={[styles.confirmBtn, { backgroundColor: colors.danger }]}>
                <Text style={{ color: brand.white, fontWeight: peso.maximo }}>Cerrar sesión</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {selectSheet('Idioma', LANG_OPTIONS.map((l) => l.label), LANG_OPTIONS.find((l) => l.code === lang)?.label ?? 'es-GQ', (o) => {
        const found = LANG_OPTIONS.find((l) => l.label === o);
        if (found && found.code !== 'es-GQ') { Alert.alert('Próximamente', 'Las traducciones a otros idiomas llegarán en una próxima actualización. Por ahora la app está en español.'); return; }
        setLang(found?.code ?? 'es-GQ');
      }, () => setLangOpen(false), false, langOpen)}
      {selectSheet('Tamaño de texto', ['Pequeño', 'Normal', 'Grande', 'Muy grande'], fontSize, (o) => {
        if (o !== 'Normal') { Alert.alert('Próximamente', 'El cambio global de tamaño de letra llegará en una próxima actualización.'); return; }
        setFontSize(o);
      }, () => setFontOpen(false), false, fontOpen)}
      {selectSheet('Notificaciones visuales', ['Activadas', 'Solo importantes', 'Desactivadas'], notif, (o) => {
        setNotif(o);
        Alert.alert('Guardado', `Notificaciones: ${o}.`);
      }, () => setNotifOpen(false), true, notifOpen)}

      {/* Selector de privacidad de Life Book */}
      {lbPick && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLbPick(null)} statusBarTranslucent>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setLbPick(null)} />
          <View style={[styles.sheetCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{lbPick.title}</Text>
              <Pressable onPress={() => setLbPick(null)} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>Elige quién puede…</Text>
            {lbPick.options.map((o) => {
              const active = o.value === lbPick.current;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    lbSave(lbPick.group, { [lbPick.key]: o.value });
                    setLbPick(null);
                  }}
                  style={({ pressed }) => [styles.sheetRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
                >
                  <Text style={[styles.sheetRowTxt, { color: active ? colors.primary : colors.textPrimary }]}>{o.label}</Text>
                  {active ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Modal>
      )}

      {/* Ciudades preferidas (multi) */}
      <Modal visible={cityOpen} transparent animationType="fade" onRequestClose={() => setCityOpen(false)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setCityOpen(false)} />
        <View style={[styles.sheetCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Ciudades preferidas</Text>
            <Pressable onPress={() => setCityOpen(false)} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>Verás primero el contenido de estas ciudades</Text>
          {LB_CITIES.map((c) => {
            const active = (lb?.content.cities ?? []).includes(c);
            return (
              <Pressable
                key={c}
                onPress={() => {
                  const cities = active
                    ? (lb?.content.cities ?? []).filter((x) => x !== c)
                    : [...(lb?.content.cities ?? []).filter((x) => x !== c), c];
                  lbSave('content', { cities });
                }}
                style={({ pressed }) => [styles.sheetRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
              >
                <Text style={[styles.sheetRowTxt, { color: active ? colors.primary : colors.textPrimary }]}>{c}</Text>
                {active ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
          <Pressable onPress={() => setCityOpen(false)} style={{ marginTop: espaciado.e8, alignSelf: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>Listo</Text>
          </Pressable>
        </View>
      </Modal>

      <EmergencyModal visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </View>
  );
}

/** Fila estándar de ajustes (icono + label + hint/control). */
function Row({ icon: Icon, label, hint, danger, centered, onPress, right, last }: {
  icon: any; label: string; hint?: string; danger?: boolean; centered?: boolean;
  onPress?: () => void; right?: React.ReactNode; last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        centered && { justifyContent: 'center' },
        { backgroundColor: pressed ? alpha(colors.border, 0.25) : 'transparent' },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      {!centered && (
        <View style={[styles.rowIcon, { backgroundColor: danger ? alpha(colors.danger, 0.1) : alpha(colors.primary, 0.08) }]}>
          <Icon size={18} color={danger ? colors.danger : colors.primary} />
        </View>
      )}
      <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.textPrimary }]}>{label}</Text>
      {!centered && hint ? <Text style={styles.rowHint} numberOfLines={1}>{hint}</Text> : null}
      {!centered && (right ?? <ChevronRight size={16} color={colors.textSecondary} />)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 17, fontWeight: peso.titulo },
  content: { padding: espaciado.e16, gap: espaciado.e6 },
  groupTitle: { fontSize: tipografia.micro, fontWeight: peso.maximo, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: espaciado.e8, marginBottom: espaciado.e2 },
  group: { borderRadius: radios.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e12 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: tipografia.body, fontWeight: peso.fuerte },
  rowHint: { fontSize: tipografia.caption, fontWeight: peso.medio, color: '#8E8E93', maxWidth: '52%' },
  emergency: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8,
    borderRadius: 14, paddingVertical: espaciado.e13, marginTop: espaciado.e10,
  },
  version: { textAlign: 'center', fontSize: tipografia.micro, marginTop: espaciado.e16, fontWeight: peso.medio },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheetCard: { ...formaHoja },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaciado.e8 },
  sheetTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: espaciado.e13 },
  sheetRowTxt: { fontSize: 14.5, fontWeight: peso.fuerte },
  confirmCard: { width: '84%', maxWidth: 340, borderRadius: 20, padding: espaciado.e20 },
  confirmTitle: { fontSize: 17, fontWeight: peso.titulo, textAlign: 'center' },
  confirmBody: { fontSize: tipografia.body, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e8, lineHeight: 19 },
  confirmBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radios.md, paddingVertical: espaciado.e12 },
});
