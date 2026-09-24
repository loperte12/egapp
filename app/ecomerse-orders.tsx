/**
 * EcomerseOrdersScreen — Mis pedidos (compras/ventas).
 * v3 (auditoría completa): rol por TOKEN (sin ?as autorizante), toggle
 * Compras/Ventas, actividad y envío embebidos (sin N+1), estados SIEMPRE en
 * español, timeline correcto, desglose con precio ×cantidad y total naranja,
 * garantía condicional (cash = mediación; billing = garantía 7d), disputa solo
 * dentro de la ventana, review con 5 estrellas, lock contra doble tap, SafeArea.
 * Ruta: /ecomerse-orders?as=buyer|seller
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageSearch, ShieldCheck, Star, Truck } from 'lucide-react-native';
import { alpha, EmptyState, espaciado, EstadoDinero, GhostButton, ilustracion, Precio, radios, ScreenHeader, Sheet, tipografia, type EtapaDinero, useTheme } from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseOrder } from '../api/ecomerse';
import { formatXAF } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';
/* Las cuatro secciones del comprador viven en un módulo compartido porque el PERFIL pinta las
   mismas: rótulo, estado y contador salen de un solo sitio para que no puedan divergir. */
import {
  buscarSeccion, PAGINA_VALORAR, traerEntregadosSinResena,
  type EntregadosSinResena, type SeccionId,
} from '../components/ecomerse/seccionesCompra';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: brand.warning },
  confirmed: { label: 'Confirmado', color: brand.info },
  in_transit: { label: 'En tránsito', color: brand.info },
  delivered: { label: 'Entregado', color: brand.success },
  cancelled: { label: 'Cancelado', color: brand.neutral },
  disputed: { label: 'En disputa', color: brand.danger },
  assigned: { label: 'Asignado', color: brand.info },
  picked_up: { label: 'Recogido', color: brand.info },
  paused: { label: 'Pausado', color: brand.neutral },
};
const labelOf = (c: string) => STATUS_LABEL[c]?.label ?? 'Actualizado';
const colorOf = (c: string) => STATUS_LABEL[c]?.color ?? brand.neutral;

/** Cómo se llama cada forma de pago. Antes esto era `paymentMethod === 'cash' ? 'Efectivo' : 'Billing'`:
 *  cualquier cosa que no fuera efectivo se pintaba como «Billing», así que un pedido pagado con el
 *  MONEDERO —el único cuyo dinero la plataforma retiene— se mostraba como una transferencia. */
const PAGO_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  billing: 'Billing · transferencia',
  likebook_wallet: 'Monedero',
};
const pagoLabel = (m: string) => PAGO_LABEL[m] ?? 'Billing · transferencia';

/** ¿El dinero de este pedido pasó por la plataforma? Solo el monedero lo hace. */
const esMonedero = (m: string) => m === 'likebook_wallet';

/**
 * DÓNDE ESTÁ EL DINERO de este pedido, según su estado real. No es lo mismo que el estado del
 * pedido: el pedido puede estar «Entregado» y el dinero «liberado», o «En disputa» y el dinero
 * «retenido». Estas dos columnas son las que impone el backend (`ecomerse.service.ts`):
 *   · retenido  — desde que se crea hasta que se entrega o se cancela.
 *   · liberado  — al entregar (`liberarSiMonederoEc` exige status='delivered').
 *   · devuelto  — al cancelar (`devolverSiMonederoEc` exige status='cancelled').
 *   · en disputa— el cierre espera al soporte; el dinero NO se mueve mientras tanto.
 * Devuelve `null` si el pago no pasó por la plataforma: ahí no hay dinero que seguir, y decirlo
 * sería inventarse una garantía.
 */
function dineroDePedido(o: EcomerseOrder): EtapaDinero | null {
  if (!esMonedero(o.paymentMethod)) return null;
  if (o.status === 'cancelled') return 'devuelto';
  if (o.status === 'delivered') return 'entregado';
  return 'retenido';
} 


type ModalKind = 'cancel' | 'dispute' | 'review' | null;
const TIMELINE = ['pending', 'confirmed', 'in_transit', 'delivered'];

const PAGE = 20;

/**
 * FILTRO POR ESTADO (tanda B — patrón de `OmsPortalOrderController.list` de macrozheng/mall, que
 * filtra con `?status=` sobre cinco estados).
 *
 * Por qué: esta pantalla solo distinguía Compras/Ventas y **traía todos los pedidos sin filtrar ni
 * paginar**. Con veinte pedidos había que recorrerlos a mano.
 *
 * ── FASE 1 DEL PIE (22-sep-2026): las cuatro secciones del COMPRADOR ────────────────────────────
 * El perfil del Mercado manda aquí sus cuatro secciones —待付款 · 打包中 · 待收货 · 评价—, que son
 * las de la referencia (Pinduoduo, imágenes #4 y #6 de las capturas). Eso obliga a que la fila de
 * chips dependa del PAPEL, porque el vendedor no pregunta lo mismo que el comprador:
 *
 *   COMPRADOR   Todos · Por pagar · En preparación · En camino · Por valorar · En disputa
 *   VENDEDOR    Todos · Pendientes · En camino · Entregados · En disputa · Cancelados
 *
 * Las dos filas siguen teniendo SEIS chips, las mismas que había antes de esta fase: la del
 * comprador no crece, sólo cambia de preguntas.
 *
 * DOS DECISIONES QUE CONVIENE NO REABRIR SIN LEERLAS:
 *
 *  1. **`camino` significa cosas distintas en cada papel, así que el comprador NO lo usa.** Para el
 *     vendedor es `confirmed+in_transit` («lo tengo entre manos y va hacia el comprador») y se
 *     queda exactamente como estaba, porque la portada del comerciante lo empuja desde fuera
 *     (`/tienda/pedidos?filtro=camino`) y ese contrato no se toca. Para el comprador, en cambio,
 *     待收货 es SÓLO `in_transit`: `confirmed` ya tiene sección propia (打包中). Reutilizar el id
 *     con dos significados habría hecho que el chip mintiera en silencio, que es la peor forma de
 *     romperse, así que el comprador tiene su propio id: **`enviado`**.
 *
 *  2. **`entregado` y `cancelado` salen de la fila del comprador, y no se pierde nada.** Siguen
 *     alcanzables en «Todos», que es justo lo que hace la referencia (su 我的订单 no tiene pestaña
 *     de entregados ni de cancelados), y el comentario de arriba ya decía que «Cancelado no se
 *     busca, se encuentra». El vendedor los conserva porque su portada los empuja. «En disputa» sí
 *     se queda en las dos filas: es lo único con dinero parado y hay que poder llegar en un toque.
 */
type Rol = 'buyer' | 'seller';
/** Los cuatro del comprador vienen del módulo compartido con el perfil; los demás son de esta fila. */
type FiltroId = SeccionId | 'todos' | 'camino' | 'entregado' | 'disputado' | 'cancelado';

interface FiltroDef {
  id: FiltroId;
  /** Lo que dice el chip para el comprador. */
  label: string;
  /** Cómo lo llama el vendedor, cuando lo llama de otra forma. */
  labelVendedor?: string;
  estados?: string[];
  roles: Rol[];
  /** `valorar` (评价): de los entregados, sólo los que todavía no tienen reseña. */
  sinResena?: boolean;
}

/**
 * Un chip a partir de una sección COMPARTIDA. Existe para que el rótulo y el estado estén escritos
 * una sola vez: el perfil pinta las mismas cuatro secciones leyendo `SECCIONES_COMPRA`, y si aquí se
 * volvieran a escribir a mano, un día dirían cosas distintas.
 */
const comoFiltro = (id: SeccionId, roles: Rol[], labelVendedor?: string): FiltroDef => {
  const s = buscarSeccion(id)!;
  return { id: s.id, label: s.label, labelVendedor, estados: [...s.estados], sinResena: s.sinResena, roles };
};

const FILTROS: FiltroDef[] = [
  { id: 'todos', label: 'Todos', roles: ['buyer', 'seller'] },
  comoFiltro('pendiente', ['buyer', 'seller'], 'Pendientes'),
  comoFiltro('preparando', ['buyer']),
  comoFiltro('enviado', ['buyer']),
  comoFiltro('valorar', ['buyer']),
  { id: 'camino', label: 'En camino', estados: ['confirmed', 'in_transit'], roles: ['seller'] },
  { id: 'entregado', label: 'Entregados', estados: ['delivered'], roles: ['seller'] },
  { id: 'disputado', label: 'En disputa', estados: ['disputed'], roles: ['buyer', 'seller'] },
  { id: 'cancelado', label: 'Cancelados', estados: ['cancelled'], roles: ['seller'] },
];

/** Los chips que le tocan a un papel, en orden. */
const filtrosDe = (rol: Rol) => FILTROS.filter((f) => f.roles.includes(rol));

/** El nombre del chip según quién mira: el comprador «Por pagar», el vendedor «Pendientes». */
const etiqueta = (f: FiltroDef, rol: Rol) => (rol === 'seller' ? f.labelVendedor ?? f.label : f.label);

/**
 * El filtro que pide la URL, PERO sólo si le toca a este papel. Devolver el de otro papel haría
 * que el chip activo no existiera en la fila —un filtro aplicado que no se ve—, así que un id
 * ajeno se trata como si no hubiera llegado.
 */
const buscaFiltro = (id: string | undefined, rol: Rol) => filtrosDe(rol).find((f) => f.id === id);

/**
 * El servidor filtra por UN estado, así que los grupos de varios estados se piden por separado y se
 * juntan en el cliente. Es una decisión consciente: ampliar el backend a `status IN (...)` es un
 * cambio de contrato que no compensa para un grupo de dos estados, y así el backend sigue teniendo
 * un contrato simple. Si algún día hay muchos pedidos, se cambia.
 */
async function pedirFiltro(role: Rol, f: FiltroId, limit: number, offset: number) {
  const def = buscaFiltro(f, role);
  if (!def?.estados) {
    return ecomerseApi.myOrders(role, { limit, offset });
  }
  const partes = await Promise.all(def.estados.map((s) => ecomerseApi.myOrders(role, { status: s, limit, offset })));
  const orders = partes.flatMap((p) => p.orders).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { orders, total: partes.reduce((n, p) => n + p.total, 0), limit, offset };
}

/**
 * Props SOLO para quien la monta desde la zona del comerciante (`/tienda/pedidos`), que necesita el
 * carril de ventas ya fijado y sin el segmento. Las dos rutas comparten ESTA pantalla —no hay una
 * copia en la zona— porque duplicarla sería duplicar sus veinte arreglos de auditoría (rol por
 * token, actividad embebida, estados en español, timeline, disputa dentro de ventana, doble tap…).
 * Sin props, se comporta exactamente como antes: lee `?as`, `?filtro` y muestra el segmento.
 */
export interface EcomerseOrdersProps {
  rolInicial?: 'buyer' | 'seller';
  filtroInicial?: string;
  ocultarSegmento?: boolean;
}

export default function EcomerseOrdersScreen({ rolInicial, filtroInicial: filtroProp, ocultarSegmento: ocultarProp }: EcomerseOrdersProps = {}) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { as, filtro: filtroParam, ocultarSegmento } = useLocalSearchParams<{ as?: string; filtro?: string; ocultarSegmento?: string }>();
  /** El papel con el que arranca. Se calcula una vez y sirve también para validar el filtro. */
  const rolDeArranque: Rol = rolInicial ?? (as === 'seller' ? 'seller' : 'buyer');
  const [role, setRole] = useState<Rol>(rolDeArranque);
  /*
    Dentro de la ZONA DEL COMERCIANTE (`/tienda/pedidos`) esta pantalla llega por PROPS: rol de
    vendedor y sin segmento. Dos razones:
      · El segmento Compras/Ventas ahí no tiene sentido: quien está en su zona de vendedor no está
        «en un papel», está en su tienda. Preguntárselo es ruido.
      · Los contadores de la portada («Por enviar», «En camino»…) tienen que ABRIR ya filtrados, o
        son números decorativos.
    Los parámetros de URL siguen funcionando para el caso suelto (`?as=seller&filtro=pendiente`).
  */
  const filtroPedido = filtroProp ?? filtroParam;
  const [filtro, setFiltro] = useState<FiltroId>(buscaFiltro(filtroPedido, rolDeArranque)?.id ?? 'todos');
  const enZona = ocultarProp === true || ocultarSegmento === '1';

  /**
   * Cambiar de papel cambia de PREGUNTAS, no sólo de lista: «Por valorar» no existe en la fila del
   * vendedor. Si al cambiar de segmento se quedara puesto un filtro del otro papel, la lista saldría
   * filtrada por algo que no se ve en pantalla —el mismo fallo que un contador que no filtra—, así
   * que un filtro que no le toca al papel nuevo vuelve a «Todos».
   */
  const cambiarRol = (r: Rol) => {
    setRole(r);
    setFiltro((f) => (buscaFiltro(f, r) ? f : 'todos'));
  };

  /**
   * Si el filtro llega por parámetro DESPUÉS de montada (los contadores de la portada empujan a esta
   * misma ruta con `?filtro=`), el `useState` de arriba ya no lo recogería: el estado inicial solo se
   * evalúa al montar. Sin esto, pulsar «Por enviar» estando ya en Pedidos no cambiaría nada —un
   * contador que no filtra es un número decorativo, justo lo que el plan quiere evitar.
   * Se comprueba contra el papel: un filtro del comprador llegado por URL no activa nada en ventas.
   */
  useEffect(() => {
    const d = buscaFiltro(filtroPedido, role);
    if (d) setFiltro(d.id);
  }, [filtroPedido, role]);

  const [orders, setOrders] = useState<EcomerseOrder[]>([]);
  const [total, setTotal] = useState(0);
  /** Pedidos por estado, para los contadores de los chips. Una sola consulta agrupada. */
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalTodos, setTotalTodos] = useState(0);
  /**
   * Los entregados sin reseña (评价). Se guardan los PEDIDOS y no sólo el número porque el mismo
   * viaje sirve para las dos cosas: el contador del chip y la lista cuando ese es el filtro activo.
   */
  const [sinResena, setSinResena] = useState<EntregadosSinResena | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalOrder, setModalOrder] = useState<EcomerseOrder | null>(null);
  const [modalText, setModalText] = useState('');
  const [rating, setRating] = useState(0);
  const [modalBusy, setModalBusy] = useState(false);
  const modalBusyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* LAS TRES PREGUNTAS VAN A LA VEZ. Antes eran dos llamadas encadenadas (lista y contadores);
         ahora son tres en paralelo, y el «Por valorar» se mide UNA sola vez por carga porque sirve
         para dos cosas: el contador del chip y —si ese es el filtro activo— la propia lista.
         Sólo lo pide el comprador: es el único que valora y el único con esa sección. */
      const [r, c, v] = await Promise.all([
        filtro === 'valorar' ? Promise.resolve(null) : pedirFiltro(role, filtro, PAGE, 0),
        ecomerseApi.orderCounts(role),
        role === 'buyer' ? traerEntregadosSinResena() : Promise.resolve(null),
      ]);
      setSinResena(v);
      /* Con «Por valorar» como filtro activo, la lista ES lo que ya se trajo para contar. NO pagina:
         `myOrders` acota a 100 por llamada y filtrar en el cliente DESPUÉS de paginar descuadraría
         el «quedan N» del botón de ver más. Por eso el total es lo que se ve, y el botón no sale. */
      if (filtro === 'valorar') {
        setOrders(v?.orders ?? []);
        setTotal(v?.orders.length ?? 0);
      } else {
        setOrders(r!.orders);
        setTotal(r!.total);
      }
      /* Los contadores de los chips se refrescan con la lista: si un pedido cambia de estado, el
         número tiene que cambiar a la vez, o las pestañas mentirían. */
      setCounts(c.porEstado);
      setTotalTodos(c.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar tus pedidos. Revisa la conexión.');
    } finally {
      setLoading(false);
    }
  }, [role, filtro]);
  useEffect(() => { load(); }, [load]);

  /**
   * Una página del filtro activo, por el MISMO camino que la carga inicial. Existe porque
   * «Por valorar» no lo filtra el servidor —`reviewed` no es un estado— y ir por `pedirFiltro`
   * traería entregados ya valorados: la lista se contradiría con su propio contador, que es la
   * forma más silenciosa de mentir que tiene una pantalla.
   */
  const traerPagina = async (offset: number) => {
    if (filtro === 'valorar') {
      const v = await traerEntregadosSinResena();
      setSinResena(v);
      return { orders: v.orders, total: v.orders.length };
    }
    const r = await pedirFiltro(role, filtro, PAGE, offset);
    return { orders: r.orders, total: r.total };
  };

  /** Trae la página siguiente. El botón solo aparece si el servidor dice que hay más de los que hay. */
  const cargarMas = async () => {
    if (cargandoMas) return;
    setCargandoMas(true);
    try {
      const p = await traerPagina(orders.length);
      setOrders((prev) => [...prev, ...p.orders]);
      setTotal(p.total);
    } catch { /* se queda como estaba; el botón sigue ahí para reintentar */ }
    finally { setCargandoMas(false); }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const p = await traerPagina(0);
      setOrders(p.orders);
      setTotal(p.total);
    } catch { /* noop */ } finally { setRefreshing(false); }
  };

  const act = async (id: string, status: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = await ecomerseApi.updateStatus(id, status);
      Alert.alert('Pedido actualizado', r.message);
      await load();
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar'); }
    finally { busyRef.current = false; }
  };

  const confirmAct = (id: string, status: string, title: string, msg: string) => {
    Alert.alert(title, msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: title, onPress: () => act(id, status) },
    ]);
  };

  const advanceShipment = async (id: string, status: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { const r = await ecomerseApi.updateShipment(id, status); Alert.alert('Envío', r.message); await load(); }
    catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar'); }
    finally { busyRef.current = false; }
  };

  const openModal = (kind: Exclude<ModalKind, null>, o: EcomerseOrder) => {
    setModal(kind);
    setModalOrder(o);
    setModalText('');
    setRating(0);
  };

  const sendModal = async () => {
    if (modalBusyRef.current || !modalOrder || !modal) return;
    if (modal === 'cancel' && !modalText.trim()) { Alert.alert('Motivo', 'Escribe un motivo (breve) para cancelar.'); return; }
    if (modal === 'dispute' && modalText.trim().length < 10) { Alert.alert('Motivo', 'Describe el problema con al menos 10 caracteres.'); return; }
    if (modal === 'review' && rating < 1) { Alert.alert('Valoración', 'Toca de 1 a 5 estrellas.'); return; }
    modalBusyRef.current = true;
    setModalBusy(true);
    try {
      if (modal === 'cancel') {
        const r = await ecomerseApi.cancelOrder(modalOrder.id, modalText.trim() || 'Sin motivo');
        Alert.alert('Cancelado', r.message);
      } else if (modal === 'dispute') {
        const r = await ecomerseApi.openDispute(modalOrder.id, modalText.trim());
        Alert.alert('Disputa abierta', r.message);
      } else {
        const r = await ecomerseApi.review(modalOrder.id, rating);
        Alert.alert('Valoración', r.message);
      }
      setModal(null);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo completar');
    } finally {
      modalBusyRef.current = false;
      setModalBusy(false);
    }
  };

  const s = styles(colors);

  return (
    <View style={[stylesRoot(colors).root, { paddingTop: insets.top }]}>
      <ScreenHeader titulo={enZona ? 'Pedidos' : 'Mis pedidos'} alVolver={() => router.back()} />

      {/* Toggle Compras / Ventas — se oculta dentro de la zona del comerciante (`ocultarSegmento=1`) */}
      {!enZona && (
        <View style={s.seg}>
          <Pressable onPress={() => cambiarRol('buyer')} accessibilityRole="tab" accessibilityState={{ selected: role === 'buyer' }}
            style={[s.segBtn, role === 'buyer' && { backgroundColor: colors.primary }]}>
            <Text style={[s.segText, { color: role === 'buyer' ? brand.white : colors.textPrimary }]}>Compras</Text>
          </Pressable>
          <Pressable onPress={() => cambiarRol('seller')} accessibilityRole="tab" accessibilityState={{ selected: role === 'seller' }}
            style={[s.segBtn, role === 'seller' && { backgroundColor: colors.primary }]}>
            <Text style={[s.segText, { color: role === 'seller' ? brand.white : colors.textPrimary }]}>Ventas</Text>
          </Pressable>
        </View>
      )}

      {/* FILTRO POR ESTADO (tanda B). Va justo debajo del toggle Compras/Ventas porque son el mismo
          tipo de decisión («qué parte de mis pedidos quiero ver»), en dos niveles: primero de quién
          soy, después en qué punto está. Los chips llevan el número de pedidos en cada estado, que
          es lo que evita abrir pestañas a ciegas.

          La FILA DEPENDE DEL PAPEL (fase 1 del pie): el comprador pregunta por 待付款 · 打包中 ·
          待收货 · 评价 y el vendedor por su ciclo de trabajo. Ver la cabecera de `FILTROS`. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filtros}
        contentContainerStyle={s.filtrosContenido}
      >
        {filtrosDe(role).map((f) => {
          const on = filtro === f.id;
          /* El contador de cada grupo. «Por valorar» no sale de `counts` —el servidor agrupa por
             ESTADO y «sin reseña» no es un estado— sino del viaje propio, y puede venir saturado. */
          const n = f.sinResena ? sinResena?.n ?? 0 : f.estados ? f.estados.reduce((a, e) => a + (counts[e] ?? 0), 0) : totalTodos;
          const saturado = f.sinResena && sinResena?.truncado && n > 0;
          const cifra = n ? ` ${n}${saturado ? '+' : ''}` : '';
          const nombre = etiqueta(f, role);
          return (
            <Pressable
              key={f.id}
              onPress={() => setFiltro(f.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${nombre}${n ? `, ${saturado ? `más de ${n}` : n} pedidos` : ''}`}
              style={[s.filtroChip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
            >
              {/* `numberOfLines={1}`: sin esto, «Pendientes 8» partía en dos líneas y aplastaba el chip. */}
              <Text numberOfLines={1} style={[s.filtroText, { color: on ? brand.white : colors.textPrimary }]}>
                {nombre}{cifra}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/*
        LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes un ScrollView con .map(), que
        pinta y mantiene TODOS los pedidos en memoria. Un vendedor con historial largo se quedaba
        con la pantalla atascada.
      */}
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          /* PAGINACIÓN (tanda B): antes se traían TODOS los pedidos de golpe. Ahora vienen de 20 en
             20 y el botón solo aparece si el servidor dice que hay más de los que ya se ven. */
          orders.length < total ? (
            <Pressable
              onPress={cargarMas}
              disabled={cargandoMas}
              accessibilityRole="button"
              accessibilityLabel={`Cargar más pedidos, quedan ${total - orders.length}`}
              style={[s.masBtn, { borderColor: colors.border }]}
            >
              <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: colors.primary }}>
                {cargandoMas ? 'Cargando…' : `Ver más (quedan ${total - orders.length})`}
              </Text>
            </Pressable>
          ) : null
        }
        ListHeaderComponent={
          <>
            {error && (
              <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: espaciado.e32 }}>
                <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e8 }}>📡</Text>
                <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: colors.textPrimary }}>Algo salió mal</Text>
                <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
                <Pressable onPress={load} style={{ marginTop: espaciado.e18, backgroundColor: colors.primary, paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e11, borderRadius: radios.full }}>
                  <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>Reintentar</Text>
                </Pressable>
              </View>
            )}

            {!error && loading && orders.length === 0 && (
              <View style={{ gap: espaciado.e12 }}>
                {[0, 1].map((i) => <View key={i} style={{ height: 140, borderRadius: radios.lg, backgroundColor: colors.border, opacity: 0.5 }} />)}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !error && !loading ? (
            totalTodos > 0 && filtro !== 'todos' ? (
              /* HAY pedidos, pero ninguno en ESTE grupo. Decir «Todavía no has comprado» aquí sería
                 sencillamente falso: el comprador ha comprado, lo que pasa es que nada está en
                 «Por valorar». Y sin salida, un filtro vacío parece una pantalla rota. */
              <EmptyState
                emoji="🔎"
                titulo={`Nada en «${etiqueta(buscaFiltro(filtro, role)!, role)}»`}
                texto={`Tienes ${totalTodos} ${totalTodos === 1 ? 'pedido' : 'pedidos'}, pero ninguno en este grupo.`}
                accionLabel="Ver todos"
                onAccion={() => setFiltro('todos')}
              />
            ) : (
              <EmptyState
                emoji="📦"
                titulo={role === 'seller' ? 'Aún no tienes ventas' : 'Todavía no has comprado'}
                texto={role === 'seller'
                  ? 'Cuando alguien compre en tu tienda, el pedido aparecerá aquí con su entrega y su cobro.'
                  : 'Explora el mercado: si pagas por la app, el dinero queda en garantía hasta que recibas.'}
                accionLabel={role === 'seller' ? 'Ver mis anuncios' : 'Ir al mercado'}
                /* El rótulo decía «Ver mis productos» y el destino era `/ecomerse`, el MERCADO del
                   comprador: el botón prometía una cosa y hacía otra. Para el vendedor, sus productos
                   están en «Anuncios» de su zona. */
                onAccion={() => router.push((role === 'seller' ? '/tienda/anuncios' : '/ecomerse') as any)}
              />
            )
          ) : null
        }
        renderItem={({ item: o }) => {
          const events = o.events ?? [];
          const ship = o.shipment ?? null;
          const multi = (o.items?.length ?? 0) > 1;
          /* El único artículo, cuando el pedido es de uno solo. Aparte para poder estrechar su tipo:
             si el título enseña el suyo, la combinación de debajo tiene que ser la MISMA línea. */
          const unico = multi ? undefined : o.items?.[0];
          const warrantyMs = o.warrantyExpiresAt ? Date.parse(o.warrantyExpiresAt) : NaN;
          const warrantyOk = Number.isFinite(warrantyMs) && warrantyMs > Date.now();
          const canDispute = role === 'buyer' && o.status === 'delivered' && (o.openDisputes ?? 0) === 0 && warrantyOk;
          const canReview = role === 'buyer' && o.status === 'delivered' && !o.reviewed;
          const canCancel = ['pending', 'confirmed'].includes(o.status);
          const closed = o.status === 'cancelled' || o.status === 'disputed';
          const timelineIdx = TIMELINE.indexOf(o.status);
          return (
            <View key={o.id} style={{ backgroundColor: colors.surface, borderRadius: radios.lg, padding: espaciado.e14, marginBottom: espaciado.e12, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: tipografia.body, fontWeight: '800', color: colors.textPrimary }}>
                    {multi ? `${o.items?.length} artículos` : (unico?.title ?? 'Pedido')}
                  </Text>
                  {/* QUÉ COMBINACIÓN SE COMPRÓ. El servidor la congela con el pedido y sin pintarla el
                      comprador no sabía qué eligió ni el vendedor qué servir: «Camisa» no dice si era
                      la roja o la azul. Se pinta como en los pedidos de Life Book (`variantSnapshot`:
                      línea de apoyo, `caption`, `textSecondary`), para que la misma información se lea
                      igual en los dos mercados. */}
                  {unico?.variantName ? (
                    <Text numberOfLines={1} style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>
                      {unico.variantName}
                    </Text>
                  ) : null}
                  {multi && (o.items ?? []).slice(0, 3).map((it) => (
                    /* La clave lleva la combinación: con la Fase 4 el MISMO producto puede ir dos veces
                       en un pedido (la roja M y la roja L son dos líneas), y con solo el `productId`
                       las dos se pintaban con la misma clave. */
                    <Text key={`${it.productId}-${it.variantId ?? ''}`} numberOfLines={1} style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>
                      • {it.title}{it.variantName ? ` (${it.variantName})` : ''} ×{it.qty} · {formatXAF(it.price * it.qty)}
                    </Text>
                  ))}
                  {multi && (o.items?.length ?? 0) > 3 && (
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>… y {(o.items?.length ?? 0) - 3} más</Text>
                  )}
                </View>
                <View style={{ backgroundColor: alpha(colorOf(o.status), 0.12), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.sm }}>
                  <Text style={{ fontSize: tipografia.micro, fontWeight: '800', color: colorOf(o.status) }}>{labelOf(o.status)}</Text>
                </View>
              </View>

              {/* Desglose: total naranja + datos del servicio */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: espaciado.e6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>
                    {role === 'buyer' ? `Vendedor: ${o.sellerName ?? '—'}` : `Comprador: #${(o.buyerId || '').slice(-4)}`} · {pagoLabel(o.paymentMethod)}
                  </Text>
                  {o.deliveryAddress ? <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>📍 {o.deliveryAddress}</Text> : null}
                  {o.note ? <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>📝 {o.note}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {o.logisticsFeeXaf > 0 && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>envío {formatXAF(o.logisticsFeeXaf)}</Text>}
                  {/* El total es una FIGURA: manda la primitiva, que le pinta la unidad reducida y no
                      puede partirse. Antes era un `<Text>` a `subtitle` (16) + 900, un tamaño que no
                      era de ninguna regla sino de esta pantalla. Con el papel de «total de un
                      resumen» pasa a `lg` (20), que es el escalón que la escala tenía **sin usar**
                      para exactamente esto. Lo que no cambia: el peso (900) y el color (naranja).
                      El envío de arriba se queda como frase: va dentro de un texto («envío 300 XAF»),
                      y ahí el que manda es el formateador, no el componente. */}
                  <Precio valor={o.totalXaf} tamano="lg" />
                </View>
              </View>

              {/* Timeline (solo si no está cerrado) */}
              {!closed && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e14 }}>
                  {TIMELINE.map((stName, i) => (
                    <React.Fragment key={stName}>
                      {i > 0 && <View style={{ flex: 1, height: 2, backgroundColor: i <= timelineIdx ? brand.secondary : colors.border }} />}
                      <View style={{ width: 10, height: 10, borderRadius: radios.full, backgroundColor: i <= timelineIdx ? brand.secondary : colors.border }} />
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* DÓNDE ESTÁ EL DINERO del pedido (tanda 1 «el dinero se ve»).
                  Antes esta pantalla trataba cualquier pago que no fuera efectivo como «Billing», así
                  que un pedido pagado con el MONEDERO —el único cuyo dinero retiene la plataforma—
                  se anunciaba como «Pago en efectivo: sin reembolso por la app». Eso era falso dos
                  veces (no era efectivo, y sí hay devolución: `devolverSiMonederoEc`). Ahora:
                    · monedero → se enseña en qué punto está el dinero, con su estado real.
                    · efectivo → el aviso dice la verdad: no pasa por la app.
                    · billing → mantiene la garantía de 7 días que ya mostraba. */}
              <View style={{ marginTop: espaciado.e10 }}>
                {esMonedero(o.paymentMethod) ? (
                  <EstadoDinero
                    activo={dineroDePedido(o) ?? 'retenido'}
                    notaGarantia={o.status === 'delivered'
                      ? (warrantyOk
                          ? `Garantía de 7 días hasta el ${new Date(o.warrantyExpiresAt!).toLocaleDateString('es')}.`
                          : 'La garantía de 7 días de este pedido ha vencido.')
                      : undefined}
                  />
                ) : o.status === 'delivered' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(o.paymentMethod === 'billing' ? brand.success : brand.warning, 0.08), borderRadius: radios.sm, padding: espaciado.e8 }}>
                    <ShieldCheck size={14} color={o.paymentMethod === 'billing' ? brand.success : brand.warning} />
                    <Text style={{ fontSize: tipografia.micro, color: o.paymentMethod === 'billing' ? brand.success : brand.warning, fontWeight: '700', marginLeft: espaciado.e6, flex: 1 }}>
                      {o.paymentMethod === 'billing'
                        ? (warrantyOk ? `Garantía de 7 días hasta ${new Date(o.warrantyExpiresAt!).toLocaleDateString('es')}` : 'Garantía vencida.')
                        : 'Pago en efectivo: EG Route Plan media si hay problema (sin reembolso por la app).'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Seguimiento de envío (agente) */}
              {ship && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.primary, 0.08), borderRadius: radios.sm, padding: espaciado.e8, marginTop: espaciado.e10, flexWrap: 'wrap', gap: espaciado.e6 }}>
                  <Truck size={14} color={colors.primary} />
                  <Text style={{ fontSize: tipografia.micro, color: colors.primary, fontWeight: '700', flex: 1 }}>
                    Envío {ship.trackingCode} · {ship.agentName ?? 'agente'} · {labelOf(ship.status)}
                  </Text>
                  {role === 'seller' && (
                    <>
                      {ship.status === 'assigned' && <GhostButton title="Recogido" onPress={() => advanceShipment(o.id, 'picked_up')} />}
                      {ship.status === 'picked_up' && <GhostButton title="En tránsito" onPress={() => advanceShipment(o.id, 'in_transit')} />}
                      {ship.status === 'in_transit' && <GhostButton title="Entregado" onPress={() => advanceShipment(o.id, 'delivered')} />}
                    </>
                  )}
                </View>
              )}

              {/* Actividad (acotada) */}
              {events.length > 0 && (
                <View style={{ marginTop: espaciado.e10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: espaciado.e8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginBottom: espaciado.e4 }}>
                    <PackageSearch size={12} color={colors.textSecondary} />
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: '700' }}>ACTIVIDAD</Text>
                  </View>
                  {events.slice(0, 6).map((ev, i) => (
                    <Text key={i} style={{ fontSize: tipografia.micro, color: colors.textSecondary, lineHeight: 16 }}>
                      • {new Date(ev.createdAt).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — {labelOf(ev.toStatus)}
                      {ev.note ? ` (${ev.note})` : ''}
                    </Text>
                  ))}
                  {events.length > 6 && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>… y {events.length - 6} eventos más</Text>}
                </View>
              )}

              {/* Acciones */}
              <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12, flexWrap: 'wrap' }}>
                {role === 'seller' && o.status === 'pending' && (
                  <GhostButton title="Confirmar" onPress={() => confirmAct(o.id, 'confirmed', 'Confirmar pedido', 'Confirmas que aceptas el pedido. El comprador recibirá el aviso.')} />
                )}
                {role === 'seller' && o.status === 'confirmed' && o.fulfillmentType !== 'agent' && (
                  <GhostButton title="En tránsito" onPress={() => confirmAct(o.id, 'in_transit', 'Iniciar envío', 'Confirma que el pedido va en camino al comprador.')} />
                )}
                {role === 'seller' && o.status === 'in_transit' && o.fulfillmentType !== 'agent' && (
                  <GhostButton title="Marcar entregado" onPress={() => confirmAct(o.id, 'delivered', 'Marcar entregado', 'Confirma que entregaste el pedido. Se activa la garantía de 7 días.')} />
                )}
                {role === 'buyer' && o.status === 'in_transit' && o.fulfillmentType !== 'agent' && (
                  <GhostButton title="Confirmar entrega" onPress={() => confirmAct(o.id, 'delivered', 'Confirmar entrega', 'Confirma que recibiste el pedido. Se activa la garantía de 7 días.')} />
                )}
                {canCancel && <GhostButton title="Cancelar" onPress={() => openModal('cancel', o)} />}
                {canDispute && <GhostButton title="Disputa" onPress={() => openModal('dispute', o)} />}
                {canReview && <GhostButton title="Valorar" onPress={() => openModal('review', o)} />}
                {o.status === 'disputed' && <Text style={{ fontSize: tipografia.caption, color: colors.danger, fontWeight: '700' }}>En revisión por el administrador</Text>}
              </View>
            </View>
          );
        }}
      />

      {/*
        Cancelar / Disputa / Valorar. Era un `<Modal>` escrito a mano que ya hacía justo lo que
        hace el `Sheet` del kit —cerrar al tocar fuera, respetar el botón de atrás, atrapar el
        foco y NO cerrarse mientras trabaja—, pero a su manera. Con el `Sheet` se hereda.
      */}
      <Sheet
        visible={modal !== null}
        position="bottom"
        busy={modalBusy}
        title={modal === 'cancel' ? 'Cancelar pedido' : modal === 'dispute' ? 'Abrir disputa' : 'Valorar compra'}
        subtitle={modal === 'cancel'
          ? `El stock se restaura.${modalOrder?.paymentMethod === 'billing' ? ' Si pagaste por Billing, el admin revisará el reembolso.' : ''}`
          : modal === 'dispute' ? 'Describe el problema (mínimo 10 caracteres).' : '¿Cómo fue tu experiencia?'}
        onClose={() => setModal(null)}
      >
        {modal === 'review' ? (
          <View style={{ flexDirection: 'row', gap: espaciado.e8, justifyContent: 'center', paddingVertical: espaciado.e8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`${n} estrellas`} hitSlop={8}>
                <Star size={34} color={n <= rating ? brand.warning : colors.border} fill={n <= rating ? brand.warning : 'transparent'} />
              </Pressable>
            ))}
          </View>
        ) : (
          <TextInput
            value={modalText}
            onChangeText={setModalText}
            placeholder="Escribe aquí…"
            placeholderTextColor={colors.textSecondary}
            multiline
            accessibilityLabel={modal === 'cancel' ? 'Motivo de cancelación' : 'Motivo de la disputa'}
            style={[s.modalInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          />
        )}

        <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
          <Pressable onPress={() => { if (!modalBusyRef.current) setModal(null); }} style={[s.modalBtn, { borderWidth: 1, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={sendModal} disabled={modalBusy} accessibilityRole="button" accessibilityLabel="Enviar"
            style={[s.modalBtn, { backgroundColor: modal === 'review' ? colors.primary : colors.danger, flex: 1, opacity: modalBusy ? 0.6 : 1 }]}>
            <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>{modalBusy ? 'Enviando…' : 'Enviar'}</Text>
          </Pressable>

            </View>
      </Sheet>
    </View>
  );
}

const stylesRoot = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ root: { flex: 1, backgroundColor: c.background } });

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  seg: { flexDirection: 'row', marginHorizontal: espaciado.e16, marginTop: espaciado.e12, backgroundColor: c.surface, borderRadius: radios.md, borderWidth: 1, borderColor: c.border, padding: espaciado.e3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: espaciado.e8, borderRadius: radios.sm },
  segText: { fontSize: tipografia.body, fontWeight: '800' },
  /**
   * FILA DE CHIPS DE ESTADO (tanda B; corregida DOS veces el 18/09 tras verla en el aparato).
   *
   * Fallo 1 — los chips se aplastaban en «Ventas»: al añadir el contador («Pendientes 8») la fila
   * pasa de ~1000 a ~1340 px de ancho y el carril **comprimía** en vez de desplazar. Medido: el chip
   * caía de 105x57 a 71x24 px y el texto partía en dos líneas. Se arregló con `numberOfLines={1}`.
   *
   * Fallo 2 — al arreglarlo, la fila CRECIÓ (71 → 114 px de chip) y todo el bloque bajó ~55 px, con
   * un `minHeight` que dejaba el alto a merced del contenido. Un bloque que cambia de alto porque
   * cambia su texto es un bloque inestable, y se notaba al moverse por la pantalla.
   *
   * El arreglo definitivo es **rigidez deliberada**: alto FIJO en el carril, alto FIJO en cada chip
   * (36 px, el mismo para todos, con o sin contador) y el texto en una línea. Así la fila ocupa
   * siempre exactamente lo mismo y no se mueve ni al filtrar, ni al cambiar de pestaña, ni cuando
   * llegan datos. El texto (12 px) cabe de sobra: 36 px es más del doble.
   */
  filtros: { height: 56, flexGrow: 0 },
  filtrosContenido: { gap: espaciado.e8, paddingHorizontal: espaciado.e16, alignItems: 'center' },
  filtroChip: { height: 36, justifyContent: 'center', paddingHorizontal: espaciado.e12, borderRadius: radios.full, borderWidth: 1 },
  filtroText: { fontSize: tipografia.caption, fontWeight: '700' },
  /** Botón de «ver más»: solo aparece si quedan pedidos. */
  masBtn: { marginTop: espaciado.e14, marginHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderRadius: radios.md, borderWidth: 1, alignItems: 'center' },
  modalInput: { borderRadius: radios.md, borderWidth: 1, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, minHeight: 88, textAlignVertical: 'top', fontSize: tipografia.body },
  modalBtn: { paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e16, borderRadius: radios.md, alignItems: 'center' },
});
