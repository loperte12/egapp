/**
 * app/lifebook-merchant-products.tsx — MIS PUBLICACIONES · PANEL (Parte 39).
 *
 * Lista TODO lo que vende la tienda (cualquier estado) con las acciones que el
 * SERVIDOR acepta desde cada estado:
 *   · «Enviar a revisión» (publish) es la única forma de publicar algo nuevo,
 *     rechazado o en borrador — el vendedor no puede autoaprobarse;
 *   · **Editar precio y existencias** sin salir de aquí: es la edición RÁPIDA
 *     (PATCH /merchant/products/:id/quick) que **no devuelve el producto a
 *     moderación**, para que ajustar el stock o el precio no retire la venta
 *     del catálogo;
 *   · cualquier otro cambio (título, fotos, descripción) va por el asistente
 *     completo, que sí vuelve a pasar por revisión.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { ArrowLeft, Eye, Package, Pencil, Plus, Star, Trash2, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { absUrl } from '../api/config';
import { authApi } from '../api/auth';
import { tiendaApi } from '../api/lifebookTienda';
import {
  commerceApi, commerceMerchantApi, type LbMyProductCard, type LbProductStatus, type LbStockMode,
} from '../api/commerce';
import { lbServiceIcon, lbServiceLabel, lbStockModeLabel, LB_PRODUCT_ACTIONS, LB_PRODUCT_STATUS, LB_QUICK_EDITABLE, LB_STOCK_MODES, LB_TONE_COLOR } from '../constants/commerce';
import { lbXaf } from '../constants/lifebook';
import { Chip, ChipRow } from '../components/lifebook/Chip';
import { Notice } from '../components/lifebook/publish/PublishParts';
import { ir as irSeguro } from '../constants/rutas';

type Filtro = 'todos' | LbProductStatus | 'agotado';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todo' },
  { id: 'active', label: 'Publicado' },
  { id: 'pending', label: 'En revisión' },
  { id: 'agotado', label: 'Sin existencias' },
  { id: 'sold_out', label: 'Agotado' },
  { id: 'draft', label: 'Borrador' },
  { id: 'hidden', label: 'Oculto' },
  { id: 'rejected', label: 'Rechazado' },
];

const esAgotado = (p: LbMyProductCard) =>
  p.status === 'active' && (p.stockMode === 'exact' || p.stockMode === 'approximate') && p.stockQuantity <= 0;

export default function MerchantProductsScreen() {
  return (
    <AuthGate>
      <PanelGate><ProductsContent /></PanelGate>
    </AuthGate>
  );
}

function ProductsContent() {
  useScreenGuard();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ f?: string }>();

  const [items, setItems] = useState<LbMyProductCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(
    FILTROS.some((f) => f.id === params.f) ? (params.f as Filtro) : 'todos',
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editando, setEditando] = useState<LbMyProductCard | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setRefrescando(true);
    try {
      const { items: lista } = await commerceApi.myProducts();
      setItems(lista ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus publicaciones');
      setItems([]);
    } finally {
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visibles = useMemo(() => {
    const lista = items ?? [];
    if (filtro === 'todos') return lista;
    if (filtro === 'agotado') return lista.filter(esAgotado);
    return lista.filter((p) => p.status === filtro);
  }, [items, filtro]);

  /* ── TANDA A: los DESTACADOS de la tarjeta de mi tienda en el perfil ──────────────
     Máximo 3 y EN ORDEN (el primero se ve primero). El servidor valida que son míos y
     activos; aquí solo se elige. Se guarda de una vez, al pulsar «Guardar». */
  const [destacadosOpen, setDestacadosOpen] = useState(false);
  const [miId, setMiId] = useState<string | null>(null);
  const [destacados, setDestacados] = useState<string[]>([]);
  const [guardandoDest, setGuardandoDest] = useState(false);

  const abrirDestacados = useCallback(async () => {
    setDestacadosOpen(true);
    try {
      const me = await authApi.me();
      setMiId(me.id);
      const t = await tiendaApi.tarjeta(me.id);
      setDestacados((t.featured ?? []).map((f) => f.id));
    } catch {
      // Sin tienda (o sin conexión) el selector se queda vacío; guardar avisará.
      setDestacados([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alternarDestacado = (id: string) => {
    setDestacados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        Alert.alert('Ya hay 3', 'Quita uno para poder destacar otro.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const guardarDestacados = async () => {
    if (!miId) { Alert.alert('Destacados', 'No se pudo leer tu perfil.'); return; }
    setGuardandoDest(true);
    try {
      const t = await tiendaApi.destacar(destacados);
      setDestacados((t.featured ?? []).map((f) => f.id));
      setDestacadosOpen(false);
      Alert.alert('Destacados guardados',
        destacados.length
          ? 'Ya se ven en la tarjeta de tu tienda, en el perfil, en el orden que elegiste.'
          : 'La tarjeta de tu tienda ya no enseña productos, solo el nombre y la puntuación.');
    } catch (e) {
      Alert.alert('Destacados', e instanceof Error ? e.message : 'No se pudieron guardar');
    } finally { setGuardandoDest(false); }
  };

  /** Acción de estado: el servidor decide si aplica desde el estado actual. */
  const cambiarEstado = (p: LbMyProductCard, action: string, label: string) => {
    Alert.alert(label, `¿${label} «${p.title}»?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: label,
        onPress: async () => {
          setBusyId(p.id);
          try {
            const { status } = await commerceApi.setProductStatus(p.id, action as never);
            setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, status, rejectionReason: null } : x)));
          } catch (e) {
            Alert.alert('Publicación', e instanceof Error ? e.message : 'No se pudo cambiar el estado');
          } finally { setBusyId(null); }
        },
      },
    ]);
  };

  const borrar = (p: LbMyProductCard) => {
    Alert.alert('Eliminar', `¿Eliminar «${p.title}»? No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setBusyId(p.id);
          try {
            await commerceApi.deleteProduct(p.id);
            setItems((prev) => (prev ?? []).filter((x) => x.id !== p.id));
          } catch (e) {
            Alert.alert('Publicación', e instanceof Error ? e.message : 'No se pudo eliminar');
          } finally { setBusyId(null); }
        },
      },
    ]);
  };

  /** Guarda la edición rápida y refleja el resultado sin recargar todo. */
  const guardarRapido = async (p: LbMyProductCard, precio: string, stockMode: LbStockMode, stock: string) => {
    setBusyId(p.id);
    try {
      const input: { priceXaf?: number | null; stockMode?: LbStockMode; stockQuantity?: number } = { stockMode };
      if (p.priceMode !== 'on_request' && precio.trim() !== '') input.priceXaf = Number(precio.replace(/\D/g, ''));
      if (stockMode === 'exact' || stockMode === 'approximate') input.stockQuantity = Number(stock.replace(/\D/g, '') || 0);
      const r = await commerceMerchantApi.quickEdit(p.id, input);
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id
        ? { ...x, priceXaf: r.priceXaf, stockMode: r.stockMode, stockQuantity: r.stockQuantity, status: r.status }
        : x)));
      setEditando(null);
    } catch (e) {
      Alert.alert('Edición rápida', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, marginLeft: espaciado.e10, flex: 1 }}>
          Mis publicaciones
        </Text>
        <Pressable onPress={() => irSeguro.libre('/lifebook-sell')} hitSlop={10} accessibilityLabel="Publicar algo nuevo">
          <Plus size={21} color={colors.text.primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10 }}>
        {/* TANDA A — los 3 DESTACADOS que salen en la tarjeta de mi tienda en el perfil.
            El comerciante decide qué se ve primero (es su escaparate), así que el selector
            vive aquí, junto a sus publicaciones, y no escondido en los ajustes. */}
        <Pressable
          onPress={() => { void abrirDestacados(); }}
          accessibilityLabel="Elegir los productos destacados de mi perfil"
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e8 }}
        >
          <Star size={16} color={colors.text.warning} fill={colors.text.warning} />
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
            Destacados en mi perfil
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
            {destacados.length}/3
          </Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <ChipRow>
            {FILTROS.map((f) => (
              <Chip key={f.id} label={f.label} active={filtro === f.id} onPress={() => setFiltro(f.id)} />
            ))}
          </ChipRow>
        </ScrollView>
      </View>

      {items === null ? (
        <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color={colors.text.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => load()} tintColor={colors.primary} />}
        >
          {error ? <Notice tone="error">{error}</Notice> : null}

          {visibles.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: espaciado.e8 }}>
              <Package size={42} color={alpha(colors.text.primary, 0.45)} />
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                {filtro === 'todos' ? 'Todavía no vendes nada' : 'Nada en este estado'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: 40 }}>
                Publica un producto, comida o servicio: pasa por revisión y, al aprobarse, aparece en el catálogo.
              </Text>
              <View style={{ marginTop: espaciado.e8, minWidth: 220 }}>
                <PrimaryButton title="Publicar algo nuevo" onPress={() => irSeguro.libre('/lifebook-sell')} />
              </View>
            </View>
          ) : (
            visibles.map((p) => {
              const meta = LB_PRODUCT_STATUS[p.status];
              const tone = LB_TONE_COLOR[meta.tone];
              const acciones = LB_PRODUCT_ACTIONS[p.status] ?? [];
              const rapida = LB_QUICK_EDITABLE.includes(p.status);
              return (
                <View key={p.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                    {p.coverUrl ? (
                      <Image source={absUrl(p.coverUrl)} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }]}>
                        <Package size={18} color={alpha(colors.text.primary, 0.6)} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{p.title}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                        {lbServiceIcon(p.serviceType)} {lbServiceLabel(p.serviceType)} · {p.variants > 0 ? `${p.variants} opciones · ` : ''}
                        {p.stockMode === 'exact' || p.stockMode === 'approximate'
                          ? `${p.stockQuantity} disp.${esAgotado(p) ? ' (agotado)' : ''}`
                          : lbStockModeLabel(p.stockMode)}
                      </Text>
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: espaciado.e3 }}>
                        {p.priceMode === 'on_request' || p.priceXaf === null ? 'A consultar' : lbXaf(p.priceXaf)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: espaciado.e6 }}>
                      <View style={{ backgroundColor: alpha(tone, 0.13), borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 }}>
                        <Text style={{ color: tone, fontSize: tipografia.micro, fontWeight: peso.titulo }}>{meta.label}</Text>
                      </View>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>👁 {p.viewsCount} · ❤ {p.savesCount}</Text>
                      {/* TANDA H: cuánta gente está esperando que vuelva a haber stock. Es el dato
                          que dice si merece la pena reponer. Solo sale si hay alguien esperando. */}
                      {Number(p.waitingCount ?? 0) > 0 ? (
                        <Text style={{ color: colors.text.warning, fontSize: tipografia.micro, fontWeight: peso.titulo }}>
                          🔔 {p.waitingCount} esperan stock
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {p.status === 'rejected' && p.rejectionReason ? (
                    <View style={{ marginTop: espaciado.e8 }}>
                      <Notice tone="error">{p.rejectionReason}</Notice>
                    </View>
                  ) : null}
                  {meta.hint && p.status !== 'active' ? (
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e6 }}>{meta.hint}</Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e10 }}>
                    {acciones.map((a) => (
                      <Chip
                        key={a.action}
                        label={a.label}
                        active={!!a.primary}
                        disabled={busyId === p.id}
                        onPress={() => cambiarEstado(p, a.action, a.label)}
                      />
                    ))}
                    {rapida ? (
                      <Chip label="Precio y stock" icon={<Pencil size={12} color={colors.text.primary} />} disabled={busyId === p.id} onPress={() => setEditando(p)} />
                    ) : null}
                    <Chip label="Editar todo" disabled={busyId === p.id} onPress={() => irSeguro.libre('/lifebook-sell', { editId: p.id })} />
                    <Chip label="Ver ficha" icon={<Eye size={12} color={colors.textSecondary} />} onPress={() => irSeguro.libre('/lifebook-product/[id]', { id: p.id })} />
                    <Chip label="Eliminar" icon={<Trash2 size={12} color={colors.text.danger} />} disabled={busyId === p.id} onPress={() => borrar(p)} />
                    {busyId === p.id ? <ActivityIndicator size="small" color={colors.text.primary} /> : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {editando ? (
        <EdicionRapida
          producto={editando}
          guardando={busyId === editando.id}
          onCerrar={() => setEditando(null)}
          onGuardar={guardarRapido}
        />
      ) : null}

      {/* ── TANDA A: elegir los 3 destacados (el orden es el que se ve) ── */}
      {destacadosOpen ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDestacadosOpen(false)} statusBarTranslucent>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setDestacadosOpen(false)} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radios.lg, borderTopRightRadius: radios.lg, padding: espaciado.e16, paddingBottom: insets.bottom + 16, maxHeight: '82%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e4 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 }}>
                Destacados en mi perfil
              </Text>
              <Pressable onPress={() => setDestacadosOpen(false)} hitSlop={10} accessibilityLabel="Cerrar">
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>
              Hasta 3. El número es el ORDEN en que se verán en la tarjeta de tu tienda (el 1
              primero). Si no destacas ninguno, la tarjeta solo enseña el nombre y la puntuación.
            </Text>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: espaciado.e8 }}>
              {(items ?? [])
                .filter((p) => p.status === 'active')
                .map((p) => {
                  const puesto = destacados.indexOf(p.id);
                  const activo = puesto >= 0;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => alternarDestacado(p.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: activo }}
                      accessibilityLabel={`Destacar ${p.title}`}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, padding: espaciado.e8,
                        borderRadius: radios.md, borderWidth: trazo.fino,
                        borderColor: activo ? colors.primary : alpha(colors.border, 0.6),
                        backgroundColor: activo ? alpha(colors.primary, 0.08) : colors.surface,
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: radios.md, overflow: 'hidden', backgroundColor: alpha(colors.primary, 0.08) }}>
                        {p.coverUrl ? (
                          <Image source={absUrl(p.coverUrl)} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={0} />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={18} color={alpha(colors.text.primary, 0.5)} />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{p.title}</Text>
                        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                          {p.priceXaf === null ? 'Precio a consultar' : lbXaf(p.priceXaf)}
                        </Text>
                      </View>
                      {activo ? (
                        <View style={{ width: 26, height: 26, borderRadius: radios.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>{puesto + 1}</Text>
                        </View>
                      ) : (
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>+</Text>
                      )}
                    </Pressable>
                  );
                })}
              {(items ?? []).filter((p) => p.status === 'active').length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingVertical: espaciado.e20 }}>
                  No tienes publicaciones activas todavía. Cuando las tengas, podrás elegir cuáles
                  se ven primero en tu perfil.
                </Text>
              ) : null}
            </ScrollView>

            <View style={{ marginTop: espaciado.e12 }}>
              <PrimaryButton
                title={guardandoDest ? 'Guardando…' : 'Guardar destacados'}
                onPress={() => { if (!guardandoDest) void guardarDestacados(); }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ───────────────────── edición rápida (precio y existencias) ──────────────────

function EdicionRapida({
  producto, guardando, onCerrar, onGuardar,
}: {
  producto: LbMyProductCard;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (p: LbMyProductCard, precio: string, stockMode: LbStockMode, stock: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [precio, setPrecio] = useState(producto.priceXaf !== null ? String(producto.priceXaf) : '');
  const [stockMode, setStockMode] = useState<LbStockMode>(producto.stockMode);
  const [stock, setStock] = useState(String(producto.stockQuantity ?? 0));
  const conCantidad = stockMode === 'exact' || stockMode === 'approximate';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCerrar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>Precio y existencias</Text>
          <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>{producto.title}</Text>

          <View style={{ marginTop: espaciado.e14 }}>
            <Notice>
              Esto es un ajuste del día a día: <Text style={{ fontWeight: peso.titulo }}>no pasa por revisión</Text> y la
              publicación sigue igual de visible. Para cambiar el título, las fotos o la descripción, usa «Editar todo».
            </Notice>
          </View>

          {producto.priceMode !== 'on_request' ? (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>Precio (XAF)</Text>
              <TextInput
                value={precio}
                onChangeText={(v) => setPrecio(v.replace(/\D/g, '').slice(0, 9))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Esta publicación es «a consultar»: no lleva precio.</Text>
          )}

          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e14, marginBottom: espaciado.e6 }}>Existencias</Text>
          <ChipRow>
            {LB_STOCK_MODES.map((m) => (
              <Chip key={m.id} label={m.label} active={stockMode === m.id} onPress={() => setStockMode(m.id)} />
            ))}
          </ChipRow>

          {conCantidad ? (
            <TextInput
              value={stock}
              onChangeText={(v) => setStock(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { marginTop: espaciado.e10, color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e18 }}>
            <View style={{ flex: 1 }}>
              <GhostButton title="Cancelar" onPress={onCerrar} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Guardar"
                loading={guardando}
                onPress={() => onGuardar(producto, precio, stockMode, stock)}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.lg, padding: espaciado.e12, marginBottom: espaciado.e10 },
  thumb: { width: 62, height: 62, borderRadius: radios.md },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radios.lg, borderTopRightRadius: radios.lg, padding: espaciado.e18 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9,
    fontSize: tipografia.body, fontWeight: peso.fuerte,
  },
});
