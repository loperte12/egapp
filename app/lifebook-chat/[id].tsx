/**
 * Life Book — HILO de chat (ruta dinámica `/lifebook-chat/:id`)
 * Pantalla: ChatThreadScreen (estilo Xiaohongshu + datos reales)
 *
 *  · Cabecera: volver · nombre + "En EG Route Plan" · ⋯ (bloquear).
 *  · Lista INVERTIDA con burbujas por tipo: texto, imagen, archivo, nota/venta
 *    compartida (tarjeta), votación, cadena, ubicación, aviso de sistema.
 *  · Botón "+" → ChatPlusPanel con las acciones REALES conectadas (Parte 15):
 *    compartir nota/venta, foto, cámara, archivo y —desde la Parte 24 (G2)—
 *    **ubicación** (mapa con el pin) y **votación** (con recuentos reales).
 *    El resto (tema, check-in, cadena, anuncios, retos) van marcadas «pronto».
 *  · Polling cada 4 s solo con el chat abierto, marca leído, envío optimista con
 *    reintento y paginación "mensajes anteriores".
 *  · Params: `id`, `name?`, `peerId?`, `draft?`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, peso, Precio, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ArrowLeft, FileText, MapPin, MoreHorizontal, Plus, Radio, Send, ShoppingBag, ShoppingCart, X } from 'lucide-react-native';
import { productosEnNotaApi } from '../../api/lifebookProductos';
import { ProductoEnChatSheet } from '../../components/lifebook/ProductoEnChatSheet';
import { OrderCardEnChat } from '../../components/lifebook/OrderCardEnChat';
import type { LbProductCard } from '../../api/commerce';
import * as ImagePicker from 'expo-image-picker';
// Parte 32: expo-image (caché memoria+disco) — las fotos del chat no destellan.
import { Image as ExpoImage } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { AuthGate } from '../../core/AuthGate';
import { absUrl } from '../../api/config';
import { authApi } from '../../api/auth';
import { messagesApi, type LbChatAction, type LbConversation, type LbMessage } from '../../api/messages';
import { lifebookApi, lifebookMediaApi, lifebookLiveApi, lifebookActionsApi, type LbPostBase, type LbLiveSharer } from '../../api/lifebook';
// B8 (2026-09-13): el contador de no leídos del dock es compartido
// (`hooks/useUnreadChat`). Aquí solo se usa su `forzar()` para refrescarlo al
// leer: sin esto, el badge del dock podía seguir mostrando mensajes que ya se
// habían leído hasta 15 s después (el sondeo del hook). Suscribir esta pantalla
// no añade un segundo temporizador — el hook mantiene UNO solo por módulo.
import { useUnreadChat } from '../../hooks/useUnreadChat';
import * as Location from 'expo-location';
import { lbXaf } from '../../constants/lifebook';
import { chatBackgroundOf } from '../../constants/lifebook-chat';
import { ChatPlusPanel } from '../../components/lifebook/ChatPlusPanel';
import { ZoomableImage, type ZoomableImageHandle } from '../../components/lifebook/ZoomableImage';
import { ViewerZoomControls } from '../../components/lifebook/ViewerControls';
import { ChatOptionsSheet } from '../../components/lifebook/ChatOptionsSheet';
import { GroupManageSheet } from '../../components/lifebook/GroupManageSheet';
import { LocationPickerSheet, type LbPickedLocation } from '../../components/lifebook/LocationPickerSheet';
import { VoteSheet } from '../../components/lifebook/VoteSheet';
import { ChainSheet } from '../../components/lifebook/ChainSheet';
import { CheckinSheet, type LbCheckinDraft } from '../../components/lifebook/CheckinSheet';
import { AdSheet, type LbAdDraft } from '../../components/lifebook/AdSheet';
import { ChallengePlazaSheet } from '../../components/lifebook/ChallengePlazaSheet';
import { formaHoja } from '../../components/lifebook/ui/Sheet';
import MapBackground from '../../components/MapBackground';
import { ir as irSeguro } from '../../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

const POLL_MS = 4000;

export default function ChatThreadScreen() {
  return (
    <AuthGate>
      <ChatThreadContent />
    </AuthGate>
  );
}

function ChatThreadContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{ id?: string; name?: string; peerId?: string; draft?: string; isGroup?: string; members?: string }>();
  const convId = String(p.id ?? '');
  const peerName = p.name ? decodeURIComponent(String(p.name)) : 'Chat';
  const peerId = p.peerId ? String(p.peerId) : null;
  /** `isGroup=1`: quien navega (p. ej. al crear el grupo) ya sabe que es grupo. */
  const isGroupHint = String(p.isGroup ?? '') === '1';
  /** `members=1`: abre directamente la hoja de miembros (invitar a más). */
  const openMembersOnMount = String(p.members ?? '') === '1';

  const [messages, setMessages] = useState<LbMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState(p.draft ? decodeURIComponent(String(p.draft)) : '');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [peer, setPeer] = useState<{ name: string; avatarUrl: string | null; kind: 'direct' | 'group'; members?: number } | null>(
    // Con `isGroup=1` la cabecera ya se pinta como grupo sin esperar a la lista.
    isGroupHint ? { name: peerName, avatarUrl: null, kind: 'group' } : null,
  );
  /** Ajustes por usuario: no molestar, fijado y fondo (Partes 17–18). */
  const [prefs, setPrefs] = useState<{ muted: boolean; pinned: boolean; background: string | null }>({ muted: false, pinned: false, background: null });
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member' | undefined>(undefined);
  const [membersOpen, setMembersOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<'members' | 'edit'>('members');
  /** Ajustes del grupo que afectan al chat: anuncio y «solo admins hablan». */
  const [groupInfo, setGroupInfo] = useState<{ announcement: string | null; membersCanSpeak: boolean; topic: string | null }>(
    { announcement: null, membersCanSpeak: true, topic: null },
  );
  const [announcementOpen, setAnnouncementOpen] = useState(true);
  /** Mensaje con el menú de acciones abierto (copiar/reenviar/borrar). */
  const [actionMsg, setActionMsg] = useState<LbMessage | null>(null);
  /** Mensaje que se está reenviando + lista de mis chats. */
  const [forwardMsg, setForwardMsg] = useState<LbMessage | null>(null);
  const [convs, setConvs] = useState<LbConversation[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  /** Foto abierta a pantalla completa. */
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  /** Parte 32: mando del visor (botones − / encajar / +). */
  const zoomRef = useRef<ZoomableImageHandle>(null);
  /**
   * Parte 32: abre la foto a pantalla completa y la deja en la caché de disco,
   * así el visor aparece al instante (sin destello blanco) y el zoom responde.
   */
  const openPhoto = useCallback((url: string) => {
    setViewerUrl(url);
    ExpoImage.prefetch(url, { cachePolicy: 'memory-disk' }).catch(() => {});
  }, []);
  const [pickerOpen, setPickerOpen] = useState<null | 'note' | 'sale'>(null);
  const [myPosts, setMyPosts] = useState<LbPostBase[] | null>(null);
  /* ── Parte 24 (G2): ubicación y votación ── */
  /** Hoja para elegir el punto que se comparte. */
  const [locOpen, setLocOpen] = useState(false);
  /** Hoja para crear la votación (pregunta + 2–6 opciones). */
  const [voteOpen, setVoteOpen] = useState(false);
  /** Mensaje de ubicación que se está viendo en el mapa. */
  const [mapMsg, setMapMsg] = useState<LbMessage | null>(null);
  /* ── Parte 25 (G2-b): cadena y quedada ── */
  const [chainOpen, setChainOpen] = useState(false);
  /** Lugar elegido para la quedada (paso 1) antes de pedir la hora (paso 2). */
  const [checkinPlace, setCheckinPlace] = useState<LbPickedLocation | null>(null);
  /** Selector de lugar de la quedada (paso 1). */
  const [checkinPickOpen, setCheckinPickOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  /** Tema del grupo (Parte 25), bajo el nombre en la cabecera. */
  const [groupId, setGroupId] = useState<string | null>(null);
  /* ── Parte 26 (G2-c): anuncio de grupo y Plaza de retos ── */
  const [adOpen, setAdOpen] = useState(false);
  const [plazaOpen, setPlazaOpen] = useState(false);
  /* ── TANDA D: tarjeta de producto (elegir cuál de los míos mando) ── */
  const [prodPickOpen, setProdPickOpen] = useState(false);
  const [misProds, setMisProds] = useState<LbProductCard[] | null>(null);
  const [enviandoProd, setEnviandoProd] = useState<string | null>(null);
  /**
   * FLUJO EMBEBIDO DEL MERCADO: producto de una tarjeta abierto en una HOJA INFERIOR, para
   * comprar sin salir de la conversación (niveles 1 y 2 de la especificación). Antes, «Comprar»
   * te sacaba a la ficha en pantalla completa: tres navegaciones y se perdía el contexto.
   */
  const [productoEnChat, setProductoEnChat] = useState<string | null>(null);
  /* ── Parte 28 (G4): ubicación en vivo ── */
  /** Quién está compartiendo su ubicación ahora mismo en este chat. */
  const [live, setLive] = useState<LbLiveSharer[]>([]);
  /** Punto que se está viendo en el mapa (una ubicación en vivo). */
  const [mapPoint, setMapPoint] = useState<{ lat: number; lng: number; label?: string } | null>(null);
  const listRef = useRef<FlatList<LbMessage>>(null);

  /* ── B8: refrescar el contador compartido de no leídos ──────────────────────
     `forzar()` re-consulta fuera de ciclo. Se llama UNA vez al marcar leído (no
     en cada tick del polling) y otra al desmontar; ver los comentarios en
     `loadLatest`. El hook mantiene un solo temporizador por módulo, así que
     llamar al hook aquí no añade sondeos paralelos. */
  const { forzar } = useUnreadChat();
  const badgeForzado = useRef(false);

  /* ── Carga (polling 4 s solo mientras el chat está abierto) ── */
  const loadLatest = useCallback(async () => {
    if (!convId) return;
    try {
      const page = await messagesApi.messages(convId, { limit: 40 });
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = page.messages.filter((m) => !seen.has(m.id));
        /**
         * MERCADO (tanda E): las TARJETAS DE PEDIDO no se quedan congeladas.
         *
         * El estado del pedido lo resuelve el servidor al LEER el mensaje, así que el mismo mensaje
         * vuelve con el estado de ahora. Pero este sondeo solo AÑADÍA lo nuevo (`!seen.has`), de modo
         * que un pedido aceptado seguía diciendo «Pedido creado» hasta cerrar y reabrir el chat:
         * medido en el teléfono, con el aviso «La tienda aceptó tu pedido» ya en pantalla.
         *
         * Se refrescan SOLO los mensajes de pedido (los únicos con datos vivos en su payload), para
         * no pisar estados locales de otros mensajes, como el voto optimista de una votación.
         */
        const vivas = page.messages.filter((m) => m.kind === 'order' && seen.has(m.id));
        let base = prev;
        if (vivas.length) {
          const porId = new Map(vivas.map((m) => [m.id, m]));
          base = prev.map((m) => porId.get(m.id) ?? m);
        }
        return fresh.length ? [...base, ...fresh] : base;
      });
      if (page.nextCursor) setOlderCursor(page.nextCursor);
      setLoaded(true);
      messagesApi.markRead(convId)
        .then(() => {
          // B8: al ENTRAR al chat ya se marcó leído → que el badge del dock lo
          // refleje YA, no dentro de los 15 s del sondeo. Solo la PRIMERA vez:
          // este callback corre cada 4 s y llamarlo siempre convertiría el
          // arreglo en un segundo sondeo paralelo.
          if (!badgeForzado.current) { badgeForzado.current = true; forzar(); }
        })
        .catch(() => {});
      // Parte 28: quién comparte su ubicación en vivo (va en el mismo tick).
      lifebookLiveApi.list(convId).then((r) => setLive(r.sharing ?? [])).catch(() => {});
    } catch { /* reintento en el siguiente tick */ }
  }, [convId, forzar]);

  // B8: y al SALIR del chat, por si llegaron mensajes mientras estaba abierto
  // (se marcaron leídos sin pasar por el `then` de arriba en el último tick).
  useEffect(() => () => { forzar(); }, [forzar]);

  useEffect(() => {
    loadLatest();
    const t = setInterval(loadLatest, POLL_MS);
    return () => clearInterval(t);
  }, [loadLatest]);

  /**
   * Foto y nombre de la contraparte (o del grupo) + mis ajustes del chat.
   * Reintenta: al arrancar en frío por un enlace directo la sesión todavía no
   * está restaurada y el primer intento puede caer en 401.
   */
  useEffect(() => {
    if (!convId) return;
    let cancelled = false;
    let tries = 0;
    const load = async () => {
      tries += 1;
      try {
        const page = await messagesApi.conversations();
        if (cancelled) return;
        const c = page.conversations.find((x) => x.id === convId);
        if (!c) { if (tries < 5) setTimeout(load, 2000); return; }
        setPeer({
          name: c.kind === 'group' ? (c.title ?? 'Grupo') : (c.peer.name ?? peerName),
          avatarUrl: c.kind === 'group' ? (c.photoUrl ?? null) : (c.peer.avatarUrl ?? null),
          kind: c.kind === 'group' ? 'group' : 'direct',
          members: c.members,
        });
        setPrefs({ muted: !!c.isMuted, pinned: !!c.isPinned, background: c.background ?? null });
      } catch {
        if (!cancelled && tries < 5) setTimeout(load, 2000);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [convId, peerName]);

  /** En grupos, el detalle del grupo trae mi rol, el nombre y los miembros. */
  useEffect(() => {
    if (!convId) return;
    if (!isGroupHint && peer?.kind !== 'group') { setMyRole(undefined); return; }
    let cancelled = false;
    let tries = 0;
    const load = async () => {
      tries += 1;
      try {
        const g = await messagesApi.group(convId);
        if (cancelled) return;
        setMyRole(g.myRole);
        // Parte 22: el anuncio y si el grupo está cerrado a los miembros.
        // Parte 25: el tema del grupo.
        setGroupInfo({
          announcement: g.announcement ?? null,
          membersCanSpeak: g.membersCanSpeak !== false,
          topic: g.topic ?? null,
        });
        setGroupId(g.id ?? convId);
        setPeer({
          name: g.title || peerName,
          avatarUrl: g.photoUrl ?? null,
          kind: 'group',
          members: g.membersCount,
        });
      } catch {
        if (cancelled) return;
        if (tries < 5) setTimeout(load, 2000);
        else setMyRole('member');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [convId, peer?.kind, membersOpen, isGroupHint, peerName]);

  /** `members=1` (recién creado el grupo): abre la hoja para invitar a más. */
  useEffect(() => {
    if (openMembersOnMount && convId) setMembersOpen(true);
  }, [openMembersOnMount, convId]);

  /* ── Acciones sobre un mensaje (Parte 24): copiar, reenviar, ver, borrar ── */

  /** Copia el texto del mensaje (o el título de la tarjeta) al portapapeles. */
  const copyText = async (msg: LbMessage) => {
    const text = msg.postRef?.title ?? msg.fileRef?.name ?? msg.text ?? '';
    setActionMsg(null);
    if (!text) { Alert.alert('Copiar', 'Este mensaje no tiene texto que copiar.'); return; }
    await Clipboard.setStringAsync(text);
    Alert.alert('Copiado', 'El texto está en el portapapeles.');
  };

  /**
   * Copia la FOTO al portapapeles (como WhatsApp/Xiaohongshu). Se descarga la
   * imagen y se pasa a base64 porque el portapapeles no acepta URLs.
   */
  const copyPhoto = async (msg: LbMessage) => {
    const url = msg.imageUrl ?? '';
    setActionMsg(null);
    if (!url) { Alert.alert('Copiar foto', 'Este mensaje no tiene foto.'); return; }
    try {
      setBusyAction('copy');
      const res = await fetch(url);
      const blob = await res.blob();
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (!base64) throw new Error('No se pudo leer la imagen');
      await Clipboard.setImageAsync(base64);
      Alert.alert('Foto copiada', 'Ya puedes pegarla en otro chat o app.');
    } catch (e) {
      Alert.alert('Copiar foto', e instanceof Error ? e.message : 'No se pudo copiar la foto.');
    } finally { setBusyAction(null); }
  };

  /** Abre el selector para REENVIAR el mensaje a otra conversación. */
  const openForward = async (msg: LbMessage) => {
    setActionMsg(null);
    setForwardMsg(msg);
    if (convs.length) return;
    try {
      const page = await messagesApi.conversations();
      setConvs(page.conversations.filter((c) => c.id !== convId));
    } catch { setConvs([]); }
  };

  /** Reenvía el mensaje (texto, foto, archivo, tarjeta, ubicación o votación). */
  const forwardTo = async (targetId: string) => {
    const msg = forwardMsg;
    if (!msg) return;
    try {
      setBusyAction('forward');
      if ((msg.kind === 'post' || msg.kind === 'sale') && msg.postRef?.id) {
        await messagesApi.send(targetId, { kind: msg.kind, postId: msg.postRef.id });
      } else if (msg.kind === 'product' && msg.productRef?.id) {
        /**
         * TANDA D — REENVIAR UNA TARJETA DE PRODUCTO.
         *
         * Faltaba esta rama, y el `else` final mandaba «el texto del mensaje»: al reenviar una
         * tarjeta, al otro lado le llegaba un TEXTO («🛍 Producto …») en vez de la tarjeta. Es
         * el defecto que vio el dueño («no sale la tarjeta, sale un texto»). Hay que mandarlo
         * por `enviarAlChat` porque el id del producto no viaja por el camino normal.
         */
        await productosEnNotaApi.enviarAlChat(targetId, msg.productRef.id);
      } else if (msg.kind === 'image' && msg.imageUrl) {
        await messagesApi.send(targetId, { kind: 'image', mediaUrl: msg.imageUrl });
      } else if (msg.kind === 'file' && msg.fileRef?.url) {
        await messagesApi.send(targetId, { kind: 'file', mediaUrl: msg.fileRef.url, fileName: msg.fileRef.name });
      } else if (msg.kind === 'location' && msg.locationRef
                 && Number.isFinite(Number(msg.locationRef.lat)) && Number.isFinite(Number(msg.locationRef.lng))) {
        await messagesApi.send(targetId, {
          kind: 'location', lat: Number(msg.locationRef.lat), lng: Number(msg.locationRef.lng), label: msg.locationRef.label,
        });
      } else if (msg.kind === 'vote' && msg.voteRef) {
        await messagesApi.send(targetId, { kind: 'vote', question: msg.voteRef.question, options: msg.voteRef.options });
      } else if (msg.kind === 'chain' && msg.chainRef) {
        await messagesApi.send(targetId, {
          kind: 'chain', title: msg.chainRef.title, note: msg.chainRef.note ?? undefined, slots: msg.chainRef.slots ?? undefined,
        });
      } else if (msg.kind === 'checkin' && msg.locationRef && msg.checkinRef?.at) {
        await messagesApi.send(targetId, {
          kind: 'checkin', label: msg.locationRef.label, lat: Number(msg.locationRef.lat), lng: Number(msg.locationRef.lng),
          at: msg.checkinRef.at,
        });
      } else {
        await messagesApi.send(targetId, { text: msg.text ?? '' });
      }
      setForwardMsg(null);
      Alert.alert('Reenviado', 'El mensaje se envió a ese chat.');
    } catch (e) {
      Alert.alert('Reenviar', e instanceof Error ? e.message : 'No se pudo reenviar.');
    } finally { setBusyAction(null); }
  };

  /**
   * Borra un mensaje (Parte 23): el mío, o cualquiera si soy dueño/administrador
   * del grupo. Desaparece para todos.
   */
  const confirmDeleteMessage = (msg: LbMessage) => {
    const canDeleteOthers = !msg.fromMe && peer?.kind === 'group' && (myRole === 'owner' || myRole === 'admin');
    if (!msg.fromMe && !canDeleteOthers) return;
    Alert.alert(
      'Eliminar mensaje',
      'El mensaje desaparecerá del chat para todos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await messagesApi.deleteMessage(convId, msg.id);
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            } catch (e) {
              Alert.alert('Eliminar', e instanceof Error ? e.message : 'No se pudo eliminar el mensaje.');
            }
          },
        },
      ],
    );
  };

  /**
   * Parte 28 (G4): UBICACIÓN EN VIVO.
   *  · `empezarEnVivo`: pide permiso, lee la posición y elige la duración.
   *  · Mientras comparto, la app manda mi posición cada 30 s (solo con el chat
   *    abierto; si se cierra, el servidor la deja caducar y la limpia solo).
   */
  const miLive = live.find((l) => l.mine) ?? null;

  const empezarEnVivo = async (minutes: number) => {
    setLocOpen(false);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Ubicación en vivo', 'Necesito permiso de ubicación.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await lifebookLiveApi.start(convId, {
        lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude),
        label: peer?.kind === 'group' ? `En ruta · ${peer.name ?? ''}`.trim() : 'En ruta', minutes,
      });
      setLive(res.sharing ?? []);
    } catch (e) {
      Alert.alert('Ubicación en vivo', e instanceof Error ? e.message : 'No se pudo empezar a compartir.');
    }
  };

  const elegirDuracion = () => {
    Alert.alert('Compartir en vivo', '¿Durante cuánto tiempo quieres compartir tu ubicación?', [
      { text: '15 minutos', onPress: () => { void empezarEnVivo(15); } },
      { text: '1 hora', onPress: () => { void empezarEnVivo(60); } },
      { text: '8 horas', onPress: () => { void empezarEnVivo(480); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const pararEnVivo = async () => {
    try {
      const res = await lifebookLiveApi.stop(convId);
      setLive(res.sharing ?? []);
    } catch (e) {
      Alert.alert('Ubicación en vivo', e instanceof Error ? e.message : 'No se pudo parar.');
    }
  };

  // Mientras comparto: refresco mi posición cada 30 s.
  useEffect(() => {
    if (!convId || !miLive) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!alive) return;
        const res = await lifebookLiveApi.update(convId, {
          lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude),
        });
        if (alive) setLive(res.sharing ?? []);
      } catch { /* el siguiente tick lo reintenta */ }
    }, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [convId, miLive?.userId, miLive?.expiresAt]);

  /**
   * Parte 28 (G4): tocar el avatar de un miembro abre sus acciones (ver perfil,
   * reportar y —si soy dueño/administrador— expulsar del grupo).
   */
  const opcionesDeMiembro = (authorId: string, name: string) => {
    if (!authorId) return;
    const puedoExpulsar = peer?.kind === 'group' && (myRole === 'owner' || myRole === 'admin');
    const botones: any[] = [
      { text: 'Ver perfil', onPress: () => irSeguro.libre('/lifebook-user', { id: authorId }) },
      { text: 'Reportar', onPress: () => reportarPersona(authorId, name) },
    ];
    if (puedoExpulsar) {
      botones.push({
        text: 'Expulsar del grupo',
        style: 'destructive',
        onPress: () => confirmarExpulsion(authorId, name),
      });
    }
    botones.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert(name, peer?.kind === 'group' ? 'Acciones en este grupo' : 'Acciones', botones);
  };

  /** Reportes de personas: los 5 motivos más habituales (el servidor valida el código). */
  const reportarPersona = (authorId: string, name: string) => {
    const motivos: [string, string][] = [
      ['spam', 'Spam o publicidad'],
      ['harassment', 'Acoso o insultos'],
      ['false_content', 'Contenido falso'],
      ['personal_info', 'Comparte datos personales'],
      ['impersonation', 'Se hace pasar por otra persona'],
    ];
    Alert.alert(`Reportar a ${name}`, '¿Por qué lo reportas?', [
      ...motivos.map(([code, label]) => ({
        text: label,
        onPress: async () => {
          try {
            await lifebookActionsApi.reportUser(authorId, code);
            Alert.alert('Gracias', 'Lo ha visto el equipo de moderación.');
          } catch (e) {
            Alert.alert('Reportar', e instanceof Error ? e.message : 'No se pudo enviar el reporte.');
          }
        },
      })),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const confirmarExpulsion = (authorId: string, name: string) => {
    Alert.alert('Expulsar del grupo', `¿Sacar a ${name} del grupo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Expulsar',
        style: 'destructive',
        onPress: async () => {
          try {
            await messagesApi.removeGroupMember(convId, authorId);
            Alert.alert('Hecho', `${name} ya no está en el grupo.`);
          } catch (e) {
            Alert.alert('Expulsar', e instanceof Error ? e.message : 'No se pudo expulsar.');
          }
        },
      },
    ]);
  };

  /** El fondo del chat se pinta en el lienzo de los mensajes. */
  const bg = chatBackgroundOf(prefs.background);

  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await messagesApi.messages(convId, { before: olderCursor, limit: 30 });
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !seen.has(m.id));
        return older.length ? [...older, ...prev] : prev;
      });
      setOlderCursor(page.nextCursor);
    } catch { /* silencioso */ }
    finally { setLoadingOlder(false); }
  }, [convId, olderCursor, loadingOlder]);

  /** Envío con reintento y mensaje optimista. */
  const push = useCallback(async (
    input: Parameters<typeof messagesApi.send>[1],
    optimistic: LbMessage,
  ) => {
    setMessages((prev) => [...prev, optimistic]);
    try {
      const real = await messagesApi.send(convId, input);
      // Se conservan las referencias (postRef/imageUrl/fileRef) del optimista:
      // la respuesta del envío solo trae id/kind/body.
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id
        ? {
          ...m,
          ...real,
          postRef: real.postRef ?? m.postRef,
          imageUrl: real.imageUrl ?? m.imageUrl,
          fileRef: real.fileRef ?? m.fileRef,
          status: 'sent',
        }
        : m)));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      Alert.alert('Mensaje', e instanceof Error ? e.message : 'No se pudo enviar.');
    }
  }, [convId]);

  const sendText = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    await push({ text: body }, {
      id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'text',
      text: body, createdAt: new Date().toISOString(), status: 'sending',
    });
    setSending(false);
  };

  const sharePost = async (post: LbPostBase, kind: 'post' | 'sale') => {
    setPickerOpen(null);
    const price = Number((post.payload?.priceXaf as number | undefined) ?? 0) || 0;
    const title = post.title?.trim() || post.body?.trim() || 'Publicación';
    await push({ kind, postId: post.id }, {
      id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind,
      text: kind === 'sale' ? `🏷️ ${title}${price ? ` · ${lbXaf(price)}` : ''}` : `📄 ${title}`,
      createdAt: new Date().toISOString(), status: 'sending',
      postRef: { id: post.id, title, priceXaf: price || undefined },
    });
  };

  const pickImage = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
        if (perm && perm.granted === false) { Alert.alert('Cámara', 'Necesito permiso para usar la cámara.'); return; }
      } else {
        const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
        if (perm && perm.granted === false) await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, selectionLimit: 1 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const up = await lifebookMediaApi.uploadFile('image', {
        uri: asset.uri,
        name: asset.fileName ?? `foto-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      await push({ kind: 'image', mediaUrl: up.url }, {
        id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'image',
        text: '📷 Foto', imageUrl: up.url, createdAt: new Date().toISOString(), status: 'sending',
      });
    } catch (e) {
      Alert.alert('Foto', e instanceof Error ? e.message : 'No se pudo enviar la foto.');
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const up = await lifebookMediaApi.uploadFile('file', {
        uri: asset.uri,
        name: asset.name ?? `archivo-${Date.now()}`,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      });
      await push(
        { kind: 'file', mediaUrl: up.url, fileName: asset.name, fileSize: asset.size ?? 0 },
        {
          id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'file',
          text: `📎 ${asset.name}`, createdAt: new Date().toISOString(), status: 'sending',
          fileRef: { name: asset.name ?? 'archivo', sizeLabel: '', url: up.url },
        },
      );
    } catch (e) {
      Alert.alert('Archivo', e instanceof Error ? e.message : 'No se pudo enviar el archivo.');
    }
  };

  const openPicker = async (kind: 'note' | 'sale') => {
    setPickerOpen(kind);
    if (myPosts) return;
    try {
      const me = await authApi.me();
      const page = await lifebookApi.userPosts(me?.id ?? '', { limit: 20, type: kind === 'sale' ? 'sale' : undefined });
      setMyPosts(page.posts ?? []);
    } catch { setMyPosts([]); }
  };

  /* ── Parte 24 (G2): enviar UBICACIÓN ── */
  const sendLocation = async (loc: LbPickedLocation) => {
    setLocOpen(false);
    await push({ kind: 'location', lat: loc.lat, lng: loc.lng, label: loc.label }, {
      id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'location',
      text: `📍 ${loc.label}`, createdAt: new Date().toISOString(), status: 'sending',
      locationRef: { label: loc.label, lat: loc.lat, lng: loc.lng },
    });
  };

  /* ── Parte 24 (G2): enviar VOTACIÓN ── */
  const sendVote = async (v: { question: string; options: string[] }) => {
    setVoteOpen(false);
    await push({ kind: 'vote', question: v.question, options: v.options }, {
      id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'vote',
      text: `🗳️ ${v.question}`, createdAt: new Date().toISOString(), status: 'sending',
      voteRef: { question: v.question, options: v.options, counts: v.options.map(() => 0), myVote: null, total: 0 },
    });
  };

  /**
   * Vota en una votación del hilo. El recuento se pinta al momento (optimista)
   * y se sustituye por el real que devuelve el servidor; si falla, se deshace.
   */
  const voteOn = async (msg: LbMessage, optionIdx: number) => {
    const prevRef = msg.voteRef;
    if (!prevRef) return;
    if (busyAction === `vote-${msg.id}`) return;
    if (prevRef.myVote === optionIdx) return; // ya es mi voto
    const base = prevRef.options.map((_, i) => Number(prevRef.counts?.[i] ?? 0) || 0);
    const optimistic = base.slice();
    if (prevRef.myVote !== null && prevRef.myVote !== undefined && optimistic[prevRef.myVote] > 0) {
      optimistic[prevRef.myVote] -= 1;
    }
    optimistic[optionIdx] = (optimistic[optionIdx] ?? 0) + 1;
    setMessages((prev) => prev.map((m) => (m.id === msg.id
      ? { ...m, voteRef: { ...prevRef, counts: optimistic, myVote: optionIdx, total: optimistic.reduce((a, b) => a + b, 0) } }
      : m)));
    try {
      setBusyAction(`vote-${msg.id}`);
      const res = await messagesApi.vote(msg.id, optionIdx);
      setMessages((prev) => prev.map((m) => (m.id === msg.id
        ? {
          ...m,
          voteRef: {
            question: m.voteRef?.question ?? prevRef.question,
            options: res.options.length ? res.options : (m.voteRef?.options ?? prevRef.options),
            counts: res.counts,
            myVote: res.myVote,
            total: res.total,
          },
        }
        : m)));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, voteRef: prevRef } : m)));
      Alert.alert('Votación', e instanceof Error ? e.message : 'No se pudo registrar tu voto.');
    } finally { setBusyAction(null); }
  };

  /* ── Parte 25 (G2-b): enviar CADENA ── */
  const sendChain = async (c: { title: string; note?: string; slots?: number }) => {
    setChainOpen(false);
    await push({ kind: 'chain', title: c.title, note: c.note, slots: c.slots }, {
      id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'chain',
      text: `🔗 ${c.title}`, createdAt: new Date().toISOString(), status: 'sending',
      chainRef: { title: c.title, note: c.note ?? null, slots: c.slots ?? null, joined: 0, joinedByMe: false, members: [] },
    });
  };

  /* ── Parte 25 (G2-b): enviar QUEDADA (lugar ya elegido + hora) ── */
  const sendCheckin = async (c: LbCheckinDraft) => {
    setCheckinOpen(false);
    setCheckinPlace(null);
    await push({ kind: 'checkin', label: c.label, lat: c.lat, lng: c.lng, at: c.at }, {
      id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'checkin',
      text: `📅 Quedada · ${c.label}`, createdAt: new Date().toISOString(), status: 'sending',
      locationRef: { label: c.label, lat: c.lat, lng: c.lng },
      checkinRef: { at: c.at, when: '', going: 1, goingByMe: true, members: [] },
    });
  };

  /**
   * Parte 25: me apunto (o me doy de baja) en una cadena o una quedada.
   * Optimista con rollback, igual que el voto.
   */
  const joinOn = async (msg: LbMessage, joined: boolean) => {
    if (busyAction === `join-${msg.id}`) return;
    const isChain = msg.kind === 'chain';
    const prev = isChain ? msg.chainRef : msg.checkinRef;
    if (!prev) return;
    const before = { count: isChain ? msg.chainRef!.joined : msg.checkinRef!.going, mine: isChain ? !!msg.chainRef!.joinedByMe : msg.checkinRef!.goingByMe };
    const apply = (now: { count: number; mine: boolean }) => setMessages((list) => list.map((m) => {
      if (m.id !== msg.id) return m;
      if (isChain && m.chainRef) {
        return { ...m, chainRef: { ...m.chainRef, joined: now.count, joinedByMe: now.mine } };
      }
      if (m.checkinRef) {
        return { ...m, checkinRef: { ...m.checkinRef, going: now.count, goingByMe: now.mine } };
      }
      return m;
    }));
    apply({ count: Math.max(0, before.count + (joined ? 1 : -1)), mine: joined });
    try {
      setBusyAction(`join-${msg.id}`);
      const res = await messagesApi.join(msg.id, joined);
      setMessages((list) => list.map((m) => {
        if (m.id !== msg.id) return m;
        if (isChain && m.chainRef) {
          return { ...m, chainRef: { ...m.chainRef, joined: res.count, joinedByMe: res.joined, slots: res.slots ?? m.chainRef.slots, members: res.members } };
        }
        if (m.checkinRef) {
          return { ...m, checkinRef: { ...m.checkinRef, going: res.count, goingByMe: res.joined, members: res.members } };
        }
        return m;
      }));
    } catch (e) {
      apply(before);
      Alert.alert(msg.kind === 'chain' ? 'Cadena' : 'Quedada', e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally { setBusyAction(null); }
  };

  /**
   * Parte 25 (ajuste pedido por el dueño): abrir la ubicación en el TAXI.
   * «¿De qué sirve ver el punto si no puedo pedir que me lleven?» → el mapa y la
   * burbuja llevan «Pedir taxi hasta aquí» y abren `/taxi` con el destino puesto
   * (la pantalla de taxi ya acepta `dLat`/`dLng`/`dLabel` y calcula la ruta).
   */
  const openTaxiTo = (ref: { label?: string; lat?: number | null; lng?: number | null } | undefined | null) => {
    const lat = Number(ref?.lat);
    const lng = Number(ref?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('Taxi', 'Este mensaje no trae coordenadas para pedir el taxi.');
      return;
    }
    setMapMsg(null);
    router.push({
      pathname: '/taxi',
      params: { dLat: String(lat), dLng: String(lng), dLabel: String(ref?.label ?? 'Destino') },
    } as never);
  };

  /**
   * Parte 26: abrir el SERVICIO enlazado en un anuncio.
   *
   * Ojo con `lifebook`: el servidor devuelve `/lifebook-store`, que es la tienda
   * de un vendedor y **necesita `sellerId`** — sin él la pantalla se abría vacía
   * (el fallo que reportó el dueño). Si el enlace trae id, se abre el PERFIL de
   * esa persona; y si no hay destino posible, se avisa en vez de no hacer nada.
   */
  const openAdLink = (msg: LbMessage) => {
    const link = msg.adRef?.link;
    if (!link) return;
    try {
      if (link.type === 'lifebook') {
        // El id del enlace manda; si un anuncio antiguo no lo trae, se abre el
        // perfil de quien lo publicó (nunca una pantalla vacía).
        const target = link.id ?? msg.author?.id ?? null;
        if (target) {
          irSeguro.libre('/lifebook-user', { id: String(target) });
          return;
        }
        Alert.alert('Enlace del anuncio', 'Este anuncio enlaza un perfil de Life Book, pero no trae el id de la persona.');
        return;
      }
      if (!link.route) {
        Alert.alert('Enlace del anuncio', 'Este anuncio no tiene un destino que se pueda abrir.');
        return;
      }
      irSeguro.libre(String(link.route ?? ''));
    } catch (e) {
      Alert.alert('Enlace del anuncio', e instanceof Error ? e.message : 'No se pudo abrir el enlace.');
    }
  };

  /* ── Parte 26 (G2-c): publicar un ANUNCIO de grupo ── */
  const sendAd = async (a: LbAdDraft) => {
    setAdOpen(false);
    await push(
      {
        kind: 'ad', title: a.title || undefined, text: a.text || undefined, priceXaf: a.priceXaf,
        mediaUrl: a.mediaUrl, linkType: a.linkType, linkId: a.linkId,
      },
      {
        id: `tmp-${Date.now()}`, conversationId: convId, fromMe: true, kind: 'ad',
        text: `📣 ${a.title || a.text}`, createdAt: new Date().toISOString(), status: 'sending',
        adRef: {
          title: a.title || null, text: a.text, priceXaf: a.priceXaf ?? null,
          imageUrl: a.mediaUrl ?? null,
          link: a.linkType ? { type: a.linkType, id: a.linkId ?? null, route: null } : null,
        },
      },
    );
  };

  /** Acciones del panel "+". */
  const onAction = (a: LbChatAction) => {
    setPlusOpen(false);
    switch (a) {
      case 'shareNote': openPicker('note'); return;
      case 'sale': openPicker('sale'); return;
      /* TANDA D: mandar una TARJETA DE PRODUCTO. Solo tiene sentido con productos míos (los de
         mi tienda): es lo que un comerciante manda a su grupo o a un cliente.
         OJO: hay que LLAMAR a `abrirProductos` (no solo abrir el modal): la primera versión
         abría la hoja sin pedir la lista y se quedaba el girador para siempre, sin que el
         servidor recibiera ni una petición (comprobado en el registro del proxy). */
      case 'product': void abrirProductos(); return;
      case 'photos': pickImage(false); return;
      case 'camera': pickImage(true); return;
      case 'file': pickFile(); return;
      case 'groupMap': setLocOpen(true); return;        // Parte 24: compartir ubicación
      case 'vote': setVoteOpen(true); return;           // Parte 24: crear votación
      case 'chain': setChainOpen(true); return;         // Parte 25: crear cadena
      case 'checkin': setCheckinPickOpen(true); return; // Parte 25: quedada (lugar → hora)
      case 'topic':                                     // Parte 25: tema del grupo
        if (peer?.kind !== 'group') { Alert.alert('Tema', 'El tema es del grupo: este chat es 1 a 1.'); return; }
        if (myRole !== 'owner' && myRole !== 'admin') { Alert.alert('Tema del grupo', 'Solo el organizador y los administradores pueden cambiarlo.'); return; }
        setSheetStep('edit');
        setMembersOpen(true);
        return;
      case 'groupAd':                                   // Parte 26: anuncio del grupo
        if (peer?.kind !== 'group') { Alert.alert('Anuncio', 'Los anuncios son de grupo.'); return; }
        setAdOpen(true);
        return;
      case 'challengePlaza':                            // Parte 26: Plaza de retos
        setPlazaOpen(true);
        return;
      default: return;
    }
  };

  /**
   * TANDA D — abrir el selector de productos y enviar la tarjeta.
   *
   * El mensaje NO es un enlace: se manda `kind='product'` con el id y el servidor resuelve el
   * resto al leer, así que la tarjeta enseña el precio de HOY.
   */
  const abrirProductos = async () => {
    setProdPickOpen(true);
    if (misProds) return;
    try {
      const r = await productosEnNotaApi.misProductos();
      setMisProds((r.items ?? []).filter((p) => (p as { status?: string }).status === 'active'));
    } catch {
      setMisProds([]);
    }
  };

  const enviarProducto = async (p: LbProductCard) => {
    setProdPickOpen(false);
    /**
     * Se pinta YA (optimista) y se manda por `productosEnNotaApi.enviarAlChat`, NO por `push`:
     * el `sendRich` de `api/lifebook.ts` (que no se puede tocar) solo reenvía unos campos fijos y
     * el `productId` se perdía, con lo que el servidor contestaba «Producto no válido»
     * (comprobado en el teléfono).
     */
    const tmpId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tmpId, conversationId: convId, fromMe: true, kind: 'product',
      text: `🛍 ${p.title}`, createdAt: new Date().toISOString(), status: 'sending',
      productRef: {
        id: p.id, title: p.title, priceXaf: p.priceXaf ?? null, currency: 'XAF',
        coverUrl: p.coverUrl ?? null, shopId: p.shop?.id ?? null, available: true,
      },
    }]);
    try {
      const real = await productosEnNotaApi.enviarAlChat(convId, p.id);
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, id: real.id ?? m.id, status: 'sent' } : m)));
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'failed' } : m)));
      Alert.alert('Producto', e instanceof Error ? e.message : 'No se pudo enviar la tarjeta');
    }
  };

  /* La lista va invertida: los más nuevos abajo. */
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  /** Parte 24: coordenadas [lon, lat] del sitio abierto en el mapa (si las trae). */
  const mapCoords = useMemo<[number, number] | null>(() => {
    // Una ubicación EN VIVO (Parte 28) tiene prioridad sobre el mensaje abierto.
    const src = mapPoint ?? mapMsg?.locationRef;
    const lat = Number(src?.lat);
    const lng = Number(src?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  }, [mapMsg, mapPoint]);

  /** Etiqueta del punto que se está viendo en el mapa. */
  const mapLabel = mapPoint?.label ?? mapMsg?.locationRef?.label ?? 'Ubicación';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={{ paddingTop: insets.top, flex: 1 }}>
        {/* Cabecera */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: alpha(colors.border, 0.6) }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Volver">
            <ArrowLeft size={20} color={colors.textPrimary} />
          </Pressable>
          {/* Foto de la persona (o del grupo) + nombre → perfil, o gestión del grupo */}
          <Pressable
            onPress={() => {
              if (peer?.kind === 'group') { setMembersOpen(true); return; }
              if (peerId) irSeguro.libre('/lifebook-user', { id: peerId });
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, flex: 1, marginLeft: espaciado.e8 }}
            accessibilityLabel={peer?.kind === 'group' ? 'Grupo, toca para gestionarlo' : `Perfil de ${peer?.name ?? peerName}`}
          >
            {peer?.avatarUrl ? (
              <Image source={{ uri: peer.avatarUrl }} style={styles.headAvatar} />
            ) : (
              <View style={[styles.headAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                <Text style={{ color: colors.text.primary, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>
                  {(peer?.name ?? peerName).trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.cuerpo }} numberOfLines={1}>
                {peer?.name ?? peerName}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }} numberOfLines={1}>
                {peer?.kind === 'group'
                  ? `${peer.members ?? 0} miembros${groupInfo.topic ? ` · ${groupInfo.topic}` : ''}`
                  : 'En EG Route Plan'}
              </Text>
            </View>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => setMenuOpen(true)} accessibilityLabel="Más opciones">
            <MoreHorizontal size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Anuncio del grupo (Parte 22, como Xiaohongshu) */}
        {peer?.kind === 'group' && groupInfo.announcement && announcementOpen ? (
          <Pressable
            onPress={() => setAnnouncementOpen(false)}
            accessibilityLabel="Anuncio del grupo, toca para cerrar"
            style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.e8,
              marginHorizontal: espaciado.e12, marginTop: espaciado.e8, padding: espaciado.e10, borderRadius: radios.campo,
              backgroundColor: alpha(colors.secondary, 0.10), borderWidth: trazo.fino, borderColor: alpha(colors.secondary, 0.25),
            }}
          >
            <Text style={{ fontSize: tipografia.cuerpo }}>📣</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Anuncio del grupo</Text>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, lineHeight: 18, marginTop: espaciado.e2 }}>
                {groupInfo.announcement}
              </Text>
            </View>
            <X size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {/* Parte 28 (G4): quién comparte su ubicación EN VIVO ahora mismo */}
        {live.length > 0 ? (
          <View style={[styles.liveBar, { backgroundColor: alpha(colors.secondary, 0.10), borderColor: alpha(colors.secondary, 0.28) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
              <Radio size={14} color={colors.text.secondary} />
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                {miLive ? 'Estás compartiendo tu ubicación' : 'Ubicación en vivo'}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e6, marginTop: espaciado.e6 }}>
              {live.map((l) => (
                <Pressable
                  key={l.userId}
                  onPress={() => setMapPoint({ lat: l.lat, lng: l.lng, label: l.label ?? l.fullName ?? 'Ubicación en vivo' })}
                  accessibilityLabel={`Ver en el mapa la ubicación de ${l.fullName ?? 'alguien'}`}
                  style={[styles.liveChip, { backgroundColor: colors.card }]}
                >
                  <View style={{ width: 8, height: 8, borderRadius: radios.full, backgroundColor: colors.secondary }} />
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }} numberOfLines={1}>
                    {l.mine ? 'Tú' : (l.fullName ?? 'Alguien')} · {l.ageSec < 60 ? `${l.ageSec} s` : `${Math.round(l.ageSec / 60)} min`} · {l.minutesLeft} min
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {miLive ? (
              <Pressable onPress={pararEnVivo} accessibilityLabel="Dejar de compartir mi ubicación"
                style={[styles.liveStop, { backgroundColor: alpha(colors.danger, 0.12) }]}>
                <Text style={{ color: colors.text.danger, fontWeight: peso.titulo, fontSize: tipografia.caption }}>Detener</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Mensajes */}
        <View style={{ flex: 1, backgroundColor: bg?.base ?? 'transparent' }}>
          {bg?.accent ? (
            <View pointerEvents="none" style={[styles.bgAccent, { backgroundColor: bg.accent }]} />
          ) : null}
          <FlatList
          ref={listRef}
          data={inverted}
          keyExtractor={(m) => m.id}
          inverted
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: espaciado.e14, gap: espaciado.e8 }}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              colors={colors}
              onLongPress={() => setActionMsg(item)}
              onOpenImage={() => { if (item.imageUrl) openPhoto(item.imageUrl); }}
              onAvatar={() => {
                const authorId = item.author?.id;
                if (authorId) irSeguro.libre('/lifebook-user', { id: authorId });
              }}
              onAvatarLongPress={() => {
                const authorId = item.author?.id;
                if (authorId) opcionesDeMiembro(authorId, item.author?.name ?? 'Usuario');
              }}
              onVote={(idx) => voteOn(item, idx)}
              onOpenLocation={() => setMapMsg(item)}
              onTaxi={() => openTaxiTo(item.locationRef)}
              onJoin={(joined) => joinOn(item, joined)}
              onOpenLink={() => openAdLink(item)}
              /* TANDA D: la tarjeta de producto lleva a su ficha, que es donde se compra. */
              /* MERCADO: la tarjeta abre la HOJA EMBEBIDA (se compra sin salir del chat). La
                 ficha completa sigue estando a un toque desde dentro de la hoja. */
              onOpenProduct={(pid) => setProductoEnChat(String(pid))}
              /* MERCADO (tanda E): el pedido también se abre desde la tarjeta del chat. */
              onOpenOrder={(oid) => irSeguro.libre('/lifebook-order/[id]', { id: String(oid) })}
            />
          )}
          ListEmptyComponent={
            loaded ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: tipografia.body }}>
                Escribe el primer mensaje 👋
              </Text>
            ) : null
          }
          ListFooterComponent={
            olderCursor ? (
              <Pressable onPress={loadOlder} style={{ alignItems: 'center', paddingVertical: espaciado.e10 }}>
                {loadingOlder
                  ? <ActivityIndicator size="small" color={colors.text.primary} />
                  : <Text style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Mensajes anteriores</Text>}
              </Pressable>
            ) : null
          }
        />
        </View>

        {/* Input + "+" (bloqueado si el grupo está cerrado y no soy dueño/admin) */}
        {(() => {
          const muted = peer?.kind === 'group' && !groupInfo.membersCanSpeak && myRole !== 'owner' && myRole !== 'admin';
          if (muted) {
            return (
              <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, backgroundColor: colors.card, borderTopColor: alpha(colors.border, 0.6) }]}>
                <View style={[styles.input, { backgroundColor: alpha(colors.textSecondary, 0.08), flex: 1, justifyContent: 'center' }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
                    Solo el organizador y los administradores pueden escribir
                  </Text>
                </View>
              </View>
            );
          }
          return (
            <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, backgroundColor: colors.card, borderTopColor: alpha(colors.border, 0.6) }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Escribe un mensaje…"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={1000}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              />
              <Pressable
                onPress={() => setPlusOpen((v) => !v)}
                accessibilityLabel="Más acciones"
                style={[styles.iconBtn, { backgroundColor: plusOpen ? colors.primary : colors.surface }]}
              >
                <Plus size={20} color={plusOpen ? brand.white : colors.textPrimary} />
              </Pressable>
              {text.trim() ? (
                <Pressable onPress={sendText} disabled={sending} accessibilityLabel="Enviar" style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
                  {sending ? <ActivityIndicator size="small" color={brand.white} /> : <Send size={16} color={brand.white} />}
                </Pressable>
              ) : null}
            </View>
          );
        })()}

        {/* Panel de acciones (las de grupo salen marcadas «pronto») */}
        <ChatPlusPanel visible={plusOpen} isGroup={peer?.kind === 'group'} onAction={onAction} />
      </View>

      {/* ═══════ Parte 24 (G2): compartir ubicación ═══════ */}
      <LocationPickerSheet
        visible={locOpen}
        onClose={() => setLocOpen(false)}
        onSubmit={sendLocation}
        isGroup={peer?.kind === 'group'}
        onLive={elegirDuracion}
      />

      {/* ═══════ Parte 24 (G2): crear votación ═══════ */}
      <VoteSheet visible={voteOpen} onClose={() => setVoteOpen(false)} onSubmit={sendVote} />

      {/* ═══════ Parte 25 (G2-b): cadena y quedada ═══════ */}
      <ChainSheet visible={chainOpen} onClose={() => setChainOpen(false)} onSubmit={sendChain} />
      {/* Quedada, paso 1: el lugar (se reutiliza la hoja de ubicación). */}
      <LocationPickerSheet
        visible={checkinPickOpen}
        onClose={() => setCheckinPickOpen(false)}
        title="Lugar de la quedada"
        myLocationLabel="Estoy aquí"
        onSubmit={(loc) => { setCheckinPlace(loc); setCheckinPickOpen(false); setCheckinOpen(true); }}
      />
      {/* Quedada, paso 2: la hora. */}
      <CheckinSheet
        visible={checkinOpen}
        place={checkinPlace}
        onClose={() => { setCheckinOpen(false); setCheckinPlace(null); }}
        onSubmit={sendCheckin}
      />

      {/* ═══════ TANDA D: elegir el producto que se manda como tarjeta ═══════ */}
      <Modal visible={prodPickOpen} transparent animationType="slide" onRequestClose={() => setProdPickOpen(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setProdPickOpen(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radios.panel, borderTopRightRadius: radios.panel, padding: espaciado.e16, paddingBottom: insets.bottom + 16, maxHeight: '80%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e4 }}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 }}>
              Mandar un producto
            </Text>
            <Pressable onPress={() => setProdPickOpen(false)} hitSlop={10} accessibilityLabel="Cerrar">
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>
            Se envía una tarjeta con la foto, el nombre, el precio y un botón para comprar, sin
            sacar a nadie de la conversación. Solo puedes mandar productos de tu tienda.
          </Text>

          {misProds === null ? (
            <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e26 }} />
          ) : misProds.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingVertical: espaciado.e22 }}>
              No tienes productos activos. Publica uno en tu tienda y podrás mandarlo por aquí.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: espaciado.e8 }}>
              {misProds.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => { void enviarProducto(p); }}
                  disabled={!!enviandoProd}
                  accessibilityLabel={`Mandar el producto ${p.title}`}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, padding: espaciado.e8, borderRadius: radios.md,
                    borderWidth: trazo.fino, borderColor: alpha(colors.border, 0.6), backgroundColor: colors.surface,
                  }}
                >
                  {p.coverUrl ? (
                    <ExpoImage source={absUrl(p.coverUrl)} style={{ width: 44, height: 44, borderRadius: radios.chip }} contentFit="cover" transition={0} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: radios.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }}>
                      <ShoppingBag size={18} color={alpha(colors.text.primary, 0.6)} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{p.title}</Text>
                    <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                      {p.priceXaf === null ? 'Precio a consultar' : `${p.priceXaf} XAF`}
                    </Text>
                  </View>
                  {enviandoProd === p.id ? <ActivityIndicator size="small" color={colors.text.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ═══════ MERCADO: comprar el producto de una tarjeta SIN salir del chat ═══════ */}
      <ProductoEnChatSheet
        visible={!!productoEnChat}
        productId={productoEnChat}
        /* MERCADO (tanda E): la conversación viaja con la compra. Si es un GRUPO, el pedido se
           publica ahí con el aviso social; el chat con la tienda lo recibe siempre. */
        conversationId={convId}
        onClose={() => setProductoEnChat(null)}
        onAnadido={() => { /* el globito del carrito se refresca al volver a la ficha */ }}
      />

      {/* ═══════ Parte 26 (G2-c): anuncio del grupo y Plaza de retos ═══════ */}
      <AdSheet visible={adOpen} onClose={() => setAdOpen(false)} onSubmit={sendAd} />
      {/* La Plaza de retos no depende del chat: se abre sin filtro de ciudad. */}
      <ChallengePlazaSheet visible={plazaOpen} onClose={() => setPlazaOpen(false)} />

      {/* ═══════ Parte 24 (G2): ubicación compartida en el mapa ═══════ */}
      <Modal visible={!!mapCoords} animationType="slide" onRequestClose={() => { setMapMsg(null); setMapPoint(null); }} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            paddingTop: insets.top + 8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
            flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
            backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(colors.border, 0.6),
          }}>
            <Pressable onPress={() => { setMapMsg(null); setMapPoint(null); }} hitSlop={8} accessibilityLabel="Cerrar el mapa">
              <X size={20} color={colors.textPrimary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.cuerpo }}>
                📍 {mapLabel}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>
                {mapCoords ? `${mapCoords[1].toFixed(5)}, ${mapCoords[0].toFixed(5)}` : 'Sin coordenadas en este mensaje'}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            {mapCoords ? (
              <MapBackground pin={mapCoords} initialCamera={{ centerCoordinate: mapCoords, zoomLevel: 15.5 }} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e30 }}>
                <MapPin size={26} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', marginTop: espaciado.e10 }}>
                  Este mensaje no trae coordenadas, solo el nombre del sitio.
                </Text>
              </View>
            )}
          </View>

          {/* Parte 25: el punto sirve para algo → pedir el taxi hasta aquí. */}
          <View style={{ padding: espaciado.e14, paddingBottom: insets.bottom + 14, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(colors.border, 0.6) }}>
            <Pressable
              onPress={() => openTaxiTo(mapPoint ?? mapMsg?.locationRef)}
              accessibilityLabel="Pedir taxi hasta aquí"
              disabled={!mapCoords}
              style={({ pressed }) => [styles.taxiCta, {
                backgroundColor: mapCoords ? colors.primary : alpha(colors.primary, 0.35),
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>🚕  Pedir taxi hasta aquí</Text>
            </Pressable>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, textAlign: 'center', marginTop: espaciado.e8 }}>
              Abre el taxi con este punto como destino y calcula la ruta desde donde estés.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Selector de MIS publicaciones para compartir */}
      <Modal visible={!!pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(null)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setPickerOpen(null)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1 }}>
              {pickerOpen === 'sale' ? 'Compartir una venta' : 'Compartir una nota'}
            </Text>
            <Pressable onPress={() => setPickerOpen(null)} hitSlop={10} accessibilityLabel="Cerrar">
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {myPosts === null ? (
            <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e20 }} />
          ) : myPosts.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e20, fontSize: tipografia.body }}>
              No tienes publicaciones de ese tipo.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {myPosts.map((post) => {
                const price = Number((post.payload?.priceXaf as number | undefined) ?? 0) || 0;
                const thumb = post.media?.[0]?.url ? absUrl(post.media[0].url) : '';
                return (
                  <Pressable
                    key={post.id}
                    onPress={() => sharePost(post, pickerOpen === 'sale' ? 'sale' : 'post')}
                    style={({ pressed }) => [styles.postRow, { borderBottomColor: alpha(colors.border, 0.5), opacity: pressed ? 0.75 : 1 }]}
                  >
                    {thumb ? (
                      <ExpoImage source={thumb} style={styles.postThumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    ) : (
                      <View style={[styles.postThumb, styles.center, { backgroundColor: alpha(colors.primary, 0.1) }]}>
                        <Text style={{ fontSize: tipografia.subtitle }}>📄</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.medio }}>
                        {post.title?.trim() || post.body?.trim() || 'Publicación'}
                      </Text>
                      {price ? <Precio valor={price} tamano="sm" color={colors.text.primary} style={{ marginTop: espaciado.e2 }} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ⋯: historial, no molestar, fijar, fondo, borrar, reclamación, grupos */}
      <ChatOptionsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        convId={convId}
        isGroup={peer?.kind === 'group'}
        peerId={peerId}
        peerName={peer?.name ?? peerName}
        myRole={myRole}
        state={prefs}
        onChanged={(patch) => {
          setPrefs((prev) => ({
            muted: patch.muted ?? prev.muted,
            pinned: patch.pinned ?? prev.pinned,
            background: patch.background !== undefined ? patch.background : prev.background,
          }));
          if (patch.cleared) { setMessages([]); setOlderCursor(null); }
        }}
        onOpenMembers={() => { setSheetStep('members'); setMembersOpen(true); }}
        onEditGroup={() => { setSheetStep('edit'); setMembersOpen(true); }}
        onLeaveGroup={() => router.back()}
      />

      {/* ═══════ Menú de un mensaje: ver · copiar · reenviar · borrar ═══════ */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setActionMsg(null)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e8 }} numberOfLines={2}>
            {(actionMsg?.postRef?.title ?? actionMsg?.fileRef?.name ?? actionMsg?.text ?? '').slice(0, 90) || 'Mensaje'}
          </Text>

          {actionMsg?.kind === 'image' && actionMsg.imageUrl ? (
            <MenuRow icon="🔍" label="Ver a pantalla completa" onPress={() => { const u = actionMsg.imageUrl!; setActionMsg(null); openPhoto(u); }} colors={colors} />
          ) : null}
          {actionMsg?.kind === 'image' && actionMsg.imageUrl ? (
            <MenuRow icon="🖼️" label={busyAction === 'copy' ? 'Copiando la foto…' : 'Copiar foto'} onPress={() => copyPhoto(actionMsg)} colors={colors} />
          ) : null}
          {/* Parte 25: el punto compartido sirve para pedir el taxi (ajuste del dueño) */}
          {(actionMsg?.kind === 'location' || actionMsg?.kind === 'checkin') && actionMsg?.locationRef ? (
            <MenuRow
              icon="🚕"
              label="Pedir taxi hasta aquí"
              onPress={() => { const m = actionMsg!; setActionMsg(null); openTaxiTo(m.locationRef); }}
              colors={colors}
            />
          ) : null}
          {(actionMsg?.kind === 'location' || actionMsg?.kind === 'checkin') && actionMsg?.locationRef ? (
            <MenuRow
              icon="🗺️"
              label="Ver en el mapa"
              onPress={() => { const m = actionMsg!; setActionMsg(null); setMapMsg(m); }}
              colors={colors}
            />
          ) : null}
          <MenuRow icon="📋" label="Copiar texto" onPress={() => actionMsg && copyText(actionMsg)} colors={colors} />
          <MenuRow icon="↗️" label="Enviar a otro chat" onPress={() => actionMsg && openForward(actionMsg)} colors={colors} />
          {actionMsg?.fromMe || (peer?.kind === 'group' && (myRole === 'owner' || myRole === 'admin')) ? (
            <MenuRow icon="🗑️" label="Eliminar mensaje" danger onPress={() => { const m = actionMsg!; setActionMsg(null); confirmDeleteMessage(m); }} colors={colors} />
          ) : null}
          <Pressable onPress={() => setActionMsg(null)} style={{ paddingVertical: espaciado.e10 }}>
            <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ═══════ Foto a pantalla completa: pinza/doble toque + botones (Parte 32) ═══════
          Sin animación de fundido (era parte del parpadeo) y con caché de disco. */}
      <Modal visible={!!viewerUrl} transparent animationType="none" onRequestClose={() => setViewerUrl(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: brand.visor }}>
          {viewerUrl ? (
            <ZoomableImage
              ref={zoomRef}
              uri={viewerUrl}
              width={Dimensions.get('window').width}
              height={Dimensions.get('window').height}
              onSingleTap={() => setViewerUrl(null)}
            />
          ) : null}
          <ViewerZoomControls
            bottom={insets.bottom + 18}
            onZoomOut={() => zoomRef.current?.zoomOut()}
            onFit={() => zoomRef.current?.fit()}
            onZoomIn={() => zoomRef.current?.zoomIn()}
          />
          <Text style={{ position: 'absolute', bottom: insets.bottom + 22, right: 18, color: 'rgba(255,255,255,0.75)', fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
            Pellizca para ampliar
          </Text>
          <Pressable
            onPress={() => setViewerUrl(null)}
            accessibilityLabel="Cerrar foto"
            style={{ position: 'absolute', top: insets.top + 10, right: 16, width: 36, height: 36, borderRadius: radios.full, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={brand.white} />
          </Pressable>
        </View>
      </Modal>

      {/* ═══════ Reenviar: elegir chat ═══════ */}
      <Modal visible={!!forwardMsg} transparent animationType="slide" onRequestClose={() => setForwardMsg(null)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setForwardMsg(null)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1 }}>Enviar a otro chat</Text>
            <Pressable onPress={() => setForwardMsg(null)} hitSlop={10} accessibilityLabel="Cerrar"><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          {busyAction === 'forward' ? (
            <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e20 }} />
          ) : convs.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e20, fontSize: tipografia.body }}>
              No tienes otros chats todavía.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {convs.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => forwardTo(c.id)}
                  accessibilityLabel={`Enviar a ${c.kind === 'group' ? (c.title ?? 'Grupo') : c.peer.name}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(colors.border, 0.5) }}
                >
                  {(c.kind === 'group' ? c.photoUrl : c.peer.avatarUrl) ? (
                    <Image source={{ uri: (c.kind === 'group' ? c.photoUrl : c.peer.avatarUrl) as string }} style={styles.headAvatar} />
                  ) : (
                    <View style={[styles.headAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                      <Text style={{ color: colors.text.primary, fontWeight: peso.titulo }}>
                        {((c.kind === 'group' ? c.title : c.peer.name) ?? '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>
                      {c.kind === 'group' ? (c.title ?? 'Grupo') : c.peer.name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{c.lastMessage}</Text>
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: tipografia.title }}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Grupo: gestión completa (miembros · anuncio · ajustes · disolver) */}
      <GroupManageSheet
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
        groupId={convId}
        initialStep={sheetStep === 'edit' ? 'edit' : 'manage'}
        onLeft={() => router.back()}
      />
    </KeyboardAvoidingView>
  );
}

/* ── Burbujas por tipo ── */
function MenuRow({ icon, label, onPress, colors, danger }: {
  icon: string; label: string; onPress: () => void; colors: any; danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.menuRow, { backgroundColor: pressed ? alpha(danger ? colors.danger : colors.primary, 0.06) : 'transparent' }]}
    >
      <Text style={{ fontSize: tipografia.subtitle }}>{icon}</Text>
      <Text style={{ color: danger ? colors.text.danger : colors.textPrimary, fontSize: tipografia.cuerpo, fontWeight: peso.fuerte }}>{label}</Text>
    </Pressable>
  );
}

function Bubble({ msg, colors, onLongPress, onAvatar, onAvatarLongPress, onOpenImage, onVote, onOpenLocation, onTaxi, onJoin, onOpenLink, onOpenProduct, onOpenOrder }: {
  msg: LbMessage;
  colors: any;
  onLongPress: () => void;
  onAvatar: () => void;
  /** Parte 28 (G4): mantener pulsado el avatar → ver perfil / reportar / expulsar. */
  onAvatarLongPress?: () => void;
  /** Tocar una foto la abre a pantalla completa (con pinza para ampliar). */
  onOpenImage?: () => void;
  /** Parte 24: votar una opción de la votación. */
  onVote?: (optionIdx: number) => void;
  /** TANDA D: abrir la ficha del producto de una tarjeta (para comprarlo). */
  onOpenProduct?: (productId: string) => void;
  /** MERCADO (tanda E): abrir el pedido de una tarjeta del chat. */
  onOpenOrder?: (orderId: string) => void;
  /** Parte 24: abrir la ubicación compartida en el mapa. */
  onOpenLocation?: () => void;
  /** Parte 25: pedir un taxi hasta ese punto (ajuste pedido por el dueño). */
  onTaxi?: () => void;
  /** Parte 25: apuntarme / darme de baja en una cadena o quedada. */
  onJoin?: (joined: boolean) => void;
  /** Parte 26: abrir el servicio enlazado en un anuncio. */
  onOpenLink?: () => void;
}) {
  const mine = msg.fromMe;
  const align = mine ? 'flex-end' : 'flex-start';

  /**
   * Foto de quien escribe: ahora en TODOS los mensajes del otro (antes solo en
   * los de texto, y por eso «no se veía el icono de perfil» en fotos, archivos
   * y tarjetas). Tocarla abre su perfil; mantener pulsado el mensaje lo borra.
   */
  const avatar = !mine ? (
    <Pressable
      onPress={onAvatar}
      onLongPress={onAvatarLongPress}
      delayLongPress={450}
      hitSlop={6}
      accessibilityLabel={`Perfil de ${msg.author?.name ?? 'usuario'}, mantén pulsado para más acciones`}
    >
      {msg.author?.avatarUrl ? (
        <Image source={{ uri: absUrl(msg.author.avatarUrl) }} style={styles.msgAvatar} />
      ) : (
        <View style={[styles.msgAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
          <Text style={{ color: colors.text.primary, fontWeight: peso.titulo, fontSize: tipografia.micro }}>
            {(msg.author?.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
      )}
    </Pressable>
  ) : null;

  /**
   * Envuelve cualquier contenido con su avatar y el gesto de borrar.
   * El ancho se limita AQUÍ (78 %): antes el límite estaba en la burbuja de
   * texto y, al meterla dentro de un contenedor del tamaño del contenido, el
   * 75 % se calculaba sobre ese contenedor y las burbujas salían encogidas.
   */
  const wrap = (content: React.ReactNode, wide?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: align, gap: espaciado.e6, alignItems: 'flex-end' }}>
      {avatar}
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={550}
        accessibilityLabel={mine ? 'Tu mensaje, mantén pulsado para eliminarlo' : undefined}
        style={{ maxWidth: '78%', flexShrink: 1 }}
      >
        {content}
      </Pressable>
    </View>
  );

  if (msg.kind === 'image') {
    return wrap(
      <Pressable onPress={onOpenImage} accessibilityLabel="Ver la foto a pantalla completa">
        {/* Parte 32: expo-image con caché → la burbuja no destella al volver. */}
        <ExpoImage
          source={msg.imageUrl ?? msg.text}
          style={styles.imgBubble}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={msg.id}
          transition={0}
        />
      </Pressable>,
    );
  }

  if (msg.kind === 'file' && msg.fileRef) {
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card }]}>
        <FileText size={20} color={colors.text.primary} />
        <View style={{ marginLeft: espaciado.e8, flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.medio }} numberOfLines={1}>{msg.fileRef.name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>{msg.fileRef.sizeLabel || 'archivo'}</Text>
        </View>
      </View>,
      true,
    );
  }

  /**
   * TANDA D — TARJETA DE PRODUCTO DENTRO DEL CHAT.
   *
   * No es un enlace: es una tarjeta con la foto, el nombre, el precio y un botón de compra, para
   * no sacar a nadie de la conversación. El precio que se enseña es el de HOY (el servidor lo
   * resuelve al leer), no el del día en que se envió: si el comerciante lo cambió, se ve el
   * bueno. Si el producto ya no está a la venta se dice, en vez de ofrecer comprarlo.
   */
  if (msg.kind === 'product' && msg.productRef) {
    const pr = msg.productRef;
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card, width: 224, flexDirection: 'column' }]}>
        {pr.coverUrl ? (
          <ExpoImage source={absUrl(pr.coverUrl)} style={styles.postCover} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <View style={[styles.postCover, { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }]}>
            <ShoppingCart size={22} color={alpha(colors.text.primary, 0.5)} />
          </View>
        )}
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e6 }} numberOfLines={2}>
          {pr.title}
        </Text>
        {/* Variante que el cliente ya había elegido en la ficha: así el comerciante sabe qué le
            preguntan sin que nadie tenga que describir el producto (guía del dueño, regla 3). */}
        {pr.variantLabel ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }} numberOfLines={1}>
            {pr.variantLabel}
          </Text>
        ) : null}
        {/* Aviso de consulta: alguien pregunta por ESTE producto. */}
        {pr.asking ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginTop: espaciado.e3 }}>
            Consultando sobre este producto
          </Text>
        ) : null}
        {pr.priceXaf !== null && pr.priceXaf !== undefined ? (
          <Precio valor={pr.priceXaf} tamano="md" color={colors.text.primary} style={{ marginTop: espaciado.e2 }} />
        ) : (
          <Text style={{ color: colors.textSecondary, fontWeight: peso.fuerte, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>Precio a consultar</Text>
        )}
        {pr.available === false ? (
          <Text style={{ color: colors.text.danger, fontWeight: peso.maximo, fontSize: tipografia.micro, marginTop: espaciado.e4 }}>
            Ya no está a la venta
          </Text>
        ) : (
          <Pressable
            onPress={() => onOpenProduct?.(pr.id)}
            accessibilityLabel={`Ver y comprar ${pr.title}`}
            style={{ marginTop: espaciado.e8, backgroundColor: colors.primary, borderRadius: radios.full, paddingVertical: espaciado.e7, alignItems: 'center' }}
          >
            <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.caption }}>Comprar</Text>
          </Pressable>
        )}
      </View>,
    );
  }

  /**
   * MERCADO (tanda E) — LA TARJETA DEL PEDIDO en el chat.
   *
   * El pedido deja de ser un aviso suelto y pasa a ser un objeto: foto, artículo, variante, total y
   * el ESTADO VIVO (lo resuelve el servidor al leer el mensaje, no se queda congelado el día de la
   * compra). En un grupo se lee como prueba social («✅ Fulano compró esto»).
   */
  if (msg.kind === 'order' && msg.orderRef) {
    return wrap(<OrderCardEnChat pedido={msg.orderRef} onOpen={onOpenOrder} />);
  }

  if ((msg.kind === 'post' || msg.kind === 'sale') && msg.postRef) {
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card, width: 210, flexDirection: 'column' }]}>
        {msg.postRef.coverUrl ? (
          <ExpoImage source={absUrl(msg.postRef.coverUrl)} style={styles.postCover} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : null}
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6 }} numberOfLines={2}>
          {msg.kind === 'sale' ? '🏷️ ' : ''}{msg.postRef.title}
        </Text>
        {msg.postRef.priceXaf !== undefined ? (
          <Precio valor={msg.postRef.priceXaf} tamano="sm" color={colors.text.primary} style={{ marginTop: espaciado.e2 }} />
        ) : null}
      </View>,
    );
  }

  /**
   * Parte 24 (G2): VOTACIÓN con datos reales — cada opción se puede tocar, se
   * pinta el porcentaje y una marca en la mía (el servidor permite UN voto por
   * persona: volver a tocar cambia el voto, no lo suma).
   */
  if (msg.kind === 'vote' && msg.voteRef) {
    const vr = msg.voteRef;
    const counts = (vr.counts ?? []) as number[];
    const total = Number(vr.total ?? counts.reduce((a, b) => a + Number(b || 0), 0)) || 0;
    const mine = vr.myVote;
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card, flexDirection: 'column', alignItems: 'stretch', width: 240 }]}>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>🗳️ {vr.question}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
          {total === 0 ? 'Sé el primero en votar' : `${total} ${total === 1 ? 'voto' : 'votos'}`}
          {mine !== null && mine !== undefined ? ' · ya votaste' : ''}
        </Text>
        {(vr.options ?? []).map((o, i) => {
          const n = Number(counts[i] ?? 0) || 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          const myPick = mine === i;
          return (
            <Pressable
              key={`${o}-${i}`}
              onPress={() => onVote?.(i)}
              accessibilityLabel={`Votar ${o}${n ? `, ${n} votos` : ''}${myPick ? ', tu voto' : ''}`}
              style={[styles.voteOpt, {
                backgroundColor: colors.surface,
                borderColor: myPick ? colors.primary : 'transparent',
              }]}
            >
              {pct > 0 ? (
                <View pointerEvents="none" style={[styles.voteBar, { width: `${pct}%`, backgroundColor: alpha(colors.primary, 0.16) }]} />
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: myPick ? peso.titulo : peso.medio, flex: 1 }} numberOfLines={2}>
                  {o}
                </Text>
                {n > 0 ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>{n} · {pct}%</Text>
                ) : null}
                {myPick ? <Text style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>✓</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>,
    );
  }

  /**
   * Parte 25 (G2-b): CADENA — lista a la que uno se apunta, con tope opcional
   * de plazas y la lista de los que van (Xiaohongshu muestra los avatares).
   */
  if (msg.kind === 'chain' && msg.chainRef) {
    const cr = msg.chainRef;
    const llena = !!cr.slots && cr.joined >= cr.slots && !cr.joinedByMe;
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card, flexDirection: 'column', alignItems: 'stretch', width: 240 }]}>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>🔗 {cr.title}</Text>
        {cr.note ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }} numberOfLines={3}>{cr.note}</Text>
        ) : null}
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e4 }}>
          {cr.joined} apuntado{cr.joined === 1 ? '' : 's'}{cr.slots ? ` de ${cr.slots}` : ''}
        </Text>
        {(cr.members ?? []).length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: espaciado.e4, marginTop: espaciado.e6 }}>
            {(cr.members ?? []).slice(0, 6).map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, backgroundColor: colors.surface, borderRadius: radios.full, paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e2 }}>
                {p.avatarUrl ? (
                  <Image source={{ uri: absUrl(p.avatarUrl) }} style={{ width: 16, height: 16, borderRadius: radios.sm }} />
                ) : (
                  <View style={{ width: 16, height: 16, borderRadius: radios.sm, backgroundColor: alpha(colors.primary, 0.18) }} />
                )}
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.micro, fontWeight: peso.fuerte }} numberOfLines={1}>
                  {p.name.split(' ')[0]}
                </Text>
              </View>
            ))}
            {(cr.members ?? []).length > 6 ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>+{(cr.members ?? []).length - 6}</Text>
            ) : null}
          </View>
        ) : null}
        <Pressable
          onPress={() => onJoin?.(!cr.joinedByMe)}
          disabled={llena}
          accessibilityLabel={cr.joinedByMe ? 'Darme de baja de la cadena' : llena ? 'Cadena completa' : 'Apuntarme a la cadena'}
          style={({ pressed }) => [styles.joinBtn, {
            backgroundColor: cr.joinedByMe ? alpha(colors.primary, 0.12) : (llena ? colors.surface : colors.primary),
            opacity: pressed ? 0.85 : 1,
          }]}
        >
          <Text style={{ color: cr.joinedByMe ? colors.text.primary : (llena ? colors.textSecondary : brand.white), fontWeight: peso.titulo, fontSize: tipografia.body }}>
            {cr.joinedByMe ? '✓ Apuntado · darme de baja' : llena ? 'Cadena completa' : 'Apuntarme'}
          </Text>
        </Pressable>
      </View>,
    );
  }

  /**
   * Parte 25 (G2-b): QUEDADA — sitio + hora + «Voy». El sitio abre el mapa y
   * (desde el ajuste del dueño) lleva el botón de pedir taxi hasta allí.
   */
  if (msg.kind === 'checkin' && msg.checkinRef) {
    const kr = msg.checkinRef;
    const lat = Number(msg.locationRef?.lat);
    const lng = Number(msg.locationRef?.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    return wrap(
      // El botón de taxi va FUERA del Pressable del mapa: un Pressable dentro de
      // otro se traga el toque en Android (probado en el móvil).
      <View style={[styles.cardBubble, { backgroundColor: colors.card, flexDirection: 'column', alignItems: 'stretch', width: 235 }]}>
        <Pressable onPress={onOpenLocation} accessibilityLabel={`Ver ${msg.locationRef?.label ?? 'la quedada'} en el mapa`}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>📅 Quedada</Text>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginTop: espaciado.e2 }} numberOfLines={2}>
            📍 {msg.locationRef?.label ?? 'Sitio'}
          </Text>
          <Text style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e2 }}>
            🕒 {kr.when || new Date(kr.at ?? Date.now()).toLocaleString('es-GQ', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e4 }}>
            {kr.going} {kr.going === 1 ? 'persona va' : 'personas van'}
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
          <Pressable
            onPress={() => onJoin?.(!kr.goingByMe)}
            accessibilityLabel={kr.goingByMe ? 'Ya no voy a la quedada' : 'Voy a la quedada'}
            style={({ pressed }) => [styles.joinBtn, {
              flex: 1,
              backgroundColor: kr.goingByMe ? alpha(colors.primary, 0.12) : colors.primary,
              opacity: pressed ? 0.85 : 1,
            }]}
          >
            <Text style={{ color: kr.goingByMe ? colors.text.primary : brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>
              {kr.goingByMe ? '✓ Voy · no iré' : 'Voy'}
            </Text>
          </Pressable>
          {hasCoords ? (
            <Pressable
              onPress={onTaxi}
              accessibilityLabel="Pedir taxi hasta la quedada"
              style={({ pressed }) => [styles.joinBtn, {
                paddingHorizontal: espaciado.e12, backgroundColor: alpha(colors.primary, 0.12),
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <Text style={{ color: colors.text.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>🚕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>,
    );
  }

  /**
   * Parte 24 (G2): UBICACIÓN compartida — la burbuja lleva el nombre del sitio
   * y, al tocarla, se abre el mapa con el pin en esas coordenadas. Desde la
   * Parte 25 lleva también el atajo de pedir un taxi hasta ese punto (fuera del
   * Pressable del mapa para que el toque no se lo coma el contenedor).
   */
  if (msg.kind === 'location' && msg.locationRef) {
    const lat = Number(msg.locationRef.lat);
    const lng = Number(msg.locationRef.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card, flexDirection: 'column', alignItems: 'stretch', width: 210 }]}>
        <Pressable onPress={onOpenLocation} accessibilityLabel={`Ver ${msg.locationRef.label} en el mapa`}>
          <View style={[styles.locPreview, { backgroundColor: alpha(colors.primary, 0.08) }]}>
            <MapPin size={22} color={colors.text.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e4, fontWeight: peso.fuerte }}>
              {hasCoords ? 'Toca para ver el mapa' : 'Sin coordenadas'}
            </Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e6 }} numberOfLines={2}>
            📍 {msg.locationRef.label}
          </Text>
          {hasCoords ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          ) : null}
        </Pressable>
        {hasCoords ? (
          <Pressable
            onPress={onTaxi}
            accessibilityLabel="Pedir taxi hasta aquí"
            style={({ pressed }) => [styles.joinBtn, {
              backgroundColor: alpha(colors.primary, 0.12), opacity: pressed ? 0.85 : 1,
            }]}
          >
            <Text style={{ color: colors.text.primary, fontWeight: peso.titulo, fontSize: tipografia.caption }}>🚕  Pedir taxi hasta aquí</Text>
          </Pressable>
        ) : null}
      </View>,
    );
  }

  /**
   * Parte 26 (G2-c): ANUNCIO de grupo — tarjeta con 📣, título, texto, precio,
   * foto y el enlace al servicio (que abre su pantalla).
   */
  if (msg.kind === 'ad' && msg.adRef) {
    const ar = msg.adRef;
    const route = ar.link?.route ?? null;
    return wrap(
      <View style={[styles.cardBubble, { backgroundColor: colors.card, flexDirection: 'column', alignItems: 'stretch', width: 235 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
          <Text style={{ fontSize: tipografia.body }}>📣</Text>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body, flex: 1 }} numberOfLines={2}>
            {ar.title ?? 'Anuncio'}
          </Text>
        </View>
        {ar.imageUrl ? (
          <Image source={{ uri: absUrl(ar.imageUrl) }} style={{ width: '100%', height: 120, borderRadius: radios.chip, marginTop: espaciado.e8 }} />
        ) : null}
        {ar.text ? (
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginTop: espaciado.e6, lineHeight: 17 }} numberOfLines={5}>{ar.text}</Text>
        ) : null}
        {ar.priceXaf ? (
          <Precio valor={ar.priceXaf} tamano="md" color={colors.text.secondary} style={{ marginTop: espaciado.e6 }} />
        ) : null}
        {route ? (
          <Pressable
            onPress={onOpenLink}
            accessibilityLabel="Abrir el servicio del anuncio"
            style={({ pressed }) => [styles.joinBtn, { backgroundColor: alpha(colors.primary, 0.12), opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: colors.text.primary, fontWeight: peso.titulo, fontSize: tipografia.caption }}>
              {ar.link?.type === 'lifebook' ? 'Ver el perfil ›' : 'Ver el servicio ›'}
            </Text>
          </Pressable>
        ) : null}
      </View>,
    );
  }

  // Avisos del sistema: van centrados, sin avatar (no los escribe una persona).
  if (msg.kind === 'topic' || msg.kind === 'system') {
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.pillBubble, { backgroundColor: alpha(colors.primary, 0.12) }]}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, textAlign: 'center' }}>{msg.text}</Text>
        </View>
      </View>
    );
  }

  return wrap(
    <View
      style={[
        styles.bubble,
        mine
          ? { backgroundColor: colors.primary, borderBottomRightRadius: radios.punta }
          : { backgroundColor: colors.surface, borderBottomLeftRadius: radios.punta },
      ]}
    >
      <Text style={{ color: mine ? brand.white : colors.textPrimary, fontSize: tipografia.body, lineHeight: 19 }}>{msg.text}</Text>
    </View>,
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e8,
    paddingHorizontal: espaciado.e12, paddingTop: espaciado.e8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e8, paddingBottom: espaciado.e8, fontSize: tipografia.body, maxHeight: 100 },
  iconBtn: { width: 34, height: 34, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: radios.lg, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8 },
  bgAccent: { position: 'absolute', right: -60, top: -40, width: 200, height: 200, borderRadius: radios.full, opacity: 0.22 },
  headAvatar: { width: 34, height: 34, borderRadius: radios.full },
  msgAvatar: { width: 26, height: 26, borderRadius: radios.full },
  imgBubble: { width: 200, height: 200, borderRadius: radios.campo, backgroundColor: 'rgba(128,128,128,0.15)' },
  cardBubble: { borderRadius: radios.campo, padding: espaciado.e10, flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  postCover: { width: '100%', height: 120, borderRadius: radios.sm },
  voteOpt: { borderRadius: radios.sm, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e7, marginTop: espaciado.e6, borderWidth: trazo.fino, overflow: 'hidden' },
  voteBar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  locPreview: { height: 84, borderRadius: radios.chip, alignItems: 'center', justifyContent: 'center' },
  /** Parte 25: botón de apuntarse / pedir taxi dentro de las burbujas. */
  joinBtn: { marginTop: espaciado.e8, borderRadius: radios.chip, paddingVertical: espaciado.e9, alignItems: 'center', justifyContent: 'center' },
  taxiCta: { borderRadius: radios.campo, paddingVertical: espaciado.e14, alignItems: 'center', justifyContent: 'center' },
  /** Parte 28 (G4): barra de ubicación en vivo. */
  liveBar: {
    marginHorizontal: espaciado.e12, marginTop: espaciado.e8, padding: espaciado.e10, borderRadius: radios.campo,
    borderWidth: trazo.fino, gap: espaciado.e6,
  },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
    borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, maxWidth: 240,
  },
  liveStop: { alignSelf: 'flex-start', borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, marginTop: espaciado.e2 },
  rowGap8: { flexDirection: 'row', gap: espaciado.e8 },
  pillBubble: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, maxWidth: '85%' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e10 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth },
  postThumb: { width: 46, height: 46, borderRadius: radios.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderRadius: radios.md, paddingVertical: espaciado.e13, paddingHorizontal: espaciado.e12 },
});
