/**
 * fichaDeSeccion — de la ficha que manda el SERVIDOR al producto que habla la app
 * =================================================================================
 *
 * El árbol manda los datos con **nombres cortos** (`id`, `titulo`, `precioXaf`, `foto`); la API de la
 * app habla el suyo (`id`, `title`, `priceXaf`, `photos`). **El puente se hace aquí, en una función**,
 * en vez de obligar al árbol a hablar el idioma de la API — que es justo lo que se quiere evitar.
 *
 * **Por qué está en su propio fichero**: desde el 15/10/2026 hay DOS pantallas que ejecutan las
 * acciones del árbol (el Mercado, que ya lo pinta, y el banco de pruebas `/ecomerse-ui`). Tener esta
 * traducción dos veces sería garantizar que un día traduzcan distinto.
 *
 * **Es puro**: no importa React, ni la API, ni el renderizador. Se prueba en Node.
 */

/**
 * Busca una ficha por id en los datos que mandó el servidor.
 *
 * **Busca en CUALQUIER lista de primer nivel**, no solo en `fichas`: el servidor manda los datos con
 * el nombre que le conviene a cada sección (`destacados`, `fichas`, …), y el puente no tiene por qué
 * conocerlos todos. Una lista con ids y ese id dentro es una ficha.
 */
export function buscarFicha(datos: unknown, id: string): Record<string, unknown> | null {
  if (!datos || typeof datos !== 'object') return null;
  for (const valor of Object.values(datos as Record<string, unknown>)) {
    if (!Array.isArray(valor)) continue;
    const f = valor.find((x) => x && typeof x === 'object' && (x as Record<string, unknown>).id === id);
    if (f) return f as Record<string, unknown>;
  }
  return null;
}

/** El producto en el idioma de la APP: lo que necesitan el corazón y el carrito. */
export interface ProductoDeFicha {
  id: string;
  title: string;
  priceXaf: number;
  photos: string[];
}

/**
 * Traduce una ficha del servidor al producto de la app. **`null` si esa ficha no está**: quien llama
 * decide qué hacer, y lo que no se hace nunca es inventarse un producto a medias.
 */
export function productoDeFicha(datos: unknown, id: string): ProductoDeFicha | null {
  const ficha = buscarFicha(datos, id);
  if (!ficha) return null;
  return {
    id: String(ficha.id),
    title: String(ficha.titulo ?? ''),
    priceXaf: Number(ficha.precioXaf ?? 0),
    photos: ficha.foto ? [String(ficha.foto)] : [],
  };
}

export default { buscarFicha, productoDeFicha };
