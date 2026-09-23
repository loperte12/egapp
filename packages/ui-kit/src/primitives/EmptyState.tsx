/**
 * EmptyState — el estado vacío con salida.
 *
 * POR QUÉ EXISTE: 71 archivos escribían su propio «no hay nada» con su texto y su diseño (auditoría
 * de diseño, D-17). El problema no era la ausencia: era que cada uno decía cosas distintas, y muchos
 * se limitaban a informar sin decir qué hacer. Aquí el vacío lleva **acción**: un vacío sin salida es
 * un callejón.
 *
 * Uso:
 *   <EmptyState
 *     icono={<Receipt size={26} color={colors.textSecondary} />}
 *     titulo="Todavía no hay movimientos"
 *     texto="Cuando recargues o pagues, aparecerán aquí."
 *     accionLabel="Recargar" onAccion={…}
 *   />
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { alpha, brand } from '../theme/colors';
import { ilustracion, tipografia } from '../theme/escalas';
import { GhostButton, PrimaryButton } from './PrimaryButton';

export interface EmptyStateProps {
  icono?: ReactNode;
  /**
   * Emoji como sujeto del vacío. **Es la vía preferida frente a `icono`** cuando lo que se pinta es
   * un emoji: su tamaño no es una decisión de la pantalla, es de la escala (`ilustracion.md`), y
   * pasarlo por `icono` obligaba a escribir un `fontSize` suelto en cada llamada — el módulo
   * Mercado llegó a tener ocho tamaños distintos, del 22 al 56, para esta misma pieza.
   */
  emoji?: string;
  titulo: string;
  /** Explica QUÉ es esto y POR QUÉ está vacío. No relleno. */
  texto?: string;
  accionLabel?: string;
  onAccion?: () => void;
  /**
   * Si la acción del vacío es LA acción principal de la pantalla («Registra tu restaurante»,
   * «Publicar mi primer producto»), va rellena en vez de con contorno. Los vacíos escritos a mano
   * ya distinguían las dos (`kind: 'primary' | 'ghost'`), y aplanarlas a contorno habría quitado
   * peso justo a lo que se quiere que el usuario haga.
   */
  accionPrimaria?: boolean;
  compacto?: boolean;
  /**
   * Para pantallas que fuerzan fondo OSCURO (el feed de vídeo es negro a propósito): el componente
   * pinta con los colores del TEMA, así que sobre negro el texto del tema claro sería oscuro sobre
   * oscuro, o sea ilegible. Con esto usa blanco y blanco translúcido.
   */
  sobreOscuro?: boolean;
}

export function EmptyState({
  icono, emoji, titulo, texto, accionLabel, onAccion, accionPrimaria = false, compacto = false, sobreOscuro = false,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const colorTitulo = sobreOscuro ? brand.white : colors.textPrimary;
  const colorTexto = sobreOscuro ? alpha(brand.white, 0.72) : colors.textSecondary;
  /* `emoji` gana a `icono`: si vienen los dos, el emoji es el sujeto y el nodo de icono es ruido. */
  const sujeto = emoji ? <Text style={{ fontSize: ilustracion.md }}>{emoji}</Text> : icono;
  return (
    <View style={[styles.caja, compacto ? { paddingVertical: 20 } : { paddingVertical: 34 }]}>
      {sujeto}
      <Text style={{ color: colorTitulo, fontSize: tipografia.subtitle, fontWeight: '800', textAlign: 'center', marginTop: sujeto ? 10 : 0 }}>
        {titulo}
      </Text>
      {texto ? (
        <Text style={{ color: colorTexto, fontSize: tipografia.body, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
          {texto}
        </Text>
      ) : null}
      {accionLabel && onAccion ? (
        <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
          {accionPrimaria
            ? <PrimaryButton title={accionLabel} onPress={onAccion} />
            : <GhostButton title={accionLabel} onPress={onAccion} />}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { alignItems: 'center', paddingHorizontal: 24 },
});
