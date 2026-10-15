/**
 * Vista · el contenedor base del Mercado, portado de `DXVIEW` de Taobao
 * =============================================================================
 *
 * `DXVIEW` es la vista base de DinamicX: **el widget del que dependen los otros 58**.
 * Aporta transformaciones (rotación, escala, desplazamiento), el callback de creación,
 * y la bandera de degradación ante un layout desconocido.
 *
 * **Toda la resolución de atributos vive en `vistaAtributos.ts`, que es puro.** Aquí
 * solo se aplica el resultado a React Native. Esa separación es lo que permite que el
 * oráculo de fidelidad importe la lógica real en vez de una copia.
 *
 * Fundamento medido:
 *   · Los 12 atributos y sus claves `long` — `mercado-fase1/re-d/tabla-claves.json`
 *   · La degradación ante desconocido es el mismo mecanismo que ADR-002 pide para C'
 *   · `docs` de origen: `mercado-fase1/o1-oraculo/FORMATO-ESPERADO.md`
 */

import React from 'react';
import { View, type StyleProp, type TransformsStyle, type ViewStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverVista, type AtributosDxView, type Transformacion } from './vistaAtributos';

/**
 * Traduce las transformaciones **neutras** al formato de React Native.
 *
 * El módulo puro no conoce React Native a propósito, así que el mapeo vive aquí — que es quien
 * renderiza. Así el oráculo puede importar la lógica **sin arrastrar la biblioteca**.
 *
 * El tipo de RN es `Readonly<MaximumOneOf<…>[]>`: **cada elemento lleva exactamente una clave**.
 * Por eso se construye con `push` de objetos literales en vez de con un `switch` que devuelve la
 * unión — así TypeScript ve cada objeto con una sola clave y encaja sin ningún cast.
 */
function aTransformacionesRN(ts: Transformacion[]): NonNullable<TransformsStyle['transform']> {
  type Elemento = NonNullable<TransformsStyle['transform']>[number];
  const out: Elemento[] = [];
  for (const t of ts) {
    switch (t.operacion) {
      case 'rotateX': out.push({ rotateX: `${t.grados}deg` }); break;
      case 'rotateY': out.push({ rotateY: `${t.grados}deg` }); break;
      case 'rotate': out.push({ rotate: `${t.grados}deg` }); break;
      case 'scaleX': out.push({ scaleX: t.factor }); break;
      case 'scaleY': out.push({ scaleY: t.factor }); break;
      case 'translateX': out.push({ translateX: t.puntos }); break;
      case 'translateY': out.push({ translateY: t.puntos }); break;
    }
  }
  /*
   * Un solo `as` documentado, y por un motivo concreto: el tipo de RN es
   * `Readonly<MaximumOneOf<…>[]>`, y `MaximumOneOf` es un **tipo condicional** que TypeScript
   * no puede verificar a partir de un array construido — aunque cada objeto tenga exactamente
   * una clave, que es justo lo que `MaximumOneOf` exige.
   *
   * No es un atajo para callar al compilador: **los objetos son correctos por construcción**,
   * y el `switch` de arriba es exhaustivo sobre `Transformacion`.
   */
  return out as NonNullable<TransformsStyle['transform']>;
}

export interface VistaProps {
  children?: React.ReactNode;
  /** Atributos `DXVIEW` decodificados, por clave hex de Taobao. */
  dx?: AtributosDxView;
  style?: StyleProp<ViewStyle>;
  /**
   * Lo que se pinta cuando Taobao marca `DOWNGRADEUNKNOWNLAYOUT`.
   *
   * Es el **fallback de C'**: un servidor nuevo puede mandar un componente que este
   * cliente no conozca, y la pantalla debe **degradar, no romperse**. En DinamicX el
   * nodo desconocido es `tb.bl6`; aquí es simplemente no pintar ese nodo y dejar que
   * el resto siga.
   */
  alDegradar?: React.ReactNode;
  /** `ONCREATEVIEW`: se dispara cuando la vista se monta. */
  alCrear?: () => void;
  testID?: string;
}

/**
 * El contenedor base. Se usa envolviendo cualquier contenido.
 *
 * ```tsx
 * <Vista dx={{ '4015d0f207a283d1': 45 }}>   {/* ROTATIONX = 45 *\/}
 *   <Texto>…</Texto>
 * </Vista>
 * ```
 */
export function Vista({ children, dx, style, alDegradar, alCrear, testID }: VistaProps) {
  const r = resolverVista(dx);

  // `ONCREATEVIEW` de DinamicX: se avisa una sola vez al montar, no en cada render.
  const crearRef = React.useRef(alCrear);
  crearRef.current = alCrear;
  React.useEffect(() => {
    crearRef.current?.();
    // Sin dependencias: el aviso es del MONTAJE, como en DinamicX.
  }, []);

  // Degradación declarada: si Taobao pidió degradar y hay alternativa, se pinta esa.
  if (r.degradarDesconocido && alDegradar !== undefined) {
    return <>{alDegradar}</>;
  }

  return (
    <View
      testID={testID}
      style={[estiloDeCaja(dx), r.transformaciones.length > 0 ? { transform: aTransformacionesRN(r.transformaciones) } : null, style]}
    >
      {children}
    </View>
  );
}

export default Vista;

/**
 * Reexporta la resolución pura para quien la necesite sin renderizar
 * (tests, o el propio oráculo).
 */
export { resolverVista, CLAVES_DXVIEW, CLASE, atributosImplementados } from './vistaAtributos';
export type { AtributosDxView, ResolucionVista, NombreAtributo, ClaseAtributo } from './vistaAtributos';
