/**
 * Anuncios — la pestaña donde el comerciante administra lo que vende.
 *
 * ES LA PANTALLA QUE HACE UTILIZABLE LA FASE 1
 * El 20-sep-2026 se desplegaron en el backend los DOS CARRILES (`PATCH seller/products/:id/operations`
 * y `PATCH seller/products/:id/state`). Hasta esta pantalla existían **sin nadie que los llamara**:
 * el cliente de API los declaraba y ninguna pantalla los usaba, así que «pausar» y «retirar» seguían
 * siendo imposibles desde la app. Aquí se cablean.
 *
 * LA REGLA DE LOS DOS CARRILES, EN UNA FRASE
 * *La moderación aprueba el anuncio; el comerciante administra la operación.*
 *   · RÁPIDO (esta pantalla, sin moderación): existencias · plazo · devoluciones · pausar/retirar.
 *   · MODERADO (formulario de publicación): título · fotos · precio · categoría. Ese es el que el
 *     moderador juzgó, y cambiarlo por debajo invalidaría su aprobación — por eso «Corregir» manda a
 *     `publicar?id=…` y vuelve a revisión, como debe.
 *
 * TRES HONESTIDADES QUE SE VEN EN PANTALLA
 *  1. Se pinta el estado que devuelve el SERVIDOR, no el que se pidió. Si pides «a la venta» con 0
 *     existencias, el servidor contesta `sold_out` y la fila lo dice: poner a la venta lo que no se
 *     puede entregar es peor que no venderlo.
 *  2. «Retirado» no es «borrado». El anuncio sigue existiendo (fotos, documentos, historial de ventas)
 *     y se puede deshacer: la retirada del comerciante es una decisión suya, y un toque equivocado
 *     tiene que poder deshacerse.
 *  3. Las visitas y los favoritos son **del anuncio, no de la tienda**, y se muestran por anuncio.
 *     Sumarlos y llamarlo «tráfico de mi tienda» sería inventar un número.
 *
 * CERO CONSULTAS NUEVAS
 * Todo sale de `myProducts()` (que ya devuelve `stock`, `status`, `handlingHours`, `returnsAccepted`,
 * `views` y `favoriteCount`) y de `sellerMe()` para saber si la tienda está aprobada. No hay endpoint
 * de estadísticas del vendedor y no se inventa.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  AlertTriangle, ChevronRight, Eye, Heart, ImageOff, Layers, Minus, PackagePlus, Pause, Play, Plus,
  Settings2, Trash2,
} from 'lucide-react-native';
import {
  Aviso, EmptyState, GhostButton, InlineError, PrimaryButton, Sheet, alpha, espaciado, icono,
  altura, peso, radios, tipografia, trazo, useAviso, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseProduct, type EcomerseSellerMe } from '../../api/ecomerse';
import { formatXAF } from '../../utils/formatHelpers';
import { BARRA_TIENDA_H } from '../../components/ecomerse/BarraTienda';

/** Plazos de preparación que admite el servidor (`handlingHours`). Cerrado a propósito: es una
 *  promesa al comprador, no un número libre. */
const PLAZOS = [24, 48, 72] as const;

/**
 * El vocabulario de estados, con el color de cada uno.
 * `paused` y `removed` aparecen aquí porque desde el 20-sep-2026 **existen de verdad**: hasta ese día
 * `paused` era una etiqueta muerta (la app la traducía y ninguna ruta podía escribirla).
 */
const ESTADOS: Record<string, { label: string; tono: 'bien' | 'aviso' | 'peligro' | 'neutro' }> = {
  active: { label: 'A la venta', tono: 'bien' },
  sold_out: { label: 'Agotado', tono: 'aviso' },
  paused: { label: 'Pausado', tono: 'neutro' },
  pending: { label: 'En revisión', tono: 'neutro' },
  draft: { label: 'Borrador', tono: 'neutro' },
  rejected: { label: 'Rechazado', tono: 'peligro' },
  removed: { label: 'Retirado', tono: 'peligro' },
};

/**
 * Los filtros. Cada uno es un ESTADO ACCIONABLE, no una métrica: el comerciante entra a «Agotados»
 * cuando va a reponer, no a mirar. Un filtro vacío no se pinta (ver `visibles`) — es la misma regla
 * que ya se aplicó al Mercado: una pestaña vacía es peor que una pestaña ausente.
 */
const FILTROS: Array<{ id: string; label: string; acepta: (p: EcomerseProduct) => boolean }> = [
  { id: 'todos', label: 'Todos', acepta: () => true },
  { id: 'venta', label: 'A la venta', acepta: (p) => p.status === 'active' && p.stock > 0 },
  { id: 'agotados', label: 'Agotados', acepta: (p) => p.status === 'sold_out' || (p.status === 'active' && p.stock <= 0) },
  { id: 'pausados', label: 'Pausados', acepta: (p) => p.status === 'paused' },
  { id: 'revision', label: 'Sin aprobar', acepta: (p) => p.status === 'pending' || p.status === 'draft' },
  { id: 'rechazados', label: 'Rechazados', acepta: (p) => p.status === 'rejected' },
  { id: 'retirados', label: 'Retirados', acepta: (p) => p.status === 'removed' },
];

export default function TiendaAnuncios() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [aviso, mostrarAviso, ocultarAviso] = useAviso();

  const [me, setMe] = useState<EcomerseSellerMe | null>(null);
  const [productos, setProductos] = useState<EcomerseProduct[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todos');
  /** Id del anuncio con una operación en vuelo: bloquea SUS botones, no los de los demás. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [enGestion, setEnGestion] = useState<EcomerseProduct | null>(null);

  /**
   * EL ALTO DEL CONTENIDO DE LA HOJA, Y POR QUÉ SE CALCULA.
   *
   * `Sheet` topa la hoja al **80 % de la pantalla** (`hojaAbajo.maxHeight`), pero el tope es de la
   * hoja, no de lo de dentro: **no scrollea sola**, y lo que desborda se pierde. Con la sección de
   * combinaciones (fase 4) el contenido pasó de ese 80 % y lo que quedó fuera fue el tramo final
   * —«Corregir anuncio» y las devoluciones—, o sea funciones que dejan de existir sin que nada lo
   * diga. Se mide: sobre 616 dp de pantalla, la hoja dispone de 493 dp y el cromo fijo de arriba
   * (relleno 20 + título y subtítulo 58 + relleno inferior 22) se come ~100, así que la lista se
   * queda en `altoPantalla × 0,8 − 110`. El mismo cálculo que usa el selector de variante.
   */
  const { height: altoPantalla } = useWindowDimensions();
  const altoHoja = Math.max(200, Math.round(altoPantalla * 0.8) - 110);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError(null);
    try {
      /* `sellerMe` trae la tienda Y sus anuncios; `myProducts` es la lista que administramos. Se
         piden las dos porque la primera dice si la tienda está aprobada (y sin aprobación el carril
         rápido responde 400) y la segunda es la fuente de verdad de la lista. */
      const [m, p] = await Promise.all([ecomerseApi.sellerMe(), ecomerseApi.myProducts()]);
      setMe(m);
      setProductos(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar tus anuncios. Revisa la conexión.');
    } finally {
      setCargando(false); setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const s = estilos(colors);
  const seller = me?.seller;
  const activa = seller?.status === 'active';

  /**
   * Aplica lo que devolvió el SERVIDOR sobre la lista local. No se adivina el estado nuevo: se copia
   * el que el servidor calculó (`sold_out` cuando pediste `active` con stock 0, por ejemplo).
   */
  const aplicarServidor = useCallback((
    id: string,
    r: { stock: number; status: string; handlingHours?: number; returnsAccepted?: boolean },
  ) => {
    setProductos((prev) => prev.map((p) => (p.id === id
      ? {
        ...p,
        stock: r.stock,
        status: r.status,
        handlingHours: r.handlingHours ?? p.handlingHours,
        returnsAccepted: r.returnsAccepted ?? p.returnsAccepted,
      }
      : p)));
    setEnGestion((g) => (g && g.id === id
      ? { ...g, stock: r.stock, status: r.status, handlingHours: r.handlingHours ?? g.handlingHours, returnsAccepted: r.returnsAccepted ?? g.returnsAccepted }
      : g));
  }, []);

  /** Un solo sitio para las llamadas del carril rápido: pone el «en vuelo», avisa y recarga el error. */
  const llamarRapido = useCallback(async (
    p: EcomerseProduct,
    fn: () => Promise<{ message: string; producto: { stock: number; status: string; handlingHours?: number; returnsAccepted?: boolean } }>,
  ) => {
    setOcupado(p.id);
    try {
      const r = await fn();
      aplicarServidor(p.id, r.producto);
      mostrarAviso(r.message, 'exito');
      return true;
    } catch (e) {
      /* El servidor explica qué pasa («Tu negocio está en revisión…», «Este anuncio está retirado…»).
         Se enseña tal cual: es más útil que un «error» genérico. */
      mostrarAviso(e instanceof Error ? e.message : 'No se pudo completar el cambio', 'aviso');
      return false;
    } finally {
      setOcupado(null);
    }
  }, [aplicarServidor, mostrarAviso]);

  const cambiarStock = useCallback((p: EcomerseProduct, delta: number) => {
    const nuevo = Math.max(0, p.stock + delta);
    if (nuevo === p.stock) return;
    /* Optimista: la cifra cambia al toque porque el servidor puede tardar y reponer existencias es
       una acción de dedo. Si falla, se vuelve a pedir la lista y se dice por qué. */
    setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock: nuevo } : x)));
    void llamarRapido(p, () => ecomerseApi.updateProductOperations(p.id, { stock: nuevo }))
      .then((ok) => { if (!ok) void cargar(true); });
  }, [cargar, llamarRapido]);

  const cambiarEstado = useCallback((p: EcomerseProduct, estado: 'active' | 'paused' | 'removed') => {
    void llamarRapido(p, () => ecomerseApi.updateProductState(p.id, estado));
  }, [llamarRapido]);

  const cambiarPlazo = useCallback((p: EcomerseProduct, horas: 24 | 48 | 72) => {
    void llamarRapido(p, () => ecomerseApi.updateProductOperations(p.id, { handlingHours: horas }));
  }, [llamarRapido]);

  const cambiarDevoluciones = useCallback((p: EcomerseProduct, valor: boolean) => {
    void llamarRapido(p, () => ecomerseApi.updateProductOperations(p.id, { returnsAccepted: valor }));
  }, [llamarRapido]);

  /**
   * Abrir el editor de ejes y combinaciones (fase 4).
   *
   * Se cierra la hoja ANTES de navegar, igual que hace «Corregir anuncio»: si se dejara abierta,
   * al volver de la pantalla el comerciante se encontraría un diálogo por encima de la lista que él
   * ya no había pedido.
   */
  const abrirCombinaciones = useCallback((p: EcomerseProduct) => {
    setEnGestion(null);
    router.push(`/tienda/combinaciones?id=${p.id}` as never);
  }, [router]);

  /* Cuántos anuncios hay en cada filtro. Se calcula sobre `FILTROS` para que el chip y el recuento
     no puedan desincronizarse. */
  const recuentos = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, productos.filter(f.acepta).length])),
    [productos],
  );
  const visibles = useMemo(() => FILTROS.filter((f) => f.id === 'todos' || recuentos[f.id] > 0), [recuentos]);
  const lista = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro) ?? FILTROS[0];
    return productos.filter(f.acepta);
  }, [productos, filtro]);

  /* ── Estados de pantalla ───────────────────────────────────────────────────────────────────── */

  if (cargando) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        <Cabecera titulo="Anuncios" onPublicar={() => router.push('/tienda/publicar' as never)} colors={colors} />
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          {[0, 1, 2, 3].map((i) => <View key={i} style={[s.hueso, { backgroundColor: colors.border }]} />)}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        <Cabecera titulo="Anuncios" onPublicar={() => router.push('/tienda/publicar' as never)} colors={colors} />
        <View style={{ padding: espaciado.e16 }}>
          <InlineError mensaje={error} onReintentar={() => cargar()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.raiz, { paddingTop: insets.top }]}>
      <Cabecera
        titulo="Anuncios"
        subtitulo={productos.length === 0 ? undefined : `${productos.length} ${productos.length === 1 ? 'anuncio' : 'anuncios'}`}
        onPublicar={() => router.push('/tienda/publicar' as never)}
        colors={colors}
      />

      <ScrollView
        contentContainerStyle={{
          padding: espaciado.e16,
          /* La barra de la zona vive FUERA del Stack (en `_layout`), así que este relleno es lo único
             que impide que el último anuncio quede debajo de ella. */
          paddingBottom: BARRA_TIENDA_H + insets.bottom + espaciado.e24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} />}
      >
        {/* Tienda no aprobada: el carril rápido responde 400, así que se dice ANTES de dejar tocar. */}
        {!activa && (
          <View style={[s.tarjeta, { backgroundColor: alpha(colors.primary, 0.06), marginBottom: espaciado.e16 }]}>
            <Text style={s.etiqueta}>{seller ? 'TU TIENDA ESTÁ EN REVISIÓN' : 'AÚN NO TIENES TIENDA'}</Text>
            <Text style={s.tituloBloque}>
              {seller ? 'Puedes ver tus anuncios, pero todavía no administrarlos' : 'Da de alta tu negocio para publicar'}
            </Text>
            <Text style={s.nota}>
              {seller
                ? 'Las existencias, la pausa y la retirada se abren cuando el administrador apruebe tu tienda (24–48 h).'
                : 'Necesitas la identidad verificada (KYC) y los datos del negocio.'}
            </Text>
            <View style={{ marginTop: espaciado.e12 }}>
              <PrimaryButton
                title={seller ? 'Ver qué falta' : 'Dar de alta mi negocio'}
                onPress={() => router.replace('/tienda' as never)}
              />
            </View>
          </View>
        )}

        {/* Filtros: solo los que tienen algo dentro. */}
        {productos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8, paddingBottom: espaciado.e12 }}>
            {visibles.map((f) => {
              const on = filtro === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFiltro(f.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${f.label}: ${recuentos[f.id]} ${recuentos[f.id] === 1 ? 'anuncio' : 'anuncios'}`}
                  style={({ pressed }) => [s.chip, {
                    backgroundColor: on ? colors.primary : colors.card,
                    borderColor: on ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <Text style={[s.chipTexto, { color: on ? colors.white : colors.textPrimary }]}>
                    {f.label} · {recuentos[f.id]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Vacíos distintos: «no tengo nada» no es lo mismo que «este filtro no tiene nada». */}
        {productos.length === 0 ? (
          activa ? (
            <EmptyState
              emoji="📦"
              titulo="Todavía no has publicado"
              texto="Publica tu primer anuncio y aparecerá en el Mercado con el nombre de tu tienda."
              accionLabel="Publicar mi primer producto"
              accionPrimaria
              onAccion={() => router.push('/tienda/publicar' as never)}
            />
          ) : (
            <EmptyState
              emoji="📦"
              titulo="Sin anuncios"
              texto="Cuando tu tienda esté aprobada podrás publicar y administrar tus anuncios desde aquí."
            />
          )
        ) : lista.length === 0 ? (
          <View style={{ paddingVertical: espaciado.e32, alignItems: 'center', gap: espaciado.e8 }}>
            <Text style={s.nota}>No hay anuncios en «{FILTROS.find((f) => f.id === filtro)?.label}».</Text>
            <GhostButton title="Ver todos" onPress={() => setFiltro('todos')} />
          </View>
        ) : (
          lista.map((p) => (
            <FilaAnuncio
              key={p.id}
              producto={p}
              activa={!!activa}
              ocupado={ocupado === p.id}
              onStock={(d) => cambiarStock(p, d)}
              onGestionar={() => setEnGestion(p)}
              onCorregir={() => router.push(`/tienda/publicar?id=${p.id}` as never)}
              onCombinaciones={() => abrirCombinaciones(p)}
              colors={colors}
            />
          ))
        )}

        {/* Recordatorio del alcance del carril rápido, al pie y solo una vez. */}
        {productos.length > 0 && activa && (
          <Text style={[s.nota, { marginTop: espaciado.e16 }]}>
            Existencias, plazo, devoluciones y combinaciones se cambian aquí y **no** pasan por revisión. Para
            el título, las fotos o el precio, «Corregir anuncio»: eso sí vuelve al administrador.
          </Text>
        )}
      </ScrollView>

      <Aviso visible={aviso.visible} mensaje={aviso.mensaje} tono={aviso.tono} onOcultar={ocultarAviso} />

      {/* ── Hoja de gestión: el resto del carril rápido, sin salir de la lista ─────────────────── */}
      <Sheet
        visible={enGestion !== null}
        title={enGestion?.title ?? ''}
        subtitle={enGestion ? ESTADOS[enGestion.status]?.label ?? enGestion.status : undefined}
        position="bottom"
        busy={ocupado !== null}
        onClose={() => setEnGestion(null)}
      >
        {enGestion && (
          /* La lista SCROLLEA, y tiene que hacerlo: `Sheet` no lo hace sola y con la sección de
             combinaciones el contenido ya pasa del 80 % que topa la hoja. Ver `altoHoja`. */
          <ScrollView
            style={{ maxHeight: altoHoja }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: espaciado.e16 }}
          >
            {/* 1 · Visibilidad */}
            <View>
              <Text style={s.etiqueta}>VISIBILIDAD EN EL MERCADO</Text>
              <Text style={s.nota}>
                Pausar lo esconde del catálogo sin perder nada; volver a la venta lo devuelve tal cual.
                Retirar tampoco borra: fotos, documentación y el historial de ventas siguen ahí.
              </Text>
              <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12, flexWrap: 'wrap' }}>
                {enGestion.status !== 'active' && (
                  <AccionHoja
                    Icono={Play}
                    label={enGestion.stock > 0 ? 'Volver a la venta' : 'Poner a la venta'}
                    onPress={() => cambiarEstado(enGestion, 'active')}
                    colors={colors}
                  />
                )}
                {enGestion.status !== 'paused' && (
                  <AccionHoja Icono={Pause} label="Pausar" onPress={() => cambiarEstado(enGestion, 'paused')} colors={colors} />
                )}
                {enGestion.status !== 'removed' && (
                  <AccionHoja Icono={Trash2} label="Retirar" tono={colors.danger} onPress={() => cambiarEstado(enGestion, 'removed')} colors={colors} />
                )}
              </View>
              {enGestion.status === 'active' && enGestion.stock <= 0 && (
                <Text style={[s.nota, { color: colors.warning }]}>
                  Está a la venta sin existencias: el catálogo lo enseña como agotado.
                </Text>
              )}
            </View>

            {/* 2 · Existencias — o el porqué de que aquí no se toquen (fase 4) */}
            {enGestion.status !== 'removed' && ((enGestion.variantCount ?? 0) > 0 ? (
              /* CON COMBINACIONES, LAS EXISTENCIAS NO SE ESCRIBEN AQUÍ. El servidor lo rechaza —«sus
                 existencias son la suma de ellas»— porque el anuncio es un ESPEJO de la suma: dejarlo
                 escribir a mano crearía dos verdades y la tarjeta del Mercado anunciaría unidades que
                 no existen. Se explica y se lleva al sitio donde sí se cambia. */
              <View>
                <Text style={s.etiqueta}>EXISTENCIAS</Text>
                <Text style={s.nota}>
                  No se cambian desde aquí: este anuncio se vende por combinaciones
                  ({enGestion.variantCount}) y su stock es la <Text style={{ fontWeight: peso.titulo, color: colors.textPrimary }}>suma</Text> de
                  ellas —{enGestion.stock} ahora mismo—. La suma la hace el servidor solo; aquí no se escribe.
                </Text>
              </View>
            ) : (
              <View>
                <Text style={s.etiqueta}>EXISTENCIAS</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, marginTop: espaciado.e8 }}>
                  <BotonPaso Icono={Minus} deshabilitado={ocupado !== null || enGestion.stock <= 0} onPress={() => cambiarStock(enGestion, -1)} colors={colors} etiqueta="Quitar una unidad" />
                  <Text style={s.cifraStock}>{enGestion.stock}</Text>
                  <BotonPaso Icono={Plus} deshabilitado={ocupado !== null} onPress={() => cambiarStock(enGestion, 1)} colors={colors} etiqueta="Añadir una unidad" />
                  <Text style={[s.nota, { flex: 1 }]}>
                    {enGestion.stock === 0 ? 'Con 0 el anuncio queda agotado y sale del catálogo.' : 'Las unidades se descuentan solas al vender.'}
                  </Text>
                </View>
              </View>
            ))}

            {/* 3 · Las combinaciones (fase 4). Una sola puerta para los dos casos —tenerlas o no
                tenerlas—: el botón cambia de verbo, no de sitio. */}
            <View>
              <Text style={s.etiqueta}>¿EL COMPRADOR TIENE QUE ELEGIR ALGO?</Text>
              <Text style={s.nota}>
                {(enGestion.variantCount ?? 0) > 0
                  ? 'Tallas, colores, capacidad… Cada combinación con su precio y sus unidades. Se cambian sin volver a revisión: reponer una talla es cosa del día a día.'
                  : 'Si hay tallas, colores o capacidades entre las que elegir, se declaran aquí: el comprador elige antes de comprar y cada combinación lleva su precio y sus unidades. Sin combinaciones, el anuncio se compra entero, con su precio y su stock.'}
              </Text>
              <View style={{ marginTop: espaciado.e8 }}>
                <GhostButton
                  title={(enGestion.variantCount ?? 0) > 0 ? 'Editar combinaciones' : 'Añadir combinaciones'}
                  onPress={() => abrirCombinaciones(enGestion)}
                />
              </View>
            </View>

            {/* 4 · Lo que prometes al comprador: viaja CONGELADO en la línea del pedido */}
            <View>
              <Text style={s.etiqueta}>PLAZO DE PREPARACIÓN</Text>
              <Text style={s.nota}>
                Lo que tardas en entregarlo al repartidor. El comprador lo ve en su pedido tal como estaba
                el día que compró, aunque después lo cambies.
              </Text>
              <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12 }}>
                {PLAZOS.map((h) => {
                  const on = enGestion.handlingHours === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => cambiarPlazo(enGestion, h)}
                      disabled={ocupado !== null}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: ocupado !== null }}
                      accessibilityLabel={`Plazo de ${h} horas`}
                      style={[s.chip, {
                        backgroundColor: on ? colors.primary : colors.card,
                        borderColor: on ? colors.primary : colors.border,
                        opacity: ocupado !== null ? 0.5 : 1,
                      }]}
                    >
                      <Text style={[s.chipTexto, { color: on ? colors.white : colors.textPrimary }]}>{h} h</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.etiqueta}>ACEPTO DEVOLUCIONES</Text>
                  <Text style={s.nota}>
                    Es tu oferta, aparte de la garantía de 7 días de la plataforma. Si no la ofreces, se dice
                    en la ficha.
                  </Text>
                </View>
                <Switch
                  value={enGestion.returnsAccepted}
                  onValueChange={(v) => cambiarDevoluciones(enGestion, v)}
                  disabled={ocupado !== null}
                  accessibilityLabel="Acepto devoluciones"
                  trackColor={{ false: colors.border, true: alpha(colors.primary, 0.5) }}
                  thumbColor={enGestion.returnsAccepted ? colors.primary : colors.card}
                />
              </View>
            </View>

            {/* 5 · El carril moderado, para que no se confunda con lo de arriba */}
            <View style={{ borderTopWidth: trazo.fino, borderTopColor: colors.border, paddingTop: espaciado.e16 }}>
              <Text style={s.etiqueta}>CONTENIDO DEL ANUNCIO</Text>
              <Text style={s.nota}>
                Título, fotos, precio y categoría pasan por el administrador. Si cambias algo, el anuncio
                vuelve a revisión.
              </Text>
              <View style={{ marginTop: espaciado.e8 }}>
                <GhostButton title="Corregir anuncio (vuelve a revisión)" onPress={() => {
                  const id = enGestion.id;
                  setEnGestion(null);
                  router.push(`/tienda/publicar?id=${id}` as never);
                }} />
              </View>
            </View>
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

/* ── Piezas ───────────────────────────────────────────────────────────────────────────────────── */

function Cabecera({ titulo, subtitulo, onPublicar, colors }: {
  titulo: string; subtitulo?: string; onPublicar: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e16,
      paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino, borderBottomColor: colors.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tipografia.title, fontWeight: peso.titulo, color: colors.textPrimary }}>{titulo}</Text>
        {subtitulo ? <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: 2 }}>{subtitulo}</Text> : null}
      </View>
      <Pressable
        onPress={onPublicar}
        accessibilityRole="button"
        accessibilityLabel="Publicar un anuncio nuevo"
        hitSlop={espaciado.e8}
        style={({ pressed }) => [{
          width: 40, height: 40, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1,
        }]}
      >
        <PackagePlus size={icono.sm} color={colors.white} />
      </Pressable>
    </View>
  );
}

/** Un renglón de la lista: foto, qué es, cómo está, existencias y la puerta a la hoja. */
function FilaAnuncio({ producto, activa, ocupado, onStock, onGestionar, onCorregir, onCombinaciones, colors }: {
  producto: EcomerseProduct;
  activa: boolean;
  ocupado: boolean;
  onStock: (delta: number) => void;
  onGestionar: () => void;
  onCorregir: () => void;
  /** Abre el editor de ejes y combinaciones (fase 4). */
  onCombinaciones: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const s = estilos(colors);
  const foto = producto.photos?.[0] ?? null;
  const estado = ESTADOS[producto.status] ?? { label: producto.status, tono: 'neutro' as const };
  const tono = estado.tono === 'bien' ? colors.success
    : estado.tono === 'aviso' ? colors.warning
      : estado.tono === 'peligro' ? colors.danger
        : colors.textSecondary;
  const retirado = producto.status === 'removed';
  /* Los tres estados que el carril rápido NO puede activar (la moderación manda): su salida es
     «Corregir», no un botón de «activar» que el servidor iba a rechazar. */
  const sinAprobar = producto.status === 'pending' || producto.status === 'draft' || producto.status === 'rejected';
  /**
   * Cuántas combinaciones tiene (fase 4). Lo manda `myProducts` como `variantCount`, así que se sabe
   * SIN abrir el anuncio —y eso es lo que permite que la fila cambie de forma, en vez de ofrecer un
   * +1 de existencias que el servidor va a rechazar.
   */
  const combinaciones = producto.variantCount ?? 0;

  return (
    <View style={[s.fila, { borderBottomColor: colors.border }]}>
      <Pressable
        onPress={onGestionar}
        accessibilityRole="button"
        accessibilityLabel={`${producto.title}. ${estado.label}. ${producto.stock} en existencias. Abre la gestión del anuncio.`}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: espaciado.e12, opacity: pressed ? 0.7 : 1 }]}
      >
        {foto ? (
          <Image source={{ uri: foto }} style={[s.miniatura, { backgroundColor: colors.border }]} contentFit="cover" />
        ) : (
          <View style={[s.miniatura, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
            <ImageOff size={icono.sm} color={colors.textSecondary} />
          </View>
        )}

        <View style={{ flex: 1, justifyContent: 'center', gap: 2 }}>
          <Text style={s.nombre} numberOfLines={1}>{producto.title}</Text>
          {/* El importe va DENTRO de una frase → `formatXAF` suelto, no `Precio`: `Precio` devuelve
              una View y meter una caja dentro de una frase rompe su ajuste de línea
              (doctrina «figura o frase», FASE-2-PRECIO.md).
              Con combinaciones se dice CUÁNTAS en vez de las existencias: el stock del anuncio es
              su suma y no es lo que el comerciante viene a mirar aquí (eso está por talla, en su
              editor). Sin combinaciones se dice lo de siempre. */}
          <Text style={s.meta} numberOfLines={1}>
            {formatXAF(producto.priceXaf)} · {combinaciones > 0
              ? `${combinaciones} ${combinaciones === 1 ? 'combinación' : 'combinaciones'}`
              : `${producto.stock} en existencias`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, flexWrap: 'wrap' }}>
            <Text style={[s.sello, { color: tono }]}>{estado.label}</Text>
            {/* Visitas y favoritos son DEL ANUNCIO. Se pintan aquí, uno a uno, para no poder sumarlos
                y llamarlos «tráfico de la tienda». */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Eye size={icono.micro} color={colors.textSecondary} />
              <Text style={s.meta}>{producto.views ?? 0}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Heart size={icono.micro} color={colors.textSecondary} />
              <Text style={s.meta}>{producto.favoriteCount ?? 0}</Text>
            </View>
            {producto.isFeatured && <Text style={[s.sello, { color: colors.primary }]}>Destacado</Text>}
          </View>
        </View>
      </Pressable>

      {/* Acciones del carril rápido, en la propia fila: reponer es la operación más repetida del día
          y no merece abrir una hoja. Solo con tienda aprobada y anuncio no retirado. */}
      {activa && !retirado && (
        <View style={{ alignItems: 'center', gap: espaciado.e4 }}>
          {sinAprobar ? (
            <Pressable
              onPress={onCorregir}
              accessibilityRole="button"
              accessibilityLabel={`Corregir ${producto.title}: vuelve a revisión`}
              style={({ pressed }) => [s.enlace, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[s.sello, { color: colors.primary }]}>Corregir</Text>
            </Pressable>
          ) : combinaciones > 0 ? (
            /* CON COMBINACIONES NO HAY ± DE EXISTENCIAS, y no es una preferencia de diseño: el
               servidor **rechaza** escribir `stock` en un anuncio que se vende por combinaciones
               («sus existencias son la suma de ellas. Cambia las de cada combinación»). Dejar los
               botones ahí sería ofrecer un toque que contesta con un error. En su lugar va la puerta
               al editor, que es donde eso se cambia de verdad: por talla y por color. */
            <Pressable
              onPress={onCombinaciones}
              accessibilityRole="button"
              accessibilityLabel={`${producto.title}: ${combinaciones} ${combinaciones === 1 ? 'combinación' : 'combinaciones'}. Abre sus precios y sus unidades.`}
              style={({ pressed }) => [s.enlace, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Layers size={icono.micro} color={colors.primary} />
              <Text style={[s.sello, { color: colors.primary }]}>Combinaciones</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
              <BotonPaso Icono={Minus} deshabilitado={ocupado || producto.stock <= 0} onPress={() => onStock(-1)} colors={colors} etiqueta={`Quitar una unidad a ${producto.title}`} compacto />
              <BotonPaso Icono={Plus} deshabilitado={ocupado} onPress={() => onStock(1)} colors={colors} etiqueta={`Añadir una unidad a ${producto.title}`} compacto />
            </View>
          )}
          <Pressable
            onPress={onGestionar}
            accessibilityRole="button"
            accessibilityLabel={`Gestionar ${producto.title}`}
            style={({ pressed }) => [s.enlace, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Settings2 size={icono.micro} color={colors.textSecondary} />
            <Text style={s.meta}>Gestionar</Text>
            <ChevronRight size={icono.micro} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Retirado: la salida está en la hoja (volver a la venta). Aquí solo se recuerda que existe. */}
      {activa && retirado && (
        <Pressable
          onPress={onGestionar}
          accessibilityRole="button"
          accessibilityLabel={`${producto.title} está retirado. Abre la gestión para volver a ponerlo a la venta.`}
          style={({ pressed }) => [s.enlace, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[s.sello, { color: colors.primary }]}>Reactivar</Text>
        </Pressable>
      )}

      {!activa && producto.status === 'rejected' && producto.rejectionReason ? (
        <View style={{ maxWidth: 108, alignItems: 'flex-end' }}>
          <AlertTriangle size={icono.micro} color={colors.danger} />
          <Text style={[s.meta, { color: colors.danger }]} numberOfLines={3}>{producto.rejectionReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Botón de paso (+, −). 44 dp de lado para que quepa el dedo sin abrir nada. */
function BotonPaso({ Icono, onPress, deshabilitado, etiqueta, colors, compacto = false }: {
  Icono: typeof Plus; onPress: () => void; deshabilitado: boolean; etiqueta: string;
  colors: ReturnType<typeof useTheme>['colors']; compacto?: boolean;
}) {
  const lado = compacto ? altura.punto - espaciado.e12 : altura.punto;
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: deshabilitado }}
      hitSlop={compacto ? espaciado.e4 : undefined}
      style={({ pressed }) => [{
        width: lado, height: lado, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center',
        borderWidth: trazo.fino, borderColor: colors.border, backgroundColor: colors.card,
        opacity: deshabilitado ? 0.35 : pressed ? 0.6 : 1,
      }]}
    >
      <Icono size={compacto ? icono.micro : icono.sm} color={colors.textPrimary} />
    </Pressable>
  );
}

/** Acción de la hoja: icono + etiqueta, en una fila que envuelve si no caben. */
function AccionHoja({ Icono, label, onPress, colors, tono }: {
  Icono: typeof Play; label: string; onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors']; tono?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
        paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
        borderRadius: radios.full, borderWidth: trazo.fino, borderColor: colors.border,
        backgroundColor: colors.card, opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Icono size={icono.sm} color={tono ?? colors.textPrimary} />
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: tono ?? colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

const estilos = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  hueso: { height: 72, borderRadius: radios.md, opacity: 0.6 },
  tarjeta: { borderRadius: radios.md, padding: espaciado.e12, borderWidth: trazo.fino, borderColor: c.border },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.fuerte, color: c.textSecondary, letterSpacing: 0.4, marginBottom: espaciado.e4 },
  tituloBloque: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary, marginBottom: espaciado.e4 },
  nota: { fontSize: tipografia.micro, color: c.textSecondary, lineHeight: 16, marginTop: 2 },
  chip: { paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e4 + 2, borderRadius: radios.full, borderWidth: trazo.fino },
  chipTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino,
  },
  miniatura: { width: 56, height: 56, borderRadius: radios.md },
  nombre: { fontSize: tipografia.body, fontWeight: peso.fuerte, color: c.textPrimary },
  meta: { fontSize: tipografia.micro, color: c.textSecondary },
  sello: { fontSize: tipografia.micro, fontWeight: peso.titulo },
  cifraStock: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: c.textPrimary, minWidth: 34, textAlign: 'center' },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: espaciado.e4, paddingHorizontal: espaciado.e4 },
});
