// Prueba el firmador DIRECTAMENTE (CommonJS, con el .env del backend).
// Firmar una URL presignada es **local** (HMAC): si aquí tarda milisegundos, el fallo en producción no
// es la configuración sino el arranque/entorno de la función.
const fs = require('node:fs');
const path = require('node:path');

// cargar el .env del backend
const envTxt = fs.readFileSync('D:/egapp/.auditoria-servicios/backend/.env', 'utf8');
for (const linea of envTxt.split(/\r?\n/)) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/);
  if (m && !m[1].startsWith('#')) process.env[m[1]] = m[2].trim();
}

const { EcomerseStorageService } = require('D:/egapp/.auditoria-servicios/backend/dist/src/ecomerse/ecomerse-storage.service.js');

(async () => {
  const t0 = Date.now();
  const s = new EcomerseStorageService();
  const t1 = Date.now();
  console.log('construir el cliente:', (t1 - t0) + ' ms');
  const clave = 'products/2349988e-7455-42d9-9df2-d13134da8ef2.jpg';
  const url = await s.urlDeLectura(clave);
  const t2 = Date.now();
  console.log('firmar:', (t2 - t1) + ' ms');
  console.log('url:', String(url).slice(0, 160));
  // y una segunda vez, para ver si el cliente se reutiliza
  const t3 = Date.now();
  await s.urlDeLectura(clave);
  console.log('firmar otra vez:', (Date.now() - t3) + ' ms');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
