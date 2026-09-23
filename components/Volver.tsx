/**
 * Volver — el botón de atrás de la app, SEGURO POR DEFECTO.
 *
 * POR QUÉ EXISTE (auditoría de diseño, D-38 y prueba del dueño en el aparato):
 *   1. **No siempre volvía.** Había **152 llamadas a `router.back()` en 98 archivos** y solo 6 usos
 *      del ayudante que sí sabe salir. `router.back()` no hace NADA cuando la pantalla no tiene
 *      historial: si llegaste por un enlace, por una notificación o tras un `replace`, el botón
 *      parece roto. Aquí, si no se puede volver, se va al inicio: siempre pasa algo.
 *   2. **No siempre se veía.** El botón es lo primero que el usuario busca; aquí se dibuja con un
 *      área táctil de 44 pt, etiqueta para lectores de pantalla y sin depender de que la cabecera
 *      esté dentro del contenido que se desplaza.
 *
 * Uso:  <Volver />                     → vuelve o va al inicio
 *       <Volver onPress={…} />         → cuando la pantalla necesita hacer algo más (cerrar un modal)
 *       <Volver color={colors.white} /> → sobre fondos oscuros o fotos (un token, nunca un literal)
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@egrouteplan/ui-kit';
import { ir } from '../constants/rutas';

export function Volver({
  onPress,
  color,
  accessibilityLabel = 'Volver',
  size = 22,
}: {
  onPress?: () => void;
  color?: string;
  accessibilityLabel?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress ?? (() => ir.atras())}
      // 44 pt de área táctil aunque el icono sea pequeño: el dedo no apunta.
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.55 : 1 }]}
    >
      <ArrowLeft size={size} color={color ?? colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
