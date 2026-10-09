/**
 * TarjetaRecordatorioPago — tarjeta 49 de 54 · `bcim_chat_urgepay_121`
 *
 * QUÉ ES: el recordatorio de que **hay que pagar**. Es la tarjeta más grande de las 54 —40 nodos— y
 * la más antigua (existe desde la 9.25.0, frente a la 9.45.0 del resto), señal de que el aviso de
 * pago es de lo primero que se hizo en el chat de comercio.
 *
 * FORMA DE LOS DATOS (del DSL): el titular, `content` (el cuerpo) · `subType` (que decide el tamaño
 * del cuerpo) · el bloque del pedido con `image` y sus datos.
 *
 * ANATOMÍA DE LA REFERENCIA (40 nodos): tarjeta radio 12 con padding 12/10 · titular a **16/24 en
 * negrita** · cuerpo con **tamaño y alto variables según `subType`** · bloque del pedido con fondo
 * suave y radio 8, y una foto de **72** —la más grande de todas las tarjetas— · y debajo precios y
 * botones.
 *
 * DECISIONES:
 *  1. **El tamaño del cuerpo no cambia según `subType`.** La referencia tiene dos ramas que dan al
 *     texto tamaños distintos según el subcaso, y eso significa que **dos usuarios viendo el mismo
 *     aviso lo leen de distinto tamaño** según por qué rama entró. Aquí el cuerpo va siempre a 14
 *     con su interlineado: el subcaso puede cambiar el TEXTO, no la legibilidad.
 *  2. **La foto es 56**, como en las otras trece tarjetas que la usan, no 72. Es la más grande de la
 *     referencia y no hace falta: el aviso de pago no gana nada con una foto más grande que la del
 *     pedido que enseña.
 *  3. El importe a pagar es lo que el usuario viene a ver: va destacado en negrita.
 *
 * CONTRATO: `cardType: 'recordatorio-pago'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, TarjetaEnChat,
} from './piezas';

export function TarjetaRecordatorioPago({ titulo, contenido, producto, imagen, importe, botones, onAbrirPedido, onBoton }: {
  titulo: string;
  contenido?: string | null;
  producto?: string | null;
  imagen?: string | null;
  /** Lo que hay que pagar, ya formateado. */
  importe?: string | null;
  botones?: Array<{ etiqueta: string }>;
  onAbrirPedido?: () => void;
  onBoton?: (etiqueta: string) => void;
}) {
  const { colors } = useTheme();
  const acciones = botones ?? [];

  return (
    <TarjetaEnChat>
      <CabeceraTarjeta titulo={titulo} />

      {contenido ? (
        <Text style={[estilos.cuerpo, { color: colors.textPrimary }]} numberOfLines={4}>{contenido}</Text>
      ) : null}

      {producto ? (
        <BloquePedido
          imagen={imagen}
          titulo={producto}
          detalle={importe ? (
            <Text style={[estilos.importe, { color: colors.textPrimary }]} numberOfLines={1}>{importe}</Text>
          ) : null}
          onPress={onAbrirPedido}
          etiquetaAccesible={`Ver ${producto}`}
        />
      ) : null}

      {acciones.length ? (
        <FilaBotones>
          {acciones.map((b, i) => (
            <BotonPildora
              key={`${b.etiqueta}-${i}`}
              texto={b.etiqueta}
              onPress={onBoton ? () => onBoton(b.etiqueta) : undefined}
            />
          ))}
        </FilaBotones>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** 16/24 en negrita, el titular más grande de las tarjetas de comercio. */
  cuerpo: { fontSize: tipografia.body, lineHeight: interlineado.suelto, marginTop: espaciado.e8 },
  importe: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte, marginTop: espaciado.e2 },
});
