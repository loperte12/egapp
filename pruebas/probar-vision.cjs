// probar-vision.cjs — ¿qué proveedor acepta esta clave? (la clave va por variable de entorno,
// NUNCA escrita en el fichero).
//
// Uso:  LB_KEY='sk-...' node /root/probar-vision.cjs
const KEY = String(process.env.LB_KEY ?? '').trim();
if (!KEY) { console.error('Falta LB_KEY'); process.exit(1); }

/** Los que llegan desde el servidor (comprobado con curl). */
const DESTINOS = [
  { nombre: 'DashScope (Qwen) compatible-OpenAI', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', modelo: 'qwen-plus' },
  { nombre: 'DashScope (Qwen) qwen-vl-max', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', modelo: 'qwen-vl-max' },
  { nombre: 'SiliconFlow', url: 'https://api.siliconflow.cn/v1/chat/completions', modelo: 'Qwen/Qwen2.5-7B-Instruct' },
  { nombre: 'Moonshot (Kimi)', url: 'https://api.moonshot.cn/v1/chat/completions', modelo: 'moonshot-v1-8k' },
  { nombre: 'Zhipu (GLM)', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', modelo: 'glm-4-flash' },
  { nombre: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', modelo: 'gpt-4o-mini' },
];

(async () => {
  console.log(`probando la clave (${KEY.slice(0, 8)}…, ${KEY.length} caracteres)\n`);
  for (const d of DESTINOS) {
    try {
      const r = await fetch(d.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: d.modelo, messages: [{ role: 'user', content: 'di ok' }], max_tokens: 5 }),
      });
      const t = await r.text();
      const corto = t.replace(/\s+/g, ' ').slice(0, 180);
      console.log(`${r.ok ? '✅' : '❌'} ${d.nombre} [${d.modelo}] → HTTP ${r.status}`);
      console.log(`   ${corto}\n`);
    } catch (e) {
      console.log(`❌ ${d.nombre} [${d.modelo}] → sin conexión: ${e instanceof Error ? e.message : e}\n`);
    }
  }
})();
