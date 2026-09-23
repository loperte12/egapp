/**
 * Cliente de autenticación unificada (mobility.users maestra).
 * Flujo SIN PIN: registro (teléfono) → OTP → verify → set-password → login
 * con contraseña. Usa httpClient (sesión inyectada + refresco 401 silencioso).
 */

import { http, ApiError } from './httpClient';

export { ApiError };

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  sent: boolean;
  expiresIn: number;
  devCode?: string; // solo entorno no-producción
}

export interface ProfileLink {
  /**
   * `group` NO es una dirección: `value` es el CÓDIGO del grupo (6 caracteres). Se elige
   * de mis grupos con el selector, no se escribe a mano. El código caduca a los 7 días,
   * y el perfil público lo comprueba antes de pintar la tarjeta.
   */
  kind: 'link' | 'email' | 'phone' | 'social' | 'group';
  label: string;
  value: string;
  /**
   * Enlace FIJADO: se enseña arriba y con 📌 en el perfil público. Máximo 3 (lo aplica
   * el servidor: si llegan más, mantiene los tres primeros y desfija el resto).
   */
  pinned?: boolean;
}

export interface MeProfile {
  id: string;
  phone: string;
  fullName: string;
  role: 'PASSENGER' | 'DRIVER' | 'ADMIN';
  status: string;
  ratingAvg: number;
  /** P7 perfil vivo: viajes completados (taxi) y foto de avatar. */
  completedTrips: number;
  avatarUrl?: string | null;
  /** P8: portada + datos personales/profesionales + widgets + enlaces. */
  coverUrl?: string | null;
  bio?: string;
  gender?: string;
  birthDate?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  profession?: string;
  school?: string;
  originalCreator?: string;
  /** Color del nombre elegido por el usuario (portadas/tarjetas). */
  nameColor?: string;
  widgets?: Record<string, unknown>;
  links?: ProfileLink[];
  memberSince?: string;
  kycLevel: number;
}

/** Preferencias por defecto de widgets (qué ven los visitantes). */
export const DEFAULT_WIDGETS = {
  lifebookPublic: true,
  showStats: true,
  showStore: false,
  showContact: true,
  showQR: true,
} as const;

/** Payload completo del editor de perfil (P8). */
export interface UpdateProfilePayload {
  fullName?: string;
  avatar?: string;      // dataURL nueva (solo si cambió)
  cover?: string;       // dataURL nueva portada (solo si cambió)
  bio?: string;
  gender?: string;
  birthDate?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  profession?: string;
  school?: string;
  originalCreator?: string;
  nameColor?: string;
  widgets?: Record<string, unknown>;
  links?: ProfileLink[];
}

export const authApi = {
  /** Crea la cuenta (teléfono) y envía el OTP. Si ya existe → PHONE_TAKEN (usa resendOtp). */
  register: (phone: string, fullName?: string) =>
    http.post<RegisterResult>('/mobility/auth/register', { phone, fullName }, false),

  resendOtp: (phone: string) =>
    http.post<RegisterResult>('/mobility/auth/resend-otp', { phone }, false),

  /** Verifica el OTP → emite la sesión (access + refresh). */
  verifyPhone: (phone: string, otp: string) =>
    http.post<AuthTokens>('/mobility/auth/verify-phone', { phone, otp }, false),

  /** Fija la contraseña de la cuenta (requiere la sesión recién emitida). */
  setPassword: (password: string) =>
    http.post<{ ok: true }>('/mobility/auth/set-password', { password }, true),

  /** Entra con teléfono + contraseña. */
  login: (phone: string, password: string) =>
    http.post<AuthTokens>('/mobility/auth/login', { phone, password }, false),

  me: () => http.get<MeProfile>('/mobility/auth/me', true),

  /** Actualiza el perfil (P7/P8: nombre, avatar, portada, bio, género, fecha,
   *  país/ciudad, profesión, escuela, original, widgets y enlaces). */
  updateMe: (data: UpdateProfilePayload) =>
    http.patch<MeProfile>('/mobility/auth/me', data, true),
};
