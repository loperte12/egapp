/**
 * Raíz Expo Router — GestureHandlerRootView (requerido por bottom-sheet),
 * ThemeProvider (claro/oscuro) y Stack sin cabeceras nativas.
 *
 * ── EL DESTELLO BLANCO (arreglado el 2026-09-12, y por qué estaba) ─────────────
 * Medido con pantallazos al arrancar en modo oscuro: los dos primeros fotogramas salían con **luma
 * 246 de 255** (casi blanco) y el resto con 40 (la app oscura). Ese 246 es exactamente `el casi blanco`, que
 * era el `backgroundColor` de `app.json` y el `android:windowBackground` del tema nativo: Android pinta
 * la ventana con ese color **desde que arranca la actividad hasta que la app dibuja**. En luz no se
 * notaba (claro sobre claro); en oscuro era un fogonazo.
 * El arreglo tiene dos capas:
 *   1. **Nativa**: `android/app/src/main/res/values-night/colors.xml` (existía VACÍO) con el color del
 *      tema oscuro, para que la ventana nazca oscura cuando el móvil está en modo noche.
 *   2. **Del navegador** (aquí abajo): el `Stack` se envuelve en el tema de React Navigation y se le da
 *      `contentStyle` con el fondo del tema, para que las transiciones no pinten el fondo claro por
 *      defecto mientras la pantalla nueva dibuja lo suyo.
 */

import 'react-native-gesture-handler';
import React, { useEffect, useMemo } from 'react';
import { Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider, type Theme as NavTheme,
} from '@react-navigation/native';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
import { SessionProvider } from '../state/session';
import { StatusProvider } from '../state/statusStore';
import { CrashShield } from '../core/diagnostics';
import { runNetProbe } from '../api/netprobe';
import BotonCucucul from '../components/lifebook/BotonCucucul';

// Diagnóstico temporal de red (logcat). Eliminar junto a api/netprobe.ts.
if (typeof globalThis !== 'undefined') {
  runNetProbe();
}

// Arranque en Life Book (decisión del dueño): SOLO en el primer montaje de la
// sesión y con un pequeño retardo, porque navegar antes de que el Stack raíz
// esté montado revienta la app ("Attempted to navigate before mounting the
// Root Layout"). Al volver con la pestaña Inicio NO se redirige de nuevo.
let bootRedirected = false;

/**
 * ¿La app se ha abierto por un ENLACE (no por el icono)?
 *
 * 🔒 Defecto que esto arregla: abrir `egrouteplan://lifebook-hotel-reserva?id=…` con la app
 * CERRADA dejaba al usuario en el muro de Life Book. El enlace SÍ se resolvía, pero 400 ms
 * después esto hacía `router.replace('/lifebook')` y lo pisaba. Con la app ya abierta no
 * pasaba, porque la bandera `bootRedirected` ya valía `true` — por eso se coló: la prueba
 * normal (app abierta) salía bien.
 *
 * Consecuencia real: a un huésped que le llega por WhatsApp el enlace de su reserva, con la
 * app cerrada, le aparecía el muro y no su reserva.
 */
async function abrioPorEnlace(): Promise<boolean> {
  try {
    const url = await Linking.getInitialURL();
    if (!url) return false;
    // `egrouteplan://lifebook-hotel-reserva?id=…` → `lifebook-hotel-reserva`
    const camino = url.replace(/^[a-z0-9+.-]+:\/\//i, '').split('?')[0].replace(/\/+$/, '');
    return camino.length > 0 && camino !== 'index';
  } catch {
    return false;
  }
}

function BootRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (bootRedirected) return;
    bootRedirected = true;
    let vivo = true;
    const t = setTimeout(() => {
      void (async () => {
        if (!vivo) return;
        // Un enlace directo MANDA sobre el arranque por defecto: si alguien abrió la app
        // para ver su reserva, no se le lleva a otro sitio.
        if (await abrioPorEnlace()) return;
        if (!vivo) return;
        try { router.replace('/lifebook' as never); } catch { /* sin navegación */ }
      })();
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [router]);
  return null;
}

/**
 * La navegación, con el fondo del TEMA.
 *
 * React Navigation pinta su propio fondo durante las transiciones (y detrás de cada pantalla mientras
 * dibuja). Sin esto usaba el de su tema por defecto —claro—, así que en modo oscuro se colaba un
 * fogonazo en cada pantalla nueva. `contentStyle` y los colores del tema se sacan de nuestros tokens,
 * para que la ventana, el navegador y las pantallas sean el MISMO color.
 */
function NavegacionConTema() {
  const { colors, isDark } = useTheme();
  const navTheme: NavTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        // `card` es el fondo que pinta el navegador detrás de cada pantalla: tiene que ser el del tema.
        card: colors.background,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.secondary,
      },
    };
  }, [colors, isDark]);

  return (
    <NavThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="lifebook" options={{ animation: 'none' }} />
          <Stack.Screen name="lifebook-messages" options={{ animation: 'none' }} />
          <Stack.Screen name="taxi" options={{ animation: 'none' }} />
          <Stack.Screen name="profile" options={{ animation: 'none' }} />
        </Stack>
        {/*
          TANDA N — CUCUCUL EN TODA LA APP.

          Se pidió «en toda la app» y el dock es `FloatingFooter.tsx`, que no se toca (regla del
          proyecto). Así que el botón se pinta aquí, POR ENCIMA de las pantallas: aparece en
          cualquiera sin meter mano en la navegación. Él mismo decide dónde NO salir (su chat, la
          autenticación y el vídeo a pantalla completa).
        */}
        <BotonCucucul />
      </View>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <CrashShield>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <SessionProvider>
            <StatusProvider>
              <StatusBar style="auto" />
              <BootRedirect />
              <NavegacionConTema />
            </StatusProvider>
          </SessionProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </CrashShield>
  );
}
