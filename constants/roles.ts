/**
 * Roles de entrada por servicio (RoleGate).
 * Al entrar desde el Home en un servicio con perfiles, el usuario elige el suyo
 * y se recuerda en el dispositivo. Excepciones: taxi (directo) e intercity
 * (solo pasajero; el conductor entra por "Ser Conductor").
 *
 * MERCADO SALIÓ DE AQUÍ (zona del comerciante, 20-sep-2026). Antes «Mercado» preguntaba
 * «¿Comprar o Vender?» y la venta era un **desvío dentro del módulo del comprador**: el comerciante
 * entraba por la misma puerta que quien compra y su zona no existía como tal. Ahora el Mercado abre
 * directo `/ecomerse` (un toque menos para lo que hace casi todo el mundo) y **vender tiene su
 * propia puerta en el Inicio**: la celda «Mi tienda» → `/tienda`, que es un modo aparte con barra
 * propia. Es la misma separación que hacen Lilishop y Mall4j: la zona del vendedor se separa **en
 * la arquitectura**, no con permisos dentro de una pantalla compartida.
 */

export interface RoleOption {
  id: string;
  label: string;
  hint: string;
  emoji: string;
  route: string;
}

export const ROLE_SERVICES: Record<string, RoleOption[]> = {
  work: [
    { id: 'seeker', label: 'Buscar empleo', hint: 'Veo ofertas, me postulo y contacto reclutadores', emoji: '💼', route: '/work' },
    { id: 'recruiter', label: 'Publicar empleo (reclutador)', hint: 'Gestiono vacantes y candidatos', emoji: '🏢', route: '/work-publish' },
  ],
  alquiler: [
    { id: 'search', label: 'Buscar alquiler', hint: 'Exploro viviendas y locales disponibles', emoji: '🏠', route: '/alquiler' },
    { id: 'landlord', label: 'Publicar alquiler (arrendador)', hint: 'Publico y gestiono mis anuncios', emoji: '🗝️', route: '/alquiler-publicar' },
  ],
  food: [
    { id: 'customer', label: 'Pedir comida', hint: 'Veo restaurantes y hago pedidos', emoji: '🍔', route: '/food' },
    { id: 'owner', label: 'Mi restaurante', hint: 'Gestiono carta y pedidos de mi local', emoji: '👨‍🍳', route: '/food-owner' },
    { id: 'rider', label: 'Soy repartidor', hint: 'Acepto entregas y marco su estado', emoji: '🛵', route: '/food-rider' },
  ],
};

export const roleOptionsFor = (serviceId: string): RoleOption[] => ROLE_SERVICES[serviceId] ?? [];
export const isRoleService = (serviceId: string) => !!ROLE_SERVICES[serviceId];
