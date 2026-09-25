/**
 * WorkDetailScreen — Detalle de oferta (Buscar Work) v2.
 * Auditoría UX/seguridad aplicada:
 *  · Salario = string canónico del backend (ya formateado en es-GQ + XAF).
 *  · Contacto del reclutador GATEADO: teléfono/WhatsApp se desbloquean al
 *    postularse (modelo tipo BOSS) — nunca se paga, se reporta.
 *  · Mapa = MapBackground reutilizable (carga/error/Reintentar/fallback Expo Go).
 *  · Alert nativo, safe-area, accesibilidad, estados busy/report/error.
 * Ruta: /work-detail?id=
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bookmark, Briefcase, Calendar, Check, Flag, Lock, MapPin,
  MessageSquare, Phone, Send, Share2, ShieldCheck, type LucideIcon,
} from 'lucide-react-native';
import { alpha, espaciado, GhostButton, radios, ScreenHeader, Tactil, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import MapBackground from '../components/MapBackground';
import { EgCamera, EgMarkers } from '../packages/map';
import { workApi, WorkJob } from '../api/work';
import { BENEFIT_LABELS, CATEGORY_LABELS, EXPERIENCE_LEVELS } from '../constants/work';
import { WorkSafetyNotice } from '../components/jobs';
import { brand } from '@egrouteplan/ui-kit';

const xafSuffix = (s: string | null | undefined) => /XAF/i.test(String(s ?? '').trim());

/** Bloque de bullets (Responsabilidades/Requisitos) con tema. */
function BulletList({ title, items, dot, check }: { title: string; items: string[]; dot?: boolean; check?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: espaciado.e20 }}>
      <Text style={{ fontSize: 15, fontWeight: peso.fuerte, color: colors.textPrimary, marginBottom: espaciado.e10 }}>{title}</Text>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: espaciado.e8 }}>
          {dot ? (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: espaciado.e7, marginRight: espaciado.e10 }} />
          ) : check ? (
            <Check size={14} color={colors.primary} style={{ marginTop: espaciado.e2, marginRight: espaciado.e8 }} />
          ) : null}
          <Text style={{ flex: 1, fontSize: tipografia.body, lineHeight: 20, color: colors.textSecondary }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function Meta({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Icon size={13} color={colors.textSecondary} />
      <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginLeft: espaciado.e4 }}>{text}</Text>
    </View>
  );
}

export default function WorkDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<WorkJob | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [applied, setApplied] = useState(false);
  const [reported, setReported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  /** Evita que una respuesta tardía de una oferta anterior pise la actual. */
  const idRef = useRef(id);
  idRef.current = id;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const j = await workApi.job(id);
      if (idRef.current !== id) return; // ruta cambió mientras cargaba
      setJob(j);
      setBookmarked(j.bookmarked);
      setApplied(j.applied);
    } catch (e) {
      if (idRef.current === id) setError(e instanceof Error ? e.message : 'No se pudo cargar la oferta');
    } finally {
      if (idRef.current === id) setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /** Postularse: una única llamada; el estado se actualiza de forma local. */
  const handleApply = useCallback(async (): Promise<boolean> => {
    if (!job || applied || busyRef.current || job.status !== 'open') return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await workApi.apply(job.id);
      setApplied(true);
      setJob((prev) => (prev ? { ...prev, applied: true, applicantsCount: prev.applicantsCount + 1 } : prev));
      Alert.alert('Solicitud enviada', r.message);
      return true;
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo postular. Inténtalo de nuevo.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [job, applied]);

  /** Gate de contacto (modelo BOSS): pide postularse antes de revelar teléfono. */
  const ensureContact = useCallback((): Promise<boolean> => {
    if (applied) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(
        'Contacto del reclutador',
        'Para ver el teléfono y escribirle, primero envía tu postulación (gratis). El reclutador recibe tu perfil y podrás llamarle o chatear por WhatsApp.',
        [
          { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Postularme', onPress: () => { void handleApply().then(resolve); } },
        ],
      );
    });
  }, [applied, handleApply]);

  const callRecruiter = useCallback(async (phone?: string | null) => {
    if (!phone) { Alert.alert('Llamar', 'Este reclutador no tiene teléfono disponible.'); return; }
    if (!(await ensureContact())) return;
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Llamar', 'No se pudo abrir el marcador del teléfono.'));
  }, [ensureContact]);

  const chatRecruiter = useCallback(async (phone?: string | null) => {
    if (!phone) { Alert.alert('WhatsApp', 'Este reclutador no tiene WhatsApp disponible.'); return; }
    if (!(await ensureContact())) return;
    const text = encodeURIComponent(
      `Hola${job?.recruiter?.name ? ' ' + job.recruiter.name : ''}, me postulé a «${job?.title ?? ''}» (${job?.company ?? ''}) en EG Route Plan.`,
    );
    Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`)
      .catch(() => Alert.alert('WhatsApp', 'No se pudo abrir WhatsApp. Instálalo o escribe por teléfono.'));
  }, [ensureContact, job]);

  const toggleBookmark = useCallback(async () => {
    if (!job) return;
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const r = await workApi.bookmark(job.id);
      setBookmarked(r.bookmarked);
    } catch {
      setBookmarked(!next);
      Alert.alert('Favoritos', 'No se pudo guardar la oferta. Inténtalo de nuevo.');
    }
  }, [job, bookmarked]);

  const handleShare = useCallback(async () => {
    if (!job) return;
    const msg = [
      `💼 ${job.title}`,
      `🏢 ${job.company}${job.companyVerified ? ' ✓' : ''}`,
      `💰 ${job.salary}`,
      `📍 ${job.location || job.city}`,
      '',
      'Mírala en EG Route Plan — Buscar Work.',
    ].join('\n');
    try {
      await Share.share({ message: msg });
    } catch {
      Alert.alert('Compartir', 'No se pudo abrir el menú de compartir.');
    }
  }, [job]);

  const handleReport = useCallback(() => {
    if (!job || reported) return;
    Alert.alert(
      'Reportar oferta',
      'Si crees que esta oferta es fraudulenta o engañosa, la revisaremos cuanto antes. ¿Enviar el reporte?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reportar', style: 'destructive',
          onPress: async () => {
            if (busyRef.current) return;
            busyRef.current = true;
            try {
              const r = await workApi.report(job.id, 'sospechosa', 'Reportada desde el detalle de la oferta');
              setReported(true);
              Alert.alert('Reporte enviado', r.message);
            } catch {
              Alert.alert('Error', 'No se pudo enviar el reporte. Inténtalo de nuevo.');
            } finally {
              busyRef.current = false;
            }
          },
        },
      ],
    );
  }, [job, reported]);

  const goSimilar = useCallback((sj: WorkJob) => {
    // Pantalla nueva por oferta: al volver regresas a la anterior (sin parpadeo).
    router.push(`/work-detail?id=${sj.id}`);
  }, [router]);

  const s = styles(colors);

  // ----- Estados de carga y error -----
  if (!job && loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary, fontWeight: peso.fuerte }}>Cargando oferta…</Text>
      </View>
    );
  }
  if (!job) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 }}>
        <View style={[s.errIcon, { backgroundColor: alpha(colors.danger, 0.1) }]}><Flag size={26} color={colors.danger} /></View>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.subtitle, textAlign: 'center' }}>No pudimos cargar esta oferta</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, marginBottom: espaciado.e16 }}>{error}</Text>
        <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
          <GhostButton title="Volver" onPress={() => router.back()} />
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar la oferta"
            style={({ pressed }) => [s.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const daysAgo = job.publishedAt ? Math.floor((Date.now() - new Date(job.publishedAt).getTime()) / 86400000) : 0;
  const { latitude, longitude } = job.coordinates || {};
  const open = job.status === 'open';
  const showMonthlyCaption = xafSuffix(job.salary);
  const experienceLabel = EXPERIENCE_LEVELS.find(([v]) => v === job.experienceRequired)?.[1] ?? 'Sin especificar';
  const recruiterPhone = job.recruiter?.phone;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cabecera del kit desde el 24/09/2026. La acción es el marcador de guardados. */}
      <ScreenHeader
        titulo="Detalle de oferta"
        alVolver={() => router.back()}
        accion={
          <Tactil
            onPress={toggleBookmark}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? 'Quitar de guardados' : 'Guardar oferta'}
          >
            <Bookmark size={20} color={bookmarked ? colors.primary : colors.textSecondary} fill={bookmarked ? colors.primary : 'transparent'} />
          </Tactil>
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: insets.bottom + 132 }} showsVerticalScrollIndicator={false}>
        {/* JobHeader */}
        <View style={[s.card, { borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginBottom: espaciado.e10, alignItems: 'center' }}>
            {job.isNew && <View style={[s.badge, { backgroundColor: colors.primary }]}><Text style={s.badgeText}>NUEVA</Text></View>}
            {job.isUrgent && <View style={[s.badge, { backgroundColor: brand.danger }]}><Text style={s.badgeText}>URGENTE</Text></View>}
            {(job.applicantsCount ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.primary, 0.1), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: peso.fuerte }}>
                  {job.applicantsCount === 1 ? '1 aplicante' : `${job.applicantsCount} aplicantes`}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 18, fontWeight: peso.fuerte, color: colors.textPrimary, marginBottom: espaciado.e6 }}>{job.title}</Text>
          <Text style={{ fontSize: 19, fontWeight: peso.maximo, color: colors.primary, marginBottom: espaciado.e2 }}>{job.salary}</Text>
          {showMonthlyCaption && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginBottom: espaciado.e12 }}>/ mes · Neto</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e12, marginBottom: espaciado.e12 }}>
            <Meta icon={MapPin} text={job.location || job.city} />
            <Meta icon={Briefcase} text={experienceLabel} />
            <Meta icon={Calendar} text={job.contractLabel || 'No especificado'} />
          </View>
          {(job.benefits || []).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginBottom: espaciado.e12 }}>
              {(job.benefits || []).map((b, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.primary, 0.08), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: 6 }}>
                  <Check size={10} color={colors.primary} style={{ marginRight: espaciado.e3 }} />
                  <Text style={{ fontSize: 10, color: colors.primary, fontWeight: peso.medio }}>{BENEFIT_LABELS[b] ?? b}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: trazo.fino, borderTopColor: colors.border, paddingTop: espaciado.e10 }}>
            <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Publicado {daysAgo === 0 ? 'hoy' : `hace ${daysAgo} d`}</Text>
            {job.expiresAt && <Text style={{ fontSize: tipografia.micro, color: colors.danger, fontWeight: peso.medio }}>Cierra: {new Date(job.expiresAt).toLocaleDateString('es')}</Text>}
          </View>
        </View>

        {/* Descripción */}
        {job.description ? (
          <View style={{ marginBottom: espaciado.e16 }}>
            <Text style={s.sectionTitle}>Descripción</Text>
            <Text style={{ fontSize: tipografia.body, lineHeight: 20, color: colors.textSecondary }}>{job.description}</Text>
          </View>
        ) : null}

        {/* Responsabilidades / Requisitos */}
        {job.responsibilities.length > 0 && <BulletList title="Responsabilidades" items={job.responsibilities} dot />}
        {job.requirements.length > 0 && <BulletList title="Requisitos" items={job.requirements} check />}

        {/* Ubicación (MapBackground con carga/error/Reintentar) */}
        <View style={{ marginBottom: espaciado.e20 }}>
          <Text style={s.sectionTitle}>Ubicación</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginBottom: espaciado.e8 }}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>{job.location || job.city}{job.distance ? ` · ${job.distance} km de distancia` : ''}</Text>
          </View>
          {latitude && longitude ? (
            <View style={{ height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}>
              <MapBackground>
                <EgCamera centerCoordinate={[longitude, latitude]} zoomLevel={13} animationMode="moveTo" />
                <EgMarkers markers={[{ id: 'job', coordinate: [longitude, latitude] as [number, number], kind: 'origin' as const, label: job.location || job.city }]} />
              </MapBackground>
            </View>
          ) : (
            <View style={{ height: 80, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{job.city} · {job.zone || 'sin zona'}</Text>
            </View>
          )}
        </View>

        {/* Empresa / reclutador (contacto bloqueado hasta postularse) */}
        <View style={{ marginBottom: espaciado.e20 }}>
          <Text style={s.sectionTitle}>Información de la empresa</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e16 }}>
            <View style={[s.logoBig, { backgroundColor: job.companyColor || colors.primary }]}>
              <Text style={{ color: brand.white, fontSize: tipografia.title, fontWeight: peso.maximo }}>{job.company.charAt(0).toUpperCase()}</Text>
              {job.companyVerified && <View style={[s.vBadge, { backgroundColor: brand.success }]}><Check size={9} color={brand.white} strokeWidth={3} /></View>}
            </View>
            <View style={{ flex: 1, marginLeft: espaciado.e12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: colors.textPrimary }} numberOfLines={1}>{job.company}</Text>
                {job.companyVerified && <ShieldCheck size={14} color={colors.primary} style={{ marginLeft: espaciado.e4 }} />}
              </View>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>{CATEGORY_LABELS[job.category] || job.category}</Text>
            </View>
          </View>

          {job.recruiter?.name && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: espaciado.e12, borderRadius: 10 }}>
              <View style={[s.recAvatar, { backgroundColor: job.recruiter.avatarColor || colors.secondary }]}>
                <Text style={{ color: brand.white, fontSize: 15, fontWeight: peso.fuerte }}>{job.recruiter.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: espaciado.e12 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: colors.textPrimary }}>{job.recruiter.name}</Text>
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>{job.recruiter.role || 'Reclutador/a'}</Text>
                {!applied && recruiterPhone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e3 }}>
                    <Lock size={10} color={colors.textSecondary} />
                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginLeft: espaciado.e3 }}>Contacto se desbloquea al postularte</Text>
                  </View>
                )}
              </View>
              {recruiterPhone && (applied ? (
                <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                  <Pressable
                    onPress={() => void callRecruiter(recruiterPhone)}
                    style={[s.roundBtn, { backgroundColor: alpha(colors.primary, 0.1) }]}
                    accessibilityRole="button" accessibilityLabel={`Llamar a ${job.recruiter.name}`}
                  >
                    <Phone size={16} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => void chatRecruiter(recruiterPhone)}
                    style={[s.roundBtn, { backgroundColor: brand.whatsapp }]}
                    accessibilityRole="button" accessibilityLabel={`WhatsApp a ${job.recruiter.name}`}
                  >
                    <MessageSquare size={16} color={brand.white} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => { void handleApply(); }}
                  disabled={busy || !open}
                  style={[s.roundBtn, { backgroundColor: alpha(colors.primary, 0.12), opacity: busy || !open ? 0.5 : 1 }]}
                  accessibilityRole="button" accessibilityLabel="Postularse para ver el contacto del reclutador"
                >
                  <Lock size={16} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <WorkSafetyNotice />

        {/* Similares */}
        {job.similar && job.similar.length > 0 && (
          <View style={{ marginBottom: espaciado.e12 }}>
            <Text style={s.sectionTitle}>Ofertas similares</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e10, paddingBottom: espaciado.e4 }}>
              {job.similar.map((sj) => (
                <Pressable
                  key={sj.id}
                  onPress={() => goSimilar(sj)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver oferta similar: ${sj.title} en ${sj.company}`}
                  style={({ pressed }) => [{ width: 180, backgroundColor: colors.surface, borderRadius: radios.md, padding: espaciado.e12, opacity: pressed ? 0.85 : 1 }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: espaciado.e8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: radios.sm, backgroundColor: sj.companyColor || colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.fuerte }}>{sj.company.charAt(0)}</Text>
                    </View>
                    {sj.isUrgent && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: brand.danger }} />}
                  </View>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: colors.textPrimary, minHeight: 34 }} numberOfLines={2}>{sj.title}</Text>
                  <Text style={{ fontSize: tipografia.micro, color: colors.primary, marginBottom: espaciado.e4 }} numberOfLines={1}>{sj.company}</Text>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.primary, marginBottom: espaciado.e6 }} numberOfLines={1}>{sj.salary}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* BottomActionBar (safe-area) */}
      <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => void handleShare()}
          style={({ pressed }) => [s.iconBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button" accessibilityLabel="Compartir oferta"
        >
          <Share2 size={18} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={handleReport}
          disabled={reported}
          style={({ pressed }) => [s.iconBtn, { backgroundColor: colors.surface, opacity: reported ? 0.45 : pressed ? 0.7 : 1 }]}
          accessibilityRole="button" accessibilityLabel={reported ? 'Oferta reportada' : 'Reportar oferta'}
        >
          <Flag size={18} color={reported ? colors.success : colors.textSecondary} />
        </Pressable>
        {recruiterPhone && (
          <Pressable
            onPress={() => void chatRecruiter(recruiterPhone)}
            disabled={!open && !applied}
            style={({ pressed }) => [s.chatBtn, { backgroundColor: colors.primary, opacity: !open && !applied ? 0.45 : pressed ? 0.85 : 1 }]}
            accessibilityRole="button" accessibilityLabel="Abrir chat con el reclutador"
          >
            <MessageSquare size={15} color={brand.white} />
            <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.medio }}>Chat</Text>
          </Pressable>
        )}
        {!open ? (
          <Pressable
            disabled
            accessibilityRole="button"
            style={[s.applyBtn, { backgroundColor: colors.border }]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>Oferta cerrada</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void handleApply()}
            disabled={applied || busy}
            accessibilityRole="button"
            accessibilityLabel={applied ? 'Ya te has postulado' : 'Postularme a esta oferta'}
            style={({ pressed }) => [s.applyBtn, { backgroundColor: applied ? brand.success : colors.primary, opacity: busy ? 0.6 : applied ? 1 : pressed ? 0.85 : 1 }]}
          >
            <Send size={15} color={brand.white} />
            <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.fuerte }}>{applied ? 'Ya postulado' : busy ? 'Postulando…' : 'Postularse'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  card: { borderRadius: 14, padding: espaciado.e16, borderWidth: trazo.fino, marginBottom: espaciado.e16 },
  badge: { paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: 4 },
  badgeText: { color: brand.white, fontSize: 10, fontWeight: peso.maximo, letterSpacing: 0.3 },
  sectionTitle: { fontSize: 15, fontWeight: peso.fuerte, color: c.textPrimary, marginBottom: espaciado.e10 },
  errIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e14 },
  retryBtn: { paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderRadius: 10 },
  logoBig: { width: 50, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  vBadge: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center', borderWidth: trazo.fuerte, borderColor: brand.white },
  recAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  roundBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e12, paddingTop: espaciado.e10, borderTopWidth: trazo.fino },
  iconBtn: { width: 40, height: 40, borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center' },
  chatBtn: { flex: 0.28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e11, borderRadius: radios.sm, gap: espaciado.e5 },
  applyBtn: { flex: 0.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e11, borderRadius: radios.sm, gap: espaciado.e5 },
});
