#!/usr/bin/env node
/**
 * verifica-diseno.cjs — guardia de diseño (Fase 1, punto 1.4 de la auditoría).
 *
 * POR QUÉ EXISTE: la app tenía 113 colores distintos escritos a mano frente a 18 tokens oficiales,
 * y no había nada que impidiera seguir añadiendo. El proyecto no tiene ESLint instalado, así que
 * esta es la guardia: un trinquete (ratchet) que **solo permite que la deuda baje**.
 *
 * Qué comprueba:
 *   1. Literales de color hex fuera del kit de diseño.
 *   2. Números de `fontSize` y `borderRadius` escritos a mano (sin escala).
 *   3. Números de `fontWeight` y `borderWidth` escritos a mano (sin escala).
 *   4. **Precios de figura pintados a mano** (`precioFigura`): ver «Precio como sistema», abajo.
 *
 * POR QUÉ SE AÑADIERON 3 y 4 (19/09, cierre de la fase 1 del plan de diseño): la guardia medía
 * 148 literales en el módulo Mercado y decía «cero deuda» al terminarlos, pero era **ciega a tres
 * familias del mismo tipo de deuda**, y dos son más grandes que las que medía:
 *
 *   fontWeight  → la escala `peso` del kit tiene 0 usos en toda la app, mientras hay 2.055
 *                 literales. El reparto verificado (19/09) es 800→759, 900→549, 700→527,
 *                 600→218, 500→2 y 400→**0**. O sea: 977 literales usan valores (800 y 600)
 *                 que la escala ni contiene, y el 400 que sí contiene no lo usa nadie.
 *   borderWidth → 579 literales frente a los 4 valores de `trazo`.
 *   radius por esquina (`borderTopLeftRadius`, …) → no casaban con el patrón `borderRadius:`.
 *                 Al ampliar el patrón aparecieron 93 más repartidos en 42 archivos, todos
 *                 fuera del módulo Mercado: la deuda era mayor de lo que medíamos, no nueva.
 *
 * Un trinquete que no ve no aprieta. Aquí no se obliga a migrar nada: se hace **visible** lo que
 * queda, para que no crezca sin que nadie lo vea.
 *
 * POR QUÉ SE AÑADIÓ 4 (20/09, fase 2 del plan de diseño — «el precio como sistema»): la fase creó
 * la primitiva `Precio` (cifra + unidad reducida, incapaz de partirse) y la aplicó donde el defecto
 * se veía. Pero el precio se pinta en el módulo Mercado en **dos formas distintas**, y solo una es
 * un componente:
 *
 *   · **Figura** — el importe es el sujeto de la línea: `<Text>{formatXAF(o.totalXaf)}</Text>`.
 *     Aquí manda `Precio`, que es lo único que pinta la unidad reducida y no puede partirse.
 *     El formateador que se use dentro da igual para la regla: `formatXAF`, `lbXaf`, `xaf` o
 *     `fmtXaf` son el mismo hecho escrito cuatro veces (ver `FORMATO_A_MANO`).
 *   · **Texto corrido** — el importe va dentro de una frase: `• Arroz ×2 · {formatXAF(x)}`,
 *     `envío {formatXAF(f)}`. Aquí manda `formateaXAF`, que ya pega cifra y unidad con espacio duro
 *     (así tampoco se parte) pero **no** debe meterse como componente: partiría la línea en dos
 *     cajas y rompería el ajuste de la frase.
 *
 * Esta regla cuenta **solo el primer caso**: un `<Text>` cuyo contenido, fuera de las expresiones
 * `{…}`, es **únicamente espacio en blanco** y que contiene una llamada a un formateador de moneda
 * (ver `FORMATO_A_MANO`, abajo); y además **ningún literal de texto** dentro de esas expresiones
 * (ni `' · '` ni `` ` · ${…}` ``), porque un literal con algo visible es, por definición, una frase y
 * no una figura.
 *
 * El segundo requisito no es teórico: sin él, `` {d.amountXaf ? ` · ${formatXAF(x)}` : ''} `` cuenta
 * como figura y es exactamente lo contrario —un importe pegado a la frase anterior—. Con él, ese
 * caso y `` {qty > 1 ? ` × ${qty} = ${formatXAF(t)}` : ''} `` (el desglose de un pedido) quedan
 * fuera, que es donde tienen que estar.
 *
 * Deliberadamente **no** caza el caso mezclado (`<Text>` con una cifra + un `<Text>` anidado para
 * el periodo) ni el que elige texto de reserva (`? formatXAF(x) : '—'`): preferimos una regla corta
 * que no dé un falso positivo a una que grite de más.
 *
 * Cómo se usa:
 *   node scripts/verifica-diseno.cjs            → compara con la base y falla si algo empeora
 *   node scripts/verifica-diseno.cjs --base     → reescribe la base (solo tras una mejora real)
 *   node scripts/verifica-diseno.cjs --detalle  → lista los 20 archivos peores
 *
 * Salida: 0 si no hay empeoramiento, 1 si algún archivo ha empeorado.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const BASE = path.join(RAIZ, '.diseno-baseline.json');

/** Zonas del proyecto donde NO se admiten colores a mano: el kit es el único sitio con valores. */
const ZONAS = ['app', 'components', 'core', 'api', 'state', 'utils', 'constants'];
/** El propio kit y los respaldos quedan fuera del escaneo. */
const EXCLUIDAS = [/node_modules/, /respaldo/, /^\.expo/, /packages[\\/]ui-kit/];

/**
 * FICHEROS DE CONTENIDO — su hex no es deuda: **el valor ES el dato**.
 * Decisión de Bernardo (25/09/2026), al abrir la familia `hex`.
 * Un tema de gradiente (`ocean: ['#1E6FD9', '#3AA0FF']`) o una paleta de color de coche no se
 * tokenizan: no hay un «color de marca» detrás, hay siete temas que el usuario elige. Meterlos en
 * el kit sería inventar semántica. Se quedan donde están y salen del alcance.
 * OJO: esto NO es un permiso para escribir colores nuevos en estos ficheros. Es «este dato no es
 * deuda», no «aquí vale todo». Si aparece un color que NO es dato, se saca del fichero a su tabla.
 */
const CONTENIDO = [
  /constants[\\/]status\.ts$/, //          16 — los 8 temas de gradiente (ocean, sky, sunset…)
  /constants[\\/]lifebook-chat\.ts$/, //   14 — las 7 paletas de chat (base + accent)
  /constants[\\/]lifebook\.ts$/, //        10 — color de categoría de post
  /app[\\/]driver-onboarding\.tsx$/, //     7 — paleta de color de coche (Blanco, Negro…)
  /app[\\/]edit-profile\.tsx$/, //          3 — paleta de color de avatar
];

/**
 * MARCADOR DE LÍNEA — para una PALETA dentro de un fichero de PRODUCTO.
 * `app/taxi.tsx` tiene 16 colores de interfaz (deuda, se tokenizan) y 5 de paleta de coche
 * (dato, se quedan). No se puede excluir el fichero entero. Una línea cuyo COMENTARIO lleve
 * `dato-color` queda exenta, y la exención viaja con el código:
 *     blanco: '#F2F2F2', negro: '#26282C',   // dato-color — paleta de coche
 * Auditoría: `grep -rn 'dato-color' app components core constants` lista TODAS las exenciones.
 */
const MARCA_DATO = /dato-color/;

const args = new Set(process.argv.slice(2));

function archivosFuente(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (EXCLUIDAS.some((r) => r.test(p))) continue;
    if (e.isDirectory()) archivosFuente(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/**
 * Cuenta ocurrencias (no valores distintos): importa cuántas veces se escribe a mano.
 */
function contar(txt, re) {
  const m = txt.match(re);
  return m ? m.length : 0;
}

/**
 * Cuenta literales de color hex, con las dos correcciones del 25/09/2026.
 *
 * 1. PUNTO CIEGO — LONGITUDES. El patrón anterior era `#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b`. En un
 *    hex de OCHO dígitos (`#F53F3F55`, un rojo al 33 % de alfa) los 6 primeros dígitos van seguidos
 *    de otro dígito, así que `\b` NO casa y el literal era **invisible al trinquete**. Medido: 19
 *    literales invisibles, y eran exactamente los colores de estado translúcidos — la mitad del
 *    problema de color de la app. Un trinquete que no ve no aprieta.
 *    Ahora acepta las cuatro longitudes VÁLIDAS de CSS: 3 (#f00), 4 (#f00a), 6 (#ff0000), 8 (#ff0000aa).
 *    Las longitudes inválidas (5, 7) se siguen rechazando: la alternancia va de mayor a menor y `\b`
 *    no casa en medio de un número.
 *
 * 2. FALSO POSITIVO — `url(#…)`. En SVG, `fill="url(#adFade)"` referencia un degradado por su id, y
 *    `adFade` son seis caracteres que casualmente son todos hexadecimales. No es un color. Se excluye
 *    con una retrospección: si delante del `#` está `url(`, no cuenta. (Huso `url(#FFF)` también.)
 *
 * Además aplica las exenciones de CONTENIDO y MARCA_DATO (ver arriba).
 */
function cuentaHex(txt, rel) {
  if (CONTENIDO.some((r) => r.test(rel))) return 0;
  let n = 0;
  for (const ln of txt.split('\n')) {
    if (MARCA_DATO.test(ln)) continue;
    const m = ln.match(HEX);
    if (m) n += m.length;
  }
  return n;
}

/**
 * LOS FORMATEADORES QUE PINTAN UN PRECIO A MANO — ampliado el 25/09/2026 (familia `precioFigura`).
 *
 * Antes el patrón era `formatXAF(` y medía **12** figuras donde hay **50**. El proyecto tiene cuatro
 * formateadores distintos para el mismo trabajo y el patrón veía uno solo:
 *
 *   · `formatXAF`  — `utils/formatHelpers`. El «oficial» de la app.        12 figuras
 *   · `lbXaf`      — `constants/lifebook`. El del módulo Lifebook.         20 figuras
 *   · `xaf`        — copia LOCAL, definida en 4 ficheros distintos.        13 figuras
 *   · `fmtXaf`     — copia LOCAL, definida en 3 ficheros.                   5 figuras
 *
 * Y `formateaXAF` —el formateador del KIT, escrito justo para esto— tiene **0 usos en la app**. Es el
 * fallo 18/26 del skill `codemod-seguro`: un trinquete ciego a una FORMA de escribir la deuda no
 * aprieta esa forma, y la deuda existe igual. Igual que el hex de ocho dígitos del 25/09, esto SUBE
 * el número al ampliarlo, y sube porque gana VISIBILIDAD, no deuda.
 *
 * El `\b` de delante de `xaf` es lo que impide que case dentro de `formatXAF(` o `lbXaf(`: ahí la `x`
 * va precedida de una letra, así que no hay límite de palabra. `fmtXaf` va aparte porque lleva la
 * `X` en mayúscula.
 *
 * LIMITACIÓN DECLARADA: una copia local con OTRO nombre (`const miformato = (n) => …' XAF'`) seguiría
 * siendo invisible. Se cubren los cuatro nombres que el proyecto escribe hoy, no la clase entera.
 */
const FORMATO_A_MANO = /formatXAF\s*\(|formateaXAF\s*\(|lbXaf\s*\(|fmtXaf\s*\(|\bxaf\s*\(/g;
/** Literal de texto (comillas simples, dobles o backtick). Un literal con algo dentro = frase. */
const LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`]*`/g;

/**
 * Cuenta **precios de figura pintados a mano**: un `<Text>` cuyo contenido, quitando las
 * expresiones `{…}`, es solo espacio en blanco, y que contiene `formatXAF(`, y en el que ningún
 * literal de texto dentro de las expresiones tiene algo visible.
 *
 * No usa AST a propósito: el proyecto no tiene compilador de TypeScript en el guardia y añadirlo
 * sería más aparato que la regla. Se apoya en dos hechos comprobados del código real:
 *   · el `<Text>` que abre es el ÚLTIMO antes de la llamada (`lastIndexOf`), y
 *   · si entre ese `<Text>` y la llamada ya hay un `</Text>`, la llamada está FUERA de él (se
 *     descarta). Eso es lo que evita contar los `accessibilityLabel` de un `<Pressable>` que
 *     contienen `formatXAF(...)`.
 * El cierre del tag se toma como el PRIMER `>` tras `<Text`: si el tag llevara una flecha
 * (`onPress={() => …}`), ese `>` cae dentro del tag y la cuenta se descarta (falso negativo
 * silencioso). Preferimos eso a un falso positivo, que bloquearía un cambio legítimo.
 */
function cuentaPrecioFigura(txt) {
  let n = 0;
  const re = new RegExp(FORMATO_A_MANO.source, 'g');
  let m;
  while ((m = re.exec(txt))) {
    const i = m.index;
    const abre = txt.lastIndexOf('<Text', i);
    if (abre < 0) continue;
    if (txt.lastIndexOf('</Text>', i) > abre) continue;
    const finTag = txt.indexOf('>', abre);
    if (finTag < 0 || finTag > i) continue;
    const cierra = txt.indexOf('</Text>', i);
    if (cierra < 0) continue;
    const contenido = txt.slice(finTag + 1, cierra);

    /* Fuera de las expresiones `{…}`, solo espacio en blanco (si hay letras, es una frase). */
    let prof = 0;
    let sobra = '';
    for (const ch of contenido) {
      if (ch === '{') prof++;
      else if (ch === '}') prof--;
      else if (prof <= 0) sobra += ch;
    }
    if (sobra.trim() !== '') continue;

    /* Y dentro de las expresiones, ningún literal con algo visible: ` · ` o ` × ` convierten el
       importe en parte de una frase. Un literal vacío (`: ''`) no estorba. */
    const literales = contenido.match(LITERAL) ?? [];
    if (literales.some((l) => l.slice(1, -1).trim() !== '')) continue;

    n++;
  }
  return n;
}

/* HEX — AMPLIADO el 25/09/2026, y era un punto CIEGO de la guardia. Ver `cuentaHex` para el porqué.
   Cuatro longitudes válidas de CSS (3, 4, 6, 8), de mayor a menor, y sin contar `url(#id)` de SVG. */
const HEX = /(?<!url\()#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const FUENTE = /fontSize:\s*\d+(\.\d+)?/g;
/* `borderRadius` a secas dejaba fuera los radios por esquina (`borderTopLeftRadius: 18`), que son
   la misma deuda escrita de otra forma. Los nombres reales del proyecto son `borderRadius` y
   `border{Top|Bottom}{Left|Right}Radius`, así que el patrón los cubre todos sin tocar `maxWidth`. */
const RADIO = /(?:border|border(?:Top|Bottom)(?:Left|Right))Radius:\s*\d+(\.\d+)?/g;
/* PESO — AMPLIADO el 25/09/2026, y era un punto CIEGO de la guardia.
   POR QUÉ: el patrón anterior (`fontWeight:\s*['"]\d+['"]`) solo casaba si el valor EMPIEZA con
   comilla. Un ternario como `fontWeight: active ? '900' : '600'` NO casa —el valor empieza por
   `active`—, así que la guardia no veía ni una rama. Medido el 25/09: había **41 ternarios** con
   pesos a mano, invisibles al trinquete, y varios usan `'600'` (el valor que se retiró por no tener
   forma garantizada). Un trinquete que no ve una forma de escribir la deuda no aprieta esa forma.
   El patrón nuevo caza TODO número entre comillas que aparezca en el valor de `fontWeight`, esté
   solo o dentro de un ternario, así que cuenta **ramas**, no declaraciones: 41 ternarios aportan las
   ramas que tengan. Con esto la deuda de esos ternarios nace REGISTRADA en vez de invisible.
   `[^,}\n]*?` es perezoso y se detiene en la coma o la llave que cierra el objeto de estilo. */
const PESO = /fontWeight:\s*[^,}\n]*?['"]\d+['"]/g;
const TRAZO = /(?:border|border(?:Top|Bottom|Left|Right))Width:\s*\d+(\.\d+)?/g;
/* ESPACIADO — añadido el 24/09/2026, y era el hueco más grande de la guardia.
   POR QUÉ: la guardia medía cinco familias y NO medía la peor de todas. El censo del 23/09 encontró
   **5.446 literales de padding/margin/gap escritos a mano** frente a 432 usos de la escala `espaciado`
   — y 2.957 de esos literales (54 %) no eran múltiplos de 4, con el valor 10 (791 usos) fuera de la
   escala. Un trinquete que no ve el espaciado no aprieta el espaciado: la deuda podía crecer sin que
   nadie la mirara. Ahora está contada y, desde esta base, solo puede bajar.
   Cubre `padding*`, `margin*` y `gap`, incluidas las variantes por lado. NO cubre `rowGap`/`columnGap`
   (no se usan en el proyecto) ni valores negativos (`marginTop: -4`), que son desplazamientos y no
   espaciado. */
const ESPACIADO = /(?:padding|margin|gap)[A-Za-z]*:\s*\d+(\.\d+)?/g;

const CLAVES = ['hex', 'fontSize', 'borderRadius', 'fontWeight', 'borderWidth', 'espaciado', 'precioFigura'];
const CERO = {
  hex: 0,
  fontSize: 0,
  borderRadius: 0,
  fontWeight: 0,
  borderWidth: 0,
  espaciado: 0,
  precioFigura: 0,
};

const medidas = {};
for (const zona of ZONAS) {
  const dir = path.join(RAIZ, zona);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivosFuente(dir)) {
    const txt = fs.readFileSync(f, 'utf8');
    const rel = path.relative(RAIZ, f).replace(/\\/g, '/');
    const c = {
      hex: cuentaHex(txt, rel),
      fontSize: contar(txt, FUENTE),
      borderRadius: contar(txt, RADIO),
      fontWeight: contar(txt, PESO),
      borderWidth: contar(txt, TRAZO),
      espaciado: contar(txt, ESPACIADO),
      precioFigura: cuentaPrecioFigura(txt),
    };
    if (CLAVES.some((k) => c[k])) medidas[rel] = c;
  }
}

const total = Object.values(medidas).reduce(
  (a, c) => CLAVES.reduce((acc, k) => ({ ...acc, [k]: acc[k] + c[k] }), a),
  { ...CERO },
);

function resume(t) {
  return CLAVES.map((k) => `${k} ${t[k]}`).join(' · ');
}

if (args.has('--base') || !fs.existsSync(BASE)) {
  fs.writeFileSync(BASE, JSON.stringify({ total, porArchivo: medidas }, null, 2) + '\n', 'utf8');
  console.log(`${fs.existsSync(BASE) ? 'Base actualizada' : 'Base creada'}: ${path.relative(RAIZ, BASE)}`);
  console.log(`  ${resume(total)}`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const empeorados = [];
for (const [rel, c] of Object.entries(medidas)) {
  const b = base.porArchivo[rel] ?? CERO;
  for (const clave of CLAVES) {
    if (c[clave] > (b[clave] ?? 0)) empeorados.push({ archivo: rel, clave, antes: b[clave] ?? 0, ahora: c[clave] });
  }
}

const mejoras = CLAVES.filter((k) => base.total[k] !== undefined && total[k] < base.total[k]);
if (mejoras.length) {
  console.log('Mejora respecto a la base:');
  for (const k of mejoras) console.log(`  ${k}: ${base.total[k]} → ${total[k]}`);
}

if (args.has('--detalle')) {
  const peores = Object.entries(medidas).sort((a, b) => b[1].hex - a[1].hex).slice(0, 20);
  console.log('\n20 archivos con más literales de color:');
  for (const [rel, c] of peores) console.log(`  ${String(c.hex).padStart(4)}  ${rel}`);

  /* Pregunta distinta a «cuántos»: «dónde». Estos son los ficheros que aún pintan un importe como
     figura con el formateador a mano, y son los que le quedan a la fase 2. */
  const figuras = Object.entries(medidas)
    .filter(([, c]) => c.precioFigura)
    .sort((a, b) => b[1].precioFigura - a[1].precioFigura);
  console.log(`\n${figuras.length} archivo(s) pintan un precio de figura a mano (→ usa <Precio>):`);
  for (const [rel, c] of figuras) console.log(`  ${String(c.precioFigura).padStart(3)}  ${rel}`);
}

console.log(`\nTotal actual — ${resume(total)}`);

if (empeorados.length) {
  console.error(`\nFALLO: ${empeorados.length} archivo(s) han empeorado respecto a la base:`);
  for (const e of empeorados.slice(0, 30)) {
    console.error(`  ${e.archivo} → ${e.clave}: ${e.antes} → ${e.ahora}`);
  }
  console.error('\nUsa los tokens de @egrouteplan/ui-kit en vez de valores a mano.');
  console.error('Si el cambio es legítimo y ya has reducido la deuda total, reescribe la base con --base.');
  process.exit(1);
}

console.log('OK: ninguna zona ha empeorado.');
