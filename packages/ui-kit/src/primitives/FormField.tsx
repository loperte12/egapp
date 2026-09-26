/**
 * FormField — input de formulario del Design System.
 * Fondo surface, borde redondeado, FOCO AZUL PRIMARIO, error rojo de 1 línea.
 * Regla del kit: todo input de producto se construye con este componente.
 *
 * ── CORRECCIÓN (UX): el campo MULTILÍNEA vivía dentro de una caja de `height: 50` ──
 *
 * `box` tiene 50 px de alto fijo, así que un `multiline` (normas del hotel, descripción de
 * la tienda, notas) quedaba **encerrado en 50 px**: el usuario escribía cinco líneas y veía
 * una y media, con el resto oculto tras un scroll interno invisible. Eso es exactamente
 * «la tarjeta esconde lo que escribes».
 *
 * Se nota que era una trampa del kit porque otras pantallas la esquivaban a mano, con su
 * propio `<TextInput multiline style={s.area}>` (`alquiler-publicar`, `work-publish`,
 * `ecomerse-seller`). Ahora el propio FormField tiene el modo área: caja alta, alineación
 * arriba y `textAlignVertical: 'top'` (sin eso, en Android el texto se centra).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { altura, espaciado, peso, radios, tipografia, trazo } from '../theme/escalas';

export function FormField({
  label,
  error,
  icon,
  ...inputProps
}: {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
} & TextInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const area = inputProps.multiline === true;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.boxBase,
          area ? styles.boxArea : styles.box,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : 'transparent',
          },
        ]}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textSecondary}
          {...(area ? { textAlignVertical: 'top' as const } : {})}
          style={[styles.input, area ? styles.inputArea : null, { color: colors.textPrimary }]}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          {...inputProps}
        />
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.text.danger }]} accessibilityLiveRegion="polite" numberOfLines={1}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Los cuatro números de forma salen de las escalas del kit (`altura`, `radios`, `trazo`, `espaciado`).
 * Antes eran literales sueltos y por eso el campo medía lo que medía: **`altura.campo` (50) no se usaba
 * ni una vez en toda la app** aunque existía para esto exacto (auditoría del 23/09/2026).
 *
 * DOS LITERALES QUE SE QUEDAN, y se dice por qué:
 *   · `input.fontSize: 15` → ya es `tipografia.cuerpo` (15), migrado sin mover un píxel.
 *   · `input.fontWeight: '600'` → **se queda a propósito**. Pasa a `peso.medio` (500) por la decisión
 *     del 24/09/2026, pero eso es la migración de la familia `fontWeight` (214 literales en total), y
 *     es Fase 3. Aquí no se adelanta: un cambio de peso en TODOS los formularios de la app se verifica
 *     con su propia tanda, no colado dentro de la de alturas.
 */
const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    fontSize: tipografia.caption,
    fontWeight: peso.fuerte,
    marginBottom: espaciado.e6,
    marginLeft: espaciado.e4,
  },
  boxBase: {
    flexDirection: 'row',
    borderWidth: trazo.base,
    borderRadius: radios.campo,
    paddingHorizontal: espaciado.e14,
  },
  /** Una línea: alto fijo, como estaba — pero el número sale de `altura.campo`. */
  box: { alignItems: 'center', height: altura.campo },
  /** Varias líneas: caja alta y contenido alineado arriba. */
  boxArea: {
    alignItems: 'flex-start',
    minHeight: 108,
    paddingTop: espaciado.e12,
    paddingBottom: espaciado.e12,
  },
  icon: { marginRight: espaciado.e10 },
  input: { flex: 1, fontSize: tipografia.cuerpo, fontWeight: '600', paddingVertical: 0 },
  inputArea: { minHeight: 84 },
  error: {
    /* 11,5 no tiene peldaño en `tipografia` (salta de `micro` 10,5 a `caption` 12). Es 1 de los
       literales fraccionarios que la Fase 3 tiene que decidir; hoy no se toca. */
    fontSize: 11.5,
    fontWeight: peso.fuerte,
    marginTop: espaciado.e5,
    marginLeft: espaciado.e4,
  },
});

