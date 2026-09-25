/**
 * WorkPublishScreen — Publicar oferta (Buscar Work) + Mis ofertas (reclutador) v2.
 * Auditoría aplicada:
 *  · Vocabulario ÚNICO de beneficios/contratos/experiencia (constants/work).
 *  · contractType default 'completo' (no 'fulltime'); experiencia por chips 0–4.
 *  · Salarios saneados (solo dígitos) + validación máx ≥ mín.
 *  · Ubicación en mapa OPCIONAL (tap para fijar lat/lng) → detalle con mapa real.
 *  · Catálogo con error + Reintentar; acciones con busy/confirmación; a11y completa;
 *    aviso al salir con borrador sin publicar (beforeRemove).
 * Ruta: /work-publish
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import {
  Check, Crown, MapPin, MessageSquare, Phone, RefreshCw, Users, X,
} from 'lucide-react-native';
import { alpha, espaciado, FormField, GhostButton, InlineError, PrimaryButton, radios, ScreenHeader, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import MapBackground from '../components/MapBackground';
import { workApi, type WorkCatalog, type WorkJob, type WorkPlan } from '../api/work';
import { billingApi } from '../api/billing';
import { BENEFITS, BENEFIT_LABELS, CONTRACT_LABELS, EXPERIENCE_LEVELS } from '../constants/work';
import { brand } from '@egrouteplan/ui-kit';

const DIGITS = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 9);
const MAX_DESC = 4000;
const MAX_LINES = 2400;
const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', applied: 'Aplicado', selected: 'Seleccionado', rejected: 'Rechazado' };

export default function WorkPublishScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nav = useNavigation();
  const [tab, setTab] = useState<'publish' | 'mine'>('publish');
  const [cat, setCat] = useState<WorkCatalog | null>(null);
  const [catError, setCatError] = useState(false);

  // formulario
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [category, setCategory] = useState('');
  const [cityId, setCityId] = useState('');
  const [location, setLocation] = useState('');
  const [latlng, setLatlng] = useState<[number, number] | null>(null);
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryLabel, setSalaryLabel] = useState('');
  const [contractType, setContractType] = useState('completo');
  const [experience, setExperience] = useState(0);
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [recruiterName, setRecruiterName] = useState('');
  const [recruiterPhone, setRecruiterPhone] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mis ofertas
  const [mine, setMine] = useState<WorkJob[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [appBusy, setAppBusy] = useState<string | null>(null);

  // plan / cuota
  const [plan, setPlan] = useState<WorkPlan | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatError(false);
    try { setCat(await workApi.catalog()); } catch { setCatError(true); }
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const loadPlan = useCallback(async () => {
    try { setPlan(await workApi.myPlan()); } catch { /* banner sin plan: tolerable */ }
  }, []);
  useEffect(() => { void loadPlan(); }, [loadPlan]);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    setMineError(null);
    try { setMine(await workApi.myJobs()); }
    catch { setMineError('No se pudieron cargar tus ofertas. Comprueba tu conexión.'); }
    finally { setLoadingMine(false); }
  }, []);
  useEffect(() => { if (tab === 'mine') void loadMine(); }, [tab, loadMine]);

  const toggleBenefit = (b: string) => setBenefits((bs) => bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]);

  // Aviso de borrador sin publicar al salir de la pantalla
  const dirty = Boolean(
    title.trim() || company.trim() || category || cityId || location.trim() || latlng ||
    salaryMin || salaryMax || salaryLabel.trim() || description.trim() || requirements.trim() ||
    responsibilities.trim() || benefits.length > 0 || recruiterName.trim() || recruiterPhone.trim() || urgent,
  );
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const sub = nav.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert(
        'Salir sin publicar',
        'Tienes una oferta a medio completar. Si sales, perderás lo escrito.',
        [
          { text: 'Seguir editando', style: 'cancel' },
          { text: 'Descartar y salir', style: 'destructive', onPress: () => nav.dispatch(e.data.action) },
        ],
      );
    });
    return sub;
  }, [nav]);

  const publish = async () => {
    if (!title.trim() || !company.trim() || !category || !cityId) { setError('Completa: título, empresa, categoría y ciudad.'); return; }
    const min = Number(salaryMin) || 0;
    const max = Number(salaryMax) || 0;
    if (min <= 0 || max < min) { setError(max <= 0 ? 'Indica el salario mínimo y máximo en XAF.' : 'El salario máximo no puede ser menor que el mínimo.'); return; }
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim().slice(0, 160), company: company.trim().slice(0, 120),
        category, cityId, location: location.trim().slice(0, 160) || null,
        lat: latlng ? latlng[1] : null, lng: latlng ? latlng[0] : null,
        salaryMin: min, salaryMax: max,
        salaryLabel: salaryLabel.trim().slice(0, 60) || undefined,
        contractType, experienceRequired: experience,
        description: description.trim() || undefined,
        responsibilities: responsibilities.split('\n').map((x) => x.trim()).filter(Boolean),
        requirements: requirements.split('\n').map((x) => x.trim()).filter(Boolean),
        benefits, urgent,
        recruiterName: recruiterName.trim().slice(0, 120) || undefined,
        recruiterPhone: recruiterPhone.trim().slice(0, 20) || undefined,
      };
      const r = await workApi.create(body);
      Alert.alert('Oferta publicada', r.message);
      setTitle(''); setCompany(''); setCategory(''); setCityId(''); setLocation(''); setLatlng(null);
      setSalaryMin(''); setSalaryMax(''); setSalaryLabel(''); setContractType('completo'); setExperience(0);
      setDescription(''); setRequirements(''); setResponsibilities(''); setBenefits([]);
      setRecruiterName(''); setRecruiterPhone(''); setUrgent(false);
      setTab('mine');
      void loadMine();
      void loadPlan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar');
    } finally { setBusy(false); }
  };

  const featureJob = async (id: string) => {
    try {
      const bp = (await billingApi.plans('work')).find((p) => p.code === 'work_job_featured');
      if (!bp) throw new Error('El plan "Destacar oferta" no está disponible');
      router.push({ pathname: '/billing-checkout', params: { planId: bp.id, module: 'work', targetType: 'job', targetId: id } } as never);
    } catch (e) { Alert.alert('Destacar', e instanceof Error ? e.message : 'No se pudo iniciar'); }
  };

  const setStatus = async (a: { id: string; status: string; fullName?: string | null }, status: 'selected' | 'rejected') => {
    if (appBusy) return;
    const doIt = async () => {
      setAppBusy(a.id);
      try {
        await workApi.selectApplicant(a.id, status);
        Alert.alert(status === 'selected' ? 'Candidato seleccionado' : 'Candidato rechazado',
          status === 'selected' ? 'Le hemos enviado el aviso por SMS y WhatsApp.' : 'Se ha notificado al candidato.');
        void loadMine();
      } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar'); }
      finally { setAppBusy(null); }
    };
    if (status === 'rejected') {
      Alert.alert('Rechazar candidato', `¿Descartar a ${a.fullName || 'este candidato'}? Se le notificará y no podrá deshacerse.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Rechazar', style: 'destructive', onPress: () => { void doIt(); } },
      ]);
    } else {
      void doIt();
    }
  };

  const closeJob = (id: string) => {
    Alert.alert('Cerrar oferta', 'La oferta dejará de ser visible para nuevos candidatos. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar', style: 'destructive',
        onPress: async () => {
          try { const r = await workApi.close(id); Alert.alert('Oferta cerrada', r.message); void loadMine(); }
          catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cerrar'); }
        },
      },
    ]);
  };

  const duplicateJob = async (id: string) => {
    try { const r = await workApi.duplicate(id); Alert.alert('Oferta duplicada', r.message); void loadMine(); }
    catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo duplicar'); }
  };

  const openTel = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Llamar', 'No se pudo abrir el marcador.'));
  const openWa = (phone: string) => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`).catch(() => Alert.alert('WhatsApp', 'No se pudo abrir WhatsApp. Instálalo o llama por teléfono.'));

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cabecera del kit desde el 24/09/2026. */}
      <ScreenHeader titulo="Buscar Work" alVolver={() => router.back()} />

      <View style={{ flexDirection: 'row', paddingHorizontal: espaciado.e16, gap: espaciado.e8, marginVertical: espaciado.e12 }}>
        <TabBtn active={tab === 'publish'} label="Publicar oferta" onPress={() => setTab('publish')} />
        <TabBtn active={tab === 'mine'} label={`Mis ofertas (${mine.length})`} onPress={() => setTab('mine')} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'publish' ? (
          catError ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: espaciado.e24 }}>
              <Text style={{ color: colors.danger, fontWeight: peso.fuerte, textAlign: 'center' }}>No se pudo cargar el catálogo de categorías y ciudades.</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, marginBottom: espaciado.e14 }}>Comprueba tu conexión e inténtalo de nuevo.</Text>
              <Pressable onPress={() => void loadCatalog()} accessibilityRole="button" accessibilityLabel="Reintentar cargar el catálogo"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderRadius: radios.chip, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
                <RefreshCw size={15} color={brand.white} /><Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body, marginLeft: espaciado.e6 }}>Reintentar</Text>
              </Pressable>
            </View>
          ) : !cat ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>Cargando catálogo…</Text>
            </View>
          ) : (
            <>
              {/* Banner del plan / cuota */}
              <Pressable
                onPress={() => router.push('/work-planes' as never)}
                accessibilityRole="button" accessibilityLabel="Ver planes y mejorar tu cuota"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.primary, 0.08), borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e14, opacity: pressed ? 0.85 : 1 }]}
              >
                <Crown size={18} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>
                    {plan ? `${plan.planName} · ${plan.activeJobs}/${plan.offerLimit} ofertas activas` : 'Cargando tu plan…'}
                  </Text>
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 1 }}>
                    {plan && plan.activeJobs >= plan.offerLimit
                      ? 'Alcanzaste tu límite: mejora tu plan para publicar más.'
                      : 'Toca para ver planes y mejorar tu cuota.'}
                  </Text>
                </View>
                <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.primary }}>Mejorar plan ›</Text>
              </Pressable>

              <Text style={s.hint}>Cualquier usuario autenticado puede publicar. Las ofertas caducan automáticamente y las empresas verificadas muestran el sello de confianza.</Text>

              <Text style={s.label}>Título del puesto *</Text>
              <FormField value={title} onChangeText={(t) => setTitle(t.slice(0, 160))} placeholder="Ej: Conductor de camión cisterna" />
              <Text style={s.label}>Empresa *</Text>
              <FormField value={company} onChangeText={(t) => setCompany(t.slice(0, 120))} placeholder="Nombre de la empresa" />
              <Text style={s.label}>Categoría *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                {cat.categories.map((ct) => (
                  <Chip key={ct.id} label={ct.label} active={category === ct.id} onPress={() => setCategory(category === ct.id ? '' : ct.id)} />
                ))}
              </View>
              <Text style={s.label}>Ciudad *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                {cat.cities.map((ct) => (
                  <Chip key={ct.id} label={ct.label} active={cityId === ct.id} onPress={() => setCityId(cityId === ct.id ? '' : ct.id)} />
                ))}
              </View>
              <Text style={s.label}>Zona / dirección</Text>
              <FormField value={location} onChangeText={(t) => setLocation(t.slice(0, 160))} placeholder="Ej: Zona Industrial, Malabo II" />
              <Text style={s.label}>Ubicación en el mapa (opcional)</Text>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginBottom: espaciado.e6 }}>
                Toca el mapa para fijar la empresa: el detalle mostrará el pin y los candidatos verán la distancia.
              </Text>
              <View style={{ height: 170, borderRadius: radios.campo, overflow: 'hidden', marginBottom: espaciado.e6 }}>
                <MapBackground onMapPress={(c) => setLatlng([c[0], c[1]])} pin={latlng}>
                  <MapPinBadge />
                </MapBackground>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaciado.e4 }}>
                {latlng ? (
                  <Text style={{ fontSize: tipografia.micro, color: colors.success, fontWeight: peso.fuerte }}>Punto fijado ✓</Text>
                ) : (
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Sin punto (opcional)</Text>
                )}
                {latlng && (
                  <Pressable onPress={() => setLatlng(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar el punto del mapa">
                    <Text style={{ fontSize: tipografia.micro, color: colors.danger, fontWeight: peso.fuerte }}>Quitar punto</Text>
                  </Pressable>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Salario mín (XAF) *</Text>
                  <FormField value={salaryMin} onChangeText={(t) => setSalaryMin(DIGITS(t))} placeholder="200000" keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Salario máx (XAF) *</Text>
                  <FormField value={salaryMax} onChangeText={(t) => setSalaryMax(DIGITS(t))} placeholder="350000" keyboardType="number-pad" />
                </View>
              </View>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>Solo números, sin puntos ni espacios. Ej: 300000</Text>
              <Text style={s.label}>Etiqueta de salario (opcional)</Text>
              <FormField value={salaryLabel} onChangeText={(t) => setSalaryLabel(t.slice(0, 60))} placeholder="Ej: Negociable según experiencia" />

              <Text style={s.label}>Tipo de contrato</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                {Object.keys(CONTRACT_LABELS).map((k) => (
                  <Chip key={k} label={CONTRACT_LABELS[k]} active={contractType === k} onPress={() => setContractType(k)} />
                ))}
              </View>
              <Text style={s.label}>Experiencia requerida</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                {EXPERIENCE_LEVELS.map(([v, l]) => (
                  <Chip key={v} label={l} active={experience === v} onPress={() => setExperience(experience === v ? 0 : v)} />
                ))}
              </View>
              <Text style={s.label}>Beneficios</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                {BENEFITS.map((b) => (
                  <Chip key={b} label={BENEFIT_LABELS[b] ?? b} active={benefits.includes(b)} onPress={() => toggleBenefit(b)} />
                ))}
              </View>
              <Text style={s.label}>Descripción</Text>
              <TextInput multiline maxLength={MAX_DESC} style={s.area} placeholder="Describe el puesto…" placeholderTextColor={colors.textSecondary} value={description} onChangeText={setDescription} />
              <Text style={s.counter}>{description.length}/{MAX_DESC}</Text>
              <Text style={s.label}>Responsabilidades (una por línea)</Text>
              <TextInput multiline maxLength={MAX_LINES} style={s.area} placeholder={'Ej:\nCumplir rutas asignadas\nRevisar el vehículo cada día'} placeholderTextColor={colors.textSecondary} value={responsibilities} onChangeText={setResponsibilities} />
              <Text style={s.counter}>{responsibilities.length}/{MAX_LINES}</Text>
              <Text style={s.label}>Requisitos (uno por línea)</Text>
              <TextInput multiline maxLength={MAX_LINES} style={s.area} placeholder={'Ej:\nLicencia de conducir vigente\n1 año de experiencia'} placeholderTextColor={colors.textSecondary} value={requirements} onChangeText={setRequirements} />
              <Text style={s.counter}>{requirements.length}/{MAX_LINES}</Text>

              <Text style={s.label}>Datos de contacto (reclutador)</Text>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginBottom: espaciado.e6 }}>
                Los candidatos solo ven este teléfono/WhatsApp después de postularse a tu oferta.
              </Text>
              <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                <View style={{ flex: 1 }}><FormField value={recruiterName} onChangeText={(t) => setRecruiterName(t.slice(0, 120))} placeholder="Nombre" /></View>
                <View style={{ flex: 1 }}><FormField value={recruiterPhone} onChangeText={(t) => setRecruiterPhone(t.slice(0, 20))} placeholder="Teléfono / WhatsApp" keyboardType="phone-pad" /></View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: espaciado.e10 }}>
                <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, fontWeight: peso.medio }}>Marcar como urgente</Text>
                <Switch
                  value={urgent}
                  onValueChange={setUrgent}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  accessibilityRole="switch"
                  accessibilityLabel="Marcar oferta como urgente"
                  accessibilityState={{ checked: urgent }}
                />
              </View>
              {error ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={error} /></View> : null}
              <PrimaryButton title={busy ? 'Publicando…' : 'Publicar oferta'} onPress={publish} disabled={busy} testID="work-publish-submit" />
            </>
          )
        ) : (
          <>
            <Text style={s.hint}>Tus ofertas y candidatos. Al seleccionar a un candidato se le notifica por SMS y WhatsApp.</Text>
            {loadingMine && (
              <View style={{ alignItems: 'center', paddingVertical: espaciado.e24 }}>
                <ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>Cargando…</Text>
              </View>
            )}
            {!loadingMine && mineError && (
              <View style={{ alignItems: 'center', paddingVertical: espaciado.e30, paddingHorizontal: espaciado.e24 }}>
                <Text style={{ color: colors.danger, fontWeight: peso.fuerte, textAlign: 'center' }}>{mineError}</Text>
                <Pressable onPress={() => void loadMine()} accessibilityRole="button" accessibilityLabel="Reintentar cargar tus ofertas"
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e12, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e9, borderRadius: radios.chip, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
                  <RefreshCw size={14} color={brand.white} /><Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.caption, marginLeft: espaciado.e6 }}>Reintentar</Text>
                </Pressable>
              </View>
            )}
            {!loadingMine && !mineError && mine.length === 0 && (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e30 }}>Aún no has publicado ofertas.</Text>
            )}
            {mine.map((j) => (
              <View key={j.id} style={{ backgroundColor: colors.surface, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e12 }}>
                <Pressable
                  onPress={() => setExpanded(expanded === j.id ? null : j.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expanded === j.id }}
                  accessibilityLabel={`${j.title}, ${j.company}, ${j.status === 'closed' ? 'cerrada' : 'activa'}. ${(j.applicants ?? []).length} candidatos`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: espaciado.e8 }}>
                      <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>{j.title}</Text>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }} numberOfLines={1}>{j.company} · {j.city} · {j.salary}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.primary, 0.1), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.chip }}>
                        <Users size={11} color={colors.primary} /><Text style={{ fontSize: tipografia.micro, color: colors.primary, fontWeight: peso.fuerte, marginLeft: espaciado.e3 }}>{j.applicantsCount}</Text>
                      </View>
                      <Text style={{ fontSize: tipografia.micro, color: j.status === 'closed' ? colors.danger : colors.success, fontWeight: peso.fuerte }}>{j.status === 'closed' ? 'Cerrada' : 'Activa'}</Text>
                    </View>
                  </View>
                </Pressable>
                {expanded === j.id && (
                  <View style={{ marginTop: espaciado.e12, borderTopWidth: trazo.fino, borderTopColor: colors.border, paddingTop: espaciado.e10 }}>
                    {(j.applicants ?? []).length === 0 && <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Sin candidatos todavía.</Text>}
                    {(j.applicants ?? []).map((a) => {
                      const phone = a.phone ?? null;
                      return (
                        <View key={a.id} style={{ backgroundColor: colors.background, borderRadius: radios.chip, padding: espaciado.e10, marginBottom: espaciado.e8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: espaciado.e8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: colors.textPrimary }}>{a.fullName || 'Sin nombre'}</Text>
                              {a.documentType && <Text style={{ fontSize: tipografia.nota, color: colors.textSecondary, marginTop: espaciado.e2 }}>DIP: {a.documentType} · {a.documentNumber}</Text>}
                              {a.note && <Text style={{ fontSize: tipografia.micro, color: colors.textPrimary, marginTop: espaciado.e4, fontStyle: 'italic' }}>«{a.note}»</Text>}
                              <Text style={{ fontSize: tipografia.nota, color: colors.textSecondary, marginTop: espaciado.e4 }}>{new Date(a.createdAt).toLocaleDateString('es')} · {STATUS_LABEL[a.status] ?? a.status}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, justifyContent: 'flex-end' }}>
                              {phone && (
                                <>
                                  <MiniBtn label={`Llamar a ${a.fullName || 'candidato'}`} bg={alpha(colors.primary, 0.12)} onPress={() => openTel(phone)} disabled={appBusy === a.id}>
                                    <Phone size={14} color={colors.primary} />
                                  </MiniBtn>
                                  <MiniBtn label={`WhatsApp a ${a.fullName || 'candidato'}`} bg={brand.whatsapp} onPress={() => openWa(phone)} disabled={appBusy === a.id}>
                                    <MessageSquare size={14} color={brand.white} />
                                  </MiniBtn>
                                </>
                              )}
                              {(a.status === 'pending' || a.status === 'applied') && (
                                <>
                                  <MiniBtn label={`Seleccionar a ${a.fullName || 'candidato'}`} bg={brand.success} onPress={() => setStatus(a, 'selected')} disabled={appBusy === a.id}>
                                    <Check size={14} color={brand.white} />
                                  </MiniBtn>
                                  <MiniBtn label={`Rechazar a ${a.fullName || 'candidato'}`} bg={brand.danger} onPress={() => setStatus(a, 'rejected')} disabled={appBusy === a.id}>
                                    {appBusy === a.id ? <ActivityIndicator size="small" color={brand.white} /> : <X size={14} color={brand.white} />}
                                  </MiniBtn>
                                </>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e6 }}>
                      <GhostButton title="Duplicar" onPress={() => void duplicateJob(j.id)} />
                      <GhostButton title="Destacar" onPress={() => void featureJob(j.id)} />
                      {j.status !== 'closed' && <GhostButton title="Cerrar oferta" onPress={() => closeJob(j.id)} />}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MapPinBadge() {
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.textPrimary, 0.75), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: radios.chip }}>
      <MapPin size={11} color={brand.white} />
      <Text style={{ color: brand.white, fontSize: tipografia.nota, fontWeight: peso.fuerte, marginLeft: espaciado.e3 }}>Toca el mapa</Text>
    </View>
  );
}

function TabBtn({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [{ flex: 1, paddingVertical: espaciado.e9, borderRadius: radios.sm, alignItems: 'center', backgroundColor: active ? colors.primary : colors.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: active ? brand.white : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: active ? colors.primary : colors.surface, borderWidth: trazo.fino, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={{ fontSize: tipografia.caption, fontWeight: active ? peso.fuerte : peso.medio, color: active ? brand.white : colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

function MiniBtn({ label, bg, onPress, disabled, children }: { label: string; bg: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ width: 32, height: 32, borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  hint: { fontSize: tipografia.caption, color: c.textSecondary, marginBottom: espaciado.e16, lineHeight: 18 },
  label: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: c.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e6 },
  counter: { fontSize: tipografia.nota, color: c.textSecondary, textAlign: 'right', marginBottom: espaciado.e4 },
  area: { minHeight: 80, borderRadius: radios.chip, borderWidth: trazo.fino, borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary, padding: espaciado.e10, fontSize: tipografia.body, textAlignVertical: 'top' },
});
