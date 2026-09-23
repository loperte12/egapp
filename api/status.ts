/**
 * Cliente API del ESTADO 24H (v3 rediseñado).
 * Rutas: /mobility/status/... sobre el base de httpClient (/wallet/api/v1).
 * Caché en memoria ligera para render instantáneo + reintento único en GET.
 */

import { http, httpRequest } from './httpClient';
import { syncServerOffset } from '../hooks/useServerClock';

export interface StatusPreset {
  code: string;
  emoji: string;
  bg: string;
  label: string;
  roles: string[];
}

export interface UserStatusLink {
  type: 'taxi' | 'intercity' | 'food' | 'ecomerse' | 'work' | 'rental' | 'lifebook';
  id: string | null;
}

export interface StatusMediaItem {
  id: string;
  url: string;
}

export interface UserStatus {
  id: string;
  preset: { code: string; emoji: string; bg: string; label: string };
  text: string;
  /** Primera foto (portada). */
  media: StatusMediaItem | null;
  /** Galería completa (todas las fotos del estado). */
  gallery: StatusMediaItem[];
  locationText: string | null;
  visibility: 'public' | 'followers' | 'private';
  link: UserStatusLink | null;
  startedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number | null;
  status: string;
}

export interface StatusCapabilities {
  role: 'PASSENGER' | 'DRIVER' | 'ADMIN';
  verified: string[];
  city: string;
}

export interface StatusPrefs {
  defaultVisibility: 'public' | 'followers' | 'private';
  allowReactions: boolean;
  showInSearch: boolean;
  showInStore: boolean;
  notifications: boolean;
  publishBannedUntil?: string | null;
}

export type StatusVisibility = 'public' | 'followers' | 'private';

/** Caché en memoria: último estado propio (render instantáneo). */
const memCache: Record<string, { at: number; status: UserStatus | null }> = {};

export const statusApi = {
  /** Catálogo de presets (público). */
  presets: () => http.get<StatusPreset[]>('/mobility/status/presets', false),

  /** Capacidades del usuario (qué roles verificados tiene para filtrar). */
  capabilities: () => http.get<StatusCapabilities>('/mobility/status/capabilities'),

  /** Mi estado activo (caché en memoria 25 s + reintento único). */
  async my(): Promise<{ status: UserStatus | null }> {
    const cached = memCache['me'];
    if (cached && Date.now() - cached.at < 25_000) return { status: cached.status };
    try {
      const res = await httpRequest<{ status: UserStatus | null; serverTime?: string }>('/mobility/status/me', { method: 'GET' });
      if (res && typeof res === 'object' && 'status' in res) {
        if (res.serverTime) syncServerOffset(null, res.serverTime);
        memCache['me'] = { at: Date.now(), status: res.status };
        return { status: res.status };
      }
      return { status: null };
    } catch (e) {
      // Con caché previa: devolvemos lo guardado (la UI avisa "datos guardados").
      if (cached) return { status: cached.status };
      throw e;
    }
  },

  /** Publica o sobrescribe (con idempotencia por cabecera). */
  publish: (payload: {
    presetCode: string;
    text?: string;
    /** Una dataURL o varias (galería). */
    media?: string | string[];
    locationText?: string;
    visibility?: StatusVisibility;
    linkType?: string;
    linkId?: string;
    clientId: string;
  }) => {
    const { clientId, ...body } = payload;
    return httpRequest<UserStatus>('/mobility/status/me', {
      method: 'POST',
      body,
      headers: { 'X-Client-Request-Id': clientId },
    });
  },

  /** Finaliza mi estado activo. */
  end: () => http.post<{ ended: boolean; id?: string; status?: string }>('/mobility/status/me/end', {}),

  /** Estado visible de otro usuario. */
  userStatus: (userId: string) => http.get<{ status: UserStatus | null }>(`/mobility/status/users/${userId}`),

  /** Preferencias de estado. */
  prefs: () => http.get<StatusPrefs>('/mobility/status/prefs'),
  updatePrefs: (p: Partial<StatusPrefs>) => http.patch<StatusPrefs>('/mobility/status/prefs', p),

  /** Reporta un estado ajeno. */
  report: (statusId: string, reason: string, note?: string) =>
    http.post<{ ok: boolean; quarantined?: boolean }>(`/mobility/status/${statusId}/report`, { reason, note }),

  /** Limpia la caché local (tras publicar/finalizar/expirar). */
  clearMyCache() {
    delete memCache['me'];
  },
};
