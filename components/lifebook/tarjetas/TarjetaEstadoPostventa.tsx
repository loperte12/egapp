/**
 * TarjetaEstadoPostventa — tarjeta 2 de 54 · `bcim_chat_aftersalestatus_128`
 *
 * QUÉ ES: el estado de un caso de postventa. Banner de cabecera, título con el estado al lado,
 * una línea de contenido, el artículo del pedido y los botones de acción. Debajo, y **fuera** de
 * la tarjeta, una pista con icono.
 *
 * FORMA DE LOS DATOS (extraída del DSL con `tools/enlaces-tarjeta.py`, no inventada):
 *   title · content · contentSubType · statusText · statusValue ·
 *   cardHeader{mainTitle,subTitle} · orderDetail{image,name,quantity,price} ·
 *   buttons[]{label,buttonStyle,status}
 *
 * ANATOMÍA DE LA REFERENCIA (23 nodos): banner de 54pt a ancho completo · tarjeta radio 12 con
 * padding 12/12/12/16 · cabecera título + estado (14/18, medium, el estado coloreado por
 * `statusValue`) · contenido 14/18 · bloque del pedido radio 4 con foto de 56 y cantidad+precio en
 * gris · botones con radio 14 y borde de 0,5 · pista al pie con icono de 18.
 *
 * DOS DECISIONES DE IDENTIDAD:
 *  1. La referencia da a cada botón un radio distinto según la tarjeta (1000 en la 1, 14 aquí).
 *     Eso es exactamente la inconsistencia que el kit existe para evitar: aquí todos los botones
 *     usan `radios.full`. El radio deja de ser una decisión por tarjeta.
 *  2. El color del estado sale de `statusValue`, que la referencia traduce a un color literal. Aquí
 *     se traduce a un **tono semántico** de la casa, y el rojo no entra: para un caso abierto está
 *     el ámbar y para uno resuelto el verde.
 *
 * PENDIENTE DE CONTRATO: como la 1, necesita un tipo de postventa en `LbMessageKind`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { espaciado, interlineado, peso, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, TarjetaEnChat, type Tono,
} from './piezas';

export interface DatosEstadoPostventa {
  title: string;
  content?: string | null;
  /** `damage` · `freight_rules` · `delivery` · … lo usa la referencia para decidir márgenes. */
  contentSubType?: string | null;
  statusText?: string | null;
  statusValue?: string | null;
  cardHeader?: { mainTitle: string; subTitle?: string | null } | null;
  orderDetail?: { image?: string | null; name: string; quantity?: number; price?: string | null } | null;
  buttons?: Array<{ label: string; buttonStyle?: string | null; status?: string | null }>;
}

export function TarjetaEstadoPostventa({ datos, banner, pista, tonoEstado, onAbrirPedido, onBoton }: {
  datos: DatosEstadoPostventa;
  /** Imagen de cabecera, a ancho completo. Fuera de la tarjeta, como en la referencia. */
  banner?: string | null;
  /** Pista de pie: icono y texto, también fuera de la tarjeta. */
  pista?: { icono?: string | null; texto: string } | null;
  tonoEstado?: Tono;
  onAbrirPedido?: () => void;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();
  const articulo = datos.orderDetail;
  const botones = datos.buttons ?? [];
  const cabecera = datos.cardHeader;

  return (
    <View style={estilos.conjunto}>
      {banner ? (
        <Image source={banner} style={estilos.banner} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      ) : null}

      <TarjetaEnChat>
        <CabeceraTarjeta titulo={datos.title} estado={datos.statusText} tono={tonoEstado} />

        {datos.content ? (
          <Text style={[estilos.contenido, { color: colors.textPrimary }]} numberOfLines={3}>
            {datos.content}
          </Text>
        ) : null}

        {cabecera ? (
          <View style={estilos.bloqueCabecera}>
            <Text style={[estilos.cabBloqueTitulo, { color: colors.textPrimary }]} numberOfLines={2}>
              {cabecera.mainTitle}
            </Text>
            {cabecera.subTitle ? (
              <Text style={[estilos.cabBloqueSub, { color: colors.textSecondary }]} numberOfLines={2}>
                {cabecera.subTitle}
              </Text>
            ) : null}
          </View>
        ) : null}

        {articulo ? (
          <BloquePedido
            imagen={articulo.image}
            titulo={articulo.name}
            subtitulo={[
              articulo.quantity && articulo.quantity > 1 ? `${articulo.quantity} unidades` : null,
              articulo.price,
            ].filter(Boolean).join(' · ') || null}
            onPress={onAbrirPedido}
            etiquetaAccesible={`Ver el pedido de ${articulo.name}`}
          />
        ) : null}

        {botones.length ? (
          <FilaBotones>
            {botones.map((b, i) => (
              <BotonPildora
                key={`${b.label}-${i}`}
                texto={b.label}
                contorno
                onPress={onBoton ? () => onBoton(b.label) : undefined}
              />
            ))}
          </FilaBotones>
        ) : null}
      </TarjetaEnChat>

      {pista ? (
        <View style={estilos.pista}>
          {pista.icono ? (
            <Image source={pista.icono} style={estilos.pistaIcono} contentFit="cover" transition={0} />
          ) : null}
          <Text style={[estilos.pistaTexto, { color: colors.textPrimary }]} numberOfLines={2}>
            {pista.texto}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  conjunto: { alignSelf: 'flex-start' },
  banner: { width: 282, maxWidth: '100%', height: 54, borderTopLeftRadius: radios.md, borderTopRightRadius: radios.md },
  contenido: { fontSize: tipografia.body, lineHeight: interlineado.body, marginTop: espaciado.e4 },
  bloqueCabecera: { marginTop: espaciado.e8 },
  cabBloqueTitulo: { fontSize: tipografia.body, lineHeight: interlineado.body, fontWeight: peso.titulo },
  cabBloqueSub: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e2 },
  pista: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: espaciado.e6, marginLeft: espaciado.e12, maxWidth: 258 },
  pistaIcono: { width: 18, height: 18 },
  pistaTexto: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.body, fontWeight: peso.medio },
});
