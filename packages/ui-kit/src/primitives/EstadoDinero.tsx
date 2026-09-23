/**
 * EstadoDinero — «dónde está mi dinero», en tres pasos.
 *
 * POR QUÉ EXISTE (comparación de diseño con 得物/Dewu, tanda 1 «el dinero se ve»):
 * el Mercado enseñaba la garantía como una frase suelta («Garantía EG Route Plan de 7 días si pagas
 * por la app») que el usuario tiene que creer. Dewu no comunica su confianza con un icono: la
 * comunica con la ESTRUCTURA del producto (el pedido pasa por la plataforma y el usuario ve por
 * dónde). Aquí la plataforma hace algo que Dewu no hace —**retener el dinero del comprador**— y eso
 * hoy no se ve en ninguna pantalla.
 *
 * Este primitivo cuenta los tres estados reales del dinero del pedido, tal y como los implementa el
 * backend (verificado en `ecomerse.service.ts` y `wallet.service.ts`):
 *   1. PAGADO   — al crear el pedido, el importe sale del saldo disponible del comprador.
 *   2. RETENIDO — queda en garantía (bucket ESCROW del monedero). El vendedor NO lo tiene.
 *   3. ENTREGADO— al entregar, se libera al vendedor; si se cancela, vuelve íntegro al comprador.
 *
 * Y una frase aparte para la garantía, porque es OTRA cosa: `warranty_expires_at` se fija en la
 * entrega + 7 días (`ecomerse.service.ts:637`), es decir **la garantía empieza cuando el dinero se
 * libera**. No se puede insinuar que el dinero sigue retenido durante esos 7 días: sería mentira.
 *
 * Uso:
 *   <EstadoDinero activo="retenido" />
 *   <EstadoDinero activo="entregado" compacto />
 *   <EstadoDinero activo="devuelto" />
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { tipografia, peso, espaciado, radios } from '../theme/escalas';
import { alpha, brand } from '../theme/colors';

/** En qué punto está el dinero HOY. Los nombres son del dinero, no del pedido. */
export type EtapaDinero = 'pagado' | 'retenido' | 'entregado' | 'devuelto';

const PASOS: { id: EtapaDinero; titulo: string; nota: string }[] = [
  { id: 'pagado', titulo: 'Pagas', nota: 'Sale de tu monedero' },
  { id: 'retenido', titulo: 'Lo retenemos', nota: 'El vendedor aún no lo tiene' },
  { id: 'entregado', titulo: 'Lo recibe al entregar', nota: 'O te lo devolvemos entero' },
];

export interface EstadoDineroProps {
  /** Etapa actual del dinero. */
  activo: EtapaDinero;
  /** `true` para la franja de una línea (home); `false` para el bloque con los tres pasos (ficha). */
  compacto?: boolean;
  /** Frase de garantía al pie. Por defecto la del Mercado. */
  notaGarantia?: string;
}

function colorDeEtapa(activo: EtapaDinero, id: EtapaDinero, colors: ReturnType<typeof useTheme>['colors']): string {
  if (activo === 'devuelto') return colors.textSecondary;
  // Las etapas ya cumplidas y la actual se pintan en verde de éxito; las futuras, en gris.
  const orden: EtapaDinero[] = ['pagado', 'retenido', 'entregado'];
  const iActivo = orden.indexOf(activo);
  const i = orden.indexOf(id);
  if (iActivo < 0) return colors.textSecondary;
  return i <= iActivo ? colors.success : colors.textSecondary;
}

export function EstadoDinero({ activo, compacto = false, notaGarantia }: EstadoDineroProps) {
  const { colors } = useTheme();

  if (compacto) {
    const texto = activo === 'devuelto'
      ? 'Si no lo recibes, te devolvemos el dinero · no se lo damos al vendedor hasta que recibas'
      : 'No le pagamos al vendedor hasta que recibas el pedido';
    return (
      <View
        style={[s.franja, { backgroundColor: alpha(colors.success, 0.08), borderColor: alpha(colors.success, 0.25) }]}
        accessibilityRole="text"
        accessibilityLabel={texto}
      >
        <Text style={[s.franjaTexto, { color: colors.textPrimary }]}>{texto}</Text>
      </View>
    );
  }

  const garantia = notaGarantia ?? 'Si algo va mal tras recibirlo, tienes 7 días para reclamar.';

  return (
    <View
      style={[s.bloque, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLabel={`Dónde está tu dinero. ${PASOS.map((p) => `${p.titulo}: ${p.nota}`).join('. ')}. ${garantia}`}
    >
      <Text style={[s.titulo, { color: colors.textPrimary }]}>Dónde está tu dinero</Text>
      <View style={s.pasos}>
        {PASOS.map((p, i) => {
          const c = colorDeEtapa(activo, p.id, colors);
          const esActivo = p.id === activo;
          return (
            <View key={p.id} style={s.paso}>
              <View style={s.puntoFila}>
                <View style={[s.punto, { backgroundColor: c, borderColor: c }]} />
                {i < PASOS.length - 1 && <View style={[s.linea, { backgroundColor: colors.border }]} />}
              </View>
              <View style={s.pasoTexto}>
                <Text style={[s.pasoTitulo, { color: colors.textPrimary, fontWeight: esActivo ? peso.titulo : peso.fuerte }]}>
                  {p.titulo}
                </Text>
                <Text style={[s.pasoNota, { color: colors.textSecondary }]}>{p.nota}</Text>
              </View>
            </View>
          );
        })}
        {activo === 'devuelto' && (
          <View style={s.paso}>
            <View style={s.puntoFila}>
              <View style={[s.punto, { backgroundColor: brand.neutral, borderColor: brand.neutral }]} />
            </View>
            <View style={s.pasoTexto}>
              <Text style={[s.pasoTitulo, { color: colors.textPrimary, fontWeight: peso.titulo }]}>Te lo devolvemos</Text>
              <Text style={[s.pasoNota, { color: colors.textSecondary }]}>Vuelve entero a tu monedero</Text>
            </View>
          </View>
        )}
      </View>
      <Text style={[s.garantia, { color: colors.textSecondary }]}>{garantia}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  franja: { borderWidth: 1, borderRadius: radios.md, paddingVertical: espaciado.e8, paddingHorizontal: espaciado.e12 },
  franjaTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte, lineHeight: 17 },
  bloque: { borderWidth: 1, borderRadius: radios.lg, padding: espaciado.e12, gap: espaciado.e8 },
  titulo: { fontSize: tipografia.body, fontWeight: peso.titulo },
  pasos: { gap: espaciado.e4 },
  paso: { flexDirection: 'row', gap: espaciado.e8 },
  puntoFila: { alignItems: 'center', width: 14, paddingTop: 4 },
  punto: { width: 10, height: 10, borderRadius: radios.full, borderWidth: 1 },
  linea: { width: 2, flex: 1, marginTop: 2 },
  pasoTexto: { flex: 1, paddingBottom: espaciado.e4 },
  pasoTitulo: { fontSize: tipografia.caption },
  pasoNota: { fontSize: tipografia.micro, marginTop: 1 },
  garantia: { fontSize: tipografia.micro, lineHeight: 15 },
});
