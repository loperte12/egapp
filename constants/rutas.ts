/**
 * MAPA DE RUTAS — la única lista de rutas de la app (generado, no escrito a mano).
 *
 * POR QUÉ EXISTE: la auditoría (`pruebas/auditar-rutas.cjs`) encontró que el sistema de
 * navegación fallaba en silencio: **1 enlace a una pantalla que no existe** (`/emergencia`),
 * **6 pantallas que nadie abría** y **204 navegaciones con `as never`**, que apagan el
 * comprobador de tipos. Por eso un destino mal escrito no lo veía ni TypeScript: se descubría en
 * el teléfono, delante del usuario.
 *
 * CÓMO SE USA:
 *   import { ir } from '../constants/rutas';
 *   ir.a.producto(id);                  // comprueba que la ruta y sus parámetros existen
 *   ir.libre('/lifebook-catalog');      // para rutas de listas/menús que vienen como texto
 *
 * El ayudante NUNCA navega a ciegas: si la ruta no está en este mapa, o si falta un parámetro
 * obligatorio (o llega vacío), manda a `/ruta-fallida`, que lo explica y da salida. Un botón
 * que no hace nada es peor que un aviso.
 *
 * REGENERAR: node pruebas/generar-mapa-rutas.cjs
 */
import { router } from 'expo-router';

export interface DefinicionRuta {
  ruta: string;
  /** Parámetros que NO pueden faltar ni llegar vacíos. */
  params: string[];
}

export const RUTAS = {
  inicio: { ruta: '/', params: [] },
  agente: { ruta: '/agente', params: [] },
  agenteEscaner: { ruta: '/agente-escaner', params: [] },
  alquiler: { ruta: '/alquiler', params: [] },
  alquilerDetalle: { ruta: '/alquiler-detalle', params: [] },
  alquilerPlanes: { ruta: '/alquiler-planes', params: [] },
  alquilerPublicar: { ruta: '/alquiler-publicar', params: [] },
  auth: { ruta: '/auth', params: [] },
  billingCheckout: { ruta: '/billing-checkout', params: [] },
  billingStatus: { ruta: '/billing-status', params: [] },
  buscar: { ruta: '/buscar', params: [] },
  conductor: { ruta: '/conductor', params: [] },
  conductorHub: { ruta: '/conductor-hub', params: [] },
  documents: { ruta: '/documents', params: [] },
  driverOnboarding: { ruta: '/driver-onboarding', params: [] },
  driverProfile: { ruta: '/driver-profile', params: [] },
  ecomerse: { ruta: '/ecomerse', params: [] },
  ecomerseCheckout: { ruta: '/ecomerse-checkout', params: [] },
  ecomerseDetail: { ruta: '/ecomerse-detail', params: [] },
  ecomerseDireccion: { ruta: '/ecomerse-direccion', params: [] },
  ecomerseDirecciones: { ruta: '/ecomerse-direcciones', params: [] },
  ecomerseDocs: { ruta: '/ecomerse-docs', params: [] },
  ecomerseFavorites: { ruta: '/ecomerse-favorites', params: [] },
  ecomerseMensajes: { ruta: '/ecomerse-mensajes', params: [] },
  ecomerseMensajesAvisos: { ruta: '/ecomerse-mensajes-avisos', params: [] },
  ecomerseMensajesChat: { ruta: '/ecomerse-mensajes-chat', params: [] },
  ecomerseOrders: { ruta: '/ecomerse-orders', params: [] },
  ecomersePerfil: { ruta: '/ecomerse-perfil', params: [] },
  ecomersePerfilReembolso: { ruta: '/ecomerse-perfil-reembolso', params: [] },
  ecomersePerfilReembolsos: { ruta: '/ecomerse-perfil-reembolsos', params: [] },
  ecomersePerfilTiendas: { ruta: '/ecomerse-perfil-tiendas', params: [] },
  ecomersePlanes: { ruta: '/ecomerse-planes', params: [] },
  ecomerseSeller: { ruta: '/ecomerse-seller', params: [] },
  ecomerseSubcategoria: { ruta: '/ecomerse-subcategoria', params: [] },
  ecomerseTienda: { ruta: '/ecomerse-tienda', params: [] },
  ecomerseTiendas: { ruta: '/ecomerse-tiendas', params: [] },
  editProfile: { ruta: '/edit-profile', params: [] },
  emergencia: { ruta: '/emergencia', params: [] },
  food: { ruta: '/food', params: [] },
  foodCheckout: { ruta: '/food-checkout', params: [] },
  foodMenu: { ruta: '/food-menu', params: [] },
  foodOrders: { ruta: '/food-orders', params: [] },
  foodOwner: { ruta: '/food-owner', params: [] },
  foodRider: { ruta: '/food-rider', params: [] },
  intercity: { ruta: '/intercity', params: [] },
  intercityPlanes: { ruta: '/intercity-planes', params: [] },
  intercityPublish: { ruta: '/intercity-publish', params: [] },
  kyc: { ruta: '/kyc', params: [] },
  kycCapture: { ruta: '/kyc/capture', params: [] },
  kycLiveness: { ruta: '/kyc/liveness', params: [] },
  kycStatus: { ruta: '/kyc/status', params: [] },
  landlordProfile: { ruta: '/landlord-profile', params: [] },
  lifebook: { ruta: '/lifebook', params: [] },
  lifebookAi: { ruta: '/lifebook-ai', params: [] },
  lifebookBlocks: { ruta: '/lifebook-blocks', params: [] },
  lifebookCarrito: { ruta: '/lifebook-carrito', params: [] },
  lifebookCarritoCheckout: { ruta: '/lifebook-carrito-checkout', params: [] },
  lifebookCatalog: { ruta: '/lifebook-catalog', params: [] },
  lifebookChatId: { ruta: '/lifebook-chat/[id]', params: ['id'] },
  lifebookCheckout: { ruta: '/lifebook-checkout', params: [] },
  lifebookCompose: { ruta: '/lifebook-compose', params: [] },
  lifebookDinero: { ruta: '/lifebook-dinero', params: [] },
  lifebookExplore: { ruta: '/lifebook-explore', params: [] },
  lifebookGroupCreate: { ruta: '/lifebook-group-create', params: [] },
  lifebookGroups: { ruta: '/lifebook-groups', params: [] },
  lifebookGuardados: { ruta: '/lifebook-guardados', params: [] },
  lifebookHotel: { ruta: '/lifebook-hotel', params: [] },
  lifebookHotelCalendario: { ruta: '/lifebook-hotel-calendario', params: [] },
  lifebookHotelDetalle: { ruta: '/lifebook-hotel-detalle', params: [] },
  lifebookHotelFechas: { ruta: '/lifebook-hotel-fechas', params: [] },
  lifebookHotelGestion: { ruta: '/lifebook-hotel-gestion', params: [] },
  lifebookHotelHabitacion: { ruta: '/lifebook-hotel-habitacion', params: [] },
  lifebookHotelHabitaciones: { ruta: '/lifebook-hotel-habitaciones', params: [] },
  lifebookHotelPanel: { ruta: '/lifebook-hotel-panel', params: [] },
  lifebookHotelPerfil: { ruta: '/lifebook-hotel-perfil', params: [] },
  lifebookHotelResena: { ruta: '/lifebook-hotel-resena', params: [] },
  lifebookHotelReserva: { ruta: '/lifebook-hotel-reserva', params: [] },
  lifebookHotelReservar: { ruta: '/lifebook-hotel-reservar', params: [] },
  lifebookHotelReservas: { ruta: '/lifebook-hotel-reservas', params: [] },
  lifebookHotelResultados: { ruta: '/lifebook-hotel-resultados', params: [] },
  lifebookHotelValoraciones: { ruta: '/lifebook-hotel-valoraciones', params: [] },
  lifebookInbox: { ruta: '/lifebook-inbox', params: [] },
  lifebookInboxComments: { ruta: '/lifebook-inbox-comments', params: [] },
  lifebookInboxFollowers: { ruta: '/lifebook-inbox-followers', params: [] },
  lifebookInboxLikes: { ruta: '/lifebook-inbox-likes', params: [] },
  lifebookMedia: { ruta: '/lifebook-media', params: [] },
  lifebookMerchant: { ruta: '/lifebook-merchant', params: [] },
  lifebookMerchantGestion: { ruta: '/lifebook-merchant-gestion', params: [] },
  lifebookMerchantProducts: { ruta: '/lifebook-merchant-products', params: [] },
  lifebookMerchantSettings: { ruta: '/lifebook-merchant-settings', params: [] },
  lifebookMessageSearch: { ruta: '/lifebook-message-search', params: [] },
  lifebookMessages: { ruta: '/lifebook-messages', params: [] },
  lifebookOrderId: { ruta: '/lifebook-order/[id]', params: ['id'] },
  lifebookOrders: { ruta: '/lifebook-orders', params: [] },
  lifebookPlayer: { ruta: '/lifebook-player', params: [] },
  lifebookPostId: { ruta: '/lifebook-post/[id]', params: ['id'] },
  lifebookProductId: { ruta: '/lifebook-product/[id]', params: ['id'] },
  lifebookScan: { ruta: '/lifebook-scan', params: [] },
  lifebookSearch: { ruta: '/lifebook-search', params: [] },
  lifebookSell: { ruta: '/lifebook-sell', params: [] },
  lifebookShopId: { ruta: '/lifebook-shop/[id]', params: ['id'] },
  lifebookStore: { ruta: '/lifebook-store', params: [] },
  lifebookUser: { ruta: '/lifebook-user', params: [] },
  lifebookVideos: { ruta: '/lifebook-videos', params: [] },
  lifebookVistos: { ruta: '/lifebook-vistos', params: [] },
  monedero: { ruta: '/monedero', params: [] },
  monederoMovimientos: { ruta: '/monedero-movimientos', params: [] },
  monederoPin: { ruta: '/monedero-pin', params: [] },
  monederoRecargar: { ruta: '/monedero-recargar', params: [] },
  monederoRetirar: { ruta: '/monedero-retirar', params: [] },
  myTickets: { ruta: '/my-tickets', params: [] },
  profile: { ruta: '/profile', params: [] },
  promoId: { ruta: '/promo/[id]', params: ['id'] },
  reserva: { ruta: '/reserva', params: [] },
  rutaFallida: { ruta: '/ruta-fallida', params: [] },
  scanner: { ruta: '/scanner', params: [] },
  serviceId: { ruta: '/service/[id]', params: ['id'] },
  settings: { ruta: '/settings', params: [] },
  status: { ruta: '/status', params: [] },
  taxi: { ruta: '/taxi', params: [] },
  tienda: { ruta: '/tienda', params: [] },
  tiendaAnuncios: { ruta: '/tienda/anuncios', params: [] },
  tiendaCombinaciones: { ruta: '/tienda/combinaciones', params: [] },
  tiendaPedidos: { ruta: '/tienda/pedidos', params: [] },
  tiendaPerfil: { ruta: '/tienda/perfil', params: [] },
  tiendaPublicar: { ruta: '/tienda/publicar', params: [] },
  tripsHistory: { ruta: '/trips-history', params: [] },
  work: { ruta: '/work', params: [] },
  workDetail: { ruta: '/work-detail', params: [] },
  workGestion: { ruta: '/work-gestion', params: [] },
  workPanel: { ruta: '/work-panel', params: [] },
  workPlanes: { ruta: '/work-planes', params: [] },
  workPublish: { ruta: '/work-publish', params: [] },
} as const satisfies Record<string, DefinicionRuta>;

export type NombreRuta = keyof typeof RUTAS;

/** Pantalla que explica que algo no se pudo abrir. */
export const RUTA_FALLIDA = '/ruta-fallida';
/** Inicio: la salida limpia que siempre funciona. */
export const RUTA_INICIO = '/';

const vacio = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/**
 * Comprueba una ruta antes de navegar. Devuelve el motivo si NO se puede, o null si está bien.
 * Se exporta para poder probarlo (y para avisar sin navegar, si algún día hace falta).
 */
export function problemaDeRuta(ruta: string, params?: Record<string, unknown>): string | null {
  if (vacio(ruta)) return 'La ruta llegó vacía.';
  const def = (RUTAS as Record<string, DefinicionRuta>)[Object.keys(RUTAS).find(
    (k) => (RUTAS as Record<string, DefinicionRuta>)[k].ruta === ruta,
  ) ?? ''];
  if (!def) return `La ruta "${ruta}" no existe en el mapa de rutas.`;
  const faltan = def.params.filter((p) => vacio(params?.[p]));
  if (faltan.length) return `A "${ruta}" le falta ${faltan.length === 1 ? 'el dato' : 'los datos'}: ${faltan.join(', ')}.`;
  // Rutas con parámetro pero sin ninguno declarado: se comprueba en la propia dirección.
  if (/\[|:/.test(ruta) && !def.params.length) return `La ruta "${ruta}" tiene un hueco sin rellenar.`;
  return null;
}

function navegar(ruta: string, params?: Record<string, unknown>, reemplazar = false) {
  const problema = problemaDeRuta(ruta, params);
  if (problema) {
    // Se avisa en consola (para el desarrollo) y se lleva a la pantalla que lo explica, con el
    // motivo y el destino, en vez de dejar la pulsación sin efecto.
    console.warn('[rutas]', problema, { ruta, params });
    router[reemplazar ? 'replace' : 'push']({
      pathname: RUTA_FALLIDA,
      params: { motivo: problema, destino: ruta },
    } as never);
    return;
  }  const destino = (Object.values(RUTAS) as DefinicionRuta[]).find((d) => d.ruta === ruta);
  if (destino && destino.params.length) {
    router[reemplazar ? 'replace' : 'push']({ pathname: ruta, params: params ?? {} } as never);
  } else if (params && Object.keys(params).length) {
    router[reemplazar ? 'replace' : 'push']({ pathname: ruta, params } as never);
  } else {
    router[reemplazar ? 'replace' : 'push'](ruta as never);
  }
}

/**
 * Lleva a la pantalla que explica el problema. Se usa cuando lo que falla NO es una ruta
 * (por ejemplo: no se pudo resolver el perfil porque la sesión venía a medias). Antes esos
 * casos dejaban la pulsación sin ningún efecto.
 */
function explicar(motivo: string, destino = '') {
  console.warn('[rutas]', motivo, { destino });
  router.push({ pathname: RUTA_FALLIDA, params: { motivo, destino } } as never);
}

/**
 * El ayudante. Tres formas, para que no haya excusa para navegar a ciegas:
 *   ir.a.producto(id)         → ruta conocida con su parámetro (lo comprueba)
 *   ir.libre('/lo-que-sea')   → cuando la ruta viene de una lista/menú (la valida igual)
 *   ir.destino({...})         → destinos ya construidos como objeto
 *   ir.inicio()               → la salida que siempre funciona
 */
export const ir = {
  /** Navega a una ruta del mapa, comprobando que sus parámetros vienen. */
  a: (nombreRuta: NombreRuta, params?: Record<string, unknown>, reemplazar = false) => {
    navegar(RUTAS[nombreRuta].ruta, params, reemplazar);
  },
  /** Navega a una ruta escrita como texto (listas, menús, ajustes). Se valida igual. */
  libre: (ruta: string, params?: Record<string, unknown>, reemplazar = false) => {
    navegar(ruta, params, reemplazar);
  },
  /** Siempre disponible: el inicio. */
  inicio: (reemplazar = false) => navegar(RUTA_INICIO, undefined, reemplazar),
  /**
   * Para destinos que ya vienen construidos como objeto (`{ pathname, params }`), que es lo que
   * devuelven varios ayudantes de la app (`destinoMiPerfilLifeBook`, menús, etc.). Se valida su
   * `pathname` y sus parámetros igual que los demás.
   */
  destino: (destino: string | { pathname?: string; params?: Record<string, unknown> } | null | undefined,
            motivoSiFalta = 'No se pudo resolver a dónde ir.') => {
    if (destino === null || destino === undefined) { explicar(motivoSiFalta, ''); return; }
    if (typeof destino === 'string') { navegar(destino); return; }
    const ruta = String(destino.pathname ?? '');
    const problema = problemaDeRuta(ruta, destino.params);
    if (problema) { explicar(problema, ruta); return; }
    navegar(ruta, destino.params);
  },
  /** Lleva a la pantalla que explica el problema (para casos que no son una ruta). */
  explicar,
  /** Vuelve atrás si se puede; si no (se abrió por enlace), va al inicio. */
  atras: () => {
    try {
      if (router.canGoBack()) router.back();
      else navegar(RUTA_INICIO, undefined, true);
    } catch {
      navegar(RUTA_INICIO, undefined, true);
    }
  },
};
