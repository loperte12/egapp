/**
 * AvatarsSeguidos — la fila de avatares de la gente que sigues, arriba del feed.
 *
 * Es lo que pidió el dueño para la pestaña «Seguidos», mirando el módulo de Xiaohongshu
 * (ver `docs/ORGANIZACION-LIFEBOOK-XIAOHONGSHU.md`): en 关注 aparecen los avatares de
 * las personas que sigues, y al tocar una se va a lo suyo.
 *
 * QUÉ NO TIENE, Y POR QUÉ: el **anillo rojo de «tiene novedad»**. En Xiaohongshu ese
 * anillo marca quién ha publicado algo que no has visto, y para eso hace falta estado
 * por (usuario, autor) que NO existe en ninguna tabla nuestra. Prefiero una fila sin
 * anillo y decirlo, que un anillo que mienta. Lo que sí hay es el ORDEN por actividad
 * (quien publicó hace poco, primero), que se puede calcular de verdad.
 */
import React from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { alpha, espaciado, tipografia, peso, radios} from '@egrouteplan/ui-kit';
import { absUrl } from '../../api/config';
import type { LbSeguido } from '../../api/lifebookSeguidos';

export function AvatarsSeguidos({ gente, colors, onOpen }: {
  gente: LbSeguido[];
  colors: any;
  onOpen: (id: string) => void;
}) {
  if (gente.length === 0) return null;

  return (
    <View style={{ paddingTop: espaciado.e8, paddingBottom: espaciado.e6 }}>
      <Text style={{
        fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.4,
        color: colors.textSecondary, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e6,
      }}>
        A QUIEN SIGUES
      </Text>
      <FlatList
        horizontal
        data={gente}
        keyExtractor={(x) => x.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: espaciado.e12, gap: espaciado.e14 }}
        renderItem={({ item }) => {
          const nombre = item.fullName?.trim() || 'Usuario';
          const inicial = nombre.slice(0, 1).toUpperCase() || 'U';
          const foto = item.avatarUrl ? absUrl(item.avatarUrl) : '';
          return (
            <Pressable
              onPress={() => onOpen(item.id)}
              accessibilityLabel={`Ver el perfil de ${nombre}`}
              style={{ alignItems: 'center', width: 62 }}
            >
              {foto ? (
                <Image
                  source={{ uri: foto }}
                  style={{
                    width: 54, height: 54, borderRadius: radios.full,
                    backgroundColor: alpha(colors.textPrimary, 0.08),
                  }}
                />
              ) : (
                <View style={{
                  width: 54, height: 54, borderRadius: radios.full,
                  backgroundColor: alpha(colors.primary, 0.16),
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: 19 }}>{inicial}</Text>
                </View>
              )}
              <Text
                numberOfLines={1}
                style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e5, maxWidth: 62, textAlign: 'center' }}
              >
                {nombre.split(' ')[0]}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
