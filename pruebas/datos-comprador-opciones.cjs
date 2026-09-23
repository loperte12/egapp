// datos-comprador-opciones.cjs — deja un producto de la tienda A con TALLAS y COLORES (con foto)
// para comprobar en el móvil el selector «elegir antes de comprar» (tanda K).
//
// El móvil está con la cuenta ADMIN, que NO es el dueño de este producto: así se ve como comprador.
// Imprime el id para poder abrirlo desde el catálogo.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const { prepararRed } = require('./red.cjs');

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

  // Dos fotos REALES distintas para los dos colores. Se prefieren las portadas que ya tiene la
  // tienda; si solo tiene una, se usan dos fotos reales del servidor (las de las habitaciones de
  // prueba), porque lo que se quiere ver es que cada color enseñe SU foto.
  const mios = (await req('GET', '/lifebook/commerce/my/products', A)).b?.items ?? [];
  const deLaTienda = [...new Set(mios.map((p) => p.coverUrl).filter(Boolean))];
  const fotos = (deLaTienda.length >= 2 ? deLaTienda : [
    'https://hk.egrouteplan.com/lb-images/covers/05193228-dac5-4835-a3ea-8c0ad8b7da17.jpg',
    'https://hk.egrouteplan.com/lb-images/covers/22950301-fa6e-46b9-a0f3-4ccb4e54cf9a.jpg',
  ]).slice(0, 2);
  console.log('fotos:', fotos.map((f) => f.slice(-18)).join(' · '));

  const alta = await req('POST', '/lifebook/commerce/products', A, {
    serviceType: 'physical',
    title: 'Camiseta de prueba (tallas y colores)',
    shortDescription: 'Prueba del selector: elige talla y color antes de comprar',
    longDescription: 'Producto de prueba de la tanda K: dos colores con su foto real y tres tallas, con stock distinto en cada combinación.',
    priceMode: 'fixed', priceXaf: 12000, stockMode: 'exact', stockQuantity: 20, condition: 'new',
    originCity: 'Malabo',
    media: fotos.map((url) => ({ url, type: 'image' })),
    categories: undefined,
    options: [
      { code: 'talla', label: 'Talla', kind: 'size', chartKind: 'top', values: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] },
      {
        code: 'color', label: 'Color', kind: 'color',
        values: [
          { value: 'Rojo', imageUrl: fotos[0], hex: '#C0392B' },
          { value: 'Azul', imageUrl: fotos[1], hex: '#2C3E50' },
        ],
      },
    ],
    variants: [
      { name: 'Rojo · S', attributes: { color: 'Rojo', talla: 'S' }, priceXaf: 12000, stockQuantity: 3 },
      { name: 'Rojo · M', attributes: { color: 'Rojo', talla: 'M' }, priceXaf: 12000, stockQuantity: 2 },
      { name: 'Rojo · L', attributes: { color: 'Rojo', talla: 'L' }, priceXaf: 12000, stockQuantity: 0 },
      { name: 'Azul · S', attributes: { color: 'Azul', talla: 'S' }, priceXaf: 13500, stockQuantity: 0 },
      { name: 'Azul · M', attributes: { color: 'Azul', talla: 'M' }, priceXaf: 13500, stockQuantity: 4 },
      { name: 'Azul · L', attributes: { color: 'Azul', talla: 'L' }, priceXaf: 13900, stockQuantity: 1 },
    ],
  });
  const id = alta.b?.product?.id ?? alta.b?.id ?? null;
  console.log(`alta HTTP ${alta.s} · id ${id}`, alta.b?.error ?? '');

  // Tabla de tallas (mujer, arriba) para que el asistente tenga contra qué comparar.
  if (id) {
    const tabla = await req('PUT', `/lifebook/commerce/products/${id}/size-chart`, A, {
      charts: [{
        gender: 'women', kind: 'top', notes: 'Tabla de prueba (mujer)',
        rows: [
          { sizeLabel: 'S', chestMinCm: 82, chestMaxCm: 88, heightMinCm: 155, heightMaxCm: 165, weightMinKg: 48, weightMaxKg: 58 },
          { sizeLabel: 'M', chestMinCm: 88, chestMaxCm: 94, heightMinCm: 160, heightMaxCm: 172, weightMinKg: 56, weightMaxKg: 68 },
          { sizeLabel: 'L', chestMinCm: 94, chestMaxCm: 101, heightMinCm: 168, heightMaxCm: 180, weightMinKg: 66, weightMaxKg: 80 },
        ],
      }],
    });
    console.log(`tabla de tallas HTTP ${tabla.s}`, tabla.b?.error ?? '');
    // Se aprueba para que el móvil (otra cuenta) pueda verlo en el catálogo.
    const ADM = await login('+240999888777', '123456');
    const ok = await req('PATCH', `/lifebook/commerce/admin/products/${id}`, ADM, { action: 'approve' });
    console.log(`aprobado HTTP ${ok.s}`, ok.b?.error ?? '');
    console.log(`\nPRODUCTO: ${id}\nTítulo: Camiseta de prueba (tallas y colores)`);
  }
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
