/**
 * lifebook-hotel-habitacion — ALTA Y EDICIÓN DE UN TIPO DE HABITACIÓN (con fotos).
 *
 * Es la pantalla que faltaba para que el hotelero no dependa de nadie: el servidor sabía
 * crear y editar tipos de habitación desde la Parte 42, pero **ninguna pantalla lo llamaba**.
 *
 * Decisiones que no son obvias y por qué:
 *
 *   · **Las fotos van por el camino de la Parte 41** (`uploadImageReal`), no por el subidor
 *     antiguo de la app. El antiguo guarda en `covers/…` y no registra la subida en
 *     `media_uploads`, así que el servidor del hotel la rechaza con `IMAGE_INVALID`: la
 *     habitación no se podría guardar con fotos. Comprobado contra el servidor.
 *   · **Los números se escriben como texto y se convierten al guardar.** Si se convierten al
 *     escribir, un campo a medio borrar se vuelve `NaN` y el servidor recibe basura.
 *   · **Se avisa de la moderación**: una habitación nace `pending` y **no se puede reservar**
 *     hasta que la administración la apruebe. Si eso no se dice, el hotelero cree que ya
 *     está a la venta y no entiende por qué no le llegan reservas.
 *   · **Al editar se manda solo lo que cambia** (`updateRoom` es parcial) y, si se tocan las
 *     fotos, la lista COMPLETA: el servidor reemplaza, no mezcla.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, type HotelRoom } from '../api/hotel';
import { uploadImageReal } from '../api/mediaReal';
import { ApiError } from '../api/httpClient';
import { pickImagesFromLibrary } from '../core/pickImage';
import { xaf } from '../utils/datetime';

/** Los servicios que el servidor acepta (mismos identificadores, en castellano). */
const SERVICIOS: { id: string; label: string }[] = [
  { id: 'wifi', label: 'Wi-Fi' }, { id: 'aire', label: 'Aire acondicionado' },
  { id: 'tv', label: 'Televisión' }, { id: 'nevera', label: 'Nevera' },
  { id: 'agua_caliente', label: 'Agua caliente' }, { id: 'desayuno', label: 'Desayuno' },
  { id: 'cocina', label: 'Cocina' }, { id: 'terraza', label: 'Terraza' },
  { id: 'caja_fuerte', label: 'Caja fuerte' }, { id: 'adaptado', label: 'Adaptado' },
];

const TIPOS_CAMA = ['individual', 'doble', 'matrimonial', 'queen', 'king', 'litera', 'sofa_cama'];
const ETIQUETA_CAMA: Record<string, string> = {
  individual: 'Individual', doble: 'Doble', matrimonial: 'Matrimonial',
  queen: 'Queen', king: 'King', litera: 'Litera', sofa_cama: 'Sofá cama',
};

const MAX_FOTOS = 12;

export default function HabitacionScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

function Contenido() {
  useScreenGuard();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{ id?: string }>();
  const editando = !!p.id;

  const [cargando, setCargando] = useState(editando);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  // Campos de texto (los números también: se convierten al guardar)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [totalUnits, setTotalUnits] = useState('1');
  const [sizeM2, setSizeM2] = useState('');
  const [basePriceXaf, setBasePriceXaf] = useState('');
  const [weekendPriceXaf, setWeekendPriceXaf] = useState('');
  const [cleaningFeeXaf, setCleaningFeeXaf] = useState('0');
  const [taxesXaf, setTaxesXaf] = useState('0');
  const [minNights, setMinNights] = useState('1');
  const [maxNights, setMaxNights] = useState('30');
  const [depositPercent, setDepositPercent] = useState('30');
  const [holdMinutes, setHoldMinutes] = useState('20');
  const [confirmationHours, setConfirmationHours] = useState('24');
  const [cancellationHours, setCancellationHours] = useState('48');
  const [isActive, setIsActive] = useState(true);
  const [beds, setBeds] = useState<{ kind: string; count: number }[]>([{ kind: 'doble', count: 1 }]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    if (!editando) return;
    setCargando(true);
    try {
      // Se lee de `my/room-types` (no de la ficha pública): así una habitación todavía
      // en revisión o apagada también se puede editar, que es justo cuando hace falta.
      const out = await hotelApi.myRooms();
      const r: HotelRoom | undefined = (out.rooms ?? []).find((x) => x.id === p.id);
      if (!r) { setError('Esa habitación no está entre las tuyas.'); return; }
      setName(r.name);
      setDescription(r.description ?? '');
      setCapacity(String(r.capacity));
      setTotalUnits(String(r.totalUnits));
      setSizeM2(r.sizeM2 ? String(r.sizeM2) : '');
      setBasePriceXaf(String(r.basePriceXaf));
      setWeekendPriceXaf(r.weekendPriceXaf ? String(r.weekendPriceXaf) : '');
      setCleaningFeeXaf(String(r.cleaningFeeXaf ?? 0));
      setTaxesXaf(String(r.taxesXaf ?? 0));
      setMinNights(String(r.minNights));
      setMaxNights(String(r.maxNights));
      setDepositPercent(String(r.depositPercent));
      setHoldMinutes(String(r.holdMinutes));
      setConfirmationHours(String(r.confirmationHours));
      setCancellationHours(String(r.cancellationHours));
      setIsActive(!!r.isActive);
      setBeds(r.beds?.length ? r.beds : [{ kind: 'doble', count: 1 }]);
      setAmenities(r.amenities ?? []);
      setFotos((r.images ?? []).map((im) => im.url).filter(Boolean));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la habitación.');
    } finally {
      setCargando(false);
    }
  }, [editando, p.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  const anadirFotos = async () => {
    if (subiendo) return;
    const hueco = MAX_FOTOS - fotos.length;
    if (hueco <= 0) { Alert.alert('Fotos', `El máximo es ${MAX_FOTOS} fotos por habitación.`); return; }
    try {
      const elegidas = await pickImagesFromLibrary(hueco);
      if (!elegidas.length) return;
      setSubiendo(true);
      const subidas: string[] = [];
      for (const img of elegidas) {
        // Una a una: si una falla, las demás quedan subidas y se dice cuál falló.
        try {
          subidas.push(await uploadImageReal({ uri: img.uri, mimeType: 'image/jpeg' }));
        } catch (e) {
          Alert.alert('No se pudo subir una foto', e instanceof ApiError ? e.message : 'Inténtalo otra vez.');
        }
      }
      if (subidas.length) setFotos((prev) => [...prev, ...subidas].slice(0, MAX_FOTOS));
    } catch (e) {
      Alert.alert('Fotos', e instanceof Error ? e.message : 'No se pudieron elegir las fotos');
    } finally {
      setSubiendo(false);
    }
  };

  const quitarFoto = (url: string) => setFotos((prev) => prev.filter((u) => u !== url));

  const num = (v: string): number | null => {
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  /** Comprobaciones en el cliente, con el mismo límite que el servidor. */
  const problema = useMemo((): string | null => {
    const n = name.trim();
    if (n.length < 3) return 'El nombre necesita al menos 3 letras.';
    /*
      Regla de cumplimiento de la plataforma (documento de diseño, §J.3): está prohibido que el
      nombre del tipo de habitación lleve publicidad, teléfonos o enlaces. Se comprueba aquí
      para que el hotelero no publique algo que le van a rechazar en la revisión.
      Ojo con el patrón: pide 8 dígitos seguidos (o separados por espacios/guiones) para NO
      confundirse con un número de habitación («Habitación doble 094203» es válido).
    */
    if (/https?:\/\/|www\.|\.com\b|@\w+\./i.test(n)) return 'El nombre no puede llevar enlaces ni correos.';
    if (/\+?\d[\d\s.-]{6,}\d/.test(n)) return 'El nombre no puede llevar un teléfono: la plataforma lo rechaza (va en la ficha del hotel).';
    const cap = num(capacity); if (cap === null || cap < 1 || cap > 30) return 'La capacidad tiene que ser entre 1 y 30 personas.';
    const u = num(totalUnits); if (u === null || u < 1 || u > 200) return 'Tiene que haber al menos 1 habitación de este tipo (máximo 200).';
    const base = num(basePriceXaf); if (base === null || base < 1) return 'Indica el precio por noche en XAF.';
    const wd = weekendPriceXaf.trim() ? num(weekendPriceXaf) : null;
    if (weekendPriceXaf.trim() && (wd === null || wd < 1)) return 'El precio de fin de semana no es válido (o déjalo vacío).';
    const mn = num(minNights); if (mn === null || mn < 1 || mn > 90) return 'La estancia mínima tiene que ser entre 1 y 90 noches.';
    const mx = num(maxNights); if (mx === null || mx < 1 || mx > 365) return 'La estancia máxima tiene que ser entre 1 y 365 noches.';
    if (mx < mn) return 'La estancia máxima no puede ser menor que la mínima.';
    const dep = num(depositPercent); if (dep === null || dep < 0 || dep > 100) return 'La señal tiene que estar entre 0 y 100 %.';
    const hold = num(holdMinutes); if (hold === null || hold < 5 || hold > 120) return 'La retención tiene que ser entre 5 y 120 minutos.';
    const conf = num(confirmationHours); if (conf === null || conf < 1 || conf > 168) return 'Las horas para confirmar tienen que ser entre 1 y 168.';
    const canc = num(cancellationHours); if (canc === null || canc < 0 || canc > 720) return 'Las horas de cancelación gratis tienen que ser entre 0 y 720.';
    if (!beds.length || beds.some((b) => !b.kind || b.count < 1 || b.count > 20)) return 'Cada línea de camas necesita un tipo y entre 1 y 20.';
    const limp = num(cleaningFeeXaf); if (limp === null || limp < 0) return 'La limpieza no puede ser negativa.';
    const tax = num(taxesXaf); if (tax === null || tax < 0) return 'Las tasas no pueden ser negativas.';
    if (sizeM2.trim()) { const s = num(sizeM2); if (s === null || s < 4 || s > 2000) return 'La superficie tiene que ser entre 4 y 2000 m².'; }
    return null;
  }, [name, capacity, totalUnits, basePriceXaf, weekendPriceXaf, minNights, maxNights,
      depositPercent, holdMinutes, confirmationHours, cancellationHours, beds, cleaningFeeXaf, taxesXaf, sizeM2]);

  const guardar = async () => {
    const fallo = problema;
    if (fallo) { Alert.alert('Revisa los datos', fallo); return; }
    setGuardando(true);
    try {
      const dto: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        capacity: num(capacity), totalUnits: num(totalUnits),
        sizeM2: sizeM2.trim() ? num(sizeM2) : null,
        basePriceXaf: num(basePriceXaf),
        weekendPriceXaf: weekendPriceXaf.trim() ? num(weekendPriceXaf) : null,
        cleaningFeeXaf: num(cleaningFeeXaf), taxesXaf: num(taxesXaf),
        minNights: num(minNights), maxNights: num(maxNights),
        depositPercent: num(depositPercent), holdMinutes: num(holdMinutes),
        confirmationHours: num(confirmationHours), cancellationHours: num(cancellationHours),
        isActive,
        beds: beds.map((b) => ({ kind: b.kind, count: b.count })),
        amenities,
        images: fotos,
      };
      if (editando) {
        await hotelApi.updateRoom(String(p.id), dto);
        Alert.alert('Guardado', 'Los cambios ya están en la ficha.', [
          { text: 'Vale', onPress: () => router.back() },
        ]);
      } else {
        const out = await hotelApi.createRoom(dto);
        const pendiente = out.room?.productStatus !== 'active';
        Alert.alert(
          'Habitación creada',
          pendiente
            ? 'Queda **en revisión**: la administración tiene que aprobarla antes de que se pueda reservar. Mientras tanto puedes preparar sus precios y cerrar fechas.'
            : 'Ya está publicada.',
          [{ text: 'Vale', onPress: () => router.back() }],
        );
      }
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof ApiError ? e.message : 'Inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={10} style={styles.volver}>
          <Text style={{ color: colors.textPrimary, fontSize: 30, lineHeight: 32 }}>‹</Text>
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo, flex: 1 }}>
          {editando ? 'Editar habitación' : 'Nueva habitación'}
        </Text>
      </View>

      {error ? (
        <View style={{ padding: espaciado.e16 }}>
          <Text style={{ color: colors.textSecondary, marginBottom: espaciado.e12 }}>{error}</Text>
          <GhostButton title="Volver" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">

          <Bloque titulo="Lo que se vende" hint="El nombre y lo que cabe. Es lo que verá el huésped en la lista.">
            <FormField label="Nombre" value={name} onChangeText={setName} placeholder="Doble con aire" maxLength={120} />
            <Contador actual={name.length} max={120} />
            <View style={{ height: 10 }} />
            <FormField
              label="Descripción (opcional)" value={description} onChangeText={setDescription}
              placeholder="Dos camas, aire acondicionado, vistas al mar…" maxLength={2000} multiline
            />
            {/* El servidor guarda 2000 caracteres y el resto lo tira sin avisar. */}
            <Contador actual={description.length} max={2000} />
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Capacidad (personas)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholder="2" />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Superficie (m²)" value={sizeM2} onChangeText={setSizeM2} keyboardType="number-pad" placeholder="18" />
              </View>
            </View>
          </Bloque>

          <Bloque titulo="Camas" hint="Se pueden combinar: una doble y una litera, por ejemplo.">
            {beds.map((b, i) => (
              <View key={`${b.kind}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>
                    {TIPOS_CAMA.map((t) => {
                      const on = b.kind === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setBeds((prev) => prev.map((x, j) => (j === i ? { ...x, kind: t } : x)))}
                          style={[styles.chip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                        >
                          <Text style={{ color: on ? brand.white : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                            {ETIQUETA_CAMA[t] ?? t}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
                <Pressable
                  onPress={() => setBeds((prev) => prev.map((x, j) => (j === i ? { ...x, count: Math.max(1, x.count - 1) } : x)))}
                  style={[styles.paso, { borderColor: colors.border }]}
                ><Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: peso.titulo }}>−</Text></Pressable>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, minWidth: 16, textAlign: 'center' }}>{b.count}</Text>
                <Pressable
                  onPress={() => setBeds((prev) => prev.map((x, j) => (j === i ? { ...x, count: Math.min(20, x.count + 1) } : x)))}
                  style={[styles.paso, { borderColor: colors.border }]}
                ><Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: peso.titulo }}>+</Text></Pressable>
                {beds.length > 1 ? (
                  <Pressable onPress={() => setBeds((prev) => prev.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Quitar esta línea de camas">
                    <X size={18} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <GhostButton title="Añadir otra cama" onPress={() => setBeds((prev) => [...prev, { kind: 'individual', count: 1 }])} />
          </Bloque>

          <Bloque titulo="Precio y dinero" hint="El precio por noche es por habitación, no por persona. La señal la paga el huésped al reservar.">
            <FormField label="Precio por noche (XAF)" value={basePriceXaf} onChangeText={setBasePriceXaf} keyboardType="number-pad" placeholder="25000" />
            <View style={{ height: 10 }} />
            <FormField
              label="Precio de fin de semana (opcional)" value={weekendPriceXaf} onChangeText={setWeekendPriceXaf}
              keyboardType="number-pad" placeholder="Se usa los viernes y sábados"
            />
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Limpieza (XAF)" value={cleaningFeeXaf} onChangeText={setCleaningFeeXaf} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Tasas (XAF)" value={taxesXaf} onChangeText={setTaxesXaf} keyboardType="number-pad" />
              </View>
            </View>
            <View style={{ height: 10 }} />
            <FormField
              label="Señal (%)" value={depositPercent} onChangeText={setDepositPercent} keyboardType="number-pad"
              placeholder="30"
            />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e5, marginLeft: espaciado.e4 }}>
              Es la parte que se paga al reservar. Con 0, la reserva se paga entera al llegar.
            </Text>
          </Bloque>

          <Bloque titulo="Estancia y plazos" hint="Cuántas noches como mínimo, y cuánto tiempo se guarda una reserva sin pagar.">
            <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Mínimo de noches" value={minNights} onChangeText={setMinNights} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Máximo de noches" value={maxNights} onChangeText={setMaxNights} keyboardType="number-pad" />
              </View>
            </View>
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Retención (min)" value={holdMinutes} onChangeText={setHoldMinutes} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Horas para confirmar" value={confirmationHours} onChangeText={setConfirmationHours} keyboardType="number-pad" />
              </View>
            </View>
            <View style={{ height: 10 }} />
            <FormField
              label="Horas de cancelación gratis" value={cancellationHours} onChangeText={setCancellationHours}
              keyboardType="number-pad"
            />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e5, marginLeft: espaciado.e4 }}>
              Hasta cuántas horas antes de la entrada el huésped puede cancelar sin coste. Lo calcula el servidor.
            </Text>
          </Bloque>

          <Bloque titulo="Fotos" hint="La primera es la portada. Una habitación sin fotos no se elige.">
            {/*
              La plataforma pide un MÍNIMO DE 3 FOTOS REALES para dar de alta un tipo de
              habitación desde la app (documento de diseño, §J.3), y en la lista de resultados la
              foto es lo que decide el clic (§C.2). No se bloquea el guardado —hay habitaciones
              ya creadas con menos— pero se dice claramente cuántas faltan.
            */}
            {fotos.length < 3 ? (
              <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginBottom: espaciado.e10, lineHeight: 18 }}>
                ⚠ {fotos.length === 0
                  ? 'Sin fotos: una habitación sin fotos casi no se reserva.'
                  : `Con ${fotos.length} foto(s) se nota la falta: lo recomendado son 3 o más.`}
                {' '}Mejor la fachada o la habitación entera, con luz.
              </Text>
            ) : (
              <Text style={{ color: colors.success, fontSize: tipografia.caption, fontWeight: peso.maximo, marginBottom: espaciado.e10 }}>
                ✓ {fotos.length} fotos: la primera es la que se ve en la lista de resultados.
              </Text>
            )}
            {fotos.length ? (
              <View style={styles.rejilla}>
                {fotos.map((url, i) => (
                  <View key={url} style={styles.miniatura}>
                    <Image source={{ uri: url }} style={styles.foto} contentFit="cover" transition={0} />
                    {i === 0 ? (
                      <View style={[styles.portada, { backgroundColor: colors.primary }]}>
                        <Text style={{ color: brand.white, fontSize: 9, fontWeight: peso.titulo }}>PORTADA</Text>
                      </View>
                    ) : null}
                    <Pressable onPress={() => quitarFoto(url)} style={styles.quitarFoto} accessibilityLabel="Quitar esta foto" hitSlop={10}>
                      <X size={15} color={brand.white} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <GhostButton
              title={subiendo ? 'Subiendo…' : `Añadir fotos (${fotos.length}/${MAX_FOTOS})`}
              onPress={() => void anadirFotos()}
              disabled={subiendo}
            />
          </Bloque>

          <Bloque titulo="Servicios de la habitación" hint="Opcional. Marca lo que tiene de verdad.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
              {SERVICIOS.map((s) => {
                const on = amenities.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setAmenities((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                    style={[styles.chip, { backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                  >
                    <Text style={{ color: on ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                      {on ? '✓ ' : ''}{s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Bloque>

          <Bloque titulo="Disponibilidad" hint="Apagada = fuera del catálogo. Las reservas que ya tengas siguen en pie.">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1, paddingRight: espaciado.e12 }}>
                {isActive ? 'A la venta' : 'Apagada'}
              </Text>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: alpha(colors.primary, 0.5) }} />
            </View>
          </Bloque>

          <View style={[styles.resumen, { backgroundColor: alpha(colors.primary, 0.07), borderColor: alpha(colors.primary, 0.22) }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
              {name.trim() || 'Sin nombre'} · {xaf(num(basePriceXaf) ?? 0)} por noche
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4, lineHeight: 17 }}>
              {num(totalUnits) ?? 1} habitación(es) de este tipo · mínimo {num(minNights) ?? 1} noche(s) ·
              {' '}señal del {num(depositPercent) ?? 0}% · {fotos.length} foto(s)
            </Text>
          </View>

          {problema ? (
            <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e10 }}>⚠️ {problema}</Text>
          ) : null}

          <View style={{ marginTop: espaciado.e14 }}>
            <PrimaryButton
              title={editando ? 'Guardar los cambios' : 'Crear la habitación'}
              onPress={() => void guardar()}
              loading={guardando}
              disabled={!!problema || subiendo}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Bloque({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: espaciado.e20 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginBottom: espaciado.e3 }}>{titulo}</Text>
      {hint ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>{hint}</Text> : <View style={{ height: 7 }} />}
      {children}
    </View>
  );
}

/**
 * Contador de caracteres.
 *
 * El servidor RECORTA en silencio: `clean(dto.name, 120)` y `clean(dto.description, 2000)`
 * guardan lo que cabe y tiran el resto. Sin contador, el hotelero escribe de más, la app lo
 * manda, el servidor guarda la mitad y **nadie se lo dice**. Se avisa a partir de 40
 * caracteres restantes, no solo al llegar al tope.
 */
function Contador({ actual, max }: { actual: number; max: number }) {
  const { colors } = useTheme();
  const quedan = max - actual;
  return (
    <Text
      style={{
        color: quedan <= 40 ? colors.secondary : colors.textSecondary,
        fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6, marginLeft: espaciado.e4,
      }}
      accessibilityLiveRegion="polite"
    >
      {quedan <= 40 ? `Te quedan ${quedan} caracteres` : `${actual} de ${max}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e4,
    paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 40, height: 34, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1.5, borderRadius: radios.full, paddingHorizontal: espaciado.e13, minHeight: 44, justifyContent: 'center' },
  paso: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginBottom: espaciado.e10 },
  miniatura: { width: 96, height: 96, borderRadius: radios.md, overflow: 'hidden' },
  foto: { width: '100%', height: '100%' },
  portada: { position: 'absolute', left: 0, bottom: 0, paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e3, borderTopRightRadius: 8 },
  // Círculo visible pequeño + `hitSlop` para llegar a los 44 px de objetivo táctil sin
  // comerse la foto: el círculo de antes (22 px) se fallaba con el dedo.
  quitarFoto: {
    position: 'absolute', right: 4, top: 4, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  resumen: { borderWidth: 1, borderRadius: 14, padding: espaciado.e12, marginTop: espaciado.e4 },
});
