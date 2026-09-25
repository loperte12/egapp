/**
 * app/lifebook-merchant-settings.tsx — AJUSTES DE LA TIENDA · PANEL (Parte 39).
 *
 * Edita la ficha pública y la operativa: nombre, descripción, dónde está, cómo
 * cobra y cómo entrega. Todo con `PATCH /lifebook/commerce/my/shop` (la tienda
 * sale del token: aquí no se manda ningún `shopId`).
 *
 * Detalle importante ya resuelto en el servidor: la **política de envío se edita
 * en su sitio**, así que los productos ya publicados **no se quedan sin
 * entrega** al guardar (antes se borraba y se volvía a crear, y el producto
 * perdía su política por `ON DELETE SET NULL`).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, FormField, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { ArrowLeft, Store } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { absUrl } from '../api/config';
import { commerceApi, type LbPayMethod, type LbShop } from '../api/commerce';
import { Chip, ChipRow } from '../components/lifebook/Chip';
import { Notice, StepBlock } from '../components/lifebook/publish/PublishParts';
import { LB_CITIES } from '../constants/lifebook';
import { LB_COST_MODES, LB_COVERAGE, LB_PAY_METHODS, LB_REGIONS, LB_TRANSPORT, LB_VERIFICATION } from '../constants/commerce';
import { ir as irSeguro } from '../constants/rutas';

type Region = 'insular' | 'continental' | 'other';
type CostMode = 'fixed' | 'calculated' | 'on_request';

export default function MerchantSettingsScreen() {
  return (
    <AuthGate>
      <PanelGate><SettingsContent /></PanelGate>
    </AuthGate>
  );
}

function SettingsContent() {
  useScreenGuard();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [shop, setShop] = useState<LbShop | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  // Campos editables
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('Malabo');
  const [barrio, setBarrio] = useState('');
  const [region, setRegion] = useState<Region>('insular');
  const [referencia, setReferencia] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [pays, setPays] = useState<LbPayMethod[]>([]);
  // Envío
  const [envioNombre, setEnvioNombre] = useState('Mismo día');
  const [cobertura, setCobertura] = useState<string[]>(['same_city']);
  const [transportes, setTransportes] = useState<string[]>(['local_courier', 'taxi_moto', 'pickup']);
  const [tiempo, setTiempo] = useState('2-4 h');
  const [costMode, setCostMode] = useState<CostMode>('fixed');
  const [coste, setCoste] = useState('');
  const [porKm, setPorKm] = useState('');

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setRefrescando(true);
    try {
      const { shop: s } = await commerceApi.myShop();
      setShop(s);
      if (s) {
        setName(s.name);
        setDescription(s.description ?? '');
        setCity(s.city ?? 'Malabo');
        setBarrio(s.barrio ?? '');
        setRegion((s.region as Region) ?? 'insular');
        setReferencia(s.addressReference ?? '');
        setLogoUrl(s.logoUrl ?? '');
        setCoverUrl(s.coverUrl ?? '');
        setPays(s.paymentMethods.map((m) => m.method));
        const p = s.shippingPolicies[0];
        if (p) {
          setEnvioNombre(p.name);
          setCobertura(p.coverage ?? []);
          setTransportes(p.transportModes ?? []);
          setTiempo(p.estimatedTime ?? '');
          setCostMode(p.costMode);
          setCoste(p.baseCostXaf ? String(p.baseCostXaf) : '');
          setPorKm(p.perKmXaf ? String(p.perKmXaf) : '');
        }
      }
    } catch (e) {
      Alert.alert('Tienda', e instanceof Error ? e.message : 'No se pudo cargar la tienda');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) => {
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  };

  const guardar = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Tienda', 'El nombre necesita al menos 2 letras');
      return;
    }
    if (pays.length === 0) {
      Alert.alert('Pagos', 'Deja al menos una forma de cobro: si no, nadie podrá pagarte.');
      return;
    }
    setGuardando(true);
    setGuardado(false);
    try {
      const { shop: s } = await commerceApi.updateShop({
        name: name.trim(),
        description: description.trim() || undefined,
        city: city.trim() || undefined,
        barrio: barrio.trim() || undefined,
        region,
        addressReference: referencia.trim() || undefined,
        logoUrl: logoUrl.trim() || null,
        coverUrl: coverUrl.trim() || null,
        paymentMethods: pays,
        shippingPolicy: {
          name: envioNombre.trim() || 'Entrega',
          coverage: cobertura,
          transportModes: transportes,
          estimatedTime: tiempo.trim() || undefined,
          costMode,
          baseCostXaf: Number(coste.replace(/\D/g, '')) || 0,
          ...(costMode === 'calculated' ? { perKmXaf: Number(porKm.replace(/\D/g, '')) || 0 } : {}),
        },
      });
      setShop(s);
      setGuardado(true);
    } catch (e) {
      Alert.alert('Tienda', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const pagosOrdenados = useMemo(() => LB_PAY_METHODS, []);

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Cabecera onBack={() => router.back()} colors={colors} insets={insets} />
        <View style={{ alignItems: 'center', paddingTop: 70, gap: espaciado.e10 }}>
          <Store size={42} color={alpha(colors.primary, 0.45)} />
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>Todavía no tienes tienda</Text>
          <View style={{ minWidth: 220, marginTop: espaciado.e8 }}>
            <PrimaryButton title="Abrir mi tienda" onPress={() => irSeguro.libre('/lifebook-sell', undefined, true)} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Cabecera onBack={() => router.back()} colors={colors} insets={insets} />
      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 26 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar()} tintColor={colors.primary} />}
      >
        {guardado ? <Notice tone="ok">Cambios guardados. Los productos ya publicados mantienen su entrega y su estado.</Notice> : null}

        {/* Vista previa de la cabecera pública */}
        <View style={[styles.preview, { borderColor: colors.border }]}>
          {coverUrl ? (
            <Image source={absUrl(coverUrl)} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          ) : (
            <View style={[styles.cover, { backgroundColor: alpha(colors.primary, 0.12) }]} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginTop: -22, paddingHorizontal: espaciado.e12 }}>
            {logoUrl ? (
              <Image source={absUrl(logoUrl)} style={[styles.logo, { borderColor: colors.background }]} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            ) : (
              <View style={[styles.logo, { borderColor: colors.background, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                <Store size={20} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>{name || 'Mi tienda'}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                {LB_VERIFICATION[shop.verificationLevel]?.icon} {LB_VERIFICATION[shop.verificationLevel]?.label}
                {' · '}{shop.activeProducts ?? 0} publicados
              </Text>
            </View>
          </View>
        </View>

        <StepBlock title="Nombre de la tienda *">
          <FormField label="" value={name} onChangeText={setName} maxLength={80} placeholder="Ej.: Moda Paraíso" />
        </StepBlock>

        <StepBlock title="¿Qué vendes o qué servicio das?" hint="Aparece en tu ficha pública. Sin teléfonos ni enlaces.">
          <FormField label="" value={description} onChangeText={setDescription} maxLength={600} multiline placeholder="Ej.: ropa, teléfonos y arreglos de fontanería" />
        </StepBlock>

        <StepBlock title="Ciudad">
          <ChipRow>
            {LB_CITIES.slice(0, 6).map((c) => (
              <Chip key={c} label={c} active={city === c} onPress={() => setCity(c)} compact />
            ))}
          </ChipRow>
          <View style={{ marginTop: espaciado.e8 }}>
            <FormField label="" value={city} onChangeText={setCity} maxLength={60} placeholder="Otra ciudad" />
          </View>
        </StepBlock>

        <StepBlock title="Barrio o zona">
          <FormField label="" value={barrio} onChangeText={setBarrio} maxLength={60} placeholder="Ej.: Paraíso" />
        </StepBlock>

        <StepBlock title="Región">
          <ChipRow>
            {LB_REGIONS.map((r) => (
              <Chip key={r.id} label={r.label} active={region === r.id} onPress={() => setRegion(r.id)} compact />
            ))}
          </ChipRow>
        </StepBlock>

        <StepBlock title="Referencia para llegar" hint="Lo que dirías a un repartidor: «frente a la farmacia, portón verde».">
          <FormField label="" value={referencia} onChangeText={setReferencia} maxLength={200} placeholder="Detrás del mercado central" />
        </StepBlock>

        <StepBlock title="Logotipo y portada" hint="Se pega la dirección de la imagen (la misma que usas en tus publicaciones).">
          <FormField label="" value={logoUrl} onChangeText={setLogoUrl} autoCapitalize="none" placeholder="https://…/logo.jpg" />
          <View style={{ height: 8 }} />
          <FormField label="" value={coverUrl} onChangeText={setCoverUrl} autoCapitalize="none" placeholder="https://…/portada.jpg" />
        </StepBlock>

        <StepBlock title="Formas de cobro *" hint="Solo se muestra al comprador lo que marques aquí. El estado de cada método lo pone la plataforma.">
          <ChipRow>
            {pagosOrdenados.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                active={pays.includes(m.id)}
                onPress={() => alternar(pays as unknown as string[], (v) => setPays(v as LbPayMethod[]), m.id)}
                compact
              />
            ))}
          </ChipRow>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e8 }}>
            Contra entrega es la única que cobra con código de 4 dígitos al recibir.
          </Text>
        </StepBlock>

        <StepBlock title="Entrega" hint="Se edita en su sitio: los productos ya publicados no se quedan sin entrega.">
          <FormField label="Nombre de la tarifa" value={envioNombre} onChangeText={setEnvioNombre} maxLength={60} placeholder="Mismo día" />

          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, marginBottom: espaciado.e6 }}>Cobertura</Text>
          <ChipRow>
            {LB_COVERAGE.map((c) => (
              <Chip key={c.id} label={c.label} active={cobertura.includes(c.id)} onPress={() => alternar(cobertura, setCobertura, c.id)} compact />
            ))}
          </ChipRow>

          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, marginBottom: espaciado.e6 }}>Cómo se transporta</Text>
          <ChipRow>
            {LB_TRANSPORT.map((t) => (
              <Chip key={t.id} label={t.label} active={transportes.includes(t.id)} onPress={() => alternar(transportes, setTransportes, t.id)} compact />
            ))}
          </ChipRow>

          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, marginBottom: espaciado.e6 }}>Coste de la entrega</Text>
          <ChipRow>
            {LB_COST_MODES.map((m) => (
              <Chip key={m.id} label={m.label} active={costMode === m.id} onPress={() => setCostMode(m.id)} compact />
            ))}
          </ChipRow>

          <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e10 }}>
            <View style={{ flex: 1 }}>
              <FormField label="Coste base (XAF)" value={coste} onChangeText={(v) => setCoste(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="1500" />
            </View>
            {costMode === 'calculated' ? (
              <View style={{ flex: 1 }}>
                <FormField label="Por km (XAF)" value={porKm} onChangeText={(v) => setPorKm(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="300" />
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: espaciado.e10 }}>
            <FormField label="Tiempo estimado" value={tiempo} onChangeText={setTiempo} maxLength={40} placeholder="2-4 h" />
          </View>
        </StepBlock>

        <PrimaryButton title="Guardar cambios" loading={guardando} onPress={guardar} />

        <Pressable
          onPress={() => irSeguro.libre('/lifebook-merchant-products')}
          style={{ marginTop: espaciado.e18, alignItems: 'center' }}
        >
          <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Ir a mis publicaciones →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Cabecera({ onBack, colors, insets }: { onBack: () => void; colors: any; insets: { top: number } }) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
      <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Volver">
        <ArrowLeft size={20} color={colors.textPrimary} />
      </Pressable>
      <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, marginLeft: espaciado.e10, flex: 1 }}>
        Ajustes de la tienda
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  preview: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.lg, overflow: 'hidden', marginBottom: espaciado.e18 },
  cover: { width: '100%', height: 96 },
  logo: { width: 52, height: 52, borderRadius: radios.lg, borderWidth: trazo.anillo },
});
