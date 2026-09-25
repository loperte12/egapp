/**
 * EditProfileScreen — /edit-profile · "Editar perfil" estilo Xiaohongshu (P8).
 *
 * Pantalla completa (expo-router /edit-profile, protegida por AuthGate).
 *  · Cabecera fija: ‹ Volver · "Editar perfil" · Vista previa (modal local).
 *  · Bloque imagen: portada (ImageBackground con absUrl(coverUrl) o capa de
 *    marca) + avatar circular 84 con superposición; foto/portada se eligen con
 *    core/pickImage (galería/cámara robustas, sin base64 inline del picker) y el
 *    botón muestra "Procesando…" mientras se procesa; la imagen nueva SOLO se
 *    envía al pulsar Guardar cambios.
 *  · Información básica: nombre + ID de EG Route Plan (de solo lectura; no hay
 *    expo-clipboard instalado, así que no se ofrece copiar).
 *  · Personalización: biografía multilínea con contador 0/300 (FormField del
 *    kit fija su altura en 50 px y no puede alojar 4 líneas; se usa un campo
 *    equivalente con los mismos tokens del tema).
 *  · Datos personales y profesionales: género (chips), fecha de nacimiento
 *    (validación AAAA-MM-DD), ubicación (modal país + ciudades GQ), ocupación
 *    (modal agrupado PROFESSION_GROUPS), escuela e información original.
 *  · Gestión: widgets (Switch desde DEFAULT_WIDGETS) y enlaces/correos
 *    editables (máx. 8).
 *  · Guardar: updateMe() con payload parcial (solo lo que cambió + dataURLs
 *    nuevas + widgets + links) y vuelta a la pantalla anterior.
 *  · Si hay cambios sin guardar, Volver pide confirmación para descartar.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ImageBackground, Modal, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, BadgeCheck, Briefcase, Calendar, Camera, Check, ChevronRight,
  Globe, ImagePlus, Link2, Mail, MapPin, Phone, Plus, QrCode, School,
  Sparkles, Store, Trash2, Users, X,
} from 'lucide-react-native';
import { alpha, brand, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { pickImageFromCamera, pickImageFromLibrary } from '../core/pickImage';
import { authApi, type MeProfile, type ProfileLink, type UpdateProfilePayload, DEFAULT_WIDGETS } from '../api/auth';
import { tallasApi, type LbMisMedidas } from '../api/commerce';
import { numeroDeCm } from '../constants/tallas';
import { gruposEnlacesApi, type LbMiGrupo } from '../api/lifebookGrupos';
import { absUrl } from '../api/config';
import { COUNTRIES, GQ_CITIES } from '../constants/countries';
import { PROFESSIONS, PROFESSION_GROUPS } from '../constants/professions';
import { useStatusStore } from '../state/statusStore';

/** Regex de fecha de nacimiento AAAA-MM-DD. */
const BIRTH_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Colores de nombre sugeridos (Home/Perfil). 'Blanco' = sin color (por defecto). */
const NAME_COLORS = [
  { label: 'Azul', hex: brand.primary },
  { label: 'Cian', hex: brand.info },
  { label: 'Verde', hex: brand.success },
  { label: 'Amarillo', hex: brand.warning },
  { label: 'Naranja', hex: '#FF9F43' },
  { label: 'Rosa', hex: '#FF7BAC' },
  { label: 'Morado', hex: '#B57BFF' },
  { label: 'Rojo', hex: brand.danger },
] as const;

/** Géneros: se guardan en minúscula/valor corto; la etiqueta se muestra capitalizada. */
const GENDER_OPTIONS = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'no_decir', label: 'Prefiero no decirlo' },
] as const;

/** Tipos de enlace admitidos por el perfil (kind → label y placeholder). */
const LINK_KINDS: Array<{ kind: ProfileLink['kind']; label: string; placeholder: string; icon: any }> = [
  { kind: 'link', label: 'Enlace', placeholder: 'https://…', icon: Link2 },
  { kind: 'email', label: 'Correo', placeholder: 'nombre@correo.com', icon: Mail },
  { kind: 'phone', label: 'Teléfono', placeholder: '+240 …', icon: Phone },
  { kind: 'social', label: 'Social', placeholder: '@usuario', icon: Globe },
  /* El valor de un enlace de GRUPO es el CÓDIGO (6 caracteres), no una dirección: lo
     normal es elegir el grupo con el selector, pero aquí también se puede pegar un
     código que te hayan pasado. */
  { kind: 'group', label: 'Grupo', placeholder: 'Código del grupo, p. ej. 9TN6RV', icon: Users },
];

/** Widgets del perfil: clave de DEFAULT_WIDGETS → etiqueta en español + icono. */
const WIDGET_ROWS: Array<{ key: keyof typeof DEFAULT_WIDGETS; label: string; icon: any }> = [
  { key: 'lifebookPublic', label: 'Life Book público', icon: Sparkles },
  { key: 'showStats', label: 'Mostrar estadísticas', icon: Users },
  { key: 'showStore', label: 'Mostrar tienda', icon: Store },
  { key: 'showContact', label: 'Permitir contacto', icon: Mail },
  { key: 'showQR', label: 'Mostrar código QR', icon: QrCode },
];

/** Normaliza el valor guardado de género al valor corto esperado por el backend. */
function normGender(g?: string | null): string {
  const v = (g ?? '').toLowerCase().trim();
  if (v.includes('femenino')) return 'femenino';
  if (v.includes('masculino')) return 'masculino';
  return 'no_decir';
}

/** Mezcla los widgets del servidor con DEFAULT_WIDGETS (tipado booleano). */
function seedWidgets(p: MeProfile): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  (Object.keys(DEFAULT_WIDGETS) as Array<keyof typeof DEFAULT_WIDGETS>).forEach((k) => {
    const v = p.widgets?.[k];
    out[k] = typeof v === 'boolean' ? v : DEFAULT_WIDGETS[k];
  });
  return out;
}

export default function EditProfileScreen() {
  return (
    <AuthGate>
      <EditProfileContent />
    </AuthGate>
  );
}

function EditProfileContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status: myStatus } = useStatusStore();

  // ---- Carga del perfil ----
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ---- Formulario (sembrado al cargar el perfil) ----
  const [fullName, setFullName] = useState('');
  const [nameColor, setNameColor] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState('no_decir');
  const [birthDate, setBirthDate] = useState('');
  const [birthErr, setBirthErr] = useState<string | null>(null);
  const [school, setSchool] = useState('');
  const [country, setCountry] = useState<string | null>(null); // nombre visible
  const [countryCode, setCountryCode] = useState('GQ');
  const [city, setCity] = useState('');
  const [profession, setProfession] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<Record<string, boolean>>({});
  /**
   * Máximo de enlaces FIJADOS. El servidor aplica el mismo número (3): aquí es para
   * avisar antes de que alguien fije un cuarto y lo vea desaparecer sin explicación.
   */
  const MAX_FIJADOS = 3;
  const [links, setLinks] = useState<ProfileLink[]>([]);

  // ---- Imágenes nuevas (dataURL; solo se envían si cambian) ----
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  const [newCover, setNewCover] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // Origen en curso de core/pickImage (muestra "Procesando…" y desactiva acciones).
  const [picking, setPicking] = useState<'library' | 'camera' | null>(null);
  const [pickingTarget, setPickingTarget] = useState<'avatar' | 'cover' | null>(null);

  // ---- Estado de la pantalla ----
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasStatus24 = !!myStatus;

  // ---- Modales ----
  const [previewOpen, setPreviewOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  /* P3: selector de «enlazar uno de mis grupos». */
  const [grupoOpen, setGrupoOpen] = useState(false);

  const mark = () => setDirty(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    authApi.me()
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setFullName(p.fullName ?? '');
        setNameColor(p.nameColor ?? '');
        setBio(p.bio ?? '');
        setGender(normGender(p.gender));
        setBirthDate(p.birthDate ?? '');
        setSchool(p.school ?? '');
        setCountry(p.country ?? null);
        setCountryCode(p.countryCode ?? 'GQ');
        setCity(p.city ?? '');
        setProfession(p.profession ?? null);
        setWidgets(seedWidgets(p));
        setLinks((p.links ?? []).map((l) => ({ ...l })));
        setDirty(false);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil. Inténtalo de nuevo.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  // ---- Volver con control de cambios sin guardar ----
  const goBack = () => {
    if (saving) return;
    if (dirty) {
      Alert.alert('Descartar cambios', '¿Descartar los cambios sin guardar?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  // ---- Elegir imagen (avatar o portada) con core/pickImage (cámara/galería) ----
  const pedirOrigen = (target: 'avatar' | 'cover') => {
    if (picking !== null) return;
    Alert.alert(
      target === 'avatar' ? 'Cambiar foto de perfil' : 'Cambiar portada',
      'Elige el origen de la imagen',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cámara', onPress: () => { void procesarImagen(target, 'camera'); } },
        { text: 'Galería', onPress: () => { void procesarImagen(target, 'library'); } },
      ],
    );
  };

  const procesarImagen = async (target: 'avatar' | 'cover', origen: 'camera' | 'library') => {
    if (picking !== null) return;
    setImageError(null);
    setPicking(origen);
    setPickingTarget(target);
    try {
      const img = origen === 'camera' ? await pickImageFromCamera() : await pickImageFromLibrary();
      if (img) {
        if (target === 'avatar') setNewAvatar(img.dataUrl); else setNewCover(img.dataUrl);
        mark();
      }
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'No se pudo obtener la imagen. Inténtalo de nuevo');
    } finally {
      setPicking(null);
      setPickingTarget(null);
    }
  };

  // ---- Guardar (payload parcial: solo lo que cambió + dataURLs + widgets/links) ----
  const save = async () => {
    const name = fullName.trim();
    if (!name) { setSaveError('Escribe tu nombre para poder guardar'); return; }
    const bd = birthDate.trim();
    if (bd && !BIRTH_RE.test(bd)) {
      setBirthErr('Usa el formato AAAA-MM-DD');
      setSaveError('Revisa la fecha de nacimiento');
      return;
    }
    if (!profile) return;

    const payload: UpdateProfilePayload = {};

    if (name !== (profile.fullName ?? '').trim()) payload.fullName = name;
    if ((nameColor ?? '') !== (profile.nameColor ?? '')) payload.nameColor = nameColor || undefined;
    if (bio !== (profile.bio ?? '')) payload.bio = bio;
    if (gender !== normGender(profile.gender)) payload.gender = gender;
    if (birthDate.trim() !== (profile.birthDate ?? '').trim()) payload.birthDate = birthDate.trim();
    if (school.trim() !== (profile.school ?? '').trim()) payload.school = school.trim();

    // Ubicación: si cualquiera de los tres cambió, se envían juntos.
    const cCountry = country ?? '';
    const cCity = city.trim();
    if (cCountry !== (profile.country ?? '') || countryCode !== (profile.countryCode ?? 'GQ') || cCity !== (profile.city ?? '').trim()) {
      payload.country = cCountry;
      payload.countryCode = countryCode;
      payload.city = cCity;
    }

    if ((profession ?? '') !== (profile.profession ?? '')) payload.profession = profession ?? undefined;

    if (newAvatar) payload.avatar = newAvatar;
    if (newCover) payload.cover = newCover;

    // Widgets y enlaces: siempre se envían con el estado local (objeto limpio).
    payload.widgets = { ...widgets };
    payload.links = links.map((l) => ({ ...l }));

    setSaving(true);
    setSaveError(null);
    try {
      await authApi.updateMe(payload);
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo');
    } finally {
      setSaving(false);
    }
  };

  // ---- Pantalla de carga ----
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ---- Error de carga con reintentar ----
  if (!profile || loadError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: espaciado.e28 }]}>
        <Text style={{ color: colors.danger, fontWeight: peso.fuerte, textAlign: 'center', fontSize: tipografia.body }}>No se pudo cargar tu perfil.</Text>
        {loadError ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, marginBottom: espaciado.e16 }}>{loadError}</Text> : null}
        <Pressable
          onPress={() => setReloadKey((k) => k + 1)}
          accessibilityRole="button"
          accessibilityLabel="Reintentar"
          style={({ pressed }) => [{ backgroundColor: colors.primary, paddingHorizontal: espaciado.e22, paddingVertical: espaciado.e11, borderRadius: radios.md, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const egId = `EG-${(profile.id.replace(/-/g, '').slice(0, 8)).toUpperCase()}`;
  const avatarDisplay = newAvatar ?? (profile.avatarUrl ? absUrl(profile.avatarUrl) : null);
  const coverDisplay = newCover ?? (profile.coverUrl ? absUrl(profile.coverUrl) : null);
  const initial = (fullName.trim() || profile.fullName || 'U').charAt(0).toUpperCase() || 'U';
  const cityTxt = city.trim();
  const locationTxt = `${country ?? 'Guinea Ecuatorial'}${cityTxt ? ` · ${cityTxt}` : ''}`;
  const bioCount = bio.length;
  const pickingAvatar = picking !== null && pickingTarget === 'avatar';
  const pickingCover = picking !== null && pickingTarget === 'cover';

  // Información original (creador): solo lectura.
  const oc = (profile.originalCreator ?? 'not_verified') as 'verified' | 'pending' | 'not_verified';
  const ocColor = oc === 'verified' ? colors.success : oc === 'pending' ? colors.secondary : colors.textSecondary;
  const ocLabel = oc === 'verified' ? 'Verificado' : oc === 'pending' ? 'Pendiente' : 'No verificado';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ============ Cabecera fija ============ */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 72, alignItems: 'flex-start' }}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]} numberOfLines={1}>Editar perfil</Text>
        <Pressable onPress={() => setPreviewOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Vista previa del perfil" style={{ width: 72, alignItems: 'flex-end' }}>
          <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Vista previa</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ============ 1) Bloque imagen (portada + avatar) ============ */}
        <View style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {coverDisplay ? (
            <ImageBackground source={{ uri: coverDisplay }} style={styles.cover} imageStyle={styles.coverImg}>
              <View style={styles.coverScrim} pointerEvents="none" />
            </ImageBackground>
          ) : (
            <View style={[styles.cover, styles.coverFallback, { backgroundColor: alpha(colors.primary, 0.14) }]}>
              <View style={[styles.coverBlob, { right: -26, top: -34, backgroundColor: alpha(colors.secondary, 0.22) }]} pointerEvents="none" />
              <View style={[styles.coverBlob, { left: -40, bottom: -46, backgroundColor: alpha(colors.primary, 0.16) }]} pointerEvents="none" />
              <View style={styles.coverFallbackHint} pointerEvents="none">
                <ImagePlus size={16} color={alpha(colors.primary, 0.85)} />
                <Text style={{ color: alpha(colors.primary, 0.9), fontSize: tipografia.micro, fontWeight: peso.maximo }}>Añade una portada</Text>
              </View>
            </View>
          )}

          {/* Avatar superpuesto (borde inferior izquierdo de la portada) */}
          <View style={[styles.avatarWrap, { backgroundColor: colors.card }]}>
            {avatarDisplay ? (
              <Image source={{ uri: avatarDisplay }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarEmpty, { backgroundColor: alpha(colors.primary, 0.16) }]}>
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
              </View>
            )}
          </View>

          {/* Acciones de imagen (a la derecha del hueco que deja el avatar) */}
          <View style={styles.imageActions}>
            <MiniAction icon={Camera} label="Cambiar foto de perfil" busy={pickingAvatar} disabled={picking !== null} onPress={() => pedirOrigen('avatar')} />
            <MiniAction icon={ImagePlus} label="Cambiar portada" busy={pickingCover} disabled={picking !== null} onPress={() => pedirOrigen('cover')} />
            {imageError ? (
              <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>{imageError}</Text>
            ) : null}
            {(newAvatar || newCover) ? (
              <Text style={{ color: colors.success, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>
                Imagen{newAvatar && newCover ? 'es' : ''} nueva elegida · se aplicará al guardar
              </Text>
            ) : null}
          </View>
        </View>

        {/* ============ 2) Información básica ============ */}
        <SeccionTitle>Información básica</SeccionTitle>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FormField
            label="Nombre"
            placeholder="Tu nombre completo"
            value={fullName}
            onChangeText={(t) => { setFullName(t.slice(0, 120)); mark(); }}
            maxLength={120}
            editable={!saving}
          />
          {/* Color del nombre (se muestra en Home y Perfil) */}
          <View style={{ marginTop: espaciado.e10 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Color de tu nombre</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e9, marginTop: espaciado.e8 }}>
              {NAME_COLORS.map((c) => {
                const active = nameColor === c.hex;
                return (
                  <Pressable
                    key={c.hex}
                    onPress={() => { setNameColor(active ? '' : c.hex); mark(); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`Color ${c.label}`}
                    style={[
                      styles.nameColorDot,
                      { backgroundColor: c.hex, borderColor: active ? colors.primary : colors.border },
                      active && { transform: [{ scale: 1.18 }], borderWidth: trazo.fuerte },
                    ]}
                  />
                );
              })}
              <Pressable
                onPress={() => { setNameColor(''); mark(); }}
                accessibilityRole="button"
                accessibilityLabel="Color por defecto (blanco)"
                style={[styles.nameColorReset, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.nota, fontWeight: peso.maximo }}>Blanco</Text>
              </Pressable>
            </View>
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              Así se verá tu nombre en la Home y en tu perfil.
            </Text>
          </View>
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          {/* Estado 24h: acceso a la pantalla de gestión (☰ también enlaza). */}
          <View style={{ marginTop: espaciado.e6 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Estado 24h</Text>
            <Pressable
              onPress={() => router.push('/status' as never)}
              accessibilityRole="button"
              accessibilityLabel="Gestionar mi estado 24h"
              style={({ pressed }) => [styles.statusRow, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                  {hasStatus24 ? 'Ver y cambiar mi estado' : 'Agregar estado 24h'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: 1 }}>
                  Comparte qué haces · dura 24 horas y desaparece solo.
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ID de EG Route Plan</Text>
            <View style={[styles.idBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.idTxt, { color: colors.textPrimary }]}>{egId}</Text>
              <BadgeCheck size={17} color={colors.primary} />
            </View>
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>Tu ID es único y no se puede cambiar.</Text>
          </View>
        </View>

        {/* ============ 3) Personalización ============ */}
        <SeccionTitle>Personalización</SeccionTitle>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Biografía</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>{bioCount}/300</Text>
          </View>
          <Text style={[styles.fieldHint, { color: colors.textSecondary, marginTop: espaciado.e2 }]}>
            😀 Cuéntale a la comunidad quién eres · 📍 Puedes mencionar tu ciudad
          </Text>
          <CampoBio
            value={bio}
            onChangeText={(t) => { setBio(t.slice(0, 300)); mark(); }}
            placeholder="Cuéntale a la comunidad quién eres…"
            maxLength={300}
          />
        </View>

        {/* ============ 4) Datos personales y profesionales ============ */}
        <SeccionTitle>Datos personales y profesionales</SeccionTitle>

        {/* Género */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Género</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
            {GENDER_OPTIONS.map((g) => (
              <Chip
                key={g.value}
                label={g.label}
                active={gender === g.value}
                onPress={() => { setGender(g.value); mark(); }}
              />
            ))}
          </View>
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <FormField
            label="Fecha de nacimiento"
            placeholder="AAAA-MM-DD"
            value={birthDate}
            error={birthErr ?? undefined}
            onChangeText={(t) => {
              setBirthDate(t);
              if (birthErr) setBirthErr(t && !BIRTH_RE.test(t.trim()) ? birthErr : null);
              mark();
            }}
            maxLength={10}
            editable={!saving}
            icon={<Calendar size={18} color={colors.textSecondary} />}
          />
        </View>

        {/* Ubicación */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FilaDeCampo
            icon={MapPin}
            label="Ubicación actual"
            hint={locationTxt}
            onPress={() => setLocOpen(true)}
            last
          />
        </View>

        {/* Ocupación · Escuela · Información original */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FilaDeCampo
            icon={Briefcase}
            label="Ocupación / Profesión"
            hint={profession ?? 'Añadir'}
            onPress={() => setProfOpen(true)}
          />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <FormField
            label="Institución educativa"
            placeholder="Universidad o escuela"
            value={school}
            onChangeText={(t) => { setSchool(t.slice(0, 120)); mark(); }}
            maxLength={120}
            editable={!saving}
            icon={<School size={18} color={colors.textSecondary} />}
          />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingVertical: espaciado.e2 }}>
            <View style={[styles.rowIcon, { backgroundColor: alpha(ocColor, 0.12) }]}>
              <BadgeCheck size={18} color={ocColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>Información original</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: 1 }}>
                Estado de creador original en Life Book
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: alpha(ocColor, 0.14) }]}>
              <Text style={{ color: ocColor, fontSize: 10.5, fontWeight: peso.titulo }}>{ocLabel}</Text>
            </View>
          </View>
        </View>

        {/* ============ 5) Gestión ============ */}
        <SeccionTitle>Gestión</SeccionTitle>

        {/* Widgets */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {WIDGET_ROWS.map((w, i) => (
            <FilaDeCampo
              key={w.key}
              icon={w.icon}
              label={w.label}
              last={i === WIDGET_ROWS.length - 1}
              right={(
                <Switch
                  value={widgets[w.key] === true}
                  onValueChange={(v) => { setWidgets((prev) => ({ ...prev, [w.key]: v })); mark(); }}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  accessibilityLabel={w.label}
                />
              )}
            />
          ))}
        </View>

        {/* Medidas para la talla (tanda L): se ven aquí y se borran aquí */}
        <MisMedidasCard colors={colors} />

        {/* Enlaces y correos */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setLinkOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Añadir enlace o correo"
            style={({ pressed }) => [styles.addLinkRow, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 }]}
          >
            <Plus size={17} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Añadir enlace o correo</Text>
            <Text style={{ marginLeft: 'auto', color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{links.length}/8</Text>
          </Pressable>

          {/* P3 — ENLAZAR UN GRUPO MÍO. Va aparte del botón de arriba porque aquí no se
              escribe nada: se elige el grupo y el servidor da su código de invitación. */}
          <Pressable
            onPress={() => setGrupoOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Enlazar uno de mis grupos"
            style={({ pressed }) => [styles.addLinkRow, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1, marginTop: espaciado.e8 }]}
          >
            <Users size={17} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Enlazar uno de mis grupos</Text>
          </Pressable>

          {links.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e12, lineHeight: 17 }}>
              Los enlaces, correos o redes que añadas se mostrarán en tu perfil público (máx. 8). Puedes FIJAR hasta {MAX_FIJADOS} con 📌 para que salgan arriba.
            </Text>
          ) : (
            links.map((l, idx) => {
              const meta = LINK_KINDS.find((k) => k.kind === l.kind) ?? LINK_KINDS[0];
              const Icon = meta.icon;
              return (
                <View key={`${l.kind}-${idx}`} style={[styles.linkRow, { borderBottomColor: colors.border }, idx === links.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.rowIcon, { backgroundColor: alpha(colors.primary, 0.08) }]}>
                    <Icon size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }} numberOfLines={1}>{l.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: 1 }} numberOfLines={1}>{l.value}</Text>
                  </View>
                  {/* ── FIJAR ──
                      Un enlace fijado sale ARRIBA y con 📌 en el perfil público (es lo
                      que se pidió: poder fijar, por ejemplo, el enlace de un grupo). El
                      máximo de 3 lo aplica el SERVIDOR; aquí se avisa ANTES para que
                      nadie fije un cuarto y lo vea desaparecer sin explicación. */}
                  <Pressable
                    onPress={() => {
                      const yaFijados = links.filter((x) => x.pinned).length;
                      if (!l.pinned && yaFijados >= MAX_FIJADOS) {
                        Alert.alert(
                          `Ya tienes ${MAX_FIJADOS} enlaces fijados`,
                          'Quita el pin de uno para poder fijar otro.',
                        );
                        return;
                      }
                      setLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, pinned: !x.pinned } : x)));
                      mark();
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={l.pinned ? `Dejar de fijar ${l.label}` : `Fijar ${l.label}`}
                    style={{ paddingHorizontal: espaciado.e8, opacity: l.pinned ? 1 : 0.3 }}
                  >
                    <Text style={{ fontSize: tipografia.subtitle }}>📌</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => { setLinks((prev) => prev.filter((_, i) => i !== idx)); mark(); }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar ${l.label}`}
                  >
                    <Trash2 size={18} color={colors.danger} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* ============ 6) Pie: Guardar ============ */}
        {saveError ? (
          <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'center', marginTop: espaciado.e18 }}>
            {saveError}
          </Text>
        ) : null}
        <View style={{ marginTop: saveError ? 10 : 22 }}>
          <PrimaryButton
            title={saving ? 'Guardando…' : 'Guardar cambios'}
            onPress={() => { void save(); }}
            loading={saving}
            disabled={saving}
            accessibilityLabel="Guardar cambios del perfil"
          />
        </View>
        <Text style={[styles.footNote, { color: colors.textSecondary }]}>
          Tu número de teléfono nunca se muestra en tu perfil público.
        </Text>
      </ScrollView>

      {/* ============ Modal: Vista previa ============ */}
      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)} statusBarTranslucent>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewOpen(false)} />
          <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Así te ven los demás</Text>
              <Pressable onPress={() => setPreviewOpen(false)} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
            </View>

            {/* Mini-preview */}
            <View style={[styles.previewMini, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
                <View style={[styles.previewAvatar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {avatarDisplay ? (
                    <Image source={{ uri: avatarDisplay }} style={styles.previewAvatarImg} />
                  ) : (
                    <Text style={[styles.previewAvatarTxt, { color: colors.primary }]}>{initial}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: nameColor || colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }} numberOfLines={1}>
                    {fullName.trim() || profile.fullName || 'Usuario'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2 }} numberOfLines={1}>
                    {profession ?? locationTxt}
                  </Text>
                </View>
              </View>
              {bio.trim() ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, lineHeight: 18, marginTop: espaciado.e10 }} numberOfLines={3}>
                  {bio}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e10 }}>
              Los cambios se aplican cuando pulsas «Guardar cambios».
            </Text>
            <View style={{ marginTop: espaciado.e14 }}>
              <PrimaryButton title="Cerrar" onPress={() => setPreviewOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ============ Modal: Ubicación (país + ciudad GQ / libre) ============ */}
      <ModalSelectorPais
        visible={locOpen}
        country={country}
        countryCode={countryCode}
        city={city}
        onApply={(loc) => {
          setCountry(loc.country);
          setCountryCode(loc.countryCode);
          setCity(loc.city);
          mark();
          setLocOpen(false);
        }}
        onClose={() => setLocOpen(false)}
      />

      {/* ============ Modal: Profesión ============ */}
      <ModalProfesion
        visible={profOpen}
        current={profession}
        onApply={(p) => { setProfession(p); mark(); setProfOpen(false); }}
        onClose={() => setProfOpen(false)}
      />

      {/* ============ Modal: Añadir enlace/correo ============ */}
      <ModalEnlace
        visible={linkOpen}
        onAdd={(l) => {
          if (links.length >= 8) {
            Alert.alert('Límite alcanzado', 'Puedes añadir hasta 8 enlaces, correos o redes en tu perfil.');
            return;
          }
          setLinks((prev) => [...prev, l]);
          mark();
          setLinkOpen(false);
        }}
        onClose={() => setLinkOpen(false)}
      />

      {/* ============ Modal: Enlazar uno de mis grupos (P3) ============ */}
      <ModalGrupo
        visible={grupoOpen}
        onAdd={(l) => {
          if (links.length >= 8) {
            Alert.alert('Límite alcanzado', 'Puedes añadir hasta 8 enlaces, correos o redes en tu perfil.');
            return;
          }
          /* Un enlace de grupo NACE FIJADO si queda sitio: se pidió precisamente para
             eso, para que el grupo se vea arriba en el perfil. Si ya hay 3 fijados se
             añade sin fijar (y el usuario decide qué quitar). */
          const yaFijados = links.filter((x) => x.pinned).length;
          setLinks((prev) => [...prev, { ...l, pinned: yaFijados < MAX_FIJADOS }]);
          mark();
          setGrupoOpen(false);
        }}
        onClose={() => setGrupoOpen(false)}
      />
    </View>
  );
}

/* ====================================================================== *
 *  Componentes auxiliares (mismo archivo)
 * ====================================================================== */

/**
 * MERCADO (tanda L) — MIS MEDIDAS.
 *
 * Son las medidas que usa el asistente de talla: **altura, peso y número de calzado, en un solo
 * juego** (petición del dueño: «van juntos, el guardado será juntos»). Antes había dos bloques, ropa
 * y calzado, y podías tener uno sin el otro; ahora es uno y se borra de una vez.
 *
 * Viven aquí (en el perfil) porque son TUYAS: **la tienda nunca las recibe**, solo la talla que
 * elijas al comprar.
 */
function MisMedidasCard({ colors }: { colors: any }) {
  const [mias, setMias] = useState<LbMisMedidas | null>(null);
  const [borrando, setBorrando] = useState(false);

  const cargar = React.useCallback(() => {
    tallasApi.misMedidas().then(setMias).catch(() => setMias({ body: null, feet: null }));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  /** El servidor devuelve el mismo juego en las dos claves; `feet` es respaldo de datos antiguos. */
  const juego = mias?.body ?? mias?.feet ?? null;

  const resumen = (): string => {
    if (!juego) return 'Sin medidas guardadas';
    const partes: string[] = [];
    if (juego.heightCm) partes.push(`${juego.heightCm} cm`);
    if (juego.weightKg) partes.push(`${juego.weightKg} kg`);
    if (juego.footLengthCm) partes.push(`calzado ${numeroDeCm(juego.footLengthCm)} (pie ${juego.footLengthCm} cm)`);
    if (juego.chestCm) partes.push(`pecho ${juego.chestCm}`);
    if (juego.waistCm) partes.push(`cintura ${juego.waistCm}`);
    if (juego.hipCm) partes.push(`cadera ${juego.hipCm}`);
    return partes.length ? partes.join(' · ') : 'Sin medidas guardadas';
  };

  const borrar = () => {
    Alert.alert(
      'Borrar mis medidas',
      'Se borran todas (altura, peso y número de calzado). La próxima vez que mires una talla te las preguntaremos otra vez.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setBorrando(true);
            try { setMias(await tallasApi.borrarMedidas()); }
            catch { /* si falla, se queda como estaba */ }
            finally { setBorrando(false); }
          },
        },
      ],
    );
  };

  const texto = resumen();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>Mis medidas</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>{texto}</Text>
        </View>
        {texto !== 'Sin medidas guardadas' ? (
          <Pressable
            onPress={borrar}
            disabled={borrando}
            accessibilityLabel="Borrar mis medidas"
            style={{ paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e8 }}
          >
            <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
              {borrando ? 'Borrando…' : 'Borrar'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Título de grupo: mayúsculas 11 #8E8E93 con espaciado. */
function SeccionTitle({ children }: { children: React.ReactNode }) {  return <Text style={styles.groupTitle}>{children}</Text>;
}

/** Píldora seleccionable (género, chips de ciudad, tipos de enlace…). */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? alpha(colors.primary, 0.12) : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: active ? peso.titulo : peso.fuerte }}>{label}</Text>
    </Pressable>
  );
}

/** Fila estándar del formulario: icono en caja alfa + etiqueta + hint/control. */
function FilaDeCampo({ icon: Icon, label, hint, onPress, right, last }: {
  icon: any;
  label: string;
  hint?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed && onPress ? alpha(colors.primary, 0.05) : 'transparent' },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: alpha(colors.primary, 0.08) }]}>
        <Icon size={18} color={colors.primary} />
      </View>
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }} numberOfLines={1}>{label}</Text>
      {hint ? (
        <Text style={[styles.rowHint, { color: colors.textSecondary }]} numberOfLines={1}>{hint}</Text>
      ) : null}
      {right ?? (onPress ? <ChevronRight size={16} color={colors.textSecondary} /> : null)}
    </Pressable>
  );
}

/** Acción compacta de imagen (cambiar foto de perfil / cambiar portada).
 *  Mientras core/pickImage procesa (busy) muestra spinner + "Procesando…". */
function MiniAction({ icon: Icon, label, onPress, busy = false, disabled = false }: {
  icon: any;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const inactive = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: inactive }}
      style={({ pressed }) => [styles.miniAction, { backgroundColor: colors.surface, borderColor: colors.border, opacity: inactive ? 0.55 : pressed ? 0.7 : 1 }]}
    >
      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Procesando…</Text>
        </View>
      ) : (
        <>
          <Icon size={15} color={colors.primary} />
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Campo de biografía multilínea. El FormField del kit fija su caja en 50 px de
 * alto, insuficiente para 4 líneas: aquí se replica su lenguaje visual
 * (surface, borde 1.5 redondeado y foco azul) en un área multilínea real.
 */
function CampoBio({ value, onChangeText, placeholder, maxLength }: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  maxLength: number;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      multiline
      numberOfLines={4}
      maxLength={maxLength}
      editable
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.bioInput,
        {
          backgroundColor: colors.surface,
          borderColor: focused ? colors.primary : 'transparent',
          color: colors.textPrimary,
          textAlignVertical: 'top',
        },
      ]}
    />
  );
}

/** Hoja inferior reutilizable (fondo rgba(0,0,0,.45), tarjeta con radio 24 arriba). */
function HojaInferior({ visible, title, subtitle, onClose, children }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.sheetRoot, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheetCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
              {subtitle ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2 }}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Selector de país + ciudad (Guinea Ecuatorial por defecto). */
function ModalSelectorPais({ visible, country, countryCode, city, onApply, onClose }: {
  visible: boolean;
  country: string | null;
  countryCode: string;
  city: string;
  onApply: (loc: { country: string; countryCode: string; city: string }) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [code, setCode] = useState(countryCode || 'GQ');
  const [cityV, setCityV] = useState(city ?? '');
  const [otra, setOtra] = useState(false);

  useEffect(() => {
    if (visible) {
      const c = countryCode || 'GQ';
      const cv = city ?? '';
      setQ('');
      setCode(c);
      setCityV(cv);
      setOtra(c === 'GQ' && cv.trim().length > 0 && !(GQ_CITIES as readonly string[]).includes(cv.trim()));
    }
  }, [visible, countryCode, city]);

  const isGQ = code === 'GQ';
  const filtered = COUNTRIES.filter(
    (c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.code.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const aplicar = () => {
    const found = COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
    onApply({ country: found.name, countryCode: found.code, city: cityV.trim() });
  };

  return (
    <HojaInferior visible={visible} title="Ubicación" subtitle="País y ciudad que verá tu comunidad" onClose={onClose}>
      <FormField
        label="Buscar país (nombre o abreviatura)"
        placeholder="Ej: Guinea Ecuatorial (GQ)…"
        value={q}
        onChangeText={setQ}
      />
      <ScrollView style={{ maxHeight: 236, marginTop: espaciado.e6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, paddingVertical: espaciado.e14, textAlign: 'center' }}>
            Sin resultados para «{q}»
          </Text>
        ) : (
          filtered.map((c) => {
            const active = c.code === code;
            return (
              <Pressable
                key={c.code}
                onPress={() => { setCode(c.code); if (c.code !== 'GQ') { setCityV(''); setOtra(false); } }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
              >
                <Text style={[styles.pickRowTxt, { color: active ? colors.primary : colors.textPrimary, fontWeight: active ? peso.titulo : peso.medio }]}>
                  {c.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginRight: espaciado.e8 }}>{c.code}</Text>
                {active ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {isGQ ? (
        <View style={{ marginTop: espaciado.e10 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Ciudad (Guinea Ecuatorial)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7, marginTop: espaciado.e6 }}>
            {GQ_CITIES.map((c) => {
              const active = cityV.trim() === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => { setCityV(active ? '' : c); setOtra(false); }}
                  style={({ pressed }) => [styles.cityChip, { backgroundColor: active ? alpha(colors.primary, 0.14) : colors.surface, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{c}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setOtra((o) => !o)}
              style={({ pressed }) => [styles.cityChip, { backgroundColor: otra ? alpha(colors.primary, 0.14) : colors.surface, borderColor: otra ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={{ color: otra ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Otra ciudad…</Text>
            </Pressable>
          </View>
          {otra ? (
            <View style={{ marginTop: espaciado.e8 }}>
              <FormField label="Otra ciudad" placeholder="Escribe tu ciudad…" value={cityV} onChangeText={setCityV} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ marginTop: espaciado.e10 }}>
          <FormField label="Ciudad" placeholder="Escribe tu ciudad…" value={cityV} onChangeText={setCityV} />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e14 }}>
        <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={onClose} /></View>
        <View style={{ flex: 1.4 }}><PrimaryButton title="Guardar ubicación" onPress={aplicar} /></View>
      </View>
    </HojaInferior>
  );
}

/** Selector de profesión agrupado por categoría (Buscar Work). */
function ModalProfesion({ visible, current, onApply, onClose }: {
  visible: boolean;
  current: string | null;
  onApply: (prof: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [sel, setSel] = useState('');
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (visible) {
      const cur = current ?? '';
      const known = PROFESSIONS.some((p) => p.label === cur);
      setSel(known ? cur : '');
      setCustom(known ? '' : cur);
    }
  }, [visible, current]);

  const canSave = sel.length > 0 || custom.trim().length > 0;

  const guardar = () => {
    const final = custom.trim() || sel;
    if (!final) return;
    onApply(final);
  };

  return (
    <HojaInferior visible={visible} title="Profesión" subtitle="Sincronizada con Buscar Work" onClose={onClose}>
      <ScrollView style={{ flexShrink: 1, marginTop: espaciado.e4 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {PROFESSION_GROUPS.map((g) => (
          <View key={g.categoryId}>
            <Text style={[styles.groupHeader, { color: '#8E8E93' }]}>{g.categoryLabel}</Text>
            {g.items.map((p) => {
              const active = sel === p.label;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSel(active ? '' : p.label)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
                >
                  <Text style={[styles.pickRowTxt, { color: active ? colors.primary : colors.textPrimary, fontWeight: active ? peso.titulo : peso.medio }]}>
                    {p.label}
                  </Text>
                  {active ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View style={{ marginTop: espaciado.e8 }}>
        <FormField
          label="Otra profesión…"
          placeholder="Escribe tu profesión"
          value={custom}
          onChangeText={setCustom}
          maxLength={80}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e10 }}>
        <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={onClose} /></View>
        <View style={{ flex: 1.4 }}><PrimaryButton title="Guardar profesión" onPress={guardar} disabled={!canSave} /></View>
      </View>
    </HojaInferior>
  );
}

/** Añadir enlace / correo / teléfono / red social (hasta 8 en total). */
function ModalEnlace({ visible, onAdd, onClose }: {
  visible: boolean;
  onAdd: (l: ProfileLink) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [kind, setKind] = useState<ProfileLink['kind']>('link');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setKind('link'); setLabel(''); setValue(''); setError(null); }
  }, [visible]);

  const meta = LINK_KINDS.find((k) => k.kind === kind) ?? LINK_KINDS[0];

  const anadir = () => {
    if (!label.trim()) { setError('Pon un nombre para el enlace (p. ej. Instagram, WhatsApp, Web…)'); return; }
    if (!value.trim()) {
      setError(kind === 'email' ? 'Escribe un correo válido' : 'Pega la URL o el usuario');
      return;
    }
    onAdd({ kind, label: label.trim(), value: value.trim() });
  };

  return (
    <HojaInferior visible={visible} title="Añadir enlace o correo" subtitle="Se mostrará en tu perfil público" onClose={onClose}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: espaciado.e2 }]}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e6 }}>
        {LINK_KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} active={kind === k.kind} onPress={() => { setKind(k.kind); setError(null); }} />
        ))}
      </View>

      <View style={{ gap: espaciado.e12, marginTop: espaciado.e14 }}>
        <FormField
          label="Nombre"
          placeholder={kind === 'link' ? 'Mi sitio web' : kind === 'email' ? 'Correo de contacto' : kind === 'phone' ? 'WhatsApp' : 'Instagram'}
          value={label}
          onChangeText={setLabel}
          maxLength={60}
        />
        <FormField
          label="Valor"
          placeholder={meta.placeholder}
          value={value}
          onChangeText={setValue}
          maxLength={140}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8 }}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e14 }}>
        <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={onClose} /></View>
        <View style={{ flex: 1.4 }}><PrimaryButton title="Añadir" onPress={anadir} /></View>
      </View>
    </HojaInferior>
  );
}

/**
 * P3 — ELEGIR UNO DE MIS GRUPOS para enlazarlo en el perfil.
 *
 * El valor del enlace es el CÓDIGO de invitación del grupo, así que no se escribe a
 * mano: se elige. Solo aparecen los grupos donde soy DUEÑO o ADMINISTRADOR, porque son
 * los únicos que pueden sacar el código (el servidor responde 403 a los demás): es mejor
 * no ofrecer algo que va a fallar.
 *
 * El código CADUCA a los 7 días. Eso no se avisa aquí para no llenar la pantalla: el
 * perfil público lo comprueba al pintarlo y, si ya no sirve, lo dice él mismo.
 */
function ModalGrupo({ visible, onAdd, onClose }: {
  visible: boolean;
  onAdd: (l: ProfileLink) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [grupos, setGrupos] = useState<LbMiGrupo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Id del grupo cuyo código se está pidiendo (para el girador de esa fila). */
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    setError(null);
    setGrupos(null);
    setOcupado(null);
    gruposEnlacesApi.misGrupos()
      .then((g) => { if (vivo) setGrupos(g.filter((x) => x.myRole === 'owner' || x.myRole === 'admin')); })
      .catch((e) => {
        if (!vivo) return;
        setGrupos([]);
        setError(e instanceof Error ? e.message : 'No se pudieron leer tus grupos');
      });
    return () => { vivo = false; };
  }, [visible]);

  const elegir = async (g: LbMiGrupo) => {
    setOcupado(g.id);
    setError(null);
    try {
      const r = await gruposEnlacesApi.codigo(g.id);
      onAdd({ kind: 'group', label: (r.title ?? '').trim() || g.title, value: r.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el enlace del grupo');
    } finally { setOcupado(null); }
  };

  return (
    <HojaInferior
      visible={visible}
      title="Enlazar un grupo"
      subtitle="Se verá en tu perfil público, con enlace de invitación"
      onClose={onClose}
    >
      {grupos === null ? (
        <View style={{ paddingVertical: espaciado.e28, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : grupos.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, lineHeight: 18, marginTop: espaciado.e4 }}>
          {error ?? 'No eres dueño ni administrador de ningún grupo. Solo ellos pueden crear el enlace de invitación.'}
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: espaciado.e8 }} keyboardShouldPersistTaps="handled">
          {grupos.map((g) => (
            <Pressable
              key={g.id}
              disabled={!!ocupado}
              onPress={() => void elegir(g)}
              accessibilityRole="button"
              accessibilityLabel={`Enlazar el grupo ${g.title}`}
              style={({ pressed }) => [{
                flexDirection: 'row' as const, alignItems: 'center' as const, gap: espaciado.e10,
                backgroundColor: colors.surface, borderRadius: 14, padding: espaciado.e10,
                borderWidth: trazo.fino, borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              {g.photoUrl ? (
                <Image source={{ uri: absUrl(g.photoUrl) }} style={{ width: 42, height: 42, borderRadius: radios.md }} />
              ) : (
                <View style={{ width: 42, height: 42, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.12) }}>
                  <Users size={20} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }} numberOfLines={1}>{g.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: 1 }} numberOfLines={1}>
                  {g.members} {g.members === 1 ? 'miembro' : 'miembros'} · {g.myRole === 'owner' ? 'eres el dueño' : 'eres administrador'}
                </Text>
              </View>
              {ocupado === g.id
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <ChevronRight size={18} color={colors.textSecondary} />}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {error && grupos && grupos.length > 0 ? (
        <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e10 }}>{error}</Text>
      ) : null}

      <View style={{ marginTop: espaciado.e14 }}>
        <GhostButton title="Cerrar" onPress={onClose} />
      </View>
    </HojaInferior>
  );
}

/* ====================================================================== *
 *  Estilos
 * ====================================================================== */

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Cabecera
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 17, fontWeight: peso.titulo, flex: 1, textAlign: 'center' },

  // Títulos de grupo
  groupTitle: {
    fontSize: tipografia.micro, fontWeight: peso.maximo, color: '#8E8E93', letterSpacing: 0.5,
    textTransform: 'uppercase', marginTop: espaciado.e20, marginBottom: espaciado.e8, marginLeft: espaciado.e4,
  },

  // Tarjetas de grupo
  card: {
    borderRadius: radios.lg, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e16,
  },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: espaciado.e16 },
  fieldLabel: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginBottom: espaciado.e6, marginLeft: espaciado.e4 },
  fieldHint: { fontSize: tipografia.micro, fontWeight: peso.medio, marginTop: espaciado.e5, marginLeft: espaciado.e4, lineHeight: 15 },
  nameColorDot: {
    width: 30, height: 30, borderRadius: radios.full, borderWidth: trazo.fino,
  },
  nameColorReset: {
    borderRadius: radios.full, paddingHorizontal: espaciado.e10, justifyContent: 'center',
    borderWidth: trazo.fino, minHeight: 30,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderRadius: 14, borderWidth: trazo.fino, padding: espaciado.e13, marginTop: espaciado.e8,
  },

  // Bloque imagen
  imageCard: {
    marginTop: espaciado.e14, borderRadius: radios.lg, borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: espaciado.e14, overflow: 'hidden',
  },
  cover: { width: '100%', height: 120, justifyContent: 'flex-end', overflow: 'hidden' },
  coverImg: { resizeMode: 'cover' },
  coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,14,24,0.16)' },
  coverFallback: { overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'flex-end' },
  coverBlob: { position: 'absolute', width: 150, height: 150, borderRadius: radios.full },
  coverFallbackHint: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e5,
    paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, borderRadius: radios.full,
    backgroundColor: 'rgba(255,255,255,0.75)', margin: espaciado.e8,
  },
  avatarWrap: {
    position: 'absolute', top: 120 - 42, left: 14,
    width: 84, height: 84, borderRadius: radios.full, borderWidth: trazo.anillo,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: tipografia.hero, fontWeight: peso.titulo },
  imageActions: { marginTop: 52, paddingLeft: 116, paddingRight: espaciado.e14, gap: espaciado.e8 },
  miniAction: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderRadius: radios.md, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10,
  },

  // Fila genérica
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingVertical: espaciado.e12 },
  rowIcon: { width: 32, height: 32, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center' },
  rowHint: { fontSize: tipografia.caption, fontWeight: peso.medio, maxWidth: '46%', textAlign: 'right' },

  // ID de EG Route Plan
  idBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, paddingHorizontal: espaciado.e14, height: 48,
  },
  idTxt: { fontSize: 15, fontWeight: peso.maximo, letterSpacing: 1 },

  // Chip
  chip: {
    borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8,
  },

  // Biografía
  bioInput: {
    borderRadius: 14, borderWidth: trazo.base, minHeight: 112,
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e12, fontSize: tipografia.fino, fontWeight: peso.medio, lineHeight: 20,
  },

  // Enlaces
  addLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderWidth: trazo.fino, borderRadius: 14, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e11,
  },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Pie
  footNote: { textAlign: 'center', fontSize: 10.5, fontWeight: peso.medio, marginTop: espaciado.e10 },

  // Modales
  backdrop: { flex: 1 },
  previewCard: {
    width: '88%', maxWidth: 340, borderRadius: radios.panelAncho,
    padding: espaciado.e18, paddingBottom: espaciado.e20,
  },
  previewMini: {
    borderRadius: radios.lg, borderWidth: StyleSheet.hairlineWidth,
    padding: espaciado.e14, marginTop: espaciado.e14,
  },
  previewAvatar: {
    width: 64, height: 64, borderRadius: radios.full, borderWidth: trazo.fuerte,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  previewAvatarImg: { width: '100%', height: '100%' },
  previewAvatarTxt: { fontSize: tipografia.tituloFicha, fontWeight: peso.titulo },

  // Hojas inferiores
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    borderTopLeftRadius: radios.marco, borderTopRightRadius: radios.marco,
    paddingHorizontal: espaciado.e18, paddingTop: espaciado.e18, maxHeight: '86%',
  },
  modalHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: espaciado.e6,
  },
  modalTitle: { fontSize: 17, fontWeight: peso.titulo },

  // Listas dentro de las hojas
  groupHeader: { fontSize: tipografia.micro, fontWeight: peso.maximo, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: espaciado.e10, marginBottom: espaciado.e2, marginLeft: espaciado.e4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e11, paddingHorizontal: espaciado.e4 },
  pickRowTxt: { flex: 1, fontSize: tipografia.body, fontWeight: peso.medio },
  cityChip: { borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  statusPill: { borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5 },
});
