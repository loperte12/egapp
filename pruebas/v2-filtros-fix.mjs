// Corrección de la rebanada de filtros:
//
// 1. **La pastilla lleva su id LITERAL en `ONPRESS`.** No hay `$item` en un carril fijo (no es una lista
//    de datos): con `$item.id` el toque llegaría vacío y la pastilla estaría muda.
// 2. **«全部» tiene id propio (`todos`)**, no cadena vacía: un `ONPRESS: ''` es un toque sin destino.
// 3. El defecto es `todos`, para que al abrir la pantalla «全部» esté resaltada de verdad.
import { readFileSync, writeFileSync } from 'node:fs';

const FICHEROS = [
  'D:/egapp/tools/servidor-ui.mjs',
  'D:/egapp/.auditoria-servicios/backend/dist/src/ecomerse/ecomerse-ui.controller.js',
];

for (const F of FICHEROS) {
  let t = readFileSync(F, 'utf8').replace(/\r\n/g, '\n');

  // a) los ids de los filtros
  t = t.replace(
    "    { id: '', nombre: '全部' },",
    "    { id: 'todos', nombre: '全部' },",
  );

  // b) `ONPRESS` con el id literal, y el comentario que lo explica
  t = t.replace(
    "            [K.ONPRESS]: '$item.id',\n        },\n        hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO",
    "            // ID LITERAL: no hay `$item` en un carril fijo. Con `$item.id` el toque llegaría vacío.\n            [K.ONPRESS]: id,\n        },\n        hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO",
  );
  t = t.replace(
    "      [K.ONPRESS]: '$item.id',\n    },\n    hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO",
    "      // ID LITERAL: no hay `$item` en un carril fijo.\n      [K.ONPRESS]: id,\n    },\n    hijos: [texto(nombre + (caret ? ' ▾' : ''), FILTROS_V2.TAMANO",
  );

  // c) defecto `todos`
  t = t.replace("    const elegida = String(activa ?? '');", "    const elegida = String(activa || 'todos');");
  t = t.replace("  const elegida = String(activa ?? '');", "  const elegida = String(activa || 'todos');");
  t = t.replace("    return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa ?? '') };",
    "    return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa || 'todos') };");
  t = t.replace("  return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa ?? '') };",
    "  return { filtros: FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })), activa: String(activa || 'todos') };");

  writeFileSync(F, t);
  console.log('corregido: ' + F.split('/').pop());
}
