// egrouteplan-app/app/billing-status.tsx
/**
 * BillingStatusScreen — mis órdenes y derechos activos (Billing Core).
 *
 * Auditoría senior (2026-09-02, v2 — luz verde):
 *  · Carga con skeleton / error + Reintentar / pull-to-refresh (nunca
 *    "No tienes derechos" por un fallo de red).
 *  · Renovar/Reactivar/Contratar navega a la pantalla de planes del MÓDULO
 *    correcto (rental/work/ecomerse/intercity) — adiós al hardcode de Alquiler.
 *  · Copy de ciclo de vida con fecha y días restantes exactos (win-back).
 *  · Órdenes y derechos sin slugs: labels completos + módulo visible; fallback
 *    humanizado si el código no está mapeado (nunca un id en inglés).
 *  · Tipos sin `as any` (reason fields tipados); fechas `es-GQ`.
 *  · Cancelar solo en pending_payment con confirmación; SafeArea; a11y.
 * Ruta: /billing-status
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SOPORTE, whatsappSoporte } from '../constants/soporte';
import { mensajeDeError } from '../constants/errores';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Clock, Package, Receipt, XCircle } from 'lucide-react-native';
import { alpha, Aviso, EmptyState, espaciado, GhostButton, PrimaryButton, radios, ScreenHeader, Sheet, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { billingApi, BillingEntitlement } from '../api/billing';
import { formatDate, formatXAF } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';
import { ir } from '../constants/rutas';

/* dato-color: el color ES la identidad del estado — no es un acento de tema (fallo 27) */
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pendiente de pago', color: brand.warning },
  proof_submitted: { label: 'Comprobante en revisión', color: brand.info },
  under_review: { label: 'En revisión', color: brand.info },
  approved: { label: 'Aprobado', color: brand.success },
  rejected: { label: 'Rechazado', color: brand.danger },
  cancelled: { label: 'Cancelada', color: brand.neutral },
  reversed: { label: 'Reversada', color: brand.neutral },
  refunded: { label: 'Reembolsada', color: brand.info },
  expired: { label: 'Expirado', color: brand.neutral },
  refund_status_partial: { label: 'Aprobada · reembolso parcial', color: brand.warning },
};

const MODULE_LABEL: Record<string, string> = {
  rental: 'Alquiler', work: 'Work', ecomerse: 'Mercado', intercity: 'Ciudad a Ciudad', food: 'Comida Rápida',
};

/** Nombre legible de un plan desde su código (evita slugs en inglés). */
function entitlementLabel(code: string, module?: string | null): string {
  const known: Record<string, string> = {
    rental_verified: 'Plan Propietario Verificado',
    rental_agency_pro: 'Plan Agencia Pro',
    rental_premium: 'Plan Premium',
    property_featured: 'Destacar propiedad',
    landlord_premium: 'Badge premium del arrendador',
    work_pro: 'Work Pro',
    work_business: 'Work Business',
    work_job_featured: 'Destacar oferta',
    intercity_driver_pro: 'Intercity Pro',
    intercity_driver_basic: 'Intercity Gratis',
    ecomerse_shop_pro_max: 'Tienda Pro Max',
    ecomerse_shop_pro: 'Tienda Pro',
    ecomerse_shop_flash: 'Tienda Flash',
    ecomerse_shop_basic: 'Tienda Gratis',
    ecomerse_featured_lite: 'Destacar anuncio',
    ecomerse_featured: 'Destacar anuncio',
    food_purchase: 'Pago de pedido',
  };
  if (known[code]) return known[code];
  if (code.includes('featured')) return 'Destacar anuncio';
  const mod = MODULE_LABEL[module ?? moduleOf(code)] ?? 'Plan';
  return `${mod} · ${code.replace(/^(rental|work|ecomerse|intercity|food)_/, '').replace(/_/g, ' ')}`;
}

/** Módulo inferido del código (si el entitlement no lo trae). */
function moduleOf(code: string): string {
  if (code.startsWith('rental') || code.startsWith('landlord') || code.startsWith('property')) return 'rental';
  if (code.startsWith('work')) return 'work';
  if (code.startsWith('ecomerse')) return 'ecomerse';
  if (code.startsWith('intercity')) return 'intercity';
  if (code.startsWith('food')) return 'food';
  return 'rental';
}

/** Pantalla de planes por módulo (Renovar/Reactivar/Contratar). */
const MODULE_ROUTES: Record<string, string> = {
  rental: '/alquiler-planes',
  work: '/work-planes',
  ecomerse: '/ecomerse-planes',
  intercity: '/intercity-planes',
};

interface OrderRow {
  id: string; planCode: string; planName: string; module?: string | null; amountXaf: number;
  status: string; createdAt: string; rejectionReason: string | null;
  cancellationReason?: string | null; reversalReason?: string | null; refundStatus?: string | null;
}

export default function BillingStatusScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [entitlements, setEntitlements] = useState<BillingEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  /**
   * Confirmación con HOJA, no con modal del sistema (auditoría de diseño, D-03/D-20): el usuario ve
   * el importe y el contexto mientras decide, y el botón de atrás no le deja a medias.
   */
  const [ordenACancelar, setOrdenACancelar] = useState<string | null>(null);
  /** Aviso que aparece y se va: para informar, no para interrumpir. */
  const [aviso, setAviso] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') { setLoading(true); setError(null); }
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [o, e] = await Promise.all([billingApi.myOrders(), billingApi.myEntitlements()]);
      setOrders(o as OrderRow[]);
      setEntitlements(e);
      setError(null);
    } catch {
      if (mode === 'initial') setError('No pudimos cargar tus compras y derechos. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Renovar/Reactivar en la pantalla de planes del módulo correcto. */
  const goRenew = (e: BillingEntitlement) => {
    const mod = e.module || moduleOf(e.code);
    const route = MODULE_ROUTES[mod];
    if (route) {
      router.push(route as any);
    } else {
      Alert.alert('Contacta soporte', `Este derecho no tiene plan de renovación en la app. Escríbenos: ${SOPORTE.email} · WhatsApp ${SOPORTE.telefono}`, [
        { text: 'Cerrar', style: 'cancel' },
        { text: 'WhatsApp', onPress: () => { void whatsappSoporte('Hola, necesito renovar un derecho de mi plan.'); } },
      ]);
    }
  };

  const cancelOrder = (orderId: string) => {
    if (cancellingOrderId) return; // sin doble cancelación
    // Abre la hoja: la confirmación se hace en pantalla, no en un modal del sistema.
    setOrdenACancelar(orderId);
  };

  /** Cancela de verdad, ya confirmado en la hoja. */
  const cancelarDeVerdad = async (orderId: string) => {
    setOrdenACancelar(null);
    setCancellingOrderId(orderId);
    try {
      await billingApi.cancelOrder(orderId, 'Cancelada por el usuario');
      setAviso('Orden cancelada. Si ya pagaste, pide el reembolso con el botón de abajo.');
      await load('refresh');
    } catch (e) {
      Alert.alert('Error', mensajeDeError(e, 'No se pudo cancelar la orden'));
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Filtros memoizados (no se recalculan en cada render).
  const activeEnt = useMemo(() => entitlements.filter((e) => e.active), [entitlements]);
  const expiringEnt = useMemo(
    () => entitlements.filter((e) => e.status === 'expiring_soon' || (e.daysLeft != null && e.daysLeft <= 7)),
    [entitlements],
  );
  const graceEnt = useMemo(() => entitlements.filter((e) => e.status === 'grace'), [entitlements]);
  const expiredEnt = useMemo(() => entitlements.filter((e) => e.status === 'expired'), [entitlements]);

  const daysCopy = (e: BillingEntitlement) => {
    if (e.daysLeft != null && e.daysLeft >= 0) return `quedan ${e.daysLeft} día${e.daysLeft === 1 ? '' : 's'}`;
    return 'muy pronto';
  };

  const s = styles(colors);

  if (loading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <SkeletonHeader colors={colors} />
        <View style={{ padding: espaciado.e16, gap: espaciado.e10 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ height: 86, borderRadius: radios.md, backgroundColor: colors.border, width: i === 1 ? '90%' : '100%' }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Cabecera del kit desde el 24/09/2026. Aquí el volver es `ir.atras()` (el ayudante), no
          `router.back()`: son las dos formas que convivían en las 21 copias. */}
      <ScreenHeader
        titulo="Mis compras y derechos"
        alVolver={() => ir.atras()}
      />

      {error ? (
        <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: espaciado.e28 }}>
          <Text style={{ fontSize: tipografia.kpi, marginBottom: espaciado.e8 }}>📡</Text>
          <Text style={{ fontSize: tipografia.cuerpo, fontWeight: peso.maximo, color: colors.textPrimary, textAlign: 'center' }}>Algo salió mal</Text>
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
          <Pressable onPress={() => load('initial')} accessibilityRole="button" style={{ marginTop: espaciado.e18, backgroundColor: brand.secondary, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: radios.panelAncho }}>
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e32 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}
        >
          {/* Avisos de ciclo de vida */}
          {expiringEnt[0] && (
            <RenewCard
              tone="warn"
              icon={<Clock size={16} color={brand.warningPressed} />}
              title={expiringEnt[0].code.includes('featured') ? 'Tu destacado vence pronto' : 'Tu plan vence pronto'}
              body={expiringEnt[0].expiresAt
                ? `Vence el ${formatDate(expiringEnt[0].expiresAt)} · ${daysCopy(expiringEnt[0])}. Renueva para no perderlo.`
                : 'Renueva para no perderlo.'}
              cta="Renovar ahora"
              onPress={() => goRenew(expiringEnt[0])}
              testID="billing-renew-expiring"
            />
          )}
          {graceEnt[0] && (
            <RenewCard
              tone="danger"
              icon={<XCircle size={16} color={colors.text.danger} />}
              title="Tu plan venció — periodo de gracia"
              body={graceEnt[0].graceUntil
                ? `Reactiva antes del ${formatDate(graceEnt[0].graceUntil)} (${daysCopy(graceEnt[0])}) para conservar tus beneficios.`
                : 'Reactiva pronto para conservar tus beneficios.'}
              cta="Reactivar ahora"
              onPress={() => goRenew(graceEnt[0])}
              testID="billing-renew-grace"
            />
          )}
          {expiredEnt[0] && (
            <RenewCard
              tone="neutral"
              icon={<XCircle size={16} color={colors.textSecondary} />}
              title="Tu plan venció"
              body="Contrata de nuevo para volver a disfrutar de los beneficios."
              cta="Contratar de nuevo"
              onPress={() => goRenew(expiredEnt[0])}
              testID="billing-renew-expired"
            />
          )}

          {/* Derechos activos */}
          <Text style={s.sectionTitle}>Derechos activos</Text>
          {activeEnt.length === 0 ? (
            /*
              Vacío con salida (D-17) con el componente del kit. `ModulePlans` se queda DEBAJO
              y fuera: el kit no tiene hueco para hijos sueltos, así que una acción con varias
              opciones vive fuera. De paso, los textos pasan del 14/12 escritos a mano al 15/13,5
              del kit — ese 12 rompía el suelo de 13 px de las pantallas de dinero (Fase 1).
            */
            <>
              <EmptyState
                icono={<Package size={40} color={colors.textSecondary} />}
                titulo="Sin derechos activos"
                texto="Compra un plan para activar tus derechos (publicar, destacar, tienda…)."
              />
              <ModulePlans />
            </>
          ) : (
            activeEnt.map((e) => {
              const mod = e.module || moduleOf(e.code);
              return (
                <View key={e.id} style={[s.entitleCard, { borderColor: brand.success, backgroundColor: alpha(brand.success, 0.06) }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                    <BadgeCheck size={16} color={colors.text.success} />
                    <Text style={{ flex: 1, fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>
                      {entitlementLabel(e.code, e.module)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>
                    {MODULE_LABEL[mod] ?? 'Plan'}{e.expiresAt ? ` · vence el ${formatDate(e.expiresAt)}${e.daysLeft != null ? ` (${e.daysLeft} días)` : ''}` : ' · vigencia permanente'}
                  </Text>
                </View>
              );
            })
          )}

          {/* Órdenes */}
          <Text style={[s.sectionTitle, { marginTop: espaciado.e20 }]}>Mis órdenes</Text>
          {orders.length === 0 ? (
            <EmptyState
              compacto
              icono={<Receipt size={26} color={colors.textSecondary} />}
              titulo="Todavía no has comprado nada"
              texto="Aquí aparecerá cada compra de plan, con su estado y su reembolso si lo hubiera."
            />
          ) : (
            orders.map((o) => {
              const stKey = o.status === 'approved' && o.refundStatus === 'partially_refunded' ? 'refund_status_partial' : o.status;
              const st = STATUS_LABELS[stKey] ?? { label: o.status, color: colors.textSecondary };
              const mod = o.module || moduleOf(o.planCode);
              const reason = o.status === 'cancelled' ? o.cancellationReason
                : o.status === 'reversed' ? o.reversalReason
                : o.status === 'refunded' ? 'Se aplicó un reembolso sobre esta orden.'
                : null;
              return (
                <View key={o.id} style={[s.orderCard, { borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>{o.planName}</Text>
                      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                        {MODULE_LABEL[mod] ?? ''} · {formatXAF(o.amountXaf)} · {new Date(o.createdAt).toLocaleDateString('es-GQ')}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: radios.marca, backgroundColor: alpha(st.color, 0.12) }}>
                      <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: st.color }}>{st.label}</Text>
                    </View>
                  </View>
                  {o.status === 'rejected' && o.rejectionReason ? (
                    <Text style={{ fontSize: tipografia.micro, color: colors.text.danger, fontWeight: peso.medio, marginTop: espaciado.e8 }}>Motivo: {o.rejectionReason}</Text>
                  ) : null}
                  {reason ? (
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: peso.medio, marginTop: espaciado.e8 }}>{reason}</Text>
                  ) : null}
                  {(o.status === 'pending_payment' || o.status === 'rejected') && (
                    <View style={{ marginTop: espaciado.e10, gap: espaciado.e8 }}>
                      <PrimaryButton
                        title="Ir al pago / re-subir comprobante"
                        onPress={() => router.push({ pathname: '/billing-checkout', params: { orderId: o.id } } as any)}
                      />
                      {o.status === 'pending_payment' && (
                        <Pressable
                          onPress={() => cancelOrder(o.id)}
                          disabled={!!cancellingOrderId}
                          accessibilityRole="button"
                          accessibilityLabel="Cancelar orden"
                          testID={`billing-cancel-order-${o.id.slice(0, 8)}`}
                          style={{ paddingVertical: espaciado.e10, alignItems: 'center', opacity: cancellingOrderId ? 0.6 : 1 }}
                        >
                          {cancellingOrderId === o.id ? (
                            <ActivityIndicator size="small" color={colors.text.danger} />
                          ) : (
                            <Text style={{ fontSize: tipografia.caption, color: colors.text.danger, fontWeight: peso.fuerte }}>Cancelar orden</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      {/* Confirmación en HOJA (antes: modal del sistema) */}
      <Sheet
        visible={!!ordenACancelar}
        title="¿Cancelar esta orden?"
        subtitle="Se cancelará la orden pendiente de pago. Si ya hiciste una transferencia, escríbenos para el reembolso."
        busy={!!cancellingOrderId}
        onClose={() => setOrdenACancelar(null)}
      >
        <PrimaryButton
          title="Sí, cancelar"
          variant="danger"
          onPress={() => { if (ordenACancelar) void cancelarDeVerdad(ordenACancelar); }}
        />
        <GhostButton title="No, dejarla como está" onPress={() => setOrdenACancelar(null)} />
      </Sheet>

      {/* Aviso que aparece y se va */}
      <Aviso
        visible={!!aviso}
        mensaje={aviso ?? ''}
        tono="exito"
        onOcultar={() => setAviso(null)}
      />

      {/* Reembolso: cuando se ha cancelado algo, el camino para pedirlo está a la vista */}
      {aviso ? (
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: 104 }}>
          <GhostButton
            title="Pedir el reembolso por WhatsApp"
            onPress={() => { void whatsappSoporte('Hola, cancelé una orden y ya había pagado. Quiero el reembolso.'); }}
          />
        </View>
      ) : null}
    </View>

  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

/** Accesos rápidos a las pantallas de planes por módulo (vacíos y CTAs). */
function ModulePlans() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: espaciado.e8, marginTop: espaciado.e14 }}>
      {Object.entries(MODULE_ROUTES).map(([mod, route]) => (
        <Pressable
          key={mod}
          onPress={() => router.push(route as any)}
          accessibilityRole="button"
          accessibilityLabel={`Ver planes de ${MODULE_LABEL[mod] ?? mod}`}
          testID={`billing-plans-${mod}`}
          style={({ pressed }) => [
            s_card.planChip,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ color: colors.text.primary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>{MODULE_LABEL[mod] ?? mod}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function RenewCard({ tone, icon, title, body, cta, onPress, testID }: {
  tone: 'warn' | 'danger' | 'neutral'; icon: React.ReactNode; title: string; body: string; cta: string; onPress: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  const border = tone === 'warn' ? brand.warning : tone === 'danger' ? brand.danger : colors.border;
  const bg = tone === 'warn' ? alpha(brand.warning, 0.08) : tone === 'danger' ? alpha(brand.danger, 0.07) : colors.surface;
  const titleColor = tone === 'warn' ? brand.warningText : tone === 'danger' ? brand.dangerText : colors.textPrimary;
  const bodyColor = tone === 'danger' ? brand.dangerText : colors.textSecondary;
  return (
    <View style={[s_card.entitleCard, { borderColor: border, backgroundColor: bg, marginBottom: espaciado.e10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
        {icon}
        <Text style={{ flex: 1, fontSize: tipografia.body, fontWeight: peso.fuerte, color: titleColor }}>{title}</Text>
      </View>
      <Text style={{ fontSize: tipografia.caption, color: bodyColor, marginTop: espaciado.e4 }}>{body}</Text>
      <View style={{ marginTop: espaciado.e8 }}><PrimaryButton title={cta} onPress={onPress} testID={testID} /></View>
    </View>
  );
}

function SkeletonHeader({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: espaciado.e16 }}>
      <View style={{ height: 16, borderRadius: radios.punta, backgroundColor: colors.border, width: '55%', alignSelf: 'center' }} />
    </View>

  );
}

const s_card = StyleSheet.create({
  entitleCard: { borderRadius: radios.md, padding: espaciado.e14, borderWidth: trazo.fino },
  planChip: { paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, borderRadius: radios.panel, borderWidth: trazo.fino },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    sectionTitle: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo, color: c.textPrimary, marginBottom: espaciado.e10 },
    empty: { fontSize: tipografia.caption, color: c.textSecondary, textAlign: 'center', marginVertical: espaciado.e16 },
    entitleCard: { borderRadius: radios.md, padding: espaciado.e14, borderWidth: trazo.fino, marginBottom: espaciado.e8 },
    orderCard: { borderRadius: radios.md, padding: espaciado.e14, borderWidth: trazo.fino, marginBottom: espaciado.e10 },
  });
