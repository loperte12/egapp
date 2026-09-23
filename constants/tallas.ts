/**
 * constants/tallas.ts — LA NUMERACIÓN DEL CALZADO (tanda L-bis).
 *
 * POR QUÉ EXISTE Y POR QUÉ ESTÁ EN UN SOLO SITIO.
 *
 * El que compra zapatos **sabe su número**, no cuántos centímetros mide su pie: preguntarle «largo
 * del pie en cm» es pedirle que se mida con una cinta, y casi nadie lo hace. El que vende, en
 * cambio, escribe su tabla en centímetros (es lo que publican las marcas). Así que hacen falta las
 * dos cosas, y **la misma equivalencia en los dos lados**:
 *   · el comerciante rellena sus tallas típicas (36 … 45) con el largo de pie que les corresponde;
 *   · el comprador puede dar SU NÚMERO y el asistente lo convierte a centímetros para compararlo
 *     con esa tabla.
 * Si cada lado usara su propia tabla, el número 42 podría valer 26 cm en un sitio y 27 en otro, y la
 * recomendación saldría mal. De ahí que la equivalencia viva aquí y solo aquí.
 *
 * OJO CON LA HONESTIDAD: la equivalencia entre la numeración europea (Paris point = 2/3 cm) y el
 * largo del pie es **aproximada** (cada marca talla distinto), y la base guarda centímetros
 * ENTEROS, así que los valores van redondeados a 1 cm. Por eso el asistente enseña siempre
 * «Talla 42 ≈ 26 cm» y deja el largo exacto en su propia ruleta: lo que manda es la tabla de la
 * tienda, no esta tabla.
 */

/** La numeración europea y el largo de pie (cm, entero) que le corresponde. */
export const TALLAS_CALZADO: { numero: number; cm: number }[] = [
  { numero: 34, cm: 21 },
  { numero: 35, cm: 22 },
  { numero: 36, cm: 22 },
  { numero: 37, cm: 23 },
  { numero: 38, cm: 24 },
  { numero: 39, cm: 24 },
  { numero: 40, cm: 25 },
  { numero: 41, cm: 25 },
  { numero: 42, cm: 26 },
  { numero: 43, cm: 26 },
  { numero: 44, cm: 27 },
  { numero: 45, cm: 28 },
  { numero: 46, cm: 29 },
  { numero: 47, cm: 30 },
];

/** Los números que se pueden elegir en la ruleta del comprador. */
export const NUMEROS_CALZADO: number[] = TALLAS_CALZADO.map((t) => t.numero);

/** El largo de pie (cm) de un número de calzado. */
export function cmDeNumero(numero: number): number {
  return TALLAS_CALZADO.find((t) => t.numero === numero)?.cm ?? 26;
}

/** El número de calzado que corresponde a un largo de pie (el más cercano). */
export function numeroDeCm(cm: number): number {
  let mejor = TALLAS_CALZADO[0];
  let dist = Infinity;
  for (const t of TALLAS_CALZADO) {
    const d = Math.abs(t.cm - cm);
    if (d < dist) { dist = d; mejor = t; }
  }
  return mejor.numero;
}
