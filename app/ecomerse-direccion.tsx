/**
 * Formulario de una dirección — alta y edición (Fase 2 del pie del Mercado).
 *
 * UNA PANTALLA PARA LAS DOS COSAS, PORQUE SON LA MISMA COSA
 * Con `?id=` edita y sin él crea. Los campos son los mismos y las reglas también, así que separarlas
 * en dos ficheros garantizaría que un día divergieran (una validaría el teléfono y la otra no).
 *
 * LA CIUDAD NO SE TECLEA, SE ELIGE — Y LAS CIUDADES SALEN DE LAS ZONAS
 * No hay una lista de ciudades escrita a mano en ninguna parte: se piden TODAS las zonas de reparto
 * (`deliveryZones()` sin filtro) y las ciudades son las que aparecen en ellas. Si mañana se abre
 * reparto en otra ciudad, aparece aquí sola. Lo mismo con las zonas: al elegir ciudad se ofrecen
 * SÓLO las suyas, que es lo que el servidor exige (una dirección de Malabo con zona de Bata se
 * rechaza, porque cobraría la tarifa de otra ciudad).
 *
 * LA ZONA ES OPCIONAL, Y SE DICE
 * Se puede guardar la dirección sin zona («te la piden al pagar»). El checkout vuelve a preguntarla
 * en ese caso, en vez de inventarse una tarifa.
 *
 * LA PREDETERMINADA SÓLO SE MARCA, NUNCA SE DESMARCA DESDE AQUÍ
 * Mandar `isDefault: false` dejaría la agenda con direcciones pero sin ninguna elegida, y eso no le
 * sirve a nadie: para cambiar de predeterminada se marca OTRA. Por eso el cuerpo sólo lleva
 * `isDefault` cuando vale `true`, y editar el teléfono no toca la bandera.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check } from 'lucide-react-native';
import {
  FormField, PrimaryButton, brand, espaciado, icono, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseAddressInput, type EcomerseDeliveryZone } from '../api/ecomerse';

const ETIQUETAS = ['Casa', 'Trabajo', 'Otro'] as const;

const mensajeDe = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : 'No se pudo guardar. Inténtalo otra vez.';

export default function EcomerseDireccionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = typeof id === 'string' && id.length > 0;

  const [zonas, setZonas] = useState<EcomerseDeliveryZone[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [detail, setDetail] = useState('');
  const [landmark, setLandmark] = useState('');
  const [label, setLabel] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  /** Las ciudades que tienen reparto, derivadas de las zonas. Sin lista escrita a mano. */
  const ciudades = useMemo(() => {
    const m = new Map<string, EcomerseDeliveryZone[]>();
    for (const z of zonas) m.set(z.city, [...(m.get(z.city) ?? []), z]);
    return [...m.entries()];
  }, [zonas]);

  const zonasDeCiudad = useMemo(() => ciudades.find(([c]) => c === city)?.[1] ?? [], [ciudades, city]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [todasZonas, direcciones] = await Promise.all([
          ecomerseApi.deliveryZones(),
          editando ? ecomerseApi.addresses() : Promise.resolve([]),
        ]);
        if (!vivo) return;
        setZonas(todasZonas);
        /* La ciudad por defecto: la de la primera zona que exista. Así el formulario nace usable
           sin que el comprador tenga que elegir de una lista de una sola opción. */
        setCity((c) => c || todasZonas[0]?.city || '');
        if (editando) {
          const d = direcciones.find((x) => x.id === id);
          if (!d) {
            Alert.alert('Dirección no encontrada', 'Puede que la hayas borrado desde otro sitio.', [
              { text: 'Vale', onPress: () => router.back() },
            ]);
            return;
          }
          setRecipient(d.recipient); setPhone(d.phone); setCity(d.city);
          setZoneId(d.zoneId ?? ''); setDetail(d.detail);
          setLandmark(d.landmark ?? ''); setLabel(d.label ?? ''); setIsDefault(d.isDefault);
        }
      } catch (e) {
        if (vivo) Alert.alert('No se pudo abrir', mensajeDe(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
    // `id` y `editando` son la identidad de la pantalla: no cambian sin remontarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Al cambiar de ciudad se suelta la zona si era de la otra: una zona de Bata con ciudad Malabo
   *  la rechaza el servidor, así que es mejor no dejar construir esa combinación. */
  const elegirCiudad = (c: string) => {
    setCity(c);
    const z = zonas.find((x) => x.id === zoneId);
    if (z && z.city !== c) setZoneId('');
  };

  const guardar = useCallback(async () => {
    const r = recipient.trim(), t = phone.trim(), d = detail.trim();
    if (r.length < 2) { Alert.alert('Nombre', 'Di quién recibe la entrega (mín. 2 caracteres).'); return; }
    if (t.length < 6) { Alert.alert('Teléfono', 'El teléfono de contacto es obligatorio.'); return; }
    if (!city) { Alert.alert('Ciudad', 'Elige la ciudad de la entrega.'); return; }
    if (d.length < 5) { Alert.alert('Dirección', 'La dirección necesita al menos 5 caracteres.'); return; }

    const body: EcomerseAddressInput = {
      recipient: r, phone: t, city, zoneId: zoneId || null, detail: d,
      landmark: landmark.trim() || null, label: label.trim() || null,
    };
    /* Sólo viaja cuando vale `true`: ver la cabecera. Editar el teléfono no debe tocar la bandera,
       y por eso NO se manda `false` en el caso normal. */
    if (isDefault) body.isDefault = true;

    setBusy(true);
    try {
      if (editando) await ecomerseApi.updateAddress(String(id), body);
      else await ecomerseApi.createAddress(body);
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', mensajeDe(e));
    } finally {
      setBusy(false);
    }
  }, [recipient, phone, city, zoneId, detail, landmark, label, isDefault, editando, id, router]);

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]}>
          {editando ? 'Editar dirección' : 'Nueva dirección'}
        </Text>
        <View style={{ width: icono.lg }} />
      </View>

      {cargando ? (
        <ActivityIndicator color={colors.text.primary} style={{ marginTop: espaciado.e32 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + espaciado.e32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <FormField
            label="Quién recibe"
            value={recipient}
            onChangeText={setRecipient}
            placeholder="Ej: María Nsue"
            maxLength={80}
          />
          <FormField
            label="Teléfono de contacto"
            value={phone}
            onChangeText={setPhone}
            placeholder="Ej: +240 222 000 123"
            keyboardType="phone-pad"
            maxLength={24}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Ciudad</Text>
          <View style={styles.chips}>
            {ciudades.map(([c]) => {
              const activo = c === city;
              return (
                <Pressable
                  key={c}
                  onPress={() => elegirCiudad(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activo }}
                  accessibilityLabel={`Ciudad ${c}`}
                  style={[styles.chip, {
                    backgroundColor: activo ? colors.primary : colors.surface,
                    borderColor: activo ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.chipTexto, { color: activo ? brand.white : colors.textPrimary }]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Zona de reparto (opcional — sin ella, te la pedimos al pagar)
          </Text>
          <View style={styles.chips}>
            {zonasDeCiudad.map((z) => {
              const activo = z.id === zoneId;
              return (
                <Pressable
                  key={z.id}
                  onPress={() => setZoneId(activo ? '' : z.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activo }}
                  accessibilityLabel={`Zona ${z.label}`}
                  style={[styles.chip, {
                    backgroundColor: activo ? colors.primary : colors.surface,
                    borderColor: activo ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.chipTexto, { color: activo ? brand.white : colors.textPrimary }]}>{z.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <FormField
            label="Dirección"
            value={detail}
            onChangeText={setDetail}
            placeholder="Ej: Calle de los Almendros, casa 14"
            maxLength={240}
          />
          <FormField
            label="Punto de referencia (opcional)"
            value={landmark}
            onChangeText={setLandmark}
            placeholder="Ej: frente al mercado central, portón verde"
            maxLength={120}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Etiqueta (opcional)</Text>
          <View style={styles.chips}>
            {ETIQUETAS.map((e) => {
              const activo = label.trim().toLowerCase() === e.toLowerCase();
              return (
                <Pressable
                  key={e}
                  onPress={() => setLabel(activo ? '' : e)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activo }}
                  accessibilityLabel={`Etiqueta ${e}`}
                  style={[styles.chip, {
                    backgroundColor: activo ? colors.primary : colors.surface,
                    borderColor: activo ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.chipTexto, { color: activo ? brand.white : colors.textPrimary }]}>{e}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setIsDefault((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isDefault }}
            accessibilityLabel="Usar esta dirección como predeterminada"
            style={[styles.casilla, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={[styles.marca, {
              borderColor: isDefault ? colors.primary : colors.border,
              backgroundColor: isDefault ? colors.primary : 'transparent',
            }]}>
              {isDefault ? <Check size={icono.sm} color={brand.white} /> : null}
            </View>
            <View style={styles.casillaTexto}>
              <Text style={[styles.casillaTitulo, { color: colors.textPrimary }]}>Usar como predeterminada</Text>
              <Text style={[styles.casillaNota, { color: colors.textSecondary }]}>
                El checkout la propondrá sin preguntarte. Si ya tenías otra, esa dejará de serlo.
              </Text>
            </View>
          </Pressable>

          <View style={styles.pieBoton}>
            <PrimaryButton
              title={editando ? 'Guardar cambios' : 'Guardar dirección'}
              onPress={() => void guardar()}
              loading={busy}
              disabled={busy}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  cabeceraTitulo: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  form: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16, gap: espaciado.e12 },
  label: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginBottom: espaciado.e8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  chip: {
    borderRadius: radios.sm,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e8,
  },
  chipTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  casilla: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaciado.e12,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    padding: espaciado.e12,
    marginTop: espaciado.e8,
  },
  marca: {
    /* No hay token de «casilla» en la escala: se reutiliza el de icono mediano (20), que es el
       tamaño natural de una casilla y el que ya usa el kit para sus controles. */
    width: icono.md,
    height: icono.md,
    borderRadius: radios.sm,
    borderWidth: trazo.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casillaTexto: { flex: 1 },
  casillaTitulo: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  casillaNota: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  pieBoton: { marginTop: espaciado.e16 },
});
