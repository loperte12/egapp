/**
 * lifebook-hotel-resena — VALORAR UNA ESTANCIA (C-1).
 *
 * POR QUÉ ESTA PANTALLA NO SE ABRE DESDE LA FICHA DEL HOTEL
 * El permiso de escribir una reseña no es la compra: es la ESTANCIA. Así que la puerta está donde
 * está la estancia —«Mis reservas»— y no en la ficha, que la ve cualquiera. El servidor lo impone
 * igual (tuya, de ese alojamiento, ya `checked_out`); esta pantalla solo no ofrece lo imposible.
 *
 * LAS TRES COSAS QUE DICE Y NO SE PUEDEN DEDUCIR SOLAS
 *   · el texto es OPCIONAL: una reseña de solo estrellas es una reseña (así lo decidió `026`);
 *   · se puede BORRAR dentro de un plazo, y NO se edita — borrar y volver a escribir sí, editar no.
 *     Se dice con el plazo real del servidor, no con uno inventado aquí (`REVIEWS_DELETE_DAYS`);
 *   · la nota del alojamiento no sale con la primera reseña: se publica a partir de la tercera
 *     ([D-K]). Sin eso, alguien escribe una estrella, no la ve publicada y cree que falló.
 *
 * EL CONTROL DE ESTRELLAS ES EL DEL KIT (`Estrellas`): la cascada al elegir y `role="radio"` por
 * estrella. Escribir aquí un quinto selector a mano sería volver a tener cinco.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Estrellas, PrimaryButton, alpha, espaciado, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { REVIEWS_DELETE_DAYS, hotelApi } from '../api/hotel';
import { ApiError } from '../api/httpClient';

/** El tope del servidor para el texto (`HotelReviewDto`). */
const MAX_TEXTO = 600;

/** La palabra de cada nota: el color y el relleno no son la única señal. */
const ETIQUETA_NOTA = ['', 'Muy mal', 'Mal', 'Normal', 'Bien', 'Excelente'] as const;

export default function HotelResenaScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{
    reservationId?: string; shopId?: string; shopName?: string; roomName?: string;
  }>();
  const shopId = String(p.shopId ?? '');
  const reservationId = String(p.reservationId ?? '');
  const nombre = String(p.shopName ?? 'el alojamiento');
  const habitacion = String(p.roomName ?? '');

  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se puede publicar con estrellas y sin texto; sin estrellas no hay reseña que publicar.
  const puedePublicar = nota >= 1 && !!shopId && !!reservationId && !enviando;

  const publicar = async () => {
    if (!puedePublicar) return;
    setEnviando(true);
    setError(null);
    try {
      await hotelApi.createReview(shopId, {
        reservationId,
        rating: nota,
        // Se manda el texto solo si hay algo que mandar: el servidor lo trata como opcional, y
        // una cadena de espacios sería una reseña con «cuerpo» vacío.
        ...(texto.trim() ? { body: texto.trim() } : {}),
      });
      // Se vuelve a «Mis reservas», que ya refleja el cambio porque se refresca al recuperar el foco.
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo publicar tu valoración. Inténtalo otra vez.');
      setEnviando(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={12}
          style={styles.volver}
        >
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
          Valorar la estancia
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: espaciado.e14, paddingBottom: insets.bottom + 30, gap: espaciado.e14,
          }}
        >
          {/* ── A quién se valora: el hotel y la habitación, para no confundir estancias ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]}>{nombre}</Text>
            {habitacion ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>{habitacion}</Text>
            ) : null}
          </View>

          {/* ── Las estrellas ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.pregunta, { color: colors.textPrimary }]}>
              ¿Cómo fue tu estancia?
            </Text>
            <Estrellas
              valor={nota}
              onElegir={setNota}
              tamano={40}
              queSeValora={nombre}
              texto={nota ? `${nota} de 5 · ${ETIQUETA_NOTA[nota]}` : 'Toca las estrellas para poner tu nota'}
            />
          </View>

          {/* ── El texto, opcional y dicho ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.pregunta, { color: colors.textPrimary }]}>
              Cuéntalo (opcional)
            </Text>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={MAX_TEXTO}
              placeholder="La habitación, la limpieza, la llegada, si el barrio es ruidoso…"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Tu opinión, opcional"
              style={[styles.input, {
                color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface,
              }]}
            />
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {texto.length}/{MAX_TEXTO}
            </Text>
          </View>

          {/* ── Las reglas, antes de publicar y no después ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.sub, { color: colors.textPrimary }]}>
              · Tu reseña vale para ESTA estancia: no se puede editar, pero puedes borrarla durante{' '}
              {REVIEWS_DELETE_DAYS} días y escribirla otra vez.
            </Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              · La nota del alojamiento no sale con la primera reseña: aparece a partir de la tercera.
            </Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              · El alojamiento puede responderte; tu texto no lo cambia nadie.
            </Text>
          </View>

          {error ? (
            <View style={[styles.bloque, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
              <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>
                {error}
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            title={nota ? `Publicar valoración · ${nota} de 5` : 'Publicar valoración'}
            onPress={() => void publicar()}
            loading={enviando}
            disabled={!puedePublicar}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: tipografia.display, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: tipografia.anchoFuerte, fontWeight: peso.maximo, flex: 1 },
  bloque: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12, gap: espaciado.e6 },
  nombre: { fontSize: tipografia.anchoFuerte, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  pregunta: { fontSize: tipografia.cuerpo, fontWeight: peso.fuerte },
  input: {
    borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12,
    minHeight: 110, fontSize: tipografia.body, textAlignVertical: 'top',
  },
});
