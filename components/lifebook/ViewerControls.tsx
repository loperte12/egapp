/**
 * Controles del visor de fotos a pantalla completa (Parte 32).
 *
 * El dueño reportó que «no se puede hacer zoom» ni en las publicaciones ni en
 * los chats: la pinza y el doble toque ya están en `ZoomableImage`, pero no
 * todos los móviles/gestos responden igual. Estos botones ( − · encajar · + )
 * garantizan que el zoom funcione siempre, y son la pista visual de que la foto
 * se puede ampliar.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Maximize2, Minus, Plus } from 'lucide-react-native';
import { brand, espaciado } from '@egrouteplan/ui-kit';

export function ViewerButton({ children, onPress, label }: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}

/** Fila − · encajar · + anclada abajo a la izquierda del visor. */
export function ViewerZoomControls({ bottom, onZoomOut, onFit, onZoomIn }: {
  bottom: number;
  onZoomOut: () => void;
  onFit: () => void;
  onZoomIn: () => void;
}) {
  return (
    <View style={{ position: 'absolute', left: 16, bottom, flexDirection: 'row', gap: espaciado.e10 }}>
      <ViewerButton label="Alejar la foto" onPress={onZoomOut}>
        <Minus size={18} color={brand.white} />
      </ViewerButton>
      <ViewerButton label="Encajar la foto" onPress={onFit}>
        <Maximize2 size={17} color={brand.white} />
      </ViewerButton>
      <ViewerButton label="Ampliar la foto" onPress={onZoomIn}>
        <Plus size={18} color={brand.white} />
      </ViewerButton>
    </View>
  );
}
