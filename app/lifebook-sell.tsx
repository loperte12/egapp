/**
 * app/lifebook-sell.tsx — ASISTENTE DE PUBLICACIÓN (Parte 34).
 *
 * Sustituye al formulario largo por el asistente por pasos que propuso el dueño,
 * con su estructura (una pantalla + un componente por paso), su vista previa y su
 * estado en zustand — y con los arreglos detectados en la evaluación:
 *   · paso 0 «abrir mi tienda» (sin tienda no se puede publicar);
 *   · paso de categoría (antes no se recogía en ningún sitio);
 *   · precio a consultar y precio anterior vacío que ya no rompen la publicación;
 *   · entrega y pagos guardados de verdad (antes se perdían en estado local);
 *   · clave de idempotencia ESTABLE por intento (un doble toque no duplica).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, PrimaryButton, StepHeader, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ArrowLeft, Store } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { commerceApi, type LbCategory, type LbShop } from '../api/commerce';
import { chartsFromApi, chartsToPayload, formToPayload, groupsFromApi, stepsFor, usePublishStore, validateStep } from '../state/commercePublish';
import StepShop from '../components/lifebook/publish/StepShop';
import StepType from '../components/lifebook/publish/StepType';
import StepMedia from '../components/lifebook/publish/StepMedia';
import StepDetails from '../components/lifebook/publish/StepDetails';
import StepExtras from '../components/lifebook/publish/StepExtras';
import StepPreview from '../components/lifebook/publish/StepPreview';
import { Notice } from '../components/lifebook/publish/PublishParts';
import { ir as irSeguro } from '../constants/rutas';

const STEP_LABEL: Record<string, string> = {
  shop: 'Tu tienda',
  type: 'Tipo y categoría',
  media: 'Fotos y vídeo',
  details: 'Datos y precio',
  extras: 'Detalles, opciones y entrega',
  preview: 'Vista previa',
};

export default function LifeBookSellScreen() {
  return (
    <AuthGate>
      <SellContent />
    </AuthGate>
  );
}

function SellContent() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const form = usePublishStore((s) => s.form);
  const step = usePublishStore((s) => s.step);
  const hasShop = usePublishStore((s) => s.hasShop);
  const shopName = usePublishStore((s) => s.shopName);
  const submitting = usePublishStore((s) => s.submitting);
  const error = usePublishStore((s) => s.error);
  const setStep = usePublishStore((s) => s.setStep);
  const setHasShop = usePublishStore((s) => s.setHasShop);
  const replaceForm = usePublishStore((s) => s.replaceForm);
  const setError = usePublishStore((s) => s.setError);
  const setSubmitting = usePublishStore((s) => s.setSubmitting);
  const ensureIdemKey = usePublishStore((s) => s.ensureIdemKey);
  const clearIdemKey = usePublishStore((s) => s.clearIdemKey);

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<LbCategory[]>([]);
  const [shop, setShop] = useState<LbShop | null>(null);
  const mounted = useRef(true);

  /** Carga inicial: categorías + mi tienda (+ producto si estoy editando). */
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const [cats, mine] = await Promise.all([
          commerceApi.categories().catch(() => ({ categories: [] as LbCategory[] })),
          commerceApi.myShop().catch(() => ({ shop: null })),
        ]);
        if (!mounted.current) return;
        setCategories(cats.categories ?? []);
        setShop(mine.shop);
        setHasShop(!!mine.shop, mine.shop?.name ?? null);

        if (editId) {
          const { product } = await commerceApi.product(String(editId));
          if (!mounted.current) return;
          // TANDA J/K: las tablas de tallas viven en su propia ruta (se guardan aparte) y los ejes
          // de opciones vienen con la ficha. Si la lectura de la tabla falla, la pantalla sigue:
          // solo se pierde poder editarla, no el resto del formulario.
          const tablas = await commerceApi.sizeChart(String(editId)).catch(() => ({ charts: [] }));
          if (!mounted.current) return;
          replaceForm({
            serviceType: product.serviceType,
            categoryId: product.categoryId,
            title: product.title,
            shortDescription: product.shortDescription ?? '',
            longDescription: product.longDescription ?? '',
            priceMode: product.priceMode,
            price: product.priceXaf !== null ? String(product.priceXaf) : '',
            oldPrice: product.oldPriceXaf !== null ? String(product.oldPriceXaf) : '',
            stockMode: product.stockMode,
            stockQuantity: String(product.stockQuantity ?? 0),
            condition: product.condition,
            city: product.originCity ?? mine.shop?.city ?? 'Malabo',
            barrio: product.originBarrio ?? '',
            tags: (product.tags ?? []).join(', '),
            coverage: product.shippingPolicy?.coverage ?? ['same_city'],
            transports: product.shippingPolicy?.transportModes ?? ['local_courier', 'pickup'],
            deliveryCost: product.shippingPolicy?.baseCostXaf ? String(product.shippingPolicy.baseCostXaf) : '',
            media: (product.media ?? []).map((m) => ({ url: m.url, type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video' })),
            variants: (product.variants ?? []).map((v) => ({
              name: v.name,
              priceXaf: v.priceXaf !== null && v.priceXaf !== undefined ? String(v.priceXaf) : '',
              stockQuantity: String(v.stockQuantity ?? ''),
              attributes: Object.fromEntries(
                Object.entries(v.attributes ?? {}).map(([k, val]) => [k, String(val)]),
              ),
            })),
            optionGroups: groupsFromApi(product.options),
            sizeCharts: chartsFromApi(tablas.charts),
            attributes: product.attributes ?? [],
          });
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const pasos = useMemo(() => stepsFor(form.serviceType, hasShop || !!editId), [form.serviceType, hasShop, editId]);
  const idx = Math.max(0, pasos.indexOf(step));
  const esUltimo = idx === pasos.length - 1;

  const avanzar = useCallback(() => {
    const problema = validateStep(step, form);
    if (problema) { setError(problema); return; }
    const siguiente = pasos[Math.min(idx + 1, pasos.length - 1)];
    if (siguiente) setStep(siguiente);
  }, [step, form, pasos, idx, setStep, setError]);

  const atras = useCallback(() => {
    if (idx === 0) { router.back(); return; }
    const anterior = pasos[Math.max(idx - 1, 0)];
    if (anterior) setStep(anterior);
  }, [idx, pasos, router, setStep]);

  /** Guarda la entrega en la tienda (es de la tienda, no del producto) y publica. */
  const publicar = useCallback(async () => {
    const problema = validateStep('details', form);
    if (problema) { setError(problema); setStep('details'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const coste = Number(form.deliveryCost.replace(/\D/g, '')) || 0;
      let shippingPolicyId: string | null = null;
      if (shop) {
        const { shop: actualizada } = await commerceApi.updateShop({
          shippingPolicy: {
            name: 'Entrega de la tienda',
            coverage: form.coverage.length ? form.coverage : ['same_city'],
            transportModes: form.transports.length ? form.transports : ['pickup'],
            costMode: coste > 0 ? 'fixed' : 'on_request',
            baseCostXaf: coste,
            estimatedTime: '2-4 h',
            shipsInternational: form.coverage.includes('international'),
            internationalNote: form.coverage.includes('international') ? 'Coste del envío internacional a consultar con la tienda' : undefined,
          },
        });
        shippingPolicyId = actualizada.shippingPolicies?.[0]?.id ?? null;
      }

      const payload = { ...formToPayload(form), shippingPolicyId };
      /**
       * TANDA J/K — LAS TABLAS DE TALLAS.
       *
       * Van por su propia ruta (`PUT products/:id/size-chart`) porque necesitan el id del producto,
       * que solo existe después de publicar. Si fallan, se DICE: publicar sin la tabla que el
       * comerciante acaba de escribir sería perder su trabajo en silencio (y el asistente de talla
       * recomendaría con datos que no están).
       */
      const tablas = chartsToPayload(form.sizeCharts);
      const guardarTablas = async (productId: string) => {
        if (!tablas.length) return true;
        try {
          await commerceApi.setSizeChart(productId, tablas);
          return true;
        } catch (e) {
          Alert.alert(
            'Tabla de tallas',
            `La publicación se guardó, pero la tabla de tallas no: ${e instanceof Error ? e.message : 'error de red'}. Vuelve a entrar en «Editar» y guárdala otra vez.`,
          );
          return false;
        }
      };
      if (editId) {
        await commerceApi.updateProduct(String(editId), payload as never);
        await guardarTablas(String(editId));
        Alert.alert('Guardado', 'Tu publicación vuelve a revisión antes de mostrarse.');
        irSeguro.libre('/lifebook-product/[id]', { id: String(editId) }, true);
      } else {
        const clave = ensureIdemKey();
        const { product } = await commerceApi.createProduct(payload as never, clave);
        clearIdemKey();
        await guardarTablas(product.id);
        irSeguro.libre('/lifebook-product/[id]', { id: product.id }, true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [form, shop, editId, ensureIdemKey, clearIdemKey, router, setError, setStep, setSubmitting]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Cabecera propia: el Stack raíz va sin cabecera nativa */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={atras} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, flex: 1, marginLeft: espaciado.e10 }}>
          {editId ? 'Editar publicación' : 'Publicar en mi tienda'}
        </Text>
        {shopName ? (
          <Pressable
            onPress={() => irSeguro.libre('/lifebook-merchant')}
            hitSlop={8}
            accessibilityLabel="Ir al panel de mi tienda"
            style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}
          >
            <Store size={13} color={colors.text.primary} />
            <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.maximo, maxWidth: 120 }}>{shopName}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e24 }} keyboardShouldPersistTaps="handled">
        <StepHeader
          step={idx + 1}
          total={pasos.length}
          title={STEP_LABEL[step] ?? 'Publicar'}
          subtitle={step === 'preview' ? 'Revisa antes de publicar: entrará en moderación.' : undefined}
        />

        <View style={{ height: 14 }} />

        {error ? <Notice tone="error">{error}</Notice> : null}

        {step === 'shop' ? (
          <StepShop onCreated={(name) => { setHasShop(true, name); setStep('type'); }} />
        ) : null}
        {step === 'type' ? <StepType categories={categories} /> : null}
        {step === 'media' ? <StepMedia /> : null}
        {step === 'details' ? <StepDetails /> : null}
        {step === 'extras' ? <StepExtras categories={categories} /> : null}
        {step === 'preview' ? <StepPreview categories={categories} shop={shop} /> : null}
      </ScrollView>

      {/* Pie: atrás / continuar / publicar */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 10, borderTopColor: alpha(colors.border, 0.5), backgroundColor: colors.background }]}>
        <GhostButton title={idx === 0 ? 'Cancelar' : 'Atrás'} onPress={atras} />
        <View style={{ flex: 1 }}>
          {esUltimo ? (
            <PrimaryButton
              title={editId ? 'Guardar cambios' : 'Publicar'}
              loading={submitting}
              onPress={publicar}
            />
          ) : (
            <PrimaryButton title="Continuar" onPress={avanzar} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
