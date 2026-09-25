/**
 * DriverOnboardingScreen — alta de conductor por PASOS (EG Route Plan).
 * Wizard: Documentación personal → del conductor → del vehículo (+ datos del
 * vehículo) → fiscal → selfie. Cada paso se guarda al "Continuar" y se puede
 * retomar (el backend devuelve el progreso en /driver/documents/requirements).
 * Ruta: /driver-onboarding
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, CheckCircle2, ShieldCheck, ChevronRight, FileText, User, Truck, Receipt } from 'lucide-react-native';
import { brand, CameraCapture, espaciado, FormField, GhostButton, InlineError, PrimaryButton, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';
import { absUrl } from '../api/config';
import { driverApi, DocCategoryApi, DocRequirementApi } from '../api/driver';

type Step = 'gate' | 'docs' | 'selfie' | 'pending';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  personal: <User size={18} color={brand.white} />,
  conductor: <FileText size={18} color={brand.white} />,
  vehiculo: <Truck size={18} color={brand.white} />,
  fiscal: <Receipt size={18} color={brand.white} />,
};

/** Colores de coche para el selector del alta (P1a). */
const CAR_COLORS: Array<{ label: string; hex: string }> = [
  { label: 'Blanco', hex: '#F5F5F5' },
  { label: 'Negro', hex: '#22252A' },
  { label: 'Gris', hex: '#9AA0A6' },
  { label: 'Plata', hex: '#C6CCD4' },
  { label: 'Rojo', hex: brand.danger },
  { label: 'Azul', hex: brand.primary },
  { label: 'Verde', hex: brand.success },
  { label: 'Amarillo', hex: brand.warning },
  { label: 'Naranja', hex: brand.warning },
  { label: 'Marrón', hex: '#8B5A2B' },
];

export default function DriverOnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useSession();

  const [step, setStep] = useState<Step>(isAuthenticated ? 'docs' : 'gate');
  const [cats, setCats] = useState<DocCategoryApi[]>([]);
  const [catIdx, setCatIdx] = useState(0);
  const [photos, setPhotos] = useState<Record<string, { front?: string; back?: string }>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [capturing, setCapturing] = useState<{ code: string; side: 'front' | 'back'; label: string } | null>(null);
  const [vehicle, setVehicle] = useState({
    vehicleType: 'car', vehiclePlate: '', vehicleModel: '', licenseNumber: '',
    vehicleColor: '', vehiclePhoto: '', // P1a: color + foto real del coche
  });
  const [nationality, setNationality] = useState<'national' | 'foreign'>('national');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isAuthenticated);

  const cat = cats[catIdx];

  const loadProgress = useCallback(async () => {
    setLoading(true);
    try {
      const res = await driverApi.requirements();
      setCats(res.categories || []);
      if (res.vehicle) {
        setVehicle({
          vehicleType: res.vehicle.vehicle_type || 'car',
          vehiclePlate: res.vehicle.vehicle_plate || '',
          vehicleModel: res.vehicle.vehicle_model || '',
          licenseNumber: res.vehicle.license_number || '',
          vehicleColor: res.vehicle.vehicle_color || '',
          vehiclePhoto: res.vehicle.vehicle_photo_url || '',
        });
      }
      // Primer paso incompleto (obligatorios sin subir) → retomar ahí.
      let start = 0;
      for (let i = 0; i < (res.categories || []).length; i++) {
        const c = res.categories[i];
        const incomplete = c.docs.filter((d) => d.isRequired && !d.submitted);
        if (incomplete.length > 0) { start = i; break; }
        start = i + 1;
      }
      if (start >= (res.categories || []).length) {
        // Todos los pasos obligatorios completos → selfie (o ya pendiente).
        setStep('selfie');
      } else {
        setCatIdx(start);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar tu progreso');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadProgress();
  }, [isAuthenticated, loadProgress]);

  // --- Captura --------------------------------------------------------------
  const onCapture = (photo: { uri: string; base64?: string }) => {
    if (!capturing) return;
    const value = photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : `captured://${capturing.code}/${Date.now()}`;
    if (capturing.code === 'vehicle_photo') {
      // P1a: foto REAL del coche (no es un documento).
      setVehicle((v) => ({ ...v, vehiclePhoto: value }));
      setCapturing(null);
      return;
    }
    setPhotos((p) => ({ ...p, [capturing.code]: { ...p[capturing.code], [capturing.side]: value } }));
    setCapturing(null);
  };

  const sideOk = (doc: DocRequirementApi, side: 'front' | 'back') =>
    !!photos[doc.code]?.[side] || doc.submitted;

  const docDone = (doc: DocRequirementApi) =>
    sideOk(doc, 'front') && (doc.photos < 2 || sideOk(doc, 'back'));

  /** El permiso de residencia solo es obligatorio para extranjeros. */
  const effectiveRequired = (doc: DocRequirementApi) =>
    doc.isRequired && !(doc.code === 'residence_permit' && nationality === 'national');

  const requiredDone = cat ? cat.docs.filter(effectiveRequired).every(docDone) : false;
  /** P1a/P1b: en el paso del vehículo, además de los docs, exigimos MATRÍCULA,
   *  COLOR y FOTO real (la matrícula se muestra destacada al pasajero). */
  const vehicleExtraDone = cat?.code === 'vehiculo'
    ? Boolean(
        vehicle.vehiclePlate.trim()
        && vehicle.vehicleColor.trim()
        && (vehicle.vehiclePhoto.trim().startsWith('data:') || vehicle.vehiclePhoto.trim().startsWith('captured://') || vehicle.vehiclePhoto.trim().startsWith('/wallet/')),
      )
    : true;
  const allDone = cat ? requiredDone && vehicleExtraDone : false;

  const openCapture = (doc: DocRequirementApi) => {
    const needFront = !sideOk(doc, 'front');
    const needBack = doc.photos === 2 && !sideOk(doc, 'back') && !needFront;
    const side: 'front' | 'back' = needFront ? 'front' : 'back';
    const label = doc.photos === 2 ? (side === 'front' ? `${doc.label} — frente` : `${doc.label} — reverso`) : doc.label;
    setCapturing({ code: doc.code, side, label });
  };

  // --- Guardar paso ----------------------------------------------------------
  const saveStep = async () => {
    if (!cat || !allDone || busy) return;
    setBusy(true); setError(null);
    try {
      const docsPayload = cat.docs
        .filter((d) => photos[d.code]?.front || photos[d.code]?.back)
        .map((d) => ({
          code: d.code,
          front: photos[d.code].front,
          back: photos[d.code].back,
          expiresAt: expiries[d.code]?.trim() || undefined,
        }));
      const payload: { category: string; docs: typeof docsPayload; vehicle?: object; nationality?: string } = {
        category: cat.code,
        docs: docsPayload,
        nationality,
      };
      if (cat.code === 'vehiculo') {
        payload.vehicle = {
          vehicleType: vehicle.vehicleType,
          vehiclePlate: vehicle.vehiclePlate.trim() || undefined,
          vehicleModel: vehicle.vehicleModel.trim() || undefined,
          licenseNumber: vehicle.licenseNumber.trim() || undefined,
          vehicleColor: vehicle.vehicleColor.trim() || undefined,
          vehiclePhoto: vehicle.vehiclePhoto.trim() || undefined,
        };
      }
      await driverApi.submitStep(payload);
      // Marcar los subidos como guardados localmente.
      setCats((prev) => prev.map((c, i) => (i !== catIdx ? c : {
        ...c,
        docs: c.docs.map((d) => (photos[d.code]?.front || photos[d.code]?.back ? { ...d, submitted: true, status: 'pending' } : d)),
      })));
      if (catIdx < cats.length - 1) {
        setCatIdx((i) => i + 1);
      } else {
        setStep('selfie');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el paso');
    } finally {
      setBusy(false);
    }
  };

  const submitSelfie = async (photo: { uri: string; base64?: string }) => {
    const value = photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : `captured://selfie/${Date.now()}`;
    setBusy(true); setError(null);
    try {
      await driverApi.submitSelfie(value);
      setStep('pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la selfie');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (step === 'gate') return router.back();
    if (step === 'docs' && catIdx > 0) return setCatIdx((i) => i - 1);
    if (step === 'selfie' && cats.length > 0) return setCatIdx(cats.length - 1);
    router.back();
  };

  const s = styles(colors);
  // Foto del coche para previsualizar: URL relativa del backend → absoluta;
  // captura nueva (data:) pasa tal cual; captured:// (marcador de prueba) no
  // es una imagen real → no se pinta.
  const vehiclePhotoPreview = vehicle.vehiclePhoto
    && !vehicle.vehiclePhoto.startsWith('captured://')
    && !vehicle.vehiclePhoto.startsWith('data:')
    ? absUrl(vehicle.vehiclePhoto)
    : vehicle.vehiclePhoto || '';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Cargando tu alta…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.topBar}>
        <Pressable onPress={goBack} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Ser conductor</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        {step === 'gate' && (
          <View style={s.block}>
            <ShieldCheck size={44} color={colors.primary} />
            <Text style={s.big}>Necesitas una cuenta</Text>
            <Text style={s.body}>Para ser conductor primero crea tu cuenta (términos → teléfono → código → contraseña). Luego continúas con los documentos paso a paso.</Text>
            <PrimaryButton title="Crear cuenta / Iniciar sesión" onPress={() => router.push('/auth')} />
          </View>
        )}

        {step === 'docs' && cat && (
          <View style={s.block}>
            {/* Progreso */}
            <View style={s.stepsRow}>
              {cats.map((c, i) => {
                const done = c.docs.every((d) => !d.isRequired || d.submitted);
                return (
                  <View key={c.code} style={[s.stepDot, { backgroundColor: i < catIdx || done ? colors.primary : colors.border }]}>
                    {CATEGORY_ICONS[c.code]}
                  </View>
                );
              })}
              <View style={[s.stepDot, { backgroundColor: colors.border }]}><ShieldCheck size={16} color={brand.white} /></View>
            </View>
            <Text style={s.body}>Paso {catIdx + 1} de {cats.length + 1}</Text>

            <Text style={s.big}>{cat.title}</Text>

            {/* Nacionalidad: el permiso de residencia depende de ella */}
            <View style={[s.vehicleBox, { borderColor: colors.border }]}>
              <Text style={s.label}>¿Eres ecuatoguineano?</Text>
              <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                {([['national', 'Sí'], ['foreign', 'No (extranjero)']] as const).map(([v, l]) => (
                  <Pressable key={v} onPress={() => setNationality(v)} style={[s.chip, { borderColor: nationality === v ? colors.primary : colors.border }]}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {nationality === 'foreign' && (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}>
                  Como extranjero, el permiso de residencia y trabajo es obligatorio.
                </Text>
              )}
            </View>

            {/* Datos del vehículo (solo en el paso vehículo) */}
            {cat.code === 'vehiculo' && (
              <View style={[s.vehicleBox, { borderColor: colors.border }]}>
                <Text style={s.label}>Datos del vehículo</Text>
                <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                  {['car', 'van', 'truck'].map((t) => (
                    <Pressable key={t} onPress={() => setVehicle((v) => ({ ...v, vehicleType: t }))} style={[s.chip, { borderColor: vehicle.vehicleType === t ? colors.primary : colors.border }]}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{t === 'car' ? 'Coche' : t === 'van' ? 'Furgoneta' : 'Camión'}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* P1a: COLOR del coche (obligatorio) */}
                <Text style={s.label}>Color del coche *</Text>
                <View style={s.colorRow}>
                  {CAR_COLORS.map((c) => {
                    const active = vehicle.vehicleColor === c.label;
                    return (
                      <Pressable
                        key={c.label}
                        onPress={() => setVehicle((v) => ({ ...v, vehicleColor: c.label }))}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={`Color ${c.label}`}
                        style={[s.colorChip, { borderColor: active ? colors.primary : colors.border }]}
                      >
                        <View style={[s.colorDot, { backgroundColor: c.hex, borderColor: c.hex === '#F5F5F5' ? '#D0D4DA' : 'transparent' }]} />
                        <Text style={[s.colorTxt, { color: active ? colors.primary : colors.textSecondary }]} numberOfLines={1}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* P1a: FOTO REAL del coche (obligatoria, 1 foto) */}
                <Text style={s.label}>Foto real del coche *</Text>
                {vehiclePhotoPreview ? (
                  <View style={{ gap: espaciado.e6 }}>
                    <Image style={[s.vehiclePreview, { borderColor: colors.border }]} source={{ uri: vehiclePhotoPreview }} resizeMode="cover" />
                    <GhostButton title="Cambiar foto" onPress={() => setCapturing({ code: 'vehicle_photo', side: 'front', label: 'Foto real del coche' })} />
                  </View>
                ) : (
                  <Pressable onPress={() => setCapturing({ code: 'vehicle_photo', side: 'front', label: 'Foto real del coche' })} style={[s.docRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.docLabel, { color: colors.textPrimary }]}>Subir / fotografiar el coche</Text>
                      <Text style={[s.docNote, { color: colors.textSecondary }]}>Una foto de tu coche real (se mostrará al pasajero).</Text>
                    </View>
                    <Camera size={20} color={colors.primary} />
                  </Pressable>
                )}
                {vehicle.vehiclePhoto.startsWith('captured://') && (
                  <Text style={{ fontSize: tipografia.micro, color: colors.secondary, fontWeight: '700' }}>
                    ⚠️ Captura de prueba (sin cámara real). En el dispositivo se tomará la foto real.
                  </Text>
                )}

                <FormField label="Placa" placeholder="GQ-123-AB" value={vehicle.vehiclePlate} onChangeText={(t) => setVehicle((v) => ({ ...v, vehiclePlate: t }))} />
                <FormField label="Modelo" placeholder="Toyota Corolla" value={vehicle.vehicleModel} onChangeText={(t) => setVehicle((v) => ({ ...v, vehicleModel: t }))} />
                <FormField label="Nº de licencia" placeholder="GE-123456" value={vehicle.licenseNumber} onChangeText={(t) => setVehicle((v) => ({ ...v, licenseNumber: t }))} />
              </View>
            )}

            {/* Lista de documentos de la categoría */}
            {cat.docs.map((d) => {
              const done = docDone(d);
              const req = effectiveRequired(d);
              return (
                <View key={d.code}>
                  <Pressable onPress={() => openCapture(d)} style={[s.docRow, { borderColor: colors.border, backgroundColor: done ? colors.success + '14' : colors.card }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                        <Text style={[s.docLabel, { color: colors.textPrimary }]}>{d.label}</Text>
                        <View style={[s.badge, { backgroundColor: req ? colors.danger + '22' : colors.border }]}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: req ? colors.danger : colors.textSecondary }}>
                            {req ? 'OBLIGATORIO' : d.code === 'residence_permit' ? 'OPCIONAL (solo extranjeros)' : 'OPCIONAL'}
                          </Text>
                        </View>
                      </View>
                      {d.note && <Text style={[s.docNote, { color: colors.textSecondary }]}>{d.note}</Text>}
                      <Text style={{ color: done ? colors.success : colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginTop: espaciado.e2 }}>
                        {done ? `✓ ${d.photos === 2 ? 'frente + reverso' : 'foto'}` : 'Toca para fotografiar'}
                      </Text>
                    </View>
                    <Camera size={20} color={done ? colors.success : colors.primary} />
                  </Pressable>
                  {d.hasExpiry && (
                    <FormField
                      label="Fecha de caducidad (AAAA-MM-DD)"
                      placeholder="2028-08-31"
                      value={expiries[d.code] ?? d.expiresAt?.slice(0, 10) ?? ''}
                      onChangeText={(t) => setExpiries((p) => ({ ...p, [d.code]: t }))}
                    />
                  )}
                </View>
              );
            })}

            {error ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={error} /></View> : null}

            <PrimaryButton
              title={busy ? 'Guardando…' : 'Continuar'}
              onPress={saveStep}
              disabled={!allDone}
              loading={busy}
            />
            {!allDone && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', fontWeight: peso.medio }}>
                {cat.code === 'vehiculo'
                  ? 'Completa los datos del vehículo: placa, modelo, color y foto real del coche + documentos OBLIGATORIOS.'
                  : 'Completa los documentos OBLIGATORIOS para continuar'}
              </Text>
            )}
          </View>
        )}

        {step === 'selfie' && (
          <View style={s.block}>
            <ShieldCheck size={44} color={colors.primary} />
            <Text style={s.big}>Selfie de identidad</Text>
            <Text style={s.body}>Último paso: una selfie para confirmar tu identidad (la usarás también para ponerte en línea).</Text>
            {capturing ? (
              <View style={s.cameraBox}>
                <CameraCapture variant="selfie" instruction="Mira a la cámara" onCapture={submitSelfie} />
              </View>
            ) : (
              <PrimaryButton title="Tomar selfie" onPress={() => setCapturing({ code: 'selfie', side: 'front', label: 'Selfie de identidad' })} loading={busy} />
            )}
            {error ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={error} /></View> : null}
          </View>
        )}

        {step === 'pending' && (
          <View style={[s.block, { alignItems: 'center' }]}>
            <CheckCircle2 size={48} color={colors.success} />
            <Text style={s.big}>En revisión</Text>
            <Text style={s.body}>Tu alta (documentos + selfie) ha sido enviada. El administrador la revisará; te avisaremos cuando estés aprobado para ponerte en línea.</Text>
            <GhostButton title="Volver al inicio" onPress={() => router.replace('/')} />
          </View>
        )}

        {/* Cámara de captura (documento) */}
        {capturing && step === 'docs' && (
          <View style={s.cameraBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: espaciado.e6 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>{capturing.label}</Text>
              <Pressable onPress={() => setCapturing(null)} hitSlop={10}>
                <Text style={{ color: colors.danger, fontWeight: '800' }}>Cancelar</Text>
              </Pressable>
            </View>
            <CameraCapture
              variant="document"
              instruction={capturing.code === 'vehicle_photo' ? 'Enmarca tu coche completo' : 'Centra el documento en el marco'}
              onCapture={onCapture}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    content: { padding: espaciado.e20, gap: espaciado.e16 },
    block: { gap: espaciado.e12 },
    big: { fontSize: tipografia.title, fontWeight: '900', color: c.textPrimary, textAlign: 'center' },
    body: { fontSize: tipografia.body, lineHeight: 20, color: c.textSecondary, textAlign: 'center', fontWeight: peso.medio },
    label: { fontSize: tipografia.caption, fontWeight: '700', color: c.textSecondary },
    stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: espaciado.e10 },
    stepDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    vehicleBox: { gap: espaciado.e10, borderWidth: 1.5, borderRadius: radios.lg, padding: espaciado.e14 },
    chip: { flex: 1, borderRadius: radios.md, borderWidth: 1.5, paddingVertical: espaciado.e10, alignItems: 'center' },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 },
    colorChip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, borderRadius: radios.full, borderWidth: 1.2, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6 },
    colorDot: { width: 16, height: 16, borderRadius: radios.sm, borderWidth: 1 },
    colorTxt: { fontSize: tipografia.caption, fontWeight: '800', maxWidth: 74 },
    vehiclePreview: { height: 150, borderRadius: 14, borderWidth: 1 },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: 1.5, borderRadius: 14, padding: espaciado.e12 },
    docLabel: { fontSize: tipografia.body, fontWeight: '800', flexShrink: 1 },
    docNote: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e2 },
    badge: { paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e2, borderRadius: 6 },
    cameraBox: { borderRadius: 20, overflow: 'hidden', height: 380 },
  });
