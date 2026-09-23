/**
 * Sheet — la hoja de diálogo ÚNICA del kit.
 *
 * POR QUÉ EXISTE: en la app había **51 archivos** que escribían su propio `<Modal>` (y solo una
 * referencia a una hoja inferior). Cada uno decidía por su cuenta el fondo oscurecido, la posición,
 * el cierre al tocar fuera y —lo más importante— **si el lector de pantalla lo anunciaba**. Por eso
 * la accesibilidad de los diálogos era irregular: no había un sitio único donde arreglarla.
 *
 * Trae lo que hace falta para que un diálogo esté bien sin pensarlo:
 *   · Cierre al tocar fuera y con el botón físico de atrás (`onRequestClose`).
 *   · El foco queda DENTRO de la hoja (`accessibilityViewIsModal`), que en iOS es la diferencia
 *     entre un diálogo usable y uno que deja al usuario perdido detrás.
 *   · Título con rol de cabecera y el resto del contenido etiquetado por él.
 *   · No se puede cerrar mientras `busy` (no se abandona un pago a medias por un toque fuera).
 *
 * Uso:
 *   <Sheet visible={x} title="¿Cancelar el pedido?" onClose={cerrar}>
 *     <Text>…</Text>
 *     <PrimaryButton title="Sí, cancelar" onPress={…} />
 *   </Sheet>
 */
import React, { type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { haptico } from '../feedback/hapticos';

export interface SheetProps {
  visible: boolean;
  /** Cabecera del diálogo. Se anuncia como cabecera al lector de pantalla. */
  title: string;
  subtitle?: string;
  /** Si está ocupado, no se cierra ni tocando fuera ni con el botón de atrás. */
  busy?: boolean;
  /** `center` para confirmaciones cortas; `bottom` para hojas de acción. */
  position?: 'center' | 'bottom';
  onClose: () => void;
  children?: ReactNode;
}

export function Sheet({
  visible, title, subtitle, busy = false, position = 'center', onClose, children,
}: SheetProps) {
  const { colors } = useTheme();
  const cerrar = () => { if (!busy) onClose(); };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={position === 'bottom' ? 'slide' : 'fade'}
      onRequestClose={cerrar}
      // En Android el botón atrás dispara `onRequestClose`; en iOS el gesto de cierre.
      statusBarTranslucent
    >
      <View style={[styles.overlay, position === 'bottom' ? styles.abajo : styles.centro]}>
        {/* Tocar fuera cierra: es lo que espera cualquiera. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={cerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          // El fondo no debe robar el foco del diálogo.
          importantForAccessibility="no"
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.hoja,
            position === 'bottom' ? styles.hojaAbajo : styles.hojaCentro,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, textAlign: 'center', marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
          <View style={{ marginTop: 14, gap: 10 }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  centro: { justifyContent: 'center', padding: 24 },
  abajo: { justifyContent: 'flex-end' },
  hoja: { borderWidth: 1, padding: 20 },
  hojaCentro: { borderRadius: 20 },
  hojaAbajo: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 0,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
    /*
      Tope de altura para la hoja de abajo. Sin esto, una hoja con una lista larga (el selector de
      ciudad, 24 filas) crece hasta ocupar la pantalla entera y deja de parecer una hoja: lo encontró
      la comprobación EN EL APARATO, no el compilador. Con el tope, lo de dentro desplaza — que es lo
      que hacía el modal escrito a mano con su `maxHeight: '75%'`.
    */
    maxHeight: '80%',
  },
});
