/**
 * ERRORES EN LENGUA HUMANA — un solo sitio donde un código del servidor se convierte en una frase.
 *
 * POR QUÉ EXISTE (auditoría de diseño, D-16/D-42): las pantallas hacían `setError(e.message)`, así
 * que al usuario le llegaban cosas como «Error de red (ENOTFOUND): Network request failed» o
 * «DAILY_LIMIT_EXCEEDED». Un código no le dice a nadie qué hacer a continuación.
 *
 * REGLA: cada mensaje dice **qué pasó** y **qué puede hacer ahora**. Si un código no está en el mapa,
 * se limpia el ruido técnico y se ofrece una salida genérica honesta.
 */
import { ApiError } from '../api/auth';

/** Mensajes por código. Los códigos son los que devuelve el backend. */
const POR_CODIGO: Record<string, string> = {
  KYC_REQUIRED: 'Para mover dinero necesitas verificar tu identidad antes.',
  PIN_INVALID: 'El PIN no es correcto. Vuelve a intentarlo.',
  PIN_LOCKED: 'El PIN está bloqueado por intentos fallidos. Espera unos minutos o escríbenos.',
  PIN_REQUIRED: 'Falta el PIN del monedero.',
  AMOUNT_REQUIRED: 'Falta el importe.',
  AMOUNT_MISMATCH: 'El importe cambió mientras pagabas. Vuelve a intentarlo.',
  INSUFFICIENT_FUNDS: 'No tienes saldo suficiente en el monedero. Recarga y vuelve a intentarlo.',
  DAILY_LIMIT_EXCEEDED: 'Has llegado al límite de hoy. Podrás seguir mañana o reducir el importe.',
  LIMIT_EXCEEDED: 'Has llegado al límite permitido. Prueba con un importe menor.',
  NOT_FOUND: 'Eso ya no existe: puede que lo hayan quitado o vendido.',
  OUT_OF_STOCK: 'Se agotó mientras mirabas. Quita ese producto para seguir.',
  CONFLICT: 'Alguien cambió esto a la vez que tú. Actualiza la pantalla y repite.',
  TOO_MANY_REQUESTS: 'Demasiados intentos seguidos. Espera un minuto.',
  UNAUTHORIZED: 'Tu sesión ha caducado. Vuelve a entrar.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para esto.',
  VALIDATION_ERROR: 'Alguno de los datos no es válido. Revísalos y vuelve a intentarlo.',
};

/** Señales de que el problema está en la red del usuario, no en el servidor. */
const ES_RED = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|Network request failed|network|timeout|Failed to fetch/i;

export function mensajeDeError(e: unknown, alternativa = 'No se pudo completar la operación.'): string {
  if (e instanceof ApiError) {
    const codigo = String((e as { code?: string }).code ?? '');
    if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];
    const texto = e.message ?? '';
    if (ES_RED.test(texto)) return 'No hay conexión. Comprueba tus datos y vuelve a intentarlo.';
    return limpiar(texto) || alternativa;
  }
  if (e instanceof Error) {
    if (ES_RED.test(e.message)) return 'No hay conexión. Comprueba tus datos y vuelve a intentarlo.';
    return limpiar(e.message) || alternativa;
  }
  if (typeof e === 'string' && e.trim()) return limpiar(e) || alternativa;
  return alternativa;
}

/**
 * Quita el ruido técnico que no debe llegar a la pantalla: el código entre paréntesis y los sufijos
 * en inglés de las librerías («Network request failed»). Si al limpiar no queda nada, devuelve ''.
 */
function limpiar(texto: string): string {
  return texto
    .replace(/\(([A-Z_]{4,})\)/g, '')
    .replace(/\bNetwork request failed\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
