/**
 * publish/StepShop.tsx — paso 0: ABRIR MI TIENDA (Parte 34).
 *
 * Es el paso que faltaba en el asistente del dueño: sin tienda no se puede
 * publicar (el servidor responde SHOP_REQUIRED). Gratis y sin burocracia: nombre,
 * dónde estás, cómo cobras y si entregas.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, espaciado, PrimaryButton, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { commerceApi } from '../../../api/commerce';
import { LB_CITIES } from '../../../constants/lifebook';
import { LB_PAY_METHODS, LB_REGIONS } from '../../../constants/commerce';
import { usePublishStore } from '../../../state/commercePublish';
import { Chip, ChipRow } from '../Chip';
import { Notice, StepBlock } from './PublishParts';

export default function StepShop({ onCreated }: { onCreated: (name: string) => void }) {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const setForm = usePublishStore((s) => s.setForm);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState<string>(form.city || 'Malabo');
  const [barrio, setBarrio] = useState('');
  const [region, setRegion] = useState<'insular' | 'continental' | 'other'>('insular');
  const [pays, setPays] = useState<string[]>(['cash_on_delivery', 'transfer']);
  const [delivers, setDelivers] = useState(true);
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  const crear = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Tienda', 'Ponle un nombre a tu tienda (mín. 2 letras)');
      return;
    }
    setBusy(true);
    try {
      const { shop } = await commerceApi.createShop({
        name: name.trim(),
        description: description.trim() || undefined,
        city,
        barrio: barrio.trim() || undefined,
        region,
        paymentMethods: pays as never,
        shippingPolicy: delivers
          ? {
              name: 'Mismo día',
              coverage: ['same_city'],
              transportModes: ['local_courier', 'taxi_moto', 'pickup'],
              costMode: Number(cost.replace(/\D/g, '')) > 0 ? 'fixed' : 'on_request',
              baseCostXaf: Number(cost.replace(/\D/g, '')) || 0,
              estimatedTime: '2-4 h',
            }
          : null,
      });
      // La ciudad/barrio de la tienda son el origen por defecto de lo que publique.
      setForm({ city, barrio: barrio.trim() });
      onCreated(shop.name);
    } catch (e) {
      Alert.alert('Tienda', e instanceof Error ? e.message : 'No se pudo abrir la tienda');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Notice>
        <Text style={{ fontWeight: '900' }}>Tu tienda es gratis.</Text> Elige un nombre, dónde estás y cómo cobras.
        Podrás verificarla más adelante para conseguir la insignia y más confianza.
      </Notice>

      <StepBlock title="Nombre de la tienda *">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej.: Moda Paraíso"
          placeholderTextColor={colors.textSecondary}
          maxLength={80}
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
      </StepBlock>

      <StepBlock title="¿Qué vendes o qué servicio das?">
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ej.: ropa, teléfonos y arreglos de fontanería"
          placeholderTextColor={colors.textSecondary}
          maxLength={600}
          multiline
          style={[styles.input, styles.area, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
      </StepBlock>

      <StepBlock title="Ciudad">
        <ChipRow>
          {LB_CITIES.map((c) => (
            <Chip key={c} label={c} active={city === c} onPress={() => setCity(c)} />
          ))}
        </ChipRow>
      </StepBlock>

      <StepBlock title="Barrio o referencia">
        <TextInput
          value={barrio}
          onChangeText={setBarrio}
          placeholder="Ej.: Paraíso, junto al mercado"
          placeholderTextColor={colors.textSecondary}
          maxLength={60}
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
      </StepBlock>

      <StepBlock title="Región">
        <ChipRow>
          {LB_REGIONS.map((r) => (
            <Chip key={r.id} label={r.label} active={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </ChipRow>
      </StepBlock>

      <StepBlock title="¿Cómo quieres cobrar?" hint="El estado real de cada método lo confirma la plataforma.">
        <ChipRow>
          {LB_PAY_METHODS.filter((m) => m.id !== 'likebook_wallet').map((m) => (
            <Chip
              key={m.id}
              label={m.label}
              active={pays.includes(m.id)}
              onPress={() => setPays((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))}
            />
          ))}
        </ChipRow>
      </StepBlock>

      <StepBlock title="Entrega a domicilio">
        <ChipRow>
          <Chip label="Sí, hago entregas" active={delivers} onPress={() => setDelivers(true)} />
          <Chip label="Solo recogida en tienda" active={!delivers} onPress={() => setDelivers(false)} />
        </ChipRow>
        {delivers ? (
          <TextInput
            value={cost}
            onChangeText={setCost}
            keyboardType="number-pad"
            placeholder="Coste de entrega en XAF (0 = a consultar)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { marginTop: espaciado.e8, color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
        ) : null}
      </StepBlock>

      <PrimaryButton title="Abrir mi tienda" loading={busy} onPress={crear} />
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e8 }}>
        Podrás cambiar todo esto después desde «Mi tienda».
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  area: { minHeight: 80, textAlignVertical: 'top' },
});
