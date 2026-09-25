/**
 * FoodRiderScreen — Perfil y entregas del repartidor (Comida Rápida).
 * Requisitos (KYC + datos + aprobación admin), alta/edición, "Mis entregas"
 * con avanzar estado (picked_up → in_transit → delivered).
 *
 * Auditoría senior (2026-09-02):
 *  · Contactos operativos del rider asignado: teléfono del restaurante y del
 *    cliente (acceso por rol, solo sus entregas) con botón de llamada.
 *  · Estados de entrega SIEMPRE en español; flujo en constante (RIDER_NEXT).
 *  · Confirmación antes de avanzar + busy por entrega + busyRef.
 *  · Recarga al volver a la pantalla (focus) + pull-to-refresh.
 *  · Contador "X entregas completadas" (sin inventar montos; modelo de pago al
 *    rider queda pendiente de su ronda de monetización).
 *  · Carga skeleton / error + Reintentar; vacíos diferenciados; KYC CTA.
 *  · KeyboardAvoidingView + SafeArea + a11y.
 * Ruta: /food-rider
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, MapPin, Navigation, Phone, XCircle } from 'lucide-react-native';
import {FormField, PrimaryButton, ScreenHeader, alpha, espaciado, neutro, peso, radios, tipografia, trazo, useTheme} from '@egrouteplan/ui-kit';
import { foodApi, FoodDelivery, FoodRiderMe, ContabilidadRepartidor } from '../api/food';
import { getGqPositionIfAllowed } from '../api/locate';
import { formatXAF } from '../utils/formatHelpers';
import { abrirMapa } from '../utils/maps';
import { brand } from '@egrouteplan/ui-kit';

const ACCENT = brand.primary; // A1: la acción avanza en azul
const STATUS_LABEL: Record<string, string> = { pending: 'En revisión', active: 'Activo', rejected: 'Rechazado' };
const VEHICLE_LABEL: Record<string, string> = { moto: '🛵 Moto', bici: '🚲 Bici', coche: '🚗 Coche' };
const DELIVERY_LABEL: Record<string, string> = {
  assigned: 'Asignada', picked_up: 'Recogido', in_transit: 'En camino', delivered: 'Entregado',
};
// Flujo del rider (única fuente; espejo del backend).
const RIDER_NEXT: Record<string, { next: string | null; btn: string; confirm: string }> = {
  assigned: { next: 'picked_up', btn: '📦 Recogí el pedido', confirm: 'Confirma que ya recogiste el pedido en el restaurante.' },
  picked_up: { next: 'in_transit', btn: '🛵 En camino', confirm: 'Marca el pedido como en camino hacia el cliente.' },
  in_transit: { next: 'delivered', btn: '✅ Entregado', confirm: 'Confirma que entregaste el pedido al cliente.' },
  delivered: { next: null, btn: '', confirm: '' },
};

/**
 * Llevar al repartidor al punto de entrega. Vive en `utils/maps.ts` porque la pantalla del cliente
 * necesita exactamente lo mismo para enseñar el punto de encuentro: dos copias serían dos sitios donde
 * arreglar el mismo fallo.
 */

export default function FoodRiderScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<FoodRiderMe | null>(null);
  const [name, setName] = useState('');
  const [vehicle, setVehicle] = useState<'moto' | 'bici' | 'coche'>('moto');
  const [zone, setZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySave, setBusySave] = useState(false);
  const [busyDeliveryId, setBusyDeliveryId] = useState<string | null>(null);
  // ── El dinero del repartidor ──────────────────────────────────────────────────
  // `contab` es su semana (entregas, comisiones, efectivo y lo que se le pagará). `cobroDe` guarda
  // en qué entrega está escribiendo el efectivo, porque el importe se anota EN LÍNEA (en Android no
  // existe `Alert.prompt`, y con un diálogo de texto el repartidor se quedaría sin poder anotarlo).
  const [contab, setContab] = useState<ContabilidadRepartidor | null>(null);
  const [cobroDe, setCobroDe] = useState<string | null>(null);
  const [cobroTexto, setCobroTexto] = useState('');
  // ── DÓNDE ENTREGAR Y DÓNDE SE ENCUENTRAN ─────────────────────────────────────
  // El repartidor necesita dos cosas que la dirección de texto no da: llegar (mapa) y encontrarse con
  // el cliente en sitios que no son una dirección — un hotel, viviendas sociales, un portal sin número.
  // `puntoDe` guarda en qué entrega está escribiendo el punto de encuentro; el resto va EN LÍNEA por la
  // misma razón que el efectivo: en Android no hay diálogo con campo de texto.
  const [puntoDe, setPuntoDe] = useState<string | null>(null);
  const [puntoTexto, setPuntoTexto] = useState('');
  const [puntoCoords, setPuntoCoords] = useState<[number, number] | null>(null);   // [lng, lat]
  const [puntoUbicando, setPuntoUbicando] = useState(false);
  const busySaveRef = useRef(false);
  const busyAdvanceRef = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'quiet' = 'initial') => {
    if (mode === 'initial') { setLoading(true); setError(null); }
    if (mode === 'refresh') setRefreshing(true);
    try {
      const m = await foodApi.riderMe();
      setMe(m);
      if (m.rider) {
        setName(m.rider.fullName);
        setVehicle(m.rider.vehicleType as 'moto' | 'bici' | 'coche');
        setZone(m.rider.zone ?? '');
      }
      setError(null);
      // La contabilidad de la semana va aparte y NUNCA puede tumbar la pantalla: si falla, el
      // repartidor sigue viendo sus entregas y solo se queda sin el bloque del dinero. (Un fallo de
      // la parte nueva no puede dejar sin trabajo a quien tiene que repartir.)
      try {
        if (m.rider?.status === 'active') setContab(await foodApi.riderContabilidad());
      } catch { /* sin contabilidad, pero con entregas */ }
    } catch {
      if (mode === 'initial') setError('No pudimos cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Al volver a la pantalla se refrescan las entregas (pueden asignarte una).
  useFocusEffect(
    useCallback(() => { if (me) { load('quiet'); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]),
  );

  const save = async () => {
    if (busySaveRef.current) return;
    if (name.trim().length < 2) { Alert.alert('Faltan datos', 'Pon tu nombre completo (mín. 2 letras).'); return; }
    busySaveRef.current = true;
    setBusySave(true);
    try {
      const r = await foodApi.upsertRider({ fullName: name.trim(), vehicleType: vehicle, zone: zone.trim() || undefined });
      Alert.alert('Solicitud enviada', r.message);
      await load('quiet');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      busySaveRef.current = false;
      setBusySave(false);
    }
  };

  const requestAdvance = (d: FoodDelivery) => {
    if (busyAdvanceRef.current) return;
    const meta = RIDER_NEXT[d.status];
    if (!meta?.next) return;
    Alert.alert(meta.btn.replace(/^[^\s]+\s/, ''), meta.confirm, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, continuar', onPress: () => advance(d.orderId, meta.next!) },
    ]);
  };

  const advance = async (orderId: string, nextStatus: string) => {
    if (busyAdvanceRef.current) return;
    busyAdvanceRef.current = true;
    setBusyDeliveryId(orderId);
    try {
      const r = await foodApi.updateDelivery(orderId, nextStatus);
      Alert.alert('Entrega', r.message);
      await load('quiet');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar la entrega');
    } finally {
      busyAdvanceRef.current = false;
      setBusyDeliveryId(null);
    }
  };

  /**
   * ANOTAR EL EFECTIVO COBRADO en la puerta.
   *
   * Es lo único que escribe el repartidor: su comisión la calcula el servidor con el desglose
   * congelado del pedido, así que no puede cambiarse el sueldo desde la app.
   *
   * OJO con el detalle que se ve al escribir esto: `Alert.prompt` **solo existe en iOS**, y esta app
   * es Android. Un cuadro de diálogo con campo de texto habría dejado al repartidor sin poder anotar
   * nada en el móvil de verdad, sin ningún error visible. Por eso el importe se escribe en un campo
   * EN LÍNEA, dentro de la propia entrega.
   */
  const guardarCobro = async (orderId: string) => {
    if (busyAdvanceRef.current) return;
    const n = Math.max(0, Math.round(Number(cobroTexto.replace(/[^0-9]/g, '')) || 0));
    busyAdvanceRef.current = true;
    setBusyDeliveryId(orderId);
    try {
      const r = await foodApi.riderAnotarCobro(orderId, n);
      Alert.alert('Anotado', r.message);
      setCobroDe(null);
      setCobroTexto('');
      await load('quiet');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo anotar el cobro');
    } finally {
      busyAdvanceRef.current = false;
      setBusyDeliveryId(null);
    }
  };

  const call = (phone: string | null, who: string) => {
    const d = (phone ?? '').replace(/\D/g, '');
    if (!d) return;
    Linking.openURL(`tel:${d}`).catch(() => Alert.alert('Llamar', `No se pudo abrir el teléfono para ${who}. Inténtalo de nuevo.`));
  };

  /** Tomar la ubicación del repartidor para el punto de encuentro. `LocCoord` es [lng, lat]. */
  const ubicarmeParaPunto = async () => {
    setPuntoUbicando(true);
    try {
      const c = await getGqPositionIfAllowed(6000);
      if (!c) {
        Alert.alert('Ubicación', 'No se pudo obtener tu ubicación. Puedes escribir el punto de encuentro sin ella.');
        return;
      }
      setPuntoCoords(c);
    } finally { setPuntoUbicando(false); }
  };

  /**
   * ANOTAR EL PUNTO DE ENCUENTRO.
   *
   * La dirección del cliente puede ser un hotel, viviendas sociales o un portal sin número: el nombre
   * del sitio no basta para encontrarse. El repartidor escribe dónde está («entrada por la puerta
   * lateral, junto a la farmacia») y, si tiene GPS, deja su posición. El cliente lo ve en su pedido y
   * recibe un SMS, para que no dependa de estar mirando la app.
   */
  const guardarPunto = async (orderId: string) => {
    if (busyAdvanceRef.current) return;
    const nota = puntoTexto.trim();
    if (nota.length < 3) {
      Alert.alert('Punto de encuentro', 'Escribe dónde os encontráis (mínimo 3 caracteres).');
      return;
    }
    busyAdvanceRef.current = true;
    setBusyDeliveryId(orderId);
    try {
      await foodApi.setMeetingPoint(orderId, {
        note: nota,
        lat: puntoCoords ? puntoCoords[1] : null,
        lng: puntoCoords ? puntoCoords[0] : null,
      });
      setPuntoDe(null);
      setPuntoTexto('');
      setPuntoCoords(null);
      await load('quiet');
      Alert.alert('Avisado', 'El cliente ya ve dónde os encontráis.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo anotar el punto de encuentro');
    } finally {
      busyAdvanceRef.current = false;
      setBusyDeliveryId(null);
    }
  };

  const s = styles(colors);
  const rider = me?.rider;
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Cabecera del kit desde el 24/09/2026. */}
      <ScreenHeader titulo="Repartidor" alVolver={() => router.back()} />

      {loading && !me ? (
        <View style={{ padding: espaciado.e16, gap: espaciado.e10 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ height: 44, borderRadius: radios.md, backgroundColor: colors.border, width: i % 2 === 0 ? '100%' : '78%' }} />
          ))}
        </View>
      ) : error ? (
        <View style={s_center.wrap}>
          <Text style={{ fontSize: tipografia.kpi, marginBottom: espaciado.e8 }}>📡</Text>
          <Text style={[s_center.title, { color: colors.textPrimary }]}>Algo salió mal</Text>
          <Text style={[s_center.sub, { color: colors.textSecondary }]}>{error}</Text>
          <Pressable onPress={() => load('initial')} accessibilityRole="button" style={s_center.btnPrimary}>
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e32 + insets.bottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}
          >
            {/* Requisitos */}
            <View style={[s.reqBox, { backgroundColor: alpha(colors.primary, 0.06) }]}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary, marginBottom: espaciado.e6 }]}>Requisitos para repartir</Text>
              <ReqRow ok={me?.kycOk ?? false} label="Identidad verificada (KYC)"
                hint={me?.kycOk ? undefined : (me?.kycMessage ?? 'Toca para completar tu verificación')}
                onPress={!me?.kycOk ? () => router.push('/driver-onboarding' as any) : undefined} />
              <ReqRow ok={name.trim().length >= 2} label="Datos del repartidor (nombre + vehículo)" />
              <ReqRow ok={rider?.status === 'active'} label="Aprobación del administrador"
                hint={rider ? (rider.status === 'pending' ? 'En revisión (2–24 h)' : rider.status === 'rejected' ? 'Rechazado' : 'Activo') : undefined} />
            </View>

            {/* ── TU SEMANA: lo que llevas ganado y lo que llevas cobrado ─────────────
                Sin sueldo base, esto es TODO su ingreso, así que tiene que verlo sin preguntar:
                entregas, comisiones, efectivo que lleva en la mano y lo que se le pagará el próximo
                día de liquidación. Y si debe más de lo que ganó, se dice EN ROJO: es su deuda, no un
                error del sistema, y ocultarla sería lo peor que podríamos hacer. */}
            {rider?.status === 'active' && contab ? (
              <View style={{ marginTop: espaciado.e16 }}>
                <Text style={s.sectionTitle}>Tu semana</Text>
                <View style={[s.reqBox, { backgroundColor: colors.surface, borderWidth: trazo.fino, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Entregas</Text>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.textPrimary }}>{contab.entregas}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: espaciado.e4 }}>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Tus comisiones</Text>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: brand.success }}>{formatXAF(contab.comisionesXaf)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: espaciado.e4 }}>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Efectivo que llevas</Text>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.textPrimary }}>{formatXAF(contab.efectivoCobradoXaf)}</Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: espaciado.e8 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>Se te pagará</Text>
                    <Text style={{ fontSize: tipografia.body, fontWeight: peso.titulo, color: brand.success }}>{formatXAF(contab.aPagarXaf)}</Text>
                  </View>
                  {contab.deudaArrastradaXaf > 0 ? (
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.danger, marginTop: espaciado.e6 }}>
                      ⚠ Debes {formatXAF(contab.deudaArrastradaXaf)} de efectivo: se descontará la semana que viene.
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e6 }}>
                    Se paga cada semana, el efectivo que cobras en la puerta se descuenta de lo que ganas.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Perfil */}
            <Text style={s.sectionTitle}>Tu perfil</Text>
            <FormField value={name} onChangeText={setName} placeholder="Nombre completo *" maxLength={120} />
            <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e10 }}>
              {(['moto', 'bici', 'coche'] as const).map((v) => (
                <Pressable key={v} onPress={() => setVehicle(v)} accessibilityRole="radio"
                  accessibilityState={{ checked: vehicle === v }}
                  style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderRadius: radios.lg, backgroundColor: vehicle === v ? colors.primary : colors.surface }}>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: vehicle === v ? brand.white : colors.textPrimary }}>{VEHICLE_LABEL[v]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: espaciado.e10 }} />
            <FormField value={zone} onChangeText={setZone} placeholder="Zona de reparto (Malabo, Bata…)" maxLength={60} />
            <View style={{ marginTop: espaciado.e12 }}>
              <PrimaryButton
                title={busySave ? 'Guardando…' : (rider ? 'Actualizar perfil' : 'Solicitar alta como repartidor')}
                onPress={save}
                disabled={busySave}
              />
            </View>

            {rider?.status === 'rejected' && rider.rejectionReason ? (
              <View style={[s.rejectedBox, { backgroundColor: alpha(colors.danger, 0.08) }]}>
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Motivo: {rider.rejectionReason}</Text>
              </View>
            ) : null}

            {rider?.status === 'pending' ? (
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e14 }}>
                Tu solicitud está en revisión. Cuando el administrador la apruebe podrás recibir entregas.
              </Text>
            ) : null}

            {/* Mis entregas */}
            {rider?.status === 'active' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e22, marginBottom: espaciado.e10 }}>
                  <Text style={[s.sectionTitle, { marginBottom: 0 }]}>Mis entregas ({me?.deliveries.length ?? 0})</Text>
                  {rider.deliveriesCount > 0 ? (
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textSecondary }}>
                      {rider.deliveriesCount} entregas completadas
                    </Text>
                  ) : null}
                </View>
                {me && me.deliveries.length === 0 ? (
                  <View style={s_center.wrapSoft}>
                    <Text style={{ fontSize: tipografia.emojiMedio, marginBottom: espaciado.e6 }}>🛵</Text>
                    <Text style={[s_center.sub, { color: colors.textSecondary }]}>
                      Sin entregas asignadas todavía. Cuando un restaurante te asigne un pedido aparecerá aquí con el
                      tracking y los datos de recogida y entrega.
                    </Text>
                  </View>
                ) : (
                  me?.deliveries.map((d) => {
                    const meta = RIDER_NEXT[d.status];
                    const stLabel = DELIVERY_LABEL[d.status] ?? d.status;
                    const busy = busyDeliveryId === d.orderId;
                    return (
                      <View key={d.id} style={[s.delCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e8 }}>
                          <Text numberOfLines={1} style={{ flex: 1, fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>{d.restaurantName}</Text>
                          <View style={{ backgroundColor: alpha(ACCENT, 0.12), paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e2, borderRadius: radios.marca }}>
                            <Text style={{ fontSize: 10.5, fontWeight: peso.maximo, color: ACCENT }}>{stLabel}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e2 }}>Tracking {d.trackingCode}</Text>
                        {d.items.map((it, i) => (
                          <Text key={`${d.id}-${it.itemId}-${i}`} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>{it.qty} × {it.name}</Text>
                        ))}
                        <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: ACCENT, marginTop: espaciado.e2 }}>{formatXAF(d.totalXaf)}</Text>

                        {/* ── ¿HAY QUE COBRAR EN LA PUERTA? (C5) ────────────────────────────
                            El repartidor necesita saberlo ANTES de llegar, no al anotar. Sin esto
                            el servidor sí bloquea la anotación en un pedido Billing, pero el bloqueo
                            salta después de que el cliente ya soltó el dinero: cobrar dos veces no
                            queda registrado en ningún sitio. Por eso se pinta aquí arriba.
                            Si el servidor aún no devuelve el método (parche pendiente), se muestra
                            el aviso neutro: NO se asume "cobrar", porque asumir es el error que se
                            viene a evitar. */}
                        {d.paymentMethod === 'cash' ? (
                          <View style={[s.payBadge, { backgroundColor: alpha(ACCENT, 0.14), borderColor: alpha(ACCENT, 0.4) }]}>
                            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: ACCENT }}>
                              💵 COBRAR {formatXAF(d.totalXaf)} en la puerta
                            </Text>
                          </View>
                        ) : d.paymentMethod === 'billing' ? (
                          <View style={[s.payBadge, { backgroundColor: alpha(colors.success, 0.14), borderColor: alpha(colors.success, 0.4) }]}>
                            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.success }}>
                              ✓ Ya pagado — NO cobrar nada
                            </Text>
                          </View>
                        ) : (
                          <View style={[s.payBadge, { backgroundColor: alpha(brand.warning, 0.14), borderColor: alpha(brand.warning, 0.4) }]}>
                            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: brand.warningText }}>
                              ⚠️ No consta cómo se paga: pregunta al restaurante antes de cobrar
                            </Text>
                          </View>
                        )}
                        {d.restaurantAddress ? (
                          <Text numberOfLines={2} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e3 }}>🏪 Recoger en: {d.restaurantAddress}</Text>
                        ) : null}
                        {d.deliveryAddress ? (
                          <Text numberOfLines={2} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>📍 Entregar en: {d.deliveryAddress}</Text>
                        ) : null}

                        {/* ── CÓMO LLEGAR ─────────────────────────────────────────────────
                            La dirección de texto sola no lleva a ningún sitio: «Aeropuerto» no es
                            navegable. Con el pin del cliente, el botón abre el mapa EN EL PUNTO; sin
                            pin, cae a buscar el texto (peor, pero mejor que nada). Se ofrece también
                            antes de salir, no solo al llegar. */}
                        {d.status !== 'delivered' && (d.deliveryLat != null || d.deliveryAddress) ? (
                          <Pressable
                            onPress={() => abrirMapa(d.deliveryLat ?? null, d.deliveryLng ?? null, d.deliveryAddress ?? null)}
                            accessibilityRole="button"
                            accessibilityLabel={`Cómo llegar a la entrega${d.deliveryLat != null ? ' (con ubicación exacta)' : ' (por la dirección escrita)'}`}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e8, alignSelf: 'flex-start', paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderRadius: 10, borderWidth: trazo.fino, borderColor: alpha(ACCENT, 0.5), backgroundColor: alpha(ACCENT, 0.10) }}
                          >
                            <Navigation size={14} color={ACCENT} />
                            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: ACCENT }}>
                              Cómo llegar{d.deliveryLat != null ? '' : ' (dirección escrita)'}
                            </Text>
                          </Pressable>
                        ) : null}

                        {/* ── PUNTO DE ENCUENTRO ──────────────────────────────────────────
                            Para cuando la dirección no basta: hotel, viviendas sociales, portal sin
                            número. El repartidor dice dónde está y el cliente lo ve al momento. */}
                        {d.status !== 'delivered' ? (
                          d.meetingNote ? (
                            <View style={{ marginTop: espaciado.e8, borderRadius: 10, borderWidth: trazo.fino, padding: espaciado.e10, borderColor: alpha(colors.success, 0.4), backgroundColor: alpha(colors.success, 0.08) }}>
                              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.success }}>🤝 Punto de encuentro avisado</Text>
                              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2, lineHeight: 15 }}>{d.meetingNote}</Text>
                              <Pressable
                                onPress={() => { setPuntoDe(d.orderId); setPuntoTexto(d.meetingNote ?? ''); setPuntoCoords(null); }}
                                accessibilityRole="button"
                                accessibilityLabel="Cambiar el punto de encuentro"
                                style={{ marginTop: espaciado.e6, alignSelf: 'flex-start' }}
                              >
                                <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: ACCENT }}>Cambiar</Text>
                              </Pressable>
                            </View>
                          ) : puntoDe === d.orderId ? (
                            <View style={{ marginTop: espaciado.e10 }}>
                              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary, marginBottom: espaciado.e4 }}>
                                ¿Dónde os encontráis? (hotel, portal, entrada…)
                              </Text>
                              <TextInput
                                value={puntoTexto}
                                onChangeText={setPuntoTexto}
                                placeholder="Ej: entrada por la puerta lateral, junto a la farmacia"
                                placeholderTextColor={colors.textSecondary}
                                maxLength={200}
                                accessibilityLabel="Punto de encuentro"
                                style={{ minHeight: 44, borderRadius: 10, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }}
                              />
                              <View style={{ flexDirection: 'row', gap: espaciado.e8, alignItems: 'center', marginTop: espaciado.e8, flexWrap: 'wrap' }}>
                                <Pressable
                                  onPress={ubicarmeParaPunto}
                                  disabled={puntoUbicando}
                                  accessibilityRole="button"
                                  accessibilityLabel="Usar mi ubicación para el punto de encuentro"
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderRadius: 10, borderWidth: trazo.fino, borderColor: colors.border }}
                                >
                                  <MapPin size={13} color={colors.textPrimary} />
                                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>
                                    {puntoUbicando ? 'Buscando…' : puntoCoords ? '✓ Ubicación añadida' : 'Usar mi ubicación'}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => guardarPunto(d.orderId)}
                                  disabled={busyDeliveryId === d.orderId}
                                  accessibilityRole="button"
                                  accessibilityLabel="Avisar al cliente del punto de encuentro"
                                  style={{ paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, borderRadius: 10, backgroundColor: ACCENT }}
                                >
                                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: brand.white }}>
                                    {busyDeliveryId === d.orderId ? 'Avisando…' : 'Avisar al cliente'}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => { setPuntoDe(null); setPuntoTexto(''); setPuntoCoords(null); }}
                                  accessibilityRole="button"
                                  accessibilityLabel="Cancelar el punto de encuentro"
                                  style={{ paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e8 }}
                                >
                                  <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Cancelar</Text>
                                </Pressable>
                              </View>
                              <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e4 }}>
                                El cliente lo verá en su pedido y recibirá un SMS: no hace falta que llames.
                              </Text>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => { setPuntoDe(d.orderId); setPuntoTexto(''); setPuntoCoords(null); }}
                              accessibilityRole="button"
                              accessibilityLabel="Indicar el punto de encuentro al cliente"
                              style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e8, alignSelf: 'flex-start', paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderRadius: 10, borderWidth: trazo.fino, borderColor: colors.border }}
                            >
                              <MapPin size={14} color={colors.textPrimary} />
                              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>Punto de encuentro</Text>
                            </Pressable>
                          )
                        ) : null}

                        {d.note ? (
                          <Text numberOfLines={2} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>📝 {d.note}</Text>
                        ) : null}

                        {/* Contactos operativos (solo el rider asignado) */}
                        <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                          <CallBtn phone={d.restaurantPhone} label="Llamar al restaurante" />
                          <CallBtn phone={d.clientPhone} label="Llamar al cliente" />
                        </View>

                        {/* ── LO QUE COBRÉ EN LA PUERTA ────────────────────────────────────
                            Solo en entregas ya cerradas: es cuando de verdad se ha cobrado. El campo
                            va EN LÍNEA (no en un diálogo) porque `Alert.prompt` es solo de iOS y
                            esta app es Android: con un diálogo, el repartidor no podría anotar nada
                            y su liquidación saldría descuadrada sin que nadie supiera por qué. */}
                        {d.status === 'delivered' ? (
                          cobroDe === d.orderId ? (
                            <View style={{ marginTop: espaciado.e10 }}>
                              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary, marginBottom: espaciado.e4 }}>
                                ¿Cuánto cobraste en la puerta? (el pedido era de {formatXAF(d.totalXaf)}; si ya estaba pagado, pon 0)
                              </Text>
                              <View style={{ flexDirection: 'row', gap: espaciado.e8, alignItems: 'center' }}>
                                <TextInput
                                  value={cobroTexto}
                                  onChangeText={setCobroTexto}
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor={colors.textSecondary}
                                  accessibilityLabel="Efectivo cobrado en esta entrega"
                                  style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }}
                                />
                                <Pressable onPress={() => guardarCobro(d.orderId)} disabled={busy}
                                  accessibilityRole="button" accessibilityLabel="Guardar el efectivo cobrado"
                                  style={[s.advBtn, { backgroundColor: ACCENT, marginTop: 0, paddingHorizontal: espaciado.e16 }]}>
                                  {busy ? <ActivityIndicator size="small" color={brand.white} /> : <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Guardar</Text>}
                                </Pressable>
                                <Pressable onPress={() => { setCobroDe(null); setCobroTexto(''); }}
                                  accessibilityRole="button" accessibilityLabel="Cancelar la anotación"
                                  style={{ paddingHorizontal: espaciado.e6 }}>
                                  <Text style={{ color: colors.textSecondary, fontWeight: peso.fuerte, fontSize: tipografia.caption }}>Cancelar</Text>
                                </Pressable>
                              </View>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => {
                                setCobroDe(d.orderId);
                                // Pre-rellenar con el total SOLO si el pedido era contra entrega.
                                // En un pedido Billing ya está pagado y lo correcto es 0: dejar el
                                // total por defecto empuja a cobrar dos veces. Y si el servidor aún
                                // no dice el método (parche C5 pendiente), se deja VACÍO para que el
                                // repartidor escriba el importe a sabiendas en vez de confirmar un
                                // número que ya venía puesto.
                                setCobroTexto(
                                  d.paymentMethod === 'cash' ? String(Math.round(Number(d.totalXaf) || 0))
                                  : d.paymentMethod === 'billing' ? '0'
                                  : '',
                                );
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Anotar el efectivo que cobré en esta entrega"
                              style={{ marginTop: espaciado.e8, alignSelf: 'flex-start' }}
                            >
                              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.primary }}>
                                💵 Anotar lo que cobré
                              </Text>
                            </Pressable>
                          )
                        ) : null}

                        {meta?.next ? (
                          busy ? (
                            <ActivityIndicator style={{ marginTop: espaciado.e10 }} size="small" color={colors.primary} />
                          ) : (
                            <Pressable
                              onPress={() => requestAdvance(d)}
                              accessibilityRole="button"
                              accessibilityLabel={meta.btn.replace(/^[^\s]+\s/, '')}
                              style={[s.advBtn, { backgroundColor: ACCENT }]}
                            >
                              <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo }}>{meta.btn}</Text>
                            </Pressable>
                          )
                        ) : null}
                      </View>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function CallBtn({ phone, label }: { phone: string | null; label: string }) {
  const { colors } = useTheme();
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return <View />;
  return (
    <Pressable
      onPress={() => Linking.openURL(`tel:${digits}`).catch(() => undefined)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e5, borderWidth: trazo.fino, borderColor: colors.primary, borderRadius: radios.hermano, paddingVertical: espaciado.e8 }}
    >
      <Phone size={13} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{label}</Text>
    </Pressable>
  );
}

function ReqRow({ ok, label, hint, onPress }: { ok: boolean; label: string; hint?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e5 }}>
      {ok ? <BadgeCheck size={16} color={brand.success} /> : <XCircle size={16} color={neutro.n400} />}
      <View style={{ flex: 1, marginLeft: espaciado.e8 }}>
        <Text style={{ fontSize: tipografia.caption, fontWeight: peso.medio, color: ok ? colors.textPrimary : colors.textSecondary }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 10.5, color: onPress ? colors.primary : colors.textSecondary }}>{hint}</Text> : null}
      </View>
      {onPress ? <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>→</Text> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${hint ?? ''}`} style={{ paddingVertical: espaciado.e2 }}>
      {row}
    </Pressable>
  ) : row;
}

const s_center = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: espaciado.e28 },
  wrapSoft: { alignItems: 'center', paddingTop: espaciado.e24, paddingHorizontal: espaciado.e20 },
  title: { fontSize: 15, fontWeight: peso.maximo, textAlign: 'center' },
  sub: { fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 },
  btnPrimary: { marginTop: espaciado.e18, backgroundColor: ACCENT, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: radios.panelAncho },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  reqBox: { borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e14 },
  sectionTitle: { fontSize: tipografia.body, fontWeight: peso.maximo, marginBottom: espaciado.e10 },
  rejectedBox: { borderRadius: 10, padding: espaciado.e10, marginTop: espaciado.e12 },
  delCard: { borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e10, borderWidth: trazo.fino },
  advBtn: { marginTop: espaciado.e10, borderRadius: 10, paddingVertical: espaciado.e11, alignItems: 'center' },
  // Distintivo de «cobrar en la puerta» (C5): se ve antes de llegar, no al anotar.
  payBadge: { borderRadius: radios.hermano, borderWidth: trazo.fino, paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e6, marginTop: espaciado.e6, alignSelf: 'flex-start' },
});
