// datos-tallas-demo.cjs — deja en la tienda A dos productos de prueba para el asistente de talla:
//   · la camiseta (ropa): su tabla se completa con ALTURA y PESO, que es lo que ahora se pregunta;
//   · unas zapatillas (calzado): con su eje de talla y su tabla por número/largo de pie.
// Los dos se aprueban y se enganchan a una nota en Acurenam, para poder abrirlos desde el móvil.
//
// Se puede lanzar desde el servidor (donde la API es local y no hace falta el proxy del equipo):
//   LB_API=http://127.0.0.1:3000/api/v1 node /root/datos-tallas-demo.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
/** El proxy de salida solo hace falta si se llama a la URL pública desde este equipo. */
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* sin red.cjs se va directo */ }
}

const CAMISETA = '074e141b-f618-47c5-9078-acb74e82d467';

/** La misma equivalencia que usa la app (constants/tallas.ts). */
const TALLAS_CALZADO = [
  [34, 21], [35, 22], [36, 22], [37, 23], [38, 24], [39, 24], [40, 25],
  [41, 25], [42, 26], [43, 26], [44, 27], [45, 28], [46, 29], [47, 30],
];

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const A = await login('+240222000123', 'MiClave123');
  const ADM = await login('+240999888777', '123456');
  const fotos = [
    'https://hk.egrouteplan.com/lb-images/covers/05193228-dac5-4835-a3ea-8c0ad8b7da17.jpg',
    'https://hk.egrouteplan.com/lb-images/covers/22950301-fa6e-46b9-a0f3-4ccb4e54cf9a.jpg',
  ];

  console.log('\n=== 1. LA CAMISETA: TABLA CON ALTURA Y PESO ===');
  const tabla = await req('PUT', `/lifebook/commerce/products/${CAMISETA}/size-chart`, A, {
    charts: [{
      gender: 'women', kind: 'top', notes: 'Mujer · altura y peso (+ pecho)',
      rows: [
        { sizeLabel: 'S', chestMinCm: 82, chestMaxCm: 88, heightMinCm: 155, heightMaxCm: 163, weightMinKg: 48, weightMaxKg: 56 },
        { sizeLabel: 'M', chestMinCm: 88, chestMaxCm: 94, heightMinCm: 160, heightMaxCm: 168, weightMinKg: 54, weightMaxKg: 64 },
        { sizeLabel: 'L', chestMinCm: 94, chestMaxCm: 101, heightMinCm: 165, heightMaxCm: 173, weightMinKg: 62, weightMaxKg: 72 },
      ],
    }],
  });
  console.log(`tabla de la camiseta HTTP ${tabla.s}`, tabla.b?.error ?? '');

  console.log('\n=== 2. LAS ZAPATILLAS: EJE DE TALLA + TABLA DE CALZADO ===');
  const alta = await req('POST', '/lifebook/commerce/products', A, {
    serviceType: 'physical',
    title: 'Zapatillas de prueba (número de calzado)',
    shortDescription: 'Prueba del asistente: dices tu número y te decimos la talla',
    longDescription: 'Producto de prueba de la tanda L: la tabla está en número y largo de pie, como la publican las marcas.',
    priceMode: 'fixed', priceXaf: 25000, stockMode: 'exact', stockQuantity: 10, condition: 'new',
    originCity: 'Acurenam',
    media: fotos.map((url) => ({ url, type: 'image' })),
    options: [{
      code: 'talla', label: 'Talla', kind: 'size', chartKind: 'shoes',
      values: [{ value: '40' }, { value: '41' }, { value: '42' }, { value: '43' }, { value: '44' }],
    }],
    variants: [
      { name: '40', attributes: { talla: '40' }, priceXaf: 25000, stockQuantity: 2 },
      { name: '41', attributes: { talla: '41' }, priceXaf: 25000, stockQuantity: 3 },
      { name: '42', attributes: { talla: '42' }, priceXaf: 25000, stockQuantity: 0 },
      { name: '43', attributes: { talla: '43' }, priceXaf: 26000, stockQuantity: 1 },
      { name: '44', attributes: { talla: '44' }, priceXaf: 26000, stockQuantity: 0 },
    ],
  });
  const zapatillas = alta.b?.product?.id ?? null;
  console.log(`alta HTTP ${alta.s} · id ${zapatillas}`, alta.b?.error ?? '');

  if (zapatillas) {
    const tz = await req('PUT', `/lifebook/commerce/products/${zapatillas}/size-chart`, A, {
      charts: [{
        gender: 'unisex', kind: 'shoes', notes: 'Número europeo y largo de pie',
        rows: TALLAS_CALZADO.slice(4, 12).map(([numero, cm]) => ({
          sizeLabel: String(numero), footLengthMinCm: cm, footLengthMaxCm: cm + 1, footWidthMinCm: 9, footWidthMaxCm: 10,
        })),
      }],
    });
    console.log(`tabla de las zapatillas HTTP ${tz.s}`, tz.b?.error ?? '');
    const ok = await req('PATCH', `/lifebook/commerce/admin/products/${zapatillas}`, ADM, { action: 'approve' });
    console.log(`aprobadas HTTP ${ok.s}`, ok.b?.error ?? '');
  }

  console.log('\n=== 3. UNA NOTA EN ACURENAM CON LOS DOS (para abrirlos desde el móvil) ===');
  const img = await fetch(fotos[0]);
  const dataUri = `data:image/jpeg;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
  const nota = await req('POST', '/lifebook/posts', A, {
    title: 'Tallas: camiseta y zapatillas (prueba)',
    body: 'Dos productos para probar el asistente de talla: la camiseta te la recomienda con tu altura y tu peso, y las zapatillas con tu número de calzado.',
    city: 'Acurenam',
    media: [dataUri],
    productIds: [CAMISETA, ...(zapatillas ? [zapatillas] : [])],
    visibility: 'public',
  });
  console.log(nota.id ? `nota creada ${nota.id}` : `ERROR ${JSON.stringify(nota).slice(0, 200)}`);
  console.log(`\nCAMISETA : ${CAMISETA}\nZAPATILLAS: ${zapatillas}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
