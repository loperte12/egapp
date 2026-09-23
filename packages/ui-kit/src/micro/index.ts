/**
 * MICRO-INTERACCIONES — barrel del subdirectorio.
 *
 * El punto de entrada real del paquete sigue siendo `../index.ts`; esto existe para que el
 * subdirectorio tenga su propia lista y se pueda leer de un vistazo qué hay dentro.
 *
 * POR QUÉ ESTOS VIVEN EN EL KIT Y NO EN `components/`
 * Tres razones, las tres medidas:
 *   1. La guarda de diseño (`pruebas/verifica-diseno.cjs:29`) **excluye** `packages/ui-kit`, así que
 *      aquí no hace falta reescribir la base cada vez que un componente usa un valor.
 *   2. El `README.md` del kit ya dice que los equipos de producto **no** deben crear sus propios
 *      inputs: se consumen del kit. Esto es exactamente eso.
 *   3. `metro.config.js` ya vigila `packages/` y `tsconfig.json` ya mapea `@egrouteplan/ui-kit`.
 *
 * ESTADO: primera tanda de tres (los que más arreglan con menos código). Faltan los demás; cada uno
 * entra cuando tenga claro qué sustituye, no antes.
 *   · `Segmentado` — mueve el efecto de `app/banco-1-pastilla.tsx` a la app de verdad.
 *   · `Corazon`    — 1 componente para 5 pantallas, y hoy el temporizador está duplicado en dos.
 *   · `Estrellas`  — 1 componente para 4 flujos de reputación que hoy tienen 4 implementaciones.
 *
 * LOS QUE **NO** SE VAN A PORTAR, y por qué (para que no se intente otra vez):
 *   · «botón con mecha»: una espera impuesta que no informa, y sin equivalente para lector de
 *     pantalla. La app ya confirma lo destructivo con `Sheet`, que además se anuncia.
 *   · «fondo animado» en la pantalla de inicio: ahí hay un mapa a pantalla completa; el fondo no se
 *     vería y competiría por fotogramas con el WebView.
 */
export { Segmentado, type SegmentadoProps, type SegmentoOpcion } from './Segmentado';
export { Corazon, type CorazonProps } from './Corazon';
export { Estrellas, type EstrellasProps } from './Estrellas';
