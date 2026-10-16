// Lista las herramientas del MCP de CloudBase: buscamos una de base de datos (SQL) para aplicar la
// tabla con credenciales de administración, que es lo que el rol de la aplicación no puede hacer.
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const NPX = process.env.DSH_NPX
  ?? 'C:\\Users\\nisang12\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\node\\node_modules\\npm\\bin\\npx-cli.js';
const NODE = process.env.DSH_NODE
  ?? 'C:\\Users\\nisang12\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\node\\bin\\node.exe';

const puente = path.join(os.tmpdir(), `dsh-mcp-list-${process.pid}.mjs`);
fs.writeFileSync(puente, `
import { spawn } from 'node:child_process';
const NPX = ${JSON.stringify(NPX)};
const hijo = spawn(process.env.DSH_NODE, [NPX, '-y', '@cloudbase/cloudbase-mcp@latest'], {
  env: { ...process.env, CLOUDBASE_ENV_ID: 'egrouteplan-d0gpkwbe7ce86f609', TENCENTCLOUD_REGION: 'ap-singapore' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const pend = new Map();
hijo.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!linea) continue;
    try { const m = JSON.parse(linea); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } catch {}
  }
});
const rpc = (id, method, params) => new Promise((res) => { pend.set(id, res); hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n'); });
(async () => {
  await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dsh', version: '1' } });
  const r = await rpc(2, 'tools/list', {});
  console.log(JSON.stringify((r.result?.tools ?? []).map((t) => ({ nombre: t.name, desc: (t.description ?? '').slice(0, 90) }))));
  hijo.kill();
  process.exit(0);
})();
`);
const hijo = spawn(NODE, [puente], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let salida = '';
hijo.stdout.on('data', (d) => salida += d.toString());
hijo.stderr.on('data', (d) => { const s = d.toString(); if (!/npm warn|NO_COLOR/.test(s)) salida += 'ERR ' + s; });
hijo.on('close', () => {
  try { fs.unlinkSync(puente); } catch {}
  const m = salida.match(/\[.*\]/s);
  if (m) {
    const tools = JSON.parse(m[0]);
    console.log('herramientas del MCP:', tools.length);
    for (const t of tools) console.log('  - ' + t.nombre + ' :: ' + t.desc);
  } else {
    console.log('sin lista:', salida.slice(-600));
  }
});
