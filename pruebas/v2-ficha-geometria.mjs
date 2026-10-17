// Ficha del panel: sustituye la fila «Móvil» por la verdad actual (móvil verificado + geometría cerrada
// en árbol y producción, con la confirmación en móvil pendiente por el patrón del teléfono).
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'D:/egapp/docs/fichas/v2-panel-categorias.md';
const lineas = readFileSync(F, 'utf8').split(/\r?\n/);

const i = lineas.findIndex((l) => l.startsWith('| **Móvil** |'));
if (i < 0) throw new Error('no encontré la fila Móvil');

lineas[i] = '| **Móvil** | ✅ **panel con las categorías REALES** (Hombre · Mujer · Bebés y niños · Alimentación · Hogar y limpieza · Muebles y decoración…), 3 columnas, celdas de **34,7 dp** de alto. Captura: `docs/evidencia/171025-v2-panel-clasificacion.png`. ⚠️ Las celdas salían de **111 dp** de ancho (no 98,7): ver la fila siguiente. |';
lineas.splice(i + 1, 0,
  '| **Geometría** | ✅ **cerrada en árbol y producción**: la rejilla va dentro de un `Contenedor` con margen **18,3** en los dos servidores → (360 − 2·18,3 − 2·13,7)/3 = **98,67 dp**, que es lo medido. Oráculo **165/165** y producción sirviendo el envoltorio (`docs/evidencia/171025-v2-panel-margen-produccion.json`). ⏳ **La confirmación de este cambio en el móvil queda pendiente**: el teléfono se quedó en la pantalla de patrón y no se puede desbloquear sin el patrón del dueño. Lo que sí se vio en el móvil fue el mecanismo hermano: el margen 18,3 de la primera pastilla (mismo `Contenedor` + `PADDING_*`). |',
);

writeFileSync(F, lineas.join('\n'));
console.log('ficha del panel actualizada (fila Móvil + fila Geometría)');
