/**
 * app/lifebook-ai.tsx — EL ASISTENTE DE IA (tanda M).
 *
 * DÓNDE VIVE Y POR QUÉ. El dueño quería el agente «en el hueco reservado de la barra de Life Book»
 * (el que dejó libre el avatar del dueño cuando se mudó a Mensajes). Desde ahí se abre este chat.
 *
 * QUÉ HACE: recomienda cosas REALES del catálogo (las tarjetas que enseña son productos y tiendas de
 * verdad, con su precio de verdad: se pueden abrir) y explica cómo se usa la app. Lo que no sabe lo
 * dice — si una búsqueda no devuelve nada, contesta que no hay nada.
 *
 * LO QUE NO HACE, A PROPÓSITO: no inventa precios, existencias ni plazos; no pide datos personales;
 * no compra nada por su cuenta. Y no hay que explicarlo en la pantalla: se ve en las respuestas.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, peso, Precio, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { Check, CheckSquare, Clock, Copy, Heart, Mic, MoreHorizontal, Plus, Send, Sparkles, Store, ThumbsUp, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { pickImageFromCamera, pickImageFromLibrary, uriToBase64 } from '../core/pickImage';
import { absUrl } from '../api/config';
import { commerceApi, type LbProductCard } from '../api/commerce';
import { aiApi, type LbAiMensaje, type LbAiResumen, type LbAiTarjeta } from '../api/lifebookAi';
import { lbXaf } from '../constants/lifebook';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

export default function LifebookAiScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

/** Lo que se puede preguntar de entrada (solo cuando la conversación está vacía). */
const SUGERENCIAS = [
  '¿Qué zapatillas hay?',
  'Busca un móvil barato',
  '¿Cómo publico algo para vender?',
  '¿Cómo funciona el aviso de stock?',
];

/**
 * Qué se le dice a la persona cuando el dictado falla. En castellano llano: el código del error del
 * reconocedor no le sirve de nada a quien está hablando con el asistente.
 */
function mensajeDeDictado(codigo: string): string {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Sin permiso del micrófono: puedes escribir tu pregunta.';
    case 'no-speech':
    case 'speech-timeout':
      return 'No te he oído. Prueba otra vez.';
    case 'network':
      return 'El dictado necesita conexión y ahora mismo no la hay.';
    case 'language-not-supported':
      return 'Este móvil no sabe dictar en español: puedes escribir tu pregunta.';
    case 'busy':
      return 'El micrófono está ocupado: espera un segundo y vuelve a probar.';
    default:
      return 'No se pudo dictar. Puedes escribir tu pregunta.';
  }
}

function Contenido() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listaRef = useRef<FlatList<LbAiMensaje>>(null);

  const [mensajes, setMensajes] = useState<LbAiMensaje[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [noConfigurado, setNoConfigurado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quedan, setQuedan] = useState<number | null>(null);
  /** Tanda N: el historial (mis conversaciones) se ve en la misma pantalla, sin otra ruta. */
  const [modo, setModo] = useState<'chat' | 'historial' | 'consejo' | 'editar'>('chat');
  /** Tanda N: el mensaje que se está editando (solo se pueden editar los míos). */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<LbAiResumen[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);
  /** Tanda N: modo selección para compartir varios mensajes a la vez. */
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const enSeleccion = seleccion.length > 0;
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [estado, conv] = await Promise.all([
        aiApi.estado().catch(() => null),
        aiApi.conversacion().catch(() => ({ conversation: null, messages: [] })),
      ]);
      setNoConfigurado(estado ? !estado.configured : false);
      setQuedan(estado?.leftToday ?? null);
      setConvId(conv.conversation?.id ?? null);
      setMensajes(conv.messages ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const enviar = useCallback(async (que?: string, extra?: { imageUrl?: string | null; productId?: string | null }) => {
    const pregunta = (que ?? texto).trim();
    if ((!pregunta && !extra?.imageUrl && !extra?.productId) || enviando) return;
    setEnviando(true);
    setError(null);
    setTexto('');
    // La pregunta se pinta ya, sin esperar al servidor: así el chat no parece congelado.
    const provisional: LbAiMensaje = {
      id: `local-${Date.now()}`, role: 'user', text: pregunta, cards: [], createdAt: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, provisional]);
    try {
      const r = await aiApi.preguntar(pregunta, convId, extra);
      setConvId(r.conversationId);
      setQuedan(r.leftToday);
      /**
       * Se RECARGA la conversación en vez de pintar la respuesta a mano: así los mensajes llevan su
       * id de verdad, que es lo que hace falta para «me gusta» y para copiar con garantías.
       */
      const conv = await aiApi.conversacion(r.conversationId).catch(() => null);
      if (conv?.messages?.length) setMensajes(conv.messages);
      else {
        setMensajes((prev) => [...prev, {
          id: `r-${Date.now()}`, role: 'assistant', text: r.reply.text, cards: r.reply.cards ?? [], createdAt: new Date().toISOString(),
        }]);
      }
      setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No se pudo preguntar';
      setError(m);
      if (/configurad|clave/i.test(m)) setNoConfigurado(true);
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, convId]);

  /* ── DICTAR: la voz se convierte en texto EN EL MÓVIL ────────────────────────────────────────
   *
   * POR QUÉ ASÍ: la API de DeepSeek no acepta audio, así que se dicta con el reconocimiento de voz
   * de Android (en español) y Cucucul recibe TEXTO, igual que si se hubiera escrito. El texto cae en
   * el campo de escribir y se envía con el botón de siempre: no se envía solo, porque mandar media
   * frase a medio dictar es justo lo que no quiere nadie.
   *
   * EN ESTA VÍA NO SE GUARDA EL AUDIO: no hay burbuja de audio, sólo texto.
   *
   * SI NO SE PUEDE (permiso denegado, móvil sin reconocedor, sin red), se dice y se sigue pudiendo
   * escribir: nunca un botón muerto.
   */
  const [escuchando, setEscuchando] = useState(false);
  /** Lo que ya estaba escrito antes de empezar: el dictado se AÑADE a eso, no lo borra. */
  const baseDictado = useRef('');

  useSpeechRecognitionEvent('result', (e) => {
    const trozo = (e.results?.[0]?.transcript ?? '').trim();
    if (!trozo) return;
    const unido = baseDictado.current ? `${baseDictado.current} ${trozo}` : trozo;
    setTexto(unido);
    // Un resultado final ya no se reemplaza: pasa a ser la base del trozo siguiente del dictado.
    if (e.isFinal) baseDictado.current = unido;
  });

  useSpeechRecognitionEvent('error', (e) => {
    setEscuchando(false);
    // Parar a propósito no es un fallo: no se le enseña nada a la persona.
    if (e.error === 'aborted') return;
    setError(mensajeDeDictado(e.error));
  });

  useSpeechRecognitionEvent('end', () => setEscuchando(false));

  /** Al salir de la pantalla se apaga el micrófono: si no, seguiría escuchando por detrás. */
  useEffect(() => () => {
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* no estaba escuchando: nada que hacer */ }
  }, []);

  const dictar = useCallback(async () => {
    if (escuchando) { ExpoSpeechRecognitionModule.stop(); return; }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('Este móvil no sabe dictar: puedes escribir tu pregunta.');
        return;
      }
      const permiso = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      const concedido = permiso.granted
        || (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
      if (!concedido) {
        Alert.alert(
          'Micrófono',
          'Para dictar hace falta el micrófono. Puedes escribir tu pregunta igual.',
          [
            { text: 'Escribir', style: 'cancel' },
            { text: 'Ajustes', onPress: () => { void Linking.openSettings(); } },
          ],
        );
        return;
      }
      setError(null);
      baseDictado.current = texto.trim();
      ExpoSpeechRecognitionModule.start({
        lang: 'es-ES',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
      });
      setEscuchando(true);
    } catch {
      setEscuchando(false);
      setError('No se pudo empezar a dictar. Puedes escribir tu pregunta.');
    }
  }, [escuchando, texto]);

  const nueva = useCallback(async () => {
    try {
      const c = await aiApi.nueva();
      setConvId(c.conversation?.id ?? null);
      setMensajes([]);
      setError(null);
      setModo('chat');
    } catch { /* si falla, se sigue en la conversación actual */ }
  }, []);

  /** Tanda N: copiar una respuesta (al portapapeles, con un aviso breve). */
  const copiar = async (m: LbAiMensaje) => {
    try {
      await Clipboard.setStringAsync(m.text);
      setCopiado(m.id);
      setTimeout(() => setCopiado((c) => (c === m.id ? null : c)), 1600);
    } catch { setError('No se pudo copiar'); }
  };

  /** Tanda N: «me gusta» a una respuesta del asistente (señal privada). */
  const gustar = async (m: LbAiMensaje) => {
    const antes = !!m.liked;
    setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, liked: !antes } : x)));
    try {
      const r = await aiApi.meGusta(m.id, !antes);
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, liked: r.liked } : x)));
    } catch {
      // Si no se pudo guardar, se quita la marca: no se enseña un «me gusta» que no existe.
      setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, liked: antes } : x)));
      setError('No se pudo guardar tu me gusta');
    }
  };

  /**
   * Tanda N: mandar un consejo para mejorar a Cucucul.
   *
   * OJO: aquí NO se usa `Alert.prompt`, porque **no existe en Android** (es solo de iOS) y el botón
   * habría quedado muerto en el móvil de verdad. En su lugar se cambia la barra de escribir por una
   * de consejo: el texto se escribe igual, pero se envía como consejo.
   */
  const enviarConsejo = async (texto: string) => {
    const limpio = texto.trim();
    if (limpio.length < 3) return;
    try {
      await aiApi.consejo(limpio, 'mejora');
      setModo('chat');
      setTexto('');
      setAviso('Gracias: tu consejo queda apuntado.');
      setTimeout(() => setAviso(null), 2500);
    } catch {
      setAviso('No se pudo enviar tu consejo.');
      setTimeout(() => setAviso(null), 2500);
    }
  };

  /** Tanda N: abrir el historial y volver a una conversación. */
  const abrirHistorial = useCallback(async () => {
    setModo('historial');
    try {
      const r = await aiApi.conversaciones();
      setHistorico(r.conversations ?? []);
    } catch { setHistorico([]); }
  }, []);

  const abrirConversacion = useCallback(async (id: string) => {
    try {
      const c = await aiApi.conversacion(id);
      setConvId(id);
      setMensajes(c.messages ?? []);
      setModo('chat');
    } catch { setError('No se pudo abrir esa conversación'); }
  }, []);

  /**
   * Tanda N: acciones sobre MIS mensajes (mantener pulsado).
   *
   * `Alert.alert` con botones SÍ funciona en Android (lo que no existe es `Alert.prompt`), así que el
   * menú es una alerta normal: Editar, Eliminar o Cancelar.
   */
  const menuMensaje = (m: LbAiMensaje) => {
    if (m.role !== 'user') return;
    Alert.alert('Tu mensaje', m.text.slice(0, 90), [
      {
        text: 'Editar',
        onPress: () => { setEditandoId(m.id); setTexto(m.text); setModo('editar'); },
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const antes = mensajes;
          setMensajes((prev) => prev.filter((x) => x.id !== m.id));
          try { await aiApi.borrarMensaje(m.id); }
          catch { setMensajes(antes); setError('No se pudo eliminar el mensaje'); }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  /** Guardar la edición de un mensaje mío. */
  const guardarEdicion = async (nuevo: string) => {
    const limpio = nuevo.trim();
    if (!limpio || !editandoId) { setModo('chat'); setEditandoId(null); setTexto(''); return; }
    const antes = mensajes;
    setMensajes((prev) => prev.map((x) => (x.id === editandoId ? { ...x, text: limpio } : x)));
    setModo('chat');
    setTexto('');
    try { await aiApi.editarMensaje(editandoId, limpio); }
    catch { setMensajes(antes); setError('No se pudo editar el mensaje'); }
    finally { setEditandoId(null); }
  };

  /** Tanda N: adjuntar (foto o un producto guardado). */
  const [guardados, setGuardados] = useState<LbProductCard[]>([]);
  const [eligiendo, setEligiendo] = useState(false);

  const mandarFoto = async (deCamara: boolean) => {
    try {
      const img = deCamara ? await pickImageFromCamera() : await pickImageFromLibrary();
      if (!img?.uri) return;
      const b64 = await uriToBase64(img.uri);
      if (!b64) { setError('No se pudo leer la foto'); return; }
      await enviar('Mira esta foto', { imageUrl: `data:image/jpeg;base64,${b64}` });
    } catch {
      setError('No se pudo usar la foto');
    }
  };

  const abrirAdjuntar = () => {
    Alert.alert('Adjuntar', undefined, [
      { text: 'Hacer foto', onPress: () => { void mandarFoto(true); } },
      { text: 'Elegir de la galería', onPress: () => { void mandarFoto(false); } },
      {
        text: 'Un producto que me gusta',
        onPress: async () => {
          try {
            const r = await commerceApi.mySaved();
            const lista = r.items ?? [];
            if (!lista.length) { setError('Todavía no has guardado ningún producto.'); return; }
            setGuardados(lista);
            setEligiendo(true);
          } catch { setError('No se pudieron cargar tus productos guardados'); }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  /** Tanda N: marcar o desmarcar un mensaje para compartir varios a la vez. */
  const alternar = (id: string) => setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** Compartir lo seleccionado con la hoja del sistema (como texto legible). */
  const compartir = async () => {
    const textos = mensajes
      .filter((m) => seleccion.includes(m.id))
      .map((m) => `${m.role === 'user' ? 'Yo' : 'Cucucul'}: ${m.text}${m.cards?.length ? `\n(adjunto: ${m.cards.map((x) => x.titulo).join(', ')})` : ''}`);
    if (!textos.length) { setSeleccion([]); return; }
    try {
      await Share.share({ message: textos.join('\n\n') });
    } catch { setError('No se pudo compartir'); }
    setSeleccion([]);
  };
  const abrir = (t: LbAiTarjeta) => {
    if (t.tipo === 'producto') { irSeguro.libre('/lifebook-product/[id]', { id: t.id }); return; }
    irSeguro.libre('/lifebook-shop/[id]', { id: t.id });
  };

  const Burbuja = ({ m }: { m: LbAiMensaje }) => {
    const mio = m.role === 'user';
    return (
      <View style={{ alignItems: mio ? 'flex-end' : 'flex-start', marginBottom: espaciado.e10 }}>
        <Pressable
          onPress={() => { if (enSeleccion) alternar(m.id); }}
          onLongPress={() => menuMensaje(m)}
          delayLongPress={300}
          accessibilityLabel={mio ? 'Tu mensaje: mantén pulsado para editar o eliminar' : 'Respuesta de Cucucul'}
          style={[
          styles.burbuja,
          mio
            ? { backgroundColor: colors.primary, borderBottomRightRadius: radios.marca }
            : { backgroundColor: colors.surface, borderBottomLeftRadius: radios.marca, borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(colors.border, 0.8) },
        ]}>
          <Text style={{ color: mio ? brand.white : colors.textPrimary, fontSize: tipografia.body, lineHeight: 19 }}>{m.text}</Text>
        </Pressable>
        {m.cards?.length ? (          <View style={{ marginTop: espaciado.e8, gap: espaciado.e8, alignSelf: 'stretch' }}>
            {m.cards.map((t) => (
              <Pressable
                key={`${t.tipo}:${t.id}`}
                onPress={() => abrir(t)}
                accessibilityLabel={`Abrir ${t.titulo}`}
                style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: alpha(colors.border, 0.8) }]}
              >
                {t.fotoUrl ? (
                  <Image source={absUrl(t.fotoUrl)} style={t.tipo === 'foto' ? styles.fotoGrande : styles.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                ) : (
                  <View style={[styles.foto, { backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }]}>
                    <Store size={18} color={colors.text.primary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{t.titulo}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    {[t.subtitulo, t.ciudad].filter(Boolean).join(' · ')}
                  </Text>
                  {t.precioXaf !== null && t.precioXaf !== undefined ? (
                    <Precio valor={t.precioXaf} tamano="md" color={colors.text.primary} style={{ marginTop: espaciado.e3 }} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Tanda N — lo que se puede hacer con una RESPUESTA: copiarla y darle me gusta. */}
        {!mio ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e14, marginTop: espaciado.e6, marginLeft: espaciado.e4 }}>
            <Pressable onPress={() => { void copiar(m); }} accessibilityLabel="Copiar la respuesta" hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
              {copiado === m.id
                ? <><Check size={14} color={colors.text.success} /><Text style={{ color: colors.text.success, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Copiado</Text></>
                : <><Copy size={14} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Copiar</Text></>}
            </Pressable>
            <Pressable onPress={() => { void gustar(m); }} accessibilityLabel={m.liked ? 'Quitar me gusta' : 'Me gusta'}
              accessibilityState={{ selected: !!m.liked }} hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
              <Heart size={14} color={m.liked ? brand.like : colors.textSecondary} fill={m.liked ? brand.like : 'none'} />
              <Text style={{ color: m.liked ? brand.like : colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                {m.liked ? 'Te gustó' : 'Me gusta'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Cabecera ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <X size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7, flex: 1, marginLeft: espaciado.e10 }}>
          <Sparkles size={17} color={colors.text.primary} />
          <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Cucucul</Text>
        </View>
        {quedan !== null ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginRight: espaciado.e12 }}>{quedan} hoy</Text>
        ) : null}
        {/* Historial y consejos: dos accesos pequeños, sin ruido. */}
        {/* Tanda N: un solo menú para lo secundario (consejos y selección). Antes eran dos iconos más
            y la cabecera se quedaba sin sitio: «Nueva conversación» quedaba apretado contra el borde. */}
        <Pressable
          onPress={() => Alert.alert('Más', undefined, [
            { text: 'Dar un consejo', onPress: () => setModo(modo === 'consejo' ? 'chat' : 'consejo') },
            {
              text: 'Seleccionar mensajes',
              onPress: () => { if (enSeleccion) setSeleccion([]); else setSeleccion([mensajes[mensajes.length - 1]?.id ?? '']); },
            },
            { text: 'Cancelar', style: 'cancel' },
          ])}
          hitSlop={10}
          accessibilityLabel="Más opciones"
          style={{ marginRight: espaciado.e12 }}
        >
          <MoreHorizontal size={20} color={modo === 'consejo' ? colors.text.primary : colors.textPrimary} />
        </Pressable>        <Pressable onPress={() => { void abrirHistorial(); }} hitSlop={10} accessibilityLabel="Historial de conversaciones" style={{ marginRight: espaciado.e14 }}>
          <Clock size={19} color={colors.textPrimary} />
        </Pressable>

        {/* ABRIR OTRA LÍNEA DE CONVERSACIÓN (lo pidió el dueño): con etiqueta, no un icono suelto.
            La conversación anterior NO se pierde: queda en el historial (🕐). */}
        <Pressable
          onPress={() => { void nueva(); }}
          hitSlop={10}
          accessibilityLabel="Abrir otra conversación"
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderWidth: trazo.fino, borderColor: colors.primary, borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5 }}
        >
          <Plus size={15} color={colors.text.primary} />
          <Text style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Nueva</Text>
        </Pressable>
      </View>

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.text.primary} /></View>
      ) : modo === 'historial' ? (
        /* ── Tanda N: EL HISTORIAL (mis conversaciones, la última primero) ── */
        <FlatList
          data={historico}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: espaciado.e14, flexGrow: 1 }}
          ListEmptyComponent={<Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', marginTop: espaciado.e30 }}>Todavía no hay conversaciones.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { void abrirConversacion(item.id); }}
              accessibilityLabel={`Abrir ${item.title}`}
              style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: alpha(colors.border, 0.8), marginBottom: espaciado.e8 }]}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{item.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
                  {item.messages} mensaje{item.messages === 1 ? '' : 's'} · {String(item.updatedAt).slice(0, 10)}
                </Text>
              </View>
              <Pressable
                onPress={async () => {
                  try { await aiApi.borrarConversacion(item.id); setHistorico((h) => h.filter((x) => x.id !== item.id)); }
                  catch { setError('No se pudo borrar la conversación'); }
                }}
                hitSlop={10}
                accessibilityLabel={`Borrar ${item.title}`}
                style={{ padding: espaciado.e8 }}
              >
                <X size={16} color={colors.text.danger} />
              </Pressable>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          ref={listaRef}
          data={mensajes}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: espaciado.e20, flexGrow: 1 }}
          renderItem={({ item }) => <Burbuja m={item} />}
          ListEmptyComponent={(
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {noConfigurado ? (
                <View style={[styles.aviso, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.3) }]}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 19, fontWeight: peso.fuerte }}>
                    El asistente todavía no está encendido: falta la clave del servicio de IA en el servidor.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, textAlign: 'center' }}>
                    ¿Qué buscas?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, justifyContent: 'center', marginTop: espaciado.e14 }}>
                    {SUGERENCIAS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => { void enviar(s); }}
                        accessibilityLabel={s}
                        style={[styles.sugerencia, { borderColor: alpha(colors.primary, 0.5), backgroundColor: alpha(colors.primary, 0.06) }]}
                      >
                        <Text style={{ color: colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        />
      )}

      {error ? (
        <Text style={{ color: colors.text.danger, fontSize: tipografia.caption, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e6 }}>{error}</Text>
      ) : null}

      {/* Tanda N: barra de SELECCIÓN (solo cuando hay algo marcado). */}
      {enSeleccion ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo, flex: 1 }}>
            {seleccion.length} seleccionado{seleccion.length === 1 ? '' : 's'}
          </Text>
          <Pressable onPress={() => { void compartir(); }} accessibilityLabel="Compartir lo seleccionado"
            style={{ backgroundColor: colors.primary, borderRadius: radios.full, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e9 }}>
            <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>Compartir</Text>
          </Pressable>
          <Pressable onPress={() => setSeleccion([])} accessibilityLabel="Cancelar la selección">
            <Text style={{ color: colors.textSecondary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
        </View>
      ) : null}
      {/* ── Escribir (o el consejo: la misma barra, otro destino) ── */}
      {aviso ? (
        <Text style={{ color: colors.text.success, fontSize: tipografia.caption, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e4 }}>{aviso}</Text>
      ) : null}
      {modo === 'consejo' ? (
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e4 }}>
          Tu consejo para Cucucul
        </Text>
      ) : null}
      <View style={[styles.barra, { paddingBottom: insets.bottom + 8, borderTopColor: alpha(colors.border, 0.6), backgroundColor: colors.background }]}>
        {/* Tanda N: adjuntar foto o un producto que te gusta. */}
        <Pressable
          onPress={abrirAdjuntar}
          disabled={enviando}
          accessibilityLabel="Adjuntar una foto o un producto"
          style={[styles.adjuntar, { borderColor: alpha(colors.primary, 0.5), backgroundColor: alpha(colors.primary, 0.06) }]}
        >
          <Plus size={18} color={colors.text.primary} />
        </Pressable>
        <TextInput
          value={texto}
          onChangeText={(t) => {
            setTexto(t);
            // Si se escribe a mano mientras se dicta, el dictado sigue a partir de lo escrito.
            if (escuchando) baseDictado.current = t.trim();
          }}
          placeholder={escuchando ? 'Te escucho' : modo === 'consejo' ? 'Qué debería hacer mejor' : 'Escribe aquí'}
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        {/* DICTAR: un toque empieza, otro para. El texto se escribe solo en el campo de arriba. */}
        <Pressable
          onPress={() => { void dictar(); }}
          disabled={enviando}
          accessibilityLabel={escuchando ? 'Parar de dictar' : 'Dictar con la voz'}
          accessibilityState={{ selected: escuchando }}
          style={[styles.micro, escuchando
            ? { backgroundColor: colors.danger, borderColor: colors.danger }
            : { borderColor: alpha(colors.primary, 0.5), backgroundColor: alpha(colors.primary, 0.06) }]}
        >
          <Mic size={18} color={escuchando ? brand.white : colors.text.primary} />
        </Pressable>
        <Pressable
          onPress={() => {
            /**
             * Si se manda mientras se dicta, se CORTA el dictado en seco (`abort`, no `stop`): con
             * `stop` llegaría un resultado final un instante después y volvería a escribir en el
             * campo ya enviado. Con `abort` no hay resultado tardío, y lo que se manda es justo lo
             * que se está viendo escrito.
             */
            if (escuchando) { ExpoSpeechRecognitionModule.abort(); baseDictado.current = ''; }
            if (modo === 'consejo') { void enviarConsejo(texto); return; }
            if (modo === 'editar') { void guardarEdicion(texto); return; }
            void enviar();
          }}
          disabled={enviando || !texto.trim()}
          accessibilityLabel={modo === 'consejo' ? 'Enviar el consejo' : modo === 'editar' ? 'Guardar el cambio' : 'Enviar'}
          style={[styles.enviar, { backgroundColor: enviando || !texto.trim() ? alpha(colors.primary, 0.4) : colors.primary }]}
        >
          {enviando ? <ActivityIndicator size="small" color={brand.white} /> : <Send size={17} color={brand.white} />}
        </Pressable>
      </View>
      {/* Tanda N: elegir UN producto de los que te gustan y mandarlo como tarjeta embebida. */}
      <Modal visible={eligiendo} transparent animationType="slide" onRequestClose={() => setEligiendo(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setEligiendo(false)}>
          <Pressable style={{ backgroundColor: colors.background, borderTopLeftRadius: radios.panel, borderTopRightRadius: radios.panel, padding: espaciado.e16, paddingBottom: insets.bottom + 16 }} onPress={() => { /* dentro no cierra */ }}>
            <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.cuerpo, marginBottom: espaciado.e10 }}>Productos que te gustan</Text>
            <FlatList
              data={guardados}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setEligiendo(false); void enviar('Mira este producto', { productId: item.id }); }}
                  accessibilityLabel={`Enviar ${item.title}`}
                  style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: alpha(colors.border, 0.8), marginBottom: espaciado.e8 }]}
                >
                  {item.coverUrl ? (
                    <Image source={absUrl(item.coverUrl)} style={styles.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  ) : (
                    <View style={[styles.foto, { backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }]}>
                      <Store size={18} color={colors.text.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                    <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{item.title}</Text>
                    {item.priceXaf !== null && item.priceXaf !== undefined ? (
                      <Precio valor={item.priceXaf} tamano="md" color={colors.text.primary} style={{ marginTop: espaciado.e3 }} />
                    ) : null}
                  </View>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  burbuja: { maxWidth: '86%', borderRadius: radios.lg, paddingHorizontal: espaciado.e13, paddingVertical: espaciado.e10 },
  tarjeta: {
    flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radios.campo, padding: espaciado.e9,
  },
  foto: { width: 54, height: 54, borderRadius: radios.chip },
  aviso: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e14 },
  sugerencia: { borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e13, paddingVertical: espaciado.e9 },
  input: {
    flex: 1, maxHeight: 110, borderWidth: trazo.fino, borderRadius: radios.md,
    paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body,
  },
  barra: {
    flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  enviar: { width: 44, height: 44, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  /** El botón de adjuntar: al lado de la barra de escribir. */
  adjuntar: { width: 44, height: 44, borderRadius: radios.full, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center' },
  /** El micro (dictado): mismo tamaño que los otros dos botones de la barra. */
  micro: { width: 44, height: 44, borderRadius: radios.full, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center' },
  /** La foto que manda la persona: se ve grande, que es lo suyo. */
  fotoGrande: { width: 190, height: 190, borderRadius: radios.md },
});
