// Actualiza la ficha del panel: geometría cerrada en árbol y producción; móvil pendiente por bloqueo.
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'D:/egapp/docs/fichas/v2-panel-categorias.md';
let t = readFileSync(F, 'utf8');

const viejo = '⚠️ **Pendiente de la ficha siguiente**: las celdas salen de **111 dp** de ancho en vez de **98,7** porque `Lista` ignora `PADDING_*` y el margen del contenedor raíz se pierde al incrustar el panel; el arreglo es envolver la rejilla en un `Contenedor` con margen (aplicado al panel suelto, no aún al compuesto). **No se afirma la geometría exacta.** |';

const nuevo = [
  '⚠️ **Geometría: cerrada en árbol y producción (17/10, más tarde).** Las celdas salían de **111 dp** porque `Lista` ignora `PADDING_*` y el margen del contenedor raíz se perdía al incrustar el panel. Ahora la rejilla va **dentro de un `Contenedor` con margen 18,3** (los dos servidores), y las columnas dan **(360 − 2·18,3 − 2·13,7)/3 = 98,67 dp**, que es lo medido. Verificado: oráculo 165/165 y **producción** sirviendo el envoltorio (`docs/evidencia/171025-v2-panel-margen-produccion.json`).',
  '⏳ **La confirmación en el móvil de ESTE cambio está pendiente**: el teléfono se quedó en la pantalla de patrón y no se puede desbloquear sin el patrón del dueño. Lo que SÍ se vio en el móvil antes fue el mecanismo hermano: el margen de 18,3 en la primera pastilla (mismo `Contenedor` + `PADDING_*`). |',
].join(' ');

if (!t.includes(viejo)) throw new Error('no encontré el párrafo de la geometría');
t = t.replace(viejo, nuevo);
writeFileSync(F, t);
console.log('ficha actualizada');
