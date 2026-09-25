/**
 * publish/StepPreview.tsx — paso final: VISTA PREVIA (Parte 34).
 *
 * Idea del dueño que se adopta tal cual (ver antes de publicar) con los arreglos:
 *   · el precio se muestra con `lbXaf()` (toda la app usa XAF) y **no** el de la
 *     primera opción como si fuera el del producto;
 *   · nada de `toLocaleString` suelto ni de tokens inexistentes.
 * El envío real lo hace la pantalla anfitriona (con clave de idempotencia estable).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { alpha, espaciado, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { absUrl } from '../../../api/config';
import { lbXaf } from '../../../constants/lifebook';
import { LB_CONDITIONS, LB_PAY_STATUS_LABEL, lbCoverageLabel, lbPayLabel, lbPriceLabel, lbServiceLabel, lbTransportLabel } from '../../../constants/commerce';
import { usePublishStore } from '../../../state/commercePublish';
import type { LbCategory, LbShop } from '../../../api/commerce';
import { Notice, StepBlock, SummaryRow } from './PublishParts';

export default function StepPreview({ categories, shop }: { categories: LbCategory[]; shop: LbShop | null }) {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);

  const root = categories.find((c) => c.serviceType === form.serviceType);
  const sub = root?.children?.find((c) => c.id === form.categoryId);
  const condicion = LB_CONDITIONS.find((c) => c.id === form.condition)?.label ?? form.condition;

  return (
    <View>
      {/* Mini ficha */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: alpha(colors.border, 0.6) }]}>
        {form.media[0] ? (
          <Image
            source={absUrl(form.media[0].url)}
            style={styles.cover}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
        ) : (
          <View style={[styles.cover, styles.coverEmpty, { backgroundColor: alpha(colors.primary, 0.08) }]}>
            <Text style={{ fontSize: tipografia.hero }}>📦</Text>
          </View>
        )}
        <View style={{ padding: espaciado.e12 }}>
          <Text style={{ color: colors.primary, fontSize: tipografia.cifra, fontWeight: peso.titulo }}>
            {lbPriceLabel(form.priceMode === 'on_request' ? null : Number(form.price.replace(/\D/g, '')), form.priceMode, lbXaf)}
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.ancho, fontWeight: peso.maximo, marginTop: espaciado.e4 }} numberOfLines={3}>
            {form.title || '(sin título)'}
          </Text>
          {form.shortDescription ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }} numberOfLines={2}>
              {form.shortDescription}
            </Text>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>
            {[lbServiceLabel(form.serviceType), sub?.name, form.city, form.barrio].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <StepBlock title="Resumen">
        <SummaryRow label="Tipo" value={lbServiceLabel(form.serviceType)} />
        <SummaryRow label="Categoría" value={sub?.name ?? (root ? `${root.name} (sin subcategoría)` : '—')} />
        <SummaryRow label="Precio" value={form.priceMode === 'on_request' ? 'A consultar' : lbXaf(Number(form.price.replace(/\D/g, '')) || 0)} />
        <SummaryRow label="Antes" value={Number(form.oldPrice.replace(/\D/g, '')) > 0 ? lbXaf(Number(form.oldPrice.replace(/\D/g, ''))) : 'Sin descuento'} />
        <SummaryRow label="Estado" value={condicion} />
        <SummaryRow
          label="Disponibilidad"
          value={form.stockMode === 'unlimited' ? 'Sin límite'
            : form.stockMode === 'on_request' ? 'Bajo pedido'
              : `${form.stockQuantity || 0} unidades (${form.stockMode === 'exact' ? 'exactas' : 'aproximadas'})`}
        />
        <SummaryRow label="Fotos" value={`${form.media.length}`} />
        <SummaryRow label="Opciones" value={form.variants.length ? form.variants.map((v) => v.name).join(', ') : 'Ninguna'} />
        <SummaryRow label="Detalles" value={form.attributes.length ? `${form.attributes.length} rellenados` : 'Ninguno'} />
        <SummaryRow label="Entrega" value={form.coverage.map(lbCoverageLabel).join(' · ') || 'Sin indicar'} />
        <SummaryRow label="Medios" value={form.transports.map(lbTransportLabel).join(' · ') || 'Sin indicar'} />
        <SummaryRow label="Coste de envío" value={Number(form.deliveryCost.replace(/\D/g, '')) > 0 ? lbXaf(Number(form.deliveryCost.replace(/\D/g, ''))) : 'A consultar'} />
      </StepBlock>

      {shop ? (
        <StepBlock title="Pagos que acepta tu tienda" hint="Se configuran una vez y valen para todo lo que publiques.">
          {shop.paymentMethods.map((pm) => (
            <SummaryRow
              key={pm.method}
              label={lbPayLabel(pm.method)}
              value={pm.status === 'active' ? 'Disponible' : (LB_PAY_STATUS_LABEL[pm.status] ?? pm.status)}
            />
          ))}
        </StepBlock>
      ) : null}

      <Notice tone="ok">
        Al publicar, tu publicación entra <Text style={{ fontWeight: peso.titulo }}>en revisión</Text>. El equipo la aprueba y
        entonces aparece en el catálogo; recibirás el aviso en Mensajes.
      </Notice>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden', marginBottom: espaciado.e16 },
  cover: { width: '100%', height: 190 },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
});
