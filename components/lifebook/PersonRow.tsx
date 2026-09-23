/**
 * PersonRow — fila de persona reutilizable (avatar o inicial, nombre,
 * subtítulo y acciones a la derecha). La usan las hojas de Mensajes, la
 * creación de grupos y la gestión de miembros.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { alpha, useTheme, tipografia } from '@egrouteplan/ui-kit';

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
          <Text style={{ color: colors.primary, fontWeight: '900' }}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: '700', fontSize: tipografia.body }}>{name}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{subtitle}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  personAvatar: { width: 40, height: 40, borderRadius: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
