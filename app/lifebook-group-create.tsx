/**
 * Life Book — CREAR RUTA/GRUPO (flujo del dueño, 2026-09-10)
 * Ruta: `/lifebook-group-create`
 *
 * Es el diseño que envió el dueño (`RouteGroupFlow`) pasado a la app, con la
 * paleta oficial (azul el azul de accion / naranja el naranja de servicios) en vez del rojo del boceto.
 * Pasos:
 *   1. `form`    → nombre (24) + descripción (160) + tipo + punto de encuentro
 *                  + condición de ingreso + «mostrar en mi perfil».
 *   2. `type`    → 9 tipos de ruta (se guardan como `category`).
 *   3. `place`   → buscador REAL de sitios (geocoder de OSM del mirror HK) o
 *                  «no mostrar ubicación».
 *   4. `people`  → a quién invitas al crearlo (seguidores + sugeridos).
 *   5. `join`    → sin requisito · aprobación del organizador · pregunta.
 *   6. `success` → ruta creada: ir al grupo, invitar a más, volver.
 *
 * Diferencias conscientes con el boceto (explicadas al dueño):
 *   · El paso `people` va ANTES de crear porque el servidor exige al menos un
 *     miembro además de ti (`GROUP_MEMBERS_REQUIRED`).
 *   · «Código de ruta», «QR», «compartir enlace» y «ubicación en vivo» no
 *     existen todavía en el servidor: no se pintan botones que no hacen nada.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, Check, MapPin, Search, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { geocode, type GeoPlace } from '../api/geocode';
import { messagesApi, type LbGroupMeta } from '../api/messages';
import { lifebookInboxApi, type LbFollowerItem, type LbSuggestedUser } from '../api/lifebook';

const NAME_MAX = 24;
const DESC_MAX = 160;
const MAX_MEMBERS = 199; // + tú = 200

/** Tipos de ruta del diseño (se guardan en `category`). */
const ROUTE_TYPES = [
  { id: 'ciclismo', icon: '🚴', label: 'Ciclismo', subtitle: 'Rutas en bicicleta' },
  { id: 'senderismo', icon: '🥾', label: 'Senderismo', subtitle: 'Caminatas y montaña' },
  { id: 'auto', icon: '🚗', label: 'Ruta en auto', subtitle: 'Viajes por carretera' },
  { id: 'moto', icon: '🏍️', label: 'Ruta en moto', subtitle: 'Rodadas y viajes' },
  { id: 'running', icon: '🏃', label: 'Running', subtitle: 'Entrenamientos grupales' },
  { id: 'camping', icon: '⛺', label: 'Camping', subtitle: 'Salidas con pernocta' },
  { id: 'foto', icon: '📷', label: 'Fotografía', subtitle: 'Rutas para tomar fotos' },
  { id: 'urbano', icon: '🏙️', label: 'Ciudad', subtitle: 'Paseos urbanos' },
  { id: 'gastronomia', icon: '🍜', label: 'Gastronomía', subtitle: 'Rutas de comida' },
];

const JOIN_MODES = [
  { id: 'open', icon: '🔓', title: 'Sin requisito', subtitle: 'Cualquier persona puede unirse.' },
  { id: 'approval', icon: '🧐', title: 'Aprobación del organizador', subtitle: 'El organizador revisa cada solicitud.' },
  { id: 'question', icon: '❓', title: 'Pregunta de ingreso', subtitle: 'Quien responda bien puede entrar automáticamente.' },
];

/** Etiquetas cortas del geocoder (el `kind` de OSM). */
const KIND_LABEL: Record<string, string> = {
  road: 'Vía', residential: 'Calle', primary: 'Avenida', secondary: 'Avenida',
  tertiary: 'Calle', motorway: 'Autovía', trunk: 'Carretera', unclassified: 'Camino',
  service: 'Acceso', living_street: 'Calle', pedestrian: 'Zona peatonal', path: 'Sendero',
  steps: 'Escaleras', village: 'Poblado', town: 'Localidad', city: 'Ciudad',
  suburb: 'Barrio', neighbourhood: 'Barrio', peak: 'Cumbre', park: 'Parque',
  school: 'Colegio', hospital: 'Hospital', restaurant: 'Restaurante', cafe: 'Cafetería',
  fuel: 'Gasolinera', marketplace: 'Mercado', bus_station: 'Estación de bus',
  beach: 'Playa', hotel: 'Hotel', bank: 'Banco', pharmacy: 'Farmacia', church: 'Iglesia',
};

type Step = 'form' | 'type' | 'place' | 'people' | 'join' | 'success';
type Person = { id: string; name: string; avatarUrl?: string | null; note?: string };

export default function LifeBookGroupCreate() {
  return (
    <AuthGate>
      <GroupCreateContent />
    </AuthGate>
  );
}

function GroupCreateContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [showInProfile, setShowInProfile] = useState(true);
  const [errText, setErrText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Punto de encuentro
  const [place, setPlace] = useState<{ name: string; kind: string; lon: number; lat: number } | null>(null);
  const [hidePlace, setHidePlace] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<GeoPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  // Condición de ingreso
  const [joinMode, setJoinMode] = useState<'open' | 'approval' | 'question'>('open');
  const [joinQuestion, setJoinQuestion] = useState('');
  const [joinAnswer, setJoinAnswer] = useState('');

  // Personas
  const [followers, setFollowers] = useState<Person[]>([]);
  const [suggested, setSuggested] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [peopleQuery, setPeopleQuery] = useState('');

  const [created, setCreated] = useState<{ id: string; title: string; membersCount: number } | null>(null);

  const selectedType = useMemo(() => ROUTE_TYPES.find((t) => t.id === typeId) ?? null, [typeId]);
  const selectedJoin = useMemo(() => JOIN_MODES.find((j) => j.id === joinMode) ?? JOIN_MODES[0], [joinMode]);

  /* ── Personas (seguidores + sugeridos), como en la hoja anterior ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, s] = await Promise.all([
          lifebookInboxApi.followers().catch(() => [] as LbFollowerItem[]),
          lifebookInboxApi.suggested().catch(() => [] as LbSuggestedUser[]),
        ]);
        if (!alive) return;
        const seen = new Set<string>();
        const toPerson = (x: any, note?: string): Person | null => {
          const id = String(x?.id ?? '');
          if (!id || seen.has(id)) return null;
          seen.add(id);
          return { id, name: String(x.fullName ?? x.name ?? 'Usuario').trim(), avatarUrl: x.avatarUrl ?? null, note };
        };
        setFollowers(f.map((x) => toPerson(x, 'Te sigue')).filter(Boolean) as Person[]);
        setSuggested(s.map((x) => toPerson(x, x.reason ?? x.city)).filter(Boolean) as Person[]);
      } finally {
        if (alive) setPeopleLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const pickedPeople = useMemo(() => {
    const all = [...followers, ...suggested];
    return picked.map((id) => all.find((p) => p.id === id)).filter(Boolean) as Person[];
  }, [picked, followers, suggested]);

  const filterList = (list: Person[]) => {
    const q = peopleQuery.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || (p.note ?? '').toLowerCase().includes(q)) : list;
  };
  const visibleFollowers = filterList(followers);
  const visibleSuggested = filterList(suggested);

  /* ── Buscador de sitios (geocoder real del mirror) ── */
  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    const seq = ++searchSeq.current;
    if (term.length < 2) { setPlaceResults(null); setSearching(false); return; }
    setSearching(true);
    try {
      const res = await geocode(term);
      if (seq === searchSeq.current) setPlaceResults(res);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { runSearch(placeQuery); }, 350);
    return () => clearTimeout(t);
  }, [placeQuery, runSearch]);

  const canCreate = name.trim().length >= 3 && description.trim().length > 0 && !!typeId && picked.length > 0 && !busy;

  const togglePerson = (id: string) => {
    setErrText(null);
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_MEMBERS) return prev;
      return [...prev, id];
    });
  };

  const submit = async () => {
    if (!canCreate) {
      setErrText(
        name.trim().length < 3 ? 'El nombre necesita al menos 3 letras.'
          : !description.trim() ? 'Escribe una descripción.'
            : !typeId ? 'Elige el tipo de ruta.'
              : 'Invita al menos a una persona.',
      );
      return;
    }
    setBusy(true); setErrText(null);
    const meta: LbGroupMeta = {
      description: description.trim(),
      category: typeId ?? undefined,
      visibility: showInProfile ? 'public' : 'private',
      placeName: hidePlace ? undefined : place?.name,
      placeAddress: hidePlace || !place ? undefined : (KIND_LABEL[place.kind] ?? 'Lugar'),
      placeLon: hidePlace ? undefined : place?.lon,
      placeLat: hidePlace ? undefined : place?.lat,
      hidePlace,
      joinMode,
      joinQuestion: joinMode === 'question' ? joinQuestion.trim() : undefined,
      joinAnswer: joinMode === 'question' ? joinAnswer.trim() : undefined,
    };
    try {
      const g = await messagesApi.createGroup(name.trim(), picked, meta);
      setCreated({ id: g.id, title: g.title, membersCount: g.membersCount ?? picked.length + 1 });
      setStep('success');
    } catch (e: any) {
      const code = e?.code;
      if (code === 'GROUP_TITLE_REQUIRED') setErrText('El nombre necesita al menos 3 letras.');
      else if (code === 'GROUP_MEMBERS_REQUIRED') setErrText('Elige al menos a una persona.');
      else if (code === 'GROUP_META_INVALID') setErrText(e?.message ?? 'Revisa la condición de ingreso.');
      else setErrText(e?.message ?? 'No se pudo crear la ruta.');
    } finally {
      setBusy(false);
    }
  };

  const goToGroup = (openMembers = false) => {
    if (!created) return;
    router.replace({
      pathname: '/lifebook-chat/[id]',
      params: { id: created.id, name: created.title, isGroup: '1', ...(openMembers ? { members: '1' } : {}) },
    } as never);
  };

  const titles: Record<Step, string> = {
    form: 'Crear ruta', type: 'Tipo de ruta', place: 'Punto de encuentro',
    people: 'Invitar compañeros', join: 'Condición de ingreso', success: 'Ruta creada',
  };

  const back = () => {
    if (step === 'form') { router.back(); return; }
    if (step === 'success') { router.back(); return; }
    if (step === 'type' || step === 'join') { setStep('form'); return; }
    if (step === 'place') { setStep('form'); return; }
    setStep('form');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Cabecera */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: alpha(colors.border, 0.6) }]}>
        <Pressable onPress={back} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 }}>{titles[step]}</Text>
        {step !== 'success' ? (
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* ── 1. Formulario ── */}
        {step === 'form' ? (
          <View style={{ gap: espaciado.e16 }}>
            <Field label="Nombre de la ruta" required hint={`${name.length}/${NAME_MAX}`} colors={colors}>
              <TextInput
                value={name}
                onChangeText={(t) => { setName(t); setErrText(null); }}
                maxLength={NAME_MAX}
                placeholder="Ej: Ruta del mirador"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              />
            </Field>

            <Field label="Descripción" required hint={`${description.length}/${DESC_MAX}`} colors={colors}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={DESC_MAX}
                multiline
                placeholder="Describe el objetivo, nivel, horario y recomendaciones."
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, styles.textarea, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              />
            </Field>

            <Card colors={colors}>
              <PickRow
                label="Tipo de ruta"
                value={selectedType ? `${selectedType.icon} ${selectedType.label}` : 'Sin seleccionar'}
                onPress={() => setStep('type')}
                colors={colors}
              />
              <PickRow
                label="Punto de encuentro"
                value={hidePlace ? 'No mostrar ubicación' : (place?.name ?? 'Sin seleccionar')}
                onPress={() => setStep('place')}
                colors={colors}
              />
              <PickRow
                label="Condición de ingreso"
                value={`${selectedJoin.icon} ${selectedJoin.title}`}
                onPress={() => setStep('join')}
                colors={colors}
                last
              />
            </Card>

            <Card colors={colors} row>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>Mostrar en mi perfil</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>La ruta será visible en tu página personal.</Text>
              </View>
              <Switch value={showInProfile} onValueChange={setShowInProfile} />
            </Card>

            <Pressable onPress={() => setStep('people')} style={[styles.primaryBtn, { backgroundColor: colors.primary }]} accessibilityLabel="Continuar">
              <Text style={styles.primaryText}>Continuar</Text>
            </Pressable>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
              Para mantener la comunidad segura, respeta las normas de convivencia.
            </Text>
          </View>
        ) : null}

        {/* ── 2. Tipo de ruta ── */}
        {step === 'type' ? (
          <View style={{ gap: espaciado.e10 }}>
            {ROUTE_TYPES.map((t) => (
              <OptionRow
                key={t.id}
                icon={t.icon}
                title={t.label}
                subtitle={t.subtitle}
                selected={typeId === t.id}
                onPress={() => setTypeId(t.id)}
                colors={colors}
              />
            ))}
          </View>
        ) : null}

        {/* ── 3. Punto de encuentro ── */}
        {step === 'place' ? (
          <View style={{ gap: espaciado.e12 }}>
            <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                value={placeQuery}
                onChangeText={setPlaceQuery}
                placeholder="Buscar calle, avenida o sitio…"
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body }}
              />
              {searching ? <ActivityIndicator size="small" color={colors.text.primary} /> : null}
            </View>

            <Pressable
              onPress={() => { setHidePlace(true); setPlace(null); setStep('form'); }}
              style={[styles.option, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.card }]}
              accessibilityLabel="No mostrar ubicación"
            >
              <Text style={{ fontSize: tipografia.title }}>🙈</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>No mostrar ubicación</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Solo los miembros verán el punto.</Text>
              </View>
            </Pressable>

            {placeQuery.trim().length >= 2 && placeResults !== null && placeResults.length === 0 && !searching ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', paddingVertical: espaciado.e18 }}>
                No hay sitios que coincidan. Prueba con el nombre de la calle.
              </Text>
            ) : null}

            {placeResults === null && placeQuery.trim().length < 2 ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingVertical: espaciado.e14 }}>
                Escribe al menos 2 letras. Busca calles, avenidas y sitios reales de Malabo y Bata.
              </Text>
            ) : null}

            {(placeResults ?? []).map((r, i) => (
              <Pressable
                key={`${r.name}-${i}`}
                onPress={() => { setPlace(r); setHidePlace(false); setStep('form'); }}
                style={[styles.option, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.card }]}
                accessibilityLabel={`Elegir ${r.name}`}
              >
                <MapPin size={18} color={colors.text.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.body }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                    {KIND_LABEL[r.kind] ?? 'Lugar'} · {r.lat.toFixed(4)}, {r.lon.toFixed(4)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── 4. Invitar compañeros ── */}
        {step === 'people' ? (
          <View style={{ gap: espaciado.e10 }}>
            {pickedPeople.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e6 }}>
                {pickedPeople.map((p) => (
                  <View key={p.id} style={[styles.chip, { backgroundColor: colors.surface }]}>
                    {p.avatarUrl ? (
                      <Image source={{ uri: p.avatarUrl }} style={styles.chipAvatar} />
                    ) : (
                      <View style={[styles.chipAvatar, { backgroundColor: alpha(colors.primary, 0.15) }]} />
                    )}
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.medio }} numberOfLines={1}>
                      {p.name.split(' ')[0]}
                    </Text>
                    <Pressable onPress={() => togglePerson(p.id)} hitSlop={6} accessibilityLabel={`Quitar a ${p.name}`}>
                      <X size={12} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                value={peopleQuery}
                onChangeText={setPeopleQuery}
                placeholder="Buscar persona…"
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body }}
              />
            </View>

            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              {picked.length} invitado{picked.length === 1 ? '' : 's'} · máximo {MAX_MEMBERS} personas además de ti
            </Text>

            {peopleLoading ? (
              <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e20 }} />
            ) : followers.length === 0 && suggested.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', paddingVertical: espaciado.e20 }}>
                No hay personas a las que invitar por ahora.
              </Text>
            ) : (
              <>
                {visibleFollowers.length > 0 ? <SectionTitle text="Seguidores" colors={colors} /> : null}
                {visibleFollowers.map((p) => (
                  <SelectablePerson key={p.id} p={p} on={picked.includes(p.id)} onPress={() => togglePerson(p.id)} colors={colors} />
                ))}
                {visibleSuggested.length > 0 ? <SectionTitle text="Sugeridos" colors={colors} /> : null}
                {visibleSuggested.map((p) => (
                  <SelectablePerson key={p.id} p={p} on={picked.includes(p.id)} onPress={() => togglePerson(p.id)} colors={colors} />
                ))}
              </>
            )}
          </View>
        ) : null}

        {/* ── 5. Condición de ingreso ── */}
        {step === 'join' ? (
          <View style={{ gap: espaciado.e10 }}>
            {JOIN_MODES.map((j) => (
              <OptionRow
                key={j.id}
                icon={j.icon}
                title={j.title}
                subtitle={j.subtitle}
                selected={joinMode === j.id}
                onPress={() => setJoinMode(j.id as typeof joinMode)}
                colors={colors}
              />
            ))}

            {joinMode === 'question' ? (
              <Card colors={colors}>
                <Field label="Pregunta" required colors={colors}>
                  <TextInput
                    value={joinQuestion}
                    onChangeText={setJoinQuestion}
                    maxLength={160}
                    placeholder="Ej: ¿Tienes experiencia en rutas de más de 20 km?"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary }]}
                  />
                </Field>
                <Field label="Respuesta correcta" required colors={colors}>
                  <TextInput
                    value={joinAnswer}
                    onChangeText={setJoinAnswer}
                    maxLength={80}
                    placeholder="Ej: sí"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary }]}
                  />
                </Field>
              </Card>
            ) : null}
          </View>
        ) : null}

        {/* ── 6. Creada ── */}
        {step === 'success' && created ? (
          <View style={{ alignItems: 'center', paddingTop: espaciado.e24, gap: espaciado.e14 }}>
            <View style={[styles.successCircle, { backgroundColor: alpha(colors.success, 0.15) }]}>
              <Text style={{ fontSize: tipografia.heroGrande }}>✅</Text>
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.tituloFicha, fontWeight: peso.titulo, textAlign: 'center' }}>¡Ruta creada!</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', lineHeight: 20 }}>
              {created.title} · {created.membersCount} miembro{created.membersCount === 1 ? '' : 's'}
              {selectedType ? ` · ${selectedType.icon} ${selectedType.label}` : ''}
              {place && !hidePlace ? `\n📍 ${place.name}` : hidePlace ? '\n📍 Punto de encuentro oculto' : ''}
            </Text>
            <Pressable onPress={() => goToGroup(false)} style={[styles.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}>
              <Text style={styles.primaryText}>Ir al grupo</Text>
            </Pressable>
            <Pressable onPress={() => goToGroup(true)} style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.fino }}>Invitar a más personas</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ paddingVertical: espaciado.e8 }} accessibilityLabel="Volver a Mensajes">
              <Text style={{ color: colors.textSecondary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>Volver a Mensajes</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Pie con el botón del paso */}
      {step === 'type' || step === 'join' || step === 'people' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: alpha(colors.border, 0.6) }]}>
          {errText ? <Text style={{ color: colors.text.danger, fontSize: tipografia.caption, marginBottom: espaciado.e8 }}>{errText}</Text> : null}
          {step === 'people' ? (
            <Pressable
              onPress={submit}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: canCreate ? colors.primary : alpha(colors.primary, 0.35) }]}
              accessibilityLabel="Crear ruta"
            >
              {busy
                ? <ActivityIndicator size="small" color={brand.white} />
                : <Text style={styles.primaryText}>Crear ruta{picked.length ? ` (${picked.length + 1})` : ''}</Text>}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                if (step === 'join' && joinMode === 'question' && (!joinQuestion.trim() || !joinAnswer.trim())) {
                  setErrText('Escribe la pregunta y la respuesta.');
                  return;
                }
                setErrText(null);
                setStep('form');
              }}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel="Guardar"
            >
              <Text style={styles.primaryText}>Guardar</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/* ── Piezas ── */

function Card({ children, colors, row }: { children: React.ReactNode; colors: any; row?: boolean }) {
  return (
    <View style={{
      borderRadius: radios.panel, borderWidth: trazo.fino, borderColor: alpha(colors.border, 0.7), backgroundColor: colors.card,
      padding: espaciado.e14, gap: row ? 12 : 10, flexDirection: row ? 'row' : 'column', alignItems: row ? 'center' : 'stretch',
    }}>
      {children}
    </View>
  );
}

function Field({ label, required, hint, children, colors }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode; colors: any;
}) {
  return (
    <View style={{ gap: espaciado.e6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>
          {label}{required ? <Text style={{ color: colors.text.danger }}> *</Text> : null}
        </Text>
        {hint ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function PickRow({ label, value, onPress, colors, last }: {
  label: string; value: string; onPress: () => void; colors: any; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e10,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: alpha(colors.border, 0.6),
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{label}</Text>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.fino, fontWeight: peso.fuerte, marginTop: 1 }} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.subtitle }}>›</Text>
    </Pressable>
  );
}

function OptionRow({ icon, title, subtitle, selected, onPress, colors }: {
  icon: string; title: string; subtitle: string; selected: boolean; onPress: () => void; colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, padding: espaciado.e14, borderRadius: radios.panel, borderWidth: trazo.base,
        borderColor: selected ? colors.primary : alpha(colors.border, 0.7),
        backgroundColor: selected ? alpha(colors.primary, 0.08) : colors.card,
      }}
    >
      <Text style={{ fontSize: tipografia.subtitulo }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.fino }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{subtitle}</Text>
      </View>
      <View style={{
        width: 20, height: 20, borderRadius: radios.full, borderWidth: trazo.base,
        borderColor: selected ? colors.primary : alpha(colors.border, 1),
        backgroundColor: selected ? colors.primary : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected ? <Check size={12} color={brand.white} /> : null}
      </View>
    </Pressable>
  );
}

function SectionTitle({ text, colors }: { text: string; colors: any }) {
  return (
    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo, letterSpacing: 0.5, marginTop: espaciado.e8 }}>
      {text.toUpperCase()}
    </Text>
  );
}

function SelectablePerson({ p, on, onPress, colors }: { p: Person; on: boolean; onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={p.name}
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e9,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(colors.border, 0.5),
      }}
    >
      {p.avatarUrl ? (
        <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
          <Text style={{ color: colors.text.primary, fontWeight: peso.titulo }}>{p.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>{p.name}</Text>
        {p.note ? <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{p.note}</Text> : null}
      </View>
      <View style={{
        width: 22, height: 22, borderRadius: radios.full, borderWidth: trazo.base,
        borderColor: on ? colors.primary : alpha(colors.border, 1),
        backgroundColor: on ? colors.primary : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {on ? <Check size={13} color={brand.white} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { borderRadius: radios.campo, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e11, fontSize: tipografia.fino },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e14, height: 40 },
  option: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, padding: espaciado.e14, borderRadius: radios.lg, borderWidth: trazo.fino },
  chip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4 },
  chipAvatar: { width: 18, height: 18, borderRadius: radios.full },
  avatar: { width: 40, height: 40, borderRadius: radios.full },
  center: { alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { borderRadius: radios.full, paddingVertical: espaciado.e14, alignItems: 'center' },
  primaryText: { color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.fino },
  secondaryBtn: { borderRadius: radios.full, paddingVertical: espaciado.e13, alignItems: 'center', borderWidth: trazo.fino, alignSelf: 'stretch' },
  footer: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e10, borderTopWidth: StyleSheet.hairlineWidth },
  successCircle: { width: 84, height: 84, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
});
