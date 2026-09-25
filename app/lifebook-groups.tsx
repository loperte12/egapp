/**
 * LifeBookGroupsScreen — Parte 27 (Fase G3): DESCUBRIR GRUPOS.
 *
 * Listado de los grupos **públicos** con buscador y filtros de ciudad y
 * categoría. Cada tarjeta dice quiénes son, dónde y cómo se entra (libre, con
 * aprobación o respondiendo una pregunta) y lleva a la FICHA
 * (`GroupCardSheet`), donde uno se une, pide entrar o responde la pregunta.
 *
 * Entrada: el icono «Descubrir grupos» de la cabecera de Mensajes.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, Check, Compass, Lock, QrCode, Search, ShieldQuestion, Users, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookGroupsApi, type LbGroupCard } from '../api/lifebook';
import { LB_CITIES } from '../constants/lifebook';
import { GroupCardSheet } from '../components/lifebook/GroupCardSheet';
import { formaHoja } from '../components/lifebook/ui/Sheet';
import { ir as irSeguro } from '../constants/rutas';

/** Categorías de grupo (las mismas que usa crear ruta). */
const CATEGORIES: { id: string; label: string }[] = [
  { id: 'senderismo', label: 'Senderismo' },
  { id: 'ciclismo', label: 'Ciclismo' },
  { id: 'auto', label: 'Ruta en auto' },
  { id: 'moto', label: 'Ruta en moto' },
  { id: 'running', label: 'Running' },
  { id: 'camping', label: 'Camping' },
  { id: 'foto', label: 'Fotografía' },
  { id: 'urbano', label: 'Ciudad' },
  { id: 'gastronomia', label: 'Gastronomía' },
];

export default function LifeBookGroupsScreen() {
  return (
    <AuthGate>
      <GroupsContent />
    </AuthGate>
  );
}

function GroupsContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  /* P3: se puede llegar con un CÓDIGO (enlace de grupo fijado en un perfil). */
  const params = useLocalSearchParams<{ code?: string }>();
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [groups, setGroups] = useState<LbGroupCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [card, setCard] = useState<LbGroupCard | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  /**
   * El código por el que se ha abierto la ficha, si se ha abierto con uno. Se guarda para
   * pasárselo a la ficha: al unirse, el servidor gasta una entrada del enlace (y respeta
   * su tope). Abrir la ficha desde la lista de Descubrir NO trae código: ahí no se gasta.
   */
  const [cardCode, setCardCode] = useState<string | null>(null);
  /* Parte 28 (G4): entrar con el CÓDIGO de ruta (sin buscador). */
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  /** Resuelve el código y abre la ficha del grupo (y ahí te unes). */
  const abrirCodigo = async (crudo: string, avisar = false) => {
    const limpio = crudo.trim();
    if (limpio.length < 4) {
      setCodeError('Escribe el código completo (6 caracteres).');
      if (avisar) Alert.alert('Enlace de grupo', 'Ese enlace no trae un código válido.');
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      const g = await lifebookGroupsApi.byCode(limpio);
      setCard(g);
      setCardCode(limpio.toUpperCase());
      setCodeOpen(false);
      setCode('');
      setCardOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No encontré ese código.';
      setCodeError(msg);
      // Si el código viene de un ENLACE (no escrito a mano) la hoja del código está
      // cerrada: sin este aviso el usuario no vería nada y parecería que no pasó nada.
      if (avisar) Alert.alert('Enlace de grupo', msg);
    } finally { setCodeBusy(false); }
  };

  /** Botón «Abrir» de la hoja del código. */
  const abrirPorCodigo = () => abrirCodigo(code);

  // P3: si llego con `?code=XXXX` (enlace de grupo del perfil), abro la ficha sin
  // obligar a copiar el código a mano. Un código CADUCADO lo dice el servidor y aquí
  // sale en un aviso.
  const codeParam = params.code;
  useEffect(() => {
    if (!codeParam) return;
    setCode(codeParam);
    void abrirCodigo(codeParam, true);
    // Solo cuando cambia el código que llega por la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam]);

  const load = useCallback(async (opts: { append?: boolean; cursor?: string | null } = {}) => {
    try {
      const res = await lifebookGroupsApi.list({
        q: query.trim() || undefined,
        city: city ?? undefined,
        category: category ?? undefined,
        cursor: opts.append ? (opts.cursor ?? undefined) : undefined,
        limit: 20,
      });
      setGroups((prev) => (opts.append ? [...prev, ...(res.groups ?? [])] : (res.groups ?? [])));
      setCursor(res.nextCursor ?? null);
    } catch {
      if (!opts.append) setGroups([]);
      setCursor(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [query, city, category]);

  // Búsqueda con retardo (350 ms) y recarga al cambiar los filtros.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => { void load(); }, 350);
    return () => clearTimeout(t);
  }, [load]);

  const abrirFicha = async (id: string) => {
    try {
      setCard(await lifebookGroupsApi.card(id));
      // Desde la lista de Descubrir no hay código: entrar por aquí no gasta entradas.
      setCardCode(null);
      setCardOpen(true);
    } catch (e) {
      // Grupo privado/oculto o borrado entre la lista y el toque: se avisa y se
      // quita de la lista (el listado solo trae públicos).
      setGroups((prev) => prev.filter((g) => g.id !== id));
      Alert.alert('Grupo', e instanceof Error ? e.message : 'No se pudo abrir el grupo.');
    }
  };

  const vacio = useMemo(() => !loading && groups.length === 0, [loading, groups.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: alpha(colors.border, 0.6) }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo }}>Descubrir grupos</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Rutas y comunidades abiertas cerca de ti</Text>
        </View>
        {/* Parte 28 (G4): entrar con el código que te hayan pasado */}
        <Pressable onPress={() => { setCodeOpen(true); setCodeError(null); }} hitSlop={8} accessibilityLabel="Tengo un código de ruta"
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, backgroundColor: alpha(colors.primary, 0.12), borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6 }}>
          <QrCode size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Código</Text>
        </Pressable>
      </View>

      {/* Buscador */}
      <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar grupos por nombre o descripción…"
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body }}
          accessibilityLabel="Buscar grupos"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Borrar la búsqueda">
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filtros */}
      <FlatList
        horizontal
        style={styles.chipRow}
        showsHorizontalScrollIndicator={false}
        data={[{ id: '__all__', label: 'Todas' }, ...LB_CITIES.map((c) => ({ id: c, label: c }))]}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ gap: espaciado.e6, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }}
        renderItem={({ item }) => {
          const active = item.id === '__all__' ? city === null : city === item.id;
          return (
            <Pressable
              onPress={() => setCity(item.id === '__all__' ? null : item.id)}
              accessibilityLabel={`Ciudad ${item.label}`}
              style={[styles.chip, { backgroundColor: active ? alpha(colors.primary, 0.14) : colors.surface, borderColor: active ? colors.primary : 'transparent' }]}
            >
              <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
      <FlatList
        horizontal
        style={styles.chipRow}
        showsHorizontalScrollIndicator={false}
        data={[{ id: '__all__', label: 'Todo' }, ...CATEGORIES]}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ gap: espaciado.e6, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }}
        renderItem={({ item }) => {
          const active = item.id === '__all__' ? category === null : category === item.id;
          return (
            <Pressable
              onPress={() => setCategory(item.id === '__all__' ? null : item.id)}
              accessibilityLabel={`Categoría ${item.label}`}
              style={[styles.chip, { backgroundColor: active ? alpha(colors.secondary, 0.14) : colors.surface, borderColor: active ? colors.secondary : 'transparent' }]}
            >
              <Text style={{ color: active ? colors.secondary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {/* Lista */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: espaciado.e14, gap: espaciado.e10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!cursor || loadingMore) return;
            setLoadingMore(true);
            void load({ append: true, cursor });
          }}
          ListEmptyComponent={
            vacio ? (
              <View style={{ alignItems: 'center', marginTop: 50, gap: espaciado.e6 }}>
                <Compass size={26} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
                  No hay grupos públicos con esos filtros.{'\n'}Puedes crear el tuyo desde Mensajes → «Crear grupo».
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e12 }} /> : null}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => abrirFicha(item.id)}
              accessibilityLabel={`Grupo ${item.title}, ${item.membersCount} miembros`}
              style={({ pressed }) => [styles.groupRow, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
            >
              {item.photoUrl ? (
                <Image source={{ uri: absUrl(item.photoUrl) }} style={styles.groupPhoto} />
              ) : (
                <View style={[styles.groupPhoto, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                  <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.cabecera }}>
                    {(item.title || '?').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.fino }} numberOfLines={1}>{item.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e3 }}>
                  <Users size={12} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{item.membersCount}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={1}>
                    · {[item.city, item.category].filter(Boolean).join(' · ') || 'sin ubicación'}
                  </Text>
                </View>
                {item.description ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e6 }}>
                  {item.myRole ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
                      <Check size={12} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                        {item.myRole === 'owner' ? 'Eres el organizador' : 'Ya estás dentro'}
                      </Text>
                    </View>
                  ) : item.requestState === 'pending' ? (
                    <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Solicitud enviada</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
                      {item.joinMode === 'open'
                        ? <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Entrada libre</Text>
                        : item.joinMode === 'approval'
                          ? <><Lock size={12} color={colors.secondary} /><Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Pide entrar</Text></>
                          : <><ShieldQuestion size={12} color={colors.secondary} /><Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Responde para entrar</Text></>}
                    </View>
                  )}
                </View>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.title }}>›</Text>
            </Pressable>
          )}
        />
      )}

      <GroupCardSheet
        visible={cardOpen}
        group={card}
        /* El código por el que se ha llegado, si se ha llegado por uno: al unirse se manda
           y eso es lo que gasta una entrada del enlace y hace respetar su tope. */
        code={cardCode ?? undefined}
        onClose={() => { setCardOpen(false); setCardCode(null); }}
        onChanged={() => void load()}
        onJoined={(id) => {
          const g = groups.find((x) => x.id === id);
          irSeguro.libre('/lifebook-chat/[id]', { id, name: g?.title ?? card?.title ?? 'Grupo', isGroup: '1' });
        }}
      />

      {/* Parte 28 (G4): entrar con el código de ruta */}
      <Modal visible={codeOpen} transparent animationType="slide" onRequestClose={() => setCodeOpen(false)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setCodeOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e10 }}>
            <QrCode size={18} color={colors.primary} />
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1, marginLeft: espaciado.e8 }}>
              Tengo un código de ruta
            </Text>
            <Pressable onPress={() => setCodeOpen(false)} hitSlop={10} accessibilityLabel="Cerrar">
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e8 }}>
            Escribe los 6 caracteres que te han pasado (o escanea su QR desde la cámara).
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => { setCode(v.toUpperCase()); setCodeError(null); }}
            placeholder="ABC123"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            maxLength={8}
            accessibilityLabel="Código del grupo"
            style={[styles.codeInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          />
          {codeError ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>{codeError}</Text> : null}
          <Pressable onPress={abrirPorCodigo} disabled={codeBusy} accessibilityLabel="Abrir el grupo con ese código"
            style={[styles.cta, { backgroundColor: colors.primary }]}>
            {codeBusy ? <ActivityIndicator size="small" color={brand.white} /> : (
              <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Abrir el grupo</Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: 42, marginHorizontal: espaciado.e14, marginTop: espaciado.e10 },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderWidth: trazo.fino, flexShrink: 0 },
  // Fijar la fila: sin alto propio, el FlatList horizontal se comprime y el texto sale recortado
  // contra la fila contigua (medido en el móvil: 17 px de alto en ciudades vs 23 en categorías).
  chipRow: { flexGrow: 0, flexShrink: 0, marginVertical: espaciado.e5 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderRadius: radios.lg, padding: espaciado.e12 },
  groupPhoto: { width: 54, height: 54, borderRadius: radios.campo },
  center: { alignItems: 'center', justifyContent: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  codeInput: {
    borderRadius: radios.campo, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e12, fontSize: tipografia.subtitulo, fontWeight: peso.titulo,
    letterSpacing: 6, textAlign: 'center',
  },
  cta: { marginTop: espaciado.e14, borderRadius: radios.campo, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e14 },
});
