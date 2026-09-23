/**
 * utils/combinaciones.ts — LAS REGLAS DE LOS EJES Y LAS COMBINACIONES, UNA SOLA VEZ (app).
 *
 * POR QUÉ EXISTE. En el servidor, estas reglas viven en un módulo único
 * (`src/services/opciones-producto.ts`) para que los dos mercados —Mercado y Life Book— **no puedan
 * rechazar cosas distintas**: un color sin su foto real, un eje repetido, una combinación que no
 * existe. En la app pasaba lo contrario: los topes y el producto cartesiano estaban escritos **solo**
 * dentro de `state/commercePublish.ts`, que es el estado del asistente de Life Book. La pantalla de
 * combinaciones del Mercado habría tenido que copiarlos, y a la segunda copia los dos mercados
 * empiezan a divergir: uno deja 60 combinaciones y el otro 50, y el comerciante lee un error que no
 * entiende sobre algo que la interfaz le dejó escribir.
 *
 * QUÉ SE COMPARTE, y por qué precisamente esto:
 *   · los **TOPES**, que son los mismos que aplica el servidor (3 ejes, 30 valores, 60 combinaciones);
 *   · el **CÓDIGO** de un eje —el eje viaja al servidor como `code`, no como su etiqueta—;
 *   · la **FIRMA** de una combinación: su identidad (los valores de los ejes en su orden, en
 *     minúsculas). Es lo que permite regenerar la matriz sin borrar lo que el comerciante ya escribió;
 *   · el **PRODUCTO CARTESIANO**: las combinaciones se generan, no se teclean;
 *   · el **RESUMEN**: precio mínimo y máximo, existencias totales y el aviso de rango disparado.
 *
 * QUÉ NO SE COMPARTE, a propósito:
 *   · el **payload**. Cada mercado tiene su forma: Life Book manda `chartKind` y sus tablas de tallas;
 *     el Mercado no las tiene y no se le inventan. Unificarlo obligaría a un tipo con campos
 *     opcionales que significan cosas distintas en cada sitio.
 *   · el **estado**. Life Book lleva un borrador en zustand con seis pasos; el Mercado edita un
 *     anuncio que ya existe y le basta con el estado del componente. Meter el del Mercado en el store
 *     de Life Book sería tocar un mercado que funciona para no ganar nada.
 *
 * `state/commercePublish.ts` **delega aquí** estas funciones (que antes eran la única copia) y las
 * re-exporta, de modo que sus dos consumidores —`OptionGroupsEditor` y la propia tienda— no cambian
 * ni una línea. Es el mismo movimiento que hizo el servidor cuando extrajo su módulo compartido.
 */

/**
 * Los topes, los MISMOS que el servidor (`OPCIONES_GRUPOS_MAX` / `OPCIONES_VALORES_MAX` /
 * `COMBINACIONES_MAX`). Si aquí hubiera otro número, la app dejaría rellenar algo que el servidor
 * rechaza — y el comerciante se enteraría al guardar, con el trabajo ya hecho.
 */
export const GRUPOS_MAX = 3;
export const VALORES_MAX = 30;
export const COMBOS_MAX = 60;

/**
 * A partir de este factor, el rango de precios de un mismo anuncio deja de ser una gama y pasa a ser
 * un problema: el comprador ve el precio barato en la lista y al entrar se encuentra el caro.
 *
 * NO es una regla del servidor y por eso aquí es un **aviso**, no un candado: hay anuncios
 * legítimos con un rango grande (un producto con funda y sin funda). La referencia de la que sale
 * —un «hogar» de marketplace— usa 2–3× y recomienda partir el anuncio en dos si hace falta más.
 */
export const FACTOR_RANGO_AMPLIO = 3;

/** Lo mínimo que hay que saber de un eje para operar con él. Sirve para los dos mercados. */
export interface GrupoConValores {
  code: string;
  values: { value: string }[];
}

/**
 * El código de un eje a partir de su nombre: «Talla (calzado)» → `talla_calzado`.
 *
 * El servidor vuelve a calcularlo (y es él quien manda), así que esto no es una validación: es para
 * que lo que se ve y lo que se guarda sean lo mismo. Sin esto, el comerciante escribiría «Talla
 * (calzado)» y el servidor guardaría `talla_calzado_`, y las combinaciones —que se atan por el
 * código— hablarían de un eje cuyo nombre no aparece por ningún lado de la pantalla.
 */
export const aCodigo = (label: string): string => label.trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

/**
 * La FIRMA de una combinación: los valores de los ejes **en su orden**, en minúsculas.
 *
 * Es la identidad de una fila, y de ella depende que regenerar la matriz **conserve** el precio y el
 * stock ya escritos. ADVERTENCIA HEREDADA del servidor (que se apoya en lo mismo): como la identidad
 * es el TEXTO del valor, **renombrar** un valor rompería el emparejamiento y esa fila se iría con su
 * stock. Hoy no puede pasar porque un valor solo se **añade** o se **quita**, y quitar avisa de lo
 * que se lleva (ver `EditorDeCombinaciones`).
 */
export const firmaDe = (grupos: GrupoConValores[], attrs: Record<string, string> | undefined | null): string =>
  grupos.map((g) => String(attrs?.[g.code] ?? '').trim().toLowerCase()).join('|');

/**
 * El PRODUCTO CARTESIANO de los ejes: «Rojo × S», «Rojo × M», «Azul × S»…
 *
 * Es como lo hacen los marketplaces grandes: el comerciante **no escribe las combinaciones**, solo
 * pone su precio y su stock. Escribirlas a mano es donde se cuelan las que no existen —una talla XL
 * en un color que no se fabrica— y las que faltan.
 *
 * Genérico sobre `T` para que sirva a las dos formas de eje (la del Mercado y la de Life Book) sin
 * obligar a ninguna a convertirse en la otra.
 */
export function combinacionesDe<T extends GrupoConValores>(grupos: T[]): { attrs: Record<string, string>; nombre: string }[] {
  const utiles = grupos.filter((g) => g.values.length > 0);
  if (!utiles.length) return [];
  let acc: { attrs: Record<string, string>; nombre: string }[] = [{ attrs: {}, nombre: '' }];
  for (const g of utiles) {
    const siguiente: { attrs: Record<string, string>; nombre: string }[] = [];
    for (const base of acc) {
      for (const v of g.values) {
        siguiente.push({
          attrs: { ...base.attrs, [g.code]: v.value },
          nombre: base.nombre ? `${base.nombre} · ${v.value}` : v.value,
        });
      }
    }
    acc = siguiente;
  }
  return acc;
}

/**
 * Un número escrito a mano en un campo de texto, o `null` si no hay ninguno.
 *
 * `''` NO es 0 y la diferencia importa: un precio vacío **hereda el del anuncio**, mientras que un
 * 0 sería un precio de cero XAF. Confundirlos es la clase de atajo que convierte «no lo he puesto
 * todavía» en «lo regalo».
 */
export const numeroDe = (texto: string | null | undefined): number | null => {
  const limpio = String(texto ?? '').replace(/[^\d]/g, '');
  return limpio ? Number(limpio) : null;
};

/** Una combinación tal y como se está ESCRIBIENDO en el editor: precio y stock son texto. */
export interface BorradorVariante {
  name: string;
  priceXaf: string;
  stockQuantity: string;
  attributes: Record<string, string>;
}

export interface ResumenCombinaciones {
  n: number;
  /** El precio más bajo y el más alto que puede llegar a pagar el comprador (vacío = el del anuncio). */
  precioMin: number | null;
  precioMax: number | null;
  /** La suma de las existencias escritas: es el `stock` que el servidor espejará en el anuncio. */
  stockTotal: number;
  /** Cuántas combinaciones se quedan sin unidades: se verán en la ficha como «agotado». */
  agotadas: number;
  /** `precioMax > precioMin × FACTOR_RANGO_AMPLIO`: el rango se avisa, no se bloquea. */
  rangoAmplio: boolean;
}

/**
 * El resumen que el editor enseña EN VIVO mientras se escribe.
 *
 * Existe porque hay dos cosas que no se ven en una lista de filas: **el rango de precios** (cada fila
 * se mira sola) y **el total de existencias** (que en el Mercado es, además, el número que acabará
 * teniendo el anuncio — el anuncio se vende por combinaciones, así que su stock es la suma). Sin este
 * bloque, repartir 20 unidades en dos filas de 20 se guardaría como 40 sin que nadie lo dijera.
 */
export function resumenDe(variantes: BorradorVariante[], precioAnuncio: number | null): ResumenCombinaciones {
  const precios = variantes
    .map((v) => numeroDe(v.priceXaf) ?? precioAnuncio)
    .filter((n): n is number => n !== null && n > 0);
  const stockTotal = variantes.reduce((suma, v) => suma + (numeroDe(v.stockQuantity) ?? 0), 0);
  const precioMin = precios.length ? Math.min(...precios) : null;
  const precioMax = precios.length ? Math.max(...precios) : null;
  return {
    n: variantes.length,
    precioMin,
    precioMax,
    stockTotal,
    agotadas: variantes.filter((v) => (numeroDe(v.stockQuantity) ?? 0) <= 0).length,
    rangoAmplio: !!(precioMin && precioMax && precioMin > 0 && precioMax > precioMin * FACTOR_RANGO_AMPLIO),
  };
}
