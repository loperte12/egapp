/**
 * ChallengePlazaSheet — Parte 26 (G2-c): la PLAZA DE RETOS.
 *
 * Retos de la comunidad: cualquiera crea uno (objetivo + cuándo termina + premio
 * opcional), la gente se apunta y el detalle muestra el **ranking por orden de
 * inscripción**. Sirve para lo mismo en un grupo que en un 1 a 1, así que se
 * abre desde el panel «+» del chat con la acción «Plaza de retos».
 *
 * Pasos: `list` (retos abiertos, filtro por ciudad y por «los míos») ·
 * `create` (título, descripción, ciudad, premio y fecha de fin) ·
 * `detail` (ranking, apuntarse/borrarse y cerrar si es mío).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, ScrollText, Trophy, X } from 'lucide-react-native';
import { lifebookChallengesApi, type LbChallenge } from '../../api/lifebook';
import { LB_CITIES } from '../../constants/lifebook';
import { brand } from '@egrouteplan/ui-kit';
import { formaHoja } from './ui/Sheet';

const TITLE_MAX = 80;
const BODY_MAX = 400;
const PRIZE_MAX = 120;
const NOTE_MAX = 200;

type Step = 'list' | 'create' | 'detail';
/** Atajos de fecha de fin (días desde hoy). */
const ENDS = [
  { days: 1, label: 'Mañana' },
  { days: 7, label: 'En una semana' },
  { days: 30, label: 'En un mes' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Ciudad del usuario (filtro por defecto de la lista). */
  city?: string | null;
}

export function ChallengePlazaSheet({ visible, onClose, city }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('list');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<LbChallenge[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [filterCity, setFilterCity] = useState<string | null>(city ?? null);
  const [detail, setDetail] = useState<LbChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  // Crear
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [prize, setPrize] = useState('');
  const [newCity, setNewCity] = useState<string | null>(city ?? null);
  const [endsDays, setEndsDays] = useState<number | null>(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await lifebookChallengesApi.list({ state: 'open', city: filterCity ?? undefined, mine: onlyMine, limit: 30 });
      setList(res.challenges ?? []);
    } catch (e) {
      Alert.alert('Plaza de retos', e instanceof Error ? e.message : 'No se pudieron cargar los retos.');
      setList([]);
    } finally { setLoading(false); }
  }, [filterCity, onlyMine]);

  useEffect(() => {
    if (!visible) return;
    setStep('list'); setDetail(null); setOnlyMine(false);
    setTitle(''); setBody(''); setPrize(''); setEndsDays(7); setNewCity(city ?? null);
  }, [visible, city]);

  useEffect(() => { if (visible && step === 'list') void load(); }, [visible, step, load]);

  const abrirDetalle = async (id: string) => {
    setBusy(true);
    try {
      setDetail(await lifebookChallengesApi.detail(id));
      setStep('detail');
    } catch (e) {
      Alert.alert('Reto', e instanceof Error ? e.message : 'No se pudo abrir el reto.');
    } finally { setBusy(false); }
  };

  const apuntarme = async (c: LbChallenge, note?: string) => {
    setBusy(true);
    try {
      const updated = c.joinedByMe
        ? await lifebookChallengesApi.leave(c.id)
        : await lifebookChallengesApi.join(c.id, note);
      setDetail(updated);
      setList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      Alert.alert('Reto', e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally { setBusy(false); }
  };

  const crear = async () => {
    if (title.trim().length < 3) { Alert.alert('Reto', 'Ponle un título al reto (3 letras o más).'); return; }
    setBusy(true);
    try {
      const endsAt = endsDays ? new Date(Date.now() + endsDays * 24 * 3600 * 1000).toISOString() : undefined;
      const created = await lifebookChallengesApi.create({
        title: title.trim().slice(0, TITLE_MAX),
        body: body.trim().slice(0, BODY_MAX) || undefined,
        city: newCity ?? undefined,
        prize: prize.trim().slice(0, PRIZE_MAX) || undefined,
        endsAt,
      });
      setList((prev) => [created, ...prev]);
      setDetail(created);
      setStep('detail');
    } catch (e) {
      Alert.alert('Reto', e instanceof Error ? e.message : 'No se pudo crear el reto.');
    } finally { setBusy(false); }
  };

  const cerrarReto = (c: LbChallenge) => {
    Alert.alert('Cerrar el reto', 'Dejará de admitir participantes.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await lifebookChallengesApi.close(c.id);
            setDetail(updated);
            setList((prev) => prev.filter((x) => x.id !== updated.id));
          } catch (e) {
            Alert.alert('Reto', e instanceof Error ? e.message : 'No se pudo cerrar el reto.');
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const fin = (c: LbChallenge) => (c.endsAt
    ? new Date(c.endsAt).toLocaleDateString('es-GQ', { day: '2-digit', month: 'short' })
    : 'sin fecha de fin');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          {step !== 'list' ? (
            <Pressable onPress={() => setStep(step === 'detail' ? 'list' : 'list')} hitSlop={8} accessibilityLabel="Volver a la lista">
              <ArrowLeft size={18} color={colors.textPrimary} />
            </Pressable>
          ) : (
            <ScrollText size={18} color={colors.primary} />
          )}
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo, flex: 1, marginLeft: espaciado.e8 }}>
            {step === 'create' ? 'Crear un reto' : step === 'detail' ? 'Reto' : 'Plaza de retos'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {step === 'list' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Solo mis retos</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Los que yo he creado.</Text>
              </View>
              <Switch value={onlyMine} onValueChange={setOnlyMine} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e6, paddingVertical: espaciado.e10 }}>
              <Pressable onPress={() => setFilterCity(null)} accessibilityLabel="Todas las ciudades"
                style={[styles.chip, { backgroundColor: filterCity === null ? alpha(colors.primary, 0.14) : colors.surface, borderColor: filterCity === null ? colors.primary : 'transparent' }]}>
                <Text style={{ color: filterCity === null ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Todas</Text>
              </Pressable>
              {LB_CITIES.map((c) => (
                <Pressable key={c} onPress={() => setFilterCity(c)} accessibilityLabel={`Retos en ${c}`}
                  style={[styles.chip, { backgroundColor: filterCity === c ? alpha(colors.primary, 0.14) : colors.surface, borderColor: filterCity === c ? colors.primary : 'transparent' }]}>
                  <Text style={{ color: filterCity === c ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable onPress={() => setStep('create')} accessibilityLabel="Crear un reto"
              style={[styles.cta, { backgroundColor: alpha(colors.primary, 0.12), marginTop: 0 }]}>
              <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>＋  Crear un reto</Text>
            </Pressable>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e24 }} />
            ) : list.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e24, fontSize: tipografia.body }}>
                Todavía no hay retos abiertos{filterCity ? ` en ${filterCity}` : ''}. ¡Crea el primero!
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                {list.map((c) => (
                  <Pressable key={c.id} onPress={() => abrirDetalle(c.id)} accessibilityLabel={`Ver el reto ${c.title}`}
                    style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                      <Trophy size={14} color={brand.secondary} />
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body, flex: 1 }} numberOfLines={2}>{c.title}</Text>
                    </View>
                    {c.body ? (
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }} numberOfLines={2}>{c.body}</Text>
                    ) : null}
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e6 }}>
                      {c.entries} participante{c.entries === 1 ? '' : 's'} · {c.city ?? 'sin ciudad'} · hasta {fin(c)}
                      {c.prize ? ` · 🏆 ${c.prize}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                      <Pressable onPress={() => apuntarme(c)} accessibilityLabel={c.joinedByMe ? `Borrar me del reto ${c.title}` : `Apuntarme al reto ${c.title}`}
                        style={[styles.smallBtn, { backgroundColor: c.joinedByMe ? alpha(colors.primary, 0.12) : colors.primary }]}>
                        <Text style={{ color: c.joinedByMe ? colors.primary : brand.white, fontWeight: peso.titulo, fontSize: tipografia.caption }}>
                          {c.joinedByMe ? '✓ Apuntado' : 'Apuntarme'}
                        </Text>
                      </Pressable>
                      {c.mine ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>Es tuyo</Text> : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        ) : step === 'create' ? (
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={title} onChangeText={setTitle} maxLength={TITLE_MAX}
              placeholder="Título (p. ej. Reto 10 km)"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Título del reto"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <TextInput
              value={body} onChangeText={setBody} maxLength={BODY_MAX} multiline
              placeholder="¿En qué consiste? Reglas, hora, punto de encuentro…"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Descripción del reto"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, minHeight: 84, marginTop: espaciado.e8 }]}
            />
            <TextInput
              value={prize} onChangeText={setPrize} maxLength={PRIZE_MAX}
              placeholder="Premio (opcional)"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Premio del reto"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, marginTop: espaciado.e8 }]}
            />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, fontWeight: peso.maximo }}>CIUDAD</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e6 }}>
              {LB_CITIES.map((c) => (
                <Pressable key={c} onPress={() => setNewCity(newCity === c ? null : c)} accessibilityLabel={`Ciudad ${c}`}
                  style={[styles.chip, { backgroundColor: newCity === c ? alpha(colors.primary, 0.14) : colors.surface, borderColor: newCity === c ? colors.primary : 'transparent' }]}>
                  <Text style={{ color: newCity === c ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, fontWeight: peso.maximo }}>TERMINA</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e6 }}>
              {ENDS.map((e) => (
                <Pressable key={e.label} onPress={() => setEndsDays(e.days)} accessibilityLabel={`Termina ${e.label}`}
                  style={[styles.chip, { backgroundColor: endsDays === e.days ? alpha(colors.primary, 0.14) : colors.surface, borderColor: endsDays === e.days ? colors.primary : 'transparent' }]}>
                  <Text style={{ color: endsDays === e.days ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{e.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setEndsDays(null)} accessibilityLabel="Sin fecha de fin"
                style={[styles.chip, { backgroundColor: endsDays === null ? alpha(colors.primary, 0.14) : colors.surface, borderColor: endsDays === null ? colors.primary : 'transparent' }]}>
                <Text style={{ color: endsDays === null ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Sin fecha</Text>
              </Pressable>
            </View>
            <Pressable onPress={crear} disabled={busy} accessibilityLabel="Publicar el reto"
              style={[styles.cta, { backgroundColor: colors.primary }]}>
              {busy ? <ActivityIndicator size="small" color={brand.white} /> : (
                <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: 15 }}>Publicar reto</Text>
              )}
            </Pressable>
          </ScrollView>
        ) : detail ? (
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>{detail.title}</Text>
            {detail.body ? (
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, marginTop: espaciado.e6, lineHeight: 19 }}>{detail.body}</Text>
            ) : null}
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
              {detail.city ?? 'sin ciudad'} · hasta {fin(detail)}
              {detail.prize ? ` · 🏆 ${detail.prize}` : ''} · {detail.state === 'open' ? 'abierto' : 'cerrado'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>
              Lo creó {detail.author.fullName ?? 'alguien'}
            </Text>

            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e14, fontWeight: peso.maximo }}>
              RANKING · {detail.entries} PARTICIPANTE{detail.entries === 1 ? '' : 'S'}
            </Text>
            {(detail.members ?? []).length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, paddingVertical: espaciado.e10 }}>
                Nadie se ha apuntado todavía.
              </Text>
            ) : (
              (detail.members ?? []).map((m, i) => (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e8 }}>
                  <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body, width: 22 }}>{i + 1}º</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }} numberOfLines={1}>
                      {m.fullName ?? 'Usuario'}
                    </Text>
                    {m.note ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={2}>{m.note}</Text> : null}
                  </View>
                </View>
              ))
            )}

            {detail.state === 'open' ? (
              <Pressable onPress={() => apuntarme(detail)} disabled={busy} accessibilityLabel={detail.joinedByMe ? 'Borrar me del reto' : 'Apuntarme al reto'}
                style={[styles.cta, { backgroundColor: detail.joinedByMe ? alpha(colors.primary, 0.12) : colors.primary }]}>
                <Text style={{ color: detail.joinedByMe ? colors.primary : brand.white, fontWeight: peso.titulo, fontSize: 15 }}>
                  {detail.joinedByMe ? '✓ Apuntado · borrarme' : 'Apuntarme'}
                </Text>
              </Pressable>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, textAlign: 'center' }}>
                Este reto está cerrado: ya no admite participantes.
              </Text>
            )}
            {detail.mine && detail.state === 'open' ? (
              <Pressable onPress={() => cerrarReto(detail)} disabled={busy} accessibilityLabel="Cerrar el reto"
                style={[styles.cta, { backgroundColor: alpha(colors.danger, 0.12) }]}>
                <Text style={{ color: colors.danger, fontWeight: peso.titulo, fontSize: tipografia.body }}>Cerrar el reto</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e10 },
  input: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, borderWidth: trazo.fino },
  card: { borderRadius: 14, padding: espaciado.e12, marginTop: espaciado.e10 },
  smallBtn: { borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8 },
  cta: { marginTop: espaciado.e14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e13 },
});
