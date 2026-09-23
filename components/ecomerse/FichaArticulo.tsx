/**
 * FichaArticulo — la tarjeta del artículo EMBEBIDA en una fila de lista.
 *
 * DÓNDE SE USA. En la bandeja de avisos y en la lista de reclamaciones. En las dos el sujeto de la
 * fila es **la compra**: «esto es lo que pasó» o «esto es lo que reclamé», siempre con el artículo
 * delante. La foto, el título y el precio son lo que permite reconocer de un vistazo de qué pedido se
 * habla sin leerse el texto.
 *
 * POR QUÉ NO ES `TarjetaProducto`. Porque **no es la misma pieza**: aquélla es la tarjeta de la
 * rejilla —3:4, foto a sangre, velo, precio en pastilla porque debajo hay foto, corazón y carrito— y
 * mide el ancho completo de una columna. Aquí hace falta lo contrario: un bloque horizontal y bajo
 * que quepa dentro de una fila de lista, sin acciones y sin velo, porque el texto va al lado de la
 * foto y no encima. Meter la tarjeta grande aquí sería usar la pieza equivocada y además cargarle
 * props que no tienen sentido (`onFav` dentro de una reclamación no pinta nada).
 *
 * SE LLAMABA `FichaProductoAviso` HASTA LA FASE 5. Al llegar la lista de reclamaciones quedó claro que
 * el nombre mentía: no es «la tarjeta de un aviso», es la tarjeta del artículo de un pedido. Renombrar
 * costaba cuatro líneas; dejar el nombre viejo habría hecho que el siguiente que la reutilizara
 * creyera que está tocando la bandeja de avisos.
 *
 * LO QUE COMPARTE CON LA TARJETA GRANDE, porque son reglas del proyecto y no de la pieza:
 *   · El **precio** se pinta con `Precio` (nunca un texto suelto): una sola forma de escribir XAF.
 *   · La **foto** es `expo-image` con `contentFit="cover"` y un marco de proporción fija, para que
 *     las fotos verticales y las cuadradas no bailen la altura de la fila.
 *   · Cuando no hay foto, se dice con un icono sobre el fondo del tema; **no** se pinta un marco
 *     gris vacío, que se lee como «no ha cargado».
 *
 * LOS COLORES Y LOS GROSORES SALEN DEL TEMA Y DE LAS ESCALAS. Nada a mano: la guardia de diseño
 * (`npm run diseno`) cuenta cada `fontWeight`, `borderRadius` y `borderWidth` suelto del proyecto, y
 * esta pantalla no viene a subir esa cuenta.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Package } from 'lucide-react-native';
import { Precio, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import type { EcomerseArticuloPedido } from '../../api/ecomerse';

/** Lado del marco de la foto. Cuadrado y fijo: es lo que mantiene la fila a una altura estable. */
const LADO_FOTO = 56;

export function FichaArticulo({ articulo }: { articulo: EcomerseArticuloPedido }) {
  const { colors } = useTheme();
  const foto = articulo.photoUrl || null;

  return (
    <View style={styles.ficha}>
      <View style={[styles.marco, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {foto ? (
          <Image source={{ uri: foto }} style={styles.foto} contentFit="cover" />
        ) : (
          /* Sin foto: se dice con el icono del Mercado. Nunca un hueco gris, que se lee como error. */
          <Package size={icono.md} color={colors.textSecondary} />
        )}
      </View>

      <View style={styles.texto}>
        <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
          {articulo.title}
        </Text>
        {/* La combinación comprada («Rojo · M») sin la cual no se sabe qué unidad se sirvió. */}
        {articulo.variantName ? (
          <Text style={[styles.variante, { color: colors.textSecondary }]} numberOfLines={1}>
            {articulo.variantName}
          </Text>
        ) : null}
        <View style={styles.precioFila}>
          <Precio valor={articulo.priceXaf} tamano="sm" />
          {/* La cantidad sólo se dice cuando es más de uno: «×1» en todas las filas es ruido. */}
          {articulo.qty > 1 ? (
            <Text style={[styles.cantidad, { color: colors.textSecondary }]}>×{articulo.qty}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ficha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
  },
  marco: {
    width: LADO_FOTO,
    height: LADO_FOTO,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  foto: { width: '100%', height: '100%' },
  texto: { flex: 1 },
  titulo: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  variante: { fontSize: tipografia.micro, marginTop: espaciado.e4 / 2 },
  /* El precio y la cantidad en la misma línea, alineados por la base: la cifra manda y la cantidad
     la acompaña, que es el orden en que se leen. */
  precioFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espaciado.e8,
    marginTop: espaciado.e4,
  },
  cantidad: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
});
