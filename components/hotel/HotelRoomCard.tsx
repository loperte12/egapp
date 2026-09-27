/**
 * HotelRoomCard — LA TARJETA DE UN TIPO DE HABITACIÓN, dentro de la ficha del alojamiento.
 *
 * ── POR QUÉ EXISTE (27-sep-2026, `docs/UI-HOTEL-PLAN-MEJORA.md` §11) ──────────────────────────
 *
 * Antes, un tipo de habitación NO era una tarjeta: era un bloque de texto con el calendario, el
 * desglose y el botón DESPLEGADOS DENTRO (`lifebook-hotel-detalle.tsx`, el acordeón). Medido en el
 * móvil con `uiautomator`: la primera habitación se abre sola al entrar y **el calendario se come una
 * pantalla entera** antes de que el huésped llegue a ver cuánto cuesta la segunda. Y lo que se leía
 * de la habitación era un párrafo —«3 huésped(es) · 1 queen · 2 iguales» seguido de «Estancia mínima
 * 2 noche(s) · sin señal (pago al llegar) · cancelación gratis hasta 48 h antes»—, sin foto, sin
 * servicios y sin botón a la vista.
 *
 * ── LO QUE HACE AHORA, Y CON QUÉ DATO ────────────────────────────────────────────────────────
 *
 *   · **Foto** — `room.images[]`. Verificado contra el servidor: **2 de las 8 habitaciones del
 *     alojamiento de prueba tienen 3 fotos y las otras 6 ninguna**, así que el caso sin foto NO es
 *     una excepción: la tarjeta se escribe para que el texto ocupe el ancho entero cuando no hay.
 *   · **Servicios** — `room.amenities[]` (`wifi, aire, tv, agua_caliente, nevera` en los datos
 *     reales), con el mismo diccionario que los del alojamiento (`./servicios`).
 *   · **Condiciones** — `cancellationHours`, `minNights`, `depositPercent` y `confirmationHours`.
 *     Aquí está la precisión que importa: `cancellationHours` son **horas antes de la LLEGADA**, no
 *     minutos después de reservar, así que NO se copia el «15分钟内可免费取消» de la referencia: es
 *     otra política y escribirla mal promete algo que el servidor no aplica. Y `confirmationHours`
 *     solo permite decir «confirmación inmediata» **cuando vale 0**; con `24` —el valor real del
 *     alojamiento de prueba— el hotel tarda un día y eso no se calla.
 *   · **Precio de fin de semana** — `weekendPriceXaf`, que existe (22.000 · 32.000 · 32.000 · 34.000
 *     en los datos reales) y **no se enseñaba en ninguna pantalla de la app**. Viernes y sábado
 *     cuestan más: avisarlo aquí evita la sorpresa en la cuenta final.
 *
 * ── LO QUE NO SE HACE, Y ES UNA DECISIÓN ─────────────────────────────────────────────────────
 *
 * No se enseña el precio de las fechas elegidas. Para eso haría falta el calendario de CADA
 * habitación (una petición por tipo, ocho en el alojamiento de prueba) y la ficha no puede gastar
 * eso al abrirse. El precio que se enseña es el **por noche** del tipo —base y fin de semana—, y el
 * importe exacto de la estancia lo calcula el servidor en la pantalla de reservar, que es donde el
 * dinero se enseña desglosado y con la señal. Es la misma frontera que separa esta tarjeta de
 * `lifebook-hotel-reservar.tsx`: aquí se elige, allí se paga.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  altura, brand, espaciado, icono, peso, Precio, radios, tipografia, trazo, trazoIcono, useTheme,
} from '@egrouteplan/ui-kit';
import {
  Accessibility, ArrowUpDown, Building2, Car, Clock, Coffee, CookingPot, Dog, Droplets,
  Dumbbell, Refrigerator, Snowflake, Tv, UtensilsCrossed, WashingMachine, Waves, Wifi, Wine, Zap,
} from 'lucide-react-native';
import type { HotelRoom } from '../../api/hotel';
import { absUrl } from '../../api/config';
import { xaf } from '../../utils/datetime';
import { nombreServicio } from './servicios';
import { LazyImage } from '../rental/LazyImage';

/**
 * El dibujo de cada servicio. Solo las claves que tienen icono: una clave sin dibujo se pinta con
 * su nombre y nada más, que es mejor que un cuadro vacío. El tipo sale del propio icono, así que
 * añadir uno nuevo no puede desalinearse del tipo del mapa.
 */
type IconoServicio = typeof Wifi;
const ICONO: Record<string, IconoServicio> = {
  wifi: Wifi, desayuno: Coffee, aire: Snowflake, piscina: Waves, parking: Car,
  restaurante: UtensilsCrossed, bar: Wine, gimnasio: Dumbbell, recepcion_24h: Clock,
  agua_caliente: Droplets, generador: Zap, lavanderia: WashingMachine, tv: Tv,
  terraza: Building2, ascensor: ArrowUpDown, admite_mascotas: Dog, adaptado: Accessibility,
  cocina: CookingPot, nevera: Refrigerator,
};

/** Cuántos servicios caben antes de que la tarjeta deje de leerse: el resto se cuenta. */
const MAX_SERVICIOS = 4;

/** El nombre de las camas, en singular o plural. Las claves las manda el servidor. */
const CAMA: Record<string, [string, string]> = {
  individual: ['cama individual', 'camas individuales'],
  doble: ['cama doble', 'camas dobles'],
  queen: ['cama queen', 'camas queen'],
  king: ['cama king', 'camas king'],
  sofa: ['sofá cama', 'sofás cama'],
  litera: ['litera', 'literas'],
};

function textoCamas(beds: HotelRoom['beds']): string {
  return (beds ?? []).map((b) => {
    const n = Number(b?.count) || 1;
    const par = CAMA[String(b?.kind ?? '').toLowerCase()];
    if (!par) return `${n} ${b?.kind ?? ''}`.trim();
    return `${n} ${n === 1 ? par[0] : par[1]}`;
  }).join(' + ');
}

/** La primera foto del tipo de habitación, si la tiene. */
function primeraFoto(room: HotelRoom): string | null {
  const imgs = (room.images ?? []) as { url?: string }[];
  const url = imgs.map((i) => i?.url).find((u) => !!u);
  return url ? absUrl(url) : null;
}

export function HotelRoomCard({
  room,
  noches = 0,
  habitaciones = 1,
  onReservar,
}: {
  room: HotelRoom;
  /** Noches elegidas en la barra de fechas: con ellas el botón dice el verbo con su cifra. */
  noches?: number;
  /** Habitaciones que quiere el huésped: decide si «quedan N» es verdad para su caso. */
  habitaciones?: number;
  onReservar: (room: HotelRoom) => void;
}) {
  const { colors } = useTheme();
  const foto = primeraFoto(room);

  const medidas = [
    room.sizeM2 ? `${room.sizeM2} m²` : null,
    room.beds?.length ? textoCamas(room.beds) : null,
    room.capacity ? `${room.capacity} huésped${room.capacity === 1 ? '' : 'es'}` : null,
  ].filter(Boolean).join(' · ');

  const servicios = (room.amenities ?? []).filter(Boolean);
  const visibles = servicios.slice(0, MAX_SERVICIOS);
  const resto = servicios.length - visibles.length;

  /*
    LAS CONDICIONES, POR ORDEN DE LO QUE DECIDE LA COMPRA.

    «Confirmación inmediata» solo si el hotel la da de verdad (`confirmationHours === 0`). La
    cancelación va primero porque es lo único que el huésped puede perder si se equivoca de fechas,
    y la estancia mínima porque bloquea la reserva entera. La señal cierra: es dinero.
  */
  const hechos: { texto: string; bueno: boolean }[] = [];
  if (room.confirmationHours === 0) hechos.push({ texto: 'Confirmación inmediata', bueno: true });
  if (room.cancellationHours > 0) {
    hechos.push({ texto: `Cancelación gratis hasta ${room.cancellationHours} h antes`, bueno: true });
  }
  if (room.minNights > 1) {
    hechos.push({ texto: `Estancia mínima de ${room.minNights} noches`, bueno: false });
  }
  if (room.depositPercent > 0) {
    hechos.push({ texto: `Señal del ${room.depositPercent}% al reservar`, bueno: false });
  }

  /* Las que quedan libres: solo se dice cuando es un dato y cuando aprieta. */
  const aprieta = typeof room.freeUnits === 'number' && room.freeUnits >= habitaciones && room.freeUnits <= 3;

  /*
    El precio de fin de semana se enseña SOLO si es distinto del base: repetir la misma cifra con
    otro nombre es ruido, y este alojamiento de prueba tiene tipos sin `weekendPriceXaf` (null).
  */
  const finde = typeof room.weekendPriceXaf === 'number'
    && room.weekendPriceXaf > 0
    && room.weekendPriceXaf !== room.basePriceXaf
    ? room.weekendPriceXaf
    : null;

  return (
    <View style={[styles.tarjeta, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.cuerpo}>
        {foto ? (
          <View style={[styles.foto, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <LazyImage source={{ uri: foto }} style={styles.fotoImg} />
          </View>
        ) : null}

        <View style={styles.texto}>
          <Text style={[styles.nombre, { color: colors.textPrimary }]} numberOfLines={2}>
            {room.name}
          </Text>
          {medidas ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>{medidas}</Text>
          ) : null}

          {visibles.length ? (
            <View style={styles.servicios}>
              {visibles.map((s) => {
                const Icono = ICONO[s];
                return (
                  <View key={s} style={styles.servicio}>
                    {Icono ? <Icono size={icono.micro} color={colors.textSecondary} strokeWidth={trazoIcono.base} /> : null}
                    <Text style={[styles.servicioTxt, { color: colors.textSecondary }]}>{nombreServicio(s)}</Text>
                  </View>
                );
              })}
              {resto > 0 ? (
                <Text style={[styles.servicioTxt, { color: colors.textSecondary }]}>+{resto}</Text>
              ) : null}
            </View>
          ) : null}

          {hechos.length ? (
            <View style={styles.hechos}>
              {hechos.map((h) => (
                <Text
                  key={h.texto}
                  style={[styles.hecho, { color: h.bueno ? colors.text.success : colors.textSecondary }]}
                >
                  · {h.texto}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.precioFila}>
            <Precio valor={room.basePriceXaf} tamano="md" />
            <Text style={[styles.sub, { color: colors.textSecondary }]}>por noche</Text>
          </View>
          {finde ? (
            <Text style={[styles.hecho, { color: colors.textSecondary }]}>
              viernes y sábado: {xaf(finde)}
            </Text>
          ) : null}
          {aprieta ? (
            <Text style={[styles.hecho, { color: colors.text.warning }]}>
              Quedan {room.freeUnits} para tus fechas
            </Text>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={() => onReservar(room)}
        accessibilityRole="button"
        accessibilityLabel={`Reservar ${room.name}`}
        style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.ctaTxt}>
          {noches > 0 ? `Reservar · ${noches} noche${noches === 1 ? '' : 's'}` : 'Elegir fechas y reservar'}
        </Text>
      </Pressable>
    </View>
  );
}

/** El hueco de la foto cuando el tipo de habitación no tiene ninguna está en `HotelRoomCard`. */

const styles = StyleSheet.create({
  tarjeta: { borderWidth: trazo.fino, borderRadius: radios.tarjeta, padding: espaciado.e12, gap: espaciado.e10 },
  cuerpo: { flexDirection: 'row', gap: espaciado.e12, alignItems: 'flex-start' },
  foto: {
    width: 92, height: 92, borderRadius: radios.campo, borderWidth: trazo.fino,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  fotoImg: { width: '100%', height: '100%' },
  texto: { flex: 1, minWidth: 0, gap: espaciado.e3 },
  nombre: { fontSize: tipografia.ancho, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  servicios: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10, marginTop: espaciado.e2 },
  servicio: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e3 },
  servicioTxt: { fontSize: tipografia.micro },
  hechos: { marginTop: espaciado.e2, gap: espaciado.e2 },
  hecho: { fontSize: tipografia.micro },
  precioFila: { flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e6, marginTop: espaciado.e4 },
  cta: { height: altura.campo, borderRadius: radios.campo, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },
});
