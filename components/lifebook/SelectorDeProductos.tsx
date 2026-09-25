/**
 * SelectorDeProductos — «productos dentro del contenido» (Mercado · tanda C).
 *
 * Una nota o un vídeo pueden llevar productos enganchados: se ven **debajo del texto** en las notas
 * y como **sticker sobre el reproductor** en los vídeos. Esta hoja es la que los elige, y es la
 * MISMA en las dos pantallas: antes vivía copiada dentro del compositor de notas, y el flujo de
 * **publicar vídeo** no la tenía (un vídeo solo podía llevar productos por API).
 *
 * Reglas que la hoja hace cumplir (y dice en voz alta):
 *  · Solo productos **de mi tienda** (lo valida también el servidor: uno ajeno se ignora).
 *  · El **orden** en que se eligen es el orden en que se ven: por eso van numerados.
 *  · Tope de productos (`max`): al pasarse, se avisa en vez de aceptarlo en silencio.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { Package, X } from 'lucide-react-native';
import { absUrl } from '../../api/config';
import { productosEnNotaApi, MAX_PRODUCTOS_POR_NOTA } from '../../api/lifebookProductos';
import type { LbProductCard } from '../../api/commerce';

export function SelectorDeProductos({ visible, onClose, seleccion, onCambiar, titulo, ayuda, max = MAX_PRODUCTOS_POR_NOTA }: {
  visible: boolean;
  onClose: () => void;
  /** Ids elegidos, EN ORDEN. */
  seleccion: string[];
  /** Nuevo orden/lista al tocar un producto. */
  onCambiar: (ids: string[]) => void;
  /** «Productos en esta nota» · «Productos en este vídeo». */
  titulo: string;
  /** Dónde y cómo se verán (una línea de ayuda, distinta en cada pantalla). */
  ayuda: string;
  max?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [misProds, setMisProds] = useState<LbProductCard[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    setMisProds(null);
    productosEnNotaApi.misProductos()
      .then((r) => { if (vivo) setMisProds((r.items ?? []).filter((p) => (p as { status?: string }).status === 'active')); })
      .catch(() => { if (vivo) setMisProds([]); });
    return () => { vivo = false; };
  }, [visible]);

  const alternar = (id: string) => {
    if (seleccion.includes(id)) {
      onCambiar(seleccion.filter((x) => x !== id));
      return;
    }
    if (seleccion.length >= max) {
      Alert.alert(`Ya hay ${max}`, 'Más productos saturan la lectura: deja los que de verdad salen.');
      return;
    }
    onCambiar([...seleccion, id]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: espaciado.e16, paddingBottom: insets.bottom + 16, maxHeight: '80%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e4 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 }}>{titulo}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>
          {ayuda} (máximo {max}). Solo puedes enganchar productos de tu propia tienda.
        </Text>

        {misProds === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e26 }} />
        ) : misProds.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingVertical: espaciado.e22 }}>
            No tienes productos activos. Publica uno en tu tienda y podrás enseñarlo dentro de tus publicaciones.
          </Text>
        ) : (
          <ScrollView contentContainerStyle={{ gap: espaciado.e8 }} style={{ maxHeight: 400 }}>
            {misProds.map((p) => {
              const puesto = seleccion.indexOf(p.id);
              const on = puesto >= 0;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => alternar(p.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Producto ${p.title}`}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, padding: espaciado.e8, borderRadius: radios.md, borderWidth: trazo.fino,
                    borderColor: on ? colors.primary : alpha(colors.border, 0.6),
                    backgroundColor: on ? alpha(colors.primary, 0.08) : colors.surface,
                  }}
                >
                  {p.coverUrl ? (
                    <Image source={{ uri: absUrl(p.coverUrl) }} style={styles.mini} />
                  ) : (
                    <View style={[styles.mini, { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }]}>
                      <Package size={18} color={alpha(colors.primary, 0.6)} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{p.title}</Text>
                    <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                      {p.priceXaf === null ? 'Precio a consultar' : `${p.priceXaf} XAF`}
                    </Text>
                  </View>
                  {on ? (
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>{puesto + 1}</Text>
                    </View>
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 18, fontWeight: peso.titulo }}>+</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable
          onPress={onClose}
          accessibilityLabel="Listo"
          style={[styles.listo, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: brand.white, fontSize: 15, fontWeight: peso.titulo }}>
            {seleccion.length ? `Listo (${seleccion.length})` : 'Listo'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mini: { width: 44, height: 44, borderRadius: 10 },
  listo: { borderRadius: 14, paddingVertical: espaciado.e13, alignItems: 'center', justifyContent: 'center', marginTop: espaciado.e12 },
});
