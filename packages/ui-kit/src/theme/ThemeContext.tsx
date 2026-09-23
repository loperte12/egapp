/**
 * ThemeContext (ui-kit) — modo claro/oscuro con override manual.
 * Consumo: const { colors, isDark } = useTheme();
 */

import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors, type ThemeColors } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeValue {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue>(null as unknown as ThemeValue);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  const value = useMemo<ThemeValue>(() => {
    const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
    return { colors: isDark ? darkColors : lightColors, isDark, mode, setMode };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
