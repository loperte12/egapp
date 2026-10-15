/**
 * Renderizador · el componente que convierte un árbol del servidor en pantalla
 * ============================================================================
 *
 * **La pieza que une el servidor con los 9 componentes.** El servidor manda un árbol
 * `{ tipo, atributos, hijos }` y esto lo pinta.
 *
 * Toda la lógica —recorrido, lista blanca, degradación, bindings— vive en `renderizador.ts`,
 * que es **puro** y verificable sin renderizar. Aquí solo se llama al componente de cada tipo.
 *
 * ```tsx
 * <Renderizador arbol={pantallaDelServidor} datos={producto} />
 * ```
 *
 * ## Cómo degrada
 *
 * **Un tipo desconocido descarta su rama entera** y se anota. La pantalla se sigue viendo.
 * No se pinta un sustituto silencioso: **un hueco es más honesto que un componente que
 * significa otra cosa.**
 *
 * ## Por qué importa que la lista blanca sea explícita
 *
 * El servidor **no puede hacer que el cliente ejecute lo que quiera**. Solo se pintan los 9 tipos
 * de `TIPOS_SOPORTADOS`, y añadir uno exige un cambio de código. **Esa es la frontera de seguridad**,
 * y por eso los alias se declaran a mano en vez de resolverse por nombre.
 */

import React from 'react';
import { Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { CLAVES_TEXTO } from './textoAtributos';

import { Contenedor } from './Contenedor';
import { Texto } from './Texto';
import { Imagen } from './Imagen';
import { Icono } from './Icono';
import { Rejilla } from './Rejilla';
import { CuentaAtras } from './CuentaAtras';
import { Carrusel } from './Carrusel';
import { Scroll } from './Scroll';
import { Vista } from './Vista';
import { Lista } from './Lista';
import { CLAVES_LISTA, CLAVE_SPAN_PLANTILLA, elegirPlantilla } from './listaAtributos';
import { Pestanas } from './Pestanas';
import { Entrada } from './Entrada';
import { Precio } from './Precio';

import { preparar, resolverSubarbol, esVerdadero, type NodoArbol, type Diagnostico } from './renderizadorNucleo';
import { CLAVES_VALOR, valorEfectivo, unirTrozos } from './valorAtributos';
import { entornoDelAparato, type Entorno } from './entornoAtributos';

export interface RenderizadorProps {
  /** El árbol que manda el servidor. */
  arbol: NodoArbol | null | undefined;
  /** Los datos contra los que resolver los bindings (`$item.title`). */
  datos?: unknown;
  /** Se avisa del resultado: cuántos nodos se pintaron y qué se descartó. */
  alDiagnosticar?: (d: Diagnostico) => void;
  /**
   * **Lo que ocurre al pulsar.** El arbol trae el nombre del evento en `EVENT_TAP` -- igual que
   * Taobao, donde `EVENT_TAP` es de `DXWidgetNode` y lo tienen los 59 widgets. La pantalla
   * decide que hacer con ese nombre.
   *
   * **No hay un campo aparte para la accion**: el nombre vive en el atributo, que es donde
   * Taobao lo pone. Un solo origen de verdad.
   */
  alEvento?: (nombre: string, nodo: NodoArbol) => void;
  /**
   * **Lo que ocurre al escribir en una `Entrada`.** Igual que `alEvento`: el nombre sale del
   * atributo (`ONCHANGE`), no de un campo aparte.
   *
   * **El valor viaja de vuelta a la pantalla, que es quien guarda el estado.** El árbol lo
   * declara (`$borrador`), la pantalla lo posee, y este aviso es el puente. Sin esto, lo escrito
   * se quedaría dentro del campo y la pantalla no podría enviarlo.
   */
  alCambiarTexto?: (nombre: string, valor: string, nodo: NodoArbol) => void;
  /**
   * **Lo que el árbol puede preguntar del APARATO** (`$entorno.windowWidth`, `$entorno.tema`,
   * `$entorno.plataforma`). Si no se pasa, se resuelve de los hooks de React Native
   * (`useWindowDimensions`, `Platform`, `useColorScheme`) — ver `entornoAtributos.ts`.
   *
   * Se puede pasar a mano para probar sin móvil, que es lo que hace el oráculo.
   */
  entorno?: Entorno;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** El componente correspondiente a cada tipo canónico. **La lista blanca, en código.** */
export const COMPONENTES: Record<string, React.ComponentType<any>> = {
  Vista,
  Contenedor,
  Texto,
  Imagen,
  Icono,
  Rejilla,
  CuentaAtras,
  Carrusel,
  Scroll,
  Lista,
  Pestanas,
  Entrada,
  Precio,
};

/**
 * Pinta un nodo y sus hijos.
 *
 * El `key` se toma del `id` del árbol si lo trae, y del índice si no. **Usar el índice como `key`
 * es correcto aquí** porque el árbol es inmutable: no hay reordenaciones que reconcilien mal.
 */
export function Nodo({ nodo, datos, entorno, clave, alEvento, alCambiarTexto }: {
  nodo: NodoArbol;
  datos: unknown;
  /**
   * Lo que el árbol puede preguntar del APARATO (`$entorno.windowWidth`). Va aparte de `datos`
   * porque son dos cosas distintas: los datos son del producto, el entorno es del teléfono.
   */
  entorno?: unknown;
  clave: string;
  alEvento?: (nombre: string, nodo: NodoArbol) => void;
  alCambiarTexto?: (nombre: string, valor: string, nodo: NodoArbol) => void;
}) {
  // ── EL CONDICIONAL ────────────────────────────────────────────────────────────────────────
  // **Es un nodo de CONTROL, no un widget**: no pinta nada por su cuenta, elige CUÁL de sus
  // hijos se pinta. Va ANTES del reparto de props y del lookup en `COMPONENTES`, porque si no
  // caería en el marcador de «SIN COMPONENTE» — que es justo lo que no es.
  //
  // Y por eso se intercepta aquí: **`COMPONENTES` son widgets, y esto no lo es.** Hay un test
  // que fija esa distinción (está en la lista blanca, pero no en `COMPONENTES`).
  //
  // Los hijos son **uno o dos, como en Taobao** (`tb/xg5.java`): el primero es el «entonces» y
  // el segundo el «sino». **Con un solo hijo no hay «sino»**, y si la condición es falsa no se
  // pinta nada — que es lo que quiere decir «solo si».
  if (nodo.tipo === 'Condicional') {
    const hijos = nodo.hijos ?? [];
    const elegido = esVerdadero(nodo.valor) ? hijos[0] : hijos[1];
    if (!elegido) return null;
    return (
      <Nodo
        nodo={elegido}
        datos={datos}
        entorno={entorno}
        clave={`${clave}.${esVerdadero(nodo.valor) ? 'si' : 'no'}`}
        alEvento={alEvento}
        alCambiarTexto={alCambiarTexto}
      />
    );
  }

  const C = COMPONENTES[nodo.tipo];
  // No puede pasar: `preparar()` ya filtró por la lista blanca. Pero si la lista y este mapa se
  // desincronizan, **se degrada en vez de lanzar**.
  // MARCADOR DE DIAGNOSTICO: si esto sale en pantalla, COMPONENTES no tiene la clave.
  if (!C) {
    return (
      <Texto dx={{ '5db0637a915fa268': 20, '4fa0a53cf9ff05cd': '#FFFFFFFF' }}>
        SIN COMPONENTE PARA: {String(nodo.tipo)}
      </Texto>
    );
  }

  const props: Record<string, unknown> = { dx: nodo.atributos };

  // ── EL VALOR EFECTIVO: tabla y valor por defecto ──────────────────────────────────────────
  // **Antes de repartir nada**, porque lo usan todos: un `Texto` con `ext:tabla` busca su `valor`
  // en el mapa, y `ext:defecto` decide qué sale cuando no resuelve. Ver `valorAtributos.ts` para
  // por qué estas dos claves van con prefijo `ext:` (no son de Taobao: Taobao las resuelve con su
  // lenguaje de expresiones, que no está implementado a propósito).
  const valor = valorEfectivo(nodo.valor, nodo.atributos as Record<string, unknown> | undefined);

  // El texto va como hijo, no como atributo: es lo que `Texto` espera.
  if (nodo.tipo === 'Texto' && valor !== undefined) props.children = String(valor);
  // La imagen y el icono llevan su fuente por prop.
  if (nodo.tipo === 'Imagen') props.uri = typeof valor === 'string' ? valor : undefined;
  if (nodo.tipo === 'Icono') props.nombre = typeof valor === 'string' ? valor : '';

  // ── LA FRASE CON SEPARADOR ────────────────────────────────────────────────────────────────
  // `` `${a} · ${b}` `` de un árbol **no se puede hacer con `+`**: se hace con varios hijos y un
  // separador, que es lo que Taobao hace con los `TextSpan`. Solo aplica a `Texto`, y solo si
  // lleva el atributo — si no, el comportamiento es el de siempre.
  const separador = nodo.atributos?.[CLAVES_VALOR.SEPARADOR];
  if (nodo.tipo === 'Texto' && typeof separador === 'string' && (nodo.hijos ?? []).length > 0) {
    const trozos = (nodo.hijos ?? []).map((h) => valorEfectivo(h.valor, h.atributos as Record<string, unknown> | undefined));
    // Los hijos NO se pintan aparte: ya están dentro del texto unido. Se vacían para que el
    // reparto de abajo no los pinte otra vez.
    props.children = unirTrozos(trozos, separador);
  }

  // ── LA BARRA DE PESTAÑAS ──────────────────────────────────────────────────────────────────
  // **Las pestañas son DATO, no hijos**: es la forma de Taobao (`content.tabs[]` en la sección
  // `categoryTab`) y la misma que usa la `Lista`. El `valor` del nodo es el binding a la lista
  // (`$categorias`), ya resuelto aquí.
  //
  // Al cambiar de pestaña se avisa por el MISMO canal que el toque (`alEvento`), con el `id` de la
  // pestaña como nombre: **un canal, no dos**. La pantalla decide si eso filtra, navega o pide otra
  // sección.
  if (nodo.tipo === 'Pestanas') {
    props.datos = Array.isArray(nodo.valor) ? nodo.valor : [];
    if (alEvento) props.alCambiar = (_i: number, id: string) => alEvento(String(id), nodo);
  }

  // ── LA LISTA ──────────────────────────────────────────────────────────────────────────────
  // Un `FlatList` necesita una función por elemento, y un árbol es declarativo. **La respuesta
  // es la de Taobao**: el primer hijo del nodo es la PLANTILLA que se repite, y `valor` (ya
  // resuelto como binding `$ruta`) es la fuente. Aquí se le pasa al componente una función que
  // pinta un nodo con unos datos — **así `Lista` no tiene que importar `Nodo`**, que sería un
  // ciclo de importes.
  if (nodo.tipo === 'Lista') {
    props.datos = Array.isArray(nodo.valor) ? nodo.valor : [];
    // **LOS HIJOS DE UNA LISTA SON SUS PLANTILLAS**, y pueden ser VARIAS: en Taobao cada elemento
    // dice qué tarjeta usa (`templateName`, medido en el feed de descubrimiento: 11 tarjetas normales
    // y 1 distinta en la misma lista). Si solo hay una —o ninguna declara su nombre— la lista es
    // homogénea y todo sigue funcionando igual que antes.
    const plantillas = (nodo.hijos ?? []).filter(Boolean);
    if (plantillas.length > 0) {
      // **`item_data` es cómo Taobao llama al elemento dentro de la plantilla.** Un binding
      // `$item.titulo` lee `datos.item.titulo`, así que el elemento se envuelve con ese nombre.
      // Si el servidor no lo dice, se usa `item` — el mismo por defecto que en el .dx.
      const nombreItem = typeof nodo.atributos?.item_data === 'string'
        ? String(nodo.atributos.item_data)
        : 'item';
      const nombres = plantillas.map((n) => (typeof n.atributos?.[CLAVES_LISTA.TEMPLATE_NAME] === 'string'
        ? String(n.atributos[CLAVES_LISTA.TEMPLATE_NAME])
        : ''));
      /** La plantilla de ESTE elemento: la que él dice; si no la dice o no existe, la primera. */
      const plantillaDe = (elemento: unknown) => {
        const declarado = elemento && typeof elemento === 'object'
          ? (elemento as Record<string, unknown>)[CLAVES_LISTA.TEMPLATE_NAME]
          : undefined;
        return plantillas[Math.max(0, elegirPlantilla(nombres, declarado).indice)];
      };

      props.renderizar = (elemento: unknown, i: number) => {
        // **La plantilla se resuelve CON LOS DATOS DEL ELEMENTO**, no con los del contenedor.
        // `preparar` la dejó cruda a propósito: `$item.*` no existía cuando se preparó el árbol.
        // El entorno viaja igual: una plantilla puede preguntar `$entorno.tema`.
        const { arbol: resuelta } = resolverSubarbol(plantillaDe(elemento), { [nombreItem]: elemento }, entorno);
        return (
          <Nodo
            nodo={resuelta}
            datos={{ [nombreItem]: elemento }}
            entorno={entorno}
            clave={`${clave}.${i}`}
            alEvento={alEvento}
            alCambiarTexto={alCambiarTexto}
          />
        );
      };
      // **Y EL `span`, que es de LA PLANTILLA**, no del dato: en Taobao viaja en su entrada
      // (`{name, span, url4Android}`), así que la tarjeta ancha **es otra plantilla**. Se resuelve
      // contra el elemento igual que el contenido —por si alguien lo bindea— y es lo que reparte las
      // filas de la rejilla irregular.
      props.spanDe = (elemento: unknown) => {
        const { arbol: resuelta } = resolverSubarbol(plantillaDe(elemento), { [nombreItem]: elemento }, entorno);
        return resuelta.atributos?.[CLAVE_SPAN_PLANTILLA];
      };
    }
  }

  // ── EL PRECIO ─────────────────────────────────────────────────────────────────────────────
  // **El número entra tal cual y el componente lo formatea.** Un árbol no tiene funciones, así
  // que no puede llamar a `formatXAF` — pero sí puede mandar el número y el símbolo, y eso es
  // lo que hace `DXMEGAPRICEVIEW`. El texto, en cambio, va como `children`.
  if (nodo.tipo === 'Precio') props.valor = nodo.valor;

  // ── LA ENTRADA ────────────────────────────────────────────────────────────────────────────
  // El valor entra por el binding (`$borrador`) y lo escrito SALE por `alCambiarTexto`. **La
  // pantalla es la que guarda el estado**: el árbol lo declara, el componente lo pinta, y el
  // aviso es el puente. El nombre del evento sale de `ONCHANGE`, como el toque sale de
  // `EVENT_TAP` — el atributo es el mensajero.
  if (nodo.tipo === 'Entrada') {
    props.valor = nodo.valor === undefined || nodo.valor === null ? '' : String(nodo.valor);
    if (alCambiarTexto) {
      props.alCambiarTexto = (nombre: string, v: string) => alCambiarTexto(nombre, v, nodo);
    }
  }

  // -- EL TOQUE ------------------------------------------------------------------------------
  // `EVENT_TAP` es de la clase BASE de Taobao: cualquier widget puede pulsarse. Se lee del
  // atributo y se reparte aqui, para que los 9 componentes lo tengan sin tocar los 9.
  const nombreEvento = nodo.atributos?.[CLAVES_TEXTO.ONPRESS];
  const conToque = nombreEvento !== undefined && alEvento !== undefined;
  // `Text` tiene `onPress` nativo: se lo damos y NO se envuelve nada, asi el layout del
  // texto (margenes, ancho) queda exactamente igual.
  if (conToque && nodo.tipo === 'Texto') props.alPulsar = () => alEvento!(String(nombreEvento), nodo);

  // **En una `Lista` los hijos NO son hijos: son la plantilla.** Si se pintaran aquí saldría una
  // sola copia suelta además de las repetidas — y con los datos del contenedor, no con los del
  // elemento. Se pintan sólo desde `renderizar`, una por dato.
  //
  // Y en un `Texto` CON separador tampoco: sus hijos ya están dentro del texto unido, y pintarlos
  // otra vez los duplicaría.
  const hijosSueltos = nodo.tipo === 'Lista'
    // En la barra de pestañas tampoco: **sus hijos no son contenido, son pestañas** — y las pestañas
    // llegan por `valor` (el dato). Pintarlas otra vez sacaría la lista duplicada al lado de la barra.
    || nodo.tipo === 'Pestanas'
    || (nodo.tipo === 'Texto' && typeof nodo.atributos?.[CLAVES_VALOR.SEPARADOR] === 'string');

  const hijos = hijosSueltos ? [] : (nodo.hijos ?? []).map((h, i) => (
    <Nodo
      key={h.id ?? i}
      nodo={h}
      datos={datos}
      entorno={entorno}
      clave={`${clave}.${i}`}
      alEvento={alEvento}
      alCambiarTexto={alCambiarTexto}
    />
  ));

  // ⚠️ Si el nodo NO tiene hijos, **no se declara `children` en el JSX**. No es estilo: es la
  // diferencia entre pintar y no pintar nada.
  //
  // Para un `Texto` el valor va en `props.children`. Pero al escribir `<C {...props}>{hijos}</C>`
  // con `hijos` vacío, el `children` del JSX **PISA** el del spread y React se queda con
  // `undefined`: todo texto sale vacío, los contenedores quedan con altura cero, y la pantalla
  // se ve en blanco aunque el árbol se recorra entero.
  //
  // Costó 12 builds. Los `console.log` lo dijeron en uno.
  const elemento = hijos.length > 0 ? <C {...props}>{hijos}</C> : <C {...props} />;

  // Para el resto de widgets, `Pressable`: `View` no tiene `onPress` en React Native.
  if (conToque) {
    return <Pressable onPress={() => alEvento!(String(nombreEvento), nodo)}>{elemento}</Pressable>;
  }
  return elemento;
}

/**
 * El renderizador del Mercado.
 */
export function Renderizador({ arbol, datos, entorno: entornoDado, alDiagnosticar, alEvento, alCambiarTexto, style, testID }: RenderizadorProps) {
  // ── EL ENTORNO DEL APARATO ────────────────────────────────────────────────────────────────
  // Se resuelve con los hooks de React Native, que es donde vive de verdad: el ancho y el alto de
  // la ventana, la plataforma (android/ios/**harmony**) y el modo del sistema (claro/oscuro).
  // Se puede pasar a mano (`entorno`) para probar sin móvil.
  const { width, height } = useWindowDimensions();
  const esquemaDeColor = useColorScheme();
  const entorno = React.useMemo(
    () => entornoDado ?? entornoDelAparato({ ancho: width, alto: height, plataforma: Platform.OS, esquemaDeColor }),
    [entornoDado, width, height, esquemaDeColor],
  );

  const { arbol: listo, diagnostico } = React.useMemo(
    () => preparar(arbol, datos, entorno),
    [arbol, datos, entorno],
  );

  // El aviso se da **solo cuando el diagnóstico CAMBIA de verdad**.
  //
  // ⚠️ Esto no es una optimización: **es un arreglo**. Depender del objeto `diagnostico` es un
  // bucle infinito, porque `preparar()` devuelve un objeto NUEVO en cada pasada — y el padre,
  // al recibirlo por `alDiagnosticar`, hace `setState` y vuelve a renderizar. **La pantalla
  // nunca se asienta y no pinta nada.**
  //
  // Se pasó de `11/11 nodos · completo` en el diagnóstico y pantalla vacía, con los MISMOS dos
  // nodos pintados a mano funcionando perfectamente. **El fallo era este `useEffect`.**
  const claveDiag = JSON.stringify(diagnostico);
  const ultimaClave = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (ultimaClave.current === claveDiag) return;
    ultimaClave.current = claveDiag;
    alDiagnosticar?.(diagnostico);
  }, [claveDiag, diagnostico, alDiagnosticar]);

  if (!listo) {
    return null;
  }

  return (
    // **Sin `flex: 1` propio.** Quien lo use decide: una pantalla lo pasa (style={{flex:1}}),
    // un bloque incrustado en un ScrollView NO — y si se impusiera, el bloque colapsaría a cero.
    // Se descubrió al incrustar el renderizador en la ficha real.
    <Vista style={style} testID={testID}>
        <Nodo nodo={listo} datos={datos} entorno={entorno} clave="raiz" alEvento={alEvento} alCambiarTexto={alCambiarTexto} />
    </Vista>
  );
}

export default Renderizador;

export {
  VERSION_ESQUEMA, TIPOS_SOPORTADOS, ALIAS_A_TIPO, capacidades,
  tipoCanonico, filtrarPintables, leerRuta, resolverValor, resolverDatos, preparar,
} from './renderizadorNucleo';
export type { NodoArbol, Diagnostico } from './renderizadorNucleo';
