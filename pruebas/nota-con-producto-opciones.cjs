// nota-con-producto-opciones.cjs — publica una NOTA con el producto de prueba dentro (tanda C/K).
//
// POR QUÉ: en la app el producto se encuentra por el contenido (como en Xiaohongshu) y la búsqueda
// de Life Book es por ciudad. El producto de prueba es de la tienda A, así que la nota la publica A
// (el servidor solo deja enganchar productos de mi propia tienda).
//
// OJO (medido): `CreateNoteDto.media` son **cadenas**, y `savePhotos` espera **base64** (las fotos
// de las notas se guardan en `mobility.user_photos.image_b64`). Mandando `[{url, type}]` la nota se
// creaba con `media_ids = []`… y una nota sin foto NO sale en el feed: por eso la primera prueba no
// aparecía en el móvil. Aquí se manda la foto real en base64.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const { prepararRed } = require('./red.cjs');

const PRODUCTO = process.argv[2] ?? '074e141b-f618-47c5-9078-acb74e82d467';
const FOTO = 'https://hk.egrouteplan.com/lb-images/covers/05193228-dac5-4835-a3ea-8c0ad8b7da17.jpg';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
};

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const A = await login('+240222000123', 'MiClave123');

  const img = await fetch(FOTO);
  const buf = Buffer.from(await img.arrayBuffer());
  const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
  console.log(`foto: ${Math.round(buf.length / 1024)} KB → ${Math.round(dataUri.length / 1024)} KB en base64`);

  const nota = await j(await fetch(`${API}/lifebook/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A}` },
    body: JSON.stringify({
      title: 'Camiseta con tallas y colores (prueba)',
      body: 'Camiseta de prueba para ver el selector: elige talla y color y se ve la foto real de cada color antes de comprar.',
      city: 'Malabo',
      media: [dataUri],
      productIds: [PRODUCTO],
      visibility: 'public',
    }),
  }));
  console.log(nota.id ? `nota creada ${nota.id}` : `ERROR ${JSON.stringify(nota).slice(0, 300)}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
