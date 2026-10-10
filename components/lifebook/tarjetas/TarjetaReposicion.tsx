/**
 * TarjetaReposicion — aviso de que un producto **vuelve a estar disponible**.
 *
 * NO ES UNA DE LAS 54. Es la primera tarjeta de LifeBook que no viene de la referencia, y nace de un
 * hallazgo de la auditoría del servidor: `avisarEnChat` (`commerce.service.ts:2812`) **ya manda un
 * `payload` con el `productId`**, y lo guarda dentro de un mensaje de tipo `system`… **que el cliente
 * no mira**. Solo se pintaba el texto.
 *
 * O sea: el dato lleva tiempo viajando y se tira. Esta tarjeta lo aprovecha.
 *
 * POR QUÉ NO ES LA ALERTA DE PRECIO (tarjeta 19): se parecen y no son lo mismo. La de precio avisa
 * de que el precio ha bajado —el producto ya estaba— y esta avisa de que **hay existencias** —el
 * producto no estaba—. Son dos motivos distintos para volver a la ficha, y por eso el botón dice
 * cosas distintas.
 *
 * FORMA DE LOS DATOS: los que el servidor ya tiene de la consulta de reposición (`product_interest`):
 * `productId` · `title` · `variantName` · `imageUrl` · `priceXaf`.
 *
 * CONTRATO: `cardType: 'alerta-reposicion'`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brand, espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BloquePedido, BotonPildora, TarjetaEnChat } from './piezas';

export function TarjetaReposicion({ producto, variante, imagen, precio, onVer }: {
  producto: string;
  /** «Talla M · Azul». Si el aviso es de una variante concreta, se dice. */
  variante?: string | null;
  imagen?: string | null;
  /** Precio de hoy, ya formateado. */
  precio?: string | null;
  onVer?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat onPress={onVer} etiquetaAccesible={`${producto} vuelve a estar disponible`}>
      {/* El verde dice «buena noticia»: es lo que el verde significa en esta app (beneficio, no aviso). */}
      <Text style={[estilos.titular, { color: brand.success }]} numberOfLines={2}>
        Vuelve a estar disponible
      </Text>

      <BloquePedido
        imagen={imagen}
        titulo={producto}
        subtitulo={variante}
        detalle={precio ? (
          <Text style={[estilos.precio, { color: colors.textPrimary }]} numberOfLines={1}>{precio}</Text>
        ) : null}
        onPress={onVer}
        etiquetaAccesible={`Ver ${producto}`}
      />

      {onVer ? (
        <View style={estilos.accion}>
          <BotonPildora texto="Ver el producto" onPress={onVer} />
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  titular: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  precio: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte, marginTop: espaciado.e2 },
  accion: { flexDirection: 'row', marginTop: espaciado.e12 },
});
