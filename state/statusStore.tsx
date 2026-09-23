/**
 * StatusStore — estado global del ESTADO 24H del usuario autenticado.
 * Expone: mi estado activo, catálogo de presets, capacidades (roles
 * verificados), prefs y acciones (refresh/publish/end/report/updatePrefs).
 * Incluye estados de UI: loading | error | ready + borrador local.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { statusApi, type StatusCapabilities, type StatusPrefs, type StatusPreset, type UserStatus } from '../api/status';
import { syncServerOffset } from '../hooks/useServerClock';
import { useSession } from './session';

export interface StatusDraft {
  presetCode: string;
  text: string;
  visibility: 'public' | 'followers' | 'private';
  /** Fotos del borrador (dataURLs). */
  mediaBase64s?: string[];
  mediaBase64?: string;
  locationText?: string;
  savedAt?: number;
}

interface StatusStoreValue {
  status: UserStatus | null;
  presets: StatusPreset[];
  capabilities: StatusCapabilities | null;
  prefs: StatusPrefs | null;
  loading: boolean;
  error: string | null;
  draft: StatusDraft | null;
  /** Recarga mi estado (fuerza red). */
  refresh: () => Promise<void>;
  /** Publica/sobrescribe. Devuelve el estado creado. */
  publish: (input: { presetCode: string; text?: string; media?: string | string[]; locationText?: string; visibility?: 'public' | 'followers' | 'private'; linkType?: string; linkId?: string }) => Promise<UserStatus>;
  /** Finaliza mi estado activo. */
  end: () => Promise<void>;
  /** Reporta un estado ajeno. */
  report: (statusId: string, reason: string, note?: string) => Promise<boolean>;
  updatePrefs: (p: Partial<StatusPrefs>) => Promise<void>;
  saveDraft: (d: StatusDraft) => Promise<void>;
  clearDraft: () => Promise<void>;
  /** Marca estado como expirado en cliente (la UI lo oculta). */
  localExpire: () => void;
}

const StatusCtx = createContext<StatusStoreValue>(null as unknown as StatusStoreValue);

const DRAFT_KEY = 'egrp.status.draft';

export function StatusProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession();
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [presets, setPresets] = useState<StatusPreset[]>([]);
  const [capabilities, setCapabilities] = useState<StatusCapabilities | null>(null);
  const [prefs, setPrefs] = useState<StatusPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StatusDraft | null>(null);
  const aliveRef = useRef(true);
  const inflightRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const loadDraft = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (raw) setDraft(JSON.parse(raw) as StatusDraft);
    } catch { /* sin borrador */ }
  }, []);

  useEffect(() => { if (isAuthenticated) loadDraft(); }, [isAuthenticated, loadDraft]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || inflightRef.current) return;
    inflightRef.current = true;
    setError(null);
    try {
      const [meRes, presetsRes, caps, prefsRes] = await Promise.allSettled([
        statusApi.my(),
        statusApi.presets().catch(() => []),
        statusApi.capabilities().catch(() => null),
        statusApi.prefs().catch(() => null),
      ]);
      if (!aliveRef.current) return;
      if (meRes.status === 'fulfilled') {
        syncServerOffset(null, null); // (serverTime se sincroniza en api.status)
        const s = meRes.value.status;
        // Si el estado expiró entre lecturas, el servidor ya responde null.
        setStatus(s && s.status === 'active' ? s : null);
      }
      if (presetsRes.status === 'fulfilled') setPresets(presetsRes.value as StatusPreset[]);
      if (caps.status === 'fulfilled') setCapabilities(caps.value as StatusCapabilities);
      if (prefsRes.status === 'fulfilled') setPrefs(prefsRes.value as StatusPrefs);
      setLoading(false);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e instanceof Error ? e.message : 'No se pudo cargar tu estado');
      setLoading(false);
    } finally {
      inflightRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) { setStatus(null); setLoading(false); return; }
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const publish = useCallback(async (input: {
    presetCode: string; text?: string; media?: string | string[]; locationText?: string;
    visibility?: 'public' | 'followers' | 'private'; linkType?: string; linkId?: string;
  }) => {
    const st = await statusApi.publish({ ...input, clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
    if (aliveRef.current) {
      setStatus(st);
      setError(null);
    }
    statusApi.clearMyCache();
    return st;
  }, []);

  const end = useCallback(async () => {
    await statusApi.end();
    statusApi.clearMyCache();
    if (aliveRef.current) setStatus(null);
  }, []);

  const report = useCallback(async (statusId: string, reason: string, note?: string) => {
    const r = await statusApi.report(statusId, reason, note);
    return r.ok !== false;
  }, []);

  const updatePrefs = useCallback(async (p: Partial<StatusPrefs>) => {
    const next = await statusApi.updatePrefs(p);
    if (aliveRef.current) setPrefs(next);
  }, []);

  const saveDraft = useCallback(async (d: StatusDraft) => {
    setDraft(d);
    try { await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* noop */ }
  }, []);

  const clearDraft = useCallback(async () => {
    setDraft(null);
    try { await AsyncStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  }, []);

  const localExpire = useCallback(() => {
    if (aliveRef.current) setStatus(null);
    statusApi.clearMyCache();
  }, []);

  return (
    <StatusCtx.Provider value={{
      status, presets, capabilities, prefs, loading, error, draft,
      refresh, publish, end, report, updatePrefs, saveDraft, clearDraft, localExpire,
    }}>
      {children}
    </StatusCtx.Provider>
  );
}

export function useStatusStore(): StatusStoreValue {
  const ctx = useContext(StatusCtx);
  if (!ctx) throw new Error('useStatusStore requiere <StatusProvider>');
  return ctx;
}
