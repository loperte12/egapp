/**
 * La ficha de UNA reclamación — `/ecomerse-perfil-reembolso?id=<uuid>`.
 *
 * Cuelga de `/ecomerse-perfil` por el mismo motivo que la lista: el pie enciende «Perfil» comparando
 * el prefijo del pathname (`PieDelMercado.tsx:89`). Ver la cabecera de `ecomerse-perfil-reembolsos.tsx`.
 *
 * PIDE LA FILA, NO LA BUSCA EN LA LISTA
 * Podría traerse las reclamaciones y quedarse con la suya —es lo que hace la pantalla de favoritos—,
 * pero la lista viene recortada a 100: una reclamación propia que cayera fuera de esa ventana se
 * leería como «no existe» teniéndola. `GET /ecomerse/disputes/:id` va a por la fila, sin ventana.
 *
 * EL VEREDICTO SE LEE DEL MISMO SITIO QUE EN LA LISTA
 * El rótulo y el color salen de `veredictoDe()`, del módulo compartido: si la lista y la ficha los
 * calcularan por su cuenta, la misma reclamación podría llamarse «Con reembolso» en una y «Éxito» en
 * la otra. La ficha añade lo que la lista no cabe —el texto del administrador, las fotos de la
 * evidencia y las fechas—, pero no reinterpreta el estado.
 *
 * NO SE INVENTA UN BOTÓN PARA EL PEDIDO
 * No existe una pantalla de pedido suelta a la que enlazar: el detalle del pedido vive dentro de la
 * lista de pedidos. Así que en vez de prometer una ruta que no hay, se ofrece «Ver mis pedidos» y se
 * dice la referencia corta para poder encontrarlo. Un botón que no lleva a donde dice es peor que no
 * tenerlo.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ImageOff } from 'lucide-react-native';
import {
  EmptyState, Precio, espaciado, icono, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseDispute } from '../api/ecomerse';
import { formatDateTime } from '../utils/formatHelpers';
import { useSession } from '../state/session';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { FichaArticulo } from '../components/ecomerse/FichaArticulo';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';
import { veredictoDe } from '../components/ecomerse/estadosReclamacion';

/** Una fila «etiqueta — valor». Se repite cinco veces: es lo que justifica que sea una pieza. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dato}>
      <Text style={[styles.datoEtiqueta, { color: colors.textSecondary }]}>{etiqueta}</Text>
      <View style={styles.datoValor}>{children}</View>
    </View>
  );
}

export default function EcomerseReembolsoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const sinLeer = useSinLeerMercado();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [reclamo, setReclamo] = useState<EcomerseDispute | null>(null);
  const [cargando, setCargando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  const cargar = useCallback(async () => {
    if (!isAuthenticated || !id) { setReclamo(null); setIntentado(true); return; }
    setCargando(true);
    try {
      setReclamo(await ecomerseApi.dispute(String(id)));
    } catch {
      setReclamo(null);
    } finally {
      setCargando(false);
      setIntentado(true);
    }
  }, [isAuthenticated, id]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const def = reclamo ? veredictoDe(reclamo.outcome) : null;
  /* Sin `id` en la URL no se ha pedido nada: es un caso distinto de «se pidió y no existe», y
     confundirlos daría un «no encontrada» a quien llegó por un enlace roto. */
  const sinId = !id;
  const noExiste = !!id && intentado && !cargando && reclamo === null;

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.cabeceraTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
          Reclamación
        </Text>
        <View style={styles.hueco} />
      </View>

      {!isAuthenticated ? (
        <View style={styles.centro}>
          <EmptyState
            emoji="🔐"
            titulo="Entra para ver la reclamación"
            texto="Las reclamaciones van con tu cuenta: sin sesión no hay nada que enseñar."
            accionLabel="Iniciar sesión"
            accionPrimaria
            onAccion={() => router.push('/auth' as never)}
          />
        </View>
      ) : sinId || noExiste ? (
        <View style={styles.centro}>
          {/* `noExiste` incluye el caso legítimo de una reclamación AJENA: el servidor contesta 404 y
              no 403, así que desde aquí no se puede distinguir «no existe» de «no es tuya» — que es
              justo lo que se quiere, porque a un tercero no le toca saber que existe. */}
          <EmptyState
            emoji={sinId ? '🧾' : '🔎'}
            titulo={sinId ? 'No has elegido ninguna reclamación' : 'Esa reclamación no está a tu nombre'}
            texto={
              sinId
                ? 'Abre una desde la lista de reembolsos.'
                : 'Puede que se haya abierto desde otra cuenta. Vuelve a la lista para ver las tuyas.'
            }
            accionLabel="Ver mis reclamaciones"
            onAccion={() => router.replace('/ecomerse-perfil-reembolsos' as never)}
          />
        </View>
      ) : cargando && !reclamo ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.text.primary} />
        </View>
      ) : reclamo && def ? (
        <ScrollView contentContainerStyle={{ paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e24 }}>
          {/* El veredicto, con el mismo tratamiento que en la lista: pastilla sólida y un párrafo que
              dice qué significa. */}
          <View style={styles.bloqueVeredicto}>
            <View style={[styles.pastilla, { backgroundColor: colors[def.color] }]}>
              <Text style={[styles.pastillaTexto, { color: colors[def.colorTexto] }]}>{def.label}</Text>
            </View>
            <Text style={[styles.veredictoNota, { color: colors.textSecondary }]}>{def.nota}</Text>
          </View>

          {/* El sujeto: el artículo reclamado, tal como se compró. */}
          <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {reclamo.product ? (
              <FichaArticulo articulo={reclamo.product} />
            ) : (
              /* Sin líneas en el pedido no hay artículo que enseñar, y se dice: un hueco vacío se
                 leería como un fallo de carga. */
              <View style={styles.sinArticulo}>
                <ImageOff size={icono.md} color={colors.textSecondary} />
                <Text style={[styles.sinArticuloTexto, { color: colors.textSecondary }]}>
                  Este pedido no guardó el detalle del artículo.
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.tarjetaTitulo, { color: colors.textPrimary }]}>Lo que reclamaste</Text>
            <Text style={[styles.motivo, { color: colors.textPrimary }]}>{reclamo.reason}</Text>
            <Text style={[styles.fecha, { color: colors.textSecondary }]}>
              Abierta el {formatDateTime(reclamo.createdAt)}
            </Text>

            {/* La evidencia. Si no hay, se dice — no se deja un hueco mudo que parezca no cargado. */}
            {reclamo.evidence.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.evidencia}>
                {reclamo.evidence.map((url) => (
                  <Image key={url} source={{ uri: url }} style={[styles.evidenciaFoto, { borderColor: colors.border }]} contentFit="cover" />
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.fecha, { color: colors.textSecondary }]}>
                No adjuntaste fotos.
              </Text>
            )}
          </View>

          {/* Qué pasó. Mientras está abierta se dice eso y nada más: no hay veredicto que dar. */}
          <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.tarjetaTitulo, { color: colors.textPrimary }]}>Qué pasó</Text>
            {reclamo.status === 'open' ? (
              <Text style={[styles.motivo, { color: colors.textSecondary }]}>
                El administrador todavía la está revisando. Te avisaremos cuando decida.
              </Text>
            ) : (
              <>
                {reclamo.resolution ? (
                  <Text style={[styles.motivo, { color: colors.textPrimary }]}>{reclamo.resolution}</Text>
                ) : (
                  /* Resuelta sin texto del administrador. Se dice tal cual en vez de rellenar con una
                     frase de plantilla que nadie escribió. */
                  <Text style={[styles.motivo, { color: colors.textSecondary }]}>
                    El administrador no dejó una nota.
                  </Text>
                )}
                {reclamo.resolvedAt ? (
                  <Text style={[styles.fecha, { color: colors.textSecondary }]}>
                    Resuelta el {formatDateTime(reclamo.resolvedAt)}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {/* Los importes. El total siempre; lo devuelto SÓLO si lo hubo, para no escribir «0 XAF»
              donde la pregunta no viene al caso. */}
          <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Dato etiqueta="Importe del pedido">
              <Precio valor={reclamo.totalXaf} tamano="sm" />
            </Dato>
            {reclamo.refundXaf > 0 ? (
              <Dato etiqueta="Importe devuelto">
                <Precio valor={reclamo.refundXaf} tamano="sm" />
              </Dato>
            ) : null}
            <Dato etiqueta="Pedido">
              <Text style={[styles.valorTexto, { color: colors.textPrimary }]}>{reclamo.orderRef}</Text>
            </Dato>
            {reclamo.sellerName ? (
              <Dato etiqueta="Tienda">
                <Text style={[styles.valorTexto, { color: colors.textPrimary }]} numberOfLines={2}>
                  {reclamo.sellerName}
                </Text>
              </Dato>
            ) : null}
          </View>

          <Pressable
            onPress={() => router.push('/ecomerse-orders' as never)}
            accessibilityRole="button"
            accessibilityLabel={`Ver mis pedidos, para encontrar el pedido ${reclamo.orderRef}`}
            style={({ pressed }) => [styles.boton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.botonTexto, { color: colors.text.primary }]}>Ver mis pedidos</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      <PieDelMercado sinLeer={sinLeer} />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaciado.e12,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  cabeceraTitulo: { flexShrink: 1, fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  hueco: { width: icono.lg },
  centro: { paddingTop: espaciado.e24, paddingHorizontal: espaciado.e16 },
  bloqueVeredicto: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16, gap: espaciado.e8 },
  pastilla: {
    alignSelf: 'flex-start',
    paddingHorizontal: espaciado.e8,
    paddingVertical: espaciado.e4,
    borderRadius: radios.sm,
  },
  pastillaTexto: { fontSize: tipografia.micro, fontWeight: peso.titulo },
  veredictoNota: { fontSize: tipografia.caption, lineHeight: 17 },
  tarjeta: {
    marginHorizontal: espaciado.e16,
    marginTop: espaciado.e12,
    borderRadius: radios.lg,
    borderWidth: trazo.fino,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    gap: espaciado.e8,
  },
  tarjetaTitulo: { fontSize: tipografia.body, fontWeight: peso.titulo },
  sinArticulo: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 },
  sinArticuloTexto: { flex: 1, fontSize: tipografia.caption },
  motivo: { fontSize: tipografia.body, lineHeight: 20 },
  fecha: { fontSize: tipografia.micro },
  evidencia: { marginTop: espaciado.e4 },
  evidenciaFoto: {
    width: 96,
    height: 96,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    marginRight: espaciado.e8,
  },
  dato: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: espaciado.e12 },
  datoEtiqueta: { fontSize: tipografia.caption },
  datoValor: { flexShrink: 1, alignItems: 'flex-end' },
  valorTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  boton: {
    marginHorizontal: espaciado.e16,
    marginTop: espaciado.e16,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    paddingVertical: espaciado.e12,
    alignItems: 'center',
  },
  botonTexto: { fontSize: tipografia.body, fontWeight: peso.fuerte },
});
