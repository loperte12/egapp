/**
 * ProductoCard — LA TARJETA DE LA REJILLA de productos (Mercado).
 *
 * POR QUÉ ES UN COMPONENTE Y NO JSX SUELTO
 * La especificación pide que la rejilla del catálogo, la del tab «Productos» del perfil y la del
 * **historial de productos** sean **la misma**. Estaba escrita dentro de `app/lifebook-catalog.tsx`;
 * copiarla habría garantizado que en un mes las tres se vieran distintas. Vive aquí y la usan las
 * tres pantallas.
 *
 * Lo que se midió al dejar la tarjeta como está (14/09/2026, Poco F5): 208 dp de alto por celda
 * —foto de 108 dp y tres líneas—, después de que el dueño dijera que las tarjetas «se ven
 * horribles» de grandes (antes eran de unos 253 dp con cinco líneas).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { alpha, useTheme, radios, tipografia } from '@egrouteplan/ui-kit';
import { Package, ShieldCheck, Store } from 'lucide-react-native';
import { absUrl } from '../../api/config';
import { lbXaf } from '../../constants/lifebook';
import { lbPriceLabel } from '../../constants/commerce';

/** Lo mínimo que la tarjeta necesita de un producto (el catálogo manda `LbProductCard` entero). */
export interface ProductoCardDatos {
  id: string;
  title: string;
  coverUrl: string | null;
  priceXaf: number | null;
  priceMode: string;
  oldPriceXaf?: number | null;
  shortDescription?: string | null;
  /** «X vendidos»: no se pinta si es 0 (un «0 vendidos» ahuyenta). */
  salesCount?: number;
  shop: { id: string; name: string; isVerified?: boolean };
}

export function ProductoCard({ item, onPress, pie, apagado }: {
  item: ProductoCardDatos;
  onPress?: () => void;
  /** Línea extra al pie (el historial pone «Visto hoy»). */
  pie?: React.ReactNode;
  /** `true` = ya no está a la venta: la tarjeta se apaga y no lleva a ninguna parte. */
  apagado?: boolean;
}) {
  const { colors } = useTheme();
  const ventas = Number(item.salesCount ?? 0);

  return (
    <Pressable
      onPress={apagado ? undefined : onPress}
      disabled={apagado || !onPress}
      accessibilityLabel={item.title}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: alpha(colors.border, 0.5),
          opacity: apagado ? 0.55 : 1,
        },
      ]}
    >
      {item.coverUrl ? (
        <Image
          source={absUrl(item.coverUrl)}
          style={styles.cardImg}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={0}
        />
      ) : (
        <View style={[styles.cardImg, { backgroundColor: alpha(colors.primary, 0.08), alignItems: 'center', justifyContent: 'center' }]}>
          <Package size={22} color={alpha(colors.primary, 0.5)} />
        </View>
      )}
      <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700', marginTop: 5 }}>
        {item.title}
      </Text>
      <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: '900', marginTop: 2 }}>
        {lbPriceLabel(item.priceXaf, item.priceMode as never, lbXaf)}
        {item.oldPriceXaf ? (
          <Text style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: '700', textDecorationLine: 'line-through' }}>
            {'  '}{lbXaf(item.oldPriceXaf)}
          </Text>
        ) : null}
      </Text>
      {/* La rejilla pide DESCRIPCIÓN CORTA (una línea, en gris). Antes aquí iba la ciudad, que no
          ayuda a decidir y hacía la tarjeta más alta. */}
      {item.shortDescription ? (
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>
          {item.shortDescription}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
        {item.shop.isVerified ? <ShieldCheck size={11} color={colors.success} /> : <Store size={11} color={colors.textSecondary} />}
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 10.5, flex: 1 }}>{item.shop.name}</Text>
        {ventas > 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700' }}>
            {ventas} vendido{ventas === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>
      {pie ?? null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Tarjeta de la rejilla: MÁS PEQUEÑA que antes (el dueño la veía enorme y con razón). */
  card: { flex: 1, maxWidth: '50%', borderRadius: radios.md, borderWidth: StyleSheet.hairlineWidth, padding: 7 },
  cardImg: { width: '100%', height: 108, borderRadius: radios.sm },
});
