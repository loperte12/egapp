/**
 * FoodOwnerScreen — Mi restaurante: requisitos (KYC + datos + aprobación admin),
 * alta/edición con FOTO real (multipart → MinIO food-photos), añadir ítems al
 * menú (moderación), gestión de "Mi menú" (ocultar/mostrar activos y eliminar).
 *
 * Auditorías senior (2026-09-02):
 *  · Carga skeleton / error + Reintentar (nunca requisitos ✗ falsos por red).
 *  · Foto: picker + upload multipart (máx 8 MB) con preview y quitar.
 *  · Ciudad de las 24 de GQ (modal); teléfono validado +240 y normalizado;
 *    horario validado EN BLUR (no doble cálculo por tecla); precio entero > 0
 *    con preview formatXAF en vivo.
 *  · busy por dominio (perfil / publicar / por ítem del menú) + busyRef.
 *  · Confirmación al editar un restaurante activo y antes de eliminar ítems.
 *  · KYC incompleto → ReqRow tocable con CTA a /driver-onboarding.
 *  · Guard de cambios sin guardar (back del header y back de Android).
 *  · KeyboardAvoidingView + SafeArea + a11y.
 * Ruta: /food-owner
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Image as RNImage, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Camera, Eye, EyeOff, Plus, Trash2, X, XCircle } from 'lucide-react-native';
import { alpha, altura, espaciado, FormField, PrimaryButton, radios, ScreenHeader, Sheet, Tactil, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { foodApi, FoodMenuItem, FoodOwnerMe, SPICE_LABEL, SPICE_ICON, SIDES_MAX, type SpiceLevel } from '../api/food';
import { formatXAF } from '../utils/formatHelpers';
import { foodHoursError } from '../utils/foodHours';
import {
  SPICE_ORDER, ingredientsError, parseIngredients, sidesError, parseSides,
  portionSizeError, prepMinutesError, parsePrepMinutes,
} from '../utils/foodItemDetails';
import { looksLikeGqPhone, toGqMsisdn } from '../utils/phone';
import { CITIES } from '../constants/data';
import { brand } from '@egrouteplan/ui-kit';

const ACCENT = brand.primary; // A1: la acción avanza en azul
const MAX_PHOTO_MB = 8;
const CATS: Array<{ key: 'plato' | 'bebida' | 'postre'; label: string }> = [
  { key: 'plato', label: '🍛 Plato' }, { key: 'bebida', label: '🥤 Bebida' }, { key: 'postre', label: '🍰 Postre' },
];

export default function FoodOwnerScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<FoodOwnerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [cityModal, setCityModal] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [hoursErr, setHoursErr] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busyBiz, setBusyBiz] = useState(false);
  const busyBizRef = useRef(false);

  const [iName, setIName] = useState('');
  const [iPrice, setIPrice] = useState('');
  const [iPriceErr, setIPriceErr] = useState<string | null>(null);
  const [iCat, setICat] = useState<'plato' | 'bebida' | 'postre'>('plato');
  const [busyPub, setBusyPub] = useState(false);
  const busyPubRef = useRef(false);

  // ── Detalle del plato (migración 041). Todo OPCIONAL: el dueño puede publicar
  //    solo nombre + precio, exactamente como antes. Se agrupa bajo un
  //    desplegable "Detalles (opcional)" para no alargar el formulario base.
  //    Errores en blur (no por tecla), igual que hace el horario arriba.
  const [showDetails, setShowDetails] = useState(false);
  const [iIngredients, setIIngredients] = useState('');
  const [iIngredientsErr, setIIngredientsErr] = useState<string | null>(null);
  const [iSpice, setISpice] = useState<SpiceLevel | null>(null);
  const [iPortion, setIPortion] = useState('');
  const [iPortionErr, setIPortionErr] = useState<string | null>(null);
  const [iDrink, setIDrink] = useState(false);
  const [iSides, setISides] = useState('');
  const [iSidesErr, setISidesErr] = useState<string | null>(null);
  const [iPrep, setIPrep] = useState('');
  const [iPrepErr, setIPrepErr] = useState<string | null>(null);

  // ── Foto del plato: se sube UNA VEZ y se queda ────────────────────────────────
  // Cómo lo hacen las plataformas de comida (美团外卖): foto REAL del plato —JPG o PNG, por debajo
  // de 2 MB, cuadrada y bien iluminada—; nada de dibujos, collages, marcas de agua ni fotos de
  // banco. Y, sobre todo: la foto vive EN el plato. Se sube una vez, se guarda con él y se reutiliza
  // siempre (menú del cliente, carrito, pedidos). Cambiar el nombre, el precio o los ingredientes
  // NO la borra, y nadie tiene que volver a subirla cada día.
  const [iPhoto, setIPhoto] = useState<string | null>(null);
  const [iPhotoBusy, setIPhotoBusy] = useState(false);

  const resetItemForm = useCallback(() => {
    setIName(''); setIPrice(''); setIPriceErr(null);
    setIIngredients(''); setIIngredientsErr(null);
    setISpice(null); setIPortion(''); setIPortionErr(null);
    setIDrink(false); setISides(''); setISidesErr(null);
    setIPrep(''); setIPrepErr(null);
    setIPhoto(null); setIPhotoBusy(false);
    setShowDetails(false);
  }, []);

  const [busyMenuId, setBusyMenuId] = useState<string | null>(null);
  const busyMenuRef = useRef(false);

  // Snapshot de lo guardado → guard de cambios sin guardar.
  const [saved, setSaved] = useState<{ name: string; city: string; address: string; phone: string; hours: string; desc: string; photoUrl: string | null } | null>(null);

  const load = useCallback(async (mode: 'initial' | 'quiet' = 'initial') => {
    if (mode === 'initial') { setLoading(true); setError(null); }
    try {
      const m = await foodApi.ownerMe();
      setMe(m);
      if (m.restaurant) {
        const snap = {
          name: m.restaurant.businessName,
          city: m.restaurant.city,
          address: m.restaurant.address ?? '',
          phone: m.restaurant.phoneContact ?? '',
          hours: m.restaurant.hours ?? '',
          desc: m.restaurant.description ?? '',
          photoUrl: m.restaurant.photoUrl ?? m.restaurant.photoKey ?? null,
        };
        setName(snap.name); setCity(snap.city); setAddress(snap.address); setPhone(snap.phone);
        setHours(snap.hours); setDesc(snap.desc); setPhotoUrl(snap.photoUrl);
        setHoursErr(null); setPhoneErr(null);
        setSaved(snap);
      }
      setError(null);
    } catch {
      if (mode === 'initial') setError('No pudimos cargar tu restaurante. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (mode === 'initial') setLoading(false);
    }
  }, []);

  // ── CARGA AL ABRIR (faltaba y dejaba la pantalla muerta) ─────────────────────
  // Sin esta línea `loading` se queda en `true`, `me` en `null` y la pantalla se queda PARA
  // SIEMPRE en `OwnerSkeleton` (que no pinta texto: por eso el volcado de pantalla solo traía la
  // cabecera). Se veía en el móvil, no en `tsc`. Sus pantallas hermanas sí lo tienen
  // (`food-rider.tsx`: `useEffect(() => { load(); }, [load])`).
  useEffect(() => { void load('initial'); }, [load]);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return name !== saved.name || city !== saved.city || address !== saved.address || phone !== saved.phone
      || hours !== saved.hours || desc !== saved.desc || (photoUrl ?? null) !== saved.photoUrl;
  }, [saved, name, city, address, phone, hours, desc, photoUrl]);

  const confirmLeave = useCallback(() => {
    Alert.alert('Descartar cambios', 'Tienes cambios sin guardar en tu restaurante. ¿Descartarlos?', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => router.back() },
    ]);
  }, [router]);

  // Back físico de Android mientras hay cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { confirmLeave(); return true; });
    return () => sub.remove();
  }, [dirty, confirmLeave]);

  const rest = me?.restaurant;
  const pricePreview = useMemo(() => {
    const n = Number(iPrice);
    return iPrice.trim() !== '' && Number.isFinite(n) && n > 0 ? formatXAF(Math.floor(n)) : null;
  }, [iPrice]);

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso de fotos', 'Necesitamos acceso a tu galería para la foto del restaurante.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if ((asset.fileSize ?? 0) > MAX_PHOTO_MB * 1024 * 1024) {
        Alert.alert('Foto demasiado pesada', `Usa una imagen de menos de ${MAX_PHOTO_MB} MB.`);
        return;
      }
      const type = asset.mimeType ?? 'image/jpeg';
      if (!type.startsWith('image/')) { Alert.alert('Archivo no válido', 'Selecciona una imagen.'); return; }
      setPhotoBusy(true);
      try {
        const form = new FormData();
        form.append('photo', { uri: asset.uri, name: 'foto.jpg', type } as unknown as Blob);
        const r = await foodApi.uploadPhoto(form);
        setPhotoUrl(r.url);
      } catch (e) {
        Alert.alert('Subir foto', e instanceof Error ? e.message : 'No se pudo subir la imagen. Inténtalo de nuevo.');
      } finally {
        setPhotoBusy(false);
      }
    } catch { /* picker cancelado por el sistema */ }
  };

  // ── Subir la foto de un PLATO ─────────────────────────────────────────────────
  // Cámara o galería. La cámara está primero porque la foto del plato recién hecho es la que de
  // verdad se parece al plato, y en un menú eso es justo lo que decide al cliente.
  const subirFotoPlato = async (origen: 'camara' | 'galeria'): Promise<string | null> => {
    try {
      if (origen === 'camara') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permiso de cámara', 'Necesitamos la cámara para hacer la foto del plato.'); return null; }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permiso de fotos', 'Necesitamos acceso a tu galería para elegir la foto del plato.'); return null; }
      }
      const res = origen === 'camara'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return null;
      const asset = res.assets[0];
      if ((asset.fileSize ?? 0) > MAX_PHOTO_MB * 1024 * 1024) {
        Alert.alert('Foto demasiado pesada', `Usa una imagen de menos de ${MAX_PHOTO_MB} MB.`);
        return null;
      }
      const type = asset.mimeType ?? 'image/jpeg';
      if (!type.startsWith('image/')) { Alert.alert('Archivo no válido', 'Selecciona una imagen.'); return null; }
      const form = new FormData();
      form.append('photo', { uri: asset.uri, name: 'plato.jpg', type } as unknown as Blob);
      const r = await foodApi.uploadPhoto(form);
      return r.url;
    } catch (e) {
      Alert.alert('Subir foto', e instanceof Error ? e.message : 'No se pudo subir la imagen. Inténtalo de nuevo.');
      return null;
    }
  };

  /** Pregunta de dónde sacar la foto, la sube y devuelve su URL (o null si se cancela). */
  const elegirFotoPlato = (): Promise<string | null> => new Promise((resolve) => {
    const hacer = async (origen: 'camara' | 'galeria') => {
      setIPhotoBusy(true);
      try { resolve(await subirFotoPlato(origen)); } finally { setIPhotoBusy(false); }
    };
    Alert.alert(
      'Foto del plato',
      'Los clientes eligen por la foto: que se vea el plato de verdad, con buena luz y fondo limpio, y sin texto ni marcas de agua.',
      [
        { text: 'Hacer foto', onPress: () => { void hacer('camara'); } },
        { text: 'Elegir de la galería', onPress: () => { void hacer('galeria'); } },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
    );
  });

  /** Pone o cambia la foto de un plato YA publicado. NO lo devuelve a revisión: el servidor deja
   *  tocar la foto en cualquier estado precisamente para que hacer la foto no cueste ventas. */
  const ponerFotoAItem = async (m: FoodMenuItem) => {
    if (busyMenuRef.current) return;
    const url = await elegirFotoPlato();
    if (!url) return;
    busyMenuRef.current = true;
    setBusyMenuId(m.id);
    try {
      await foodApi.setItemPhoto(m.id, [url]);
      await load('quiet');
    } catch (e) {
      Alert.alert('Foto del plato', e instanceof Error ? e.message : 'No se pudo guardar la foto.');
    } finally {
      busyMenuRef.current = false;
      setBusyMenuId(null);
    }
  };

  const validate = (): string | null => {
    if (name.trim().length < 2) return 'Pon el nombre del restaurante (mín. 2 letras).';
    if (!city) return 'Elige la ciudad del restaurante.';
    const p = phone.trim();
    if (p && !looksLikeGqPhone(p)) { setPhoneErr('Pon un teléfono de Guinea Ecuatorial (+240…).'); return 'Revisa el teléfono.'; }
    setPhoneErr(null);
    return null;
  };

  const doSave = async () => {
    if (busyBizRef.current) return;
    const invalid = validate();
    if (invalid) { Alert.alert('Faltan datos', invalid); return; }
    busyBizRef.current = true;
    setBusyBiz(true);
    try {
      const p = phone.trim();
      const r = await foodApi.upsertRestaurant({
        businessName: name.trim(),
        city,
        address: address.trim() || null,
        phoneContact: p ? (toGqMsisdn(p) ?? p) : null,
        hours: hours.trim() || null,
        description: desc.trim() || null,
        photoKey: photoUrl ?? null,
      });
      Alert.alert(rest ? 'Restaurante actualizado' : 'Solicitud enviada', r.message);
      await load('quiet');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      busyBizRef.current = false;
      setBusyBiz(false);
    }
  };

  const save = () => {
    if (rest?.status === 'active') {
      Alert.alert('Actualizar restaurante', 'Los cambios se ven de inmediato en la app (la foto y el horario cambian para tus clientes).', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Actualizar', onPress: doSave },
      ]);
    } else {
      doSave();
    }
  };

  const addItem = async () => {
    if (busyPubRef.current) return;
    if (iName.trim().length < 2) { Alert.alert('Faltan datos', 'Pon el nombre del plato (mín. 2 letras).'); return; }
    const n = Number(iPrice);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      setIPriceErr('Pon un precio válido (número entero mayor que 0).');
      return;
    }
    if (n > 10_000_000) { setIPriceErr('Precio máximo: 10.000.000 XAF.'); return; }
    setIPriceErr(null);

    // ── Validar los detalles opcionales ANTES de enviar. Son opcionales (vacío
    //    = no se declara), pero si el dueño escribió algo, tiene que ser válido.
    //    Un error aquí abriría el desplegable para que el usuario vea el campo.
    const ingErr = ingredientsError(iIngredients);
    const porErr = portionSizeError(iPortion);
    const sidErr = sidesError(iSides);
    const prepErr = prepMinutesError(iPrep);
    setIIngredientsErr(ingErr); setIPortionErr(porErr); setISidesErr(sidErr); setIPrepErr(prepErr);
    if (ingErr || porErr || sidErr || prepErr) {
      setShowDetails(true);
      Alert.alert('Revisa los detalles', ingErr ?? porErr ?? sidErr ?? prepErr ?? '');
      return;
    }

    // Solo se envía lo declarado: un campo vacío va como null (backend lo guarda
    // NULL) o se omite, nunca como string vacía. Así un plato sin detalles queda
    // exactamente igual que antes de la migración.
    const sidesArr = parseSides(iSides);
    const prep = parsePrepMinutes(iPrep);
    const details: Record<string, unknown> = {};
    const ing = parseIngredients(iIngredients);
    if (ing) details.ingredients = ing;
    if (iSpice) details.spiceLevel = iSpice;
    const por = iPortion.trim();
    if (por) details.portionSize = por;
    if (iDrink) details.drinkIncluded = true;
    if (sidesArr.length > 0) details.sides = sidesArr;
    if (prep !== null) details.prepMinutes = prep;

    busyPubRef.current = true;
    setBusyPub(true);
    try {
      const r = await foodApi.createMenuItem({
        name: iName.trim(), priceXaf: n, category: iCat, ...details,
        // La foto va con el plato desde el primer momento: si se subió, se guarda con él.
        ...(iPhoto ? { photos: [iPhoto] } : {}),
      });
      Alert.alert('Ítem enviado', r.message);
      resetItemForm();
      await load('quiet');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo publicar');
    } finally {
      busyPubRef.current = false;
      setBusyPub(false);
    }
  };

  const toggleItem = async (m: FoodMenuItem) => {
    if (busyMenuRef.current) return;
    busyMenuRef.current = true;
    setBusyMenuId(m.id);
    try {
      const r = await foodApi.setItemAvailable(m.id, !m.available);
      Alert.alert('Menú', r.message);
      await load('quiet');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cambiar');
    } finally {
      busyMenuRef.current = false;
      setBusyMenuId(null);
    }
  };

  const removeItem = (m: FoodMenuItem) => {
    Alert.alert('Eliminar del menú', `¿Quitar "${m.name}"? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        if (busyMenuRef.current) return;
        busyMenuRef.current = true;
        setBusyMenuId(m.id);
        try {
          const r = await foodApi.deleteMenuItem(m.id);
          Alert.alert('Menú', r.message);
          await load('quiet');
        } catch (e) {
          Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo eliminar');
        } finally {
          busyMenuRef.current = false;
          setBusyMenuId(null);
        }
      } },
    ]);
  };

  const s = styles(colors);
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Cabecera del kit desde el 24/09/2026. El volver PREGUNTA antes de salir si hay cambios
          sin guardar (`dirty ? confirmLeave() : router.back()`): por eso el kit recibe la función
          en vez de navegar él. Las dos acciones de la derecha van en `accion`. */}
      <ScreenHeader
        titulo="Mi restaurante"
        alVolver={() => (dirty ? confirmLeave() : router.back())}
        accion={
          <>
            <Tactil onPress={() => router.push('/food-rider' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Pantalla de repartidor">
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.caption }}>Repartir</Text>
            </Tactil>
            <Tactil onPress={() => router.push('/food-orders?as=owner' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Pedidos recibidos">
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.caption }}>Pedidos</Text>
            </Tactil>
          </>
        }
      />

      {loading && !me ? (
        <OwnerSkeleton colors={colors} />
      ) : error ? (
        <View style={s_center.wrap}>
          <Text style={{ fontSize: 38, marginBottom: espaciado.e8 }}>📡</Text>
          <Text style={[s_center.title, { color: colors.textPrimary }]}>Algo salió mal</Text>
          <Text style={[s_center.sub, { color: colors.textSecondary }]}>{error}</Text>
          <Pressable onPress={() => load('initial')} accessibilityRole="button" style={s_center.btnPrimary}>
            <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e32 + insets.bottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Requisitos */}
            <View style={[s.reqBox, { backgroundColor: alpha(colors.primary, 0.06) }]}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary, marginBottom: espaciado.e6 }]}>Requisitos para operar</Text>
              <ReqRow ok={me?.kycOk ?? false} label="Identidad verificada (KYC)"
                hint={me?.kycOk ? undefined : (me?.kycMessage ?? 'Toca para completar tu verificación')}
                onPress={!me?.kycOk ? () => router.push('/driver-onboarding' as any) : undefined} />
              <ReqRow ok={!!name.trim() && !!city} label="Datos del negocio (nombre + ciudad)" />
              <ReqRow ok={rest?.status === 'active'} label="Aprobación del administrador"
                hint={rest ? (rest.status === 'pending' ? 'En revisión (2–24 h)' : rest.status === 'rejected' ? 'Rechazado' : 'Activo') : undefined} />
            </View>

            {/* Formulario */}
            <Text style={s.sectionTitle}>Tu restaurante</Text>

            {/* Foto */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e12 }}>
              {photoUrl && /^https?:\/\//i.test(photoUrl) ? (
                <Image source={{ uri: photoUrl }} style={s.photo} contentFit="cover" transition={200} />
              ) : (
                <View style={[s.photo, s.photoFallback]}>
                  <Text style={{ fontSize: 30 }}>🍽️</Text>
                </View>
              )}
              <View style={{ marginLeft: espaciado.e12, flex: 1 }}>
                <Pressable onPress={pickPhoto} disabled={photoBusy} accessibilityRole="button"
                  accessibilityLabel="Elegir foto del restaurante"
                  style={[s.photoBtn, { borderColor: ACCENT }]}>
                  {photoBusy
                    ? <ActivityIndicator size="small" color={ACCENT} />
                    : <Text style={{ color: ACCENT, fontWeight: '800', fontSize: tipografia.body }}>📷 {photoUrl ? 'Cambiar foto' : 'Añadir foto'}</Text>}
                </Pressable>
                {photoUrl ? (
                  <Pressable onPress={() => setPhotoUrl(null)} accessibilityRole="button" accessibilityLabel="Quitar foto"
                    style={{ marginTop: espaciado.e6, alignSelf: 'flex-start' }}>
                    <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700' }}>Quitar foto</Text>
                  </Pressable>
                ) : (
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e6 }}>Máx 8 MB · se ve en la lista de restaurantes</Text>
                )}
              </View>
            </View>

            <FormField value={name} onChangeText={setName} placeholder="Nombre del restaurante *" maxLength={120} />
            <View style={{ marginTop: espaciado.e10 }} />

            {/* Ciudad */}
            <Pressable onPress={() => setCityModal(true)} accessibilityRole="button"
              accessibilityLabel={city ? `Ciudad: ${city}` : 'Elegir ciudad (obligatoria)'}
              style={[s.cityBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: city ? colors.textPrimary : colors.textSecondary }}>
                {city ? `📍 ${city}` : 'Ciudad * (elige una)'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>▾</Text>
            </Pressable>
            <View style={{ marginTop: espaciado.e10 }} />

            <FormField value={address} onChangeText={setAddress} placeholder="Dirección" maxLength={200} />
            <View style={{ marginTop: espaciado.e10 }} />
            <FormField
              value={phone}
              onChangeText={(t) => { setPhone(t); if (phoneErr) setPhoneErr(null); }}
              placeholder="Teléfono / WhatsApp (+240…)"
              keyboardType="phone-pad"
              maxLength={20}
              error={phoneErr ?? undefined}
            />
            <View style={{ marginTop: espaciado.e10 }} />
            <FormField
              value={hours}
              onChangeText={(t) => { setHours(t); if (hoursErr) setHoursErr(null); }}
              onBlur={() => setHoursErr(hours.trim() ? foodHoursError(hours) : null)}
              placeholder="Horario (ej: 10:00–22:00)"
              maxLength={120}
              error={hoursErr ?? undefined}
            />
            {!hoursErr && hours.trim() ? (
              <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e4, marginLeft: espaciado.e2 }}>
                Ej: 09:00-13:00, 16:00-20:00 · 24h · todo el día · cerrado
              </Text>
            ) : null}
            <View style={{ marginTop: espaciado.e10 }} />
            <TextInput
              multiline
              maxLength={2000}
              style={[s.area, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="Descripción…"
              placeholderTextColor={colors.textSecondary}
              value={desc}
              onChangeText={setDesc}
            />
            <View style={{ marginTop: espaciado.e12 }}>
              <PrimaryButton
                title={busyBiz ? 'Guardando…' : (rest ? 'Actualizar restaurante' : 'Solicitar alta')}
                onPress={save}
                disabled={busyBiz || photoBusy}
              />
            </View>

            {rest?.status === 'rejected' && rest.rejectionReason ? (
              <View style={[s.rejectedBox, { backgroundColor: alpha(colors.danger, 0.08) }]}>
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700' }}>Motivo: {rest.rejectionReason}</Text>
              </View>
            ) : null}

            {/* Añadir al menú (solo activo) */}
            {rest?.status === 'active' && (
              <>
                <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>Añadir al menú</Text>
                <FormField value={iName} onChangeText={setIName} placeholder="Nombre del plato * (ej: Pollo asado)" maxLength={120} />
                <View style={{ marginTop: espaciado.e10 }} />
                <FormField
                  value={iPrice}
                  onChangeText={(t) => { setIPrice(t); if (iPriceErr) setIPriceErr(null); }}
                  placeholder="Precio XAF *"
                  keyboardType="numeric"
                  error={iPriceErr ?? undefined}
                />
                {pricePreview ? (
                  <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: ACCENT, marginTop: espaciado.e4, marginLeft: espaciado.e2 }}>{pricePreview}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e10 }}>
                  {CATS.map((c) => (
                    <Pressable key={c.key} onPress={() => setICat(c.key)} accessibilityRole="radio"
                      accessibilityState={{ checked: iCat === c.key }}
                      style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: iCat === c.key ? colors.primary : colors.surface }}>
                      <Text style={{ fontSize: tipografia.caption, fontWeight: '700', color: iCat === c.key ? brand.white : colors.textPrimary }}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* ── Foto del plato ──────────────────────────────────────────
                    Una foto REAL, no un dibujo: es lo primero que mira el cliente. Se sube una
                    vez y se queda guardada con el plato (ver comentario del estado). Por eso
                    aquí, cuando ya hay foto, lo que se ofrece es «Cambiar» y «Quitar», nunca
                    volver a subirla. */}
                <Text style={[s.fieldLabel, { marginTop: espaciado.e16 }]}>Foto del plato</Text>
                {iPhoto ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <RNImage source={{ uri: iPhoto }} style={s.photo} />
                    <View style={{ flex: 1, marginLeft: espaciado.e12 }}>
                      <Text style={s.fieldHint}>
                        Guardada con el plato: no hace falta volver a subirla.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: espaciado.e16, marginTop: espaciado.e8 }}>
                        <Pressable onPress={() => { void elegirFotoPlato().then((u) => { if (u) setIPhoto(u); }); }}
                          hitSlop={8} accessibilityRole="button" accessibilityLabel="Cambiar la foto del plato">
                          <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: ACCENT }}>Cambiar</Text>
                        </Pressable>
                        <Pressable onPress={() => setIPhoto(null)} hitSlop={8}
                          accessibilityRole="button" accessibilityLabel="Quitar la foto del plato">
                          <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: colors.danger }}>Quitar</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => { void elegirFotoPlato().then((u) => { if (u) setIPhoto(u); }); }}
                    disabled={iPhotoBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Añadir foto del plato"
                    style={[s.photoBtn, { borderColor: alpha(ACCENT, 0.4), backgroundColor: alpha(ACCENT, 0.05) }]}
                  >
                    {iPhotoBusy ? (
                      <ActivityIndicator size="small" color={ACCENT} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                        <Camera size={16} color={ACCENT} />
                        <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: ACCENT }}>Hacer o elegir una foto</Text>
                      </View>
                    )}
                  </Pressable>
                )}
                {!iPhoto && !iPhotoBusy ? (
                  <Text style={s.fieldHint}>
                    Opcional, pero es lo que más vende. Foto real del plato: sin dibujos ni marcas de agua.
                  </Text>
                ) : null}

                {/* ── Detalles del plato (041) ────────────────────────────────
                    Desplegable: por defecto CERRADO para que publicar un plato
                    siga siendo tan rápido como antes (nombre + precio + tipo).
                    Todo lo de dentro es opcional; si no se declara, la ficha del
                    cliente simplemente no lo muestra. */}
                <Pressable
                  onPress={() => setShowDetails((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showDetails }}
                  accessibilityLabel="Detalles del plato, opcional"
                  style={[s.detailsHead, { backgroundColor: alpha(ACCENT, 0.06), borderColor: alpha(ACCENT, 0.25) }]}
                >
                  <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: ACCENT }}>
                    Detalles del plato (opcional)
                  </Text>
                  <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: ACCENT }}>{showDetails ? '−' : '+'}</Text>
                </Pressable>

                {showDetails && (
                  <View style={s.detailsBody}>
                    {/* Ingredientes */}
                    <Text style={s.fieldLabel}>Ingredientes</Text>
                    <TextInput
                      multiline
                      maxLength={1000}
                      value={iIngredients}
                      onChangeText={(t) => { setIIngredients(t); if (iIngredientsErr) setIIngredientsErr(null); }}
                      onBlur={() => setIIngredientsErr(ingredientsError(iIngredients))}
                      placeholder="Pollo, arroz, salsa de cacahuete…"
                      placeholderTextColor={colors.textSecondary}
                      style={[s.area, { minHeight: 56, backgroundColor: colors.surface, borderColor: iIngredientsErr ? colors.danger : colors.border, color: colors.textPrimary }]}
                      accessibilityLabel="Ingredientes del plato"
                    />
                    {iIngredientsErr ? <Text style={s.fieldErr}>{iIngredientsErr}</Text> : null}

                    {/* Picante */}
                    <Text style={[s.fieldLabel, { marginTop: espaciado.e12 }]}>Nivel de picante</Text>
                    <View style={s.chipRow}>
                      {SPICE_ORDER.map((lvl) => {
                        const active = iSpice === lvl;
                        return (
                          <Pressable
                            key={lvl}
                            onPress={() => setISpice(active ? null : lvl)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: active }}
                            accessibilityLabel={SPICE_LABEL[lvl]}
                            style={[s.chip, { borderColor: active ? ACCENT : colors.border, backgroundColor: active ? alpha(ACCENT, 0.1) : colors.surface }]}
                          >
                            <Text style={{ fontSize: tipografia.caption, fontWeight: '700', color: active ? ACCENT : colors.textPrimary }}>
                              {SPICE_ICON[lvl]} {SPICE_LABEL[lvl]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={s.fieldHint}>Toca el nivel activo otra vez para quitarlo.</Text>

                    {/* Tamaño / ración */}
                    <Text style={[s.fieldLabel, { marginTop: espaciado.e12 }]}>Tamaño o ración</Text>
                    <FormField
                      value={iPortion}
                      onChangeText={(t) => { setIPortion(t); if (iPortionErr) setIPortionErr(null); }}
                      onBlur={() => setIPortionErr(portionSizeError(iPortion))}
                      placeholder="Ej: 2 piezas, 400 g, Grande"
                      maxLength={40}
                      error={iPortionErr ?? undefined}
                      accessibilityLabel="Tamaño o ración del plato"
                    />

                    {/* Bebida incluida */}
                    <Pressable
                      onPress={() => setIDrink((v) => !v)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: iDrink }}
                      accessibilityLabel="Bebida incluida"
                      style={[s.switchRow, { borderColor: colors.border }]}
                    >
                      <Text style={{ fontSize: tipografia.caption, fontWeight: '700', color: colors.textPrimary }}>🥤 Incluye bebida</Text>
                      <View style={[s.switchTrack, { backgroundColor: iDrink ? ACCENT : colors.border }]}>
                        <View style={[s.switchKnob, { transform: [{ translateX: iDrink ? 18 : 0 }] }]} />
                      </View>
                    </Pressable>

                    {/* Acompañantes */}
                    <Text style={[s.fieldLabel, { marginTop: espaciado.e12 }]}>Acompañantes</Text>
                    <TextInput
                      multiline
                      maxLength={1200}
                      value={iSides}
                      onChangeText={(t) => { setISides(t); if (iSidesErr) setISidesErr(null); }}
                      onBlur={() => setISidesErr(sidesError(iSides))}
                      placeholder="Arroz, plátano frito, ensalada…"
                      placeholderTextColor={colors.textSecondary}
                      style={[s.area, { minHeight: 56, backgroundColor: colors.surface, borderColor: iSidesErr ? colors.danger : colors.border, color: colors.textPrimary }]}
                      accessibilityLabel="Acompañantes del plato"
                    />
                    {iSidesErr
                      ? <Text style={s.fieldErr}>{iSidesErr}</Text>
                      : <Text style={s.fieldHint}>Separados por coma. Máximo {SIDES_MAX}.</Text>}

                    {/* Tiempo de preparación */}
                    <Text style={[s.fieldLabel, { marginTop: espaciado.e12 }]}>Tiempo de preparación (minutos)</Text>
                    <FormField
                      value={iPrep}
                      onChangeText={(t) => { setIPrep(t.replace(/[^0-9]/g, '')); if (iPrepErr) setIPrepErr(null); }}
                      onBlur={() => setIPrepErr(prepMinutesError(iPrep))}
                      placeholder="Ej: 20"
                      keyboardType="numeric"
                      maxLength={3}
                      error={iPrepErr ?? undefined}
                      accessibilityLabel="Tiempo de preparación en minutos"
                    />
                    {!iPrepErr && iPrep.trim() ? (
                      <Text style={s.fieldHint}>
                        El cliente verá «~{parsePrepMinutes(iPrep)} min» en el menú. En un pedido con
                        varios platos se muestra el más lento.
                      </Text>
                    ) : null}
                  </View>
                )}

                <View style={{ marginTop: espaciado.e12 }}>
                  <PrimaryButton title={busyPub ? 'Enviando…' : 'Publicar (pasa a revisión admin)'} onPress={addItem} disabled={busyPub} />
                </View>
                {me?.menu.length === 0 && (
                  <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e10, textAlign: 'center' }}>
                    Tu menú está vacío: publica el primer plato aquí arriba ☝️
                  </Text>
                )}
              </>
            )}

            {/* Mi menú (gestión) */}
            {me && me.menu.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>Mi menú ({me.menu.length})</Text>
                {me.menu.map((m) => (
                  <MenuRow
                    key={m.id}
                    item={m}
                    busy={busyMenuId === m.id}
                    onToggle={m.status === 'active' ? () => toggleItem(m) : undefined}
                    onPhoto={() => { void ponerFotoAItem(m); }}
                    onRemove={() => removeItem(m)}
                  />
                ))}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/*
        Selector de ciudad. Era un `<Modal>` a mano con su cabecera y su «X»; el `Sheet` trae el
        fondo, el cierre al tocar fuera, el botón de atrás y el título anunciado como cabecera.
      */}
      <Sheet
        visible={cityModal}
        position="bottom"
        title="Elige la ciudad"
        onClose={() => setCityModal(false)}
      >
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {CITIES.map((c) => (
            <Pressable key={c.id}
              onPress={() => { setCity(c.name); setCityModal(false); }}
              accessibilityRole="button"
              style={[s.cityItem, { borderBottomColor: colors.border }]}>
              <Text style={{ fontSize: tipografia.body, fontWeight: city === c.name ? '800' : '600', color: city === c.name ? ACCENT : colors.textPrimary }}>{c.name}</Text>
              {c.region ? <Text style={{ fontSize: 10.5, color: colors.textSecondary }}>{c.region}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>

      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function MenuRow({ item, busy, onToggle, onPhoto, onRemove }: {
  item: FoodMenuItem; busy: boolean;
  onToggle?: () => void; onPhoto: () => void; onRemove: () => void;
}) {
  const { colors } = useTheme();
  const photo = item.photos?.[0] && /^https?:\/\//i.test(item.photos[0]) ? item.photos[0] : null;
  const statusColor = item.status === 'active' ? brand.success : item.status === 'rejected' ? colors.danger : colors.secondary;
  const statusText = item.status === 'active' ? (item.available ? '✓ Activo' : 'Oculto') : item.status === 'rejected' ? '✗ Rechazado' : 'En revisión';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, padding: espaciado.e10, marginBottom: espaciado.e6, borderWidth: 1, borderColor: colors.border }}>
      {photo ? (
        <RNImage source={{ uri: photo }} style={{ width: 40, height: 40, borderRadius: radios.sm }} />
      ) : (
        /* Sin foto: NO se pone un dibujo de plato. Un dibujo ocupa el sitio de la foto y hace
           creer que el plato «ya tiene imagen», cuando lo que pasa es que le FALTA. Se ve una
           cámara y, al lado del precio, «falta foto»: así el dueño sabe qué le queda por hacer. */
        <Pressable onPress={onPhoto} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={`Añadir foto a ${item.name}`}
          style={{ width: 40, height: 40, borderRadius: radios.sm, backgroundColor: alpha(colors.secondary, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={16} color={colors.textSecondary} />
        </Pressable>
      )}
      <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
        <Text numberOfLines={1} style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
          <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: ACCENT }}>{formatXAF(item.priceXaf)}</Text>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: statusColor }}>{statusText}</Text>
          {!photo ? <Text style={{ fontSize: 10.5, fontWeight: '700', color: brand.warning }}>· falta foto</Text> : null}
        </View>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
          {onToggle ? (
            <Pressable onPress={onToggle} hitSlop={6} accessibilityRole="button"
              accessibilityLabel={item.available ? `Ocultar ${item.name} del menú` : `Mostrar ${item.name} en el menú`}
              style={[s_row.iconBtn, { backgroundColor: alpha(colors.primary, 0.1) }]}>
              {item.available ? <EyeOff size={15} color={colors.primary} /> : <Eye size={15} color={colors.primary} />}
            </Pressable>
          ) : null}
          <Pressable onPress={onRemove} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Eliminar ${item.name}`}
            style={[s_row.iconBtn, { backgroundColor: alpha(colors.danger, 0.1) }]}>
            <Trash2 size={15} color={colors.danger} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ReqRow({ ok, label, hint, onPress }: { ok: boolean; label: string; hint?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e5 }}>
      {ok ? <BadgeCheck size={16} color={brand.success} /> : <XCircle size={16} color="#CBD5E1" />}
      <View style={{ flex: 1, marginLeft: espaciado.e8 }}>
        <Text style={{ fontSize: tipografia.caption, fontWeight: peso.medio, color: ok ? colors.textPrimary : colors.textSecondary }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 10.5, color: onPress ? colors.primary : colors.textSecondary }}>{hint}</Text> : null}
      </View>
      {onPress ? <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.caption }}>→</Text> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${hint ?? ''}`} style={{ paddingVertical: espaciado.e2 }}>
      {row}
    </Pressable>
  ) : row;
}

function OwnerSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={{ padding: espaciado.e16, gap: espaciado.e10 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ height: 44, borderRadius: radios.md, backgroundColor: colors.border, width: i % 2 === 0 ? '100%' : '80%' }} />
      ))}
    </View>
  );
}

const s_row = StyleSheet.create({
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});

const s_center = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: espaciado.e28 },
  title: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 },
  btnPrimary: { marginTop: espaciado.e18, backgroundColor: ACCENT, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: 22 },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  reqBox: { borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e14 },
  sectionTitle: { fontSize: tipografia.body, fontWeight: '800', marginBottom: espaciado.e10 },
  photo: { width: 84, height: 84, borderRadius: 14 },
  photoFallback: { backgroundColor: alpha(ACCENT, 0.08), alignItems: 'center', justifyContent: 'center' },
  photoBtn: { borderWidth: 1.5, borderRadius: radios.md, paddingVertical: espaciado.e10, alignItems: 'center' },
  cityBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: espaciado.e14, height: altura.campo },
  area: { minHeight: 70, borderRadius: 14, borderWidth: 1, padding: espaciado.e12, fontSize: tipografia.body, textAlignVertical: 'top' },
  rejectedBox: { borderRadius: 10, padding: espaciado.e10, marginTop: espaciado.e12 },
  cityItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e13, borderBottomWidth: 1 },
  // ── Detalles del plato (041) ──
  detailsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radios.md, borderWidth: 1, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e11, marginTop: espaciado.e12 },
  detailsBody: { borderRadius: radios.md, borderWidth: 1, borderColor: c.border, padding: espaciado.e12, marginTop: espaciado.e8, backgroundColor: c.background },
  fieldLabel: { fontSize: tipografia.caption, fontWeight: '700', color: c.textSecondary, marginBottom: espaciado.e6, marginLeft: espaciado.e2 },
  fieldHint: { fontSize: 10.5, color: c.textSecondary, marginTop: espaciado.e5, marginLeft: espaciado.e2, lineHeight: 15 },
  fieldErr: { fontSize: tipografia.micro, fontWeight: '700', color: c.danger, marginTop: espaciado.e5, marginLeft: espaciado.e2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 },
  chip: { borderWidth: 1, borderRadius: radios.lg, paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radios.md, borderWidth: 1, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e11, marginTop: espaciado.e12 },
  switchTrack: { width: 42, height: 24, borderRadius: radios.md, padding: espaciado.e3, justifyContent: 'center' },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: brand.white },
});
