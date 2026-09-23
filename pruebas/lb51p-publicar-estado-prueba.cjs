// lb51p-publicar-estado-prueba.cjs — publica un estado 24 h con el USUARIO DE PRUEBA para poder
// comprobar en la app que OTRA persona ve el anillo (el caso que estaba roto).
//
// Antes de esto, el estado sólo se pintaba con `myStatus`: el autor lo veía y nadie más. Para
// probar el arreglo hace falta un estado AJENO, y este script lo crea con una cuenta distinta.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return {}; } };

const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r).slice(0, 140)}`);
  return r.accessToken;
};
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  const tok = await login('+240222000123', 'MiClave123');

  // Quién soy (para poder abrir mi perfil desde la app).
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: H(tok) }));
  console.log(`usuario de prueba: id=${me.id}  nombre=${me.fullName ?? '—'}`);

  // Un preset válido: el servidor decide cuáles existen.
  const pre = await j(await fetch(`${API}/mobility/status/presets`, { headers: H(tok) }));
  const lista = Array.isArray(pre) ? pre : (pre.presets ?? []);
  console.log(`presets disponibles: ${lista.length}${lista.length ? ` (uso "${lista[0].code ?? lista[0].id}")` : ''}`);
  if (!lista.length) { console.log('sin presets: no se puede publicar'); return; }
  const presetCode = String(lista[0].code ?? lista[0].id);

  /*
    OJO con el cuerpo: `clientId` NO va aquí. La app lo saca del cuerpo y lo manda como cabecera
    `X-Client-Request-Id` (idempotencia) — ver `api/status.ts:103`. Si se manda en el cuerpo, el
    servidor contesta 400 «property clientId should not exist», que es lo que me pasó a mí la
    primera vez: el error era del script, no del servidor ni de la app.
    Y `text` tiene un máximo de 40 caracteres.
  */
  const r = await fetch(`${API}/mobility/status/me`, {
    method: 'POST',
    headers: { ...H(tok), 'X-Client-Request-Id': `${Date.now()}-${Math.random().toString(36).slice(2)}` },
    body: JSON.stringify({
      presetCode,
      text: 'Prueba: anillo en perfil publico',
      visibility: 'public',
    }),
  });
  const cuerpo = await j(r);
  console.log(`\nPOST /mobility/status/me -> HTTP ${r.status}`);
  if (r.ok) {
    console.log(`  estado publicado: id=${cuerpo.id ?? '—'}  expira=${cuerpo.expiresAt ?? '—'}`);
    console.log(`\n>>> Abre en la app el perfil de ESTE usuario: id=${me.id}`);
  } else {
    console.log(`  ${JSON.stringify(cuerpo).slice(0, 220)}`);
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
