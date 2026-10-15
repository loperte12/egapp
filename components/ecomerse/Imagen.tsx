/**
 * Imagen · el componente de imagen del Mercado, portado de `DXIMAGEVIEW` de Taobao
 * ==============================================================================
 *
 * Envuelve `expo-image` y acepta los atributos de Taobao. Igual que `Vista`, **toda la
 * resolución vive en `imagenAtributos.ts`, que es puro**, para que el oráculo de fidelidad
 * pueda importar la lógica real en vez de una copia.
 *
 * ## Por qué `expo-image` encaja
 *
 * Taobao usa 10 de sus 14 atributos en el corpus, y **`expo-image` 2.4.1 tiene equivalente
 * para los que importan**:
 *
 * | Taobao | `expo-image` |
 * |---|---|
 * | `TINTCOLOR` | `tintColor` |
 * | `BLURRADIUS` | `blurRadius` |
 * | `FUZZYMATCHCACHE` | `cachePolicy` |
 * | `ONIMAGELOADCOMPLETE` | `onLoad` |
 *
 * **En este componente la Ruta B no imita a Taobao: lo iguala con la biblioteca que ya tenéis.**
 *
 * ## Lo que NO se mapea, y se declara
 *
 * `IMAGEBIZTYPE` e `IMAGEBIZID` son del servicio de imágenes de Alibaba; el Mercado usa Bitiful.
 * `LOADIMGWHENNULLCLEARIMG_ANDROID`, `STRICTMATCHCACHE_ANDROID` y `BLURSCALE_ANDROID` son
 * comportamiento del lado Android. **No se ocultan: se declaran en `imagenAtributos.ts`.**
 */

import React from 'react';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { estiloDeCaja, propsDeAccesibilidad } from './layoutAtributos';
import { resolverImagen, type AtributosDxImagen } from './imagenAtributos';

export interface ImagenProps {
  /** La URL de la imagen. */
  uri?: string | null;
  /** Atributos `DXIMAGEVIEW` decodificados, por clave hex de Taobao. */
  dx?: AtributosDxImagen;
  /** Cómo encaja la imagen. `cover` es lo que usa la ficha de producto. */
  ajuste?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
  /** Texto alternativo para lectores de pantalla. */
  accesibilidad?: string;
  /** Se avisa cuando la imagen termina de cargar (`ONIMAGELOADCOMPLETE`). */
  alCargar?: () => void;
  alFallar?: () => void;
  /** Imagen de sustitución mientras carga. */
  marcador?: string;
}

/**
 * La imagen del Mercado.
 *
 * ```tsx
 * <Imagen uri={producto.foto} ajuste="cover" dx={{ '6ff0bcc0397cd9c7': 0xFFEE0000 }} />
 * ```
 */
export function Imagen({
  uri, dx, ajuste = 'cover', style, accesibilidad, alCargar, alFallar, marcador,
}: ImagenProps) {
  const r = resolverImagen(dx);
  const [fallo, setFallo] = React.useState(false);

  // **Si cambia la URL, se vuelve a intentar.** Sin esto, un `Imagen` que falló con una foto se
  // quedaría marcado para siempre aunque el nodo recibiera otra distinta.
  React.useEffect(() => { setFallo(false); }, [uri]);

  // Sin URL devolvemos `null` y NO un hueco: un `Image` sin fuente pinta un recuadro gris que
  // en una lista de productos se ve como un fallo. Mejor no ocupar.
  if (!uri) return null;

  // ── CUANDO LA FOTO NO CARGA ───────────────────────────────────────────────────────────────
  // **Antes se quedaba el hueco vacío del tamaño pedido**, y un fallo de red se veía igual que
  // un fondo oscuro: nadie sabía si faltaba la foto o si el diseño era así.
  //
  // Se descubrió cuando el servidor de fotos (`hk.egrouteplan.com`) dejó de existir en la
  // migración a Tencent: **TODAS las fichas del Mercado mostraban un rectángulo negro de 300 px
  // y parecía correcto.** Ocupa lo mismo —el layout no se mueve— pero dice lo que pasa.
  if (fallo) {
    return (
      <View
        style={[estiloDeCaja(dx) as StyleProp<ViewStyle>, style, ESTILO_FALLO]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accesibilidad ?? 'Imagen no disponible'}
      >
        <Text style={ESTILO_FALLO_TEXTO}>🖼️</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[estiloDeCaja(dx) as StyleProp<ImageStyle>, style, r.tintColor ? { tintColor: r.tintColor } : null]}
      contentFit={r.ajuste ?? ajuste}
      transition={200}
      cachePolicy={r.cachePolicy ?? 'memory-disk'}
      blurRadius={r.blurRadius}
      placeholder={marcador}
      accessibilityLabel={accesibilidad}
      // `onError` avisa a quien lo pidió **y** deja constancia en pantalla. Las dos cosas: el
      // aviso sin marca visible no sirve de nada al usuario que no mira los logs.
      onError={() => { setFallo(true); alFallar?.(); }}
      onLoad={r.avisarAlCargar ? alCargar : undefined}
      // Sin `priority`: `expo-image` la usa para ordenar cargas simultáneas y Taobao no
      // expone un atributo equivalente. Añadirla sería una decisión nuestra sin dato.
    />
  );
}

/** El marcador de foto caída: mismo sitio, distinto significado. */
const ESTILO_FALLO: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(128,128,128,0.10)',
};

const ESTILO_FALLO_TEXTO: TextStyle = { fontSize: 28, opacity: 0.45 };

export default Imagen;

export { resolverImagen, canonizarColor, CLAVES_DXIMAGEVIEW, CLASE_IMAGEN, TIPO_DXIMAGEVIEW } from './imagenAtributos';
export type { AtributosDxImagen, ResolucionImagen, NombreAtributoImagen, ClaseAtributoImagen } from './imagenAtributos';

