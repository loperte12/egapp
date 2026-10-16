// Verifica la CADENA COMPLETA: seguir una tienda con un token firmado y pedir la sección de la UI con
// ese mismo token. Es lo que hace el móvil (la app pide /ui/siguiendo y el servidor resuelve la lista).
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import https from 'node:https';

const env = readFileSync('D:/egapp/.auditoria-servicios/backend/.env', 'utf8');
const secreto = env.split(/\r?\n/).find((l) => l.startsWith('JWT_SECRET=')).split('=').slice(1).join('=').trim();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sub = randomUUID();
const cabecera = b64({ alg: 'HS256', typ: 'JWT' });
const ahora = Math.floor(Date.now() / 1000);
const cuerpo = b64({ sub, role: 'USER', iat: ahora, exp: ahora + 900 });
const firma = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest('base64url');
const token = `${cabecera}.${cuerpo}.${firma}`;
console.log('usuario de prueba:', sub);

const pide = (p, metodo = 'GET') => new Promise((res) => {
  const r = https.request('https://api.egrouteplan.com' + p, { method: metodo, headers: { authorization: `Bearer ${token}` } },
    (x) => { let s = ''; x.on('data', (d) => s += d); x.on('end', () => res({ st: x.statusCode, cuerpo: s })); });
  r.on('error', (e) => res({ st: 'ERR', cuerpo: e.message }));
  r.end();
});

const TIENDA = '4d2803d1-e116-4e8a-b80f-1def4c66b0ec';

(async () => {
  const seg = await pide(`/api/ecomerse/sellers/${TIENDA}/follow`, 'POST');
  console.log('1) seguir                 ->', seg.st, seg.cuerpo.slice(0, 70));

  const ui = await pide('/api/ecomerse/ui/siguiendo?tema=oscuro');
  const j = JSON.parse(ui.cuerpo);
  const tarjetas = j.datos?.tarjetas ?? [];
  console.log('2) /ui/siguiendo          ->', ui.st, '| tarjetas:', tarjetas.map((t) => t.tipo).join(', '));
  const grande = tarjetas.find((t) => t.tipo === 'grande' || t.tipo === 'en_vivo');
  console.log('3) la tienda en la seccion ->', grande ? JSON.stringify({ tipo: grande.tipo, titulo: grande.titulo, creador: grande.creador, anuncios: grande.anuncios }) : '(no aparece)');
  console.log('   plantillas del arbol    ->', (j.arbol?.hijos ?? []).length, 'plantillas');

  // VOLCADO: los nodos de las plantillas que SI pintan y las que NO
  for (const nombre of ['seguir_autoplay', 'seguir_titulo', 'seguir_grande', 'seguir_cargar_mas']) {
    const p = (j.arbol?.hijos ?? []).find((h) => h.atributos?.templateName === nombre);
    console.log('--- ' + nombre + ' ---');
    const rec = (n, s) => { console.log(s + n.tipo + ' valor=' + JSON.stringify(n.valor) + ' attrs=' + JSON.stringify(Object.keys(n.atributos ?? {}))); (n.hijos ?? []).forEach((h) => rec(h, s + '   ')); };
    if (p) rec(p, '   ');
  }

  const quitar = await pide(`/api/ecomerse/sellers/${TIENDA}/follow`, 'POST');
  console.log('4) dejar de seguir        ->', quitar.st, quitar.cuerpo.slice(0, 60));
  const ui2 = JSON.parse((await pide('/api/ecomerse/ui/siguiendo')).cuerpo);
  console.log('5) y la seccion queda     ->', (ui2.datos?.tarjetas ?? []).map((t) => t.tipo).join(', '));
})();
