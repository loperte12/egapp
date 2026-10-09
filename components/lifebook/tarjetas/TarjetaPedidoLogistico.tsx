/**
 * TarjetaPedidoLogistico — tarjeta 27 de 54 · `bcim_chat_logisticorder_215`
 *
 * QUÉ ES: el pedido visto desde logística. Enseña el artículo con su etiqueta (por ejemplo «regalo»),
 * lo que se pagó, el último movimiento del envío y los botones de gestión.
 *
 * FORMA DE LOS DATOS (del DSL): `title` · `skus[]{skuTag,image,skuName,skuSpecification,skuQuantity}`
 * · `skuCount` · `totalPrice` · `recentTrackingRecord{subNodeDesc}` · `buttons[]{buttonValue,
 * buttonStatus}`.
 *
 * ANATOMÍA DE LA REFERENCIA (28 nodos): tarjeta radio 12 · título 14/20 en peso medio con padding
 * 10/9 · fila del artículo con la foto de 56 y, al lado, **un bloque con fondo suave y sin radio**
 * que lleva el nombre a 14/20, la etiqueta del artículo a 14 en peso medio, el precio a 14 en
 * negrita y debajo la especificación, el recuento, el total y las unidades a 12/18 en gris apagado ·
 * después el envío y los botones.
 *
 * DECISIONES:
 *  1. **El bloque del artículo usa la pieza compartida** (radio 4), aunque la referencia no le ponga
 *     radio. La diferencia es de 4 píxeles y la pieza ya la usan trece tarjetas: introducir aquí una
 *     variante sin radio sería crear la excepción que la auditoría vino a quitar.
 *  2. **Los datos fríos van juntos en una línea**, no repartidos en cuatro columnas como en la
 *     referencia. Su reparto responde a que su tarjeta es más ancha; aquí, con el patrón, una línea
 *     separada por puntos se lee mejor y no obliga a buscar el dato.
 *  3. **El estado del botón se respeta**: la referencia trae `buttonStatus` por botón. Un botón
 *     deshabilitado se pinta como tal en vez de ofrecerse y fallar al pulsarlo.
 *
 * CONTRATO: `cardType: 'pedido-logistico'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, LineaCronologia, TarjetaEnChat,
} from './piezas';

export function TarjetaPedidoLogistico({ datos, onAbrirPedido, onBoton }: {
  datos: {
    title?: string | null;
    skus?: Array<{
      skuTag?: string | null; image?: string | null; skuName?: string;
      skuSpecification?: string | null; skuQuantity?: number | string | null;
    }>;
    skuCount?: number | string | null;
    totalPrice?: string | null;
    recentTrackingRecord?: { subNodeDesc?: string | null } | null;
    buttons?: Array<{ buttonValue?: string; buttonStatus?: string | null }>;
  };
  onAbrirPedido?: () => void;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();
  const sku = datos.skus?.[0];
  const botones = datos.buttons ?? [];

  /** Los datos fríos, juntos: especificación · recuento · unidades. */
  const frios = [
    sku?.skuSpecification,
    datos.skuCount != null ? `${datos.skuCount} artículos` : null,
    sku?.skuQuantity != null ? `x${sku.skuQuantity}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <TarjetaEnChat>
      <CabeceraTarjeta titulo={datos.title ?? 'Tu pedido'} />

      {sku ? (
        <BloquePedido
          imagen={sku.image}
          titulo={sku.skuName ?? ''}
          subtitulo={frios || null}
          detalle={
            <View style={estilos.precioLinea}>
              {datos.totalPrice ? (
                <Text style={[estilos.precio, { color: colors.textPrimary }]} numberOfLines={1}>
                  {datos.totalPrice}
                </Text>
              ) : null}
              {sku.skuTag ? (
                <Text style={[estilos.etiqueta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {sku.skuTag}
                </Text>
              ) : null}
            </View>
          }
          onPress={onAbrirPedido}
          etiquetaAccesible={sku.skuName ? `Ver ${sku.skuName}` : 'Ver el pedido'}
        />
      ) : null}

      {datos.recentTrackingRecord?.subNodeDesc ? (
        <LineaCronologia titulo={datos.recentTrackingRecord.subNodeDesc} ultimo />
      ) : null}

      {botones.length ? (
        <FilaBotones>
          {botones.map((b, i) => (
            <BotonPildora
              key={`${b.buttonValue}-${i}`}
              texto={b.buttonValue ?? ''}
              contorno
              // Un botón deshabilitado se pinta como tal, no se ofrece para que falle al pulsarlo.
              onPress={b.buttonStatus === 'disabled' ? undefined : (onBoton ? () => onBoton(b.buttonValue ?? '') : undefined)}
            />
          ))}
        </FilaBotones>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  precioLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e2 },
  precio: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte },
  etiqueta: { fontSize: tipografia.caption, lineHeight: interlineado.caption },
});
