/**
 * Aviso — el mensaje breve que aparece y se va (el «toast» que la app no tenía).
 *
 * POR QUÉ EXISTE: para lo que NO es un error y tampoco merece parar al usuario («guardado», «copiado»,
 * «va en camino»), la app usaba el mismo `Alert` bloqueante que para los fallos. Aquí está el aviso
 * que no interrumpe.
 *
 * Uso:
 *   <Aviso visible={ok} mensaje="Pedido confirmado" onOcultar={() => setOk(false)} tono="exito" />
 *   // o con el ayudante: const [aviso, mostrarAviso] = useAviso();  mostrarAviso('Copiado')
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { haptico } from '../feedback/hapticos';

export type TonoAviso = 'neutro' | 'exito' | 'aviso';

export interface AvisoProps {
  visible: boolean;
  mensaje: string;
  tono?: TonoAviso;
  /** Milisegundos en pantalla. 0 = se queda hasta que lo cierren. */
  duracion?: number;
  onOcultar?: () => void;
}

export function Aviso({ visible, mensaje, tono = 'neutro', duracion = 2600, onOcultar }: AvisoProps) {
  const { colors } = useTheme();
  const [opacidad] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacidad, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
    if (!visible) return;
    if (tono === 'exito') haptico('exito');
    if (duracion <= 0) return;
    const id = setTimeout(() => onOcultar?.(), duracion);
    return () => clearTimeout(id);
  }, [visible, tono, duracion, onOcultar, opacidad]);

  if (!visible) return null;

  const fondo = tono === 'exito' ? colors.success : tono === 'aviso' ? colors.warning : colors.textPrimary;
  const texto = tono === 'aviso' ? colors.onWarning : colors.white;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.toast, { backgroundColor: fondo, opacity: opacidad }]}
    >
      <Text style={{ color: texto, fontSize: 13.5, fontWeight: '700' }}>{mensaje}</Text>
    </Animated.View>
  );
}

/** Ayudante para no repetir el estado en cada pantalla. */
export function useAviso(): [
  { visible: boolean; mensaje: string; tono: TonoAviso },
  (mensaje: string, tono?: TonoAviso) => void,
  () => void,
] {
  const [estado, setEstado] = useState<{ visible: boolean; mensaje: string; tono: TonoAviso }>({
    visible: false, mensaje: '', tono: 'neutro',
  });
  const mostrar = useCallback((mensaje: string, tono: TonoAviso = 'neutro') => setEstado({ visible: true, mensaje, tono }), []);
  const ocultar = useCallback(() => setEstado((e) => ({ ...e, visible: false })), []);
  return [estado, mostrar, ocultar];
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 24, right: 24, bottom: 48,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
  },
});
