/**
 * TarjetaPostventa — tarjeta 1 de 54 · `bcim_chat_aftersalecard_123`
 *
 * QUÉ ES: el caso de postventa dentro del chat. Enseña el título del caso, su estado, una
 * descripción, los datos de gestión (con botón de copiar en los números), el artículo del pedido
 * y —si la hay— la última novedad del envío, más los botones de acción.
 *
 * DE DÓNDE SALE LA FORMA DE LOS DATOS: no está inventada. Se extrajo de los enlaces del DSL de la
 * referencia (`content.data.content.X`), con `tools/enlaces-tarjeta.py`:
 *
 *   title · content · statusInfo{text,theme} · descriptionList[]{label,value,extra,supportCopy,status}
 *   orderInfo{image,name,quantity,price} · returnsInfo{...} · shipmentLatestRecord{expressCompanyIconUrl,
 *   eventDesc,subNodeDesc,eventAt} · xhsAppButtons[]{label,theme}
 *
 * ANATOMÍA DE LA REFERENCIA (33 nodos): cabecera título+estado (15/22) · descripción (13) · lista de
 * campos (14) con valor subrayado y copiar · bloque del pedido 56pt con fondo suave y radio 8 ·
 * cronología con icono de 14 y raíl de 2pt · botones en píldora (radio 1000, borde 0,5) con el
 * tema de cada uno.
 *
 * QUÉ SE ADAPTA: el color de acción es el azul de LifeBook, no el rojo de ellos; los estados usan
 * la semántica de la casa; los tamaños y radios son del kit (12 en la tarjeta, 8 en el bloque);
 * y el envío se pinta solo si existe, en vez de dejar un hueco.
 *
 * PENDIENTE DE CONTRATO: `LbMessageKind` no tiene un tipo de postventa. Esta tarjeta se puede
 * construir y probar, pero **el servidor todavía no puede mandarla**. Va en el grupo de las ~38
 * que necesitan ampliar el contrato.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  BloquePedido, BotonPildora, CabeceraTarjeta, FilaBotones, FilaDato, LineaCronologia,
  PieDebil, TarjetaEnChat, type Tono,
} from './piezas';

/** Datos del caso de postventa, con los campos que declara la referencia. */
export interface DatosPostventa {
  title: string;
  content?: string | null;
  statusInfo?: { text: string; theme?: string | null } | null;
  descriptionList?: Array<{
    label: string;
    value: string;
    extra?: string | null;
    /** El campo se puede copiar: la referencia le pone icono y subrayado. */
    supportCopy?: boolean;
    status?: string | null;
  }>;
  orderInfo?: { image?: string | null; name: string; quantity?: number; price?: string | null } | null;
  returnsInfo?: { image?: string | null; name: string; quantity?: number; price?: string | null } | null;
  shipmentLatestRecord?: {
    expressCompanyIconUrl?: string | null;
    eventDesc: string;
    subNodeDesc?: string | null;
    eventAt?: string | null;
  } | null;
  xhsAppButtons?: Array<{ label: string; theme?: string | null }>;
}

export function TarjetaPostventa({ datos, tonoEstado, onAbrirPedido, onBoton, onCopiar }: {
  datos: DatosPostventa;
  /** Tono del estado. Va aparte a propósito: el mapeo desde `statusInfo.theme` de la referencia
   *  no se puede confirmar sin ver sus valores reales, así que no se adivina aquí. */
  tonoEstado?: Tono;
  onAbrirPedido?: () => void;
  onBoton?: (etiqueta: string) => void;
  onCopiar?: (valor: string) => void;
}) {
  const { colors } = useTheme();
  const articulo = datos.orderInfo ?? datos.returnsInfo;
  const envio = datos.shipmentLatestRecord;
  const botones = datos.xhsAppButtons ?? [];
  const campos = datos.descriptionList ?? [];

  return (
    <TarjetaEnChat>
      <CabeceraTarjeta titulo={datos.title} estado={datos.statusInfo?.text} tono={tonoEstado} />

      {datos.content ? (
        <Text style={[estilos.descripcion, { color: colors.textPrimary }]} numberOfLines={3}>
          {datos.content}
        </Text>
      ) : null}

      {campos.map((c, i) => (
        <FilaDato
          key={`${c.label}-${i}`}
          etiqueta={c.label}
          valor={c.value}
          extra={c.extra}
          copiable={c.supportCopy}
          onCopiar={onCopiar ? () => onCopiar(c.value) : undefined}
        />
      ))}

      {articulo ? (
        <BloquePedido
          imagen={articulo.image}
          titulo={articulo.name}
          subtitulo={
            articulo.quantity && articulo.quantity > 1 ? `${articulo.quantity} unidades` : null
          }
          detalle={articulo.price ? (
            <Text style={[estilos.importe, { color: colors.textPrimary }]} numberOfLines={1}>
              {articulo.price}
            </Text>
          ) : null}
          onPress={onAbrirPedido}
          etiquetaAccesible={`Ver el pedido de ${articulo.name}`}
        />
      ) : null}

      {envio ? (
        <LineaCronologia
          icono={envio.expressCompanyIconUrl}
          titulo={envio.eventDesc}
          detalle={[envio.subNodeDesc, envio.eventAt].filter(Boolean).join(' · ') || null}
          ultimo
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
  );
}

const estilos = StyleSheet.create({
  descripcion: { fontSize: tipografia.detalle, lineHeight: interlineado.body, marginTop: espaciado.e4 },
  importe: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte, marginTop: espaciado.e2 },
});
