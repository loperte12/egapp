/**
 * lifebook-hotel-gestion — LA PARTE DE GESTIÓN DEL PANEL DEL HOTELERO.
 *
 * ── DECISIÓN DE PRODUCTO: el panel del comerciante son DOS PARTES ──────────────
 *
 * El dueño lo decidió así el 2026-09-12, y vale igual para el hotel y para el
 * restaurante que viene detrás. La regla que separa una parte de la otra:
 *
 *   · **HOY**      → lo que CADUCA: personas esperando en recepción, dinero por cobrar,
 *                    mensajes sin responder. Si tiene hora límite, va aquí.
 *                    (`lifebook-hotel-panel`)
 *   · **GESTIÓN**  → lo que SE CONFIGURA: precios, fotos, textos, horarios, catálogo.
 *                    Si se toca de vez en cuando, va aquí. (esta pantalla)
 *
 * Por qué separarlas: Meituan tiene dos apps (cliente y hotelero/PMS) porque el trabajo del
 * comerciante es de dos naturalezas distintas —atender y configurar—, y mezclarlas en una
 * sola pantalla hace que lo urgente se pierda entre lo que puede esperar. Aquí se mantiene
 * una sola app (con pocos comercios es lo eficiente) pero **dos partes claras**, cada una con
 * su entrada.
 *
 * Y lo que hace útil esta pantalla no es la lista de enlaces: es que **dice lo que falta**.
 * Un hotelero que no ve «tienes 3 habitaciones sin fotos» no lo arregla nunca, y una
 * habitación sin fotos casi no se reserva (documento de diseño Meituan §J.3: mínimo 3 fotos
 * reales; §C.2: la foto es lo que decide el clic en la lista).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import {
  ArrowLeft, BedDouble, CalendarDays, ChevronRight, ClipboardList, Settings, Store, TriangleAlert,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, type HotelProfile, type HotelRoom } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { xaf } from '../utils/datetime';

export default function GestionHotelScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

/** Un pendiente: qué falta, dónde se arregla y qué se pierde si no se hace. */
interface Pendiente {
  clave: string;
  texto: string;
  porque: string;
  ir: () => void;
}

function Contenido() {
  useScreenGuard();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [hotel, setHotel] = useState<HotelProfile | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const out = await hotelApi.myHotel();
      setHotel(out.hotel);
      setRooms(out.rooms ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la gestión.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const publicadas = rooms.filter((r) => r.isActive && r.productStatus === 'active').length;
  const sinFotos = rooms.filter((r) => (r.images?.length ?? 0) < 3);
  const sinDescripcion = rooms.filter((r) => !(r.description ?? '').trim());
  const sinSuperficie = rooms.filter((r) => !r.sizeM2);

  /** Lo que falta, ordenado por lo que más cuesta en reservas perdidas. */
  const pendientes = useMemo((): Pendiente[] => {
    const lista: Pendiente[] = [];
    if (!rooms.length) {
      lista.push({
        clave: 'sin-habitaciones', texto: 'Todavía no has creado ninguna habitación',
        porque: 'Sin habitaciones no hay nada que reservar.',
        ir: () => router.push('/lifebook-hotel-habitacion' as never),
      });
    }
    if (sinFotos.length) {
      lista.push({
        clave: 'fotos', texto: `${sinFotos.length} habitación(es) con menos de 3 fotos`,
        porque: 'La foto es lo que decide el clic en la lista de resultados.',
        ir: () => router.push('/lifebook-hotel-habitaciones' as never),
      });
    }
    if (sinDescripcion.length) {
      lista.push({
        clave: 'desc', texto: `${sinDescripcion.length} habitación(es) sin descripción`,
        porque: 'El huésped decide con lo que le cuentes.',
        ir: () => router.push('/lifebook-hotel-habitaciones' as never),
      });
    }
    if (sinSuperficie.length) {
      lista.push({
        clave: 'm2', texto: `${sinSuperficie.length} habitación(es) sin superficie`,
        porque: 'Es dato obligatorio de la ficha y el huésped lo compara.',
        ir: () => router.push('/lifebook-hotel-habitaciones' as never),
      });
    }
    if (!hotel?.stars) {
      lista.push({
        clave: 'estrellas', texto: 'La ficha no tiene categoría (estrellas)',
        porque: 'Es lo primero que filtra el huésped al buscar.',
        ir: () => router.push('/lifebook-hotel-perfil' as never),
      });
    }
    if (!(hotel?.amenities?.length)) {
      lista.push({
        clave: 'servicios', texto: 'No has declarado ningún servicio del hotel',
        porque: 'Wi-Fi, desayuno o aparcamiento son motivos de elección.',
        ir: () => router.push('/lifebook-hotel-perfil' as never),
      });
    }
    if (!hotel?.houseRules) {
      lista.push({
        clave: 'normas', texto: 'Sin normas de la casa',
        porque: 'Unas normas claras evitan discusiones en recepción.',
        ir: () => router.push('/lifebook-hotel-perfil' as never),
      });
    }
    if (!hotel?.cancellationPolicy) {
      lista.push({
        clave: 'cancelacion', texto: 'Sin política de cancelación escrita',
        porque: 'Es lo que más rebaja la duda antes de pagar.',
        ir: () => router.push('/lifebook-hotel-perfil' as never),
      });
    }
    return lista;
  }, [rooms.length, sinFotos.length, sinDescripcion.length, sinSuperficie.length, hotel?.stars,
      hotel?.amenities?.length, hotel?.houseRules, hotel?.cancellationPolicy, router]);

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
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={12} style={styles.volver}>
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo }}>Gestión</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={2}>
            {hotel?.name ?? 'Tu alojamiento'} · lo que se configura, no lo del día
          </Text>
        </View>
      </View>

      {error ? (
        <View style={{ padding: espaciado.e16 }}>
          <Text style={{ color: colors.textSecondary, marginBottom: espaciado.e12 }}>{error}</Text>
          <GhostButton title="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          {/* Resumen: lo primero, cuánto hay y cuánto está listo. */}
          <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.ancho, fontWeight: peso.titulo }}>
              {rooms.length} tipo(s) de habitación
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4, lineHeight: 18 }}>
              {publicadas} se puede(n) reservar ya
              {rooms.length - publicadas > 0 ? ` · ${rooms.length - publicadas} todavía no` : ''}
              {rooms.length ? ` · desde ${xaf(Math.min(...rooms.map((r) => r.basePriceXaf)))} por noche` : ''}
            </Text>
          </View>

          {/* ── LO QUE FALTA ── la razón de ser de esta pantalla */}
          {pendientes.length ? (
            <View style={{ marginTop: espaciado.e18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e8 }}>
                <TriangleAlert size={16} color={colors.secondary} />
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginLeft: espaciado.e7 }}>
                  Te falta por completar ({pendientes.length})
                </Text>
              </View>
              {pendientes.map((p) => (
                <Pressable
                  key={p.clave}
                  onPress={p.ir}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.texto}. ${p.porque}`}
                  style={[styles.pendiente, { borderColor: alpha(colors.secondary, 0.35), backgroundColor: alpha(colors.secondary, 0.06) }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{p.texto}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3, lineHeight: 17 }}>
                      {p.porque}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.secondary} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={[styles.resumen, { borderColor: alpha(colors.success, 0.35), backgroundColor: alpha(colors.success, 0.07), marginTop: espaciado.e18 }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                ✓ Tu ficha está completa
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
                Habitaciones con fotos, descripción y datos; hotel con categoría, servicios y normas.
              </Text>
            </View>
          )}

          {/* ── A DÓNDE SE VA DESDE AQUÍ ── */}
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginTop: espaciado.e22, marginBottom: espaciado.e8 }}>
            Configurar
          </Text>

          <Fila
            icono={<BedDouble size={18} color={colors.primary} />}
            titulo="Habitaciones"
            detalle={rooms.length
              ? `${rooms.length} tipo(s) · ${publicadas} a la venta · fotos, camas, precios y señal`
              : 'Crea la primera: nombre, camas, precio y fotos'}
            onPress={() => router.push('/lifebook-hotel-habitaciones' as never)}
          />
          <Fila
            icono={<CalendarDays size={18} color={colors.primary} />}
            titulo="Precios y fechas"
            detalle="Precio de temporada, estancia mínima y cerrar fechas, por habitación"
            onPress={() => router.push('/lifebook-hotel-habitaciones' as never)}
          />
          <Fila
            icono={<ClipboardList size={18} color={colors.primary} />}
            titulo="Ficha del hotel"
            detalle="Categoría, horario de entrada y salida, servicios, normas y formas de pago"
            onPress={() => router.push('/lifebook-hotel-perfil' as never)}
          />
          <Fila
            icono={<Store size={18} color={colors.primary} />}
            titulo="Ajustes de la tienda"
            detalle="Nombre, dirección, logo y portada (son de la tienda, no del alojamiento)"
            onPress={() => router.push('/lifebook-merchant-settings' as never)}
          />
          <Fila
            icono={<Settings size={18} color={colors.primary} />}
            titulo="Mis publicaciones"
            detalle="Todo lo que tienes en el catálogo de Life Book, con su estado"
            onPress={() => router.push('/lifebook-merchant-products' as never)}
          />

          {/* Puente a la otra parte: no son dos apps, son dos partes de lo mismo. */}
          <View style={{ marginTop: espaciado.e22 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e8 }}>
              Lo del día —llegadas, salidas, cobros y reservas— está en la otra parte, «Hoy».
            </Text>
            <GhostButton title="Ir a «Hoy» (recepción)" onPress={() => router.push('/lifebook-hotel-panel' as never)} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** Fila de acceso: icono, título, detalle y flecha. Objetivo táctil de 56 px. */
function Fila({ icono, titulo, detalle, onPress }: {
  icono: React.ReactNode; titulo: string; detalle: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={[styles.fila, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={[styles.filaIcono, { backgroundColor: alpha(colors.primary, 0.12) }]}>{icono}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{titulo}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 17 }}>{detalle}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  resumen: { borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e13 },
  pendiente: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56,
  },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e11,
    borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56,
  },
  filaIcono: { width: 34, height: 34, borderRadius: radios.nota, alignItems: 'center', justifyContent: 'center' },
});
