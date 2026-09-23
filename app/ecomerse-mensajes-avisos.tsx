/**
 * La pantalla de UN canal de avisos — `/ecomerse-mensajes-avisos?canal=transaction|logistics`.
 *
 * POR QUÉ LA RUTA SE LLAMA ASÍ Y NO `/ecomerse-avisos`
 * Porque el pie decide qué pestaña está activa comparando el **prefijo** del pathname, y «Mensajes»
 * se compara con `/ecomerse-mensajes` (`PieDelMercado.tsx:89`). Una ruta hermana como
 * `/ecomerse-avisos` NO empieza por ese prefijo, así que al abrir el canal la pestaña «Mensajes» se
 * apagaría y no habría ninguna encendida: el usuario estaría dentro de Mensajes con el pie diciendo
 * que está en ninguna parte. Colgando la ruta DEBAJO del prefijo —`/ecomerse-mensajes-avisos`— la
 * regla que ya está escrita sigue valiendo sin tocar el pie. Es la misma trampa que documenta
 * `BarraTienda.tsx:82` con `/tienda`, resuelta por el nombre y no con una excepción.
 *
 * UN CANAL, O LOS DOS
 * Si la URL no trae `canal` —o trae uno que no existe, porque la puede escribir cualquiera—, la
 * pantalla enseña **los dos canales juntos** y lo dice en la cabecera («Todos los avisos»). Tratarlo
 * como un error sería castigar al usuario por una URL rara; inventarse un canal por defecto sería
 * peor: enseñaría avisos que nadie pidió con un título que no les corresponde.
 *
 * TOCAR UN AVISO LO MARCA LEÍDO — y no lleva a ningún sitio
 * El gesto natural de una bandeja es «abrir», pero aquí no hay nada que abrir: el aviso ES el
 * contenido (título, cuerpo y referencia del pedido) y la acción que falta es quitarlo de «sin
 * leer». Así que el toque marca leído y el aviso se queda donde está, con su punto apagado. Si
 * algún día hay ficha de pedido, el toque llevará allí; hoy prometerlo sería mentir.
 *
 * EL CONTADOR SE ACTUALIZA ANTES DE QUE CONTESTE EL SERVIDOR, Y SE CORRIGE SI FALLA
 * Marcar leído es idempotente y no puede fallar por reglas de negocio, así que esperar a la red para
 * apagar un punto sería hacer esperar al dedo por nada. Se pinta el cambio al instante y, si la
 * petición falla, se **vuelve a leer del servidor**: la verdad vuelve sola, sin inventarse un estado
 * intermedio que nadie ha confirmado.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCheck } from 'lucide-react-native';
import { EmptyState, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { brand } from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseNotice, type EcomerseNoticeCounts } from '../api/ecomerse';
import { getTimeAgo } from '../utils/formatHelpers';
import { useSession } from '../state/session';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { buscarCanal } from '../components/ecomerse/canalesAviso';
/* La tarjeta del artículo. Se llamaba `FichaProductoAviso`; desde la Fase 5 la usan también las
   reclamaciones, así que el nombre se quedó corto y se generalizó (ver el propio componente). */
import { FichaArticulo } from '../components/ecomerse/FichaArticulo';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';

/**
 * Lo que un lector de pantalla lee de una fila. Dice los cuatro datos que dan sentido al aviso —si
 * está leído, qué pasó, de qué artículo y de qué pedido— y en ese orden, que es el de la pantalla.
 * Se compone aquí y no en el `renderItem` para que la etiqueta y lo que se pinta no puedan divergir.
 */
function etiquetaDe(a: EcomerseNotice): string {
  const partes = [
    a.read ? 'Leído' : 'Sin leer',
    a.title,
    a.product ? a.product.title : null,
    a.orderRef ? `Pedido ${a.orderRef}` : null,
  ];
  return partes.filter(Boolean).join('. ') + '.';
}

export default function EcomerseAvisosScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const sinLeer = useSinLeerMercado();
  const { canal: canalParam } = useLocalSearchParams<{ canal?: string }>();

  const canal = buscarCanal(canalParam);
  const titulo = canal?.label ?? 'Todos los avisos';

  const [avisos, setAvisos] = useState<EcomerseNotice[] | null>(null);
  const [cuenta, setCuenta] = useState<EcomerseNoticeCounts | null>(null);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  /** «Aún no he preguntado» y «pregunté y falló» no son lo mismo. Ver `ecomerse-perfil.tsx`. */
  const [intentado, setIntentado] = useState(false);

  const leer = useCallback(async () => {
    const [lista, c] = await Promise.all([
      ecomerseApi.notices(canal?.id),
      ecomerseApi.noticeCounts(),
    ]);
    setAvisos(lista.items);
    setCuenta(c);
  }, [canal?.id]);

  const cargar = useCallback(async () => {
    if (!isAuthenticated) { setAvisos(null); setCuenta(null); setIntentado(true); return; }
    setCargando(true);
    try {
      await leer();
    } catch {
      setAvisos(null);
      setCuenta(null);
    } finally {
      setCargando(false);
      setIntentado(true);
    }
  }, [isAuthenticated, leer]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try { await leer(); } catch { /* se queda lo que había: un tic de red no borra la bandeja */ }
    finally { setRefrescando(false); }
  }, [leer]);

  /** Marcar uno. Optimista a propósito (ver la cabecera del fichero); si falla, se relee. */
  const marcarUno = useCallback(async (aviso: EcomerseNotice) => {
    if (aviso.read) return;
    setAvisos((prev) => prev?.map((a) => (a.id === aviso.id ? { ...a, read: true } : a)) ?? prev);
    try {
      await ecomerseApi.markNoticeRead(aviso.id);
      await leer();
    } catch {
      await refrescar();
    }
  }, [leer, refrescar]);

  const marcarTodo = useCallback(async () => {
    setAvisos((prev) => prev?.map((a) => ({ ...a, read: true })) ?? prev);
    try {
      await ecomerseApi.markAllNoticesRead(canal?.id);
      await leer();
    } catch {
      await refrescar();
    }
  }, [canal?.id, leer, refrescar]);

  const sinLeerAqui = canal
    ? (cuenta?.channels[canal.id].unread ?? 0)
    : (cuenta?.unread ?? 0);
  const fallo = isAuthenticated && intentado && !cargando && avisos === null;

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
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
          {titulo}
        </Text>
        {/*
          «Marcar todo leído» SÓLO aparece si hay algo que marcar: un botón que no hace nada es peor
          que no tenerlo. Marca los dos canales o sólo éste, según de dónde se haya entrado.
        */}
        {sinLeerAqui > 0 ? (
          <Pressable
            onPress={() => void marcarTodo()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Marcar como leído${canal ? ` todo el canal ${canal.label}` : ' todos los avisos'}`}
            style={({ pressed }) => [styles.accion, { opacity: pressed ? 0.6 : 1 }]}
          >
            <CheckCheck size={icono.md} color={colors.primary} />
            <Text style={[styles.accionTexto, { color: colors.primary }]}>Todo leído</Text>
          </Pressable>
        ) : (
          <View style={styles.hueco} />
        )}
      </View>

      {!isAuthenticated ? (
        <View style={styles.centro}>
          <EmptyState
            emoji="💬"
            titulo="Entra para ver tus avisos"
            texto="Los avisos van con tu cuenta: sin sesión no hay nada que enseñar."
            accionLabel="Iniciar sesión"
            accionPrimaria
            onAccion={() => router.push('/auth' as never)}
          />
        </View>
      ) : fallo ? (
        <View style={styles.centro}>
          <EmptyState
            emoji="📡"
            titulo="No se pudieron cargar los avisos"
            texto="El servidor no contestó. Puede ser la red del aparato: vuelve a intentarlo."
            accionLabel="Reintentar"
            onAccion={() => void cargar()}
          />
        </View>
      ) : cargando && avisos === null ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={avisos ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e24 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={() => void refrescar()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.centro}>
              <EmptyState
                emoji="🗒️"
                titulo="Aquí no hay nada todavía"
                /* El vacío dice QUÉ va a aparecer, y con las palabras del canal: es lo único que
                   distingue «no te ha pasado nada» de «esto no funciona». */
                texto={canal?.nota ?? 'Los dos canales del sistema: tus pedidos y el viaje del paquete.'}
              />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void marcarUno(item)}
              accessibilityRole="button"
              accessibilityLabel={etiquetaDe(item)}
              style={({ pressed }) => [
                styles.aviso,
                { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              {/*
                El punto del no leído. Se pinta SIEMPRE el mismo hueco —vacío cuando ya está leído—
                para que las filas no bailen de sitio al marcar una, que es el tic que hace que una
                lista parezca rota.
              */}
              <View style={styles.puntoCol}>
                {!item.read && <View style={[styles.punto, { backgroundColor: brand.like }]} />}
              </View>
              <View style={styles.avisoTexto}>
                {/* Cabecera: QUÉ pasó y CUÁNDO, en una línea. El sujeto es la tarjeta de abajo. */}
                <View style={styles.avisoCabecera}>
                  <Text
                    style={[
                      styles.avisoTitulo,
                      { color: colors.textPrimary },
                      !item.read && { fontWeight: peso.titulo },
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={[styles.avisoHora, { color: colors.textSecondary }]}>
                    {getTimeAgo(item.createdAt)}
                  </Text>
                </View>

                {/*
                  EL SUJETO DEL AVISO ES EL ARTÍCULO. Cuando el pedido trae su línea —que es el caso
                  normal— se pinta la ficha con foto, título y precio, y el CUERPO DEL AVISO NO SE
                  PINTA: era un párrafo que repetía en palabras lo que la tarjeta dice de un vistazo
                  («Cancelado: motivo · stock restaurado · Pedido 94E70807»). El motivo largo sigue en
                  el hilo del pedido, que es su sitio, y aquí queda la referencia corta para poder
                  identificar la compra.
                  Sin artículo (un aviso cuyo pedido no guardó líneas), el cuerpo es lo único que hay
                  y se pinta recortado a dos líneas: mejor eso que una fila sin sujeto.
                */}
                {item.product ? (
                  <FichaArticulo articulo={item.product} />
                ) : item.body ? (
                  <Text style={[styles.avisoCuerpo, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}

                {item.orderRef ? (
                  <Text style={[styles.referencia, { color: colors.textSecondary }]}>
                    Pedido {item.orderRef}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}

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
    gap: espaciado.e12,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  /**
   * El título cede el ancho antes que la acción: con «Asistente de logística» y «Todo leído» en la
   * misma fila, el que tiene que encogerse es el texto largo, no el botón. `flexShrink` y no
   * `flex: 1`: con `flex: 1` el título empujaría la acción fuera de la pantalla.
   */
  cabeceraTitulo: { flexShrink: 1, fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  accion: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  accionTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  hueco: { width: icono.lg },
  centro: { paddingTop: espaciado.e24, paddingHorizontal: espaciado.e16 },
  aviso: {
    flexDirection: 'row',
    gap: espaciado.e12,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  puntoCol: { width: espaciado.e8, paddingTop: espaciado.e8, alignItems: 'center' },
  punto: { width: espaciado.e8, height: espaciado.e8, borderRadius: radios.full },
  avisoTexto: { flex: 1 },
  /* La cabecera de la fila: el hecho a la izquierda y el tiempo a la derecha, en la misma línea.
     `baseline` y no `center` para que la hora se apoye en la base del título y no quede flotando. */
  avisoCabecera: { flexDirection: 'row', alignItems: 'baseline', gap: espaciado.e8 },
  avisoTitulo: { flex: 1, fontSize: tipografia.body, fontWeight: peso.fuerte },
  avisoCuerpo: { fontSize: tipografia.caption, marginTop: espaciado.e8, lineHeight: 17 },
  avisoHora: { fontSize: tipografia.micro },
  referencia: { fontSize: tipografia.micro, marginTop: espaciado.e8 },
});
