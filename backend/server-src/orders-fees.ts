/**
 * orders-fees — EL DINERO DE UN PEDIDO DE LIFE BOOK, en un solo sitio y sin tocar la base.
 *
 * ── POR QUÉ ES UN MÓDULO APARTE ──────────────────────────────────────────────────
 * Porque es la única parte del comercio donde un error se convierte en dinero mal cobrado, y aquí se
 * puede PROBAR con números, sin arrancar el servidor ni tocar Postgres: entran los importes y la
 * configuración, y sale el desglose. Es el mismo patrón que ya funciona en Comida (`src/food/food-fees.ts`),
 * portado en vez de inventado: los números son los que decidió el dueño para el comercio (8 % con
 * mínimo de 500 XAF, y tope del 40 %).
 *
 * ── DE DÓNDE SALE CADA COSA (lo que paga el comprador) ──────────────────────────
 *   productos  = subtotal − cupón        → lo que ingresa la TIENDA
 *   entrega    = lo que se paga por el reparto (va a quien reparte, no es de la plataforma)
 *   total      = productos + entrega      → lo que paga el comprador
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 *  1. **Comisión de la plataforma**: porcentaje de lo que ingresa la tienda, con un **mínimo por
 *     pedido**: si el porcentaje da menos que el mínimo, manda el mínimo. Sin mínimo, un pedido de
 *     1 000 XAF deja 80 XAF, que no paga ni el trabajo de atenderlo.
 *  2. **TOPE**: la comisión nunca pasa de un porcentaje de lo que ingresa la tienda. Es la red que
 *     garantiza que **ningún pedido deje a la tienda en negativo**. Un pedido de 1 000 XAF: 8 % son 80,
 *     el mínimo lo sube a 500… y el tope del 40 % (400) manda: la tienda se queda 600 y la plataforma
 *     cobra 400. **Gana el tope**, siempre: el mínimo existe para que un pedido pequeño no salga
 *     ruinoso, pero la promesa que no se rompe es que la tienda no pague por vender.
 *  3. **La entrega NO se comisiona**: se cobra por su coste, no por el precio del pedido. Va aparte, y
 *     en el libro de cuentas queda como «a pagar al reparto» — no es ingreso de la plataforma ni de la
 *     tienda.
 *  4. **La tienda nunca recibe menos de cero.** No es una comprobación de adorno: es la promesa del
 *     tope, y está en las pruebas con números.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────────
 * No lee la base, no conoce Prisma, no decide si un pedido se entrega y no cobra nada. Es una función
 * pura: mismos importes y misma configuración → mismo desglose, siempre.
 */

export interface FeeConfig {
  /** % de la plataforma sobre lo que ingresa la tienda (p. ej. 8). */
  platformPercent: number;
  /** Mínimo por pedido de la comisión, en XAF (p. ej. 500). */
  platformMinXaf: number;
  /** Tope: la comisión no pasa de este % de lo que ingresa la tienda (p. ej. 40). */
  maxTotalPercent: number;
}

export interface OrderFees {
  /** Lo que ingresa la tienda por los productos (subtotal − cupón). */
  productosXaf: number;
  /** Lo que se paga por el reparto (va a quien reparte). */
  entregaXaf: number;
  /** Lo que paga el comprador: productos + entrega. */
  totalXaf: number;
  /** Comisión de la plataforma (ya con mínimo y tope aplicados). */
  comisionXaf: number;
  /** Lo que hay que pagarle a la tienda: productos − comisión. Nunca negativo. */
  aPagarTiendaXaf: number;
  /** true si el tope tuvo que recortar la comisión (el margen de la plataforma se comió la diferencia). */
  topeAplicado: boolean;
}

/**
 * Configuración por defecto, la que decidió el dueño (los mismos números que Comida).
 * Está aquí solo como último recurso: el servicio debe preferir SIEMPRE lo que haya en la base, para
 * poder cambiar el porcentaje sin desplegar código.
 */
export const FEE_CONFIG_POR_DEFECTO: FeeConfig = {
  platformPercent: 8,
  platformMinXaf: 500,
  maxTotalPercent: 40,
};

/** Normaliza lo que venga de la base (un `numeric` de Postgres llega como string a veces). */
export function aConfigFee(crudo: any): FeeConfig {
  const num = (v: any, porDefecto: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : porDefecto;
  };
  return {
    platformPercent: num(crudo?.platform_percent ?? crudo?.platformPercent, FEE_CONFIG_POR_DEFECTO.platformPercent),
    platformMinXaf: num(crudo?.platform_min_xaf ?? crudo?.platformMinXaf, FEE_CONFIG_POR_DEFECTO.platformMinXaf),
    maxTotalPercent: num(crudo?.max_total_percent ?? crudo?.maxTotalPercent, FEE_CONFIG_POR_DEFECTO.maxTotalPercent),
  };
}

/** Porcentaje de un importe, redondeado a XAF entero (todo el dinero del proyecto es entero). */
const pct = (importe: number, porcentaje: number) => Math.round((importe * porcentaje) / 100);

/**
 * El desglose de un pedido. Con los números adoptados:
 *   · 12 000 XAF de productos → comisión 960 · a pagar a la tienda 11 040.
 *   · 1 000 XAF de productos  → 8 % son 80, el mínimo lo sube a 500 y el **tope del 40 % (400) manda**:
 *     comisión 400 · a pagar 600 · `topeAplicado: true`.
 *   · 0 XAF (pedido sin importe) → 0 y 0, sin sorpresas.
 */
export function computeOrderFees(
  productosXaf: number,
  entregaXaf = 0,
  cfg: FeeConfig = FEE_CONFIG_POR_DEFECTO,
): OrderFees {
  const productos = Math.max(0, Math.round(Number(productosXaf) || 0));
  const entrega = Math.max(0, Math.round(Number(entregaXaf) || 0));
  const total = productos + entrega;
  if (productos === 0) {
    return { productosXaf: 0, entregaXaf: entrega, totalXaf: total, comisionXaf: 0, aPagarTiendaXaf: 0, topeAplicado: false };
  }

  // 1 · El mínimo manda cuando el porcentaje da menos.
  let comision = Math.max(pct(productos, cfg.platformPercent), Math.max(0, Math.round(cfg.platformMinXaf)));
  // 2 · El tope manda sobre el mínimo. Aquí es donde se cumple «la tienda nunca paga por vender».
  const tope = Math.max(0, pct(productos, cfg.maxTotalPercent));
  let topeAplicado = false;
  if (comision > tope) {
    comision = tope;
    topeAplicado = true;
  }

  return {
    productosXaf: productos,
    entregaXaf: entrega,
    totalXaf: total,
    comisionXaf: comision,
    // Por construcción no puede ser negativo; si algún día lo fuera, esto es lo que fallaría en las
    // pruebas antes de que nadie lo vea en una liquidación.
    aPagarTiendaXaf: productos - comision,
    topeAplicado,
  };
}
