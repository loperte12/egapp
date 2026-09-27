/**
 * HotelResultCard — LA TARJETA DE UN ALOJAMIENTO EN LA LISTA.
 *
 * Vive aparte porque la usan DOS pantallas: el buscador (`/lifebook-hotel`) y los resultados
 * (`/lifebook-hotel-resultados`). Una sola forma de pintar un resultado, no dos.
 *
 * ── LO QUE CAMBIÓ EL 27-sep-2026 (P1 del plan de UI, `docs/UI-HOTEL-PLAN-MEJORA.md` §10) ──
 *
 * ANTES: dentro de cada tarjeta iban las habitaciones, cada una con su precio, su disponibilidad y
 * **su propio botón azul**. Medido en el móvil (`_c1-01-arranque.png`): **cinco botones «Ver fechas»
 * para dos hoteles**, y el nombre del alojamiento recortado porque el bloque de precio le comía el
 * ancho. La lista se leía como un formulario, no como una lista.
 *
 * AHORA: la tarjeta enseña el ALOJAMIENTO —foto grande, nombre entero, dónde está, la nota si el
 * servidor la publica y el precio desde— y resume las habitaciones a **una línea de texto**
 * («3 tipos · 2 libres ahora»). Se toca la tarjeta y las habitaciones se eligen en la ficha, que es
 * donde vive la decisión. Es lo que hace la referencia.
 *
 * La información no se pierde: se conserva la ventaja de este producto frente a Meituan —poder ver
 * que hay habitaciones y cuántas quedan libres sin abrir la ficha— en una línea en vez de en cinco.
 *
 * Los importes siguen llegando **calculados del servidor**: aquí no se hace aritmética de dinero.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, brand, espaciado, peso, Precio, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import type { HotelRoom, HotelSearchResult } from '../api/hotel';
import { absUrl } from '../api/config';
import { etiquetaDistancia } from '../utils/distancia';
import { LazyImage } from './rental/LazyImage';

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
  distanciaKm,
  onAbrir,
}: {
  datos: HotelSearchResult['hotels'][number];
  /** Habitaciones que quiere el huésped (para saber cuántas quedan libres). */
  habitaciones: number;
  /** ¿Ya hay fechas elegidas? Sin ellas no se puede afirmar disponibilidad. */
  listo: boolean;
  /** Distancia en línea recta al huésped, si se sabe. `null`/ausente = no se pinta. */
  distanciaKm?: number | null;
  onAbrir: () => void;
}) {
  const { colors } = useTheme();
  const { hotel, rooms, fromPricePerNightXaf, soldOut } = datos;
  // Portada del hotel si la tiene; si no, la primera foto de su habitación más barata.
  const portada = absUrl(hotel.coverUrl) || fotoDe(rooms[0]);

  const nTipos = rooms.length;
  const libres = rooms.filter((r) => (r.freeUnits ?? 0) >= habitaciones).length;
  const distancia = typeof distanciaKm === 'number' ? etiquetaDistancia(distanciaKm) : '';

  /**
   * LA CIFRA, SOLO SI EL SERVIDOR DICE QUE SE PUBLICA (C-1 · [D-K]).
   *
   * La condición es `ratingPublished` y **no el valor**: el umbral de reseñas es del servidor y no se
   * copia aquí. Con dos reseñas la media existe pero no se publica, y un «★ 3,0 (1)» de una sola
   * estancia decide peor que no decir nada.
   *
   * Va en una variable —y no como ternario dentro del JSX— porque así la condición y la cifra se
   * leen juntas en el mismo sitio, que es como la guardia de C-1 (`pruebas/c1-verifica-app.cjs`)
   * comprueba que la puerta sigue puesta.
   */
  const nota = hotel.ratingPublished
    ? `★ ${Number(hotel.rating).toFixed(1).replace('.', ',')} (${hotel.ratingCount})`
    : null;

  return (
    <Pressable
      onPress={onAbrir}
      accessibilityRole="button"
      accessibilityLabel={`Ver ${hotel.name}`}
      style={({ pressed }) => [styles.tarjeta, {
        borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1,
      }]}
    >
      {/* ── Foto del alojamiento: es lo que hace que la fila se reconozca de un vistazo. ── */}
      <View style={[styles.portada, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {portada
          ? <LazyImage source={{ uri: portada }} style={styles.portadaImg} />
          : <Text style={{ fontSize: tipografia.subtitulo }}>🏨</Text>}
      </View>

      <View style={styles.cuerpo}>
        {/* Dos líneas: el nombre lo escribe el hotelero y recortado no se sabe qué se elige. */}
        <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
          {hotel.name} {hotel.isVerified ? '✓' : ''}
        </Text>

        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
          {[hotel.barrio, hotel.city].filter(Boolean).join(' · ') || 'Guinea Ecuatorial'}
          {distancia ? ` · ${distancia}` : ''}
        </Text>

        {nota ? (
          <View style={[styles.chipNota, { backgroundColor: alpha(colors.primary, 0.14) }]}>
            <Text style={[styles.chipNotaTxt, { color: colors.textPrimary }]}>{nota}</Text>
          </View>
        ) : null}

        {/* Las habitaciones, en UNA línea y sin botón: se eligen en la ficha. */}
        <Text style={[styles.tipos, { color: colors.textSecondary }]} numberOfLines={1}>
          {nTipos === 1 ? '1 tipo de habitación' : `${nTipos} tipos de habitación`}
          {listo
            ? soldOut
              ? ' · lleno esas fechas'
              : libres > 0
                ? ` · ${libres} con hueco ahora`
                : ' · ninguna con hueco'
            : ''}
        </Text>
      </View>

      <View style={styles.precio}>
        <Precio
          valor={fromPricePerNightXaf}
          tamano="md"
          color={soldOut ? colors.textSecondary : colors.text.secondary}
        />
        <Text style={[styles.precioSub, { color: colors.textSecondary }]} numberOfLines={1}>
          {soldOut ? 'sin hueco' : 'por noche · desde'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12,
    flexDirection: 'row', gap: espaciado.e12, alignItems: 'flex-start',
  },
  // La foto manda: 104 px (antes 92) y sin encogerse cuando el nombre es largo.
  portada: {
    width: 104, height: 104, borderRadius: radios.campo, borderWidth: trazo.fino,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  portadaImg: { width: '100%', height: '100%' },
  cuerpo: { flex: 1, minWidth: 0, gap: espaciado.e2 },
  titulo: { fontSize: tipografia.ancho, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  chipNota: { alignSelf: 'flex-start', borderRadius: radios.chip, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e2, marginTop: espaciado.e2 },
  chipNotaTxt: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  tipos: { fontSize: tipografia.caption, marginTop: espaciado.e2 },
  // El precio, a la derecha y sin partirse: «25.000 XAF» en dos renglones no se lee.
  precio: { alignItems: 'flex-end', flexShrink: 0 },
  precioSub: { fontSize: tipografia.micro },
});
