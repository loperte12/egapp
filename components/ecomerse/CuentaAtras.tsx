/**
 * CuentaAtras · el contador del Mercado, portado de `DXCOUNTDOWNVIEW` de Taobao
 * =============================================================================
 *
 * El «termina en 02:14:07» de las ofertas. **82 nodos en 46 plantillas reales** — está en el
 * feed, en los pedidos y en las páginas de promoción.
 *
 * Como los demás, toda la resolución vive en `cuentaAtrasAtributos.ts`, que es **puro**.
 *
 * ## Qué se copia y qué no
 *
 * | Taobao | Aquí |
 * |---|---|
 * | `SHOWHOURSECOND` / `SHOWMINUTESECOND` | qué partes se muestran |
 * | separador (`":"`) | el separador, tal cual |
 * | `FONT` / `FONT_STYLE` | familia y peso |
 * | 5 tamaños + 4 colores de partes | el estilo por parte |
 * | `NOTSTOPWHENDETACH_ANDROID` | **no aplica**: en RN el temporizador se limpia siempre |
 *
 * **El temporizador se implementa con `setInterval` y se limpia al desmontar.** Taobao tiene
 * la bandera `NOTSTOPWHENDETACH_ANDROID` para el caso contrario; aquí **no se implementa la
 * versión que fuga**, y se declara.
 *
 * ## El formateo es nuestro
 *
 * Taobao manda una plantilla (`"00:00:00"`); aquí se **compone** desde las partes, porque el
 * reloj tiene que avanzar. **Y por eso el component no es un port literal: es la misma idea.**
 */

import React from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverCuentaAtras, partesDe, type AtributosDxCuentaAtras } from './cuentaAtrasAtributos';

export interface CuentaAtrasProps {
  /** Atributos `DXCOUNTDOWNVIEW` decodificados, por clave hex. */
  dx?: AtributosDxCuentaAtras;
  /** Segundos restantes. Si no se pasa, se usa `hasta`. */
  segundos?: number;
  /** Momento final. Se recalcula cada segundo. */
  hasta?: Date | number;
  /** Se avisa al llegar a cero. */
  alTerminar?: () => void;
  style?: StyleProp<ViewStyle>;
  estiloTexto?: StyleProp<TextStyle>;
  testID?: string;
}

/** Rellena a dos dígitos. */
const dd = (n: number) => String(n).padStart(2, '0');

/**
 * El contador del Mercado.
 *
 * ```tsx
 * <CuentaAtras dx={{ '41e2fb20c6dbcb9f': 1 }} hasta={oferta.terminaEn} />
 * ```
 */
export function CuentaAtras({ dx, segundos, hasta, alTerminar, style, estiloTexto, testID }: CuentaAtrasProps) {
  const r = resolverCuentaAtras(dx);

  // Segundos restantes. Con `hasta` se recalcula; sin él se queda el valor fijo.
  const calcular = React.useCallback(() => {
    if (segundos !== undefined) return Math.max(0, segundos);
    if (hasta === undefined) return 0;
    const t = typeof hasta === 'number' ? hasta : hasta.getTime();
    return Math.max(0, Math.floor((t - Date.now()) / 1000));
  }, [segundos, hasta]);

  const [restantes, setRestantes] = React.useState(calcular);
  const avisado = React.useRef(false);

  React.useEffect(() => {
    setRestantes(calcular());
    // Sin `hasta` y con `segundos` fijos no hay nada que contar: no se abre un temporizador
    // que no haría nada.
    if (hasta === undefined) return;
    const t = setInterval(() => setRestantes(calcular()), 1000);
    // **Se limpia siempre.** Taobao tiene `NOTSTOPWHENDETACH_ANDROID` para no pararlo; aquí
    // no se implementa esa variante, y la bandera se declara como no aplicable.
    return () => clearInterval(t);
  }, [calcular, hasta]);

  React.useEffect(() => {
    if (restantes === 0 && !avisado.current) {
      avisado.current = true;
      alTerminar?.();
    }
  }, [restantes, alTerminar]);

  const partes = partesDe(restantes, r.formato).map(dd);

  // El tamaño y el color se reparten por parte en el orden en que Taobao los declara. Si hay
  // menos estilos que partes, se reutiliza el último — que es lo que hace un contador real.
  const estiloDeParte = (i: number): TextStyle => {
    const t = r.tamanos.length ? r.tamanos[Math.min(i, r.tamanos.length - 1)] : undefined;
    const c = r.colores.length ? r.colores[Math.min(i, r.colores.length - 1)] : undefined;
    return {
      ...(t !== undefined ? { fontSize: t } : null),
      ...(c ? { color: c } : null),
      ...(r.familia ? { fontFamily: r.familia } : null),
      ...(r.estiloFuente === 'bold' ? { fontWeight: 'bold' as const } : null),
      ...(r.estiloFuente === 'none' ? { fontWeight: 'normal' as const } : null),
    };
  };

  return (
    <View style={[estiloDeCaja(dx), { flexDirection: 'row' }, style]} testID={testID}>
      {partes.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Text style={[estiloTexto, estiloDeParte(i)]}>{r.separador}</Text> : null}
          <Text style={[estiloTexto, estiloDeParte(i)]}>{p}</Text>
        </React.Fragment>
      ))}
    </View>
  );
}

export default CuentaAtras;

export {
  resolverCuentaAtras, partesDe, canonizarColor,
  CLAVES_CUENTA_ATRAS, CONFIANZA, ESTILO_FUENTE, TIPO_DXCOUNTDOWNVIEW,
} from './cuentaAtrasAtributos';
export type { AtributosDxCuentaAtras, ResolucionCuentaAtras, Formato, NombreAtributoCuentaAtras } from './cuentaAtrasAtributos';
