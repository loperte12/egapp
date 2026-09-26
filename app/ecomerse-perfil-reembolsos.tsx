/**
 * Reembolsos y devoluciones — la lista (退款售后), `/ecomerse-perfil-reembolsos`.
 *
 * POR QUÉ LA RUTA CUELGA DE `/ecomerse-perfil` Y NO SE LLAMA `/ecomerse-reembolsos`
 * Porque el pie decide qué pestaña está encendida comparando el **prefijo** del pathname, y «Perfil»
 * se compara con `/ecomerse-perfil` (`PieDelMercado.tsx:89`). Una ruta hermana como
 * `/ecomerse-reembolsos` NO empieza por ese prefijo, así que al abrirla la pestaña «Perfil» se
 * apagaría y no quedaría ninguna encendida: el usuario estaría dentro del perfil con el pie diciendo
 * que no está en ninguna parte. Es exactamente la trampa que documenta `ecomerse-mensajes-avisos.tsx`
 * con `/ecomerse-mensajes`, resuelta igual: por el nombre, sin tocar el pie.
 *
 * LAS PESTAÑAS NO CUENTAN LO QUE VEN
 * El número de cada pestaña sale de `counts`, que lo calcula la BASE sobre todas las reclamaciones.
 * La lista trae hasta 100 filas, así que contar las que llegaron daría un número recortado sin
 * avisar en cuanto hubiera más de 100 — y las pestañas de una lista no pueden mentir en su número.
 * Es la misma separación que en la bandeja de avisos (`notices` / `noticeCounts`).
 *
 * EL FILTRO VIVE EN LA URL, COMO EL DE PEDIDOS Y FAVORITOS
 * `?filtro=pending|refunded|rejected|todas`, y el id sale del módulo compartido
 * (`estadosReclamacion.ts`). Así el perfil puede llevar con un dedo a «las que están en revisión» sin
 * que la lista sepa de qué pantalla viene, y el chip encendido y el filtro aplicado son el mismo dato
 * por construcción —no dos que puedan divergir—.
 *
 * AQUÍ NO SE ABRE NI SE RESUELVE NADA
 * Las dos acciones existen en el servidor (`openDispute` desde la ficha del pedido, y
 * `adminResolveDispute` para el administrador), y ninguna de las dos se duplica aquí. Esta pantalla
 * es de LECTURA: es la que faltaba, porque hasta hoy quien abría una reclamación no tenía dónde
 * consultarla.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import {
  EmptyState, Precio, brand, espaciado, icono, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseDispute, type EcomerseDisputeCounts } from '../api/ecomerse';
import { getTimeAgo } from '../utils/formatHelpers';
import { useSession } from '../state/session';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { FichaArticulo } from '../components/ecomerse/FichaArticulo';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';
import {
  FILTROS_RECLAMACION, buscarFiltro, buscarEstado, entraEnFiltro, veredictoDe,
  type FiltroReclamacionDef,
} from '../components/ecomerse/estadosReclamacion';

/** La pastilla del veredicto. Ver la cabecera del módulo: sólida, y con el texto del token correcto. */
function Pastilla({ dispute }: { dispute: EcomerseDispute }) {
  const { colors } = useTheme();
  const def = veredictoDe(dispute.outcome);
  return (
    <View style={[styles.pastilla, { backgroundColor: colors[def.color] }]}>
      <Text style={[styles.pastillaTexto, { color: colors[def.colorTexto] }]} numberOfLines={1}>
        {def.label}
      </Text>
    </View>
  );
}

/**
 * Lo que un lector de pantalla lee de una fila: el veredicto, el artículo, el motivo y el pedido, en
 * el orden en que se ven. Se compone aquí —y no en el `renderItem`— para que la etiqueta y lo pintado
 * no puedan divergir, igual que en la bandeja de avisos.
 */
function etiquetaDe(d: EcomerseDispute): string {
  const partes = [
    veredictoDe(d.outcome).label,
    d.product ? d.product.title : null,
    d.reason,
    `Pedido ${d.orderRef}`,
    d.refundXaf > 0 ? 'importe devuelto' : null,
  ];
  return partes.filter(Boolean).join('. ') + '.';
}

export default function EcomerseReembolsosScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const sinLeer = useSinLeerMercado();
  const { filtro: filtroParam } = useLocalSearchParams<{ filtro?: string }>();

  const filtro = buscarFiltro(filtroParam);

  const [reclamos, setReclamos] = useState<EcomerseDispute[] | null>(null);
  const [cuenta, setCuenta] = useState<EcomerseDisputeCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  /** «Aún no he preguntado» y «pregunté y falló» no son lo mismo. Ver `ecomerse-perfil.tsx`. */
  const [intentado, setIntentado] = useState(false);

  const leer = useCallback(async () => {
    const r = await ecomerseApi.myDisputes();
    setReclamos(r.disputes);
    setCuenta(r.counts);
    setTotal(r.total);
  }, []);

  const cargar = useCallback(async () => {
    if (!isAuthenticated) { setReclamos(null); setCuenta(null); setIntentado(true); return; }
    setCargando(true);
    try {
      await leer();
    } catch {
      setReclamos(null);
      setCuenta(null);
    } finally {
      setCargando(false);
      setIntentado(true);
    }
  }, [isAuthenticated, leer]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try { await leer(); } catch { /* se queda lo que había: un tic de red no borra la lista */ }
    finally { setRefrescando(false); }
  }, [leer]);

  /** El número de cada pestaña: el de la base, no el que se cuenta en pantalla. */
  const cuentaDe = (f: FiltroReclamacionDef['id']): number =>
    f === 'todas' ? total : (cuenta?.[f] ?? 0);

  /**
   * Las filas que se pintan. El filtro se aplica en el cliente sobre las 100 que llegaron, y eso es
   * correcto AQUÍ porque el número de la pestaña no sale de esta lista: aunque la ventana recorte,
   * el chip dice la verdad y la lista enseña lo que tiene. Cuando el problema sea el recorte y no el
   * filtro, se verá en el contador.
   */
  const visibles = useMemo(
    () => (reclamos ?? []).filter((d) => entraEnFiltro(d.outcome, filtro)),
    [reclamos, filtro],
  );

  const estadoActivo = buscarEstado(filtro);
  const fallo = isAuthenticated && intentado && !cargando && reclamos === null;

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
          Reembolsos y devoluciones
        </Text>
        <View style={styles.hueco} />
      </View>

      {!isAuthenticated ? (
        <View style={styles.centro}>
          <EmptyState
            emoji="🔐"
            titulo="Entra para ver tus reclamaciones"
            texto="Las reclamaciones van con tu cuenta: sin sesión no hay nada que enseñar."
            accionLabel="Iniciar sesión"
            accionPrimaria
            onAccion={() => router.push('/auth' as never)}
          />
        </View>
      ) : fallo ? (
        <View style={styles.centro}>
          <EmptyState
            emoji="📡"
            titulo="No se pudieron cargar tus reclamaciones"
            texto="El servidor no contestó. Puede ser la red del aparato: vuelve a intentarlo."
            accionLabel="Reintentar"
            onAccion={() => void cargar()}
          />
        </View>
      ) : cargando && reclamos === null ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.text.primary} />
        </View>
      ) : (
        <>
          {/*
            Las pestañas. El carril se desplaza en horizontal y los chips llevan ALTO FIJO: es la
            lección de la lista de pedidos, donde sin alto fijo la fila se comprimía en vez de
            desplazarse y el chip aplastaba su texto a dos líneas.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtros}
            contentContainerStyle={styles.filtrosContenido}
          >
            {FILTROS_RECLAMACION.map((f) => {
              const on = filtro === f.id;
              const n = cuentaDe(f.id);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => router.setParams({ filtro: f.id } as never)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${f.label}${n ? `, ${n} ${n === 1 ? 'reclamación' : 'reclamaciones'}` : ', ninguna'}`}
                  style={[
                    styles.filtroChip,
                    {
                      backgroundColor: on ? colors.primary : colors.surface,
                      borderColor: on ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.filtroTexto, { color: on ? brand.white : colors.textPrimary }]}>
                    {f.label}{n ? ` ${n}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <FlatList
            data={visibles}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e24 }}
            refreshControl={
              <RefreshControl refreshing={refrescando} onRefresh={() => void refrescar()} tintColor={colors.primary} />
            }
            ListEmptyComponent={
              <View style={styles.centro}>
                <EmptyState
                  emoji="🧾"
                  /* El vacío dice QUÉ va a aparecer y con qué palabras. Con un filtro puesto nombra el
                     veredicto, para que «no hay ninguna» se lea como «no hay ninguna DE ÉSTAS» y no
                     como «no funciona». */
                  titulo={estadoActivo ? `Ninguna ${estadoActivo.label.toLowerCase()}` : 'Todavía no has reclamado nada'}
                  texto={
                    estadoActivo
                      ? estadoActivo.nota
                      : 'Cuando algo vaya mal con un pedido entregado puedes abrir una reclamación desde su ficha, y aparecerá aquí.'
                  }
                />
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/ecomerse-perfil-reembolso?id=${item.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={etiquetaDe(item)}
                style={({ pressed }) => [styles.fila, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={styles.filaCabecera}>
                  <Pastilla dispute={item} />
                  <Text style={[styles.hora, { color: colors.textSecondary }]}>
                    {getTimeAgo(item.createdAt)}
                  </Text>
                </View>

                {/* El sujeto de la reclamación es EL ARTÍCULO, igual que en la bandeja de avisos. */}
                {item.product ? <FichaArticulo articulo={item.product} /> : null}

                {/* El motivo que escribió el comprador: es su propia queja, así que se enseña. */}
                <Text style={[styles.motivo, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.reason}
                </Text>

                <View style={styles.pie}>
                  <Text style={[styles.referencia, { color: colors.textSecondary }]}>
                    Pedido {item.orderRef}
                  </Text>
                  {/* El importe devuelto SÓLO se dice cuando lo hubo: un «0 XAF» en las otras dos
                      se leería como «no te devolvieron nada» cuando la pregunta no viene al caso. */}
                  {item.refundXaf > 0 ? (
                    <View style={styles.devuelto}>
                      <Text style={[styles.devueltoTexto, { color: colors.textSecondary }]}>Devuelto </Text>
                      <Precio valor={item.refundXaf} tamano="sm" />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </>
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
  filtros: { flexGrow: 0 },
  /* Alto FIJO en el carril y en cada chip: sin esto la fila se comprime en vez de desplazarse (ver la
     lista de pedidos, donde se midió). */
  filtrosContenido: { height: 44, alignItems: 'center', paddingHorizontal: espaciado.e16, gap: espaciado.e8 },
  filtroChip: { height: 32, justifyContent: 'center', paddingHorizontal: espaciado.e12, borderRadius: radios.full, borderWidth: trazo.fino },
  filtroTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  fila: {
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
    gap: espaciado.e8,
  },
  filaCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastilla: {
    paddingHorizontal: espaciado.e8,
    paddingVertical: espaciado.e4,
    borderRadius: radios.sm,
  },
  pastillaTexto: { fontSize: tipografia.micro, fontWeight: peso.titulo },
  hora: { fontSize: tipografia.micro },
  motivo: { fontSize: tipografia.caption, lineHeight: 17 },
  pie: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: espaciado.e8 },
  referencia: { fontSize: tipografia.micro },
  devuelto: { flexDirection: 'row', alignItems: 'baseline' },
  devueltoTexto: { fontSize: tipografia.micro },
});
