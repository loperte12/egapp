/**
 * MyTicketsScreen — Mis tickets (Ciudad a Ciudad).
 * Tickets donde soy COMPRADOR (buyer) o VIAJERO (teléfono del perfil).
 * Cada tarjeta expande el QR del ticket. Ruta: /my-tickets
 */

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ticket, ChevronDown, ChevronUp } from 'lucide-react-native';
import { alpha, EmptyState, espaciado, GhostButton, InlineError, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';
import { intercityApi, IcTicket } from '../api/intercity';
import { brand } from '@egrouteplan/ui-kit';

const stateLabel = (s: string) =>
  s === 'confirmed' ? 'Confirmado' : s === 'proposed' ? 'Tarifa propuesta' : s === 'cancelled' ? 'Cancelado' : s;

export default function MyTicketsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone } = useSession();

  const [tickets, setTickets] = useState<IcTicket[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setTickets(await intercityApi.myBookings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shareWhatsApp = (t: IcTicket) => {
    const msg = `🧾 Ticket EG Route Plan\n${t.trip?.route?.originDistrict ?? ''} → ${t.trip?.route?.destinationDistrict ?? ''}\n${t.trip ? new Date(t.trip.departureTime).toLocaleString('es') : ''}\n${t.seatCount} asiento(s) · ${Number(t.totalPrice).toLocaleString('es')} XAF\nCódigo: ${t.shortCode ?? t.ticketQrCode}`;
    Linking.openURL(`https://wa.me/${t.passenger?.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`).catch(() => {});
  };

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Mis tickets</Text>
        <View style={{ width: 22 }} />
      </View>

      {/*
        LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes era un ScrollView con .map(),
        que pinta y mantiene TODOS los tickets en memoria. Con muchos viajes reservados, la pantalla
        se atasca justo cuando el usuario busca su código para enseñárselo al conductor.
      */}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          /*
          Un `View` con el hueco del contenedor, y no un fragmento: el `gap` de
          `contentContainerStyle` separa CELDAS, y `ListHeaderComponent` es UNA celda. Con un
          fragmento, todo lo de aquí dentro quedaba pegado (era gap: espaciado.e12 antes de virtualizar).
          */
          <View style={{ gap: espaciado.e12 }}>
            {error ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={error} /></View> : null}
            {loading && <Text style={{ color: colors.textSecondary, fontWeight: '700', textAlign: 'center' }}>Cargando…</Text>}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icono={<Ticket size={40} color={colors.textSecondary} />}
              titulo="Todavía no tienes tickets"
              texto="Cuando reserves un asiento en Ciudad a Ciudad, tu ticket aparecerá aquí con su código para enseñárselo al conductor."
              accionLabel="Buscar viajes"
              onAccion={() => router.push('/intercity' as any)}
            />
          ) : null
        }
        renderItem={({ item: t }) => {
          const open = openId === t.id;
          const cancelled = t.status === 'cancelled';
          const isBuyer = t.buyerPhone && phone && t.buyerPhone === phone;
          return (
            <Pressable onPress={() => setOpenId(open ? null : t.id)} style={[s.card, { borderColor: cancelled ? colors.border : colors.primary, opacity: cancelled ? 0.6 : 1 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15 }}>
                  {t.trip?.route?.originDistrict ?? ''} → {t.trip?.route?.destinationDistrict ?? ''}
                </Text>
                {open ? <ChevronUp size={18} color={colors.primary} /> : <ChevronDown size={18} color={colors.primary} />}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                {t.trip ? new Date(t.trip.departureTime).toLocaleString('es') : ''} · {t.seatCount} asiento(s) · {Number(t.totalPrice).toLocaleString('es')} XAF
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                {stateLabel(t.status)}
                {t.payOn === 'destination' ? ' · 💵 paga al llegar al destino' : t.paymentStatus === 'paid' ? ' · ✅ pagado' : ' · 💵 al abordar'}
                {t.fareStatus === 'proposed' ? ' · 💬 tarifa propuesta' : ''}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                🎫 Viajero: {t.passenger?.firstName} {t.passenger?.lastName} · {isBuyer ? 'comprado por ti' : `comprado por ${t.buyerName || 'otra persona'}`}
              </Text>

              {open && (
                <View style={[s.qrBox, { borderColor: colors.primary }]}>
                  <Ticket size={22} color={colors.primary} />
                  <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: 2 }}>{t.shortCode ?? t.ticketQrCode}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600', textAlign: 'center' }}>
                    {t.ticketQrCode} · muestra este código al conductor{t.payOn === 'destination' ? '; el viajero paga al llegar al destino' : ''}
                  </Text>
                  {t.passenger?.phone && (
                    <Pressable onPress={() => shareWhatsApp(t)} style={[s.waBtn, { backgroundColor: brand.whatsapp }]}>
                      <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.caption }}>Enviar por WhatsApp</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    content: { padding: espaciado.e20, gap: espaciado.e12 },
    card: { borderRadius: radios.lg, borderWidth: 1.5, padding: espaciado.e14, gap: espaciado.e5 },
    qrBox: { alignItems: 'center', gap: espaciado.e6, borderWidth: 2, borderStyle: 'dashed', borderRadius: 14, padding: espaciado.e16, marginTop: espaciado.e8 },
    waBtn: { borderRadius: 10, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, marginTop: espaciado.e4 },
  });
