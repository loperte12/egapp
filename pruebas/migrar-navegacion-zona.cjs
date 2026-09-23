/**
 * migrar-navegacion-zona.cjs — pasa las navegaciones de una ZONA por el ayudante `irSeguro`.
 *
 * POR QUÉ ASÍ: hay 488 navegaciones y 204 con `as never`. Reescribirlas a mano es donde se cuelan
 * los errores, así que se hace con una transformación mecánica, se cuenta lo cambiado por fichero
 * y se comprueba después con `npm run rutas` (que dice cuántas pasan ya por el ayudante).
 *
 * Qué transforma (solo lo que está en UNA línea, que es la mayoría):
 *   router.push({ pathname: '/x/[id]', params: { id } } as never)  →  irSeguro.libre('/x/[id]', { id })
 *   router.push('/x' as never)                                     →  irSeguro.libre('/x')
 *   router.replace({ pathname: '/x', params: {…} } as never)      →  irSeguro.libre('/x', {…}, true)
 *
 * Lo que NO toca (se migra en otra pasada, a mano y mirando cada caso): llamadas repartidas en
 * varias líneas, y `router.push(variable)` con variables (esas necesitan `irSeguro.libre(variable)`).
 *
 * Uso: node pruebas/migrar-navegacion-zona.cjs [--aplicar]
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const APLICAR = process.argv.includes('--aplicar');

/** Las zonas, por orden de prioridad del dueño. Se elige con `--zona=nombre`. */
const ZONAS = {
  /** Hecha el 14/09/2026: lo que ve el usuario al entrar y todo Life Book. */
  'inicio-lifebook': [
    'app/index.tsx',
    'app/profile.tsx',
    'app/lifebook.tsx',
    'app/lifebook-user.tsx',
    'app/lifebook-messages.tsx',
    'app/lifebook-search.tsx',
    'app/lifebook-videos.tsx',
    'app/lifebook-chat/[id].tsx',
    'app/lifebook-post/[id].tsx',
    'app/lifebook-groups.tsx',
    'app/lifebook-catalog.tsx',
    'app/lifebook-carrito.tsx',
    'core/useAppDock.ts',
  ],
  /**
   * TIENDA Y COMERCIO: es donde más rutas DINÁMICAS hay (`/lifebook-product/[id]`,
   * `/lifebook-shop/[id]`), y por tanto donde un id vacío deja un botón mudo o una pantalla
   * en blanco. El panel del comerciante es el que más navega de toda la app (14 en un fichero).
   */
  tienda: [
    'app/lifebook-catalog.tsx',
    'app/lifebook-carrito.tsx',
    'app/lifebook-shop/[id].tsx',
    'app/lifebook-product/[id].tsx',
    'app/lifebook-store.tsx',
    'app/lifebook-sell.tsx',
    'app/lifebook-orders.tsx',
    'app/lifebook-checkout.tsx',
    'app/lifebook-merchant.tsx',
    'app/lifebook-merchant-products.tsx',
    'app/lifebook-merchant-gestion.tsx',
    'app/lifebook-merchant-settings.tsx',
    'components/lifebook/TarjetaProducto.tsx',
  ],
};

const zonaPedida = (process.argv.find((a) => a.startsWith('--zona=')) ?? '--zona=tienda').split('=')[1];
const ZONA = ZONAS[zonaPedida];
if (!ZONA) {
  console.error(`Zona desconocida: ${zonaPedida}. Hay: ${Object.keys(ZONAS).join(', ')}`);
  process.exit(1);
}
console.log(`ZONA: ${zonaPedida} (${ZONA.length} ficheros)`);

let total = 0;
const informe = [];

for (const rel of ZONA) {
  const ruta = path.join(RAIZ, rel);
  if (!fs.existsSync(ruta)) { informe.push(`  (no existe) ${rel}`); continue; }
  let t = fs.readFileSync(ruta, 'utf8');
  const antes = t;
  let n = 0;

  // 1) push/replace con objeto de una sola línea
  t = t.replace(/router\.(push|replace)\(\{\s*pathname:\s*'([^']+)'\s*,\s*params:\s*(\{[^\n]*?\})\s*\}\s*as never\)/g,
    (_m, cual, r, params) => {
      n += 1;
      const reemplazar = cual === 'replace' ? ', true' : '';
      const sinParams = params.replace(/^\{\s*\}$/, '');
      return sinParams ? `irSeguro.libre('${r}', ${params}${reemplazar})` : `irSeguro.libre('${r}'${reemplazar ? ', undefined, true' : ''})`;
    });

  // 2) push/replace con ruta suelta
  t = t.replace(/router\.(push|replace)\('([^']+)'\s*as never\)/g, (_m, cual, r) => {
    n += 1;
    return cual === 'replace' ? `irSeguro.libre('${r}', undefined, true)` : `irSeguro.libre('${r}')`;
  });

  // 3) push con variable (destino que puede venir vacío): se valida igual
  t = t.replace(/router\.(push|replace)\(([A-Za-z_$][\w.$]*)\s*as never\)/g, (_m, cual, v) => {
    n += 1;
    return cual === 'replace' ? `irSeguro.libre(String(${v} ?? ''), undefined, true)` : `irSeguro.libre(String(${v} ?? ''))`;
  });

  if (n > 0 && !/from '.*constants\/rutas'/.test(t)) {
    const partes = rel.split('/');
    const prefijo = partes.length === 2 ? '..' : '../..';
    // Se inserta al final del BLOQUE DE IMPORTS: se recorre el fichero hasta la primera
    // declaración de verdad. Antes solo miraba las primeras 70 líneas y en un fichero con 90
    // líneas de comentario el import acabó DENTRO del comentario (lo cazó el compilador).
    const lineas = t.split('\n');
    let ultimo = 0;
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      if (l.startsWith('import ') || l.startsWith('} from ')) { ultimo = i; continue; }
      if (/^(export |const |function |class |type |interface |let |var )/.test(l)) break;
    }
    lineas.splice(ultimo + 1, 0, `import { ir as irSeguro } from '${prefijo}/constants/rutas';`);
    t = lineas.join('\n');
  }

  if (n > 0) {
    if (APLICAR) fs.writeFileSync(ruta, t, 'utf8');
    total += n;
    informe.push(`  ${String(n).padStart(3)}  ${rel}`);
  }
}

console.log(informe.join('\n'));
console.log(`\n${APLICAR ? 'MIGRADAS' : 'SE MIGRARÍAN'}: ${total} navegaciones en la zona (inicio + Life Book)`);
if (!APLICAR) console.log('(pasa --aplicar para escribirlo)');
