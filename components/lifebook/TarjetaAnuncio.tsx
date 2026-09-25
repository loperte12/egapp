/**
 * TarjetaAnuncio — la publicidad que va DENTRO de la zona de comentarios.
 *
 * Es lo que hace WeChat: un hueco publicitario entre los comentarios, **con su
 * etiqueta**. Los datos vienen de `wallet.ads` (el mismo sistema que el banner del
 * Home), así que el anuncio ya trae título, subtítulo, emoji o imagen, color, a
 * dónde lleva y sus contadores.
 *
 * Reglas que la app NO tiene que decidir (las decide el servidor): cuándo hay
 * anuncio, para quién y de qué ciudad. Si el servidor no manda anuncio, esta
 * tarjeta no se pinta y no queda hueco.
 *
 * Y aquí se cuentan las dos cosas que el anunciante paga:
 *   · **impresión** al pintarse (una sola vez por anuncio y pantalla),
 *   · **clic** al tocarlo, antes de navegar.
 * Los dos endpoints ya existían (`POST /ads/:id/impression` y `/click`) y son los
 * mismos que usa el banner del Home, así que no hay dos maneras de contar.
 */
import React, { useEffect } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { alpha, espaciado, radios, tipografia, peso} from '@egrouteplan/ui-kit';
import { adsApi, type HomeAd } from '../../api/ads';
import { absUrl } from '../../api/config';
import { ir as irSeguro } from '../../constants/rutas';

/** Rutas de la app a las que un anuncio puede llevar. */
const RUTAS_CONOCIDAS = ['/taxi', '/food', '/alquiler', '/intercity', '/lifebook', '/mercado', '/trabajo'];

/**
 * Anuncios cuya impresión YA se contó en esta sesión.
 *
 * Va a nivel de MÓDULO y no en un `useRef` del componente a propósito: comprobado en
 * el móvil, la tarjeta se vuelve a montar cuando la fila que la contiene se repinta
 * (la lista de comentarios), y con el `ref` la impresión se contaba DOS veces. El
 * anunciante paga por impresión: contarla dos veces es engañarle.
 */
const impresionesContadas = new Set<string>();

export function TarjetaAnuncio({ ad, tint, colors }: { ad: HomeAd; tint: string; colors: any }) {
  const router = useRouter();

  useEffect(() => {
    if (impresionesContadas.has(ad.id)) return;
    impresionesContadas.add(ad.id);
    adsApi.impression(ad.id).catch(() => {
      // Si falla, se permite reintentar en el próximo montaje (mejor eso que perderla).
      impresionesContadas.delete(ad.id);
    });
  }, [ad.id]);

  const abrir = () => {
    // El clic se cuenta ANTES de navegar: si el usuario sale de la app, el POST ya
    // salió (no se espera la respuesta para no retrasar el toque).
    adsApi.click(ad.id).catch(() => {});
    const externo = ad.externalUrl?.trim();
    if (externo) { Linking.openURL(externo).catch(() => {}); return; }
    const ruta = ad.targetRoute?.trim();
    if (ruta && RUTAS_CONOCIDAS.includes(ruta)) {
      /* NAVEGACIÓN SEGURA: el enlace lo escribe el anunciante. Se valida contra el mapa de
         rutas, así que una ruta que ya no exista lleva a la pantalla que lo explica en vez de
         dejar la pulsación sin efecto. */
      irSeguro.libre(ruta);
      return;
    }
    // Sin destino utilizable no se navega a ningún sitio: mejor quedarse que abrir
    // una pantalla en blanco.
  };

  const imagen = ad.imageUrl ? absUrl(ad.imageUrl) : '';

  return (
    <View style={{ marginTop: espaciado.e8 }}>
      {/* La etiqueta NO es opcional: sin ella el anuncio se lee como un comentario
          de alguien, y eso es engañar a quien lee. */}
      <Text style={{ fontSize: 10, fontWeight: peso.titulo, letterSpacing: 0.6, color: colors.textSecondary, marginBottom: espaciado.e4 }}>
        PUBLICIDAD
      </Text>
      <Pressable
        onPress={abrir}
        accessibilityLabel={`Publicidad: ${ad.title}. ${ad.subtitle ?? ''}`}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
          padding: espaciado.e9, borderRadius: radios.md,
          backgroundColor: alpha(ad.color?.startsWith('#') ? ad.color : tint, 0.10),
          borderWidth: 1, borderColor: alpha(colors.textPrimary, 0.08),
        }}
      >
        {imagen ? (
          <Image source={{ uri: imagen }} style={{ width: 46, height: 46, borderRadius: 9, backgroundColor: alpha(colors.textPrimary, 0.08) }} />
        ) : (
          <View style={{ width: 46, height: 46, borderRadius: 9, backgroundColor: alpha(colors.textPrimary, 0.06), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: tipografia.title }}>{ad.emoji ?? '📣'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary, lineHeight: 17 }}>
            {ad.title}
          </Text>
          {ad.subtitle ? (
            <Text numberOfLines={1} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
              {ad.subtitle}{ad.discountPct ? ` · -${ad.discountPct} %` : ''}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
