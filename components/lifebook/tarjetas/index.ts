/**
 * Tarjetas de chat — puerta de entrada de la campaña de las 54.
 *
 * ORDEN: el de aparición en la referencia (`bcim_chat_*` en orden alfabético). Cada tarjeta lleva
 * en su cabecera su número y su nombre de referencia, para poder cotejarla con el DSL original.
 *
 * POR QUÉ UN REGISTRO: `LbMessageKind` tiene 15 tipos y la referencia tiene 54 tarjetas. En vez de
 * 38 tipos nuevos (y 38 migraciones), la propuesta es **un tipo genérico** que traiga el nombre de
 * la tarjeta y sus datos, y que el cliente elija el componente en un registro. Es exactamente lo
 * que hace la referencia: un motor y 54 fichas.
 *
 * LA AUDITORÍA NO SIEMPRE PIDE CÓDIGO NUEVO. Varias de las 54 ya están cubiertas por lo que el
 * chat pinta hoy (`app/lifebook-chat/[id].tsx`): la píldora centrada de `system`/`topic` (L1973) y
 * la burbuja de texto (L1983). Construir una copia sería fabricar el problema que la auditoría
 * encontró: veinte componentes que no usa nadie. Por eso el registro distingue tres estados.
 */
export {
  TarjetaEnChat, CabeceraTarjeta, EtiquetaEstado, BloquePedido, FilaDato,
  BotonPildora, FilaBotones, PieDebil, LineaCronologia, colorDeTono,
  type Tono,
} from './piezas';

export { TarjetaPostventa, type DatosPostventa } from './TarjetaPostventa';
export { TarjetaEstadoPostventa, type DatosEstadoPostventa } from './TarjetaEstadoPostventa';
export { TarjetaNoSoportada } from './TarjetaNoSoportada';
export { TarjetaConfirmarPedido, type DatosConfirmarPedido } from './TarjetaConfirmarPedido';

/**
 * `estado`:
 *   · `implementada` — hay componente propio en esta carpeta.
 *   · `cubierta`     — el chat ya la pinta con lo que tiene; construir otra sería duplicar.
 *   · `pendiente`    — auditada, aún sin componente.
 *
 * `contrato: true` = necesita un tipo nuevo en `LbMessageKind` (o el genérico propuesto) antes de
 * poder recibir datos del servidor. Se construye igual, pero no se cablea hasta que haya contrato.
 */
export interface FichaCampana {
  n: number;
  ref: string;
  componente: string | null;
  estado: 'implementada' | 'cubierta' | 'pendiente';
  contrato: boolean;
  /** Dónde se cubre, si `estado` es `cubierta`. */
  donde?: string;
}

export const TARJETAS_CAMPANA: readonly FichaCampana[] = [
  { n: 1, ref: 'aftersalecard_123', componente: 'TarjetaPostventa', estado: 'implementada', contrato: true },
  { n: 2, ref: 'aftersalestatus_128', componente: 'TarjetaEstadoPostventa', estado: 'implementada', contrato: true },
  { n: 3, ref: 'agentstreamreply_302', componente: 'TarjetaNoSoportada', estado: 'implementada', contrato: false },
  { n: 4, ref: 'askconfirmorder_71', componente: 'TarjetaConfirmarPedido', estado: 'implementada', contrato: true },
  {
    n: 5, ref: 'buttonhint_120', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic` en el chat (texto 13 centrado con padding lateral)',
  },
  { n: 6, ref: 'certitem_212', componente: null, estado: 'pendiente', contrato: true },
  {
    n: 7, ref: 'commonhint_131', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia también es una línea centrada a 13',
  },
  { n: 8, ref: 'composite_44', componente: null, estado: 'pendiente', contrato: true },
  {
    n: 9, ref: 'compositeoption_45', componente: null, estado: 'cubierta', contrato: true,
    donde: 'burbuja de texto del chat: la referencia es una burbuja de 16/20 con radio 12',
  },
  {
    n: 10, ref: 'confirmorder_72', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia es una línea centrada a 13',
  },
];
