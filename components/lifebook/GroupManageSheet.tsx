/**
 * GroupManageSheet — GESTIÓN DEL GRUPO (Parte 22, alineada con Xiaohongshu).
 *
 * Se abre desde el menú ⋯ del chat («Miembros del grupo» / «Editar grupo»).
 * Secciones, como en Xiaohongshu:
 *   1. Cabecera: foto, nombre (editable por dueño/admin) y nº de miembros.
 *   2. ANUNCIO del grupo: lo ven todos; lo editan dueño y administradores.
 *   3. MIEMBROS: lista con rol (👑 dueño · 🛡️ admin), buscador, añadir, y por
 *      miembro: hacer/quitar administrador, ceder el grupo (solo el dueño) y
 *      expulsar (dueño y admins; al dueño no).
 *   4. AJUSTES (dueño/admin): quién puede invitar, quién puede hablar, compartir
 *      el historial con quien entra, mensaje de bienvenida y visibilidad.
 *   5. ZONA DE RIESGO: disolver el grupo (solo el dueño) o salir del grupo.
 *
 * Endpoints reales:
 *   GET/PATCH /lifebook/groups/:id · PATCH /groups/:id/settings
 *   POST /groups/:id/members · DELETE /groups/:id/members/:userId
 *   POST/DELETE /groups/:id/admins[/:userId] · POST /groups/:id/owner
 *   DELETE /groups/:id (disolver) · POST /groups/:id/leave (salir)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  Check, ChevronRight, Crown, LogOut, MoreHorizontal, Pencil, QrCode, Search, Shield, Trash2, UserPlus, X,
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { messagesApi, type LbGroup, type LbGroupMember } from '../../api/messages';
import { lifebookGroupsApi, lifebookInboxApi, type LbFollowerItem, type LbGroupJoinRequest, type LbSuggestedUser } from '../../api/lifebook';
import { gruposEnlacesApi, type LbCodigoDeGrupo } from '../../api/lifebookGrupos';
import { absUrl } from '../../api/config';
import { lbTimeAgo } from '../../constants/lifebook';
import { brand } from '@egrouteplan/ui-kit';
import { formaHoja } from './ui/Sheet';

/** Componentes que el dueño puede permitir en el grupo. */
const KINDS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'text', label: 'Texto', icon: '💬' },
  { id: 'image', label: 'Fotos', icon: '📷' },
  { id: 'post', label: 'Notas', icon: '📝' },
  { id: 'sale', label: 'Productos', icon: '🛍️' },
  { id: 'file', label: 'Archivos', icon: '📄' },
  /* TANDA D: la TARJETA de producto (imagen, nombre, precio y comprar). Va aparte de «Productos»
     (que son las ventas de una nota) porque el servidor las trata como tipos distintos: si el
     dueño no marca esta, el grupo rechaza las tarjetas de producto (comprobado: 403). */
  { id: 'product', label: 'Tarjetas de tienda', icon: '🏪' },
];

type Step = 'manage' | 'members' | 'add' | 'edit' | 'announcement' | 'welcome' | 'topic' | 'requests' | 'code';

export function GroupManageSheet({ visible, onClose, groupId, onLeft, initialStep = 'manage' }: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  /** Salí del grupo o lo disolví (cerrar el chat). */
  onLeft: () => void;
  /** `edit` o `members` abren directamente esa sección. */
  initialStep?: Step;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [group, setGroup] = useState<LbGroup | null>(null);
  const [step, setStep] = useState<Step>(initialStep);
  const [busy, setBusy] = useState<string | null>(null);
  const [people, setPeople] = useState<Array<{ id: string; name: string; avatarUrl?: string | null }> | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [welcome, setWelcome] = useState('');
  /** Parte 25 (G2-b): tema del grupo (se anuncia en el hilo al cambiarlo). */
  const [topic, setTopic] = useState('');
  /** Parte 27 (G3): solicitudes para entrar en el grupo. */
  const [requests, setRequests] = useState<LbGroupJoinRequest[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [deciding, setDeciding] = useState<string | null>(null);
  /** Parte 28 (G4): código de ruta (y su QR) para invitar sin buscador. */
  const [inviteCode, setInviteCode] = useState<LbCodigoDeGrupo | null>(null);
  /**
   * TOPE DE ENTRADAS del enlace: `null` = sin tope. Se elige aquí y, al aplicarlo, el
   * servidor crea un enlace NUEVO (el contador empieza de cero y el anterior deja de
   * funcionar): es lo que se avisa antes de hacerlo.
   */
  const [topeElegido, setTopeElegido] = useState<number | null>(null);
  const [aplicandoTope, setAplicandoTope] = useState(false);
  const [detailMember, setDetailMember] = useState<LbGroupMember | null>(null);

  const isOwner = group?.myRole === 'owner';
  const canManage = isOwner || group?.myRole === 'admin';

  /**
   * ARREGLO (bug de la hoja que parpadeaba):
   *
   * El `onClose` que llega del padre es una función **nueva en cada render suyo**
   * (`onClose={() => setMembersOpen(false)}` en el chat). `load` dependía de él, así que
   * cambiaba de identidad en cada render del padre; el efecto de más abajo (que depende de
   * `load`) se volvía a ejecutar y hacía `setGroup(null)` + volver a pedir el grupo: el
   * contenido se desmontaba y se montaba una y otra vez.
   *
   * Lo que se veía: la hoja PARPADEABA y **los toques no entraban** — solo respondía
   * «Cerrar», que está en la cabecera y no se remonta. Medido con `dumpsys gfxinfo`: con
   * esta hoja abierta y sin tocar nada, la app pintaba 25-53 fotogramas cada 6 s; con la
   * otra hoja (Ficha del grupo), 0. Con la referencia, `load` ya no cambia nunca por culpa
   * del padre.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const load = useCallback(async () => {
    try {
      const g = await messagesApi.group(groupId);
      setGroup(g);
      setTitle(g.title);
      setKinds(g.allowedKinds ?? ['text', 'image', 'post', 'sale', 'product', 'file']);
      setAnnouncement(g.announcement ?? '');
      setWelcome(g.welcomeMessage ?? '');
      setTopic(g.topic ?? '');
    } catch (e) {
      Alert.alert('Grupo', e instanceof Error ? e.message : 'No se pudo cargar el grupo.');
      onCloseRef.current();
    }
  }, [groupId]);

  useEffect(() => {
    if (!visible) return;
    setStep(initialStep); setPicked([]); setQuery(''); setDetailMember(null); setGroup(null);
    setRequests(null); setPendingCount(0);
    load();
  }, [visible, initialStep, load]);

  /**
   * Parte 27 (G3): solicitudes para entrar. Solo el dueño y los administradores
   * pueden leerlas (si no, el servidor responde 403 y se deja la lista vacía).
   */
  const loadRequests = useCallback(async () => {
    try {
      const res = await lifebookGroupsApi.requests(groupId);
      setRequests(res.requests ?? []);
      setPendingCount(Number(res.pending ?? 0));
    } catch {
      setRequests([]);
      setPendingCount(0);
    }
  }, [groupId]);

  useEffect(() => {
    if (!visible || !group) return;
    const role = group.myRole;
    if (role === 'owner' || role === 'admin') void loadRequests();
    else { setRequests([]); setPendingCount(0); }
  }, [visible, group, loadRequests]);

  const decidir = async (userId: string, action: 'approve' | 'reject') => {
    setDeciding(userId);
    try {
      const res = await lifebookGroupsApi.decide(groupId, userId, action);
      setRequests(res.requests ?? []);
      setPendingCount(Number(res.pending ?? 0));
      if (action === 'approve') await load();   // el grupo gana un miembro
    } catch (e) {
      Alert.alert('Solicitud', e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally { setDeciding(null); }
  };

  /**
   * Parte 28 (G4): código de ruta del grupo. Se pide al abrir la sección (solo el
   * dueño y los administradores pueden verlo) y sirve para invitar sin buscador.
   *
   * P3: además del código, el servidor dice **cuándo caduca** y **cuántas entradas
   * quedan** (si el enlace tiene tope). Se usa `gruposEnlacesApi` (módulo propio) porque
   * `api/lifebook.ts` no se toca: es el mismo endpoint, con los campos nuevos.
   */
  const abrirCodigo = async () => {
    setStep('code');
    if (inviteCode) return;
    try {
      const res = await gruposEnlacesApi.codigo(groupId);
      setInviteCode(res);
      setTopeElegido(res.maxUses);
    } catch (e) {
      Alert.alert('Código de ruta', e instanceof Error ? e.message : 'No se pudo leer el código.');
      setStep('manage');
    }
  };

  /**
   * Aplicar el tope elegido: crea un enlace NUEVO con ese tope y reinicia el contador.
   * Se pregunta antes porque **el enlace anterior deja de funcionar** — quien lo tuviera
   * guardado ya no podrá entrar con él.
   */
  const aplicarTope = () => {
    const queText = topeElegido === null
      ? 'sin tope de entradas (podrá entrar quien tenga el enlace, hasta que caduque)'
      : `con un máximo de ${topeElegido} entrada${topeElegido === 1 ? '' : 's'}`;
    const mismo = topeElegido === inviteCode?.maxUses;
    if (mismo) return;
    Alert.alert(
      'Crear enlace nuevo',
      `Se creará un enlace NUEVO ${queText} y el de ahora dejará de funcionar.\n\n¿Sigo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Crear',
          onPress: async () => {
            setAplicandoTope(true);
            try {
              const res = await gruposEnlacesApi.codigo(groupId, { maxUses: topeElegido, days: 7 });
              setInviteCode(res);
              setTopeElegido(res.maxUses);
              await Clipboard.setStringAsync(`Únete a mi grupo en EG Route Plan con el código ${res.code}`);
              Alert.alert('Enlace nuevo', 'El código anterior ya no sirve. El nuevo queda copiado.');
            } catch (e) {
              Alert.alert('Enlace del grupo', e instanceof Error ? e.message : 'No se pudo crear el enlace.');
            } finally { setAplicandoTope(false); }
          },
        },
      ],
    );
  };

  const copiarCodigo = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(`Únete a mi grupo en EG Route Plan con el código ${inviteCode.code}`);
    Alert.alert('Copiado', 'Manda el código a quien quieras invitar.');
  };

  /**
   * Parte 29 (G4): «Revisar ahora» — primero se pide al servidor QUIÉN sería
   * quitado (dryRun) y solo se ejecuta si el organizador lo confirma.
   */
  const revisarInactivos = async () => {
    if (!group) return;
    setBusy('sweep');
    try {
      const dias = Number(group.inactiveDays ?? 30) || 30;
      const rev = await lifebookGroupsApi.sweepInactive(groupId, { dryRun: true });
      const gente = rev.candidates ?? [];
      if (gente.length === 0) {
        Alert.alert('Quitar inactivos', `Nadie lleva ${dias} días sin dar señales en el grupo.`);
        return;
      }
      Alert.alert(
        'Quitar inactivos',
        `Con la regla de ${dias} días saldrían ${gente.length} persona${gente.length === 1 ? '' : 's'}:\n\n` +
        gente.slice(0, 8).map((c) => `· ${c.fullName ?? 'Usuario'}`).join('\n') +
        (gente.length > 8 ? `\n· y ${gente.length - 8} más` : ''),
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Quitar',
            style: 'destructive',
            onPress: async () => {
              try {
                const hecho = await lifebookGroupsApi.sweepInactive(groupId, { days: dias });
                Alert.alert('Hecho', `Se ha quitado a ${hecho.removed} persona${hecho.removed === 1 ? '' : 's'}.`);
                await load();
              } catch (e) {
                Alert.alert('Quitar inactivos', e instanceof Error ? e.message : 'No se pudo completar.');
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Quitar inactivos', e instanceof Error ? e.message : 'No se pudo revisar.');
    } finally { setBusy(null); }
  };

  const members = useMemo(() => group?.members ?? [], [group]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => (m.fullName ?? '').toLowerCase().includes(q)) : members;
  }, [members, query]);

  const apply = (g: LbGroup, msg?: string) => {
    setGroup(g);
    setDetailMember(null);
    if (msg) Alert.alert('Grupo', msg);
  };

  const run = async (key: string, fn: () => Promise<LbGroup>, msg?: string) => {
    setBusy(key);
    try { apply(await fn(), msg); }
    catch (e) { Alert.alert('Grupo', e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { setBusy(null); }
  };

  /* ── Personas para invitar ── */
  const loadPeople = async () => {
    setPeople(null);
    try {
      const [followers, suggested] = await Promise.all([
        lifebookInboxApi.followers().catch(() => [] as LbFollowerItem[]),
        lifebookInboxApi.suggested().catch(() => [] as LbSuggestedUser[]),
      ]);
      const seen = new Set(members.map((m) => m.id));
      const list: Array<{ id: string; name: string; avatarUrl?: string | null }> = [];
      for (const f of [...followers, ...suggested]) {
        const id = (f as any).id as string;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        list.push({ id, name: ((f as any).fullName as string | null)?.trim() || 'Usuario', avatarUrl: (f as any).avatarUrl });
      }
      setPeople(list);
    } catch { setPeople([]); }
  };

  const addMembers = () => run('add', () => messagesApi.addGroupMembers(groupId, picked), 'Ya están en el grupo.')
    .then(() => { setPicked([]); setStep('members'); });

  const expel = (m: LbGroupMember) => {
    Alert.alert('Expulsar', `¿Expulsar a ${m.fullName ?? 'este miembro'} del grupo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Expulsar', style: 'destructive',
        onPress: () => run(m.id, () => messagesApi.removeGroupMember(groupId, m.id).then(load).then(() => group as LbGroup)),
      },
    ]);
  };

  const makeAdmin = (m: LbGroupMember) => run(m.id, () => messagesApi.setGroupAdmin(groupId, m.id), `${m.fullName ?? 'Miembro'} ahora es administrador.`);
  const dropAdmin = (m: LbGroupMember) => run(m.id, () => messagesApi.unsetGroupAdmin(groupId, m.id), `${m.fullName ?? 'Miembro'} ya no es administrador.`);

  const transfer = (m: LbGroupMember) => {
    Alert.alert('Ceder el grupo', `¿Pasar el grupo a ${m.fullName ?? 'esta persona'}? Tú quedarás como administrador.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Ceder', onPress: () => run(m.id, () => messagesApi.transferGroup(groupId, m.id), 'El grupo tiene dueño nuevo.') },
    ]);
  };

  const saveEdit = () => run('edit', () => messagesApi.updateGroup(groupId, { title: title.trim(), allowedKinds: kinds }), 'Grupo actualizado.')
    .then(() => setStep('manage'));

  const saveAnnouncement = () => run('ann', () => messagesApi.groupSettings(groupId, { announcement: announcement.trim() || null }), 'Anuncio publicado.')
    .then(() => setStep('manage'));

  const saveWelcome = () => run('welcome', () => messagesApi.groupSettings(groupId, { welcomeMessage: welcome.trim() || null }), 'Mensaje de bienvenida guardado.')
  /** Parte 25: tema del grupo (lo ve todo el grupo bajo el nombre). */
  const saveTopic = () => run('topic', () => messagesApi.groupSettings(groupId, { topic: topic.trim() || null }), 'Tema del grupo guardado.')
    .then(() => setStep('manage'));

  const toggleSetting = (key: 'showHistory' | 'membersCanSpeak' | 'autoRemoveInactive', value: boolean) =>
    run(key, () => messagesApi.groupSettings(groupId, { [key]: value } as any));

  const setInvite = (policy: 'all' | 'admins') => run('invite', () => messagesApi.groupSettings(groupId, { invitePolicy: policy }));

  const leave = () => {
    Alert.alert('Salir del grupo', 'Dejarás de recibir sus mensajes. Tu historial se borra solo para ti.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          setBusy('leave');
          try { await messagesApi.leaveGroup(groupId); onClose(); onLeft(); }
          catch (e) { Alert.alert('Salir', e instanceof Error ? e.message : 'No se pudo salir.'); }
          finally { setBusy(null); }
        },
      },
    ]);
  };

  const dissolve = () => {
    Alert.alert(
      'Disolver el grupo',
      'Se borrarán el grupo, sus miembros y TODOS los mensajes. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Disolver', style: 'destructive',
          onPress: async () => {
            setBusy('dissolve');
            try { await messagesApi.dissolveGroup(groupId); onClose(); onLeft(); }
            catch (e) { Alert.alert('Disolver', e instanceof Error ? e.message : 'No se pudo disolver.'); }
            finally { setBusy(null); }
          },
        },
      ],
    );
  };

  const titles: Record<Step, string> = {
    manage: 'Gestión del grupo', members: 'Miembros', add: 'Añadir miembros',
    edit: 'Editar grupo', announcement: 'Anuncio del grupo', welcome: 'Mensaje de bienvenida', topic: 'Tema del grupo',
    requests: 'Solicitudes para entrar', code: 'Código de ruta y QR',
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          {step !== 'manage' ? (
            <Pressable onPress={() => { setStep(detailMember ? 'members' : 'manage'); setDetailMember(null); }} hitSlop={10} accessibilityLabel="Volver">
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.body }}>‹ Atrás</Text>
            </Pressable>
          ) : null}
          <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', flex: 1 }}>
            {detailMember ? (detailMember.fullName ?? 'Miembro') : titles[step]}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><X size={20} color={colors.textSecondary} /></Pressable>
        </View>

        {group === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e24 }} />
        ) : step === 'manage' ? (
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            {/* 1 · Cabecera */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingBottom: espaciado.e12 }}>
              {group.photoUrl ? (
                <Image source={{ uri: group.photoUrl }} style={styles.groupAvatar} />
              ) : (
                <View style={[styles.groupAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                  <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 18 }}>
                    {(group.title || 'G').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle }}>{group.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                  {group.membersCount} miembro{group.membersCount === 1 ? '' : 's'}
                  {group.adminsCount ? ` · ${group.adminsCount} admin${group.adminsCount === 1 ? '' : 's'}` : ''}
                  {` · ${group.myRole === 'owner' ? 'eres el dueño' : group.myRole === 'admin' ? 'eres administrador' : 'miembro'}`}
                </Text>
              </View>
              {canManage ? (
                <Pressable onPress={() => setStep('edit')} hitSlop={8} accessibilityLabel="Editar nombre y componentes" style={styles.iconBtn}>
                  <Pencil size={16} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>

            {/* 2 · Anuncio */}
            <Pressable
              onPress={() => (canManage ? setStep('announcement') : undefined)}
              disabled={!canManage}
              accessibilityLabel="Anuncio del grupo"
              style={[styles.row, { backgroundColor: alpha(colors.secondary, 0.08), borderColor: alpha(colors.secondary, 0.25) }]}
            >
              <Text style={{ fontSize: 18 }}>📣</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Anuncio del grupo</Text>
                <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                  {group.announcement?.trim() || (canManage ? 'Toca para escribir un anuncio' : 'Sin anuncio')}
                </Text>
              </View>
              {canManage ? <ChevronRight size={16} color={colors.textSecondary} /> : null}
            </Pressable>

            {/* 3 · Solicitudes para entrar (Parte 27, G3) */}
            {canManage ? (
              <Pressable
                onPress={() => setStep('requests')}
                accessibilityLabel={`Solicitudes para entrar${pendingCount ? `, ${pendingCount} pendientes` : ''}`}
                style={[styles.row, pendingCount > 0
                  ? { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.3) }
                  : undefined]}
              >
                <Text style={{ fontSize: 18 }}>🙋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Solicitudes para entrar</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    {pendingCount > 0
                      ? `${pendingCount} persona${pendingCount === 1 ? '' : 's'} esperando tu respuesta`
                      : 'Nadie ha pedido entrar todavía'}
                  </Text>
                </View>
                {pendingCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: '900' }}>{pendingCount}</Text>
                  </View>
                ) : null}
                <ChevronRight size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}

            {/* 4 · Código de ruta y QR (Parte 28, G4) */}
            {canManage ? (
              <Pressable
                onPress={abrirCodigo}
                accessibilityLabel="Código de ruta y QR del grupo"
                style={styles.row}
              >
                <QrCode size={18} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Código de ruta y QR</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    Invita sin buscador: comparte el código o el QR
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}

            {/* 5 · Miembros */}
            <Pressable onPress={() => setStep('members')} accessibilityLabel="Miembros del grupo" style={styles.row}>
              <Text style={{ fontSize: 18 }}>👥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Miembros</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                  Ver, invitar, hacer administrador o expulsar
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textSecondary} />
            </Pressable>

            {/* 4 · Ajustes */}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>AJUSTES</Text>

            <SettingRow
              title="Quién puede invitar"
              subtitle={group.invitePolicy === 'admins' ? 'Solo organizador y administradores' : 'Cualquier miembro del grupo'}
              colors={colors}
              disabled={!canManage}
              onPress={() => setInvite(group.invitePolicy === 'admins' ? 'all' : 'admins')}
              chip={group.invitePolicy === 'admins' ? 'Solo admins' : 'Todos'}
            />
            <SettingRow
              title="Permiso para hablar"
              subtitle={group.membersCanSpeak ? 'Todos los miembros pueden escribir' : 'Solo el organizador y los administradores'}
              colors={colors}
              right={
                <Switch
                  value={!!group.membersCanSpeak}
                  disabled={!canManage || busy === 'membersCanSpeak'}
                  onValueChange={(v) => toggleSetting('membersCanSpeak', v)}
                />
              }
            />
            <SettingRow
              title="Compartir el historial"
              subtitle={group.showHistory ? 'Quien entra ve los mensajes anteriores' : 'Quien entra solo ve los mensajes nuevos'}
              colors={colors}
              right={
                <Switch
                  value={!!group.showHistory}
                  disabled={!canManage || busy === 'showHistory'}
                  onValueChange={(v) => toggleSetting('showHistory', v)}
                />
              }
            />
            {/* Parte 25 (G2-b): tema del grupo, como Xiaohongshu */}
            <SettingRow
              title="Tema del grupo"
              subtitle={group.topic ? group.topic : 'Sin tema · al cambiarlo se avisa en el chat'}
              colors={colors}
              disabled={!canManage}
              onPress={() => setStep('topic')}
              chip={group.topic ? 'Con tema' : 'Añadir'}
            />
            <SettingRow
              title="Mensaje de bienvenida"
              subtitle={group.welcomeMessage ? group.welcomeMessage.slice(0, 60) : 'Sin mensaje automático al entrar'}
              colors={colors}
              disabled={!canManage}
              onPress={() => setStep('welcome')}
            />
            <SettingRow
              title="Grupo público"
              subtitle={group.visibility === 'private' ? 'Solo por invitación' : group.visibility === 'hidden' ? 'Oculto' : 'Se puede encontrar'}
              colors={colors}
              disabled={!canManage}
              onPress={() => run('vis', () => messagesApi.updateGroup(groupId, { visibility: group.visibility === 'private' ? 'public' : 'private' }))}
              chip={group.visibility === 'private' ? 'Privado' : group.visibility === 'hidden' ? 'Oculto' : 'Público'}
            />

            {/* Parte 29 (G4): quitar inactivos */}
            <SettingRow
              title="Quitar inactivos"
              subtitle={group.autoRemoveInactive
                ? `Se quita a quien no entra en ${group.inactiveDays ?? 30} días (nunca al organizador ni a los administradores)`
                : 'Desactivado: nadie se quita solo'}
              colors={colors}
              right={
                <Switch
                  value={!!group.autoRemoveInactive}
                  disabled={!canManage || busy === 'autoRemoveInactive'}
                  onValueChange={(v) => toggleSetting('autoRemoveInactive', v)}
                />
              }
            />
            {group.autoRemoveInactive ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e6 }}>
                  {[7, 15, 30, 60].map((d) => {
                    const activo = Number(group.inactiveDays ?? 30) === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => run('inactiveDays', () => messagesApi.groupSettings(groupId, { inactiveDays: d }))}
                        disabled={!canManage}
                        accessibilityLabel={`Quitar inactivos a los ${d} días`}
                        style={[styles.chip, {
                          backgroundColor: activo ? alpha(colors.primary, 0.14) : colors.surface,
                          borderColor: activo ? colors.primary : 'transparent',
                        }]}
                      >
                        <Text style={{ color: activo ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>
                          {d} días
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {canManage ? (
                  <Pressable
                    onPress={revisarInactivos}
                    disabled={busy === 'sweep'}
                    accessibilityLabel="Revisar ahora los miembros inactivos"
                    style={[styles.primaryBtn, { backgroundColor: alpha(colors.secondary, 0.14), marginTop: espaciado.e10 }]}
                  >
                    {busy === 'sweep' ? <ActivityIndicator size="small" color={colors.secondary} /> : (
                      <Text style={{ color: colors.secondary, fontWeight: '900', fontSize: tipografia.body }}>Revisar ahora</Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {/* 5 · Zona de riesgo */}
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>ZONA DE RIESGO</Text>
            {isOwner ? (
              <Pressable onPress={dissolve} accessibilityLabel="Disolver el grupo" style={[styles.row, { borderColor: alpha(colors.danger, 0.35) }]}>
                <Trash2 size={17} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.danger, fontWeight: '800', fontSize: tipografia.body }}>Disolver el grupo</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    Borra el grupo, sus miembros y todos los mensajes
                  </Text>
                </View>
                {busy === 'dissolve' ? <ActivityIndicator size="small" color={colors.danger} /> : null}
              </Pressable>
            ) : (
              <Pressable onPress={leave} accessibilityLabel="Salir del grupo" style={[styles.row, { borderColor: alpha(colors.danger, 0.35) }]}>
                <LogOut size={17} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.danger, fontWeight: '800', fontSize: tipografia.body }}>Salir del grupo</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>Dejarás de recibir sus mensajes</Text>
                </View>
                {busy === 'leave' ? <ActivityIndicator size="small" color={colors.danger} /> : null}
              </Pressable>
            )}
          </ScrollView>
        ) : step === 'members' ? (
          <>
            <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
              <Search size={15} color={colors.textSecondary} />
              <TextInput
                value={query} onChangeText={setQuery}
                placeholder="Buscar miembro…" placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body }}
              />
            </View>

            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              {filtered.map((m) => (
                <View key={m.id} style={[styles.memberRow, { borderBottomColor: alpha(colors.border, 0.5) }]}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/lifebook-user', params: { id: m.id } } as never)}
                    accessibilityLabel={`Perfil de ${m.fullName ?? 'miembro'}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, flex: 1 }}
                  >
                    {m.avatarUrl ? (
                      <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                        <Text style={{ color: colors.primary, fontWeight: '900' }}>
                          {(m.fullName ?? '?').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '700' }}>
                        {m.fullName ?? 'Usuario'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: 1 }}>
                        {m.role === 'owner' ? <Crown size={11} color={brand.warningPressed} /> : null}
                        {m.role === 'admin' ? <Shield size={11} color={colors.primary} /> : null}
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>
                          {m.role === 'owner' ? 'Dueño' : m.role === 'admin' ? 'Administrador' : 'Miembro'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  {/* ⋯ = acciones sobre ese miembro (admin/expulsar/ceder);
                      la fila se toca para ver SU PERFIL. */}
                  {canManage && m.role !== 'owner' ? (
                    <Pressable
                      onPress={() => setDetailMember(detailMember?.id === m.id ? null : m)}
                      hitSlop={8}
                      accessibilityLabel={`Acciones sobre ${m.fullName ?? 'miembro'}`}
                      style={styles.iconBtnDanger}
                    >
                      {busy === m.id
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <MoreHorizontal size={16} color={colors.textSecondary} />}
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {filtered.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e22, fontSize: tipografia.body }}>
                  Nadie coincide con «{query}».
                </Text>
              ) : null}
            </ScrollView>

            {/* Acciones sobre el miembro elegido */}
            {detailMember ? (
              <View style={{ gap: espaciado.e8, paddingTop: espaciado.e10 }}>
                {isOwner && detailMember.role === 'member' ? (
                  <SheetAction icon={<Shield size={16} color={colors.primary} />} text="Hacer administrador" colors={colors}
                    onPress={() => makeAdmin(detailMember)} busy={busy === detailMember.id} />
                ) : null}
                {isOwner && detailMember.role === 'admin' ? (
                  <SheetAction icon={<Shield size={16} color={colors.textSecondary} />} text="Quitar administrador" colors={colors}
                    onPress={() => dropAdmin(detailMember)} busy={busy === detailMember.id} />
                ) : null}
                {isOwner ? (
                  <SheetAction icon={<Crown size={16} color={brand.warningPressed} />} text="Ceder el grupo a esta persona" colors={colors}
                    onPress={() => transfer(detailMember)} busy={busy === detailMember.id} />
                ) : null}
                {canManage ? (
                  <SheetAction icon={<Trash2 size={16} color={colors.danger} />} text="Expulsar del grupo" colors={colors} danger
                    onPress={() => expel(detailMember)} busy={busy === detailMember.id} />
                ) : null}
                <Pressable onPress={() => setDetailMember(null)} style={{ paddingVertical: espaciado.e8, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.body }}>Cerrar</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setStep('add'); loadPeople(); }}
                accessibilityLabel="Añadir miembros"
                style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: espaciado.e10 }]}
              >
                <UserPlus size={16} color={brand.white} />
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Añadir miembros</Text>
              </Pressable>
            )}
          </>
        ) : step === 'add' ? (
          <>
            {people === null ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e24 }} />
            ) : people.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e24, fontSize: tipografia.body }}>
                No hay más personas que puedas añadir por ahora.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                {people.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <Pressable key={p.id}
                      onPress={() => setPicked((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                      accessibilityLabel={p.name}
                      style={[styles.memberRow, { borderBottomColor: alpha(colors.border, 0.5) }]}>
                      {p.avatarUrl ? (
                        <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                          <Text style={{ color: colors.primary, fontWeight: '900' }}>{p.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '700', flex: 1 }}>{p.name}</Text>
                      <View style={[styles.check, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
                        {on ? <Check size={13} color={brand.white} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable
              onPress={addMembers}
              disabled={picked.length === 0 || busy === 'add'}
              accessibilityLabel="Añadir al grupo"
              style={[styles.primaryBtn, { backgroundColor: picked.length ? colors.primary : alpha(colors.primary, 0.3), marginTop: espaciado.e10 }]}
            >
              {busy === 'add' ? <ActivityIndicator size="small" color={brand.white} /> : (
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Añadir{picked.length ? ` (${picked.length})` : ''}</Text>
              )}
            </Pressable>
          </>
        ) : step === 'edit' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>Nombre del grupo</Text>
            <TextInput
              value={title} onChangeText={setTitle} maxLength={90}
              placeholder="Nombre del grupo" placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e14, marginBottom: espaciado.e6 }}>
              Componentes que se pueden enviar
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
              {KINDS.map((k) => {
                const on = kinds.includes(k.id);
                return (
                  <Pressable key={k.id} accessibilityLabel={`Permitir ${k.label}`}
                    onPress={() => setKinds((prev) => (on ? prev.filter((x) => x !== k.id) : [...prev, k.id]))}
                    style={[styles.chip, { backgroundColor: on ? colors.primary : alpha(colors.primary, 0.1) }]}>
                    <Text style={{ color: on ? brand.white : colors.primary, fontSize: tipografia.caption, fontWeight: '800' }}>{k.icon} {k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={saveEdit} disabled={busy === 'edit' || title.trim().length < 3}
              accessibilityLabel="Guardar cambios del grupo"
              style={[styles.primaryBtn, { backgroundColor: title.trim().length >= 3 ? colors.primary : alpha(colors.primary, 0.3) }]}>
              {busy === 'edit' ? <ActivityIndicator size="small" color={brand.white} /> : (
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Guardar cambios</Text>
              )}
            </Pressable>
          </>
        ) : step === 'code' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e10 }}>
              Quien tenga este código puede abrir el grupo desde <Text style={{ fontWeight: '800' }}>Descubrir grupos → Tengo un código</Text>.
              El QR lleva al mismo sitio.
            </Text>
            {inviteCode ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.textPrimary, fontSize: 34, fontWeight: '900', letterSpacing: 6 }}>
                  {inviteCode.code}
                </Text>
                <View style={{ backgroundColor: brand.white, padding: espaciado.e14, borderRadius: radios.lg, marginTop: espaciado.e12 }}>
                  <QRCode value={inviteCode.link} size={170} color="#10202E" backgroundColor={brand.white} />
                </View>
                {/* Antes este texto decía que el código valía «mientras el grupo exista».
                    Ya no es verdad: caduca (7 días) y además puede tener tope de entradas.
                    Un texto que miente es peor que no ponerlo. */}
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e10, textAlign: 'center' }}>
                  {inviteCode.expiresAt
                    ? `Caduca el ${new Date(inviteCode.expiresAt).toLocaleDateString()}. Si se pasa, pide otro aquí mismo.`
                    : 'Caduca a los 7 días. Si se pasa, pide otro aquí mismo.'}
                  {inviteCode.usesLeft !== null
                    ? `\nQuedan ${inviteCode.usesLeft} entrada${inviteCode.usesLeft === 1 ? '' : 's'} de ${inviteCode.maxUses}.`
                    : ''}
                </Text>
                <Pressable onPress={copiarCodigo} accessibilityLabel="Copiar el código del grupo"
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: espaciado.e14, alignSelf: 'stretch' }]}>
                  <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Copiar el código</Text>
                </Pressable>

                {/* ── TOPE DE ENTRADAS (P3) ──
                    El enlace puede admitir solo a un número de personas, como el enlace de
                    invitación de Telegram. Al cambiarlo se crea un enlace NUEVO: el
                    contador empieza de cero y el anterior deja de funcionar. */}
                <View style={{ alignSelf: 'stretch', marginTop: espaciado.e16 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '900' }}>
                    ¿Cuánta gente puede entrar con este enlace?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                    {[
                      { v: null as number | null, t: 'Sin límite' },
                      { v: 1, t: '1' },
                      { v: 5, t: '5' },
                      { v: 10, t: '10' },
                      { v: 50, t: '50' },
                    ].map((o) => {
                      const activo = topeElegido === o.v;
                      return (
                        <Pressable
                          key={o.t}
                          onPress={() => setTopeElegido(o.v)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: activo }}
                          accessibilityLabel={`Tope de ${o.t}`}
                          style={{
                            paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: radios.full,
                            borderWidth: 1,
                            borderColor: activo ? colors.primary : colors.border,
                            backgroundColor: activo ? alpha(colors.primary, 0.12) : colors.surface,
                          }}
                        >
                          <Text style={{ color: activo ? colors.primary : colors.textSecondary, fontWeight: '800', fontSize: tipografia.caption }}>
                            {o.t}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {topeElegido !== inviteCode.maxUses ? (
                    <Pressable
                      onPress={aplicarTope}
                      disabled={aplicandoTope}
                      accessibilityLabel="Crear un enlace nuevo con este tope"
                      style={[styles.primaryBtn, { backgroundColor: colors.surface, marginTop: espaciado.e10, alignSelf: 'stretch', borderWidth: 1, borderColor: colors.primary }]}
                    >
                      {aplicandoTope ? <ActivityIndicator size="small" color={colors.primary} /> : (
                        <Text style={{ color: colors.primary, fontWeight: '900', fontSize: tipografia.body }}>
                          Crear enlace nuevo con este tope
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
                      {inviteCode.maxUses === null
                        ? 'Ahora mismo el enlace no tiene tope: entra quien lo tenga, hasta que caduque.'
                        : `Ahora mismo el enlace admite ${inviteCode.maxUses} entrada${inviteCode.maxUses === 1 ? '' : 's'} en total.`}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e24 }} />
            )}
          </>
        ) : step === 'requests' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e8 }}>
              Quien quiera entrar en un grupo con aprobación o con pregunta aparece aquí. Al aceptar, entra en el
              grupo y recibe el mensaje de bienvenida.
            </Text>
            {requests === null ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e20 }} />
            ) : requests.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e22, fontSize: tipografia.body }}>
                No hay solicitudes.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
                {requests.map((r) => (
                  <View key={r.userId} style={[styles.requestRow, { backgroundColor: colors.surface }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                      {r.avatarUrl ? (
                        <Image source={{ uri: absUrl(r.avatarUrl) }} style={styles.reqAvatar} />
                      ) : (
                        <View style={[styles.reqAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                          <Text style={{ color: colors.primary, fontWeight: '900', fontSize: tipografia.body }}>
                            {(r.fullName ?? '?').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }} numberOfLines={1}>
                          {r.fullName ?? 'Usuario'}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                          {r.city ? `${r.city} · ` : ''}{lbTimeAgo(r.createdAt)}
                          {r.state === 'approved' ? ' · aceptada' : r.state === 'rejected' ? ' · rechazada' : ''}
                        </Text>
                      </View>
                      {r.state === 'pending' ? (
                        <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>
                          <Pressable
                            onPress={() => decidir(r.userId, 'approve')}
                            disabled={deciding === r.userId}
                            accessibilityLabel={`Aceptar a ${r.fullName ?? 'esta persona'}`}
                            style={[styles.reqBtn, { backgroundColor: colors.primary }]}
                          >
                            {deciding === r.userId
                              ? <ActivityIndicator size="small" color={brand.white} />
                              : <Text style={{ color: brand.white, fontWeight: '900', fontSize: tipografia.caption }}>Aceptar</Text>}
                          </Pressable>
                          <Pressable
                            onPress={() => decidir(r.userId, 'reject')}
                            disabled={deciding === r.userId}
                            accessibilityLabel={`Rechazar a ${r.fullName ?? 'esta persona'}`}
                            style={[styles.reqBtn, { backgroundColor: alpha(colors.danger, 0.12) }]}
                          >
                            <Text style={{ color: colors.danger, fontWeight: '900', fontSize: tipografia.caption }}>Rechazar</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                    {r.answer ? (
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
                        Respondió: «{r.answer}»
                      </Text>
                    ) : null}
                    {r.note ? (
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>{r.note}</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </>
        ) : step === 'topic' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>
              El tema aparece bajo el nombre del grupo y queda como aviso en el chat. Máx. 60 caracteres.
            </Text>
            <TextInput
              value={topic} onChangeText={setTopic} maxLength={60}
              placeholder="Ej.: Senderismo · salidas de sábado"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Tema del grupo"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <Pressable onPress={saveTopic} disabled={busy === 'topic'} accessibilityLabel="Guardar tema del grupo"
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
              {busy === 'topic' ? <ActivityIndicator size="small" color={brand.white} /> : (
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Guardar tema</Text>
              )}
            </Pressable>
          </>
        ) : step === 'announcement' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>
              Lo ve todo el grupo arriba del chat. Máx. 500 caracteres.
            </Text>
            <TextInput
              value={announcement} onChangeText={setAnnouncement} multiline maxLength={500}
              placeholder="Ej.: Salimos el sábado a las 7:00 desde el mirador."
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, styles.area, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <Pressable onPress={saveAnnouncement} disabled={busy === 'ann'} accessibilityLabel="Publicar anuncio"
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
              {busy === 'ann' ? <ActivityIndicator size="small" color={brand.white} /> : (
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Publicar anuncio</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6 }}>
              Se envía como aviso del sistema cuando alguien entra al grupo.
            </Text>
            <TextInput
              value={welcome} onChangeText={setWelcome} multiline maxLength={300}
              placeholder="Ej.: Bienvenido al grupo, revisa el anuncio antes de salir."
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, styles.area, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <Pressable onPress={saveWelcome} disabled={busy === 'welcome'} accessibilityLabel="Guardar bienvenida"
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
              {busy === 'welcome' ? <ActivityIndicator size="small" color={brand.white} /> : (
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: 14.5 }}>Guardar bienvenida</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

/* ── Piezas ── */

function SettingRow({ title, subtitle, colors, right, onPress, disabled, chip }: {
  title: string; subtitle: string; colors: any; right?: React.ReactNode;
  onPress?: () => void; disabled?: boolean; chip?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      accessibilityLabel={title}
      style={[styles.row, { opacity: disabled ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: tipografia.body }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>{subtitle}</Text>
      </View>
      {chip ? (
        <View style={{ backgroundColor: alpha(colors.primary, 0.12), borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4 }}>
          <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '800' }}>{chip}</Text>
        </View>
      ) : null}
      {right ?? null}
    </Pressable>
  );
}

function SheetAction({ icon, text, colors, onPress, busy, danger }: {
  icon: React.ReactNode; text: string; colors: any; onPress: () => void; busy?: boolean; danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={text}
      style={[styles.row, { borderColor: alpha(danger ? colors.danger : colors.border, 0.5) }]}
    >
      {icon}
      <Text style={{ color: danger ? colors.danger : colors.textPrimary, fontWeight: '800', fontSize: tipografia.body, flex: 1 }}>{text}</Text>
      {busy ? <ActivityIndicator size="small" color={danger ? colors.danger : colors.primary} /> : <ChevronRight size={15} color={colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginBottom: espaciado.e10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: 1,
    borderColor: 'transparent', borderRadius: 14, paddingVertical: espaciado.e11, paddingHorizontal: espaciado.e10, marginTop: espaciado.e6,
  },
  sectionTitle: { fontSize: tipografia.caption, fontWeight: '800', letterSpacing: 0.6, marginTop: espaciado.e16, marginBottom: espaciado.e2 },
  groupAvatar: { width: 52, height: 52, borderRadius: radios.lg },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
  /** Parte 27 (G3): solicitudes para entrar. */
  requestRow: { borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e8 },
  reqAvatar: { width: 36, height: 36, borderRadius: 18 },
  reqBtn: { borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, minWidth: 74, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e5 },
  iconBtn: { width: 32, height: 32, borderRadius: radios.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,128,255,0.10)' },
  iconBtnDanger: { width: 32, height: 32, borderRadius: radios.lg, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e9, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 24, height: 24, borderRadius: radios.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e12, height: 38, marginBottom: espaciado.e8 },
  input: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: 14.5 },
  area: { minHeight: 84, textAlignVertical: 'top' },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8,
    borderRadius: radios.full, paddingVertical: espaciado.e13, marginTop: espaciado.e14,
  },
});
