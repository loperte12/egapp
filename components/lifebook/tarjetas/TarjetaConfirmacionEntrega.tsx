/**
 * TarjetaConfirmacionEntrega — `bcim_chat_askconfirmorder_71` + el CÓDIGO de entrega de LifeBook.
 *
 * QUÉ ES: la tarjeta con la que se cierra una entrega contra reembolso. En la referencia
 * (`bcim_chat_askconfirmorder_71`, «请核对订单信息») el comprador repasa los datos de su pedido y
 * pulsa 修改/确认. En LifeBook hay un paso más que la referencia **no** tiene como tarjeta: el
 * comprador enseña un **código de 4 dígitos** y la tienda lo teclea para dar el pedido por
 * entregado (`confirmDeliveryCode`). Esa tarjeta no existía; aquí está, con la anatomía de la
 * referencia y el código dentro.
 *
 * FORMA DE LOS DATOS (adaptada del DSL `askconfirmorder_71`):
 *   `goods{preview,name,count,total_amt}` · `address{desc}` · `logisticsType` ·
 *   `status{desc,feedback}` · `isShowButton` · `buttons[]{id,label}` — más `deliveryCode`, que es
 *   lo propio de LifeBook.
 *
 * DECISIONES:
 *  1. **El código manda.** Va en un bloque propio, en cifra grande y monoespaciada: es lo que el
 *     comprador tiene que leer en voz alta. Sin el, la tarjeta sería un resumen de pedido más.
 *  2. **Dos acciones, una jerarquía.** «Ver pedido» en contorno y «Copiar código» como acción
 *     principal: el código se copia para pasarlo por el chat o dictarlo.
 *  3. **Si ya no hay código** (porque ya se usó o el pedido no es contra reembolso), el bloque
 *     desaparece y queda la tarjeta de estado — no un hueco con un guion.
 *  4. El `status.desc` (chip) dice en qué punto está la entrega; `status.feedback` explica qué
 *     hacer. Son los dos campos que ya usa la tarjeta de la referencia.
 *
 * CONTRATO: `cardType: 'confirmacion-entrega'`. Payload = el de la foto del pedido
 * (`fotoDelPedido`: `orderId`, `code`, `items[]`, `totalXaf`, `status`, `title`) más
 * `deliveryCode`. El registro acepta también la forma explícita con `goods`/`address`/`status`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { alpha, espaciado, interlineado, peso, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, FilaDato, TarjetaEnChat,
} from './piezas';

export interface DatosConfirmacionEntrega {
  orderId?: string | null;
  orderNo?: string | null;
  /** El código que el comprador enseña al repartidor. `null` si ya se usó o no aplica. */
  deliveryCode?: string | null;
  goods?: { preview?: string | null; name: string; count?: number; total_amt?: string | null } | null;
  address?: { desc?: string | null } | null;
  logisticsType?: string | null;
  status?: { desc?: string | null; feedback?: string | null } | null;
  isShowButton?: boolean | null;
  buttons?: Array<{ id?: string | null; label?: string | null }>;
}

export function TarjetaConfirmacionEntrega({
  datos, titulo, onAbrirPedido, onCopiarCodigo, onBoton,
}: {
  datos: DatosConfirmacionEntrega;
  /** Texto de cabecera; por defecto, «Confirma la entrega». */
  titulo?: string;
  onAbrirPedido?: () => void;
  onCopiarCodigo?: (codigo: string) => void;
  onBoton?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const bienes = datos.goods;
  const codigo = String(datos.deliveryCode ?? '').trim();
  const pie = [
    bienes?.count && bienes.count > 1 ? `${bienes.count} unidades` : null,
    bienes?.total_amt,
  ].filter(Boolean).join(' · ');

  return (
    <TarjetaEnChat etiquetaAccesible={titulo ?? 'Confirma la entrega'}>
      <CabeceraTarjeta
        titulo={titulo ?? 'Confirma la entrega'}
        estado={datos.status?.desc ?? undefined}
      />

      {/* EL CÓDIGO, en su bloque: es la razón de ser de esta tarjeta. */}
      {codigo ? (
        <View style={[estilos.codigoCaja, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.28) }]}>
          <Text style={[estilos.codigoEtiqueta, { color: colors.textSecondary }]}>Código de entrega</Text>
          <Text style={[estilos.codigo, { color: colors.textPrimary }]} accessibilityLabel={`Código de entrega ${codigo.split('').join(' ')}`}>
            {codigo}
          </Text>
          <Text style={[estilos.codigoAyuda, { color: colors.textSecondary }]} numberOfLines={2}>
            Enséñaselo al repartidor: con él se confirma la entrega y el cobro.
          </Text>
        </View>
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

      {datos.address?.desc ? (
        <FilaDato etiqueta={datos.logisticsType ?? 'Entrega'} valor={datos.address.desc} />
      ) : null}

      {datos.status?.feedback ? (
        <Text style={[estilos.aviso, { color: colors.textSecondary }]} numberOfLines={3}>
          {datos.status.feedback}
        </Text>
      ) : null}

      {datos.isShowButton !== false ? (
        <FilaBotones>
          {onAbrirPedido ? <BotonPildora texto="Ver pedido" contorno onPress={onAbrirPedido} /> : null}
          {codigo && onCopiarCodigo ? (
            <BotonPildora texto="Copiar código" onPress={() => onCopiarCodigo(codigo)} />
          ) : null}
          {(datos.buttons ?? []).filter((b) => b?.id).slice(0, 2).map((b, i) => (
            <BotonPildora
              key={`${b.id}-${i}`}
              texto={b.label ?? String(b.id)}
              onPress={() => b.id && onBoton?.(String(b.id))}
            />
          ))}
        </FilaBotones>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  codigoCaja: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.md,
    paddingVertical: espaciado.e10, paddingHorizontal: espaciado.e12, marginBottom: espaciado.e10,
  },
  codigoEtiqueta: { fontSize: tipografia.caption, lineHeight: interlineado.caption },
  codigo: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.fuerte, letterSpacing: 6, marginTop: espaciado.e2 },
  codigoAyuda: { fontSize: tipografia.nota, lineHeight: interlineado.caption, marginTop: espaciado.e2 },
  aviso: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e6 },
});
