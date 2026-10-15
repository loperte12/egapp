/**
 * repartoServicios — cuántos servicios caben y cuáles van dentro de «Más servicios»
 * ==================================================================================
 *
 * **Decisión del dueño del producto (15/10/2026)**: en la cabecera del Mercado los servicios van
 * **dos filas de cinco**, y **lo que sobra se agrega dentro de «Más servicios»**, como Taobao.
 *
 * Este módulo es la parte que se puede probar sin React: dado el catálogo, **quién se ve y quién va
 * dentro**. La cuenta no es un detalle de estilo:
 *
 *   · La última plaza de la rejilla **es** «Más servicios», no un servicio más. Por eso se ven
 *     `filas × columnas − 1` servicios y no `filas × columnas`: si se vieran los diez, «más» tendría
 *     que salirse de la rejilla (una fila de once plazas no es una rejilla de cinco).
 *   · **Si todo cabe, no hay «más»**: un botón que abre un panel vacío es peor que no tenerlo. Con 15
 *     servicios y diez plazas sí hay resto; el día que el catálogo baje a 9, la última plaza vuelve a
 *     ser un servicio y «Más servicios» desaparece solo.
 */

export interface RepartoDeServicios<T> {
  /** Los que se ven en la rejilla, en orden. */
  visibles: T[];
  /** Los que van DENTRO de «Más servicios», en orden. */
  resto: T[];
  /** `false` cuando no sobra ninguno: entonces la rejilla usa todas las plazas para servicios. */
  hayMas: boolean;
  /** Plazas de la rejilla (`filas × columnas`). */
  plazas: number;
}

/**
 * Reparte el catálogo en «visibles» y «resto».
 *
 * `plazas = filas × columnas`. Si hay más servicios que plazas, **una plaza se reserva para «Más
 * servicios»**; si caben todos, no se reserva ninguna.
 */
export function reparteServicios<T>(
  servicios: readonly T[],
  filas: number,
  columnas: number,
): RepartoDeServicios<T> {
  const plazas = Math.max(0, Math.trunc(filas) * Math.trunc(columnas));
  // Con exactamente las plazas justas tampoco hay «más»: caben todos y el botón no tendría qué abrir.
  if (servicios.length <= plazas) {
    return { visibles: [...servicios], resto: [], hayMas: false, plazas };
  }
  // **Se reserva UNA plaza para «Más servicios»**, y si no hay ni una plaza no se ve ningún servicio:
  // todo está dentro. (`slice(0, -1)` sería un error silencioso: quita el ÚLTIMO en vez de no dar
  // ninguno. Lo cazó una prueba de este reparto, no el móvil.)
  const visibles = plazas >= 1 ? servicios.slice(0, plazas - 1) : [];
  return { visibles, resto: servicios.slice(visibles.length), hayMas: true, plazas };
}

export default { reparteServicios };
