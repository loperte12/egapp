/**
 * LOS VEREDICTOS DE UNA RECLAMACIÓN — el contrato compartido (退款售后, Fase 5 del pie).
 *
 * POR QUÉ ESTÁ EN UN MÓDULO Y NO DENTRO DE UNA PANTALLA
 * Igual que `seccionesCompra.ts` y `canalesAviso.ts`: el rótulo de un veredicto, su color y su
 * significado los usan **dos** pantallas —la lista, que pinta las pestañas y la etiqueta de cada
 * fila, y la ficha, que pone ese rótulo en su cabecera y explica qué pasó—. Si cada una guardara su
 * copia, un día la pestaña diría «Con reembolso» y la ficha «Éxito», y el usuario no tendría forma de
 * saber que son lo mismo. **El id es el que viaja en la URL** (`?filtro=refunded`), así que la URL y
 * las dos pantallas hablan del mismo veredicto por construcción.
 *
 * TRES VEREDICTOS, NO CUATRO — y esto merece explicación porque el plan dice otra cosa
 * `MERCADO-PIE-PLAN.md` §3 escribe «no hay lista del comprador ni estado de 4 valores (待处理/成功/失败)»:
 * dice CUATRO y enumera TRES. La lista de la referencia (`oms_order_return_apply`) sí tiene cuatro
 * —待处理 · 退货中 · 已完成 · 已拒绝—, y el que falta es 退货中 (*devolución en curso*).
 *
 * **No se copia 退货中 porque aquí no existe ese trámite**: la devolución física del artículo no está
 * modelada en ninguna tabla. El reembolso de hoy es un acto del administrador —marca «reembolso sí» y
 * el pedido se cancela—, no un viaje del paquete de vuelta con sus estados. Inventarse la pestaña
 * habría dado una pantalla permanentemente vacía y un estado que ningún código puede activar:
 * exactamente la «etiqueta muerta» que ya se quitó una vez en la migración 020.
 *
 * LOS COLORES SALEN DE LA SEMÁNTICA DEL KIT, no del gusto
 *   · `pending`  → `warning`  (ámbar). El kit lo reserva a lo que está EN CURSO.
 *   · `refunded` → `success`  (verde). Para el comprador que reclamó, que le devuelvan ES el éxito.
 *   · `rejected` → `neutral`  (gris). El kit lo define como «estado sin carga emocional (cancelado,
 *     expirado, revertido)» y una reclamación rechazada es justo eso. **No se usa `danger`**: el kit
 *     lo reserva a emergencias, y que al comprador no le den la razón no es una emergencia.
 *
 * LA ETIQUETA ES UNA PASTILLA SÓLIDA, Y POR ESO NO HAY RAMAS DE TEMA
 * Se probó a tintar el fondo con `alpha(color, 0.14)` y escribir el texto en el color —que es lo que
 * hace el resto de la casa— y **no sirve para estos tres**: el kit sólo trae variantes oscuras de
 * texto para dos de sus colores (`dangerText`, `warningText`), no para `success` ni `neutral`, y en
 * tema oscuro el verde del kit sobre un tinte oscuro no llega a AA (el literal está en el archivo de
 * tokens; aquí no se escribe, la guardia de diseño lo contaría como deuda). La pastilla sólida esquiva el
 * problema entero: el par (fondo, texto) es el mismo en los dos temas y su contraste está garantizado
 * por los tokens —`onWarning` existe precisamente porque el blanco sobre ámbar da 2,1:1—. Menos
 * elegante que un tinte, pero se lee en los dos temas, que es lo que se le pide a un estado.
 */

import type { EcomerseDisputeOutcome } from '../../api/ecomerse';

/** Los tres veredictos. El tipo canónico vive en el cliente de la API; aquí se reexporta. */
export type EstadoReclamacion = EcomerseDisputeOutcome;

export interface EstadoReclamacionDef {
  id: EstadoReclamacion;
  /** El rótulo de la pestaña, de la etiqueta de la fila y de la cabecera de la ficha. El mismo texto. */
  label: string;
  /** Qué significa, para el vacío de su pestaña y para el lector de pantalla. */
  nota: string;
  /** El token de color del kit. Ver la cabecera para por qué cada uno. */
  color: 'warning' | 'success' | 'neutral';
  /**
   * El token del TEXTO que va sobre esa pastilla. No es siempre blanco: sobre el ámbar el blanco da
   * 2,1:1 y no llega a AA, y el kit tiene `onWarning` justamente para eso. Ver la cabecera.
   */
  colorTexto: 'onWarning' | 'white';
}

export const ESTADOS_RECLAMACION: EstadoReclamacionDef[] = [
  {
    id: 'pending',
    label: 'En revisión',
    nota: 'Reclamaciones abiertas: el administrador todavía no ha decidido.',
    color: 'warning',
    colorTexto: 'onWarning',
  },
  {
    id: 'refunded',
    label: 'Con reembolso',
    nota: 'Reclamaciones que se resolvieron a tu favor: el importe volvió a ti.',
    color: 'success',
    colorTexto: 'white',
  },
  {
    id: 'rejected',
    label: 'Rechazadas',
    nota: 'Reclamaciones que se resolvieron a favor del vendedor.',
    color: 'neutral',
    colorTexto: 'white',
  },
];

export const buscarEstado = (id?: string | null): EstadoReclamacionDef | null =>
  ESTADOS_RECLAMACION.find((e) => e.id === id) ?? null;

/**
 * El veredicto que se PINTA a partir de lo que guarda la base.
 *
 * `null` no es un cuarto veredicto: es «no consta». Son las reclamaciones anteriores a la migración
 * 024 cuya resolución no se pudo atribuir con certeza (un pedido con varias reclamaciones y eventos
 * que no dicen a cuál se refieren). Se pintan como «en revisión» porque es lo único honesto que se
 * puede decir de ellas —no se sabe cómo acabaron—, pero **se piden en la pestaña de pendientes**, que
 * es donde el comprador las va a buscar.
 *
 * Se resuelve en UN sitio y no en cada pantalla: si la lista lo pintara de una forma y la ficha de
 * otra, la misma reclamación tendría dos veredictos según por dónde se entre.
 */
export const veredictoDe = (outcome: EcomerseDisputeOutcome | null): EstadoReclamacionDef =>
  buscarEstado(outcome) ?? ESTADOS_RECLAMACION[0];

/** Una pestaña de la lista: «Todas» más los tres veredictos. */
export interface FiltroReclamacionDef {
  id: 'todas' | EstadoReclamacion;
  label: string;
}

export const FILTROS_RECLAMACION: FiltroReclamacionDef[] = [
  { id: 'todas', label: 'Todas' },
  ...ESTADOS_RECLAMACION.map((e) => ({ id: e.id, label: e.label })),
];

/**
 * El filtro que pide la URL, o `'todas'`. Un id que no es de ningún veredicto cae en «Todas» en vez
 * de en un error: la URL la puede escribir cualquiera, y castigar al usuario por una barra mal puesta
 * es peor que enseñarle su lista entera.
 */
export const buscarFiltro = (id?: string | null): FiltroReclamacionDef['id'] =>
  id === 'todas' || buscarEstado(id) ? (id as FiltroReclamacionDef['id']) : 'todas';

/**
 * ¿Esta reclamación entra en esta pestaña?
 *
 * `todas` entra siempre. La de pendientes es la única con truco: recoge también las de veredicto
 * NULO, porque «no consta» se pinta como «en revisión» (ver `veredictoDe`) y dejarlas fuera de las
 * dos pestañas las haría desaparecer de la pantalla sin que el contador lo delatara.
 */
export const entraEnFiltro = (
  outcome: EcomerseDisputeOutcome | null,
  filtro: FiltroReclamacionDef['id'],
): boolean => {
  if (filtro === 'todas') return true;
  if (filtro === 'pending') return outcome === null || outcome === 'pending';
  return outcome === filtro;
};
