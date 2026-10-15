/**
 * FranjaServidor — una franja del Mercado que la pinta el SERVIDOR
 * ===============================================================
 *
 * ## Qué es, y por qué está así
 *
 * Es **una sección real del Mercado** —la primera— cuyo contenido **no está en el cliente**. El
 * servidor manda un árbol y este componente lo pinta. Aquí **no hay ni un widget nombrado**: si
 * mañana el servidor cambia el orden, los colores o mete una rejilla, **este fichero no se toca**.
 *
 * ## Por qué ADITIVA y no convirtiendo una sección que ya existía
 *
 * Se midió antes de tocar nada: **8 de las 10 pantallas del Mercado con `FlatList` usan un
 * componente compartido COMO LA FILA** (`CabeceraTienda` en 4, `TarjetaProducto` en 3,
 * `FichaArticulo` en 3). Convertir cualquiera de esas a un árbol **duplicaría ese componente en
 * cada pantalla** — destruyendo justo lo que el comentario de `ecomerse-tiendas.tsx:30` celebra
 * haber conseguido.
 *
 * Así que esto **se añade al lado**, no en lugar de: la pantalla sigue con su JSX, y esta franja
 * es nueva. **Es también como se despliega la UI servida de verdad** — una sección, se mira, y
 * luego la siguiente.
 *
 * ## Y si el servidor no responde
 *
 * **No se pinta nada, y el Mercado sigue funcionando entero.** No hay árbol de repuesto en el
 * cliente: un repuesto es una segunda fuente de verdad que se queda obsoleta en silencio, y
 * entonces nadie sabe si lo que se ve vino del servidor o de aquí. **Una sección que no llega es
 * una sección que no está** — y como el resto de la pantalla funciona igual, no se nota como un
 * fallo sino como que no está.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, useColorScheme } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { pedirUi, type NodoRemoto } from '../../api/ecomerseUi';
import { CLAVES_VALOR } from './valorAtributos';
import { Renderizador } from './Renderizador';

export interface FranjaServidorProps {
  /**
   * Qué se pide al servidor. **Una ruta por sección.**
   *
   * - `'home'` — la franja de la portada del Mercado
   * - `` `detail?id=${id}` `` — los relacionados de una ficha
   *
   * **Si todas pidieran lo mismo, el servidor no podría decir cosas distintas en cada sitio.**
   */
  ruta: string;
  /**
   * A dónde va el toque, dado el id que mandó el servidor.
   *
   * **Este componente no sabe qué son los elementos.** El servidor puso `EVENT_TAP: '$item.id'`
   * y aquí sólo llega un id: si mañana la franja son tiendas, se cambia esta función y ya.
   */
  alTocar: (id: string) => void;
  /**
   * **La acción que pide el árbol** (`ext:accion`): `ext:favorito`, `ext:carrito`…
   *
   * Si no se pasa, un toque con acción se trata como un toque normal — **nunca se pierde el toque
   * en silencio**, que es lo que dejaría un corazón que no hace nada.
   *
   * Los `datos` de la sección van también: la acción es sobre un producto, y el producto está ahí.
   */
  alAccion?: (accion: string, id: string, datos: unknown, nodo: unknown) => void;
  /**
   * Estilo del contenedor de la franja. **Hace falta cuando la sección lleva una lista**: un
   * `FlatList` sin altura dentro de un contenedor flexible mide cero, y la sección sale vacía sin
   * ningún error. Quien la usa decide cuánto ocupa.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * **El ESTADO de la sección**, para que la pantalla pueda acompañarla: `cargando` (se está
   * pidiendo), `lista` (llegó y trae árbol), `vacia` (el servidor dijo que no hay nada:
   * `arbol: null`) o `error` (no llegó: sin red, HTTP malo o un cuerpo que no se entiende).
   *
   * **Por qué existe, y por qué `error` es distinto de `vacia`**: una pantalla que **sustituye su
   * lista** por una sección —el paso que se dio en el Mercado el 15/10/2026— tiene que decidir entre
   * «todavía no hay productos» y «no pudimos cargar». Son dos frases distintas y **una de ellas es una
   * afirmación sobre el catálogo**: decir «no hay productos» cuando lo que falló es la red es mentir.
   */
  alEstado?: (estado: 'cargando' | 'lista' | 'vacia' | 'error', datos?: unknown) => void;
  /**
   * **Cambiar este número vuelve a pedir la sección.** Es lo que necesitan la tirar-para-recargar y el
   * botón de reintento: el `ruta` no cambia en ninguno de los dos casos, así que sin esto no habría
   * forma de volver a preguntar. Un contador y no un booleano: dos recargas seguidas tienen que ser
   * dos peticiones, y `true → false → true` se pierde por el camino.
   */
  recarga?: number;
  /**
   * **¿La sección desplaza por su cuenta?** Por defecto sí.
   *
   * Una pantalla que ya tiene su propio scroll (el Mercado, desde el 15/10/2026) pasa `false`: si la
   * sección montara su lista virtualizada dentro del scroll de la pantalla, React Native soltaría
   * «VirtualizedLists should never be nested inside plain ScrollViews» **y el reciclado se rompería
   * de verdad**. Con `false` la sección se pinta como filas normales y **desplaza el de fuera**.
   *
   * El banco de pruebas `/ecomerse-ui` sigue con el valor por defecto: allí cada sección es su
   * propio scroll.
   */
  desplazable?: boolean;
  testID?: string;
}

export function FranjaServidor({ ruta, alTocar, alAccion, alEstado, recarga, desplazable = true, style, testID }: FranjaServidorProps) {
  const [arbol, setArbol] = useState<NodoRemoto | null>(null);
  const [datos, setDatos] = useState<unknown>(undefined);

  // **El aviso va por `ref` y NO en las dependencias del efecto.** Quien usa esto pasa una función
  // nueva en cada render (`(e) => setEstado(e)`), así que meterla en las dependencias volvería a pedir
  // la sección en cada render —una petición por render, y un bucle—. El `ref` se actualiza aparte y el
  // efecto sigue dependiendo solo de lo que de verdad cambia la petición.
  const avisoRef = useRef(alEstado);
  useEffect(() => { avisoRef.current = alEstado; }, [alEstado]);

  // **El modo del sistema viaja al servidor**: es quien resuelve los colores (Taobao hace lo mismo
  // con `style.styleData.*`). Si el usuario cambia claro/oscuro, se vuelve a pedir la franja.
  const tema = useColorScheme() === 'dark' ? 'oscuro' : 'claro';

  useEffect(() => {
    // **Si algo falla, se queda en `null` y no se pinta nada.** Sin `catch` visible a propósito:
    // una franja que no llega no es un error de la pantalla, y el resto funciona igual sin ella.
    // Lo que sí se hace es **contarle el motivo a quien lo pregunte** (`alEstado`): la pantalla que
    // sustituye su lista necesita distinguir «no hay nada» de «no llegó».
    const c = new AbortController();
    avisoRef.current?.('cargando');
    pedirUi(ruta, c.signal, tema, () => {
      if (!c.signal.aborted) avisoRef.current?.('error');
    }).then((r) => {
      if (c.signal.aborted) return;
      if (!r) {
        // `arbol: null` es «no hay nada que pintar», no un fallo: se dice `vacia` y la pantalla decide.
        setArbol(null);
        setDatos(undefined);
        avisoRef.current?.('vacia');
        return;
      }
      setArbol(r.arbol);
      setDatos(r.datos);
      avisoRef.current?.('lista', r.datos);
    });
    return () => c.abort();
    // `ruta` manda: si cambia el filtro o el producto, se vuelve a pedir. `tema`, si cambia el modo.
    // `recarga`, cuando la pantalla pide volver a preguntar (tirar para recargar, reintento).
  }, [ruta, tema, recarga]);

  if (!arbol) return null;

  return (
    <View style={style} testID={testID ? `${testID}-contenedor` : undefined}>
      <Renderizador
        testID={testID ?? 'franja-servidor'}
        arbol={arbol as never}
        datos={datos}
        virtualizar={desplazable}
        // **El nombre del evento lleva el ID del producto** (es como la tarjeta navega a la ficha).
        // La ACCIÓN —corazón, carrito— viaja aparte, en `ext:accion`, y el `Renderizador` no tiene
        // que saber nada: la resuelve él, porque es un atributo resuelto como cualquier otro.
        alEvento={(id, nodo) => {
          const accion = (nodo?.atributos as Record<string, unknown> | undefined)?.[CLAVES_VALOR.ACCION];
          if (typeof accion === 'string' && alAccion) {
            alAccion(accion, String(id), datos, nodo);
            return;
          }
          alTocar(String(id));
        }}
      />
    </View>
  );
}

export default FranjaServidor;
