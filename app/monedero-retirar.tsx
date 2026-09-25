/**
 * MonederoRetirarScreen — retirada en efectivo con agente (/monedero-retirar).
 *
 * Flujo real: importe → agente → justificación AML (obligatoria, mín. 10
 * caracteres, exigida por el servidor) → PIN → POST /wallet/withdrawals →
 * hold atómico (importe + comisión pasan a garantía) y OTP: el usuario recibe
 * el efectivo del agente y le da el código; si se cancela, el hold se devuelve.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bike, Check } from 'lucide-react-native';
import { EmptyState, espaciado, PrimaryButton, radios, Tactil, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { whatsappSoporte } from '../constants/soporte';
import { AuthGate } from '../core/AuthGate';
import { PinSheet } from '@egrouteplan/ui-kit';
import { walletApi, type WalletAgent, type WalletBalance } from '../api/wallet';
import { fijarPin } from '../api/settlement';
import { fmtXaf } from './monedero';
import { brand } from '@egrouteplan/ui-kit';
import { InlineError } from '@egrouteplan/ui-kit';
import { mensajeDeError } from '../constants/errores';
import { Volver } from '../components/Volver';
import { ir } from '../constants/rutas';

export default function MonederoRetirarScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [agents, setAgents] = useState<WalletAgent[] | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [importe, setImporte] = useState('');
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [justificacion, setJustificacion] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [needSetPin, setNeedSetPin] = useState(false);
  const [otp, setOtp] = useState<string | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  /** El monedero exige identidad verificada: si el servidor la pide, hay que poder ir a hacerla. */
  const [kycFalta, setKycFalta] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([walletApi.listAgents(), walletApi.getWallet()]);
        setAgents(a.items ?? []);
        setBalance(b);
      } catch {
        setAgents([]);
      }
    })();
  }, []);

  const cantidad = parseInt(importe, 10) || 0;
  const disponible = Number(balance?.balanceAvailable ?? 0);
  const restanteHoy = Number(balance?.today?.withdrawalRemaining ?? balance?.dailyLimit ?? 0);
  const tope = Math.min(disponible, restanteHoy);
  const justOk = justificacion.trim().length >= 10;
  const valido = cantidad >= 100 && cantidad <= tope && !!agenteId && justOk;

  const confirmar = async (pin: string, password?: string) => {
    if (pinBusy) return;
    setPinBusy(true); setPinErr(null);
    try {
      if (needSetPin) { await fijarPin(pin, password); }
      const token = await walletApi.paymentToken(pin, 'WITHDRAWAL', cantidad);
      const op = await walletApi.requestWithdrawal(cantidad, agenteId!, justificacion.trim(), token);
      setOtp(op.otp ? String(op.otp) : '······');
      setFee(typeof op.fee === 'number' ? op.fee : null);
      setPinOpen(false);
    } catch (e) {
      const msg = mensajeDeError(e, 'No se pudo iniciar la retirada');
      if ((e as { code?: string })?.code === 'KYC_REQUIRED') {
        // Sin identidad verificada no hay dinero: mensaje directo, sin cambiar a alta de PIN.
        setPinOpen(false);
        setFormErr(msg);
        setKycFalta(true);
        return;
      }
      if (!needSetPin) {
        setNeedSetPin(true);
        setPinErr('Si es tu primera vez: escribe tu contraseña y elige tu PIN de 6 dígitos.');
      } else {
        setPinErr(msg);
      }
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Volver />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Retirar</Text>
        <View style={{ width: 24 }} />
      </View>

      {otp ? (
        <View style={styles.doneWrap}>
          <View style={[styles.otpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
              Da este código al agente SOLO cuando te entregue el efectivo:
            </Text>
            <Text style={{ color: colors.primary, fontSize: tipografia.emoji, fontWeight: peso.titulo, letterSpacing: 10, textAlign: 'center', marginVertical: espaciado.e14 }}>
              {otp}
            </Text>
            {fee !== null && fee > 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
                Comisión de retirada: {fmtXaf(fee)}.
              </Text>
            )}
          </View>
          <PrimaryButton title="Entendido" onPress={() => ir.atras()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textSecondary }]}>Importe</Text>
          <View style={[styles.amountBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={{ flex: 1, color: colors.textPrimary, fontSize: tipografia.display, fontWeight: peso.titulo }}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={importe}
              onChangeText={(t) => setImporte(t.replace(/\D/g, '').slice(0, 7))}
              keyboardType="number-pad"
            />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.maximo }}>XAF</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e6 }}>
            Disponible: {fmtXaf(disponible)} · hoy puedes retirar hasta {fmtXaf(restanteHoy)}.
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: espaciado.e20 }]}>Agente de efectivo</Text>
          {agents === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: espaciado.e12 }} />
          ) : agents.length === 0 ? (
            /*
              Sin agente de efectivo no hay forma de RECOGER el dinero: un texto que solo informa
              deja al usuario bloqueado en una pantalla de dinero. La salida real es soporte.
            */
            <EmptyState
              compacto
              titulo="No hay ningún agente de efectivo disponible"
              texto="Los agentes aparecen aquí en cuanto se conectan. Sin agente no se puede recoger tu efectivo."
              accionLabel="Escribir a soporte"
              onAccion={() => { void whatsappSoporte('Hola, quiero retirar del monedero y no veo agentes de efectivo disponibles.'); }}
            />
          ) : agents.map((a) => (
            <Tactil
              key={a.id}
              onPress={() => setAgenteId(a.id)}
              style={[styles.agentRow, {
                backgroundColor: colors.card,
                borderColor: agenteId === a.id ? colors.primary : colors.border,
                borderWidth: agenteId === a.id ? 2 : 1,
              }]}
              accessibilityLabel={`Agente ${a.name}, ${a.code}, zona ${a.zone}`}
              accessibilityState={{ selected: agenteId === a.id }}
              accessibilityRole="button"
            >
              <View style={[styles.agentIcon, { backgroundColor: colors.surface }]}>
                <Bike size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{a.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>{a.code} · {a.zone}</Text>
              </View>
              {agenteId === a.id && <Check size={18} color={colors.primary} />}
            </Tactil>
          ))}

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: espaciado.e20 }]}>Motivo de la retirada</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Ej.: gastos de la semana"
            placeholderTextColor={colors.textSecondary}
            value={justificacion}
            onChangeText={setJustificacion}
            maxLength={140}
          />

          {formErr ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={formErr} /></View> : null}
          {/*
            AUDITORÍA DE DISEÑO (D-33): el monedero exige identidad verificada y el aviso solo
            pintaba texto. El usuario elegía importe, agente y PIN para descubrir al final que no
            podía seguir, y no había ninguna salida. Aquí está la puerta.
          */}
          {kycFalta && (
            <Tactil
              onPress={() => router.push('/kyc')}
              accessibilityRole="button"
              accessibilityLabel="Verificar mi identidad"
              style={{ marginTop: espaciado.e10, alignSelf: 'flex-start' }}
            >
              <Text style={[styles.label, { color: colors.primary, textTransform: 'none', letterSpacing: 0 }]}>Verificar mi identidad →</Text>
            </Tactil>
          )}

          <View style={{ marginTop: espaciado.e24 }}>
            <PrimaryButton
              title={cantidad > 0 ? `Retirar ${fmtXaf(cantidad)}` : 'Retirar'}
              onPress={() => {
                if (!valido) {
                  setFormErr(
                    cantidad < 100 ? 'El importe mínimo es 100 XAF.'
                      : cantidad > tope ? 'Supera tu saldo disponible o tu límite de hoy.'
                      : !agenteId ? 'Elige un agente.'
                      : 'Escribe el motivo de la retirada (mín. 10 caracteres).',
                  );
                  return;
                }
                setFormErr(null); setPinErr(null); setNeedSetPin(false); setPinOpen(true);
              }}
            />
          </View>
        </ScrollView>
      )}

      <PinSheet
        visible={pinOpen}
        title={`Retirar ${fmtXaf(cantidad)}`}
        subtitle={needSetPin
          ? 'Primer uso: escribe tu contraseña y elige un PIN de 6 dígitos.'
          : 'Introduce tu PIN del monedero.'}
        busy={pinBusy}
        error={pinErr}
        needPassword={needSetPin}
        confirmLabel={needSetPin ? 'Guardar PIN y retirar' : 'Confirmar retirada'}
        onClose={() => setPinOpen(false)}
        onConfirm={(pin, pwd) => void confirmar(pin, pwd)}
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
  label: { fontSize: tipografia.body, fontWeight: peso.maximo, textTransform: 'uppercase', letterSpacing: 0.4 },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderRadius: radios.lg, borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, marginTop: espaciado.e8,
  },
  agentRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radios.lg,
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e12, marginTop: espaciado.e8,
  },
  agentIcon: { width: 38, height: 38, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: trazo.fino, borderRadius: radios.campo, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e11, fontSize: tipografia.body, marginTop: espaciado.e8 },
  doneWrap: { flex: 1, padding: espaciado.e20, justifyContent: 'center', gap: espaciado.e18 },
  otpCard: { borderRadius: radios.tarjeta, borderWidth: trazo.fino, padding: espaciado.e22 },
});
