/**
 * Carrusel · el carrusel del Mercado, portado de `DXSLIDERLAYOUT` de Taobao
 * =========================================================================
 *
 * **43 nodos y 98 % de atributos propios** — el componente con los datos más limpios de
 * todos los construidos. No hay ambigüedad sobre lo que es.
 *
 * Como los demás, toda la resolución vive en `carruselAtributos.ts`, que es **puro**.
 *
 * ## Qué cubre
 *
 * | Taobao | Aquí |
 * |---|---|
 * | `AUTO_SCROLL` + `AUTO_SCROLL_INTERVAL` | avance automático, en ms |
 * | `IS_INFINITE` | bucle |
 * | `MANUAL_SWITCH_ENABLED` | deslizar a mano |
 * | `SHOW_INDICATOR` + `INDICATOR_ID` | los puntos |
 * | `DX_VIEW_ORIENTATION` | dirección |
 *
 * ## Y qué NO cubre, y por qué
 *
 * Taobao referencia el indicador **por ID de otro nodo** (`"myIndicator"`). Eso es un sistema
 * de referencias entre nodos que **este componente no tiene**: aquí los puntos se pintan
 * dentro. **`idIndicador` se expone pero no se resuelve**, y se declara.
 *
 * Los tres atributos del ciclo de vida de Android (`AVOID_INDEX_DELTA_TOO_LARGE_ANDROID`,
 * `IS_ENABLE_DETACHED_STOP_TIMER_ANDROID`, `OPEN_SCROLLER_ANIMATION`) **no se implementan**:
 * van a `noImplementados`.
 */

import React from 'react';
import { ScrollView, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverCarrusel, type AtributosDxCarrusel } from './carruselAtributos';

export interface CarruselProps {
  children?: React.ReactNode;
  /** Atributos `DXSLIDERLAYOUT` decodificados, por clave hex. */
  dx?: AtributosDxCarrusel;
  /** Ancho de cada página. Sin esto no se puede paginar. */
  anchoPagina?: number;
  /** Alto de cada página, si Taobao lo fija. */
  altoPagina?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Se avisa al cambiar de página. */
  alCambiarPagina?: (indice: number) => void;
}

/**
 * El carrusel del Mercado.
 *
 * ```tsx
 * <Carrusel dx={{ '2457c0d2d388f252': 1, '4c58970c0c9adb9f': 3000 }} anchoPagina={360}>
 *   {banners.map(b => <Banner key={b.id} {...b} />)}
 * </Carrusel>
 * ```
 */
export function Carrusel({
  children, dx, anchoPagina, altoPagina, style, testID, alCambiarPagina,
}: CarruselProps) {
  const r = resolverCarrusel(dx);
  const paginas = React.Children.toArray(children).filter((h) => h !== null && h !== undefined);
  const scrollRef = React.useRef<ScrollView>(null);
  const [actual, setActual] = React.useState(0);

  // Avance automático. **Se detiene si el usuario está tocando** — es lo que Taobao hace con
  // `INTERCEPTTOUCHEVENT`, y sin eso el carrusel se mueve mientras alguien lo lee.
  const [tocando, setTocando] = React.useState(false);
  const total = paginas.length;
  // **El ancho de página, si no lo dan como prop, es el de la ventana.** Sin esto el componente
  // no se puede usar desde un ÁRBOL: el renderizador sólo pasa dx, y pagingEnabled necesita
  // un ancho en píxeles. Se descubrió al sustituir la galería de la ficha.
  const { width: anchoVentana } = useWindowDimensions();
  const ancho = anchoPagina ?? (r.direccion === 'row' ? anchoVentana : undefined);

  React.useEffect(() => {
    if (!r.autoScroll || total <= 1 || tocando || ancho === undefined) return;
    const t = setInterval(() => {
      setActual((i) => {
        const siguiente = i + 1;
        // Sin `IS_INFINITE` el carrusel se para en la última página en vez de dar la vuelta.
        if (siguiente >= total) {
          if (!r.infinito) return i;
          scrollRef.current?.scrollTo({ x: 0, animated: true });
          return 0;
        }
        scrollRef.current?.scrollTo({ x: siguiente * ancho, animated: true });
        return siguiente;
      });
    }, r.intervaloMs);
    return () => clearInterval(t);
  }, [r.autoScroll, r.intervaloMs, r.infinito, total, tocando, ancho]);

  const alSoltar = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    setTocando(false);
    if (ancho === undefined) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / ancho);
    if (i !== actual) {
      setActual(i);
      alCambiarPagina?.(i);
    }
  };

  return (
    <View testID={testID} style={[estiloDeCaja(dx), style]}>
      <ScrollView
        ref={scrollRef}
        horizontal={r.direccion === 'row'}
        pagingEnabled
        scrollEnabled={r.deslizable}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setTocando(true)}
        onMomentumScrollEnd={alSoltar}
        // `AVOIDINCESSANTSCROLL` de Taobao amortigua el deslizamiento. React Native ya lo hace
        // con `decelerationRate`, así que se traduce a la constante más suave.
        decelerationRate={r.amortiguar ? 'normal' : 'fast'}
      >
        {paginas.map((p, i) => (
          <View
            key={i}
            style={[
              ancho !== undefined ? { width: ancho } : null,
              altoPagina !== undefined ? { height: altoPagina } : null,
            ]}
          >
            {p}
          </View>
        ))}
      </ScrollView>

      {/* Los puntos se pintan aquí, no en un nodo referenciado por ID como hace Taobao. */}
      {r.mostrarIndicador && total > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}>
          {paginas.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginHorizontal: 3,
                backgroundColor: i === actual ? '#FF5000' : '#00000033',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default Carrusel;

export {
  resolverCarrusel, CLAVES_CARRUSEL, CONFIANZA, ORIENTACION,
  INTERVALO_POR_DEFECTO_MS, TIPO_DXSLIDERLAYOUT,
} from './carruselAtributos';
export type { AtributosDxCarrusel, ResolucionCarrusel, NombreAtributoCarrusel } from './carruselAtributos';
