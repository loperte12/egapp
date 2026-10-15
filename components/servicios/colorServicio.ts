/**
 * colorServicio — el color de cada servicio en la rejilla de la cabecera
 * ======================================================================
 *
 * **Lo pidió el dueño del producto (16/10/2026)**: los iconos de los servicios «deberían tomar el
 * aspecto que Taobao lleva, más vivos».
 *
 * Y es verdad que Taobao **no los pinta monocromos**: su rejilla de accesos es un mosaico de iconos de
 * colores —cada uno el suyo— y eso es lo que la hace reconocible de un vistazo antes de leer un solo
 * rótulo. Lo que se clona es **ese rasgo**.
 *
 * ## Por qué aquí hay NOMBRES de token y no colores
 *
 * La primera versión de este fichero traía quince colores escritos a mano y **el guardián de diseño la
 * puso en rojo en el acto** (`hex: 0 → 15`): un color suelto en una pantalla es un color que no cambia
 * con el tema, que no pasa el contraste que el kit ya calculó y que nadie puede reajustar en un sitio.
 *
 * Así que lo que se declara es **el token** de cada servicio (`info`, `warning`, `success`…) y el color
 * lo resuelve el tema, que es quien tiene claro y oscuro. Con quince servicios y diez tokens, **algunos
 * repiten** — y está bien: lo que se busca es el mosaico, no quince tonos únicos.
 *
 * La **urgencia manda sobre esto**: un servicio `tone: 'emergency'` va con el `danger` del tema, sea
 * cual sea su token. Es la única señal que no compite con la paleta.
 */

/** Los tokens del kit que puede usar un servicio. **No es una lista abierta**: añadir uno es una decisión. */
export const TOKENS_SERVICIO = [
  'primary', 'secondary', 'success', 'danger', 'warning', 'info', 'like', 'guardado', 'whatsapp', 'neutral',
] as const;

export type TokenServicio = (typeof TOKENS_SERVICIO)[number];

/**
 * El token de cada servicio, por id.
 *
 * Los ids son los de `constants/data`. El reparto tiene una lógica y no es alfabético: **`info`/`primary`
 * para moverse**, **`warning` para el dinero**, **`success` para lo que uno gestiona** (su tienda, un
 * paquete), **`like`/`guardado` para lo que se guarda** y **`secondary` para el día a día de casa.
 */
export const TOKEN_DE_SERVICIO: Record<string, TokenServicio> = {
  taxi: 'info',
  intercity: 'primary',
  conductor: 'like',
  reservar: 'success',
  monedero: 'warning',
  food: 'secondary',
  paquete: 'success',
  mudanza: 'secondary',
  hotel: 'info',
  work: 'primary',
  alquiler: 'guardado',
  lifebook: 'like',
  ecomerse: 'secondary',
  tienda: 'success',
  emergencia: 'danger',
};

/**
 * El color de un servicio: el de su token, del tema que se le pase.
 *
 * `colores` es el objeto de `useTheme()`. Se pide **solo lo que hace falta** (los diez tokens) y no un
 * `Record<string, string>` entero: el tema tiene además partes anidadas (`text`, `border`…) y pedirle
 * «cualquier cadena» obligaría a mentir sobre su forma.
 */
export function colorDeServicio(
  id: string,
  colores: Partial<Record<TokenServicio, string>>,
  reserva: string,
): string {
  const token = TOKEN_DE_SERVICIO[id];
  return (token ? colores[token] : undefined) ?? reserva;
}

/** Los ids del catálogo que **no** tienen token: la prueba falla si hay alguno. */
export function serviciosSinColor(ids: readonly string[]): string[] {
  return ids.filter((id) => !TOKEN_DE_SERVICIO[id]);
}

/** Los tokens declarados que no existen en la paleta: otra forma de equivocarse en silencio. */
export function tokensQueNoExisten(colores: Partial<Record<TokenServicio, string>>): string[] {
  return [...new Set(Object.values(TOKEN_DE_SERVICIO))].filter((t) => !colores[t]);
}

export default { TOKENS_SERVICIO, TOKEN_DE_SERVICIO, colorDeServicio, serviciosSinColor, tokensQueNoExisten };
