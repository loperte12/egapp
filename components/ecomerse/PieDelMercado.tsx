/**
 * PieDelMercado — el pie PROPIO del Mercado: Home · Mensajes · Perfil.
 *
 * POR QUÉ EXISTE, Y POR QUÉ ES HERMANO DE `BarraTienda` Y NO DEL DOCK
 * El dock global (`FloatingFooter.tsx`) lo pintan siete pantallas y **ninguna del Mercado**: el
 * Mercado era una excursión de pantalla completa, se entraba por una celda de Inicio y se salía con
 * la flecha de la cabecera. Con la zona del comerciante se tomó la decisión contraria y quedó escrita
 * en `BarraTienda.tsx:9`: un módulo con varias cosas dentro tiene **barra propia**, porque su usuario
 * no sale del módulo para moverse entre ellas. El Mercado está en ese mismo caso desde que tiene
 * tres destinos con datos, así que se le da la misma solución: mismo lenguaje visual, mismos tokens,
 * misma accesibilidad.
 *
 * LAS DOS BARRAS NO SE APILAN. Y no es suerte: el Mercado no pinta el dock, así que aquí hay **una**
 * barra de 62 dp, no dos. Si algún día una pantalla del Mercado pinta el dock, esto se rompe a la
 * vista — y esa es la señal de que alguien no leyó esta cabecera.
 *
 * CÓMO SE SALE DEL MERCADO, que es la pregunta que este pie abre
 * El pie mueve entre los tres destinos, no hacia fuera. La salida al resto de la app sigue siendo la
 * flecha «Volver» de la cabecera del Mercado (`ecomerse.tsx:297`), que ya existía y ya funciona. No
 * se le añade un cuarto destino «Más»: un destino que sólo sirve para irse no es un destino.
 *
 * `accessibilityRole="tab"` y `accessibilityState={{ selected }}` no son adorno: una barra que no
 * comunica en qué pestaña está deja al lector de pantalla sin saber dónde está (mismo criterio que
 * `BarraTienda.tsx:21`).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, MessageCircle, User, type LucideIcon } from 'lucide-react-native';
import { brand, elevation, espaciado, icono, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { usePathname, useRouter } from 'expo-router';

/** Altura del pie sin el área segura. La usan las pantallas como relleno inferior. */
export const PIE_MERCADO_H = 62;

export interface DestinoMercado {
  id: 'home' | 'mensajes' | 'perfil';
  label: string;
  icon: LucideIcon;
  ruta: string;
}

/**
 * Orden: donde se compra, donde se habla y quien soy. El mismo que el de las capturas de referencia
 * —el Mercado primero, porque es donde entra el usuario— y el mismo que ya usa el dock de la casa.
 */
export const DESTINOS_MERCADO: DestinoMercado[] = [
  { id: 'home', label: 'Home', icon: Home, ruta: '/ecomerse' },
  { id: 'mensajes', label: 'Mensajes', icon: MessageCircle, ruta: '/ecomerse-mensajes' },
  { id: 'perfil', label: 'Perfil', icon: User, ruta: '/ecomerse-perfil' },
];

export default function PieDelMercado({
  /**
   * Sin leer en Mensajes. **Por defecto 0, y con el contador apagado a propósito**: el contador real
   * llega en la fase de los avisos, y montar hoy un sondeo de red en tres pantallas para pintar un
   * cero sería pagar el precio sin el dato. Es el mismo criterio que el `showUnreadBadge = false` del
   * dock (`FloatingFooter.tsx:48`).
   */
  sinLeer = 0,
}: {
  sinLeer?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ruta = usePathname();

  return (
    <View
      style={[
        styles.pie,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: PIE_MERCADO_H + insets.bottom,
        },
      ]}
    >
      {DESTINOS_MERCADO.map((destino) => {
        /**
         * `/ecomerse` es PREFIJO de todas las rutas del Mercado (`/ecomerse-mensajes`,
         * `/ecomerse-detail`, `/ecomerse-perfil`…), así que comparar con `startsWith` daría Home
         * activo en todas partes. Es la misma trampa que documenta `BarraTienda.tsx:82` con
         * `/tienda`, y se resuelve igual: Home se compara exacto, los demás por prefijo.
         */
        const activo = destino.ruta === '/ecomerse' ? ruta === '/ecomerse' : ruta.startsWith(destino.ruta);
        const tinte = activo ? colors.primary : colors.textSecondary;
        const Icono = destino.icon;
        const contador = destino.id === 'mensajes' ? sinLeer : 0;
        return (
          <Pressable
            key={destino.id}
            onPress={() => { if (!activo) router.replace(destino.ruta as never); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={contador > 0 ? `${destino.label}, ${contador} sin leer` : destino.label}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View>
              <Icono
                size={icono.md}
                color={tinte}
                strokeWidth={activo ? trazo.marcado : trazo.fuerte}
              />
              {contador > 0 && (
                <View style={[styles.insignia, { borderColor: colors.card }]}>
                  <Text style={styles.insigniaTexto}>{contador > 9 ? '9+' : contador}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: tinte }, activo && styles.labelActivo]} numberOfLines={1}>
              {destino.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pie: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
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
  labelActivo: { fontWeight: peso.titulo },
  /**
   * El contador. El borde que lo despega del icono sale del **tema** (`colors.card`, el color real
   * de la barra) y no de `brand.white` como en el dock: allí el borde es blanco fijo, así que en modo
   * oscuro el aro se ve blanco sobre una barra oscura. Aquí el aro es del color de lo que hay detrás.
   */
  insignia: {
    position: 'absolute',
    top: -espaciado.e4,
    right: -espaciado.e8,
    backgroundColor: brand.like,
    borderRadius: radios.full,
    minWidth: espaciado.e16,
    height: espaciado.e16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: trazo.base,
    paddingHorizontal: espaciado.e4,
  },
  insigniaTexto: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.titulo },
});
