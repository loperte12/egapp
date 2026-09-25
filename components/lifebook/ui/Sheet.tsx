/**
 * ui/Sheet — piezas comunes de las hojas inferiores de Life Book.
 *
 *   · `Sheet`       → modal con fondo oscuro + lámina inferior (con tirador).
 *   · `SheetHeader` → título + botón de cerrar.
 *   · `formaHoja` / `formaTirador` → la GEOMETRÍA de esa lámina, para las hojas que se
 *     escriben su propio `<Modal>`.
 *
 * POR QUÉ SE EXPORTA LA GEOMETRÍA (24/09/2026, Fase 2): el censo de formas repetidas
 * (`_a5-censo-formas-repetidas.py`) encontró que el cuerpo de `sheetStyles.sheet` estaba
 * **copiado a mano en 17 ficheros** con los mismos siete valores —posición absoluta pegada
 * abajo, los dos radios de 22 y un relleno de 18— y con nombres distintos: `sheet`, `menuSheet`,
 * `userMenuSheet`, `sheetCard`. Es una forma escrita 17 veces: cambiar el radio de la hoja
 * exigía 17 ediciones y ninguna sabía de las otras. El tirador estaba en 3.
 *
 * OJO AL COMENTAR ESTE FICHERO: la guardia (`pruebas/verifica-diseno.cjs`) cuenta los literales
 * que aparecen DENTRO de los comentarios, y **no distingue el que explica del que escribe**. Citar
 * aquí una declaración de relleno con su cifra sube la deuda del fichero en 1 y hace fallar el
 * trinquete — pasó al escribir este mismo bloque, dos veces. Los valores se explican con palabras.
 *
 * Ni `sheetStyles` ni `formaHoja` cambian un solo píxel: los que las usan extienden la forma
 * (`{ ...formaHoja }`), que es exactamente lo que hacen las declaraciones de abajo.
 *
 * Las usan las hojas de Mensajes (buscar chat, añadir amigo, crear grupo, escanear), el menú
 * «⋯» del chat y la gestión de grupos — y, desde esta fecha, las pantallas que hasta ahora
 * pintaban su propia copia.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, useTheme, peso, radios} from '@egrouteplan/ui-kit';
import { X } from 'lucide-react-native';

/**
 * La geometría de la lámina inferior: pegada al borde de abajo, ancho completo, esquinas de
 * arriba redondeadas y 18 de relleno.
 *
 * Los dos números van en crudo **a propósito**. La escala `radios` no tiene un peldaño de 22 y
 * `espaciado` no tiene uno de 18, así que subirlos a token hoy sería inventar dos peldaños que
 * nadie ha decidido, y la Fase 1 se cerró con nombres concretos (`marca/chip/campo/tarjeta`).
 * Lo que sí queda hecho es **la medición**: 22 aparece en 17 ficheros y 18 en 17. Eso es un
 * candidato con números al lado, no una decisión tomada — quien la tome, la toma con este dato.
 */
export const formaHoja = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  borderTopLeftRadius: radios.panelAncho,
  borderTopRightRadius: radios.panelAncho,
  padding: espaciado.e18,
} as const;

/** El tirador de la hoja: la barrita que dice «esto se arrastra». Tres sitios el 24/09/2026. */
export const formaTirador = {
  width: 40,
  height: 4,
  borderRadius: radios.pista,
  alignSelf: 'center',
  marginBottom: espaciado.e14,
} as const;

export function Sheet({ visible, onClose, children }: {
  visible: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.handle, { backgroundColor: alpha(colors.textPrimary, 0.2) }]} />
        {children}
      </View>
    </Modal>
  );
}

export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sheetHeader}>
      <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo, flex: 1 }}>{title}</Text>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><X size={20} color={colors.textSecondary} /></Pressable>
    </View>
  );
}

export const sheetStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  handle: { ...formaTirador },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e10 },
});

const styles = sheetStyles;
