/**
 * Mis direcciones de entrega — la agenda del comprador (Fase 2 del pie del Mercado).
 *
 * QUÉ RESUELVE
 * La libreta de direcciones que faltaba. Hasta hoy el checkout pedía la dirección en un campo de
 * texto libre y el comprador la re-tecleaba en cada compra. Aquí se guardan, se editan, se borran y
 * una de ellas es la predeterminada: la que el checkout propone sin preguntar.
 *
 * UNA SOLA PREDETERMINADA — Y LO GARANTIZA LA BASE, NO ESTA PANTALLA
 * «Marcar predeterminada» llama al servidor, que desmarca la anterior en la misma transacción; por
 * debajo hay un índice único parcial (`uq_ec_addr_default`) que hace imposible tener dos. Esta
 * pantalla, por tanto, NO vigila esa regla: la cumple quien la escribe, y aquí sólo se pinta lo que
 * el servidor devuelve.
 *
 * POR QUÉ RECARGA AL ENTRAR EN FOCO
 * Volver del formulario no remonta esta pantalla —queda montada en la pila—, así que con un
 * `useEffect` a secas la lista seguiría sin la dirección recién guardada. Mismo `useFocusEffect` que
 * el perfil y las demás listas del proyecto.
 *
 * BORRAR ES DE VERDAD, Y SE PREGUNTA
 * Un `DELETE` real, no un «removed»: aquí no cuelga ningún historial, porque cada pedido guarda su
 * propio texto congelado (`ecomerse_orders.delivery_address`). Aun así se confirma antes, y si la
 * que se borra es la predeterminada el aviso dice quién hereda.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Briefcase, Check, Home, MapPin, Pencil, Plus, Tag, Trash2,
} from 'lucide-react-native';
import {
  EmptyState, PrimaryButton, brand, espaciado, icono, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseAddress } from '../api/ecomerse';
import { useSession } from '../state/session';

type Icono = React.ComponentType<{ size?: number; color?: string }>;

/**
 * El icono de cada etiqueta. `label` es TEXTO LIBRE en la base (el DTO no lo cierra), así que esto
 * es sólo pintura: una etiqueta que no conocemos cae en el alfiler y no se pierde nada.
 */
const ICONO_ETIQUETA: Record<string, Icono> = {
  casa: Home,
  trabajo: Briefcase,
  otro: Tag,
};

const iconoDeEtiqueta = (label: string | null): Icono =>
  ICONO_ETIQUETA[(label ?? '').trim().toLowerCase()] ?? MapPin;

/** El texto del error del servidor si lo hay; si no, uno que no miente sobre lo que pasó. */
const mensajeDe = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : 'No se pudo completar. Inténtalo otra vez.';

export default function EcomerseDireccionesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const [lista, setLista] = useState<EcomerseAddress[]>([]);
  const [cargando, setCargando] = useState(true);
  const [intentado, setIntentado] = useState(false);
  const [fallo, setFallo] = useState(false);
  /** El id de la fila que está hablando con el servidor: bloquea SUS botones, no los de las demás. */
  const [ocupada, setOcupada] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!isAuthenticated) { setLista([]); setCargando(false); setIntentado(true); return; }
    setCargando(true);
    try {
      setLista(await ecomerseApi.addresses());
      setFallo(false);
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
      setIntentado(true);
    }
  }, [isAuthenticated]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const marcarPredeterminada = async (d: EcomerseAddress) => {
    if (d.isDefault || ocupada) return;
    setOcupada(d.id);
    try {
      await ecomerseApi.setDefaultAddress(d.id);
      await cargar();
    } catch (e) {
      Alert.alert('No se pudo marcar', mensajeDe(e));
    } finally {
      setOcupada(null);
    }
  };

  const confirmarBorrado = async (d: EcomerseAddress) => {
    setOcupada(d.id);
    try {
      await ecomerseApi.deleteAddress(d.id);
      await cargar();
    } catch (e) {
      Alert.alert('No se pudo borrar', mensajeDe(e));
    } finally {
      setOcupada(null);
    }
  };

  const borrar = (d: EcomerseAddress) => {
    Alert.alert(
      '¿Borrar esta dirección?',
      d.isDefault
        ? 'Es tu dirección predeterminada: si te queda alguna otra, pasará a serlo.'
        : 'Los pedidos que ya hiciste guardan su propia copia y no cambian.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => void confirmarBorrado(d) },
      ],
    );
  };

  const abrirFormulario = (id?: string) =>
    router.push((id ? `/ecomerse-direccion?id=${id}` : '/ecomerse-direccion') as never);

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]}>Direcciones de entrega</Text>
        <Pressable
          onPress={() => abrirFormulario()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Añadir una dirección"
        >
          <Plus size={icono.lg} color={colors.text.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.lista, { paddingBottom: insets.bottom + espaciado.e32 }]}>
        {!isAuthenticated ? (
          <EmptyState
            emoji="🔐"
            titulo="Inicia sesión"
            texto="Las direcciones de entrega van con tu cuenta: entra y podrás guardar las que quieras."
          />
        ) : cargando && !intentado ? (
          <ActivityIndicator color={colors.text.primary} style={{ marginTop: espaciado.e32 }} />
        ) : fallo ? (
          <EmptyState
            emoji="📡"
            titulo="No se pudieron cargar"
            texto="No hemos podido leer tus direcciones. Toca y lo intentamos otra vez."
            accionLabel="Reintentar"
            onAccion={() => void cargar()}
          />
        ) : lista.length === 0 ? (
          <EmptyState
            emoji="📍"
            titulo="Todavía no tienes direcciones"
            texto="Guarda dónde quieres recibir tus pedidos y el checkout dejará de pedirte que lo escribas cada vez."
            accionLabel="Añadir una dirección"
            onAccion={() => abrirFormulario()}
            accionPrimaria
          />
        ) : (
          <>
            {lista.map((d) => {
              const Icono = iconoDeEtiqueta(d.label);
              const trabajando = ocupada === d.id;
              return (
                <View
                  key={d.id}
                  style={[
                    styles.tarjeta,
                    { backgroundColor: colors.card, borderColor: d.isDefault ? colors.primary : colors.border },
                  ]}
                >
                  <View style={styles.filaSuperior}>
                    <View style={[styles.filaIcono, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Icono size={icono.sm} color={colors.text.primary} />
                    </View>
                    <View style={styles.textoCabecera}>
                      <View style={styles.nombreFila}>
                        <Text style={[styles.nombre, { color: colors.textPrimary }]} numberOfLines={1}>
                          {d.recipient}
                        </Text>
                        {d.label ? (
                          <View style={[styles.sello, { borderColor: colors.border }]}>
                            <Text style={[styles.selloTexto, { color: colors.textSecondary }]} numberOfLines={1}>
                              {d.label}
                            </Text>
                          </View>
                        ) : null}
                        {d.isDefault ? (
                          <View style={[styles.sello, styles.selloDefault, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                            <Text style={[styles.selloTexto, styles.selloTextoDefault]}>Predeterminada</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.telefono, { color: colors.textSecondary }]} numberOfLines={1}>
                        {d.phone}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.detalle, { color: colors.textPrimary }]}>{d.detail}</Text>
                  {d.landmark ? (
                    <Text style={[styles.nota, { color: colors.textSecondary }]}>{d.landmark}</Text>
                  ) : null}
                  {/* La ciudad y la zona se pintan juntas: la zona es lo que decide la tarifa del
                      agente, así que «de dónde es» y «cuánto cuesta» son el mismo dato. */}
                  <Text style={[styles.nota, { color: colors.textSecondary }]}>
                    {d.zoneLabel ? `${d.city} · ${d.zoneLabel}` : `${d.city} · sin zona (te la piden al pagar)`}
                  </Text>

                  <View style={[styles.acciones, { borderTopColor: colors.border }]}>
                    {d.isDefault ? (
                      <View style={styles.accion}>
                        <Check size={icono.sm} color={colors.textSecondary} />
                        <Text style={[styles.accionTexto, { color: colors.textSecondary }]}>Predeterminada</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => void marcarPredeterminada(d)}
                        disabled={trabajando}
                        accessibilityRole="button"
                        accessibilityLabel={`Usar la dirección de ${d.recipient} como predeterminada`}
                        style={({ pressed }) => [styles.accion, { opacity: pressed || trabajando ? 0.5 : 1 }]}
                      >
                        <Check size={icono.sm} color={colors.text.primary} />
                        <Text style={[styles.accionTexto, { color: colors.text.primary }]}>Usar por defecto</Text>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => abrirFormulario(d.id)}
                      disabled={trabajando}
                      accessibilityRole="button"
                      accessibilityLabel={`Editar la dirección de ${d.recipient}`}
                      style={({ pressed }) => [styles.accion, { opacity: pressed || trabajando ? 0.5 : 1 }]}
                    >
                      <Pencil size={icono.sm} color={colors.textPrimary} />
                      <Text style={[styles.accionTexto, { color: colors.textPrimary }]}>Editar</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => borrar(d)}
                      disabled={trabajando}
                      accessibilityRole="button"
                      accessibilityLabel={`Borrar la dirección de ${d.recipient}`}
                      style={({ pressed }) => [styles.accion, { opacity: pressed || trabajando ? 0.5 : 1 }]}
                    >
                      <Trash2 size={icono.sm} color={colors.text.danger} />
                      <Text style={[styles.accionTexto, { color: colors.text.danger }]}>Borrar</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <View style={styles.pieBoton}>
              <PrimaryButton title="Añadir una dirección" onPress={() => abrirFormulario()} />
            </View>
          </>
        )}
      </ScrollView>
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
  lista: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16 },
  tarjeta: {
    borderRadius: radios.lg,
    borderWidth: trazo.fino,
    padding: espaciado.e16,
    marginBottom: espaciado.e12,
  },
  filaSuperior: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 },
  filaIcono: {
    width: 36,
    height: 36,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoCabecera: { flex: 1 },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, flexWrap: 'wrap' },
  nombre: { fontSize: tipografia.body, fontWeight: peso.titulo },
  sello: {
    borderRadius: radios.sm,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e8,
    paddingVertical: espaciado.e4 / 2,
  },
  selloDefault: {},
  selloTexto: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  selloTextoDefault: { color: brand.white },
  telefono: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  detalle: { fontSize: tipografia.body, marginTop: espaciado.e12 },
  nota: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  acciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e16,
    marginTop: espaciado.e12,
    paddingTop: espaciado.e12,
    borderTopWidth: trazo.fino,
  },
  accion: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  accionTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  pieBoton: { marginTop: espaciado.e8 },
});
