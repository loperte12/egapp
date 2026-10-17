// Rebanada 1 del v2 · el PANEL DE REJILLA (categorías), en los DOS servidores.
//
// Correcciones respecto al primer intento, y por qué:
//  1. En el servidor local, `const RUTAS = {` vive DENTRO del manejador de peticiones (`createServer`),
//     así que el bloque debe ir a **ámbito de módulo**, antes de `const servidor = createServer(...)`.
//     Si va dentro, los `export` de abajo fallan («PANEL_V2 is not defined in module»).
//  2. El controlador tiene saltos **CRLF**: se normaliza el fichero a LF antes de buscar anclas.
//
// No sube el esquema: `Contenedor` + `Texto` + `Lista` ya existen (CONTRATO-UI.md §3.1).
import { readFileSync, writeFileSync } from 'node:fs';

const PANEL_LOCAL = `
// ─────────────────── v2 · PANEL DE REJILLA (categorías) ───────────────────
/**
 * La geometría del panel, **MEDIDA en la app real** (\`docs/RE-关注-TIENDAS.md\` §3): celda
 * 98,7×34,7 dp · columnas en x 18,3 / 130,7 / 243 · hueco horizontal 13,7 · paso vertical 42,3
 * (hueco 7,6) · primera fila en y=242.
 *
 * **No hace falta ningún tipo nuevo**: \`Lista\` de 3 columnas + celda \`Contenedor\` + \`Texto\`. Por eso
 * el esquema NO sube (CONTRATO-UI.md §3.1: una plantilla nueva con tipos existentes es compatible).
 */
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

/** Una celda: fondo de tarjeta, radio, el alto medido y el rótulo centrado. */
function celdaDePanel(C) {
  return {
    tipo: 'Contenedor',
    atributos: {
      [TEMPLATE_NAME]: 'panel_celda',
      [K.ORIENTATION]: 1,
      // 4 = \`center\` en el enum de gravedad del motor (9 posiciones, medido).
      [K.GRAVITY]: 4,
      [K.BACKGROUNDCOLOR]: C.tarjeta,
      [K.CORNERRADIUS]: PANEL_V2.RADIO,
      [K.LAYOUT_HEIGHT]: PANEL_V2.ALTO_CELDA,
      [K.ONPRESS]: '$item.id',
    },
    hijos: [texto('$item.nombre', PANEL_V2.TAMANO, C.texto, { [K.TEXTGRAVITY]: 1 })],
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
      [K.PADDING_LEFT]: PANEL_V2.MARGEN,
      [K.PADDING_RIGHT]: PANEL_V2.MARGEN,
      [K.PADDING_TOP]: 4,
    },
    hijos: [
      texto('Categorías', 15, C.texto, { [K.PADDING_BOTTOM]: PANEL_V2.SEPARACION_TITULO }),
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
  };
}

/** Los datos: los departamentos REALES (18), sin la pestaña «Recomendado», que no es una categoría. */
async function datosDePanelCategorias() {
  const respuesta = await fetch(CATEGORIAS);
  if (!respuesta.ok) return null;
  const departamentos = await respuesta.json();
  if (!Array.isArray(departamentos) || departamentos.length === 0) return null;
  const categorias = departamentos
    .filter((d) => d && d.id)
    .map((d) => ({ id: String(d.id), nombre: String(d.label ?? d.name ?? '') }));
  return categorias.length ? { categorias } : null;
}
`;

const PANEL_CONTROLADOR = `
// ─────────────────── v2 · PANEL DE REJILLA (categorías) ───────────────────
/**
 * Geometría **MEDIDA** en la app real (\`docs/RE-关注-TIENDAS.md\` §3): celda 98,7×34,7 dp · columnas
 * en x 18,3 / 130,7 / 243 · hueco horizontal 13,7 · paso vertical 42,3 · primera fila y=242.
 *
 * **No hace falta ningún tipo nuevo**: \`Lista\` de 3 columnas + celda \`Contenedor\` + \`Texto\`.
 */
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
            [K.GRAVITY]: 4,
            [K.BACKGROUNDCOLOR]: C.tarjeta,
            [K.CORNERRADIUS]: PANEL_V2.RADIO,
            [K.LAYOUT_HEIGHT]: PANEL_V2.ALTO_CELDA,
            [K.ONPRESS]: '$item.id',
        },
        hijos: [texto('$item.nombre', PANEL_V2.TAMANO, C.texto, { [K.TEXTGRAVITY]: 1 })],
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
            [K.PADDING_LEFT]: PANEL_V2.MARGEN,
            [K.PADDING_RIGHT]: PANEL_V2.MARGEN,
            [K.PADDING_TOP]: 4,
        },
        hijos: [
            texto('Categorías', 15, C.texto, { [K.PADDING_BOTTOM]: PANEL_V2.SEPARACION_TITULO }),
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
`;

// ── 1 · servidor local ────────────────────────────────────────────────────────────────────────
{
  const F = 'D:/egapp/tools/servidor-ui.mjs';
  let t = readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
  if (t.includes('arbolDePanelCategorias')) {
    console.log('local: ya estaba');
  } else {
    // 1.a · el bloque, a ÁMBITO DE MÓDULO: antes del `createServer` (RUTAS vive dentro del manejador).
    const anclaModulo = 'const servidor = createServer((req, res) => {';
    if (!t.includes(anclaModulo)) throw new Error('local: sin ancla del createServer');
    t = t.replace(anclaModulo, PANEL_LOCAL + '\n' + anclaModulo);

    // 1.b · la ruta
    const anclaRej = "  '/api/ecomerse/ui/rejilla': (p) => ({";
    if (!t.includes(anclaRej)) throw new Error('local: sin ancla rejilla');
    t = t.replace(anclaRej, [
      '  // v2 · el PANEL DE REJILLA: las categorías en 3 columnas, geometría medida (RE-关注-TIENDAS §3).',
      "  '/api/ecomerse/ui/v2-categorias': (p) => ({",
      "    arbol: arbolDePanelCategorias(p.get('tema')),",
      '    buscarDatos: () => datosDePanelCategorias(),',
      '  }),',
      '',
      anclaRej,
    ].join('\n'));

    // 1.c · los exports
    const anclaExp = 'arbolDeCategorias, datosDeCategorias,';
    if (!t.includes(anclaExp)) throw new Error('local: sin ancla de exports');
    t = t.replace(anclaExp, anclaExp + ' arbolDePanelCategorias, datosDePanelCategorias, PANEL_V2,');
    writeFileSync(F, t);
    console.log('local: panel añadido (árbol + datos + ruta + exports)');
  }
}

// ── 2 · controlador desplegado ───────────────────────────────────────────────────────────────
{
  const F = 'D:/egapp/.auditoria-servicios/backend/dist/src/ecomerse/ecomerse-ui.controller.js';
  let t = readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
  if (t.includes('arbolDePanelCategorias')) {
    console.log('controlador: ya estaba');
  } else {
    const anclaClase = 'let EcomerseUiController = class EcomerseUiController {';
    if (!t.includes(anclaClase)) throw new Error('controlador: sin ancla de clase');
    t = t.replace(anclaClase, PANEL_CONTROLADOR + '\n' + anclaClase);

    const anclaMetodo = '    /**\n     * LA BARRA DE CATEGORÍAS.';
    if (!t.includes(anclaMetodo)) throw new Error('controlador: sin ancla del método categorias');
    const metodo = [
      '    /**',
      '     * v2 · EL PANEL DE REJILLA. Las categorías del Mercado en la geometría MEDIDA de Taobao',
      '     * (3 columnas, celda 98,7×34,7 dp, huecos 13,7 / 7,6). Ver `docs/RE-关注-TIENDAS.md` §3.',
      '     * **Sin categorías, `arbol: null`**: el panel no se pinta y la pantalla sigue.',
      '     */',
      '    async v2Categorias(tema) {',
      '        try {',
      '            const departamentos = await this.ecomerse.categories();',
      '            const datos = datosDePanelCategorias(departamentos);',
      '            if (!datos) return { esquema: ESQUEMA_UI, arbol: null };',
      '            return { esquema: ESQUEMA_UI, arbol: arbolDePanelCategorias(tema), datos };',
      '        } catch (e) {',
      '            this.log.warn(`no se pudo montar el panel de categorias: ${(e && e.message) || e}`);',
      '            return { esquema: ESQUEMA_UI, arbol: null };',
      '        }',
      '    }',
      '',
    ].join('\n');
    t = t.replace(anclaMetodo, metodo + anclaMetodo);

    const anclaDeco = "__decorate([\n    (0, common_1.Get)('categorias'),";
    if (!t.includes(anclaDeco)) throw new Error('controlador: sin ancla del decorador de categorias');
    const deco = [
      '    __decorate([',
      "        (0, common_1.Get)('v2-categorias'),",
      '        // Las categorías cambian poco: la misma caché corta y pública que la barra de categorías.',
      "        (0, common_1.Header)('Cache-Control', 'public, max-age=60'),",
      "        __param(0, (0, common_1.Query)('tema')),",
      '        __metadata("design:type", Function),',
      '        __metadata("design:paramtypes", [String]),',
      '        __metadata("design:returntype", Promise)',
      '    ], EcomerseUiController.prototype, "v2Categorias", null);',
      '',
    ].join('\n');
    t = t.replace(anclaDeco, deco + anclaDeco);
    writeFileSync(F, t);
    console.log('controlador: panel añadido (árbol + datos + método + decorador)');
  }
}
