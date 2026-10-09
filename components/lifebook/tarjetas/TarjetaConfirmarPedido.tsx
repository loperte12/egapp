/**
 * TarjetaConfirmarPedido — tarjeta 4 de 54 · `bcim_chat_askconfirmorder_71`
 *
 * QUÉ ES: la tarjeta que pide al comprador **revisar los datos del pedido antes de confirmarlo**.
 * Enseña el título («revisa los datos del pedido»), los pares de datos de la cuenta, el artículo y
 * dos botones: modificar y confirmar.
 *
 * FORMA DE LOS DATOS (del DSL): `name` · `phone` · `address.desc` · `logisticsType` ·
 * `isShowButton` · `accountInfoList[]{accountTypeName,accountValue}` · `status{desc,feedback}` ·
 * `goods{preview,name,count,total_amt}`.
 *
 * ANATOMÍA DE LA REFERENCIA (25 nodos): tarjeta radio 12 con TODO ella clicable · título 14/20 ·
 * lista de datos 14/18 · bloque del producto con fondo gris, radio 6 y 56 de alto · botones de 28
 * de alto con radio 14 y borde de 0,5.
 *
 * DECISIONES, y esta tarjeta las necesita más que ninguna:
 *  1. **Dos acciones con jerarquía distinta.** La referencia pinta «modificar» y «confirmar» con el
 *     mismo peso. Aquí «modificar» es contorno y «confirmar» es la acción principal con el azul de
 *     LifeBook: son dos botones, pero solo uno es el que se pulsa cuando todo está bien. Con el
 *     mismo peso, el usuario duda justo en el paso que confirma un cobro.
 *  2. **El botón de confirmar no se pinta si el servidor no lo autoriza** (`isShowButton`). La
 *     referencia ya lo contempla; aquí se respeta en vez de enseñar un botón que no hace nada.
 *  3. Los datos de la cuenta se pintan con `FilaDato`, así que heredan el mismo trato que el resto
 *     de la app; si un dato se puede copiar, se marca `copiable`.
 *
 * PENDIENTE DE CONTRATO: flujo de confirmación de pedido, que `LbMessageKind` no tiene.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, FilaDato, TarjetaEnChat,
} from './piezas';

export interface DatosConfirmarPedido {
  name?: string | null;
  phone?: string | null;
  address?: { desc?: string | null } | null;
  logisticsType?: string | null;
  /** El servidor decide si el botón de confirmar se puede ofrecer. */
  isShowButton?: boolean | null;
  accountInfoList?: Array<{ accountTypeName: string; accountValue: string }>;
  status?: { desc?: string | null; feedback?: string | null } | null;
  goods?: { preview?: string | null; name: string; count?: number; total_amt?: string | null } | null;
}

export function TarjetaConfirmarPedido({ datos, titulo, onModificar, onConfirmar, onAbrirPedido }: {
  datos: DatosConfirmarPedido;
  /** Texto de cabecera. Por defecto, el de la referencia traducido. */
  titulo?: string;
  onModificar?: () => void;
  onConfirmar?: () => void;
  onAbrirPedido?: () => void;
}) {
  const { colors } = useTheme();
  const cuenta = datos.accountInfoList ?? [];
  const bienes = datos.goods;
  const puedeConfirmar = datos.isShowButton !== false;

  const cantidad = bienes?.count && bienes.count > 1 ? `${bienes.count} unidades` : null;
  const pie = [cantidad, bienes?.total_amt].filter(Boolean).join(' · ');

  return (
    <TarjetaEnChat onPress={onAbrirPedido} etiquetaAccesible={titulo ?? 'Revisar los datos del pedido'}>
      <CabeceraTarjeta titulo={titulo ?? 'Revisa los datos del pedido'} />

      {cuenta.map((c, i) => (
        <FilaDato key={`${c.accountTypeName}-${i}`} etiqueta={c.accountTypeName} valor={c.accountValue} />
      ))}

      {datos.address?.desc ? (
        <FilaDato etiqueta={datos.logisticsType ?? 'Entrega'} valor={datos.address.desc} />
      ) : null}

      {bienes ? (
        <BloquePedido
          imagen={bienes.preview}
          titulo={bienes.name}
          subtitulo={pie || null}
          onPress={onAbrirPedido}
          etiquetaAccesible={`Ver ${bienes.name}`}
        />
      ) : null}

      {datos.status?.feedback ? (
        <Text style={[estilos.aviso, { color: colors.textSecondary }]} numberOfLines={2}>
          {datos.status.feedback}
        </Text>
      ) : null}

      <FilaBotones>
        <BotonPildora texto="Modificar" contorno onPress={onModificar} />
        {puedeConfirmar ? <BotonPildora texto="Confirmar" onPress={onConfirmar} /> : null}
      </FilaBotones>

      {datos.status?.desc ? (
        <Text style={[estilos.aviso, { color: colors.textSecondary }]} numberOfLines={2}>
          {datos.status.desc}
        </Text>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  aviso: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e6 },
});
