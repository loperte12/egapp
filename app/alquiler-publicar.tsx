/**
 * AlquilerPublicarScreen — publicar propiedad + mis propiedades (arrendador) v2.
 * Auditoría aplicada:
 *  · Errores separados (applyError/publishError), landlord con carga + error + Reintentar.
 *  · Límite del plan PROACTIVO (antes de rellenar el formulario) + aviso de destacados.
 *  · Fotos/DIP comprimidos en el picker (quality 0.4) + límite ~700 KB base64 por foto
 *    (el backend ya sube base64→MinIO; así no se supera el body de 10 MB de nginx).
 *  · Fix renta 'both': pide y valida precio por noche Y renta mensual.
 *  · Selector de ubicación en mapa OPCIONAL (coordenadas reales; si no, barrio).
 *  · SafeArea, a11y completa, maxLength/contadores, miniatura real del DIP,
 *    reset completo del formulario, imports muertos eliminados.
 * Ruta: /alquiler-publicar
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageIcon, X } from 'lucide-react-native';
import { alpha, brand, EmptyState, espaciado, FormField, GhostButton, InlineError, PrimaryButton, radios, ScreenHeader, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import MapBackground from '../components/MapBackground';
import { rentalApi, type LandlordMe, type RentalProperty, type RentalCatalog } from '../api/rental';
import { formatXAF } from '../utils/formatHelpers';

const PLAN_LABELS: Record<string, string> = { free: 'Gratis', verified: 'Verificado', agency_pro: 'Agencia Pro', premium: 'Premium' };
const PLAN_FEATURES: Record<string, { photos: number; properties: number; canFeature: boolean }> = {
  free: { photos: 5, properties: 1, canFeature: false },
  verified: { photos: 10, properties: 3, canFeature: false },
  agency_pro: { photos: 20, properties: 50, canFeature: true },
  premium: { photos: 30, properties: 200, canFeature: true },
};
const MAX_PHOTO_B64_KB = 700;
const MAX_TITLE = 160;
const MAX_DESC = 2000;
const DIGITS = (t: string) => t.replace(/[^0-9.]/g, '').slice(0, 12);

/** bytes reales de un string base64 (con o sin prefijo data:) */
const b64SizeKB = (s: string | null | undefined) => {
  const b64 = (s || '').split(',')[1] || s || '';
  return Math.round((b64.length * 3) / 4 / 1024);
};

export default function AlquilerPublicarScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'publish' | 'mine'>('publish');
  const [cat, setCat] = useState<RentalCatalog | null>(null);
  const [landlord, setLandlord] = useState<LandlordMe | null>(null);
  const [mine, setMine] = useState<RentalProperty[]>([]);
  const [loadingLandlord, setLoadingLandlord] = useState(true);
  const [landlordError, setLandlordError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Alta de arrendador
  const [applyOpen, setApplyOpen] = useState(false);
  const [llName, setLlName] = useState('');
  const [llDocType, setLlDocType] = useState<'dip' | 'passport' | 'residence_permit'>('dip');
  const [llDocNumber, setLlDocNumber] = useState('');
  const [llDocPhoto, setLlDocPhoto] = useState<string | null>(null);
  const [llBusy, setLlBusy] = useState(false);

  // Formulario de publicación
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('apartment');
  const [rentalType, setRentalType] = useState<'long_term' | 'short_term' | 'both'>('long_term');
  const [cityId, setCityId] = useState('malabo');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<[number, number] | null>(null); // [lng, lat]
  const [size, setSize] = useState('');
  const [landSize, setLandSize] = useState('');
  const [rooms, setRooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [pricePerNight, setPricePerNight] = useState('');
  const [depositMonths, setDepositMonths] = useState('1');
  const [agencyFee, setAgencyFee] = useState('');
  const [agencyFeePayer, setAgencyFeePayer] = useState<'tenant' | 'landlord' | 'shared' | ''>('');
  const [essential, setEssential] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSocialHousing, setIsSocialHousing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isLand = type === 'land_agriculture' || type === 'land_workshop' || type === 'land_other';
  const subscription = landlord?.subscription ?? 'free';
  const plan = PLAN_FEATURES[subscription] ?? PLAN_FEATURES.free;
  const planLabel = PLAN_LABELS[subscription] ?? 'Gratis';
  const exists = !!landlord?.exists;
  const approved = exists && landlord?.status === 'approved' && Number(landlord?.verificationLevel) >= 2;
  const activeProps = landlord?.propertiesCount ?? mine.filter((p) => p.status === 'open').length;
  const atPlanLimit = approved && activeProps >= plan.properties;
  const canFeaturePlan = plan.canFeature;

  const loadLandlord = useCallback(async () => {
    setLoadingLandlord(true);
    setLandlordError(null);
    try {
      const [me, catalog] = await Promise.all([rentalApi.landlordMe(), rentalApi.catalog()]);
      if (!mountedRef.current) return;
      setLandlord(me);
      setCat(catalog);
      if (me.exists && me.status === 'approved' && Number(me.verificationLevel) >= 2) {
        const r = await rentalApi.myProperties();
        if (mountedRef.current) setMine(r.properties ?? []);
      }
    } catch (e) {
      if (mountedRef.current) setLandlordError(e instanceof Error ? e.message : 'No se pudieron cargar tus datos. Comprueba tu conexión.');
    } finally {
      if (mountedRef.current) setLoadingLandlord(false);
    }
  }, []);

  useEffect(() => { void loadLandlord(); }, [loadLandlord]);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.4, base64: true });
    if (res.canceled || !res.assets?.[0]) return;
    const b64 = res.assets[0].base64 ?? null;
    if (!b64) { Alert.alert('Imagen', 'No se pudo leer la imagen. Prueba con otra.'); return; }
    if (photos.length >= plan.photos) { Alert.alert('Límite de fotos', `Tu plan ${planLabel} permite ${plan.photos} fotos. Mejora tu plan para subir más.`); return; }
    const sizeKB = b64SizeKB(b64);
    if (sizeKB > MAX_PHOTO_B64_KB) {
      Alert.alert('Foto demasiado pesada', `La foto pesa ~${sizeKB} KB. Máximo ${MAX_PHOTO_B64_KB} KB para poder publicarla (se comprime al elegirla; prueba con otra o edítala antes).`);
      return;
    }
    setPhotos((p) => [...p, `data:image/jpeg;base64,${b64}`]);
  };

  const removePhoto = (idx: number) => setPhotos((p) => p.filter((_, i) => i !== idx));

  const pickDocPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.4, base64: true });
    if (res.canceled || !res.assets?.[0]) return;
    const b64 = res.assets[0].base64 ?? null;
    if (!b64) return;
    const sizeKB = b64SizeKB(b64);
    if (sizeKB > MAX_PHOTO_B64_KB) {
      Alert.alert('Documento demasiado pesado', `El documento pesa ~${sizeKB} KB. Máximo ${MAX_PHOTO_B64_KB} KB para enviarlo.`);
      return;
    }
    setLlDocPhoto(`data:image/jpeg;base64,${b64}`);
  };

  const submitApply = async () => {
    if (!llName.trim() || !llDocNumber.trim()) { setApplyError('Nombre y número de documento son obligatorios'); return; }
    if (llDocPhoto === null) { setApplyError('Adjunta una foto legible del documento.'); return; }
    setLlBusy(true); setApplyError(null);
    try {
      const r = await rentalApi.applyLandlord({ name: llName.trim(), docType: llDocType, docNumber: llDocNumber.trim(), docPhoto: llDocPhoto, isAgency: false });
      Alert.alert('Solicitud enviada', r.message);
      setApplyOpen(false);
      setLlName(''); setLlDocNumber(''); setLlDocPhoto(null); setLlDocType('dip');
      await loadLandlord();
    } catch (e) { setApplyError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud'); }
    finally { setLlBusy(false); }
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setType('apartment'); setRentalType('long_term');
    setCityId('malabo'); setNeighborhood(''); setAddress(''); setCoords(null);
    setSize(''); setLandSize(''); setRooms(''); setBathrooms('');
    setMonthlyRent(''); setPricePerNight(''); setDepositMonths('1');
    setAgencyFee(''); setAgencyFeePayer(''); setEssential([]); setAmenities([]);
    setPhotos([]); setIsFeatured(false); setIsSocialHousing(false);
  };

  const chooseType = (t: string) => {
    setType(t);
    const land = t === 'land_agriculture' || t === 'land_workshop' || t === 'land_other';
    if (land) { setRooms(''); setBathrooms(''); } else { setLandSize(''); }
    setCoords(null);
  };
  const chooseRentalType = (t: 'long_term' | 'short_term' | 'both') => {
    setRentalType(t);
    if (t === 'long_term') setPricePerNight('');
    if (t === 'short_term') setMonthlyRent('');
  };
  const chooseCity = (id: string) => { setCityId(id); setNeighborhood(''); setCoords(null); };

  const publish = async () => {
    if (!approved) return;
    if (!title.trim() || !neighborhood.trim()) { setPublishError('Título y barrio son obligatorios.'); return; }
    if (atPlanLimit) {
      setPublishError(`Alcanzaste el límite de tu plan (${plan.properties} anuncio(s) activo(s)). Mejora tu plan para publicar más.`);
      return;
    }
    const needsMonthly = rentalType === 'long_term' || rentalType === 'both';
    const needsNightly = rentalType === 'short_term' || rentalType === 'both';
    if (needsMonthly && !monthlyRent) { setPublishError('Indica la renta mensual.'); return; }
    if (needsNightly && !pricePerNight) { setPublishError('Indica el precio por noche.'); return; }
    if (rentalType === 'both' && Number(monthlyRent) > 0 && Number(pricePerNight) * 28 <= Number(monthlyRent)) {
      setPublishError('Revisa los precios: por noche × 28 debería superar la renta mensual.'); return;
    }
    setBusy(true); setPublishError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim().slice(0, MAX_TITLE), description: description.trim() || undefined, type, rentalType,
        cityId, neighborhood: neighborhood.trim(), address: address.trim().slice(0, 200) || undefined,
        lat: coords ? coords[1] : null, lng: coords ? coords[0] : null,
        size: size ? Number(size) : undefined, landSize: landSize ? Number(landSize) : undefined,
        rooms: !isLand && rooms ? Number(rooms) : undefined, bathrooms: !isLand && bathrooms ? Number(bathrooms) : undefined,
        monthlyRent: monthlyRent ? Number(monthlyRent) : undefined, pricePerNight: pricePerNight ? Number(pricePerNight) : undefined,
        depositMonths: Number(depositMonths) || 1, agencyFee: agencyFee ? Number(agencyFee) : undefined,
        agencyFeePayer: agencyFeePayer || undefined,
        essentialServices: Object.fromEntries(essential.map((k) => [k, true])),
        amenities: Object.fromEntries(amenities.map((k) => [k, true])),
        photos, isFeatured, isSocialHousing,
      };
      const r = await rentalApi.publish(body);
      Alert.alert('Publicado', r.message);
      resetForm();
      setTab('mine');
      await loadLandlord();
    } catch (e) { setPublishError(e instanceof Error ? e.message : 'No se pudo publicar'); }
    finally { setBusy(false); }
  };

  const closeProp = (id: string) => {
    Alert.alert('Cerrar anuncio', 'Dejará de ser visible para los buscadores. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar', style: 'destructive',
        onPress: async () => {
          if (closingId) return;
          setClosingId(id);
          try {
            const r = await rentalApi.close(id);
            Alert.alert('Anuncio cerrado', r.message);
            await loadLandlord();
          } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cerrar el anuncio'); }
          finally { setClosingId(null); }
        },
      },
    ]);
  };

  const toggleChip = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) =>
    setter((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  const s = styles(colors);

  // ---------- Carga inicial ----------
  if (loadingLandlord) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary, fontWeight: peso.fuerte }}>Cargando tus datos…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera del kit desde el 24/09/2026 (unificación de las 21 cabeceras). */}
      <ScreenHeader
        titulo="Buscar Alquiler"
        alVolver={() => router.back()}
      />

      <View style={{ flexDirection: 'row', paddingHorizontal: espaciado.e16, gap: espaciado.e8, marginVertical: espaciado.e12 }}>
        <TabBtn active={tab === 'publish'} label="Publicar" onPress={() => setTab('publish')} />
        <TabBtn active={tab === 'mine'} label={`Mis anuncios (${mine.length})`} onPress={() => setTab('mine')} />
      </View>

      {landlordError && !landlord ? (
        <View style={{ alignItems: 'center', paddingVertical: 50, paddingHorizontal: espaciado.e24 }}>
          <Text style={{ color: colors.danger, fontWeight: peso.fuerte, textAlign: 'center' }}>No se pudieron cargar tus datos.</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, marginBottom: espaciado.e14 }}>{landlordError}</Text>
          <Pressable onPress={() => void loadLandlord()} accessibilityRole="button" accessibilityLabel="Reintentar"
            style={({ pressed }) => [{ paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderRadius: 10, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Banner de plan */}
          <View style={[s.planBanner, { backgroundColor: colors.textPrimary }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: brand.white, fontSize: 15, fontWeight: peso.fuerte }}>Plan actual: {planLabel}</Text>
              <Text style={{ color: '#94a3b8', fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                {activeProps}/{plan.properties} propiedades · {photos.length}/{plan.photos} fotos
                {landlord?.verificationLevel ? ` · Nivel ${landlord.verificationLevel}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
              <Pressable onPress={() => router.push('/billing-status' as never)} accessibilityRole="button" accessibilityLabel="Mis compras"
                style={({ pressed }) => [{ backgroundColor: brand.success, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e8, borderRadius: radios.sm, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Mis compras</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/alquiler-planes' as never)} accessibilityRole="button" accessibilityLabel="Mejorar plan"
                style={({ pressed }) => [{ backgroundColor: colors.primary, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderRadius: radios.sm, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Mejorar plan</Text>
              </Pressable>
            </View>
          </View>

          {approved && atPlanLimit && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, backgroundColor: alpha(colors.danger, 0.08), padding: espaciado.e12, borderRadius: 10, marginBottom: espaciado.e14 }}>
              <Text style={{ flex: 1, fontSize: tipografia.caption, color: colors.danger, fontWeight: peso.medio, lineHeight: 17 }}>
                Has alcanzado el límite de tu plan ({plan.properties} anuncio(s) activos). Cierra alguno o mejora tu plan para seguir publicando.
              </Text>
            </View>
          )}

          {tab === 'publish' ? (
            !approved ? (
              <View style={{ gap: espaciado.e12 }}>
                {applyOpen ? (
                  <>
                    <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary, marginTop: espaciado.e8 }}>Alta de arrendador</Text>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, lineHeight: 17 }}>
                      Para publicar necesitas verificar tu identidad (DIP/pasaporte). El administrador la revisará.
                    </Text>
                    <Text style={s.label}>Nombre completo *</Text>
                    <FormField value={llName} onChangeText={(t) => setLlName(t.slice(0, 120))} placeholder="Tu nombre" />
                    <Text style={s.label}>Tipo de documento *</Text>
                    <View style={{ flexDirection: 'row', gap: espaciado.e6, flexWrap: 'wrap' }}>
                      {([['dip', 'DIP'], ['passport', 'Pasaporte'], ['residence_permit', 'Permiso de residencia']] as const).map(([v, l]) => (
                        <Chip key={v} label={l} active={llDocType === v} onPress={() => setLlDocType(v)} />
                      ))}
                    </View>
                    <Text style={s.label}>Número de documento *</Text>
                    <FormField value={llDocNumber} onChangeText={(t) => setLlDocNumber(t.slice(0, 50))} placeholder="Ej: DIP-123456" />
                    <Text style={s.label}>Foto del documento *</Text>
                    {llDocPhoto ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                        <View style={{ width: 64, height: 64, borderRadius: radios.sm, overflow: 'hidden', backgroundColor: colors.surface }}>
                          <Image source={{ uri: llDocPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: tipografia.caption, color: colors.success, fontWeight: peso.fuerte }}>Documento adjunto</Text>
                          <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e2 }}>~{b64SizeKB(llDocPhoto)} KB</Text>
                        </View>
                        <GhostButton title="Cambiar" onPress={() => void pickDocPhoto()} />
                        <Pressable onPress={() => setLlDocPhoto(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar documento"><X size={18} color={colors.danger} /></Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => void pickDocPhoto()}
                        accessibilityRole="button" accessibilityLabel="Subir foto del documento"
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, backgroundColor: colors.surface, padding: espaciado.e14, borderRadius: 10, borderWidth: trazo.fino, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                      >
                        <ImageIcon size={18} color={colors.primary} /><Text style={{ fontSize: tipografia.body, color: colors.primary, fontWeight: peso.medio }}>Subir foto del documento</Text>
                      </Pressable>
                    )}
                    <Text style={{ fontSize: 10.5, color: colors.textSecondary }}>Máx. ~{MAX_PHOTO_B64_KB} KB (se comprime al elegirla).</Text>
                    {applyError ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={applyError} /></View> : null}
                    <PrimaryButton title={llBusy ? 'Enviando…' : 'Enviar solicitud'} onPress={submitApply} disabled={llBusy} />
                  </>
                ) : (
                  <View style={{ alignItems: 'center', gap: espaciado.e10, marginTop: espaciado.e30 }}>
                    <Text style={{ fontSize: 40 }}>🏠</Text>
                    <Text style={{ fontSize: 15, fontWeight: peso.fuerte, color: colors.textPrimary, textAlign: 'center' }}>
                      {landlord?.status === 'pending' ? 'Tu solicitud de arrendador está pendiente de revisión' : 'Necesitas verificar tu identidad para publicar'}
                    </Text>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: espaciado.e20, lineHeight: 18 }}>
                      {landlord?.status === 'pending'
                        ? 'El administrador revisará tu DIP/pasaporte. Te avisaremos en cuanto esté aprobado.'
                        : landlord?.status === 'rejected'
                          ? 'Tu solicitud fue rechazada. Puedes volver a enviarla.'
                          : 'Completa el alta con tu DIP o pasaporte para empezar a publicar.'}
                    </Text>
                    <PrimaryButton title={landlord?.status === 'rejected' ? 'Reenviar solicitud' : 'Verificar mi identidad'} onPress={() => { setApplyOpen(true); setApplyError(null); }} />
                  </View>
                )}
              </View>
            ) : (
              <>
                <Text style={s.label}>Título del anuncio *</Text>
                <FormField value={title} onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))} placeholder="Ej: Apartamento 2 hab. en Paraíso" />

                <Text style={s.label}>Tipo de propiedad *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                  {(cat?.propertyTypes ?? []).map((t) => <Chip key={t.id} label={t.label} active={type === t.id} onPress={() => chooseType(t.id)} />)}
                </View>

                <Text style={s.label}>Tipo de alquiler *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                  {(cat?.rentalTypes ?? []).map((t) => (
                    <Chip key={t.id} label={t.label} active={rentalType === t.id} onPress={() => chooseRentalType(t.id as 'long_term' | 'short_term' | 'both')} />
                  ))}
                </View>

                <Text style={s.label}>{rentalType === 'short_term' ? 'Precio por noche (XAF) *' : rentalType === 'both' ? 'Precio por noche (XAF) *' : 'Renta mensual (XAF) *'}</Text>
                {(rentalType === 'short_term' || rentalType === 'both') && (
                  <FormField value={pricePerNight} onChangeText={setPricePerNight} placeholder="25000" keyboardType="decimal-pad" />
                )}
                {rentalType === 'both' && (
                  <>
                    <Text style={s.label}>Renta mensual (XAF) *</Text>
                    <FormField value={monthlyRent} onChangeText={setMonthlyRent} placeholder="250000" keyboardType="decimal-pad" />
                    <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e2 }}>Por noche × 28 debería superar la renta mensual (así no se contradicen).</Text>
                  </>
                )}
                {rentalType === 'long_term' && (
                  <FormField value={monthlyRent} onChangeText={setMonthlyRent} placeholder="250000" keyboardType="decimal-pad" />
                )}

                <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                  <View style={{ flex: 1 }}><Text style={s.label}>Fianza (meses)</Text><FormField value={depositMonths} onChangeText={(t) => setDepositMonths(DIGITS(t) || '1')} placeholder="1" keyboardType="decimal-pad" /></View>
                  <View style={{ flex: 1 }}><Text style={s.label}>Honorarios (XAF)</Text><FormField value={agencyFee} onChangeText={setAgencyFee} placeholder="25000" keyboardType="decimal-pad" /></View>
                </View>
                {agencyFee ? (
                  <>
                    <Text style={s.label}>Paga los honorarios</Text>
                    <View style={{ flexDirection: 'row', gap: espaciado.e6, flexWrap: 'wrap' }}>
                      {([['tenant', 'Inquilino'], ['landlord', 'Propietario'], ['shared', 'Compartido']] as const).map(([v, l]) => (
                        <Chip key={v} label={l} active={agencyFeePayer === v} onPress={() => setAgencyFeePayer(agencyFeePayer === v ? '' : v)} />
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={s.label}>Ciudad *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                  {(cat?.cities ?? []).map((c) => <Chip key={c.id} label={c.label} active={cityId === c.id} onPress={() => chooseCity(c.id)} />)}
                </View>

                <Text style={s.label}>Barrio *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                  {(cat?.neighborhoods ?? []).filter((n) => n.cityId === cityId).map((n) => (
                    <Chip key={`${n.cityId}:${n.name}`} label={n.name} active={neighborhood === n.name} onPress={() => { setNeighborhood(n.name); setCoords(null); }} />
                  ))}
                </View>
                <Text style={s.label}>Dirección (opcional)</Text>
                <FormField value={address} onChangeText={(t) => setAddress(t.slice(0, 200))} placeholder="Calle, referencia…" />

                <Text style={s.label}>Ubicación en el mapa (opcional)</Text>
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginBottom: espaciado.e6 }}>
                  Toca el mapa para fijar la vivienda. Si no lo haces, usaremos el centro del barrio.
                </Text>
                <View style={{ height: 160, borderRadius: 14, overflow: 'hidden', marginBottom: espaciado.e6 }}>
                  <MapBackground onMapPress={(c) => setCoords([c[0], c[1]])} pin={coords} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  {coords ? (
                    <Text style={{ fontSize: tipografia.micro, color: colors.success, fontWeight: peso.fuerte }}>Punto fijado ✓</Text>
                  ) : (
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Sin punto (usará el barrio)</Text>
                  )}
                  {coords && (
                    <Pressable onPress={() => setCoords(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar el punto del mapa">
                      <Text style={{ fontSize: tipografia.micro, color: colors.danger, fontWeight: peso.fuerte }}>Quitar punto</Text>
                    </Pressable>
                  )}
                </View>

                <Text style={s.label}>{isLand ? 'Superficie del terreno (m²)' : 'Superficie (m²)'}</Text>
                <FormField value={isLand ? landSize : size} onChangeText={isLand ? setLandSize : setSize} placeholder="85" keyboardType="decimal-pad" />

                {!isLand && (
                  <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                    <View style={{ flex: 1 }}><Text style={s.label}>Habitaciones</Text><FormField value={rooms} onChangeText={(t) => setRooms(DIGITS(t))} placeholder="2" keyboardType="number-pad" /></View>
                    <View style={{ flex: 1 }}><Text style={s.label}>Baños</Text><FormField value={bathrooms} onChangeText={(t) => setBathrooms(DIGITS(t))} placeholder="1" keyboardType="number-pad" /></View>
                  </View>
                )}

                <Text style={s.label}>Servicios esenciales</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                  {(cat?.essentialServices ?? []).map((e) => <Chip key={e.id} label={e.label} active={essential.includes(e.id)} onPress={() => toggleChip(setEssential, e.id)} />)}
                </View>

                <Text style={s.label}>Comodidades</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                  {(cat?.amenities ?? []).map((a) => <Chip key={a.id} label={a.label} active={amenities.includes(a.id)} onPress={() => toggleChip(setAmenities, a.id)} />)}
                </View>

                <Text style={s.label}>Descripción</Text>
                <TextInput multiline maxLength={MAX_DESC} style={s.area} placeholder="Describe el inmueble, servicios, entorno…" placeholderTextColor={colors.textSecondary} value={description} onChangeText={setDescription} />
                <Text style={s.counter}>{description.length}/{MAX_DESC}</Text>

                <Text style={s.label}>Fotos ({photos.length}/{plan.photos})</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10, marginTop: espaciado.e6 }}>
                  {photos.map((p, i) => (
                    <View key={i} style={{ width: 74, height: 74, borderRadius: radios.sm, overflow: 'hidden', backgroundColor: colors.surface }}>
                      <Image source={{ uri: p }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <Pressable onPress={() => removePhoto(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Quitar foto ${i + 1}`}
                        style={{ position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(16,24,40,0.65)', borderRadius: 9, padding: espaciado.e2 }}>
                        <X size={12} color={brand.white} />
                      </Pressable>
                    </View>
                  ))}
                  {photos.length < plan.photos && (
                    <Pressable onPress={() => void pickPhoto()} accessibilityRole="button" accessibilityLabel="Añadir foto"
                      style={({ pressed }) => [{ width: 74, height: 74, borderRadius: radios.sm, borderWidth: trazo.fuerte, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}>
                      <Text style={{ fontSize: 26, color: colors.textSecondary }}>+</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e4 }}>Se comprimen al elegirlas. Máx. ~{MAX_PHOTO_B64_KB} KB cada una.</Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: espaciado.e16, backgroundColor: colors.surface, padding: espaciado.e14, borderRadius: 10 }}>
                  <View style={{ flex: 1, paddingRight: espaciado.e8 }}>
                    <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, fontWeight: peso.medio }}>Marcar como destacado</Text>
                    {!canFeaturePlan && <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e2 }}>Requiere plan Agencia Pro o Premium.</Text>}
                  </View>
                  <Switch
                    value={isFeatured} onValueChange={setIsFeatured} disabled={!canFeaturePlan}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    accessibilityRole="switch" accessibilityLabel="Marcar como destacado" accessibilityState={{ checked: isFeatured, disabled: !canFeaturePlan }}
                  />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: espaciado.e8, backgroundColor: colors.surface, padding: espaciado.e14, borderRadius: 10 }}>
                  <Text style={{ flex: 1, fontSize: tipografia.body, color: colors.textPrimary, fontWeight: peso.medio }}>Vivienda social / asequible</Text>
                  <Switch value={isSocialHousing} onValueChange={setIsSocialHousing} trackColor={{ true: colors.primary, false: colors.border }}
                    accessibilityRole="switch" accessibilityLabel="Vivienda social o asequible" accessibilityState={{ checked: isSocialHousing }} />
                </View>

                {publishError ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={publishError} /></View> : null}
                <View style={{ marginTop: espaciado.e20 }}>
                  <PrimaryButton title={busy ? 'Publicando…' : atPlanLimit ? 'Límite del plan alcanzado' : 'Publicar anuncio'}
                    onPress={atPlanLimit ? () => { setPublishError('Cierra un anuncio o mejora tu plan para publicar.'); router.push('/alquiler-planes' as never); } : publish}
                    disabled={busy} />
                </View>
              </>
            )
          ) : (
            <>
              {mine.length === 0 && (
                /* Vacío con salida (D-17) con el componente del kit, en su forma compacta:
                   vive dentro de la pantalla de publicar, así que no compite con el formulario. */
                <EmptyState
                  compacto
                  icono={<Text style={{ fontSize: tipografia.display }}>📦</Text>}
                  titulo="Aún no has publicado anuncios"
                  texto="Cuando publiques uno aparecerá aquí, con su estado y sus visitas."
                />
              )}
              {mine.map((p) => (
                <View key={p.id} style={{ backgroundColor: colors.surface, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e12 }}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/alquiler-detalle', params: { id: p.id } } as never)}
                    accessibilityRole="button" accessibilityLabel={`Ver anuncio: ${p.title}`}
                    style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: espaciado.e8 }}>
                        <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>{p.title}</Text>
                        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }} numberOfLines={1}>
                          {p.location.neighborhood}, {p.location.cityName} · {p.price.monthlyRent ? formatXAF(p.price.monthlyRent) + '/mes' : formatXAF(p.price.pricePerNight) + '/noche'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: p.status === 'closed' ? colors.danger : colors.success }}>{p.status === 'closed' ? 'Cerrado' : 'Activo'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: espaciado.e16, marginTop: espaciado.e10, borderTopWidth: trazo.fino, borderTopColor: colors.border, paddingTop: espaciado.e10, alignItems: 'center' }}>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>👁 {p.viewsCount} vistas</Text>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>⭐ {p.favoritesCount} favs</Text>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>📞 {p.contactClicks} contactos</Text>
                      {p.status !== 'closed' && (
                        <Pressable onPress={() => closeProp(p.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Cerrar anuncio ${p.title}`} style={{ marginLeft: 'auto' }}>
                          {closingId === p.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={{ fontSize: tipografia.micro, color: colors.danger, fontWeight: peso.fuerte }}>Cerrar</Text>}
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TabBtn({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}
      style={({ pressed }) => [{ flex: 1, paddingVertical: espaciado.e9, borderRadius: radios.sm, alignItems: 'center', backgroundColor: active ? colors.primary : colors.surface, opacity: pressed ? 0.85 : 1 }]}>
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: active ? brand.white : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}
      style={({ pressed }) => [{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: active ? colors.primary : colors.surface, borderWidth: trazo.fino, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 }]}>
      <Text style={{ fontSize: tipografia.caption, fontWeight: active ? peso.fuerte : peso.medio, color: active ? brand.white : colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  planBanner: { borderRadius: radios.md, padding: espaciado.e14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espaciado.e16 },
  label: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: c.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e6 },
  counter: { fontSize: 10, color: c.textSecondary, textAlign: 'right', marginBottom: espaciado.e4 },
  area: { minHeight: 90, borderRadius: 10, borderWidth: trazo.fino, borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary, padding: espaciado.e10, fontSize: tipografia.body, textAlignVertical: 'top' },
});
