/**
 * AgenteScreen — PANEL DEL AGENTE DE CAJA (/agente). Parche 96 + pantalla nativa.
 *
 * Hasta hoy el agente no tenía NADA: los únicos endpoints del agente eran los POST
 * de confirmación, así que entraba y no veía su trabajo («el panel sigue sin
 * estado»). Ahora tiene su cola real:
 *
 *   · EFECTIVO — operaciones que el cliente ya inició desde su monedero y que
 *     esperan a que el agente confirme con el código que el cliente le enseña
 *     (recibir = CASH_IN, entregar = CASH_OUT).
 *   · RECADOS — compras protegidas asignadas: recoger del vendedor y entregar al
 *     comprador escaneando su QR (el escaneo de entrega libera el dinero).
 *
 * El acceso NO depende del rol del token (el JWT de la app nunca trae AGENT): el
 * servidor resuelve el perfil por userId, y este panel solo se abre para quien
 * tiene perfil de agente ACTIVE.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, BadgeCheck, Banknote, PackageCheck, PackageOpen, QrCode, RefreshCw,
} from 'lucide-react-native';
import { EmptyState, espaciado, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { PinSheet } from '@egrouteplan/ui-kit';
import { agentApi, type CargaDeTrabajo, type OperacionDeEfectivo, type RecadoEscrow } from '../api/agent';
import { useSession } from '../state/session';
import { brand } from '@egrouteplan/ui-kit';

export default function AgenteScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

const fmtXaf = (n: number) => `${Math.round(n).toLocaleString('es-GQ')} XAF`;

const ESTADO_RECADO: Record<string, { label: string; color: string }> = {
  AWAITING_PICKUP: { label: 'Por recoger del vendedor', color: brand.secondaryPressed },
  IN_TRANSIT_BY_AGENT: { label: 'En camino al comprador', color: brand.primaryPressed },
};

function Contenido() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = useSession();

  const [carga, setCarga] = useState<CargaDeTrabajo | null>(null);
  const [perfil, setPerfil] = useState<{ code: string; zone: string; dailyCashLimit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmación de efectivo: una operación a la vez, con el código del cliente.
  const [opActiva, setOpActiva] = useState<OperacionDeEfectivo | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [w, me] = await Promise.all([agentApi.workload(), agentApi.me()]);
      setCarga(w);
      setPerfil(me.agent ? { code: me.agent.code, zone: me.agent.zone, dailyCashLimit: me.agent.dailyCashLimit } : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar tu trabajo');
    } finally {
      setLoading(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, phone]);

  const confirmarEfectivo = async (otp: string) => {
    if (!opActiva || otpBusy) return;
    setOtpBusy(true); setOtpErr(null);
    try {
      if (opActiva.type === 'CASH_IN') await agentApi.confirmCashIn(opActiva.id, otp);
      else await agentApi.confirmCashOut(opActiva.id, otp);
      setAviso(opActiva.type === 'CASH_IN'
        ? `Confirmado: ${fmtXaf(opActiva.amount)} acreditados a ${opActiva.user.name}.`
        : `Confirmado: entregaste ${fmtXaf(opActiva.amount)} a ${opActiva.user.name}.`);
      setOpActiva(null);
      await cargar(true);
    } catch (e) {
      setOtpErr(e instanceof Error ? e.message : 'No se pudo confirmar');
    } finally {
      setOtpBusy(false);
    }
  };

  const operaciones = carga?.operations ?? [];
  const recados = carga?.orders ?? [];
  const totalPendiente = operaciones.length + recados.length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Panel de agente</Text>
        <Pressable onPress={() => { setRefrescando(true); void cargar(true); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Actualizar">
          <RefreshCw size={19} color={colors.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingHorizontal: espaciado.e28 }}>{error}</Text>
          <Pressable onPress={() => void cargar()} style={[styles.retryBtn, { backgroundColor: colors.primary }]} accessibilityRole="button">
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />}
        >
          {/* Identidad del agente */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
              <BadgeCheck size={16} color={colors.primary} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>
                {perfil ? `${perfil.code} · ${perfil.zone}` : 'Agente'}
              </Text>
            </View>
            {perfil && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>
                Límite diario de efectivo: {fmtXaf(perfil.dailyCashLimit)}
              </Text>
            )}
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e10 }}>
              {totalPendiente === 0 ? 'Sin trabajo pendiente' : `${totalPendiente} tarea(s) esperando`}
            </Text>
          </View>

          {aviso ? (
            <View style={[styles.aviso, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{aviso}</Text>
            </View>
          ) : null}

          {/* ── Efectivo por confirmar ── */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Efectivo</Text>
          {operaciones.length === 0 ? (
            /*
              Aquí NO hay botón, y es a propósito: el agente no puede provocar una operación de
              efectivo, solo confirmarla cuando el cliente le enseña el código. La «acción» de
              este vacío es saber qué lo llena; un botón sería relleno.
            */
            <EmptyState
              compacto
              icono={<Banknote size={26} color={colors.textSecondary} />}
              titulo="Nada por confirmar"
              texto="Cuando un cliente te enseñe su código de recarga o de retirada, la operación aparecerá aquí para que la cierres."
            />
          ) : operaciones.map((op) => {
            const recibir = op.type === 'CASH_IN';
            const vencida = new Date(op.expiresAt).getTime() < Date.now();
            return (
              <View key={op.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: espaciado.e8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                  <View style={[styles.tile, { backgroundColor: colors.surface }]}>
                    <Banknote size={17} color={recibir ? brand.successPressed : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                      {recibir ? 'Recibir efectivo' : 'Entregar efectivo'}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                      {op.user.name} · {op.user.phone}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>{fmtXaf(op.amount)}</Text>
                </View>
                {op.justification ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>{op.justification}</Text>
                ) : null}
                <Text style={{ color: vencida ? brand.dangerPressed : colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e8 }}>
                  {vencida ? 'Código caducado' : 'El cliente te enseña su código para cerrar la operación.'}
                </Text>
                <View style={{ marginTop: espaciado.e10 }}>
                  <PrimaryButton
                    title={recibir ? 'Confirmar que recibí el efectivo' : 'Confirmar que entregué el efectivo'}
                    onPress={() => { setOtpErr(null); setAviso(null); setOpActiva(op); }}
                    disabled={vencida}
                  />
                </View>
              </View>
            );
          })}

          {/* ── Recados (compra protegida) ── */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: espaciado.e22 }]}>Recados</Text>
          {recados.length === 0 ? (
            <EmptyState
              compacto
              icono={<PackageOpen size={26} color={colors.textSecondary} />}
              titulo="No tienes recados en curso"
              texto="Los recados de compra protegida te llegan asignados: recoges el paquete y lo entregas al comprador, que confirma al recibirlo."
            />
          ) : recados.map((r: RecadoEscrow) => {
            const est = ESTADO_RECADO[r.status] ?? { label: r.status, color: colors.textSecondary };
            const recoger = r.status === 'AWAITING_PICKUP';
            return (
              <View key={r.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: espaciado.e8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                  <View style={[styles.tile, { backgroundColor: colors.surface }]}>
                    {recoger ? <PackageOpen size={17} color={colors.primary} /> : <PackageCheck size={17} color={colors.primary} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                      {r.product ?? 'Compra protegida'}
                    </Text>
                    <Text style={{ color: est.color, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{est.label}</Text>
                  </View>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>{fmtXaf(r.amount)}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
                  {recoger ? `Recoges de ${r.seller.name} · ${r.seller.phone}` : `Entregas a ${r.buyer.name} · ${r.buyer.phone}`}
                </Text>
                <Pressable
                  onPress={() => router.push({ pathname: '/agente-escaner', params: { orderId: r.id, paso: recoger ? 'pickup' : 'delivery' } } as any)}
                  style={[styles.scanBtn, { borderColor: colors.primary }]}
                  accessibilityRole="button"
                >
                  <QrCode size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.titulo, marginLeft: espaciado.e8 }}>
                    {recoger ? 'Escanear recogida' : 'Escanear entrega'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}

      <PinSheet
        visible={!!opActiva}
        title={opActiva?.type === 'CASH_IN' ? 'Código del cliente' : 'Código del cliente'}
        subtitle={opActiva
          ? `${fmtXaf(opActiva.amount)} · ${opActiva.user.name}. Escribe el código de 6 dígitos que te enseña.`
          : undefined}
        busy={otpBusy}
        error={otpErr}
        confirmLabel="Confirmar operación"
        onClose={() => setOpActiva(null)}
        onConfirm={(otp) => void confirmarEfectivo(otp)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e12 },
  retryBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e10 },
  card: { borderRadius: 18, borderWidth: trazo.fino, padding: espaciado.e16 },
  aviso: { borderRadius: 14, borderWidth: trazo.fino, padding: espaciado.e12, marginTop: espaciado.e12 },
  sectionTitle: { fontSize: 15, fontWeight: peso.titulo, marginTop: espaciado.e20, marginBottom: espaciado.e4 },
  tile: { width: 38, height: 38, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderWidth: trazo.fino, paddingVertical: espaciado.e11, marginTop: espaciado.e12,
  },
});
