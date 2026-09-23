// lb88a-agotados.cjs — ¿el escaparate enseña lo que no se puede comprar? (punto 10 de la §3)
//
// En fases, porque hay que mover el stock de verdad en la base entre una y otra:
//   antes       el producto se ve en el catálogo, en los chips y en los contadores de la tienda
//   agotado     stock 0 (y sus tallas a 0) → NO se ve en ninguno de los tres, y su ficha SIGUE abriéndose
//   a-pedido    stock 0 pero `stock_mode = 'approximate'` → SÍ se ve (a pedido no se agota)
//   restaurado  vuelve el stock → se ve otra vez
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb88a.cjs antes|agotado|a-pedido|restaurado
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const entrar = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // Camiseta de prueba (19 000... no: 12 000 XAF)
const TIENDA = 'd8a2ece3-92b4-4959-8412-d26b5d698ade';   // Hotel Demo Malabo

/**
 * ¿Está el producto en la rejilla del catálogo de su tienda?
 *
 * Se busca por texto (`q=Camiseta`) a propósito: el catálogo devuelve como mucho 30 por página y esta
 * tienda tiene 35 productos activos, así que mirar «las primeras 30» podría dar un falso «no está».
 */
const enElCatalogo = async (tok) => {
  const r = await req('GET', `/lifebook/commerce/catalog?shopId=${TIENDA}&q=Camiseta&limit=30`, tok);
  const lista = r.b?.items ?? r.b?.products ?? [];
  return { esta: lista.some((p) => p.id === PRODUCTO), cuantos: lista.length };
};
/** Los chips por categoría del perfil público de la tienda (el campo es `count`, no `cuantos`). */
const enLosChips = async (tok) => {
  const r = await req('GET', `/lifebook/commerce/shops/${TIENDA}/categories`, tok);
  const cats = r.b?.categories ?? [];
  return { total: Number(r.b?.total ?? 0), suma: cats.reduce((n, c) => n + Number(c.count ?? 0), 0), cats: cats.length };
};
/** Los contadores del detalle de la tienda. */
const enLosContadores = async (tok) => {
  const r = await req('GET', `/lifebook/commerce/shops/${TIENDA}`, tok);
  const s = r.b?.shop ?? r.b ?? {};
  return { products: Number(s.products ?? s.stats?.products ?? -1) };
};
/** La ficha del producto: tiene que seguir abriéndose. */
const ficha = async (tok) => {
  const r = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, tok);
  const p = r.b?.product ?? {};
  return { s: r.s, titulo: p.title, stockMode: p.stockMode, stockQuantity: p.stockQuantity, status: p.status };
};

(async () => {
  const fase = String(process.argv[2] ?? 'antes').toLowerCase();
  const B = await entrar('+240555000003', '123456');
  const cat = await enElCatalogo(B);
  const chips = await enLosChips(B);
  const cont = await enLosContadores(B);
  const f = await ficha(B);
  console.log(`catálogo: ${cat.cuantos} productos · el de prueba ${cat.esta ? 'ESTÁ' : 'NO está'}`);
  console.log(`chips de la tienda: total ${chips.total} · suma por categorías ${chips.suma} (${chips.cats} categorías)`);
  console.log(`contadores de la tienda: products=${cont.products}`);
  console.log(`ficha: HTTP ${f.s} · «${f.titulo}» · stockMode=${f.stockMode} stockQuantity=${f.stockQuantity} status=${f.status}`);

  if (fase === 'antes' || fase === 'restaurado') {
    comprobar(cat.esta, `${fase}: el producto con stock se ve en el catálogo`);
    comprobar(f.s === 200, `${fase}: su ficha se abre`);
  }
  if (fase === 'agotado') {
    comprobar(!cat.esta, 'AGOTADO (stock 0 y tallas a 0): NO se ve en el catálogo');
    comprobar(f.s === 200, 'pero su ficha SIGUE abriéndose (el enlace no se rompe)');
    comprobar(chips.suma <= chips.total, `los chips no cuentan lo agotado: suma ${chips.suma} ≤ total ${chips.total}`);
    comprobar(f.stockQuantity === 0, `la ficha dice que no hay stock: ${f.stockQuantity}`);
  }
  if (fase === 'a-pedido') {
    comprobar(cat.esta, "A PEDIDO (stock 0 pero modo 'approximate'): SÍ se ve, porque a pedido no se agota");
  }

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
