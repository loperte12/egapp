/**
 * CreateGroupSheet — hoja de crear grupo (versión ANTERIOR del dueño).
 *
 * ⚠️ SUSTITUIDA (2026-09-10): el flujo nuevo vive en la pantalla
 * `app/lifebook-group-create.tsx` (nombre → descripción → tipo de ruta →
 * punto de encuentro con buscador real → invitar → condición de ingreso →
 * creada). El icono «Crear grupo» de Mensajes abre esa pantalla.
 * Este archivo se conserva por si se quiere volver a la hoja; ya no se usa.
 *
 * Código del dueño aplicado tal cual. Lo que se ajustó para que compile aquí:
 *   · `Sheet`/`SheetHeader` importan de `./ui/Sheet` y `PersonRow` de
 *     `./PersonRow`.
 *   · `LbFollowerItem`/`LbSuggestedUser` entran como `import type`.
 *   · `e.code` funciona porque el cliente HTTP lanza `ApiError` con `code`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Check, Search, Users, X } from 'lucide-react-native';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { Sheet, SheetHeader } from './ui/Sheet';
import { PersonRow } from './PersonRow';
import { lifebookInboxApi, type LbFollowerItem, type LbSuggestedUser } from '../../api/lifebook';
import { LB_CITIES } from '../../constants/lifebook';
import type { LbGroupMeta } from '../../api/messages';
import { brand } from '@egrouteplan/ui-kit';

const MAX_MEMBERS = 199; // + tú = 200

const CATEGORIES = [
  { id: 'food', label: 'Comida' }, { id: 'taxi', label: 'Taxi' },
  { id: 'sales', label: 'Ventas' }, { id: 'culture', label: 'Cultura' },
  { id: 'work', label: 'Trabajo' }, { id: 'rental', label: 'Alquiler' },
  { id: 'sports', label: 'Deportes' }, { id: 'music', label: 'Música' },
];

interface Person { id: string; name: string; avatarUrl?: string | null; note?: string }

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate?: (title: string, members: string[], meta?: LbGroupMeta) => Promise<void> | void;
}

export function CreateGroupSheet({ visible, onClose, onCreate }: Props) {
  const { colors } = useTheme();

  const [followers, setFollowers] = useState<Person[]>([]);
  const [suggested, setSuggested] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [errText, setErrText] = useState<string | null>(null);

  // ── Meta opcional (fase Xiaohongshu) ──
  const [city, setCity] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<LbGroupMeta['visibility']>('private');

  useEffect(() => {
    if (!visible) return;
    setPicked([]); setTitle(''); setQuery(''); setErrText(null);
    setCity(null); setCategory(null); setVisibility('private');
    setFollowers([]); setSuggested([]); setLoading(true);

    (async () => {
      try {
        const [f, s] = await Promise.all([
          lifebookInboxApi.followers().catch(() => [] as LbFollowerItem[]),
          lifebookInboxApi.suggested().catch(() => [] as LbSuggestedUser[]),
        ]);
        const seen = new Set<string>();
        const toPerson = (x: any, note?: string): Person | null => {
          const id = String(x.id ?? '');
          if (!id || seen.has(id)) return null;
          seen.add(id);
          return { id, name: (x.fullName ?? x.name ?? 'Usuario').trim(), avatarUrl: x.avatarUrl, note };
        };
        setFollowers(f.map((x) => toPerson(x, 'Te sigue')).filter(Boolean) as Person[]);
        setSuggested(s.map((x) => toPerson(x, x.reason ?? x.city)).filter(Boolean) as Person[]);
      } catch {
        setFollowers([]); setSuggested([]);
      } finally { setLoading(false); }
    })();
  }, [visible]);

  // ── Personas seleccionadas (para chips + avatar) ──
  const pickedPeople = useMemo(() => {
    const all = [...followers, ...suggested];
    return picked
      .map((id) => all.find((p) => p.id === id))
      .filter(Boolean) as Person[];
  }, [picked, followers, suggested]);

  const filterList = (list: Person[]) =>
    query.trim()
      ? list.filter((p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.note ?? '').toLowerCase().includes(query.toLowerCase()))
      : list;

  const visibleFollowers = filterList(followers);
  const visibleSuggested = filterList(suggested);

  const toggle = (id: string) => {
    setErrText(null);
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_MEMBERS) return prev;
      return [...prev, id];
    });
  };

  // Título sugerido si está vacío
  const suggestedTitle = useMemo(() => {
    if (pickedPeople.length === 0) return '';
    const first = pickedPeople[0].name.split(' ')[0];
    const cat = CATEGORIES.find((c) => c.id === category)?.label;
    const parts = [cat, city].filter(Boolean).join(' · ');
    return parts
      ? `${parts} de ${first}`
      : `Grupo de ${first} y ${pickedPeople.length} más`;
  }, [pickedPeople, category, city]);

  const canCreate = title.trim().length >= 3 && picked.length > 0 && !busy;

  const submit = async () => {
    if (!canCreate || !onCreate) return;
    setBusy(true); setErrText(null);
    try {
      await onCreate(title.trim(), picked, {
        city: city ?? undefined,
        category: category ?? undefined,
        visibility,
      });
      // el padre cierra el sheet en éxito
    } catch (e: any) {
      const code = e?.code ?? e?.response?.data?.code;
      if (code === 'GROUP_TITLE_REQUIRED') setErrText('El nombre necesita al menos 3 letras.');
      else if (code === 'GROUP_MEMBERS_REQUIRED') setErrText('Elige al menos a una persona.');
      else setErrText(e?.message ?? 'No se pudo crear el grupo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Crear grupo" onClose={onClose} />

      {/* ── Identidad del grupo (avatar + nombre) ── */}
      <View style={styles.identity}>
        <GroupAvatar people={pickedPeople} colors={colors} />
        <View style={{ flex: 1 }}>
          <TextInput
            value={title} onChangeText={(t) => { setTitle(t); setErrText(null); }}
            maxLength={90}
            placeholder={suggestedTitle || 'Nombre del grupo (3–90 letras)'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.titleInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          />
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
            {picked.length + 1} / 200 miembros · {visibility === 'public' ? 'Grupo público' : 'Grupo privado'}
          </Text>
        </View>
      </View>

      {/* ── Chips de seleccionados ── */}
      {pickedPeople.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: espaciado.e8 }}>
          {pickedPeople.map((p) => (
            <View key={p.id} style={[styles.chip, { backgroundColor: colors.surface }]}>
              {p.avatarUrl ? (
                <Image source={{ uri: p.avatarUrl }} style={styles.chipAvatar} />
              ) : (
                <View style={[styles.chipAvatar, { backgroundColor: alpha(colors.primary, 0.15) }]} />
              )}
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.medio }} numberOfLines={1}>
                {p.name.split(' ')[0]}
              </Text>
              <Pressable onPress={() => toggle(p.id)} hitSlop={6}>
                <X size={12} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Buscador ── */}
      <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
        <Search size={14} color={colors.textSecondary} />
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Buscar persona…" placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, marginLeft: espaciado.e6, color: colors.textPrimary, fontSize: tipografia.body }}
        />
      </View>

      {/* ── Contexto local (EG ROUTE PLAN) ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: espaciado.e8 }}>
        <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>
          {LB_CITIES.map((c) => {
            const on = city === c;
            return (
              <Pressable key={c} onPress={() => setCity(on ? null : c)}
                style={[styles.optChip, { backgroundColor: on ? colors.primary : colors.surface }]}>
                <Text style={{ color: on ? brand.white : colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: espaciado.e6 }}>
        <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            return (
              <Pressable key={c.id} onPress={() => setCategory(on ? null : c.id)}
                style={[styles.optChip, { backgroundColor: on ? brand.lifebook : colors.surface }]}>
                <Text style={{ color: on ? brand.white : colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Lista de personas ── */}
      {loading ? (
        <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e24 }} />
      ) : followers.length === 0 && suggested.length === 0 ? (
        <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e24, fontSize: tipografia.body }}>
          No hay personas para invitar por ahora.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 260, marginTop: espaciado.e10 }} keyboardShouldPersistTaps="handled">
          {visibleFollowers.length > 0 && (
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Seguidores</Text>
          )}
          {visibleFollowers.map((p) => (
            <SelectablePerson key={p.id} p={p} on={picked.includes(p.id)} onPress={() => toggle(p.id)} colors={colors} />
          ))}
          {visibleSuggested.length > 0 && (
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Sugeridos</Text>
          )}
          {visibleSuggested.map((p) => (
            <SelectablePerson key={p.id} p={p} on={picked.includes(p.id)} onPress={() => toggle(p.id)} colors={colors} />
          ))}
        </ScrollView>
      )}

      {/* ── Error inline ── */}
      {errText ? <Text style={{ color: brand.like, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>{errText}</Text> : null}

      {/* ── Botón crear ── */}
      <Pressable disabled={!canCreate} onPress={submit}
        style={[styles.primaryBtn, { backgroundColor: canCreate ? colors.primary : alpha(colors.primary, 0.3) }]}>
        {busy ? (
          <ActivityIndicator size="small" color={brand.white} />
        ) : (
          <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.fino }}>
            Crear grupo{picked.length ? ` (${picked.length + 1})` : ''}
          </Text>
        )}
      </Pressable>
    </Sheet>
  );
}

/* ── Avatar de grupo (collage local; la subida real se enchufa luego) ── */
function GroupAvatar({ people, colors }: { people: Person[]; colors: any }) {
  const show = people.slice(0, 4);
  return (
    <View style={[styles.groupAvatar, { backgroundColor: colors.surface }]}>
      {show.length === 0 ? (
        <Users size={22} color={colors.textSecondary} />
      ) : (
        <View style={styles.collage}>
          {show.map((p) =>
            p.avatarUrl ? (
              <Image key={p.id} source={{ uri: p.avatarUrl }} style={styles.collageImg} />
            ) : (
              <View key={p.id} style={[styles.collageImg, { backgroundColor: alpha(colors.primary, 0.2) }]} />
            ),
          )}
        </View>
      )}
    </View>
  );
}

/* ── Fila seleccionable ── */
function SelectablePerson({ p, on, onPress, colors }: {
  p: Person; on: boolean; onPress: () => void; colors: any;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <PersonRow
        name={p.name} avatarUrl={p.avatarUrl} subtitle={p.note}
        actions={
          <View style={[styles.check, {
            borderColor: on ? colors.primary : colors.border,
            backgroundColor: on ? colors.primary : 'transparent',
          }]}>
            {on ? <Check size={13} color={brand.white} /> : null}
          </View>
        }
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginBottom: espaciado.e10 },
  groupAvatar: {
    width: 56, height: 56, borderRadius: radios.lg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  collage: { flexDirection: 'row', flexWrap: 'wrap', width: 48, justifyContent: 'center' },
  collageImg: { width: 22, height: 22, borderRadius: radios.marca, margin: 1 },
  titleInput: { borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body, fontWeight: peso.fuerte },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e5,
    borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, marginRight: espaciado.e6,
  },
  chipAvatar: { width: 18, height: 18, borderRadius: radios.full },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radios.full,
    paddingHorizontal: espaciado.e12, height: 36, marginTop: espaciado.e8,
  },
  optChip: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6 },
  sectionTitle: { fontSize: tipografia.micro, fontWeight: peso.maximo, textTransform: 'uppercase', marginTop: espaciado.e10, marginBottom: espaciado.e4, letterSpacing: 0.5 },
  check: {
    width: 20, height: 20, borderRadius: radios.full, borderWidth: trazo.base,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtn: { borderRadius: radios.full, paddingVertical: espaciado.e13, alignItems: 'center', marginTop: espaciado.e12 },
});
