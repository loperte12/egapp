/**
 * La conversación del comprador con una tienda — `/ecomerse-mensajes-chat?conv=<conversationId>`.
 *
 * ── POR QUÉ LA RUTA CUELGA DE `/ecomerse-mensajes` Y NO ES `/ecomerse-chat` ─────────────────────
 * El pie decide qué pestaña está encendida comparando el **prefijo** del pathname
 * (`PieDelMercado.tsx:89`). Una ruta hermana como `/ecomerse-chat` no empieza por `/ecomerse-mensajes`,
 * así que —el día que esta pantalla pinte el pie— la pestaña «Mensajes» se apagaría estando dentro de
 * Mensajes. Colgando la ruta DEBAJO del prefijo, la regla que ya está escrita sigue valiendo sin
 * tocar el pie. Es exactamente la trampa que documenta `ecomerse-mensajes-avisos.tsx:6` con
 * `/ecomerse-avisos`, resuelta por el nombre y no con una excepción.
 *
 * ── ESTA PANTALLA NO PINTA EL PIE, Y A PROPÓSITO ───────────────────────────────────────────────
 * Abajo vive la barra de escribir. El pie del Mercado son 62 dp de cromo fijo, y con la barra de
 * escribir encima se comen media pantalla del hilo justo cuando hay teclado. El camino de vuelta ya
 * existe y es el de siempre: la flecha. (Las otras cuatro pantallas del Mercado sí lo pintan.)
 *
 * ── EL MOTOR DE CHAT NO SE DUPLICA ─────────────────────────────────────────────────────────────
 * Los mensajes, el envío y el «leído» van por `/lifebook/chat/conversations/…`, que es el MISMO hilo
 * que el vendedor tiene en su chat de siempre: la decisión cerrada de la fase (5.c) es que la
 * conversación es una y tiene dos caras —aquí el interlocutor se llama por su tienda, allí por su
 * nombre—. Lo único propio del Mercado es el rótulo, y eso lo da `POST /ecomerse/chats/open`.
 *
 * ── LOS MENSAJES SE PINTAN POR SU TEXTO, SEA CUAL SEA SU TIPO ──────────────────────────────────
 * El motor admite tipos ricos (foto, tarjeta de producto, pedido, votación…). Aquí se pinta el
 * `body`, que el servidor **siempre** rellena con algo legible («📷 Foto», «🛍 <título>») incluso en
 * los tipos ricos. Se elige eso y no una tarjeta a medias porque una tarjeta mal resuelta es peor que
 * una línea de texto correcta: el chat del Mercado enseña **lo que se dijo**, y el adorno de cada
 * tipo llegará con su pantalla.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react-native';
import {
  EmptyState, InlineError, alpha, brand, espaciado, icono, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { lifebookChatApi, type LbMessage } from '../api/lifebook';
import { getTimeAgo } from '../utils/formatHelpers';
import { useSession } from '../state/session';
import { whatsappATienda } from '../utils/whatsapp';

/** Los datos de la tienda que llegan por la URL, para poder pintar la cabecera sin esperar a la red.
 *  Son de conveniencia: si faltan, la cabecera dice «Tienda» y el hilo se carga igual. */
function useParametro(nombre: string): string | null {
  const raw = useLocalSearchParams<Record<string, string | string[]>>();
  const v = raw[nombre];
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export default function EcomerseMensajesChatScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const listaRef = useRef<FlatList<LbMessage>>(null);

  const conv = useParametro('conv');
  const tienda = useParametro('tienda');
  const foto = useParametro('foto');
  const telefono = useParametro('telefono');
  const verificado = useParametro('verificado') === '1';

  const [mensajes, setMensajes] = useState<LbMessage[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fotoRota, setFotoRota] = useState(false);

  const cargar = useCallback(async () => {
    if (!conv || !isAuthenticated) { setCargando(false); return; }
    setCargando(true);
    setError(null);
    try {
      const pagina = await lifebookChatApi.messages(conv, { limit: 50 });
      setMensajes(pagina.messages);
      /* Marcar leído al abrir es lo que hace que el contador del pie y el de la lista bajen al
         entrar. No bloquea el pintado ni se espera su resultado: si falla, el hilo se lee igual y el
         contador se corrige solo en la siguiente vuelta a la lista. */
      void lifebookChatApi.markRead(conv).catch(() => undefined);
    } catch {
      setError('No se pudo cargar la conversación. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }, [conv, isAuthenticated]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const enviar = useCallback(async () => {
    const texto = borrador.trim();
    if (!texto || !conv || enviando) return;
    setEnviando(true);
    /* El borrador se vacía YA y se devuelve si el envío falla: escribir, ver que el texto sigue ahí
       y volver a pulsar es exactamente lo que hace dudar de si se mandó o no. */
    setBorrador('');
    try {
      await lifebookChatApi.send(conv, texto);
      await cargar();
    } catch {
      setBorrador(texto);
      Alert.alert('Mensaje', 'No se pudo enviar. Inténtalo otra vez.');
    } finally {
      setEnviando(false);
    }
  }, [borrador, conv, enviando, cargar]);

  const nombre = tienda ?? 'Tienda';
  const hayFoto = Boolean(foto) && !fotoRota;

  return (
    <View style={[s.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[s.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <View style={s.cabeceraTienda}>
          {hayFoto ? (
            <Image
              source={{ uri: foto as string }}
              style={[s.avatar, { borderColor: colors.border }]}
              onError={() => setFotoRota(true)}
            />
          ) : (
            /* Sin logo —o con la imagen rota— se pinta la inicial, que es lo que ya hace la tarjeta
               de tienda. Una imagen rota en una cabecera es peor que una letra. */
            <View style={[s.avatar, s.avatarLetra, { backgroundColor: alpha(colors.primary, 0.15), borderColor: colors.border }]}>
              <Text style={[s.inicial, { color: colors.text.primary }]}>{nombre.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={s.cabeceraTexto}>
            <View style={s.cabeceraFila}>
              <Text style={[s.cabeceraTitulo, { color: colors.textPrimary }]} numberOfLines={1}>{nombre}</Text>
              {verificado && <ShieldCheck size={13} color={colors.text.success} />}
            </View>
            <Text style={[s.cabeceraNota, { color: colors.textSecondary }]} numberOfLines={1}>
              Conversación con la tienda
            </Text>
          </View>
        </View>
        {/* EL ESCAPE VISIBLE (decisión 5.b): el chat es la puerta principal, WhatsApp convive. Vive
            AQUÍ y no sólo en la ficha porque un escape que no está donde estás mirando no sirve
            cuando el vendedor tarda en contestar. Sin teléfono, el botón no se pinta: no se ofrece
            un camino que no existe. */}
        {telefono ? (
          <Pressable
            onPress={() => { void whatsappATienda(telefono, `Hola ${nombre}, te escribo desde EG Route Plan.`); }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Escribir a la tienda por WhatsApp"
          >
            <Text style={[s.whatsapp, { color: brand.whatsapp }]}>WhatsApp</Text>
          </Pressable>
        ) : (
          <View style={s.hueco} />
        )}
      </View>

      {!isAuthenticated ? (
        <View style={s.cuerpo}>
          <EmptyState
            emoji="💬"
            titulo="Entra para ver la conversación"
            texto="Los mensajes con la tienda van con tu cuenta: sin sesión no hay nada que enseñar."
            accionLabel="Iniciar sesión"
            accionPrimaria
            onAccion={() => router.push('/auth' as never)}
          />
        </View>
      ) : !conv ? (
        <View style={s.cuerpo}>
          <EmptyState
            emoji="🔗"
            titulo="Falta la conversación"
            texto="Esta pantalla se abre desde Mensajes o desde la ficha de un anuncio. Vuelve y entra por ahí."
            accionLabel="Volver"
            onAccion={() => router.back()}
          />
        </View>
      ) : error ? (
        <View style={s.cuerpo}>
          <InlineError mensaje={error} onReintentar={() => void cargar()} />
        </View>
      ) : (
        <FlatList
          ref={listaRef}
          data={mensajes}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[s.lista, { paddingBottom: espaciado.e16 }]}
          onContentSizeChange={() => listaRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            cargando ? (
              <View style={s.cargando}><ActivityIndicator color={colors.text.primary} /></View>
            ) : (
              <EmptyState
                emoji="👋"
                titulo="Todavía no hay mensajes"
                texto="Escribe abajo para preguntarle a la tienda. Si entraste desde un anuncio, el primer mensaje puede ir con la referencia."
              />
            )
          }
          renderItem={({ item }) => (
            <View style={[s.burbujaFila, item.mine ? s.burbujaMia : s.burbujaSuya]}>
              <View
                style={[
                  s.burbuja,
                  item.mine
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[s.burbujaTexto, { color: item.mine ? brand.white : colors.textPrimary }]}>
                  {item.body}
                </Text>
                <Text
                  style={[
                    s.burbujaHora,
                    { color: item.mine ? alpha(brand.white, 0.75) : colors.textSecondary },
                  ]}
                >
                  {item.createdAt ? getTimeAgo(item.createdAt) : ''}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {isAuthenticated && conv && !error && (
        <View style={[s.barra, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom + espaciado.e8 }]}>
          <TextInput
            value={borrador}
            onChangeText={setBorrador}
            placeholder="Escribe a la tienda…"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={1000}
            accessibilityLabel="Mensaje para la tienda"
            style={[s.entrada, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <Pressable
            onPress={() => void enviar()}
            disabled={!borrador.trim() || enviando}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            style={({ pressed }) => [
              s.enviar,
              { backgroundColor: borrador.trim() ? colors.primary : colors.border },
              { opacity: !borrador.trim() || enviando ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            {enviando ? (
              <ActivityIndicator size="small" color={brand.white} />
            ) : (
              <Send size={icono.sm} color={brand.white} />
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e8,
    borderBottomWidth: trazo.fino,
  },
  cabeceraTienda: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  avatar: { width: 34, height: 34, borderRadius: radios.md, borderWidth: trazo.fino },
  avatarLetra: { alignItems: 'center', justifyContent: 'center' },
  inicial: { fontSize: tipografia.body, fontWeight: peso.titulo },
  cabeceraTexto: { flex: 1 },
  cabeceraFila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  cabeceraTitulo: { fontSize: tipografia.body, fontWeight: peso.titulo, flexShrink: 1 },
  cabeceraNota: { fontSize: tipografia.micro },
  whatsapp: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  hueco: { width: icono.sm },
  cuerpo: { paddingTop: espaciado.e24 },
  cargando: { alignItems: 'center', paddingTop: espaciado.e24 },
  lista: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16, gap: espaciado.e8 },
  burbujaFila: { flexDirection: 'row' },
  burbujaMia: { justifyContent: 'flex-end' },
  burbujaSuya: { justifyContent: 'flex-start' },
  burbuja: {
    maxWidth: '82%',
    borderRadius: radios.lg,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e8,
  },
  burbujaTexto: { fontSize: tipografia.body },
  burbujaHora: { fontSize: tipografia.micro, marginTop: espaciado.e4, textAlign: 'right' },
  barra: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espaciado.e8,
    paddingHorizontal: espaciado.e16,
    paddingTop: espaciado.e8,
    borderTopWidth: trazo.fino,
  },
  entrada: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e8,
    fontSize: tipografia.body,
  },
  enviar: {
    width: 40,
    height: 40,
    borderRadius: radios.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
