/**
 * app/lifebook-dinero.tsx — EL DINERO DE MI TIENDA (panel del comerciante).
 *
 * ── POR QUÉ EXISTE (decisión del dueño, 18/09/2026) ─────────────────────────────
 * «Sin esto el vendedor no sabe si gana dinero dentro de la app»: hasta ahora la tienda cobraba en mano
 * y no tenía dónde mirar cuánto había vendido, cuánto se queda la plataforma y cuánto le falta por
 * cobrar. El servidor ya lo sabe (`GET /lifebook/commerce/money/balance`, con la comisión congelada por
 * pedido y el libro de doble partida detrás); esta pantalla es la puerta.
 *
 * ── LO QUE ENSEÑA, Y POR QUÉ ASÍ ────────────────────────────────────────────────
 *   · **Facturado** (lo que han pagado los compradores por sus productos, sin el reparto).
 *   · **Comisión** de la plataforma (8 % con mínimo de 500 XAF y tope del 40 %: lo decide el servidor).
 *   · **A pagar a la tienda** (facturado − comisión).
 *   · **Pendiente de cobrar**: lo que ya se le puede pagar.
 *   · **En espera**: lo de pedidos entregados hace menos de 7 días, porque el comprador todavía puede
 *     reclamar. Se dice con esas palabras para que nadie piense que se lo han quedado.
 *   · Las **liquidaciones** que ya se le hicieron (cuándo, cuánto y por cuántos pedidos).
 *
 * Los números los calcula el SERVIDOR: aquí no se suma ni se redondea nada, para que la pantalla y el
 * libro de cuentas no puedan decir cosas distintas.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, GhostButton, useTheme, tipografia, radios } from '@egrouteplan/ui-kit';
import { AlertCircle, ArrowLeft, Info, Wallet } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { commerceOrdersApi, type LbSaldoTienda } from '../api/commerce';
import { lbXaf } from '../constants/lifebook';

export default function LifeBookDineroScreen() {
  return (
    <AuthGate>
      <DineroContent />
    </AuthGate>
  );
}

function DineroContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [saldo, setSaldo] = useState<LbSaldoTienda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const mounted = useRef(true);

  const cargar = useCallback(async (shopId?: string) => {
    setCargando(true);
    try {
      const r = await commerceOrdersApi.saldo(shopId);
      if (mounted.current) { setSaldo(r); setError(null); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el dinero de la tienda');
    } finally {
      if (mounted.current) setCargando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    cargar();
    return () => { mounted.current = false; };
  }, [cargar]));

  if (error && !saldo) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24, gap: 12 }]}>
        <AlertCircle size={34} color={colors.danger} />
        <Text style={{ color: colors.textPrimary, fontWeight: '800', textAlign: 'center' }}>{error}</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }
  if (!saldo) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const fila = (etiqueta: string, valor: string, destacado = false) => (
    <View key={etiqueta} style={[styles.fila, { borderBottomColor: alpha(colors.border, 0.4) }]}>
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, flex: 1 }}>{etiqueta}</Text>
      <Text style={{ color: destacado ? colors.primary : colors.textPrimary, fontSize: destacado ? 16 : 14, fontWeight: '800' }}>
        {valor}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle, marginLeft: 10, flex: 1 }} numberOfLines={1}>
          El dinero de mi tienda
        </Text>
        <Wallet size={18} color={colors.primary} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar(saldo.shop.id)} tintColor={colors.primary} />}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '900' }}>{saldo.shop.name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 2 }}>
          {saldo.pedidos === 1 ? '1 pedido entregado' : `${saldo.pedidos} pedidos entregados`}
        </Text>

        {/* Si la cuenta tiene más de una tienda, se puede cambiar sin salir. */}
        {saldo.tiendas.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {saldo.tiendas.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => cargar(t.id)}
                accessibilityRole="button"
                accessibilityLabel={`Ver el dinero de ${t.name}`}
                style={[styles.chip, {
                  borderColor: t.id === saldo.shop.id ? colors.primary : alpha(colors.border, 0.9),
                  backgroundColor: t.id === saldo.shop.id ? alpha(colors.primary, 0.12) : 'transparent',
                }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>{t.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Lo que hay que cobrar, en grande: es lo que el vendedor viene a ver. */}
        <View style={[styles.tarjeta, { borderColor: alpha(colors.border, 0.6), marginTop: 14 }]}>
          {fila('Pendiente de cobrar', lbXaf(saldo.pendienteXaf), true)}
          {fila('En espera (7 días para reclamar)', lbXaf(saldo.enEsperaXaf))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12 }}>
            <Info size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, flex: 1 }}>
              El dinero de un pedido entregado hace menos de 7 días espera a que el comprador ya no pueda
              reclamar. No se ha perdido: se paga después.
            </Text>
          </View>
        </View>

        <Text style={[styles.seccion, { color: colors.textPrimary }]}>Lo que has vendido</Text>
        <View style={[styles.tarjeta, { borderColor: alpha(colors.border, 0.6) }]}>
          {fila('Facturado (productos)', lbXaf(saldo.facturadoXaf))}
          {fila('Comisión de la plataforma', saldo.comisionXaf > 0 ? `−${lbXaf(saldo.comisionXaf)}` : lbXaf(0))}
          {fila('A pagar a tu tienda', lbXaf(saldo.aPagarTotalXaf), true)}
        </View>

        <Text style={[styles.seccion, { color: colors.textPrimary }]}>Liquidaciones</Text>
        {saldo.liquidaciones.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
            Todavía no se te ha liquidado nada. Cuando venza la ventana de reclamación, lo pendiente
            aparecerá aquí con su fecha.
          </Text>
        ) : (
          <View style={[styles.tarjeta, { borderColor: alpha(colors.border, 0.6) }]}>
            {saldo.liquidaciones.map((l) => (
              <View key={l.id} style={[styles.fila, { borderBottomColor: alpha(colors.border, 0.4) }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '700' }}>{lbXaf(l.importeXaf)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>
                    {new Date(l.pagadoAt).toLocaleDateString()} · {l.pedidos === 1 ? '1 pedido' : `${l.pedidos} pedidos`}
                    {l.nota ? ` · ${l.nota}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.success, fontSize: tipografia.caption, fontWeight: '800' }}>Pagada</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 18 }}>
          <GhostButton title="Ver mis pedidos" onPress={() => router.push('/lifebook-orders' as never)} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tarjeta: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14 },
  fila: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  seccion: { fontSize: tipografia.body, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: radios.full, paddingHorizontal: 12, paddingVertical: 7 },
});
