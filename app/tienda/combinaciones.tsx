/**
 * Combinaciones — el editor de EJES Y COMBINACIONES de un anuncio (Fase 4 · SKU).
 * Ruta: /tienda/combinaciones?id=<productoId>
 *
 * POR QUÉ ES UNA PANTALLA APARTE Y NO UNA SECCIÓN DE «PUBLICAR». Porque son **dos carriles
 * distintos**, y el servidor los separa a propósito: el contenido del anuncio (título, fotos,
 * precio, categoría) pasa por moderación y `POST`/`PUT products` **rechaza** `options` para que nadie
 * crea que las publicó. Las combinaciones van por `PUT seller/products/:id/options`, el carril
 * rápido, y ahí se quedan: reponer una talla es la operación más repetida del día y no puede costar
 * 24–48 h de revisión.
 *
 * Consecuencia que se ve en la pantalla: las combinaciones son un paso **después** de publicar. Por
 * eso esta pantalla se abre desde «Anuncios» (que es donde está lo publicado), no desde el
 * formulario de alta — y por eso «Publicar» enlaza aquí al terminar, en vez de fingir que se
 * configuran allí.
 *
 * ESTÁ FUERA DE LA BARRA DE PESTAÑAS (`BarraTienda.SIN_BARRA`), como «Publicar»: es un flujo de
 * edición con su propio botón de guardar, no una quinta pestaña. Dejarla con barra invitaría a
 * abandonarla a medias sin decirlo.
 *
 * DE DÓNDE SALE TODO: de la ficha pública (`GET products/:id`), que ya devuelve `photos`, `options`
 * y `variants` en la misma respuesta — una sola petición para los cuatro datos que el editor
 * necesita. La segunda petición (`myProducts`) NO es para pintar nada: es para comprobar que el
 * anuncio es de quien lo está editando. Sin esa comprobación, un enlace a un anuncio ajeno dejaría
 * rellenar ejes enteros para reventar en el guardado con un «Producto no encontrado».
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import {
  Aviso, InlineError, alpha, espaciado, peso, radios, tipografia, trazo, useAviso, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseProduct } from '../../api/ecomerse';
import { formatXAF } from '../../utils/formatHelpers';
import EditorDeCombinaciones, { type ResultadoCombinaciones } from '../../components/ecomerse/EditorDeCombinaciones';

export default function CombinacionesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [producto, setProducto] = useState<EcomerseProduct | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, mostrarAviso, ocultarAviso] = useAviso();

  const cargar = useCallback(async () => {
    if (!id) { setError('No sabemos de qué anuncio hablamos.'); setCargando(false); return; }
    setCargando(true);
    setError(null);
    try {
      const [p, mios] = await Promise.all([ecomerseApi.product(id), ecomerseApi.myProducts()]);
      if (!mios.some((x) => x.id === id)) {
        setError('Ese anuncio no está entre los tuyos.');
        setProducto(null);
        return;
      }
      setProducto(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar el anuncio. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  /**
   * Lo que el servidor devolvió al guardar pisa lo que teníamos: él es quien asigna los `id` de ejes
   * y combinaciones, y quien calcula el `stock` del anuncio (la suma). El editor NO se vuelve a
   * montar —su `key` es el id del anuncio—, así que el borrador que el comerciante tiene delante
   * sigue siendo el suyo y no se le cierra nada.
   */
  const alGuardar = (r: ResultadoCombinaciones) => {
    mostrarAviso(r.message, 'exito');
    setProducto((p) => (p ? { ...p, options: r.options, variants: r.variants, variantCount: r.variants.length, stock: r.stock } : p));
  };

  const enRevision = !!producto && ['pending', 'draft', 'rejected'].includes(producto.status);
  const s = estilos(colors);

  const cabecera = (
    <View style={s.cabecera}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={espaciado.e12}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <ArrowLeft size={22} color={colors.textPrimary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.tituloCabecera} numberOfLines={1}>Combinaciones</Text>
        {producto ? <Text style={s.subCabecera} numberOfLines={1}>{producto.title}</Text> : null}
      </View>
    </View>
  );

  if (cargando) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        {cabecera}
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          {[0, 1, 2].map((i) => <View key={i} style={[s.hueso, { backgroundColor: colors.border }]} />)}
        </View>
      </View>
    );
  }

  if (error || !producto) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        {cabecera}
        <View style={{ padding: espaciado.e16 }}>
          <InlineError
            mensaje={error ?? 'No pudimos cargar el anuncio.'}
            onReintentar={id ? () => { void cargar(); } : undefined}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.raiz, { paddingTop: insets.top }]}>
      {cabecera}
      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + espaciado.e32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Dónde está el anuncio ahora: es el dato con el que se lee todo lo de abajo (el precio que
            hereda una combinación y las unidades que hoy tiene). */}
        <Text style={s.contexto}>
          {formatXAF(producto.priceXaf)} · {producto.stock} {producto.stock === 1 ? 'unidad' : 'unidades'}
          {producto.photos?.length ? ` · ${producto.photos.length} ${producto.photos.length === 1 ? 'foto' : 'fotos'}` : ' · sin fotos'}
        </Text>

        {/* Un anuncio sin aprobar admite combinaciones: se guardan y están listas cuando se apruebe.
            Decirlo evita la duda de «¿esto no se puede tocar todavía?». */}
        {enRevision && (
          <View style={s.avisoRevision}>
            <Text style={s.avisoRevisionTexto}>
              El anuncio está en revisión. Puedes preparar sus combinaciones igual: se guardan aquí y estarán
              listas en cuanto el administrador lo apruebe.
            </Text>
          </View>
        )}

        <EditorDeCombinaciones
          /* La clave es el anuncio: cambiar de anuncio vuelve a leer el borrador desde cero. */
          key={producto.id}
          productoId={producto.id}
          precioAnuncio={producto.priceXaf}
          stockAnuncio={producto.stock}
          fotos={producto.photos ?? []}
          inicial={{ options: producto.options, variants: producto.variants }}
          onGuardado={alGuardar}
        />
      </ScrollView>

      <Aviso visible={aviso.visible} mensaje={aviso.mensaje} tono={aviso.tono} onOcultar={ocultarAviso} />
    </View>
  );
}

const estilos = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino, borderBottomColor: c.border,
  },
  tituloCabecera: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: c.textPrimary },
  subCabecera: { fontSize: tipografia.micro, color: c.textSecondary, marginTop: 1 },
  hueso: { height: 84, borderRadius: radios.md, opacity: 0.6 },
  contexto: { fontSize: tipografia.caption, color: c.textSecondary, fontWeight: peso.fuerte },
  avisoRevision: {
    marginTop: espaciado.e12, padding: espaciado.e12, borderRadius: radios.md,
    borderWidth: trazo.fino, borderColor: c.border, backgroundColor: alpha(c.primary, 0.06),
  },
  avisoRevisionTexto: { fontSize: tipografia.micro, color: c.textSecondary, lineHeight: 16 },
});
