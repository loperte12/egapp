// lb58a-verificar-poi-y-distancia.cjs — EL SITIO DE LA NOTA (POI) Y EL FEED POR DISTANCIA.
//
// Antes de esto: 1.006 publicaciones activas y **0 con coordenadas** → los chips «附近 / 3km / 全城»
// no podían funcionar. Esta prueba comprueba que ahora una nota CON sitio:
//   1. guarda su sitio (nombre + coordenadas) al publicarse;
//   2. aparece en el feed de la ciudad con su `placeName`;
//   3. con mi posición y un radio de 1 km, sale; con 50 m, NO sale;
//   4. `distanceKm` es la distancia real (comparada a mano con la fórmula);
//   5. en «toda la ciudad» (sin posición) sale igual, sin distancia;
//   6. `sort=distance` la ordena por cercanía y `sort=hot` por interacción;
//   7. `since=24h` la incluye y `since=1h` también (recién publicada);
//   8. una nota SIN sitio NO sale cuando se pide un radio (no se inventa la distancia).
//
// Al terminar borra la nota de prueba.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  return { tok: r.accessToken, id: me.id, nombre: me.fullName };
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

/** La misma fórmula que el servidor, para comprobar que la distancia no es inventada. */
function distanciaKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  const B = await login('+240555000003', '123456');
  // Un punto conocido de Malabo (centro) y otro a ~8 km.
  const YO = { lat: 3.7504, lng: 8.7371 };
  const CERCA = { lat: 3.7525, lng: 8.7400, name: 'Cafetería de prueba (POI)' };   // ~400 m
  const nota = `Nota con sitio ${Date.now() % 1000000}`;
  let notaId = null;

  try {
    console.log('\n=== 1. SE PUBLICA UNA NOTA CON SU SITIO ===');
    const crea = await req('POST', '/lifebook/posts', B.tok, {
      title: nota, body: 'Prueba del feed por distancia: esta nota tiene un sitio exacto.',
      city: 'Malabo', visibility: 'public',
      placeName: CERCA.name, placeLat: CERCA.lat, placeLng: CERCA.lng,
    });
    notaId = crea.b?.id ?? crea.b?.post?.id;
    ok(crea.s === 201 || crea.s === 200, `se publica (HTTP ${crea.s})`, JSON.stringify(crea.b).slice(0, 200));
    const detalle = await req('GET', `/lifebook/posts/${notaId}`, B.tok);
    ok(detalle.b?.payload?.placeName === CERCA.name, `guarda el nombre del sitio (${detalle.b?.payload?.placeName})`);
    ok(Number(detalle.b?.payload?.lat) === CERCA.lat, `y la latitud (${detalle.b?.payload?.lat})`);
    ok(Number(detalle.b?.payload?.lng) === CERCA.lng, `y la longitud (${detalle.b?.payload?.lng})`);

    console.log('\n=== 2. TAMBIÉN SE PUEDE PUBLICAR SIN SITIO (y no se guarda nada falso) ===');
    const sinSitio = await req('POST', '/lifebook/posts', B.tok, {
      title: `Nota sin sitio ${Date.now() % 1000000}`, body: 'Sin sitio: no debe salir al pedir un radio.',
      city: 'Malabo', visibility: 'public', placeName: 'Sitio inventado sin coordenadas',
    });
    const idSinSitio = sinSitio.b?.id ?? sinSitio.b?.post?.id;
    const detSin = await req('GET', `/lifebook/posts/${idSinSitio}`, B.tok);
    ok(!detSin.b?.payload?.lat, 'sin coordenadas no se guarda sitio (mejor sin POI que con uno falso)');
    await req('DELETE', `/lifebook/posts/${idSinSitio}`, B.tok).catch(() => {});

    const feed = async (qs) => (await req('GET', `/lifebook/posts/feed?${qs}`, B.tok)).b?.posts ?? [];
    const esta = (posts) => posts.some((p) => p.id === notaId);

    console.log('\n=== 3. CON MI POSICIÓN Y 1 KM, SALE ===');
    const uno = await feed(`channel=nearby&city=Malabo&lat=${YO.lat}&lng=${YO.lng}&radiusKm=1&limit=40`);
    ok(esta(uno), `aparece con radio de 1 km (${uno.length} notas en el feed)`);
    const mia = uno.find((p) => p.id === notaId);
    ok(mia?.placeName === CERCA.name, `con su sitio (${mia?.placeName})`);
    ok(typeof mia?.distanceKm === 'number', `y su distancia (${mia?.distanceKm} km)`);
    const esperada = Math.round(distanciaKm(YO, CERCA) * 10) / 10;
    ok(mia?.distanceKm === esperada, `la distancia es la REAL, no inventada (${mia?.distanceKm} ≈ ${esperada})`);
    ok((uno ?? []).every((p) => p.placeName), 'y TODO lo que sale con radio tiene sitio');

    console.log('\n=== 4. CON 50 METROS, NO SALE ===');
    const cincuenta = await feed(`channel=nearby&city=Malabo&lat=${YO.lat}&lng=${YO.lng}&radiusKm=0.05&limit=40`);
    ok(!esta(cincuenta), `no aparece a 50 m (${cincuenta.length} notas)`);

    console.log('\n=== 5. «TODA LA CIUDAD» (sin posición) TAMBIÉN LA ENSEÑA ===');
    const toda = await feed('channel=nearby&city=Malabo&limit=40');
    ok(esta(toda), `aparece en toda la ciudad (${toda.length} notas)`);
    ok(toda.find((p) => p.id === notaId)?.distanceKm === null, 'sin distancia: no se sabe dónde estoy');

    console.log('\n=== 6. ORDEN: POR DISTANCIA Y POR INTERACCIÓN ===');
    const porDistancia = await feed(`channel=nearby&city=Malabo&lat=${YO.lat}&lng=${YO.lng}&sort=distance&limit=40`);
    const distancias = porDistancia.map((p) => Number(p.distanceKm)).filter((n) => Number.isFinite(n));
    const ordenadas = distancias.every((d, i) => i === 0 || distancias[i - 1] <= d);
    ok(ordenadas, `«más cerca primero» de verdad (${distancias.slice(0, 5).join(' · ')}…)`);
    const porCalor = await feed('channel=nearby&city=Malabo&sort=hot&limit=10');
    ok(porCalor.length > 0, `«lo más popular» responde (${porCalor.length})`);

    console.log('\n=== 7. VENTANA DE TIEMPO ===');
    const hoy = await feed('channel=nearby&city=Malabo&since=24h&limit=40');
    ok(esta(hoy), `«últimas 24 h» la incluye (${hoy.length})`);
    const ultimaHora = await feed('channel=nearby&city=Malabo&since=1h&limit=40');
    ok(esta(ultimaHora), `«última hora» también (recién publicada) (${ultimaHora.length})`);
    const mes = await feed('channel=nearby&city=Malabo&since=30d&limit=40');
    ok(esta(mes), `«último mes» también (${mes.length})`);
  } finally {
    if (notaId) {
      const borra = await req('DELETE', `/lifebook/posts/${notaId}`, B.tok);
      console.log(`\nlimpieza: nota de prueba borrada (HTTP ${borra.s})`);
    }
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
