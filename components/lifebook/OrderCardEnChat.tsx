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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REESCRITURA DE PRESENTACIÓN (09/10/2026) — la LÓGICA NO SE HA TOCADO.
 *
 * POR QUÉ: auditoría contra la tarjeta de referencia de Xiaohongshu (`bcim_chat_order_3`, APK
 * 9.49.1 descompilado). La lógica de dominio de esta tarjeta es mejor que la de la referencia —9
 * estados, ticket, cupón, regla de privacidad en grupos— y **se conserva entera**. Lo que se
 * rehace es la capa visual, que tenía tres defectos medidos:
 *
 *   1. Usaba `Pressable` en vez de `Tactil`. El kit lo dice: en una app con dinero, tocar y no ver
 *      nada durante 200 ms se lee como «no ha cogido el toque». Eran **0 usos de `Tactil` en toda
 *      la mensajería**.
 *   2. `lineHeight: 14` escrito a mano. Ahora usa la escala `interlineado` del kit.
 *   3. Proporciones fuera del patrón aprobado: radio 14 → 12, padding 10 → 12, foto 46 → 56,
 *      y el producto pasa a ir dentro de un bloque con fondo suave, como la referencia.
 *
 * Lo que NO se toca: `quePasaAhora`, el ticket, la variante social, el cupón, ni la firma pública
 * (`pedido`, `onOpen`). Nada que consuma esta tarjeta tiene que cambiar.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, interlineado, peso, Precio, radios, Tactil, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
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

  const accionable = Boolean(onOpen && pedido.id);

  const cuerpo = (
    <>
      {/* Cabecera: título del pedido ←→ estado. Igual que la referencia. */}
      <View style={styles.cabecera}>
        <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
          {titulo}
        </Text>
        <View style={[styles.pill, { backgroundColor: alpha(meta.color, 0.14) }]}>
          <Text style={[styles.pillTexto, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
        </View>
      </View>

      {/* Bloque del producto: fondo suave, radio pequeño, foto 56. El patrón de la referencia. */}
      {primero ? (
        <View style={[styles.bloque, { backgroundColor: colors.surface }]}>
          {primero.mediaUrl ? (
            <Image
              source={primero.mediaUrl}
              style={styles.foto}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : (
            <View style={[styles.foto, styles.fotoVacia, { backgroundColor: alpha(colors.primary, 0.08) }]}>
              <Package size={22} color={alpha(colors.text.primary, 0.55)} />
            </View>
          )}
          <View style={styles.datos}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]} numberOfLines={2}>
              {primero.title}
            </Text>
            {primero.variant ? (
              <Text style={[styles.variante, { color: colors.textSecondary }]} numberOfLines={1}>
                {primero.variant}
              </Text>
            ) : null}
            <Text style={[styles.cantidad, { color: colors.textSecondary }]} numberOfLines={1}>
              {primero.quantity > 1 ? `${primero.quantity} unidades · ` : ''}{lbXaf(primero.lineTotalXaf)}
            </Text>
          </View>
        </View>
      ) : null}

      {resto > 0 ? (
        <Text style={[styles.resto, { color: colors.textSecondary }]} numberOfLines={1}>
          y {resto} {resto === 1 ? 'artículo más' : 'artículos más'}
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
              <Text style={[styles.ticketEtiqueta, { color: colors.textSecondary }]}>Compra </Text>{pedido.buyerName}
            </Text>
          ) : null}
          {pedido.paymentMethod ? (
            <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={1}>
              <Text style={[styles.ticketEtiqueta, { color: colors.textSecondary }]}>Pago </Text>{lbPayLabel(pedido.paymentMethod)}
            </Text>
          ) : null}
          {/* La tienda COBRA menos con un cupón: tiene que verlo en el ticket, no descubrirlo luego. */}
          {(pedido.discountXaf ?? 0) > 0 ? (
            <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={1}>
              <Text style={[styles.ticketEtiqueta, { color: colors.textSecondary }]}>Cupón </Text>−{lbXaf(pedido.discountXaf ?? 0)}
            </Text>
          ) : null}
          <Text style={[styles.ticketLinea, { color: colors.textPrimary }]} numberOfLines={2}>
            <Text style={[styles.ticketEtiqueta, { color: colors.textSecondary }]}>Entrega </Text>{entrega}
          </Text>
          {pedido.note ? (
            <Text style={[styles.ticketLinea, { color: colors.textSecondary }]} numberOfLines={2}>
              <Text style={[styles.ticketEtiqueta, { color: colors.textSecondary }]}>Nota </Text>{pedido.note}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Total. En las tarjetas de tienda la entrega ya va arriba: aquí no se repite. */}
      <View style={[styles.total, { borderTopColor: alpha(colors.border, 0.6) }]}>
        <Precio valor={pedido.totalXaf} tamano="md" color={colors.textPrimary} />
        <Text style={[styles.totalNota, { color: colors.textSecondary }]} numberOfLines={1}>
          {pedido.social && pedido.deliveryMode ? lbTransportLabel(pedido.deliveryMode) : ''}
        </Text>
      </View>

      <Text style={[styles.quePasa, { color: colors.textSecondary }]} numberOfLines={2}>
        {quePasaAhora(pedido)}
      </Text>

      {/* Pie débil de dos líneas, como la referencia: el código y la fecha. */}
      <View style={styles.pie}>
        {pedido.code ? (
          <Text style={[styles.pieLinea, { color: colors.textSecondary }]} numberOfLines={1}>
            Pedido {pedido.code}{pedido.shopName ? ` · ${pedido.shopName}` : ''}
          </Text>
        ) : null}
        {pedido.createdAt ? (
          <Text style={[styles.pieLinea, { color: colors.textSecondary }]} numberOfLines={1}>
            {shortDate(pedido.createdAt)}
          </Text>
        ) : null}
      </View>

      {accionable ? (
        <View style={[styles.boton, { backgroundColor: alpha(colors.primary, 0.12) }]}>
          <Text style={[styles.botonTexto, { color: colors.textPrimary }]}>Ver pedido</Text>
        </View>
      ) : null}
    </>
  );

  /*
   * Si hay acción, TODA la tarjeta es el objetivo del toque —como en la referencia, donde la
   * tarjeta entera navega— y el botón de abajo es solo la señal visible. Si no la hay, es un
   * `View` normal: no se envuelve en un control que no hace nada.
   */
  if (accionable) {
    return (
      <Tactil
        onPress={() => onOpen?.(pedido.id)}
        accessibilityRole="button"
        accessibilityLabel={`Ver el pedido ${pedido.code}`}
        style={[styles.card, { backgroundColor: colors.card }]}
      >
        {cuerpo}
      </Tactil>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      {cuerpo}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Ancho del patrón aprobado (290 en el dibujo, menos el aire del contenedor). `maxWidth` evita
   *  que desborde en pantallas estrechas sin fijar un ancho que no se adapte. */
  card: {
    width: 282,
    maxWidth: '100%',
    borderRadius: radios.md,
    padding: espaciado.e12,
    flexShrink: 1,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  titulo: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte },
  pill: { borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, maxWidth: 128 },
  pillTexto: { fontSize: tipografia.detalle, lineHeight: interlineado.caption, fontWeight: peso.titulo },

  bloque: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    marginTop: espaciado.e8, borderRadius: radios.punta, padding: espaciado.e8,
  },
  foto: { width: 56, height: 56, borderRadius: radios.punta },
  fotoVacia: { alignItems: 'center', justifyContent: 'center' },
  datos: { flex: 1, minWidth: 0 },
  nombre: { fontSize: tipografia.body, lineHeight: interlineado.amplio },
  variante: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e2 },
  cantidad: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e2 },

  resto: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e5 },

  /** El bloque del ticket: nombre, pago, cupón, entrega y nota. */
  ticket: { marginTop: espaciado.e8, paddingTop: espaciado.e8, borderTopWidth: StyleSheet.hairlineWidth, gap: espaciado.e2 },
  ticketLinea: { fontSize: tipografia.micro, lineHeight: interlineado.micro },
  ticketEtiqueta: { fontSize: tipografia.nota, fontWeight: peso.titulo },

  total: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8,
    marginTop: espaciado.e9, paddingTop: espaciado.e7, borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalNota: { fontSize: tipografia.micro, lineHeight: interlineado.micro },

  quePasa: { fontSize: tipografia.micro, lineHeight: interlineado.micro, marginTop: espaciado.e4 },

  pie: { marginTop: espaciado.e6 },
  pieLinea: { fontSize: tipografia.nota, lineHeight: interlineado.caption },

  boton: { marginTop: espaciado.e8, borderRadius: radios.full, paddingVertical: espaciado.e7, alignItems: 'center' },
  botonTexto: { fontSize: tipografia.caption, lineHeight: interlineado.caption, fontWeight: peso.titulo },
});
