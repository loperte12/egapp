// =============================================================================
// tarjetasDeSiguiendo.mjs — LA SECCIÓN 关注 DE TAOBAO, CLONADA POR VARIANTES
// =============================================================================
//
// **De dónde sale esto.** No es inventado: está leído de las SIETE plantillas que sirven la sección
// en la app de Taobao (`assets/template/live_channel_flexalocal/taolive_channel_follow_*`), volcadas
// con `re-e-categorias/seguir-construccion.mjs`:
//
//   1. `..._common_title_card`          → la tarjeta de título (`cardInfo.cardTitle`)
//   2. `..._live_card` (112, 29 KB)     → LA GRANDE, con todas las variantes de la tarjeta de directo
//   3. `..._new_empty_card`             → **vacío Y error de red en la misma tarjeta** (imagen 420×300
//                                         + 「刷新」 + `isNetError`)
//   4. `..._preplayback_foldmenu`       → el menú plegable de reproducción automática
//   5. `..._preplayback_loadmore`       → 「点击加载更多」 (toca para cargar más)
//   6. `..._recommend_title`            → el título de la sección de recomendados (`description`)
//   7. `..._sjsdbigfeed_card_2026`      → la tarjeta grande del feed 2026 (avatar + portada)
//
// **Las variantes salen de los DATOS, como en Taobao**: allá el motor lee `cardData[0]` y enseña una
// cosa u otra según `liveInfo.roomStatus`, `liveInfo.replayExpire`, `newPreLiveInfo`, `recommendInfo`…
// Aquí igual: el servidor mira cada tarjeta y **elige su plantilla**. El cliente no decide nada.
//
// ⚠️ **Lo que NO se puede clonar todavía, y se declara**: la tarjeta de Taobao lleva un
// `live_card_playerview` (el vídeo dentro de la tarjeta). Nuestro contrato no tiene widget de vídeo,
// así que la tarjeta lleva **la portada y el botón de reproducir** — y el botón dice qué haría.
// =============================================================================

/**
 * Los tipos de tarjeta que puede haber en el feed. **Uno por variante**, como las plantillas de
 * Taobao: una tarjeta no se "configura" con banderas, se **elige**.
 */
/** Lo que trae una tienda seguida (o un recomendado) del API: **muchos campos son opcionales** porque
 *  el feed de Taobao es heterogéneo — esa es justamente la razón de que haya variantes. */
export interface DatosSiguiendo {
  titulo?: string;
  sinRed?: boolean;
  /** El ajuste de reproducción automática: `true` (o ausente) = plegado, que es como viene Taobao. */
  autoplayPlegado?: boolean;
  tiendas?: Array<Record<string, unknown> & { id?: string; nombre?: string; anuncio?: Record<string, unknown>; repeticion?: boolean }>;
  recomendados?: Array<Record<string, unknown>>;
  grandes?: Array<Record<string, unknown>>;
}

/** Una tarjeta ya resuelta: **su tipo decide su plantilla**, y los demás campos son sus datos. */
export interface TarjetaSiguiendo {
  /** Decidesu plantilla. */
  tipo: string;
  /** El resto de sus campos son sus datos: cada variante usa los suyos. */
  [campo: string]: unknown;
}

export const TIPOS_TARJETA = {
  TITULO: 'titulo',
  EN_VIVO: 'en_vivo',
  REPETICION: 'repeticion',
  ANUNCIO: 'anuncio',
  TITULO_RECOMENDADO: 'titulo_recomendado',
  RECOMENDADO: 'recomendado',
  GRANDE: 'grande',
  VACIO: 'vacio',
  SIN_RED: 'sin_red',
  CARGAR_MAS: 'cargar_mas',
  /** El menú plegable de reproducción automática (`preplayback_foldmenu`). */
  AUTOPLAY: 'autoplay',
};

/** El nombre de plantilla de cada variante (lo que viaja en `ext:plantilla` de cada elemento). */
export const PLANTILLA_SIGUIENDO = {
  [TIPOS_TARJETA.TITULO]: 'seguir_titulo',
  [TIPOS_TARJETA.EN_VIVO]: 'seguir_en_vivo',
  [TIPOS_TARJETA.REPETICION]: 'seguir_repeticion',
  [TIPOS_TARJETA.ANUNCIO]: 'seguir_anuncio',
  [TIPOS_TARJETA.TITULO_RECOMENDADO]: 'seguir_titulo_recomendado',
  [TIPOS_TARJETA.RECOMENDADO]: 'seguir_recomendado',
  [TIPOS_TARJETA.GRANDE]: 'seguir_grande',
  [TIPOS_TARJETA.VACIO]: 'seguir_vacio',
  [TIPOS_TARJETA.SIN_RED]: 'seguir_sin_red',
  [TIPOS_TARJETA.CARGAR_MAS]: 'seguir_cargar_mas',
  [TIPOS_TARJETA.AUTOPLAY]: 'seguir_autoplay',
};

/** Las acciones que pide el feed. **Nombres de extensión**, declarados en el cliente. */
export const ACCIONES_SIGUIENDO = {
  SEGUIR: 'ext:seguir',
  AVISAR: 'ext:avisar',
  REPRODUCIR: 'ext:reproducir',
  REFRESCAR: 'ext:refrescar',
  CARGAR_MAS: 'ext:cargarmas',
  PLEGAR: 'ext:plegar',
};

/**
 * LAS SIETE PLANTILLAS, EN ORDEN — tal cual las enseña Taobao.
 *
 * El orden no es decoración: el carril del feed las pone así (título → directos → recomendados →
 * feed grande → cargar más), y el vacío **sustituye** a todo cuando no hay nada.
 */
export const ORDEN_DE_PLANTILLAS = [
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.TITULO],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.EN_VIVO],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.REPETICION],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.ANUNCIO],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.TITULO_RECOMENDADO],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.RECOMENDADO],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.GRANDE],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.CARGAR_MAS],
  PLANTILLA_SIGUIENDO[TIPOS_TARJETA.VACIO],
];

/**
 * DE LOS DATOS A LAS TARJETAS. **Aquí vive "con todas sus variantes".**
 *
 * Taobao decide con `cardData[0]`: si hay `newPreLiveInfo` es un anuncio (预约); si `replayExpire` es
 * repetición; si está `liveInfo.streamStatus` es directo; si trae `recommendInfo` es recomendado; y si
 * el feed viene vacío o con `isNetError`, la tarjeta de vacío.
 *
 * **Un feed sin tarjetas NO es un feed vacío a medias: es la tarjeta de vacío.** Si no se pone, la
 * pantalla queda en blanco y parece rota.
 */
export function tarjetasDeSiguiendo(datos: DatosSiguiendo | null | undefined): TarjetaSiguiendo[] {
  /**
   * **La copia de cada variante vive CON la variante.**
   *
   * No es un detalle de organización: en Taobao el rótulo está **dentro de la plantilla**
   * (`new_empty_card` lleva su `title` y su 「刷新」; el `foldmenu`, su descripción). Si el texto lo
   * pusiera el cliente habría dos sitios donde cambiarlo, y el día que uno cambiara el otro mentiría.
   * Y si no lo pusiera nadie saldría **una tarjeta vacía** — que es exactamente lo que se vio en el
   * móvil la primera vez: una caja gris sin nada dentro.
   */
  const tiendas = Array.isArray(datos?.tiendas) ? datos.tiendas : [];
  if (datos?.sinRed) {
    return [{
      tipo: TIPOS_TARJETA.SIN_RED,
      titulo: 'No pudimos cargar esto',
      texto: 'Revisa tu conexión y vuelve a intentarlo.',
      rotulo: 'Reintentar',
    }];
  }
  if (tiendas.length === 0) {
    return [{
      tipo: TIPOS_TARJETA.VACIO,
      titulo: 'Aquí verás los directos de las tiendas que sigues',
      texto: 'Cuando sigas una tienda, sus directos aparecen aquí, en orden.',
      rotulo: 'Actualizar',
    }];
  }
  const tarjetas: TarjetaSiguiendo[] = [];
  // **El menú de reproducción automática va ARRIBA**, antes de todo: en Taobao es un ajuste del feed
  // (preplayback_foldmenu) y solo aparece cuando hay feed que reproducir — con el vacío, no.
  const plegado = datos?.autoplayPlegado !== false;
  tarjetas.push({
    tipo: TIPOS_TARJETA.AUTOPLAY,
    plegado,
    estado: plegado ? 'Reproducción automática: plegada' : 'Reproducción automática: desplegada',
    rotulo: plegado ? 'Desplegar' : 'Plegar',
  });
  // El título de la sección: en Taobao es una tarjeta (`common_title_card`).
  tarjetas.push({ tipo: TIPOS_TARJETA.TITULO, titulo: datos?.titulo ?? 'Siguiendo' });
  for (const t of tiendas) {
    /**
     * **Cada tienda seguida se convierte en su variante**, por lo que trae.
     *
     * ⚠️ **Lo que trae hoy nuestro backend son TIENDAS, no directos.** El feed de 关注 de Taobao es de
     * directos (`live_card`, con `liveInfo`), y esas variantes están clonadas y disponibles; pero
     * mientras el dato sea un vendedor, la tarjeta que le toca es la **grande**
     * (`sjsdbigfeed_card_2026`: portada + título + creador), con su botón de seguir para poder dejarlo.
     * El día que el backend sirva directos, bastará con que traigan `enVivo`, `repeticion` o `anuncio`.
     */
    if (t.anuncio) tarjetas.push({ tipo: TIPOS_TARJETA.ANUNCIO, ...t.anuncio, tienda: t.nombre, id: t.id });
    else if (t.repeticion) tarjetas.push({ tipo: TIPOS_TARJETA.REPETICION, ...t });
    else if (t.enVivo) tarjetas.push({ tipo: TIPOS_TARJETA.EN_VIVO, ...t });
    else tarjetas.push({ tipo: TIPOS_TARJETA.GRANDE, ...t, rotuloSeguir: 'Siguiendo' });
  }
  if (datos?.recomendados?.length) {
    tarjetas.push({ tipo: TIPOS_TARJETA.TITULO_RECOMENDADO, titulo: 'Basado en tus seguidos' });
    for (const r of datos.recomendados) tarjetas.push({ tipo: TIPOS_TARJETA.RECOMENDADO, ...r });
  }
  if (datos?.grandes?.length) for (const g of datos.grandes) tarjetas.push({ tipo: TIPOS_TARJETA.GRANDE, ...g });
  // Y al final, el cargar-más del feed (`preplayback_loadmore`): **con su rótulo**, como la plantilla
  // de Taobao, que lleva el 「点击加载更多」 dentro.
  tarjetas.push({ tipo: TIPOS_TARJETA.CARGAR_MAS, rotulo: 'Ver más directos' });
  return tarjetas;
}
