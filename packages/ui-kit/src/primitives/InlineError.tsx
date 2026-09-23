/**
 * InlineError — el error EN LA PANTALLA, no encima de ella.
 *
 * POR QUÉ EXISTE: la app comunicaba el error con **411 `Alert.alert` repartidos en 71 archivos**
 * (auditoría de diseño, D-03). Un modal bloqueante corta el flujo: el usuario pierde el contexto de
 * lo que estaba haciendo y tiene que cerrar una ventana para volver a intentarlo. En una pantalla de
 * dinero eso es exactamente lo que no queremos.
 *
 * Este componente dice qué pasó, delante de la vista y sin robar el toque. Se anuncia al lector de
 * pantalla (en las dos plataformas) y vibra al aparecer: quien no mira la pantalla también se entera.
 *
 * Uso: <InlineError mensaje={error} onReintentar={() => void pagar()} />
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { alpha, brand } from '../theme/colors';
import { AlertTriangle } from 'lucide-react-native';
import { anunciar } from '../feedback/anuncios';
import { haptico } from '../feedback/hapticos';

export interface InlineErrorProps {
  mensaje?: string | null;
  /** Si se pasa, aparece un botón de reintento: el error dice cómo salir, no solo que hay error. */
  onReintentar?: () => void;
  /** Texto del botón de reintento. */
  etiquetaReintento?: string;
  /**
   * Para pantallas que fuerzan fondo OSCURO (el feed de vídeo es negro a propósito): el mensaje y el
   * reintento usan los colores del TEMA, y sobre negro el tema claro daría texto oscuro sobre oscuro.
   */
  sobreOscuro?: boolean;
}

export function InlineError({
  mensaje, onReintentar, etiquetaReintento = 'Reintentar', sobreOscuro = false,
}: InlineErrorProps) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!mensaje) return;
    anunciar(mensaje);
    haptico('aviso');
  }, [mensaje]);

  if (!mensaje) return null;

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={[
        styles.caja,
        sobreOscuro
          ? { backgroundColor: alpha(brand.white, 0.08), borderColor: alpha(brand.white, 0.35) }
          : { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.3) },
      ]}
    >
      <AlertTriangle size={16} color={sobreOscuro ? brand.warning : colors.danger} />
      <Text style={{ flex: 1, color: sobreOscuro ? brand.white : colors.textPrimary, fontSize: 13.5, lineHeight: 19 }}>{mensaje}</Text>
      {onReintentar ? (
        <Pressable onPress={onReintentar} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: sobreOscuro ? brand.white : colors.primary, fontSize: 13.5, fontWeight: '800' }}>{etiquetaReintento}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
});
