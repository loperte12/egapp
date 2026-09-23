/**
 * Actualiza la fila 19-25 de la Fase 2 en el informe.
 * Uso: node pruebas/fase2-informe2.cjs
 */
const fs = require('fs');
const path = require('path');
const f = path.resolve(__dirname, '..', 'design-audit-report.md');
let t = fs.readFileSync(f, 'utf8');

const viejo = '| 19-25 | Modales, errores en línea, listas, imágenes, estados vacíos, códigos de error y plegado del checkout | ⏳ Pendiente | Siguiente tanda |';
const nuevo = [
  '| 19 | Hoja de diálogo única | 🟡 **Construida y adoptada en 1 pantalla** | Nuevo `Sheet` en el kit: cierra al tocar fuera, respeta el botón de atrás, **atrapa el foco** (`accessibilityViewIsModal`), titula con rol de cabecera y **no se cierra mientras trabaja**. Sustituye al `Alert` de confirmación de cancelar una orden en facturación. Quedan **51 archivos** con su propio `<Modal>`: la migración es por tandas |',
  '| 20 | Errores en línea en vez de modales | 🟡 **Construida y adoptada en 4 pantallas** | Nuevo `InlineError` (anuncia el error al lector de pantalla, vibra y ofrece **reintento**) + `Aviso` (el «toast» que no existía) + `useAviso()`. Adoptados en `monedero-recargar`, `monedero-retirar`, `food-checkout` y `billing-status`. Los `Alert` de las pantallas de dinero bajan de **34 a 12** |',
  '| 22 | `expo-image` | ✅ **Hecho** | `LazyImage` —que usan **alquiler, hoteles e intercity**— pasa de `Image` de React Native a `expo-image` con **caché en disco** (`cachePolicy="memory-disk"`) y fundido propio. Un solo archivo arregla tres verticales. Detalle: expo-image llama `fill` a lo que RN llama `stretch`, y `Animated.Image` no entiende `contentFit`, así que se envuelve el componente (`ImagenAnimada`) |',
  '| 23 | `EmptyState` en el kit | 🟡 **Construido y adoptado en 1 pantalla** | Nuevo `EmptyState` con título, explicación **y acción**. Adoptado en los movimientos del monedero: antes era un texto suelto («No hay movimientos de este tipo.») y ahora dice qué es, por qué está vacío y ofrece «Recargar con un agente». **Verificado en el dispositivo** |',
  '| 24 | Códigos de error en lengua humana | ✅ **Hecho** | Nuevo `constants/errores.ts` con `mensajeDeError()`: mapea los códigos del servidor (`KYC_REQUIRED`, `PIN_LOCKED`, `INSUFFICIENT_FUNDS`, `DAILY_LIMIT_EXCEEDED`, `OUT_OF_STOCK`…) a frases que dicen **qué pasó y qué hacer**, detecta los fallos de red y **limpia el ruido técnico** (`(ENOTFOUND)`, «Network request failed»). Adoptado en el monedero, la comida y facturación |',
  '| 21 · 25 | Listas paginadas y plegado del checkout | ⏳ Pendiente | Siguiente tanda |',
].join('\n');

if (!t.includes(viejo)) { console.log('  SIN ANCLA: fila 19-25'); process.exit(1); }
t = t.replace(viejo, nuevo);
fs.writeFileSync(f, t, 'utf8');
console.log('  OK fila 19-25 actualizada');
