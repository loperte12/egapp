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
export { TarjetaCertificado, type DatosCertificado } from './TarjetaCertificado';
export {
  TarjetaCompuesta, type ParrafoCompuesto, type ElementoCompuesto,
} from './TarjetaCompuesta';
export { TarjetaCupon, type DatosCupon } from './TarjetaCupon';
export { TarjetaCuponCompacto, type DatosCuponCompacto } from './TarjetaCuponCompacto';
export { TarjetaReclamarCupon, type DatosReclamarCupon } from './TarjetaReclamarCupon';
export { ImporteCupon, SelloTipoCupon } from './piezas-cupon';
export { TarjetaBienvenida } from './TarjetaBienvenida';
export { TarjetaEvidencias } from './TarjetaEvidencias';
export { TarjetaAlertaPrecio } from './TarjetaAlertaPrecio';
export { TarjetaInvitacionResena } from './TarjetaInvitacionResena';
export { TarjetaEnlace } from './TarjetaEnlace';
export { TarjetaEnlaceBoton } from './TarjetaEnlaceBoton';
export { TarjetaTextoAcciones } from './TarjetaTextoAcciones';
export { TarjetaAviso } from './TarjetaAviso';
export { TarjetaServicio } from './TarjetaServicio';
export { TarjetaPedidoLogistico } from './TarjetaPedidoLogistico';
export { TarjetaEntregaNegociada } from './TarjetaEntregaNegociada';
export { TarjetaCancelacion } from './TarjetaCancelacion';
export { TarjetaAvisoProducto } from './TarjetaAvisoProducto';
export { TarjetaConsulta } from './TarjetaConsulta';
export { TarjetaSobre } from './TarjetaSobre';
export { TarjetaSolicitudPostventa } from './TarjetaSolicitudPostventa';
export { TarjetaCobro } from './TarjetaCobro';
export { TarjetaCola } from './TarjetaCola';
export {
  TarjetaDeChat, TARJETAS_REGISTRADAS, compararVersiones, type AccionesTarjeta,
} from './registro';

/**
 * `estado`:
 *   · `implementada` — hay componente propio en esta carpeta.
 *   · `cubierta`     — el chat ya la pinta con lo que tiene; construir otra sería duplicar.
 *   · `pendiente`    — auditada, aún sin componente.
 *
 * `contrato: true` = **necesitaba** un tipo nuevo en `LbMessageKind` antes de la decisión del
 * 09/10/2026. Ya no se necesita ninguno: el tipo genérico `card` cubre las 54. El campo se conserva
 * porque es el registro del problema que justificó la decisión — 13 de las 15 primeras tarjetas lo
 * pedían, y con 54 habrían sido unas 38.
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
  { n: 6, ref: 'certitem_212', componente: 'TarjetaCertificado', estado: 'implementada', contrato: true },
  {
    n: 7, ref: 'commonhint_131', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia también es una línea centrada a 13',
  },
  { n: 8, ref: 'composite_44', componente: 'TarjetaCompuesta', estado: 'implementada', contrato: true },
  {
    n: 9, ref: 'compositeoption_45', componente: null, estado: 'cubierta', contrato: true,
    donde: 'burbuja de texto del chat: la referencia es una burbuja de 16/20 con radio 12',
  },
  {
    n: 10, ref: 'confirmorder_72', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia es una línea centrada a 13',
  },
  { n: 11, ref: 'coupon_19', componente: 'TarjetaCupon', estado: 'implementada', contrato: true },
  { n: 12, ref: 'couponcardv2_222', componente: 'TarjetaCuponCompacto', estado: 'implementada', contrato: true },
  { n: 13, ref: 'couponclaim_112', componente: 'TarjetaReclamarCupon', estado: 'implementada', contrato: true },
  { n: 14, ref: 'cswelcomemsg_209', componente: 'TarjetaBienvenida', estado: 'implementada', contrato: false },
  {
    n: 15, ref: 'damage_111', componente: 'TarjetaEstadoPostventa', estado: 'cubierta', contrato: true,
    donde: 'misma forma que la tarjeta 2: título, contenido, cardHeader, orderDetail y botones. '
      + 'La 15 solo es la 2 sin banner, sin estado y sin pista de pie, y las tres son opcionales',
  },
  { n: 16, ref: 'evidence_220', componente: 'TarjetaEvidencias', estado: 'implementada', contrato: true },
  {
    n: 17, ref: 'fan_club_136', componente: 'TarjetaCupon', estado: 'cubierta', contrato: true,
    donde: 'anatomía idéntica a la tarjeta 11: 108 de alto, radio 8, importe 24 con símbolo 14, '
      + 'mínimo 10, nombre 14, fechas 10, separador y fila de acción. Solo cambian los nombres de '
      + 'los campos del servidor (couponName por name, btnText por el botón)',
  },
  {
    n: 18, ref: 'file_17', componente: null, estado: 'cubierta', contrato: true,
    donde: 'el chat ya pinta `file` (L1636) con nombre y tamaño, que es lo que hace la referencia '
      + '(nombre a 14 y clic para abrir). OBSERVACIÓN: la referencia hace abrir el archivo a toda '
      + 'la burbuja y la de LifeBook todavía no tiene ese toque; falta decidir a dónde abre',
  },
  { n: 19, ref: 'goodsshoppingguide_93', componente: 'TarjetaAlertaPrecio', estado: 'implementada', contrato: true },
  {
    n: 20, ref: 'intention_23', componente: null, estado: 'cubierta', contrato: false,
    donde: 'burbuja de texto del chat: la referencia es una burbuja de 16/20 con radio 12 y color '
      + 'según si el mensaje es mío',
  },
  { n: 21, ref: 'inviterating_16', componente: 'TarjetaInvitacionResena', estado: 'implementada', contrato: true },
  {
    n: 22, ref: 'isvoption_107', componente: null, estado: 'cubierta', contrato: false,
    donde: 'burbuja de texto del chat con el color de «enviado por mí»: la referencia es una '
      + 'burbuja de 16/20 rellena, que es exactamente lo que el chat ya pinta para un texto mío',
  },
  { n: 23, ref: 'landingpage_103', componente: 'TarjetaEnlace', estado: 'implementada', contrato: true },
  { n: 24, ref: 'linkcard_100', componente: 'TarjetaEnlaceBoton', estado: 'implementada', contrato: true },
  { n: 25, ref: 'logisticagent_223', componente: 'TarjetaTextoAcciones', estado: 'implementada', contrato: true },
  { n: 26, ref: 'logisticcustomserviceunhandle_216', componente: 'TarjetaServicio', estado: 'implementada', contrato: true },
  { n: 27, ref: 'logisticorder_215', componente: 'TarjetaPedidoLogistico', estado: 'implementada', contrato: true },
  { n: 28, ref: 'logisticqueuetips_218', componente: 'TarjetaAviso', estado: 'implementada', contrato: true },
  { n: 29, ref: 'minorrefund_214', componente: 'TarjetaTextoAcciones', estado: 'implementada', contrato: true },
  { n: 30, ref: 'negotiatedelivery_104', componente: 'TarjetaEntregaNegociada', estado: 'implementada', contrato: true },
  {
    n: 31, ref: 'note_92', componente: null, estado: 'cubierta', contrato: true,
    donde: 'el chat ya pinta `post`/`sale` (L1716) con portada, título y precio, que es el cuerpo de '
      + 'esta tarjeta. DOS HUECOS ANOTADOS, sin tocar: la referencia añade la fila del AUTOR '
      + '(avatar de 20 + nombre) y un bloque de producto con precios original y rebajado. Se '
      + 'deciden al tocar la tarjeta de nota del chat, que hoy vive dentro del fichero de 2.000 líneas',
  },
  { n: 32, ref: 'order_3', componente: 'OrderCardEnChat', estado: 'implementada', contrato: false },
  { n: 33, ref: 'packagecancel_61', componente: 'TarjetaCancelacion', estado: 'implementada', contrato: true },
  { n: 34, ref: 'preorderchecksuccess_96', componente: 'TarjetaAvisoProducto', estado: 'implementada', contrato: true },
  { n: 35, ref: 'preorderpaid_94', componente: 'TarjetaAvisoProducto', estado: 'implementada', contrato: true },
  { n: 36, ref: 'promptorder_108', componente: 'TarjetaAvisoProducto', estado: 'implementada', contrato: true },
  { n: 37, ref: 'queueguideleave_114', componente: 'TarjetaTextoAcciones', estado: 'implementada', contrato: true },
  { n: 38, ref: 'queueleave_115', componente: 'TarjetaConsulta', estado: 'implementada', contrato: true },
  {
    n: 39, ref: 'queueleavereply_116', componente: null, estado: 'cubierta', contrato: true,
    donde: 'burbuja de texto del chat: la referencia es texto a 16/24 separado por una línea de '
      + 'guiones, o sea un mensaje de texto con un separador — ya se pinta',
  },
  { n: 40, ref: 'redpacket_124', componente: 'TarjetaSobre', estado: 'implementada', contrato: true },
  { n: 41, ref: 'returnapply_74', componente: 'TarjetaSolicitudPostventa', estado: 'implementada', contrato: true },
  {
    n: 42, ref: 'richhinttoc_126', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia es una línea centrada a 13, igual que '
      + 'las tarjetas 5, 7 y 10',
  },
  { n: 43, ref: 'smallpayment_50', componente: 'TarjetaCobro', estado: 'implementada', contrato: true },
  {
    n: 44, ref: 'syscanceledqueue_85', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia es UN solo nodo de texto centrado a 13',
  },
  {
    n: 45, ref: 'sysopenchat_38', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: un único texto centrado a 13',
  },
  { n: 46, ref: 'sysqueueinfo_82', componente: 'TarjetaCola', estado: 'implementada', contrato: true },
  {
    n: 47, ref: 'sysratingtip_105', componente: null, estado: 'cubierta', contrato: true,
    donde: 'píldora centrada de `system`/`topic`: la referencia es una pista centrada a 13 con un '
      + 'enlace en línea, la misma forma que la tarjeta 5 (`buttonhint_120`)',
  },
  { n: 48, ref: 'transferseller_81', componente: 'TarjetaTextoAcciones', estado: 'implementada', contrato: true },
];
