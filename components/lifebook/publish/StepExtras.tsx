/**
 * publish/StepExtras.tsx — paso 4: DETALLES, OPCIONES y ENTREGA (Parte 34).
 *
 * Integra las dos buenas ideas del asistente del dueño (atributos sugeridos por
 * categoría y variantes) con los arreglos necesarios:
 *   · los detalles salen de **la categoría que sirve el servidor**
 *     (`defaultAttributes`), no de una lista fija por tipo que solo cubría 6 casos;
 *   · **no se pueden repetir** claves ni nombres de opción (el servidor responde
 *     400 si se repiten: antes se podía llegar al final y fallar al publicar);
 *   · el stock vacío **hereda el del producto** en vez de guardar 0, que marcaba
 *     todas las opciones como «agotadas»;
 *   · el envío (cobertura y medios) **sí se guarda** — antes se perdía en estado
 *     local y la ficha salía sin entrega.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { alpha, GhostButton, useTheme, tipografia } from '@egrouteplan/ui-kit';
import { LB_COVERAGE, LB_TRANSPORT } from '../../../constants/commerce';
import { usePublishStore } from '../../../state/commercePublish';
import type { LbCategory, LbOptionSuggestion, LbSizeKind } from '../../../api/commerce';
import { Chip, ChipRow } from '../Chip';
import { Notice, StepBlock, raizYCategoria } from './PublishParts';
import OptionGroupsEditor from './OptionGroupsEditor';
import SizeChartEditor from './SizeChartEditor';

export default function StepExtras({ categories }: { categories: LbCategory[] }) {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const setForm = usePublishStore((s) => s.setForm);
  const setAttribute = usePublishStore((s) => s.setAttribute);
  const removeAttribute = usePublishStore((s) => s.removeAttribute);

  const [nuevoDetalle, setNuevoDetalle] = useState({ key: '', value: '' });

  /**
   * TANDA K: los ejes de opciones y sus tablas de tallas. Se ofrecen en **todo tipo de producto**
   * (una comida tiene raciones, un servicio tiene duración, una electrónica tiene almacenamiento),
   * salvo en las ofertas de empleo, que no se compran. El alojamiento no pasa por aquí: se da de
   * alta en el panel del hotel y se reserva por fechas y huéspedes.
   */
  const conOpciones = form.serviceType !== 'job';
  const tiposDeTalla = useMemo(
    () => [...new Set(form.optionGroups.filter((g) => g.kind === 'size').map((g) => (g.chartKind ?? 'top') as LbSizeKind))],
    [form.optionGroups],
  );
  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  /** Atributos que sugiere la categoría elegida (con los del padre como respaldo). */
  const sugeridos = useMemo(() => {
    const { raiz: root, sub } = raizYCategoria(categories, form.serviceType, form.categoryId);
    const lista = (sub?.defaultAttributes?.length ? sub.defaultAttributes : root?.defaultAttributes) ?? [];
    return lista;
  }, [categories, form.serviceType, form.categoryId]);

  const valorDe = (key: string) => form.attributes.find((a) => a.key.toLowerCase() === key.toLowerCase())?.value ?? '';

  /**
   * Los EJES que sugiere la categoría (tanda K): ropa propone Talla + Color; calzado, tallas de
   * zapato; teléfonos, almacenamiento + color; comida, formato… Igual que los detalles, salen de la
   * categoría que sirve el servidor, no de una lista fija en la app.
   */
  const sugeridosOpciones = useMemo((): LbOptionSuggestion[] => {
    const { raiz: root, sub } = raizYCategoria(categories, form.serviceType, form.categoryId);
    const lista = (sub?.defaultOptions?.length ? sub.defaultOptions : root?.defaultOptions) ?? [];
    return lista;
  }, [categories, form.serviceType, form.categoryId]);

  return (
    <View>
      {/* ── Detalles que sugiere la categoría ── */}
      <StepBlock
        title="Detalles"
        hint={sugeridos.length
          ? 'Rellena los que apliquen: ayudan al comprador a decidir. Los que dejes vacíos no se publican.'
          : 'Añade los detalles que quieras (marca, medidas, garantía…).'}
      >
        {sugeridos.map((a) => (
          <View key={a.key} style={{ marginBottom: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginBottom: 4 }}>
              {a.label ?? a.key}{a.type === 'select' && a.options?.length ? ` (${a.options.join(' / ')})` : ''}
            </Text>
            <TextInput
              value={valorDe(a.key)}
              onChangeText={(v) => setAttribute(a.label ?? a.key, v)}
              placeholder="—"
              placeholderTextColor={colors.textSecondary}
              style={input}
            />
          </View>
        ))}

        {/* Detalle libre */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <TextInput
            value={nuevoDetalle.key}
            onChangeText={(v) => setNuevoDetalle((p) => ({ ...p, key: v }))}
            placeholder="Otro detalle"
            placeholderTextColor={colors.textSecondary}
            style={[input, { flex: 1 }]}
          />
          <TextInput
            value={nuevoDetalle.value}
            onChangeText={(v) => setNuevoDetalle((p) => ({ ...p, value: v }))}
            placeholder="Valor"
            placeholderTextColor={colors.textSecondary}
            style={[input, { flex: 1 }]}
          />
          <Pressable
            onPress={() => {
              if (!nuevoDetalle.key.trim() || !nuevoDetalle.value.trim()) return;
              setAttribute(nuevoDetalle.key, nuevoDetalle.value);
              setNuevoDetalle({ key: '', value: '' });
            }}
            accessibilityLabel="Añadir detalle"
            style={[styles.addBtn, { borderColor: colors.primary }]}
          >
            <Plus size={17} color={colors.primary} />
          </Pressable>
        </View>
      </StepBlock>

      {/* ── Opciones (tanda K): los ejes que el comprador elige antes de comprar ──
          Antes esto era una lista de nombres sueltos («Talla 42») con precio y stock, y así
          llegaba a la ficha: la app solo podía enseñar la PALABRA y compraba directo con la
          primera. Ahora se configuran ejes (Color con la foto real de cada color, Talla con su
          tabla, Almacenamiento, Formato…) y las combinaciones con su precio y su stock. */}
      {conOpciones ? (
        <>
          <OptionGroupsEditor sugeridos={sugeridosOpciones} />
          {tiposDeTalla.length ? <SizeChartEditor kinds={tiposDeTalla} /> : null}
        </>
      ) : null}

      {/* ── Entrega ── */}
      <StepBlock title="Entrega" hint="Hasta dónde llevas lo que publicas.">
        <ChipRow>
          {LB_COVERAGE.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              active={form.coverage.includes(c.id)}
              onPress={() => setForm({
                coverage: form.coverage.includes(c.id) ? form.coverage.filter((x) => x !== c.id) : [...form.coverage, c.id],
              })}
            />
          ))}
        </ChipRow>
      </StepBlock>

      <StepBlock title="¿Cómo lo entregas?">
        <ChipRow>
          {LB_TRANSPORT.map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              active={form.transports.includes(t.id)}
              onPress={() => setForm({
                transports: form.transports.includes(t.id) ? form.transports.filter((x) => x !== t.id) : [...form.transports, t.id],
              })}
            />
          ))}
        </ChipRow>
      </StepBlock>

      {form.coverage.includes('international') ? (
        <Notice>Cobrarás el envío internacional a consultar: la plataforma aún no calcula tarifas fuera del país.</Notice>
      ) : null}

      <StepBlock title="Coste del envío en tu ciudad (XAF)">
        <TextInput
          value={form.deliveryCost}
          onChangeText={(v) => setForm({ deliveryCost: v.replace(/[^\d]/g, '') })}
          keyboardType="number-pad"
          placeholder="0 = a consultar con la tienda"
          placeholderTextColor={colors.textSecondary}
          style={input}
        />
      </StepBlock>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, fontSize: tipografia.body },
  addBtn: {
    width: 40, height: 40, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
});
