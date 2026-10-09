/**
 * REGISTRO DE TARJETAS DE CHAT — el motor de la opción «un tipo genérico».
 *
 * CÓMO LO HACE LA REFERENCIA, que es lo que se copia aquí:
 * 小红书 tiene 54 tarjetas de comercio dentro de la conversación y **no tiene 54 tipos de
 * mensaje**. Tiene un motor que lee una ficha, y 54 fichas. La ficha se identifica por su nombre
 * (`bcim_chat_coupon_19`), declara su versión y la versión mínima de app que la entiende
 * (`min_android_version`), y trae sus datos.
 *
 * Este fichero es ese motor, en pequeño: un mapa de `cardType` a componente.
 *
 * QUÉ RESUELVE
 *  1. **Añadir una tarjeta deja de ser un cambio de servidor.** Se escribe el componente, se
 *     apunta aquí, y ya. Antes eso era un tipo nuevo en `LbMessageKind`, una migración y un
 *     despliegue — 38 veces.
 *  2. **Una tarjeta desconocida no rompe el chat.** Si el servidor manda un `cardType` que esta
 *     versión no tiene, se pinta el respaldo y la conversación sigue. Y si la app es más vieja que
 *     la `minAppVersion` de la tarjeta, también: puede haber cambiado la forma de los datos, así
 *     que no se intenta.
 *
 * POR QUÉ `render` Y NO PASAR PROPS DIRECTAMENTE: cada tarjeta tiene su propia forma de datos
 * (`DatosCupon`, `DatosPostventa`…) y sus propios nombres de prop. El registro las unifica con una
 * firma común —`(datos, acciones) => nodo`— para que el motor no tenga que saber nada de ninguna.
 */
import React, { type ReactNode } from 'react';
import Constants from 'expo-constants';
import type { LbMessageCardRef } from '../../../api/messages';
import { TarjetaPostventa, type DatosPostventa } from './TarjetaPostventa';
import { TarjetaEstadoPostventa, type DatosEstadoPostventa } from './TarjetaEstadoPostventa';
import { TarjetaConfirmarPedido, type DatosConfirmarPedido } from './TarjetaConfirmarPedido';
import { TarjetaCertificado, type DatosCertificado } from './TarjetaCertificado';
import { TarjetaCompuesta, type ParrafoCompuesto } from './TarjetaCompuesta';
import { TarjetaCupon, type DatosCupon } from './TarjetaCupon';
import { TarjetaCuponCompacto, type DatosCuponCompacto } from './TarjetaCuponCompacto';
import { TarjetaReclamarCupon, type DatosReclamarCupon } from './TarjetaReclamarCupon';
import { TarjetaBienvenida } from './TarjetaBienvenida';
import { TarjetaEvidencias } from './TarjetaEvidencias';
import { TarjetaAlertaPrecio } from './TarjetaAlertaPrecio';
import { TarjetaInvitacionResena } from './TarjetaInvitacionResena';
import { TarjetaEnlace } from './TarjetaEnlace';
import { TarjetaEnlaceBoton } from './TarjetaEnlaceBoton';
import { TarjetaTextoAcciones } from './TarjetaTextoAcciones';
import { TarjetaAviso } from './TarjetaAviso';
import { TarjetaServicio } from './TarjetaServicio';
import { TarjetaPedidoLogistico } from './TarjetaPedidoLogistico';
import { TarjetaEntregaNegociada } from './TarjetaEntregaNegociada';
import { TarjetaCancelacion } from './TarjetaCancelacion';
import { TarjetaAvisoProducto } from './TarjetaAvisoProducto';
import { TarjetaConsulta } from './TarjetaConsulta';
import { TarjetaSobre } from './TarjetaSobre';
import { TarjetaSolicitudPostventa } from './TarjetaSolicitudPostventa';
import { TarjetaCobro } from './TarjetaCobro';
import { TarjetaCola } from './TarjetaCola';
import { TarjetaRecordatorioPago } from './TarjetaRecordatorioPago';
import { TarjetaVideo } from './TarjetaVideo';
import { TarjetaInfraccion } from './TarjetaInfraccion';
import { TarjetaNota } from './TarjetaNota';
import { TarjetaNoSoportada } from './TarjetaNoSoportada';

/** Acciones que el chat presta a cualquier tarjeta. */
export interface AccionesTarjeta {
  /** Un botón de la tarjeta. Llega la etiqueta tal cual la mandó el servidor. */
  onBoton?: (etiqueta: string) => void;
  /** Un enlace dentro de una tarjeta compuesta. */
  onEnlace?: (url: string) => void;
  /** Copiar un dato (número de expediente, de gestión…). */
  onCopiar?: (valor: string) => void;
  /** Abrir el pedido o el objeto al que apunta la tarjeta. */
  onAbrir?: (id: string) => void;
}

interface Entrada {
  /** Cómo se pinta. `datos` viene de `cardRef.payload`. */
  render: (datos: unknown, acciones: AccionesTarjeta) => ReactNode;
  /** Para qué sirve, en una línea. Es documentación viva del registro. */
  descripcion: string;
}

/**
 * El mapa. La clave es el `cardType` que manda el servidor.
 *
 * Se usan nombres cortos de negocio, no los de la referencia (`bcim_chat_coupon_19`): el nombre de
 * la referencia es su código interno, y lo que viaja por el cable debe decir QUÉ es, no de dónde
 * se copió. La trazabilidad con la referencia vive en la cabecera de cada componente.
 */
const REGISTRO: Record<string, Entrada> = {
  postventa: {
    descripcion: 'Caso de postventa: estado, gestión, artículo y envío',
    render: (d, a) => (
      <TarjetaPostventa
        datos={d as DatosPostventa}
        onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
        onBoton={a.onBoton}
        onCopiar={a.onCopiar}
      />
    ),
  },
  'postventa-estado': {
    descripcion: 'Estado de postventa con banner, artículo y botones',
    render: (d, a) => (
      <TarjetaEstadoPostventa
        datos={d as DatosEstadoPostventa}
        onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
        onBoton={a.onBoton}
      />
    ),
  },
  'confirmar-pedido': {
    descripcion: 'Revisar los datos del pedido antes de confirmarlo',
    render: (d, a) => (
      <TarjetaConfirmarPedido
        datos={d as DatosConfirmarPedido}
        onConfirmar={a.onBoton ? () => a.onBoton?.('Confirmar') : undefined}
        onModificar={a.onBoton ? () => a.onBoton?.('Modificar') : undefined}
      />
    ),
  },
  certificado: {
    descripcion: 'Solicitud de cualificación de categoría',
    render: (d, a) => <TarjetaCertificado datos={d as DatosCertificado} onCopiar={a.onCopiar} />,
  },
  compuesta: {
    descripcion: 'Mensaje compuesto: párrafos con texto, enlaces y recursos',
    render: (d, a) => (
      <TarjetaCompuesta
        parrafos={(d as { paragraphs?: ParrafoCompuesto[] })?.paragraphs ?? []}
        onEnlace={a.onEnlace}
      />
    ),
  },
  cupon: {
    descripcion: 'Cupón con importe, mínimo de gasto y validez',
    render: (d, a) => <TarjetaCupon datos={d as DatosCupon} onUsar={a.onBoton ? () => a.onBoton?.('Usar cupón') : undefined} />,
  },
  'cupon-compacto': {
    descripcion: 'Cupón en su versión corta, con la muesca',
    render: (d, a) => <TarjetaCuponCompacto datos={d as DatosCuponCompacto} onUsar={a.onBoton ? () => a.onBoton?.('Usar cupón') : undefined} />,
  },
  'cupon-reclamar': {
    descripcion: 'Oferta de un cupón para reclamar',
    render: (d, a) => <TarjetaReclamarCupon datos={d as DatosReclamarCupon} onBoton={a.onBoton} />,
  },
  bienvenida: {
    descripcion: 'Saludo de apertura de una conversación con una tienda',
    render: (d) => {
      const x = d as { avatarUrl?: string | null; welcomeMessage?: string; name?: string | null };
      return <TarjetaBienvenida avatarUrl={x?.avatarUrl} mensaje={x?.welcomeMessage ?? ''} nombre={x?.name} />;
    },
  },
  evidencias: {
    descripcion: 'Pruebas subidas a un caso, en tira horizontal',
    render: (d, a) => {
      const x = d as { evidenceUrlList?: string[]; title?: string | null; statusDesc?: string | null };
      return (
        <TarjetaEvidencias
          imagenes={x?.evidenceUrlList ?? []}
          titulo={x?.title}
          estado={x?.statusDesc}
          onAbrir={a.onEnlace ? (url) => a.onEnlace?.(url) : undefined}
        />
      );
    },
  },
  'alerta-precio': {
    descripcion: 'Aviso de que un producto está en su precio más bajo de N días',
    render: (d, a) => {
      const x = d as {
        image?: string | null; nowPrice?: number; originalPrice?: number | null;
        agioPrice?: number | null; lowPriceDay?: number | null;
      };
      return (
        <TarjetaAlertaPrecio
          imagen={x?.image}
          precioAhora={Number(x?.nowPrice ?? 0)}
          precioAntes={x?.originalPrice ?? null}
          ahorroXaf={x?.agioPrice ?? null}
          dias={x?.lowPriceDay ?? null}
          onAbrir={a.onAbrir ? () => a.onAbrir?.('') : undefined}
        />
      );
    },
  },
  'invitacion-resena': {
    descripcion: 'Invitación a valorar un producto comprado',
    render: (d, a) => {
      const x = d as { goods_image?: string | null; goods_name?: string; reviewable?: boolean };
      return (
        <TarjetaInvitacionResena
          imagen={x?.goods_image}
          producto={x?.goods_name ?? ''}
          sePuedeValorar={x?.reviewable}
          onValorar={a.onBoton ? () => a.onBoton?.('Escribir una reseña') : undefined}
        />
      );
    },
  },
  enlace: {
    descripcion: 'Vista previa de un enlace compartido',
    render: (d, a) => {
      const x = d as { shareUrl?: string | null; title?: string; pageDesc?: string | null; pageUrl?: string };
      return (
        <TarjetaEnlace
          imagen={x?.shareUrl}
          titulo={x?.title ?? ''}
          descripcion={x?.pageDesc}
          onAbrir={a.onEnlace && x?.pageUrl ? () => a.onEnlace?.(x.pageUrl as string) : undefined}
        />
      );
    },
  },
  'enlace-boton': {
    descripcion: 'Texto con un botón que lleva a algún sitio',
    render: (d, a) => {
      const x = d as { card_content?: string; button_content?: string; button_url?: string };
      return (
        <TarjetaEnlaceBoton
          texto={x?.card_content ?? ''}
          etiquetaBoton={x?.button_content ?? 'Abrir'}
          onAbrir={a.onEnlace && x?.button_url ? () => a.onEnlace?.(x.button_url as string) : undefined}
        />
      );
    },
  },
  /** Cubre las tarjetas 25 (`logisticagent_223`) y 29 (`minorrefund_214`). */
  'texto-acciones': {
    descripcion: 'Texto con botones: aviso del servicio al cliente',
    render: (d, a) => {
      const x = d as {
        title?: string | null; content?: string | null; body?: string | null;
        buttons?: Array<Record<string, string>>;
      };
      const botones = (x?.buttons ?? []).map((b) => ({
        etiqueta: b.buttonValue ?? b.text ?? b.label ?? '',
      })).filter((b) => b.etiqueta);
      return (
        <TarjetaTextoAcciones
          titulo={x?.title}
          texto={x?.body ?? x?.content ?? ''}
          botones={botones}
          onBoton={a.onBoton}
        />
      );
    },
  },
  aviso: {
    descripcion: 'Aviso con titular, explicación y consejo',
    render: (d) => {
      const x = d as { top?: string | null; content?: string | null; tip?: string | null };
      return <TarjetaAviso titular={x?.top} explicacion={x?.content} consejo={x?.tip} />;
    },
  },
  servicio: {
    descripcion: 'Mensaje de un servicio, con su logotipo y quién escribe',
    render: (d) => {
      const x = d as {
        titleLogo?: string | null; title?: string; subTitle?: string | null; content?: string | null;
      };
      return (
        <TarjetaServicio
          logo={x?.titleLogo}
          servicio={x?.title ?? ''}
          persona={x?.subTitle}
          contenido={x?.content}
        />
      );
    },
  },
  'pedido-logistico': {
    descripcion: 'El pedido visto desde logística, con su último movimiento',
    render: (d, a) => (
      <TarjetaPedidoLogistico
        datos={d as Parameters<typeof TarjetaPedidoLogistico>[0]['datos']}
        onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
        onBoton={a.onBoton}
      />
    ),
  },
  'entrega-negociada': {
    descripcion: 'La fecha de entrega ha cambiado: prometida y nueva',
    render: (d, a) => (
      <TarjetaEntregaNegociada
        datos={d as Parameters<typeof TarjetaEntregaNegociada>[0]['datos']}
        onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
        onBoton={a.onBoton}
      />
    ),
  },
  cancelacion: {
    descripcion: 'Se ha pedido cancelar un pedido: tienda e identificador',
    render: (d, a) => {
      const x = d as {
        package_id?: string | null; packageId?: string | null;
        sellerPkgData?: { shopName?: string | null; newSkuList?: Array<{ image?: string | null }> } | null;
      };
      return (
        <TarjetaCancelacion
          imagen={x?.sellerPkgData?.newSkuList?.[0]?.image}
          tienda={x?.sellerPkgData?.shopName}
          pedido={x?.package_id ?? x?.packageId}
          onCopiar={a.onCopiar}
        />
      );
    },
  },
  /** Cubre las tarjetas 34 (`preorderchecksuccess_96`), 35 (`preorderpaid_94`) y 36 (`promptorder_108`). */
  'aviso-producto': {
    descripcion: 'Un aviso sobre un producto, con el artículo debajo',
    render: (d, a) => {
      const x = d as {
        image?: string | null; noteImage?: string | null; name?: string | null;
        noteTitle?: string | null; price?: string | null; state?: string | null;
      };
      const producto = x?.name ?? x?.noteTitle ?? '';
      return (
        <TarjetaAvisoProducto
          texto={x?.state ? 'El pedido que consultas' : 'Tu pedido'}
          estado={x?.state}
          imagen={x?.image ?? x?.noteImage}
          producto={producto}
          precio={x?.price}
          onAbrir={a.onAbrir ? () => a.onAbrir?.('') : undefined}
        />
      );
    },
  },
  consulta: {
    descripcion: 'Resumen de una consulta dejada en la cola de atención',
    render: (d, a) => {
      const x = d as {
        content?: string; questionName?: string | null; orderId?: string | null;
        leaveMessageTime?: string | null;
      };
      return (
        <TarjetaConsulta
          contenido={x?.content ?? ''}
          tipoProblema={x?.questionName}
          pedido={x?.orderId}
          fecha={x?.leaveMessageTime}
          onCopiar={a.onCopiar}
        />
      );
    },
  },
  sobre: {
    descripcion: 'Sobre de dinero recibido',
    render: (d, a) => {
      const x = d as { title?: string; subTitle?: string | null; description?: string | null };
      return (
        <TarjetaSobre
          titulo={x?.title ?? 'Un sobre para ti'}
          subtitulo={x?.subTitle}
          descripcion={x?.description}
          onAbrir={a.onBoton ? () => a.onBoton?.('Abrir') : undefined}
        />
      );
    },
  },
  'solicitud-postventa': {
    descripcion: 'Entrada a una solicitud de postventa sobre un artículo',
    render: (d, a) => {
      const x = d as { image?: string | null; name?: string; price?: string | null };
      return (
        <TarjetaSolicitudPostventa
          imagen={x?.image}
          producto={x?.name ?? ''}
          precio={x?.price}
          onSolicitar={a.onBoton ? () => a.onBoton?.('Solicitar') : undefined}
        />
      );
    },
  },
  cobro: {
    descripcion: 'Aviso de un cobro pendiente, con importe y motivo',
    render: (d, a) => {
      const x = d as { amount?: string | number; reason?: string | null; status?: string | null };
      const importe = typeof x?.amount === 'number' ? `${x.amount} XAF` : (x?.amount ?? '—');
      return (
        <TarjetaCobro
          importe={importe}
          motivo={x?.reason}
          estado={x?.status}
          onPagar={a.onBoton ? () => a.onBoton?.(x?.status ?? 'Pagar') : undefined}
        />
      );
    },
  },
  cola: {
    descripcion: 'Estado de la cola de atención humana',
    render: (d, a) => {
      const x = d as {
        queueCount?: number | string | null; content?: string | null;
        enableCancel?: boolean | null; cancel?: string | null;
      };
      return (
        <TarjetaCola
          delante={x?.queueCount != null ? Number(x.queueCount) : null}
          mensaje={x?.content}
          etiquetaSalir={x?.enableCancel === false ? null : (x?.cancel ?? 'Salir de la cola')}
          onSalir={a.onBoton ? () => a.onBoton?.('Salir de la cola') : undefined}
        />
      );
    },
  },
  'recordatorio-pago': {
    descripcion: 'Recordatorio de que hay que pagar un pedido',
    render: (d, a) => {
      const x = d as {
        title?: string; content?: string | null; name?: string | null;
        image?: string | null; totalPrice?: string | null; price?: string | null;
        buttons?: Array<Record<string, string>>;
      };
      return (
        <TarjetaRecordatorioPago
          titulo={x?.title ?? 'Tienes un pago pendiente'}
          contenido={x?.content}
          producto={x?.name}
          imagen={x?.image}
          importe={x?.totalPrice ?? x?.price}
          botones={(x?.buttons ?? []).map((b) => ({ etiqueta: b.buttonValue ?? b.text ?? b.label ?? '' }))
            .filter((b) => b.etiqueta)}
          onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
          onBoton={a.onBoton}
        />
      );
    },
  },
  video: {
    descripcion: 'Vídeo dentro del chat: portada, duración y reproducir',
    render: (d, a) => {
      const x = d as {
        coverPicture?: string | null; dimension?: string | null; duration?: string | number | null;
      };
      return (
        <TarjetaVideo
          portada={x?.coverPicture}
          dimension={x?.dimension}
          duracion={x?.duration ?? null}
          onReproducir={a.onEnlace ? () => a.onEnlace?.('') : undefined}
        />
      );
    },
  },
  infraccion: {
    descripcion: 'Aviso de que algo ha sido marcado como infractor',
    render: (d) => {
      const x = d as {
        violationEntityName?: string; violationStatus?: string | null; image?: string | null;
      };
      return (
        <TarjetaInfraccion
          objeto={x?.violationEntityName ?? 'Contenido'}
          estado={x?.violationStatus}
          imagen={x?.image}
        />
      );
    },
  },
  /**
   * La nota compartida. Es la misma que el chat despacha por `kind: 'post'`/`'sale'`: aquí queda
   * registrada para que el camino genérico pueda pintarla igual cuando el servidor la mande como
   * tarjeta. Los dos caminos usan EL MISMO componente, así que no pueden separarse con el tiempo.
   */
  nota: {
    descripcion: 'Nota compartida: portada, título, autor y producto',
    render: (d, a) => {
      const x = d as {
        postRef?: Parameters<typeof TarjetaNota>[0]['nota'];
        title?: string; coverUrl?: string; priceXaf?: number;
        author?: { name?: string | null; fullName?: string | null; avatarUrl?: string | null } | null;
        sale?: boolean;
      };
      // Acepta tanto `postRef` (como lo manda el chat) como los campos sueltos.
      const nota = x?.postRef ?? { id: '', title: x?.title ?? '', coverUrl: x?.coverUrl, priceXaf: x?.priceXaf };
      return (
        <TarjetaNota
          nota={nota}
          autor={x?.author ? { nombre: x.author.name ?? x.author.fullName, avatarUrl: x.author.avatarUrl } : null}
          esVenta={x?.sale}
          onAbrir={a.onAbrir ? () => a.onAbrir?.(nota.id) : undefined}
        />
      );
    },
  },
};

/** Los nombres que este motor sabe pintar. Útil para probar y para documentar. */
export const TARJETAS_REGISTRADAS = Object.keys(REGISTRO);

/** Versión de la app instalada, para comparar con `minAppVersion`. */
function versionInstalada(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Compara dos versiones `a.b.c`. Devuelve negativo si `a` es menor que `b`.
 * Se compara número a número: comparar como texto diría que «0.9.0» es mayor que «0.10.0».
 */
export function compararVersiones(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Pinta la tarjeta que traiga el mensaje. Nunca lanza: si algo no cuadra, devuelve el respaldo.
 * Un fallo al pintar una tarjeta no puede llevarse por delante la conversación entera.
 */
export function TarjetaDeChat({ tarjeta, acciones }: {
  tarjeta: LbMessageCardRef;
  acciones?: AccionesTarjeta;
}) {
  const entrada = REGISTRO[tarjeta?.cardType];

  if (!entrada) {
    return <TarjetaNoSoportada versionRequerida={tarjeta?.minAppVersion} />;
  }

  if (tarjeta.minAppVersion && compararVersiones(versionInstalada(), tarjeta.minAppVersion) < 0) {
    // La tarjeta existe en el registro, pero esta app es más vieja que lo que la tarjeta pide:
    // puede haber cambiado la forma de los datos, así que no se intenta pintarla.
    return <TarjetaNoSoportada versionRequerida={tarjeta.minAppVersion} />;
  }

  return <>{entrada.render(tarjeta.payload, acciones ?? {})}</>;
}
