#!/usr/bin/env node
/**
 * tools/re-xhs.mjs — ayuda para alinear con la referencia Xiaohongshu (Red Book) sin re-RE manual.
 *
 * Uso:
 *   node tools/re-xhs.mjs dsl <nombre-o-ruta>     paquete, nodos, claves ${content.data...}
 *   node tools/re-xhs.mjs class <regex>           ficheros Java del decompilado que casan
 *   node tools/re-xhs.mjs strings <texto>         cadenas de recursos (zh) que contienen el texto
 *   node tools/re-xhs.mjs grep <regex>            busca en fuentes Java y resources
 *
 * Ruta del decompilado: variable XHS_JADX (por defecto D:\Tools\rea-analysis\jadx-out).
 */
import fs from 'node:fs';
import path from 'node:path';

const JADX = process.env.XHS_JADX || 'D:/Tools/rea-analysis/jadx-out';
const SRC = path.join(JADX, 'src', 'sources');
const DSL = path.join(JADX, 'nosrc', 'resources', 'assets', 'dsl');
const RES = path.join(JADX, 'nosrc', 'resources', 'res');

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function dsl(name) {
  const base = name.includes(path.sep) || name.includes('/') ? name : path.join(DSL, name);
  const dslFile = path.join(base, 'dsl.json');
  if (!fs.existsSync(dslFile)) {
    // buscar por nombre parcial
    const match = fs.existsSync(DSL)
      ? fs.readdirSync(DSL).find((d) => d.includes(name))
      : null;
    if (!match) { console.error(`No encontrado: ${name}`); process.exit(1); }
    return dsl(path.join(DSL, match));
  }
  const raw = fs.readFileSync(dslFile, 'utf8');
  const json = JSON.parse(raw);
  const pkg = json.package || {};
  console.log(`# ${pkg.name ?? path.basename(base)}  (min_android ${pkg.min_android_version ?? '?'})`);
  const keys = new Set();
  const types = new Set();
  const walkNode = (n) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.type === 'string') types.add(n.type);
    const s = JSON.stringify(n.attributes ?? {});
    for (const m of s.matchAll(/\$\{content\.data[^}]*\}/g)) keys.add(m[0]);
    for (const c of n.children ?? []) walkNode(c);
  };
  walkNode(json);
  console.log('tipos:', [...types].join(', '));
  console.log('claves:', [...keys].join('\n        ') || '(ninguna)');
  const evalFile = path.join(base, 'eval.json');
  if (fs.existsSync(evalFile)) {
    const ev = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
    console.log('eval keys:', Object.keys(ev).slice(0, 20).join(', '));
  }
}

function classList(re) {
  const rx = new RegExp(re, 'i');
  const files = walk(SRC).filter((f) => f.endsWith('.java'));
  for (const f of files) {
    if (rx.test(path.basename(f))) console.log(f.replace(SRC + path.sep, ''));
  }
}

function strings(text) {
  const files = walk(RES).filter((f) => f.endsWith('strings.xml'));
  const rx = new RegExp(text, 'i');
  let n = 0;
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (rx.test(line)) {
        if (n++ < 40) console.log(`${path.basename(path.dirname(f))} ${i + 1}: ${line.trim().slice(0, 200)}`);
      }
    });
  }
  if (!n) console.log('(sin coincidencias)');
}

function grep(re) {
  const rx = new RegExp(re, 'i');
  const files = [...walk(SRC), ...walk(RES)].filter((f) => /\.(java|xml|json|js)$/.test(f));
  let n = 0;
  for (const f of files) {
    let txt = '';
    try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines = txt.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (rx.test(line) && n++ < 60) {
        console.log(`${f.replace(JADX + path.sep, '')}:${i + 1}: ${line.trim().slice(0, 200)}`);
      }
    });
  }
  if (!n) console.log('(sin coincidencias)');
}

switch (cmd) {
  case 'dsl': dsl(arg); break;
  case 'class': classList(arg); break;
  case 'strings': strings(arg); break;
  case 'grep': grep(arg); break;
  default:
    console.log('Uso: node tools/re-xhs.mjs <dsl|class|strings|grep> <arg>');
}
