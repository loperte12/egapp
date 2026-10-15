/**
 * Lista · el widget de lista del Mercado (lo que en Taobao es `DXRecyclerLayout`)
 * ==============================================================================
 *
 * ## Qué resuelve
 *
 * **5 pantallas del Mercado usan `FlatList` y no tenían forma de expresarlo en un árbol.**
 * Un `FlatList` necesita un `renderItem` —una función por elemento—, y un árbol servido por el
 * servidor es declarativo. **La respuesta de Taobao es la misma que la de React: `data` + una
 * plantilla.** Aquí la plantilla es **el hijo único del nodo**:
 *
 * ```tsx
 * {
 *   tipo: 'Lista',
 *   valor: '$productos',              // la ruta a los datos (binding, ya resuelto arriba)
 *   atributos: { columnGap: 8 },
 *   hijos: [ plantillaDelProducto ],  // UN hijo: lo que se repite
 * }
 * ```
 *
 * ## Por qué el `renderizar` viene por prop y no de un import
 *
 * Este componente **no puede importar `Nodo`**: `Nodo` importa los componentes, y sería un ciclo.
 * Así que el `Nodo` le pasa **una función que ya sabe pintar un nodo con unos datos**. Es más
 * honesto que duplicar aquí la lógica de reparto de props.
 *
 * ## Lo que NO hace
 *
 * **Sin virtualización propia**: usa el `FlatList` de React Native, que ya recicla filas. Taobao
 * tiene `DXRecyclerView` con su propio reciclador y prefetch; **portar eso sería reescribir un
 * `FlatList`**, y no hay dato que diga que el de React Native no basta para el catálogo.
 */

import React from 'react';
import { FlatList, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { estiloDeCaja } from './layoutAtributos';
import { resolverLista, filasPorSpan, type AtributosDxLista } from './listaAtributos';

export interface ListaProps {
  /**
   * Los elementos ya resueltos. **Los resuelve el `Nodo`** desde el `valor` del nodo (que es un
   * binding `$ruta`), no este componente: aquí llegan datos, no una ruta.
   */
  datos?: unknown[];
  /**
   * Pinta un elemento. **Lo pasa el `Nodo`.** Si no llega, la lista sale vacía en vez de fallar:
   * un árbol sin plantilla no debe tumbar la pantalla.
   */
  renderizar?: (elemento: unknown, indice: number) => React.ReactElement | null;
  /**
   * El `span` de un elemento: **cuántas columnas ocupa**. Lo resuelve el `Nodo` contra la plantilla
   * de ese elemento (`ext:span`), porque el dato vive en el árbol y no en la lista.
   *
   * Sin esto, o con todos los `span` en 1, la rejilla es la de siempre; **solo cuando hay alguno
   * mayor que 1** se pinta por filas (ver `filasPorSpan`).
   */
  spanDe?: (elemento: unknown, indice: number) => unknown;
  /** Atributos `DXRecyclerLayout` decodificados, por nombre o por clave hex. */
  dx?: AtributosDxLista;
  /**
   * **¿Virtualiza por su cuenta?** Por defecto sí: usa el `FlatList` de React Native, que recicla
   * filas.
   *
   * Pero **una lista virtualizada dentro de un `ScrollView` rompe el reciclado del padre** —React
   * Native lo dice por consola, y no es un aviso cosmético: «VirtualizedLists should never be nested
   * inside plain ScrollViews with the same orientation because it can break windowing». Una sección
   * servida suele ir **dentro del scroll de la pantalla**, así que cuando la pantalla ya desplaza sus
   * secciones van con `virtualizar={false}`: las filas se pintan como `View`s normales y **el que
   * virtualiza es el de fuera**, que es como se compone una pantalla.
   *
   * Se midió al migrar el Mercado (15/10/2026): con el `ScrollView` de la pantalla y las secciones
   * virtualizando, la consola soltaba el error **en cada sección**. El banco de pruebas
   * `/ecomerse-ui` sigue con el valor por defecto porque allí **cada sección es su propio scroll**.
   */
  virtualizar?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Se avisa al llegar al final. **Hoy no lo emite nadie**: el camino del evento no existe. */
  alLlegarAlFinal?: () => void;
}

/**
 * Devuelve una clave estable para un elemento.
 *
 * **Sin esto, `FlatList` usa el índice y recicla mal las filas** cuando la lista cambia: el
 * contenido se queda pegado a la fila equivocada. Se intenta `id`, luego `key`, y si no hay
 * ninguno se cae al índice **declarándolo** — no se inventa una clave que parezca buena.
 */
function claveDe(elemento: unknown, indice: number): string {
  if (elemento && typeof elemento === 'object') {
    const o = elemento as Record<string, unknown>;
    if (typeof o.id === 'string') return o.id;
    if (typeof o.id === 'number') return String(o.id);
    if (typeof o.key === 'string') return o.key;
  }
  return `_${indice}`;
}

/**
 * Reparte los elementos en filas SIN virtualizar (para el camino de `virtualizar={false}`).
 *
 * Es el mismo reparto que hace el `FlatList` de arriba, pero en memoria: en rejilla manda el `span`
 * (`filasPorSpan`) y sin `span` se corta por columnas; en lista o franja, una fila por elemento.
 * **Tenerlo aquí y no en el componente** deja claro que las dos formas reparten IGUAL — que es la
 * única manera de que la rejilla se vea igual dentro y fuera de un scroll.
 */
function filasPlanas(
  elementos: unknown[],
  columnas: number,
  horizontal: boolean,
  spanDe?: (elemento: unknown, indice: number) => unknown,
) {
  if (horizontal || columnas <= 1) {
    return elementos.map((elemento, indice) => [{ elemento, indice, span: 1 }]);
  }
  if (spanDe) return filasPorSpan(elementos, columnas, spanDe).filas;
  const filas = [];
  for (let i = 0; i < elementos.length; i += columnas) {
    filas.push(elementos.slice(i, i + columnas).map((elemento, j) => ({ elemento, indice: i + j, span: 1 })));
  }
  return filas;
}

export function Lista({
  datos, renderizar, spanDe, dx, style, testID, alLlegarAlFinal, virtualizar = true,
}: ListaProps) {
  const r = resolverLista(dx);
  const elementos = Array.isArray(datos) ? datos : [];

  // `HIDEWHENEMPTY`: Taobao puede pedir que la lista no ocupe nada si no hay datos.
  if (elementos.length === 0 && r.esconderSiVacia) return null;
  // `MINCOUNT`: por debajo del mínimo, tampoco.
  if (r.minimoElementos !== undefined && elementos.length < r.minimoElementos) return null;

  // Sin plantilla no hay nada que repetir. **Se declara en el testID para que se vea en
  // las pruebas, en vez de dejar una lista vacía sin explicación.**
  if (!renderizar) {
    return <View testID={testID ? `${testID}-sin-plantilla` : undefined} style={estiloDeCaja(dx)} />;
  }

  const enRejilla = r.columnas > 1;
  const separacion = r.separacionFilas ?? r.separacionColumnas;

  // ── LA REJILLA IRREGULAR: el `span` por elemento ──────────────────────────────────────────────
  // Taobao deja que una tarjeta ocupe 1 o 2 columnas (`span`, medido: 31 de 41 en el catálogo de
  // seguidos). Con `numColumns` de `FlatList` eso NO se puede expresar —todas las celdas miden lo
  // mismo—, así que cuando hay algún `span` mayor que 1 **se pinta por FILAS**: cada fila es una
  // `View` en fila y cada elemento se lleva `flex: span`. Los que piden la fila entera van solos.
  const reparto = enRejilla && !r.horizontal && spanDe
    ? filasPorSpan(elementos, r.columnas, spanDe)
    : null;

  // ── SIN VIRTUALIZAR: dentro del scroll de la pantalla ────────────────────────────────────────
  // El que desplaza es el padre, así que aquí no se monta ningún `FlatList` (sería el anidado que
  // React Native prohíbe). Se pintan las filas como `View`s, con el MISMO reparto que arriba.
  if (!virtualizar) {
    const filas = filasPlanas(
      elementos,
      r.columnas,
      r.horizontal,
      enRejilla && !r.horizontal ? spanDe : undefined,
    );
    // **Solo la rejilla reparte el ancho entre sus columnas.** En una franja horizontal o en una
    // lista de una columna el ancho lo pone el contenido: un `flex: 1` estiraría la tarjeta de la
    // franja (132) hasta el ancho de la pantalla.
    const reparteAncho = !r.horizontal && r.columnas > 1;
    return (
      <View
        testID={testID}
        style={[
          estiloDeCaja(dx) as StyleProp<ViewStyle>,
          r.margenLateral !== undefined ? { paddingHorizontal: r.margenLateral } : null,
          // Una franja es una fila; una lista, una columna. La rejilla son filas de filas (abajo).
          r.horizontal ? { flexDirection: 'row' } : null,
          r.horizontal && r.separacionColumnas !== undefined ? { columnGap: r.separacionColumnas } : null,
          !r.horizontal && r.separacionFilas !== undefined ? { rowGap: r.separacionFilas } : null,
          style,
        ]}
      >
        {filas.map((fila, f) => (
          <View
            key={fila.map((c) => claveDe(c.elemento, c.indice)).join('|') || `fila-${f}`}
            style={[
              { flexDirection: 'row' },
              r.separacionColumnas !== undefined && fila.length > 1 ? { columnGap: r.separacionColumnas } : null,
            ]}
          >
            {fila.map(({ elemento, indice, span }) => (
              <View key={claveDe(elemento, indice)} style={reparteAncho ? { flex: span } : undefined}>
                {renderizar(elemento, indice)}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (reparto?.irregular && renderizar) {
    return (
      <FlatList
        testID={testID}
        data={reparto.filas}
        // La clave de una fila es la de sus elementos: si cambia el reparto, la fila se recicla bien.
        keyExtractor={(fila) => fila.map((c) => claveDe(c.elemento, c.indice)).join('|')}
        renderItem={({ item: fila }) => (
          <View
            style={[
              { flexDirection: 'row' },
              r.separacionColumnas !== undefined ? { columnGap: r.separacionColumnas } : null,
            ]}
          >
            {fila.map(({ elemento, indice, span }) => (
              // `flex: span` es el reparto del ancho: una tarjeta de 2 columnas se lleva el doble.
              // **El `span` ya viene saneado** (1..columnas) por `filasPorSpan`.
              <View key={claveDe(elemento, indice)} style={{ flex: span }}>
                {renderizar(elemento, indice)}
              </View>
            ))}
          </View>
        )}
        ItemSeparatorComponent={r.separacionFilas !== undefined ? () => (
          <View style={{ height: r.separacionFilas }} />
        ) : null}
        contentContainerStyle={r.margenLateral !== undefined
          ? { paddingHorizontal: r.margenLateral }
          : undefined}
        style={[estiloDeCaja(dx) as StyleProp<ViewStyle>, style]}
      />
    );
  }

  return (
    <FlatList
      testID={testID}
      // **`key` obligatoria cuando `numColumns` cambia**: React Native no puede cambiar el número
      // de columnas de una lista ya montada, y sin la `key` lanza. Es un requisito suyo, no una
      // decisión de diseño.
      key={enRejilla ? `rejilla-${r.columnas}` : 'lista'}
      data={elementos}
      keyExtractor={claveDe}
      renderItem={({ item, index }) => renderizar(item, index)}
      // **Una franja horizontal es una lista con orientación de fila**, no un widget aparte. Con
      // `horizontal`, `numColumns` tiene que quedarse en 1: React Native prohíbe las dos juntas.
      horizontal={r.horizontal}
      numColumns={r.horizontal ? 1 : r.columnas}
      // La separación entre filas se hace con `ItemSeparatorComponent`; la de columnas, con el
      // reparto del ancho. **`columnWrapperStyle` sólo existe en modo rejilla**, y pasarlo en
      // modo lista hace que React Native avise.
      ItemSeparatorComponent={separacion !== undefined && !enRejilla ? () => (
        <View style={r.horizontal ? { width: separacion } : { height: separacion }} />
      ) : null}
      columnWrapperStyle={enRejilla && !r.horizontal && r.separacionColumnas !== undefined
        ? { columnGap: r.separacionColumnas }
        : undefined}
      contentContainerStyle={r.margenLateral !== undefined
        ? { paddingHorizontal: r.margenLateral }
        : undefined}
      // El estilo de CAJA (vocabulario compartido) va en el contenedor: la lista también tiene
      // márgenes, tamaño y visibilidad como cualquier otro widget.
      style={[estiloDeCaja(dx) as StyleProp<ViewStyle>, style]}
      onEndReached={r.pideFinDeLista ? alLlegarAlFinal : undefined}
      // Sin `getItemLayout`: exige altura fija por fila y la plantilla puede variar. Añadirlo con
      // alturas distintas daría saltos de scroll — peor que no tenerlo.
      // Sin `initialNumToRender`/`windowSize`: son afinado de rendimiento y no hay medida que
      // diga que haga falta. Ponerlos sería una decisión sin dato.
    />
  );
}

export default Lista;

export { resolverLista, CLAVES_LISTA, PROCEDENCIA } from './listaAtributos';
export type { AtributosDxLista, ResolucionLista, NombreAtributoLista } from './listaAtributos';
