/**
 * Scroll · el contenedor desplazable del Mercado, portado de `DXSCROLLERLAYOUT`
 * ==============================================================================
 *
 * **36 nodos · 25 de 42 atributos (60 %) en su propio tipo.** Comparte el 40 % restante con
 * `SLIDER` — **y tiene sentido: los dos son contenedores que se desplazan.**
 *
 * Como los demás, toda la resolución vive en `scrollAtributos.ts`, que es **puro**.
 *
 * ## Qué cubre, y qué NO
 *
 * | Taobao | Aquí |
 * |---|---|
 * | `DISABLEBOUNCES` | quitar el rebote |
 * | `ENABLESMOOTHSCROLL` | desplazamiento suave |
 * | `NESTEDSCROLLINGENABLED` | scroll anidado |
 * | `VELOCITYSPEED` / `CONTENT_OFFSET` | velocidad y posición inicial |
 * | `SHOW_INDICATOR` | los puntos |
 * | `ORIENTATION` | dirección — **la misma clave que `Contenedor` y `Carrusel`** |
 *
 * ## ⚠️ Lo que este componente NO es: una lista
 *
 * `SOPORTA_RECICLADO`, `ITEM_PREFETCH` e `IGNOREREPEATRENDER` **no se implementan**, y es
 * deliberado. Son del **motor de reciclado de vistas de Android**: Taobao reutiliza las vistas
 * que salen de pantalla.
 *
 * **Aquí el contenedor monta todos los hijos.** Si el Mercado necesita reciclado de verdad
 * —un feed largo— **eso es `FlatList`, no este componente**.
 *
 * > **Fingir que se implementa el reciclado sería el peor resultado posible**: funcionaría en
 * > los 36 nodos de Taobao y se caería en un feed de mil productos.
 */

import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverScroll, type AtributosDxScroll } from './scrollAtributos';

export interface ScrollProps {
  children?: React.ReactNode;
  /** Atributos `DXSCROLLERLAYOUT` decodificados, por clave hex. */
  dx?: AtributosDxScroll;
  style?: StyleProp<ViewStyle>;
  /** Fuerza la dirección, si no viene en `dx`. */
  horizontal?: boolean;
  testID?: string;
  /** Se avisa al desplazarse, con la posición. */
  alDesplazar?: (offset: number) => void;
}

/**
 * El contenedor desplazable del Mercado.
 *
 * ```tsx
 * <Scroll dx={{ '9c173339fd9791b7': 1 }}>   {/* ORIENTATION = vertical *\/}
 *   <FichaArticulo producto={p} />
 * </Scroll>
 * ```
 */
export function Scroll({ children, dx, style, horizontal, testID, alDesplazar }: ScrollProps) {
  const r = resolverScroll(dx);

  // La posición inicial solo se aplica una vez: si se reaplicara en cada render, el contenedor
  // saltaría al principio mientras el usuario lo está moviendo.
  const aplicadoRef = React.useRef(false);
  const ref = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    if (aplicadoRef.current) return;
    aplicadoRef.current = true;
    if (r.desplazamientoInicial === undefined) return;
    const t = setTimeout(() => {
      ref.current?.scrollTo({
        x: r.horizontal ? r.desplazamientoInicial : 0,
        y: r.horizontal ? 0 : r.desplazamientoInicial,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(t);
  }, [r.desplazamientoInicial, r.horizontal]);

  const esHorizontal = horizontal ?? r.horizontal;

  return (
    // `flex: 1` en el contenedor Y en el ScrollView. **Sin él los dos colapsan a cero**: el
    // `View` exterior se ajusta al contenido, y el `ScrollView` de dentro tampoco tiene altura.
    // Se descubrió renderizando: el árbol se pintaba entero (`11/11 nodos`) y no se veía nada.
    <View style={[estiloDeCaja(dx), { flex: 1 }, style]} testID={testID}>
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        horizontal={esHorizontal}
        // `DISABLEBOUNCES` de Taobao → quitar el rebote elástico.
        bounces={!r.sinRebote}
        overScrollMode={r.sinRebote ? 'never' : 'auto'}
        // `NESTEDSCROLLINGENABLED` → en RN el anidamiento lo gestiona el propio ScrollView.
        nestedScrollEnabled={r.anidado || undefined}
        // `ENABLESMOOTHSCROLL` → `decelerationRate` normal en vez de rápido.
        decelerationRate={r.suave ? 'normal' : undefined}
        showsHorizontalScrollIndicator={esHorizontal}
        showsVerticalScrollIndicator={!esHorizontal}
        onScroll={
          alDesplazar
            ? (e) => {
                const o = e.nativeEvent.contentOffset;
                alDesplazar(esHorizontal ? o.x : o.y);
              }
            : undefined
        }
        scrollEventThrottle={alDesplazar ? 16 : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export default Scroll;

export {
  resolverScroll, CLAVES_SCROLL, CONFIANZA, ORIENTACION, TIPO_DXSCROLLERLAYOUT,
} from './scrollAtributos';
export type { AtributosDxScroll, ResolucionScroll, NombreAtributoScroll } from './scrollAtributos';
