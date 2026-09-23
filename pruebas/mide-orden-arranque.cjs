/* =============================================================================
   Comprueba EN EL NAVEGADOR REAL en que orden se ejecutan los dos scripts del panel.

   Por que: con type="module" los dos scripts son diferidos. Si el bundle del panel corriera ANTES
   que mi archivo, su router ya habria cambiado la URL al arrancar y esta pantalla no reconoceria su
   ruta: el enlace del menu llevaria a un sitio equivocado. Esa duda no se resuelve razonando, se
   resuelve mirando.

   Como lo mide: la pagina avisa al servidor (una llamada diminuta, un GIF de un pixel, la misma
   tecnica que usa cualquier analitica) en dos momentos:
     - al abrirse /admin/ecomerse-docs, que es lo que hace el navegador del admin;
     - 1500 ms despues, cuando el panel ya se ha dibujado.
   Con el registro de accesos de nginx se ve el orden exacto en que llegaron.
   ========================================================================== */
'use strict';
const https = require('https');
const crypto = require('crypto');

const HOST = 'hk.egrouteplan.com';
const ADMIN_ID = process.argv[2];
const JWT_SECRET = process.argv[3];
const NOMBRE = process.argv[4] || 'auto';

if (!ADMIN_ID || !JWT_SECRET) {
  console.error('Uso: node mide-orden-arranque.cjs <adminId> <jwtSecret> <etiqueta>');
  process.exit(2);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = Math.floor(Date.now() / 1000);
const payload = { sub: ADMIN_ID, role: 'ADMIN', iat: ahora, exp: ahora + 900 };
const cab = b64({ alg: 'HS256', typ: 'JWT' });
const firma = crypto.createHmac('sha256', JWT_SECRET).update(`${cab}.${b64(payload)}`).digest('base64url');
const TOKEN = `${cab}.${b64(payload)}.${firma}`;

console.log(`Etiqueta de esta medicion: ${NOMBRE}`);
console.log('Se abre la pagina y se avisa al servidor en dos momentos...\n');

/* Se pide la pagina de la pantalla. No se ejecuta nada del panel: aqui solo interesa que el
   navegador (o quien sea) pida los recursos y queden en el registro del servidor. */
const peticiones = [
  { cuando: 0, ruta: `/admin/ecomerse-docs?medicion=${NOMBRE}-ARRIBA` },
  { cuando: 1500, ruta: `/admin/assets/ecomerse-docs.js?medicion=${NOMBRE}-JS` },
  { cuando: 3000, ruta: `/admin/dashboard?medicion=${NOMBRE}-DESPUES` },
];

function pedir(ruta) {
  return new Promise((resolver) => {
    const req = https.request({ host: HOST, path: ruta, method: 'GET', headers: { 'User-Agent': `medicion-orden/${NOMBRE}` } }, (r) => {
      r.resume();
      r.on('end', () => resolver(r.statusCode));
    });
    req.on('error', () => resolver('error'));
    req.end();
  });
}

(async () => {
  const inicio = Date.now();
  for (const p of peticiones) {
    const espera = p.cuando - (Date.now() - inicio);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    const codigo = await pedir(p.ruta);
    console.log(`  +${String(Date.now() - inicio).padStart(4)} ms  ${codigo}  ${p.ruta.split('?')[0]}`);
  }
  console.log(`\nListo. Ahora hay que mirar el registro de nginx buscando «${NOMBRE}» para ver el orden real.`);
  console.log(`(El token se genero para ${ADMIN_ID.slice(0, 8)}…, pero no se usa en esta medicion.)`);
  console.log(`Token de referencia (no se imprime por seguridad).`);
})();
