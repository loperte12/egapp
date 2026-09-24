/**
 * CabeceraTienda — la tarjeta de una tienda: quién vende, con qué respaldo y cómo contactarle.
 *
 * POR QUÉ EXISTE: la ficha ya tenía esta tarjeta, escrita a mano dentro de la pantalla, y la
 * página de tienda necesitaba **la misma**. Escribirla dos veces es exactamente el camino que ya
 * costó caro con el precio —cuatro sitios, tres tratamientos para el mismo dato—, así que aquí hay
 * una definición y dos consumidores.
 *
 * Y HABÍA UN SEGUNDO MOTIVO, MÁS IMPORTANTE QUE EL PRIMERO: en la ficha esta tarjeta **no llevaba
 * a ninguna parte**. El comprador veía quién vende («Abacería E2E v3», PRO, escudo verificado,
 * valoración, ciudad) y no podía ver **qué más vende**. Era el mejor sitio de la app para entrar a
 * una tienda y era un callejón sin salida. `onPress` es esa puerta.
 *
 * QUÉ DECIDE ESTE FICHERO Y QUÉ DECIDEN LOS QUE LO USAN:
 *   · Aquí: qué se enseña de una tienda y con qué jerarquía (nombre, PRO, escudo solo si es real,
 *     valoración solo si hay valoraciones, ciudad, anuncios) y el tratamiento del avatar.
 *   · Fuera: **si la tarjeta es puerta** (`onPress`) y **si se puede llamar** (`onLlamar`). Sin
 *     props, es información y no un botón: la pantalla que no conoce la acción no la inventa.
 *
 * DOS HONESTIDADES QUE SE CONSERVAN DE LA FICHA:
 *   · La valoración **no se inventa**. `★ 5,0 · 0 valoraciones` sobre una tienda sin ninguna era el
 *     defecto original; aquí, sin valoraciones, la línea no se pinta.
 *   · El escudo es de `verified`, que es KYC aprobado de verdad (lo resuelve el servidor). Un sello
 *     que se pinta solo por tener cuenta no es un sello.
 *
 * El **avatar es la inicial**, no una foto: `seller.photoKey` es una clave del almacenamiento y la
 * app no tiene resuelta su URL pública en ninguna pantalla. Inventar aquí un `https://…/photoKey`
 * sería pintar una imagen rota en el peor sitio. El día que exista el resolutor, se cambia solo
 * aquí y lo heredan la ficha y la tienda.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Phone, ShieldCheck } from 'lucide-react-native';
import { alpha, brand, espaciado, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import type { EcomerseSellerBrief } from '../../api/ecomerse';

export interface CabeceraTiendaProps {
  seller: EcomerseSellerBrief | null | undefined;
  /** Anuncios activos, si la pantalla los cuenta. Sin el dato no se pinta la cifra: un «0» diría
   *  que la tienda no vende nada, y no saberlo no es lo mismo que saberlo. */
  anuncios?: number;
  /** Con esto la tarjeta es una puerta a la tienda. */
  onPress?: () => void;
  /** Con esto aparece el botón de llamar. */
  onLlamar?: () => void;
}

export function CabeceraTienda({ seller, anuncios, onPress, onLlamar }: CabeceraTiendaProps) {
  const { colors } = useTheme();
  const s = styles(colors);

  const nombre = seller?.businessName ?? 'Vendedor';
  const ratingCount = seller?.ratingCount ?? 0;
  const ratingAvg = seller?.ratingAvg;
  const verificado = seller?.verified === true;
  const pro = seller?.badge === 'Pro';
  const ciudad = seller?.city ?? '—';

  const contenido = (
    <>
      <View style={[s.avatar, { backgroundColor: alpha(colors.primary, 0.15) }]}>
        <Text style={[s.inicial, { color: colors.primary }]}>{nombre.charAt(0).toUpperCase()}</Text>
      </View>

      <View style={s.textos}>
        <View style={s.filaNombre}>
          <Text style={s.nombre} numberOfLines={1}>{nombre}</Text>
          {pro && <View style={s.tagPro}><Text style={s.tagProText}>PRO</Text></View>}
          {verificado && <ShieldCheck size={13} color={brand.success} />}
        </View>
        <Text style={s.meta}>
          {ratingCount > 0 && Number.isFinite(ratingAvg)
            ? `★ ${Number(ratingAvg).toFixed(1)} · ${ratingCount} valoracion${ratingCount === 1 ? '' : 'es'}`
            /* El texto de «sin valoraciones» NO es nuevo: venía de la ficha, y se conserva tal cual.
               Un hueco vacío donde iría la valoración se lee como «no ha cargado», y una tienda
               nueva se lee como «poco fiable». Decir que es nueva es información, y es verdad. */
            : 'Nuevo en EG · sin valoraciones todavía'}
        </Text>
        <Text style={s.meta}>
          📍 {ciudad}{anuncios !== undefined ? ` · ${anuncios} anuncio${anuncios === 1 ? '' : 's'}` : ''}
        </Text>
      </View>

      {onLlamar && (
        <Pressable
          onPress={onLlamar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Llamar al vendedor"
          style={[s.redondo, { backgroundColor: alpha(colors.primary, 0.1) }]}
        >
          <Phone size={16} color={colors.primary} />
        </Pressable>
      )}

      {onPress && <ChevronRight size={18} color={colors.textSecondary} />}
    </>
  );

  const caja = [s.caja, { backgroundColor: colors.surface, borderColor: colors.border }];

  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver la tienda ${nombre}`}
      style={caja}
    >
      {contenido}
    </Pressable>
  ) : (
    <View style={caja}>{contenido}</View>
  );
}

/**
 * Dos cambios visuales respecto a la versión que ya estaba verificada en la ficha, dichos para que
 * no sorprendan al comparar capturas:
 *   · **Borde.** La tarjeta vivía sobre `surface` sin borde y apenas se distinguía del fondo de la
 *     pantalla; con `borderColor` el bloque se lee como una pieza, que es lo que es.
 *   · **El sello PRO baja de 800 a 700.** El 800 no está en la escala `peso` y meterlo aquí habría
 *     subido la deuda del trinquete para pintar tres letras de 11 dp, donde la diferencia no se ve.
 */
const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    padding: espaciado.e12,
  },
  avatar: { width: 44, height: 44, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  inicial: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  textos: { flex: 1, marginLeft: espaciado.e12 },
  filaNombre: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5 },
  nombre: { flexShrink: 1, fontSize: tipografia.body, fontWeight: peso.fuerte, color: c.textPrimary },
  meta: { fontSize: tipografia.micro, color: c.textSecondary, marginTop: espaciado.e2 },
  tagPro: { backgroundColor: alpha(brand.primary, 0.12), borderRadius: radios.sm, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3 },
  /** `fuerte` (700) y no el 800 que llevaba la ficha: el 800 no está en la escala `peso`, y meterlo
   *  aquí habría subido la deuda del trinquete para pintar tres letras. La diferencia entre 700 y
   *  800 en un sello de 11 dp no se ve; la deuda, sí. */
  tagProText: { color: brand.primary, fontSize: tipografia.micro, fontWeight: peso.fuerte },
  redondo: { width: 34, height: 34, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
});
