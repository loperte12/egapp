// Llamador genérico del MCP de CloudBase: `node mcp-cloudbase.mjs <herramienta> '<json>'`
// (mismo camino que usa el despliegue, pero sirviendo para cualquier herramienta — aquí, las de
// PostgreSQL, que traen rol de administración y por eso pueden crear la tabla que el rol de la
// aplicación no puede).
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const NODE = process.env.DSH_NODE ?? process.execPath;
const NPX = process.env.DSH_NPX;
let [herramienta, argsJson] = process.argv.slice(2);
if (argsJson && argsJson.startsWith('@')) argsJson = fs.readFileSync(argsJson.slice(1), 'utf8');
if (!herramienta) { console.error('falta la herramienta'); process.exit(2); }

const puente = path.join(os.tmpdir(), `dsh-mcp-call-${process.pid}.mjs`);
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
  const r = await rpc(2, 'tools/call', { name: process.env.DSH_TOOL, arguments: JSON.parse(process.env.DSH_ARGS) });
  console.log('@@@' + JSON.stringify(r) + '@@@');
  hijo.kill();
  process.exit(0);
})();
`);

const hijo = spawn(NODE, [puente], {
  env: { ...process.env, DSH_TOOL: herramienta, DSH_ARGS: argsJson ?? '{}' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let salida = '';
hijo.stdout.on('data', (d) => salida += d.toString());
hijo.stderr.on('data', (d) => { const s = d.toString(); if (!/npm warn|NO_COLOR/.test(s)) salida += 'ERR ' + s; });
hijo.on('close', () => {
  try { fs.unlinkSync(puente); } catch {}
  const m = salida.match(/@@@(.*)@@@/s);
  if (!m) { console.log('sin respuesta:', salida.slice(-800)); process.exit(1); }
  const r = JSON.parse(m[1]);
  const texto = (r.result?.content ?? []).map((c) => c.text ?? '').join('\n');
  if (r.result?.isError) { console.log('ERROR DE LA HERRAMIENTA:'); console.log(texto.slice(0, 2000)); process.exit(1); }
  console.log(texto.slice(0, 4000));
});
