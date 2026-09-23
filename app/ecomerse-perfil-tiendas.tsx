/**
 * Tiendas que sigo — la lista del seguimiento del Mercado (店铺关注), `/ecomerse-perfil-tiendas`.
 *
 * POR QUÉ LA RUTA CUELGA DE `/ecomerse-perfil` Y NO SE LLAMA `/ecomerse-tiendas-seguidas`
 * Porque el pie decide qué pestaña está encendida comparando el **prefijo** del pathname, y «Perfil»
 * se compara con `/ecomerse-perfil` (`PieDelMercado.tsx:89`). Una ruta que no empieza por ese
 * prefijo apagaría la pestaña «Perfil» al abrirse y no quedaría ninguna encendida: el usuario estaría
 * dentro del perfil con el pie diciendo que no está en ninguna parte. Es la trampa que documentan
 * `ecomerse-mensajes-avisos.tsx` y `ecomerse-perfil-reembolsos.tsx`, resuelta igual: por el nombre,
 * sin tocar el pie. OJO: `/ecomerse-tiendas` YA EXISTE y es el DIRECTORIO del Mercado —un nombre más
 * corto habría colisionado con él.
 *
 * LAS FILAS SON TARJETAS DEL CENSO
 * Cada fila se pinta con `CabeceraTienda`, el mismo componente que el directorio y la ficha, porque
 * el servidor devuelve la MISMA forma de tarjeta (`mapTienda` en el backend). Si un día la lista
 * nueva pintara con otro componente, la comparación de las dos pantallas sería la única forma de ver
 * la deriva.
 *
 * DEJAR DE SEGUIR ES DE UN TOQUE, SIN CONFIRMAR
 * A diferencia de borrar una dirección, dejar de seguir no destruye nada que cueste recuperar: la
 * tienda sigue existiendo y volver a seguirla es un toque en la misma fila dentro de su página. Un
 * `Alert` de confirmación aquí sería fricción por una acción reversible, así que se hace directo y se
 * revierte si el servidor dice que no.
 *
 * AQUÍ NO SE SIGUE NADA NUEVO
 * Seguir una tienda se hace desde su página (`BotonSeguirTienda`). Esta pantalla es la lista, la que
 * faltaba: quien seguía tiendas no tenía dónde verlas juntas.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { EmptyState, InlineError, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseTiendaSeguida } from '../api/ecomerse';
import { useSession } from '../state/session';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { CabeceraTienda } from '../components/ecomerse/CabeceraTienda';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';

/** El texto del error del servidor si lo hay; si no, uno que no miente sobre lo que pasó. */
const mensajeDe = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : 'No se pudo completar. Inténtalo otra vez.';

export default function EcomersePerfilTiendasScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const sinLeer = useSinLeerMercado();

  const [tiendas, setTiendas] = useState<EcomerseTiendaSeguida[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  /** «Aún no he preguntado» y «pregunté y falló» no son lo mismo. Ver `ecomerse-perfil.tsx`. */
  const [intentado, setIntentado] = useState(false);
  /** El id de la fila que está hablando con el servidor: bloquea SU botón, no los de las demás. */
  const [ocupada, setOcupada] = useState<string | null>(null);

  const leer = useCallback(async () => {
    const r = await ecomerseApi.myStoreFollows();
    setTiendas(r.sellers);
  }, []);

  const cargar = useCallback(async () => {
    if (!isAuthenticated) { setTiendas(null); setIntentado(true); return; }
    setCargando(true);
    try {
      await leer();
    } catch {
      setTiendas(null);
    } finally {
      setCargando(false);
      setIntentado(true);
    }
  }, [isAuthenticated, leer]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try { await leer(); } catch { /* un tic de red no borra la lista: se queda lo que había */ }
    finally { setRefrescando(false); }
  }, [leer]);

  const dejarDeSeguir = useCallback(async (t: EcomerseTiendaSeguida) => {
    if (ocupada) return;
    setOcupada(t.id);
    /* Optimista: la fila sale YA. Si el servidor dice que no, se recarga y vuelve — y el motivo se
       enseña, no se tapa con un genérico. */
    setTiendas((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    try {
      await ecomerseApi.followStore(t.id);
    } catch (e) {
      Alert.alert('No se pudo actualizar', mensajeDe(e));
      await leer().catch(() => undefined);
    } finally {
      setOcupada(null);
    }
  }, [ocupada, leer]);

  const fallo = isAuthenticated && intentado && !cargando && tiendas === null;

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
          Tiendas que sigo
        </Text>
        <View style={styles.hueco} />
      </View>

      {!isAuthenticated ? (
        <View style={styles.centro}>
          <EmptyState
            emoji="🔐"
            titulo="Entra para ver tus tiendas"
            texto="Las tiendas que sigues van con tu cuenta: sin sesión no hay lista que enseñar."
            accionLabel="Iniciar sesión"
            accionPrimaria
            onAccion={() => router.push('/auth' as never)}
          />
        </View>
      ) : fallo ? (
        <View style={styles.centro}>
          <InlineError mensaje="No se pudo cargar la lista." onReintentar={() => void cargar()} />
        </View>
      ) : cargando && tiendas === null ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tiendas ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e24 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={() => void refrescar()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.centro}>
              <EmptyState
                emoji="🏪"
                titulo="Aún no sigues ninguna tienda"
                texto="Cuando sigas una tienda desde su página, aparecerá aquí para volver a ella rápido."
                accionLabel="Explorar el directorio"
                onAccion={() => router.push('/ecomerse-tiendas' as never)}
              />
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.fila, { borderBottomColor: colors.border }]}>
              {/*
                LA TARJETA ES PUERTA a la tienda, igual que en el directorio: tocar el nombre o el
                avatar entra a su página. La acción de dejar de seguir vive APARTE, debajo, para que
                los dos gestos no compitan por el mismo toque.
              */}
              <CabeceraTienda
                seller={item}
                anuncios={item.anuncios}
                onPress={() => router.push({ pathname: '/ecomerse-tienda', params: { id: item.id, nombre: item.businessName ?? '' } } as never)}
              />
              <View style={styles.filaPie}>
                <Text style={[styles.desde, { color: colors.textSecondary }]}>
                  Siguiéndola desde {item.since ? new Date(item.since).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </Text>
                <Pressable
                  onPress={() => void dejarDeSeguir(item)}
                  disabled={ocupada === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Dejar de seguir la tienda ${item.businessName ?? ''}`}
                  accessibilityState={{ busy: ocupada === item.id }}
                  style={({ pressed }) => [styles.dejar, { borderColor: colors.border, opacity: pressed || ocupada === item.id ? 0.6 : 1 }]}
                >
                  {ocupada === item.id ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Text style={[styles.dejarTexto, { color: colors.textSecondary }]}>Dejar de seguir</Text>
                  )}
                </Pressable>
              </View>
            </View>
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
  cabeceraTitulo: { flexShrink: 1, fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  hueco: { width: icono.lg },
  centro: { paddingTop: espaciado.e24, paddingHorizontal: espaciado.e16 },
  fila: {
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
    gap: espaciado.e8,
  },
  filaPie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 },
  desde: { flex: 1, fontSize: tipografia.micro },
  dejar: {
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e4,
    borderRadius: radios.full,
    borderWidth: trazo.fino,
    minWidth: 132,
    alignItems: 'center',
  },
  dejarTexto: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
});
