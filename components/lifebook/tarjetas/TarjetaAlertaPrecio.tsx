/**
 * TarjetaAlertaPrecio — tarjeta 19 de 54 · `bcim_chat_goodsshoppingguide_93`
 *
 * QUÉ ES: el aviso de que un producto está **en su precio más bajo de los últimos N días**. Lo
 * manda un robot de la tienda, no una persona, y por eso el texto lo dice con esas palabras.
 *
 * FORMA DE LOS DATOS (del DSL): `image` · `nowPrice` (precio de hoy) · `originalPrice` (el de
 * antes) · `agioPrice` (lo que se ahorra) · `lowPriceDay` (cuántos días lleva sin estar tan barato).
 *
 * ANATOMÍA DE LA REFERENCIA (19 nodos): tarjeta radio 12 padding 12, toda ella clicable · frase de
 * cabecera 14/22 en peso medio · bloque del producto con fondo suave y radio 8 · foto de 56 · y a la
 * derecha un indicador de tendencia dibujado con tres imágenes superpuestas (una flecha, una línea
 * de 1pt y un punto rojo de 2 sobre un fondo de 4) — o sea, un gráfico hecho a mano con piezas.
 *
 * TRES DECISIONES:
 *  1. **El gráfico de tendencia no se copia.** La referencia lo dibuja apilando tres imágenes de
 *     posiciones absolutas y un punto rojo de 2pt. Eso no es un gráfico, es un dibujo; en modo
 *     oscuro necesita otro juego de imágenes y no aporta ningún dato que el texto no diga. Se
 *     sustituye por el número de días, que es la información de verdad.
 *  2. **El ahorro va en verde de éxito**, no en rojo como en la referencia — misma razón que en las
 *     tarjetas de cupón: un ahorro es un beneficio, y el rojo en LifeBook está reservado a
 *     emergencias.
 *  3. **El precio de antes se tacha.** Es la convención que hace legible una rebaja sin tener que
 *     restar: se ve de dónde viene y a dónde llega.
 *
 * PENDIENTE DE CONTRATO: ya no. Con el tipo genérico `card`: `cardType: 'alerta-precio'`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, brand, espaciado, interlineado, peso, Precio, radios, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaAlertaPrecio({ imagen, precioAhora, precioAntes, ahorroXaf, dias, onAbrir }: {
  imagen?: string | null;
  /** Precio de hoy, en XAF enteros (como el resto de la app). */
  precioAhora: number;
  precioAntes?: number | null;
  ahorroXaf?: number | null;
  /** Cuántos días lleva sin estar tan barato. */
  dias?: number | null;
  onAbrir?: () => void;
}) {
  const { colors } = useTheme();

  // El texto lo dice con las palabras de la referencia: lo detecta un robot, no una persona.
  const titular = dias && dias > 0
    ? `Es el precio más bajo de los últimos ${dias} días`
    : 'Está en su precio más bajo';

  return (
    <TarjetaEnChat onPress={onAbrir} etiquetaAccesible={titular}>
      <Text style={[estilos.titular, { color: colors.textPrimary }]} numberOfLines={3}>{titular}</Text>

      <View style={[estilos.bloque, { backgroundColor: colors.surface }]}>
        {imagen ? (
          <Image source={imagen} style={estilos.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <View style={[estilos.foto, estilos.fotoVacia, { backgroundColor: alpha(colors.primary, 0.08) }]} />
        )}

        <View style={estilos.precios}>
          <Precio valor={precioAhora} tamano="md" color={colors.textPrimary} />
          {precioAntes && precioAntes > precioAhora ? (
            <Text style={[estilos.antes, { color: colors.textSecondary }]} numberOfLines={1}>
              Antes {precioAntes} XAF
            </Text>
          ) : null}
          {ahorroXaf && ahorroXaf > 0 ? (
            <Text style={[estilos.ahorro, { color: brand.success }]} numberOfLines={1}>
              Ahorras {ahorroXaf} XAF
            </Text>
          ) : null}
        </View>
      </View>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  titular: { fontSize: tipografia.body, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  bloque: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    marginTop: espaciado.e8, borderRadius: radios.sm, padding: espaciado.e8,
  },
  foto: { width: 56, height: 56, borderRadius: radios.punta },
  fotoVacia: { alignItems: 'center', justifyContent: 'center' },
  precios: { flex: 1, minWidth: 0 },
  /** Tachado: se ve de dónde viene el precio, sin tener que restar. */
  antes: { fontSize: tipografia.caption, lineHeight: interlineado.caption, textDecorationLine: 'line-through', marginTop: espaciado.e2 },
  ahorro: { fontSize: tipografia.detalle, lineHeight: interlineado.body, fontWeight: peso.medio, marginTop: espaciado.e2 },
});
