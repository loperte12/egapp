// Cerrar la geometría del panel: el margen de 18,3 va en un CONTENEDOR que envuelve la rejilla.
//
// Por qué así: `Lista` no aplica `PADDING_*` (en el móvil las celdas salieron de 111 dp en vez de 98,7).
// `Contenedor` sí lo aplica. Con el margen en el contenedor, las tres columnas dan
// (360 − 2·18,3 − 2·13,7) / 3 = 98,67 dp, que es lo medido.
//
// La función se reemplaza ENTERA localizando su bloque por recuento de llaves: no depende de la sangría
// de cada servidor (el local usa 2 espacios y el controlador 4).
import { readFileSync, writeFileSync } from 'node:fs';

const LOCAL = `
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
        // **El margen va en un Contenedor**: la \`Lista\` no aplica \`PADDING_*\` (en el móvil las celdas
        // salieron de 111 dp en vez de 98,7). Con el contenedor, las columnas recuperan
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
`;

const CONTROLADOR = `
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
                // **El margen va en un Contenedor**: la \`Lista\` no aplica \`PADDING_*\` (en el móvil las
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
`;

function reemplazarFuncion(texto, nueva) {
  const ancla = 'function arbolDePanelCategorias(tema) {';
  const inicio = texto.indexOf(ancla);
  if (inicio < 0) throw new Error('sin la función arbolDePanelCategorias');
  // Cierre del bloque por recuento de llaves (el cuerpo no tiene llaves en cadenas).
  let fin = -1;
  let nivel = 0;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') nivel++;
    else if (c === '}') {
      nivel--;
      if (nivel === 0) { fin = i + 1; break; }
    }
  }
  if (fin < 0) throw new Error('no cerré la función');
  const salto = texto.includes('\r\n') ? '\r\n' : '\n';
  return texto.slice(0, inicio) + nueva.trim().replace(/\n/g, salto) + texto.slice(fin);
}

for (const [ruta, nueva] of [
  ['D:/egapp/tools/servidor-ui.mjs', LOCAL],
  ['D:/egapp/.auditoria-servicios/backend/dist/src/ecomerse/ecomerse-ui.controller.js', CONTROLADOR],
]) {
  const antes = readFileSync(ruta, 'utf8');
  const despues = reemplazarFuncion(antes, nueva);
  writeFileSync(ruta, despues);
  console.log('reemplazada: ' + ruta.split('/').pop());
}
