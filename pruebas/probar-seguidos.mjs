// Llama a los endpoints de seguidos con un token FIRMADO de verdad (mismo JWT_SECRET del backend).
//
// Es la forma de probarlos sin la app: el guard solo mira la firma y el `sub`, así que un token
// firmado aquí vale igual que el del móvil. Con un uuid que no existe como usuario, la LISTA sale
// vacía (no hay filas), que es justo lo que se quiere comprobar: que la ruta responde y que la
// tabla se asegura desde dentro del despliegue.
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import https from 'node:https';


const env = readFileSync('D:/egapp/.auditoria-servicios/backend/.env', 'utf8');
const secreto = env.split(/\r?\n/).find((l) => l.startsWith('JWT_SECRET=')).split('=').slice(1).join('=').trim();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sub = randomUUID();
const cabecera = b64({ alg: 'HS256', typ: 'JWT' });
const cuerpo = b64({ sub, role: 'USER', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 });
const firma = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest('base64url');
const token = `${cabecera}.${cuerpo}.${firma}`;
console.log('usuario de prueba:', sub);

const pide = (p, metodo = 'GET') => new Promise((res) => {
  const r = https.request('https://api.egrouteplan.com' + p, {
    method: metodo,
    headers: { authorization: `Bearer ${token}` },
  }, (x) => { let s = ''; x.on('data', (d) => s += d); x.on('end', () => res({ st: x.statusCode, cuerpo: s })); });
  r.on('error', (e) => res({ st: 'ERR', cuerpo: e.message }));
  r.end();
});

(async () => {
  const lista = await pide('/api/ecomerse/sellers/following');
  console.log('GET  /sellers/following      ->', lista.st, lista.cuerpo.slice(0, 200));
  const ids = await pide('/api/ecomerse/sellers/following/ids');
  console.log('GET  /sellers/following/ids  ->', ids.st, ids.cuerpo.slice(0, 120));
  const seg = await pide('/api/ecomerse/sellers/4d2803d1-e116-4e8a-b80f-1def4c66b0ec/follow', 'POST');
  console.log('POST /sellers/:id/follow     ->', seg.st, seg.cuerpo.slice(0, 200));
  const lista2 = await pide('/api/ecomerse/sellers/following');
  console.log('GET  /sellers/following (ya) ->', lista2.st, lista2.cuerpo.slice(0, 260));
  const quitar = await pide('/api/ecomerse/sellers/4d2803d1-e116-4e8a-b80f-1def4c66b0ec/follow', 'POST');
  console.log('POST /sellers/:id/follow (2) ->', quitar.st, quitar.cuerpo.slice(0, 160), '(deja de seguir)');
})();
