/**
 * BotonSeguirTienda — seguir / dejar de seguir una tienda del Mercado (店铺关注).
 *
 * ── POR QUÉ ES UN COMPONENTE ──────────────────────────────────────────────────────────────────
 * El mismo botón con la misma secuencia va a vivir en la página de la tienda, y la lógica de un
 * toggle tiene ramas que se olvidan con facilidad: sin sesión, cargando el estado inicial, optimista
 * con vuelta atrás si el servidor dice que no, y el caso raro de que la tienda haya dejado de
 * existir. Escrita dos veces, la segunda acabaría con una rama de menos. Es el mismo criterio que
 * ya se aplicó con `BotonPreguntarTienda`.
 *
 * ── EL ESTADO INICIAL SE PREGUNTA, NO SE SUPONE ───────────────────────────────────────────────
 * El componente no sabe si se sigue la tienda hasta que `followingStoreIds()` contesta, y mientras
 * tanto no pinta un «Seguir» que podría ser mentira en el primer fotograma. Por eso el estado es
 * `null` hasta la primera respuesta, y el botón enseña un indicador en vez de un texto que aún no
 * sabe lo que dice.
 *
 * ── OPTIMISTA, PERO CON VUELTA ATRÁS ──────────────────────────────────────────────────────────
 * El cambio se pinta al instante y el servidor se llama después; si contesta mal, el estado vuelve
 * a lo que era Y el motivo se enseña (no se tapa con un genérico). Es el patrón de
 * `BotonPreguntarTienda` y de los corazones de favoritos: el motivo del servidor —«Esa es tu propia
 * tienda.», «Esa tienda no está disponible ahora mismo.»— ya está escrito para que lo lea quien toca
 * el botón, y cambiarlo por «no se pudo» convertiría un caso claro en un misterio.
 *
 * ── SIN SESIÓN SE EXPLICA, NO SE ROMPE ────────────────────────────────────────────────────────
 * Igual que al escribir a la tienda: sin cuenta no hay seguimiento, y el botón lo dice y ofrece
 * entrar, en vez de fallar en silencio o dejar un toggle que no hace nada.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Store } from 'lucide-react-native';
import { alpha, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ecomerseApi } from '../../api/ecomerse';
import { ApiError } from '../../api/httpClient';
import { useSession } from '../../state/session';

export interface BotonSeguirTiendaProps {
  /** La TIENDA que se sigue. El servidor es quien decide si existe y si se puede seguir. */
  sellerId: string | null | undefined;
  /** Nombre de la tienda, para los textos de accesibilidad y los avisos. */
  nombre?: string | null;
  /** Separación con lo de arriba, si el contenedor del llamante no la da (un `gap`, por ejemplo). */
  style?: StyleProp<ViewStyle>;
}

export function BotonSeguirTienda({ sellerId, nombre, style }: BotonSeguirTiendaProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isAuthenticated } = useSession();
  /** `null` = aún no se sabe; `true/false` = lo que dice el servidor. */
  const [siguiendo, setSiguiendo] = useState<boolean | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const s = styles(colors);

  /**
   * El estado inicial, SOLO con sesión. Sin sesión no hay seguimiento que preguntar: se queda en
   * `null` y el botón, al tocarse, explica que hace falta cuenta. El efecto depende de `sellerId`
   * porque la pantalla puede cambiar de tienda sin desmontar el botón.
   */
  useEffect(() => {
    let vivo = true;
    setSiguiendo(null);
    if (!isAuthenticated || !sellerId) return undefined;
    ecomerseApi.followingStoreIds()
      .then((ids) => { if (vivo) setSiguiendo(ids.includes(sellerId)); })
      .catch(() => { if (vivo) setSiguiendo(false); });
    return () => { vivo = false; };
  }, [isAuthenticated, sellerId]);

  const alternar = useCallback(() => {
    if (!sellerId) return;
    if (!isAuthenticated) {
      Alert.alert(
        'Entra en tu cuenta',
        'Para seguir tiendas hace falta sesión: la lista de «tiendas que sigo» va con tu cuenta.',
        [{ text: 'Ahora no', style: 'cancel' }, { text: 'Iniciar sesión', onPress: () => router.push('/auth' as never) }],
      );
      return;
    }
    if (siguiendo === null || trabajando) return;
    void (async () => {
      const antes = siguiendo;
      setSiguiendo(!antes);
      setTrabajando(true);
      try {
        const r = await ecomerseApi.followStore(sellerId);
        /* El servidor manda el estado REAL resultante; se pinta ese, no el optimista, por si
           alguien más tocó el botón desde otra parte. */
        setSiguiendo(r.following);
      } catch (e) {
        setSiguiendo(antes);
        const motivo = e instanceof ApiError && e.message
          ? e.message
          : 'No se pudo actualizar. Revisa tu conexión e inténtalo otra vez.';
        Alert.alert('Tiendas que sigo', motivo);
      } finally {
        setTrabajando(false);
      }
    })();
  }, [sellerId, siguiendo, trabajando, isAuthenticated, router]);

  /* Sin tienda no hay a quién seguir: no se pinta un botón que no puede llevar a ninguna parte. */
  if (!sellerId) return null;

  return (
    <Pressable
      onPress={alternar}
      disabled={trabajando}
      accessibilityRole="button"
      accessibilityLabel={
        siguiendo
          ? `Dejar de seguir la tienda ${nombre ?? ''}`.trim()
          : `Seguir la tienda ${nombre ?? ''}`.trim()
      }
      accessibilityHint="Añade o quita la tienda de tu lista de tiendas que sigues"
      accessibilityState={{ busy: trabajando, selected: siguiendo === true }}
      style={({ pressed }) => [s.caja, style, { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[s.icono, { backgroundColor: alpha(colors.primary, siguiendo ? 0.18 : 0.12) }]}>
        <Store size={icono.sm} color={colors.text.primary} />
      </View>
      <View style={s.textos}>
        {siguiendo === null ? (
          <Text style={[s.titulo, { color: colors.textSecondary }]}>Comprobando…</Text>
        ) : (
          <>
            <Text style={[s.titulo, { color: siguiendo ? colors.text.primary : colors.textPrimary }]}>
              {siguiendo ? 'Siguiendo' : 'Seguir la tienda'}
            </Text>
            <Text style={[s.nota, { color: colors.textSecondary }]}>
              {siguiendo ? 'Toca para dejar de seguirla' : 'Aparece en tu lista de tiendas que sigues'}
            </Text>
          </>
        )}
      </View>
      {trabajando ? (
        <ActivityIndicator size="small" color={colors.text.primary} />
      ) : siguiendo === null ? null : siguiendo ? (
        <Check size={icono.sm} color={colors.text.primary} />
      ) : (
        <ChevronRight size={icono.sm} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  /* Sin `marginTop`: la separación con lo de arriba la pone quien lo coloca, igual que
     `BotonPreguntarTienda` —un `gap` del contenedor o un `style` del llamante. */
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    borderColor: c.border,
    padding: espaciado.e12,
  },
  icono: {
    width: 36,
    height: 36,
    borderRadius: radios.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1 },
  titulo: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  nota: { fontSize: tipografia.micro, marginTop: espaciado.e4 },
});
