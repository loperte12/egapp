/**
 * servidor-ui.mjs — el endpoint de UI dirigida por el servidor, corriendo en local
 * ================================================================================
 *
 * ## Por qué existe esto
 *
 * El objetivo es que una pantalla se pinte con un **árbol que manda el servidor** (D3). Pero:
 *
 * ```
 * el cliente llama a:                    https://api.egrouteplan.com/api/ecomerse/*
 * @Controller('...ecomerse') en el repo:  NINGUNO
 * ```
 *
 * **El backend del Mercado no está en este repositorio**, así que la ruta no se puede añadir ahí.
 * Lo que sí se puede es **escribir el endpoint y hacerlo correr**, que es lo que hace este
 * fichero: sirve `/api/ecomerse/ui/home` con el árbol de verdad.
 *
 * ## Cómo se verifica en el móvil sin desplegar nada
 *
 * El móvil no llega al `localhost` de este PC. Pero `adb reverse` sí lo consigue:
 *
 * ```
 * adb reverse tcp:8788 tcp:8788      # el localhost:8788 del MÓVIL pasa a ser el del PC
 * ```
 *
 * Y el cliente apunta ahí con `EXPO_PUBLIC_UI_HOST`. **Eso es el pipeline entero: la app pide el
 * árbol por HTTP, el servidor lo responde, el `Renderizador` lo pinta.**
 *
 * ## Y lo que esto NO es
 *
 * **No es un mock de pruebas.** El árbol que sirve es el que iría en producción, con la forma
 * exacta que el cliente espera. Lo que falta es **moverlo a vuestro backend**, y el contrato está
 * escrito abajo para que sea copiar y pegar.
 *
 * Uso:  node tools/servidor-ui.mjs [puerto]
 */

import { createServer } from 'node:http';

// ─────────────────────────────────────────────────────────────────────────────
// LAS CLAVES — extraídas de `components/ecomerse/*Atributos.ts`, NO tecleadas
// ─────────────────────────────────────────────────────────────────────────────
//
// **Esto no es ceremonia.** La primera versión de este fichero llevaba claves inventadas
// (`'7f4b41c5a05a2b1d'`, `'00000000e396ac59'`) y **habrían fallado en silencio**: el cliente no
// conoce esos atributos, así que los ignora, y el árbol se pintaría sin márgenes, sin colores y
// sin tamaño — con la pantalla llena y sin un solo error. Se cazó releyendo el fichero antes de
// arrancarlo.
//
// Cada una dice de dónde sale. Las que son del vocabulario COMPARTIDO están marcadas, porque las
// usan todos los widgets.
const K = {
  // ── vocabulario de CAJA compartido (`contenedorAtributos.ts`) ──
  LAYOUT_WIDTH: '0000123cef8d32c5',     // setLayoutWidth
  LAYOUT_HEIGHT: '002134aae97d133f',    // setLayoutHeight
  MARGIN_LEFT: 'f3477b9719b6f213',      // setMarginLeft
  MARGIN_RIGHT: 'bf223101e6211687',
  MARGIN_TOP: 'db57377d2b2b8bba',
  MARGIN_BOTTOM: '5a4a1cc0544463ff',
  PADDING_LEFT: 'fabdd4832f84d66d',
  PADDING_RIGHT: '2cd1cba4de1111e1',
  PADDING_TOP: 'db779dc86d8bd514',
  PADDING_BOTTOM: 'be236d8182451259',
  BACKGROUNDCOLOR: 'd8dd7d9b3cd5482e',  // setBackGroundColor
  CORNERRADIUS: '579cb14ee9f16dfd',

  // ── contenedor ──
  ORIENTATION: '9c173339fd9791b7',      // DX_VIEW_ORIENTATION · 0 = fila, 1 = columna
  GRAVITY: 'd35754e84f6522f6',
  // `setWeight`: en un contenedor de fila, `1` reparte el ancho a partes iguales. **Es como se
  // hacen las dos columnas del waterfall** — no hace falta una rejilla de columnas.
  WEIGHT: '002516dc25a6220e',

  // ── texto (COMPARTIDO con la entrada y el precio) ──
  TEXTSIZE: '5db0637a915fa268',
  TEXTCOLOR: '4fa0a53cf9ff05cd',
  ONPRESS: '47d68a4bafe73f71',          // EVENT_TAP

  // ── precio (`precioAtributos.ts`) ──
  CURRENCYSYMBOL: 'c46837aa6227ebef',
  CURRENCYPOSITION: '1a38bafff3d08bd0', // 1 = detrás
  CURRENCYSIZE: '217b0d03e1ec8912',
};

/**
 * LOS DOS TEMAS. **Los resuelve el SERVIDOR, que es lo que hace Taobao.**
 *
 * En el corpus hay 31 tokens `style.styleData.*` (medido en
 * `mercado-fase1/t1c-vocabulario/out/analisis.txt`): `searchBox.bgColor`, `darkBgColor`,
 * `lightBgColor`, `displayTextColor`, `darkModeDisplayTextColor`… **Siempre por parejas
 * claro/oscuro, y siempre resueltos en el servidor** — la plantilla nombra el token, no el color.
 * Aquí se hace lo mismo: el cliente manda su modo y recibe el árbol ya con los colores de ese modo.
 *
 * **`oscuro` es la paleta que ya está en el móvil**, así que hoy no cambia nada visualmente.
 * `claro` usa los colores de la casa (`brand.primary` azul para acciones, `brand.secondary`
 * naranja para el precio), que es donde el modo claro sí se nota.
 *
 * Los colores van en formato de Taobao (`#AARRGGBB`). **El cliente los traduce.**
 */
const TEMAS = {
  claro: {
    texto: '#FF111111',
    secundario: '#FF6B7280',
    naranja: '#FFC2410C',   // brand.secondary: el precio
    fondo: '#FFF6F7F9',
    tarjeta: '#FFFFFFFF',
  },
  oscuro: {
    texto: '#FFFFFFFF',
    secundario: '#FFA9AEB8',
    naranja: '#FFFF5000',
    fondo: '#FF1A1A1A',
    tarjeta: '#FF242424',
  },
};

/** El tema que se sirve si el cliente no dice cuál quiere. **La app va en oscuro hoy.** */
const TEMA_POR_DEFECTO = 'oscuro';

/** Los colores de un tema, con el de por defecto si llega uno que no existe. */
const coloresDe = (tema) => TEMAS[tema] ?? TEMAS[TEMA_POR_DEFECTO];

/** Compatibilidad: `C` sigue siendo la paleta por defecto. */
const C = coloresDe(TEMA_POR_DEFECTO);

/** De dónde se leen los productos. **El mismo catálogo que usa la app.** */
const CATALOGO = 'https://api.egrouteplan.com/api/ecomerse/catalog';

/**
 * De dónde salen las CATEGORÍAS. **El árbol real del Mercado**: departamentos (nivel 1) con sus
 * familias y sus hojas. Son 18 departamentos, y es lo que la app ya usa en su carril de pestañas
 * (`app/ecomerse.tsx:674`).
 */
const CATEGORIAS = 'https://api.egrouteplan.com/api/ecomerse/categories';

const ESQUEMA = 1;

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTRATO — esto es lo que vuestro backend tiene que devolver
// ─────────────────────────────────────────────────────────────────────────────
//
// GET /api/ecomerse/ui/home
//
//   200  { "esquema": 1, "arbol": <nodo>, "datos": <objeto> }
//   200  { "esquema": 1, "arbol": null }        -> no hay nada que pintar, y no es un error
//   4xx/5xx                                      -> el cliente degrada y no pinta la sección
//
//   <nodo> = {
//     "tipo":  "Vista" | "Contenedor" | "Texto" | "Imagen" | "Icono" | "Rejilla"
//              | "CuentaAtras" | "Carrusel" | "Scroll" | "Lista" | "Entrada" | "Precio"
//              | "Condicional",
//     "atributos": { "<clave-de-Taobao>": <valor> },   // opcional
//     "valor":  <string|number>,                       // opcional; `$ruta` es un binding
//     "hijos":  [ <nodo>, ... ],                       // opcional
//     "id":     "<string>"                             // opcional, para `key`
//   }
//
// **`tipo` es el nombre CANÓNICO, no el tipo de Taobao.** El servidor no tiene que saberse los
// 47 alias: manda `'Texto'`, y el cliente ya sabe que `DXTEXTVIEW` y compañía son lo mismo.
//
// **`datos` va en la MISMA respuesta que `arbol`.** El servidor es el que sabe las dos cosas: si
// vinieran por separado, una respuesta podría llegar sin la otra y la pantalla se pintaría vacía
// sin que nadie supiera por qué.
//
// **`esquema` es un número y sube cuando cambie la forma.** El cliente lo comprueba: un esquema
// que no conoce es motivo para NO pintar, no para pintar mal.

const texto = (valor, tamano, color, extra = {}) => ({
  tipo: 'Texto',
  valor,
  atributos: { [K.TEXTSIZE]: tamano, [K.TEXTCOLOR]: color, ...extra },
});

/** Las claves de `ext:` — **extension nuestra, no de Taobao**. Ver `components/ecomerse/valorAtributos.ts`. */
const EXT = { DEFECTO: 'ext:defecto', TABLA: 'ext:tabla', SEPARADOR: 'ext:separador' };

/**
 * **EL ÁRBOL ES UNA CONSTANTE. Lo que cambia son los DATOS.**
 *
 * Eso no es un detalle de estilo: significa que la forma que se manda **es siempre la misma** y se
 * puede cachear en un CDN, mientras los datos van aparte. Y significa que **se puede probar sin
 * red**, que es lo que hace el oráculo.
 *
 * Vuestro backend puede hacer lo mismo: una constante por pantalla, y una consulta para los datos.
 *
 * Recibe el rótulo porque **la misma franja sirve para varias pantallas** — «Del servidor» en la
 * portada, «También te puede interesar» en la ficha. **Una forma, varios sitios**: duplicarla para
 * cambiar una palabra sería tener dos sitios donde arreglar el mismo fallo.
 */
function arbolDeFranja(rotulo, tema) {
  // **El tema entra por aquí**: la forma es la misma en los dos modos y lo único que cambia es la
  // paleta. Eso es lo que permite cachear la forma y servir el color por petición.
  const C = coloresDe(tema);
  return {
    tipo: 'Vista',
    atributos: { [K.PADDING_TOP]: 4, [K.PADDING_BOTTOM]: 8 },
    hijos: [
      // **LAS TRES EXTENSIONES, funcionando.** El rótulo lleva una TABLA con valor por DEFECTO,
      // y debajo una FRASE de dos datos con SEPARADOR.
      {
        tipo: 'Texto',
        // El valor es la CLAVE que se busca en la tabla.
        valor: '$item.estado',
        atributos: {
          [K.TEXTSIZE]: 13,
          [K.TEXTCOLOR]: C.secundario,
          [K.PADDING_LEFT]: 16,
          [EXT.TABLA]: { nuevo: 'Nuevo', usado: 'Usado' },
          // **Los datos NO traen `estado`**, así que cae aquí — y eso es lo que hay que ver: una
          // clave que no está NO sale cruda en pantalla.
          [EXT.DEFECTO]: rotulo,
        },
      },
      {
        // **UNA FRASE de dos datos con separador.** `` `${a} · ${b}` `` no se puede hacer con `+`
        // en un árbol: se hace con hijos y un separador, como los `TextSpan` de Taobao.
        tipo: 'Texto',
        atributos: {
          [K.TEXTSIZE]: 11,
          [K.TEXTCOLOR]: C.secundario,
          [K.PADDING_LEFT]: 16,
          [K.PADDING_BOTTOM]: 6,
          [EXT.SEPARADOR]: ' · ',
        },
        hijos: [
          { tipo: 'Texto', valor: '$destacados.length', atributos: {} },
          { tipo: 'Texto', valor: 'productos', atributos: {} },
        ],
      },
      {
        // **UNA LISTA HORIZONTAL**, no un carrusel. `ORIENTATION: 0` es fila — y `DXRecyclerLayout`
        // hereda la orientación de `DXLinearLayout`, así que es la misma clave del vocabulario de
        // caja. **Hay UN repetidor, no cuatro**: `Carrusel`, `Rejilla` y `Scroll` reciben
        // `children`, así que darles plantilla sería tener tres formas de repetir.
        tipo: 'Lista',
        valor: '$destacados',
        atributos: { [K.ORIENTATION]: 0 },
        hijos: [{
          tipo: 'Contenedor',
          atributos: {
            [K.ORIENTATION]: 1,
            [K.LAYOUT_WIDTH]: 132,
            [K.MARGIN_RIGHT]: 10,
            [K.BACKGROUNDCOLOR]: C.tarjeta,
            [K.CORNERRADIUS]: 10,
            // **El toque lleva el id REAL del producto.** El servidor decide a dónde va; la
            // pantalla sólo recibe un id.
            [K.ONPRESS]: '$item.id',
          },
          hijos: [
            {
              tipo: 'Imagen',
              valor: '$item.foto',
              atributos: { [K.LAYOUT_WIDTH]: 132, [K.LAYOUT_HEIGHT]: 96, [K.CORNERRADIUS]: 10 },
            },
            texto('$item.titulo', 12, C.texto, { [K.PADDING_LEFT]: 8, [K.PADDING_RIGHT]: 8, [K.PADDING_TOP]: 6 }),
            {
              tipo: 'Precio',
              valor: '$item.precioXaf',
              atributos: {
                [K.CURRENCYSYMBOL]: 'XAF',
                [K.CURRENCYPOSITION]: 1,
                [K.CURRENCYSIZE]: 10,
                [K.TEXTSIZE]: 14,
                [K.TEXTCOLOR]: C.naranja,
                [K.PADDING_LEFT]: 8,
                [K.PADDING_BOTTOM]: 8,
              },
            },
            {
              // El condicional: «Con fotos», sólo si hay.
              tipo: 'Condicional',
              valor: '$item.tieneFotos',
              atributos: {},
              hijos: [texto('Con fotos', 10, C.secundario, { [K.PADDING_LEFT]: 8, [K.PADDING_BOTTOM]: 6 })],
            },
          ],
        }],
      },
    ],
  };
}

/** La franja de la portada del Mercado. */
const ARBOL_DESTACADOS = arbolDeFranja('Del servidor');
/** La franja de la ficha de producto. **Misma forma, otro rótulo.** */
const ARBOL_RELACIONADOS = arbolDeFranja('También te puede interesar');

/**
 * LA CLAVE DE ACCIÓN del contrato. **La declara el cliente** en
 * `components/ecomerse/valorAtributos.ts` (`CLAVES_VALOR.ACCION`); aquí solo se usa. Es una
 * extensión con prefijo `ext:` porque **Taobao no tiene esto como atributo**: lo resuelve con su
 * lenguaje de expresiones, que este cliente no implementa a propósito.
 */
const CLAVE_ACCION = 'ext:accion';

/** Las dos acciones de una tarjeta. **Son las que hoy impiden que la rejilla sustituya a la lista.** */
const ACCIONES = { FAVORITO: 'ext:favorito', CARRITO: 'ext:carrito' };

/**
 * Un BOTÓN DE ACCIÓN dentro de la tarjeta (corazón, carrito).
 *
 * `ONPRESS` lleva **el id del producto**, igual que el toque de la tarjeta: así navegar sigue
 * funcionando sin tocar nada. La acción va en **`ext:accion`**, que es donde el cliente la busca.
 *
 * **El árbol no guarda estado**: si el corazón está puesto o no es un DATO (`$item.esFavorito`), no
 * una variable del árbol.
 */
function accionDeTarjeta(icono, color, accion) {
  return {
    tipo: 'Icono',
    valor: icono,
    atributos: {
      [K.ONPRESS]: '$item.id',
      [CLAVE_ACCION]: accion,
      [K.TEXTCOLOR]: color,
      [K.TEXTSIZE]: 18,
      [K.LAYOUT_WIDTH]: 26,
      [K.LAYOUT_HEIGHT]: 26,
    },
  };
}

/**
 * LA TARJETA de la rejilla: la misma pieza que la de la franja, **pero sin ancho fijo**.
 *
 * En la franja la tarjeta mide 132 porque el ancho lo fija la densidad de un carrusel. En una
 * columna del waterfall **el ancho lo pone la columna** (`WEIGHT: 1`), así que aquí no se declara:
 * una tarjeta con ancho fijo dentro de una columna elástica deja hueco a un lado.
 */
function tarjetaDeRejilla(C) {
  return {
    tipo: 'Contenedor',
    atributos: {
      [K.ORIENTATION]: 1,
      [K.BACKGROUNDCOLOR]: C.tarjeta,
      [K.CORNERRADIUS]: 10,
      [K.MARGIN_BOTTOM]: 10,
      // El toque lleva el id REAL del producto; la pantalla decide a dónde va.
      [K.ONPRESS]: '$item.id',
    },
    hijos: [
      {
        tipo: 'Imagen',
        valor: '$item.foto',
        atributos: { [K.LAYOUT_HEIGHT]: 150, [K.CORNERRADIUS]: 10 },
      },
      texto('$item.titulo', 12, C.texto, { [K.PADDING_LEFT]: 8, [K.PADDING_RIGHT]: 8, [K.PADDING_TOP]: 6 }),
      {
        tipo: 'Precio',
        valor: '$item.precioXaf',
        atributos: {
          [K.CURRENCYSYMBOL]: 'XAF',
          [K.CURRENCYPOSITION]: 1,
          [K.CURRENCYSIZE]: 10,
          [K.TEXTSIZE]: 14,
          [K.TEXTCOLOR]: C.naranja,
          [K.PADDING_LEFT]: 8,
          [K.PADDING_BOTTOM]: 8,
        },
      },
      {
        // Las dos acciones, en una fila al pie de la tarjeta. **Con ellas, la rejilla servida puede
        // sustituir a la lista sin perder el corazón ni el carrito.**
        tipo: 'Contenedor',
        atributos: { [K.ORIENTATION]: 0, [K.PADDING_LEFT]: 8, [K.PADDING_RIGHT]: 8, [K.PADDING_BOTTOM]: 8 },
        hijos: [
          accionDeTarjeta('Heart', C.naranja, ACCIONES.FAVORITO),
          accionDeTarjeta('ShoppingCart', C.secundario, ACCIONES.CARRITO),
        ],
      },
    ],
  };
}

/**
 * LAS CLAVES DE LA BARRA DE PESTAÑAS. **Las `ext:` las declara el cliente** en
 * `components/ecomerse/pestanasAtributos.ts` (`CLAVES_PESTANAS`), cada una con el token de Taobao
 * del que sale (`PROCEDENCIA`). Aquí solo se usan.
 */
const PESTANAS = {
  SELECCIONADA: 'ext:activa',
  COLOR_SELECCIONADO: 'ext:coloractiva',
  TAMANO_SELECCIONADO: 'ext:tamanoactiva',
  INDICADOR: 'ext:indicador',
  INDICADOR_COLOR: 'ext:colorindicador',
  INDICADOR_TIPO: 'ext:tipoindicador',
  NEGRITA_SELECCIONADA: 'ext:negritaactiva',
  ESPACIO: 'ext:espacio',
  /** El alto de la imagen de una pestaña: en Taobao, `imageTabHeightAp` = 31. */
  ALTO_IMAGEN: 'ext:altoimagen',
};

/**
 * El hueco entre pestañas y los dos tamaños. **Aquí se eligen los números MEDIDOS DE LA CASA**, no
 * los de Taobao, y se dice por qué:
 *
 * | | Taobao (`style.styleData.tabs`) | aquí | por qué |
 * |---|---|---|---|
 * | hueco | `tabSpaceConfig.phoneSpace` = **11** | **12** (`espaciado.e12`) | el carril que esto sustituye ya usa 12; cambiarlo movería un píxel de una barra que ya está en la calle |
 * | tamaño | `textSize` = **16** | **12** (`tipografia.caption`) | con 18 pestañas la fila se recorre deslizando: un rótulo grande convierte cada pestaña en un bloque |
 * | tamaño activo | `textSelectSize` = **18** | **13** | el mismo motivo, un peldaño por encima |
 *
 * **El mecanismo es el de Taobao; los números, los de la medición que ya existe aquí.** Los dos se
 * pueden cambiar en una línea, y están al lado para poder compararlos.
 */
const ESPACIO_PESTANAS = 12;
const TAMANO_PESTANA = 12;
const TAMANO_PESTANA_ACTIVA = 13;

/**
 * LA BARRA DE PESTAÑAS de las categorías del Mercado, en la forma de Taobao.
 *
 * Taobao la monta como una **sección** (`sectionBizCode: "categoryTab"`), con las pestañas en
 * `content.tabs[]` y el tema en `style.styleData.tabs`. Aquí: el tipo es `Pestanas` (cuyo alias ES
 * `categoryTab`) y los datos van por `valor`, como en la `Lista`.
 *
 * **El tema es de verdad claro/oscuro**: el color normal, el de la activa y el del subrayado salen
 * del tema que pide el cliente con `?tema=`, igual que el resto de las secciones.
 *
 * `activa` es el **índice** de la pestaña que empieza elegida. En Taobao eso viaja por pestaña
 * (`isDefaultSelected` / `isStickyLeft`, medido en la pestaña 推荐); aquí llega como índice porque el
 * árbol y los datos se montan a la vez — que es también como lo hace Taobao.
 */
function arbolDeCategorias(tema, activa = 0) {
  const C = coloresDe(tema);
  return {
    tipo: 'Pestanas',
    valor: '$categorias',
    atributos: {
      // El carril ocupa el ancho y lleva su fondo y su aire: es una franja pegada a la barra de
      // búsqueda, como la que el listado ya tiene.
      [K.LAYOUT_WIDTH]: -1,
      [K.BACKGROUNDCOLOR]: C.tarjeta,
      [K.PADDING_LEFT]: 16,
      [K.PADDING_RIGHT]: 16,
      // ── el tema de la barra ──
      [K.TEXTCOLOR]: C.secundario,          // inactiva: gris
      [K.TEXTSIZE]: TAMANO_PESTANA,
      [PESTANAS.COLOR_SELECCIONADO]: C.texto,
      [PESTANAS.TAMANO_SELECCIONADO]: TAMANO_PESTANA_ACTIVA,
      [PESTANAS.INDICADOR]: true,
      [PESTANAS.INDICADOR_COLOR]: C.naranja,
      // **`smile`: el subrayado curvo de Taobao**, medido (`tabIndicatorType: "smile"`). Se pinta con
      // píxeles nuestros (una cápsula): sus arcos son imágenes de su CDN y no se copian.
      [PESTANAS.INDICADOR_TIPO]: 'smile',
      [PESTANAS.NEGRITA_SELECCIONADA]: true,
      [PESTANAS.ESPACIO]: ESPACIO_PESTANAS,
      // El alto de la imagen de una pestaña: en Taobao `imageTabHeightAp` = **31**. Hoy el Mercado no
      // manda imágenes (ver `datosDeCategorias`), pero el contrato queda con su valor medido.
      [PESTANAS.ALTO_IMAGEN]: 31,
      [PESTANAS.SELECCIONADA]: Math.max(0, Math.trunc(activa)),
    },
  };
}

/** ¿Este texto es una URL con la que se pueda pintar una imagen? */
const esUrlDeImagen = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);

/**
 * Los datos de la barra: **las categorías REALES del Mercado**, no una lista de ejemplo.
 *
 * La primera pestaña es **Recomendado** con `id: ''`, que es exactamente lo que hace el carril de
 * `app/ecomerse.tsx:681`: `''` significa «sin filtro». **No se inventa ni un departamento.**
 *
 * ⚠️ **Los emojis NO se mandan, y es a propósito.** Medido en las **12 pestañas** de la portada de
 * Taobao (`re-e-categorias/out/pestanas-detalle.txt`): el rótulo es **texto** y, cuando la pestaña
 * lleva icono, es **un PNG de 92×80** (`labelImg`) con su ubicación (`labelLocation: right`), su hueco
 * (`imgPadding: 10`) y su proporción (`labelAspectRatio: 1.15`). **Emoji, ninguno: eso era invención
 * nuestra.** El icono del departamento solo se manda si es **una URL**; hoy guarda un emoji, así que
 * las pestañas salen **de texto** — que es lo que son **7 de las 12 de Taobao**.
 */
async function datosDeCategorias() {
  const respuesta = await fetch(CATEGORIAS);
  if (!respuesta.ok) return null;
  const departamentos = await respuesta.json();
  if (!Array.isArray(departamentos) || departamentos.length === 0) return null;
  const categorias = departamentos
    .filter((d) => d && d.id)
    .map((d) => {
      const icono = typeof d.icon === 'string' ? d.icon : '';
      return {
        id: String(d.id),
        etiqueta: String(d.label ?? ''),
        // Las claves de la imagen, **solo si de verdad hay una imagen**, con los valores MEDIDOS en
        // Taobao para una pestaña con rótulo gráfico.
        ...(esUrlDeImagen(icono)
          ? { imagen: icono, imagenactiva: icono, ubicacion: 'right', separacion: 10, aspecto: 1.15 }
          : {}),
      };
    });
  if (categorias.length === 0) return null;
  return { categorias: [{ id: '', etiqueta: 'Recomendado' }, ...categorias] };
}

/**
 * LA REJILLA, en la forma de Taobao: **dos `Lista` en fila con los datos repartidos.**
 *
 * Medido en el corpus: Taobao **no tiene un widget de waterfall**. Tiene `DXRecyclerLayout`, y una
 * franja de dos columnas se monta con **dos listas en un contenedor de fila** (el mismo patrón que
 * la franja horizontal, con `ORIENTATION: 1` en vez de `0`). Aquí igual:
 *
 * ```
 * Contenedor (ORIENTATION: 0 = fila)
 *   ├── Lista (ORIENTATION: 1, WEIGHT: 1)  ← columna A, con sus datos
 *   └── Lista (ORIENTATION: 1, WEIGHT: 1)  ← columna B, con los suyos
 * ```
 *
 * **`WEIGHT: 1` es lo que reparte el ancho a partes iguales** (`flex: 1` en flexbox) y **es la
 * razón de que no haga falta una rejilla**: las dos columnas salen del vocabulario que ya existe.
 */
function arbolDeRejilla(tema) {
  const C = coloresDe(tema);
  const columna = (dato) => ({
    tipo: 'Lista',
    valor: dato,
    atributos: { [K.ORIENTATION]: 1, [K.WEIGHT]: 1 },
    hijos: [tarjetaDeRejilla(C)],
  });
  return {
    tipo: 'Contenedor',
    atributos: { [K.ORIENTATION]: 0, [K.PADDING_LEFT]: 12, [K.PADDING_RIGHT]: 12, [K.PADDING_TOP]: 4 },
    hijos: [columna('$columnaA'), columna('$columnaB')],
  };
}

/** Un producto del catálogo, en la forma contra la que se resuelven los bindings del árbol. */
function fichaDeProducto(p) {
  return {
    id: p.id,
    titulo: p.title,
    precioXaf: p.priceXaf,
    // El host de fotos está caído, así que se manda igual y el widget `Imagen` enseña su marcador
    // de fallo en vez de un hueco en blanco. Es justo para lo que existe ese marcador.
    foto: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0] : '',
    tieneFotos: Array.isArray(p.photos) ? p.photos.length : 0,
  };
}

/**
 * Los DATOS. **Se leen del catálogo REAL**, no inventados: así el toque navega a una ficha de
 * verdad y se puede comprobar de punta a punta. **Es lo que hará vuestro backend**: leer de la
 * base y montar los datos, con esta misma forma.
 *
 * `excluir` quita el producto que se está mirando: **«también te puede interesar» no eres tú.**
 */
async function datosDeDestacados(excluir) {
  const respuesta = await fetch(`${CATALOGO}?limit=12`);
  if (!respuesta.ok) return null;
  const productos = await respuesta.json();
  if (!Array.isArray(productos) || productos.length === 0) return null;

  const lista = excluir ? productos.filter((p) => p.id !== excluir) : productos;
  if (lista.length === 0) return null;

  return { destacados: lista.slice(0, 10).map(fichaDeProducto) };
}

/**
 * Los datos de la rejilla: **el catálogo repartido en dos columnas, alternando**.
 *
 * Alternar (una sí, una no) es lo que deja las dos columnas **igualadas por número**: con tarjetas
 * de la misma altura —que es el caso hoy— el reparto alterno es exactamente equilibrado, y no hace
 * falta estimar alturas. *(Taobao sí las estima, porque sus tarjetas varían de alto.)*
 *
 * Se reparte **lo mismo que se enseña**: si el reparto se hiciera sobre una lista y se pintara otra,
 * dos productos se quedarían fuera sin que nadie lo notara.
 */
async function datosDeRejilla(limite = 40) {
  const respuesta = await fetch(`${CATALOGO}?limit=${limite}`);
  if (!respuesta.ok) return null;
  const productos = await respuesta.json();
  if (!Array.isArray(productos) || productos.length === 0) return null;

  const fichas = productos.slice(0, limite).map(fichaDeProducto);
  const columnaA = fichas.filter((_, i) => i % 2 === 0);
  const columnaB = fichas.filter((_, i) => i % 2 === 1);
  if (columnaA.length === 0) return null;
  return { columnaA, columnaB, total: fichas.length };
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (codigo, cuerpo) => {
    const texto = JSON.stringify(cuerpo);
    res.writeHead(codigo, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(texto),
      'access-control-allow-origin': '*',
    });
    res.end(texto);
  };

  // ── LAS RUTAS ─────────────────────────────────────────────────────────────────────────────
  // **Una por sección**, no una para todo. Si todas las pantallas pidieran `home`, todas
  // recibirían el mismo árbol — y el servidor no podría decir cosas distintas en cada sitio.
  const RUTAS = {
    // **`?tema=` lo pone el cliente con el modo del sistema.** El servidor resuelve los colores y
    // manda el árbol ya pintable: el cliente no tiene tabla de temas, igual que no la tiene Taobao
    // en la plantilla — la plantilla nombra `style.styleData.*` y el color lo pone el servidor.
    '/api/ecomerse/ui/home': (p) => ({
      arbol: arbolDeFranja('Del servidor', p.get('tema')),
      buscarDatos: () => datosDeDestacados(undefined),
    }),
    '/api/ecomerse/ui/detail': (p) => ({
      arbol: arbolDeFranja('También te puede interesar', p.get('tema')),
      buscarDatos: () => datosDeDestacados(p.get('id') ?? undefined),
    }),
    // **La rejilla en la forma de Taobao**: dos `Lista` en fila con los datos repartidos.
    '/api/ecomerse/ui/rejilla': (p) => ({
      arbol: arbolDeRejilla(p.get('tema')),
      buscarDatos: () => datosDeRejilla(),
    }),
    // **La barra de pestañas de las categorías**: en Taobao, la sección `categoryTab`.
    //
    // **`?activa=<id>` es qué pestaña empieza elegida.** El árbol tiene que saberlo, y el índice sale
    // de los datos: por eso esta ruta no manda un árbol fijo, sino que **lo monta con los datos**
    // (mismo orden que Taobao: primero llega la lista, y con ella cuál está seleccionada).
    '/api/ecomerse/ui/categorias': (p) => ({
      arbol: null,
      buscarDatos: async () => {
        const datos = await datosDeCategorias();
        if (!datos) return null;
        const buscada = p.get('activa');
        const indice = buscada ? Math.max(0, datos.categorias.findIndex((c) => c.id === buscada)) : 0;
        return { datos, arbol: arbolDeCategorias(p.get('tema'), indice) };
      },
    }),
  };

  if (RUTAS[url.pathname]) {
    const cfg = RUTAS[url.pathname](url.searchParams);
    Promise.resolve(cfg.buscarDatos())
      .then((r) => {
        // Una ruta puede devolver solo los datos, o **datos Y árbol** cuando el árbol depende de
        // ellos (las pestañas: cuál está activa sale de la lista). Se aceptan las dos formas.
        const conArbol = r && typeof r === 'object' && 'datos' in r && 'arbol' in r;
        const datos = conArbol ? r.datos : r;
        const arbol = conArbol ? r.arbol : cfg.arbol;
        // **`arbol: null` es un estado legítimo del contrato**: «no hay nada que pintar». El
        // cliente no pinta la sección y sigue con el resto de la pantalla.
        if (!datos || !arbol) { json(200, { esquema: ESQUEMA, arbol: null }); return; }
        json(200, { esquema: ESQUEMA, arbol, datos });
      })
      .catch(() => json(200, { esquema: ESQUEMA, arbol: null }));
    return;
  }
  // Salud: poder comprobar que el servidor está vivo ANTES de culpar a la app.
  if (url.pathname === '/salud') { json(200, { ok: true, esquema: ESQUEMA }); return; }

  json(404, { mensaje: 'no existe', ruta: url.pathname });
});

const puerto = Number(process.argv[2] ?? 8788);

// **El servidor solo escucha si a este fichero se le EJECUTA, no si se le importa.** Sin esto,
// importarlo desde un test abriría un puerto de verdad y el test se quedaría colgado escuchando
// — que es exactamente lo que pasó la primera vez que se probó.
const esEjecucionDirecta = process.argv[1] !== undefined
  && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (esEjecucionDirecta) {
  servidor.listen(puerto, () => {
    console.log(`servidor-ui escuchando en http://localhost:${puerto}`);
    console.log('  GET /api/ecomerse/ui/home   el arbol de la portada');
    console.log('  GET /salud                  comprobar que esta vivo');
    console.log('');
    console.log(`para el movil:  adb reverse tcp:${puerto} tcp:${puerto}`);
  });
}

// Se exporta para poder PROBAR el arbol sin arrancar el servidor: el oráculo comprueba que todas
// las claves que manda el servidor son claves que el cliente conoce.
export { ARBOL_DESTACADOS, ARBOL_RELACIONADOS, arbolDeFranja, arbolDeRejilla, tarjetaDeRejilla, accionDeTarjeta, ACCIONES, CLAVE_ACCION, arbolDeCategorias, datosDeCategorias, PESTANAS, ESPACIO_PESTANAS, datosDeDestacados, datosDeRejilla, fichaDeProducto, K, C, TEMAS, TEMA_POR_DEFECTO, coloresDe, ESQUEMA, puerto };
