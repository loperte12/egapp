/**
 * lifebook-hotel-valoraciones — LAS RESEÑAS, DEL LADO DEL HOTEL (C-1 · D5).
 *
 * ── POR QUÉ HAY UNA PANTALLA NUEVA Y NO UN BLOQUE EN EL PANEL ────────────────────
 * El panel del hotelero son dos partes (lo decidió el dueño el 2026-09-12): **«Hoy»** es lo que
 * CADUCA —personas esperando, dinero por cobrar— y **gestión** es lo que se CONFIGURA. Una reseña
 * sin responder no caduca: espera indefinidamente. Así que vive en gestión, y «Hoy» se queda siendo
 * la pantalla de lo urgente (que es lo que la hace útil).
 *
 * ── LA DECISIÓN DE VERDAD: UNA SOLA LISTA ──────────────────────────────────────
 * Se lee con la **ruta PÚBLICA** (`GET hotels/:shopId/reviews`), la misma que ve el huésped. Lo
 * cómodo sería una segunda consulta «del dueño» con más campos —y sería el segundo serializador que
 * se desincroniza del primero, que es exactamente el defecto que ya se corrigió en las reservas
 * (`hotelReservationShape`). Si el hotelero tiene que ver algo más que el huésped, se añade A LA
 * MISMA respuesta, no a otra.
 *
 * ── EL ORDEN NO ES ALFABÉTICO: PRIMERO LO QUE ESPERA ───────────────────────────
 * Las que no tienen respuesta van primero (son las únicas sobre las que se puede actuar), y detrás
 * las ya respondidas. Responder es un texto de 600 y **se puede reescribir**: el servidor hace
 * UPDATE, así que no hay «borrar respuesta» — se cambia la que había.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, peso, radios, tipografia, trazo, trazoIcono, useTheme } from '@egrouteplan/ui-kit';
import { Star } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, type HotelReview, type HotelReviewsPage } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { shortDate } from '../utils/datetime';

/** El tope del texto de la respuesta (`HotelReviewReplyDto`). */
const MAX_RESPUESTA = 600;

export default function HotelValoracionesScreen() {
  return (
    <AuthGate>
      <PanelGate>
        <Contenido />
      </PanelGate>
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [shopId, setShopId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [pagina, setPagina] = useState<HotelReviewsPage | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      // El `shopId` no viene de la ruta: sale de MI hotel. Así esta pantalla no puede pedir las
      // reseñas de otro por equivocación.
      const mio = await hotelApi.myHotel();
      const id = mio.hotel?.shopId ?? null;
      setShopId(id);
      setNombre(mio.hotel?.name ?? '');
      if (!id) { setPagina(null); return; }
      // El tope del servidor son 50; se piden las 50 y se dice cuántas hay en total.
      setPagina(await hotelApi.reviews(id, { limit: 50 }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las valoraciones.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const sinResponder = (pagina?.items ?? []).filter((r) => !r.reply);
  const respondidas = (pagina?.items ?? []).filter((r) => !!r.reply);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.volver}>
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>Valoraciones</Text>
      </View>

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.text.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 30, gap: espaciado.e12 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />
          }
        >
          {error ? (
            <View style={[styles.bloque, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
              <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
              <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
                <Text style={[styles.enlace, { color: colors.textPrimary }]}>Reintentar</Text>
              </Pressable>
            </View>
          ) : null}

          {!shopId && !error ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>
                Aquí aparecerán las valoraciones de tus huéspedes cuando publiques las habitaciones de tu
                alojamiento.
              </Text>
            </View>
          ) : null}

          {shopId ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>TU NOTA PÚBLICA</Text>
              {pagina && pagina.total > 0 ? (
                <View style={styles.filaNota}>
                  <Star
                    size={16}
                    color={pagina.publishesRating ? colors.text.warning : colors.textSecondary}
                    fill={pagina.publishesRating ? colors.text.warning : 'transparent'}
                    strokeWidth={trazoIcono.base}
                  />
                  <Text style={[styles.nota, { color: colors.textPrimary }]}>
                    {pagina.publishesRating
                      ? `${Number(pagina.average).toFixed(1)} · ${pagina.total} reseñas`
                      : `${pagina.total} reseña${pagina.total === 1 ? '' : 's'}, sin nota publicada`}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.sub, { color: colors.textPrimary }]}>
                  {nombre ? `${nombre} todavía no tiene valoraciones.` : 'Todavía no tienes valoraciones.'}
                </Text>
              )}
              {/* La misma [D-K] que ve el huésped, dicha también aquí: el hotelero tiene que saber
                  POR QUÉ su media no sale todavía, o parecerá un fallo de la app. */}
              {pagina && pagina.total > 0 && !pagina.publishesRating ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  La nota se publica a partir de 3 reseñas: con {pagina.total} todavía no se enseña la
                  media en tu ficha.
                </Text>
              ) : null}
              {pagina && pagina.total > pagina.items.length ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  Se enseñan las {pagina.items.length} más recientes de {pagina.total}.
                </Text>
              ) : null}
            </View>
          ) : null}

          {shopId && sinResponder.length ? (
            <>
              <Text style={[styles.seccion, { color: colors.textPrimary }]}>
                Sin responder ({sinResponder.length})
              </Text>
              {sinResponder.map((r) => (
                <Fila key={r.id} r={r} onRespondido={() => void cargar(true)} />
              ))}
            </>
          ) : null}

          {shopId && respondidas.length ? (
            <>
              <Text style={[styles.seccion, { color: colors.textPrimary }]}>
                Respondidas ({respondidas.length})
              </Text>
              {respondidas.map((r) => (
                <Fila key={r.id} r={r} onRespondido={() => void cargar(true)} />
              ))}
            </>
          ) : null}

          {shopId && pagina && pagina.total === 0 ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>
                Las escribe quien ha dormido aquí, cuando termina su estancia. No se pueden pedir ni
                comprar: es lo que las hace valer.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Una reseña con su respuesta. El texto de la respuesta es local a la fila (como el de la referencia
 * de la transferencia en «Mis reservas»): así se pueden escribir dos sin que se pisen.
 */
function Fila({ r, onRespondido }: { r: HotelReview; onRespondido: () => void }) {
  const { colors } = useTheme();
  const [texto, setTexto] = useState(r.reply ?? '');
  const [abierto, setAbierto] = useState(!r.reply);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await hotelApi.replyReview(r.id, texto.trim());
      setAbierto(false);
      onRespondido();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la respuesta.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={[styles.tarjeta, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.cab}>
        <Text style={[styles.quien, { color: colors.textPrimary }]} numberOfLines={1}>
          {r.guest?.name ?? 'Huésped'}
        </Text>
        <View style={styles.filaNota}>
          {/* La misma estrella y el mismo token que en toda la app ([D3]): `colors.text.warning`. */}
          <Star size={12} color={colors.text.warning} fill={colors.text.warning} strokeWidth={trazoIcono.base} />
          <Text style={[styles.notaChica, { color: colors.textPrimary }]}>{r.rating}</Text>
        </View>
      </View>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        {shortDate(String(r.createdAt).slice(0, 10))}
      </Text>
      {r.body ? <Text style={[styles.texto, { color: colors.textPrimary }]}>{r.body}</Text> : null}

      {r.reply && !abierto ? (
        <View style={[styles.respuesta, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.respuestaEtq, { color: colors.textSecondary }]}>Tu respuesta</Text>
          <Text style={[styles.texto, { color: colors.textPrimary }]}>{r.reply}</Text>
          <Pressable
            onPress={() => setAbierto(true)}
            accessibilityRole="button"
            accessibilityLabel="Cambiar mi respuesta a esta reseña"
          >
            <Text style={[styles.enlace, { color: colors.textPrimary }]}>Cambiar la respuesta</Text>
          </Pressable>
        </View>
      ) : abierto ? (
        <View style={{ gap: espaciado.e6, marginTop: espaciado.e6 }}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            multiline
            maxLength={MAX_RESPUESTA}
            placeholder="Responde en público: gracias, una disculpa, lo que hayas arreglado…"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Tu respuesta pública"
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{texto.length}/{MAX_RESPUESTA}</Text>
          <View style={styles.botones}>
            <Pressable
              onPress={() => void enviar()}
              disabled={enviando || !texto.trim()}
              accessibilityRole="button"
              accessibilityLabel="Publicar respuesta"
              accessibilityState={{ disabled: enviando || !texto.trim() }}
              style={[styles.boton, { backgroundColor: texto.trim() ? colors.primary : colors.border }]}
            >
              {enviando ? <ActivityIndicator color={brand.white} size="small" /> : <Text style={styles.botonTxt}>Publicar respuesta</Text>}
            </Pressable>
            {r.reply ? (
              <Pressable
                onPress={() => { setTexto(r.reply ?? ''); setAbierto(false); }}
                accessibilityRole="button"
                accessibilityLabel="Cancelar y dejar la respuesta que había"
                style={[styles.botonFantasma, { borderColor: colors.border }]}
              >
                <Text style={[styles.botonFantasmaTxt, { color: colors.textPrimary }]}>Cancelar</Text>
              </Pressable>
            ) : null}
          </View>
          {error ? <Text style={[styles.sub, { color: colors.text.danger }]}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: tipografia.display, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: tipografia.anchoFuerte, fontWeight: peso.maximo, flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bloque: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12, gap: espaciado.e4 },
  seccion: { fontSize: tipografia.fino, fontWeight: peso.maximo, marginTop: espaciado.e6 },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.maximo, letterSpacing: 0.6 },
  filaNota: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  nota: { fontSize: tipografia.subtitle, fontWeight: peso.maximo },
  notaChica: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  tarjeta: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12, gap: espaciado.e4 },
  cab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 },
  quien: { fontSize: tipografia.fino, fontWeight: peso.fuerte, flex: 1 },
  texto: { fontSize: tipografia.body, lineHeight: 20 },
  respuesta: { borderWidth: trazo.fino, borderRadius: radios.chip, padding: espaciado.e10, marginTop: espaciado.e6, gap: espaciado.e3 },
  respuestaEtq: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  input: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e10, minHeight: 80, fontSize: tipografia.body, textAlignVertical: 'top' },
  botones: { flexDirection: 'row', gap: espaciado.e8, alignItems: 'center' },
  boton: { flex: 1, height: altura.punto, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  botonTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },
  botonFantasma: { borderWidth: trazo.fino, borderRadius: radios.md, height: altura.punto, paddingHorizontal: espaciado.e12, alignItems: 'center', justifyContent: 'center' },
  botonFantasmaTxt: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 },
});
