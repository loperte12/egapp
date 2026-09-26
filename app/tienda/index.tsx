/**
 * Resumen — la portada de la zona del comerciante. La pestaña 首页 de Pinduoduo, en versión honesta.
 *
 * LA PORTADA ES UNA LISTA DE TAREAS, NO UN GRÁFICO
 * Lo primero que ve el comerciante al abrir no es cuánto vendió: es **qué le falta hacer**. Por eso
 * el orden es: KPI (contexto) → contadores accionables → alarmas → rendimiento → bajo stock →
 * accesos rápidos. Y por eso los contadores **llevan a Pedidos ya filtrado**: un contador que no
 * filtra es un número decorativo, que es exactamente lo que el plan manda evitar.
 *
 * SIN BACKEND NUEVO
 * Todo lo que se pinta aquí sale de dos llamadas que ya existían: `sellerMe()` (que trae la tienda y
 * **todos sus anuncios** con `views`, `favoriteCount`, `stock` y `status`) y `orderCounts('seller')`
 * + `myOrders('seller')`. No hay endpoint de estadísticas del vendedor —los `admin/stats` son de la
 * plataforma— y no se inventa uno: el plan descarta una pestaña de gráficos inventados.
 *
 * DOS HONESTIDADES QUE SE VEN EN PANTALLA (y no son letra pequeña):
 *  1. Las visitas y los favoritos son **del anuncio, no de la tienda**: sumar los contadores de los
 *     anuncios y llamarlo «visitas de mi tienda» sería mentir con un número propio.
 *  2. El importe del mes se calcula sobre una página de pedidos, no sobre el histórico entero. Si la
 *     página se llena, se dice en la propia tarjeta.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight, FileText, PackagePlus, Star, Store, TrendingUp } from 'lucide-react-native';
import {
  EmptyState, InlineError, Precio, alpha, espaciado, icono, peso, radios, tipografia,
  trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseOrder, type EcomerseSellerMe } from '../../api/ecomerse';
import { formatXAF } from '../../utils/formatHelpers';
import { FilaRequisito } from '../../components/ecomerse/FilaRequisito';

/** Cuántos pedidos se traen para calcular el KPI del mes. Ver la nota de honestidad de arriba. */
const PEDIDOS_KPI = 50;
/** A partir de estas existencias, el anuncio avisa. Con 1 o 2 unidades no se llega a una semana. */
const UMBRAL_BAJO_STOCK = 2;

/**
 * Los cuatro contadores accionables, calcados de 待处理 / 待配送 / 异常包裹 / 已完成 de la app de
 * referencia: cada uno es un ESTADO ACCIONABLE, no una métrica. El `filtro` es el id del chip de la
 * pantalla de Pedidos — van en pareja, y si uno cambia de nombre hay que cambiar el otro.
 */
const CONTADORES = [
  { id: 'pendiente', label: 'Por enviar', estados: ['pending'], tono: 'aviso' },
  { id: 'camino', label: 'En camino', estados: ['confirmed', 'in_transit'], tono: 'info' },
  { id: 'disputado', label: 'En disputa', estados: ['disputed'], tono: 'peligro' },
  { id: 'entregado', label: 'Completados', estados: ['delivered'], tono: 'bien' },
] as const;

export default function TiendaResumen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [me, setMe] = useState<EcomerseSellerMe | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pedidos, setPedidos] = useState<EcomerseOrder[]>([]);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError(null);
    try {
      const m = await ecomerseApi.sellerMe();
      setMe(m);
      if (m.seller) {
        /* Los pedidos y sus contadores solo tienen sentido con tienda dada de alta. */
        const [c, o] = await Promise.all([
          ecomerseApi.orderCounts('seller'),
          ecomerseApi.myOrders('seller', { limit: PEDIDOS_KPI }),
        ]);
        setCounts(c.porEstado);
        setPedidos(o.orders);
        setTotalPedidos(o.total);
      } else {
        setCounts({}); setPedidos([]); setTotalPedidos(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar tu tienda. Revisa la conexión.');
    } finally {
      setCargando(false); setRefrescando(false);
    }
  }, []);

  /* Al volver a la pestaña: si acabas de publicar o de entregar un pedido, los números de la
     portada tienen que estar al día. Una portada con datos de hace dos pantallas miente. */
  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const s = estilos(colors);
  const seller = me?.seller;
  const productos = me?.products ?? [];
  const activa = seller?.status === 'active';

  /* ---- Cálculos del mes ---- */
  const ahora = new Date();
  const delMes = pedidos.filter((o) => {
    const f = new Date(o.createdAt);
    return o.status !== 'cancelled' && f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth();
  });
  const importeMes = delMes.reduce((t, o) => t + (o.totalXaf ?? 0), 0);
  const kpiTruncado = totalPedidos > pedidos.length;

  /* ---- Alarmas: lo que hay que arreglar, contado ---- */
  const rechazados = productos.filter((p) => p.status === 'rejected');
  const agotados = productos.filter((p) => p.status === 'sold_out' || (p.status === 'active' && p.stock <= 0));
  const borradores = productos.filter((p) => p.status === 'draft');
  const bajoStock = productos.filter((p) => p.status === 'active' && p.stock > 0 && p.stock <= UMBRAL_BAJO_STOCK);
  const alarmas = [
    rechazados.length > 0 && {
      id: 'rechazados', icono: AlertTriangle, tono: colors.danger,
      texto: `${rechazados.length} ${rechazados.length === 1 ? 'anuncio rechazado' : 'anuncios rechazados'} — corregir`,
      ruta: '/tienda/anuncios',
    },
    agotados.length > 0 && {
      id: 'agotados', icono: AlertTriangle, tono: colors.warning,
      texto: `${agotados.length} ${agotados.length === 1 ? 'anuncio agotado' : 'anuncios agotados'} — reponer`,
      ruta: '/tienda/anuncios',
    },
    borradores.length > 0 && {
      id: 'borradores', icono: FileText, tono: colors.textSecondary,
      texto: `${borradores.length} sin publicar`,
      ruta: '/tienda/anuncios',
    },
  ].filter(Boolean) as Array<{ id: string; icono: typeof AlertTriangle; tono: string; texto: string; ruta: string }>;

  /* ---- Rendimiento: suma de los contadores de los anuncios ---- */
  const visitas = productos.reduce((t, p) => t + (p.views ?? 0), 0);
  const favoritos = productos.reduce((t, p) => t + (p.favoriteCount ?? 0), 0);

  if (cargando) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        <View style={s.cabecera}><Text style={s.titulo}>Mi tienda</Text></View>
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          {[0, 1, 2].map((i) => <View key={i} style={[s.hueso, { backgroundColor: colors.border }]} />)}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        <View style={s.cabecera}><Text style={s.titulo}>Mi tienda</Text></View>
        <View style={{ padding: espaciado.e16 }}>
          <InlineError mensaje={error} onReintentar={() => cargar()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.raiz, { paddingTop: insets.top }]}>
      <View style={s.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>Mi tienda</Text>
          <Text style={s.subtitulo} numberOfLines={1}>
            {seller ? `${seller.businessName} · ${seller.city}` : 'Aún sin tienda'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} />}
      >

        {/* ─── SIN TIENDA APROBADA: el mapa del onboarding, que es la primera «tarea» de la portada */}
        {!activa && (
          <View style={[s.tarjeta, { backgroundColor: alpha(colors.primary, 0.06), marginBottom: espaciado.e16 }]}>
            <Text style={s.etiqueta}>{seller ? 'TU TIENDA ESTÁ EN REVISIÓN' : 'PARA VENDER NECESITAS'}</Text>
            <Text style={s.tituloBloque}>
              {seller ? 'Casi está: falta la aprobación' : 'Tres pasos y empiezas a publicar'}
            </Text>
            <View style={{ marginTop: espaciado.e8 }}>
              <FilaRequisito
                ok={!!me?.kycOk}
                label="Identidad verificada (KYC)"
                hint={me?.kycOk ? undefined : (me?.kycMessage ?? 'Toca para verificar')}
                onPress={me?.kycOk ? undefined : () => router.push('/driver-onboarding' as never)}
              />
              <FilaRequisito
                ok={!!seller?.businessName && !!seller?.city}
                label="Datos del negocio (nombre + ciudad)"
                hint={seller ? undefined : 'Se rellenan en la pestaña «Tienda»'}
                onPress={seller ? undefined : () => router.replace('/tienda/perfil' as never)}
              />
              <FilaRequisito
                ok={!!activa}
                label="Aprobación del administrador"
                hint={seller ? (activa ? undefined : 'Suele tardar 24–48 h') : 'Sin solicitud'}
              />
            </View>
            {seller?.status === 'rejected' && seller.rejectionReason ? (
              <Text style={[s.nota, { color: colors.text.danger }]}>Motivo del rechazo: {seller.rejectionReason}</Text>
            ) : null}
          </View>
        )}

        {/* ─── CON TIENDA: el cuadro de mando */}
        {activa && (
          <>
            {/* KPI del mes. El importe ES el sujeto de la línea → `Precio`, no una frase con el
                número dentro (doctrina «figura o frase», FASE-2-PRECIO.md). */}
            <View style={[s.tarjeta, { backgroundColor: colors.card, marginBottom: espaciado.e12 }]}>
              <Text style={s.etiqueta}>VENDIDO ESTE MES</Text>
              <Precio valor={importeMes} tamano="xl" />
              <Text style={s.nota}>
                {delMes.length === 0
                  ? 'Ninguna venta este mes todavía.'
                  : `${delMes.length} ${delMes.length === 1 ? 'pedido' : 'pedidos'} · no cuenta los cancelados`}
              </Text>
              {kpiTruncado && (
                <Text style={[s.nota, { color: colors.text.warning }]}>
                  Calculado sobre tus últimos {pedidos.length} pedidos de {totalPedidos}.
                </Text>
              )}
            </View>

            {/* Cuatro contadores accionables. Cada uno ABRE Pedidos ya filtrado. */}
            <View style={s.filaContadores}>
              {CONTADORES.map((c) => {
                const n = c.estados.reduce((t, e) => t + (counts[e] ?? 0), 0);
                const tono = c.tono === 'peligro' ? colors.danger : c.tono === 'bien' ? colors.success : c.tono === 'aviso' ? colors.warning : colors.primary;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push(`/tienda/pedidos?filtro=${c.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.label}: ${n} ${n === 1 ? 'pedido' : 'pedidos'}. Abre la lista filtrada.`}
                    style={({ pressed }) => [s.contador, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={[s.cifraContador, { color: n > 0 ? tono : colors.textSecondary }]}>{n}</Text>
                    <Text style={s.etiquetaContador} numberOfLines={2}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Alarmas: solo si hay algo que arreglar. Un bloque de avisos vacío entrena a ignorarlo. */}
            {alarmas.length > 0 && (
              <View style={{ marginTop: espaciado.e16 }}>
                <Text style={s.tituloBloque}>Necesita tu atención</Text>
                {alarmas.map((a) => {
                  const Icon = a.icono;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => router.push(a.ruta as never)}
                      accessibilityRole="button"
                      accessibilityLabel={a.texto}
                      style={({ pressed }) => [s.alarma, { backgroundColor: alpha(a.tono, 0.08), borderColor: alpha(a.tono, 0.25), opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Icon size={icono.sm} color={a.tono} />
                      <Text style={[s.textoAlarma, { color: colors.textPrimary }]} numberOfLines={2}>{a.texto}</Text>
                      <ChevronRight size={icono.sm} color={colors.textSecondary} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Rendimiento. Con el aviso de qué mide de verdad. */}
            <View style={{ marginTop: espaciado.e24 }}>
              <Text style={s.tituloBloque}>Rendimiento</Text>
              <View style={s.filaContadores}>
                <View style={[s.contador, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[s.cifraContador, { color: colors.textPrimary }]}>{visitas}</Text>
                  <Text style={s.etiquetaContador}>Visitas</Text>
                </View>
                <View style={[s.contador, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[s.cifraContador, { color: colors.textPrimary }]}>{favoritos}</Text>
                  <Text style={s.etiquetaContador}>Favoritos</Text>
                </View>
              </View>
              <Text style={[s.nota, { marginTop: espaciado.e8 }]}>
                Suma de tus {productos.length} {productos.length === 1 ? 'anuncio' : 'anuncios'}. Son visitas del
                anuncio, no de la tienda: el Mercado no cuenta quién entra a la tienda.
              </Text>
            </View>

            {/* Bajo stock: la lista de la compra, que es lo que de verdad se mira a diario. */}
            <View style={{ marginTop: espaciado.e24 }}>
              <Text style={s.tituloBloque}>Se está acabando</Text>
              {bajoStock.length === 0 ? (
                <Text style={s.nota}>Ningún anuncio activo por debajo de {UMBRAL_BAJO_STOCK + 1} unidades.</Text>
              ) : (
                bajoStock.slice(0, 4).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push('/tienda/anuncios' as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.title}: quedan ${p.stock}`}
                    style={({ pressed }) => [s.filaProducto, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.nombreProducto} numberOfLines={1}>{p.title}</Text>
                      {/* El importe va DENTRO de una frase → `formatXAF` suelto, no `Precio`:
                          `Precio` devuelve una View y meter una caja en una frase rompe su
                          ajuste de línea (doctrina «figura o frase»). */}
                      <Text style={s.nota}>{formatXAF(p.priceXaf)} · quedan {p.stock}</Text>
                    </View>
                    <Text style={[s.sello, { color: colors.text.warning }]}>Reponer</Text>
                  </Pressable>
                ))
              )}
            </View>

            {/* Accesos rápidos: lo que se hace desde la portada sin bajar de pestaña. */}
            <View style={{ marginTop: espaciado.e24 }}>
              <Text style={s.tituloBloque}>Accesos</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                <Acceso Icono={PackagePlus} label="Publicar" ruta="/tienda/publicar" onIr={(r) => router.push(r as never)} />
                <Acceso Icono={Store} label="Ver mi tienda" ruta={seller ? `/ecomerse-tienda?id=${seller.id}` : '/tienda'} onIr={(r) => router.push(r as never)} />
                <Acceso Icono={FileText} label="Documentos" ruta="/ecomerse-docs" onIr={(r) => router.push(r as never)} />
                <Acceso Icono={TrendingUp} label="Mi plan" ruta="/ecomerse-planes" onIr={(r) => router.push(r as never)} />
              </View>
            </View>
          </>
        )}

        {/* ─── CON TIENDA PERO SIN ANUNCIOS: el estado vacío con su CTA, como manda el patrón */}
        {activa && productos.length === 0 && (
          <View style={{ marginTop: espaciado.e24 }}>
            <EmptyState
              emoji="📦"
              titulo="Todavía no has publicado"
              texto="Tu tienda ya está aprobada y a la vista. Publica el primer anuncio y aparecerá en el Mercado con tu nombre."
              accionLabel="Publicar mi primer producto"
              accionPrimaria
              onAccion={() => router.push('/tienda/publicar' as never)}
            />
          </View>
        )}

        {/* Estrella: recuerda que las valoraciones son públicas. Solo si ya hay alguna. */}
        {activa && (seller.ratingCount ?? 0) > 0 && (
          <View style={[s.tarjeta, { backgroundColor: colors.card, marginTop: espaciado.e24, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }]}>
            <Star size={icono.sm} color={colors.text.warning} />
            <Text style={s.nota}>
              {(seller.ratingAvg ?? 0).toFixed(1)} de 5 · {seller.ratingCount} {seller.ratingCount === 1 ? 'valoración' : 'valoraciones'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Acceso rápido: icono + etiqueta, en rejilla de dos por fila. */
function Acceso({ Icono, label, ruta, onIr }: {
  Icono: typeof Store; label: string; ruta: string; onIr: (ruta: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onIr(ruta)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{
        width: '48%', flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
        backgroundColor: colors.card, borderColor: colors.border, borderWidth: trazo.fino,
        borderRadius: radios.md, padding: espaciado.e12, opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Icono size={icono.sm} color={colors.text.primary} />
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const estilos = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  cabecera: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino, borderBottomColor: c.border,
  },
  titulo: { fontSize: tipografia.title, fontWeight: peso.titulo, color: c.textPrimary },
  subtitulo: { fontSize: tipografia.caption, color: c.textSecondary, marginTop: espaciado.e2 },
  hueso: { height: 90, borderRadius: radios.md, opacity: 0.6 },
  tarjeta: { borderRadius: radios.md, padding: espaciado.e12, borderWidth: trazo.fino, borderColor: c.border },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.fuerte, color: c.textSecondary, letterSpacing: 0.4, marginBottom: espaciado.e4 },
  tituloBloque: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary, marginBottom: espaciado.e8 },
  nota: { fontSize: tipografia.micro, color: c.textSecondary, lineHeight: 16, marginTop: espaciado.e2 },
  filaContadores: { flexDirection: 'row', gap: espaciado.e8 },
  contador: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e4 / 2,
    borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e4,
  },
  cifraContador: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  etiquetaContador: { fontSize: tipografia.micro, color: c.textSecondary, textAlign: 'center' },
  alarma: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8,
  },
  textoAlarma: { flex: 1, fontSize: tipografia.caption, fontWeight: peso.medio, lineHeight: 17 },
  filaProducto: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingVertical: espaciado.e8, borderBottomWidth: trazo.fino,
  },
  nombreProducto: { fontSize: tipografia.body, fontWeight: peso.fuerte, color: c.textPrimary },
  sello: { fontSize: tipografia.micro, fontWeight: peso.titulo },
});
