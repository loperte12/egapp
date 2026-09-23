// sonda-stock.cjs — SOLO LEE. ¿Con qué nombre devuelve la API el stock de un producto?
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-stock.cjs
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';

(async () => {
  const l = await (await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+240555000003', password: '123456' }),
  })).json();
  const tok = l.accessToken;
  const r = await (await fetch(`${API}/lifebook/commerce/products/${PRODUCTO}`, {
    headers: { Authorization: `Bearer ${tok}` },
  })).json();
  const prod = r.product ?? r;
  console.log('claves de nivel 1:', Object.keys(prod).join(', '));
  for (const [k, v] of Object.entries(prod)) {
    if (/stock|sales|variant|precio|price|status/i.test(k)) {
      console.log(`  ${k} = ${JSON.stringify(v).slice(0, 200)}`);
    }
  }
})();
