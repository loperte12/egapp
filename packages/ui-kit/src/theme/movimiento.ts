/**
 * MOVIMIENTO — tokens de animación. Auditoría de micro-interacciones, Fase 0.
 *
 * POR QUÉ EXISTE ESTE FICHERO
 * La guarda de diseño (`pruebas/verifica-diseno.cjs`) vigila tres cosas: hex, `fontSize` y
 * `borderRadius`. **No vigila duraciones, curvas, opacidades, grosores de trazo ni umbrales de gesto.**
 * Y ahí es justo donde estaba el desmadre: antes de este fichero convivían en el código
 * **nueve opacidades distintas para el mismo gesto de pulsar** (0,4 · 0,45 · 0,5 · 0,6 · 0,7 · 0,85 ·
 * 0,9 · 0,92 · 0,98) y la misma curva `Easing.bezier(0.33, 1, 0.68, 1)` **copiada literal** en dos
 * ficheros. Sin tokens, la próxima micro-interacción añade el décimo valor.
 *
 * LAS DOS FAMILIAS DE DURACIÓN — y por qué no hay una sola
 * La guía pide **≤200 ms** para cambios de estado (Rauno Freiberg) y **<300 ms** para
 * micro-interacciones (Emil Kowalski). Pero un efecto que se MIRA —un relleno que entra, un trazo que
 * se dibuja por etapas— necesita más tiempo o no se llega a ver.
 * Un número único obligaría a elegir entre que un interruptor vaya lento o que un relleno no se vea.
 * Por eso hay dos familias, y cada efecto declara a cuál pertenece:
 *
 *   duracion.toque / cambio / salida   →  estado.  Nada por encima de 200 ms.
 *   duracion.escenificado / dibujado   →  escenificado.  300-500 ms, solo para lo que se contempla.
 *
 * Regla práctica: si el usuario tiene que ESPERAR a que acabe para seguir, es de `estado`.
 * Si puede seguir haciendo otra cosa mientras se ve, es de `escenificado`.
 *
 * Los nombres son de intención, no de valor: `cambio` es «algo ha cambiado de estado», no «180».
 * Es el mismo criterio que `escalas.ts:13` («los nombres son de intención, no de tamaño»).
 */

import { Easing } from 'react-native-reanimated';

/**
 * Duraciones, en milisegundos.
 *
 * `toque` es el acuse inmediato de que el dedo ha entrado: por debajo de 100 ms se percibe como
 * instantáneo, y por encima de 150 ms empieza a parecer que la app va lenta.
 */
export const duracion = {
  /** Acuse de pulsación. El más corto de todos: el dedo tiene que notarlo YA. */
  toque: 120,
  /** Un cambio de estado: marcar, desmarcar, elegir, cambiar de pestaña. */
  cambio: 180,
  /** Salida: cuando algo se va, puede ir algo más rápido que cuando entra. */
  salida: 160,
  /** Entrada de algo efímero (un aviso). Ya existe `Aviso.tsx` a 180 ms: este es ese valor. */
  entrada: 180,
  /** Efecto que se contempla: un relleno, una cascada, un asentamiento. 300-500 ms. */
  escenificado: 320,
  /** Dibujado por etapas (un trazo que se dibuja, un relleno largo). Es lo más lento que se permite. */
  dibujado: 420,
  /** Cadencia de un elemento que late o respira. No es una transición: es un ciclo. */
  latido: 900,
} as const;

/**
 * Curvas.
 *
 * `salida` es la del efecto de relleno ya probado en el banco: arranca rápido y frena al final, que es
 * lo que hace que un movimiento parezca que «llega» en vez de que «se corta».
 */
export const curva = {
  /** Arranca rápido y frena. La del efecto de relleno. Para entradas y cambios de estado. */
  salida: Easing.bezier(0.33, 1, 0.68, 1),
  /** Arranca lento y acelera. Para salidas: lo que se va, se va. */
  entrada: Easing.bezier(0.32, 0, 0.67, 0),
  /** Suave por los dos lados. Para cambios que no deben llamar la atención. */
  suave: Easing.inOut(Easing.quad),
  /** Lineal. Solo para bucles (giros, latidos) donde una curva se notaría al repetirse. */
  lineal: Easing.linear,
} as const;

/**
 * Opacidades de estado.
 *
 * Antes de esto había **nueve valores distintos** para el mismo gesto de pulsar según el fichero.
 * Estos son los tres registros que la propia casa ya usaba, con nombre:
 *   · `pulsado`       — el de `Tactil.tsx:27` (filas y controles de pantalla).
 *   · `pulsadoBotón`  — el que acompaña al `scale: 0.98` de `PrimaryButton.tsx` (acciones).
 *   · `deshabilitado` — el de `PrimaryButton.tsx:55`.
 */
export const opacidad = {
  /** Fila o control pulsado (`Tactil`). */
  pulsado: 0.6,
  /** Acción pulsada, junto al `scale` de 0.98. */
  pulsadoBoton: 0.9,
  /** Deshabilitado o cargando. */
  deshabilitado: 0.45,
  /** Elemento apagado del todo (una estrella sin puntuar, un punto inactivo). */
  apagado: 0.22,
  /** Velo sobre algo que está detrás de un diálogo. */
  velo: 0.45,
} as const;

/**
 * Umbrales de gesto, en píxeles o milisegundos.
 *
 * Los valores salen de los gestos que la app YA resuelve bien, no de la nada:
 * `SelectorDeVariante.tsx:229` (deslizar para cerrar) y `lifebook-videos.tsx:973`
 * (mantener pulsado para pausar) son la referencia.
 */
export const umbral = {
  /** Cuánto hay que deslizar para que cuente como deslizamiento y no como toque. */
  deslizamiento: 70,
  /** Movimiento mínimo para decidir la intención de un gesto (si es horizontal o vertical). */
  intencion: 6,
  /** Cuánto hay que mantener pulsado para que cuente. */
  mantener: 450,
  /**
   * Mantener pulsado en un sitio que además se desplaza (una lista, un vídeo).
   * Más corto que `mantener` a propósito: si se espera más, el dedo se mueve antes y el gesto no entra.
   */
  mantenerEnLista: 280,
} as const;

/**
 * Muelles, para `withSpring`.
 *
 * La app **no tenía ni una sola animación con física de muelle** (`withSpring` aparecía 0 veces).
 * Todo era `timing`. Estos son los tres comportamientos que hacen falta:
 *   · `asentar`  — llega y se queda. Para una marca que aparece.
 *   · `rebotar`  — pasa de largo y vuelve. Para un latido, un pulso de confirmación.
 *   · `seguir`   — sigue al dedo sin pasarse. Para algo que se arrastra.
 */
export const resorte = {
  /** Llega a su sitio y se queda, con un asentamiento apenas perceptible. */
  asentar: { damping: 18, stiffness: 220, mass: 0.9 },
  /** Pasa de largo y vuelve: es lo que hace que un efecto se sienta vivo. */
  rebotar: { damping: 12, stiffness: 320, mass: 0.7 },
  /** Sigue sin oscilar. Para lo que va pegado al dedo. */
  seguir: { damping: 26, stiffness: 300, mass: 1 },
} as const;

/**
 * Repeticiones.
 *
 * `withRepeat` con `reverse: true` para latidos y respiraciones. El número de vueltas va aquí y no
 * suelto en cada efecto: un bucle infinito sin control es una violación de WCAG 2.2.2 (contenido en
 * movimiento más de 5 s sin poder pararlo) y **la app ya tiene tres** (`taxi.tsx:156`,
 * `conductor.tsx:201`). Los efectos nuevos no repiten ese error: si algo late, late mientras el
 * usuario lo ha provocado y para solo.
 */
export const repeticion = {
  /** Late mientras dure el estado que lo provoca (p. ej. mientras se está grabando voz). */
  mientrasDure: -1,
} as const;

export type Duracion = keyof typeof duracion;
export type Curva = keyof typeof curva;
export type Opacidad = keyof typeof opacidad;
export type Umbral = keyof typeof umbral;
export type Resorte = keyof typeof resorte;
