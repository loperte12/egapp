/**
 * TarjetaCertificado — tarjeta 6 de 54 · `bcim_chat_certitem_212`
 *
 * QUÉ ES: el estado de una **solicitud de cualificación de categoría** (el permiso que necesita una
 * tienda para vender ciertos productos). Enseña la marca, el tipo de solicitud, el número de
 * expediente y la fecha.
 *
 * FORMA DE LOS DATOS (del DSL): `statusDesc` · `brandLogo` · `brandName` · `applyTypeDesc` ·
 * `applyId` · `createTime`.
 *
 * ANATOMÍA DE LA REFERENCIA (16 nodos): tarjeta radio 12 padding 12 · cabecera 16/24 con el estado
 * coloreado · bloque de marca con fondo suave y radio 8 (logo de 56 + nombre 14/20 + tipo 12/18) ·
 * filas de expediente y fecha a 12/18 con la etiqueta y el valor en el mismo gris.
 *
 * DECISIÓN DE IDENTIDAD: en la referencia la etiqueta («申请编号：») y el valor van los dos en el
 * mismo gris apagado, así que **el dato no destaca de su etiqueta**. Aquí se usa `FilaDato`: la
 * etiqueta en gris y el valor en el color de texto principal. Un número de expediente es un dato
 * que el usuario tiene que leer y a veces copiar, no una nota al pie.
 *
 * PENDIENTE DE CONTRATO: no hay tipo de solicitud/certificado en `LbMessageKind`.
 */
import React from 'react';
import {
  BloquePedido, CabeceraTarjeta, FilaDato, TarjetaEnChat, type Tono,
} from './piezas';

export interface DatosCertificado {
  statusDesc?: string | null;
  brandLogo?: string | null;
  brandName?: string | null;
  applyTypeDesc?: string | null;
  applyId?: string | null;
  createTime?: string | null;
}

export function TarjetaCertificado({ datos, titulo, tonoEstado, onCopiar }: {
  datos: DatosCertificado;
  titulo?: string;
  tonoEstado?: Tono;
  onCopiar?: (valor: string) => void;
}) {
  return (
    <TarjetaEnChat>
      <CabeceraTarjeta
        titulo={titulo ?? 'Solicitud de cualificación'}
        estado={datos.statusDesc}
        tono={tonoEstado}
      />

      {datos.brandName ? (
        <BloquePedido
          imagen={datos.brandLogo}
          titulo={datos.brandName}
          subtitulo={datos.applyTypeDesc ? `Tipo: ${datos.applyTypeDesc}` : null}
        />
      ) : null}

      {datos.applyId ? (
        <FilaDato
          etiqueta="Expediente"
          valor={datos.applyId}
          copiable
          onCopiar={onCopiar ? () => onCopiar(datos.applyId as string) : undefined}
        />
      ) : null}

      {datos.createTime ? <FilaDato etiqueta="Fecha" valor={datos.createTime} /> : null}
    </TarjetaEnChat>
  );
}
