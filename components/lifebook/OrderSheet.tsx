/**
 * OrderSheet — hoja de compra (03). El dueño decidió que **la compra vive en la
 * barra inferior**, así que el panel «Confirmar pedido» pasa de estar en el
 * cuerpo (donde quedaba fuera de la vista al pulsar abajo) a una hoja inferior.
 *
 * Datos reales:
 *   · `POST /lifebook/posts/:id/order { message?, priceXaf? }` → pedido creado
 *     (solo se manda `priceXaf` si el precio es negociable)
 *   · el precio y si es negociable salen de `post.payload`
 *   · al crearse, el detalle lleva a `/lifebook-orders`
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ShoppingCart, X } from 'lucide-react-native';
import { lbXaf } from '../../constants/lifebook';
import { lifebookOrdersApi } from '../../api/lifebook';

export function OrderSheet({ visible, onClose, postId, priceXaf, negotiable, onCreated }: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  priceXaf: number;
  negotiable: boolean;
  /** Recibe el nº de pedido y el id para navegar a Pedidos. */
  onCreated: (orderNo: string, orderId: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState('');
  const [price, setPrice] = useState(String(priceXaf || ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible) { setMsg(''); setPrice(String(priceXaf || '')); setErr(''); }
  }, [visible, priceXaf]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const off = Number(price);
      const res = await lifebookOrdersApi.create(postId, {
        message: msg.trim() || undefined,
        ...(negotiable && Number.isFinite(off) && off > 0 ? { priceXaf: Math.round(off) } : {}),
      });
      onCreated(res.orderNo, res.id ?? '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo crear el pedido.');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />

        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: insets.bottom + 14 }}>
          <View style={{ height: 4, width: 44, borderRadius: radios.full, backgroundColor: alpha(colors.textPrimary, 0.14), alignSelf: 'center', marginTop: espaciado.e10 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 }}>
            <ShoppingCart size={18} color={colors.primary} />
            <Text style={{ fontSize: 15.5, fontWeight: peso.titulo, color: colors.textPrimary, flex: 1 }}>Confirmar pedido</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar pedido"
              style={{ width: 32, height: 32, borderRadius: radios.lg, backgroundColor: alpha(colors.textPrimary, 0.07), alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: espaciado.e16, paddingTop: espaciado.e6 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              Vas a pedir este artículo por <Text style={{ color: colors.primary, fontWeight: peso.titulo }}>{lbXaf(priceXaf)}</Text>
              {negotiable ? ' · el precio es negociable' : ''}
            </Text>

            {negotiable ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12 }}>TU OFERTA (XAF)</Text>
                <TextInput
                  value={price}
                  onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, '').slice(0, 9))}
                  keyboardType="number-pad"
                  placeholder="Precio en XAF"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                />
              </>
            ) : null}

            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12 }}>MENSAJE PARA EL VENDEDOR (opcional)</Text>
            <TextInput
              value={msg}
              onChangeText={setMsg}
              multiline
              maxLength={300}
              placeholder="p. ej. ¿Lo puedes entregar en Semu esta tarde?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, styles.area, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            />

            {err ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>{err}</Text> : null}

            <Pressable
              onPress={confirm}
              disabled={busy}
              accessibilityLabel="Enviar pedido"
              style={{ borderRadius: radios.full, paddingVertical: espaciado.e14, alignItems: 'center', backgroundColor: busy ? alpha(colors.primary, 0.5) : colors.primary, marginTop: espaciado.e14 }}
            >
              {busy
                ? <ActivityIndicator size="small" color={brand.white} />
                : <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: 14.5 }}>Enviar pedido</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 14, borderWidth: trazo.fino, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10, fontSize: 14.5, marginTop: espaciado.e6 },
  area: { minHeight: 70, textAlignVertical: 'top' },
});
