#!/usr/bin/env node
/**
 * desplegar-ui-mercado.cjs — publicar la UI del Mercado en la función VIVA
 * =============================================================================
 *
 * ## Por qué existe
 *
 * El despliegue cuesta una hora si no se sabe, y ya costó dos fallos que no eran del código (ver
 * `docs/CONTINUAR-MERCADO.md` §13). Esto lo deja en un comando, con las dos comprobaciones que
 * evitan los dos fallos:
 *
 *   1. **La subida se verifica con el `ETag` de COS contra el MD5 local.** El primer intento dio
 *      HTTP 200 y NO había subido nada.
 *   2. **El paquete se construye LIMPIO con un escritor estándar** (Python `zipfile`). Un ZIP
 *      reescrito con `System.IO.Compression` en modo `Update` lo rechaza el `unzip` de SCF con
 *      `zip code format error` aunque `tar`, Python y .NET lo lean sin queja.
 *
 * Y usa la API de SCF **directa**, porque `manageFunctions` del MCP decía `success: true` sin
 * desplegar nada (`ResourceNotFound.Cos`: busca el paquete en el bucket temporal de SCF).
 *
 * ## Uso
 *
 *   node pruebas/desplegar-ui-mercado.cjs --comprobar   # solo lee: qué hay desplegado ahora
 *   node pruebas/desplegar-ui-mercado.cjs               # descarga, parchea, sube y despliega
 *
 * ## Credenciales
 *
 * **Del entorno, nunca de un fichero**: `TENCENTCLOUD_SECRETID` y `TENCENTCLOUD_SECRETKEY`
 * (las del conector `cloudbase-api-keys`). Sin ellas, el script sale con código 2 y **no toca nada**.
 *
 * ## Deshacer
 *
 * `--comprobar` imprime el `codeSha256` desplegado. El ZIP que había ANTES de esta línea de trabajo
 * está en `.tmp-cloudbase/rollback/` con su sha256; para volver atrás, se sube ese ZIP y se llama a
 * `updateFunctionCode` con él. **Se despliega lo que se comprueba, no lo que se supone.**
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const NODE = process.execPath;
const PYTHON = process.env.PYTHON_UI ?? 'C:\\Users\\nisang12\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';

/** La función viva: ZIP Web Function de CloudBase, región ap-singapore. */
const FUNCION = { nombre: 'egrouteplan-api', envId: 'egrouteplan-d0gpkwbe7ce86f609', region: 'ap-singapore' };

/**
 * Los ficheros que se empujan, en el árbol vivo del backend.
 *
 * **Fue una sorpresa cara**: el script bajaba el código VIVO y solo reemplazaba estos dos, así que
 * durante toda la línea de trabajo **la UI viajaba y el resto del backend no**. Se notó al empujar el
 * endpoint de seguidos: se desplegó, y en producción las rutas seguían sin existir (404), mientras la
 * ruta de la UI nueva sí estaba. La lista es el CONTRATO de lo que se publica: si algo se cambia fuera
 * de ella, no llega.
 */
const FICHEROS = [
  // la UI del Mercado (lo que este script despliega desde el principio)
  'dist/src/ecomerse/ecomerse-ui.controller.js',
  'dist/src/ecomerse/ecomerse.module.js',
  // y el módulo de ecomerse, que es donde viven las rutas de verdad (seguidos, etc.)
  'dist/src/ecomerse/ecomerse.controller.js',
  'dist/src/ecomerse/ecomerse.service.js',
];
const ORIGEN = path.join(RAIZ, '.auditoria-servicios', 'backend');

const MCP_ENV = {
  ...process.env,
  CLOUDBASE_ENV_ID: FUNCION.envId,
  TENCENTCLOUD_REGION: FUNCION.region,
};

const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const md5 = (p) => createHash('md5').update(fs.readFileSync(p)).digest('hex');

/** Habla con el MCP de CloudBase por stdio: initialize, tools/call y a cerrar. */
function llamarMcp(herramienta, argumentos) {
  const puente = path.join(os.tmpdir(), `dsh-mcp-${process.pid}.mjs`);
  fs.writeFileSync(puente, `
    import { spawn } from 'node:child_process';
    const NPX = process.env.DSH_NPX;
    const hijo = spawn(process.env.DSH_NODE, [NPX, '-y', '@cloudbase/cloudbase-mcp@latest'],
      { env: process.env, stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = '';
    const pend = new Map();
    hijo.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!l) continue;
        let m; try { m = JSON.parse(l); } catch { continue; }
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      }
    });
    const rpc = (id, method, params) => new Promise((res) => {
      pend.set(id, res);
      hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n');
    });
    await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'desplegar', version: '1' } });
    hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\\n');
    const r = await rpc(2, 'tools/call', { name: process.env.DSH_TOOL, arguments: JSON.parse(process.env.DSH_ARGS) });
    const texto = r.result?.content?.[0]?.text ?? JSON.stringify(r.error ?? r.result);
    try { const j = JSON.parse(texto); console.log(JSON.stringify(j)); }
    catch { console.log(JSON.stringify({ crudo: texto })); }
    hijo.kill();
    setTimeout(() => process.exit(0), 200);
  `);
  try {
    const npx = process.env.DSH_NPX ?? 'C:\\Users\\nisang12\\.workbuddy\\binaries\\node\\versions\\22.22.2-6\\node_modules\\npm\\bin\\npx-cli.js';
    const salida = execFileSync(NODE, [puente], {
      env: { ...MCP_ENV, DSH_TOOL: herramienta, DSH_ARGS: JSON.stringify(argumentos), DSH_NODE: process.execPath, DSH_NPX: npx },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });
    return JSON.parse(salida.trim().split('\n').pop());
  } finally {
    fs.rmSync(puente, { force: true });
  }
}

const q = (herramienta, argumentos) => {
  const r = llamarMcp(herramienta, argumentos);
  if (r.success === false) throw new Error(`${herramienta}: ${r.message ?? JSON.stringify(r)}`);
  return r.data ?? r;
};

function comprobarCredenciales() {
  if (!process.env.TENCENTCLOUD_SECRETID || !process.env.TENCENTCLOUD_SECRETKEY) {
    console.error('Faltan TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY (las del conector cloudbase-api-keys).');
    console.error('Sin credenciales no se toca nada.');
    process.exit(2);
  }
}

// ─────────────────────────── 1 · qué hay desplegado ───────────────────────────
function comprobar() {
  const d = q('queryFunctions', { action: 'getFunctionDownloadUrl', functionName: FUNCION.nombre });
  console.log(`función        ${FUNCION.nombre} (${FUNCION.envId}, ${FUNCION.region})`);
  console.log(`codeSha256     ${d.codeSha256}`);
  console.log(`url de bajada  ${String(d.downloadUrl).slice(0, 60)}…`);
  const det = q('queryFunctions', { action: 'getFunctionDetail', functionName: FUNCION.nombre });
  const f = det.functionDetail ?? {};
  console.log(`estado         ${f.Status} / ${f.AvailableStatus} · CodeSize ${f.CodeSize} · ModTime ${f.ModTime}`);
  if (f.StatusReasons?.length) console.log(`motivos        ${JSON.stringify(f.StatusReasons)}`);
  return d;
}

// ─────────────────────────── 2 · descargar, parchear, subir, desplegar ───────────────────────────
function desplegar() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-mercado-'));
  try {
    // a) el código VIVO, que es la base: así el paquete no arrastra copias viejas de nada más.
    const d = comprobar();
    const vivo = path.join(tmp, 'vivo.zip');
    execFileSync('curl.exe', ['-s', '-S', '-L', '-o', vivo, d.downloadUrl], { stdio: 'inherit' });
    console.log(`vivo           ${fs.statSync(vivo).size.toLocaleString('es')} B  sha256 ${sha256(vivo).slice(0, 16)}…`);

    // b) los dos ficheros del Mercado, sustituidos por los del árbol de trabajo.
    const carpeta = path.join(tmp, 'paquete');
    fs.mkdirSync(carpeta, { recursive: true });
    execFileSync(PYTHON, ['-c', `
import zipfile, sys
zipfile.ZipFile(r"${vivo}").extractall(r"${carpeta}")
`], { stdio: 'inherit' });
    for (const f of FICHEROS) {
      const destino = path.join(carpeta, ...f.split('/'));
      if (!fs.existsSync(destino)) throw new Error(`el paquete vivo no trae ${f}: ¿cambió el backend?`);
      fs.copyFileSync(path.join(ORIGEN, ...f.split('/')), destino);
    }

    // c) paquete NUEVO con escritor estándar (el unzip de SCF rechaza los ZIP reescritos).
    const nuevo = path.join(tmp, 'nuevo.zip');
    execFileSync(PYTHON, ['-c', `
import os, zipfile
src, dst = r"${carpeta}", r"${nuevo}"
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(src):
        dirs.sort(); files.sort()
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src).replace("\\\\", "/"))
zz = zipfile.ZipFile(dst)
assert zz.testzip() is None, "CRC roto"
print("paquete:", len(zz.infolist()), "entradas,", os.path.getsize(dst), "B")
`], { stdio: 'inherit' });

    // d) subir y COMPROBAR con el ETag (= MD5 del objeto) que llegó entero.
    const sub = q('queryFunctions', { action: 'getFunctionUploadUrl', functionName: FUNCION.nombre });
    const hdr = path.join(tmp, 'h.txt');
    const code = execFileSync('curl.exe', ['-s', '-S', '-X', 'PUT', '-H', 'Content-Type: application/zip',
      '-T', nuevo, '-D', hdr, '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-w', '%{http_code}', sub.uploadUrl],
      { encoding: 'utf8' });
    const etag = (fs.readFileSync(hdr, 'utf8').match(/etag:\s*"?([0-9a-f]+)"?/i) ?? [])[1];
    if (String(code).trim() !== '200' || etag !== md5(nuevo)) {
      throw new Error(`la subida no llegó entera: HTTP ${code}, etag ${etag}, md5 ${md5(nuevo)}`);
    }
    console.log(`subida         HTTP 200 · etag = md5 ✓`);

    // e) desplegar por la API de SCF (el MCP falla aquí en silencio) y verificar el estado.
    const r = llamarMcp('callCloudApi', {
      service: 'scf', action: 'UpdateFunctionCode', version: '2018-04-16', region: FUNCION.region,
      params: {
        FunctionName: FUNCION.nombre, Namespace: FUNCION.envId,
        CosBucketName: sub.cosBucketName, CosObjectName: sub.cosObjectName, CosBucketRegion: sub.cosBucketRegion,
      },
    });
    console.log(`despliegue     ${JSON.stringify(r?.data?.RequestId ?? r)}`);
    console.log('\nempaquetado y enviado. **Comprobar el estado en 30 s con `--comprobar` y, sobre todo, con');
    console.log('el verificador de producción:**');
    console.log('  node "../<ruta>/o1-oraculo/work/verificar-produccion.mjs"');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes('--comprobar')) comprobar();
else { comprobarCredenciales(); desplegar(); }
