/**
 * httpClient — capa única de red con sesión inyectada y refresco silencioso.
 *
 * Fricción cero (UX progresiva):
 *   · Las peticiones públicas (auth=false) no llevan token: mapa, grid, zonas.
 *   · Las peticiones autenticadas (auth=true, por defecto) inyectan el access
 *     token en memoria. Si el backend responde 401 (token expirado), el
 *     interceptor canjea el refresh_token por uno nuevo y reintenta la petición
 *     original SIN que el usuario note interrupción.
 *   · Y si el 401 llega porque la petición salió **sin** token (la sesión aún se
 *     estaba rehidratando en arranque en frío) o porque **otra** pantalla ya
 *     refrescó mientras esta viajaba, se reintenta con el token de ahora, sin
 *     canjear nada. Antes esos dos casos NO se recuperaban y la pantalla se
 *     quedaba con el error aunque el mismo endpoint respondiera 200 un segundo
 *     después (medido en el registro del servidor y reproducido en
 *     `lb42q-prueba-token.cjs`).
 *
 * Seguridad:
 *   · Los tokens viven en SecureStore (Keychain/Keystore), nunca en
 *     AsyncStorage. Este módulo NO los persiste: solo los lee/escribe a través
 *     del AuthHolder que configura el SessionProvider.
 *   · `refreshInflight` es un singleton: múltiples 401 simultáneos comparten
 *     un único refresco para evitar tormentas y carreras. Y `ultimoCanje` evita
 *     canjear dos veces el MISMO refresh_token (el servidor lo rota: el segundo
 *     intento fallaría y parecería una sesión muerta).
 */

import { API_BASE } from './config';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Contrato que el SessionProvider implementa para leer/escribir tokens. */
export interface AuthHolder {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): Promise<void> | void;
  /** Sesión insalvable (refresh inválido): logout global. */
  onAuthLost(): Promise<void> | void;
}

let auth: AuthHolder | null = null;
export function configureHttpAuth(a: AuthHolder) {
  auth = a;
}

let refreshInflight: Promise<string | null> | null = null;

/** Último canje bueno, con el refresh_token que se usó. Evita canjear DOS VECES el mismo:
 *  el servidor ROTA el refresh token en cada canje, así que el segundo intento con el viejo
 *  falla — y un fallo de canje se interpretaba como «sesión muerta» y echaba al usuario. */
let ultimoCanje: { rtUsado: string; access: string; cuando: number } | null = null;
const VENTANA_CANJE_MS = 10_000;

/** Canjea el refresh_token por un par nuevo. Singleton para evitar carreras. */
async function doRefresh(): Promise<string | null> {
  if (!auth) return null;
  const rt = auth.getRefreshToken();
  if (!rt) return null;
  // Si hace un momento ya se canjeó ESTE MISMO refresh token, se devuelve el access que salió:
  // dos peticiones que reciben 401 con un segundo de diferencia comparten canje en vez de pedir dos.
  if (ultimoCanje && ultimoCanje.rtUsado === rt && Date.now() - ultimoCanje.cuando < VENTANA_CANJE_MS) {
    return ultimoCanje.access;
  }
  if (!refreshInflight) {
    refreshInflight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/mobility/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const access: string | undefined = data.accessToken;
        const refresh: string | undefined = data.refreshToken;
        if (!access || !refresh) return null;
        await auth!.setTokens(access, refresh);
        ultimoCanje = { rtUsado: rt, access, cuando: Date.now() };
        return access;
      } catch {
        return null;
      } finally {
        refreshInflight = null;
      }
    })();
  }
  return refreshInflight;
}

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** FormData multipart (subida de archivos). Reemplaza a body. */
  form?: FormData;
  /** true (por defecto): adjunta access token si existe y refresca en 401.
   *  false: petición pública (sin token). */
  auth?: boolean;
  headers?: Record<string, string>;
}

/** Petición tipada con sobre de error { error: { code, message, details } }. */
export async function httpRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const wantAuth = opts.auth !== false;
  const isForm = opts.form !== undefined;
  // Con FormData NO fijamos Content-Type: fetch genera el boundary automáticamente.
  const headers: Record<string, string> = isForm
    ? { Accept: 'application/json', ...(opts.headers ?? {}) }
    : { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers ?? {}) };

  const doReq = (tok: string | null) =>
    fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers: tok ? { ...headers, Authorization: `Bearer ${tok}` } : headers,
      body: isForm ? opts.form : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }).catch((e: unknown) => {
      // Diagnóstico de red PROFUNDO: volcamos el objeto error completo (claves
      // propias + stack nativo + cadena cause) para distinguir DNS/TLS/offline.
      const err = e as { cause?: unknown; stack?: string; nativeStackAndroid?: unknown } & Record<string, unknown>;
      const cause = (err as { cause?: { code?: string } })?.cause?.code
        ?? (err as { code?: string })?.code
        ?? '';
      const raw = String((err as unknown as Error)?.message ?? 'Network request failed');
      const deep = err?.cause;
      console.warn(`[http] red falló en ${path}: code=${cause} raw=${raw}`);
      console.warn(`[http] tipo=${(err as { constructor?: { name?: string } })?.constructor?.name} txt=${String(err).slice(0, 240)} causa=${typeof deep === 'string' ? deep : deep && typeof deep === 'object' ? JSON.stringify(deep).slice(0, 500) : String(deep ?? '')}`);
      // Volcado completo: claves propias, stack JS y stack nativo de Android.
      try {
        const keys = Object.getOwnPropertyNames(err).join(',');
        console.warn(`[http] KEYS=${keys}`);
        console.warn(`[http] STACK=${String(err?.stack ?? '').slice(0, 800)}`);
        console.warn(`[http] NATIVE=${JSON.stringify(err?.nativeStackAndroid ?? null).slice(0, 800)}`);
        // Inspección recursiva de la cadena cause (hasta 4 niveles).
        let c: unknown = err?.cause;
        for (let i = 1; i <= 4 && c; i++) {
          const co = c as { message?: string; code?: string; stack?: string } & Record<string, unknown>;
          console.warn(`[http] CAUSE${i}={msg:${co?.message ?? ''},code:${co?.code ?? ''},keys:${Object.getOwnPropertyNames(co).join(',')}}`);
          c = co?.cause;
        }
      } catch (logErr) {
        console.warn(`[http] logdump err ${String(logErr)}`);
      }
      throw new ApiError('NETWORK', `Error de red${cause ? ` (${cause})` : ''}: ${raw.slice(0, 140)}`, { cause, raw });
    });

  const attachedTok = wantAuth ? auth?.getAccessToken() ?? null : null;
  let res = await doReq(attachedTok);

  // ── 401 con sesión: recuperarse SIN que el usuario note nada ──────────────────
  // Tres casos, y el ORDEN importa:
  //
  //  1) **El token cambió (o apareció) desde que salió la petición.** Es el caso que dejaba
  //     pantallas en «No pudimos cargar…» en arranque en frío: la sesión todavía se estaba
  //     rehidratando, la petición salió **sin token**, llegó el 401… y el bloque de antes exigía
  //     que hubiera un token que refrescar, así que **no hacía nada** y el 401 salía a la pantalla.
  //     También ocurre cuando otra pantalla acaba de refrescar mientras esta viajaba. En los dos
  //     casos basta con reintentar con el token de AHORA: no hay que canjear nada.
  //  2) **El token es el mismo** → se canjea el refresh_token (singleton) y se reintenta.
  //  3) Si el reintento con un token nuevo **también** da 401, la sesión ya no vale: `onAuthLost`,
  //     una sola vez. Y si no hubo forma de conseguir un token y ya teníamos uno, también.
  if (res.status === 401 && wantAuth) {
    const tokenAhora = () => auth?.getAccessToken() ?? null;
    let token = tokenAhora();
    let reintentado = false;
    if (token && token !== attachedTok) {
      reintentado = true;
      res = await doReq(token);
    } else if (attachedTok) {
      const fresco = await doRefresh();
      token = fresco ?? tokenAhora();
      if (token && token !== attachedTok) {
        reintentado = true;
        res = await doReq(token);
      } else {
        await auth?.onAuthLost();
      }
    }
    if (res.status === 401 && reintentado) await auth?.onAuthLost();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as any)?.error ?? {};
    const rawMsg = e.message ?? 'Error de red';
    const message = Array.isArray(rawMsg) ? rawMsg.join('. ') : rawMsg;
    throw new ApiError(e.code ?? 'HTTP_' + res.status, message, e.details ?? {});
  }
  // Desempaqueta el sobre estándar del backend unificado: { success: true, data: X } → X.
  // (auth y los módulos food/work/... responden directo; mobility/intercity envuelven.)
  const unwrapped = (data as any) && typeof data === 'object' && (data as any).success === true && 'data' in data
    ? (data as any).data
    : data;
  return unwrapped as T;
}

/** Atajos para los verbos habituales. */
export const http = {
  get: <T>(path: string, auth = true) => httpRequest<T>(path, { method: 'GET', auth }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    httpRequest<T>(path, { method: 'POST', body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    httpRequest<T>(path, { method: 'PUT', body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) =>
    httpRequest<T>(path, { method: 'PATCH', body, auth }),
  /* `delete` y no `del`: es el verbo HTTP y así la llamada se lee igual que la ruta del servidor.
     Es válido como nombre de propiedad de un objeto literal, aunque `delete` sea palabra reservada. */
  delete: <T>(path: string, auth = true) => httpRequest<T>(path, { method: 'DELETE', auth }),
};
