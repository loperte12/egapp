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
