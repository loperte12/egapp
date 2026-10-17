// Rebanada 2 del v2 · EL CARRIL DE FILTROS (pastillas) + el panel al elegir «分类».
//
// Geometría MEDIDA en la app real (`docs/RE-关注-TIENDAS.md` §3 + volcado `-dump-feed.xml`):
//   · pastilla 50 × 28,7 dp (con el texto de 24,7 dentro) → alto 28,7 · relleno horizontal 12,6
//   · hueco entre pastillas ≈ 5,7 dp · la fila empieza en x=11,7 y va pegada a los filtros de arriba
//   · la pastilla elegida se resalta; en Taobao el resaltado es naranja suave (color exacto NO medido)
// Dos decisiones declaradas: el radio de la pastilla (8) y el color de selección (naranja de marca con
// texto blanco), porque el volcado no trae ni radio ni color.
//
// **No sube el esquema**: `Scroll` + `Contenedor` + `Texto` + `Lista` ya existen.
import { readFileSync, writeFileSync } from 'node:fs';

const FILTROS_LOCAL = `
// ─────────────────── v2 · CARRIL DE FILTROS ───────────────────
/**
 * Geometría MEDIDA (pastilla 50×28,7 dp con texto de 24,7 dentro): alto **28,7**, relleno horizontal
 * **12,6**, hueco entre pastillas **5,7**, y la fila alineada con el margen del panel (**18,3**).
 *
 * **Decisiones declaradas** (el volcado no las trae): radio 8 y color de selección — naranja de marca
 * con texto blanco en la activa, tarjeta con texto secundario en las demás.
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

/**
 * Los filtros, **sólo los que el Mercado tiene de verdad**. Taobao tiene además 买过 · 特别关注 · 常逛 ·
 * 分组, y no se pintan porque aquí no existen: una pastilla que no filtra nada sería mentira.
 */
const FILTROS = Object.freeze([
  { id: '', nombre: '全部' },
  { id: 'categorias', nombre: '分类', caret: true },
]);

function pastillaDeFiltro(C, { id, nombre, caret }, activo) {
  return {
    tipo: 'Contenedor',
    atributos: {
      [TEMPLATE_NAME]: 'filtro_pastilla',
      [K.ORIENTATION]: 0,
      [GRAVEDAD_CENTRO]: 4,
      [K.LAYOUT_HEIGHT]: FILTROS_V2.ALTO_PASTILLA,
      [K.PADDING_LEFT]: FILTROS_V2.RELLENO_H,
      [K.PADDING_RIGHT]: FILTROS_V2.RELLENO_H,
      [K.MARGIN_RIGHT]: FILTROS_V2.HUECO,
      [K.CORNERRADIUS]: FILTROS_V2.RADIO,
      [K.BACKGROUNDCOLOR]: activo ? C.naranja : C.tarjeta,
      [K.ONPRESS]: '$item.id',
    },
    hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO, activo ? C.tarjeta : C.secundario)],
  };
}

function arbolDeFiltros(tema, activa = '') {
  const C = coloresDe(tema);
  const elegida = String(activa ?? '');
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
      hijos: FILTROS.map((f) => pastillaDeFiltro(C, f, elegida === f.id)),
    },
  ];
  // **La sección que se pide decide qué hay.** Elegir «分类» hace aparecer el panel; es el servidor quien
  // compone, no la pantalla (que sigue sin saber qué widgets hay).
  if (elegida === 'categorias') hijos.push(...arbolDePanelCategorias(tema).hijos);
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
  return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa ?? '') };
}
`;

const FILTROS_CONTROLADOR = `
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
    { id: '', nombre: '全部' },
    { id: 'categorias', nombre: '分类', caret: true },
]);
function pastillaDeFiltro(C, { id, nombre, caret }, activo) {
    return {
        tipo: 'Contenedor',
        atributos: {
            [TEMPLATE_NAME]: 'filtro_pastilla',
            [K.ORIENTATION]: 0,
            [GRAVEDAD_CENTRO]: 4,
            [K.LAYOUT_HEIGHT]: FILTROS_V2.ALTO_PASTILLA,
            [K.PADDING_LEFT]: FILTROS_V2.RELLENO_H,
            [K.PADDING_RIGHT]: FILTROS_V2.RELLENO_H,
            [K.MARGIN_RIGHT]: FILTROS_V2.HUECO,
            [K.CORNERRADIUS]: FILTROS_V2.RADIO,
            [K.BACKGROUNDCOLOR]: activo ? C.naranja : C.tarjeta,
            [K.ONPRESS]: '$item.id',
        },
        hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO, activo ? C.tarjeta : C.secundario)],
    };
}
function arbolDeFiltros(tema, activa = '') {
    const C = coloresDe(tema);
    const elegida = String(activa ?? '');
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
            hijos: FILTROS.map((f) => pastillaDeFiltro(C, f, elegida === f.id)),
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
    return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa ?? '') };
}
exports.FILTROS_V2 = FILTROS_V2;
exports.FILTROS = FILTROS;
exports.arbolDeFiltros = arbolDeFiltros;
exports.datosDeFiltros = datosDeFiltros;
`;

// ── 1 · servidor local ────────────────────────────────────────────────────────────────────────
{
  const F = 'D:/egapp/tools/servidor-ui.mjs';
  let t = readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
  if (t.includes('arbolDeFiltros')) {
    console.log('local: ya estaba');
  } else {
    const anclaModulo = 'const servidor = createServer((req, res) => {';
    if (!t.includes(anclaModulo)) throw new Error('local: sin ancla createServer');
    t = t.replace(anclaModulo, FILTROS_LOCAL + '\n' + anclaModulo);

    const anclaCat = "  '/api/ecomerse/ui/v2-categorias': (p) => ({";
    if (!t.includes(anclaCat)) throw new Error('local: sin ancla v2-categorias');
    t = t.replace(anclaCat, [
      '  // v2 · el CARRIL DE FILTROS: pastillas medidas; `?activa=categorias` hace aparecer el panel.',
      "  '/api/ecomerse/ui/v2-filtros': (p) => ({",
      "    arbol: arbolDeFiltros(p.get('tema'), p.get('activa') ?? ''),",
      "    buscarDatos: () => datosDeFiltros(p.get('activa') ?? ''),",
      '  }),',
      '',
      anclaCat,
    ].join('\n'));

    const anclaExp = 'arbolDePanelCategorias, datosDePanelCategorias, PANEL_V2,';
    if (!t.includes(anclaExp)) throw new Error('local: sin ancla de exports');
    t = t.replace(anclaExp, anclaExp + ' arbolDeFiltros, datosDeFiltros, FILTROS_V2, FILTROS,');
    writeFileSync(F, t);
    console.log('local: filtros añadidos (árbol + datos + ruta + exports)');
  }
}

// ── 2 · controlador desplegado ───────────────────────────────────────────────────────────────
{
  const F = 'D:/egapp/.auditoria-servicios/backend/dist/src/ecomerse/ecomerse-ui.controller.js';
  let t = readFileSync(F, 'utf8').replace(/\r\n/g, '\n');
  if (t.includes('arbolDeFiltros')) {
    console.log('controlador: ya estaba');
  } else {
    const anclaClase = 'let EcomerseUiController = class EcomerseUiController {';
    if (!t.includes(anclaClase)) throw new Error('controlador: sin ancla de clase');
    t = t.replace(anclaClase, FILTROS_CONTROLADOR + '\n' + anclaClase);

    const anclaMetodo = '    /**\n     * LA BARRA DE CATEGORÍAS.';
    if (!t.includes(anclaMetodo)) throw new Error('controlador: sin ancla de método');
    const metodo = [
      '    /**',
      '     * v2 · EL CARRIL DE FILTROS. Sólo los filtros que el Mercado tiene de verdad (`全部`, y `分类`',
      '     * que abre el panel). Taobao tiene además 买过 · 特别关注 · 常逛 · 分组: aquí no existen y por eso',
      '     * no se pintan — una pastilla que no filtra nada sería mentira.',
      '     *',
      '     * **`?activa=categorias` compone el panel en el MISMO árbol**: es el servidor el que decide qué',
      '     * secciones hay, no la pantalla.',
      '     */',
      '    async v2Filtros(tema, activa) {',
      '        try {',
      '            return {',
      '                esquema: ESQUEMA_UI,',
      '                arbol: arbolDeFiltros(tema, activa),',
      '                datos: datosDeFiltros(activa),',
      '            };',
      '        } catch (e) {',
      '            this.log.warn(`no se pudo montar el carril de filtros: ${(e && e.message) || e}`);',
      '            return { esquema: ESQUEMA_UI, arbol: null };',
      '        }',
      '    }',
      '',
    ].join('\n');
    t = t.replace(anclaMetodo, metodo + anclaMetodo);

    const anclaDeco = "__decorate([\n    (0, common_1.Get)('categorias'),";
    if (!t.includes(anclaDeco)) throw new Error('controlador: sin ancla de decorador');
    const deco = [
      '__decorate([',
      "    (0, common_1.Get)('v2-filtros'),",
      '    // El árbol depende de `activa`, que viaja en la URL: cada selección es una respuesta distinta.',
      "    (0, common_1.Header)('Cache-Control', 'public, max-age=30'),",
      "    __param(0, (0, common_1.Query)('tema')),",
      "    __param(1, (0, common_1.Query)('activa')),",
      '    __metadata("design:type", Function),',
      '    __metadata("design:paramtypes", [String, String]),',
      '    __metadata("design:returntype", Promise)',
      '], EcomerseUiController.prototype, "v2Filtros", null);',
      '',
    ].join('\n');
    t = t.replace(anclaDeco, deco + anclaDeco);

    const anclaExp = 'exports.datosDePanelCategorias = datosDePanelCategorias;';
    if (!t.includes(anclaExp)) throw new Error('controlador: sin ancla de exports');
    t = t.replace(anclaExp, anclaExp + '\nexports.FILTROS_V2 = FILTROS_V2;\nexports.FILTROS = FILTROS;\nexports.arbolDeFiltros = arbolDeFiltros;\nexports.datosDeFiltros = datosDeFiltros;');
    writeFileSync(F, t);
    console.log('controlador: filtros añadidos (árbol + datos + método + decorador + exports)');
  }
}
