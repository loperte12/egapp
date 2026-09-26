/**
 * PanelGate — LA PUERTA DEL ÁREA DE GESTIÓN: pide la cerradura del dispositivo.
 *
 * ── POR QUÉ EXISTE (y por qué NO basta con esconder el botón) ─────────────────
 *
 * El dueño preguntó si tener el panel de los negocios en el perfil es un riesgo de seguridad.
 * La respuesta honesta es que **la ubicación en la interfaz no es la frontera de seguridad**:
 * esconder la fila no protege nada, porque las rutas se alcanzan igual desde dentro de la app
 * (`/lifebook-merchant`, `/lifebook-hotel-panel`…). Lo que protege de verdad son tres cosas:
 *
 *  1. **El token.** Sin sesión, `AuthGate` manda al onboarding y el servidor responde 401.
 *  2. **La autorización en el servidor, por acción.** El negocio lo resuelve el SERVIDOR desde
 *     la sesión (`/my/*`), no desde un identificador de la URL: no hay id que adivinar. Y las
 *     rutas que sí llevan el id de la tienda están detrás de `ShopOwnerGuard`, que responde
 *     **404** a quien no es el dueño (probado en el E2E: «otro usuario pidiendo el panel con el
 *     shopId de A → 404 SHOP_NOT_FOUND»). Por eso el identificador de cuenta que la app pasa al
 *     hook de negocios **no autoriza nada**: solo sirve para saber cuándo volver a preguntar.
 *  3. **El dispositivo.** Y aquí está el hueco de verdad: el panel muestra **dinero, reservas y
 *     teléfonos de clientes**, y cualquier persona con el móvil desbloqueado entra sin más.
 *
 * La app ya traía la pieza para el punto 3 —`core/biometric.ts` y `unlockBiometric()` en la
 * sesión— y **no la usaba nadie**: estaba construida y sin conectar. Esto la conecta donde
 * importa (el área de gestión), en vez de pedir la huella al abrir la app entera, que molesta
 * al que solo viene a mirar el muro.
 *
 * ── Decisiones que no son obvias ─────────────────────────────────────────────
 *
 * · **Un desbloqueo por sesión con caducidad (5 min), no uno por pantalla.** Si pidiera la
 *   huella en cada navegación, el comerciante acabaría buscando cómo desactivarlo — y una
 *   cerradura que se desactiva no protege nada.
 * · **Sin cerradura configurada, NO se bloquea.** Si el móvil no tiene huella ni PIN, se deja
 *   pasar y se dice una vez. Bloquear a quien no puede desbloquear es dejarle fuera de su
 *   propio negocio.
 * · **La puerta no decide permisos.** No mira si eres el dueño: eso lo decide el servidor en
 *   cada petición. Esto solo evita que un tercero con el móvil en la mano vea el negocio.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { alpha, espaciado, PrimaryButton, tipografia, useTheme, peso, radios} from '@egrouteplan/ui-kit';
import { biometricAvailable, biometricVerify } from './biometric';
import { useSession } from '../state/session';

/** Hasta cuándo está abierta el área de gestión (una vez desbloqueada). */
let abiertoHasta = 0;
/** 5 minutos: suficiente para trabajar seguido, corto para un móvil prestado. */
const VALIDEZ_MS = 5 * 60 * 1000;

/** Vuelve a cerrar la puerta (para un cierre de sesión explícito). */
export function cerrarPanelGate(): void {
  abiertoHasta = 0;
}

type Estado = 'comprobando' | 'abierto' | 'cerrado' | 'sin-cerradura';

export function PanelGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { hydrated, isUnlocked } = useSession();
  const [estado, setEstado] = useState<Estado>('comprobando');
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!hydrated) return;
      // Sin sesión no hay nada que proteger aquí: `AuthGate` ya se encarga.
      if (!isUnlocked) { if (vivo) setEstado('abierto'); return; }
      if (Date.now() < abiertoHasta) { if (vivo) setEstado('abierto'); return; }

      const disp = await biometricAvailable();
      if (!vivo) return;
      if (!disp.available || !disp.enrolled) {
        // No hay cerradura en el móvil: no se puede pedir lo imposible.
        abiertoHasta = Date.now() + VALIDEZ_MS;
        setEstado('sin-cerradura');
        return;
      }
      setEstado('cerrado');
    })();
    return () => { vivo = false; };
  }, [hydrated, isUnlocked]);

  const desbloquear = useCallback(async () => {
    setFallo(null);
    const ok = await biometricVerify('Entrar en la gestión de tu negocio');
    if (ok) {
      abiertoHasta = Date.now() + VALIDEZ_MS;
      setEstado('abierto');
    } else {
      setFallo('No se pudo comprobar tu identidad. Inténtalo otra vez.');
    }
  }, []);

  if (estado === 'comprobando') {
    return (
      <View style={[styles.centro, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text.primary} />
      </View>
    );
  }

  if (estado === 'cerrado') {
    return (
      <View style={[styles.centro, { backgroundColor: colors.background }]}>
        <View style={[styles.candado, { backgroundColor: alpha(colors.primary, 0.1) }]}>
          <Lock size={26} color={colors.text.primary} />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, marginTop: espaciado.e14 }}>
          Gestión de tu negocio
        </Text>
        <Text style={{
          color: colors.textSecondary, fontSize: tipografia.body, lineHeight: 19,
          textAlign: 'center', marginTop: espaciado.e7, paddingHorizontal: 34,
        }}>
          Aquí están tu dinero, tus reservas y los datos de tus clientes. Confirma que eres tú
          para entrar.
        </Text>
        {fallo ? (
          <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e10 }}>
            {fallo}
          </Text>
        ) : null}
        <View style={{ marginTop: espaciado.e18, minWidth: 230 }}>
          <PrimaryButton title="Desbloquear" onPress={() => void desbloquear()} />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, textAlign: 'center', paddingHorizontal: 40 }}>
          Se pide una vez cada 5 minutos, no en cada pantalla.
        </Text>
      </View>
    );
  }

  return (
    <>
      {estado === 'sin-cerradura' ? (
        // Se dice UNA vez por sesión y no se repite: es un aviso, no un error.
        <View style={{
          backgroundColor: alpha(colors.secondary, 0.1),
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: alpha(colors.secondary, 0.3),
          paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7,
        }}>
          <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
            Este móvil no tiene huella ni PIN configurados: la gestión entra sin cerradura.
          </Text>
        </View>
      ) : null}
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
  candado: { width: 60, height: 60, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
});
