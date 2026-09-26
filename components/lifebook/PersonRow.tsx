/**
 * PersonRow — fila de persona reutilizable (avatar o inicial, nombre,
 * subtítulo y acciones a la derecha). La usan las hojas de Mensajes, la
 * creación de grupos y la gestión de miembros.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { alpha, espaciado, tipografia, useTheme, peso, radios} from '@egrouteplan/ui-kit';

export function PersonRow({ name, avatarUrl, subtitle, actions }: {
  name: string; avatarUrl?: string | null; subtitle?: string; actions: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.personRow, { borderBottomColor: alpha(colors.border, 0.5) }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.personAvatar} />
      ) : (
        <View style={[styles.personAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
          <Text style={{ color: colors.text.primary, fontWeight: peso.titulo }}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>{name}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{subtitle}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  personRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth },
  personAvatar: { width: 40, height: 40, borderRadius: radios.full },
  center: { alignItems: 'center', justifyContent: 'center' },
});
