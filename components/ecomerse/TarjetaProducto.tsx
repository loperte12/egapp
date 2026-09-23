/**
 * TarjetaProducto — **la** tarjeta de producto del Mercado. Una sola, en los tres sitios.
 *
 * POR QUÉ EXISTE: había **tres tarjetas distintas para el mismo dato** — la rejilla del catálogo
 * (foto a sangre, velo, precio en pastilla), el carrusel «Recomendados» (foto de 92 × 92 contenida,
 * precio naranja suelto y partido en dos líneas) y la de Favoritos (foto de 124 de alto, cuerpo
 * blanco debajo, ciudad y acciones dentro del cuerpo)—. Tres lenguajes para decir lo mismo en la
 * misma pantalla. Unificar no es «que se parezcan»: es que **sólo exista una definición**, y que lo
 * que cambia entre sitios sea una prop, no una copia.
 *
 * QUÉ DECIDE ESTE FICHERO Y QUÉ DECIDEN LOS QUE LO USAN:
 *   · Aquí: la **proporción**, el **orden de las capas**, el velo, dónde va cada control y el
 *     tratamiento del precio (siempre pastilla sólida, nunca naranja suelto).
 *   · Fuera: **qué controles** se pasan (`onAdd` / `onFav` / `onSpecial`), **qué ancho** tiene la
 *     tarjeta y **con qué se abre**. Nada más.
 *
 * ── LA PROPORCIÓN: 3:4, y la fija el dispositivo, no el gusto ──────────────────────────────────
 * La decisión está razonada en `DECISION-PROPORCION-TARJETAS.md`; el resumen: el alta de vendedor
 * llama a `launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })` **sin `allowsEditing` y sin
 * `aspect`**, así que la app no recorta al subir: guarda la foto tal cual sale de la cámara, y las
 * cámaras Android arrancan en **4:3**. Como la tarjeta pinta con `contentFit="cover"`, la proporción
 * del marco decide cuánto se tira:
 *
 *   marco 1:1  → de una foto 3:4 se pierde el 25 %
 *   marco 2:3  → se pierde el 11 % del ancho, en TODAS las fotos
 *   marco 3:4  → **cero recorte**
 *
 * Y lo que cierra el caso: **el vendedor encuadra en el visor (3:4) y ve exactamente lo que verá el
 * comprador**. Con otro marco le estaríamos recortando la foto sin decirle nada.
 *
 * ── EL PRECIO NO SE FIJA DEL VELO ──────────────────────────────────────────────────────────────
 * El velo oscuro hace legible un título blanco sobre cualquier foto, pero no basta para garantizar
 * el contraste de un número suelto: debajo puede haber una foto blanca. Por eso el precio va en
 * **pastilla sólida** —el par fondo/texto sale del tema— y no en naranja suelto como estaba en el
 * carrusel y en Favoritos, donde el naranja sobre una foto clara se perdía.
 *
 * ── LO QUE SALE DE LA TARJETA, Y POR QUÉ ───────────────────────────────────────────────────────
 * La **ciudad** sale de las tres. En la rejilla era redundante (se navega bajo un filtro de ciudad);
 * en el carrusel y en Favoritos era el único texto de meta, pero ocupaba una línea que sobre una
 * foto se paga en dp de imagen. La ficha la sigue enseñando, que es donde el comprador se lo
 * pregunta. El **nombre del vendedor** ya había salido por lo mismo.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, ShoppingCart, Star } from 'lucide-react-native';
import {
  Precio, useTheme, brand, espaciado, ilustracion, peso, radios, tipografia, trazo,
} from '@egrouteplan/ui-kit';
import type { PrecioTamano } from '@egrouteplan/ui-kit';
import type { EcomerseProduct } from '../../api/ecomerse';

/**
 * Proporción ancho:alto de TODA tarjeta de producto. Es un valor de `aspectRatio` de React Native,
 * o sea ancho/alto: 3/4 = una tarjeta más alta que ancha, en vertical.
 *
 * Se exporta porque el esqueleto de carga tiene que medir exactamente lo mismo: si el esqueleto
 * midiera distinto, el contenido daría un salto al terminar de cargar.
 */
export const PROPORCION_TARJETA = 3 / 4;

/**
 * Ancho de la tarjeta en el carrusel horizontal. No es el de la rejilla (157) a propósito: en un
 * carrusel el ancho lo fija la **densidad** —cuántas tarjetas asoman— y 140 deja ver dos enteras y
 * un asomo claro de la tercera en una pantalla de 360 dp, que es lo que invita a deslizar.
 */
export const ANCHO_CARRUSEL = 140;

/**
 * Velo de abajo arriba. Los topes están puestos por cálculo, no a ojo: el título cae al 59 % del
 * alto, donde el velo ya va por 0,80 de opacidad. Con una foto **blanca pura** por debajo, eso deja
 * el contraste del texto blanco en **~14:1**, más del triple del 4,5:1 que pide la norma; incluso en
 * la zona de transición (0,55) sigue en **~5,7:1**.
 */
const VELO_COLORES = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)', 'rgba(0,0,0,0.95)'] as const;
const VELO_PARADAS = [0, 0.4, 0.6, 1] as const;

export interface TarjetaProductoProps {
  product: EcomerseProduct;
  /** Abre la ficha. Es el toque de toda la tarjeta salvo los controles. */
  onPress: () => void;
  /**
   * Ancho fijo (carrusel). Si falta, la tarjeta toma `flex: 1` y se reparte el ancho de la fila,
   * que es lo que necesita una rejilla de dos columnas.
   */
  width?: number;
  /** Proporción ancho:alto. Por defecto la de toda la app; existe para poder medir, no para variar. */
  aspect?: number;
  /** Tamaño del precio. Por defecto `md`, el de tarjeta. */
  precioTamano?: PrecioTamano;
  /** Estado del corazón. Gobierna también su etiqueta accesible («añadir» / «quitar»). */
  favorited?: boolean;
  onFav?: () => void;
  onAdd?: () => void;
  onSpecial?: () => void;
  /** Solo tiene efecto junto a `onSpecial`: pinta la estrella encendida. */
  isSpecial?: boolean;
  /**
   * Texto del contador de interés («♥ 12»). Por defecto se enseña **solo si hay alguien**: un
   * «0 fav» espanta más de lo que informa. En Favoritos se apaga: ahí el corazón es tuyo y el
   * contador se lee como si fuera de otro.
   */
  mostrarInteres?: boolean;
  /**
   * Chip de texto sobre la foto, además de las etiquetas propias del producto (destacado, Pro,
   * estado del artículo). Es para lo que el sitio de uso sabe y la tarjeta no: «Comprado».
   */
  etiqueta?: string;
  /** Tamaño del icono cuando no hay foto. La rejilla lo quiere grande; el carrusel, menor. */
  iconoTamano?: number;
}

export function TarjetaProducto({
  product, onPress, width, aspect = PROPORCION_TARJETA, precioTamano = 'md',
  favorited = false, onFav, onAdd, onSpecial, isSpecial = false,
  mostrarInteres = true, etiqueta, iconoTamano = ilustracion.lg,
}: TarjetaProductoProps) {
  const { colors } = useTheme();
  /* `fallo` guarda la URI que falló, no un booleano: así, si el producto cambia de foto, el estado
     se limpia solo y se vuelve a intentar sin efectos ni re-montajes. */
  const [fallo, setFallo] = useState<string | null>(null);

  const foto = product.photos?.[0] ?? null;
  const sinFoto = !foto || fallo === foto;
  const condition = typeof product.attributes?.estado === 'string' ? product.attributes.estado : null;
  const interes = mostrarInteres && product.favoriteCount > 0 ? product.favoriteCount : 0;
  const hayEtiquetas = !!product.isFeatured || product.seller?.badge === 'Pro' || !!condition || !!etiqueta;
  const hayAcciones = interes > 0 || !!onAdd || !!onFav || !!onSpecial;

  return (
    <View
      style={[
        s.card,
        { aspectRatio: aspect, backgroundColor: colors.card, borderColor: colors.border },
        width ? { width } : { flex: 1 },
      ]}
    >
      {/*
        ORDEN DE CAPAS. Importa para los toques, no solo para el dibujo:
          1 foto · 2 velo · 3 capa de detalle · 4 etiquetas · 5 acciones · 6 contenido.
        El contenido lleva `none` porque dentro no hay nada interactivo: un toque sobre el título cae
        en la capa de detalle y abre la ficha, que es lo que se espera. Los controles vivos están en
        la fila de acciones, fuera del contenido, y por eso no heredan ese `none` — y hay que
        tenerlo presente, porque en React Native `pointerEvents="none"` desactiva TAMBIÉN los hijos:
        un botón dentro de una capa desactivada queda de adorno.
      */}
      {sinFoto ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: iconoTamano, opacity: 0.55 }}>{product.categoryIcon ?? '📦'}</Text>
        </View>
      ) : (
        <Image
          source={{ uri: foto }}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}
          contentFit="cover"
          transition={200}
          onError={() => setFallo(foto)}
        />
      )}
      <LinearGradient
        colors={VELO_COLORES}
        locations={VELO_PARADAS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={product.title}
      />

      {/* Etiquetas, arriba a la izquierda, en columna. La caja lleva `right` y `alignItems` a
          propósito: así queda acotada por la tarjeta y el chip puede pedir `maxWidth: '100%'` sin
          poder desbordarla nunca. Caen por debajo de la fila de acciones —que ocupa los primeros
          ~33 dp—, así que no se pisan. */}
      {hayEtiquetas && (
        <View style={s.etiquetas} pointerEvents="none">
          {product.isFeatured && <View style={s.chipNaranja}><Text style={s.chipEmoji}>🔥</Text></View>}
          {product.seller?.badge === 'Pro' && <View style={s.chipAzul}><Text style={s.chipPro}>PRO</Text></View>}
          {condition ? (
            <View style={s.chipOscuro}>
              <Text numberOfLines={1} style={s.chipTexto}>{condition}</Text>
            </View>
          ) : null}
          {etiqueta ? (
            <View style={s.chipOscuro}>
              <Text numberOfLines={1} style={s.chipTexto}>{etiqueta}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Fila de acciones: interés · estrella · carrito · corazón. `box-none` para que el hueco
          entre botones no se trague el toque que abre la ficha. Todo va sobre fondo oscuro
          TRASLÚCIDO: es lo que lo mantiene legible sobre una foto cualquiera sin depender del velo,
          que empieza mucho más abajo. El botón mide 15 del icono + 5 de relleno por lado = 25, y con
          el `hitSlop` de 8 el blanco táctil pasa de los 44 dp que pide la guía. */}
      {hayAcciones && (
        <View style={s.acciones} pointerEvents="box-none">
          {interes > 0 && <Text style={s.interes}>♥ {interes}</Text>}
          {onSpecial && (
            <Pressable onPress={onSpecial} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={isSpecial ? 'Quitar de especiales' : 'Marcar como especial'} style={s.botonIcono}>
              <Star size={15} color={isSpecial ? brand.warning : brand.white} fill={isSpecial ? brand.warning : 'rgba(0,0,0,0.35)'} />
            </Pressable>
          )}
          {onAdd && (
            <Pressable onPress={onAdd} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={`Añadir ${product.title} al carrito`} style={s.botonIcono}>
              <ShoppingCart size={15} color={brand.white} />
            </Pressable>
          )}
          {onFav && (
            <Pressable onPress={onFav} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={favorited ? 'Quitar de favoritos' : 'Añadir a favoritos'} style={s.botonIcono}>
              <Heart size={15} color={favorited ? brand.like : brand.white} fill={favorited ? brand.like : 'rgba(0,0,0,0.35)'} />
            </Pressable>
          )}
        </View>
      )}

      <View style={s.cuerpo} pointerEvents="none">
        <Text numberOfLines={2} style={s.titulo}>{product.title}</Text>
        <Precio valor={product.priceXaf} forma="pastilla" tamano={precioTamano} style={s.precio} />
      </View>
    </View>
  );
}

/**
 * Esqueleto de carga de la tarjeta. Vive aquí, y no en cada pantalla, por la misma razón que la
 * tarjeta: **tiene que medir exactamente lo mismo**. Si el esqueleto midiera distinto, el contenido
 * daría un salto al terminar de cargar. Las barras van al pie, que es donde está el texto de verdad;
 * el resto de la tarjeta es la foto.
 */
export function EsqueletoTarjeta({ width, aspect = PROPORCION_TARJETA }: { width?: number; aspect?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        s.card,
        {
          aspectRatio: aspect, backgroundColor: colors.surface, borderColor: colors.border,
          justifyContent: 'flex-end', padding: espaciado.e8, gap: espaciado.e4,
        },
        width ? { width } : { flex: 1 },
      ]}
    >
      <View style={{ height: 34, borderRadius: radios.sm, backgroundColor: colors.border, width: '95%' }} />
      <View style={{ height: 22, borderRadius: radios.sm, backgroundColor: colors.border, width: '60%' }} />
    </View>
  );
}

const s = StyleSheet.create({
  /**
   * La altura NO se declara: sale del ancho por `aspectRatio`. Eso es lo que deja la rejilla
   * alineada sin cascada y sin tener que conocer la proporción de cada foto. `alignSelf` para que
   * el `stretch` de la fila no pise la proporción.
   */
  card: { alignSelf: 'flex-start', borderRadius: radios.lg, overflow: 'hidden', borderWidth: trazo.fino },
  etiquetas: { position: 'absolute', top: 8, left: 8, right: 8, alignItems: 'flex-start', gap: 4 },
  chipNaranja: { backgroundColor: 'rgba(255,107,53,0.92)', borderRadius: radios.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  chipEmoji: { fontSize: tipografia.micro },
  chipAzul: { backgroundColor: 'rgba(0,132,255,0.92)', borderRadius: radios.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  chipPro: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.5 },
  /* El estado del artículo y la etiqueta del sitio van sobre fondo oscuro TRASLÚCIDO y no con un
     color del tema: van sobre una foto cualquiera, y es el mismo recurso que el corazón. */
  chipOscuro: { maxWidth: '100%', alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radios.sm, paddingHorizontal: 6, paddingVertical: 2 },
  chipTexto: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.fuerte },
  acciones: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  interes: { overflow: 'hidden', fontSize: tipografia.micro, fontWeight: peso.fuerte, color: brand.white, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: radios.lg, paddingHorizontal: 7, paddingVertical: 3 },
  botonIcono: { padding: 5, borderRadius: radios.full, backgroundColor: 'rgba(0,0,0,0.42)' },
  /** El contenido, pegado al pie sobre el velo. `none` porque dentro no hay nada interactivo. */
  cuerpo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: espaciado.e8 },
  /** Blanco fijo y no `colors.textPrimary`: el texto va sobre el velo oscuro, en los dos temas. La
   *  sombra es funcional —la primera línea cae donde el velo todavía es claro—, no adorno.
   *
   *  El `800` es el ÚNICO literal de peso que queda aquí, y es a propósito: **la escala `peso` no lo
   *  contiene** (es 400/500/700/900) mientras es el peso de énfasis dominante de la app, con 766
   *  usos. Migrarlo a 700 o a 900 cambiaría el aspecto de todos ellos, así que es una decisión de
   *  diseño pendiente y no una que se tome dentro de un refactor de tarjetas. Todo lo demás de este
   *  fichero —`peso.titulo`, `peso.fuerte`, `trazo.fino` y cada tamaño y radio— va por token. */
  titulo: { fontSize: tipografia.body, fontWeight: '800', color: brand.white, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  /** Todo lo demás de la pastilla —fondo, borde, radio, relleno y tipografía— lo pone `Precio`, que
   *  es quien sabe que la cifra y su unidad son una sola pieza y no pueden partirse en dos líneas.
   *  Aquí sólo el hueco con el título, y en la escala de espaciado. */
  precio: { marginTop: espaciado.e8 },
});
