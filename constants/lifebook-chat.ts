/**
 * Ajustes del chat (Partes 17–18) — constantes compartidas por la hoja «⋯»
 * del hilo y por la propia pantalla del chat.
 *
 *  · CHAT_SEARCH_TABS  → apartados del historial (fotos, documentos, enlaces,
 *    transacciones, ubicación, notas, productos y tiendas, emoticonos).
 *  · CHAT_BACKGROUNDS  → fondos que acepta el servidor (<= 40 caracteres).
 */
import type { LbChatSearchKind } from '../api/messages';

export interface ChatSearchTab {
  kind: LbChatSearchKind;
  label: string;
  icon: string;
  /** Texto de la fila cuando no hay nada de ese tipo. */
  empty: string;
  /** `true` cuando el servidor todavía no puede enviar ese tipo (Fases G2–G4). */
  soon?: boolean;
}

export const CHAT_SEARCH_TABS: ChatSearchTab[] = [
  { kind: 'image', label: 'Fotos y vídeos', icon: '📷', empty: 'Aún no habéis compartido fotos ni vídeos.' },
  { kind: 'file', label: 'Documentos', icon: '📄', empty: 'Sin documentos en este chat.' },
  { kind: 'link', label: 'Enlaces y audio', icon: '🎵', empty: 'Sin enlaces ni audios compartidos.' },
  { kind: 'system', label: 'Transacciones', icon: '💳', empty: 'Sin avisos de pedidos o pagos.' },
  /* MERCADO (tanda E): los pedidos de este chat, con su tarjeta y su estado. */
  { kind: 'order', label: 'Pedidos', icon: '🧾', empty: 'Sin pedidos en este chat.' },
  { kind: 'location', label: 'Ubicación', icon: '📍', empty: 'Todavía no se pueden enviar ubicaciones (llegan con los grupos).', soon: true },
  { kind: 'post', label: 'Notas', icon: '📝', empty: 'Sin notas compartidas.' },
  { kind: 'sale', label: 'Productos y tiendas', icon: '🛍️', empty: 'Sin productos compartidos.' },
  { kind: 'emoji', label: 'Emoticonos', icon: '😀', empty: 'Sin emoticonos sueltos.' },
];

export interface ChatBackground {
  id: string;
  label: string;
  /** Color base del lienzo del chat. */
  base: string;
  /** Segundo tono (decorativo). */
  accent: string;
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  { id: 'default', label: 'Predeterminado', base: '', accent: '' },
  { id: 'sunset', label: 'Atardecer', base: '#FFF1E6', accent: '#FFB27A' },
  { id: 'oceano', label: 'Océano', base: '#E8F4FF', accent: '#7FC0F5' },
  { id: 'menta', label: 'Menta', base: '#E9FBF3', accent: '#7ED9B0' },
  { id: 'arena', label: 'Arena', base: '#FBF6EC', accent: '#E3C79A' },
  { id: 'lavanda', label: 'Lavanda', base: '#F3EEFF', accent: '#B9A6F2' },
  { id: 'bosque', label: 'Bosque', base: '#EDF7EA', accent: '#93C98A' },
  { id: 'noche', label: 'Noche', base: '#1E2230', accent: '#4A5470' },
];

export function chatBackgroundOf(id?: string | null): ChatBackground | null {
  if (!id) return null;
  const found = CHAT_BACKGROUNDS.find((b) => b.id === id);
  return found && found.id !== 'default' ? found : null;
}
