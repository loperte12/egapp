/**
 * components/lifebook/publish/PublishParts.tsx — piezas compartidas del asistente.
 * (Paso, campos y ayudas que usan todos los pasos.)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { alpha, useTheme, tipografia, radios } from '@egrouteplan/ui-kit';
import type { LbCategory, LbServiceType } from '../../../api/commerce';

/**
 * ¿A QUÉ RAMA PERTENECE LA CATEGORÍA ELEGIDA?
 *
 * El catálogo del servidor viene en dos niveles: ramas («Ropa y calzado», «Electrónica», «Alimentos»)
 * y sus hijas («Calzado», «Teléfonos y tablets»…). El asistente buscaba **la primera rama del tipo**
 * y solo miraba SUS hijas: para un producto físico eso dejaba al comerciante en las hijas de la
 * primera rama (Abacería) y **no podía elegir «Ropa mujer» ni «Calzado»** —medido en el Poco F5—,
 * así que tampoco le salían los ejes sugeridos (talla, color). Esta función busca la rama que de
 * verdad contiene la categoría elegida, y sirve igual para los detalles y para las opciones.
 */
export function raizYCategoria(
  categories: LbCategory[],
  serviceType: LbServiceType,
  categoryId: string | null,
): { raices: LbCategory[]; raiz: LbCategory | null; sub: LbCategory | undefined } {
  const raices = (categories ?? []).filter((c) => c.serviceType === serviceType);
  if (categoryId) {
    for (const r of raices) {
      if (r.id === categoryId) return { raices, raiz: r, sub: undefined };
      const sub = (r.children ?? []).find((h) => h.id === categoryId);
      if (sub) return { raices, raiz: r, sub };
    }
  }
  return { raices, raiz: raices[0] ?? null, sub: undefined };
}

/** Bloque de un paso: título, ayuda y contenido. */
export function StepBlock({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      {title ? (
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800', marginBottom: 7 }}>{title}</Text>
      ) : null}
      {hint ? (
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: 8 }}>{hint}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** Aviso (error o información) con el color del tema. */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: React.ReactNode }) {
  const { colors } = useTheme();
  const bg = tone === 'error' ? alpha(colors.danger, 0.1) : tone === 'ok' ? alpha(colors.success, 0.12) : alpha(colors.primary, 0.08);
  const border = tone === 'error' ? colors.danger : tone === 'ok' ? colors.success : alpha(colors.primary, 0.3);
  return (
    <View style={[styles.notice, { backgroundColor: bg, borderColor: border }]}>
      <Text style={{ color: tone === 'error' ? colors.danger : colors.textPrimary, fontSize: tipografia.caption, lineHeight: 18 }}>
        {children}
      </Text>
    </View>
  );
}

/** Filas clave/valor (resumen y vista previa). */
export function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700', flex: 1, textAlign: 'right' }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderWidth: 1, borderRadius: radios.md, padding: 11, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
});
