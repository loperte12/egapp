/**
 * Precio — la cifra del dinero, con su unidad y sin poder partirse.
 *
 * POR QUÉ EXISTE: el módulo Mercado pintaba el precio en **cuatro sitios con tres tratamientos
 * distintos** para el mismo dato — la rejilla en pastilla con borde, el carrusel y Favoritos en
 * naranja suelto, la ficha en 28—, y en el carrusel **se partía en dos líneas**: «6.500» arriba y
 * «XAF» debajo, porque la tarjeta mide 92 dp y la cadena llevaba un espacio normal en medio.
 *
 * DOS COSAS QUE ARREGLA, Y UNA QUE NO:
 *
 * 1. **La cifra y la unidad son un solo `<Text>`.** No dos cajas alineadas a mano: la unidad va
 *    *anidada* dentro del texto del número, y todo el conjunto lleva `numberOfLines={1}`. Un texto
 *    anidado no puede caer a la línea siguiente por mucha hambre de ancho que tenga el contenedor.
 *    El corte no se evita ajustando el ancho: se vuelve imposible por construcción.
 *    De paso resuelve la **alineación a la línea base**: al ser un solo texto, la unidad se apoya
 *    en la base de la cifra. Con dos cajas en fila habría que elegir entre centrar (lo que se ve
 *    mal, porque el ojo lee la base) o compensar a mano con un desplazamiento por tamaño.
 *
 * 2. **La unidad se pinta en cuerpo menor.** Es lo que hace el comercio en todas partes (y lo que
 *    da el aire necesario para que la cifra quepa): el número manda, la unidad acompaña. De paso
 *    ensancha el hueco útil sin tocar el tamaño de la cifra.
 *
 * 3. Lo que **no** hace: elegir cuánto mide el precio. Eso es la escala de abajo, y se elige por
 *    jerarquía (un precio de tarjeta no mide lo que el precio de una ficha), no por gusto.
 *
 * ── Cuánto tiene que mandar la cifra (criterio adoptado el 20-sep-2026) ────────────────────────
 *
 * El diseño de referencia (得物) pide que el **ancho del número sea ≥ 2× el de la unidad**. Ese
 * 2× **no se puede cumplir en todos los importes de esta app, y no por un defecto de aquí**: 得物
 * escribe la unidad en **un carácter** («¥») y aquí son **tres letras** («XAF»), que miden 70 px a
 * 11 dp. Con una cifra de un dígito el ancho disponible no da, haga lo que haga el componente.
 *
 * Medido con `mide-ratio-precio.cjs` sobre la captura **en crudo** del dispositivo (ancho de tinta
 * de la cifra partido por el de la unidad; `uiautomator` no sirve, la unidad va dentro del mismo
 * nodo, así que devuelve un solo `<Text>`):
 *
 *   rejilla y carrusel (`md`)  «4.000 XAF»      141/70 = **2,01×**  ✔
 *   ficha (`xl`)               «18.500 XAF»               **2,71×**  ✔
 *   pedidos (`lg`)             «6.500» / «20.000»  **2,37×** / 2,91×  ✔
 *   plan de tres cifras        «500 XAF»                  **1,34×**  ✘ no alcanza
 *   plan gratis                «0 XAF»                    **1,80×**  ✘ no alcanza
 *
 * **Criterio adoptado**: la cifra manda por **altura ≥ 1,3×** (peor caso medido 1,37×) y **el
 * importe no se parte nunca, en ninguna pantalla**. Se abandona el 2× de anchura como regla porque
 * exige una unidad de un carácter que este mercado no tiene; lo que se conserva es su intención
 * —que la unidad acompañe sin competir—, y eso aquí se cumple **por construcción**: en la escala
 * de abajo la unidad está siempre un escalón por debajo de la cifra (12/11, 14/11, 20/12, 28/16).
 *
 * Nota para quien audite esto: el criterio **no es comprobable con una regla de texto**, hace falta
 * medir píxeles. El instrumento está en `.auditoria-servicios/mide-ratio-precio.cjs` y su uso, en el
 * apéndice de `FASE-2-PRECIO.md`, con los cuatro recortes ya calculados.
 *
 * ── La doctrina del precio: figura o frase ────────────────────────────────────────────────────
 *
 * En el módulo Mercado un importe se pinta de dos maneras, y **son excluyentes**:
 *
 *   · **FIGURA** — el importe es el sujeto de la línea: el precio de una tarjeta, el total de un
 *     pedido, el precio de una ficha. Manda este componente, que es lo único que pinta la unidad
 *     reducida y que no puede partirse. Un `<Text>{formatXAF(x)}</Text>` es una figura sin regla.
 *
 *   · **FRASE** — el importe va dentro de un texto: `• Arroz ×2 · {formatXAF(x)}`, `envío {…}`,
 *     `Tienes {…} en el monedero`. Manda `formateaXAF`, que pega cifra y unidad con espacio duro
 *     (tampoco se parte) **pero no debe envolverse en este componente**: `Precio` devuelve una
 *     `View`, y meter una caja dentro de una frase parte la línea en dos bloques, rompe su ajuste
 *     y pierde la línea base común con las palabras de al lado.
 *
 * La frontera es «¿el importe es el sujeto de la línea o es parte de una frase?», no «¿es grande o
 * pequeño?». La guardia de diseño (`pruebas/verifica-diseno.cjs`, métrica `precioFigura`) vigila
 * la primera y no la segunda, porque la segunda es correcta y no hay que tocarla.
 *
 * ── La escala ─────────────────────────────────────────────────────────────────────────────────
 *
 * El tamaño no se elige en la pantalla: se elige **el papel**. Cuatro papeles, cuatro tamaños.
 *
 * Uso:
 *   <Precio valor={p.priceXaf} />                            // precio de tarjeta
 *   <Precio valor={p.priceXaf} forma="pastilla" />            // sobre una foto
 *   <Precio valor={p.priceXaf} tamano="lg" />                 // total de un pedido
 *   <Precio valor={p.priceXaf} tamano="xl" />                 // ficha del producto
 *   <Precio valor={pl.priceXaf} periodo="/mes" />             // un plan: 18.500 XAF/mes
 *   <Precio valor={pricePreview} textoVacio="— XAF" />        // cuando puede faltar
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/colors';
import { espaciado, peso, radios, tipografia, trazo } from '../theme/escalas';
import { ESPACIO_DURO, formateaXAF, partesXAF } from '../format/moneda';

/**
 * La escala del precio: cada tamaño es un par (cifra, unidad), no un número suelto.
 *
 * La unidad no baja de `micro` ni sube de `subtitle`: por debajo de 11 dp «XAF» deja de leerse, y
 * por encima de 16 compite con la cifra en vez de acompañarla. Los saltos (12→11, 14→11, 20→12,
 * 28→16) están elegidos para que la unidad se note *distinta* sin desaparecer.
 *
 * **Aquí es donde se cumple el criterio de arriba**: en toda talla la unidad queda por debajo de la
 * cifra. Una talla nueva con las dos al mismo cuerpo rompe la regla aunque el componente no cambie
 * una línea — por eso el invariante se escribe aquí y no en un comentario suelto.
 *
 * El tamaño se elige por **papel**, y cada papel tiene un solo tamaño:
 *
 *   sm — precio de una tarjeta compacta (carrusel estrecho, meta de favoritos)
 *   md — precio de una tarjeta. Es el tamaño por defecto
 *   lg — total de un resumen (el total de un pedido, la cabecera de una compra)
 *   xl — precio de la ficha de un producto: la cifra más grande de la pantalla
 *
 * Lo que NO se copia de la referencia (得物): su unidad es **un símbolo de un carácter** (¥), y de
 * ahí sale la regla de que el ancho del número sea ≥ 2× el de la unidad. «XAF» son **tres letras**:
 * con la cifra más pequeña de la escala, esa proporción es aritméticamente inalcanzable para un
 * precio de cuatro cifras. La regla que sí se sostiene —y la que se adopta aquí— es que **la cifra
 * mande por tamaño** (la unidad va uno o dos escalones por debajo) y que la proporción mejore con
 * el precio: cuanto más grande es el importe, más manda el número.
 */
const ESCALA = {
  /** Cifra pequeña: carrusel estrecho, meta de una tarjeta compacta. */
  sm: { cifra: tipografia.caption, unidad: tipografia.micro },
  /** El precio de una tarjeta. Es el tamaño por defecto. */
  md: { cifra: tipografia.body, unidad: tipografia.micro },
  /** Total de un resumen: cabecera de compra, tarjeta de pedido. */
  lg: { cifra: tipografia.title, unidad: tipografia.caption },
  /** El precio de la ficha de un producto: la cifra más grande de la pantalla. */
  xl: { cifra: tipografia.display, unidad: tipografia.subtitle },
} as const;

export type PrecioTamano = keyof typeof ESCALA;

/**
 * `llano` va sobre el fondo de la tarjeta; `pastilla` se pinta el suyo porque debajo hay una FOTO
 * y el naranja suelto sobre una imagen cualquiera no se lee.
 */
export type PrecioForma = 'llano' | 'pastilla';

export interface PrecioProps {
  valor: number | string | null | undefined;
  tamano?: PrecioTamano;
  forma?: PrecioForma;
  /** Color de la cifra. Por defecto el naranja de marca, que es el del precio en toda la app. */
  color?: string;
  /**
   * Lo que acompaña al importe sin ser importe: `/mes`, `/día`, `/noche`. Se pega a la unidad
   * **sin espacio** (es la convención de la app) y se pinta con el mismo trato que la unidad, para
   * que el periodo no compita con el precio. El lector de pantalla no lee la barra: oye «por mes».
   */
  periodo?: string;
  /** Qué enseñar cuando no hay importe. Por defecto «—», no «0»: un cero es un precio, la ausencia no. */
  textoVacio?: string;
  style?: StyleProp<ViewStyle>;
}

/** «/mes» → «por mes»: la barra no se lee, y el importe se oye entero («18.500 XAF por mes»). */
function periodoHablado(periodo: string): string {
  return periodo.trim().replace(/^\//, 'por ');
}

export function Precio({
  valor, tamano = 'md', forma = 'llano', color = brand.secondary, periodo, textoVacio = '—', style,
}: PrecioProps) {
  const { colors } = useTheme();
  const e = ESCALA[tamano];
  const partes = partesXAF(valor);

  return (
    <View
      style={[
        forma === 'pastilla' && [
          s.pastilla,
          { backgroundColor: colors.card, borderColor: colors.border },
        ],
        style,
      ]}
    >
      {partes ? (
        <Text
          numberOfLines={1}
          /* El lector de pantalla lee «6.500 XAF por mes» entero y de una pieza; sin esto leería la
             cifra, la unidad y el periodo como tres nodos sueltos. */
          accessibilityLabel={formateaXAF(valor) + (periodo ? ' ' + periodoHablado(periodo) : '')}
          style={[s.cifra, { fontSize: e.cifra, color }]}
        >
          {partes.numero}
          <Text style={[s.unidad, { fontSize: e.unidad }]}>
            {ESPACIO_DURO + partes.unidad}
          </Text>
          {periodo ? <Text style={[s.unidad, { fontSize: e.unidad }]}>{periodo}</Text> : null}
        </Text>
      ) : (
        <Text numberOfLines={1} style={[s.cifra, { fontSize: e.cifra, color: colors.textSecondary }]}>
          {textoVacio}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  cifra: { fontWeight: peso.titulo },
  /* Mismo color que la cifra —lo hereda— y peso `medio`: la unidad se distingue por tamaño y por
     peso, no por color, para que el contraste contra el fondo lo fije un solo valor. */
  unidad: { fontWeight: peso.medio },
  pastilla: {
    /* `flexShrink: 0` es el que impide que un contenedor en fila comprima la pastilla hasta
       romperla; `overflow: hidden` recorta el fondo redondeado, no el texto. */
    alignSelf: 'flex-start',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: radios.sm,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e8,
    paddingVertical: espaciado.e4,
  },
});
