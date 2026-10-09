/**
 * TarjetaReclamarCupon — tarjeta 13 de 54 · `bcim_chat_couponclaim_112`
 *
 * QUÉ ES: la tarjeta con la que la tienda **ofrece un cupón para reclamar**. No es un cupón que ya
 * se tiene: es una invitación a cogerlo, con título, explicación, el cupón dibujado y el botón.
 *
 * FORMA DE LOS DATOS (del DSL): `title` · `content` · `couponDetail{discountAmountFen,
 * thresholdFen,name,useEndTs,limits}` · `buttons[]{label,status}` — donde `limits` son las
 * condiciones de uso (productos o categorías donde vale).
 *
 * ANATOMÍA DE LA REFERENCIA (23 nodos): tarjeta radio 12 · título 14/18 en negrita · explicación
 * 14/22 · el cupón sobre un **gráfico de fondo** (`coupon_bg.png`) con el importe a **32** —el
 * tamaño más grande de las 54— el mínimo a 10, el nombre a 14, la caducidad a 10 y las condiciones
 * a **9**, el texto más pequeño de todas · botones abajo.
 *
 * TRES DECISIONES:
 *  1. **El gráfico de fondo no se copia.** El cupón se dibuja con tokens: superficie del tema,
 *     borde y la muesca del corte. Un PNG de fondo obliga a mantener dos recursos (claro y oscuro)
 *     y a que la caja del importe mida exactamente lo que mide el dibujo. Con tokens, el cupón se
 *     adapta solo.
 *  2. **El importe va a 30, no a 32.** La escala del kit llega a 32 solo por `emojiMedio`, un token
 *     de tamaño de símbolo; usarlo para una cifra sería mentir sobre su nombre. `hero` (30) está
 *     declarado justo como «cifra de hero». Dos píxeles y el nombre dice la verdad.
 *  3. **Las condiciones suben de 9 a 10.** La referencia las pone a 9 —el texto más pequeño de las
 *     54— y a ese tamaño no se lee en pantalla densa. Es texto legal: si no se lee, no informa.
 *     Se usa `nota` (10), el suelo razonable de la escala.
 *
 * PENDIENTE DE CONTRATO: cupón. El backend ya tiene `claimCoupon`; falta poder mandarlo al chat.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';
import { ImporteCupon } from './piezas-cupon';

export interface DatosReclamarCupon {
  title?: string | null;
  content?: string | null;
  couponDetail?: {
    discountAmountFen?: string | null;
    thresholdFen?: string | null;
    name?: string | null;
    useEndTs?: string | null;
    limits?: string | null;
  } | null;
  buttons?: Array<{ label: string; status?: string | null }>;
}

export function TarjetaReclamarCupon({ datos, onReclamar, onBoton }: {
  datos: DatosReclamarCupon;
  onReclamar?: () => void;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();
  const cupon = datos.couponDetail;
  const botones = datos.buttons ?? [];

  return (
    <TarjetaEnChat>
      {datos.title ? (
        <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={2}>{datos.title}</Text>
      ) : null}
      {datos.content ? (
        <Text style={[estilos.explicacion, { color: colors.textPrimary }]} numberOfLines={3}>{datos.content}</Text>
      ) : null}

      {/* El cupón, dibujado con tokens: superficie, borde y muesca. Sin PNG de fondo. */}
      {cupon ? (
        <View style={[estilos.cupon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={estilos.cuponIzquierda}>
            <ImporteCupon
              cantidad={cupon.discountAmountFen ?? '—'}
              simbolo="XAF"
              minimo={cupon.thresholdFen}
              tamano="mayor"
            />
          </View>

          <View style={[estilos.muesca, { backgroundColor: colors.border }]} />

          <View style={estilos.cuponDerecha}>
            {cupon.name ? (
              <Text style={[estilos.cuponNombre, { color: colors.textPrimary }]} numberOfLines={2}>{cupon.name}</Text>
            ) : null}
            {cupon.useEndTs ? (
              <Text style={[estilos.cuponValidez, { color: colors.textSecondary }]} numberOfLines={1}>
                Válido hasta {cupon.useEndTs}
              </Text>
            ) : null}
            {cupon.limits ? (
              <Text style={[estilos.cuponCondiciones, { color: colors.textSecondary }]} numberOfLines={3}>
                {cupon.limits}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {botones.length ? (
        <View style={estilos.acciones}>
          {botones.map((b, i) => (
            <BotonPildora
              key={`${b.label}-${i}`}
              texto={b.label}
              onPress={onBoton ? () => onBoton(b.label) : (i === 0 ? onReclamar : undefined)}
            />
          ))}
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tipografia.body, lineHeight: interlineado.body, fontWeight: peso.fuerte, marginBottom: espaciado.e4 },
  explicacion: { fontSize: tipografia.body, lineHeight: interlineado.body, marginBottom: espaciado.e8 },

  cupon: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radios.sm,
    borderWidth: StyleSheet.hairlineWidth, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e12,
  },
  cuponIzquierda: { minWidth: 92 },
  muesca: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: espaciado.e12 },
  cuponDerecha: { flex: 1, minWidth: 0 },
  cuponNombre: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte },
  cuponValidez: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e8 },
  /** Condiciones: la referencia las pone a 9. Aquí a 10, el suelo legible — es texto legal. */
  cuponCondiciones: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e4 },

  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e12 },
});
