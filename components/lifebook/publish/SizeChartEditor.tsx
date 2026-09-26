/**
 * components/lifebook/publish/SizeChartEditor.tsx — LA TABLA DE TALLAS DEL PRODUCTO (tanda J/K).
 *
 * QUÉ RESUELVE. El servidor ya sabía guardar tablas de tallas (por sexo y tipo, con RANGOS en
 * cm/kg) desde la tanda J, pero **no había forma de escribirlas desde la app**: se configuraban por
 * API. Y sin tabla configurada, el asistente de talla no puede recomendar nada —la regla del dueño
 * es comparar contra la tabla DE ESE PRODUCTO—, así que lo único honesto era no recomendar.
 *
 * CÓMO ESTÁ PENSADO (lo que hacen las tiendas de verdad):
 *   · una tabla por SEXO (mujer · hombre · unisex) y por TIPO (arriba · abajo · vestido · calzado ·
 *     accesorio): un producto puede tener la de mujer y la de hombre a la vez;
 *   · cada talla con sus RANGOS (mín–máx), porque una talla M no es un número exacto: es un
 *     intervalo;
 *   · solo se piden las medidas que esa prenda usa de verdad (arriba → pecho; abajo → cintura y
 *     cadera; calzado → largo y ancho del pie); el resto están detrás de «más medidas»;
 *   · «Rellenar tallas típicas» trae los valores de partida de las tablas estándar, y **se dice que
 *     son orientativos**: los revisa el comerciante y los ajusta a su prenda. Si no coinciden, el
 *     asistente recomendaría mal, así que es él quien manda.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, espaciado, GhostButton, tipografia, useTheme, peso, trazo, radios} from '@egrouteplan/ui-kit';
import type { LbSizeGender, LbSizeKind } from '../../../api/commerce';
import { TALLAS_CALZADO } from '../../../constants/tallas';
import { usePublishStore, type PublishSizeChartDraft, type PublishSizeRow } from '../../../state/commercePublish';
import { Chip, ChipRow } from '../Chip';
import { Notice } from './PublishParts';

const SEXOS: { id: LbSizeGender; label: string }[] = [
  { id: 'women', label: 'Mujer' },
  { id: 'men', label: 'Hombre' },
  { id: 'unisex', label: 'Unisex' },
];

const TIPOS: { id: LbSizeKind; label: string }[] = [
  { id: 'top', label: 'Arriba' },
  { id: 'bottom', label: 'Abajo' },
  { id: 'dress', label: 'Vestido' },
  { id: 'shoes', label: 'Calzado' },
  { id: 'accessory', label: 'Accesorio' },
  { id: 'other', label: 'Otro' },
];

/** Las medidas que pide cada tipo de prenda (el resto van detrás de «más medidas»). */
const CAMPOS: Record<LbSizeKind, { key: string; label: string }[]> = {
  top: [{ key: 'chest', label: 'Pecho' }, { key: 'height', label: 'Altura' }, { key: 'weight', label: 'Peso' }],
  bottom: [{ key: 'waist', label: 'Cintura' }, { key: 'hip', label: 'Cadera' }, { key: 'height', label: 'Altura' }],
  dress: [{ key: 'chest', label: 'Pecho' }, { key: 'waist', label: 'Cintura' }, { key: 'hip', label: 'Cadera' }],
  shoes: [{ key: 'footLength', label: 'Largo del pie' }, { key: 'footWidth', label: 'Ancho del pie' }],
  accessory: [{ key: 'chest', label: 'Pecho' }, { key: 'waist', label: 'Cintura' }],
  other: [{ key: 'chest', label: 'Pecho' }, { key: 'waist', label: 'Cintura' }, { key: 'height', label: 'Altura' }],
};

const EXTRA: { key: string; label: string }[] = [
  { key: 'chest', label: 'Pecho' }, { key: 'waist', label: 'Cintura' }, { key: 'hip', label: 'Cadera' },
  { key: 'height', label: 'Altura' }, { key: 'weight', label: 'Peso' },
  { key: 'footLength', label: 'Largo del pie' }, { key: 'footWidth', label: 'Ancho del pie' },
];

/** La unidad de cada medida, para no escribir «pecho 94» sin decir de qué. */
const UNIDAD: Record<string, string> = {
  chest: 'cm', waist: 'cm', hip: 'cm', height: 'cm', weight: 'kg', footLength: 'cm', footWidth: 'cm',
};

const fila = (sizeLabel: string, v: Record<string, number | undefined> = {}): PublishSizeRow => ({
  sizeLabel,
  ...Object.fromEntries(EXTRA.flatMap((c) => [
    [`${c.key}Min${UNIDAD[c.key] === 'kg' ? 'Kg' : 'Cm'}`, v[`${c.key}Min`] !== undefined ? String(v[`${c.key}Min`]) : ''],
    [`${c.key}Max${UNIDAD[c.key] === 'kg' ? 'Kg' : 'Cm'}`, v[`${c.key}Max`] !== undefined ? String(v[`${c.key}Max`]) : ''],
  ])),
});

/**
 * VALORES DE PARTIDA de las tablas estándar (pecho/cintura/cadera en cm, altura en cm, peso en kg y
 * numeración europea de calzado). Son ORIENTATIVOS: el comerciante los revisa y los ajusta a su
 * prenda. Se dice en pantalla, porque una tabla que no coincide con la prenda hace que el asistente
 * recomiende una talla equivocada.
 *
 * OJO (tanda L-bis): al asistente se le piden **altura y peso** (el dueño quitó pecho, cintura y
 * cadera porque casi nadie los sabe). Por eso las tablas típicas traen TAMBIÉN altura y peso: si una
 * tabla solo tuviera pecho, el comprador que da su altura y su peso no podría recibir recomendación.
 * Las columnas de pecho/cintura/cadera siguen ahí para quien las publique.
 */
const MUJER_ARRIBA: [string, number, number, number, number][] = [
  ['XS', 76, 82, 58, 64], ['S', 82, 88, 64, 70], ['M', 88, 94, 70, 76],
  ['L', 94, 100, 76, 82], ['XL', 100, 107, 82, 90], ['XXL', 107, 114, 90, 98],
];
const HOMBRE_ARRIBA: [string, number, number, number, number][] = [
  ['S', 86, 94, 71, 79], ['M', 94, 102, 79, 87], ['L', 102, 110, 87, 95],
  ['XL', 110, 118, 95, 104], ['XXL', 118, 126, 104, 113],
];
/** Altura y peso por talla (mujer / hombre). Es lo que el comprador puede dar sin cinta de medir. */
const ALTURA_PESO_MUJER: [string, number, number, number, number][] = [
  ['XS', 150, 158, 42, 50], ['S', 155, 163, 48, 56], ['M', 160, 168, 54, 64],
  ['L', 165, 173, 62, 72], ['XL', 168, 178, 70, 82], ['XXL', 170, 180, 80, 92],
];
const ALTURA_PESO_HOMBRE: [string, number, number, number, number][] = [
  ['S', 165, 172, 58, 68], ['M', 170, 178, 66, 78], ['L', 175, 183, 76, 88],
  ['XL', 180, 188, 86, 100], ['XXL', 183, 193, 98, 112],
];
/** Numeración europea → largo del pie en cm (la MISMA equivalencia que usa el asistente del comprador,
 *  para que el número 42 no valga 26 cm en un sitio y 27 en otro). */
const ZAPATOS: [string, number][] = TALLAS_CALZADO.map((t) => [String(t.numero), t.cm]);

function tipicas(gender: LbSizeGender, kind: LbSizeKind): PublishSizeRow[] {
  if (kind === 'shoes') return ZAPATOS.map(([label, cm]) => fila(label, { footLengthMin: cm, footLengthMax: cm + 1, footWidthMin: 9, footWidthMax: 10 }));
  const alturaPeso = gender === 'men' ? ALTURA_PESO_HOMBRE : ALTURA_PESO_MUJER;
  const conAlturaPeso = (label: string, extra: Record<string, number | undefined>) => {
    const ap = alturaPeso.find(([l]) => l === label);
    return fila(label, {
      ...extra,
      // Altura y peso SIEMPRE: son las medidas que el comprador puede dar sin cinta de medir.
      ...(ap ? { heightMin: ap[1], heightMax: ap[2], weightMin: ap[3], weightMax: ap[4] } : {}),
    });
  };
  if (kind === 'bottom') {
    return MUJER_ARRIBA.map(([label, , chest, waistMin, waistMax]) => conAlturaPeso(label, {
      waistMin, waistMax, hipMin: chest + 4, hipMax: chest + 10,
    }));
  }
  const tabla = gender === 'men' ? HOMBRE_ARRIBA : MUJER_ARRIBA;
  return tabla.map(([label, min, max, wMin, wMax]) => conAlturaPeso(label, {
    chestMin: min, chestMax: max,
    ...(kind === 'dress' ? { waistMin: wMin, waistMax: wMax, hipMin: min + 4, hipMax: min + 10 } : {}),
  }));
}

export default function SizeChartEditor({ kinds }: { kinds: LbSizeKind[] }) {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const setSizeChart = usePublishStore((s) => s.setSizeChart);
  const removeSizeChart = usePublishStore((s) => s.removeSizeChart);
  const [abierto, setAbierto] = useState<LbSizeKind | null>(kinds[0] ?? null);
  const [sexo, setSexo] = useState<Record<string, LbSizeGender>>({});
  const [masMedidas, setMasMedidas] = useState(false);
  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  /** Las tablas que ya hay, por `sexo:tipo`. */
  const porClave = useMemo(() => {
    const m = new Map<string, PublishSizeChartDraft>();
    form.sizeCharts.forEach((c) => m.set(`${c.gender}:${c.kind}`, c));
    return m;
  }, [form.sizeCharts]);

  const lista = kinds.length ? [...new Set(kinds)] : ['top' as LbSizeKind];

  const guardar = (kind: LbSizeKind, gender: LbSizeGender, rows: PublishSizeRow[], notes = '') =>
    setSizeChart({ gender, kind, notes, rows });

  return (
    <View style={{ marginTop: espaciado.e4 }}>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo, marginBottom: espaciado.e6 }}>
        Tabla de tallas
      </Text>

      <ChipRow>
        {lista.map((k) => (
          <Chip
            key={k}
            label={`${TIPOS.find((t) => t.id === k)?.label ?? k}${porClave.has(`women:${k}`) || porClave.has(`men:${k}`) || porClave.has(`unisex:${k}`) ? ' ✓' : ''}`}
            active={abierto === k}
            onPress={() => setAbierto(abierto === k ? null : k)}
          />
        ))}
      </ChipRow>

      {abierto ? (
        <View style={[styles.card, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.surface }]}>
          <ChipRow>
            {SEXOS.map((s) => (
              <Chip
                key={s.id}
                compact
                label={s.label}
                active={(sexo[abierto] ?? 'women') === s.id}
                onPress={() => setSexo((p) => ({ ...p, [abierto]: s.id }))}
              />
            ))}
          </ChipRow>

          {(() => {
            const gender = sexo[abierto] ?? 'women';
            const chart = porClave.get(`${gender}:${abierto}`);
            const rows = chart?.rows ?? [];
            const campos = masMedidas ? EXTRA : CAMPOS[abierto];
            return (
              <View style={{ marginTop: espaciado.e10 }}>
                {rows.length === 0 ? (
                  <>
                    <Notice>
                      No hay tabla de {SEXOS.find((s) => s.id === gender)?.label.toLowerCase()} · {TIPOS.find((t) => t.id === abierto)?.label.toLowerCase()} para este producto.
                    </Notice>
                    <View style={{ flexDirection: 'row', gap: espaciado.e8, flexWrap: 'wrap' }}>
                      <GhostButton title="Rellenar tallas típicas" onPress={() => guardar(abierto, gender, tipicas(gender, abierto))} />
                      <GhostButton title="Empezar vacía" onPress={() => guardar(abierto, gender, [fila('')])} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginBottom: espaciado.e6 }}>
                      {rows.length} {rows.length === 1 ? 'talla' : 'tallas'} · medidas en cm{abierto === 'top' || abierto === 'bottom' || abierto === 'dress' ? ' y kg' : ''}
                    </Text>
                    {rows.map((r, i) => (
                      <View key={`${r.sizeLabel}-${i}`} style={[styles.fila, { borderBottomColor: alpha(colors.border, 0.6) }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                          <TextInput
                            value={r.sizeLabel}
                            onChangeText={(t) => guardar(abierto, gender, rows.map((x, j) => (j === i ? { ...x, sizeLabel: t } : x)), chart?.notes)}
                            placeholder="Talla"
                            placeholderTextColor={colors.textSecondary}
                            style={[input, { width: 74, fontWeight: peso.maximo }]}
                          />
                          <Pressable
                            onPress={() => {
                              const quedan = rows.filter((_, j) => j !== i);
                              if (!quedan.length) { removeSizeChart(gender, abierto); return; }
                              guardar(abierto, gender, quedan, chart?.notes);
                            }}
                            accessibilityLabel={`Quitar la talla ${r.sizeLabel}`}
                            hitSlop={8}
                          >
                            <Text style={{ color: colors.text.danger, fontSize: tipografia.caption, fontWeight: peso.maximo }}>quitar</Text>
                          </Pressable>
                        </View>
                        {campos.map((c) => {
                          const suf = UNIDAD[c.key] === 'kg' ? 'Kg' : 'Cm';
                          const kMin = `${c.key}Min${suf}`;
                          const kMax = `${c.key}Max${suf}`;
                          return (
                            <View key={c.key} style={styles.medida}>
                              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, width: 78 }} numberOfLines={1}>
                                {c.label} ({UNIDAD[c.key]})
                              </Text>
                              <TextInput
                                value={r[kMin] ?? ''}
                                onChangeText={(t) => guardar(abierto, gender, rows.map((x, j) => (j === i ? { ...x, [kMin]: t.replace(/[^\d]/g, '') } : x)), chart?.notes)}
                                keyboardType="number-pad"
                                placeholder="mín"
                                placeholderTextColor={colors.textSecondary}
                                style={[input, styles.mini]}
                              />
                              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>–</Text>
                              <TextInput
                                value={r[kMax] ?? ''}
                                onChangeText={(t) => guardar(abierto, gender, rows.map((x, j) => (j === i ? { ...x, [kMax]: t.replace(/[^\d]/g, '') } : x)), chart?.notes)}
                                keyboardType="number-pad"
                                placeholder="máx"
                                placeholderTextColor={colors.textSecondary}
                                style={[input, styles.mini]}
                              />
                            </View>
                          );
                        })}
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: espaciado.e8, flexWrap: 'wrap', marginTop: espaciado.e8 }}>
                      <GhostButton title="Añadir talla" onPress={() => guardar(abierto, gender, [...rows, fila('')], chart?.notes)} />
                      <GhostButton
                        title={masMedidas ? 'Menos medidas' : 'Más medidas'}
                        onPress={() => setMasMedidas((v) => !v)}
                      />
                      <GhostButton
                        title="Borrar tabla"
                        onPress={() => Alert.alert('Borrar la tabla', 'La tabla de tallas de este producto se borra. El asistente dejará de recomendar talla hasta que la vuelvas a poner.', [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Borrar', style: 'destructive', onPress: () => removeSizeChart(gender, abierto) },
                        ])}
                      />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e8, lineHeight: 16 }}>
                      Valores orientativos: revísalos con tu prenda.
                    </Text>
                  </>
                )}
              </View>
            );
          })()}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: trazo.fino, borderRadius: radios.hermano, paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e7, fontSize: tipografia.caption },
  mini: { width: 58 },
  card: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12, marginTop: espaciado.e10 },
  fila: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: espaciado.e8 },
  medida: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e5 },
});
