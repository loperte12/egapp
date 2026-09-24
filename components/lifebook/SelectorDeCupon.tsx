/**
 * SelectorDeCupon — EL CUPÓN, EN LA CAJA (tanda Q).
 *
 * POR QUÉ EXISTE: la plataforma ya tenía cupones (la tienda los crea y la persona los recoge por
 * código), pero **no se aplicaban en ningún sitio**: `discount_xaf` estaba en la tabla sin usarse.
 * Esto es lo que faltaba: elegir el cupón al pagar y ver el descuento ANTES de confirmar.
 *
 * DOS COSAS QUE NO HACE, A PROPÓSITO:
 *  · **No decide dinero.** El descuento que se cobra lo calcula el servidor al crear el pedido; aquí
 *    solo se enseña, con la misma regla (`descuentoDeCupon`), para que la pantalla no mienta.
 *  · **No inventa cupones.** Si la persona no tiene ninguno para esta tienda, solo se le ofrece el
 *    código: el que no tiene cupón no ve una lista vacía con promesas.
 *
 * Un cupón que no sirve AQUÍ se enseña apagado **con el motivo** («Desde 5.000 XAF», «Caducado»):
 * esconderlo haría pensar que se ha perdido.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, brand, espaciado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { cuponAplicable, descuentoDeCupon, type LbCupon } from '../../api/commerce';
import { lbXaf } from '../../constants/lifebook';
import { Chip, ChipRow } from './Chip';

export function SelectorDeCupon({
  cupones, subtotalXaf, elegido, onElegir, onRecoger,
}: {
  /** Mis cupones RECOGIDOS (todos; aquí se filtran por tienda y por si sirven). */
  cupones: LbCupon[];
  subtotalXaf: number;
  /** Código del cupón elegido, o `null`. */
  elegido: string | null;
  onElegir: (code: string | null) => void;
  /** Recoger un cupón por su código. Devuelve el error a enseñar, o `null` si fue bien. */
  onRecoger: (code: string) => Promise<string | null>;
}) {
  const { colors } = useTheme();
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const elegidoCupon = cupones.find((c) => c.code === elegido) ?? null;
  const descuento = descuentoDeCupon(elegidoCupon, subtotalXaf);

  const usarCodigo = async () => {
    const limpio = codigo.trim().toUpperCase();
    if (!limpio || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const error = await onRecoger(limpio);
      if (error) setAviso(error);
      else setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View>
      {cupones.length ? (
        <ChipRow>
          {cupones.map((c) => {
            const apt = cuponAplicable(c, subtotalXaf);
            const d = descuentoDeCupon(c, subtotalXaf);
            const on = elegido === c.code;
            return (
              <Chip
                key={c.id}
                active={on}
                disabled={!apt.ok}
                onPress={() => onElegir(on ? null : c.code)}
                label={apt.ok ? `${c.title} · −${lbXaf(d)}` : `${c.title}${apt.motivo ? ` · ${apt.motivo}` : ''}`}
              />
            );
          })}
          {elegido ? <Chip label="Sin cupón" onPress={() => onElegir(null)} /> : null}
        </ChipRow>
      ) : null}

      <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: cupones.length ? 8 : 0 }}>
        <TextInput
          value={codigo}
          onChangeText={setCodigo}
          placeholder="¿Tienes un código?"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={40}
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Pressable
          onPress={() => { void usarCodigo(); }}
          disabled={!codigo.trim() || ocupado}
          accessibilityLabel="Usar el código del cupón"
          style={[styles.boton, { backgroundColor: codigo.trim() && !ocupado ? colors.primary : alpha(colors.primary, 0.4) }]}
        >
          <Text style={{ color: brand.white, fontWeight: '900', fontSize: tipografia.body }}>Usar</Text>
        </Pressable>
      </View>

      {aviso ? (
        <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700', marginTop: espaciado.e6 }}>{aviso}</Text>
      ) : null}
      {descuento > 0 ? (
        <Text style={{ color: colors.success, fontSize: tipografia.caption, fontWeight: '800', marginTop: espaciado.e6 }}>
          Cupón aplicado: −{lbXaf(descuento)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9,
    fontSize: tipografia.body, letterSpacing: 1,
  },
  boton: { borderRadius: 10, paddingHorizontal: espaciado.e16, alignItems: 'center', justifyContent: 'center' },
});
