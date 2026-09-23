/**
 * +NOT-FOUND — lo que expo-router abre cuando llega una dirección que no es de ninguna pantalla
 * (un enlace viejo compartido por WhatsApp, una ruta que se renombró, un dedazo).
 *
 * Antes se veía la pantalla por defecto de expo-router, **en inglés**: «Unmatched Route / Page
 * could not be found», con el enlace roto y un «Go back». Eso es lo que veía el usuario cuando
 * tocaba el botón «Emergencia» del inicio (que apuntaba a una pantalla inexistente).
 *
 * Aquí se reutiliza la MISMA pantalla de respaldo que usa el ayudante de navegación
 * (`app/ruta-fallida.tsx`), para que un enlace roto y una navegación imposible se expliquen
 * igual: en español, diciendo qué pasó y con salida al inicio.
 */
export { default } from './ruta-fallida';
