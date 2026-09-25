/**
 * SeguirViendo — la fila de «seguir viendo» encima del feed de vídeos.
 *
 * Qué es: los vídeos que dejaste a medias, con una barrita que dice por dónde ibas.
 * Sale del trabajo de esta ronda: hasta ahora no había NINGUNA forma de reanudar un
 * vídeo (comprobado: no existía ni el dato).
 *
 * POR QUÉ SOLO EN EL PRIMER VÍDEO: el feed es inmersivo y una fila fija encima
 * estorba en cuanto se desliza. Se enseña al entrar (donde sirve: «¿sigo con lo de
 * ayer?») y desaparece al primer deslizamiento. Es el compromiso que respeta las dos
 * cosas.
 *
 * Se coloca justo DEBAJO de la cabecera flotante del feed (que es de una sola línea
 * con volver y sonido), no encima: si no, taparía los botones.
 */
import React from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { absUrl } from '../../api/config';
import type { LbSeguirViendo } from '../../api/lifebookWatch';
import { brand, espaciado, radios, tipografia, peso} from '@egrouteplan/ui-kit';

export function SeguirViendo({ items, colors, top, onOpen, onQuitar }: {
  items: LbSeguirViendo[];
  colors: any;
  /** Altura a la que empieza (debajo de la cabecera). */
  top: number;
  onOpen: (id: string) => void;
  onQuitar: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top }} pointerEvents="box-none">
      <Text style={{
        color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo, letterSpacing: 0.4,
        paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e6,
        textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4,
      }}>
        Seguir viendo
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(x) => x.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: espaciado.e14, gap: espaciado.e10 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item.id)}
            accessibilityLabel={`Seguir viendo ${item.title ?? 'vídeo'}, por el ${item.percent} %`}
            style={{
              width: 136, borderRadius: radios.md, overflow: 'hidden',
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <View style={{ height: 76, backgroundColor: 'rgba(255,255,255,0.06)' }}>
              {item.thumb?.url ? (
                <Image source={{ uri: absUrl(item.thumb.url) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>🎬</Text>
                </View>
              )}
              {/* Barrita: por dónde ibas, de un vistazo. */}
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' }}>
                <View style={{ width: `${Math.min(100, Math.max(0, item.percent))}%`, height: 3, backgroundColor: colors?.primary ?? brand.like }} />
              </View>
              <Pressable
                onPress={() => onQuitar(item.id)}
                hitSlop={10}
                accessibilityLabel="Quitar de seguir viendo"
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={12} color={brand.white} />
              </Pressable>
            </View>
            <Text numberOfLines={2} style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: peso.fuerte, padding: espaciado.e7, paddingTop: espaciado.e6 }}>
              {item.title?.trim() || 'Vídeo'}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
