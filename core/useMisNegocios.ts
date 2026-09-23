/**
 * useMisNegocios — ¿QUÉ NEGOCIOS TIENE ESTA CUENTA?
 *
 * Una sola fuente de verdad para el acceso del comerciante, que sale en DOS sitios (el bloque
 * «Tus negocios» del perfil y el menú lateral ☰). Si cada pantalla lo detectara por su cuenta,
 * en dos semanas una conocería el restaurante y la otra no.
 *
 * ── El estándar que aplica (`ESTANDAR-ENTORNOS-DE-CONTROL.md`) ────────────────
 * En Life Book se **publica** y se **descubre**; la gestión robusta vive en el **entorno de
 * control** de cada negocio; y el acceso a ese entorno es **del comerciante**, no del
 * consumidor. Una cuenta puede tener **varios negocios de verticales distintos** —medido: la
 * cuenta de pruebas tiene un hotel, un restaurante y es repartidor—, así que esto devuelve una
 * **lista**, no un booleano.
 *
 * ── Decisiones que no son obvias ─────────────────────────────────────────────
 * · **Las cuatro detecciones van en `Promise.allSettled`**: que el módulo de comida no
 *   conteste no puede dejar sin acceso al hotel. Cada fallo se traduce en «no tiene ese
 *   negocio», nunca en una pantalla rota.
 * · **`nota`** existe para poder decir la verdad a medias: un negocio cuyo entorno ya funciona
 *   pero que todavía no está publicado en Life Book lo dice, en vez de aparentar que está
 *   integrado. Hoy es el caso del restaurante y del trabajo.
 * · **El icono no se devuelve desde aquí** (esto es un `.ts`, no un `.tsx`): se devuelve el
 *   `vertical` y cada pantalla lo pinta con su icono. Así el hook no depende del kit de UI.
 */
import { useEffect, useRef, useState } from 'react';
import { hotelApi } from '../api/hotel';
import { commerceApi } from '../api/commerce';
import { foodApi } from '../api/food';
import { workApi } from '../api/work';

/** Los verticales que existen hoy. `(string & {})` deja pasar otros sin romper el tipado. */
export type VerticalNegocio = 'hotel' | 'restaurante' | 'mercado' | 'trabajo';

export interface MiNegocio {
  /** Identificador estable para listas y para `key`. */
  clave: string;
  vertical: VerticalNegocio;
  /** Qué es el entorno de control (lo que se va a abrir). */
  titulo: string;
  /** Una línea con lo que hay dentro, con datos reales. */
  detalle: string;
  /** Aviso honesto opcional (p. ej. «todavía no está publicado en Life Book»). */
  nota?: string;
  /** A dónde lleva. */
  ruta: string;
}

/**
 * Devuelve la lista de negocios de la cuenta. `null` mientras carga; `[]` si no tiene ninguno.
 *
 * Se recarga cuando cambia `cuenta` (el id del usuario): al cambiar de sesión, los negocios son
 * otros.
 */
export function useMisNegocios(cuenta?: string | null): { negocios: MiNegocio[] | null; cargando: boolean } {
  const [negocios, setNegocios] = useState<MiNegocio[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    setCargando(true);
    void (async () => {
      const [hotel, tienda, comida, ofertas] = await Promise.allSettled([
        hotelApi.myHotel(),
        commerceApi.myShop(),
        foodApi.ownerMe(),
        workApi.myJobs(),
      ]);
      if (!vivo.current) return;

      const lista: MiNegocio[] = [];

      // ── Alojamiento ──
      // UNA fila por negocio, no una por parte: el estándar dice «un negocio por fila, cada uno
      // con su entorno», y la puerta a «Gestión» vive DENTRO de «Hoy». Sacar aquí las dos partes
      // haría que la lista creciera con las partes de cada negocio en vez de con los negocios —
      // con cuatro verticales serían ocho filas, y con ocho serían dieciséis.
      const esHotel = hotel.status === 'fulfilled' && hotel.value?.hotel?.isHotel === true;
      if (esHotel && hotel.status === 'fulfilled') {
        const tipos = (hotel.value.rooms ?? []).length;
        lista.push({
          clave: 'hotel',
          vertical: 'hotel',
          titulo: 'Panel del hotel',
          detalle: tipos
            ? `Recepción y reservas de hoy · ${tipos} tipo(s) de habitación`
            : 'Recepción y reservas · todavía sin habitaciones',
          ruta: '/lifebook-hotel-panel',
        });
      }

      // ── Restaurante ──
      // La nota decía «Todavía no está publicado en Life Book: la migración está en curso». Eso
      // era verdad mientras el módulo de comida estaba a medias, pero ya NO: está desplegado
      // (migración 041 aplicada, servidor reiniciado, 17/17 comprobaciones) y los clientes SÍ
      // llegan a él desde el ☰ de Life Book («Comida Rápida» → `/food`). Dejar aquella frase era
      // decirle al dueño que su negocio no funciona cuando sí funciona. Lo que de verdad le sirve
      // saber es DÓNDE lo encuentra el cliente.
      if (comida.status === 'fulfilled' && comida.value?.restaurant) {
        lista.push({
          clave: 'restaurante',
          vertical: 'restaurante',
          titulo: 'Panel del restaurante',
          detalle: `${comida.value.restaurant.businessName} · cocina, menú y pedidos`,
          nota: 'Los clientes lo encuentran en Life Book, en «Comida Rápida».',
          ruta: '/food-owner',
        });
      }

      // ── Mercado (tienda de productos): ya vive en Life Book ──
      if (tienda.status === 'fulfilled' && tienda.value?.shop) {
        lista.push({
          clave: 'mercado',
          vertical: 'mercado',
          titulo: esHotel ? 'Mi escaparate' : 'Mi tienda',
          detalle: `${tienda.value.shop.name} · pedidos, publicaciones y existencias`,
          ruta: '/lifebook-merchant',
        });
      }

      // ── Trabajo: su entorno son ahora dos pantallas propias (Hoy y Gestión) ──
      if (ofertas.status === 'fulfilled' && (ofertas.value ?? []).length) {
        const jobs = ofertas.value ?? [];
        const activas = jobs.filter((j) => j.status !== 'closed');
        const sinResponder = activas.reduce(
          (n, j) => n + (j.applicants ?? []).filter(
            (a: { status: string }) => a.status !== 'selected' && a.status !== 'rejected').length,
          0,
        );
        lista.push({
          clave: 'trabajo',
          vertical: 'trabajo',
          titulo: 'Mis ofertas de trabajo',
          detalle: `${activas.length} activa(s) · ${sinResponder} candidatura(s) sin responder`,
          nota: 'Vive fuera de Life Book: las ofertas se gestionan en su propio entorno.',
          ruta: '/work-panel',
        });
      }

      setNegocios(lista);
      setCargando(false);
    })();
    return () => { vivo.current = false; };
  }, [cuenta]);

  return { negocios, cargando };
}
