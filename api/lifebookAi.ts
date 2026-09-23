/**
 * api/lifebookAi.ts — EL ASISTENTE DE IA (tanda M).
 *
 * Vive en su propio fichero, como `lifebookCarrito.ts` o `lifebookCiudad.ts`, para no tocar
 * `api/lifebook.ts` (que el dueño pidió no tocar).
 *
 * Todas las rutas exigen sesión: el asistente es de cada persona y su cupo de mensajes también.
 */
import { http, httpRequest } from './httpClient';

/** Una tarjeta que el asistente enseña además del texto: un producto o una tienda REALES. */
export interface LbAiTarjeta {
  /** `foto` = la imagen que adjuntó la persona (se enseña grande, no como tarjeta de producto). */
  tipo: 'producto' | 'tienda' | 'comida' | 'alquiler' | 'alojamiento' | 'foto';
  id: string;
  titulo: string;
  subtitulo: string | null;
  precioXaf: number | null;
  ciudad: string | null;
  fotoUrl: string | null;
}

export interface LbAiMensaje {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: LbAiTarjeta[];
  createdAt: string;
  /** Tanda N: «me gusta» puesto por su dueño (solo en las respuestas del asistente). */
  liked?: boolean;
}

export interface LbAiEstado {
  /** `false` = todavía no se ha puesto la clave del servicio de IA en el servidor. */
  configured: boolean;
  model: string;
  dailyLimit: number;
  usedToday: number;
  leftToday: number;
}

export interface LbAiConversacion {
  conversation: { id: string; title: string | null; updatedAt: string } | null;
  messages: LbAiMensaje[];
}

export const aiApi = {
  /** ¿Está listo el asistente y cuántos mensajes quedan hoy? */
  estado: () => http.get<LbAiEstado>('/lifebook/ai/state'),
  /** La conversación abierta, con lo que ya se habló y las tarjetas que enseñó. */
  conversacion: (conversationId?: string) =>
    http.get<LbAiConversacion>(`/lifebook/ai/chat${conversationId ? `?conversationId=${conversationId}` : ''}`),
  /** Preguntar. La respuesta trae el texto y las tarjetas reales. */
  preguntar: (
    message: string,
    conversationId?: string | null,
    /**
     * Tanda N: lo que se adjunta al mensaje.
     *  · `imageUrl`: la foto (URL pública o `data:` en base64) — la mira el modelo con visión.
     *  · `productId`: un producto del catálogo, que se enseña como tarjeta embebida y del que el
     *    asistente sabe hablar.
     */
    extra?: { imageUrl?: string | null; productId?: string | null },
  ) =>
    http.post<{ conversationId: string; reply: { text: string; cards: LbAiTarjeta[] }; leftToday: number }>(
      '/lifebook/ai/chat',
      {
        message,
        ...(conversationId ? { conversationId } : {}),
        ...(extra?.imageUrl ? { imageUrl: extra.imageUrl } : {}),
        ...(extra?.productId ? { productId: extra.productId } : {}),
      },
    ),
  /** Empezar de cero (la conversación anterior se queda guardada). */
  nueva: () => http.post<LbAiConversacion>('/lifebook/ai/new', {}),

  // ── Tanda N: historial, me gusta y consejos ────────────────────────────────
  /** EL HISTORIAL: mis conversaciones, la última primero. */
  conversaciones: () => http.get<{ conversations: LbAiResumen[] }>('/lifebook/ai/conversations'),
  /** Borrar una conversación mía. */
  borrarConversacion: (id: string) =>
    httpRequest<{ ok: boolean; deleted: number }>(`/lifebook/ai/conversations/${id}`, { method: 'DELETE' }),
  /** «Me gusta» a una respuesta del asistente (señal privada). */
  meGusta: (messageId: string, liked: boolean) =>
    http.patch<{ id: string; liked: boolean }>(`/lifebook/ai/messages/${messageId}/like`, { liked }),
  /**
   * EDITAR un mensaje mío. Solo los míos: lo que dijo Cucucul no se reescribe (sería falsear lo que
   * dijo); si no gustó, se borra o se le pide otra respuesta.
   */
  editarMensaje: (messageId: string, text: string) =>
    http.patch<{ id: string; text: string }>(`/lifebook/ai/messages/${messageId}`, { text }),
  /** BORRAR un mensaje mío (desaparece también del contexto del asistente). */
  borrarMensaje: (messageId: string) =>
    httpRequest<{ ok: boolean; deleted: number }>(`/lifebook/ai/messages/${messageId}`, { method: 'DELETE' }),
  /** Consejo para mejorar el asistente (mejora, fallo o elogio). */
  consejo: (text: string, kind: 'mejora' | 'fallo' | 'elogio' = 'mejora', messageId?: string | null) =>
    http.post<{ ok: boolean; kind: string }>('/lifebook/ai/feedback', {
      text, kind, ...(messageId ? { messageId } : {}),
    }),
};

/** Una conversación del historial (lo justo para la lista). */
export interface LbAiResumen {
  id: string;
  title: string;
  messages: number;
  updatedAt: string;
}
