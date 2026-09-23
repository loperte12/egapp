// sonda-chat.cjs — SOLO LEE. ¿Qué forma tienen las conversaciones y los mensajes?
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-chat.cjs
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };

(async () => {
  const l = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+240555000003', password: '123456' }),
  }));
  const tok = l.accessToken;

  const lista = await j(await fetch(`${API}/lifebook/chat/conversations`, { headers: { Authorization: `Bearer ${tok}` } }));
  console.log('GET /lifebook/chat/conversations → claves de nivel 1:', Object.keys(lista).join(', '));
  const arr = lista.conversations ?? lista.items ?? lista.data ?? [];
  console.log(`  conversaciones: ${arr.length}`);
  if (arr[0]) console.log('  claves de una conversación:', Object.keys(arr[0]).join(', '));
  if (arr[0]) console.log('  primera:', JSON.stringify(arr[0]).slice(0, 300));

  // Buscar en TODAS las conversaciones el aviso de «aceptó tu pedido»
  let encontrados = 0;
  for (const c of arr) {
    const msgs = await j(await fetch(`${API}/lifebook/chat/conversations/${c.id}/messages`, { headers: { Authorization: `Bearer ${tok}` } }));
    const m = msgs.messages ?? msgs.items ?? msgs.data ?? [];
    const avisos = m.filter((x) => /pedido/i.test(String(x.text ?? '')));
    if (avisos.length) {
      console.log(`  conv ${c.id}: ${m.length} mensajes · ${avisos.length} con «pedido»`);
      avisos.slice(0, 4).forEach((x) => console.log(`     · [${x.kind ?? '?'}] ${String(x.text).slice(0, 90)}`));
      encontrados += avisos.length;
    }
  }
  console.log(`\ntotal de mensajes con «pedido» encontrados: ${encontrados}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
