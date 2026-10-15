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

import React, { useEffect, useState } from 'react';
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
  testID?: string;
}

export function FranjaServidor({ ruta, alTocar, alAccion, style, testID }: FranjaServidorProps) {
  const [arbol, setArbol] = useState<NodoRemoto | null>(null);
  const [datos, setDatos] = useState<unknown>(undefined);

  // **El modo del sistema viaja al servidor**: es quien resuelve los colores (Taobao hace lo mismo
  // con `style.styleData.*`). Si el usuario cambia claro/oscuro, se vuelve a pedir la franja.
  const tema = useColorScheme() === 'dark' ? 'oscuro' : 'claro';

  useEffect(() => {
    // **Si algo falla, se queda en `null` y no se pinta nada.** Sin `catch` visible a propósito:
    // una franja que no llega no es un error de la pantalla, y el resto funciona igual sin ella.
    const c = new AbortController();
    pedirUi(ruta, c.signal, tema).then((r) => {
      if (c.signal.aborted || !r) return;
      setArbol(r.arbol);
      setDatos(r.datos);
    });
    return () => c.abort();
    // `ruta` manda: si cambia el producto, se vuelve a pedir. `tema`, si cambia el modo.
  }, [ruta, tema]);

  if (!arbol) return null;

  return (
    <View style={style} testID={testID ? `${testID}-contenedor` : undefined}>
      <Renderizador
        testID={testID ?? 'franja-servidor'}
        arbol={arbol as never}
        datos={datos}
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
