/**
 * TarjetaNota — la nota compartida en el chat · referencia `bcim_chat_note_92`
 *
 * QUÉ ES: una nota compartida dentro de la conversación. Portada, título, **quién la escribió** y, si
 * la nota lleva producto, **el producto con su precio original y el rebajado**.
 *
 * ── POR QUÉ ESTE FICHERO EXISTE ─────────────────────────────────────────────
 * Hasta ahora esto se pintaba **en línea dentro de `app/lifebook-chat/[id].tsx`**, un fichero de más
 * de 2.000 líneas, y le faltaban dos cosas que la referencia sí tiene:
 *
 *   1. **la fila del autor** — sin ella, una nota compartida en el chat no dice quién la escribió;
 *   2. **el bloque del producto con el precio original y el rebajado** — sin él, la nota no dice
 *      qué se vende ni si está rebajado, que es la mitad de por qué se comparte una nota.
 *
 * Los dos huecos estaban anotados en el registro de la campaña. Aquí se cierran, y de paso la nota
 * sale del fichero gigante: eso es la mudanza, no un cambio de tarjeta.
 *
 * ANATOMÍA DE LA REFERENCIA (31 nodos): tarjeta de 210 con radio 12 · portada **cuadrada** ·
 * título a 16/20 en peso medio · fila del autor con el avatar de **20** en círculo y el nombre a 12 ·
 * separador de 0,5 · bloque del producto con la imagen de **52** y radio 4 · precios.
 *
 * DECISIONES:
 *  1. **La portada deja de ser 120 de alto y pasa a ser cuadrada.** La referencia la hace cuadrada y
 *     es lo correcto para una nota: su portada es el contenido. Una banda de 120 recorta cualquier
 *     foto vertical justo por donde estaba lo que la hacía interesante.
 *  2. **El precio rebajado se enseña con el original tachado**, como en la alerta de precio y en la
 *     entrega negociada. Es la tercera vez que se usa el mismo recurso a propósito: se ve de dónde
 *     viene y a dónde llega sin tener que restar.
 *  3. **Si la nota no lleva producto, no hay bloque** — y no queda un hueco. La referencia también lo
 *     contempla así.
 *  4. El ancho es el del patrón compartido (282), no los 210 de la referencia.
 *
 * CONTRATO: se despacha por `kind: 'post'`/`'sale'` en el chat (ya existía) **y** queda registrada
 * como `cardType: 'nota'` para que el motor genérico pueda pintarla igual.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, interlineado, peso, Precio, radios, Tactil, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';
import type { LbMessagePostRef } from '../../../api/messages';

export function TarjetaNota({ nota, autor, esVenta, onAbrir }: {
  nota: LbMessagePostRef;
  /** Quién la escribió. Se pinta solo si llega el nombre. */
  autor?: { nombre?: string | null; avatarUrl?: string | null } | null;
  /** `true` si es una venta personal: la referencia le pone una etiqueta al título. */
  esVenta?: boolean;
  onAbrir?: () => void;
}) {
  const { colors } = useTheme();
  const producto = nota.product;
  const hayAutor = Boolean(autor?.nombre);

  const rebajado = Boolean(
    producto?.originalPriceXaf != null
    && producto?.priceXaf != null
    && producto.originalPriceXaf > producto.priceXaf,
  );

  return (
    <TarjetaEnChat onPress={onAbrir} etiquetaAccesible={nota.title}>
      {nota.coverUrl ? (
        <Image source={nota.coverUrl} style={estilos.portada} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      ) : null}

      <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={3}>
        {esVenta ? '🏷️ ' : ''}{nota.title}
      </Text>

      {/* HUECO 1 — la fila del autor. Sin ella la nota no dice de quién es. */}
      {hayAutor ? (
        <View style={estilos.autor}>
          {autor?.avatarUrl ? (
            <Image source={autor.avatarUrl} style={estilos.avatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          ) : (
            <View style={[estilos.avatar, { backgroundColor: alpha(colors.textSecondary, 0.18) }]} />
          )}
          <Text style={[estilos.nombreAutor, { color: colors.textSecondary }]} numberOfLines={1}>
            {autor?.nombre}
          </Text>
        </View>
      ) : null}

      {/* HUECO 2 — el producto de la nota, con su precio original y el rebajado. */}
      {producto ? (
        <>
          <View style={[estilos.separador, { backgroundColor: colors.border }]} />
          <View style={estilos.producto}>
            {producto.imageUrl ? (
              <Image source={producto.imageUrl} style={estilos.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            ) : (
              <View style={[estilos.foto, { backgroundColor: colors.surface }]} />
            )}
            <View style={estilos.datos}>
              {producto.title ? (
                <Text style={[estilos.productoTitulo, { color: colors.textPrimary }]} numberOfLines={2}>
                  {producto.title}
                </Text>
              ) : null}

              {producto.priceXaf != null ? (
                <View style={estilos.precios}>
                  <Precio valor={producto.priceXaf} tamano="sm" color={colors.textPrimary} />
                  {rebajado ? (
                    <Text style={[estilos.antes, { color: colors.textSecondary }]} numberOfLines={1}>
                      {producto.originalPriceXaf} XAF
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {producto.note ? (
                <Text style={[estilos.nota, { color: colors.textSecondary }]} numberOfLines={1}>{producto.note}</Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** Cuadrada, como la referencia: la portada de una nota ES el contenido. */
  portada: { width: '100%', aspectRatio: 1, borderRadius: radios.sm },
  titulo: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.medio, marginTop: espaciado.e8 },
  autor: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: espaciado.e6 },
  /** 20 y círculo: `radios.full` sobre un avatar es un círculo, y se declara como tal. */
  avatar: { width: 20, height: 20, borderRadius: radios.full },
  nombreAutor: { flex: 1, minWidth: 0, fontSize: tipografia.caption, lineHeight: interlineado.caption },
  separador: { height: StyleSheet.hairlineWidth, marginTop: espaciado.e8 },
  producto: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8 },
  foto: { width: 52, height: 52, borderRadius: radios.punta },
  datos: { flex: 1, minWidth: 0 },
  productoTitulo: { fontSize: tipografia.detalle, lineHeight: interlineado.body },
  precios: { flexDirection: 'row', alignItems: 'baseline', gap: espaciado.e6, marginTop: espaciado.e2 },
  /** Tachado, como en la alerta de precio: se ve el cambio sin restar. */
  antes: { fontSize: tipografia.caption, lineHeight: interlineado.caption, textDecorationLine: 'line-through' },
  nota: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e2 },
});

/** Reexportado para que el chat no tenga que importar el tipo desde `piezas`. */
export type { LbMessagePostRef };
