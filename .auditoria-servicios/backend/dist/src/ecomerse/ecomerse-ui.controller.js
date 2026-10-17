"use strict";
// =============================================================================
// ecomerse-ui.controller.js — LA UI DEL MERCADO SERVIDA POR EL BACKEND
//
// **Dónde va y por qué aquí.** Este fichero vive DENTRO del módulo `ecomerse`
// del backend que corre de verdad (la ZIP Web Function `egrouteplan-api` de
// Tencent CloudBase). `main.js` ya pone `app.setGlobalPrefix('api')`, así que
// `@Controller('ecomerse/ui')` sirve `/api/ecomerse/ui/*` — que es exactamente
// lo que pide el cliente.
//
//   GET /api/ecomerse/ui/home          la franja de la portada
//   GET /api/ecomerse/ui/detail?id=…   la franja de la ficha («también te puede interesar»)
//
// **Qué es `dist/`.** El backend se extrajo del servidor y **solo hay `dist/`**:
// no hay `.ts` en el disco. Se escribe aquí, en el mismo estilo compilado que sus
// hermanos, porque es el artefacto que se despliega. Cuando se recupere el repo
// fuente, esto se transpone a `src/ecomerse/ecomerse-ui.controller.ts` — la forma
// es la misma.
//
// ── EL CONTRATO, que ya está probado contra el cliente ────────────────────────
//
//   200 { "esquema": 1, "arbol": <nodo>, "datos": <objeto> }
//   200 { "esquema": 1, "arbol": null }     <- «no hay nada que pintar». NO es un error.
//   4xx/5xx                                   -> el cliente no pinta la sección y sigue
//
//   **`esquema` es un número y sube cuando cambie la FORMA.** El cliente lo
//   comprueba y NO pinta si no lo conoce: un árbol de otra versión puede traer
//   claves con otro significado, y pintarlo «como se pueda» mostraría datos
//   equivocados con toda tranquilidad.
//
//   **`arbol` y `datos` van JUNTOS.** Si vinieran por canales separados, una
//   respuesta podría llegar sin la otra y la pantalla se pintaría vacía sin que
//   nadie supiera si faltan los datos o falla la forma.
//
// ── LO QUE MÁS IMPORTA DE TODO ESTE FICHERO ──────────────────────────────────
//
// **El ARBOL es una CONSTANTE. Lo que cambia son los DATOS.**
//
// Cambiar el aspecto del Mercado es cambiar `arbolDeFranja`, **sin tocar ni una
// línea del cliente** y sin desplegar la app. Y el árbol se puede revisar y probar
// sin base de datos.
//
// **El árbol tiene que seguir siendo EL MISMO que el de `tools/servidor-ui.mjs`**
// (el endpoint local con el que se prueba en el móvil). Eso no se confía a la
// memoria: hay un test que compara los dos NORMALIZADOS — forma, valores,
// atributos y orden de los hijos — y se pone rojo si divergen. Sin ese test se
// probaría una cosa y se desplegaría otra.
//
// ── Y LAS CLAVES DE `atributos` ──────────────────────────────────────────────
//
// Son **las de Taobao** (hex de 16 dígitos), copiadas de
// `components/ecomerse/*Atributos.ts` — **nunca tecleadas**. Hay un test que suma
// las claves que conoce el cliente y falla si el servidor manda alguna que no
// esté: el cliente ignora lo que no conoce, así que una clave inventada se
// llevaría por delante un margen, un color o un tamaño **sin un solo error**.
// =============================================================================

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcomerseUiController = exports.CLAVES_UI = exports.ESQUEMA_UI = exports.ARBOL_RELACIONADOS = exports.ARBOL_DESTACADOS = exports.TEMAS = exports.TEMA_POR_DEFECTO = exports.coloresDe = exports.arbolDeCategorias = exports.datosDeCategorias = exports.esUrlDeImagen = exports.PESTANAS = exports.ESPACIO_PESTANAS = exports.SPAN_TARJETA = exports.CLAVE_ASPECTO = exports.ASPECTO_TARJETA = exports.REJILLA = exports.LISTA = exports.TEMPLATE_NAME = exports.PLANTILLA_ESTRECHA = exports.PLANTILLA_ANCHA = exports.SORT_POR_DEFECTO = exports.consultaDeCatalogo = exports.tarjetaAnchaPara = exports.arbolDeRejilla = exports.tarjetaDeRejilla = exports.accionDeTarjeta = exports.ACCIONES = exports.CLAVE_ACCION = exports.fichaDeProducto = exports.datosDeRejilla = exports.arbolDeFranja = exports.datosDeDestacados = void 0;
const common_1 = require("@nestjs/common");
const ecomerse_service_1 = require("./ecomerse.service");
const guards_1 = require("../http/guards");

// El orden por defecto del catálogo. Va aquí, a nivel de módulo, para que exista ya al importar.
const SORT_POR_DEFECTO = 'recommended';
exports.SORT_POR_DEFECTO = SORT_POR_DEFECTO;

// ─────────────────────────────────────────────────────────────────────────────
// LAS CLAVES — copiadas de `components/ecomerse/*Atributos.ts`. NO tecleadas.
// ─────────────────────────────────────────────────────────────────────────────
const K = {
    // vocabulario de CAJA, compartido por todos los widgets
    LAYOUT_WIDTH: '0000123cef8d32c5',
    LAYOUT_HEIGHT: '002134aae97d133f',
    MARGIN_RIGHT: 'bf223101e6211687',
    MARGIN_BOTTOM: '5a4a1cc0544463ff',
    PADDING_LEFT: 'fabdd4832f84d66d',
    PADDING_RIGHT: '2cd1cba4de1111e1',
    PADDING_TOP: 'db779dc86d8bd514',
    PADDING_BOTTOM: 'be236d8182451259',
    BACKGROUNDCOLOR: 'd8dd7d9b3cd5482e',
    CORNERRADIUS: '579cb14ee9f16dfd',
    // contenedor
    ORIENTATION: '9c173339fd9791b7',   // 0 = fila, 1 = columna
    // `setWeight`: en un contenedor de fila, `1` reparte el ancho a partes iguales. **Es como se
    // hacen las dos columnas del waterfall** — no hace falta una rejilla de columnas.
    WEIGHT: '002516dc25a6220e',
    // texto (COMPARTIDO con la entrada y el precio)
    TEXTSIZE: '5db0637a915fa268',
    TEXTCOLOR: '4fa0a53cf9ff05cd',
    ONPRESS: '47d68a4bafe73f71',       // EVENT_TAP
    // precio
    CURRENCYSYMBOL: 'c46837aa6227ebef',
    CURRENCYPOSITION: '1a38bafff3d08bd0',
    CURRENCYSIZE: '217b0d03e1ec8912',
};
exports.CLAVES_UI = K;

/**
 * LOS DOS TEMAS. **Los resuelve el SERVIDOR, que es lo que hace Taobao.**
 *
 * En el corpus hay 31 tokens `style.styleData.*` (`searchBox.bgColor`, `darkBgColor`,
 * `lightBgColor`, `displayTextColor`, `darkModeDisplayTextColor`…): **siempre por parejas
 * claro/oscuro y siempre resueltos en el servidor** — la plantilla nombra el token, no el color.
 * Aquí igual: el cliente manda su modo (`?tema=`) y recibe el árbol ya con esos colores.
 *
 * **`oscuro` es la paleta que ya está en el móvil** (hoy no cambia nada visualmente); `claro` usa
 * los colores de la casa. Los colores van en formato de Taobao (`#AARRGGBB`) y el cliente los
 * traduce.
 */
const TEMAS = {
    claro: { texto: '#FF111111', secundario: '#FF6B7280', naranja: '#FFC2410C', fondo: '#FFF6F7F9', tarjeta: '#FFFFFFFF' },
    oscuro: { texto: '#FFFFFFFF', secundario: '#FFA9AEB8', naranja: '#FFFF5000', fondo: '#FF1A1A1A', tarjeta: '#FF242424' },
};
exports.TEMAS = TEMAS;

/** El tema que se sirve si el cliente no dice cuál quiere. **La app va en oscuro hoy.** */
const TEMA_POR_DEFECTO = 'oscuro';
exports.TEMA_POR_DEFECTO = TEMA_POR_DEFECTO;

/** Los colores de un tema, con el de por defecto si llega uno que no existe. */
const coloresDe = (tema) => TEMAS[tema] ?? TEMAS[TEMA_POR_DEFECTO];
exports.coloresDe = coloresDe;

const C = coloresDe(TEMA_POR_DEFECTO);

/**
 * **Sube esto cuando cambie la FORMA del árbol.** El cliente no pinta lo que no conoce.
 */
const ESQUEMA_UI = 1;
exports.ESQUEMA_UI = ESQUEMA_UI;

/**
 * **Las claves `ext:` son una EXTENSIÓN NUESTRA, no de Taobao.** Ver
 * `components/ecomerse/valorAtributos.ts`: Taobao resuelve estas tres con su lenguaje de
 * expresiones (los 93 `DX_PARSER_*`), que NO está implementado a propósito. El prefijo hace
 * imposible confundirlas con una clave de Taobao.
 */
const EXT = { DEFECTO: 'ext:defecto', TABLA: 'ext:tabla', SEPARADOR: 'ext:separador' };

const texto = (valor, tamano, color, extra = {}) => ({
    tipo: 'Texto',
    valor,
    atributos: Object.assign({ [K.TEXTSIZE]: tamano, [K.TEXTCOLOR]: color }, extra),
});

/**
 * **EL ÁRBOL ES UNA CONSTANTE. Lo que cambia son los DATOS.**
 *
 * Recibe el rótulo porque **la misma franja sirve para varias pantallas** — «Del servidor» en la
 * portada, «También te puede interesar» en la ficha. **Una forma, varios sitios**: duplicarla para
 * cambiar una palabra sería tener dos sitios donde arreglar el mismo fallo.
 */
function arbolDeFranja(rotulo, tema) {
    // **El tema entra por aquí**: la forma es la misma en los dos modos y lo único que cambia es la
    // paleta — que es lo que permite cachear la forma y servir el color por petición.
    const C = coloresDe(tema);
    return {
        tipo: 'Vista',
        atributos: { [K.PADDING_TOP]: 4, [K.PADDING_BOTTOM]: 8 },
        hijos: [
            // **LAS TRES EXTENSIONES, funcionando.** El rótulo lleva una TABLA con valor por
            // DEFECTO, y debajo una FRASE de dos datos con SEPARADOR.
            {
                tipo: 'Texto',
                // El valor es la CLAVE que se busca en la tabla.
                valor: '$item.estado',
                atributos: {
                    [K.TEXTSIZE]: 13,
                    [K.TEXTCOLOR]: C.secundario,
                    [K.PADDING_LEFT]: 16,
                    [EXT.TABLA]: { nuevo: 'Nuevo', usado: 'Usado' },
                    // **Los datos NO traen `estado`**, así que cae aquí — y eso es lo que hay que
                    // ver: una clave que no está NO sale cruda en pantalla.
                    [EXT.DEFECTO]: rotulo,
                },
            },
            {
                // **UNA FRASE de dos datos con separador.** `` `${a} · ${b}` `` no se puede hacer
                // con `+` en un árbol: se hace con hijos y un separador, como los `TextSpan` de
                // Taobao.
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
                // **UNA LISTA HORIZONTAL**, no un carrusel: `DXRecyclerLayout` hereda la orientación
                // de `DXLinearLayout`, así que `ORIENTATION: 0` la pone en fila. **Hay UN solo
                // repetidor** — `Carrusel`, `Rejilla` y `Scroll` reciben hijos, no datos.
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
                        // **El toque lleva el id REAL del producto.** El servidor decide a dónde
                        // va; la pantalla sólo recibe un id.
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
                                [K.CURRENCYPOSITION]: 1,   // 1 = el símbolo DETRÁS (`4.000 XAF`)
                                [K.CURRENCYSIZE]: 10,      // el símbolo, MENOR que la cifra
                                [K.TEXTSIZE]: 14,
                                [K.TEXTCOLOR]: C.naranja,
                                [K.PADDING_LEFT]: 8,
                                [K.PADDING_BOTTOM]: 8,
                            },
                        },
                        {
                            // Un condicional: «Con fotos», sólo si hay. **Con UN hijo y sin
                            // «sino»** — si no hay fotos no hay segunda rama y no se pinta nada.
                            // Es el `getChildrenCount() == 1` de `DXConditionalNode`.
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
exports.arbolDeFranja = arbolDeFranja;

/** La franja de la portada del Mercado. */
const ARBOL_DESTACADOS = arbolDeFranja('Del servidor');
exports.ARBOL_DESTACADOS = ARBOL_DESTACADOS;
/** La franja de la ficha de producto. **Misma forma, otro rótulo.** */
const ARBOL_RELACIONADOS = arbolDeFranja('También te puede interesar');
exports.ARBOL_RELACIONADOS = ARBOL_RELACIONADOS;

/**
 * LA CLAVE DE ACCIÓN del contrato. **La declara el cliente** en
 * `components/ecomerse/valorAtributos.ts` (`CLAVES_VALOR.ACCION`); aquí solo se usa. Lleva prefijo
 * `ext:` porque **Taobao no la tiene como atributo**: lo resuelve con su lenguaje de expresiones.
 */
const CLAVE_ACCION = 'ext:accion';
exports.CLAVE_ACCION = CLAVE_ACCION;

/** Las dos acciones de una tarjeta. **Son las que hoy impiden que la rejilla sustituya a la lista.** */
const ACCIONES = { FAVORITO: 'ext:favorito', CARRITO: 'ext:carrito', DEJAR_DE_SEGUIR: 'ext:dejardeseguir' };
exports.ACCIONES = ACCIONES;

/**
 * Un BOTÓN DE ACCIÓN dentro de la tarjeta. `ONPRESS` lleva **el id del producto** (igual que el toque
 * de la tarjeta, así navegar sigue igual) y la acción va en **`ext:accion`**.
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
exports.accionDeTarjeta = accionDeTarjeta;

/**
 * LA TARJETA de la rejilla: la misma pieza que la de la franja, **pero sin ancho fijo**.
 *
 * En la franja la tarjeta mide 132 porque el ancho lo fija la densidad de un carrusel. En un hueco de
 * la rejilla **el ancho lo pone el `span`**.
 *
 * **Y HAY DOS, que es el punto** (en Taobao, 41 plantillas en el catálogo de seguidos): cada una lleva
 * su `templateName` —el nombre con el que los elementos la eligen— y **su `span`**, porque el ancho es
 * del diseño de la tarjeta. La ancha lleva la imagen más grande, que es para lo que se le da el ancho.
 * **Los números son nuestros y el mecanismo es de Taobao.**
 */
function tarjetaDeRejilla(C, { nombre, span, tamanoTitulo }) {
    return {
        tipo: 'Contenedor',
        atributos: {
            [TEMPLATE_NAME]: nombre,
            [SPAN_TARJETA]: span,
            [K.ORIENTATION]: 1,
            [K.BACKGROUNDCOLOR]: C.tarjeta,
            [K.CORNERRADIUS]: REJILLA.RADIO,
            [K.ONPRESS]: '$item.id',
        },
        hijos: [
            {
                tipo: 'Imagen',
                valor: '$item.foto',
                // `LAYOUT_WIDTH: -1` = ocupar el ancho del hueco; **la proporción medida** (1, cuadrada)
                // pone el alto, así que la foto se ve más grande en la tarjeta ancha sin cambiar números.
                atributos: { [K.LAYOUT_WIDTH]: -1, [CLAVE_ASPECTO]: ASPECTO_TARJETA, [K.CORNERRADIUS]: REJILLA.RADIO },
            },
            texto('$item.titulo', tamanoTitulo, C.texto, { [K.PADDING_LEFT]: 8, [K.PADDING_RIGHT]: 8, [K.PADDING_TOP]: 6 }),
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
                // Las dos acciones, en una fila al pie. **Con ellas la rejilla servida puede sustituir
                // a la lista sin perder el corazón ni el carrito.**
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
exports.tarjetaDeRejilla = tarjetaDeRejilla;

/**
 * LAS CLAVES DE LA BARRA DE PESTAÑAS. **Las `ext:` las declara el cliente** en
 * `components/ecomerse/pestanasAtributos.ts`, cada una con el token de Taobao del que sale.
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
exports.PESTANAS = PESTANAS;

/**
 * El hueco entre pestañas y los dos tamaños. **Se eligen los números MEDIDOS DE LA CASA**, no los de
 * Taobao, y queda dicho por qué: Taobao usa `phoneSpace` 11 y `textSize/textSelectSize` 16/18, pero
 * el carril que esto sustituye ya usa 12 de hueco y `caption` (12) de rótulo porque **con 18
 * pestañas la fila se recorre deslizando**. El MECANISMO es el de Taobao; los números, los de aquí.
 */
const ESPACIO_PESTANAS = 12;
exports.ESPACIO_PESTANAS = ESPACIO_PESTANAS;
const TAMANO_PESTANA = 12;
const TAMANO_PESTANA_ACTIVA = 13;

/**
 * La clave con la que una tarjeta dice **cuántas columnas ocupa**.
 *
 * Medido en el corpus: en Taobao el `span` es un campo de la entrada de plantilla
 * (`livehomecore_flexalocal/bottoming_template_list.json`), **texto** (`"1"` / `"2"` / `""`), y el
 * catálogo de seguidos tiene **31 de 41 con span 2**. Aquí viaja en la raíz de la tarjeta, que es
 * donde este contrato puede leerlo por elemento —y ahora **es una constante de cada PLANTILLA**,
 * porque en Taobao el ancho es del diseño de la tarjeta. **El nombre lo comprueba el oráculo contra el
 * cliente** (`listaAtributos.CLAVE_SPAN_PLANTILLA`): si se separan, el test falla.
 */
const SPAN_TARJETA = 'ext:span';
exports.SPAN_TARJETA = SPAN_TARJETA;

/**
 * **NUESTRA extensión para la proporción de una imagen** (`ext:aspecto`).
 *
 * En Taobao la proporción es `DXTEMPLATE_ASPECTRATIO`, y en las tarjetas del feed vale **1**
 * (cuadradas). El nombre es el mismo que el del cliente (`imagenAtributos.CLAVE_ASPECTO`) y el mismo
 * que el del servidor local: el oráculo los compara.
 */
const CLAVE_ASPECTO = 'ext:aspecto';
exports.CLAVE_ASPECTO = CLAVE_ASPECTO;

/** **La proporción medida**: `DXTEMPLATE_ASPECTRATIO = 1` en las tarjetas del feed. */
const ASPECTO_TARJETA = 1;
exports.ASPECTO_TARJETA = ASPECTO_TARJETA;

/**
 * **LA GEOMETRÍA MEDIDA DE LA REJILLA**, en un sitio para no repetirla.
 *
 *   · `HUECO = 8` — medido en las plantillas de catálogo de 2 columnas del corpus
 *     (`m_r_sub_feedback_detail_2025`, `buy_v2_item_ext`, `detail_v4_clothing_matching_purchase`; otra
 *     trae 7). **Nunca 12**: el hueco que se veía en el móvil era el doble del de Taobao.
 *   · `MARGEN = 8` — el margen lateral no tiene nombre propio en el corpus (las claves de
 *     `leftGap`/`rightGap` son de otra tabla). **Se usa el mismo 8 y se declara como decisión.**
 *   · `RADIO = 6` — el radio de las tarjetas del feed (`DXIMAGESPAN_CORNERRADIUS`, 864 usos).
 */
const REJILLA = { COLUMNAS: 2, HUECO: 8, MARGEN: 8, MARGEN_SUPERIOR: 4, RADIO: 6 };
exports.REJILLA = REJILLA;

/**
 * Las claves de la REJILLA, de `DX_GRID_LAYOUT_*`. **No están en `K`** —el vocabulario de CAJA
 * compartido— porque son de la lista: una caja no tiene columnas. El oráculo las comprueba contra el
 * cliente (`listaAtributos.CLAVES_LISTA`).
 */
const LISTA = {
    COLUMN_COUNT: '4480460401770252962',     // DX_GRID_LAYOUT_COLUMN_COUNT
    COLUMN_SPACING: '-7076735627431451296',  // DX_GRID_LAYOUT_COLUMN_SPACING
    ROW_SPACING: '-5965488911581852121',     // DX_GRID_LAYOUT_ROW_SPACING
};
exports.LISTA = LISTA;

/**
 * **QUÉ TARJETA USA CADA ELEMENTO.** En el feed de descubrimiento de Taobao cada elemento lleva
 * `templateName`, y en la misma lista conviven tarjetas distintas (11 normales + 1 de producto). Es el
 * nombre REGISTRADO: no se le inventa una clave.
 */
const TEMPLATE_NAME = 'templateName';
exports.TEMPLATE_NAME = TEMPLATE_NAME;

/** Los nombres de NUESTRAS dos plantillas, al estilo de los de Taobao (espacio de nombres propio). */
const PLANTILLA_ESTRECHA = 'mercado_tarjeta_estrecha';
const PLANTILLA_ANCHA = 'mercado_tarjeta_ancha';
/** La tarjeta de una TIENDA (el feed de seguidos): otra pantalla, otra tarjeta, mismo mecanismo. */
const PLANTILLA_TIENDA = 'mercado_tarjeta_tienda';
exports.PLANTILLA_TIENDA = PLANTILLA_TIENDA;
exports.PLANTILLA_ESTRECHA = PLANTILLA_ESTRECHA;
exports.PLANTILLA_ANCHA = PLANTILLA_ANCHA;

/**
 * **LAS PESTAÑAS DEL FEED** — el carril de arriba de Taobao (`推荐` · `关注`).
 *
 * No es lo mismo que el carril de categorías: este elige **qué feed** se ve; aquel filtra **dentro**
 * del feed. Hasta el 16/10/2026 aquí solo estaba el segundo, así que «Siguiendo» no tenía dónde
 * ponerse.
 */
const FEEDS = [
    { id: 'recomendado', etiqueta: 'Recomendado' },
    { id: 'siguiendo', etiqueta: 'Siguiendo' },
];
exports.FEEDS = FEEDS;

function datosDeFeeds(activoId) {
    const indice = Math.max(0, FEEDS.findIndex((f) => f.id === (activoId ?? 'recomendado')));
    return {
        feeds: FEEDS.map((f, i) => ({ id: f.id, etiqueta: f.etiqueta, activa: i === indice })),
        activo: FEEDS[indice].id,
    };
}
exports.datosDeFeeds = datosDeFeeds;

/** El árbol del carril de feed: las mismas `Pestanas` que las categorías. */
function arbolDeFeeds(tema, activo = 0) {
    const C = coloresDe(tema);
    return {
        tipo: 'Pestanas',
        valor: '$feeds',
        atributos: {
            [K.PADDING_LEFT]: 16,
            [K.PADDING_RIGHT]: 16,
            [PESTANAS.COLOR_SELECCIONADO]: C.texto,
            [PESTANAS.TAMANO_SELECCIONADO]: TAMANO_PESTANA_ACTIVA,
            [PESTANAS.INDICADOR]: true,
            [PESTANAS.INDICADOR_COLOR]: C.naranja,
            [PESTANAS.INDICADOR_TIPO]: 'smile',
            [PESTANAS.NEGRITA_SELECCIONADA]: true,
            [PESTANAS.ESPACIO]: ESPACIO_PESTANAS,
            [PESTANAS.SELECCIONADA]: Math.max(0, Math.trunc(activo)),
        },
    };
}
exports.arbolDeFeeds = arbolDeFeeds;

/** El árbol de SIGUIENDO: la lista de tiendas seguidas, con los widgets que ya existen. */

/**
 * LOS TIPOS DE TARJETA DEL FEED DE SIGUIENDO — **uno por variante**, clonados de Taobao.
 *
 * Están en el fichero puro compartido `components/ecomerse/seguirVariantes.ts` (y probados allí); aquí
 * van copiados porque este controlador es el paquete compilado y no puede importar del repositorio de
 * la app. **La paridad la comprueba el oráculo**, no la buena intención.
 */
const TIPOS_TARJETA = {
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
    AUTOPLAY: 'autoplay',
};
const PLANTILLA_SIGUIENDO = {
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
const ACCIONES_SIGUIENDO = {
    SEGUIR: 'ext:seguir',
    AVISAR: 'ext:avisar',
    REPRODUCIR: 'ext:reproducir',
    REFRESCAR: 'ext:refrescar',
    CARGAR_MAS: 'ext:cargarmas',
    PLEGAR: 'ext:plegar',
};
exports.TIPOS_TARJETA = TIPOS_TARJETA;
exports.PLANTILLA_SIGUIENDO = PLANTILLA_SIGUIENDO;
exports.ACCIONES_SIGUIENDO = ACCIONES_SIGUIENDO;

/** De los datos a las TARJETAS: **aquí vive "con todas sus variantes"** (igual que el .ts puro). */
/**
 * **La tarjeta, con su plantilla declarada.** El cliente elige con `elemento.templateName`; sin ese
 * campo pinta la PRIMERA plantilla de la lista para todas, y los textos que no existan en el dato salen
 * en blanco. Lo dice el contrato medido en Taobao: cada elemento del feed declara su `templateName`.
 */
function conPlantilla(tarjeta) {
    return { ...tarjeta, templateName: PLANTILLA_SIGUIENDO[tarjeta.tipo] ?? '' };
}

function tarjetasDeSiguiendo(datos) {
    /**
     * **La copia de cada variante vive CON la variante** (igual que en Taobao, donde el rótulo está
     * dentro de la plantilla: `new_empty_card` lleva su `title` y su 「刷新」). Si el texto lo pusiera
     * el cliente habría dos sitios donde cambiarlo; y si no lo pusiera nadie, saldría una tarjeta
     * vacía — que es lo que se vio en el móvil la primera vez.
     */
    const tiendas = Array.isArray(datos && datos.tiendas) ? datos.tiendas : [];
    if (datos && datos.sinRed) {
        return [conPlantilla({ tipo: TIPOS_TARJETA.SIN_RED, titulo: 'No pudimos cargar esto', texto: 'Revisa tu conexión y vuelve a intentarlo.', rotulo: 'Reintentar' })];
    }
    if (tiendas.length === 0) {
        return [conPlantilla({ tipo: TIPOS_TARJETA.VACIO, titulo: 'Aquí verás los directos de las tiendas que sigues', texto: 'Cuando sigas una tienda, sus directos aparecen aquí, en orden.', rotulo: 'Actualizar' })];
    }
    const tarjetas = [];
    const plegado = !(datos && datos.autoplayPlegado === false);
    tarjetas.push(conPlantilla({
        tipo: TIPOS_TARJETA.AUTOPLAY,
        plegado,
        estado: plegado ? 'Reproducción automática: plegada' : 'Reproducción automática: desplegada',
        rotulo: plegado ? 'Desplegar' : 'Plegar',
    }));
    tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.TITULO, titulo: (datos && datos.titulo) || 'Siguiendo' }));
    for (const t of tiendas) {
        // **Lo que trae hoy el backend son TIENDAS, no directos**: la variante que les toca es la
        // grande (portada + titulo + creador), con su boton para poder dejarlo. Las de directo
        // (enVivo / repeticion / anuncio) quedan disponibles para cuando el dato las traiga.
        if (t.anuncio) tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.ANUNCIO, ...t.anuncio, tienda: t.nombre, id: t.id }));
        else if (t.repeticion) tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.REPETICION, ...t }));
        else if (t.enVivo) tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.EN_VIVO, ...t }));
        else tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.GRANDE, ...t, rotuloSeguir: 'Siguiendo' }));
    }
    if (datos.recomendados && datos.recomendados.length) {
        tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.TITULO_RECOMENDADO, titulo: 'Basado en tus seguidos' }));
        for (const r of datos.recomendados) tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.RECOMENDADO, ...r }));
    }
    if (datos.grandes && datos.grandes.length) for (const g of datos.grandes) tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.GRANDE, ...g }));
    tarjetas.push(conPlantilla({ tipo: TIPOS_TARJETA.CARGAR_MAS, rotulo: 'Ver más directos' }));
    return tarjetas;
}
exports.tarjetasDeSiguiendo = tarjetasDeSiguiendo;

const tarjeta = (C_, hijos, extra = {}) => ({
  tipo: 'Contenedor',
  atributos: {
    [K.ORIENTATION]: 1,
    [K.BACKGROUNDCOLOR]: C_.tarjeta,
    [K.CORNERRADIUS]: REJILLA.RADIO,
    [K.PADDING_LEFT]: 10,
    [K.PADDING_RIGHT]: 10,
    [K.PADDING_TOP]: 10,
    [K.PADDING_BOTTOM]: 10,
    ...extra,
  },
  hijos,
});

const fila = (hijos, extra = {}) => ({
  tipo: 'Contenedor',
  atributos: { [K.ORIENTATION]: 0, ...extra },
  hijos,
});

/** Un botón de texto: lleva el id REAL del elemento y **qué hacer** (`ext:accion`). */
const boton = (rotulo, accion, color, extra = {}) => ({
  tipo: 'Texto',
  valor: rotulo,
  atributos: {
    [K.ONPRESS]: '$item.id',
    [CLAVE_ACCION]: accion,
    [K.TEXTSIZE]: 12,
    [K.TEXTCOLOR]: color,
    [K.PADDING_LEFT]: 10,
    [K.PADDING_RIGHT]: 10,
    [K.PADDING_TOP]: 4,
    [K.PADDING_BOTTOM]: 4,
    ...extra,
  },
});

/** La portada de un directo: la imagen y, encima, el botón de reproducir (no hay widget de vídeo). */
/**
 * La portada de un directo: la imagen **y el botón de reproducir al lado**.
 *
 * ⚠️ **Aquí NO hay vídeo, y se dice.** La tarjeta de Taobao lleva dentro un `live_card_playerview`
 * (el reproductor); nuestro contrato no tiene widget de vídeo, así que se manda **la portada y el
 * botón que dice qué haría** (`ext:reproducir`). Fingir un reproductor sería peor que un botón.
 */
const portada = (C_) => fila([
  {
    tipo: 'Imagen',
    valor: '$item.portada',
    atributos: { [K.LAYOUT_WIDTH]: -1, [K.LAYOUT_HEIGHT]: 180, [K.CORNERRADIUS]: REJILLA.RADIO },
  },
  {
    tipo: 'Icono',
    valor: 'Play',
    atributos: {
      [K.ONPRESS]: '$item.id',
      [CLAVE_ACCION]: ACCIONES_SIGUIENDO.REPRODUCIR,
      [K.TEXTCOLOR]: C_.texto,
      [K.LAYOUT_WIDTH]: 32,
      [K.LAYOUT_HEIGHT]: 32,
    },
  },
], { [K.BACKGROUNDCOLOR]: C_.fondo, [K.CORNERRADIUS]: REJILLA.RADIO });

/** La fila del creador: su avatar, su nombre y —si toca— el botón de seguir. */
const creador = (C_, conBoton) => fila([
  {
    tipo: 'Imagen',
    valor: '$item.avatar',
    atributos: { [K.LAYOUT_WIDTH]: 28, [CLAVE_ASPECTO]: 1, [K.CORNERRADIUS]: 14 },
  },
  texto('$item.creador', 12, C_.texto, { [K.PADDING_LEFT]: 8 }),
  ...(conBoton
    ? [boton('$item.rotuloSeguir', ACCIONES_SIGUIENDO.SEGUIR, C_.naranja)]
    : []),
], { [K.PADDING_TOP]: 8 });

function arbolDeSiguiendo(tema) {
  const C_ = coloresDe(tema);
  return {
    tipo: 'Lista',
    // **El feed son TARJETAS, no tiendas**: cada una trae su tipo y el tipo decide su plantilla.
    valor: '$tarjetas',
    atributos: {
      [LISTA.COLUMN_COUNT]: 1,
      [LISTA.ROW_SPACING]: 10,
      [K.PADDING_LEFT]: REJILLA.MARGEN,
      [K.PADDING_RIGHT]: REJILLA.MARGEN,
      [K.PADDING_TOP]: REJILLA.MARGEN_SUPERIOR,
    },
    hijos: [
      // ── 0 · `preplayback_foldmenu`: el ajuste de REPRODUCCIÓN AUTOMÁTICA, plegable ────────────
      // En Taobao es un menú que se pliega (`fold`/`unfold` en `engineStorageSet`) y va ARRIBA del
      // feed: es un ajuste del feed entero, no de una tarjeta. Aquí se manda su estado y su botón.
      tarjeta(C_, [
        fila([
          texto('$item.estado', 11, C_.secundario, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
          boton('$item.rotulo', ACCIONES_SIGUIENDO.PLEGAR, C_.secundario),
        ]),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.autoplay, [SPAN_TARJETA]: 1 }),

      // ── 1 · `common_title_card`: la tarjeta de TÍTULO ────────────────────────────────────────
      tarjeta(C_, [
        fila([
          texto('$item.titulo', 15, C_.texto, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
        ]),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.titulo, [SPAN_TARJETA]: 1 }),

      // ── 2 · `live_card` · variante EN VIVO ───────────────────────────────────────────────────
      tarjeta(C_, [
        portada(C_),
        fila([
          texto('$item.estado', 11, C_.naranja, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
          texto('$item.espectadores', 11, C_.secundario, { [K.PADDING_LEFT]: 8 }),
        ], { [K.PADDING_TOP]: 6 }),
        texto('$item.titulo', 14, C_.texto, { [K.PADDING_TOP]: 4 }),
        creador(C_, true),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.en_vivo, [SPAN_TARJETA]: 1, [K.ONPRESS]: '$item.id' }),

      // ── 3 · `live_card` · variante REPETICIÓN (Taobao: `replayExpire`) ───────────────────────
      tarjeta(C_, [
        portada(C_),
        fila([
          texto('$item.estado', 11, C_.secundario, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
          texto('$item.duracion', 11, C_.secundario, { [K.PADDING_LEFT]: 8 }),
        ], { [K.PADDING_TOP]: 6 }),
        texto('$item.titulo', 14, C_.texto, { [K.PADDING_TOP]: 4 }),
        creador(C_, false),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.repeticion, [SPAN_TARJETA]: 1, [K.ONPRESS]: '$item.id' }),

      // ── 4 · `live_card` + `newPreLiveInfo` · variante ANUNCIO (预约) ──────────────────────────
      // En Taobao, si el directo no ha empezado la tarjeta cambia de forma: título, hora y **预约**.
      tarjeta(C_, [
        fila([
          { tipo: 'Imagen', valor: '$item.portada', atributos: { [K.LAYOUT_WIDTH]: 64, [CLAVE_ASPECTO]: 1, [K.CORNERRADIUS]: REJILLA.RADIO } },
          {
            tipo: 'Contenedor',
            atributos: { [K.ORIENTATION]: 1, [K.WEIGHT]: 1, [K.PADDING_LEFT]: 10 },
            hijos: [
              texto('$item.titulo', 14, C_.texto, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
              texto('$item.empieza', 11, C_.secundario, { [K.PADDING_TOP]: 2 }),
            ],
          },
        ]),
        fila([
          texto('$item.creador', 12, C_.secundario, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
          boton('$item.rotuloAviso', ACCIONES_SIGUIENDO.AVISAR, C_.naranja),
        ], { [K.PADDING_TOP]: 8, [K.ORIENTATION]: 0 }),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.anuncio, [SPAN_TARJETA]: 1, [K.ONPRESS]: '$item.id' }),

      // ── 5 · `recommend_title`: el título de los recomendados («Basado en tus seguidos») ───────
      tarjeta(C_, [
        fila([
          texto('$item.titulo', 13, C_.texto, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
        ]),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.titulo_recomendado, [SPAN_TARJETA]: 1 }),

      // ── 6 · `live_card` + `recommendInfo` · variante RECOMENDADO ─────────────────────────────
      tarjeta(C_, [
        fila([
          { tipo: 'Imagen', valor: '$item.foto', atributos: { [K.LAYOUT_WIDTH]: 72, [CLAVE_ASPECTO]: 1, [K.CORNERRADIUS]: REJILLA.RADIO } },
          {
            tipo: 'Contenedor',
            atributos: { [K.ORIENTATION]: 1, [K.WEIGHT]: 1, [K.PADDING_LEFT]: 10 },
            hijos: [
              texto('$item.titulo', 13, C_.texto, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
              texto('$item.motivo', 11, C_.secundario, { [K.PADDING_TOP]: 2 }),
            ],
          },
        ]),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.recomendado, [SPAN_TARJETA]: 1, [K.ONPRESS]: '$item.id' }),

      // ── 7 · `sjsdbigfeed_card_2026`: la tarjeta GRANDE del feed (sin botón de seguir) ─────────
      tarjeta(C_, [
        portada(C_),
        fila([
          texto('$item.titulo', 14, C_.texto, { [K.PADDING_TOP]: 6 }),
        ]),
        fila([
          { tipo: 'Imagen', valor: '$item.avatar', atributos: { [K.LAYOUT_WIDTH]: 24, [CLAVE_ASPECTO]: 1, [K.CORNERRADIUS]: 12 } },
          texto('$item.creador', 11, C_.secundario, { [K.PADDING_LEFT]: 6, [K.PADDING_TOP]: 2 }),
          // El botón de dejar de seguir: en Taobao esta tarjeta no lo lleva (es la del feed de
          // recomendados), pero aquí el dato es una tienda que YA sigues, y sin botón no habría forma
          // de dejarla desde este feed.
          boton('$item.rotuloSeguir', ACCIONES_SIGUIENDO.SEGUIR, C_.naranja),
        ], { [K.PADDING_TOP]: 6 }),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.grande, [SPAN_TARJETA]: 1, [K.ONPRESS]: '$item.id' }),

      // ── 8 · `preplayback_loadmore`: el CARGAR MÁS del feed ───────────────────────────────────
      tarjeta(C_, [
        boton('$item.rotulo', ACCIONES_SIGUIENDO.CARGAR_MAS, C_.secundario),
      ], { [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.cargar_mas, [SPAN_TARJETA]: 1, [K.ONPRESS]: '$item.id' }),

      // ── 9 · `new_empty_card`: **vacío Y error de red en la misma tarjeta** ────────────────────
      // En Taobao es UNA plantilla con `isNetError` dentro: la ilustración (420×300) y 「刷新」. Aquí
      // el rótulo y el texto los pone el dato, así que la misma tarjeta sirve para las dos cosas.
      tarjeta(C_, [
        fila([
          texto('Aquí verás los directos de las tiendas que sigues', 15, C_.texto, { [K.PADDING_LEFT]: 2, [K.PADDING_TOP]: 2 }),
        ]),
        fila([
          texto('Cuando sigas una tienda, sus directos aparecen aquí, en orden.', 12, C_.secundario, { [K.PADDING_TOP]: 6 }),
        ]),
        boton('Actualizar', ACCIONES_SIGUIENDO.REFRESCAR, C_.naranja, { [K.PADDING_TOP]: 12 }),
      ], {
        [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.vacio,
        [SPAN_TARJETA]: 1,
        [K.PADDING_TOP]: 24,
        [K.PADDING_BOTTOM]: 24,
      }),

      // ── 10 · EL MISMO VACÍO, PERO DE RED (en Taobao es isNetError, dentro de la misma plantilla) ──
      // Dos estados, dos copias: la de arriba invita a seguir tiendas; esta dice que fallo la red y
      // ofrece reintentar. **No son el mismo mensaje con otro botón.**
      tarjeta(C_, [
        fila([
          texto('No pudimos cargar esto', 15, C_.texto, {}),
        ]),
        fila([
          texto('Revisa tu conexión y vuelve a intentarlo.', 12, C_.secundario, { [K.PADDING_TOP]: 6 }),
        ]),
        boton('Reintentar', ACCIONES_SIGUIENDO.REFRESCAR, C_.naranja, { [K.PADDING_TOP]: 12 }),
      ], {
        [TEMPLATE_NAME]: PLANTILLA_SIGUIENDO.sin_red,
        [SPAN_TARJETA]: 1,
        [K.PADDING_TOP]: 24,
        [K.PADDING_BOTTOM]: 24,
      }),
    ],
  };
}
exports.arbolDeSiguiendo = arbolDeSiguiendo;
async function datosDeSiguiendo(servicio, userId) {
    /**
     * **Sin sesión**: la tarjeta de vacío, que es una variante REAL de Taobao (no un hueco).
     */
    if (!userId) return { tarjetas: tarjetasDeSiguiendo(null) };
    try {
        /**
         * **En proceso, no por HTTP.** El servicio ya está inyectado en este controlador; llamarlo
         * aquí evita el viaje de ida y vuelta a la propia URL pública, que es lo que fallaba en el
         * móvil (salía «Reintentar» con la sesión válida).
         */
        const r = await servicio.tiendasSeguidas(userId);
        const tiendas = [];
        for (const s of (r && r.sellers ? r.sellers : [])) {
            /**
             * **La foto de la tienda es una CLAVE** (`products/….jpg`), no una URL: se firma con el
             * mismo camino que usa el resto del módulo. Antes se descartaba por no ser una URL, y por
             * eso ninguna tienda con foto enseñaba portada.
             */
            const foto = await servicio.urlDeFoto(s.photoKey);
            tiendas.push({
                id: String(s.id),
                nombre: s.businessName ?? 'Vendedor',
                creador: s.businessName ?? 'Vendedor',
                portada: foto,
                avatar: foto,
                anuncios: Number(s.anuncios ?? 0),
                ciudad: s.city ?? null,
                desde: s.since ?? null,
            });
        }
        return { tarjetas: tarjetasDeSiguiendo({ titulo: 'Siguiendo', tiendas }) };
    }
    catch (e) {
        // Falló de verdad: la variante de error de red, con su «Reintentar».
        servicio?.log?.warn?.('siguiendo: no se pudo leer la lista: ' + ((e && e.message) || e));
        return { tarjetas: tarjetasDeSiguiendo({ sinRed: true }) };
    }
}

function consultaDeCatalogo({ departamento, familia, buscar, orden } = {}) {
    const q = {};
    if (departamento) q.department = String(departamento);
    if (familia) q.family = String(familia);
    const t = typeof buscar === 'string' ? buscar.trim() : '';
    if (t) q.q = t;
    q.sort = orden ? String(orden) : SORT_POR_DEFECTO;
    return q;
}
exports.consultaDeCatalogo = consultaDeCatalogo;

/**
 * LA BARRA DE PESTAÑAS de las categorías, en la forma de Taobao: allí es la **sección** `categoryTab`
 * (pestañas en `content.tabs[]`, tema en `style.styleData.tabs`). Aquí el tipo es `Pestanas` —cuyo
 * alias ES `categoryTab`— y los datos van por `valor`, como en la `Lista`.
 */
function arbolDeCategorias(tema, activa = 0) {
    const C = coloresDe(tema);
    return {
        tipo: 'Pestanas',
        valor: '$categorias',
        atributos: {
            [K.LAYOUT_WIDTH]: -1,
            [K.BACKGROUNDCOLOR]: C.tarjeta,
            [K.PADDING_LEFT]: 16,
            [K.PADDING_RIGHT]: 16,
            [K.TEXTCOLOR]: C.secundario,
            [K.TEXTSIZE]: TAMANO_PESTANA,
            [PESTANAS.COLOR_SELECCIONADO]: C.texto,
            [PESTANAS.TAMANO_SELECCIONADO]: TAMANO_PESTANA_ACTIVA,
            [PESTANAS.INDICADOR]: true,
            [PESTANAS.INDICADOR_COLOR]: C.naranja,
            // **`smile`: el subrayado curvo de Taobao** (`tabIndicatorType: "smile"`), pintado con
            // píxeles nuestros (una cápsula): sus arcos son imágenes de su CDN y no se copian.
            [PESTANAS.INDICADOR_TIPO]: 'smile',
            [PESTANAS.NEGRITA_SELECCIONADA]: true,
            [PESTANAS.ESPACIO]: ESPACIO_PESTANAS,
            // El alto de la imagen de una pestaña: en Taobao `imageTabHeightAp` = 31.
            [PESTANAS.ALTO_IMAGEN]: 31,
            [PESTANAS.SELECCIONADA]: Math.max(0, Math.trunc(activa)),
        },
    };
}
exports.arbolDeCategorias = arbolDeCategorias;

/** ¿Este texto es una URL con la que se pueda pintar una imagen? */
const esUrlDeImagen = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
exports.esUrlDeImagen = esUrlDeImagen;

/**
 * Los datos de la barra: **las categorías REALES** que devuelve el servicio (departamentos activos,
 * por `sort_order`). La primera pestaña es **Recomendado** con `id: ''` = «sin filtro».
 *
 * ⚠️ **Los emojis NO se mandan**: medido en las 12 pestañas de la portada de Taobao, el rótulo es
 * TEXTO y el icono —cuando lo hay— es un PNG de 92x80 (`labelImg`) con su ubicación, su hueco y su
 * proporción. El icono del departamento solo viaja si es **una URL**; hoy guarda un emoji, así que las
 * pestañas salen de texto, que es lo que son 7 de las 12 de Taobao.
 */
function datosDeCategorias(departamentos) {
    if (!Array.isArray(departamentos) || departamentos.length === 0) return null;
    const categorias = departamentos
        .filter((d) => d && d.id)
        .map((d) => {
            const icono = typeof d.icon === 'string' ? d.icon : '';
            return {
                id: String(d.id),
                etiqueta: String(d.label ?? ''),
                ...(esUrlDeImagen(icono)
                    ? { imagen: icono, imagenactiva: icono, ubicacion: 'right', separacion: 10, aspecto: 1.15 }
                    : {}),
            };
        });
    if (categorias.length === 0) return null;
    return { categorias: [{ id: '', etiqueta: 'Recomendado' }, ...categorias] };
}
exports.datosDeCategorias = datosDeCategorias;

/**
 * LA REJILLA: **una `Lista` con DOS plantillas**, y cada elemento dice cuál usa.
 *
 * En Taobao la tarjeta ancha **es OTRA TARJETA**, y se midió: en el feed de descubrimiento
 * (`live_flexalocal/discovery_video_list_new.json`) la misma lista trae **11 elementos con
 * `taolive_discovery_feed_live_v2` y 1 con `taolive_discovery_feed_goods_card_v2`**, cada elemento
 * nombrando la suya (`templateName`). El `span` viaja en la **entrada de plantilla**
 * (`{name, span, url4Android}`), o sea que el ancho es del diseño.
 *
 * La estrecha va **primera** a propósito: es la que se usa cuando un elemento no dice su plantilla.
 */
function arbolDeRejilla(tema) {
    const C = coloresDe(tema);
    return {
        tipo: 'Lista',
        valor: '$fichas',
        atributos: {
            [LISTA.COLUMN_COUNT]: REJILLA.COLUMNAS,
            [LISTA.COLUMN_SPACING]: REJILLA.HUECO,
            [LISTA.ROW_SPACING]: REJILLA.HUECO,
            [K.PADDING_LEFT]: REJILLA.MARGEN,
            [K.PADDING_RIGHT]: REJILLA.MARGEN,
            [K.PADDING_TOP]: REJILLA.MARGEN_SUPERIOR,
        },
        hijos: [
            tarjetaDeRejilla(C, { nombre: PLANTILLA_ESTRECHA, span: 1, tamanoTitulo: 12 }),
            tarjetaDeRejilla(C, { nombre: PLANTILLA_ANCHA, span: 2, tamanoTitulo: 14 }),
        ],
    };
}
exports.arbolDeRejilla = arbolDeRejilla;

/**
 * LOS DATOS — la forma contra la que se resuelven los bindings del árbol
 * (`$item.titulo`, `$item.precioXaf`, `$item.foto`, `$item.tieneFotos`).
 *
 * **Los nombres de estos campos son el contrato con el árbol**: si se cambia uno aquí, hay que
 * cambiarlo en `arbolDeFranja`.
 *
 * `excluir` quita el producto que se está mirando: **«también te puede interesar» no eres tú.**
 */
/** Un producto del catálogo, en la forma contra la que se resuelven los bindings del árbol. */
function fichaDeProducto(p) {
    return {
        id: p.id,
        titulo: p.title,
        precioXaf: p.priceXaf,
        // El host de fotos puede estar caído: se manda igual y el widget `Imagen` enseña su marcador
        // de fallo en vez de un hueco en blanco. Es justo para lo que existe ese marcador.
        foto: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0] : '',
        // `0` es falsy, así que el condicional no pinta «Con fotos». No hace falta ninguna regla
        // especial: la verdad del árbol es la de JavaScript, con una excepción declarada (un array
        // vacío cuenta como NO).
        tieneFotos: Array.isArray(p.photos) ? p.photos.length : 0,
    };
}
exports.fichaDeProducto = fichaDeProducto;

function datosDeDestacados(productos, excluir) {
    if (!Array.isArray(productos) || productos.length === 0) return null;
    const lista = excluir ? productos.filter((p) => p.id !== excluir) : productos;
    if (lista.length === 0) return null;
    return { destacados: lista.slice(0, 10).map(fichaDeProducto) };
}
exports.datosDeDestacados = datosDeDestacados;

/**
 * ¿A ESTA FICHA LE TOCA LA TARJETA ANCHA?
 *
 * En Taobao el `span` —y por tanto la tarjeta— lo trae la **entrada de plantilla** (31 de 41 anchas en
 * el catálogo de seguidos): el ancho es una decisión del DISEÑO. El Mercado no tiene plantillas por
 * tarjeta elegidas a mano, así que se ancla en **lo que sí es un dato real suyo**:
 *
 *   1. **`isFeatured`** — el «destacado» del Mercado (con su `featuredUntil`): lo destacado va a lo
 *      ancho, que es el análogo directo de la tarjeta grande de Taobao.
 *   2. **Más de una foto** — una tarjeta con galería necesita el ancho para enseñarla.
 *
 * **Si no hay ningún destacado ni ninguna ficha con varias fotos, la rejilla sale uniforme**: no se
 * inventa una mezcla que los datos no piden.
 */
function tarjetaAnchaPara(p) {
    const fotos = Array.isArray(p.photos) ? p.photos.length : 0;
    return p.isFeatured === true || fotos > 1;
}
exports.tarjetaAnchaPara = tarjetaAnchaPara;

/**
 * Los datos de la rejilla: **el catálogo REAL en una sola lista**, cada ficha diciendo **qué tarjeta
 * usa** (`templateName`).
 *
 * El ancho NO viaja aquí: **el `span` es de la plantilla**, como en Taobao (`{name, span, url}`). El
 * reparto en filas lo hace el cliente (`filasPorSpan`) con lo que diga la plantilla elegida.
 */
function datosDeRejilla(productos, limite = 40) {
    if (!Array.isArray(productos) || productos.length === 0) return null;
    const fichas = productos.slice(0, limite).map((p) => ({
        ...fichaDeProducto(p),
        [TEMPLATE_NAME]: tarjetaAnchaPara(p) ? PLANTILLA_ANCHA : PLANTILLA_ESTRECHA,
    }));
    if (fichas.length === 0) return null;
    return { fichas, total: fichas.length };
}
exports.datosDeRejilla = datosDeRejilla;
exports.datosDeDestacados = datosDeDestacados;

/**
 * La UI del Mercado: dos franjas, una por pantalla.
 *
 * **Los datos salen del servicio REAL** (`EcomerseService.catalog`), no de un stub: una franja de
 * ejemplo en producción es peor que ninguna franja, porque nadie sabría que es falsa. Y no hay
 * consulta nueva: es la misma que alimenta el catálogo, así que no puede desviarse de él.
 *
 * Una franja que no se puede montar **no es un fallo del Mercado entero**: se responde 200 con
 * `arbol: null` (contrato: «no hay nada que pintar») y la pantalla sigue igual.
 */

// ─────────────────── v2 · PANEL DE REJILLA (categorías) ───────────────────
/**
 * Geometría **MEDIDA** en la app real (`docs/RE-关注-TIENDAS.md` §3): celda 98,7×34,7 dp · columnas
 * en x 18,3 / 130,7 / 243 · hueco horizontal 13,7 · paso vertical 42,3 · primera fila y=242.
 *
 * **No hace falta ningún tipo nuevo**: `Lista` de 3 columnas + celda `Contenedor` + `Texto`.
 */
// `gravity` del motor, MEDIDO: CLAVES_LAYOUT.GRAVITY = d35754e84f6522f6; 4 = center.
const GRAVEDAD_CENTRO = 'd35754e84f6522f6';
// `margen izquierdo` del motor, MEDIDO: `CLAVES_LAYOUT.MARGIN_LEFT` = f3477b9719b6f213. No está en la
// copia `K` del controlador, y la paridad lo exige idéntico en los dos servidores.
const MARGEN_IZQUIERDO = 'f3477b9719b6f213';
const PANEL_V2 = Object.freeze({
    COLUMNAS: 3,
    HUECO_COLUMNA: 13.7,
    HUECO_FILA: 7.6,
    MARGEN: 18.3,
    ALTO_CELDA: 34.7,
    RADIO: 8,
    TAMANO: 13,
    SEPARACION_TITULO: 10,
});
function celdaDePanel(C) {
    return {
        tipo: 'Contenedor',
        atributos: {
            [TEMPLATE_NAME]: 'panel_celda',
            [K.ORIENTATION]: 1,
            [GRAVEDAD_CENTRO]: 4,
            [K.BACKGROUNDCOLOR]: C.tarjeta,
            [K.CORNERRADIUS]: PANEL_V2.RADIO,
            [K.LAYOUT_HEIGHT]: PANEL_V2.ALTO_CELDA,
            [K.ONPRESS]: '$item.id',
        },
        hijos: [texto('$item.nombre', PANEL_V2.TAMANO, C.texto)],
    };
}
function arbolDePanelCategorias(tema) {
    const C = coloresDe(tema);
    return {
        tipo: 'Contenedor',
        atributos: {
            [K.LAYOUT_WIDTH]: -1,
            [K.ORIENTATION]: 1,
            [K.BACKGROUNDCOLOR]: C.fondo,
            [K.PADDING_TOP]: 4,
        },
        hijos: [
            texto('Categorías', 15, C.texto, {
                [K.PADDING_BOTTOM]: PANEL_V2.SEPARACION_TITULO,
                [K.PADDING_LEFT]: PANEL_V2.MARGEN,
            }),
            {
                // **El margen va en un Contenedor**: la `Lista` no aplica `PADDING_*` (en el móvil las
                // celdas salieron de 111 dp en vez de 98,7). Con el contenedor, las columnas recuperan
                // (360 − 2·18,3 − 2·13,7) / 3 = 98,67 dp.
                tipo: 'Contenedor',
                atributos: {
                    [K.LAYOUT_WIDTH]: -1,
                    [K.PADDING_LEFT]: PANEL_V2.MARGEN,
                    [K.PADDING_RIGHT]: PANEL_V2.MARGEN,
                },
                hijos: [
                    {
                        tipo: 'Lista',
                        valor: '$categorias',
                        atributos: {
                            [LISTA.COLUMN_COUNT]: PANEL_V2.COLUMNAS,
                            [LISTA.COLUMN_SPACING]: PANEL_V2.HUECO_COLUMNA,
                            [LISTA.ROW_SPACING]: PANEL_V2.HUECO_FILA,
                        },
                        hijos: [celdaDePanel(C)],
                    },
                ],
            },
        ],
    };
}
function datosDePanelCategorias(departamentos) {
    if (!Array.isArray(departamentos) || departamentos.length === 0)
        return null;
    const categorias = departamentos
        .filter((d) => d && d.id)
        .map((d) => ({ id: String(d.id), nombre: String(d.label ?? d.name ?? '') }));
    return categorias.length ? { categorias } : null;
}
exports.PANEL_V2 = PANEL_V2;
exports.arbolDePanelCategorias = arbolDePanelCategorias;
exports.datosDePanelCategorias = datosDePanelCategorias;


// ─────────────────── v2 · CARRIL DE FILTROS ───────────────────
/**
 * Geometría MEDIDA (pastilla 50×28,7 dp con texto de 24,7 dentro): alto 28,7 · relleno 12,6 · hueco
 * 5,7 · margen 18,3 (alineado con el panel). Decisiones declaradas: radio 8 y color de selección.
 */
const FILTROS_V2 = Object.freeze({
    ALTO_PASTILLA: 28.7,
    RADIO: 8,
    RELLENO_H: 12.6,
    HUECO: 5.7,
    TAMANO: 14,
    MARGEN: 18.3,
    PAD_V: 6,
});
/** Sólo los filtros que el Mercado tiene de verdad (买过/特别关注/常逛/分组 no existen aquí). */
const FILTROS = Object.freeze([
    { id: 'todos', nombre: '全部' },
    { id: 'categorias', nombre: '分类', caret: true },
]);
function pastillaDeFiltro(C, { id, nombre, caret }, activo, primera) {
    return {
        tipo: 'Contenedor',
        atributos: {
            [TEMPLATE_NAME]: 'filtro_pastilla',
            [K.ORIENTATION]: 0,
            [GRAVEDAD_CENTRO]: 4,
            [K.LAYOUT_HEIGHT]: FILTROS_V2.ALTO_PASTILLA,
            [K.PADDING_LEFT]: FILTROS_V2.RELLENO_H,
            [K.PADDING_RIGHT]: FILTROS_V2.RELLENO_H,
            [K.MARGIN_RIGHT]: FILTROS_V2.HUECO, [MARGEN_IZQUIERDO]: primera ? FILTROS_V2.MARGEN : 0,
            [K.CORNERRADIUS]: FILTROS_V2.RADIO,
            [K.BACKGROUNDCOLOR]: activo ? C.naranja : C.tarjeta,
            // ID LITERAL: no hay `$item` en un carril fijo. Con `$item.id` el toque llegaría vacío.
            [K.ONPRESS]: id,
        },
        hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO, activo ? C.tarjeta : C.secundario)],
    };
}
function arbolDeFiltros(tema, activa = '') {
    const C = coloresDe(tema);
    const elegida = String(activa || 'todos');
    const hijos = [
        {
            tipo: 'Scroll',
            atributos: {
                [K.ORIENTATION]: 0,
                [K.LAYOUT_WIDTH]: -1,
                [K.PADDING_LEFT]: FILTROS_V2.MARGEN,
                [K.PADDING_TOP]: FILTROS_V2.PAD_V,
                [K.PADDING_BOTTOM]: FILTROS_V2.PAD_V,
            },
            hijos: FILTROS.map((f, i) => pastillaDeFiltro(C, f, elegida === f.id, i === 0)),
        },
    ];
    if (elegida === 'categorias')
        hijos.push(...arbolDePanelCategorias(tema).hijos);
    return {
        tipo: 'Contenedor',
        atributos: {
            [K.LAYOUT_WIDTH]: -1,
            [K.ORIENTATION]: 1,
            [K.BACKGROUNDCOLOR]: C.fondo,
        },
        hijos,
    };
}
function datosDeFiltros(activa = '') {
    return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa || 'todos') };
}
exports.FILTROS_V2 = FILTROS_V2;
exports.FILTROS = FILTROS;
exports.arbolDeFiltros = arbolDeFiltros;
exports.datosDeFiltros = datosDeFiltros;
/**
 * Los datos de la sección COMPUESTA: si el árbol trae el panel, sus categorías tienen que viajar con él.
 * Sin esto la `Lista` se queda sin elementos y se pinta una sección vacía sin ningún error (pasó en el
 * móvil: fila, título y nada debajo).
 */
function datosDeFiltrosCompuestos(activa, departamentos) {
    const datos = datosDeFiltros(activa);
    if (String(activa || '') === 'categorias') {
        Object.assign(datos, datosDePanelCategorias(departamentos) ?? {});
    }
    return datos;
}
exports.datosDeFiltrosCompuestos = datosDeFiltrosCompuestos;

exports.FILTROS_V2 = FILTROS_V2;
exports.FILTROS = FILTROS;
exports.arbolDeFiltros = arbolDeFiltros;
exports.datosDeFiltros = datosDeFiltros;
/**
 * Los datos de la sección COMPUESTA: si el árbol trae el panel, sus categorías tienen que viajar con él.
 * Sin esto la `Lista` se queda sin elementos y se pinta una sección vacía sin ningún error (pasó en el
 * móvil: fila, título y nada debajo).
 */
function datosDeFiltrosCompuestos(activa, departamentos) {
    const datos = datosDeFiltros(activa);
    if (String(activa || '') === 'categorias') {
        Object.assign(datos, datosDePanelCategorias(departamentos) ?? {});
    }
    return datos;
}
exports.datosDeFiltrosCompuestos = datosDeFiltrosCompuestos;
let EcomerseUiController = class EcomerseUiController {
    constructor(ecomerse) {
        this.ecomerse = ecomerse;
        this.log = new common_1.Logger(EcomerseUiController.name);
    }

    /** La franja de la portada. `tema` lo pone el cliente con el modo del sistema. */
    async home(tema) {
        try {
            // `catalog()` devuelve los productos ACTIVOS de tiendas ACTIVAS (hasta 200, con su
            // `LIMIT` propio) y ya viene mapeado: `id`, `title`, `priceXaf`, `photos`.
            const productos = await this.ecomerse.catalog({});
            const datos = datosDeDestacados(productos);
            // **`arbol: null` es un estado legítimo del contrato**, no un error: «no hay nada que
            // pintar». El cliente no pinta la sección y el resto del Mercado sigue igual.
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDeFranja('Del servidor', tema), datos };
        } catch (e) {
            // **Se responde 200 con `arbol: null`, no un 500.** Un 500 sólo llenaría el log de
            // errores que no lo son: sin catálogo (o con la bandera `ECOMMERSE_F1_ENABLED` en
            // false) la franja simplemente no se pinta.
            this.log.warn(`no se pudo montar la franja de la portada: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }

    /** La franja de la ficha de producto: «también te puede interesar». */
    async detail(id, tema) {
        try {
            const productos = await this.ecomerse.catalog({});
            // El producto que se está mirando se EXCLUYE: no se recomienda a sí mismo.
            const datos = datosDeDestacados(productos, id ? String(id) : undefined);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDeFranja('También te puede interesar', tema), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar la franja de la ficha: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }

    /**
     * v2 · EL PANEL DE REJILLA. Las categorías del Mercado en la geometría MEDIDA de Taobao
     * (3 columnas, celda 98,7×34,7 dp, huecos 13,7 / 7,6). Ver `docs/RE-关注-TIENDAS.md` §3.
     * **Sin categorías, `arbol: null`**: el panel no se pinta y la pantalla sigue.
     */
    async v2Categorias(tema) {
        try {
            const departamentos = await this.ecomerse.categories();
            const datos = datosDePanelCategorias(departamentos);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDePanelCategorias(tema), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar el panel de categorias: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }
    /**
     * v2 · EL CARRIL DE FILTROS. Sólo los filtros que el Mercado tiene de verdad (`全部`, y `分类`
     * que abre el panel). Taobao tiene además 买过 · 特别关注 · 常逛 · 分组: aquí no existen y por eso
     * no se pintan — una pastilla que no filtra nada sería mentira.
     *
     * **`?activa=categorias` compone el panel en el MISMO árbol**: es el servidor el que decide qué
     * secciones hay, no la pantalla.
     */
    async v2Filtros(tema, activa) {
        try {
            // **Los datos son de la sección que se compone**: con el panel en el árbol, sus categorías
            // tienen que venir también o la Lista se queda sin elementos (se pintó vacía: fila y
            // título, y nada debajo).
            // **Los datos son de la sección que se compone**: ver `datosDeFiltrosCompuestos`.
            const datos = datosDeFiltrosCompuestos(activa, await this.ecomerse.categories());
            return {
                esquema: ESQUEMA_UI,
                arbol: arbolDeFiltros(tema, activa),
                datos,
            };
        } catch (e) {
            this.log.warn(`no se pudo montar el carril de filtros: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }
    /**
     * LA BARRA DE CATEGORÍAS. Salen del servicio (`categories()`), que es la MISMA fuente que el
     * listado del Mercado: **no hay dos verdades sobre qué departamentos existen**.
     *
     * `activa` es el id que el cliente trae filtrado: el índice de la pestaña elegida **sale de los
     * datos**, así que el árbol se monta con ellos (mismo orden que Taobao: llega la lista y con ella
     * cuál está seleccionada).
     */
    async categorias(tema, activa) {
        try {
            const departamentos = await this.ecomerse.categories();
            const datos = datosDeCategorias(departamentos);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            const indice = activa ? Math.max(0, datos.categorias.findIndex((c) => c.id === String(activa))) : 0;
            return { esquema: ESQUEMA_UI, arbol: arbolDeCategorias(tema, indice), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar la barra de categorias: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }

    /**
     * LA REJILLA: el catálogo en dos columnas, con las dos tarjetas y **con los filtros de la
     * pantalla aplicados**. **El catálogo es el mismo que el del listado**, así que no puede
     * desviarse: mismos filtros, mismo orden por defecto, misma fuente.
     *
     * `departamento`, `familia`, `buscar` y `orden` son los de la SECCIÓN; la traducción a la API vive
     * en `consultaDeCatalogo`.
     */
    async rejilla(tema, departamento, familia, buscar, orden) {
        try {
            const productos = await this.ecomerse.catalog(consultaDeCatalogo({ departamento, familia, buscar, orden }));
            const datos = datosDeRejilla(productos);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDeRejilla(tema), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar la rejilla: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }

    /**
     * EL CARRIL DE FEED (`Recomendado` · `Siguiendo`).
     *
     * El árbol se monta con los datos porque **la pestaña activa sale de ellos**, igual que en el
     * carril de categorías. No necesita sesión: qué feeds existen no es de nadie.
     */
    async feeds(tema, activo) {
        const datos = datosDeFeeds(activo);
        const indice = Math.max(0, datos.feeds.findIndex((f) => f.activa));
        return { esquema: ESQUEMA_UI, arbol: arbolDeFeeds(tema, indice), datos };
    }

    /**
     * EL FEED DE SIGUIENDO: las tiendas que sigue el usuario. **Datos de quien pregunta.**
     *
     * Reenvía la cabecera `Authorization` al API, que es el único que sabe de quién son. Si no hay
     * cabecera, o el servicio no contesta, devuelve **«nada»** (`arbol: null`): la pantalla enseña su
     * vacío, que hoy es la verdad — el endpoint de seguidos todavía no existe en el backend.
     *
     * **Y por eso esta ruta NO se cachea en público** (ver el `Cache-Control: private, no-store` de su
     * decorador): una respuesta con las tiendas de alguien, en una caché compartida, la ve el siguiente.
     */
    async siguiendo(tema, _authorization, u) {
        try {
            const datos = await datosDeSiguiendo(this.ecomerse, u && u.userId ? String(u.userId) : null);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDeSiguiendo(tema), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar el feed de seguidos: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }
};
exports.EcomerseUiController = EcomerseUiController;
__decorate([
    (0, common_1.Get)('home'),
    // El árbol es una constante y los datos cambian poco: una caché corta en el borde quita casi
    // todas las peticiones sin que nadie vea datos viejos de verdad. **Y el tema no la rompe**,
    // porque viaja en la URL (`?tema=oscuro`): cada modo es una respuesta distinta.
    (0, common_1.Header)('Cache-Control', 'public, max-age=30'),
    __param(0, (0, common_1.Query)('tema')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "home", null);
__decorate([
    (0, common_1.Get)('detail'),
    // **Sin `Cache-Control` a propósito**: el `id` entra en el cálculo (se excluye de la lista), así
    // que no es la misma respuesta para todos. Copiar el `max-age` de `home` sería cachear una
    // respuesta por producto bajo una sola URL.
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('tema')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "detail", null);
__decorate([
    (0, common_1.Get)('rejilla'),
    // El árbol es constante y el catálogo cambia poco: la misma caché corta que `home`. El tema
    // viaja en la URL, así que cada modo es una respuesta distinta y la caché no los mezcla.
    (0, common_1.Header)('Cache-Control', 'public, max-age=30'),
    __param(0, (0, common_1.Query)('tema')),
    // **Los filtros de la pantalla viajan a la sección**: la rejilla servida tiene que enseñar el
    // MISMO catálogo filtrado que el listado, o sustituirlo sería una regresión.
    __param(1, (0, common_1.Query)('departamento')),
    __param(2, (0, common_1.Query)('familia')),
    __param(3, (0, common_1.Query)('buscar')),
    __param(4, (0, common_1.Query)('orden')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "rejilla", null);
    __decorate([
        (0, common_1.Get)('v2-categorias'),
        // Las categorías cambian poco: la misma caché corta y pública que la barra de categorías.
        (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
        __param(0, (0, common_1.Query)('tema')),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [String]),
        __metadata("design:returntype", Promise)
    ], EcomerseUiController.prototype, "v2Categorias", null);
__decorate([
    (0, common_1.Get)('v2-filtros'),
    // El árbol depende de `activa`, que viaja en la URL: cada selección es una respuesta distinta.
    (0, common_1.Header)('Cache-Control', 'public, max-age=30'),
    __param(0, (0, common_1.Query)('tema')),
    __param(1, (0, common_1.Query)('activa')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "v2Filtros", null);
__decorate([
    (0, common_1.Get)('categorias'),
    // El árbol de categorías lo mantiene el administrador y cambia poco: una caché corta en el borde
    // quita casi todas las peticiones sin que nadie vea categorías de ayer por la tarde.
    (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
    __param(0, (0, common_1.Query)('tema')),
    __param(1, (0, common_1.Query)('activa')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "categorias", null);
__decorate([
    (0, common_1.Get)('feeds'),
    // Qué feeds existen y cuál está activo no cambia casi nunca: la misma caché corta y pública que
    // el carril de categorías. **El tema viaja en la URL**, así que cada modo es una respuesta.
    (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
    __param(0, (0, common_1.Query)('tema')),
    __param(1, (0, common_1.Query)('activo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "feeds", null);
__decorate([
    (0, common_1.Get)('siguiendo'),
    /**
     * **`private, no-store`, y no es rendimiento.** Esta respuesta es de QUIEN PREGUNTA: las tiendas que
     * sigue. En una caché compartida —aunque fuera de un segundo— se le servirían al siguiente que
     * preguntara, y eso no se arregla con un `max-age` corto: se arregla no guardándola.
     */
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    __param(0, (0, common_1.Query)('tema')),
    // La cabecera del usuario, tal cual: el API es el único que sabe de quién son los seguidos.
    __param(1, (0, common_1.Headers)('authorization')),
    __param(2, (0, guards_1.OptionalUser)()),
    (0, common_1.UseGuards)(guards_1.OptionalJwtGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "siguiendo", null);
exports.EcomerseUiController = EcomerseUiController = __decorate([
    (0, common_1.Controller)('ecomerse/ui'),
    __metadata("design:paramtypes", [ecomerse_service_1.EcomerseService])
], EcomerseUiController);
