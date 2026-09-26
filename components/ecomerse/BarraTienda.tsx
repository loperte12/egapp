/**
 * BarraTienda — barra inferior PROPIA de la zona del comerciante (`/tienda`).
 *
 * POR QUÉ EXISTE
 * Hasta el 20-sep-2026 el comerciante era un **desvío dentro de Mercado**: se entraba por la misma
 * celda que el comprador, pasando por un modal («¿Comprar o Vender?»), y su pantalla era **un solo
 * formulario de 1.110 líneas** con las ventas como enlace de texto en la cabecera. No había zona.
 *
 * La zona es un **modo dentro de la app**, igual que «Ser Conductor» o «Mi restaurante», pero con
 * barra propia: el comerciante no sale de su zona para moverse entre sus cuatro cosas. Es la misma
 * separación que hacen Lilishop (`seller-api` + 店铺管理端) y Mall4j (`mall4cloud-multishop`): la
 * zona del vendedor se separa **en la arquitectura**, no con permisos dentro de una pantalla
 * compartida.
 *
 * CUATRO PESTAÑAS, NO CINCO
 * Pinduoduo tiene cinco porque tiene cinco módulos con datos (商品/订单/营销/我的 + 首页). Aquí hay
 * tres con datos y uno de identidad, y **una pestaña vacía es peor que una pestaña ausente**: eso es
 * exactamente lo que ya limpiamos del Mercado. Las cinco de Pinduoduo se quedan en cuatro:
 * Resumen · Anuncios · Pedidos · Tienda.
 *
 * DETALLE QUE NO ES ADORNO: `accessibilityState={{ selected }}` y `accessibilityRole="tab"`. Una
 * barra que no comunica en qué pestaña está deja al lector de pantalla sin saber dónde está.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, LayoutDashboard, Package, Store, type LucideIcon } from 'lucide-react-native';
import { elevation, espaciado, icono, peso, tipografia, trazo, useTheme, trazoIcono} from '@egrouteplan/ui-kit';
import { usePathname, useRouter } from 'expo-router';

/** Altura de la barra sin el área segura. La usan las pantallas como relleno inferior. */
export const BARRA_TIENDA_H = 62;

export interface PestanaTienda {
  id: string;
  label: string;
  icon: LucideIcon;
  ruta: string;
}

/** Orden decidido: primero lo que hay que hacer, después lo que se administra, y al final la tienda. */
export const PESTANAS_TIENDA: PestanaTienda[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, ruta: '/tienda' },
  { id: 'anuncios', label: 'Anuncios', icon: Package, ruta: '/tienda/anuncios' },
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList, ruta: '/tienda/pedidos' },
  { id: 'perfil', label: 'Tienda', icon: Store, ruta: '/tienda/perfil' },
];

/**
 * Pantallas de la zona SIN barra. Publicar es un flujo de captura a pantalla completa (se entra
 * desde Anuncios y se sale con el trabajo hecho o cancelado), no una quinta pestaña: dejarla con
 * barra invitaría a abandonar el formulario a medias sin decirlo.
 *
 * `combinaciones` entra por lo mismo (fase 4): es la edición de un anuncio concreto —sus ejes, sus
 * precios, sus unidades— con su propio botón de guardar. Es hermana de `publicar`, no de las
 * pestañas: si tuviera barra, la mitad de las salidas del editor no guardarían nada.
 */
const SIN_BARRA = ['/tienda/publicar', '/tienda/combinaciones'];

export default function BarraTienda() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ruta = usePathname();

  if (SIN_BARRA.includes(ruta)) return null;

  return (
    <View
      style={[
        styles.barra,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: BARRA_TIENDA_H + insets.bottom,
        },
      ]}
    >
      {PESTANAS_TIENDA.map((p) => {
        // `/tienda` es prefijo de todas: sin la comparación exacta, Resumen saldría activo siempre.
        const activa = p.ruta === '/tienda' ? ruta === '/tienda' : ruta.startsWith(p.ruta);
        const tinte = activa ? colors.text.primary : colors.textSecondary;
        const Icon = p.icon;
        return (
          <Pressable
            key={p.id}
            onPress={() => { if (!activa) router.replace(p.ruta as never); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
            accessibilityLabel={p.label}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon size={icono.md} color={tinte} strokeWidth={activa ? trazoIcono.acento : trazoIcono.base} />
            <Text style={[styles.label, { color: tinte }, activa && styles.labelActiva]} numberOfLines={1}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: trazo.fino,
    ...elevation.lg,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaciado.e4 / 2,
    paddingVertical: espaciado.e8,
  },
  label: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  labelActiva: { fontWeight: peso.titulo },
});
