/**
 * Mensajes del Mercado — segundo destino del pie (`/ecomerse-mensajes`).
 *
 * QUÉ HAY AQUÍ
 * Dos bloques con forma distinta, y la diferencia es deliberada:
 *
 *   · **Las dos filas del sistema** (Fase 3, 22-sep-2026): «Avisos de tus pedidos» (canal
 *     `transaction`) y «Asistente de logística` (canal `logistics`), cada una con su contador de sin
 *     leer. Son DOS CANALES FIJOS, no una lista: existen siempre, y que hoy no tengan nada es
 *     información («no te ha pasado nada con tus pedidos»), no una ausencia de función. Por eso se
 *     pintan aunque estén a cero y el vacío de verdad vive dentro de cada canal.
 *
 *   · **Las conversaciones con tiendas** (Fase 4): esto sí es una LISTA, y crece con el uso. Una por
 *     tienda, con su nombre y su logo, el último mensaje y los sin leer. Es la cara comercial del
 *     MISMO hilo que el vendedor ve desde su chat de siempre (decisión 5.c): por debajo no hay dos
 *     chats, hay uno con dos caras.
 *
 * POR QUÉ LA CINTA «TODAVÍA NO ESTÁ» YA NO ESTÁ
 * En la Fase 3 este hueco lo ocupaba un bloque honesto que decía que las conversaciones con tiendas
 * todavía no existían. Ahora existen, así que un cartel de «todavía no» sería mentira. Lo que queda
 * es su estado vacío —«no hablas con ninguna tienda»—, que es otra cosa: se dice DENTRO de la
 * sección y explica cómo se empieza, en vez de ocupar el sitio de una función que ya está.
 *
 * EL TEXTO DE LAS FILAS DEL SISTEMA NO VIVE AQUÍ
 * El rótulo y la nota de cada canal salen de `components/ecomerse/canalesAviso.ts`, que es también de
 * donde la pantalla del canal saca su título: así la fila y la cabecera no pueden divergir.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Receipt, Truck } from 'lucide-react-native';
import { EmptyState, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { brand } from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseChat, type EcomerseNoticeCounts } from '../api/ecomerse';
import { getTimeAgo } from '../utils/formatHelpers';
import { useSession } from '../state/session';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { AvatarTienda } from '../components/ecomerse/AvatarTienda';
import { CANALES_AVISO, type CanalAviso } from '../components/ecomerse/canalesAviso';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';

/**
 * El icono de cada canal. Va AQUÍ y no en `canalesAviso.ts` porque aquél es el CONTRATO —el id, el
 * rótulo y qué trae dentro— y esto es pintura: que Mensajes cambie de iconos no tiene por qué
 * tocarte el título de la pantalla del canal. Mismo reparto que `ICONO_SECCION` en el perfil.
 */
const ICONO_CANAL: Record<CanalAviso, React.ComponentType<{ size?: number; color?: string }>> = {
  transaction: Receipt,
  logistics: Truck,
};

/**
 * Abre la conversación. Se pasan los datos de la tienda por la URL para que la cabecera se pinte al
 * instante —nombre y logo— sin esperar a que llegue el hilo; si alguno faltara, la pantalla del chat
 * sabe vivir sin él. `verificado` viaja como '1'/ausente porque los parámetros de navegación son
 * texto y un `false` se perdería.
 */
export function irAlChatDeTienda(router: { push: (r: never) => void }, c: EcomerseChat) {
  router.push({
    pathname: '/ecomerse-mensajes-chat',
    params: {
      conv: c.conversationId,
      tienda: c.seller.businessName ?? '',
      foto: c.seller.photoUrl ?? '',
      telefono: c.seller.phoneContact ?? '',
      ...(c.seller.verified ? { verificado: '1' } : {}),
    },
  } as never);
}

export default function EcomerseMensajesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const sinLeer = useSinLeerMercado();
  const [cuenta, setCuenta] = useState<EcomerseNoticeCounts | null>(null);
  const [chats, setChats] = useState<EcomerseChat[] | null>(null);
  const [cargando, setCargando] = useState(false);
  /**
   * «Aún no he preguntado» y «pregunté y falló» no son lo mismo. Sin esta bandera, entre el primer
   * pintado y el efecto de foco —que corre después— se colaba un fotograma diciendo que había
   * fallado antes de haber preguntado. Es el mismo fallo que se corrigió en el perfil.
   */
  const [intentado, setIntentado] = useState(false);

  const cargar = useCallback(async () => {
    if (!isAuthenticated) { setCuenta(null); setChats(null); setIntentado(true); return; }
    setCargando(true);
    /* `allSettled` y no `all`: son dos secciones independientes y que una se caiga no debe borrar lo
       que la otra sí sabía. Cada sección dice por su cuenta si falló; lo que no se hace es pintar un
       cero que nadie ha confirmado. */
    const [avisos, tiendas] = await Promise.allSettled([
      ecomerseApi.noticeCounts(),
      ecomerseApi.chats(),
    ]);
    setCuenta(avisos.status === 'fulfilled' ? avisos.value : null);
    setChats(tiendas.status === 'fulfilled' ? tiendas.value.chats : null);
    setCargando(false);
    setIntentado(true);
  }, [isAuthenticated]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /* La pantalla entera ha fallado sólo si no hay NADA que enseñar: una sección caída se cuenta en su
     sitio, con sus palabras, y no se lleva por delante a la otra. */
  const fallo = isAuthenticated && intentado && !cargando && cuenta === null && chats === null;

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]}>Mensajes</Text>
        {cargando ? (
          <ActivityIndicator size="small" color={colors.text.primary} />
        ) : (
          <View style={styles.hueco} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e24 }}>
        {!isAuthenticated ? (
          <View style={styles.cuerpo}>
            <EmptyState
              emoji="💬"
              titulo="Entra para ver tus mensajes"
              texto="Los avisos de tus pedidos, el estado de tus envíos y tus conversaciones con las tiendas van con tu cuenta."
              accionLabel="Iniciar sesión"
              accionPrimaria
              onAccion={() => router.push('/auth' as never)}
            />
          </View>
        ) : fallo ? (
          <View style={styles.cuerpo}>
            <EmptyState
              emoji="📡"
              titulo="No se pudieron cargar tus mensajes"
              texto="El servidor no contestó. Puede ser la red del aparato: vuelve a intentarlo."
              accionLabel="Reintentar"
              onAccion={() => void cargar()}
            />
          </View>
        ) : (
          <>
            {/*
              LAS DOS FILAS DEL SISTEMA. Van sin encabezado propio: el título de la pantalla ya dice
              «Mensajes» y meter un rótulo «Del sistema» encima sería una jerarquía que no existe
              —los dos canales SON la pantalla—. La tarjeta las agrupa y basta.
            */}
            <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {CANALES_AVISO.map((canal, i) => {
                const Icono = ICONO_CANAL[canal.id];
                const n = cuenta?.channels[canal.id].unread ?? 0;
                const total = cuenta?.channels[canal.id].total ?? 0;
                return (
                  <Pressable
                    key={canal.id}
                    onPress={() => router.push(`/ecomerse-mensajes-avisos?canal=${canal.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      `${canal.label}. ${n > 0 ? `${n} sin leer` : 'nada sin leer'}, ${total} en total.`
                    }
                    style={({ pressed }) => [
                      styles.fila,
                      /* La primera fila no lleva raya encima: la tarjeta ya tiene su borde. */
                      i > 0 && { borderTopWidth: trazo.fino, borderTopColor: colors.border },
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <View style={[styles.filaIcono, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Icono size={icono.md} color={colors.text.primary} />
                    </View>
                    <View style={styles.filaTexto}>
                      <Text style={[styles.filaTitulo, { color: colors.textPrimary }]}>{canal.label}</Text>
                      <Text style={[styles.filaNota, { color: colors.textSecondary }]}>{canal.nota}</Text>
                    </View>
                    {/*
                      El contador va en PÍLDORA y no en un círculo pegado al icono: aquí hay sitio de
                      sobra, y un número en una fila se lee mejor que un globo diminuto. Enseña los
                      SIN LEER, que es la única cifra que pide una acción.
                    */}
                    {n > 0 && (
                      <View style={styles.pildora}>
                        <Text style={styles.pildoraTexto}>{n > 99 ? '99+' : n}</Text>
                      </View>
                    )}
                    <ChevronRight size={icono.sm} color={colors.textSecondary} />
                  </Pressable>
                );
              })}
            </View>

            {/*
              LAS CONVERSACIONES CON TIENDAS. Llevan encabezado con la cuenta porque, a diferencia de
              los canales, esta lista crece: saber cuántas hay de un vistazo es útil y el número lo da
              la propia lista (no hay recorte que lo desmienta: el servidor devuelve hasta 100).
            */}
            <View style={styles.bloque}>
              <Text style={[styles.bloqueTitulo, { color: colors.textPrimary }]}>
                Conversaciones con tiendas{chats && chats.length > 0 ? ` (${chats.length})` : ''}
              </Text>

              {chats === null ? (
                <View style={[styles.aviso, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.avisoTexto, { color: colors.textSecondary }]}>
                    No se pudieron cargar tus conversaciones con tiendas. Los avisos de arriba siguen ahí.
                  </Text>
                </View>
              ) : chats.length === 0 ? (
                <View style={[styles.aviso, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.avisoTexto, { color: colors.textSecondary }]}>
                    Todavía no hablas con ninguna tienda. Se empieza desde la ficha de un anuncio —«Preguntar a la tienda»—
                    o desde la página de la tienda, y la conversación aparece aquí.
                  </Text>
                </View>
              ) : (
                <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {chats.map((c, i) => {
                    const nombre = c.seller.businessName ?? 'Tienda';
                    const cuando = c.lastMessageAt ? getTimeAgo(c.lastMessageAt) : '';
                    return (
                      <Pressable
                        key={c.conversationId}
                        onPress={() => irAlChatDeTienda(router, c)}
                        accessibilityRole="button"
                        accessibilityLabel={`${nombre}. ${c.unread > 0 ? `${c.unread} sin leer. ` : ''}${c.lastMessage ?? 'Sin mensajes'}`}
                        style={({ pressed }) => [
                          styles.fila,
                          i > 0 && { borderTopWidth: trazo.fino, borderTopColor: colors.border },
                          { opacity: pressed ? 0.6 : 1 },
                        ]}
                      >
                        <AvatarTienda nombre={nombre} fotoUrl={c.seller.photoUrl} tamano={40} />
                        <View style={styles.filaTexto}>
                          <Text style={[styles.filaTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
                            {nombre}
                          </Text>
                          <Text style={[styles.filaNota, { color: colors.textSecondary }]} numberOfLines={1}>
                            {c.lastMessage ?? 'Sin mensajes todavía'}
                          </Text>
                        </View>
                        <View style={styles.derecha}>
                          {cuando ? (
                            <Text style={[styles.filaHora, { color: colors.textSecondary }]}>{cuando}</Text>
                          ) : null}
                          {c.unread > 0 && (
                            <View style={styles.pildora}>
                              <Text style={styles.pildoraTexto}>{c.unread > 99 ? '99+' : c.unread}</Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <PieDelMercado sinLeer={sinLeer} />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  cabeceraTitulo: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  hueco: { width: icono.lg },
  cuerpo: { paddingTop: espaciado.e24 },
  tarjeta: {
    marginHorizontal: espaciado.e16,
    marginTop: espaciado.e16,
    borderRadius: radios.lg,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e16,
  },
  bloque: { paddingHorizontal: espaciado.e16, marginTop: espaciado.e24 },
  bloqueTitulo: { fontSize: tipografia.body, fontWeight: peso.titulo, marginBottom: espaciado.e8 },
  aviso: {
    borderRadius: radios.lg,
    borderWidth: trazo.fino,
    padding: espaciado.e16,
  },
  avisoTexto: { fontSize: tipografia.caption, lineHeight: 18 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    paddingVertical: espaciado.e12,
  },
  filaIcono: {
    width: 36,
    height: 36,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTexto: { flex: 1 },
  filaTitulo: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  filaNota: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  filaHora: { fontSize: tipografia.micro },
  derecha: { alignItems: 'flex-end', gap: espaciado.e4 },
  pildora: {
    backgroundColor: brand.like,
    borderRadius: radios.full,
    minWidth: espaciado.e24,
    paddingHorizontal: espaciado.e8,
    paddingVertical: espaciado.e4 / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pildoraTexto: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.titulo },
});
