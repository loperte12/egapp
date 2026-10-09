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
 * PENDIENTE: el registro se rellena a medida que se implementan las tarjetas. Las que necesitan
 * ampliar el contrato quedan marcadas aquí y en su propio fichero.
 */
export {
  TarjetaEnChat, CabeceraTarjeta, EtiquetaEstado, BloquePedido, FilaDato,
  BotonPildora, FilaBotones, PieDebil, LineaCronologia, colorDeTono,
  type Tono,
} from './piezas';

export { TarjetaPostventa, type DatosPostventa } from './TarjetaPostventa';

/**
 * Estado de la campaña: 1 de 54 implementadas.
 *
 * `contrato: true` = necesita un tipo nuevo en `LbMessageKind` (o el genérico propuesto) antes de
 * poder recibir datos del servidor. Se construye igual, pero no se cablea hasta que haya contrato.
 */
export const TARJETAS_CAMPANA = [
  { n: 1, ref: 'aftersalecard_123', componente: 'TarjetaPostventa', contrato: true },
] as const;
