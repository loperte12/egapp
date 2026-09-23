/**
 * MOVIMIENTO REDUCIDO — la preferencia del sistema que la app ignoraba.
 *
 * POR QUÉ EXISTE
 * La auditoría de diseño (D-15, informe del 17/09/2026) lo dejó escrito: **0 referencias a
 * `isReduceMotionEnabled`, `prefers-reduced-motion` o `AccessibilityInfo`** en toda la app. Y la
 * auditoría de micro-interacciones lo confirmó fichero a fichero. O sea: quien tiene sensibilidad al
 * movimiento —o simplemente ha activado la opción en su teléfono— **no puede desactivar nada**.
 * Eso incumple WCAG 2.3.3 y, con la app llena de rebotes a partir de ahora, era el bloqueante número
 * uno antes de escribir un solo efecto.
 *
 * CÓMO SE USA
 *   const movReducido = useMovimientoReducido();
 *   … if (movReducido) { /* estado final, sin animar *\/ }
 *
 * LA REGLA QUE GOBIERNA ESTO (y que no es «quitar todo»)
 * Con movimiento reducido **solo se apaga lo puramente decorativo**. Todo lo demás **degrada a su
 * estado final**, no desaparece: el color cambia, el texto cambia, `accessibilityState` cambia. El
 * motivo es que hoy no hay ningún canal alternativo que comunique el cambio: los anuncios activos son
 * dos en todo el repositorio. Quitar el rebote de una casilla está bien; dejar la casilla sin marcar
 * visualmente sería peor que el problema que se arregla.
 *
 * Se lee UNA vez por componente y no una vez por app a propósito: la preferencia puede cambiar con la
 * app abierta (el usuario la activa desde los ajustes del sistema), y hay que reaccionar sin reiniciar.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useMovimientoReducido(): boolean {
  /* Se empieza en `false` (animar) y se corrige en cuanto se sabe. El motivo de no empezar en `true`
     es que la consulta es asíncrona: arrancar en `true` haría que TODO apareciera de golpe en el
     primer fotograma, también para quien no ha pedido movimiento reducido. */
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    // En web `AccessibilityInfo` puede no traer estos métodos: se comprueba antes de usarlos.
    const leer = () => {
      try {
        const p = AccessibilityInfo.isReduceMotionEnabled?.();
        // Devuelve promesa en las versiones recientes y booleano en las antiguas.
        if (typeof p === 'boolean') setReducido(p);
        else void p?.then((v) => setReducido(!!v)).catch(() => {});
      } catch {
        /* si no se puede leer, se anima: es el comportamiento por defecto de siempre */
      }
    };
    leer();

    /* Suscripción al cambio en caliente. En web no existe: se degrada a no escuchar. */
    let suscripcion: { remove?: () => void } | undefined;
    try {
      if (Platform.OS !== 'web') {
        suscripcion = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReducido(!!v));
      }
    } catch {
      /* sin suscripción: se queda con el valor leído al montar */
    }

    return () => {
      try {
        suscripcion?.remove?.();
      } catch {
        /* nada que limpiar */
      }
    };
  }, []);

  return reducido;
}
