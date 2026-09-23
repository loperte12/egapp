// limpieza-enlaces.cjs — deja los enlaces de las dos cuentas de prueba en un estado
// HONESTO después de las pruebas de P3 (enlaces de grupo).
//
//   · BERNARDO (+240555000003): vuelve a lo que tenía de verdad antes de las pruebas —
//     un solo enlace, su correo. Se recupera del respaldo links-bernardo.json.
//   · A (+240222000123, «Usuario EG Route Plan»): se quitan los enlaces de PRUEBA que
//     quedaron de rondas anteriores (uno con un código de grupo INVENTADO, «ABC123», que
//     el perfil pinta como caducado). Se deja el enlace del grupo REAL (código vivo) para
//     que la función se pueda seguir viendo.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const fs = require('fs');

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error('login falló ' + phone);
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  return { tok: r.accessToken, id: me.id, nombre: me.fullName, links: me.links ?? [] };
};
const patch = async (tok, links) => {
  const r = await fetch(`${API}/mobility/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ links }),
  });
  const b = await j(r);
  return { s: r.status, links: b.links ?? [] };
};

(async () => {
  // ── BERNARDO: a lo que tenía ────────────────────────────────────────────────
  const original = JSON.parse(fs.readFileSync('D:\\Temp\\eg-status\\links-bernardo.json', 'utf8'));
  const B = await login('+240555000003', '123456');
  console.log(`BERNARDO antes (${B.links.length}):`, JSON.stringify(B.links));
  const rb = await patch(B.tok, original);
  console.log(`BERNARDO ahora (HTTP ${rb.s}, ${rb.links.length}):`, JSON.stringify(rb.links));

  // ── A: fuera los de prueba, se queda el grupo real ─────────────────────────
  const A = await login('+240222000123', 'MiClave123');
  console.log(`\nA antes (${A.links.length}):`, JSON.stringify(A.links));
  const limpios = A.links
    // «Cuarto fijado» y «Sin fijar» eran enlaces de prueba de los pines.
    .filter((l) => !['Cuarto fijado', 'Sin fijar'].includes(l.label))
    // El grupo con código inventado ABC123: el perfil lo pinta como caducado y confunde.
    .filter((l) => !(l.kind === 'group' && l.value === 'ABC123'))
    .map((l) => ({ kind: l.kind, label: l.label, value: l.value, pinned: l.pinned === true }));
  const ra = await patch(A.tok, limpios);
  console.log(`A ahora (HTTP ${ra.s}, ${ra.links.length}):`, JSON.stringify(ra.links));

  console.log('\nQueda en A un enlace de grupo con CÓDIGO VIVO: el perfil lo pinta como tarjeta real.');
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
