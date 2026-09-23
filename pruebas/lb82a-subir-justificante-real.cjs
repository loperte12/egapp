// lb82a-subir-justificante-real.cjs — sube una imagen DE VERDAD y devuelve su URL pública.
//
// POR QUÉ: en la prueba del cobro usé una URL inventada (`…/lb-images/justificante-de-prueba.jpg`) que
// **no existía**. Al pulsar «Ver el justificante» se abría el navegador y el almacenamiento contestaba
// con su **XML de error** (lo reportó el dueño). Y al buscar una imagen «que ya existiera» resultó que
// la del producto de prueba (`…/lb-images/e2e.jpg`) **también está muerta (404 + application/xml)**.
//
// Así que aquí se sube un fichero LOCAL de verdad, por el MISMO camino que usa la app
// (`POST /lifebook/media/upload?kind=image`, multipart), y se comprueba que la URL devuelve **bytes de
// imagen** (no una página de error con otro nombre).
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb82a.cjs [/root/justificante.png]
const fs = require('node:fs');
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
const RUTA = process.argv[2] ?? '/root/justificante.png';

/** ¿Estos bytes son una imagen de las de verdad? */
const esImagen = (b) =>
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || // PNG
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff); // JPEG

(async () => {
  const login = await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+240222000123', password: 'MiClave123' }), // la tienda
  });
  const { accessToken } = await login.json();
  if (!accessToken) throw new Error('sin sesión de la tienda');

  if (!fs.existsSync(RUTA)) throw new Error(`no existe el fichero ${RUTA}`);
  const bytes = fs.readFileSync(RUTA);
  const tipo = RUTA.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  console.log(`fichero: ${RUTA} · ${bytes.length} bytes · cabecera de imagen: ${esImagen(bytes) ? 'SÍ' : 'NO'}`);
  if (!esImagen(bytes)) throw new Error('lo que se va a subir no es una imagen');

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: tipo }), `justificante-${Date.now()}${RUTA.slice(RUTA.lastIndexOf('.'))}`);
  const subida = await fetch(`${API}/lifebook/media/upload?kind=image`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form,
  });
  const cuerpo = await subida.json().catch(() => ({}));
  console.log(`subida: HTTP ${subida.status} · ${JSON.stringify(cuerpo).slice(0, 300)}`);

  const url = cuerpo?.url ?? cuerpo?.mediaUrl ?? cuerpo?.file?.url;
  if (!url) { console.log('NO HAY URL: revisar la forma de la respuesta'); process.exit(1); }

  // Lo que de verdad importa: que al pedir esa URL lleguen BYTES DE IMAGEN.
  const comprobar = await fetch(url);
  const descargado = Buffer.from(await comprobar.arrayBuffer());
  const tipoRespuesta = comprobar.headers.get('content-type') ?? '';
  console.log(`\nURL: ${url}`);
  console.log(`comprobación: HTTP ${comprobar.status} · content-type: ${tipoRespuesta} · ${descargado.length} bytes`);
  console.log(`  ¿son bytes de imagen? ${esImagen(descargado) ? 'SÍ ✅' : 'NO ❌ (sería la página de error del almacenamiento)'}`);
  console.log(`\npara usarla:  LB_JUSTIFICANTE='${url}'`);
  process.exit(esImagen(descargado) ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
