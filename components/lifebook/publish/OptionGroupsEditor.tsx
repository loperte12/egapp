/**
 * components/lifebook/publish/OptionGroupsEditor.tsx — LOS EJES DE ELECCIÓN (tanda K).
 *
 * POR QUÉ EXISTE. Hasta esta tanda, «Opciones» del publicador era una lista de nombres sueltos
 * («Talla 42», «Talla 40») con su precio y su stock, y así llegaba a la ficha: la app solo podía
 * enseñar la PALABRA «Talla 42» y los botones Comprar/Añadir al carrito compraban directo con la
 * primera de la lista. El dueño lo dijo con todas las letras: «no vale sólo poner color, debe verse
 * el producto de la foto real de este color».
 *
 * CÓMO ESTÁ PENSADO (lo mismo que hacen Taobao y Shopify, en pequeño):
 *   · el comerciante define EJES («Color», «Talla», «Almacenamiento», «Formato»…). La categoría ya
 *     sugiere los suyos, así que casi siempre es tocar un chip;
 *   · cada eje tiene VALORES. En un eje de color **cada valor lleva su foto**, elegida entre las
 *     fotos que el comerciante ya subió: el servidor no admite un color sin foto ni una foto que
 *     no sea de ese producto;
 *   · las COMBINACIONES (Rojo · M, Rojo · L…) **se generan solas** del producto cartesiano y el
 *     comerciante solo pone precio y stock. Al volver a generar, se conserva lo que ya había escrito.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Plus, X } from 'lucide-react-native';
import { alpha, espaciado, GhostButton, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { absUrl } from '../../../api/config';
import type { LbOptionSuggestion, LbSizeKind } from '../../../api/commerce';
import {
  COMBOS_MAX, GRUPOS_MAX, combinacionesDe, usePublishStore,
} from '../../../state/commercePublish';
import { Chip, ChipRow } from '../Chip';
import { Notice, StepBlock } from './PublishParts';

const TIPOS: { id: 'color' | 'size' | 'text'; label: string; ayuda: string }[] = [
  { id: 'color', label: 'Color', ayuda: 'cada color con su FOTO real' },
  { id: 'size', label: 'Talla', ayuda: 'con su tabla de medidas' },
  { id: 'text', label: 'Otro', ayuda: 'almacenamiento, formato, tono…' },
];

const TABLAS: { id: LbSizeKind; label: string }[] = [
  { id: 'top', label: 'Arriba' },
  { id: 'bottom', label: 'Abajo' },
  { id: 'dress', label: 'Vestido' },
  { id: 'shoes', label: 'Calzado' },
  { id: 'accessory', label: 'Accesorio' },
  { id: 'other', label: 'Otro' },
];

/** El código del eje a partir del nombre: «Talla (calzado)» → `talla_calzado`. */
const aCodigo = (label: string) => label.trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

export default function OptionGroupsEditor({ sugeridos }: { sugeridos: LbOptionSuggestion[] }) {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const addOptionGroup = usePublishStore((s) => s.addOptionGroup);
  const removeOptionGroup = usePublishStore((s) => s.removeOptionGroup);
  const setOptionGroup = usePublishStore((s) => s.setOptionGroup);
  const addOptionValue = usePublishStore((s) => s.addOptionValue);
  const removeOptionValue = usePublishStore((s) => s.removeOptionValue);
  const setOptionValuePhoto = usePublishStore((s) => s.setOptionValuePhoto);
  const generarCombinaciones = usePublishStore((s) => s.generarCombinaciones);
  const setVariant = usePublishStore((s) => s.setVariant);
  const removeVariant = usePublishStore((s) => s.removeVariant);

  const [nuevo, setNuevo] = useState({ label: '', kind: 'text' as 'color' | 'size' | 'text', chartKind: 'top' as LbSizeKind });
  const [valor, setValor] = useState<Record<string, string>>({});
  /** Qué valor de color está eligiendo foto (la foto sale de las que ya subió). */
  const [eligiendoFoto, setEligiendoFoto] = useState<{ code: string; value: string } | null>(null);

  const fotos = useMemo(() => form.media.filter((m) => m.type !== 'video').map((m) => m.url), [form.media]);
  const grupos = form.optionGroups;
  const combosPosibles = useMemo(() => combinacionesDe(grupos.filter((g) => g.values.length > 0)).length, [grupos]);
  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  const yaEsta = (code: string) => grupos.some((g) => g.code === code);

  return (
    <StepBlock
      title="Opciones"
      hint="Talla, color, almacenamiento… Cada combinación con su precio y su stock."
    >
      {/* ── Lo que sugiere la categoría ── */}
      {sugeridos.length ? (
        <View style={{ marginBottom: espaciado.e10 }}>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginBottom: espaciado.e6 }}>
            Sugeridos por la categoría (toca para añadir)
          </Text>
          <ChipRow>
            {sugeridos.map((s) => {
              const code = s.code || aCodigo(s.label);
              const puesto = yaEsta(code);
              return (
                <Chip
                  key={code}
                  label={puesto ? `${s.label} ✓` : `+ ${s.label}`}
                  active={puesto}
                  disabled={puesto || grupos.length >= GRUPOS_MAX}
                  onPress={() => {
                    const err = addOptionGroup({
                      code,
                      label: s.label,
                      kind: s.kind,
                      chartKind: s.kind === 'size' ? (s.chartKind ?? 'top') : null,
                      /**
                       * Los valores sugeridos vienen como TEXTO (`["XS","S"]`): leer `v.value` de
                       * una cadena daba `undefined` y se publicaba la palabra «undefined» como
                       * talla. Aquí se acepta texto u objeto, sin suponer.
                       */
                      values: (s.values ?? []).map((v) => ({
                        value: typeof v === 'string' ? v : String(v.value ?? ''),
                        imageUrl: typeof v === 'string' ? '' : (v.imageUrl ?? ''),
                      })),
                    });
                    if (err) Alert.alert('Opciones', err);
                  }}
                />
              );
            })}
          </ChipRow>
        </View>
      ) : null}

      {/* ── Los ejes que hay ── */}
      {grupos.map((g) => (
        <View key={g.code} style={[styles.card, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>{g.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                {g.kind === 'color' ? 'Color · cada uno con su foto' : g.kind === 'size' ? 'Talla · con su tabla de medidas' : 'Valores'}
                {' · '}{g.values.length} {g.values.length === 1 ? 'valor' : 'valores'}
              </Text>
            </View>
            <Pressable
              onPress={() => removeOptionGroup(g.code)}
              accessibilityLabel={`Quitar el eje ${g.label}`}
              hitSlop={10}
              style={styles.delBtn}
            >
              <X size={15} color={colors.danger} />
            </Pressable>
          </View>

          {/* Tipo de tabla si es un eje de tallas (para el asistente «¿no sabes tu talla?») */}
          {g.kind === 'size' ? (
            <View style={{ marginTop: espaciado.e8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginBottom: espaciado.e5 }}>
                ¿Qué parte de la prenda mide esta tabla?
              </Text>
              <ChipRow>
                {TABLAS.map((t) => (
                  <Chip
                    key={t.id}
                    compact
                    label={t.label}
                    active={(g.chartKind ?? 'top') === t.id}
                    onPress={() => setOptionGroup(g.code, { chartKind: t.id })}
                  />
                ))}
              </ChipRow>
            </View>
          ) : null}

          {/* ── Los valores ── */}
          <View style={{ marginTop: espaciado.e10 }}>
            {g.kind === 'color' ? (
              <View style={styles.colores}>
                {g.values.map((v) => (
                  <View key={v.value} style={styles.colorItem}>
                    <Pressable
                      onPress={() => setEligiendoFoto({ code: g.code, value: v.value })}
                      accessibilityLabel={`Foto del color ${v.value}`}
                      style={[styles.colorFoto, { borderColor: v.imageUrl ? colors.success : colors.danger, backgroundColor: colors.background }]}
                    >
                      {v.imageUrl ? (
                        <Image source={absUrl(v.imageUrl)} style={styles.colorImg} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                      ) : (
                        <Text style={{ color: colors.danger, fontSize: 9.5, fontWeight: '800', textAlign: 'center' }}>FALTA{'\n'}FOTO</Text>
                      )}
                    </Pressable>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.micro, fontWeight: '700', maxWidth: 62, textAlign: 'center' }}>{v.value}</Text>
                    <Pressable onPress={() => removeOptionValue(g.code, v.value)} accessibilityLabel={`Quitar ${v.value}`} hitSlop={8}>
                      <Text style={{ color: colors.danger, fontSize: tipografia.micro, fontWeight: '800' }}>quitar</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <ChipRow>
                {g.values.map((v) => (
                  <Chip key={v.value} compact label={`${v.value} ✕`} onPress={() => removeOptionValue(g.code, v.value)} />
                ))}
              </ChipRow>
            )}

            <View style={{ flexDirection: 'row', gap: espaciado.e8, alignItems: 'center', marginTop: espaciado.e8 }}>
              <TextInput
                value={valor[g.code] ?? ''}
                onChangeText={(t) => setValor((p) => ({ ...p, [g.code]: t }))}
                placeholder={g.kind === 'color' ? 'Ej.: Rojo' : g.kind === 'size' ? 'Ej.: M' : 'Ej.: 128 GB'}
                placeholderTextColor={colors.textSecondary}
                style={[input, { flex: 1 }]}
              />
              <Pressable
                onPress={() => {
                  const err = addOptionValue(g.code, valor[g.code] ?? '');
                  if (err) { Alert.alert('Opciones', err); return; }
                  setValor((p) => ({ ...p, [g.code]: '' }));
                }}
                accessibilityLabel={`Añadir valor a ${g.label}`}
                style={[styles.addBtn, { borderColor: colors.primary }]}
              >
                <Plus size={17} color={colors.primary} />
              </Pressable>
            </View>
            {g.kind === 'color' && g.values.some((v) => !v.imageUrl) ? (
              <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700', marginTop: espaciado.e6 }}>
                Falta la foto real de ese color.
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {/* ── Añadir un eje que no venía sugerido ── */}
      {grupos.length < GRUPOS_MAX ? (
        <View style={{ marginTop: espaciado.e4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', marginBottom: espaciado.e5 }}>
            Otro eje (máximo {GRUPOS_MAX})
          </Text>
          <View style={{ flexDirection: 'row', gap: espaciado.e8, alignItems: 'center' }}>
            <TextInput
              value={nuevo.label}
              onChangeText={(t) => setNuevo((p) => ({ ...p, label: t }))}
              placeholder="Ej.: Almacenamiento, Formato, Tono"
              placeholderTextColor={colors.textSecondary}
              style={[input, { flex: 1 }]}
            />
            <Pressable
              onPress={() => {
                if (!nuevo.label.trim()) { Alert.alert('Opciones', 'Ponle un nombre al eje'); return; }
                const err = addOptionGroup({
                  code: aCodigo(nuevo.label),
                  label: nuevo.label.trim(),
                  kind: nuevo.kind,
                  chartKind: nuevo.kind === 'size' ? nuevo.chartKind : null,
                  // Sin valores no se puede guardar: se crea con uno vacío para que se vea dónde
                  // escribirlos (y el chip de «Añadir» está debajo).
                  values: [{ value: '—', imageUrl: '' }],
                });
                if (err) { Alert.alert('Opciones', err); return; }
                setNuevo({ label: '', kind: 'text', chartKind: 'top' });
              }}
              accessibilityLabel="Añadir eje"
              style={[styles.addBtn, { borderColor: colors.primary }]}
            >
              <Plus size={17} color={colors.primary} />
            </Pressable>
          </View>
          <View style={{ marginTop: espaciado.e6 }}>
            <ChipRow>
              {TIPOS.map((t) => (
                <Chip key={t.id} compact label={t.label} active={nuevo.kind === t.id} onPress={() => setNuevo((p) => ({ ...p, kind: t.id }))} />
              ))}
            </ChipRow>
          </View>
        </View>
      ) : null}

      {/* ── Las combinaciones ── */}
      {grupos.length ? (
        <View style={{ marginTop: espaciado.e14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e6 }}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800', flex: 1 }}>
              Combinaciones {combosPosibles ? `(${combosPosibles})` : ''}
            </Text>
          </View>
          {combosPosibles > COMBOS_MAX ? (
            <Notice tone="error">
              Con esos valores salen {combosPosibles} combinaciones y el máximo es {COMBOS_MAX}: quita algún color o alguna talla.
            </Notice>
          ) : null}
          <GhostButton
            title={form.variants.length ? 'Volver a generar (conserva precios)' : 'Generar combinaciones'}
            onPress={() => {
              const err = generarCombinaciones();
              if (err) Alert.alert('Combinaciones', err);
            }}
          />
          {form.variants.map((v, i) => (
            <View key={`${v.name}-${i}`} style={[styles.combo, { borderColor: alpha(colors.border, 0.7) }]}>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700', flex: 1.2 }}>{v.name}</Text>
              <TextInput
                value={v.priceXaf}
                onChangeText={(t) => setVariant(i, { priceXaf: t.replace(/[^\d]/g, '') })}
                keyboardType="number-pad"
                placeholder={form.price ? String(Number(form.price.replace(/\D/g, ''))) : 'Precio'}
                placeholderTextColor={colors.textSecondary}
                style={[input, styles.comboInput]}
              />
              <TextInput
                value={v.stockQuantity}
                onChangeText={(t) => setVariant(i, { stockQuantity: t.replace(/[^\d]/g, '') })}
                keyboardType="number-pad"
                placeholder="Stock"
                placeholderTextColor={colors.textSecondary}
                style={[input, styles.comboInput]}
              />
              <Pressable onPress={() => removeVariant(i)} accessibilityLabel={`Quitar ${v.name}`} hitSlop={8} style={styles.delBtn}>
                <X size={14} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          {form.variants.length ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>
              Precio o stock vacíos = los del producto.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Elegir la foto real de un color ── */}
      <Modal visible={!!eligiendoFoto} transparent animationType="fade" onRequestClose={() => setEligiendoFoto(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEligiendoFoto(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={() => { /* no cerrar */ }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body, marginBottom: espaciado.e4 }}>
              Foto real del color «{eligiendoFoto?.value}»
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>
              Elige, entre las fotos que ya subiste, la que enseña el producto en ese color. Es la que verá el comprador al elegirlo.
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={styles.grid}>
                {fotos.map((url) => (
                  <Pressable
                    key={url}
                    onPress={() => {
                      if (eligiendoFoto) setOptionValuePhoto(eligiendoFoto.code, eligiendoFoto.value, url);
                      setEligiendoFoto(null);
                    }}
                    accessibilityLabel="Usar esta foto"
                    style={[styles.gridItem, { borderColor: alpha(colors.border, 0.8) }]}
                  >
                    <Image source={absUrl(url)} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {fotos.length === 0 ? (
              <Notice tone="error">Todavía no has subido fotos: vuelve al paso «Fotos» y súbelas (una por color, como mínimo).</Notice>
            ) : null}
            <GhostButton title="Cancelar" onPress={() => setEligiendoFoto(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </StepBlock>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e8, fontSize: tipografia.caption },
  card: { borderWidth: 1, borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e10 },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10 },
  colorItem: { alignItems: 'center', gap: espaciado.e3 },
  colorFoto: { width: 62, height: 62, borderRadius: radios.md, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  colorImg: { width: '100%', height: '100%' },
  addBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  delBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  combo: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e7, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: espaciado.e7 },
  comboInput: { width: 78 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: espaciado.e16, paddingBottom: espaciado.e26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  gridItem: { width: 96, height: 96, borderRadius: radios.md, borderWidth: 1, overflow: 'hidden' },
});
