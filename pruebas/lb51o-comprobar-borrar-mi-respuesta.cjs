// lb51o-comprobar-borrar-mi-respuesta.cjs — cierra el círculo del fallo «responder crea un
// comentario suelto» y limpia el comentario de prueba que dejé desde el móvil.
//
// Qué comprueba: que un texto enviado desde la caja de RESPONDER de la app NO está en la lista
// de comentarios de primer nivel, y SÍ cuelga de un comentario. Si estuviera en la lista raíz,
// el fallo seguiría vivo.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const LB = `${API}/lifebook`;
const BUSCAR = process.argv[2] || 'RESP';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return {}; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login falló: ${JSON.stringify(r).slice(0, 140)}`);
  return r.accessToken;
};
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const texto = (c) => String(c?.body ?? c?.text ?? '');

(async () => {
  const tok = await login('+240222000123', 'MiClave123');
  const feed = await j(await fetch(`${LB}/posts/feed?channel=for_you&limit=40`, { headers: H(tok) }));
  const posts = feed.posts || [];
  console.log(`buscando "${BUSCAR}" en ${posts.length} publicaciones...\n`);

  let encontradoComoRaiz = null;
  let encontradoComoRespuesta = null;
  let postDe = null;

  for (const p of posts) {
    const page = await j(await fetch(`${LB}/posts/${p.id}/comments?limit=60`, { headers: H(tok) }));
    const raices = page.comments ?? [];
    for (const c of raices) {
      if (texto(c).includes(BUSCAR)) { encontradoComoRaiz = c; postDe = p; }
      const hijas = await j(await fetch(`${LB}/comments/${c.id}/replies?limit=60`, { headers: H(tok) }));
      for (const r of (hijas.replies ?? [])) {
        if (texto(r).includes(BUSCAR)) { encontradoComoRespuesta = { r, padre: c }; postDe = p; }
      }
    }
    if (encontradoComoRaiz || encontradoComoRespuesta) break;
  }

  console.log(`publicación: ${postDe ? `${postDe.id} ("${String(postDe.title ?? '').slice(0, 20)}")` : '—'}`);
  console.log(`¿aparece como comentario de PRIMER NIVEL? ${encontradoComoRaiz ? 'SI  <-- EL FALLO SIGUE' : 'NO  <-- correcto'}`);
  console.log(`¿aparece colgando de un comentario?        ${encontradoComoRespuesta ? `SI, de "${texto(encontradoComoRespuesta.padre).slice(0, 24)}"` : 'NO'}`);
  if (encontradoComoRespuesta) {
    console.log(`   texto: "${texto(encontradoComoRespuesta.r).slice(0, 40)}"`);
    console.log(`   replyToName: ${encontradoComoRespuesta.r.replyToName ?? '—'}`);
  }

  // Limpieza: borrar lo que se encuentre con esa marca.
  let borrados = 0;
  for (const c of [encontradoComoRaiz, encontradoComoRespuesta?.r].filter(Boolean)) {
    const res = await fetch(`${LB}/comments/${c.id}`, { method: 'DELETE', headers: H(tok) });
    const cuerpo = await res.text();
    console.log(`   DELETE /comments/${c.id} -> HTTP ${res.status} ${cuerpo.slice(0, 120)}`);
    if (res.ok) borrados++;
  }
  console.log(`\nlimpieza: ${borrados} comentario(s) de prueba borrado(s)`);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
