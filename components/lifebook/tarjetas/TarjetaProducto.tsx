/**
 * TarjetaProducto — el producto compartido dentro del chat, ya dentro del ÁRBOL de tarjetas.
 *
 * ── POR QUÉ SE MUDÓ AQUÍ ────────────────────────────────────────────────────
 * Vivía como un bloque de JSX dentro de `app/lifebook-chat/[id].tsx` (`if (kind === 'product')`).
 * Eso dejaba el producto fuera del árbol: no lo podía pintar el camino genérico ni reutilizar otra
 * pantalla, y el chat acumulaba una rama más. Ahora es `cardType: 'producto'`.
 *
 * LO QUE ENSEÑA, y por qué:
 *  · el **precio se resuelve al leer** (lo manda el servidor en el mensaje): si el comerciante lo
 *    cambió, se ve el bueno. Si el producto ya no está a la venta se **dice**, en vez de ofrecer
 *    comprarlo — ofrecer lo que no se puede comprar es la peor clase de botón.
 *  · la **variante que el cliente ya eligió** («Talla: M · Color: Negro»): así el comerciante sabe
 *    qué le preguntan sin que nadie tenga que describirlo.
 *  · `asking`: alguien PREGUNTA por este producto, no lo está regalando. Se dice con una línea gris.
 *
 * LO QUE NO HACE: no inventa descuentos ni disponibilidad, y no pinta un botón si no hay producto
 * que abrir.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, peso, Precio, radios, Tactil, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { ShoppingCart } from 'lucide-react-native';
import type { LbMessageProductRef } from '../../../api/messages';
import { absUrl } from '../../../api/config';

export function TarjetaProducto({ datos, onAbrirProducto }: {
  /** Lo que manda el servidor en `cardRef.payload`. `asking` viaja en el mismo objeto. */
  datos: LbMessageProductRef & { asking?: boolean };
  /** Abrir la ficha del producto. */
  onAbrirProducto?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const pr = datos;
  const puedeComprar = pr.available !== false && Boolean(onAbrirProducto && pr.id);

  const cuerpo = (
    <>
      {pr.coverUrl ? (
        <Image
          source={absUrl(pr.coverUrl)}
          style={styles.cover}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View style={[styles.cover, styles.coverVacia, { backgroundColor: alpha(colors.primary, 0.08) }]}>
          <ShoppingCart size={22} color={alpha(colors.text.primary, 0.5)} />
        </View>
      )}

      <Text style={[styles.nombre, { color: colors.textPrimary }]} numberOfLines={2}>
        {pr.title}
      </Text>

      {/* Variante ya elegida en la ficha: el comerciante sabe qué le preguntan. */}
      {pr.variantLabel ? (
        <Text style={[styles.variante, { color: colors.textSecondary }]} numberOfLines={1}>
          {pr.variantLabel}
        </Text>
      ) : null}

      {/* Aviso de consulta: se PREGUNTA por este producto. */}
      {pr.asking ? (
        <Text style={[styles.consulta, { color: colors.textSecondary }]} numberOfLines={1}>
          Consultando sobre este producto
        </Text>
      ) : null}

      {pr.priceXaf !== null && pr.priceXaf !== undefined ? (
        <Precio valor={pr.priceXaf} tamano="md" color={colors.textPrimary} style={{ marginTop: espaciado.e2 }} />
      ) : (
        <Text style={[styles.aConsultar, { color: colors.textSecondary }]} numberOfLines={1}>
          Precio a consultar
        </Text>
      )}

      {pr.available === false ? (
        <Text style={[styles.agotado, { color: colors.text.danger }]} numberOfLines={1}>
          Ya no está a la venta
        </Text>
      ) : puedeComprar ? (
        <Tactil
          onPress={() => onAbrirProducto?.(pr.id)}
          accessibilityRole="button"
          accessibilityLabel={`Ver y comprar ${pr.title}`}
          style={[styles.boton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.botonTexto, { color: colors.text.primary }]}>Comprar</Text>
        </Tactil>
      ) : null}
    </>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      {cuerpo}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radios.campo,
    padding: espaciado.e10,
    width: 224,
    maxWidth: '100%',
    flexShrink: 1,
  },
  cover: { width: '100%', height: 120, borderRadius: radios.sm },
  coverVacia: { alignItems: 'center', justifyContent: 'center' },
  nombre: { fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e6 },
  variante: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  consulta: { fontSize: tipografia.micro, fontWeight: peso.fuerte, marginTop: espaciado.e3 },
  aConsultar: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e2 },
  agotado: { fontSize: tipografia.micro, fontWeight: peso.maximo, marginTop: espaciado.e4 },
  boton: {
    marginTop: espaciado.e8,
    borderRadius: radios.full,
    paddingVertical: espaciado.e7,
    alignItems: 'center',
  },
  botonTexto: { fontWeight: peso.titulo, fontSize: tipografia.caption },
});
