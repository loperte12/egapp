/**
 * Renderizador · lógica pura
 * ===========================
 *
 * **La pieza que une el servidor con los 9 componentes.** Sin ella, los componentes no sirven
 * para nada: no hay quién reciba un árbol y lo convierta en pantalla.
 *
 * **Puro a propósito**, como todo lo demás: el oráculo importa este módulo directamente y verifica
 * el recorrido, la lista blanca, la degradación y los bindings **sin renderizar nada**.
 *
 * ## El circuito completo
 *
 * ```
 * SERVIDOR          manda { tipo, atributos, hijos }         ← JSON
 *     ↓
 * ESTE MÓDULO       recorre, filtra por lista blanca, resuelve bindings, degrada
 *     ↓
 * Renderizador.tsx  llama al componente de cada tipo
 *     ↓
 * LOS 9 COMPONENTES traducen atributos de Taobao → props de React Native
 * ```
 *
 * ## Las cuatro decisiones, aquí dentro
 *
 * ### 1 · Lista blanca
 *
 * **El cliente solo pinta los tipos que conoce.** Un tipo fuera de la lista **no se evalúa**:
 * no hay carga dinámica de componentes. Es lo que ADR-002 pide — el servidor no puede hacer que
 * el cliente ejecute lo que quiera.
 *
 * ### 2 · Degradación
 *
 * **Un tipo desconocido no puede tumbar la pantalla.** Si mañana el servidor añade `"Mapa"` y el
 * cliente es antiguo, **la ficha se sigue viendo, con ese hueco vacío**. Un nodo desconocido se
 * descarta **con su rama**, y se anota — no se propaga, no se pinta un sustituto silencioso.
 *
 * ### 3 · Versionado
 *
 * El cliente **declara** qué esquema y qué tipos soporta. El servidor puede así no mandar cosas
 * que el cliente no sabrá pintar.
 *
 * ### 4 · Bindings
 *
 * Un atributo puede ser un **valor** o una **referencia a datos**: `"$item.title"`. El renderizador
 * la resuelve contra el objeto de datos. **Si la ruta no existe, devuelve `undefined`** — no lanza,
 * porque un campo que falta en un producto no puede romper la pantalla.
 */

// ─────────────────────────── versión del esquema ───────────────────────────

/**
 * La versión del esquema de árbol.
 *
 * **El cliente la declara al servidor.** Si el servidor conoce una versión mayor, debe abstenerse
 * de mandar nodos que este cliente no sabrá pintar.
 */
export const VERSION_ESQUEMA = 1;

/**
 * La forma de una referencia a datos.
 *
 * `"$item.title"` se resuelve contra `{ item: { title: ... } }`. **`$` al principio, y puntos.**
 * Un valor que empiece por `$` pero no sea una ruta válida se devuelve tal cual.
 */
export const PREFIJO_BINDING = '$';

/**
 * La raíz **RESERVADA** de los bindings del aparato: `$entorno.windowWidth`.
 *
 * Los datos de un producto y lo que se sabe del teléfono son dos cosas distintas, y **una empresa
 * de datos con un campo `entorno` no puede pisar la del aparato** — por eso `$entorno.*` no se
 * busca en los datos: se busca en el entorno, y si no hay entorno el binding queda `undefined` (y
 * se anota), como cualquier otro que no resuelve.
 *
 * **Se declara aquí, no se importa de `entornoAtributos.ts`**: este módulo es autocontenido a
 * propósito —un import interno sin extensión lo rompe en Node y se pierde la prueba— y hay un test
 * que fija que **las dos copias son la misma cadena**.
 */
export const RAIZ_ENTORNO = 'entorno';

// ─────────────────────────── la lista blanca ───────────────────────────

/**
 * Los tipos que este cliente sabe pintar.
 *
 * **Exactamente los 9 componentes.** No hay más, y añadir uno exige tocar este objeto — que es
 * el punto: **la lista es la frontera de seguridad**.
 *
 * Cada entrada lleva los **alias** que acepta. Los alias son los nombres de Taobao, porque un
 * árbol generado desde las plantillas `.dx` trae los nombres originales.
 */
export const TIPOS_SOPORTADOS: Record<string, { alias: string[]; descripcion: string }> = {
  Vista: {
    alias: ['DXVIEW', 'DXVIEW_VIEW'],
    descripcion: 'contenedor base, con transformaciones',
  },
  Contenedor: {
    alias: [
      'DXLinearLayout', 'DXVLayout',
      // Los contenedores ANÓNIMOS del corpus: la tabla no los nombra, así que se aceptan por
      // su `long`. Medidos: 452, 196, 159 y 37 usos.
      '52e0c78fcad859e5', '705a8a00492bfa74', '5c1dfa3cff34b6da', '99473ba1b2f79d1b',
    ],
    descripcion: 'contenedor con vocabulario de layout',
  },
  Texto: {
    // **`DXMEGAPRICEVIEW` SALIO de aqui, y era un error que estuviera.** Ese widget no pinta
    // texto: pinta un PRECIO — cifra y simbolo a distinto tamano, con su propio formato. Metido
    // en `Texto` se pintaba `4000` en vez de `4.000 XAF`, que es justo el sintoma que se vio en
    // la lista. Ahora es `Precio`.
    alias: ['DXTEXTVIEW', 'DXRICHTEXT', 'DXTEXTSPAN', 'DXCARTTEXTSPAN'],
    descripcion: 'texto, con el vocabulario compartido',
  },
  Imagen: {
    alias: ['DXIMAGEVIEW'],
    descripcion: 'imagen, sobre expo-image',
  },
  Icono: {
    alias: ['DX_WIDGET_X_ICON_FONT_VIEW', 'c55f9ffeae4fd920'],
    descripcion: 'icono, sobre lucide',
  },
  Rejilla: {
    alias: ['DX_GRID_LAYOUT'],
    descripcion: 'rejilla de columnas',
  },
  CuentaAtras: {
    alias: ['DX_WIDGET_COUNTDOWNVIEW', 'DXCOUNTDOWNVIEW'],
    descripcion: 'contador',
  },
  Carrusel: {
    alias: ['DX_SLIDER_LAYOUT', 'DXSLIDERLAYOUT'],
    descripcion: 'carrusel con avance automático',
  },
  Scroll: {
    alias: ['DX_SCROLLER_LAYOUT', 'DXSCROLLERLAYOUT'],
    descripcion: 'contenedor desplazable',
  },
  Lista: {
    // `DXRecyclerLayout` es el widget de lista de DinamicX. **`DXNativeListLayout` NO entra**:
    // se comprobó leyéndolo y es un `LinearLayout` de 771 bytes sin un solo atributo propio.
    alias: ['DXRECYCLERLAYOUT', 'DX_RECYCLER_LAYOUT', 'DXNATIVERECYCLERVIEW'],
    descripcion: 'lista con plantilla repetida por dato',
  },
  Entrada: {
    // **Los DOS widgets de texto de entrada de Taobao, y hacen falta los dos**: de los 5 campos
    // del Mercado, 4 son multilínea, y `multiline` no está en `DXCARTTEXTINPUT` — está invertido
    // en el otro, como `ISSINGLELINE`.
    alias: [
      'DXCARTTEXTINPUT', 'DXTEXTINPUTVIEW', 'DXTEXTINPUT',
      // Y sus hashes, que es como los guarda el `.dx`.
      '6b36e7b48733bf6c', '99540a9e0ccb955d',
    ],
    descripcion: 'campo de texto, de los dos widgets de entrada',
  },
  Precio: {
    // `DXMEGAPRICEVIEW`: cifra y símbolo a distinto tamaño. **Vino de `Texto`, donde estaba mal.**
    alias: ['DXMEGAPRICEVIEW', '2b85a6c2624a8015'],
    descripcion: 'precio formateado, con el símbolo menor',
  },
  Pestanas: {
    /**
     * **Taobao NO tiene este widget: su barra de pestañas es una SECCIÓN de la página.**
     *
     * Medido en `awesome/container_newface_home_main.json`: `sectionBizCode: "categoryTab"`, las
     * pestañas en `content.tabs[]` (son dato: `tabId`, `text`, `pageUrl`) y el tema en
     * `style.styleData.tabs` (31 tokens). Aquí se implementa como widget porque el contrato del
     * Mercado pinta árboles —y una barra tiene que poder vivir dentro de cualquier pantalla—, así
     * que **el alias es el nombre real de la sección**, no un nombre de widget inventado.
     */
    alias: ['categoryTab', 'ext:Pestanas'],
    descripcion: 'barra de pestañas (en Taobao, la sección categoryTab)',
  },
  Condicional: {
    /**
     * **No es un widget: es un nodo de CONTROL.** Taobao lo tiene
     * (`DXCONDITIONALNODE_CONDITIONALNODE`) y se lee en `tb/xg5.java`:
     *
     * ```java
     * public DXWidgetNode b;   // el «entonces»  (hijo 0)
     * public DXWidgetNode c;   // el «sino»      (hijo 1)
     *
     * if (getChildrenCount() == 1) { b = getChildAt(0); }
     * else if (getChildrenCount() == 2) { b = getChildAt(0); c = getChildAt(1); }
     * ```
     *
     * **Uno o dos hijos, y nada más.** No pinta nada por su cuenta: elige CUÁL de sus hijos se
     * pinta. Por eso **sí está en la lista blanca** (el filtro tiene que dejarlo pasar) **y NO
     * está en `COMPONENTES`** — no hay nada visual que registrar. Hay un test que fija eso.
     */
    alias: ['DXCONDITIONALNODE', '4861660327064501257'],
    descripcion: 'nodo de control: pinta un hijo u otro según la condición',
  },
};

/** Todos los alias, en un mapa inverso `alias -> tipo canónico`. Se construye una vez. */
export const ALIAS_A_TIPO: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [tipo, def] of Object.entries(TIPOS_SOPORTADOS)) {
    m[tipo] = tipo;
    for (const a of def.alias) m[a] = tipo;
  }
  return m;
})();

/** Lo que el cliente sabe pintar, para declarárselo al servidor. */
export function capacidades() {
  return {
    versionEsquema: VERSION_ESQUEMA,
    tipos: Object.keys(TIPOS_SOPORTADOS),
    alias: ALIAS_A_TIPO,
  };
}

// ─────────────────────────── el árbol ───────────────────────────

/** Un nodo del árbol que manda el servidor. */
export interface NodoArbol {
  /** El tipo. Acepta el nombre canónico, un alias de Taobao, o el `long` en hex. */
  tipo: string;
  /** Atributos, por clave `long` de Taobao en hex de 16. */
  atributos?: Record<string, number | string | boolean | null>;
  /** El valor de texto, o una referencia `$ruta.a.dato`. */
  valor?: string | number;
  /** Hijos, en orden. El orden importa. */
  hijos?: NodoArbol[];
  /** Identificador, si el árbol lo trae. Útil para depurar. */
  id?: string;
}

/** Lo que se anota al recorrer un árbol, para poder informar de lo que no se pudo pintar. */
export interface Diagnostico {
  /** Número total de nodos recorridos. */
  nodos: number;
  /** Nodos que **sí** se van a pintar. */
  pintables: number;
  /** Tipos desconocidos encontrados, con cuántas veces. */
  desconocidos: Record<string, number>;
  /** Ramas descartadas enteras por tener un tipo desconocido arriba. */
  ramasDescartadas: number;
  /** Atributos cuyo binding no se pudo resolver. */
  bindingsFallidos: string[];
  /** `true` si **todo** el árbol se puede pintar. */
  completo: boolean;
}

/** Un diagnóstico vacío. */
function diagnosticoVacio(): Diagnostico {
  return {
    nodos: 0, pintables: 0, desconocidos: {}, ramasDescartadas: 0,
    bindingsFallidos: [], completo: true,
  };
}

/** El tipo canónico de un nodo, o `null` si no está en la lista blanca. */
export function tipoCanonico(tipo: string | undefined): string | null {
  if (!tipo) return null;
  return ALIAS_A_TIPO[tipo] ?? null;
}

/**
 * Recorre el árbol y devuelve **solo los nodos pintables**, más el diagnóstico.
 *
 * **Un nodo desconocido descarta su rama entera.** Si el contenedor no se sabe pintar, tampoco
 * sus hijos: pintarlos sueltos daría una pantalla desordenada, que es peor que un hueco.
 *
 * **No lanza nunca.** Un árbol malformado devuelve un diagnóstico con lo que se pudo leer.
 */
export function filtrarPintables(arbol: NodoArbol | null | undefined): {
  arbol: NodoArbol | null;
  diagnostico: Diagnostico;
} {
  const d = diagnosticoVacio();
  const out = recorrer(arbol, d);
  d.completo = Object.keys(d.desconocidos).length === 0;
  return { arbol: out, diagnostico: d };
}

function recorrer(nodo: NodoArbol | null | undefined, d: Diagnostico): NodoArbol | null {
  if (!nodo || typeof nodo !== 'object') return null;
  d.nodos++;

  const canonico = tipoCanonico(nodo.tipo);
  if (canonico === null) {
    // Degradación: se anota y se descarta la rama. **No se inventa un sustituto.**
    d.desconocidos[nodo.tipo ?? '(sin tipo)'] = (d.desconocidos[nodo.tipo ?? '(sin tipo)'] ?? 0) + 1;
    d.ramasDescartadas++;
    return null;
  }

  d.pintables++;
  const hijos: NodoArbol[] = [];
  for (const h of nodo.hijos ?? []) {
    const c = recorrer(h, d);
    if (c) hijos.push(c);
  }

  return {
    tipo: canonico,
    atributos: nodo.atributos,
    valor: nodo.valor,
    hijos: hijos.length ? hijos : undefined,
    id: nodo.id,
  };
}

// ─────────────────────────── los bindings ───────────────────────────

/**
 * Lee una ruta con puntos dentro de un objeto, sin lanzar.
 *
 * `leerRuta({ item: { title: 'x' } }, 'item.title')` → `'x'`.
 * Un tramo que falta devuelve `undefined`; un tramo sobre `null` también.
 */
export function leerRuta(datos: unknown, ruta: string): unknown {
  let actual: unknown = datos;
  for (const tramo of ruta.split('.')) {
    if (actual === null || actual === undefined) return undefined;
    if (typeof actual !== 'object') return undefined;
    actual = (actual as Record<string, unknown>)[tramo];
  }
  return actual;
}

/**
 * ¿Esto cuenta como «sí»?
 *
 * ## La regla, y por qué no es la de JavaScript
 *
 * En JavaScript, **`[]` es truthy**. Un array vacío —o un objeto sin campos— pasa un `if` sin
 * problema. Eso está bien en código imperativo, donde el programador ve el `[]` y sabe lo que
 * hace. **En un árbol declarativo es una trampa**: `$item.fotos` con la lista vacía daría «sí»,
 * y el bloque del «entonces» se pintaría con datos que no existen.
 *
 * Así que la regla es la de JavaScript **más** una excepción declarada:
 *
 * | valor | ¿sí? |
 * |---|---|
 * | `0` · `''` · `null` · `undefined` · `false` | **no** — igual que JavaScript |
 * | `[]` · `{}` | **no** — **la excepción**, y es la razón de que esta función exista |
 * | `[0]` · `'0'` · `-1` | **sí** — un elemento, aunque sea cero |
 *
 * **Un array con un elemento vacío SÍ cuenta**: `[{...}]` es «hay uno», y eso es lo que
 * pregunta el comercio («¿este producto tiene fotos?»).
 */
export function esVerdadero(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return Boolean(v);
}

/**
 * Lee una ruta que puede ser del APARATO o de los DATOS.
 *
 * `$entorno.*` se resuelve contra el entorno —nunca contra los datos—, y todo lo demás contra los
 * datos. Sin entorno, un binding de entorno es `undefined` como cualquier ruta que no existe.
 */
function leerRutaResuelta(datos: unknown, entorno: unknown, ruta: string): unknown {
  if (ruta === RAIZ_ENTORNO || ruta.startsWith(`${RAIZ_ENTORNO}.`)) {
    if (entorno === undefined || entorno === null) return undefined;
    const resto = ruta.slice(RAIZ_ENTORNO.length + 1);
    return resto === '' ? entorno : leerRuta(entorno, resto);
  }
  return leerRuta(datos, ruta);
}

/**
 * Resuelve un valor: si es un binding (`$ruta`), lo busca en los datos; si no, lo devuelve tal cual.
 *
 * **Un binding que no resuelve devuelve `undefined`, no lanza.** Un campo que falta en un producto
 * no puede romper la pantalla — y el hueco se anota en el diagnóstico.
 */
export function resolverValor(
  valor: unknown,
  datos: unknown,
  anotar?: (ruta: string) => void,
  entorno?: unknown,
): unknown {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO_BINDING)) return valor;
  const ruta = valor.slice(PREFIJO_BINDING.length);
  // `$` solo no es una ruta: se devuelve tal cual.
  if (!ruta) return valor;
  const r = leerRutaResuelta(datos, entorno, ruta);
  if (r === undefined) anotar?.(ruta);
  return r;
}

/**
 * Resuelve **todos** los valores y atributos de un árbol ya filtrado.
 *
 * Se hace en un paso aparte del recorrido para que el diagnóstico distinga
 * «no sé pintar este tipo» de «este dato no venía».
 */
export function resolverDatos(
  arbol: NodoArbol | null,
  datos: unknown,
  d: Diagnostico,
  entorno?: unknown,
): NodoArbol | null {
  if (!arbol) return null;
  const atributos: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arbol.atributos ?? {})) {
    atributos[k] = resolverValor(v, datos, (r) => d.bindingsFallidos.push(r), entorno);
  }

  // ── LA PLANTILLA DE UNA LISTA NO SE RESUELVE AQUÍ ─────────────────────────────────────────
  // **Esto era un bug de verdad, y de los graves.** Una `Lista` repite su primer hijo por cada
  // elemento, y esa plantilla habla de `$item.*` — un dato que **todavía no existe** cuando se
  // prepara el árbol. Si se resolviera aquí contra los datos del contenedor:
  //
  //   `$item.titulo`  →  `undefined`  →  la plantilla queda muerta  →  **todos los elementos
  //                                                                     salen vacíos**
  //
  // La plantilla se deja CRUDA y la resuelve el `Nodo` con los datos de cada elemento
  // (`resolverSubarbol`). Y sus bindings no se anotan como fallidos: no fallan, **llegan tarde**.
  const esLista = tipoCanonico(arbol.tipo) === 'Lista';
  const hijos = esLista
    ? (arbol.hijos ?? [])
    : (arbol.hijos ?? []).map((h) => resolverDatos(h, datos, d, entorno)).filter((x): x is NodoArbol => x !== null);

  return {
    tipo: arbol.tipo,
    atributos: atributos as NodoArbol['atributos'],
    valor: resolverValor(arbol.valor, datos, (r) => d.bindingsFallidos.push(r), entorno) as string | number | undefined,
    hijos,
    id: arbol.id,
  };
}

/**
 * Resuelve un subárbol contra unos datos y devuelve **también** lo que no resolvió.
 *
 * **Existe para la plantilla de una `Lista`**: cada elemento tiene sus propios datos, así que la
 * plantilla hay que resolverla una vez por elemento, en el momento de pintarlo.
 *
 * Va aparte de `resolverDatos` a propósito: **aquí los fallos se devuelven, no se acumulan en el
 * diagnóstico global.** Que a un elemento le falte un campo no es un fallo del contrato — es un
 * dato incompleto de ese elemento, y mezclarlo con los fallos del árbol entero los escondería.
 */
export function resolverSubarbol(
  arbol: NodoArbol,
  datos: unknown,
  entorno?: unknown,
): { arbol: NodoArbol; fallidos: string[] } {
  const fallidos: string[] = [];
  const d: Diagnostico = diagnosticoVacio();
  d.bindingsFallidos = fallidos;
  const resuelto = resolverDatos(arbol, datos, d, entorno) ?? arbol;
  return { arbol: resuelto, fallidos };
}

/**
 * El circuito completo, en una llamada: filtra, resuelve y devuelve el árbol listo para pintar.
 *
 * **Es lo que el servidor manda y lo que el cliente puede pintar, sin nada en medio.**
 *
 * `entorno` es lo que el árbol puede preguntar del APARATO (`$entorno.windowWidth`, `$entorno.tema`).
 * Va aparte de `datos` porque son dos cosas distintas: los datos son del producto, el entorno es
 * del teléfono.
 */
export function preparar(arbol: NodoArbol | null | undefined, datos?: unknown, entorno?: unknown): {
  arbol: NodoArbol | null;
  diagnostico: Diagnostico;
} {
  const { arbol: filtrado, diagnostico } = filtrarPintables(arbol);
  const conDatos = datos === undefined && entorno === undefined
    ? filtrado
    : resolverDatos(filtrado, datos, diagnostico, entorno);
  return { arbol: conDatos, diagnostico };
}

export default {
  VERSION_ESQUEMA, PREFIJO_BINDING, RAIZ_ENTORNO, TIPOS_SOPORTADOS, ALIAS_A_TIPO,
  capacidades, tipoCanonico, filtrarPintables, leerRuta, esVerdadero, resolverValor, resolverDatos,
  resolverSubarbol, preparar,
};
