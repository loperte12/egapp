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
import { TarjetaConfirmacionEntrega } from './TarjetaConfirmacionEntrega';
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
import { TarjetaPedido } from './TarjetaPedido';
import { TarjetaProducto } from './TarjetaProducto';
import { TarjetaReposicion } from './TarjetaReposicion';
import { TarjetaNoSoportada } from './TarjetaNoSoportada';
import type { BotonTarjeta, DestinoBoton } from './piezas';

/** Acciones que el chat presta a cualquier tarjeta. */
export interface AccionesTarjeta {
  /**
   * Un botón de la tarjeta. Llega el **`id`** del botón, no su etiqueta.
   *
   * ANTES LLEGABA LA ETIQUETA, y era un error: el comportamiento quedaba atado al rótulo, así que
   * cambiar una coma en el texto rompía el cableado en silencio. La referencia separa las dos cosas
   * (`buttons[].id` frente a `buttons[].buttonValue`) y esto hace lo mismo.
   */
  onBoton?: (id: string) => void;
  /** Un enlace dentro de una tarjeta compuesta. */
  onEnlace?: (url: string) => void;
  /** Copiar un dato (número de expediente, de gestión…). */
  onCopiar?: (valor: string) => void;
  /** Abrir el pedido o el objeto al que apunta la tarjeta. */
  onAbrir?: (id: string) => void;
}

/**
 * LOS BOTONES DEL SERVIDOR, con la forma de la referencia convertida a la de LifeBook.
 *
 * La referencia manda `buttons[]` con `{ id, buttonValue, buttonStatus }`. Aquí se traduce a
 * `BotonTarjeta` (`id`, `etiqueta`, `estado`). Se hace en UN solo sitio para que las 54 tarjetas no
 * tengan cada una su propia idea de qué es un botón — que es exactamente cómo se acaba con 30
 * tarjetas y 30 maneras de pintar un botón.
 *
 * Si el servidor no manda `id`, se usa la etiqueta como id: peor es no tener ninguno, y así una
 * tarjeta antigua sigue funcionando.
 */
export function botonesDelServidor(brutos: unknown): BotonTarjeta[] {
  if (!Array.isArray(brutos)) return [];
  const salida: BotonTarjeta[] = [];
  for (const b of brutos) {
    if (!b || typeof b !== 'object') continue;
    const x = b as Record<string, unknown>;
    const etiqueta = String(x.buttonValue ?? x.label ?? x.text ?? '').trim();
    if (!etiqueta) continue;
    const id = String(x.id ?? x.buttonId ?? etiqueta);
    const apagado = x.buttonStatus === 'disabled' || x.estado === 'inactivo' || x.disabled === true;

    /**
     * EL DESTINO VIAJA CON EL BOTÓN, como el `nav` de la referencia. Se aceptan las tres formas en
     * que un servidor razonable puede mandarlo: una URL, un destino tipado, o nada.
     */
    const url = String(x.buttonUrl ?? x.buttonLink ?? x.url ?? x.deeplink ?? x.navUrl ?? '').trim();
    const tipo = String(x.buttonTargetType ?? x.targetType ?? '').trim().toLowerCase();
    const destinoId = x.buttonTargetId ?? x.targetId;
    let destino: DestinoBoton | undefined;
    if (url) {
      destino = { tipo: 'enlace', url };
    } else if (tipo === 'order' || tipo === 'pedido') {
      destino = { tipo: 'pedido', id: destinoId ? String(destinoId) : undefined };
    } else if ((tipo === 'product' || tipo === 'producto') && destinoId) {
      destino = { tipo: 'producto', id: String(destinoId) };
    }

    salida.push({ id, etiqueta, estado: apagado ? 'inactivo' : 'activo', destino });
  }
  return salida;
}

/**
 * A dónde va un botón concreto de una tarjeta.
 *
 * Primero se busca el destino **que trajo el botón**. Si no trajo ninguno, se usa **el dato que la
 * tarjeta ya tiene**: un botón de una tarjeta de pedido lleva a ese pedido, y uno de producto, a ese
 * producto. Eso no es inventar un destino, es usar el que la tarjeta ya declara con sus datos.
 *
 * Si no hay ni una cosa ni la otra, devuelve `null` y el botón **no navega** — antes que mandar a
 * alguien a una pantalla que no toca.
 */
export function destinoDeBoton(payload: unknown, id: string): DestinoBoton | null {
  const x = (payload ?? {}) as Record<string, unknown>;
  const boton = botonesDelServidor(x.buttons).find((b) => b.id === id);
  if (boton?.destino) return boton.destino;

  const pedido = x.orderId ?? x.order_id ?? x.packageId
    ?? (x.orderDetail as Record<string, unknown> | undefined)?.packageId;
  if (pedido) return { tipo: 'pedido', id: String(pedido) };

  const producto = x.productId ?? x.product_id ?? x.goodsId ?? x.skuId
    ?? (x.goodsInfo as Array<Record<string, unknown>> | undefined)?.[0]?.skuId;
  if (producto) return { tipo: 'producto', id: String(producto) };

  return null;
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
  'confirmacion-entrega': {
    descripcion: 'Confirmación de la entrega con el código que enseña el comprador',
    render: (d, a) => {
      /**
       * Acepta DOS FORMAS, como el resto de avisos del pedido:
       *  · la explícita (`goods`, `address`, `status{desc,feedback}`, `buttons[]`) — la del DSL
       *    `bcim_chat_askconfirmorder_71`;
       *  · la foto del pedido que manda LifeBook (`items[]`, `totalXaf`, `title`) + `deliveryCode`.
       * El código es lo propio de LifeBook: la referencia no tiene tarjeta para enseñarlo.
       */
      const x = d as {
        orderNo?: string | null; code?: string | null; title?: string | null;
        deliveryCode?: string | null;
        goods?: { preview?: string | null; name: string; count?: number; total_amt?: string | null } | null;
        items?: Array<{ title?: string; mediaUrl?: string | null; quantity?: number }>;
        totalXaf?: number | null;
        address?: { desc?: string | null } | null;
        logisticsType?: string | null;
        status?: { desc?: string | null; feedback?: string | null } | null;
        isShowButton?: boolean | null;
        buttons?: Array<{ id?: string | null; label?: string | null }>;
      };
      const bienes = x?.goods ?? (Array.isArray(x?.items) && x.items.length
        ? {
            preview: x.items[0]?.mediaUrl ?? null,
            name: String(x.items[0]?.title ?? 'Tu pedido'),
            count: x.items.length,
            total_amt: x?.totalXaf != null ? `${Number(x.totalXaf)} XAF` : null,
          }
        : null);
      return (
        <TarjetaConfirmacionEntrega
          datos={{
            orderNo: x?.orderNo ?? x?.code ?? null,
            deliveryCode: x?.deliveryCode ?? null,
            goods: bienes,
            address: x?.address ?? null,
            logisticsType: x?.logisticsType ?? null,
            status: x?.status ?? (x?.title ? { desc: x.title } : null),
            isShowButton: x?.isShowButton,
            buttons: x?.buttons,
          }}
          onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
          onCopiarCodigo={a.onCopiar}
          onBoton={(id) => a.onBoton?.(id)}
        />
      );
    },
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
      // Los botones se traducen en UN solo sitio (`botonesDelServidor`), no aquí: si cada tarjeta
      // tradujera su propio `buttons[]` acabarían con ideas distintas de qué es un botón.
      const botones = botonesDelServidor(x?.buttons);
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
    render: (d, a) => {
      /**
       * DOS FORMAS DE DATOS, y las dos se aceptan:
       *  · la del DSL (`skus`, `totalPrice`, `recentTrackingRecord`…);
       *  · la que manda LifeBook en los avisos de pedido: la FOTO DEL PEDIDO (`items[]`,
       *    `totalXaf`) y la frase en `title`.
       * Sin la segunda, la tarjeta salía solo con la frase y sin artículos ni total (medido en el
       * móvil el 24/10).
       */
      const x = d as {
        title?: string | null;
        skus?: Array<{ skuTag?: string | null; image?: string | null; skuName?: string; skuSpecification?: string | null; skuQuantity?: number | string | null }>;
        skuCount?: number | string | null;
        totalPrice?: string | null;
        recentTrackingRecord?: { subNodeDesc?: string | null } | null;
        buttons?: Array<{ id?: string | null; buttonValue?: string; buttonStatus?: string | null }>;
        items?: Array<{ title?: string; variant?: string | null; mediaUrl?: string | null; quantity?: number }>;
        totalXaf?: number | null;
      };
      const skus = x?.skus ?? (Array.isArray(x?.items)
        ? x.items.map((i) => ({
            skuTag: null,
            image: i?.mediaUrl ?? null,
            skuName: String(i?.title ?? ''),
            skuSpecification: i?.variant ?? null,
            skuQuantity: i?.quantity ?? 1,
          }))
        : undefined);
      return (
        <TarjetaPedidoLogistico
          datos={{
            title: x?.title,
            skus,
            skuCount: x?.skuCount ?? (Array.isArray(x?.items) ? x.items.length : undefined),
            totalPrice: x?.totalPrice ?? (x?.totalXaf != null ? `${Number(x.totalXaf)} XAF` : null),
            recentTrackingRecord: x?.recentTrackingRecord,
            buttons: x?.buttons,
          }}
          onAbrirPedido={a.onAbrir ? () => a.onAbrir?.('') : undefined}
          onBoton={a.onBoton}
        />
      );
    },
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
      /**
       * DOS FORMAS: el DSL (`sellerPkgData`, `package_id`) y la FOTO DEL PEDIDO que manda LifeBook
       * en los avisos (`shopName`, `code`, `items[]`). Sin la segunda, `TarjetaCancelacion` recibía
       * todo vacío y **devolvía `null`: el mensaje desaparecía del chat** (medido el 24/10).
       */
      const x = d as {
        package_id?: string | null; packageId?: string | null;
        sellerPkgData?: { shopName?: string | null; newSkuList?: Array<{ image?: string | null }> } | null;
        code?: string | null; shopName?: string | null;
        items?: Array<{ mediaUrl?: string | null }>;
      };
      return (
        <TarjetaCancelacion
          imagen={x?.sellerPkgData?.newSkuList?.[0]?.image ?? x?.items?.[0]?.mediaUrl ?? null}
          tienda={x?.sellerPkgData?.shopName ?? x?.shopName ?? null}
          pedido={x?.package_id ?? x?.packageId ?? x?.code ?? null}
          onCopiar={a.onCopiar}
        />
      );
    },
  },
  /** Cubre las tarjetas 34 (`preorderchecksuccess_96`), 35 (`preorderpaid_94`) y 36 (`promptorder_108`). */
  'aviso-producto': {
    descripcion: 'Un aviso sobre un producto, con el artículo debajo',
    render: (d, a) => {
      /**
       * DOS FORMAS DE DATOS, y las dos se aceptan:
       *  · la del DSL de la referencia: `image/noteImage/noteTitle/price/state`;
       *  · la que manda LifeBook en los ocho avisos de pedido: la FOTO DEL PEDIDO (`items[]`,
       *    `totalXaf`, `shopName`, `code`) y la frase del aviso en `title`.
       *
       * Sin la segunda, la tarjeta salía «Tu pedido» **sin artículo, sin foto y sin precio**
       * (medido en el móvil el 24/10): el servidor no tiene por qué saber qué forma quiere cada
       * componente, así que el registro acepta las dos.
       */
      const x = d as {
        image?: string | null; noteImage?: string | null; name?: string | null;
        noteTitle?: string | null; price?: string | null; state?: string | null;
        title?: string | null; items?: Array<{ title?: string; mediaUrl?: string | null }>;
        totalXaf?: number | null;
      };
      const producto = x?.name ?? x?.noteTitle ?? x?.items?.[0]?.title ?? '';
      const imagen = x?.image ?? x?.noteImage ?? x?.items?.[0]?.mediaUrl ?? null;
      const precio = x?.price ?? (x?.totalXaf != null ? `${Number(x.totalXaf)} XAF` : null);
      return (
        <TarjetaAvisoProducto
          texto={x?.title ?? (x?.state ? 'El pedido que consultas' : 'Tu pedido')}
          estado={x?.state}
          imagen={imagen}
          producto={producto}
          precio={precio}
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
      /**
       * DOS FORMAS: el DSL (`amount/reason/status`) y la que manda LifeBook en los avisos de
       * cobro del BLOQUE 4c (`importe/motivo/estado`). Sin la segunda, la tarjeta salía con el
       * importe «—», sin motivo y con el botón «Pagar» por defecto (medido en el móvil el 24/10).
       */
      const x = d as {
        amount?: string | number; reason?: string | null; status?: string | null;
        importe?: string | number; motivo?: string | null; estado?: string | null;
      };
      const bruto = x?.importe ?? x?.amount;
      const importe = typeof bruto === 'number' ? `${bruto} XAF` : (bruto ?? '—');
      const etiqueta = x?.estado ?? x?.status ?? 'Pagar';
      return (
        <TarjetaCobro
          importe={importe}
          motivo={x?.motivo ?? x?.reason}
          estado={etiqueta}
          onPagar={a.onBoton ? () => a.onBoton?.(etiqueta) : undefined}
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
          botones={botonesDelServidor(x?.buttons)}
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
   * EL PEDIDO EN EL CHAT — dentro del árbol.
   *
   * Antes era una rama del chat (`if (kind === 'order')` → `OrderCardEnChat`), un componente fuera de
   * esta carpeta. Así había DOS caminos para pintar un pedido: el árbol y la rama a mano. Ahora es
   * una tarjeta más y el chat solo conoce el árbol.
   *
   * El servidor la manda como `cardType: 'pedido'` con el mismo `orderRef` de siempre en `payload`,
   * así que el componente no cambia de forma: cambia de sitio.
   */
  pedido: {
    descripcion: 'El pedido en el chat: estado vivo, artículo y ticket',
    render: (d, a) => (
      <TarjetaPedido
        datos={d as Parameters<typeof TarjetaPedido>[0]['datos']}
        onAbrirPedido={a.onAbrir}
      />
    ),
  },
  /**
   * EL PRODUCTO COMPARTIDO — dentro del árbol.
   *
   * Antes era JSX suelto dentro del chat (`if (kind === 'product')`): no lo podía reutilizar ninguna
   * otra pantalla y el chat acumulaba otra rama. Ahora es `cardType: 'producto'`.
   */
  producto: {
    descripcion: 'Producto compartido: foto, precio vivo, variante y comprar',
    render: (d, a) => (
      <TarjetaProducto
        datos={d as Parameters<typeof TarjetaProducto>[0]['datos']}
        onAbrirProducto={a.onAbrir}
      />
    ),
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
  /**
   * La primera tarjeta de LifeBook que NO viene de la referencia. Nace de un hallazgo del servidor:
   * el aviso de reposición ya mandaba un `payload` con el `productId` dentro de un mensaje `system`
   * que el cliente no leía. El dato viajaba y se tiraba.
   */
  'alerta-reposicion': {
    descripcion: 'Vuelve a estar disponible un producto que se había agotado',
    render: (d, a) => {
      const x = d as {
        title?: string | null; productTitle?: string | null; variantName?: string | null;
        imageUrl?: string | null; price?: string | null; productId?: string | null;
      };
      return (
        <TarjetaReposicion
          producto={x?.productTitle ?? x?.title ?? ''}
          variante={x?.variantName}
          imagen={x?.imageUrl}
          precio={x?.price}
          onVer={a.onAbrir ? () => a.onAbrir?.(x?.productId ?? '') : undefined}
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
