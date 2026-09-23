/**
 * CommentsSheet — hoja inferior de comentarios del detalle (03 + Parte 23).
 *
 * Diseño del dueño (`CommentRow` + hoja con asa, título, lista y caja de texto)
 * conectado a los datos REALES del servidor:
 *   · `GET  /posts/:id/comments?limit=&cursor=` → `{ comments, nextCursor, total }`
 *     (paginado; cada comentario dice `repliesCount`)
 *   · `POST /posts/:id/comments { text, parentId }` → comentario creado
 *   · `GET  /comments/:id/replies` → respuestas, cada una con `replyToName`
 *   · `PATCH/DELETE /comments/:id` → editar y borrar (solo el autor)
 *   · `POST/DELETE /comments/:id/like` → me gusta del comentario (optimista)
 *
 * Qué se arregló respecto a la primera versión (avisos del dueño):
 *   · «Responder» ahora **se sabe a qué comentario responde**: se envía
 *     `parentId`, la respuesta se pinta indentada y con «→ @Nombre», y el
 *     comentario padre enseña «Ver N respuestas».
 *   · Se puede **editar** y **eliminar** el propio comentario.
 *   · Tocar el **avatar o el nombre** abre el perfil de esa persona.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, useTheme, tipografia, radios } from '@egrouteplan/ui-kit';
import { Heart, MessageCircle, Pencil, Plus, Send, Trash2, X } from 'lucide-react-native';
import { absUrl } from '../../api/config';
import { lifebookApi, lifebookActionsApi, type LbCommentItem, type LbPostBase } from '../../api/lifebook';
import {
  comentariosConAdjuntoApi, type LbComentarioConAdjunto,
} from '../../api/lifebookComentarios';
import type { HomeAd } from '../../api/ads';
import { ETIQUETA_PUBLICACION, PublicacionTarjeta } from './PublicacionTarjeta';
import { TarjetaAnuncio } from './TarjetaAnuncio';
import { brand } from '@egrouteplan/ui-kit';

const PAGE = 30;

export interface CommentsSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  /** Color del tipo de publicación (avatares sin foto). */
  tint: string;
  allowComments: boolean;
  meId?: string | null;
  title?: string;
  placeholder: string;
  onCountChange?: (total: number) => void;
  onSent?: () => void;
  /**
   * Opacidad del velo que tapa el fondo. Por defecto 0.45, que es lo correcto cuando
   * debajo hay una pantalla normal (el detalle de la publicación): oscurece para que la
   * hoja se lea y para que se note que hay algo detrás.
   *
   * El feed inmersivo pasa **0**: ahí debajo hay un VÍDEO REPRODUCIÉNDOSE, y taparlo con
   * un velo es justo lo contrario de lo que se quiere. En 小红书/TikTok el vídeo se queda
   * a plena luz mientras se leen los comentarios.
   */
  dimBackdrop?: number;
  /**
   * Altura máxima de la hoja (porcentaje de la pantalla). Por defecto 80, que en el
   * detalle está bien porque no hay nada que preservar debajo.
   *
   * El feed inmersivo pasa un valor menor para DEJAR SITIO AL VÍDEO: si la hoja puede
   * crecer hasta el 80 %, con muchos comentarios tapa el vídeo entero y el usuario deja de
   * estar viendo un vídeo para estar viendo una lista. Es lo que se corrigió.
   */
  maxHeightPct?: number;
}

function commentTimeAgo(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Fila de comentario o respuesta (con cita del padre y acciones del autor). */
export function CommentRow({ c, tint, colors, meId, onLike, onReply, onEdit, onDelete, isReply }: {
  c: LbCommentItem;
  tint: string;
  colors: any;
  meId?: string | null;
  onLike: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Las respuestas van indentadas y algo más pequeñas. */
  isReply?: boolean;
}) {
  const router = useRouter();
  const name = c.author?.fullName?.trim() || 'Usuario';
  const avatar = c.author?.avatarUrl ? absUrl(c.author.avatarUrl) : '';
  const initial = name.slice(0, 1).toUpperCase() || 'U';
  const likes = c.likes ?? 0;
  const mine = !!meId && c.author?.id === meId;
  const size = isReply ? 28 : 34;

  const openProfile = () => {
    if (c.author?.id) router.push({ pathname: '/lifebook-user', params: { id: c.author.id } } as never);
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: isReply ? 7 : 10, paddingLeft: isReply ? 26 : 0 }}>
      <Pressable onPress={openProfile} accessibilityLabel={`Perfil de ${name}`} hitSlop={6}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: alpha(colors.textPrimary, 0.08) }} />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: alpha(tint, 0.16), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: tint, fontWeight: '900', fontSize: isReply ? 12 : 13 }}>{initial}</Text>
          </View>
        )}
      </Pressable>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
            <Pressable onPress={openProfile} hitSlop={6}>
              <Text numberOfLines={1} style={{ fontSize: isReply ? 12 : 12.5, fontWeight: '800', color: colors.textSecondary }}>{name}</Text>
            </Pressable>
            {mine ? (
              <View style={{ backgroundColor: alpha(colors.primary, 0.12), borderRadius: radios.full, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ color: colors.primary, fontSize: 9.5, fontWeight: '900' }}>TÚ</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>
            {commentTimeAgo(c.createdAt)}{c.editedAt ? ' · editado' : ''}
          </Text>
        </View>

        {/* A quién responde: sin esto no se sabía de qué comentario era la respuesta */}
        {isReply && c.replyToName ? (
          <Text style={{ fontSize: tipografia.caption, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
            → {c.replyToName}
          </Text>
        ) : null}

        <Text style={{ fontSize: isReply ? 13.5 : 14, lineHeight: isReply ? 19 : 20, color: colors.textPrimary, marginTop: 3 }}>
          {c.body}
        </Text>

        {/*
          Publicación que el comentario lleva DENTRO (una nota, un vídeo, una venta…).
          Solo se pinta si el servidor la mandó: cuando quien mira no puede ver la
          publicación adjunta, `ref` llega `null` a propósito (no se filtra ni el título),
          y cuando el original se borra, `ref` también vuelve a `null` — así nunca queda
          un enlace roto ni una tarjeta que lleva a ningún sitio.
        */}
        {(c as LbComentarioConAdjunto).ref ? (
          <PublicacionTarjeta data={(c as LbComentarioConAdjunto).ref!} tint={tint} colors={colors} compacta={isReply} />
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
          <Pressable onPress={onReply} hitSlop={8} accessibilityLabel={`Responder a ${name}`}>
            <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: colors.textSecondary }}>Responder</Text>
          </Pressable>
          {mine && onEdit ? (
            <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel="Editar mi comentario" style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Pencil size={11} color={colors.textSecondary} />
              <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: colors.textSecondary }}>Editar</Text>
            </Pressable>
          ) : null}
          {mine && onDelete ? (
            <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Eliminar mi comentario" style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Trash2 size={11} color={colors.danger} />
              <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: colors.danger }}>Eliminar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={onLike}
        hitSlop={8}
        accessibilityLabel={`Me gusta del comentario${likes ? `, ${likes}` : ''}`}
        style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4, minWidth: 28 }}
      >
        <Heart size={16} color={c.likedByMe ? brand.like : colors.textSecondary} fill={c.likedByMe ? brand.like : 'transparent'} />
        {likes > 0 ? (
          <Text style={{ marginTop: 3, fontSize: 10.5, fontWeight: '800', color: colors.textSecondary }}>{likes}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export function CommentsSheet({
  visible, onClose, postId, tint, allowComments, meId, title = 'Comentarios',
  placeholder, onCountChange, onSent,
  // Valores por defecto = el comportamiento de siempre (el detalle no cambia nada).
  dimBackdrop = 0.45, maxHeightPct = 80,
}: CommentsSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [comments, setComments] = useState<LbCommentItem[]>([]);
  const [replies, setReplies] = useState<Record<string, LbCommentItem[]>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  /**
   * Comentario al que estoy respondiendo. Como en YouTube, la caja de respuesta
   * aparece **debajo de ese comentario** (no al final) y la respuesta se envía
   * con `parentId`, así que queda colgando del comentario correcto.
   */
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  /** Comentario que estoy editando. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const listRef = useRef<FlatList<LbCommentItem>>(null);

  /**
   * Publicación que se va a adjuntar al comentario que se está escribiendo.
   *
   * Guarda solo `id` y `title`: la tarjeta de verdad la devuelve el servidor al crear el
   * comentario (con su tipo, su miniatura y **su autor**). Así no hay dos formas de armar
   * una tarjeta ni se inventa nada en el cliente.
   */
  const [adjunto, setAdjunto] = useState<{ id: string; title: string | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [misPosts, setMisPosts] = useState<LbPostBase[] | null>(null);

  /**
   * Publicidad dentro de los comentarios (lo de WeChat). La manda el servidor en la
   * primera página y `null` cuando no toca (autor de la publicación, comentarios
   * cerrados, hilo de menos de 3 comentarios, o sin anuncio para su ciudad). No es un
   * comentario: no cuenta en el total ni se mezcla con la lista.
   */
  const [ad, setAd] = useState<HomeAd | null>(null);

  /** Abre el selector de MIS publicaciones (se cargan una vez y se recuerdan). */
  const abrirSelector = useCallback(async () => {
    if (!meId) return;
    setPickerOpen(true);
    if (misPosts) return;
    try {
      const page = await lifebookApi.userPosts(meId, { limit: 20 });
      setMisPosts(page.posts ?? []);
    } catch {
      setMisPosts([]);
    }
  }, [meId, misPosts]);

  /** Chip «Adjuntando: …» con su aspa. Lo usan las DOS cajas (comentario y respuesta). */
  const chipAdjunto = () => (adjunto ? (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7,
      backgroundColor: alpha(colors.primary, 0.10), borderRadius: radios.md, paddingHorizontal: 10, paddingVertical: 6,
    }}>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: tipografia.caption, fontWeight: '800', color: colors.primary }}>
        Adjuntando: {adjunto.title?.trim() || 'publicación'}
      </Text>
      <Pressable onPress={() => setAdjunto(null)} hitSlop={8} accessibilityLabel="Quitar la publicación adjunta">
        <X size={13} color={colors.primary} />
      </Pressable>
    </View>
  ) : null);

  const cb = useRef({ onCountChange, onSent });
  cb.current = { onCountChange, onSent };

  const alertText = (t: string) => { setNotice(t); setTimeout(() => setNotice(''), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Se pide con el envoltorio propio (no con `lifebookApi.postComments`) porque la
      // respuesta trae además `ad`: la publicidad dentro de los comentarios, que el
      // servidor decide (nunca en la primera visita del autor, nunca con los
      // comentarios cerrados, nunca en hilos cortos) y que llega solo en la 1ª página.
      const page = await comentariosConAdjuntoApi.pagina(postId, { limit: PAGE });
      setComments([...(page.comments ?? [])].reverse());   // más nuevos arriba
      setCursor(page.nextCursor ?? null);
      setAd(page.ad ?? null);
      const n = Number(page.total ?? (page.comments ?? []).length);
      setTotal(n);
      cb.current.onCountChange?.(n);
    } catch {
      setComments([]);
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => {
    if (visible) {
      setDraft(''); setReplyTo(null); setEditing(null); setReplies({}); setOpenReplies({});
      setAd(null);
      load();
    }
  }, [visible, load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await comentariosConAdjuntoApi.pagina(postId, { limit: PAGE, cursor });
      setComments((prev) => [...prev, ...[...(page.comments ?? [])].reverse()]);
      setCursor(page.nextCursor ?? null);
    } catch { /* se reintenta al volver a bajar */ }
    finally { setLoadingMore(false); }
  };

  const toggleReplies = async (id: string) => {
    const isOpen = !!openReplies[id];
    setOpenReplies((prev) => ({ ...prev, [id]: !isOpen }));
    if (isOpen || replies[id]) return;
    try {
      const res = await lifebookApi.commentReplies(id);
      setReplies((prev) => ({ ...prev, [id]: res.replies ?? [] }));
    } catch { /* silencioso */ }
  };

  const toggleCommentLike = async (id: string, list: 'root' | 'reply', parentId?: string) => {
    const source = list === 'root' ? comments : (replies[parentId ?? ''] ?? []);
    const target = source.find((c) => c.id === id);
    const was = !!target?.likedByMe;
    const patch = (arr: LbCommentItem[]) => arr.map((c) => (c.id === id
      ? { ...c, likedByMe: !was, likes: Math.max(0, (c.likes ?? 0) + (was ? -1 : 1)) }
      : c));
    if (list === 'root') setComments(patch);
    else setReplies((prev) => ({ ...prev, [parentId ?? '']: patch(prev[parentId ?? ''] ?? []) }));
    try { await lifebookApi.toggleCommentLike(id, !was); }
    catch {
      const undo = (arr: LbCommentItem[]) => arr.map((c) => (c.id === id
        ? { ...c, likedByMe: was, likes: Math.max(0, (c.likes ?? 0) + (was ? 1 : -1)) }
        : c));
      if (list === 'root') setComments(undo);
      else setReplies((prev) => ({ ...prev, [parentId ?? '']: undo(prev[parentId ?? ''] ?? []) }));
    }
  };

  const submit = async () => {
    const text = editing ? editing.text.trim() : draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (editing) {
        const res = await lifebookApi.editComment(editing.id, text);
        setComments((prev) => prev.map((c) => (c.id === editing.id ? { ...c, body: text, editedAt: res.editedAt } : c)));
        setReplies((prev) => Object.fromEntries(Object.entries(prev).map(([k, arr]) => [
          k, arr.map((c) => (c.id === editing.id ? { ...c, body: text, editedAt: res.editedAt } : c)),
        ])) as Record<string, LbCommentItem[]>);
        setEditing(null);
      } else {
        // El mismo endpoint con o sin adjunto: con adjunto se manda `attachPostId`.
        // El texto sigue siendo obligatorio aunque se adjunte (si el original se borra,
        // el comentario se sigue leyendo entero).
        const nuevo = adjunto
          ? await comentariosConAdjuntoApi.addComment(postId, text, undefined, adjunto.id)
          : await lifebookActionsApi.addComment(postId, text);
        setComments((prev) => [nuevo, ...prev]);
        setTotal((n) => {
          cb.current.onCountChange?.(n + 1);
          return n + 1;
        });
        setDraft('');
        setAdjunto(null);
        cb.current.onSent?.();
      }
    } catch (e) {
      alertText(e instanceof Error ? e.message : 'No se pudo guardar el comentario.');
    } finally { setSending(false); }
  };

  /**
   * Envía una RESPUESTA al comentario que se está respondiendo. El texto va con
   * el prefijo `@nombre` (como YouTube), que es lo que el servidor guarda como
   * mención; y con `parentId` queda colgando de ese comentario.
   */
  const submitReply = async () => {
    const target = replyTo;
    const text = replyDraft.trim();
    if (!target || !text || sending) return;
    setSending(true);
    try {
      const cuerpo = `@${target.name} ${text}`;
      const nuevo = adjunto
        ? await comentariosConAdjuntoApi.addComment(postId, cuerpo, target.id, adjunto.id)
        : await lifebookActionsApi.addComment(postId, cuerpo, target.id);
      setReplies((prev) => ({ ...prev, [target.id]: [...(prev[target.id] ?? []), { ...nuevo, replyToName: target.name }] }));
      setOpenReplies((prev) => ({ ...prev, [target.id]: true }));
      setComments((prev) => prev.map((c) => (c.id === target.id ? { ...c, repliesCount: (c.repliesCount ?? 0) + 1 } : c)));
      setTotal((n) => {
        cb.current.onCountChange?.(n + 1);
        return n + 1;
      });
      setReplyDraft('');
      setReplyTo(null);
      setAdjunto(null);
      cb.current.onSent?.();
    } catch (e) {
      alertText(e instanceof Error ? e.message : 'No se pudo enviar la respuesta.');
    } finally { setSending(false); }
  };

  const confirmDelete = (c: LbCommentItem) => {
    Alert.alert('Eliminar comentario', 'Se borrará tu comentario y sus respuestas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            const res = await lifebookApi.deleteComment(c.id);
            setComments((prev) => prev.filter((x) => x.id !== c.id));
            setTotal((n) => {
              const next = Math.max(0, res.commentsLeft ?? n - 1);
              cb.current.onCountChange?.(next);
              return next;
            });
            setReplies((prev) => {
              const copy = { ...prev };
              delete copy[c.id];
              return copy;
            });
            cb.current.onSent?.();
          } catch (e) {
            alertText(e instanceof Error ? e.message : 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  const renderComment = (item: LbCommentItem) => {
    const isEditing = editing?.id === item.id;
    return (
      <View>
        {isEditing ? (
          <View style={{ paddingVertical: 10 }}>
            <TextInput
              value={editing.text}
              onChangeText={(t) => setEditing({ id: item.id, text: t })}
              multiline
              maxLength={1000}
              autoFocus
              style={{
                color: colors.textPrimary, fontSize: tipografia.body, minHeight: 40,
                backgroundColor: alpha(colors.textPrimary, 0.06), borderRadius: radios.md, padding: 10,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable onPress={() => setEditing(null)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: tipografia.body }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                accessibilityLabel="Guardar cambios del comentario"
                style={{ flex: 1.4, alignItems: 'center', paddingVertical: 8, backgroundColor: colors.primary, borderRadius: radios.full }}
              >
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: tipografia.body }}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <CommentRow
            c={item}
            tint={tint}
            colors={colors}
            meId={meId}
            onLike={() => toggleCommentLike(item.id, 'root')}
            onReply={() => { setReplyTo({ id: item.id, name: item.author?.fullName ?? 'Usuario' }); setReplyDraft(''); }}
            onEdit={() => setEditing({ id: item.id, text: item.body })}
            onDelete={() => confirmDelete(item)}
          />
        )}

        {/* Caja de respuesta EN LÍNEA, justo debajo del comentario (como YouTube) */}
        {replyTo?.id === item.id ? (
          <View style={{
            marginLeft: 44, marginBottom: 10, paddingLeft: 10,
            borderLeftWidth: 2, borderLeftColor: alpha(colors.primary, 0.35),
          }}>
            {/* A quién se responde: AQUÍ, en su propia línea.
                Antes el `@nombre` iba DENTRO de la fila del campo, y con un nombre largo
                («Administrador EG Route Plan», 28 caracteres) se comía el ancho: al campo
                le quedaban ~50 dp, así que **lo que se escribía no se veía** y el botón de
                enviar quedaba apretujado contra el borde. El dueño lo describió tal cual.
                `numberOfLines={1}` para que un nombre larguísimo recorte en vez de empujar
                el campo fuera de la pantalla. */}
            <Text numberOfLines={1} style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '800', marginBottom: 6 }}>
              Respondiendo a @{replyTo.name}
            </Text>
            {chipAdjunto()}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end', gap: 8,
              backgroundColor: alpha(colors.textPrimary, 0.06), borderRadius: 20,
              paddingLeft: 6, paddingRight: 6, paddingVertical: 5,
            }}>
              {meId ? (
                <Pressable
                  onPress={abrirSelector}
                  disabled={sending}
                  hitSlop={6}
                  accessibilityLabel="Adjuntar una publicación a mi respuesta"
                  style={{
                    width: 32, height: 32, borderRadius: radios.lg,
                    backgroundColor: adjunto ? alpha(colors.primary, 0.18) : alpha(colors.textPrimary, 0.08),
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Plus size={16} color={adjunto ? colors.primary : colors.textSecondary} />
                </Pressable>
              ) : null}
              <TextInput
                value={replyDraft}
                onChangeText={setReplyDraft}
                placeholder="Añade una respuesta…"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={1000}
                autoFocus
                style={{ flex: 1, maxHeight: 90, minHeight: 34, color: colors.textPrimary, fontSize: tipografia.body, paddingVertical: 6 }}
              />
              {/* 36 en vez de 32: el botón de enviar es la acción de esta caja y estaba
                  escondido. Es lo único que empuja la fila, y el campo se queda con todo
                  el resto del ancho. */}
              <Pressable
                onPress={submitReply}
                disabled={!replyDraft.trim() || sending}
                accessibilityLabel="Enviar respuesta"
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: replyDraft.trim() ? colors.primary : alpha(colors.textPrimary, 0.12),
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {sending ? <ActivityIndicator size="small" color={brand.white} /> : <Send size={16} color={replyDraft.trim() ? brand.white : colors.textSecondary} />}
              </Pressable>
            </View>
            <Pressable onPress={() => { setReplyTo(null); setReplyDraft(''); }} style={{ paddingVertical: 6 }} accessibilityLabel="Cancelar respuesta">
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '800' }}>Cancelar</Text>
            </Pressable>
          </View>
        ) : null}

        {(item.repliesCount ?? 0) > 0 ? (
          <Pressable onPress={() => toggleReplies(item.id)} style={{ paddingLeft: 44, paddingBottom: 8 }} accessibilityLabel="Ver respuestas">
            <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '800' }}>
              {openReplies[item.id] ? 'Ocultar respuestas' : `Ver ${item.repliesCount} respuesta${item.repliesCount === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
        ) : null}

        {openReplies[item.id] ? (
          <View style={{
            marginLeft: 17, paddingLeft: 14,
            borderLeftWidth: 2, borderLeftColor: alpha(colors.textPrimary, 0.10),
          }}>
            {(replies[item.id] ?? []).length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
            ) : (
              (replies[item.id] ?? []).map((r) => (
                <View key={r.id}>
                  <CommentRow
                    c={r}
                    tint={tint}
                    colors={colors}
                    meId={meId}
                    isReply
                    onLike={() => toggleCommentLike(r.id, 'reply', item.id)}
                    onReply={() => { setReplyTo({ id: item.id, name: r.author?.fullName ?? 'Usuario' }); setReplyDraft(''); }}
                    onEdit={() => setEditing({ id: r.id, text: r.body })}
                    onDelete={() => confirmDelete(r)}
                  />
                  {replyTo?.id === item.id && replyTo.name === (r.author?.fullName ?? 'Usuario') ? (
                    <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '800', paddingLeft: 38, paddingBottom: 6 }}>
                      Escribiendo la respuesta arriba ↑
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* El velo sigue ocupando toda la pantalla para poder cerrar tocando fuera, pero
            su OPACIDAD es configurable: en 0 es invisible y no tapa el vídeo de debajo. */}
        <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: `rgba(0,0,0,${dimBackdrop})` }} onPress={onClose} />

        <View style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          maxHeight: `${maxHeightPct}%`,
          paddingBottom: insets.bottom + 8,
        }}>
          <View style={{ height: 4, width: 44, borderRadius: radios.full, backgroundColor: alpha(colors.textPrimary, 0.14), alignSelf: 'center', marginTop: 10 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>{title} · {total}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Cerrar comentarios"
              style={{ width: 32, height: 32, borderRadius: radios.lg, backgroundColor: alpha(colors.textPrimary, 0.07), alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 34 }} />
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              ListEmptyComponent={
                <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                  <MessageCircle size={28} color={colors.textSecondary} />
                  <Text style={{ marginTop: 10, color: colors.textSecondary, fontWeight: '800' }}>
                    {allowComments ? 'Todavía no hay comentarios' : 'Los comentarios están desactivados'}
                  </Text>
                  <Text style={{ marginTop: 4, color: alpha(colors.textSecondary, 0.8), fontSize: tipografia.caption, textAlign: 'center' }}>
                    {allowComments
                      ? 'Escribe el primero para abrir la conversación.'
                      : 'El autor desactivó los comentarios de esta publicación.'}
                  </Text>
                </View>
              }
              ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}
              renderItem={({ item, index }) => (
                <>
                  {renderComment(item)}
                  {/*
                    Publicidad DENTRO de los comentarios (lo de WeChat): después del
                    TERCER comentario, nunca antes — primero se lee la conversación — y
                    solo si el servidor la mandó. Se pinta con su etiqueta «PUBLICIDAD»,
                    que no es opcional: sin ella el anuncio se lee como el comentario de
                    alguien.
                  */}
                  {ad && index === 2 ? <TarjetaAnuncio ad={ad} tint={tint} colors={colors} /> : null}
                </>
              )}
            />
          )}

          {notice ? (
            <Text style={{ color: colors.danger, fontSize: tipografia.caption, paddingHorizontal: 16, paddingBottom: 6 }}>{notice}</Text>
          ) : null}

          {/*
            El compositor de comentario NUEVO se oculta mientras se está RESPONDIENDO.

            ANTES NO SE OCULTABA, y además decía «Responde a {name} en su comentario ↑»
            mientras su botón de enviar llama SIEMPRE a `submit`, que crea un comentario de
            PRIMER NIVEL (sin `parentId`). O sea que la caja avisaba de una cosa y hacía
            otra: quien escribía ahí creyendo que respondía publicaba un comentario suelto,
            que es exactamente el fallo que reportó el dueño.

            El sitio para responder es la caja EN LÍNEA del comentario (más abajo en
            `renderComment`), que sí manda `parentId` y sale con el foco puesto al pulsar
            «Responder». Es el mismo criterio que ya se usaba al EDITAR, que también oculta
            este compositor: **un solo sitio donde escribir a la vez**.
          */}
          {allowComments && !editing && !replyTo ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
              {chipAdjunto()}
              <View style={{
                flexDirection: 'row', alignItems: 'flex-end', gap: 8,
                backgroundColor: alpha(colors.textPrimary, 0.07), borderRadius: 24,
                paddingLeft: 6, paddingRight: 6, paddingVertical: 6,
              }}>
                {/* Adjuntar una publicación: el «+» va a la izquierda del campo, como el
                    botón de adjuntar de un chat. Solo aparece si sabemos quién eres
                    (sin `meId` no hay «mis publicaciones» que ofrecer). */}
                {meId ? (
                  <Pressable
                    onPress={abrirSelector}
                    disabled={sending}
                    hitSlop={6}
                    accessibilityLabel="Adjuntar una publicación a mi comentario"
                    style={{
                      width: 34, height: 34, borderRadius: 17,
                      backgroundColor: adjunto ? alpha(colors.primary, 0.18) : alpha(colors.textPrimary, 0.08),
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Plus size={17} color={adjunto ? colors.primary : colors.textSecondary} />
                  </Pressable>
                ) : null}
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  maxLength={1000}
                  style={{ flex: 1, maxHeight: 100, minHeight: 34, color: colors.textPrimary, fontSize: tipografia.body, paddingVertical: 6 }}
                />
                <Pressable
                  onPress={submit}
                  disabled={!draft.trim() || sending}
                  accessibilityLabel="Enviar comentario"
                  style={{
                    width: 34, height: 34, borderRadius: 17,
                    backgroundColor: draft.trim() ? colors.primary : alpha(colors.textPrimary, 0.12),
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {sending
                    ? <ActivityIndicator size="small" color={brand.white} />
                    : <Send size={16} color={draft.trim() ? brand.white : colors.textSecondary} />}
                </Pressable>
              </View>
            </View>
          ) : !allowComments ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Los comentarios están desactivados</Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {/*
        Selector de MIS publicaciones para adjuntar. Va DENTRO de este mismo modal (una
        capa absoluta, no otro modal anidado): en Android los modales anidados se pelean
        por el foco del teclado, y aquí ya hay un teclado abierto detrás.
        Se listan solo mis publicaciones, por la misma ruta que usa el chat para compartir
        una nota (`/lifebook/users/:id/posts`), así no hay dos maneras de listar lo mío.
      */}
      {pickerOpen ? (
        /*
          `zIndex` + `elevation` NO son decorativos: sin ellos, en Android el compositor
          de la hoja (que va después en el árbol y con elevación) se pintaba POR ENCIMA de
          la parte baja de este selector, y las últimas filas de la lista no se podían
          tocar — se comía el toque. Se comprobó midiendo: pulsar la última fila no
          seleccionaba nada y pulsar una del medio sí.
        */
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 20, elevation: 20 }]}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setPickerOpen(false)} />
          <View style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            maxHeight: '62%', paddingBottom: insets.bottom + 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.textPrimary }}>Adjuntar una publicación</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10} accessibilityLabel="Cerrar el selector">
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, paddingHorizontal: 16, paddingBottom: 8 }}>
              Se adjunta como referencia: si la borras, tu comentario se queda tal cual.
            </Text>

            {misPosts === null ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 26 }} />
            ) : misPosts.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, paddingHorizontal: 16, paddingBottom: 22 }}>
                Todavía no has publicado nada.
              </Text>
            ) : (
              <ScrollView style={{ paddingHorizontal: 12 }}>
                {misPosts.map((p) => {
                  const elegida = adjunto?.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setAdjunto({ id: p.id, title: p.title ?? null });
                        setPickerOpen(false);
                      }}
                      accessibilityLabel={`Adjuntar ${p.title ?? 'publicación'}`}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 11, paddingHorizontal: 10, borderRadius: radios.md,
                        backgroundColor: elegida ? alpha(colors.primary, 0.12) : 'transparent',
                      }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: alpha(tint, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 15 }}>
                          {p.type === 'video' ? '🎬' : p.type === 'sale' ? '🏷️' : p.type === 'podcast' ? '🎙️' : p.type === 'serie' ? '📺' : '📝'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>
                          {p.title?.trim() || '(sin título)'}
                        </Text>
                        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 1 }}>
                          {ETIQUETA_PUBLICACION[p.type] ?? 'Publicación'}{elegida ? ' · adjunta' : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
