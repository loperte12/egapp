/**
 * PublicacionTarjeta — la tarjeta de una publicación que va DENTRO de un comentario.
 *
 * Se pinta cuando alguien adjunta una publicación al comentar (una nota, un vídeo, una
 * venta, un podcast…). Es una REFERENCIA a la publicación, no una copia: si el original
 * desaparece, el servidor manda `ref: null` y esta tarjeta simplemente no se pinta, así
 * que nunca queda un enlace roto.
 *
 * POR QUÉ ES UN COMPONENTE APARTE: la publicidad dentro de los comentarios (lo de WeChat)
 * necesita exactamente esta misma tarjeta con una etiqueta «Publicidad» encima. Con la
 * tarjeta en un solo sitio, el día que se haga la publicidad no hay que diseñarla dos veces.
 *
 * Enseña **de quién es** lo adjunto además del título: es lo que WeChat consideró
 * imprescindible al mejorar su «引用» (que una cita se pueda rastrear). El chat, hoy, solo
 * manda título y miniatura.
 */
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { alpha, espaciado, radios, tipografia, peso} from '@egrouteplan/ui-kit';
import { absUrl } from '../../api/config';
import type { LbAdjuntoRef } from '../../api/lifebookComentarios';

/** Cómo se llama cada tipo de publicación en pantalla (lo usa también el selector). */
export const ETIQUETA_PUBLICACION: Record<string, string> = {
  note: 'Nota',
  video: 'Vídeo',
  sale: 'Venta',
  service: 'Servicio',
  serie: 'Serie',
  podcast: 'Podcast',
  debate: 'Debate',
  episode: 'Episodio',
};

/** Un dibujo para cuando la publicación no tiene foto (nunca un hueco vacío). */
const DIBUJO: Record<string, string> = {
  note: '📝',
  video: '🎬',
  sale: '🏷️',
  service: '🛠️',
  serie: '📺',
  podcast: '🎙️',
  debate: '💬',
  episode: '🎞️',
};

export function PublicacionTarjeta({ data, tint, colors, compacta = false }: {
  data: LbAdjuntoRef;
  /** Color del tipo de publicación, para los fondos suaves. */
  tint: string;
  colors: any;
  /** Dentro de una respuesta va algo más pequeña. */
  compacta?: boolean;
}) {
  const router = useRouter();
  const titulo = data.title?.trim() || ETIQUETA_PUBLICACION[data.type] || 'Publicación';
  const deQuien = data.author?.fullName?.trim() || 'Usuario';
  const alto = compacta ? 46 : 54;

  /**
   * Abre la publicación adjunta. Los vídeos se abren en el feed inmersivo (es donde se
   * ven de verdad, y admite `startId` para arrancar en ese vídeo); lo demás, en su
   * pantalla de detalle.
   */
  const abrir = () => {
    if (data.type === 'video') {
      router.push({ pathname: '/lifebook-videos', params: { startId: data.id } } as never);
      return;
    }
    router.push({ pathname: '/lifebook-post/[id]', params: { id: data.id } } as never);
  };

  const miniatura = data.thumb?.url ? absUrl(data.thumb.url) : '';

  return (
    <Pressable
      onPress={abrir}
      accessibilityLabel={`Abrir ${ETIQUETA_PUBLICACION[data.type] ?? 'publicación'}: ${titulo}, de ${deQuien}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
        marginTop: espaciado.e6, padding: espaciado.e7, borderRadius: radios.md,
        backgroundColor: alpha(colors.textPrimary, 0.05),
        borderWidth: 1, borderColor: alpha(colors.textPrimary, 0.08),
      }}
    >
      {miniatura ? (
        <Image source={{ uri: miniatura }} style={{ width: alto, height: alto, borderRadius: 9, backgroundColor: alpha(colors.textPrimary, 0.08) }} />
      ) : (
        <View style={{ width: alto, height: alto, borderRadius: 9, backgroundColor: alpha(tint, 0.16), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: compacta ? 17 : 20 }}>{DIBUJO[data.type] ?? '📄'}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: compacta ? 12.5 : 13, fontWeight: peso.maximo, color: colors.textPrimary, lineHeight: compacta ? 17 : 18 }}>
          {titulo}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
          {ETIQUETA_PUBLICACION[data.type] ?? 'Publicación'} · de {deQuien}
          {data.priceXaf ? ` · ${data.priceXaf.toLocaleString('fr-FR')} XAF` : ''}
        </Text>
      </View>
    </Pressable>
  );
}
