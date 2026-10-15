/**
 * Pantalla de prueba · la ficha del Mercado pintada desde un ÁRBOL
 * =================================================================
 *
 * **Fichero nuevo. No toca `ecomerse-detail.tsx` ni ningún fichero vuestro.**
 *
 * ## Qué prueba
 *
 * Que los 9 componentes y el renderizador **funcionan juntos en una pantalla real**, con datos
 * reales de la API.
 *
 * **Y prueba el CONTRATO**, no solo los componentes: `arbolDeProducto()` es **una función de
 * producto → árbol**, que es **exactamente lo que va a hacer el servidor**. Cuando el backend
 * exista, **esta función se borra y el árbol llega por la red** — el resto no cambia.
 *
 * ```
 * HOY     ecomerseApi.product(id) → arbolDeProducto(p) → <Renderizador/>
 * MAÑANA  ecomerseApi.product(id) → (el servidor ya manda el árbol) → <Renderizador/>
 * ```
 *
 * ## Por qué el árbol se escribe así
 *
 * **Las claves se IMPORTAN de los módulos, no se teclean.** Ni un hex a mano: si una clave
 * estuviera mal, este fichero tendría el mismo error que el componente y **no lo detectaría**.
 *
 * **Y los colores de texto salen del tema**, no del árbol: un árbol con colores de tema claro
 * es invisible en modo oscuro.
 *
 * ## Cómo verla
 *
 * ```
 * npx expo start          (o  npm run web)
 * ```
 * Y navegar a `/ecomerse-arbol`, o `/ecomerse-arbol?id=<id-de-producto>`.
 * **Sin `id` se coge el primero del catálogo público.**
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { espaciado, tipografia, useTheme } from '@egrouteplan/ui-kit';

import { ecomerseApi, type EcomerseProduct } from '../api/ecomerse';
import { formatXAF } from '../utils/formatHelpers';
import { Renderizador, type Diagnostico, type NodoArbol } from '../components/ecomerse/Renderizador';
import { Texto } from '../components/ecomerse/Texto';
import { CLAVES_LAYOUT } from '../components/ecomerse/contenedorAtributos';
import { CLAVES_TEXTO } from '../components/ecomerse/textoAtributos';
import { CLAVES_DXIMAGEVIEW } from '../components/ecomerse/imagenAtributos';
import { CLAVES_LISTA } from '../components/ecomerse/listaAtributos';
import { CLAVES_ENTRADA } from '../components/ecomerse/entradaAtributos';
import { CLAVES_PRECIO } from '../components/ecomerse/precioAtributos';

/** Los colores de texto, del tema de la app. **No del árbol.** */
interface Tema {
  texto: string;
  textoSuave: string;
}

/**
 * **La función que el servidor hará.** Producto → árbol de UI.
 *
 * Está aquí, en el cliente, **solo mientras el backend no existe**. Es el paso 1 de la
 * migración: probar que las piezas funcionan antes de que haya servidor que mande el árbol.
 */
function arbolDeProducto(p: EcomerseProduct, t: Tema): NodoArbol {
  const L = CLAVES_LAYOUT;
  const T = CLAVES_TEXTO;
  const I = CLAVES_DXIMAGEVIEW;

  return {
    tipo: 'Scroll',
    atributos: { [L.ORIENTATION]: 1 }, // vertical
    hijos: [
      // ── la foto ────────────────────────────────────────────────────────────
      {
        tipo: 'Imagen',
        id: 'foto',
        valor: p.photos?.[0] ?? undefined,
        atributos: {
          [I.SCALETYPE]: 2, // centerCrop — el más usado en Taobao (345 veces)
          [L.LAYOUT_WIDTH]: -1, // match_parent
          [L.LAYOUT_HEIGHT]: 300,
        },
      },

      // ── el bloque de texto ─────────────────────────────────────────────────
      {
        tipo: 'Contenedor',
        id: 'datos',
        atributos: { [L.ORIENTATION]: 1, [L.PADDING_LEFT]: 16, [L.PADDING_RIGHT]: 16, [L.PADDING_TOP]: 12 },
        hijos: [
          {
            tipo: 'Texto',
            id: 'precio',
            valor: formatXAF(p.priceXaf),
            atributos: { [T.TEXTSIZE]: 24, [T.TEXTCOLOR]: '#FFFF5000', [T.ISBOLD]: 1 },
          },
          {
            tipo: 'Texto',
            id: 'titulo',
            valor: p.title,
            atributos: {
              [T.TEXTSIZE]: 16,
              [T.TEXTCOLOR]: t.texto,
              [T.LINEBREAKMODE]: 3, // end → ellipsizeMode="tail"
              [T.MAXLINES]: 2,
              [L.MARGIN_TOP]: 6,
            },
          },
          // ciudad y stock, en una fila. **El `MARGIN_LEFT` de cada texto lo aplica la caja
          // compartida** — antes sólo lo leía `Contenedor`, y salía «Malabo1 disponibles» pegado.
          {
            tipo: 'Contenedor',
            id: 'meta',
            atributos: { [L.ORIENTATION]: 0, [L.GRAVITY]: 1, [L.MARGIN_TOP]: 8 },
            hijos: [
              { tipo: 'Icono', valor: 'nd_logistics', atributos: { [T.TEXTSIZE]: 14, [T.TEXTCOLOR]: t.textoSuave } },
              {
                tipo: 'Texto',
                valor: p.city,
                atributos: { [T.TEXTSIZE]: 13, [T.TEXTCOLOR]: t.textoSuave, [L.MARGIN_LEFT]: 4 },
              },
              {
                tipo: 'Texto',
                valor: p.stock > 0 ? `${p.stock} disponibles` : 'Agotado',
                atributos: {
                  [T.TEXTSIZE]: 13,
                  [T.TEXTCOLOR]: p.stock > 0 ? t.textoSuave : '#FFFF000A',
                  [L.MARGIN_LEFT]: 12,
                },
              },
            ],
          },
        ],
      },

      // ── la descripción ─────────────────────────────────────────────────────
      {
        tipo: 'Contenedor',
        id: 'descripcion',
        atributos: {
          [L.MARGIN_TOP]: 8,
          [L.PADDING_LEFT]: 16,
          [L.PADDING_RIGHT]: 16,
          [L.PADDING_TOP]: 12,
          [L.PADDING_BOTTOM]: 12,
        },
        hijos: p.description
          ? [{
              tipo: 'Texto',
              valor: p.description,
              atributos: {
                [T.TEXTSIZE]: 14,
                [T.TEXTCOLOR]: t.texto,
                [T.MAXLINES]: 6,
                [T.LINEBREAKMODE]: 3,
                [T.LINEHEIGHT]: 21,
              },
            }]
          : [{
              tipo: 'Texto',
              valor: 'El vendedor no escribió descripción.',
              atributos: { [T.TEXTSIZE]: 14, [T.TEXTCOLOR]: t.textoSuave },
            }],
      },
    ],
  };
}

/**
 * La pantalla.
 */
export default function EcomerseArbol() {
  const [lista, setLista] = useState<EcomerseProduct[]>([]);
  // **El estado de la entrada vive AQUÍ, en la pantalla, no en el árbol.** El árbol lo declara
  // (`$borrador`), el componente lo pinta, y `alCambiarTexto` trae lo escrito de vuelta.
  const [borrador, setBorrador] = useState('');
  const { colors } = useTheme();
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [producto, setProducto] = useState<EcomerseProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [diag, setDiag] = useState<Diagnostico | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);

    // Sin `id` se coge el primero del catálogo público. **Es una comodidad**, y en cuanto el
    // servidor mande el árbol deja de hacer falta.
    // Sin `id` se trae una pagina del catalogo para poder ELEGIR. **Antes cogia el primero y
    // ya: asi no habia forma de llegar a un producto con fotos, y la galeria nunca se probo.**
    if (!id) {
      ecomerseApi.catalog({ limit: '12' })
        .then((xs) => { if (vivo) { setLista(xs); setCargando(false); } })
        .catch(() => { if (vivo) { setError('No se pudo cargar el catalogo.'); setCargando(false); } });
      return () => { vivo = false; };
    }

    const obtener = id
      ? ecomerseApi.product(id)
      : ecomerseApi.catalog({ limit: '1' }).then((xs) => {
          const primero = xs[0];
          if (!primero) throw new Error('catálogo vacío');
          return primero;
        });

    obtener
      .then((p) => { if (vivo) { setProducto(p); setError(null); } })
      .catch(() => { if (vivo) setError('No se pudo cargar el producto.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id]);

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ── EL SELECTOR ───────────────────────────────────────────────────────────────────────────
  // Sin `id`, una lista para elegir. **Existe porque hacia falta**: no habia manera de llegar a
  // un producto CON FOTOS, asi que la galeria del arbol nunca llego a pintar una imagen.
  if (!id) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: espaciado.e16 }}>
        <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e8 }}>
          Elige un producto · {lista.length} en el catalogo · los que tienen fotos lo dicen
        </Text>
        {/*
          ── LA ENTRADA, COMO ÁRBOL ────────────────────────────────────────────────────────
          **El ciclo completo en una pantalla**: el árbol declara el valor (`$borrador`), la
          PANTALLA lo posee (`useState`), y `alCambiarTexto` trae lo escrito de vuelta. El `Texto`
          de abajo lo enseña — si el eco sigue al teclado, el puente funciona.

          Por qué así y no con el estado dentro del componente: un `TextInput` que se controla a
          sí mismo y además recibe un valor de fuera **se pelea consigo mismo** — cada tecla hace
          `setState` en dos sitios y en un multilínea el cursor salta al final.
        */}
        <View style={{ paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e8 }}>
          <Renderizador
            testID="entrada-arbol"
            datos={{ borrador }}
            alCambiarTexto={(_nombre, valor) => setBorrador(valor)}
            arbol={{
              tipo: 'Contenedor',
              atributos: { [CLAVES_LAYOUT.ORIENTATION]: 1 },
              hijos: [
                {
                  tipo: 'Texto',
                  valor: 'La entrada de abajo la pinta el árbol:',
                  atributos: { [CLAVES_TEXTO.TEXTSIZE]: 12, [CLAVES_TEXTO.TEXTCOLOR]: colors.textSecondary, [CLAVES_LAYOUT.MARGIN_BOTTOM]: 6 },
                },
                {
                  tipo: 'Entrada',
                  valor: '$borrador',
                  atributos: {
                    // El nombre del evento sale del ATRIBUTO, como el toque sale de `EVENT_TAP`.
                    [CLAVES_ENTRADA.ONCHANGE]: 'escribir',
                    [CLAVES_ENTRADA.PLACEHOLDER]: 'Escribe aquí y mira el eco…',
                    [CLAVES_ENTRADA.PLACEHOLDERCOLOR]: colors.textSecondary,
                    [CLAVES_TEXTO.TEXTCOLOR]: colors.textPrimary,
                    [CLAVES_TEXTO.TEXTSIZE]: 15,
                    // Los dos widgets: `ISSINGLELINE` es de `DXTEXTINPUTVIEW` y sale invertido.
                    [CLAVES_ENTRADA.ISSINGLELINE]: 0,
                    [CLAVES_ENTRADA.MULTILINEMAXHEIGHT]: 70,
                    [CLAVES_ENTRADA.MAXLENGTH]: 120,
                    // Y el contador `12/120`, que es de `ISSHOWHINTNUM`.
                    [CLAVES_ENTRADA.ISSHOWHINTNUM]: 1,
                  },
                  hijos: [],
                },
                {
                  tipo: 'Texto',
                  valor: '$borrador',
                  atributos: { [CLAVES_TEXTO.TEXTSIZE]: 12, [CLAVES_TEXTO.TEXTCOLOR]: colors.textSecondary, [CLAVES_LAYOUT.MARGIN_TOP]: 4 },
                },
              ],
            }}
          />
        </View>
        {/*
          ── EL SELECTOR ENTERO, PINTADO POR EL ÁRBOL ───────────────────────────────────────
          **Esto sustituye al `.map` que había aquí.** Y las cuatro piezas que hacían falta
          salieron todas de Taobao, no de una invención:

          | lo que hacía el `.map`            | de dónde sale                          |
          |-----------------------------------|----------------------------------------|
          | `lista.map(...)`                  | `Lista` — `DXRecyclerLayout`           |
          | `p.photos.length > 0 ? … : ''`    | `Condicional` — `DXConditionalNode`    |
          | `formatXAF(p.priceXaf)`           | `Precio` — `DXMegaPriceView`           |
          | `onPress` con `p.id`              | `EVENT_TAP` con binding `$item.id`     |

          **El `📷` va con UN SOLO hijo y sin «sino»** — que es literalmente el caso
          `getChildrenCount() == 1` de `tb/xg5.java`: si hay fotos se pinta, y si no, no hay
          segunda rama que pintar.

          **Y el vacío también es un condicional**, sobre `$productos.length`: si no hay
          catálogo, el «sino» es el mensaje. Antes eso era un `lista.length === 0 ? … : null`.
        */}
        <View style={{ flex: 1 }}>
          <Renderizador
            testID="selector-arbol"
            datos={{ productos: lista }}
            alEvento={(idProducto) => router.push(`/ecomerse-arbol?id=${idProducto}` as never)}
            arbol={{
              tipo: 'Condicional',
              valor: '$productos.length',
              atributos: {},
              hijos: [
                // ── ENTONCES: hay catálogo, así que la lista ──
                {
                  tipo: 'Lista',
                  valor: '$productos',
                  atributos: {},
                  hijos: [{
                    tipo: 'Contenedor',
                    atributos: {
                      [CLAVES_LAYOUT.ORIENTATION]: 0,
                      [CLAVES_LAYOUT.GRAVITY]: 1,
                      [CLAVES_LAYOUT.PADDING_LEFT]: 16,
                      [CLAVES_LAYOUT.PADDING_TOP]: 10,
                      [CLAVES_LAYOUT.PADDING_BOTTOM]: 10,
                      [CLAVES_TEXTO.ONPRESS]: '$item.id',
                    },
                    hijos: [
                      // El 📷 SOLO si hay fotos. **Un hijo, sin «sino»** — como Taobao.
                      {
                        tipo: 'Condicional',
                        valor: '$item.photos.length',
                        atributos: {},
                        hijos: [{
                          tipo: 'Contenedor',
                          atributos: { [CLAVES_LAYOUT.ORIENTATION]: 0 },
                          hijos: [
                            {
                              tipo: 'Texto',
                              valor: '📷',
                              atributos: { [CLAVES_TEXTO.TEXTSIZE]: 12, [CLAVES_TEXTO.TEXTCOLOR]: colors.textSecondary },
                            },
                            {
                              // La composición de texto se hace con NODOS, no concatenando
                              // cadenas: un árbol no tiene `+`. Es también lo que hace Taobao,
                              // que parte el texto en `TextSpan`s.
                              tipo: 'Texto',
                              valor: '$item.photos.length',
                              atributos: { [CLAVES_TEXTO.TEXTSIZE]: 12, [CLAVES_TEXTO.TEXTCOLOR]: colors.textSecondary, [CLAVES_LAYOUT.MARGIN_LEFT]: 2, [CLAVES_LAYOUT.MARGIN_RIGHT]: 10 },
                            },
                          ],
                        }],
                      },
                      {
                        tipo: 'Precio',
                        valor: '$item.priceXaf',
                        atributos: {
                          [CLAVES_PRECIO.CURRENCYSYMBOL]: 'XAF',
                          [CLAVES_PRECIO.CURRENCYPOSITION]: 1,
                          [CLAVES_PRECIO.CURRENCYSIZE]: 10,
                          [CLAVES_TEXTO.TEXTSIZE]: 14,
                          [CLAVES_TEXTO.TEXTCOLOR]: '#FFFF5000',
                          [CLAVES_LAYOUT.MARGIN_RIGHT]: 10,
                        },
                      },
                      {
                        tipo: 'Texto',
                        valor: '$item.title',
                        atributos: { [CLAVES_TEXTO.TEXTSIZE]: 14, [CLAVES_TEXTO.TEXTCOLOR]: colors.textPrimary },
                      },
                    ],
                  }],
                },
                // ── SINO: no hay catálogo ──
                {
                  tipo: 'Vista',
                  atributos: { [CLAVES_LAYOUT.PADDING_LEFT]: 16, [CLAVES_LAYOUT.PADDING_TOP]: 16 },
                  hijos: [{
                    tipo: 'Texto',
                    valor: 'El catalogo vino vacio.',
                    atributos: { [CLAVES_TEXTO.TEXTSIZE]: 14, [CLAVES_TEXTO.TEXTCOLOR]: colors.textSecondary },
                  }],
                },
              ],
            }}
          />
        </View>
      </View>
    );
  }

  if (error || !producto) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: espaciado.e16 }}>
        <Text style={{ fontSize: tipografia.body, color: colors.textPrimary }}>{error ?? 'Sin producto.'}</Text>
      </View>
    );
  }

  // **Los colores de texto salen del tema de la app, no del árbol.**
  const arbol = arbolDeProducto(producto, {
    texto: colors.textPrimary,
    textoSuave: colors.textSecondary,
  });


  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Renderizador arbol={arbol} datos={producto} alDiagnosticar={setDiag} style={{ flex: 1 }} />

      {/*
        El diagnóstico, a la vista y no en un log. **Es la parte que el backend necesita ver**:
        si `completo` es false, el servidor mandó algo que este cliente no pinta.
      */}
      {diag ? (
        <View style={{ padding: espaciado.e10, backgroundColor: diag.completo ? '#E8F5E9' : '#FFF3E0' }}>
          <Text style={{ fontSize: tipografia.caption, color: '#FF333333' }}>
            {diag.pintables}/{diag.nodos} nodos · {diag.completo ? 'completo' : 'INCOMPLETO'}
            {Object.keys(diag.desconocidos).length ? ` · desconocidos: ${JSON.stringify(diag.desconocidos)}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
