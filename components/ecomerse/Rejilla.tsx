/**
 * Rejilla · el contenedor de rejilla del Mercado, portado de `DX_GRID_LAYOUT` de Taobao
 * ====================================================================================
 *
 * **El componente con más confianza de todos los hechos**: 8 de sus 9 atributos tienen nombre
 * en `tabla-claves.json`. Nada inferido.
 *
 * ## Y es la mitad de la lista
 *
 * `DX_GRID_LAYOUT_COLUMN_COUNT` y `DXRECYCLERLAYOUT_COLUMNCOUNT` son **la misma clave**
 * (`3e2dcaff35b84aa2`), y `DX_VIEW_ORIENTATION` es también `DXRECYCLERLAYOUT_ORIENTATION`.
 *
 * > **Cuando se construya la lista, la lógica de rejilla ya estará hecha.**
 *
 * ## Uso real: 18 nodos — el menos usado de los construidos
 *
 * Se hace **para desbloquear el feed**, no porque el corpus lo pida mucho. **Y eso hay que
 * decirlo**: este componente no está respaldado por demanda medida como `Texto` (220 usos).
 */

import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverRejilla, type AtributosDxRejilla } from './rejillaAtributos';

export interface RejillaProps {
  children?: React.ReactNode;
  /** Atributos `DX_GRID_LAYOUT` decodificados, por clave hex de Taobao. */
  dx?: AtributosDxRejilla;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Fuerza las columnas, si no vienen en `dx`. */
  columnas?: number;
}

/**
 * La rejilla del Mercado.
 *
 * ```tsx
 * <Rejilla dx={{ '3e2dcaff35b84aa2': 2, '9dca6270e598e560': 8, 'ad36537101a1ce27': 8 }}>
 *   {productos.map(p => <TarjetaProducto key={p.id} producto={p} />)}
 * </Rejilla>
 * ```
 */
export function Rejilla({ children, dx, style, testID, columnas }: RejillaProps) {
  const r = resolverRejilla(dx);
  const cols = r.columnas ?? columnas;

  const estilo: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // `gap` de flexbox hace exactamente lo que `COLUMN_SPACING`/`ROW_SPACING` de Taobao:
    // separación entre celdas, sin margen en los bordes. React Native lo soporta desde 0.71.
    ...(r.separacionColumnas !== undefined ? { columnGap: r.separacionColumnas } : null),
    ...(r.separacionFilas !== undefined ? { rowGap: r.separacionFilas } : null),
    // Separadores: Taobao los pinta como líneas de 1px sobre las celdas. Aquí se usa el borde
    // del contenedor, que es lo que flexbox permite sin nodos extra.
    ...(r.separadores
      ? { borderColor: r.colorLinea ?? '#E5E5E5', borderWidth: r.grosorLinea ?? 1 }
      : null),
  };

  /*
   * El ancho de cada celda.
   *
   * Si Taobao lo fija (`ITEM_WIDTH`), se usa. Si no, se reparte el ancho entre las columnas.
   *
   * `match_parent`/`match_content` **no se pueden traducir aquí**: flexbox no tiene una noción
   * de «ancho del padre» por hijo sin calcular. Se declara como límite en vez de aproximarlo.
   */
  const anchoCelda: ViewStyle | null =
    cols !== undefined && cols > 0
      ? r.anchoCelda === undefined || r.anchoCelda === 'match_content'
        ? { width: `${100 / cols}%` as unknown as number }
        : typeof r.anchoCelda === 'number'
          ? { width: r.anchoCelda }
          : null
      : null;

  const altoCelda: ViewStyle | null =
    typeof r.altoCelda === 'number' ? { height: r.altoCelda } : null;

  const celda: StyleProp<ViewStyle> = [anchoCelda, altoCelda].filter(Boolean) as StyleProp<ViewStyle>;

  return (
    <View testID={testID} style={[estiloDeCaja(dx), estilo, style]}>
      {React.Children.map(children, (hijo, i) =>
        hijo === null || hijo === undefined ? null : (
          <View key={i} style={celda}>
            {hijo}
          </View>
        ),
      )}
    </View>
  );
}

export default Rejilla;

export {
  resolverRejilla, canonizarColor,
  CLAVES_REJILLA, CONFIANZA, TIPO_DX_GRID_LAYOUT, CLAVE_COLUMN_COUNT_COMPARTIDA,
} from './rejillaAtributos';
export type { AtributosDxRejilla, ResolucionRejilla, NombreAtributoRejilla } from './rejillaAtributos';
