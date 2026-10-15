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
exports.EcomerseUiController = exports.CLAVES_UI = exports.ESQUEMA_UI = exports.ARBOL_RELACIONADOS = exports.ARBOL_DESTACADOS = exports.TEMAS = exports.TEMA_POR_DEFECTO = exports.coloresDe = exports.arbolDeCategorias = exports.datosDeCategorias = exports.PESTANAS = exports.ESPACIO_PESTANAS = exports.arbolDeRejilla = exports.tarjetaDeRejilla = exports.accionDeTarjeta = exports.ACCIONES = exports.CLAVE_ACCION = exports.fichaDeProducto = exports.datosDeRejilla = exports.arbolDeFranja = exports.datosDeDestacados = void 0;
const common_1 = require("@nestjs/common");
const ecomerse_service_1 = require("./ecomerse.service");

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
const ACCIONES = { FAVORITO: 'ext:favorito', CARRITO: 'ext:carrito' };
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
 * En la franja la tarjeta mide 132 porque el ancho lo fija la densidad de un carrusel. En una
 * columna del waterfall **el ancho lo pone la columna** (`WEIGHT: 1`): una tarjeta con ancho fijo
 * dentro de una columna elástica deja hueco a un lado.
 */
function tarjetaDeRejilla(C) {
    return {
        tipo: 'Contenedor',
        atributos: {
            [K.ORIENTATION]: 1,
            [K.BACKGROUNDCOLOR]: C.tarjeta,
            [K.CORNERRADIUS]: 10,
            [K.MARGIN_BOTTOM]: 10,
            [K.ONPRESS]: '$item.id',
        },
        hijos: [
            { tipo: 'Imagen', valor: '$item.foto', atributos: { [K.LAYOUT_HEIGHT]: 150, [K.CORNERRADIUS]: 10 } },
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
 * LA BARRA DE PESTAÑAS de las categorías, en la forma de Taobao: allí es la **sección** `categoryTab`
 * (pestañas en `content.tabs[]`, tema en `style.styleData.tabs`). Aquí el tipo es `Pestanas` —cuyo
 * alias ES `categoryTab`— y los datos van por `valor`, como en la `Lista`.
 */
function arbolDeCategorias(tema) {
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
            [PESTANAS.INDICADOR_TIPO]: 'line',
            [PESTANAS.NEGRITA_SELECCIONADA]: true,
            [PESTANAS.ESPACIO]: ESPACIO_PESTANAS,
            // La primera es «Recomendado» (id `''`), como abre hoy el listado del Mercado.
            [PESTANAS.SELECCIONADA]: 0,
        },
    };
}
exports.arbolDeCategorias = arbolDeCategorias;

/**
 * Los datos de la barra: **las categorías REALES** que devuelve el servicio (departamentos activos,
 * por `sort_order`). La primera pestaña es **Recomendado** con `id: ''` = «sin filtro», que es lo que
 * hace el carril del listado. **No se inventa ni un departamento.**
 */
function datosDeCategorias(departamentos) {
    if (!Array.isArray(departamentos) || departamentos.length === 0) return null;
    const categorias = departamentos
        .filter((d) => d && d.id)
        .map((d) => ({ id: String(d.id), etiqueta: String(d.label ?? ''), emoji: typeof d.icon === 'string' && d.icon ? d.icon : '' }));
    if (categorias.length === 0) return null;
    return { categorias: [{ id: '', etiqueta: 'Recomendado', emoji: '' }, ...categorias] };
}
exports.datosDeCategorias = datosDeCategorias;

/**
 * LA REJILLA, en la forma de Taobao: **dos `Lista` en fila con los datos repartidos.**
 *
 * Taobao **no tiene un widget de waterfall**: tiene `DXRecyclerLayout`, y una franja de dos columnas
 * se monta con **dos listas en un contenedor de fila** (el mismo patrón que la franja horizontal,
 * con `ORIENTATION: 1` en vez de `0`). `WEIGHT: 1` reparte el ancho (`flex: 1`), así que las dos
 * columnas salen del vocabulario que ya existe.
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
 * Los datos de la rejilla: **el catálogo repartido en dos columnas, alternando**.
 *
 * Alternar deja las dos columnas **igualadas por número**, que con tarjetas de la misma altura —el
 * caso de hoy— es exactamente equilibrado y no exige estimar alturas. *(Taobao sí las estima,
 * porque sus tarjetas varían de alto.)*
 *
 * Se reparte **lo mismo que se enseña**: si se repartiera una lista y se pintara otra, dos productos
 * se quedarían fuera sin que nadie lo notara.
 */
function datosDeRejilla(productos, limite = 40) {
    if (!Array.isArray(productos) || productos.length === 0) return null;
    const fichas = productos.slice(0, limite).map(fichaDeProducto);
    const columnaA = fichas.filter((_, i) => i % 2 === 0);
    const columnaB = fichas.filter((_, i) => i % 2 === 1);
    if (columnaA.length === 0) return null;
    return { columnaA, columnaB, total: fichas.length };
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
     * LA BARRA DE CATEGORÍAS. Salen del servicio (`categories()`), que es la MISMA fuente que el
     * listado del Mercado: **no hay dos verdades sobre qué departamentos existen**.
     */
    async categorias(tema) {
        try {
            const departamentos = await this.ecomerse.categories();
            const datos = datosDeCategorias(departamentos);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDeCategorias(tema), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar la barra de categorias: ${(e && e.message) || e}`);
            return { esquema: ESQUEMA_UI, arbol: null };
        }
    }

    /**
     * LA REJILLA: el catálogo en dos columnas, en la forma de Taobao (dos `Lista` en fila con los
     * datos repartidos). **El catálogo es el mismo que el del listado**, así que no puede desviarse.
     */
    async rejilla(tema) {
        try {
            const productos = await this.ecomerse.catalog({});
            const datos = datosDeRejilla(productos);
            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };
            return { esquema: ESQUEMA_UI, arbol: arbolDeRejilla(tema), datos };
        } catch (e) {
            this.log.warn(`no se pudo montar la rejilla: ${(e && e.message) || e}`);
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
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "rejilla", null);
__decorate([
    (0, common_1.Get)('categorias'),
    // El árbol de categorías lo mantiene el administrador y cambia poco: una caché corta en el borde
    // quita casi todas las peticiones sin que nadie vea categorías de ayer por la tarde.
    (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
    __param(0, (0, common_1.Query)('tema')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EcomerseUiController.prototype, "categorias", null);
exports.EcomerseUiController = EcomerseUiController = __decorate([
    (0, common_1.Controller)('ecomerse/ui'),
    __metadata("design:paramtypes", [ecomerse_service_1.EcomerseService])
], EcomerseUiController);
