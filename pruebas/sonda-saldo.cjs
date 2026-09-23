// sonda-saldo.cjs — ¿el saldo de una tienda se puede mirar desde otra cuenta? (solo lee)
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-saldo.cjs
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const TIENDA_ID = 'd8a2ece3-92b4-4959-8412-d26b5d698ade'; // Hotel Demo Malabo
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };

const entrar = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  return r.accessToken;
};

(async () => {
  const B = await entrar('+240555000003', '123456');
  const T = await entrar('+240222000123', 'MiClave123');

  // 1) El comprador pide SU saldo (no tiene por qué ser el de la tienda de pruebas).
  const suyo = await j(await fetch(`${API}/lifebook/commerce/money/balance`, { headers: { Authorization: `Bearer ${B}` } }));
  console.log(`B sin ?shopId → HTTP ok · tienda devuelta: ${suyo?.shop?.name ?? '(ninguna)'} · tiene ${suyo?.tiendas?.length ?? 0} tienda(s)`);

  // 2) El comprador pide el saldo de la tienda de OTRO. Esto es lo que no puede pasar.
  const ajeno = await fetch(`${API}/lifebook/commerce/money/balance?shopId=${TIENDA_ID}`, { headers: { Authorization: `Bearer ${B}` } });
  const cuerpo = await j(ajeno);
  console.log(`B con ?shopId=<Hotel Demo Malabo> → HTTP ${ajeno.status} · ${cuerpo?.error?.code ?? JSON.stringify(cuerpo).slice(0, 80)}`);

  // 3) La dueña de la tienda sí lo ve.
  const propio = await j(await fetch(`${API}/lifebook/commerce/money/balance?shopId=${TIENDA_ID}`, { headers: { Authorization: `Bearer ${T}` } }));
  console.log(`la tienda con su propio shopId → HTTP ok · «${propio?.shop?.name}» pendiente ${propio?.pendienteXaf} XAF`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
