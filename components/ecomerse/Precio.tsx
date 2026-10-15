/**
 * Precio · el precio del Mercado, con la cifra y el símbolo a distinto tamaño
 * ==========================================================================
 *
 * Lo que en Taobao es `DXMEGAPRICEVIEW`. Ver `precioAtributos.ts` para el vocabulario y por qué
 * el widget estaba mal clasificado.
 *
 * ## Qué hace que `Texto` no podía
 *
 * ```
 * Texto:   <Text>4000</Text>                     ← el número crudo
 * Precio:  4.000  XAF                            ← la cifra formateada…
 *          └┬──┘  └┬┘
 *         grande  pequeño                        ← …y el símbolo MENOR
 * ```
 *
 * **`CURRENCYSIZE` separado de `TEXTSIZE` es lo que lo hace posible.** Sin él habría que pintar
 * todo al mismo tamaño, y el precio parecería un número cualquiera.
 *
 * ## Y no usa el `Precio` del ui-kit a propósito
 *
 * El ui-kit tiene `<Precio>` y hace exactamente esto — pero **lee el símbolo de `formateaXAF`**.
 * Aquí el símbolo lo manda el árbol (`CURRENCYSYMBOL`), porque un servidor puede mandar `€` o
 * `$` y el árbol es el que sabe qué divisa es. **La cifra, en cambio, se agrupa igual**, con
 * `toLocaleString('es-ES')`, que da el mismo `4.000`.
 */

import React from 'react';
import { Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { estiloDeCaja } from './layoutAtributos';
import { resolverPrecio, formatearCifra, type AtributosDxPrecio } from './precioAtributos';

export interface PrecioProps {
  /** El número, ya resuelto desde un binding (`$item.priceXaf`). */
  valor?: unknown;
  /** Atributos `DXMEGAPRICEVIEW`, por clave hex de Taobao. */
  dx?: AtributosDxPrecio;
  /**
   * Qué decir cuando no hay precio.
   *
   * **Un precio vacío no puede quedar en blanco**: en una lista de productos, un hueco donde va
   * la cifra se lee como un error de la app. `Texto` no tenía esta decisión porque nunca pintó
   * un precio; `Precio` sí, y por eso se declara.
   */
  textoVacio?: string;
  style?: StyleProp<ViewStyle>;
  /** Texto accesible: el precio entero, para que un lector no lea «4.000» y «XAF» sueltos. */
  accesibilidad?: string;
  testID?: string;
}

export function Precio({ valor, dx, textoVacio, style, accesibilidad, testID }: PrecioProps) {
  const r = resolverPrecio(dx);

  // `FORMATTEDPRICE` manda: si el servidor ya lo formateó, **el cliente no lo reformatea** — es
  // el servidor quien conoce la divisa y las reglas de su mercado.
  const cifra = r.formateado ?? formatearCifra(valor, r.separadorDecimal);

  const textoCompleto = cifra === undefined
    ? (textoVacio ?? '')
    : r.simbolo === undefined
      ? cifra
      : r.simboloDetras ? `${cifra} ${r.simbolo}` : `${r.simbolo}${cifra}`;

  const cifraProps = {
    style: {
      color: r.color,
      fontSize: r.tamano,
    },
  };

  // El símbolo, MENOR que la cifra. Si Taobao no dijo cuánto, se usa el 70 % — **es una
  // decisión, no un dato**, y va aquí en vez de escondida en un número mágico sin explicación.
  const tamanoDelSimbolo = r.tamanoSimbolo ?? (r.tamano !== undefined ? Math.round(r.tamano * 0.7) : undefined);
  const simboloProps = { style: { color: r.color, fontSize: tamanoDelSimbolo } };

  return (
    <View
      testID={testID}
      style={[estiloDeCaja(dx) as StyleProp<ViewStyle>, s.fila, style]}
      accessible={accesibilidad !== undefined || undefined}
      accessibilityLabel={accesibilidad ?? textoCompleto}
    >
      {cifra === undefined ? (
        <Text {...cifraProps}>{textoVacio ?? ''}</Text>
      ) : (
        <>
          {r.simbolo !== undefined && !r.simboloDetras ? <Text {...simboloProps}>{r.simbolo}</Text> : null}
          <Text {...cifraProps}>{cifra}</Text>
          {r.simbolo !== undefined && r.simboloDetras ? <Text {...simboloProps}>{` ${r.simbolo}`}</Text> : null}
        </>
      )}
    </View>
  );
}

const s = { fila: { flexDirection: 'row' as const, alignItems: 'baseline' as const } };

export default Precio;

export { resolverPrecio, formatearCifra, CLAVES_PRECIO, PROCEDENCIA } from './precioAtributos';
export type { AtributosDxPrecio, ResolucionPrecio, NombreAtributoPrecio } from './precioAtributos';
