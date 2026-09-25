/**
 * EcomerseFavoritesScreen — "Seguido" (estilo Xianyu).
 * Pestañas: Todo · Novedades · Categorías · Comprados · Especiales.
 * v2 (auditoría): errores con Reintentar, favorito con revert si falla, skeleton,
 * grid par, sesión requerida, SafeArea y a11y.
 * Ruta: /ecomerse-favorites
 *
 * ── NOMENCLATURA (2026-09-13) ────────────────────────────────────────────────
 * Las etiquetas de las pestañas estaban EN CHINO (全部 · 上新 · 分类 · 买过 · 特别关注)
 * mientras el resto de la pantalla estaba en español: se habían copiado del diseño de
 * referencia y nunca se tradujeron. La app es para Guinea Ecuatorial y está en español, así
 * que un usuario veía cinco pestañas que no podía leer. Traducidas.
 * Se conserva la referencia al diseño original (Xianyu / 闲鱼) porque explica de dónde
 * salen los cinco apartados, pero el TEXTO que se pinta es el de abajo, en español.
 *
 * ── FASE 1 DEL PIE (22-sep-2026): «Categorías» AGRUPA Y CUENTA ───────────────────
 * La pestaña «Categorías» filtraba por departamento pero NO decía cuántos favoritos hay en cada
 * uno: había que entrar a mirar. La referencia (Pinduoduo, imagen #8) los lista con su cuenta
 * —「男装 69」·「箱包 4」·「鞋靴 5」—, y eso es justo lo que convierte la pestaña en un índice en vez de
 * en una fila de botones a ciegas.
 *
 * DOS REGLAS QUE NO SE PUEDEN SALTAR:
 *  1. **La cuenta sale de la lista COMPLETA, nunca de la filtrada.** Contar sobre lo que se está
 *     pintando daría «男装 69» y «箱包 0» —el número de la categoría que miras—, que no es lo que
 *     nadie espera. Por eso en esta pestaña se piden dos listas: la filtrada para pintar y la
 *     completa para contar.
 *  2. **Sólo se enseñan los departamentos con algo dentro.** Los 18 bloques del árbol, con quince a
 *     cero, serían un carril de ruido. La excepción es el que estás mirando: si se queda a cero
 *     mientras lo miras, su ficha se queda para que sepas por qué la rejilla está vacía.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, espaciado, ilustracion, radios, ScreenHeader, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseCategory, EcomerseProduct } from '../api/ecomerse';
import { useEcomerseStore } from '../state/ecomerse';
import { useSession } from '../state/session';
import { brand } from '@egrouteplan/ui-kit';
import { TarjetaProducto, EsqueletoTarjeta } from '../components/ecomerse/TarjetaProducto';

type Tab = 'all' | 'new' | 'cat' | 'bought' | 'special';
/** `isSpecial` no está en el tipo del catálogo: lo devuelve solo la lista de Favoritos. */
type ProductoFavorito = EcomerseProduct & { isSpecial?: boolean };

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Todo' },
  { key: 'new', label: 'Novedades' },
  { key: 'cat', label: 'Categorías' },
  { key: 'bought', label: 'Comprados' },
  { key: 'special', label: 'Especiales' },
];

const SKELETONS = [0, 1, 2, 3];

/**
 * Cuántos favoritos hay en cada departamento. Se cuenta sobre la lista COMPLETA y no sobre lo que
 * se está pintando, que es lo que permite que los números no bailen al moverte entre categorías.
 * Un favorito sin departamento no cuenta en ninguno: sumarlo a un cajón «otros» que no existe en el
 * árbol sería inventarse una categoría.
 */
function contarPorDepartamento(lista: EcomerseProduct[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const p of lista) {
    if (!p.departmentId) continue;
    n[p.departmentId] = (n[p.departmentId] ?? 0) + 1;
  }
  return n;
}

export default function EcomerseFavoritesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const { setFavIds, toggleFavId } = useEcomerseStore();
  const [tab, setTab] = useState<Tab>('all');
  const [catId, setCatId] = useState('');
  const [cats, setCats] = useState<EcomerseCategory[]>([]);
  const [items, setItems] = useState<EcomerseProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cuántos favoritos hay en cada departamento. Sólo lo usa la pestaña «Categorías». */
  const [cuentas, setCuentas] = useState<Record<string, number>>({});
  const [totalFavs, setTotalFavs] = useState(0);
  /**
   * Si la lista COMPLETA ya se trajo en esta visita a la pestaña. Es un `ref` y no un estado a
   * propósito: marca un «ya está hecho» que NO debe provocar un repintado ni entrar en las
   * dependencias de `load` (haría que la carga se llamara a sí misma).
   */
  const completasRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q: Record<string, string> = {};
      if (tab === 'new') q.sort = 'new';
      if (tab === 'special') q.special = '1';
      /* Las fichas de esta pestaña son DEPARTAMENTOS, así que el filtro va por `department`. Con el
         nombre viejo (`category`) el servidor lo lee como FAMILIA —ese es el alias— y como aquí viaja
         un id de departamento, la consulta NO falla: devuelve cero. La pestaña se queda en blanco y
         se lee como «no tienes favoritos», que es la peor forma de romperse. */
      if (tab === 'cat' && catId) q.department = catId;
      /* EN «CATEGORÍAS» HACEN FALTA DOS LISTAS. La filtrada se pinta; la COMPLETA es la única que
         puede contar, porque contar sobre la filtrada daría «男装 69» y «箱包 0» —el número de la
         categoría que estás mirando—, que no es lo que nadie espera. La completa se pide UNA vez por
         visita a la pestaña: volver a pedirla en cada toque sería pedir lo mismo para nada. */
      const pedirCompletas = tab === 'cat' && !completasRef.current;
      const [list, c, todas] = await Promise.all([
        tab === 'bought' ? ecomerseApi.myPurchased() : ecomerseApi.myFavorites(q),
        ecomerseApi.categories(),
        pedirCompletas ? ecomerseApi.myFavorites({}) : Promise.resolve(null),
      ]);
      setItems(list);
      setCats(c);
      if (todas) {
        completasRef.current = true;
        setCuentas(contarPorDepartamento(todas));
        setTotalFavs(todas.length);
      }
      // Mantiene el store de favoritos al día (corazones de la home)
      ecomerseApi.favoriteIds().then((ids) => setFavIds(ids)).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error && /sesión|401|token/i.test(e.message)
        ? 'Inicia sesión para ver tus favoritos.'
        : 'No pudimos cargar esta lista. Revisa tu conexión.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, catId]);

  /* Cambiar de pestaña invalida la lista completa: al volver a «Categorías» hay que recontar, porque
     el usuario puede haber quitado favoritos en «Todo». Va ANTES del efecto que carga —los efectos
     corren en orden de declaración— para que el `ref` esté limpio cuando `load` lo consulte. */
  useEffect(() => { completasRef.current = false; }, [tab]);

  useEffect(() => { load(); }, [load]);

  const removeFav = (id: string) => {
    const prev = items;
    const quitado = items.find((x) => x.id === id);
    toggleFavId(id);
    setItems((p) => p.filter((x) => x.id !== id));
    /* El contador del departamento baja A LA VEZ. Si no, quitar un favorito dejaba «男装 69» en 69
       hasta recargar, y el número es justo lo que esta pestaña viene a decir. */
    const ajustar = (delta: number) => {
      const d = quitado?.departmentId;
      if (!d) return;
      setCuentas((p) => ({ ...p, [d]: Math.max((p[d] ?? 0) + delta, 0) }));
      setTotalFavs((t) => Math.max(t + delta, 0));
    };
    ajustar(-1);
    ecomerseApi.favoritesToggle(id).catch(() => {
      // revert si la API falló
      toggleFavId(id);
      setItems(prev);
      ajustar(1);
      Alert.alert('Favoritos', 'No se pudo quitar de favoritos. Inténtalo de nuevo.');
    });
  };

  const toggleSpecial = (id: string) => {
    ecomerseApi.favoritesSpecial(id).then((r) => {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, isSpecial: r.special } as EcomerseProduct : p)));
    }).catch(() => {
      Alert.alert('Especiales', 'No se pudo cambiar. Inténtalo de nuevo.');
    });
  };

  const s = styles(colors);

  const listData: EcomerseProduct[] = (() => {
    if (loading && items.length === 0) return SKELETONS.map((i) => ({ id: `__sk_${i}` } as EcomerseProduct));
    return items.length % 2 === 1 ? [...items, { id: '__spacer__' } as EcomerseProduct] : items;
  })();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScreenHeader titulo="Seguido" alVolver={() => router.back()} />

      {/* Pestañas */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}
            style={[s.tab, tab === t.key && { backgroundColor: colors.primary }]}>
            <Text style={[s.tabText, { color: tab === t.key ? brand.white : colors.textPrimary }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Selector de categoría (pestaña Categorías): AGRUPA Y CUENTA, como la referencia. Sólo salen
          los departamentos con algo dentro —los 18 bloques del árbol con quince a cero serían un
          carril de ruido—, más el que estés mirando: si se queda a cero mientras lo miras, su ficha
          se queda para que se entienda por qué la rejilla está vacía. */}
      {tab === 'cat' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.catRow}>
          <SubChip label={`Todas${totalFavs ? ` ${totalFavs}` : ''}`} active={catId === ''} onPress={() => setCatId('')} />
          {cats
            .filter((c) => (cuentas[c.id] ?? 0) > 0 || c.id === catId)
            .map((c) => {
              const n = cuentas[c.id] ?? 0;
              return (
                <SubChip
                  key={c.id}
                  label={`${c.icon ?? ''} ${c.label}${n ? ` ${n}` : ''}`}
                  active={catId === c.id}
                  onPress={() => setCatId(c.id)}
                />
              );
            })}
        </ScrollView>
      )}

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: espaciado.e10, paddingHorizontal: espaciado.e16 }}
        contentContainerStyle={{ gap: espaciado.e10, paddingBottom: espaciado.e32 }}
        ListEmptyComponent={
          error ? (
            <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: espaciado.e32 }}>
              <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e8 }}>📡</Text>
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>Algo salió mal</Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e18 }}>
                <Pressable onPress={() => isAuthenticated ? load() : router.push('/auth' as any)} style={{ backgroundColor: colors.primary, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e11, borderRadius: radios.full }}>
                  <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>{isAuthenticated ? 'Reintentar' : 'Iniciar sesión'}</Text>
                </Pressable>
              </View>
            </View>
          ) : loading && items.length === 0 ? null : (
            <EmptyState
              emoji={tab === 'bought' ? '🛒' : tab === 'special' ? '⭐' : '💛'}
              titulo={tab === 'bought' ? 'Todavía no has comprado nada' : tab === 'special' ? 'Sin productos especiales' : 'Sin productos guardados'}
              texto={tab === 'bought'
                ? 'Cuando compres en Ecomerse, los productos aparecerán en Comprados.'
                : tab === 'special'
                  ? 'Aquí salen los productos que las tiendas marcan como especiales.'
                  : 'Toca el ❤️ de un producto para guardarlo aquí.'}
            />
          )
        }
        renderItem={({ item }) =>
          item.id.startsWith('__sk_') ? (
            <EsqueletoTarjeta />
          ) : item.id === '__spacer__' ? (
            <View key="spacer" style={{ flex: 1 }} />
          ) : (
            <TarjetaProducto
              product={item}
              /* El contador de interés se apaga aquí: en Favoritos el corazón es TUYO, y un «♥ 3» al
                 lado se lee como si fuera de otro. La estrella sí, que es lo único que distingue
                 «Especiales» del resto de pestañas. */
              mostrarInteres={false}
              etiqueta={tab === 'bought' ? 'Comprado' : undefined}
              onPress={() => router.push({ pathname: '/ecomerse-detail', params: { id: item.id } } as any)}
              onFav={tab === 'bought' ? undefined : () => removeFav(item.id)}
              onSpecial={tab === 'bought' ? undefined : () => toggleSpecial(item.id)}
              isSpecial={(item as ProductoFavorito).isSpecial === true}
            />
          )
        }
      />
    </View>
  );
}

function SubChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: radios.full, backgroundColor: active ? colors.primary : colors.surface, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: active ? brand.white : colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  tabs: { gap: espaciado.e8, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12 },
  tab: { paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  tabText: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  catRow: { gap: espaciado.e8, paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e10 },
});
