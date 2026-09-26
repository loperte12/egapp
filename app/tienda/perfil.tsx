/**
 * Tienda — la pestaña de identidad del comerciante: quién es su negocio y en qué estado está.
 *
 * POR QUÉ ES UNA PESTAÑA Y NO UN FORMULARIO ESCONDIDO
 * Hasta el 20-sep-2026 los datos del negocio vivían dentro del formulario de publicación, en medio de
 * los campos del anuncio: para enterarse de que le faltaba el KYC o de que su tienda estaba en
 * revisión, el vendedor tenía que bajar por el título, el precio y las fotos. Los datos del negocio
 * son **identidad**, no un paso de publicación, y por eso tienen pestaña propia.
 *
 * LAS DOS COSAS QUE PASAN AQUÍ
 *  1. **Alta o actualización del negocio** (`upsertSeller`). Exige KYC aprobado: el botón se explica
 *     cuando falta, en vez de fallar al pulsar.
 *  2. **Estado de la solicitud**: activa, en revisión o rechazada con su motivo. Sin esto, «¿por qué
 *     no me aparece nada en el Mercado?» no tiene respuesta en la app.
 *
 * ⚠ TRAMPA DEL SERVIDOR QUE ESTA PANTALLA ESQUIVA
 * `upsertSeller` escribe la rama del negocio con `d.familyId ?? null`: **si no se envía, se borra la
 * que hubiera**. Por eso la pantalla guarda lo que devuelve `sellerMe()` y lo **reenvía tal cual**
 * aunque el vendedor no toque el selector.
 *
 * Y DESDE EL 21-SEP-2026 EL SELECTOR ESTÁ ABIERTO. Hasta hoy esta pantalla reenviaba la categoría sin
 * dejar cambiarla, y decía por qué: «no se deja elegir categoría todavía porque el conjunto de
 * categorías de tienda no está confirmado; inventarlo sería peor que no ofrecerlo». Ya está
 * confirmado —el árbol de tres niveles, con 18 departamentos y 110 familias—, así que el comerciante
 * elige departamento y familia. DOS niveles y no tres: la tienda describe de qué va el negocio, no
 * publica un artículo suelto, así que la hoja no le corresponde.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AlertTriangle, ChevronRight, FileText, PackagePlus, Store, TrendingUp,
} from 'lucide-react-native';
import {
  Aviso, FormField, GhostButton, InlineError, PrimaryButton, Sheet, alpha, brand, espaciado, icono,
  peso, radios, tipografia, trazo, useAviso, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseCategory, type EcomerseSellerMe, type EcomerseShopPlan } from '../../api/ecomerse';
import { FilaRequisito } from '../../components/ecomerse/FilaRequisito';
import { BARRA_TIENDA_H } from '../../components/ecomerse/BarraTienda';
import { CITIES } from '../../constants/data';

/** El estado de la tienda, dicho como se lo diría un humano al comerciante. */
const ESTADO_TIENDA: Record<string, { label: string; tono: 'bien' | 'aviso' | 'peligro' | 'neutro' }> = {
  active: { label: 'Aprobada y visible en el Mercado', tono: 'bien' },
  pending: { label: 'En revisión del administrador', tono: 'aviso' },
  rejected: { label: 'Rechazada', tono: 'peligro' },
  suspended: { label: 'Suspendida', tono: 'peligro' },
};

export default function TiendaPerfil() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [aviso, mostrarAviso, ocultarAviso] = useAviso();

  const [me, setMe] = useState<EcomerseSellerMe | null>(null);
  const [plan, setPlan] = useState<EcomerseShopPlan | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hojaCiudad, setHojaCiudad] = useState(false);

  /* Formulario. Se rellena con lo que ya hay; sin tienda, arranca vacío. */
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [telefono, setTelefono] = useState('');
  const [descripcion, setDescripcion] = useState('');
  /** Ver la TRAMPA de arriba: este valor se reenvía sin tocarlo o el servidor lo pone a NULL. */
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  /* EL ÁRBOL DE LA TIENDA: departamento y familia. Dos niveles y NO tres: una tienda no publica un
     artículo suelto, elige de qué va el negocio, así que la hoja no le corresponde. */
  const [cats, setCats] = useState<EcomerseCategory[]>([]);
  const [departamentoId, setDepartamentoId] = useState<string | null>(null);
  const [familiaId, setFamiliaId] = useState<string | null>(null);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError(null);
    try {
      const m = await ecomerseApi.sellerMe();
      setMe(m);
      if (m.seller) {
        setNombre(m.seller.businessName ?? '');
        setCiudad(m.seller.city ?? '');
        setTelefono(m.seller.phoneContact ?? '');
        setDescripcion(m.seller.description ?? '');
        setCategoriaId(m.seller.categoryId ?? null);
        setDepartamentoId(m.seller.departmentId ?? null);
        setFamiliaId(m.seller.familyId ?? null);
        /* El plan solo tiene sentido con tienda; si falla, no se tumba la pantalla entera: los datos
           del negocio son lo importante de esta pestaña. */
        try { setPlan(await ecomerseApi.shopPlan()); } catch { setPlan(null); }
      } else {
        setPlan(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar los datos de tu tienda.');
    } finally {
      setCargando(false); setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /* El árbol de categorías se pide UNA vez y aparte de `sellerMe`: son unas 630 filas y no cambia
     porque se refresque la pantalla. Si la llamada falla, la pestaña sigue entera —se puede
     actualizar el negocio sin el selector— y el vendedor no pierde lo que ya tenía; por eso el
     `catch` vacío y no un error en pantalla. */
  useEffect(() => {
    let vivo = true;
    ecomerseApi.categories()
      .then((c) => { if (vivo) setCats(c); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, []);

  const guardar = useCallback(async () => {
    if (!nombre.trim() || !ciudad.trim()) {
      mostrarAviso('El nombre del negocio y la ciudad son obligatorios', 'aviso');
      return;
    }
    setGuardando(true);
    try {
      const r = await ecomerseApi.upsertSeller({
        businessName: nombre.trim(),
        city: ciudad.trim(),
        description: descripcion.trim() || null,
        phoneContact: telefono.trim() || null,
        /* EL ÁRBOL DEL NEGOCIO. Se mandan departamento y familia. `categoryId` viaja además con el
           valor de la familia para que una versión anterior de la app —que solo conoce ese nombre—
           pueda seguir editando el negocio sin borrarle la rama: el servidor escribe `family_id` y,
           si no llega, cae a `categoryId`. Es el mismo campo por dos nombres, no dos verdades. */
        departmentId: departamentoId,
        familyId: familiaId,
        categoryId: familiaId ?? categoriaId,
      });
      mostrarAviso(r.message, r.status === 'active' ? 'exito' : 'neutro');
      await cargar(true);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'No se pudieron guardar los datos', 'aviso');
    } finally {
      setGuardando(false);
    }
  }, [nombre, ciudad, descripcion, telefono, categoriaId, departamentoId, familiaId, cargar, mostrarAviso]);

  const s = estilos(colors);
  const seller = me?.seller;
  const estado = seller ? (ESTADO_TIENDA[seller.status] ?? { label: seller.status, tono: 'neutro' as const }) : null;
  const tonoEstado = estado
    ? (estado.tono === 'bien' ? colors.success
      : estado.tono === 'aviso' ? colors.warning
        : estado.tono === 'peligro' ? colors.danger
          : colors.textSecondary)
    : colors.textSecondary;
  /* El MISMO estado en color de TEXTO: `tonoEstado` pinta también el borde y el fondo. */
  const tonoEstadoTxt = estado
    ? (estado.tono === 'bien' ? colors.text.success
      : estado.tono === 'aviso' ? colors.text.warning
        : estado.tono === 'peligro' ? colors.text.danger
          : colors.textSecondary)
    : colors.textSecondary;
  const activa = seller?.status === 'active';

  if (cargando) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        <View style={s.cabecera}><Text style={s.titulo}>Mi tienda</Text></View>
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          {[0, 1, 2].map((i) => <View key={i} style={[s.hueso, { backgroundColor: colors.border }]} />)}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        <View style={s.cabecera}><Text style={s.titulo}>Mi tienda</Text></View>
        <View style={{ padding: espaciado.e16 }}>
          <InlineError mensaje={error} onReintentar={() => cargar()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.raiz, { paddingTop: insets.top }]}>
      <View style={s.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>Mi tienda</Text>
          <Text style={s.subtitulo} numberOfLines={1}>
            {seller ? `${seller.businessName} · ${seller.city}` : 'Aún sin tienda'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: BARRA_TIENDA_H + insets.bottom + espaciado.e24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} />}
      >
        {/* ── Estado de la solicitud: la respuesta a «¿por qué no vendo nada?» ─────────────────── */}
        {seller && estado && (
          <View style={[s.tarjeta, { borderColor: alpha(tonoEstado, 0.35), backgroundColor: alpha(tonoEstado, 0.07), marginBottom: espaciado.e16 }]}>
            <Text style={[s.etiqueta, { color: tonoEstadoTxt }]}>ESTADO DE TU TIENDA</Text>
            <Text style={s.tituloBloque}>{estado.label}</Text>
            {seller.status === 'pending' && (
              <Text style={s.nota}>Suele tardar 24–48 h. Tus anuncios se publican cuando esté aprobada.</Text>
            )}
            {seller.status === 'rejected' && seller.rejectionReason ? (
              <Text style={[s.nota, { color: colors.text.danger }]}>Motivo: {seller.rejectionReason}</Text>
            ) : null}
          </View>
        )}

        {/* ── Requisitos: el mismo mapa de la portada, aquí en su sitio natural ───────────────── */}
        <View style={[s.tarjeta, { backgroundColor: alpha(colors.primary, 0.06), marginBottom: espaciado.e16 }]}>
          <Text style={s.etiqueta}>{activa ? 'REQUISITOS CUMPLIDOS' : 'PARA VENDER NECESITAS'}</Text>
          <FilaRequisito
            ok={!!me?.kycOk}
            label="Identidad verificada (KYC)"
            hint={me?.kycOk ? undefined : (me?.kycMessage ?? 'Toca para verificar')}
            onPress={me?.kycOk ? undefined : () => router.push('/driver-onboarding' as never)}
          />
          <FilaRequisito
            ok={!!seller?.businessName && !!seller?.city}
            label="Datos del negocio (nombre + ciudad)"
            hint={seller ? undefined : 'Se rellenan aquí abajo'}
          />
          <FilaRequisito
            ok={activa}
            label="Aprobación del administrador"
            hint={seller ? (activa ? undefined : 'Suele tardar 24–48 h') : 'Sin solicitud'}
          />
        </View>

        {/* ── Datos del negocio ──────────────────────────────────────────────────────────────── */}
        <Text style={s.tituloBloque}>{seller ? 'Datos del negocio' : 'Alta de vendedor'}</Text>
        <Text style={s.nota}>
          El nombre y la ciudad se ven en cada anuncio y en la página de tu tienda. Cámbialos aquí y se
          actualizan en el Mercado.
        </Text>

        <View style={{ marginTop: espaciado.e12, gap: espaciado.e12 }}>
          <FormField value={nombre} onChangeText={setNombre} placeholder="Nombre del negocio *" />
          <Pressable
            onPress={() => setHojaCiudad(true)}
            accessibilityRole="button"
            accessibilityLabel={ciudad ? `Ciudad: ${ciudad}. Toca para cambiarla` : 'Elegir ciudad'}
            style={({ pressed }) => [s.selector, {
              backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={[s.textoSelector, { color: ciudad ? colors.textPrimary : colors.textSecondary }]}>
              {ciudad ? `📍 ${ciudad}` : 'Ciudad * (elige)'}
            </Text>
            <Text style={s.nota}>▾</Text>
          </Pressable>
          <FormField value={telefono} onChangeText={setTelefono} placeholder="Teléfono / WhatsApp (+240…)" keyboardType="phone-pad" />
          <TextInput
            multiline
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Describe tu negocio…"
            placeholderTextColor={colors.textSecondary}
            style={[s.area, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          />
          {/* LA RAMA DEL NEGOCIO. Dos escalones, no tres. Antes esta pantalla REENVIABA la categoría
              que hubiera sin dejar cambiarla, y estaba anotado aquí arriba por qué: «no se deja
              elegir categoría todavía porque el conjunto de categorías de tienda no está
              confirmado». Ya lo está —18 departamentos · 110 familias—, así que se elige.
              El selector solo aparece si el árbol llegó: sin él, el negocio se sigue pudiendo
              actualizar y no se le borra la rama que ya tuviera. */}
          {cats.length > 0 ? (
            <View>
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginBottom: espaciado.e6 }}>¿De qué va tu negocio? *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8 }}>
                {cats.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => { setDepartamentoId(departamentoId === c.id ? null : c.id); setFamiliaId(null); }}
                    accessibilityRole="button"
                    accessibilityLabel={c.label}
                    style={{
                      paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg,
                      backgroundColor: departamentoId === c.id ? colors.primary : colors.surface,
                      borderWidth: trazo.fino, borderColor: departamentoId === c.id ? colors.primary : colors.border,
                      flexDirection: 'row', alignItems: 'center', gap: espaciado.e4,
                    }}
                  >
                    <Text style={{ fontSize: tipografia.body }}>{c.icon ?? ''}</Text>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: departamentoId === c.id ? brand.white : colors.textPrimary }}>{c.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {departamentoId && (() => {
                const dep = cats.find((c) => c.id === departamentoId);
                if (!dep || !dep.familias?.length) return null;
                return (
                  <>
                    <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: colors.textPrimary, marginTop: espaciado.e10, marginBottom: espaciado.e6 }}>Y en concreto *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8 }}>
                      {dep.familias.map((f) => (
                        <Pressable
                          key={f.id}
                          onPress={() => setFamiliaId(familiaId === f.id ? null : f.id)}
                          accessibilityRole="button"
                          accessibilityLabel={f.label}
                          style={{
                            paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.lg,
                            backgroundColor: familiaId === f.id ? colors.primary : colors.surface,
                            borderWidth: trazo.fino, borderColor: familiaId === f.id ? colors.primary : colors.border,
                          }}
                        >
                          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: familiaId === f.id ? brand.white : colors.textPrimary }}>{f.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                );
              })()}
            </View>
          ) : seller?.categoryLabel ? (
            <Text style={s.nota}>Rama del negocio: {seller.categoryLabel}</Text>
          ) : null}
          <PrimaryButton
            title={guardando ? 'Guardando…' : (seller ? 'Actualizar negocio' : 'Solicitar alta como vendedor')}
            onPress={() => void guardar()}
            disabled={guardando || !me?.kycOk}
          />
          {!me?.kycOk && (
            <Text style={s.nota}>
              Verifica tu identidad (KYC) para poder dar de alta el negocio. Es el primer paso y solo se hace una vez.
            </Text>
          )}
        </View>

        {/* ── Plan: el techo de anuncios, dicho antes de chocar con él ───────────────────────── */}
        {activa && plan && (
          <View style={{ marginTop: espaciado.e24 }}>
            <Text style={s.tituloBloque}>Tu plan</Text>
            <Pressable
              onPress={() => router.push('/ecomerse-planes' as never)}
              accessibilityRole="button"
              accessibilityLabel={`${plan.name}: ${plan.used} de ${plan.limit} anuncios usados. Ver planes.`}
              style={({ pressed }) => [s.acceso, {
                backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1,
              }]}
            >
              <TrendingUp size={icono.sm} color={colors.text.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.textoAcceso}>{plan.name}</Text>
                <Text style={s.nota}>
                  {plan.used} de {plan.limit} anuncios{plan.expiresAt ? ` · activo hasta ${plan.expiresAt.slice(0, 10)}` : ''}
                </Text>
              </View>
              <ChevronRight size={icono.sm} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* ── Accesos ───────────────────────────────────────────────────────────────────────── */}
        <View style={{ marginTop: espaciado.e24, gap: espaciado.e8 }}>
          <Text style={s.tituloBloque}>Accesos</Text>
          <Atajo Icono={PackagePlus} label="Publicar un anuncio" detalle="Sube fotos, precio y categoría" onPress={() => router.push('/tienda/publicar' as never)} colors={colors} />
          {seller && (
            <Atajo Icono={Store} label="Ver mi tienda como la ve un cliente" detalle="Página pública con tus anuncios" onPress={() => router.push(`/ecomerse-tienda?id=${seller.id}` as never)} colors={colors} />
          )}
          <Atajo Icono={FileText} label="Documentos de mis anuncios" detalle="Facturas y certificados en revisión" onPress={() => router.push('/ecomerse-docs' as never)} colors={colors} />
        </View>

        {/* La garantía es de la plataforma, no del vendedor: se dice para que nadie prometa lo que no
            le toca. Es el mismo aviso que la ficha y el checkout. */}
        {activa && (
          <Text style={[s.nota, { marginTop: espaciado.e24 }]}>
            Los {me?.warrantyDays ?? 7} días de garantía los ofrece EG Route Plan, no tú: el comprador los
            tiene en cualquier caso. Las devoluciones de arriba son tu oferta aparte.
          </Text>
        )}

        {seller?.status === 'rejected' && seller.rejectionReason ? (
          <View style={{ marginTop: espaciado.e16, flexDirection: 'row', gap: espaciado.e8, alignItems: 'flex-start' }}>
            <AlertTriangle size={icono.sm} color={colors.text.danger} />
            <Text style={[s.nota, { flex: 1, color: colors.text.danger }]}>
              Corrige los datos y vuelve a solicitar el alta: {seller.rejectionReason}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Aviso visible={aviso.visible} mensaje={aviso.mensaje} tono={aviso.tono} onOcultar={ocultarAviso} />

      {/* Selector de ciudad en hoja: la lista es larga (varias provincias) y no cabe en línea. */}
      <Sheet visible={hojaCiudad} title="Ciudad del negocio" position="bottom" onClose={() => setHojaCiudad(false)}>
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          {CITIES.map((c) => {
            const on = c.name === ciudad;
            return (
              <Pressable
                key={c.id}
                onPress={() => { setCiudad(c.name); setHojaCiudad(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${c.name}, ${c.region}`}
                style={({ pressed }) => [s.filaCiudad, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.textoSelector, { color: colors.textPrimary }]}>{c.name}</Text>
                  <Text style={s.nota}>{c.region}</Text>
                </View>
                {on && <Text style={[s.marca, { color: colors.text.primary }]}>✓</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ marginTop: espaciado.e8 }}>
          <GhostButton title="Cerrar" onPress={() => setHojaCiudad(false)} />
        </View>
      </Sheet>
    </View>
  );
}

/** Un acceso con título y detalle. La descripción evita el icono sin leyenda. */
function Atajo({ Icono, label, detalle, onPress, colors }: {
  Icono: typeof Store; label: string; detalle: string; onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detalle}`}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
        backgroundColor: colors.card, borderColor: colors.border, borderWidth: trazo.fino,
        borderRadius: radios.md, padding: espaciado.e12, opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Icono size={icono.sm} color={colors.text.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }} numberOfLines={1}>{detalle}</Text>
      </View>
      <ChevronRight size={icono.sm} color={colors.textSecondary} />
    </Pressable>
  );
}

const estilos = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  cabecera: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino, borderBottomColor: c.border,
  },
  titulo: { fontSize: tipografia.title, fontWeight: peso.titulo, color: c.textPrimary },
  subtitulo: { fontSize: tipografia.caption, color: c.textSecondary, marginTop: espaciado.e2 },
  hueso: { height: 84, borderRadius: radios.md, opacity: 0.6 },
  tarjeta: { borderRadius: radios.md, padding: espaciado.e12, borderWidth: trazo.fino, borderColor: c.border },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.fuerte, color: c.textSecondary, letterSpacing: 0.4, marginBottom: espaciado.e4 },
  tituloBloque: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary, marginBottom: espaciado.e8 },
  nota: { fontSize: tipografia.micro, color: c.textSecondary, lineHeight: 16, marginTop: espaciado.e2 },
  selector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12,
  },
  textoSelector: { fontSize: tipografia.body, fontWeight: peso.medio },
  area: {
    minHeight: 92, borderRadius: radios.md, borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12, fontSize: tipografia.body, textAlignVertical: 'top',
  },
  acceso: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e12,
  },
  textoAcceso: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: c.textPrimary },
  filaCiudad: { flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino },
  marca: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
});
