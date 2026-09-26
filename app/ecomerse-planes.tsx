/**
 * EcomersePlanesScreen — Tu tienda en Ecomerse (monetización v4.6, auditoría).
 * 4 niveles comparables (misma tabla de features ✓/✗), plan actual con
 * vencimiento, confirmación ANTES de cualquier cargo, destacado con PICKER de
 * producto (nunca [0] silencioso), destacado GRATIS real (sin cobro), duración
 * honesta (~XAF/día), copy sin promesas falsas (MM próximamente, aprobación
 * 2–24 h), estados de carga/error y guard sin tienda.
 * Ruta: /ecomerse-planes
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import {EmptyState, Precio, PrimaryButton, ScreenHeader, alpha, brand, espaciado, ilustracion, neutro, peso, radios, tipografia, trazo, useTheme} from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseProduct, EcomerseShopPlan } from '../api/ecomerse';
import { billingApi, BillingPlan } from '../api/billing';
import { formatXAF } from '../utils/formatHelpers';

/** Duración legible sin `else '1 mes'` (nunca miente). */
function formatDuration(days: number | null | undefined): string {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return '';
  if (d % 30 === 0) return d === 30 ? '1 mes' : `${d / 30} meses`;
  if (d % 7 === 0) return d === 7 ? '1 semana' : `${d / 7} semanas`;
  return d === 1 ? '1 día' : `${d} días`;
}

const SHOP_QUOTA_LABEL: Record<string, number> = {
  ecomerse_shop_basic: 8, ecomerse_shop_flash: 16, ecomerse_shop_pro: 32, ecomerse_shop_pro_max: 100,
};

export default function EcomersePlanesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Destacar llega con productId explícito (desde Mis productos); fallback al más reciente.
  const rawPid = useLocalSearchParams<{ productId?: string | string[] }>().productId;
  const presetPid = Array.isArray(rawPid) ? rawPid[0] : rawPid;
  const [plan, setPlan] = useState<EcomerseShopPlan | null>(null);
  const [bPlans, setBPlans] = useState<BillingPlan[]>([]);
  const [myProducts, setMyProducts] = useState<EcomerseProduct[]>([]);
  const [hasShop, setHasShop] = useState(true);
  const [productId, setProductId] = useState<string | null>(presetPid ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFree, setBusyFree] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, bp, me] = await Promise.all([
        ecomerseApi.shopPlan(),
        billingApi.plans('ecomerse'),
        ecomerseApi.sellerMe(),
      ]);
      setPlan(p);
      setBPlans(bp);
      setHasShop(!!me.seller);
      const products = (me.products ?? [])
        .filter((x) => x.status === 'active')
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      setMyProducts(products);
      setProductId((cur) => cur && products.some((x) => x.id === cur) ? cur : (products[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar tu tienda. Revisa la conexión.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shopPlans = useMemo(
    () => bPlans.filter((x) => x.code.startsWith('ecomerse_shop_') && x.active).sort((a, b) => a.priceXaf - b.priceXaf),
    [bPlans],
  );
  const featPlans = useMemo(
    () => bPlans.filter((x) => x.code.startsWith('ecomerse_featured') && x.active).sort((a, b) => a.priceXaf - b.priceXaf),
    [bPlans],
  );

  const isCurrent = (pl: BillingPlan) => plan?.plan === pl.code;
  const quotaUsed = plan?.used ?? 0;
  const quotaLimit = plan?.limit ?? 0;
  const nearLimit = quotaLimit > 0 && quotaUsed / quotaLimit >= 0.8;
  const selected = myProducts.find((x) => x.id === productId);
  const isPro = plan?.badge === true;
  const expiresTxt = plan?.expiresAt ? new Date(plan.expiresAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : null;

  const goCheckout = (planId: string, targetType: string, targetId?: string) => {
    router.push({ pathname: '/billing-checkout', params: { planId, module: 'ecomerse', targetType, ...(targetId ? { targetId } : {}) } } as any);
  };

  /** Confirmación SIEMPRE antes de crear un cargo. */
  const chooseShop = (pl: BillingPlan) => {
    if (isCurrent(pl) || pl.priceXaf === 0 || loading || error) return;
    Alert.alert(
      pl.name,
      `Se creará un pago de ${formatXAF(pl.priceXaf)} por 30 días.\n\nCuando el admin apruebe el comprobante (suele tardar 2–24 h), se activa tu plan.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => goCheckout(pl.id, 'user') },
      ],
    );
  };

  /** Destacar: PICKER + confirm con producto, duración y monto. */
  const chooseFeatured = (fp: BillingPlan) => {
    if (!selected) { Alert.alert('Destacar', 'Publica un anuncio activo primero.'); return; }
    const extend = selected.isFeatured ? '\n\nExtenderá el destacado actual de este anuncio.' : '';
    Alert.alert(
      fp.name.replace('Destacar · ', ''),
      `«${selected.title}» · ${formatDuration(fp.durationDays)} · ${formatXAF(fp.priceXaf)} (≈${formatXAF(Math.round(fp.priceXaf / Math.max(1, fp.durationDays)))}/día)${extend}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Pagar', onPress: () => goCheckout(fp.id, 'product', selected.id) },
      ],
    );
  };

  /** Destacado GRATIS incluido en Pro/Pro Max: sin cobro, consume el crédito. */
  const useFree = async () => {
    if (!selected || !plan || (plan.freeFeaturedLeft ?? 0) <= 0 || busyFree) return;
    setBusyFree(true);
    try {
      const r = await ecomerseApi.featureFree(selected.id);
      Alert.alert('¡Listo!', `«${selected.title}» destacado ${r.days} días sin coste.`);
      load();
    } catch (e) {
      Alert.alert('Destacado gratis', e instanceof Error ? e.message : 'No se pudo aplicar.');
    } finally {
      setBusyFree(false);
    }
  };

  const s = styles(colors);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Esqueleto: sin `alVolver` el título queda centrado igual. */}
        <ScreenHeader titulo="Tu tienda" />
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ height: 120, borderRadius: radios.lg, backgroundColor: colors.border, opacity: 0.6 }} />
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <ScreenHeader titulo="Tu tienda" alVolver={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e32 }}>
          <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e8 }}>📡</Text>
          <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>No pudimos cargar tu tienda</Text>
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: espaciado.e18, backgroundColor: colors.primary, paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e11, borderRadius: radios.full }}>
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!hasShop) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <ScreenHeader titulo="Tu tienda" alVolver={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e32 }}>
          {/* Al kit. La acción se conserva y va PRIMARIA: es LA acción de esta pantalla. */}
          <EmptyState
            emoji="🏪"
            titulo="Todavía no tienes tienda"
            texto="Da de alta tu negocio (identidad verificada + aprobación del admin) para publicar y acceder a los planes."
            accionLabel="Abrir mi tienda"
            accionPrimaria
            onAccion={() => router.push('/ecomerse-seller' as any)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScreenHeader titulo="Tu tienda" alVolver={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Estado actual */}
        <View style={[s.current, { backgroundColor: alpha(colors.primary, 0.06) }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>🏪 {plan?.name ?? 'Tienda'}</Text>
            {expiresTxt && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Activo hasta {expiresTxt}</Text>}
          </View>
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e4 }}>
            {plan ? `${quotaUsed} de ${quotaLimit} publicaciones activas` : ''}
            {isPro && (plan?.freeFeaturedLeft ?? 0) > 0 ? ` · ⭐ ${plan.freeFeaturedLeft} destacado gratis este mes` : ''}
          </Text>
          {nearLimit && (
            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.text.secondary, marginTop: espaciado.e4 }}>
              Estás al {Math.round((quotaUsed / quotaLimit) * 100)}% del límite: sube de plan para seguir publicando.
            </Text>
          )}
        </View>

        {/* Niveles de tienda (misma tabla de features en los 4) */}
        <Text style={s.sectionTitle}>Niveles de tienda</Text>
        <View style={{ gap: espaciado.e10 }}>
          {shopPlans.map((pl) => {
            const f = (pl.features ?? {}) as Record<string, unknown>;
            const current = isCurrent(pl);
            const isFree = pl.priceXaf === 0;
            const quota = Number.isFinite(Number(f.shopQuota)) ? Number(f.shopQuota) : (SHOP_QUOTA_LABEL[pl.code] ?? 8);
            const recommended = pl.code === 'ecomerse_shop_pro';
            return (
              <View key={pl.code} style={[s.card, { borderColor: current ? colors.primary : colors.border }]}>
                <View style={s.cardHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, flex: 1, flexWrap: 'wrap' }}>
                    <Text style={s.cardName}>{pl.name}</Text>
                    {current && <View style={s.tagCurrent}><Text style={s.tagCurrentText}>Actual</Text></View>}
                    {recommended && !current && <View style={s.tagRec}><Text style={s.tagRecText}>Recomendado</Text></View>}
                  </View>
                  {/* Precio de FIGURA. El `/mes` ya no se construye a mano con un `<Text>` anidado:
                      es el `periodo` de la primitiva, que lo pinta con el mismo trato que la unidad
                      (mismo cuerpo, mismo peso) para que el periodo no compita con el importe.
                      Un plan gratis enseña «0 XAF» y **sin** periodo: el cero es un precio de
                      verdad, lo que no tiene sentido es decir que cuesta 0 al mes. */}
                  <Precio
                    valor={pl.priceXaf}
                    periodo={isFree ? undefined : '/mes'}
                  />
                </View>
                <FeatureRow ok label={`${quota} publicaciones activas`} />
                <FeatureRow ok={!!f.shopBadge} label="Badge «Tienda Pro» en tus anuncios" />
                <FeatureRow ok={!!f.priority} label="Prioridad en búsquedas" />
                <FeatureRow ok={Number(f.monthlyFeatured) > 0} label={`${Number(f.monthlyFeatured) || 0} destacado gratis al mes`} />
                {isFree ? (
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.textSecondary, marginTop: espaciado.e10 }}>
                    ✓ Incluida · {quota} publicaciones
                  </Text>
                ) : current ? (
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.text.primary, marginTop: espaciado.e10 }}>
                    ✓ Plan actual{expiresTxt ? ` · renueva ${expiresTxt}` : ''}
                  </Text>
                ) : (
                  <View style={{ marginTop: espaciado.e10 }}>
                    <PrimaryButton title={`Pasar a ${pl.name} · ${formatXAF(pl.priceXaf)}/mes`} onPress={() => chooseShop(pl)} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e8 }}>
          ¿Quieres bajar de plan o cancelar la renovación? Escribe a soporte y lo gestionamos.
        </Text>

        {/* Destacar anuncio */}
        <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>🔥 Destacar un anuncio</Text>
        <View style={[s.card, { borderColor: colors.border }]}>
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, lineHeight: 17, marginBottom: espaciado.e8 }}>
            Elige el anuncio y el nivel. Aparece arriba de los resultados y en Recomendados durante la duración.
          </Text>

          {/* Picker de producto (radios) */}
          <Text style={[s.label, { marginBottom: espaciado.e4 }]}>1 · Elige el anuncio</Text>
          {myProducts.length === 0 ? (
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginBottom: espaciado.e8 }}>
              No tienes anuncios activos. Publica primero para poder destacarlo.
            </Text>
          ) : (
            <View style={{ gap: espaciado.e6, marginBottom: espaciado.e10 }}>
              {myProducts.map((p) => {
                const on = productId === p.id;
                return (
                  <Pressable key={p.id} onPress={() => setProductId(p.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={[s.prodRow, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 0.06) : colors.surface }]}>
                    {p.photos?.[0] ? (
                      <Image source={{ uri: p.photos[0] }} style={{ width: 40, height: 40, borderRadius: radios.sm, backgroundColor: colors.border }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: radios.sm, backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: ilustracion.sm }}>{p.categoryIcon ?? '📦'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: espaciado.e8 }}>
                      <Text numberOfLines={1} style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>{p.title}</Text>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>
                        {p.city}{p.isFeatured ? ' · 🔥 ya destacado (se extiende)' : ''}
                      </Text>
                    </View>
                    <View style={[s.radio, { borderColor: on ? colors.primary : colors.border }]}>
                      {on && <View style={[s.radioDot, { backgroundColor: colors.primary }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Destacado gratis (sin cobro) */}
          {isPro && (plan?.freeFeaturedLeft ?? 0) > 0 && selected && (
            <Pressable onPress={useFree} disabled={busyFree} accessibilityRole="button"
              accessibilityLabel={`Usar ${plan?.freeFeaturedLeft} destacado gratis en ${selected.title}`}
              style={[s.freeBtn, { backgroundColor: alpha(brand.secondary, 0.12), borderColor: brand.secondary }]}>
              <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>
                ⭐ Usar {plan?.freeFeaturedLeft} destacado incluido (7 días, sin coste){busyFree ? '…' : ''}
              </Text>
            </Pressable>
          )}

          {/* Escalera de niveles */}
          <Text style={[s.label, { marginBottom: espaciado.e4, marginTop: espaciado.e6 }]}>2 · Elige el nivel</Text>
          <View style={{ gap: espaciado.e4 }}>
            {featPlans.map((fp) => (
              <Pressable key={fp.code} onPress={() => chooseFeatured(fp)} disabled={!selected}
                accessibilityRole="button" accessibilityState={{ disabled: !selected }}
                accessibilityLabel={`${fp.name} ${formatXAF(fp.priceXaf)} ${formatDuration(fp.durationDays)}`}
                style={[s.featRow, { borderBottomColor: colors.border, opacity: selected ? 1 : 0.5 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>{fp.name.replace('Destacar · ', '')}</Text>
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>
                    {formatDuration(fp.durationDays)} · ≈{formatXAF(Math.round(fp.priceXaf / Math.max(1, fp.durationDays)))}/día
                  </Text>
                </View>
                <Precio valor={fp.priceXaf} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Cómo funciona (sin promesas falsas) */}
        <Text style={[s.sectionTitle, { marginTop: espaciado.e22 }]}>Cómo funciona</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: radios.md, padding: espaciado.e12 }}>
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, lineHeight: 18 }}>
            1. Eliges tu nivel o un destacado → se crea tu pedido de pago (XAF).{'\n'}
            2. Pagas por transferencia ahora (Mobile Money en activación) y subes el comprobante.{'\n'}
            3. Te avisamos cuando el admin apruebe (suele tardar 2–24 h); el plan o el destacado se activa.{'\n'}
            4. Los planes de tienda se renuevan cada mes; el destacado dura lo elegido.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function FeatureRow({ ok, label }: { ok: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e3 }}>
      {ok ? <Check size={14} color={colors.text.success} /> : <X size={14} color={neutro.n400} />}
      <Text style={{ fontSize: tipografia.caption, color: ok ? colors.textPrimary : colors.textSecondary, marginLeft: espaciado.e7, flex: 1 }}>{label}</Text>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  current: { borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e16 },
  sectionTitle: { fontSize: tipografia.body, fontWeight: peso.maximo, color: c.textPrimary, marginBottom: espaciado.e8 },
  label: { fontSize: tipografia.caption, fontWeight: peso.maximo, color: c.textSecondary },
  card: { backgroundColor: c.card, borderRadius: radios.lg, borderWidth: trazo.base, padding: espaciado.e14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaciado.e8 },
  cardName: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary },
  /* `cardPrice` y `cardPeriod` se fueron con la primitiva `Precio`: el par cifra+unidad y el
     `/mes` ya no se escriben aquí. Eran, además, el último sitio del módulo que se construía el
     periodo a mano. */
  tagCurrent: { backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: radios.sm, paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e2 },
  tagCurrentText: { color: brand.success, fontSize: tipografia.micro, fontWeight: peso.titulo },
  tagRec: { backgroundColor: 'rgba(255,107,53,0.14)', borderRadius: radios.sm, paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e2 },
  tagRecText: { color: brand.secondary, fontSize: tipografia.micro, fontWeight: peso.titulo },
  prodRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e8 },
  radio: { width: 18, height: 18, borderRadius: radios.full, borderWidth: trazo.base, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: radios.full },
  freeBtn: { borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e9, alignItems: 'center', marginBottom: espaciado.e8 },
  featRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: espaciado.e9, borderBottomWidth: trazo.fino },
});
