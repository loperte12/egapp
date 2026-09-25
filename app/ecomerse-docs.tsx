// egrouteplan-app/app/ecomerse-docs.tsx
/**
 * EcomerseDocsScreen — moderación de la documentación del Mercado (solo ADMIN).
 *
 * POR QUÉ EXISTE (cierre de la tanda 4):
 * el vendedor sube su factura o su certificado al publicar, y el comprador la ve en la ficha como
 * «En revisión». Pero **no había forma de revisarla desde la app**: el estado solo se cambiaba con un
 * UPDATE a mano en la base. Una cola sin salida es una promesa al comprador que el sistema no puede
 * cumplir, y eso es exactamente lo que el informe de Dewu señala como la diferencia entre un sistema
 * de confianza y un adorno.
 *
 * QUÉ MUESTRA: cada documento pendiente **con su anuncio** (título, precio, ciudad y tienda). Sin
 * eso no se puede comprobar nada: una factura de 6.500 XAF solo se puede validar si se ve el anuncio
 * de 6.500 XAF. Un listado de papeles sueltos no sirve para decidir.
 *
 * CÓMO SE DECIDE: aprobar, o rechazar **con motivo obligatorio** (el vendedor lo verá y sabrá qué
 * corregir). El backend exige el motivo al rechazar; aquí se pide antes de enviar.
 *
 * NOTA DE SEGURIDAD: la pertenencia al rol ADMIN la comprueba el servidor con el rol del token
 * (`@Roles('ADMIN')`). Esta pantalla no decide nada por su cuenta: si la abre alguien que no es
 * admin, la API responde 403 y se muestra el error, no una pantalla vacía que parezca «no hay nada».
 *
 * Ruta: /ecomerse-docs
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ExternalLink, ShieldCheck, XCircle } from 'lucide-react-native';
import { alpha, EmptyState, espaciado, GhostButton, InlineError, PrimaryButton, radios, Sheet, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ecomerseApi, type EcomerseDocPendiente } from '../api/ecomerse';
import { formatXAF } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';
import { ir } from '../constants/rutas';

const DOC_LABEL: Record<string, string> = {
  factura_compra: 'Factura de compra',
  certificado_autenticidad: 'Certificado de autenticidad',
  autorizacion_marca: 'Autorización de marca',
};

export default function EcomerseDocsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<EcomerseDocPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Documento que se está rechazando (para pedir el motivo antes de enviar). */
  const [rechazando, setRechazando] = useState<EcomerseDocPendiente | null>(null);
  const [motivo, setMotivo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await ecomerseApi.adminDocs());
    } catch (e) {
      // El 403 se muestra tal cual: si no eres admin, hay que decirlo, no fingir una lista vacía.
      setError(e instanceof Error ? e.message : 'No pudimos cargar la cola de documentación.');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try { setDocs(await ecomerseApi.adminDocs()); setError(null); } catch { /* noop */ }
    finally { setRefreshing(false); }
  };

  const decidir = async (doc: EcomerseDocPendiente, approve: boolean, reason?: string) => {
    if (busy) return;
    setBusy(doc.id);
    try {
      const r = await ecomerseApi.adminDecideDoc(doc.id, approve, reason);
      Alert.alert('Hecho', r.message);
      setRechazando(null); setMotivo('');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar la decisión');
    } finally { setBusy(null); }
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => ir.atras()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver" style={s.back}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>Documentación</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, paddingHorizontal: espaciado.e16, paddingTop: espaciado.e10 }}>
        Revisa los documentos que han subido los vendedores. El comprador los ve como «En revisión» hasta que alguien los mira.
      </Text>

      {loading ? (
        <View style={s.centro}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={{ padding: espaciado.e16 }}>
          <InlineError mensaje={error} onReintentar={load} />
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            <EmptyState
              titulo="No hay documentación pendiente"
              texto="Cuando un vendedor suba una factura o un certificado, aparecerá aquí para que lo revises."
            />
          }
          renderItem={({ item }) => (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Qué se revisa: el documento Y su anuncio. */}
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>
                {DOC_LABEL[item.docType] ?? item.docType}
              </Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e4 }}>
                {item.producto.title} · {formatXAF(item.producto.priceXaf)} · {item.producto.city}
              </Text>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                Tienda: {item.producto.sellerName ?? '—'}
                {item.docNumber ? ` · Nº ${item.docNumber}` : ''}
                {item.amountXaf !== null && item.amountXaf !== undefined ? ` · ${formatXAF(item.amountXaf)}` : ''}
                {item.issuedOn ? ` · ${item.issuedOn}` : ''}
              </Text>
              {/* El importe de la factura frente al del anuncio: es la comprobación más útil y la
                  que no se puede hacer desde un listado de papeles sueltos. */}
              {item.amountXaf !== null && item.amountXaf !== undefined && item.amountXaf !== item.producto.priceXaf ? (
                <Text style={{ fontSize: tipografia.micro, color: brand.warningText, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>
                  ⚠ El importe de la factura no coincide con el precio del anuncio.
                </Text>
              ) : null}

              <Pressable
                onPress={() => Linking.openURL(item.url).catch(() => Alert.alert('Documento', 'No se pudo abrir el documento.'))}
                accessibilityRole="button"
                accessibilityLabel="Ver el documento"
                style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e10 }}
              >
                <ExternalLink size={14} color={colors.primary} />
                <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.primary }}>Ver el documento</Text>
              </Pressable>

              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => decidir(item, true)}
                    disabled={busy === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Aprobar ${DOC_LABEL[item.docType] ?? item.docType}`}
                    style={[s.btn, { backgroundColor: busy === item.id ? colors.border : brand.success }]}
                  >
                    <ShieldCheck size={15} color={brand.white} />
                    <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.caption }}>
                      {busy === item.id ? 'Enviando…' : 'Aprobar'}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={() => { setRechazando(item); setMotivo(''); }}
                    disabled={busy === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Rechazar ${DOC_LABEL[item.docType] ?? item.docType}`}
                    style={[s.btn, { borderWidth: 1, borderColor: colors.danger }]}
                  >
                    <XCircle size={15} color={colors.danger} />
                    <Text style={{ color: colors.danger, fontWeight: peso.maximo, fontSize: tipografia.caption }}>Rechazar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Rechazo: el motivo es obligatorio y se pide ANTES de enviar, porque el backend lo exige y el
          vendedor lo va a leer. */}
      <Sheet
        visible={!!rechazando}
        position="bottom"
        busy={!!busy}
        title="Rechazar el documento"
        subtitle="El vendedor verá este motivo y podrá corregirlo."
        onClose={() => setRechazando(null)}
      >
        <View style={{ padding: espaciado.e16, gap: espaciado.e12 }}>
          <TextInput
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Motivo (por ejemplo: la factura no corresponde a este artículo)"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[s.motivo, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          />
          <GhostButton title="Cancelar" onPress={() => setRechazando(null)} />
          <PrimaryButton
            title={motivo.trim() ? 'Rechazar con este motivo' : 'Escribe un motivo para rechazar'}
            onPress={() => rechazando && decidir(rechazando, false, motivo.trim())}
            disabled={!motivo.trim() || !!busy}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: 1 },
  back: { padding: espaciado.e2 },
  title: { fontSize: tipografia.body, fontWeight: peso.maximo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radios.lg, borderWidth: 1, padding: espaciado.e12, marginBottom: espaciado.e12 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, minHeight: 40, borderRadius: radios.md },
  motivo: { minHeight: 80, borderRadius: radios.md, borderWidth: 1, padding: espaciado.e10, textAlignVertical: 'top' },
});
