/**
 * HotelResultCard — LA TARJETA DE UN ALOJAMIENTO EN LOS RESULTADOS.
 *
 * Vive aparte porque la usan DOS pantallas: el buscador (`/lifebook-hotel`, que lleva
 * el calendario y los filtros) y los resultados (`/lifebook-hotel-resultados`). Antes
 * cada pantalla habría tenido su propia tarjeta, y ya sabemos cómo acaba eso: dos
 * formas de lo mismo que se desincronizan.
 *
 * Lo que enseña, y por qué:
 *   · por habitación, **el TOTAL de la estancia** y el reparto **«ahora + al llegar»**
 *     (es la mitad del producto: el pago parcial);
 *   · cuántas quedan libres para ESAS fechas y el número de habitaciones pedido — y si
 *     no hay hueco lo dice («lleno»), en vez de desaparecer;
 *   · la estancia mínima, que es la causa número uno de un rechazo al reservar;
 *   · los importes llegan SIEMPRE calculados del servidor (aquí no se hace aritmética
 *     de dinero, solo se pinta).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, brand, espaciado, tipografia, useTheme, peso, trazo, radios} from '@egrouteplan/ui-kit';
import type { HotelRoom, HotelSearchResult } from '../api/hotel';
import { xaf } from '../utils/datetime';
import { LazyImage } from './rental/LazyImage';
import { absUrl } from '../api/config';

/** Primera foto disponible de una habitación o del hotel (el servidor valida al publicar). */
function fotoDe(room?: HotelRoom | null): string | null {
  const imgs = (room?.images ?? []) as { url?: string }[];
  const url = imgs.map((i) => i?.url).find((u) => !!u);
  return url ? absUrl(url) : null;
}

export function HotelResultCard({
  datos,
  habitaciones,
  listo,
  onAbrir,
  onReservar,
}: {
  datos: HotelSearchResult['hotels'][number];
  /** Habitaciones que quiere el huésped (para exigir disponibilidad suficiente). */
  habitaciones: number;
  /** ¿Ya hay fechas elegidas? Sin ellas se enseña el precio por noche, no el total. */
  listo: boolean;
  onAbrir: () => void;
  onReservar: (room: HotelRoom) => void;
}) {
  const { colors } = useTheme();
  const { hotel, rooms, fromPricePerNightXaf, soldOut } = datos;
  const mejores = rooms.slice(0, 3);
  // Portada del hotel si la tiene; si no, la primera foto de su habitación más barata.
  const portada = absUrl(hotel.coverUrl) || fotoDe(mejores[0]);

  return (
    <View style={[styles.tarjeta, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Pressable onPress={onAbrir} accessibilityRole="button" accessibilityLabel={`Ver ${hotel.name}`}>
        <View style={styles.tarjetaCab}>
          {/* Foto del alojamiento: es lo que hace que la fila se reconozca de un vistazo. */}
          <View style={[styles.portada, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {portada ? (
              <LazyImage source={{ uri: portada }} style={styles.portadaImg} />
            ) : (
              <Text style={{ fontSize: tipografia.subtitulo }}>🏨</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            {/*
              El nombre del alojamiento y de la habitación son texto que escribe el hotelero.
              Estaban recortados a UNA línea, que es lo que hace que «Habitación doble con
              vistas al mar» se quede en «Habitación doble con…» y el huésped no sepa qué
              elige. Se permiten dos líneas: sigue siendo una lista ordenada y se ve el nombre.
            */}
            <Text style={[styles.tarjetaTitulo, { color: colors.textPrimary }]} numberOfLines={2}>
              {hotel.name} {hotel.isVerified ? '✓' : ''}
            </Text>
            <Text style={[styles.tarjetaSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {[hotel.barrio, hotel.city].filter(Boolean).join(' · ') || 'Guinea Ecuatorial'}
              {hotel.rating ? ` · ★ ${Number(hotel.rating).toFixed(1)} (${hotel.ratingCount})` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.precio, { color: soldOut ? colors.textSecondary : colors.secondary }]}>
              {xaf(fromPricePerNightXaf)}
            </Text>
            <Text style={[styles.precioSub, { color: colors.textSecondary }]}>
              {soldOut ? 'sin disponibilidad' : 'por noche · desde'}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={{ gap: espaciado.e8, marginTop: espaciado.e10 }}>
        {mejores.map((r) => {
          // Con fechas, la disponibilidad es la del servidor para TODO el rango y para
          // las habitaciones pedidas; sin fechas no se puede afirmar nada.
          const libre = (r.freeUnits ?? 0) >= habitaciones;
          const total = r.totalXaf ?? 0;
          const cerrado = r.closedForDates === true;
          const foto = fotoDe(r);
          return (
            <View key={r.id} style={[styles.habitacion, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {/* Foto REAL de esa habitación (la sube el hotelero y el servidor la valida). */}
              <View style={[styles.habFoto, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {foto ? <LazyImage source={{ uri: foto }} style={styles.habFotoImg} /> : <Text style={{ fontSize: tipografia.cabecera }}>🛏️</Text>}
              </View>
              <View style={{ flex: 1 }}>
                {/* Dos líneas para el nombre de la habitación: es texto del hotelero. */}
                <Text style={[styles.habNombre, { color: colors.textPrimary }]} numberOfLines={2}>{r.name}</Text>
                <Text style={[styles.habDatos, { color: colors.textSecondary }]} numberOfLines={2}>
                  {r.capacity} huésped(es)
                  {r.beds?.length ? ` · ${r.beds.map((b) => `${b.count} ${b.kind}`).join(', ')}` : ''}
                  {r.minNights > 1 ? ` · mín ${r.minNights} noches` : ''}
                  {r.depositPercent > 0 ? ` · señal ${r.depositPercent}%` : ' · sin señal'}
                </Text>
                {listo && total > 0 ? (
                  <Text style={[styles.habTotal, { color: colors.textPrimary }]}>
                    {xaf(total)} en total
                    <Text style={{ color: colors.textSecondary }}>
                      {`  ·  ahora ${xaf(r.depositXaf)} + ${xaf(r.remainingXaf)} al llegar`}
                    </Text>
                  </Text>
                ) : null}
                {cerrado ? (
                  <Text style={[styles.habAviso, { color: colors.textSecondary }]}>
                    El hotel tiene cerrada alguna de esas noches
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: espaciado.e4 }}>
                {listo ? (
                  <Text style={[styles.habLibre, { color: libre ? colors.success : colors.textSecondary }]}>
                    {libre
                      ? `${r.freeUnits} libre(s)`
                      : Number(r.freeUnits) === 0
                        ? 'lleno'
                        : `solo ${r.freeUnits}`}
                  </Text>
                ) : (
                  <Text style={[styles.habLibre, { color: colors.textSecondary }]}>{xaf(r.basePriceXaf)}/noche</Text>
                )}
                <Pressable
                  onPress={() => onReservar(r)}
                  disabled={listo && !libre}
                  accessibilityRole="button"
                  accessibilityLabel={`Reservar ${r.name}`}
                  accessibilityState={{ disabled: listo && !libre }}
                  style={[styles.reservarBtn, {
                    backgroundColor: listo && !libre ? alpha(colors.textSecondary, 0.25) : colors.primary,
                  }]}
                >
                  <Text style={styles.reservarTxt}>{listo ? 'Reservar' : 'Ver fechas'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12 },
  tarjetaCab: { flexDirection: 'row', gap: espaciado.e10, alignItems: 'center' },
  // Foto del alojamiento en la fila (92×92, redondeada, con hueco gris si no hay).
  portada: { width: 92, height: 92, borderRadius: 14, borderWidth: trazo.fino, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  portadaImg: { width: '100%', height: '100%' },
  tarjetaTitulo: { fontSize: tipografia.ancho, fontWeight: peso.maximo },
  tarjetaSub: { fontSize: tipografia.caption, marginTop: espaciado.e2 },
  precio: { fontSize: 15, fontWeight: peso.maximo },
  precioSub: { fontSize: 10.5 },
  habitacion: { borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e10, flexDirection: 'row', gap: espaciado.e10, alignItems: 'center' },
  // Foto de la habitación en su fila (56×56): «fotos reales de las habitaciones».
  habFoto: { width: 56, height: 56, borderRadius: 10, borderWidth: trazo.fino, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  habFotoImg: { width: '100%', height: '100%' },
  habNombre: { fontSize: tipografia.body, fontWeight: peso.maximo },
  habDatos: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  habTotal: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 },
  habAviso: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  habLibre: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  reservarBtn: { borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  reservarTxt: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo },
});
