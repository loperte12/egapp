/**
 * lifebook-hotel-habitaciones — LAS HABITACIONES DEL HOTEL (panel del hotelero).
 *
 * Era el hueco más grande: el servidor sabía crear y editar tipos de habitación desde la
 * Parte 42 y `api/hotel.ts` tenía los métodos escritos… pero **ninguna pantalla los
 * llamaba**. El hotelero no podía dar de alta una habitación desde la app: solo la API.
 *
 * ── REVISIÓN DE UX/UI (lo que estaba mal y por qué se cambió) ─────────────────
 *
 * 1. **La tarjeta ESCONDÍA lo que escribe el hotelero.** El nombre se recortaba a 2 líneas
 *    y la **descripción no se enseñaba en absoluto**. Es su propio texto: si no se ve, el
 *    dueño no sabe qué ha escrito ni si quedó bien. Ahora la descripción se ve, y si es
 *    larga se abre con «Ver más» — la guía es clara: el texto de cuerpo se ajusta y se
 *    envuelve; si hay que recortar, se recorta con puntos suspensivos y SIEMPRE se da una
 *    forma de verlo entero (WCAG 1.4.10, reflujo).
 * 2. **Tres botones en una tarjeta es una barra de herramientas, no una tarjeta.** La regla
 *    es UNA acción principal y como mucho dos secundarias. Ahora: tocar la tarjeta = editar
 *    (principal), y quedan dos secundarias discretas — calendario y el interruptor de «a la
 *    venta». Además se ahorra muchísimo alto: los tres botones a ancho completo ocupaban
 *    más que el propio contenido.
 * 3. **Faltaba el ancla visual.** Había un contador de fotos («📷 3 foto(s)») pero no la
 *    foto. La jerarquía de una tarjeta empieza por el ancla visual. Ahora se ve la portada.
 * 4. **Cinco tamaños de letra en una tarjeta.** Se reduce a dos (15,5 para lo importante,
 *    12,5 para el resto): menos ruido y se lee más rápido.
 * 5. **Objetivos táctiles por debajo de 44 px.** Un chip de 33 px se falla con el dedo.
 * 6. **Cargaba con un spinner genérico.** Ahora carga con esqueletos con la forma de la
 *    tarjeta, que no hacen saltar el contenido al llegar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { ArrowLeft, CalendarDays, Plus } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, type HotelRoom } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { LazyImage } from '../components/rental/LazyImage';
import { xaf } from '../utils/datetime';

export default function HabitacionesScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

/** Estado de la publicación, en lenguaje del hotelero y CORTO (compite por el ancho). */
function estadoDe(r: HotelRoom, colors: { success: string; secondary: string; textSecondary: string }) {
  if (!r.isActive) return { txt: 'Apagada', color: colors.textSecondary };
  if (r.productStatus === 'active') return { txt: 'Publicada', color: colors.success };
  if (r.productStatus === 'pending') return { txt: 'En revisión', color: colors.secondary };
  if (r.productStatus === 'rejected') return { txt: 'Rechazada', color: colors.textSecondary };
  return { txt: 'Oculta', color: colors.textSecondary };
}

/** «2 personas · 1 doble + 1 individual · 18 m²» — una línea, sin recortar. */
function resumenHabitacion(r: HotelRoom): string {
  const partes = [`${r.capacity} persona(s)`];
  if (r.beds?.length) partes.push(r.beds.map((b) => `${b.count} ${b.kind}`).join(' + '));
  if (r.sizeM2) partes.push(`${r.sizeM2} m²`);
  return partes.join(' · ');
}

function Contenido() {
  useScreenGuard();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** Descripciones desplegadas: el texto del dueño no se esconde sin salida. */
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  /**
   * Filtro con contadores.
   *
   * Un hotelero acumula habitaciones apagadas o viejas, y la lista se convierte en un muro
   * donde lo que importa (lo que está a la venta) se pierde entre lo demás. Por defecto se
   * enseña **lo que está a la venta** y el resto queda a un toque — con el número a la vista
   * para que se sepa que existe.
   */
  const [filtro, setFiltro] = useState<'venta' | 'todas'>('venta');

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const out = await hotelApi.myRooms();
      setRooms(out.rooms ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus habitaciones. Revisa tu conexión.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const alternar = async (r: HotelRoom) => {
    setOcupado(r.id);
    setAviso(null);
    try {
      const out = await hotelApi.updateRoom(r.id, { isActive: !r.isActive });
      setRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...out.room } : x)));
      setAviso(!r.isActive
        ? `«${r.name}» vuelve a estar a la venta.`
        : `«${r.name}» queda apagada: sale del catálogo y deja de poder reservarse. Las reservas que ya tienes siguen en pie.`);
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setOcupado(null);
    }
  };

  const confirmarAlternar = (r: HotelRoom) => {
    if (r.isActive) {
      Alert.alert(
        'Apagar esta habitación',
        'Dejará de aparecer en el catálogo de Life Book y nadie podrá reservarla.\n\nLas reservas que ya tienes NO se cancelan.',
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Apagar', onPress: () => void alternar(r) }],
      );
      return;
    }
    void alternar(r);
  };

  const totalUnidades = rooms.reduce((a, r) => a + (r.isActive ? r.totalUnits : 0), 0);
  const publicadas = rooms.filter((r) => r.isActive && r.productStatus === 'active').length;

  /**
   * Orden: de precio MÁS BAJO a más alto.
   * En Meituan, el calendario de precios lista los tipos así, y es lo que espera quien
   * compara de un vistazo (documento §J.3). Antes salían en orden de creación, que no dice nada.
   * Salvo en el panel: primero lo que está a la venta, luego el resto.
   */
  const visibles = rooms
    .filter((r) => (filtro === 'venta' ? r.isActive : true))
    .slice()
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.basePriceXaf - b.basePriceXaf);

  const apagadas = rooms.length - publicadas;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={12} style={styles.volver}>
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1 }}>Habitaciones</Text>
        <Pressable
          onPress={() => router.push('/lifebook-hotel-habitacion' as never)}
          accessibilityRole="button"
          accessibilityLabel="Añadir una habitación"
          hitSlop={12}
          style={[styles.anadir, { backgroundColor: alpha(colors.primary, 0.12) }]}
        >
          <Plus size={20} color={colors.primary} />
        </Pressable>
      </View>

      {cargando ? (
        <ScrollView contentContainerStyle={{ padding: espaciado.e16 }} scrollEnabled={false}>
          {[0, 1, 2].map((i) => <EsqueletoTarjeta key={i} />)}
        </ScrollView>
      ) : error ? (
        <View style={styles.centro}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: espaciado.e14 }}>{error}</Text>
          <GhostButton title="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 28 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          {aviso ? (
            <View style={[styles.aviso, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.25) }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 19 }}>{aviso}</Text>
            </View>
          ) : null}

          {rooms.length ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginBottom: espaciado.e10 }}>
              {rooms.length} tipo(s) · {totalUnidades} habitación(es) a la venta · {publicadas} publicada(s)
            </Text>
          ) : null}

          {/*
            Filtro con contadores. Un hotelero acumula habitaciones apagadas o viejas y la lista
            se vuelve un muro donde lo que importa se pierde. Por defecto, lo que está a la
            venta; el resto a un toque, con el número a la vista para saber que existe.
          */}
          {rooms.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: espaciado.e8, marginBottom: espaciado.e12 }}>
              <ChipFiltro
                activo={filtro === 'venta'}
                texto={`A la venta (${rooms.filter((r) => r.isActive).length})`}
                onPress={() => setFiltro('venta')}
              />
              <ChipFiltro
                activo={filtro === 'todas'}
                texto={`Todas (${rooms.length})${apagadas ? ` · ${apagadas} apagada(s)` : ''}`}
                onPress={() => setFiltro('todas')}
              />
            </View>
          ) : null}

          {visibles.map((r) => {
            const est = estadoDe(r, colors);
            const foto = r.images?.[0]?.url ?? null;
            const descripcion = (r.description ?? '').trim();
            const abierta = !!abiertas[r.id];
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: '/lifebook-hotel-habitacion', params: { id: r.id } } as never)}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${r.name}`}
                style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {/* Ancla visual + lo esencial, en una sola franja que se lee de un vistazo. */}
                <View style={{ flexDirection: 'row' }}>
                  <View style={[styles.portada, { borderColor: colors.border }]}>
                    <LazyImage source={{ uri: foto }} style={styles.portadaImg} />
                  </View>
                  <View style={{ flex: 1, paddingLeft: espaciado.e12 }}>
                    {/*
                      El nombre ocupa TODO el ancho (dos líneas) y el estado baja a la línea
                      del precio. Antes iban en la misma fila y el chip «Se puede reservar» se
                      comía la mitad del nombre: el dato del dueño perdía contra una etiqueta.
                    */}
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.ancho, fontWeight: peso.titulo }} numberOfLines={2}>
                      {r.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e6 }}>
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.ancho, fontWeight: peso.titulo }}>
                        {xaf(r.basePriceXaf)}
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}> por noche</Text>
                      </Text>
                      <View style={[styles.etiqueta, { backgroundColor: alpha(est.color, 0.12) }]}>
                        <Text style={{ color: est.color, fontSize: tipografia.micro, fontWeight: peso.titulo }}>{est.txt}</Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>{resumenHabitacion(r)}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                      {r.totalUnits} habitación(es) · mínimo {r.minNights} noche(s) · señal {r.depositPercent}%
                    </Text>
                  </View>
                </View>

                {/* LO QUE ESCRIBIÓ EL DUEÑO: se ve, y si es largo se abre. Nunca se esconde del todo. */}
                {descripcion ? (
                  <View style={[styles.descripcion, { borderTopColor: colors.border }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, lineHeight: 18 }} numberOfLines={abierta ? undefined : 2}>
                      {descripcion}
                    </Text>
                    {descripcion.length > 90 ? (
                      <Pressable
                        onPress={() => setAbiertas((prev) => ({ ...prev, [r.id]: !abierta }))}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={abierta ? 'Ver menos' : 'Ver la descripción completa'}
                        style={styles.verMas}
                      >
                        <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                          {abierta ? 'Ver menos' : 'Ver más'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={[styles.descripcion, { borderTopColor: colors.border }]}>
                    <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                      Sin descripción: el huésped decide con lo que le cuentes (toca para escribirla)
                    </Text>
                  </View>
                )}

                {r.productStatus === 'pending' && r.isActive ? (
                  <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8, lineHeight: 18 }}>
                    ⏳ En revisión: la administración tiene que aprobarla antes de que se pueda reservar. Mientras
                    tanto puedes ponerle precios y cerrar fechas.
                  </Text>
                ) : null}

                {/*
                  ── LISTA DE COMPROBACIÓN DE LA FICHA ──
                  Viene de la regla de cumplimiento de Meituan para los tipos de habitación
                  (§J.3 del documento de diseño): un tipo con menos de **3 fotos reales**, sin
                  cama o sin superficie declaradas no debería publicarse así. Y sus palancas de
                  conversión (§C.2) son justo la foto, el nombre, la cama+superficie y las
                  condiciones exactas.
                  Solo se comprueba lo que el sistema SABE de verdad (no se inventan campos que
                  no existen). **No bloquea** —son habitaciones que ya se pueden reservar—: avisa.
                */}
                {(() => {
                  const nFotos = r.images?.length ?? 0;
                  const faltan = [
                    nFotos < 3 ? `${nFotos}/3 fotos` : null,
                    !r.beds?.length ? 'sin cama' : null,
                    !r.sizeM2 ? 'sin superficie' : null,
                    !descripcion ? 'sin descripción' : null,
                  ].filter(Boolean) as string[];
                  return (
                    <View style={[styles.comprobacion, { borderTopColor: colors.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e7 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.5 }}>
                          FICHA
                        </Text>
                        <Text style={{
                          color: faltan.length ? colors.secondary : colors.success,
                          fontSize: tipografia.caption, fontWeight: peso.titulo, marginLeft: 'auto',
                        }}>
                          {faltan.length ? `Falta: ${faltan.join(' · ')}` : 'Completa'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: espaciado.e6, flexWrap: 'wrap' }}>
                        <Sello ok={nFotos >= 3} texto={`${nFotos} foto(s)`} colors={colors} />
                        <Sello ok={!!r.beds?.length} texto={r.beds?.length ? `${r.beds.reduce((a, b) => a + b.count, 0)} cama(s)` : 'sin cama'} colors={colors} />
                        <Sello ok={!!r.sizeM2} texto={r.sizeM2 ? `${r.sizeM2} m²` : 'sin m²'} colors={colors} />
                        <Sello ok texto={`cancelación ${r.cancellationHours} h`} colors={colors} />
                        <Sello ok texto={`señal ${r.depositPercent}%`} colors={colors} />
                      </View>
                    </View>
                  );
                })()}

                {/* UNA acción secundaria clara + el interruptor. La principal es tocar la tarjeta. */}
                <View style={[styles.pie, { borderTopColor: colors.border }]}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/lifebook-hotel-calendario', params: { id: r.id, nombre: r.name } } as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`Precios y fechas de ${r.name}`}
                    hitSlop={8}
                    style={[styles.pieBtn, { borderColor: colors.border }]}
                  >
                    <CalendarDays size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Precios y fechas</Text>
                  </Pressable>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginLeft: 'auto' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                      {ocupado === r.id ? 'Cambiando…' : r.isActive ? 'A la venta' : 'Apagada'}
                    </Text>
                    <Switch
                      value={!!r.isActive}
                      onValueChange={() => confirmarAlternar(r)}
                      disabled={ocupado === r.id}
                      trackColor={{ true: alpha(colors.success, 0.5) }}
                      accessibilityLabel={r.isActive ? `Apagar ${r.name}` : `Poner a la venta ${r.name}`}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}

          {!rooms.length ? (
            <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.ancho, fontWeight: peso.titulo }}>Todavía no tienes habitaciones</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 18, marginTop: espaciado.e6 }}>
                Un «tipo de habitación» es lo que se vende: por ejemplo «Doble con aire», con su precio por noche,
                cuántas tienes de ese tipo y su estancia mínima. De cada tipo se reservan unidades sueltas, así que
                dos reservas de la misma noche caben si te quedan habitaciones libres — y no caben si no.
              </Text>
              <View style={{ marginTop: espaciado.e14 }}>
                <PrimaryButton title="Crear la primera habitación" onPress={() => router.push('/lifebook-hotel-habitacion' as never)} />
              </View>
            </View>
          ) : null}

          {rooms.length ? (
            <View style={{ marginTop: espaciado.e6 }}>
              <GhostButton title="Ficha del hotel" onPress={() => router.push('/lifebook-hotel-perfil' as never)} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Un sello de la lista de comprobación de la ficha.
 * `ok` = cumple; si no, se pinta en naranja (aviso, nunca rojo: no es un error, es un «te
 * falta esto»). Los sellos informativos (cancelación, señal) van siempre en gris.
 */
function Sello({ ok, texto, colors }: {
  ok: boolean;
  texto: string;
  colors: { success: string; secondary: string; textSecondary: string };
}) {
  const color = ok ? colors.textSecondary : colors.secondary;
  return (
    <View style={{
      borderWidth: trazo.fino, borderColor: color, borderRadius: radios.full,
      paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3,
    }}>
      <Text style={{ color, fontSize: tipografia.micro, fontWeight: peso.maximo }}>
        {ok ? '' : '⚠ '}{texto}
      </Text>
    </View>
  );
}

/** Esqueleto con la FORMA de la tarjeta (no un spinner suelto): el contenido no salta al llegar. */
/** Chip de filtro: 44 px de alto para que se acierte con el dedo, y con el número dentro. */
function ChipFiltro({ activo, texto, onPress }: { activo: boolean; texto: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={texto}
      style={{
        minHeight: 44, justifyContent: 'center',
        borderWidth: trazo.base, borderRadius: radios.full, paddingHorizontal: espaciado.e14,
        borderColor: activo ? colors.primary : colors.border,
        backgroundColor: activo ? alpha(colors.primary, 0.12) : colors.surface,
      }}
    >
      <Text style={{ color: activo ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
        {texto}
      </Text>
    </Pressable>
  );
}

function EsqueletoTarjeta() {
  const { colors } = useTheme();
  const gris = alpha(colors.textSecondary, 0.14);
  return (
    <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.portada, { backgroundColor: gris, borderColor: colors.border }]} />
        <View style={{ flex: 1, paddingLeft: espaciado.e12, gap: espaciado.e8 }}>
          <View style={{ height: 14, width: '70%', borderRadius: radios.marca, backgroundColor: gris }} />
          <View style={{ height: 11, width: '50%', borderRadius: radios.marca, backgroundColor: gris }} />
          <View style={{ height: 14, width: '35%', borderRadius: radios.marca, backgroundColor: gris }} />
        </View>
      </View>
      <View style={{ height: 11, width: '90%', borderRadius: radios.marca, backgroundColor: gris, marginTop: espaciado.e14 }} />
      <View style={{ height: 11, width: '60%', borderRadius: radios.marca, backgroundColor: gris, marginTop: espaciado.e8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  anadir: { width: 44, height: 44, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
  aviso: { borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e11, marginBottom: espaciado.e12 },
  tarjeta: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e14, marginBottom: espaciado.e12 },
  portada: { width: 76, height: 76, borderRadius: radios.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  portadaImg: { width: '100%', height: '100%' },
  etiqueta: { borderRadius: radios.full, paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e4, marginLeft: 'auto' },
  descripcion: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: espaciado.e12, paddingTop: espaciado.e10 },
  comprobacion: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: espaciado.e12, paddingTop: espaciado.e10 },
  verMas: { minHeight: 44, justifyContent: 'center' },
  pie: {
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: espaciado.e12, paddingTop: espaciado.e8,
    flexDirection: 'row', alignItems: 'center',
  },
  pieBtn: {
    minHeight: 44, borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12,
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e7,
  },
});
