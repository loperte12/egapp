/**
 * netprobe — Sonda de diagnóstico de red (solo diagnóstico temporal).
 * Corre al arrancar y registra en consola (logcat) resultados de sondeos que
 * distinguen: DNS (¿resuelve?), TCP/TLS (¿handshake OK?), HTTP (¿responde?),
 * y si el bloqueo es específico de nuestro dominio o general.
 *
 * NO se usa en producción: eliminar cuando se cierre el diagnóstico.
 */
import { API_BASE } from './config';

function log(...a: unknown[]) {
  console.warn(`[netprobe]`, ...a);
}

async function probe(name: string, url: string, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    // Consumimos el body aunque sea grande? No: solo el status y algo del body.
    let snippet = '';
    try {
      const txt = await res.text();
      snippet = txt.slice(0, 120).replace(/\s+/g, ' ');
    } catch {
      snippet = '(sin body)';
    }
    log(`OK ${name} url=${url} status=${res.status} ms=${ms} body=${snippet}`);
  } catch (e) {
    const ms = Date.now() - t0;
    const err = e as Error & { cause?: unknown; code?: string };
    const cause = err?.cause as { code?: string; message?: string } | undefined;
    log(`FAIL ${name} url=${url} ms=${ms} msg=${String(err?.message ?? e).slice(0, 160)} code=${err?.code ?? ''} cause=${cause ? `${cause.code ?? ''} ${cause.message ?? ''}`.slice(0, 160) : ''}`);
  }
}

/** Sonda completa; llamar una vez al arrancar. */
export function runNetProbe(): void {
  setTimeout(() => {
    log('=== inicio sonda de red ===');
    // 1) Nuestro API por dominio (como hace la app) — host público con TLS válido.
    void probe('api-domain', `${API_BASE}/health`);
    // 2) Nuestro servidor por IP directa con Host header no es posible en fetch
    //    (SNI fijo por URL), así que probamos otro subdominio real del mismo host.
    void probe('root-https', `https://egrouteplan.com/`);
    // 3) Host externo HTTPS (Google 204 es bloqueado en China; usamos baidu,
    //    accesible desde cualquier red china).
    void probe('baidu', `https://www.baidu.com/robots.txt`);
    // 4) HTTP plano (puerto 80) para ver si el bloqueo es solo de TLS.
    void probe('http-plain', `http://egrouteplan.com/`);
    // 5) Hosts de CONTROL para aislar el bloqueo:
    //    · meituan (china, sin ICP issues, NO en nuestra whitelist)
    //    · taobao (china gigante)
    //    · example.com (internacional)
    void probe('meituan', `https://www.meituan.com/robots.txt`);
    void probe('taobao', `https://www.taobao.com/robots.txt`);
    void probe('example', `https://example.com/`);
    log('=== sondeos lanzados ===');
  }, 2500);
}
