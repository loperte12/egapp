// lb51b-prueba-poster-portada.cjs — la cadena del PÓSTER DEL SERVIDOR como portada.
//
// QUÉ SE PRUEBA Y POR QUÉ
// El fallo de la Parte 50-b: la app pedía el billete, subía, cerraba… y **tiraba el póster**
// que el servidor acababa de generar. Sin portada, `mediaUrls` queda vacío en el detalle
// (`app/lifebook-post/[id].tsx`: `gallery.length ? gallery : (coverUrl ? [coverUrl] : [])`)
// y el bloque de media se SALTA ENTERO: el vídeo se ve "solo como texto".
//
// El arreglo es de una línea en la app (`coverUrl = coverUrl ?? subido.posterUrl`), pero de
// esa línea dependen dos cosas del SERVIDOR que hay que comprobar, no suponer:
//   1. que `/complete` devuelve un `posterUrl` NO NULO (si viniera null, la app no arregla nada);
//   2. que ese póster es una URL LEGIBLE de verdad (no un nombre de archivo ni un 404).
// Y una tercera del contrato: que publicar con `coverUrl` deja la portada puesta.
//
// Se limpia solo: borra las dos publicaciones de prueba con el DELETE real (que además borra
// los archivos del almacén, así que no deja basura).
const fs = require('node:fs');
const { Blob } = require('node:buffer');

const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const LB = `${API}/lifebook`;
const MEDIA = `${LB}/commerce/media`;
const VIDEO = '/tmp/lb50c-62s.mp4';

const j = async (r) => {
  const t = await r.text();
  try { return { cuerpo: JSON.parse(t || '{}'), texto: t }; }
  catch { return { cuerpo: { crudo: t.slice(0, 200) }, texto: t }; }
};
const out = [];
const ok = (n, cond, extra = '') => {
  const l = `${cond ? 'PASS' : 'FAIL'} ${n}${extra ? ` ${extra}` : ''}`;
  out.push(l); console.log(l); if (!cond) process.exitCode = 1;
};

const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.cuerpo.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r.cuerpo).slice(0, 140)}`);
  return r.cuerpo.accessToken;
};
const H = (tok) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` });

/** Sube el vídeo por el camino EXACTO de la app y devuelve lo que devuelve el cierre. */
async function subirVideo(tok, durSec) {
  const buf = fs.readFileSync(VIDEO);
  const t = await j(await fetch(`${MEDIA}/upload-url`, {
    method: 'POST', headers: H(tok),
    body: JSON.stringify({ purpose: 'post', kind: 'video', durationKind: durSec > 60 ? 'long' : 'short',
      mimeType: 'video/mp4', fileSizeBytes: buf.length, durationSec: durSec }),
  }));
  if (!t.cuerpo.uploadUrl) throw new Error(`sin billete: ${JSON.stringify(t.cuerpo).slice(0, 160)}`);
  const form = new FormData();
  Object.entries(t.cuerpo.fields).forEach(([k, v]) => form.append(k, String(v)));
  form.append(t.cuerpo.fileField || 'file', new Blob([buf], { type: 'video/mp4' }), 'video.mp4');
  const rs = await fetch(t.cuerpo.uploadUrl, { method: 'POST', body: form });
  if (rs.status !== 204) throw new Error(`subida HTTP ${rs.status}`);
  const v = await j(await fetch(`${MEDIA}/complete`, {
    method: 'POST', headers: H(tok), body: JSON.stringify({ key: t.cuerpo.key, durationSec: durSec }),
  }));
  if (!v.cuerpo.url) throw new Error(`complete falló: ${JSON.stringify(v.cuerpo).slice(0, 160)}`);
  return v.cuerpo;
}

/** Publica un vídeo con (o sin) portada. */
const publicar = async (tok, videoUrl, durationSec, titulo, coverUrl) => {
  const r = await j(await fetch(`${LB}/posts/video`, {
    method: 'POST', headers: H(tok),
    body: JSON.stringify({ title: titulo, city: 'Malabo', videoUrl, durationSec,
      ...(coverUrl ? { coverUrl } : {}) }),
  }));
  if (!r.cuerpo.id) throw new Error(`no se pudo publicar: ${JSON.stringify(r.cuerpo).slice(0, 200)}`);
  return r.cuerpo.id;
};

const borrar = async (tok, id) => fetch(`${LB}/posts/${id}`, { method: 'DELETE', headers: H(tok) });

(async () => {
  if (!fs.existsSync(VIDEO)) throw new Error(`falta ${VIDEO}`);
  const tok = await login('+240222000123', 'MiClave123');
  const marca = Date.now().toString().slice(-6);
  console.log(`INFO sesión lista (marca ${marca})\n`);

  // ── 1. ¿El cierre devuelve póster? ──
  const v1 = await subirVideo(tok, 62);
  ok('1. /complete devuelve un `posterUrl` NO NULO', typeof v1.posterUrl === 'string' && v1.posterUrl.length > 0,
    `(posterUrl = ${v1.posterUrl === null ? 'null' : String(v1.posterUrl).slice(0, 72)})`);
  if (!v1.posterUrl) {
    console.log('\n⚠️  SIN PÓSTER NO HAY NADA QUE ARREGLAR EN LA APP: se corta aquí.');
    console.log(`\n${out.filter((l) => l.startsWith('PASS')).length}/${out.length} PASS`);
    return;
  }

  // ── 2. ¿El póster se puede LEER? ──
  const rp = await fetch(v1.posterUrl, { headers: { Range: 'bytes=0-63' } });
  ok('2. el póster es una URL legible (206/200)', rp.status === 206 || rp.status === 200, `(HTTP ${rp.status})`);

  // ── 3. El caso ROTO: publicar sin portada ──
  // Es lo que hacía la app antes del arreglo. Sirve de control: si esto también saliera con
  // portada, la prueba no estaría midiendo lo que cree medir.
  const idSin = await publicar(tok, v1.url, 62, `Sin portada ${marca}`);
  const sin = await j(await fetch(`${LB}/posts/${idSin}`, { headers: H(tok) }));
  const coverSin = String(sin.cuerpo?.payload?.coverUrl ?? '');
  ok('3. (control) publicar SIN portada deja el post sin portada',
    coverSin === '', `(payload.coverUrl = ${coverSin ? coverSin.slice(0, 60) : 'vacío'})`);
  const mediaSin = Array.isArray(sin.cuerpo?.media) ? sin.cuerpo.media : [];
  console.log(`   → y por eso el detalle no tendría nada que pintar: media = ${JSON.stringify(mediaSin).slice(0, 90)}`);

  // ── 4. El caso ARREGLADO: publicar con el póster como portada ──
  // Es EXACTAMENTE lo que hace ahora la app: `coverUrl = coverUrl ?? subido.posterUrl`.
  const v2 = await subirVideo(tok, 62);
  const idCon = await publicar(tok, v2.url, 62, `Con póster ${marca}`, v2.posterUrl);
  const con = await j(await fetch(`${LB}/posts/${idCon}`, { headers: H(tok) }));
  const coverCon = String(con.cuerpo?.payload?.coverUrl ?? '');
  ok('4. publicar CON el póster deja ese póster como portada', coverCon !== '',
    `(payload.coverUrl = ${coverCon.slice(0, 72) || 'vacío'})`);
  ok('   y es EL póster de ESTA subida, no otro', coverCon === v2.posterUrl,
    `(${coverCon === v2.posterUrl ? 'coincide' : `distinto: ${coverCon.slice(0, 50)}`})`);

  // ── 5. Lo que de verdad importa: que el detalle tenga algo que pintar ──
  // `mediaUrls = gallery.length ? gallery : (coverUrl ? [coverUrl] : [])`. Con portada, el
  // bloque de media se pinta y el vídeo aparece. Sin ella, se salta entero.
  ok('5. el detalle TENDRÍA mediaUrls (portada presente) → el bloque de vídeo se pinta',
    coverCon !== '', `(mediaUrls = [${coverCon ? 'póster' : 'vacío'}])`);

  // ── Limpieza: el DELETE real, que además borra los archivos ──
  await borrar(tok, idSin);
  await borrar(tok, idCon);
  const sigueSin = (await fetch(`${LB}/posts/${idSin}`, { headers: H(tok) })).status;
  const sigueCon = (await fetch(`${LB}/posts/${idCon}`, { headers: H(tok) })).status;
  ok('6. limpieza: las dos publicaciones de prueba se borraron (404)',
    sigueSin === 404 && sigueCon === 404, `(sin=${sigueSin} · con=${sigueCon})`);
  const posterMuerto = (await fetch(v2.posterUrl, { headers: { Range: 'bytes=0-63' } })).status;
  ok('   y el póster se fue con la publicación (no deja basura)', posterMuerto === 404, `(HTTP ${posterMuerto})`);

  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} PASS${fails ? ` · ${fails} FAIL` : ''}`);
})().catch((e) => { console.error('PRUEBA ERROR', e); process.exit(1); });
