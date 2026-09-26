/**
 * Life Book — PUBLICAR NOTA (/lifebook-compose).
 * Nota: descripción 1-500 + título opcional ≤60 + 0-4 fotos + hasta 5 temas
 * (catálogo + hashtags libres) + tono + ubicación (ciudad default perfil,
 * barrio opcional) + visibilidad. Al publicar vuelve al feed (se recarga).
 * DISEÑO-UX-LIFEBOOK-PUBLICAR §3.1.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {alpha, brand, espaciado, neutro, peso, radios, tipografia, trazo, useTheme} from '@egrouteplan/ui-kit';
import { ArrowLeft, Globe, ImagePlus, Lock, MapPin, Package, Send, Users, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { authApi } from '../api/auth';
import { lifebookApi, lifebookSettingsApi } from '../api/lifebook';
import { productosEnNotaApi } from '../api/lifebookProductos';
import { pickImagesFromLibrary, type PickedImage } from '../core/pickImage';
/* TANDA C: la hoja de productos es COMPARTIDA con el flujo de vídeo (antes vivía copiada aquí). */
import { SelectorDeProductos } from '../components/lifebook/SelectorDeProductos';
/* TANDA I: el buscador de sitios real (geocoder) que ya usan las rutas y las quedadas. */
import { LocationPickerSheet } from '../components/lifebook/LocationPickerSheet';
import {
  LB_CITIES, LB_NOTE_BODY_MAX, LB_NOTE_MEDIA_MAX, LB_NOTE_TOPICS_MAX,
  LB_NOTE_TITLE_MAX, LB_TAG_MAX_LEN, LB_TONE_OPTIONS, LB_TOPIC_CATALOG,
  LB_VISIBILITY_OPTIONS, type LbVisibility,
} from '../constants/lifebook';

export default function LifeBookComposeScreen() {
  return (
    <AuthGate>
      <ComposeContent />
    </AuthGate>
  );
}

function ComposeContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [city, setCity] = useState('Malabo');
  const [barrio, setBarrio] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [freeTag, setFreeTag] = useState('');
  const [tone, setTone] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<LbVisibility>('public');
  const visTouched = useRef(false);
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── TANDA C: productos DENTRO de la nota ────────────────────────────────────────
     El producto no vive solo en el catálogo: se engancha al contenido («mi rutina de la
     mañana» y debajo la crema que usa). Solo se pueden enganchar productos de MI tienda (lo
     valida el servidor); aquí solo se eligen. La HOJA que los elige es compartida
     (`components/lifebook/SelectorDeProductos.tsx`): la misma que usa el flujo de vídeo. */
  const [productos, setProductos] = useState<string[]>([]);
  const [prodOpen, setProdOpen] = useState(false);
  /** TANDA I: el sitio exacto de la nota (POI) y su buscador. */
  const [sitio, setSitio] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [sitioOpen, setSitioOpen] = useState(false);

  useEffect(() => {
    authApi.me().then((m) => { if (m?.city && (LB_CITIES as readonly string[]).includes(m.city)) setCity(m.city); }).catch(() => {});
    // Ajustes: visibilidad por defecto al publicar (solo si el usuario no la cambió).
    lifebookSettingsApi.get().then((s) => {
      if (!visTouched.current && s?.publish?.defaultVisibility) setVisibility(s.publish.defaultVisibility);
    }).catch(() => {});
  }, []);

  const canSend = useMemo(() => body.trim().length >= 1 && body.trim().length <= LB_NOTE_BODY_MAX && !sending, [body, sending]);

  /**
   * Abre la hoja de productos. La carga de «mis productos» la hace la propia hoja (compartida con
   * el flujo de vídeo), para que no haya dos listas que puedan comportarse distinto.
   */
  const abrirProductos = () => setProdOpen(true);

  const toggleTopic = (t: string) => {
    setTopics((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= LB_NOTE_TOPICS_MAX) return prev;
      return [...prev, t];
    });
  };

  const addFreeTag = () => {
    let tag = freeTag.trim().replace(/\s+/g, '_');
    if (tag.startsWith('#')) tag = tag.slice(1);
    tag = tag.toLowerCase();
    if (!tag || tag.length > LB_TAG_MAX_LEN) return;
    setTopics((prev) => {
      if (prev.some((t) => t.toLowerCase() === tag) || prev.length >= LB_NOTE_TOPICS_MAX) return prev;
      return [...prev, tag];
    });
    setFreeTag('');
  };

  const addPhotos = async () => {
    if (picking || photos.length >= LB_NOTE_MEDIA_MAX) return;
    setPicking(true);
    try {
      const picked = await pickImagesFromLibrary(LB_NOTE_MEDIA_MAX - photos.length);
      setPhotos((prev) => [...prev, ...picked].slice(0, LB_NOTE_MEDIA_MAX));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la galería');
    } finally { setPicking(false); }
  };

  /** Proporción (ancho/alto) de la 1ª foto para el 3:4 del feed. */
  const coverRatioOf = (uri: string) => new Promise<number | null>((resolve) => {
    try {
      Image.getSize(uri, (w, h) => resolve(h > 0 ? w / h : null), () => resolve(null));
    } catch { resolve(null); }
  });

  const publish = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const ratio = photos.length ? await coverRatioOf(photos[0].uri) : null;
      await productosEnNotaApi.publicarNota({
        body: body.trim(),
        ...(title.trim() ? { title: title.trim().slice(0, LB_NOTE_TITLE_MAX) } : {}),
        ...(photos.length ? { media: photos.map((p) => p.dataUrl) } : {}),
        ...(ratio ? { coverRatio: ratio } : {}),
        city,
        ...(barrio.trim() ? { barrio: barrio.trim().slice(0, 90) } : {}),
        ...(topics.length ? { topics } : {}),
        ...(tone ? { tone } : {}),
        // TANDA C: los productos van DENTRO de la nota (se pintan bajo el texto).
        ...(productos.length ? { productIds: productos } : {}),
        // TANDA I: el sitio exacto (POI), si se eligió uno.
        ...(sitio ? { placeName: sitio.name, placeLat: sitio.lat, placeLng: sitio.lng } : {}),
        visibility,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar. Inténtalo de nuevo.');
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Barra */}
        <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Publicar nota</Text>
          <Pressable onPress={publish} disabled={!canSend} style={[styles.publishBtn, { backgroundColor: canSend ? colors.primary : alpha(colors.textSecondary, 0.25) }]}>
            {sending ? <ActivityIndicator size="small" color={brand.white} /> : <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>Publicar</Text>}
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: alpha(colors.danger, 0.09), borderColor: alpha(colors.danger, 0.4) }]}>
              <Text style={{ color: colors.text.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{error}</Text>
            </View>
          ) : null}

          {/* Descripción */}
          <Text style={styles.label}>DESCRIPCIÓN *</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Comparte algo con tu ciudad: tu día, una noticia, una tradición…"
            placeholderTextColor={colors.textSecondary}
            maxLength={LB_NOTE_BODY_MAX}
            style={[styles.textArea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          />
          <Text style={[styles.counter, { color: colors.textSecondary }]}>{body.length}/{LB_NOTE_BODY_MAX}</Text>

          {/* Título opcional */}
          <Text style={styles.label}>TÍTULO (opcional)</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Un título corto para tu nota"
            placeholderTextColor={colors.textSecondary}
            maxLength={LB_NOTE_TITLE_MAX}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          />
          <Text style={[styles.counter, { color: colors.textSecondary }]}>{title.length}/{LB_NOTE_TITLE_MAX}</Text>

          {/* Fotos */}
          <Text style={styles.label}>FOTOS ({photos.length}/{LB_NOTE_MEDIA_MAX})</Text>
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={p.uri + i}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
                <Pressable
                  onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  style={[styles.photoX, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                  accessibilityLabel="Quitar foto"
                >
                  <X size={13} color={brand.white} />
                </Pressable>
                {i === 0 && photos.length > 1 ? (
                  <Text style={styles.coverBadge}>1ª</Text>
                ) : null}
              </View>
            ))}
            {photos.length < LB_NOTE_MEDIA_MAX ? (
              <Pressable onPress={addPhotos} style={[styles.addPhoto, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {picking ? <ActivityIndicator color={colors.text.primary} /> : <ImagePlus size={22} color={colors.text.primary} />}
                <Text style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Añadir</Text>
              </Pressable>
            ) : null}
          </View>

          {/* TANDA C — productos que van DENTRO de la nota. Se eligen de MI tienda; el
              servidor comprueba que son míos y que están activos. */}
          <Pressable
            onPress={() => { void abrirProductos(); }}
            accessibilityLabel="Elegir productos para esta nota"
            style={[styles.chip, {
              marginTop: espaciado.e14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
              backgroundColor: productos.length ? alpha(colors.primary, 0.14) : colors.surface,
              borderColor: productos.length ? alpha(colors.primary, 0.55) : colors.border,
            }]}
          >
            <Package size={14} color={productos.length ? colors.text.primary : colors.textSecondary} />
            <Text style={{ color: productos.length ? colors.text.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
              {productos.length
                ? `${productos.length} producto${productos.length === 1 ? '' : 's'} en esta nota`
                : 'Productos en esta nota (opcional)'}
            </Text>
          </Pressable>

          {/* TANDA I — EL SITIO DE LA NOTA (POI). Es lo que permite que la nota salga en «cerca de
              mí» (附近 / 3 km) y en «toda la ciudad» con su distancia. Se elige con el mismo
              buscador de sitios que usan las rutas y las quedadas (`LocationPickerSheet`), que
              busca de verdad (geocoder) y ofrece «mi ubicación». */}
          <Pressable
            onPress={() => setSitioOpen(true)}
            accessibilityLabel="Elegir el sitio de la nota"
            style={[styles.chip, {
              marginTop: espaciado.e10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
              backgroundColor: sitio ? alpha(colors.primary, 0.14) : colors.surface,
              borderColor: sitio ? alpha(colors.primary, 0.55) : colors.border,
            }]}
          >
            <MapPin size={14} color={sitio ? colors.text.primary : colors.textSecondary} />
            <Text numberOfLines={1} style={{ color: sitio ? colors.text.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, maxWidth: 240 }}>
              {sitio ? `📍 ${sitio.name}` : '¿Dónde es? (opcional)'}
            </Text>
            {sitio ? (
              <Pressable onPress={() => setSitio(null)} hitSlop={8} accessibilityLabel="Quitar el sitio">
                <X size={13} color={colors.text.primary} />
              </Pressable>
            ) : null}
          </Pressable>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e5, lineHeight: 15 }}>
            Con un sitio exacto, tu nota aparece en «Ciudad» con su distancia (y en «cerca de mí»).
          </Text>

          {/* Temas */}
          <Text style={styles.label}>TEMAS ({topics.length}/{LB_NOTE_TOPICS_MAX})</Text>
          <View style={styles.chipsWrap}>
            {LB_TOPIC_CATALOG.map((t) => {
              const on = topics.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleTopic(t)}
                  style={[styles.chip, { backgroundColor: on ? alpha(colors.primary, 0.14) : colors.surface, borderColor: on ? alpha(colors.primary, 0.55) : colors.border }]}
                >
                  <Text style={{ color: on ? colors.text.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.tagRow}>
            <TextInput
              value={freeTag}
              onChangeText={setFreeTag}
              onSubmitEditing={addFreeTag}
              placeholder="# hashtag libre (p. ej. #Malabo)"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              style={[styles.input, { flex: 1, backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            />
            <Pressable onPress={addFreeTag} style={[styles.addTag, { backgroundColor: colors.surface, borderColor: colors.border }]} disabled={!freeTag.trim()}>
              <Text style={{ color: colors.text.primary, fontWeight: peso.titulo, fontSize: tipografia.title }}>＋</Text>
            </Pressable>
          </View>
          {topics.length > 0 && (
            <View style={styles.chipsWrap}>
              {topics.map((t) => (
                <Pressable key={t} onPress={() => toggleTopic(t)} style={[styles.chip, { backgroundColor: alpha(colors.secondary, 0.12), borderColor: alpha(colors.secondary, 0.5) }]}>
                  <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>#{t} ✕</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Tono */}
          <Text style={styles.label}>TONO</Text>
          <View style={styles.chipsWrap}>
            {LB_TONE_OPTIONS.map((o) => {
              const on = tone === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setTone(on ? null : o.value)}
                  style={[styles.chip, { backgroundColor: on ? alpha(colors.secondary, 0.14) : colors.surface, borderColor: on ? alpha(colors.secondary, 0.6) : colors.border }]}
                >
                  <Text style={{ color: on ? colors.text.secondary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Ubicación */}
          <Text style={styles.label}>CIUDAD *</Text>
          <View style={styles.chipsWrap}>
            {LB_CITIES.map((c) => {
              const on = city === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCity(c)}
                  style={[styles.chip, { backgroundColor: on ? alpha(colors.primary, 0.14) : colors.surface, borderColor: on ? alpha(colors.primary, 0.55) : colors.border }]}
                >
                  <Text style={{ color: on ? colors.text.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>BARRIO (opcional)</Text>
          <TextInput
            value={barrio}
            onChangeText={setBarrio}
            placeholder="p. ej. Semu, Ela Nguema…"
            placeholderTextColor={colors.textSecondary}
            maxLength={90}
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          />

          {/* Visibilidad */}
          <Text style={styles.label}>VISIBILIDAD</Text>
          <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
            {LB_VISIBILITY_OPTIONS.map((o) => {
              const on = visibility === o.value;
              const Icon = o.value === 'public' ? Globe : o.value === 'followers' ? Users : Lock;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => { visTouched.current = true; setVisibility(o.value); }}
                  style={[styles.visBtn, { backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface, borderColor: on ? alpha(colors.primary, 0.55) : colors.border }]}
                >
                  <Icon size={15} color={on ? colors.text.primary : colors.textSecondary} />
                  <Text style={{ color: on ? colors.text.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>
            {LB_VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.hint}
          </Text>

          {/* Publicar */}
          <Pressable onPress={publish} disabled={!canSend} style={[styles.bigPublish, { backgroundColor: canSend ? colors.primary : alpha(colors.textSecondary, 0.25), marginBottom: espaciado.e8 }]}>
            {sending ? <ActivityIndicator size="small" color={brand.white} /> : <Send size={18} color={brand.white} />}
            <Text style={{ color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>Publicar nota</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ── TANDA C: selector de productos para esta nota (hoja COMPARTIDA con el flujo de vídeo) ── */}
      {/* TANDA I: buscador de sitios para el POI de la nota. */}
      <LocationPickerSheet
        visible={sitioOpen}
        onClose={() => setSitioOpen(false)}
        title="¿Dónde es esta nota?"
        onSubmit={(loc) => { setSitio({ name: loc.label, lat: loc.lat, lng: loc.lng }); setSitioOpen(false); }}
      />

      <SelectorDeProductos
        visible={prodOpen}
        onClose={() => setProdOpen(false)}
        seleccion={productos}
        onCambiar={setProductos}
        titulo="Productos en esta nota"
        ayuda="Se verán DENTRO de la nota, debajo del texto, en el orden en que los elijas."
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 },
  publishBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, minWidth: 74, alignItems: 'center' },
  label: { fontSize: tipografia.caption, fontWeight: peso.titulo, color: neutro.n600, letterSpacing: 0.8, marginTop: espaciado.e16, marginBottom: espaciado.e6 },
  textArea: { borderRadius: radios.campo, borderWidth: trazo.fino, padding: espaciado.e12, fontSize: tipografia.cuerpo, minHeight: 110, textAlignVertical: 'top' },
  input: { borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body },
  counter: { fontSize: tipografia.micro, textAlign: 'right', marginTop: espaciado.e3 },
  photoRow: { flexDirection: 'row', gap: espaciado.e8, flexWrap: 'wrap' },
  photo: { width: 74, height: 74, borderRadius: radios.md, backgroundColor: neutro.n200 },
  photoX: { position: 'absolute', top: -6, right: -6, borderRadius: radios.full, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', color: brand.white, fontSize: tipografia.rotulo, fontWeight: peso.titulo, borderRadius: radios.marca, overflow: 'hidden', paddingHorizontal: espaciado.e5, paddingVertical: 1 },
  addPhoto: { width: 74, height: 74, borderRadius: radios.md, borderWidth: trazo.fino, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: espaciado.e2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e6, borderWidth: trazo.fino, borderColor: 'transparent' },
  tagRow: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 },
  addTag: { borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e13, justifyContent: 'center' },
  visBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, borderRadius: radios.md, paddingVertical: espaciado.e10, borderWidth: trazo.fino },
  bigPublish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderRadius: radios.full, paddingVertical: espaciado.e14, marginTop: espaciado.e22 },
  errorBox: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e4 },
});


