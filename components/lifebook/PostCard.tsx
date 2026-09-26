/**
 * PostCard — Tarjeta de feed estilo Xiaohongshu (v2)
 * Imagen dominante (3:4 o proporción real) + chip de categoría + título
 * (2 líneas) + ubicación/tema + autor + social (**solo ♥**, que se puede tocar).
 *
 * Consume `LbPostCard` (api/lifebook.ts): la forma derivada de `LbPostBase`
 * con `toPostCard()` → `media` es UN objeto de portada, el autor ya trae
 * `name` y el social viene en campos planos.
 *
 * Zonas de la imagen: categoría arriba-izquierda · ⋯ arriba-derecha ·
 * ▶ centro · precio abajo-izquierda · contador 1/N abajo-derecha.
 *
 * Vista previa (decidido con el dueño): **solo el corazón** — se quitaron los
 * iconos de comentario y guardar, porque esos viven dentro de la publicación.
 * El corazón se puede tocar aquí mismo y, como en Instagram/Xiaohongshu, un
 * **doble toque** en cualquier parte de la tarjeta da me gusta.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Heart, MoreHorizontal, Play } from 'lucide-react-native';
import { alpha, espaciado, neutro, peso, Precio, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { LB_CARD_DEFAULT_RATIO, type LbPostCard } from '../../api/lifebook';
import { lbXaf } from '../../constants/lifebook';
import { brand } from '@egrouteplan/ui-kit';

interface Props {
  post: LbPostCard;
  width: number;
  onPress: (id: string) => void;
  onMore?: (post: LbPostCard) => void;
  /**
   * Me gusta desde la propia tarjeta (como Instagram/Xiaohongshu): se puede
   * tocar el corazón o **hacer doble toque** en la publicación.
   */
  onLike?: (post: LbPostCard, liked: boolean) => void;
}

/**
 * Parte 31 (navegación fluida): memo — la tarjeta solo se vuelve a pintar si su
 * publicación (o el ancho) cambia de verdad. Con el feed recargando en
 * silencio, volver de un detalle ya no vuelve a montar las 20 tarjetas.
 */
export const PostCard = memo(function PostCard({ post, width, onPress, onMore, onLike }: Props) {
  const { colors } = useTheme();
  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likes, setLikes] = useState(post.likesCount ?? 0);
  const [heartPop, setHeartPop] = useState(false);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El estado real puede llegar después (feed recargado o detalle).
  useEffect(() => { setLiked(!!post.likedByMe); }, [post.likedByMe]);
  useEffect(() => { setLikes(post.likesCount ?? 0); }, [post.likesCount]);
  useEffect(() => () => { if (popTimer.current) clearTimeout(popTimer.current); }, []);

  const applyLike = (next: boolean) => {
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    onLike?.(post, next);
  };

  const toggleLike = () => applyLike(!liked);

  /** Doble toque → me gusta (con el corazón grande, como en Xiaohongshu). */
  const doubleTapLike = () => {
    if (!liked) applyLike(true);
    setHeartPop(true);
    if (popTimer.current) clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setHeartPop(false), 650);
  };

  const ratio = post.media?.aspectRatio ?? LB_CARD_DEFAULT_RATIO;
  const imgH = Math.round(width / Math.max(ratio, 0.5));

  const imageUrl = post.media?.thumbnailUrl ?? post.media?.url;
  const body = post.body ?? '';
  const blockText = body || post.title;
  const footerText = post.media ? post.title : body && post.title !== body ? post.title : '';

  // OJO: `??` no se puede mezclar con `||` sin paréntesis (error de sintaxis).
  const isVideo = post.hasVideo ?? (post.type === 'video' || post.type === 'serie');
  const photoCount = Number(post.mediaCount ?? 0) || 0;

  /* Doble toque = me gusta; toque simple = abrir la publicación.
     Se usa `Gesture.Exclusive` para no abrir el detalle al hacer doble toque.
     Las funciones que corren en JS se declaran aquí fuera: `runOnJS` necesita
     funciones del hilo de JS, no flechas creadas dentro del worklet. */
  const openPost = () => onPress(post.id);
  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(260).onEnd(() => { runOnJS(doubleTapLike)(); });
  const singleTap = Gesture.Tap().numberOfTaps(1).onEnd(() => { runOnJS(openPost)(); });
  const taps = Gesture.Exclusive(doubleTap, singleTap);

  return (
    <>
    <Pressable
      onPress={() => onPress(post.id)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={post.title || 'Publicación'}
    >
      {/* ── Imagen / Video ── */}
      {/* ── Imagen / Video: aquí el DOBLE TOQUE da me gusta (el corazón de abajo es un toque normal) ── */}
      <GestureDetector gesture={taps}>
      <View style={{ position: 'relative' }}>
        {imageUrl ? (
          /* expo-image (Parte 31): caché en memoria+disco y recyclingKey. Antes
             con <Image> de React Native cada vuelta a la pantalla obligaba a
             volver a descargar/decodificar la portada → destello blanco. */
          <Image
            source={imageUrl}
            style={{ width, height: imgH, borderRadius: radios.sm, backgroundColor: colors.surface }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={post.id}
            transition={0}
          />
        ) : (
          <View
            style={[styles.noMedia, { width, height: imgH, backgroundColor: alpha(colors.primary, 0.07) }]}
          >
            <Text numberOfLines={6} style={[styles.noMediaText, { color: colors.textPrimary }]}>
              {blockText}
            </Text>
          </View>
        )}

        {/* Chip de categoría — arriba izquierda */}
        {post.category ? (
          <View style={[styles.chip, styles.chipTL]}>
            <Text style={styles.chipText}>{post.category}</Text>
          </View>
        ) : null}

        {/* Indicador de video — centro (evita chocar con precio/categoría) */}
        {isVideo && imageUrl ? (
          <View style={styles.playBadge}>
            <Play size={12} color={brand.white} fill={brand.white} />
          </View>
        ) : null}

        {/* Precio — abajo izquierda */}
        {post.priceXaf !== undefined ? (
          <View style={[styles.chip, styles.pricePill]}>
            <Precio valor={post.priceXaf} tamano="sm" color={brand.white} />
          </View>
        ) : null}

        {/* Contador 1/N — abajo derecha */}
        {photoCount > 1 ? (
          <View style={[styles.chip, styles.countChip]}>
            <Text style={styles.chipText}>1/{photoCount}</Text>
          </View>
        ) : null}

        {/* Botón más — arriba derecha */}
        {onMore ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMore(post); }}
            hitSlop={10}
            style={styles.moreBtn}
            accessibilityLabel="Más opciones"
          >
            <MoreHorizontal size={16} color={brand.white} />
          </Pressable>
        ) : null}
      </View>
      </GestureDetector>
      {/* ── Título ── */}
      {footerText ? (
        <Text numberOfLines={2} style={[styles.title, { color: colors.textPrimary, marginTop: espaciado.e6 }]}>
          {footerText}
        </Text>
      ) : null}

      {/* ── Ubicación / tema (contexto local) ── */}
      {post.locationLabel || post.topicLabel ? (
        <Text numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>
          {[post.locationLabel, post.topicLabel ? `#${post.topicLabel}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      {/* ── Autor + social ── */}
      <View style={styles.footer}>
        <View style={styles.authorRow}>
          {post.author?.avatarUrl ? (
            <Image
              source={post.author.avatarUrl}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={`av-${post.author?.id ?? post.author?.name ?? 'x'}`}
              transition={0}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: alpha(colors.primary, 0.15) }]}>
              <Text style={{ fontSize: tipografia.rotulo, fontWeight: peso.maximo, color: colors.text.primary }}>
                {(post.author?.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio, flex: 1 }}>
            {post.author?.name ?? 'Usuario'}
          </Text>
        </View>

        {/* Solo me gusta: se toca aquí mismo para dar/quitar me gusta.
            (Comentario y guardar viven dentro de la publicación.) */}
        <Pressable
          onPress={(e) => { e.stopPropagation(); toggleLike(); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Me gusta${likes ? `, ${likes}` : ''}`}
          accessibilityState={{ selected: liked }}
          style={styles.socialBtn}
        >
          <Heart size={15} color={liked ? brand.like : colors.textSecondary} fill={liked ? brand.like : 'none'} />
          <Text style={[styles.socialN, { color: colors.textSecondary }, liked ? { color: brand.like } : null]}>{formatCount(likes)}</Text>
        </Pressable>
      </View>

      {/* Corazón grande del doble toque (como Instagram/Xiaohongshu) */}
      {heartPop ? (
        <View pointerEvents="none" style={styles.heartPop}>
          <Heart size={76} color={brand.like} fill={brand.like} />
        </View>
      ) : null}
    </Pressable>
    </>
  );
});

function formatCount(n: number): string {
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  card: { borderRadius: radios.chip, overflow: 'hidden', paddingBottom: espaciado.e8 },
  noMedia: { borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e10 },
  noMediaText: { fontSize: tipografia.caption, fontWeight: peso.fuerte, lineHeight: 17, textAlign: 'center' },
  title: { fontSize: tipografia.body, fontWeight: peso.medio, lineHeight: 18, paddingHorizontal: espaciado.e6 },
  meta: { fontSize: tipografia.micro, fontWeight: peso.medio, paddingHorizontal: espaciado.e6, marginTop: espaciado.e2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e6, marginTop: espaciado.e6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, flex: 1, marginRight: espaciado.e6 },
  avatar: { width: 18, height: 18, borderRadius: radios.full },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  socialRow: { flexDirection: 'row', alignItems: 'center' },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, paddingHorizontal: espaciado.e4, paddingVertical: espaciado.e2 },
  heartPop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  socialN: {  fontSize: tipografia.micro, fontWeight: peso.medio, marginLeft: espaciado.e3 },
  chip: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radios.full, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e2 },
  chipText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.maximo },
  chipTL: { top: 6, left: 6 },
  pricePill: { bottom: 8, left: 8 },
  countChip: { bottom: 8, right: 8 },
  playBadge: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -14, marginLeft: -14,
    width: 28, height: 28, borderRadius: radios.full, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: {
    position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radios.md, width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
});
