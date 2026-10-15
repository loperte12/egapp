/**
 * Icono · el componente de iconos del Mercado, portado de `X_ICON_FONT_VIEW` de Taobao
 * ==================================================================================
 *
 * ## Qué es `X_ICON_FONT_VIEW` en Taobao
 *
 * Un `TextView` con **`uik_iconfont.ttf` adjuntada automáticamente**. Los iconos se pintan
 * como **texto**: el atributo `TEXT` lleva un codepoint, y la fuente lo convierte en un glifo.
 *
 * **No tiene atributos propios** salvo `DISABLEATTACHTYPEFACE`, que desactiva esa adjunción.
 * Todo lo demás — `TEXT`, `TEXTCOLOR`, `TEXTSIZE` — viene del **vocabulario de texto compartido**,
 * así que reutiliza `textoAtributos.ts`.
 *
 * ## ⚠️ Y por eso mismo NO se puede copiar
 *
 * **Los codepoints son de la fuente de Alibaba.** `U+D05A` no es «una flecha»: es
 * **la posición 0xD05A en `uik_iconfont.ttf`**. Sin esa fuente, el número no significa nada.
 *
 * Lo que sí se puede tomar es **el nombre** que la fuente da a cada glifo, y con él elegir
 * **un icono nuestro** de `lucide-react-native`.
 *
 * > **Se copia el contrato — «aquí va un carrito» — no el dibujo.**
 *
 * Por eso el componente se usa con **un nombre semántico**, no con el codepoint:
 *
 * ```tsx
 * <Icono nombre="cart_light" tamano={20} color={tinte} />
 * ```
 *
 * Y hay un `desdeTaobao(codepoint)` para cuando el codepoint venga codificado, que devuelve
 * `null` si no está en el glosario — **no lo adivina**.
 */

import React from 'react';
import * as Lucide from 'lucide-react-native';
import { GLOSARIO, nombreDeIcono, lucideDeIcono } from './iconoGlosario';
import { estiloDeCaja, type AtributosDxLayout } from './layoutAtributos';

/** Los nombres semánticos que el glosario cubre. */
export type NombreIcono = (typeof GLOSARIO)[keyof typeof GLOSARIO]['nombre'];

export interface IconoProps {
  /** Atributos de layout (margenes, tamano, visibilidad). **Los comparte con todos.** */
  dx?: AtributosDxLayout;
  /** Nombre semántico: `cart_light`, `right`, `nd_logistics`… */
  nombre: NombreIcono | string;
  tamano?: number;
  color?: string;
  /** Grosor del trazo. lucide lo usa; Taobao no tiene equivalente. */
  trazo?: number;
  style?: object;
  testID?: string;
}

/** Busca el componente de lucide por nombre, sin romper si no existe. */
function componenteLucide(nombre: string): React.ComponentType<any> | null {
  const C = (Lucide as unknown as Record<string, React.ComponentType<any>>)[nombre];
  return C ?? null;
}

/**
 * Un icono del Mercado.
 *
 * ```tsx
 * <Icono nombre="right" tamano={16} color="#888" />
 * ```
 */
export function Icono({ nombre, tamano = 20, color, trazo = 2, dx, style, testID }: IconoProps) {
  // Si el nombre es en realidad un codepoint de Taobao, se traduce. Si no está en el glosario,
  // `lucideDeIcono` devuelve null y **no se pinta un icono equivocado**.
  const elegido = componenteLucide(nombre) ? nombre : (lucideDeIcono(nombre) ?? nombre);
  const C = componenteLucide(elegido);

  if (!C) {
    // Sin icono conocido NO se pinta un sustituto silencioso: en producción un hueco es más
    // honesto que un icono que significa otra cosa. En desarrollo se ve el nombre.
    if (__DEV__) {
      const { Text } = require('react-native') as typeof import('react-native');
      return (
        <Text testID={testID} style={[estiloDeCaja(dx), { fontSize: tamano, color: color ?? '#999' }, style]}>
          {`⟨${nombre}⟩`}
        </Text>
      );
    }
    return null;
  }

  return <C testID={testID} size={tamano} color={color} strokeWidth={trazo} style={style} />;
}

export default Icono;

export {
  GLOSARIO, nombreDeIcono, lucideDeIcono, coberturaGlosario,
  CLAVE_DISABLEATTACHTYPEFACE, TIPO_X_ICON_FONT_VIEW,
} from './iconoGlosario';
