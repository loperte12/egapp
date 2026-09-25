/**
 * OrderCardEnChat — LA TARJETA DEL PEDIDO DENTRO DEL CHAT (Mercado · tanda E).
 *
 * POR QUÉ EXISTE
 * La especificación del Mercado lo dice con nombres: el pedido tiene que **vivir en la
 * conversación**, porque es ahí donde el comprador y la tienda hablan de la entrega. Hoy el pedido
 * solo aparece en «Mis pedidos» (otra pantalla) y en el chat únicamente quedaban avisos sueltos de
 * texto («Tu pedido va en camino»), sin el objeto: nadie podía ver **qué** pidió ni en qué estado va.
 *
 * QUÉ ENSEÑA Y QUÉ NO
 *  · El **estado es el vivo**: el servidor lo resuelve al leer el mensaje (join con `lifebook.orders`),
 *    así que un mensaje de hace una semana enseña el estado de hoy, no el del día que se escribió.
 *  · **No inventa una fecha de llegada**: el pedido no tiene fecha estimada en el esquema, así que la
 *    tarjeta no la pone. Dice lo que sí se sabe: si es recogida en tienda, dónde; si es reparto, que
 *    se acuerda por el chat.
 *  · En un **grupo** (`social`) se lee como prueba social —«✅ Fulano compró esto»—, que es lo que
 *    pide el documento; en el chat con la tienda se lee como «Pedido LB-…».
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { alpha, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { Package } from 'lucide-react-native';
import type { LbMessageOrderRef } from '../../api/messages';
import { LB_ORDER_META, lbXaf } from '../../constants/lifebook';
import { lbPayLabel, lbTransportLabel } from '../../constants/commerce';
import { shortDate } from '../../utils/datetime';

/** Línea honesta de «qué pasa ahora», sin prometer fechas que nadie ha dado. */
function quePasaAhora(p: LbMessageOrderRef): string {
  const tienda = p.shopName ? ` en ${p.shopName}` : '';
  switch (p.status) {
    case 'delivered':
      return p.deliveredAt ? `Entregado el ${shortDate(p.deliveredAt)}` : 'Entregado';
    case 'cancelled':
      return 'El pedido se canceló';
    case 'declined':
      return 'La tienda rechazó el pedido';
    case 'ready_pickup':
      return `Listo para recoger${tienda}`;
    case 'in_transit':
      return 'En camino · la entrega se acuerda por el chat';
    case 'disputed':
      return 'Hay una reclamación abierta';
    case 'preparing':
      return 'La tienda lo está preparando';
    case 'confirmed':
      return p.deliveryMode === 'pickup'
        ? `Puedes recogerlo${tienda} cuando te avisen`
        : 'La tienda lo confirmó y te escribe por aquí';
    default:
      return p.deliveryMode === 'pickup'
        ? `Recoges${tienda} cuando la tienda lo acepte`
        : 'La tienda te contesta por este chat';
  }
}

export function OrderCardEnChat({ pedido, onOpen }: {
  pedido: LbMessageOrderRef;
  /** Abrir el pedido completo (`/lifebook-order/[id]`). */
  onOpen?: (orderId: string) => void;
}) {
  const { colors } = useTheme();
  const meta = LB_ORDER_META[pedido.status] ?? { label: pedido.status, color: colors.textSecondary };
  const primero = pedido.items[0];
  const resto = Math.max(0, pedido.items.length - 1);
  const titulo = pedido.social
    ? `✅ ${pedido.buyerName ?? 'Alguien'} compró`
    : `Pedido ${pedido.code}`;
  /**
   * LA ENTREGA DEL TICKET: en recogida se dice dónde se recoge y ya; en reparto, la dirección que dio
   * el comprador (ciudad · barrio · punto de referencia). El servidor solo manda esa dirección en la
   * tarjeta del chat comprador↔tienda, así que aquí no hay nada privado que esconder.
   */
  const direccion = [pedido.deliveryAddress?.city, pedido.deliveryAddress?.zone, pedido.deliveryAddress?.reference]
    .filter(Boolean).join(' · ');
  const entrega = !pedido.deliveryMode || pedido.deliveryMode === 'pickup'
    ? lbTransportLabel(pedido.deliveryMode ?? 'pickup')
    : [lbTransportLabel(pedido.deliveryMode), direccion].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cabecera}>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.caption, flex: 1 }} numberOfLines={2}>
          {titulo}
        </Text>
        <View style={[styles.pill, { backgroundColor: alpha(meta.color, 0.14) }]}>
          <Text style={{ color: meta.color, fontSize: 9.5, fontWeight: peso.titulo }} numberOfLines={1}>{meta.label}</Text>
        </View>
      </View>

      {primero ? (
        <View style={styles.linea}>
          {primero.mediaUrl ? (
            <Image source={primero.mediaUrl} style={styles.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          ) : (
            <View style={[styles.foto, { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }]}>
              <Package size={18} color={alpha(colors.primary, 0.55)} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }} numberOfLines={2}>
              {primero.title}
            </Text>
            {primero.variant ? (
              <Text style={{ color: colors.textSecondary, fontSize: 10.5 }} numberOfLines={1}>{primero.variant}</Text>
            ) : null}
            <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 1 }}>
              {primero.quantity > 1 ? `${primero.quantity} unidades · ` : ''}{lbXaf(primero.lineTotalXaf)}
            </Text>
          </View>
        </View>
      ) : null}

      {resto > 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: espaciado.e5 }}>
          y {resto} {resto === 1 ? 'artículo más' : 'artículos más'}
        </Text>
      ) : null}

      {pedido.social && pedido.code ? (
        <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: espaciado.e5 }} numberOfLines={1}>
          Pedido {pedido.code}{pedido.shopName ? ` · ${pedido.shopName}` : ''}
        </Text>
      ) : null}

      {/*
        EL TICKET: lo que la tienda necesita para preparar, entregar y cobrar — quién compra, cómo
        paga y dónde se entrega. Lo pidió el dueño: «en el ticket no incluye el nombre del que compra,
        la dirección, el método de envío».
        NO se pinta en las tarjetas de GRUPO (`social`): ahí solo va el aviso «Fulano compró».
      */}
      {!pedido.social ? (
        <View style={[styles.ticket, { borderTopColor: alpha(colors.border, 0.6) }]}>
          {pedido.buyerName ? (
            <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={1}>
              <Text style={styles.ticketEtiqueta}>Compra </Text>{pedido.buyerName}
            </Text>
          ) : null}
          {pedido.paymentMethod ? (
            <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={1}>
              <Text style={styles.ticketEtiqueta}>Pago </Text>{lbPayLabel(pedido.paymentMethod)}
            </Text>
          ) : null}
          {/* La tienda COBRA menos con un cupón: tiene que verlo en el ticket, no descubrirlo luego. */}
          {(pedido.discountXaf ?? 0) > 0 ? (
            <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={1}>
              <Text style={styles.ticketEtiqueta}>Cupón </Text>−{lbXaf(pedido.discountXaf ?? 0)}
            </Text>
          ) : null}
          <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={2}>
            <Text style={styles.ticketEtiqueta}>Entrega </Text>{entrega}
          </Text>
          {pedido.note ? (
            <Text style={[styles.ticketLinea, { color: colors.textSecondary }]} numberOfLines={2}>
              <Text style={styles.ticketEtiqueta}>Nota </Text>{pedido.note}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.total, { borderTopColor: alpha(colors.border, 0.6) }]}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>{lbXaf(pedido.totalXaf)}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10.5 }} numberOfLines={1}>
          {/* En las tarjetas de tienda la entrega ya va en el ticket de arriba: aquí no se repite. */}
          {pedido.social && pedido.deliveryMode ? lbTransportLabel(pedido.deliveryMode) : ''}
        </Text>
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: espaciado.e3 }} numberOfLines={2}>
        {quePasaAhora(pedido)}
      </Text>

      {onOpen && pedido.id ? (
        <Pressable
          onPress={() => onOpen(pedido.id)}
          accessibilityLabel={`Ver el pedido ${pedido.code}`}
          style={({ pressed }) => [styles.boton, { backgroundColor: alpha(colors.primary, 0.12), opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.caption }}>Ver pedido</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 236, borderRadius: 14, padding: espaciado.e10, flexShrink: 1 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 },
  pill: { borderRadius: radios.full, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3, maxWidth: 120 },
  linea: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8, alignItems: 'center' },
  foto: { width: 46, height: 46, borderRadius: radios.hermano },
  total: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8,
    marginTop: espaciado.e9, paddingTop: espaciado.e7, borderTopWidth: StyleSheet.hairlineWidth,
  },
  /** El bloque del ticket: nombre, pago, entrega y nota. */
  ticket: { marginTop: espaciado.e8, paddingTop: espaciado.e6, borderTopWidth: StyleSheet.hairlineWidth, gap: espaciado.e2 },
  ticketLinea: { fontSize: 10.5, lineHeight: 14 },
  ticketEtiqueta: { color: '#86909C', fontSize: 10, fontWeight: peso.titulo },
  boton: { marginTop: espaciado.e8, borderRadius: radios.full, paddingVertical: espaciado.e7, alignItems: 'center' },
});
