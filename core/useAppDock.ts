/**
 * useAppDock — navegación ÚNICA del dock inferior para toda la app.
 * Evita handlers duplicados (perfil no tenía 'lifebook' ni 'mensajes') y
 * garantiza que desde cualquier pantalla con dock se pueda saltar a Life Book.
 *
 * ── Parte 31 (navegación fluida) ────────────────────────────────────────────
 * El dock es una navegación de PESTAÑAS, no una pila. Antes cada toque hacía
 * `router.push`, así que:
 *   · el Stack crecía sin límite (cada pestaña quedaba montada debajo, con su
 *     lista, sus imágenes y sus sondeos de red);
 *   · cada cambio arrastraba la animación de empuje de la pila (300 ms) y el
 *     montaje de una pantalla nueva → parpadeo y sensación de lentitud.
 * Ahora todos los destinos usan `router.replace`: se sustituye la pantalla
 * actual (pila acotada, memoria estable) y, con `animation: 'none'` en
 * `app/_layout.tsx` para las pestañas, el cambio es instantáneo.
 * Volver a la pestaña en la que ya estamos es un no-op.
 */
import { useRouter } from 'expo-router';
import type { FooterTab } from '../components/FloatingFooter';
import { ir as irSeguro } from '../constants/rutas';

export function useAppDock(active?: FooterTab) {
  const router = useRouter();
  return (t: FooterTab, city?: string) => {
    if (t === active) return; // ya estamos en esa pestaña
    switch (t) {
      case 'lifebook':
        irSeguro.libre('/lifebook', undefined, true);
        return;
      case 'inicio':
        irSeguro.libre('/', undefined, true);
        return;
      case 'taxi':
        router.replace((city ? { pathname: '/taxi', params: { city } } : '/taxi') as never);
        return;
      case 'mensajes':
        irSeguro.libre('/lifebook-messages', undefined, true);
        return;
      case 'perfil':
        irSeguro.libre('/profile', undefined, true);
        return;
      case 'monedero':
        irSeguro.libre('/monedero', undefined, true);
        return;
      default:
        return;
    }
  };
}
