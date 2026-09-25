/**
 * publish/StepDetails.tsx — paso 3: DATOS (Parte 34).
 *
 * Corrige los dos fallos que bloqueaban la publicación en el asistente original:
 *   · **«precio a consultar»** con `priceMode` (antes exigía precio > 0 y no había
 *     forma de marcar esta opción, imprescindible para oficios);
 *   · **precio anterior vacío** ya no se envía como 0 (eso provocaba
 *     OLD_PRICE_INVALID al publicar sin descuento).
 * Los importes se guardan como texto y se convierten al enviar: nada de `|| 0`.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, espaciado, tipografia, useTheme, trazo, radios} from '@egrouteplan/ui-kit';
import { LB_CITIES } from '../../../constants/lifebook';
import { LB_CONDITIONS, LB_PRICE_MODES, LB_STOCK_MODES } from '../../../constants/commerce';
import { usePublishStore } from '../../../state/commercePublish';
import { Chip, ChipRow } from '../Chip';
import { StepBlock } from './PublishParts';

export default function StepDetails() {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const setForm = usePublishStore((s) => s.setForm);

  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  return (
    <View>
      <StepBlock title="Título *">
        <TextInput
          value={form.title}
          onChangeText={(v) => setForm({ title: v })}
          placeholder={form.serviceType === 'local_service' ? 'Ej.: Fontanero para fugas y grifos' : 'Ej.: Zapatillas deportivas talla 42'}
          placeholderTextColor={colors.textSecondary}
          maxLength={140}
          style={input}
        />
      </StepBlock>

      <StepBlock title="Resumen corto" hint="Una línea que se ve en la tarjeta del catálogo.">
        <TextInput
          value={form.shortDescription}
          onChangeText={(v) => setForm({ shortDescription: v })}
          placeholder="Ej.: Nuevas, talla 42, envío en el día"
          placeholderTextColor={colors.textSecondary}
          maxLength={200}
          style={input}
        />
      </StepBlock>

      <StepBlock title="Descripción">
        <TextInput
          value={form.longDescription}
          onChangeText={(v) => setForm({ longDescription: v })}
          placeholder="Detalles, medidas, condiciones, qué incluye…"
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={4000}
          style={[input, styles.area]}
        />
      </StepBlock>

      <StepBlock title="Precio">
        <ChipRow>
          {LB_PRICE_MODES.map((m) => (
            <Chip key={m.id} label={m.label} active={form.priceMode === m.id} onPress={() => setForm({ priceMode: m.id })} />
          ))}
        </ChipRow>
        {form.priceMode !== 'on_request' ? (
          <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 }}>
            <TextInput
              value={form.price}
              onChangeText={(v) => setForm({ price: v.replace(/[^\d]/g, '') })}
              keyboardType="number-pad"
              placeholder="Precio en XAF"
              placeholderTextColor={colors.textSecondary}
              style={[input, { flex: 1 }]}
            />
            <TextInput
              value={form.oldPrice}
              onChangeText={(v) => setForm({ oldPrice: v.replace(/[^\d]/g, '') })}
              keyboardType="number-pad"
              placeholder="Antes (opcional)"
              placeholderTextColor={colors.textSecondary}
              style={[input, { flex: 1 }]}
            />
          </View>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
            El cliente te escribe y le das presupuesto. Ideal para oficios, mudanzas o alquileres.
          </Text>
        )}
      </StepBlock>

      <StepBlock title="Disponibilidad">
        <ChipRow>
          {LB_STOCK_MODES.map((s) => (
            <Chip key={s.id} label={s.label} active={form.stockMode === s.id} onPress={() => setForm({ stockMode: s.id })} />
          ))}
        </ChipRow>
        {form.stockMode === 'exact' || form.stockMode === 'approximate' ? (
          <TextInput
            value={form.stockQuantity}
            onChangeText={(v) => setForm({ stockQuantity: v.replace(/[^\d]/g, '') })}
            keyboardType="number-pad"
            placeholder="¿Cuántas unidades tienes?"
            placeholderTextColor={colors.textSecondary}
            style={[input, { marginTop: espaciado.e8 }]}
          />
        ) : null}
      </StepBlock>

      <StepBlock title="Estado">
        <ChipRow>
          {LB_CONDITIONS.map((c) => (
            <Chip key={c.id} label={c.label} active={form.condition === c.id} onPress={() => setForm({ condition: c.id })} />
          ))}
        </ChipRow>
      </StepBlock>

      <StepBlock title="Ciudad">
        <ChipRow>
          {LB_CITIES.map((c) => (
            <Chip key={c} label={c} active={form.city === c} onPress={() => setForm({ city: c })} compact />
          ))}
        </ChipRow>
        <TextInput
          value={form.barrio}
          onChangeText={(v) => setForm({ barrio: v })}
          placeholder="Barrio o referencia (opcional)"
          placeholderTextColor={colors.textSecondary}
          maxLength={60}
          style={[input, { marginTop: espaciado.e8 }]}
        />
      </StepBlock>

      <StepBlock title="Etiquetas" hint="Separadas por comas. Ayudan a que te encuentren al buscar.">
        <TextInput
          value={form.tags}
          onChangeText={(v) => setForm({ tags: v })}
          placeholder="Ej.: zapatillas, deporte, oferta"
          placeholderTextColor={colors.textSecondary}
          style={input}
        />
      </StepBlock>

      <View style={[styles.priceHint, { backgroundColor: alpha(colors.primary, 0.07) }]}>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
          Consejo: no pongas teléfonos ni enlaces en la descripción — el contacto va por el chat de Life Book.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  area: { minHeight: 96, textAlignVertical: 'top' },
  priceHint: { borderRadius: radios.chip, padding: espaciado.e10 },
});
