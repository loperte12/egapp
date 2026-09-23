/**
 * SessionProvider — Autenticación Progresiva (Lazy Authentication) para RN.
 *
 * Modelo de estados (fricción cero en lectura, fricción solo en dinero/Perfil):
 *   · hydrated       → se leyó SecureStore al arrancar.
 *   · isAuthenticated → hay un refresh_token persistido (sesión recordada).
 *   · isUnlocked      → el access_token está disponible en memoria para esta
 *                       sesión en primer plano. Se obtiene tras desbloqueo
 *                       biométrico (o PIN/OTP de fallback). Las pantallas
 *                       protegidas (Monedero/Perfil) muestran un "Glass Pane"
 *                       (BlurView) mientras isUnlocked === false.
 *
 * Tokens:
 *   · refresh_token → SecureStore (Keychain/Keystore). Persistente.
 *   · access_token  → memoria únicamente tras desbloqueo; no se reinyecta en
 *                     cold-start para exigir la biometría del Glass Pane.
 *
 * Lazy Auth: el login NO se elimina. Se presenta como modal contextual cuando
 * un flujo protegido lo requiere, sin romper la navegación del mapa.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../api/config';
import { biometricAvailable, biometricVerify } from '../core/biometric';

const ACCESS_KEY = 'egrp.access_token';
const REFRESH_KEY = 'egrp.refresh_token';
const PHONE_KEY = 'egrp.phone';

type Role = 'PASSENGER' | 'DRIVER' | 'ADMIN';

function decodeClaim(token: string | null, claim: string): any {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload[claim];
  } catch {
    return null;
  }
}

interface SessionValue {
  hydrated: boolean;
  isAuthenticated: boolean; // hay sesión recordada (refresh_token)
  isUnlocked: boolean;       // access_token disponible esta sesión
  token: string | null;      // access_token en memoria (null si locked)
  role: Role;
  phone: string | null;
  /** Desbloqueo biométrico para usuarios con sesión recordada. */
  unlockBiometric: () => Promise<boolean>;
  /** Establece tokens tras login/OTP/registro (cierra el modal de auth). */
  login: (accessToken: string, refreshToken: string, phone?: string) => Promise<void>;
  /** Logout total: SecureStore + memoria + marca WebView para limpieza. */
  logout: () => Promise<void>;
  /** Se incrementa para forzar limpieza/recarga del WebView al hacer logout. */
  webviewLogoutNonce: number;
}

const SessionCtx = createContext<SessionValue>(null as unknown as SessionValue);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [webviewLogoutNonce, setWebviewLogoutNonce] = useState(0);

  // Refs para que el holder del httpClient vea siempre el valor más reciente.
  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  accessRef.current = accessToken;
  refreshRef.current = refreshToken;

  useEffect(() => {
    (async () => {
      const [rt, ph] = await Promise.all([
        SecureStore.getItemAsync(REFRESH_KEY).catch(() => null),
        SecureStore.getItemAsync(PHONE_KEY).catch(() => null),
      ]);

      // Conecta el interceptor HTTP con este provider.
      const { configureHttpAuth } = await import('../api/httpClient');
      configureHttpAuth({
        getAccessToken: () => accessRef.current,
        getRefreshToken: () => refreshRef.current,
        setTokens: async (a, r) => {
          await SecureStore.setItemAsync(ACCESS_KEY, a).catch(() => {});
          await SecureStore.setItemAsync(REFRESH_KEY, r).catch(() => {});
          setAccessToken(a);
          setRefreshToken(r);
        },
        onAuthLost: async () => {
          await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
          await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
          setAccessToken(null);
          setRefreshToken(null);
          setWebviewLogoutNonce((n) => n + 1);
        },
      });

      // Sesión recordada → refresco silencioso (sin PIN ni biometría).
      // Restaura el access token ANTES de hidratar para que AuthGate
      // (Perfil/Monedero) desbloquee solo al reiniciar la app.
      let restoredAccess: string | null = null;
      if (rt) {
        const savedAccess = await SecureStore.getItemAsync(ACCESS_KEY).catch(() => null);
        restoredAccess = savedAccess ?? (await refreshInternal(rt));
      }

      // Fija TODO el estado y recién entonces marca hydrated (sin carreras).
      if (rt) setRefreshToken(rt);
      if (ph) setPhone(ph);
      if (restoredAccess) setAccessToken(restoredAccess);
      setHydrated(true);
    })();
  }, []);

  /** Canje silencioso refresh→access (interno, reutilizable en hidratación y unlock). */
  const refreshInternal = async (rt: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/mobility/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const a: string | undefined = data.accessToken;
      const r: string | undefined = data.refreshToken;
      if (!a || !r) return null;
      await SecureStore.setItemAsync(ACCESS_KEY, a).catch(() => {});
      await SecureStore.setItemAsync(REFRESH_KEY, r).catch(() => {});
      return a;
    } catch {
      return null;
    }
  };

  /** Canje silencioso refresh→access. Devuelve el nuevo access token o null. */
  const refresh = async (): Promise<string | null> => {
    const rt = refreshRef.current;
    if (!rt) return null;
    const a = await refreshInternal(rt);
    if (a) {
      setAccessToken(a);
      setRefreshToken(rt);
    }
    return a;
  };

  const unlockBiometric = async (): Promise<boolean> => {
    // SIN PIN ni biometría: la sesión recordada se desbloquea sola (refresh).
    if (!refreshRef.current) return false;
    const a = await refresh();
    return !!a;
  };

  const login = async (a: string, r: string, ph?: string) => {
    await SecureStore.setItemAsync(ACCESS_KEY, a).catch(() => {});
    await SecureStore.setItemAsync(REFRESH_KEY, r).catch(() => {});
    if (ph) {
      await SecureStore.setItemAsync(PHONE_KEY, ph).catch(() => {});
      setPhone(ph);
    }
    setAccessToken(a);
    setRefreshToken(r);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
    // Conservamos el teléfono para un re-login cómodo (no es secreto).
    setAccessToken(null);
    setRefreshToken(null);
    setWebviewLogoutNonce((n) => n + 1); // avisa al WebView para limpiar localStorage
  };

  const value = useMemo<SessionValue>(
    () => ({
      hydrated,
      isAuthenticated: !!refreshToken,
      isUnlocked: !!accessToken,
      token: accessToken,
      role: (decodeClaim(refreshToken, 'role') as Role) ?? 'PASSENGER',
      phone,
      unlockBiometric,
      login,
      logout,
      webviewLogoutNonce,
    }),
    [hydrated, refreshToken, accessToken, phone, webviewLogoutNonce],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
