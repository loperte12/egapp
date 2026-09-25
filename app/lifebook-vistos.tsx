/**
 * app/lifebook-vistos.tsx — HISTORIAL DE PRODUCTOS («vistos hace poco») · Mercado, tanda F.
 *
 * QUÉ ES
 * Uno de los cinco accesos rápidos que pide la especificación del Mercado: «Historial de
 * productos». Hasta ahora solo existía un contador público por producto (`views_count`), que no
 * sirve para volver a algo que miraste: no dice QUÉ miraste ni CUÁNDO.
 *
 * LO QUE DICE EN VOZ ALTA (en vez de disimularlo)
 *  · La rejilla es **la misma del catálogo** (`ProductoCard`), no una copia con otro aspecto.
 *  · Un producto que ya **no está a la venta no se esconde**: sale apagado y con «Ya no está a la
 *    venta», porque borrarlo del historial de alguien sin avisar es peor que decirlo.
 *  · «Solo lo ves tú»: el historial no es público ni se le enseña a la tienda.
 *  · Se puede **borrar** (es el rastro de la persona, no de la plataforma).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, EmptyState, espaciado, InlineError, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ArrowLeft, Clock } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { commerceApi, type LbViewedProduct } from '../api/commerce';
import { ProductoCard } from '../components/lifebook/ProductoCard';
import { ir as irSeguro } from '../constants/rutas';
import { shortDate } from '../utils/datetime';

/** «Visto hace un momento» · «Visto ayer» · «Visto el 12 sep»: legible, sin ceros raros. */
function cuandoLoVio(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Visto hace poco';
  const horas = ms / 3600000;
  if (horas < 1) return 'Visto hace un momento';
  if (horas < 24) return `Visto hace ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Visto ayer';
  if (dias < 7) return `Visto hace ${dias} días`;
  return `Visto el ${shortDate(iso)}`;
}

export default function LifeBookVistosScreen() {
  return (
    <AuthGate>
      <VistosContent />
    </AuthGate>
  );
}

function VistosContent() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [items, setItems] = useState<LbViewedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const vivo = useRef(true);

  const cargar = useCallback(async (modo: 'inicial' | 'refresco' = 'inicial') => {
    if (modo === 'refresco') setRefrescando(true);
    try {
      const res = await commerceApi.misVistos(60);
      if (!vivo.current) return;
      setItems(res.items ?? []);
      setError(null);
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial');
    } finally {
      if (vivo.current) { setLoading(false); setRefrescando(false); }
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => { vivo.current = false; };
  }, [cargar]);

  const borrar = useCallback(() => {
    Alert.alert(
      'Borrar el historial',
      'Se quitará de esta lista todo lo que has mirado. No se borra nada de las tiendas ni de tus pedidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => {
            setBorrando(true);
            commerceApi.borrarVistos()
              .then(() => { if (vivo.current) setItems([]); })
              .catch((e) => Alert.alert('No se pudo borrar', e instanceof Error ? e.message : 'Inténtalo otra vez.'))
              .finally(() => { if (vivo.current) setBorrando(false); });
          },
        },
      ],
    );
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => irSeguro.atras()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle }}>Historial de productos</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>Solo lo ves tú</Text>
        </View>
        {items.length && !loading ? (
          <Pressable onPress={borrar} hitSlop={8} disabled={borrando} accessibilityLabel="Borrar el historial">
            {borrando
              ? <ActivityIndicator size="small" color={colors.textSecondary} />
              : <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Borrar</Text>}
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: espaciado.e10, paddingHorizontal: espaciado.e14 }}
          contentContainerStyle={{ paddingTop: espaciado.e12, paddingBottom: insets.bottom + 30, gap: espaciado.e12, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshing={refrescando}
          onRefresh={() => void cargar('refresco')}
          ListHeaderComponent={items.length ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, paddingHorizontal: espaciado.e14 }}>
              {items.length} producto{items.length === 1 ? '' : 's'} · lo último que miraste, primero
            </Text>
          ) : null}
          ListEmptyComponent={
            /*
              Aquí había UN bloque haciendo DOS trabajos: si fallaba la carga decía «No se pudo
              cargar» y ofrecía «Ver el catálogo» — la acción equivocada, porque el catálogo no
              arregla que la petición haya fallado y el usuario se quedaba sin reintentar. Ahora
              el error va con `InlineError` (se anuncia, vibra y ofrece reintento) y el vacío con
              `EmptyState`.
            */
            error ? (
              <View style={{ paddingTop: 40, paddingHorizontal: espaciado.e14 }}>
                <InlineError mensaje={error} onReintentar={() => void cargar()} />
              </View>
            ) : (
              <EmptyState
                icono={<Clock size={38} color={alpha(colors.primary, 0.35)} />}
                titulo="Todavía no has mirado nada"
                texto="Cuando abras la ficha de un producto aparecerá aquí, para volver a él sin buscarlo otra vez."
                accionLabel="Ver el catálogo"
                onAccion={() => irSeguro.libre('/lifebook-catalog')}
              />
            )
          }
          renderItem={({ item }) => (
            <ProductoCard
              item={item}
              apagado={!item.available}
              /* La misma regla que el catálogo: una HABITACIÓN no se abre como producto (se reserva
                 por noches desde la ficha del hotel); el resto abre su ficha. */
              onPress={() => irSeguro.libre(
                item.serviceType === 'hotel_room' ? '/lifebook-hotel-detalle' : '/lifebook-product/[id]',
                { id: item.serviceType === 'hotel_room' ? item.shop.id : item.id },
              )}
              pie={
                <View style={{ marginTop: espaciado.e4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                    {cuandoLoVio(item.viewedAt)}
                    {item.times > 1 ? ` · ${item.times} veces` : ''}
                  </Text>
                  {!item.available ? (
                    <Text style={{ color: colors.danger, fontSize: 10, fontWeight: peso.maximo }}>Ya no está a la venta</Text>
                  ) : null}
                </View>
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
