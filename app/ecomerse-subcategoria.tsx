/**
 * EcomerseSubcategoriaScreen — la pantalla de una subcategoría del Mercado.
 * Ruta: /ecomerse-subcategoria?id=<familyId>&nombre=<rótulo>
 *
 * ── QUÉ ES, Y QUÉ HABÍA ANTES ────────────────────────────────────────────────────────────────────
 * Es el TERCER ESCALÓN del árbol: departamento → familia → subclase. Se entra tocando una familia en
 * la rejilla de la home (`app/ecomerse.tsx`, `abrirFamilia`).
 *
 * Antes de esto se probaron dos formas que NO son esta, y las dos se vieron en el móvil:
 *   1. una **fila de chips** dentro de la home, con un caret que la abría en el sitio;
 *   2. una **hoja modal** (`<Sheet>` del kit) con el nombre de la familia en el encabezado y sus
 *      clases debajo.
 * Bernardo las corrigió en ese orden: «cada clic en una subcategoría debería abrirse un modal» y
 * después «me equivoqué en decir que el modal, si no que **una pantalla completa**, en la cual en la
 * parte superior se ubica el nombre de la subcategoría y por debajo se irán ubicando cada subclase de
 * la subcategoría **mostrando los productos que efectivamente pertenecen a esta subclase**».
 *
 * El motivo por el que una hoja no valía está en la última frase: **lo que se viene a ver son los
 * productos**. Una hoja sobre el catálogo enseña la lista de subclases y tapa el catálogo; una
 * pantalla puede enseñar las dos cosas —el nombre de la subclase y, debajo, sus productos—, y la
 * familia más larga del árbol vivo tiene 16 subclases (36 familias con 1-3, 66 con 4-6, 3 con 7-9,
 * 4 con 10-14 y 1 con 16), que no caben en ninguna hoja junto con sus productos.
 *
 * ── LENGUAJE: «SUBCATEGORÍA» Y «SUBCLASE» ────────────────────────────────────────────────────────
 * Lo fijó Bernardo y hay que respetarlo, porque el árbol en código usa otro vocabulario:
 *   · en la app, «departamento» (Hombre) y «familia» (Pantalones);
 *   · en su lengua, **la categoría es Hombre, la subcategoría es Pantalones y las subclases son
 *     Vaqueros y las demás**.
 * O sea: esta pantalla se titula con la FAMILIA y sus apartados son las HOJAS. En los comentarios de
 * este archivo se usan los dos nombres a la vez a propósito, para que nadie tenga que traducir.
 *
 * ── DE DÓNDE SALEN LOS DATOS: UNA PETICIÓN, NINGÚN ENDPOINT NUEVO ─────────────────────────────────
 *   · `categories()` da el árbol —el rótulo de la familia y **el orden de sus subclases**—.
 *   · `catalog({ family })` da todos los productos de la familia, y cada producto ya viene con
 *     `leafId` y `leafLabel` (lo comprobó el servidor: `mapProduct` en
 *     `_f6-serv/ecomerse.service.ts`, verificado en vivo con HTTP 200).
 * Con eso, repartir los productos por subclase es agrupar en memoria. **No hay que tocar el backend**
 * y **no hay que pedir la lista otra vez al cambiar de subclase**, que es lo que costaría un filtro
 * por hoja mandado al servidor. Esa comodidad es la razón de que el store ya no tenga `leafFilter`.
 *
 * ── LA SUBCLASE NO ES UN CAMPO OBLIGATORIO DEL ANUNCIO, Y ESO SE VE ───────────────────────────────
 * Medido sobre el catálogo vivo: de 9 productos activos, **5 no tienen subclase** (y uno ni familia).
 * Es un estado legítimo —el vendedor publica y elige subclase si quiere—, así que los productos que
 * no la tienen se agrupan **al final, bajo el nombre de la subcategoría**: pertenecen a ella aunque
 * no pertenezcan a ninguna de sus partes, y esconderlos sería que la pantalla enseñara menos que el
 * catálogo del que se viene. NO llevan ningún aviso ni contador: el encabezado es el nombre de la
 * subcategoría y nada más.
 *
 * Si un día el administrador reordena el árbol, el orden de los apartados cambia solo: sale de
 * `hojas`, no del catálogo. Y si `categories()` falla pero el catálogo llega, los apartados se
 * reconstruyen con el `leafLabel` que trae cada producto —la pantalla se degrada, no se rompe—.
 *
 * ── POR QUÉ UNA LISTA PLANA Y NO UN `SectionList` ────────────────────────────────────────────────
 * Porque React Native 0.79 **no tiene `numColumns` en `SectionList`** (solo en `FlatList`), y las
 * tarjetas del Mercado van a dos columnas. Las salidas eran tres, y las tres se miraron: pintar cada
 * apartado con un `View` de `flexWrap` por dentro pierde la virtualización —una familia con 500
 * productos montaría 500 tarjetas—; un `<ScrollView>` con todo dentro, lo mismo; y `SectionList` a
 * una columna contradice al resto del Mercado. Así que la lista es **una `FlatList` plana cuyos
 * elementos son o una cabecera de subclase o una fila de hasta dos tarjetas** —el truco es de una
 * línea y es el que ya usa la home para su hueco impar—.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import {
  useTheme, EmptyState, InlineError, espaciado, peso, tipografia, trazo,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseCategory, EcomerseProduct } from '../api/ecomerse';
import { TarjetaProducto, EsqueletoTarjeta } from '../components/ecomerse/TarjetaProducto';
import { useAccionesProducto } from '../components/ecomerse/useAccionesProducto';

/** El orden del catálogo, el mismo que manda la home: el valor por defecto del servidor, explícito
 *  para que el contrato se lea en la llamada. Un orden distinto aquí haría que la misma familia
 *  saliera ordenada de dos maneras según la pantalla. */
const SORT_CATALOGO = 'recommended';

/** Las filas de tarjetas que se pintan mientras carga. Dos filas de dos, como la rejilla del Mercado:
 *  un esqueleto que no mide lo que va a medir el contenido hace saltar la pantalla al llegar. */
const FILAS_ESQUELETO = [0, 1];

/** Una fila de la lista: o el nombre de una subclase, o hasta dos tarjetas. */
type Fila =
  | { tipo: 'subclase'; id: string; label: string }
  | { tipo: 'productos'; id: string; items: EcomerseProduct[] };

/**
 * Reparte los productos de la familia por subclase y los deja en el orden de la lista.
 *
 * El orden de los apartados sale del ÁRBOL (`hojas`), que es el que decidió el administrador, y no
 * del catálogo: si saliera del catálogo, el mismo vendedor publicando cambiaría el orden de la
 * pantalla. Las subclases **sin productos no se pintan** —un apartado vacío es ruido, y hoy hay
 * familias enteras sin un solo producto—.
 */
function repartir(
  productos: EcomerseProduct[],
  hojas: { id: string; label: string }[],
  rotuloFamilia: string,
): Fila[] {
  const porSubclase = new Map<string, EcomerseProduct[]>();
  const sinSubclase: EcomerseProduct[] = [];
  for (const p of productos) {
    if (!p.leafId) { sinSubclase.push(p); continue; }
    const lista = porSubclase.get(p.leafId);
    if (lista) lista.push(p); else porSubclase.set(p.leafId, [p]);
  }

  const filas: Fila[] = [];
  const apartado = (clave: string, label: string, items: EcomerseProduct[]) => {
    filas.push({ tipo: 'subclase', id: `s_${clave}`, label });
    for (let i = 0; i < items.length; i += 2) {
      filas.push({ tipo: 'productos', id: `f_${items[i].id}`, items: items.slice(i, i + 2) });
    }
  };

  for (const h of hojas) {
    const items = porSubclase.get(h.id);
    if (items?.length) { apartado(h.id, h.label, items); porSubclase.delete(h.id); }
  }
  /* Las subclases que traen productos y NO están en el árbol: pasa cuando el árbol no ha llegado (la
     llamada falló) o cuando el servidor tiene una hoja que el catálogo ya no lista. Se pintan con el
     rótulo que trae el propio producto, que es mejor que perder el producto. */
  for (const [clave, items] of porSubclase) {
    apartado(clave, items[0].leafLabel || rotuloFamilia, items);
  }
  if (sinSubclase.length) apartado('sin_subclase', rotuloFamilia, sinSubclase);
  return filas;
}

export default function EcomerseSubcategoriaScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const { favIds, abrirFicha, alternarFavorito, anadirAlCarrito } = useAccionesProducto();

  /* El nombre llega en los parámetros y NO se espera al árbol para poder escribir el encabezado: con
     el id solo, la cabecera estaría vacía hasta que contestara el servidor. Si la pantalla se abre
     por enlace directo (sin `nombre`), el rótulo sale del árbol y, en el peor caso, del producto. */
  const params = useLocalSearchParams<{ id?: string; nombre?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const nombreParam = typeof params.nombre === 'string' ? params.nombre : '';

  const [cats, setCats] = useState<EcomerseCategory[]>([]);
  const [productos, setProductos] = useState<EcomerseProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('No sabemos qué subcategoría abrir.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      /* Las dos en paralelo: son independientes y encadenarlas costaba dos viajes de red seguidos. */
      const [arbol, lista] = await Promise.all([
        ecomerseApi.categories(),
        ecomerseApi.catalog({ family: id, sort: SORT_CATALOGO }),
      ]);
      setCats(arbol);
      setProductos(lista);
    } catch {
      setError('No pudimos cargar esta subcategoría. Revisa tu conexión e inténtalo de nuevo.');
      setProductos([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /** La familia y sus subclases. Se busca por `id` en el árbol en vez de guardarla: el árbol se
   *  vuelve a servir en cada carga y un objeto guardado es el que se queda obsoleto. */
  const familia = useMemo(() => {
    for (const c of cats) {
      const f = c.familias?.find((x) => x.id === id);
      if (f) return f;
    }
    return undefined;
  }, [cats, id]);

  /* El rótulo de la cabecera, por orden de fiabilidad: el árbol (lo que el servidor dice hoy), el
     parámetro con el que se llegó (lo que decía la rejilla), el del primer producto, y por último
     una palabra que no engañe a nadie. */
  const rotulo = familia?.label || nombreParam || productos[0]?.familyLabel || 'Subcategoría';

  const filas = useMemo(
    () => repartir(productos, familia?.hojas ?? [], rotulo),
    [productos, familia, rotulo],
  );

  const hayProductos = filas.length > 0;
  const cargandoEnSeco = loading && !hayProductos;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* La cabecera: el nombre de la subcategoría y el camino de vuelta. Sin contador y sin aviso —
          lo pidió explícito: «un aviso no es necesario que pongas». */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{rotulo}</Text>
      </View>

      {cargandoEnSeco ? (
        <View style={s.esqueleto}>
          {FILAS_ESQUELETO.map((f) => (
            <View key={f} style={s.filaEsqueleto}>
              <EsqueletoTarjeta />
              <EsqueletoTarjeta />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={(f) => f.id}
          contentContainerStyle={[s.lista, { paddingBottom: insets.bottom + espaciado.e32 }]}
          ListEmptyComponent={
            error ? (
              <View style={s.centrado}>
                <InlineError mensaje={error} onReintentar={load} />
              </View>
            ) : (
              /* El vacío es el estado NORMAL de casi todo el árbol hoy: 107 de las 110 familias no
                 tienen un solo producto. Se dice sin dramatizar y con la vuelta a mano. */
              <EmptyState
                emoji="🛍️"
                titulo={`Todavía no hay productos en ${rotulo}`}
                texto="Cuando un vendedor publique en esta subcategoría, aparecerá aquí."
                accionLabel="← Volver al Mercado"
                onAccion={() => router.back()}
              />
            )
          }
          renderItem={({ item }) => {
            if (item.tipo === 'subclase') {
              return <Text style={s.subclase}>{item.label}</Text>;
            }
            return (
              <View style={s.fila}>
                {item.items.map((p) => (
                  <TarjetaProducto
                    key={p.id}
                    product={p}
                    favorited={favIds.includes(p.id)}
                    onPress={() => abrirFicha(p.id)}
                    onFav={() => alternarFavorito(p)}
                    onAdd={() => anadirAlCarrito(p)}
                  />
                ))}
                {/* La fila impar se completa con un hueco para que la tarjeta no se estire a lo ancho
                    de la pantalla. Es el mismo recurso que el `__spacer__` de la home. */}
                {item.items.length === 1 ? <View style={s.hueco} /> : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  /** El mismo alto y el mismo patrón que el directorio de tiendas: la pantalla se reconoce como
   *  hermana suya y no como una variante de la home. */
  header: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino, borderBottomColor: c.border },
  headerTitle: { flex: 1, fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: c.textPrimary },
  lista: { paddingTop: espaciado.e8 },
  /** El nombre de la subclase. `fuerte` (700) y no `titulo` (900) para no competir con la cabecera,
   *  que también va en `subtitle`: la jerarquía la marca el peso, no el tamaño. */
  subclase: { fontSize: tipografia.subtitle, fontWeight: peso.fuerte, color: c.textPrimary, paddingHorizontal: espaciado.e16, marginTop: espaciado.e16, marginBottom: espaciado.e8 },
  fila: { flexDirection: 'row', gap: espaciado.e10, paddingHorizontal: espaciado.e16, marginBottom: espaciado.e10 },
  hueco: { flex: 1 },
  esqueleto: { gap: espaciado.e10, paddingTop: espaciado.e8 },
  filaEsqueleto: { flexDirection: 'row', gap: espaciado.e10, paddingHorizontal: espaciado.e16 },
  centrado: { paddingTop: 40, paddingHorizontal: espaciado.e32 },
});
