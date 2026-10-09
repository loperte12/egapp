/**
 * TarjetaEntregaNegociada — tarjeta 30 de 54 · `bcim_chat_negotiatedelivery_104`
 *
 * QUÉ ES: el aviso de que **la fecha de entrega ha cambiado** y se ha acordado una nueva. Es una de
 * las tarjetas más importantes del comercio en el chat: toca algo que el comprador ya daba por hecho,
 * así que tiene que enseñar **las dos fechas** —la prometida y la nueva—, no solo la nueva.
 *
 * FORMA DE LOS DATOS (del DSL): `title` · `negotiateState` (el estado de la negociación) ·
 * `descriptionList[]{label,value,extra}` · `image` · `name` · `quantity` · `price` ·
 * `preDeliveryTime` (la fecha prometida antes) · `expectDeliveryTime` (la nueva) · botones.
 *
 * ANATOMÍA DE LA REFERENCIA (25 nodos): tarjeta radio 12 con padding 12 · título 14 en negrita ·
 * lista de datos con la etiqueta a 14/22 en gris y el valor a 14/18 · bloque del artículo con fondo
 * suave y radio 8 con la foto de 56 · dos líneas a 12 con la fecha antigua y la nueva · fila de
 * botones.
 *
 * DECISIONES:
 *  1. **Las dos fechas llevan su etiqueta completa** («Entrega prometida» / «Nueva entrega»), en vez
 *     de la fórmula de la referencia (una sola palabra y el prefijo «original»). Lo que se está
 *     cambiando es una promesa: si el usuario tiene que deducir cuál es cuál, la tarjeta falla en lo
 *     único que tenía que hacer.
 *  2. **La fecha nueva se destaca y la vieja se apaga.** Mismo criterio que el precio tachado de la
 *     alerta de precio: se ve de dónde viene y a dónde llega sin tener que comparar dos líneas
 *     idénticas.
 *  3. El estado de la negociación va en la cabecera como estado, con el tono semántico de la casa.
 *
 * CONTRATO: `cardType: 'entrega-negociada'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, FilaDato, TarjetaEnChat, type Tono,
} from './piezas';

export function TarjetaEntregaNegociada({ datos, tonoEstado, onAbrirPedido, onBoton }: {
  datos: {
    title?: string | null;
    negotiateState?: string | null;
    descriptionList?: Array<{ label: string; value: string; extra?: string | null }>;
    image?: string | null;
    name?: string | null;
    quantity?: number | null;
    price?: string | null;
    preDeliveryTime?: string | null;
    expectDeliveryTime?: string | null;
    buttons?: Array<{ buttonValue?: string }>;
  };
  tonoEstado?: Tono;
  onAbrirPedido?: () => void;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();
  const campos = datos.descriptionList ?? [];
  const botones = datos.buttons ?? [];
  const articulo = [datos.quantity && datos.quantity > 1 ? `${datos.quantity} unidades` : null, datos.price]
    .filter(Boolean).join(' · ');

  return (
    <TarjetaEnChat>
      <CabeceraTarjeta
        titulo={datos.title ?? 'La entrega ha cambiado'}
        estado={datos.negotiateState}
        tono={tonoEstado}
      />

      {campos.map((c, i) => (
        <FilaDato key={`${c.label}-${i}`} etiqueta={c.label} valor={c.value} extra={c.extra} />
      ))}

      {datos.name ? (
        <BloquePedido
          imagen={datos.image}
          titulo={datos.name}
          subtitulo={articulo || null}
          onPress={onAbrirPedido}
          etiquetaAccesible={`Ver ${datos.name}`}
        />
      ) : null}

      {datos.preDeliveryTime || datos.expectDeliveryTime ? (
        <View style={estilos.fechas}>
          {datos.preDeliveryTime ? (
            <Text style={[estilos.fechaVieja, { color: colors.textSecondary }]} numberOfLines={1}>
              Entrega prometida: {datos.preDeliveryTime}
            </Text>
          ) : null}
          {datos.expectDeliveryTime ? (
            <Text style={[estilos.fechaNueva, { color: colors.textPrimary }]} numberOfLines={1}>
              Nueva entrega: {datos.expectDeliveryTime}
            </Text>
          ) : null}
        </View>
      ) : null}

      {botones.length ? (
        <FilaBotones>
          {botones.map((b, i) => (
            <BotonPildora
              key={`${b.buttonValue}-${i}`}
              texto={b.buttonValue ?? ''}
              contorno
              onPress={onBoton ? () => onBoton(b.buttonValue ?? '') : undefined}
            />
          ))}
        </FilaBotones>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  fechas: { marginTop: espaciado.e10 },
  /** La prometida se apaga; la nueva manda. Se ve el cambio sin comparar dos líneas iguales. */
  fechaVieja: { fontSize: tipografia.caption, lineHeight: interlineado.caption },
  fechaNueva: { fontSize: tipografia.caption, lineHeight: interlineado.caption, fontWeight: peso.medio, marginTop: espaciado.e6 },
});
