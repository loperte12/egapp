// AS-31 · Analiza la especificacion OpenAPI del servicio intermedio Poizon-API.
// OJO: es la especificacion de un servicio COMERCIAL de terceros (poizon-api.com), no un cliente
// oficial de Dewu. Se lee solo para conocer la FORMA del modelo de datos. No se genera cliente ni se
// llama a ningun endpoint suyo.
'use strict';
const https = require('https');
const fs = require('fs');

const url = 'https://poizon-api.com/api/dewu/api-json';
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let raw = '';
  res.on('data', (c) => { raw += c; });
  res.on('end', () => {
    fs.writeFileSync('D:\\egapp\\.auditoria-servicios\\dewu-api\\openapi-poizon.json', raw, 'utf8');
    let spec;
    try { spec = JSON.parse(raw); } catch (e) { console.log('NO es JSON valido:', e.message); return; }

    console.log('openapi:', spec.openapi || spec.swagger);
    console.log('titulo:', (spec.info || {}).title, '| version:', (spec.info || {}).version);
    console.log('servidores:', JSON.stringify((spec.servers || []).map((s) => s.url)));
    console.log('');

    const paths = spec.paths || {};
    const nombres = Object.keys(paths);
    console.log('=== ENDPOINTS (' + nombres.length + ') ===');
    for (const p of nombres) {
      for (const m of Object.keys(paths[p])) {
        const op = paths[p][m] || {};
        const resumen = (op.summary || op.operationId || '').replace(/\s+/g, ' ').slice(0, 80);
        console.log(`  ${m.toUpperCase().padEnd(6)} ${p.padEnd(44)} ${resumen}`);
      }
    }
    console.log('');

    const schemas = ((spec.components || {}).schemas) || {};
    const sn = Object.keys(schemas);
    console.log('=== MODELOS (' + sn.length + ') ===');
    for (const s of sn) console.log('  ' + s);

    // El modelo de producto: sus campos
    const interes = sn.filter((s) => /product|commodity|goods|spu|sku|size|price/i.test(s));
    for (const s of interes.slice(0, 4)) {
      const props = schemas[s].properties || {};
      console.log('');
      console.log('=== CAMPOS DE ' + s + ' (' + Object.keys(props).length + ') ===');
      for (const k of Object.keys(props)) {
        const d = props[k];
        const tipo = d.type || (d.$ref ? String(d.$ref).split('/').pop() : (d.items ? 'array' : '?'));
        const ej = d.example !== undefined ? ' ej=' + JSON.stringify(d.example).slice(0, 40) : '';
        const desc = d.description ? ' — ' + String(d.description).replace(/\s+/g, ' ').slice(0, 60) : '';
        console.log(`  ${k.padEnd(28)} ${String(tipo).padEnd(12)}${ej}${desc}`);
      }
    }
  });
}).on('error', (e) => console.log('FALLO de red:', e.message));
