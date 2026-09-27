/**
 * servicios — CÓMO SE LLAMA CADA SERVICIO EN PANTALLA.
 *
 * POR QUÉ SALE DE LA FICHA (27-sep-2026). Este diccionario vivía dentro de
 * `app/lifebook-hotel-detalle.tsx` como constante local, y llegó la segunda pantalla que necesita
 * los MISMOS nombres: la tarjeta de la habitación (`HotelRoomCard`), que enseña los servicios del
 * tipo de habitación con el mismo vocabulario que los del alojamiento.
 *
 * Duplicarlo habría creado dos listas que se separan en cuanto alguien añada una clave — y el
 * huésped leería «Lavandería» en la ficha y `lavanderia` en la tarjeta. El diccionario no sabe de
 * pantallas: sabe de claves.
 *
 * LAS CLAVES LAS DEFINE EL SERVIDOR. Aquí solo se traducen. Una clave que no esté en este mapa se
 * pinta con sus guiones bajos cambiados por espacios (nunca se esconde en silencio): es la misma
 * regla que ya aplicaba la ficha.
 */
export const ETIQUETA_SERVICIO: Record<string, string> = {
  wifi: 'Wi-Fi', desayuno: 'Desayuno', aire: 'Aire acondicionado', piscina: 'Piscina',
  parking: 'Aparcamiento', restaurante: 'Restaurante', bar: 'Bar', gimnasio: 'Gimnasio',
  recepcion_24h: 'Recepción 24 h', agua_caliente: 'Agua caliente', generador: 'Generador',
  lavanderia: 'Lavandería', tv: 'TV', terraza: 'Terraza', ascensor: 'Ascensor',
  admite_mascotas: 'Admite mascotas', adaptado: 'Adaptado', cocina: 'Cocina',
  nevera: 'Nevera', caja_fuerte: 'Caja fuerte', seguridad: 'Seguridad',
};

/** El nombre legible de una clave, con o sin traducción. */
export function nombreServicio(clave: string): string {
  return ETIQUETA_SERVICIO[clave] ?? clave.replace(/_/g, ' ');
}
