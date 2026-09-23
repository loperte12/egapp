/**
 * pruebas/red.cjs — salida a internet para las pruebas.
 *
 * POR QUÉ EXISTE (medido, no supuesto): en este equipo la conexión directa a
 * `hk.egrouteplan.com:443` se queda en `UND_ERR_CONNECT_TIMEOUT` mientras que el navegador y
 * PowerShell SÍ llegan. La causa es que la salida va por un proxy local
 * (`ProxyEnable=1`, `ProxyServer=127.0.0.1:17890`) y el `fetch` de Node **no usa el proxy del
 * sistema**. Sin esto, las pruebas fallaban con «fetch failed» y parecía que el servidor estaba
 * caído.
 *
 * `prepararRed()` comprueba si el proxy está escuchando y, solo entonces, lo pone como salida de
 * `fetch`. Si no está, se va directo (que es lo normal en otra máquina o en el servidor).
 */
const net = require('node:net');

const PROXY = process.env.LB_PROXY ?? 'http://127.0.0.1:17890';

const escucha = (host, port) => new Promise((res) => {
  const s = net.connect({ host, port });
  const fin = (v) => { try { s.destroy(); } catch { /* da igual */ } res(v); };
  s.setTimeout(600, () => fin(false));
  s.on('connect', () => fin(true));
  s.on('error', () => fin(false));
});

/** Devuelve 'proxy' o 'directo' según por dónde va a salir. */
async function prepararRed() {
  let url;
  try { url = new URL(PROXY); } catch { return 'directo'; }
  if (!(await escucha(url.hostname, Number(url.port || 80)))) return 'directo';
  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(PROXY));
    return 'proxy';
  } catch {
    return 'directo';
  }
}

module.exports = { prepararRed, PROXY };
