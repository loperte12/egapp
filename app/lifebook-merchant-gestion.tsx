/**
 * lifebook-merchant-gestion — LA PARTE DE GESTIÓN DEL MERCADO (tienda de productos).
 *
 * ── PASO 2 DEL ESTÁNDAR (`ESTANDAR-ENTORNOS-DE-CONTROL.md` §5) ────────────────
 * El hotel ya está partido en dos: **HOY** (lo que caduca: gente esperando, dinero por cobrar) y
 * **GESTIÓN** (lo que se configura: catálogo, precios, fotos). El mercado estaba a medias: todo
 * mezclado en `lifebook-merchant`, que enseña a la vez las alertas del día y el catálogo.
 * Esta pantalla es su parte de GESTIÓN, con la MISMA forma que la del hotel, para que las dos se
 * reconozcan. Si cada vertical inventara su estructura, el estándar no serviría de nada.
 *
 * Y lo que la hace útil no es la lista de enlaces —eso ya existía en el panel— sino que **dice lo
 * que falta**, con datos reales del servidor: publicaciones sin aprobar, rechazadas, sin
 * existencias y en borrador. Un dueño que no ve «5 sin existencias» no lo arregla, y esos cinco
 * no se pueden comprar.
 *
 * No hace peticiones nuevas: `dashboard()` ya devuelve todo esto (`products`, `alerts`, `shop`).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, radios, tipografia, useScreenGuard, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import {
  ArrowLeft, ChevronRight, Package, Settings, ShoppingBag, Store, TriangleAlert,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { commerceMerchantApi, type LbMerchantDashboard } from '../api/commerce';
import { ir as irSeguro } from '../constants/rutas';

export default function MerchantGestionScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

/** Un pendiente: qué falta, por qué importa y a dónde se va a arreglarlo. */
interface Pendiente { clave: string; texto: string; porque: string; ruta: string; }

function Contenido() {
  useScreenGuard();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [dash, setDash] = useState<LbMerchantDashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      setDash(await commerceMerchantApi.dashboard());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la gestión.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const p = dash?.products;
  const tienda = dash?.shop;

  /**
   * Lo que falta, por orden de lo que más cuesta en ventas perdidas.
   * El orden importa: «sin existencias» es dinero que no se puede cobrar hoy; «en borrador» es
   * algo que el dueño dejó a medias y quizá ya no quiere.
   */
  const pendientes: Pendiente[] = [];
  if (p) {
    if (p.outOfStock > 0) {
      pendientes.push({
        clave: 'agotado', texto: `${p.outOfStock} publicación(es) sin existencias`,
        porque: 'No se pueden comprar: reponer o pausar.',
        ruta: '/lifebook-merchant-products?f=agotado',
      });
    }
    if (p.pending > 0) {
      pendientes.push({
        clave: 'revision', texto: `${p.pending} esperando aprobación`,
        porque: 'La administración tiene que aprobarlas antes de que se vendan.',
        ruta: '/lifebook-merchant-products?f=pending',
      });
    }
    if (p.rejected > 0) {
      pendientes.push({
        clave: 'rechazadas', texto: `${p.rejected} rechazada(s)`,
        porque: 'Mira el motivo, corrígelas y vuelve a enviarlas.',
        ruta: '/lifebook-merchant-products?f=rejected',
      });
    }
    if (p.draft > 0) {
      pendientes.push({
        clave: 'borradores', texto: `${p.draft} en borrador`,
        porque: 'Están a medias: no las ve nadie hasta que las envíes a revisión.',
        // `?f=draft`, no «borrador»: la pantalla compara contra sus valores válidos y, si no
        // coincide, se queda en «Todos» EN SILENCIO. Un enlace que lleva a la lista entera
        // parece funcionar y no filtra nada.
        ruta: '/lifebook-merchant-products?f=draft',
      });
    }
  }

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.text.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={12} style={styles.volver}>
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>Gestión</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={2}>
            {tienda?.name ?? 'Tu tienda'} · lo que se configura, no lo del día
          </Text>
        </View>
      </View>

      {error ? (
        <View style={{ padding: espaciado.e16 }}>
          <Text style={{ color: colors.textSecondary, marginBottom: espaciado.e12 }}>{error}</Text>
          <GhostButton title="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          {!tienda ? (
            <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>Todavía no tienes tienda</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e5, lineHeight: 18 }}>
                Abre tu negocio para publicar productos y recibir pedidos. Aparecerá en el catálogo
                de Life Book y desde aquí llevarás su gestión.
              </Text>
              <View style={{ marginTop: espaciado.e12 }}>
                <GhostButton title="Abrir mi negocio" onPress={() => irSeguro.libre('/lifebook-sell')} />
              </View>
            </View>
          ) : (
            <>
              {/* Resumen del catálogo */}
              <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>
                  {p?.total ?? 0} publicación(es)
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4, lineHeight: 18 }}>
                  {p?.active ?? 0} a la venta
                  {p && p.hidden > 0 ? ` · ${p.hidden} oculta(s)` : ''}
                  {p && p.soldOut > 0 ? ` · ${p.soldOut} agotada(s)` : ''}
                  {dash?.orders ? ` · ${dash.orders.total} pedido(s) en total` : ''}
                </Text>
              </View>

              {/* LO QUE FALTA: la razón de ser de esta pantalla */}
              {pendientes.length ? (
                <View style={{ marginTop: espaciado.e18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e8 }}>
                    <TriangleAlert size={16} color={colors.text.secondary} />
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo, marginLeft: espaciado.e7 }}>
                      Te falta por completar ({pendientes.length})
                    </Text>
                  </View>
                  {pendientes.map((x) => (
                    <Pressable
                      key={x.clave}
                      onPress={() => {
                  /* La ruta trae su filtro dentro («/…?f=agotado»): el ayudante seguro necesita la ruta y
                     los parámetros POR SEPARADO. Con el «?» dentro del texto, la navegación se rechaza y
                     el usuario acaba en «No pudimos abrir esa pantalla» (lo reportó el dueño). */
                  const [ruta, query] = String(x.ruta ?? '').split('?');
                  const params: Record<string, string> = {};
                  for (const par of (query ?? '').split('&')) {
                    const [k, v] = par.split('=');
                    if (k) params[k] = decodeURIComponent(v ?? '');
                  }
                  irSeguro.libre(ruta, Object.keys(params).length ? params : undefined);
                }}
                      accessibilityRole="button"
                      accessibilityLabel={`${x.texto}. ${x.porque}`}
                      style={[styles.pendiente, { borderColor: alpha(colors.secondary, 0.35), backgroundColor: alpha(colors.secondary, 0.06) }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{x.texto}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3, lineHeight: 17 }}>{x.porque}</Text>
                      </View>
                      <ChevronRight size={18} color={colors.text.secondary} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={[styles.resumen, { borderColor: alpha(colors.success, 0.35), backgroundColor: alpha(colors.success, 0.07), marginTop: espaciado.e18 }]}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                    ✓ Tu catálogo está al día
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
                    Sin publicaciones rechazadas, sin borradores a medias y con existencias.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* A dónde se va desde aquí */}
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: espaciado.e22, marginBottom: espaciado.e8 }}>
            Configurar
          </Text>

          <Fila
            icono={<Package size={18} color={colors.text.primary} />}
            titulo="Publicaciones"
            detalle={p ? `${p.total} en total · precio, existencias y opciones de cada una` : 'Tu catálogo en Life Book'}
            onPress={() => irSeguro.libre('/lifebook-merchant-products')}
          />
          <Fila
            icono={<ShoppingBag size={18} color={colors.text.primary} />}
            titulo="Sin existencias"
            detalle={p?.outOfStock ? `${p.outOfStock} publicación(es) que no se pueden comprar ahora` : 'Ninguna agotada ahora mismo'}
            onPress={() => irSeguro.libre('/lifebook-merchant-products', { f: 'agotado' })}
          />
          <Fila
            icono={<TriangleAlert size={18} color={colors.text.primary} />}
            titulo="Esperando aprobación"
            detalle={p?.pending ? `${p.pending} en revisión por la administración` : 'Nada pendiente de aprobar'}
            onPress={() => irSeguro.libre('/lifebook-merchant-products?f=pending')}
          />
          <Fila
            icono={<Store size={18} color={colors.text.primary} />}
            titulo="Ajustes de la tienda"
            detalle="Nombre, dirección, logo, portada, formas de pago y envío"
            onPress={() => irSeguro.libre('/lifebook-merchant-settings')}
          />
          <Fila
            icono={<Settings size={18} color={colors.text.primary} />}
            titulo="Publicar algo nuevo"
            detalle="Producto, comida, servicio o alquiler: aparece en Life Book al enviarlo"
            onPress={() => irSeguro.libre('/lifebook-sell')}
          />

          <View style={{ marginTop: espaciado.e22 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e8 }}>
              Lo del día —pedidos nuevos, preparación, cobros y mensajes— está en la otra parte, «Hoy».
            </Text>
            <GhostButton title="Ir a «Hoy» (pedidos)" onPress={() => irSeguro.libre('/lifebook-merchant')} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** Fila de acceso: icono, título, detalle y flecha. 56 px de objetivo táctil. */
function Fila({ icono, titulo, detalle, onPress }: {
  icono: React.ReactNode; titulo: string; detalle: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${detalle}`}
      style={[styles.fila, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={[styles.filaIcono, { backgroundColor: alpha(colors.primary, 0.12) }]}>{icono}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{titulo}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 17 }}>{detalle}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  resumen: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e13 },
  pendiente: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56,
  },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e11,
    borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e12, marginBottom: espaciado.e8, minHeight: 56,
  },
  filaIcono: { width: 34, height: 34, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
});
