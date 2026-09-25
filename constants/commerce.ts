/**
 * constants/commerce.ts — catálogos y etiquetas del módulo de COMERCIO (Parte 33).
 *
 * UNA SOLA FUENTE de textos para la ficha, la tienda, el formulario y el panel,
 * de modo que la app y el formulario nunca digan cosas distintas.
 */
import type { LbCondition, LbPayMethod, LbPriceMode, LbProductStatus, LbServiceType, LbStockMode } from '../api/commerce';
import {brand, neutro} from '@egrouteplan/ui-kit';

/** Tipos de publicación (el «Life Services» de la hoja de ruta). */
export const LB_SERVICE_TYPES: { id: LbServiceType; label: string; icon: string; action: string; hint: string }[] = [
  { id: 'physical', label: 'Producto', icon: '🛍', action: 'Comprar', hint: 'Cosas que vendes: ropa, móviles, comida envasada…' },
  { id: 'food', label: 'Comida', icon: '🍲', action: 'Pedir', hint: 'Platos preparados, desayunos, repostería, catering' },
  { id: 'local_service', label: 'Servicio', icon: '🔧', action: 'Solicitar', hint: 'Oficios: reparaciones, limpieza, clases, fontanería…' },
  { id: 'hotel_room', label: 'Alojamiento', icon: '🏨', action: 'Reservar', hint: 'Habitaciones, apartamentos y casas de huéspedes' },
  { id: 'rental', label: 'Alquiler', icon: '🔑', action: 'Consultar', hint: 'Vivienda, habitación, local, oficina, vehículo' },
  { id: 'job', label: 'Trabajo', icon: '💼', action: 'Aplicar', hint: 'Ofertas de empleo y colaboraciones' },
];

export const lbServiceLabel = (t: string): string =>
  LB_SERVICE_TYPES.find((s) => s.id === t)?.label ?? 'Publicación';

export const lbServiceAction = (t: string): string =>
  LB_SERVICE_TYPES.find((s) => s.id === t)?.action ?? 'Ver';

export const lbServiceIcon = (t: string): string =>
  LB_SERVICE_TYPES.find((s) => s.id === t)?.icon ?? '📦';

/** Métodos de pago que acepta la plataforma hoy (el estado lo pone el servidor). */
export const LB_PAY_METHODS: { id: LbPayMethod; label: string; hint: string }[] = [
  { id: 'cash_on_delivery', label: 'Efectivo contra entrega', hint: 'Paga al recibir; el repartidor confirma el cobro' },
  { id: 'billing', label: 'Billing', hint: 'Comprobante de transferencia aprobado por la plataforma' },
  { id: 'transfer', label: 'Transferencia / Orange Money', hint: 'Envías el comprobante y se aprueba a mano' },
  { id: 'in_store', label: 'Pago en tienda', hint: 'Se paga al recoger en el local' },
  { id: 'deposit', label: 'Señal o anticipo', hint: 'Reserva con una parte y el resto al recibir' },
  { id: 'likebook_wallet', label: 'Monedero', hint: 'Pagas con tu monedero: el importe queda en garantía hasta que recibas' },
];

export const lbPayLabel = (m: string): string =>
  LB_PAY_METHODS.find((p) => p.id === m)?.label ?? m;

export const LB_PAY_STATUS_LABEL: Record<string, string> = {
  active: 'Disponible',
  pending_approval: 'Pendiente de aprobación',
  coming_soon: 'Próximamente',
  disabled: 'No disponible',
};

export const LB_COVERAGE: { id: string; label: string }[] = [
  { id: 'same_city', label: 'Misma ciudad' },
  { id: 'continental_region', label: 'Región Continental' },
  { id: 'insular_region', label: 'Región Insular' },
  { id: 'national', label: 'Todo el país' },
  { id: 'international', label: 'Internacional' },
];

export const LB_TRANSPORT: { id: string; label: string }[] = [
  { id: 'pickup', label: 'Recogida en tienda' },
  { id: 'local_courier', label: 'Mensajero local' },
  { id: 'taxi_moto', label: 'Taxi o moto' },
  { id: 'road', label: 'Carretera' },
  { id: 'sea', label: 'Barco' },
  { id: 'air', label: 'Avión' },
];

export const lbCoverageLabel = (c: string): string => LB_COVERAGE.find((x) => x.id === c)?.label ?? c;
export const lbTransportLabel = (t: string): string => LB_TRANSPORT.find((x) => x.id === t)?.label ?? t;

export const LB_COST_MODES: { id: 'fixed' | 'calculated' | 'on_request'; label: string }[] = [
  { id: 'fixed', label: 'Coste fijo' },
  { id: 'calculated', label: 'Según distancia' },
  { id: 'on_request', label: 'A consultar' },
];

export const LB_CONDITIONS: { id: LbCondition; label: string }[] = [
  { id: 'new', label: 'Nuevo' },
  { id: 'used', label: 'Usado' },
  { id: 'made_to_order', label: 'Por encargo' },
];

/** Etiquetas de estado del producto, con su color semántico. */
export const LB_PRODUCT_STATUS: Record<LbProductStatus, { label: string; tone: 'ok' | 'wait' | 'bad' | 'off'; hint: string }> = {
  draft: { label: 'Borrador', tone: 'off', hint: 'Solo lo ves tú' },
  pending: { label: 'En revisión', tone: 'wait', hint: 'El equipo lo está revisando' },
  active: { label: 'Publicado', tone: 'ok', hint: 'Visible para todo el mundo' },
  rejected: { label: 'Rechazado', tone: 'bad', hint: 'Corrige lo que se indica y vuelve a enviarlo' },
  hidden: { label: 'Oculto', tone: 'off', hint: 'No aparece en el catálogo' },
  sold_out: { label: 'Agotado', tone: 'wait', hint: 'Sigue visible, marcado como agotado' },
};

export const LB_STOCK_MODES: { id: LbStockMode; label: string; hint: string }[] = [
  { id: 'exact', label: 'Existencias exactas', hint: 'Sé cuántas unidades tengo' },
  { id: 'approximate', label: 'Disponible', hint: 'Tengo, pero no llevo la cuenta' },
  { id: 'on_request', label: 'Bajo pedido', hint: 'Lo consigo cuando me lo piden' },
  { id: 'unlimited', label: 'Sin límite', hint: 'Siempre disponible (servicios)' },
];

export const LB_PRICE_MODES: { id: LbPriceMode; label: string }[] = [
  { id: 'fixed', label: 'Precio fijo' },
  { id: 'from', label: 'Desde' },
  { id: 'on_request', label: 'A consultar' },
];

export const lbPriceLabel = (value: number | null, mode: LbPriceMode, fmt: (n: number) => string): string => {
  if (mode === 'on_request' || value === null) return 'A consultar';
  if (mode === 'from') return `Desde ${fmt(value)}`;
  return fmt(value);
};

/** Etiquetas de nivel de tienda (básica · verificada · recomendada). */
export const LB_VERIFICATION: Record<string, { label: string; icon: string }> = {
  basic: { label: 'Tienda nueva', icon: '🏪' },
  verified: { label: 'Tienda verificada', icon: '✅' },
  recommended: { label: 'Tienda recomendada', icon: '⭐' },
};

/** Regiones de Guinea Ecuatorial (continental / insular). */
export const LB_REGIONS: { id: 'continental' | 'insular' | 'other'; label: string }[] = [
  { id: 'insular', label: 'Región Insular (Bioko, Annobón)' },
  { id: 'continental', label: 'Región Continental (Río Muni)' },
  { id: 'other', label: 'Otra' },
];

export const lbRegionLabel = (r: string | null | undefined): string =>
  LB_REGIONS.find((x) => x.id === r)?.label ?? '';

// ───────────────────────── panel de la tienda (Parte 39) ─────────────────────

/** Color de cada tono de estado (mismos colores que los pedidos). */
export const LB_TONE_COLOR: Record<'ok' | 'wait' | 'bad' | 'off', string> = {
  ok: brand.success,
  wait: brand.secondary,
  bad: brand.danger,
  off: neutro.n600,
};

export type LbProductAction = 'hide' | 'activate' | 'sold_out' | 'draft' | 'publish';

/**
 * Acciones que el **servidor acepta** desde cada estado, con su texto.
 * Es la copia exacta de la máquina del servidor (`setProductStatus`): si aquí
 * apareciera una acción que no aplica, el servidor responde 409 y se explica.
 */
export const LB_PRODUCT_ACTIONS: Record<LbProductStatus, { action: LbProductAction; label: string; primary?: boolean }[]> = {
  draft: [{ action: 'publish', label: 'Enviar a revisión', primary: true }],
  pending: [{ action: 'draft', label: 'Retirar de revisión' }],
  rejected: [
    { action: 'publish', label: 'Volver a enviar', primary: true },
    { action: 'draft', label: 'Pasar a borrador' },
  ],
  active: [
    { action: 'hide', label: 'Ocultar' },
    { action: 'sold_out', label: 'Marcar agotado' },
  ],
  hidden: [
    { action: 'activate', label: 'Volver a publicar', primary: true },
    { action: 'sold_out', label: 'Marcar agotado' },
  ],
  sold_out: [
    { action: 'activate', label: 'Volver a publicar', primary: true },
    { action: 'hide', label: 'Ocultar' },
  ],
};

/** Estados en los que el comerciante puede ajustar precio/existencias al vuelo. */
export const LB_QUICK_EDITABLE: LbProductStatus[] = ['active', 'hidden', 'sold_out'];

export const lbStockModeLabel = (m: string): string =>
  LB_STOCK_MODES.find((s) => s.id === m)?.label ?? m;
