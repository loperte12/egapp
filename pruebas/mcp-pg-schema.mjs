// Muestra el esquema de entrada de las herramientas de PostgreSQL del MCP de CloudBase.
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const NODE = process.env.DSH_NODE ?? process.execPath;
const NPX = process.env.DSH_NPX;

const puente = path.join(os.tmpdir(), `dsh-mcp-schema-${process.pid}.mjs`);
fs.writeFileSync(puente, `
import { spawn } from 'node:child_process';
const hijo = spawn(process.env.DSH_NODE, [process.env.DSH_NPX, '-y', '@cloudbase/cloudbase-mcp@latest'], {
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
  const quiero = ['managePgDatabase', 'queryPgDatabase'];
  const salida = (r.result?.tools ?? []).filter((t) => quiero.includes(t.name)).map((t) => ({ nombre: t.name, esquema: t.inputSchema }));
  console.log('@@@' + JSON.stringify(salida) + '@@@');
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
  const m = salida.match(/@@@(.*)@@@/s);
  if (!m) { console.log('sin esquema:', salida.slice(-500)); return; }
  for (const t of JSON.parse(m[1])) {
    console.log('=== ' + t.nombre + ' ===');
    const props = t.esquema?.properties ?? {};
    console.log('  requeridos:', JSON.stringify(t.esquema?.required ?? []));
    for (const [k, v] of Object.entries(props)) {
      const enums = v.enum ? ' enum=' + JSON.stringify(v.enum) : (v.items?.enum ? ' enum[]=' + JSON.stringify(v.items.enum) : '');
      console.log('  · ' + k + ' (' + (v.type ?? '?') + ')' + enums + ' :: ' + String(v.description ?? '').slice(0, 150));
    }
  }
});
