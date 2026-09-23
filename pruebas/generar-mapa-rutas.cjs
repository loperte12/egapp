/**
 * generar-mapa-rutas.cjs — escribe `constants/rutas.ts` a partir de las rutas REALES.
 *
 * Se genera leyendo `app/` en vez de escribirlo a mano: así el mapa no puede quedarse corto ni
 * tener una ruta mal copiada (que es justo el fallo que estamos arreglando).
 *
 *   node pruebas/generar-mapa-rutas.cjs
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const APP = path.join(RAIZ, 'app');

function rutas() {
  const out = [];
  const andar = (dir, base = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        const limpio = /^\(.*\)$/.test(e.name) || e.name.startsWith('+') ? base : rel;
        andar(path.join(dir, e.name), limpio);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(e.name)) continue;
      let r = rel.replace(/\.(tsx|ts)$/, '');
      r = r.replace(/\/index$/, '').replace(/^index$/, '');
      if (r.endsWith('/_layout') || r === '_layout' || r.startsWith('+')) continue;
      out.push('/' + r);
    }
  };
  andar(APP);
  return out.sort();
}

const lista = rutas();
/** Nombre de constante a partir de la ruta: `/lifebook-hotel-panel` → `lifebookHotelPanel`. */
const nombre = (r) => {
  const partes = r.replace(/^\//, '').replace(/\[([^\]]+)\]/g, '-$1').split(/[-/]/).filter(Boolean);
  if (!partes.length) return 'inicio';
  const camel = partes.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  return /^[0-9]/.test(camel) ? `r${camel}` : camel;
};
/** Parámetros obligatorios de una ruta: los `[x]` del fichero. */
const params = (r) => [...r.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);

const filas = lista.map((r) => {
  const ps = params(r);
  return `  ${nombre(r)}: { ruta: '${r}', params: [${ps.map((p) => `'${p}'`).join(', ')}] },`;
}).join('\n');

const contenido = `/**
 * MAPA DE RUTAS — la única lista de rutas de la app (generado, no escrito a mano).
 *
 * POR QUÉ EXISTE: la auditoría (\`pruebas/auditar-rutas.cjs\`) encontró que el sistema de
 * navegación fallaba en silencio: **1 enlace a una pantalla que no existe** (\`/emergencia\`),
 * **6 pantallas que nadie abría** y **204 navegaciones con \`as never\`**, que apagan el
 * comprobador de tipos. Por eso un destino mal escrito no lo veía ni TypeScript: se descubría en
 * el teléfono, delante del usuario.
 *
 * CÓMO SE USA:
 *   import { ir } from '../constants/rutas';
 *   ir.a.producto(id);                  // comprueba que la ruta y sus parámetros existen
 *   ir.libre('/lifebook-catalog');      // para rutas de listas/menús que vienen como texto
 *
 * El ayudante NUNCA navega a ciegas: si la ruta no está en este mapa, o si falta un parámetro
 * obligatorio (o llega vacío), manda a \`/ruta-fallida\`, que lo explica y da salida. Un botón
 * que no hace nada es peor que un aviso.
 *
 * REGENERAR: node pruebas/generar-mapa-rutas.cjs
 */
import { router } from 'expo-router';

export interface DefinicionRuta {
  ruta: string;
  /** Parámetros que NO pueden faltar ni llegar vacíos. */
  params: string[];
}

export const RUTAS = {
${filas}
} as const satisfies Record<string, DefinicionRuta>;

export type NombreRuta = keyof typeof RUTAS;

/** Pantalla que explica que algo no se pudo abrir. */
export const RUTA_FALLIDA = '/ruta-fallida';
/** Inicio: la salida limpia que siempre funciona. */
export const RUTA_INICIO = '/';

const vacio = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/**
 * Comprueba una ruta antes de navegar. Devuelve el motivo si NO se puede, o null si está bien.
 * Se exporta para poder probarlo (y para avisar sin navegar, si algún día hace falta).
 */
export function problemaDeRuta(ruta: string, params?: Record<string, unknown>): string | null {
  if (vacio(ruta)) return 'La ruta llegó vacía.';
  const def = (RUTAS as Record<string, DefinicionRuta>)[Object.keys(RUTAS).find(
    (k) => (RUTAS as Record<string, DefinicionRuta>)[k].ruta === ruta,
  ) ?? ''];
  if (!def) return \`La ruta "\${ruta}" no existe en el mapa de rutas.\`;
  const faltan = def.params.filter((p) => vacio(params?.[p]));
  if (faltan.length) return \`A "\${ruta}" le falta \${faltan.length === 1 ? 'el dato' : 'los datos'}: \${faltan.join(', ')}.\`;
  // Rutas con parámetro pero sin ninguno declarado: se comprueba en la propia dirección.
  if (/\\[|:/.test(ruta) && !def.params.length) return \`La ruta "\${ruta}" tiene un hueco sin rellenar.\`;
  return null;
}

function navegar(ruta: string, params?: Record<string, unknown>, reemplazar = false) {
  const problema = problemaDeRuta(ruta, params);
  if (problema) {
    // Se avisa en consola (para el desarrollo) y se lleva a la pantalla que lo explica, con el
    // motivo y el destino, en vez de dejar la pulsación sin efecto.
    console.warn('[rutas]', problema, { ruta, params });
    router[reemplazar ? 'replace' : 'push']({
      pathname: RUTA_FALLIDA,
      params: { motivo: problema, destino: ruta },
    } as never);
    return;
  }  const destino = (Object.values(RUTAS) as DefinicionRuta[]).find((d) => d.ruta === ruta);
  if (destino && destino.params.length) {
    router[reemplazar ? 'replace' : 'push']({ pathname: ruta, params: params ?? {} } as never);
  } else if (params && Object.keys(params).length) {
    router[reemplazar ? 'replace' : 'push']({ pathname: ruta, params } as never);
  } else {
    router[reemplazar ? 'replace' : 'push'](ruta as never);
  }
}

/**
 * Lleva a la pantalla que explica el problema. Se usa cuando lo que falla NO es una ruta
 * (por ejemplo: no se pudo resolver el perfil porque la sesión venía a medias). Antes esos
 * casos dejaban la pulsación sin ningún efecto.
 */
function explicar(motivo: string, destino = '') {
  console.warn('[rutas]', motivo, { destino });
  router.push({ pathname: RUTA_FALLIDA, params: { motivo, destino } } as never);
}

/**
 * El ayudante. Tres formas, para que no haya excusa para navegar a ciegas:
 *   ir.a.producto(id)         → ruta conocida con su parámetro (lo comprueba)
 *   ir.libre('/lo-que-sea')   → cuando la ruta viene de una lista/menú (la valida igual)
 *   ir.destino({...})         → destinos ya construidos como objeto
 *   ir.inicio()               → la salida que siempre funciona
 */
export const ir = {
  /** Navega a una ruta del mapa, comprobando que sus parámetros vienen. */
  a: (nombreRuta: NombreRuta, params?: Record<string, unknown>, reemplazar = false) => {
    navegar(RUTAS[nombreRuta].ruta, params, reemplazar);
  },
  /** Navega a una ruta escrita como texto (listas, menús, ajustes). Se valida igual. */
  libre: (ruta: string, params?: Record<string, unknown>, reemplazar = false) => {
    navegar(ruta, params, reemplazar);
  },
  /** Siempre disponible: el inicio. */
  inicio: (reemplazar = false) => navegar(RUTA_INICIO, undefined, reemplazar),
  /**
   * Para destinos que ya vienen construidos como objeto (\`{ pathname, params }\`), que es lo que
   * devuelven varios ayudantes de la app (\`destinoMiPerfilLifeBook\`, menús, etc.). Se valida su
   * \`pathname\` y sus parámetros igual que los demás.
   */
  destino: (destino: string | { pathname?: string; params?: Record<string, unknown> } | null | undefined,
            motivoSiFalta = 'No se pudo resolver a dónde ir.') => {
    if (destino === null || destino === undefined) { explicar(motivoSiFalta, ''); return; }
    if (typeof destino === 'string') { navegar(destino); return; }
    const ruta = String(destino.pathname ?? '');
    const problema = problemaDeRuta(ruta, destino.params);
    if (problema) { explicar(problema, ruta); return; }
    navegar(ruta, destino.params);
  },
  /** Lleva a la pantalla que explica el problema (para casos que no son una ruta). */
  explicar,
  /** Vuelve atrás si se puede; si no (se abrió por enlace), va al inicio. */
  atras: () => {
    try {
      if (router.canGoBack()) router.back();
      else navegar(RUTA_INICIO, undefined, true);
    } catch {
      navegar(RUTA_INICIO, undefined, true);
    }
  },
};
`;

fs.writeFileSync(path.join(RAIZ, 'constants', 'rutas.ts'), contenido, 'utf8');
console.log(`constants/rutas.ts escrito con ${lista.length} rutas.`);
