/**
 * LandlordProfileScreen — perfil público del arrendador (kit rental).
 * Carga por landlordId desde el API (GET /rental/landlords/:id) con fallback
 * al objeto pasado por params (JSON). Muestra la LandlordCard en modo detail
 * con contacto (Llamar/WhatsApp directos) + sus anuncios activos.
 * Ruta: /landlord-profile?landlordId=… (o ?landlord=JSON)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, tipografia, ScreenHeader } from '@egrouteplan/ui-kit';
import { LandlordCard, type LandlordCardData } from '../components/rental/LandlordCard';
import { rentalApi, type RentalProperty } from '../api/rental';
import { PropertyCard } from '../components/rental/PropertyCard';

export default function LandlordProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ landlord?: string; landlordId?: string }>();

  const [landlord, setLandlord] = useState<LandlordCardData | null>(null);
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fallback = React.useMemo<LandlordCardData | null>(() => {
    try {
      return params.landlord ? (JSON.parse(params.landlord) as LandlordCardData) : null;
    } catch {
      return null;
    }
  }, [params.landlord]);

  const load = useCallback(async () => {
    try {
      if (params.landlordId) {
        const r = await rentalApi.landlordById(params.landlordId);
        setLandlord(r.landlord);
        setProperties(r.properties ?? []);
      } else if (fallback) {
        setLandlord(fallback);
        const list = await rentalApi.properties().catch(() => [] as RentalProperty[]);
        if (fallback.id) setProperties(list.filter((p) => p.landlord.id === fallback.id));
      } else {
        setError('Arrendador no encontrado');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  }, [params.landlordId, fallback]);

  useEffect(() => { load(); }, [load]);

  const s = styles(colors);
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!landlord) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.danger, fontWeight: '700' }}>{error ?? 'Arrendador no encontrado'}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Volver</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cabecera del kit desde el 24/09/2026. Esta era la ÚNICA de las 20 cuyo botón de volver no
          llevaba `accessibilityRole` ni etiqueta: al pasar al kit gana las dos. */}
      <ScreenHeader
        titulo="Perfil del anunciante"
        alVolver={() => router.back()}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <LandlordCard
          landlord={landlord}
          variant="detail"
          showViewProfile={false}
          showContactActions={true}
        />

        {/* Anuncios del arrendador */}
        {properties.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={s.sectionTitle}>Anuncios de {landlord.name}</Text>
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} onPress={() => router.push({ pathname: '/alquiler-detalle', params: { id: p.id } } as any)} onViewLandlord={(l) => router.push({ pathname: '/landlord-profile', params: { landlordId: l.id ?? '' } } as any)} />
            ))}
          </View>
        )}

        {/* Nota de respuesta */}
        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, textAlign: 'center', marginTop: 12 }}>
          {landlord.responseTimeHours != null ? `Tiempo medio de respuesta: ${landlord.responseTimeHours < 1 ? 'menos de 1 h' : `~${Math.round(landlord.responseTimeHours)} h`}` : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  sectionTitle: { fontSize: tipografia.subtitle, fontWeight: '700', color: c.textPrimary, marginBottom: 10 },
});
