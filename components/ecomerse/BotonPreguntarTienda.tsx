/**
 * BotonPreguntarTienda — la puerta al chat con una tienda desde fuera de Mensajes.
 *
 * ── POR QUÉ ES UN COMPONENTE Y NO DOS BOTONES ─────────────────────────────────────────────────
 * Los dos sitios que la necesitan —la ficha de un anuncio y la página de la tienda— comparten algo
 * más que el dibujo: la SECUENCIA. Abrir el hilo contra `POST /ecomerse/chats/open`, y sólo cuando
 * el servidor contesta, navegar al chat llevando el `conversationId` y los datos de la tienda. Esa
 * secuencia tiene cuatro ramas que se olvidan con facilidad —sin sesión, abriendo, error de red y
 * el caso raro de una tienda que ya no existe—, y escrita dos veces la segunda acabaría con una
 * rama de menos. Es el mismo criterio que ya se aplicó con `CabeceraTienda` y con el precio.
 *
 * ── NO SE NAVEGA «A CIEGAS»: SE ESPERA AL SERVIDOR, Y ESO TIENE UNA VENTAJA ────────────────────
 * La alternativa —entrar al chat con los datos que ya tiene la pantalla y abrir el hilo luego—
 * dejaría al comprador dentro de una conversación sin `conversationId`, que no puede pedir
 * mensajes ni enviarlos: una pantalla muerta por un instante. Esperando, el chat abre con hilo de
 * verdad. Y trae un regalo: el `seller` que devuelve el servidor trae `photoUrl` **ya resuelta**
 * (la clave del almacenamiento convertida en URL), cosa que la ficha no tiene —allí el vendedor
 * llega con `photoKey`—. Por eso la cabecera del chat puede enseñar el LOGO de la tienda abierta
 * desde la ficha, que hasta ahora habría caído a la inicial.
 *
 * ── `productId` ES OPCIONAL, Y SU EFECTO LO DECIDE EL SERVIDOR ────────────────────────────────
 * Con `productId`, el primer mensaje cita el anuncio («me interesa esto») y **sólo** si el hilo
 * estaba vacío y el anuncio es de esa tienda. La pantalla no deduce nada ni compone el texto: las
 * dos condiciones son del servidor, y si se cumplen mandan un mensaje de verdad, firmado por el
 * comprador, que la tienda ve como cualquier otro. Inventarlo aquí sería escribir en nombre de
 * alguien desde el cliente.
 *
 * ── NO REGISTRA `contactIntent`, Y ES DELIBERADO ──────────────────────────────────────────────
 * La ficha registra un lead cuando se llama o se abre WhatsApp porque esas conversaciones ocurren
 * FUERA de la app y no dejan rastro. Un mensaje por el chat no: queda escrito en
 * `lifebook.messages` con su autor y su fecha, que es prueba más fuerte que una fila de lead. Meter
 * además un lead sería contar dos veces el mismo interés —y `contact/intent` sólo conoce los canales
 * `whatsapp` y `call`, así que habría que tocar la restricción de una tabla ya cerrada para anotar
 * algo que la tabla del chat ya dice—.
 *
 * ── EL ESCAPE A WHATSAPP NO DESAPARECE ───────────────────────────────────────────────────────
 * La decisión 5.b del plan es que el chat es la puerta PRINCIPAL y WhatsApp el ESCAPE visible. Esto
 * es la puerta; el escape vive donde se está mirando, que es la cabecera del propio chat, y sigue
 * donde ya estaba en la barra de la ficha. Un escape que no está donde estás no sirve.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, MessageCircle } from 'lucide-react-native';
import { alpha, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ecomerseApi } from '../../api/ecomerse';
import { ApiError } from '../../api/httpClient';
import { useSession } from '../../state/session';

export interface BotonPreguntarTiendaProps {
  /** La TIENDA, no su dueño. El servidor resuelve el interlocutor: el botón no puede escribirle a
   *  quien no es. */
  sellerId: string | null | undefined;
  /** El anuncio del que viene el interés, si se sabe. Sin él, el primer mensaje no cita nada. */
  productId?: string | null;
  /** Nombre de reserva para la cabecera del chat mientras el servidor contesta. */
  nombre?: string | null;
  /** Teléfono de reserva para el escape a WhatsApp. El del servidor manda si viene. */
  telefono?: string | null;
  /** Separación con lo de arriba, si el contenedor del llamante no la da (un `gap`, por ejemplo). */
  style?: StyleProp<ViewStyle>;
}

export function BotonPreguntarTienda({ sellerId, productId, nombre, telefono, style }: BotonPreguntarTiendaProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const [abriendo, setAbriendo] = useState(false);
  const s = styles(colors);

  const abrir = useCallback(() => {
    if (!sellerId) return;
    if (!isAuthenticated) {
      Alert.alert(
        'Entra en tu cuenta',
        'Para escribir a la tienda hace falta sesión: la conversación es tuya y tiene que ir con tu nombre.',
        [{ text: 'Ahora no', style: 'cancel' }, { text: 'Iniciar sesión', onPress: () => router.push('/auth' as never) }],
      );
      return;
    }
    void (async () => {
      setAbriendo(true);
      try {
        const abierto = await ecomerseApi.openChat(sellerId, productId ?? null);
        /* `push` y no `replace`: el comprador entra al chat DESDE la ficha y la flecha tiene que
           devolverlo a la ficha, no dejarlo en Mensajes. La ruta es la misma que usa la lista de
           Mensajes (`irAlChatDeTienda`), y a propósito: un solo destino significa que un arreglo en
           la pantalla del chat vale para las dos entradas. */
        router.push({
          pathname: '/ecomerse-mensajes-chat',
          params: {
            conv: abierto.conversationId,
            tienda: abierto.seller.businessName ?? nombre ?? '',
            foto: abierto.seller.photoUrl ?? '',
            telefono: abierto.seller.phoneContact ?? telefono ?? '',
            /* Los parámetros de navegación son texto: un `false` se perdería. */
            ...(abierto.seller.verified ? { verificado: '1' } : {}),
          },
        } as never);
      } catch (e) {
        /* EL MOTIVO DEL SERVIDOR SE ENSEÑA, no se tapa con un genérico. Los tres rechazos posibles ya
           están escritos para que los lea el comprador —«Esa es tu propia tienda.», «No puedes
           escribir a esta tienda.»— y cambiarlos por «no se pudo abrir» convertiría un caso claro en
           un misterio. Es el patrón que ya usan `auth.tsx` y la zona de KYC. */
        const motivo = e instanceof ApiError && e.message
          ? e.message
          : 'No se pudo abrir la conversación. Revisa tu conexión e inténtalo otra vez.';
        Alert.alert('Chat', motivo);
      } finally {
        setAbriendo(false);
      }
    })();
  }, [sellerId, productId, nombre, telefono, isAuthenticated, router]);

  /* Sin tienda no hay a quién escribir: no se pinta un botón que no puede llevar a ninguna parte. */
  if (!sellerId) return null;

  return (
    <Pressable
      onPress={abrir}
      disabled={abriendo}
      accessibilityRole="button"
      accessibilityLabel={
        nombre ? `Preguntar a la tienda ${nombre}` : 'Preguntar a la tienda'
      }
      accessibilityHint="Abre una conversación con la tienda dentro de la app"
      accessibilityState={{ busy: abriendo }}
      style={({ pressed }) => [s.caja, style, { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[s.icono, { backgroundColor: alpha(colors.primary, 0.12) }]}>
        <MessageCircle size={icono.sm} color={colors.primary} />
      </View>
      <View style={s.textos}>
        <Text style={[s.titulo, { color: colors.textPrimary }]}>
          {abriendo ? 'Abriendo la conversación…' : 'Preguntar a la tienda'}
        </Text>
        <Text style={[s.nota, { color: colors.textSecondary }]}>
          Te contesta aquí, en Mensajes
        </Text>
      </View>
      {abriendo ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <ChevronRight size={icono.sm} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  /* Sin `marginTop`: la separación con lo de arriba la pone quien lo coloca. La ficha y la página de
     tienda agrupan a distinto —una con márgenes, otra con `gap`—, y un margen propio aquí se sumaría
     al `gap` de una de las dos y no a la otra. El componente no sabe quién tiene al lado. */
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
