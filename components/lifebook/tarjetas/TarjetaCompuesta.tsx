/**
 * TarjetaCompuesta — tarjeta 8 de 54 · `bcim_chat_composite_44`
 *
 * QUÉ ES: la tarjeta más «DSL» de las 54. No es un caso de negocio concreto, sino un **mensaje
 * compuesto**: una lista de párrafos, y cada párrafo una lista de elementos que pueden ser texto,
 * un enlace pulsable o un recurso con imagen y título. La usa el servidor para montar avisos ricos
 * sin inventar una tarjeta nueva cada vez.
 *
 * POR QUÉ ES LA MÁS IMPORTANTE DE ESTA TANDA: es la prueba de que la propuesta del tipo genérico es
 * la correcta. La referencia resolvió «necesito un aviso nuevo» con **un tipo de tarjeta compuesto
 * por piezas**, no con 54 tarjetas distintas. Esta es exactamente esa idea, del lado del cliente.
 *
 * FORMA DE LOS DATOS (del DSL): `content.data.content.paragraphs`, y dentro de cada párrafo una
 * lista de elementos con `type` · `text` · `url` · `image` · `name` · `title` · `src`.
 *
 * ANATOMÍA DE LA REFERENCIA (16 nodos): tarjeta radio 12 padding 12/10 · párrafos de texto 16/20 ·
 * los enlaces en su azul claro y pulsables · recurso con imagen de 70 y radio 8, título a 13/18 ·
 * separador de 0,5 de alto.
 *
 * CÓMO SE DECIDE QUÉ ES CADA ELEMENTO — y esto es una decisión, no un descuido: la referencia trae
 * un campo `type` por elemento, pero **no he podido confirmar su vocabulario** sin ver los valores
 * reales que manda el servidor. Así que en vez de adivinar una tabla de tipos, se decide **por la
 * forma del dato**: si trae `image`, es un recurso; si trae `url`, es un enlace; si no, es texto.
 * Es más robusto que una tabla adivinada: un tipo nuevo del servidor no rompe nada, se pinta como
 * texto. Cuando se conozca el vocabulario, se añade el mapeo aquí y ya.
 *
 * DECISIÓN DE IDENTIDAD: el azul de los enlaces es el de acción de LifeBook, no el azul claro de la
 * referencia. Un enlace pulsable usa el mismo azul que el resto de acciones de la app.
 *
 * PENDIENTE DE CONTRATO: mensaje compuesto. Con el tipo genérico propuesto, esta tarjeta es
 * directamente el renderizador por defecto.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  brand, espaciado, interlineado, peso, radios, Tactil, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export interface ElementoCompuesto {
  type?: string | null;
  text?: string | null;
  url?: string | null;
  image?: string | null;
  name?: string | null;
  title?: string | null;
  src?: string | null;
}

export interface ParrafoCompuesto {
  text?: string | null;
  elements?: ElementoCompuesto[];
}

export function TarjetaCompuesta({ parrafos, onEnlace, onRecurso }: {
  parrafos: ParrafoCompuesto[];
  onEnlace?: (url: string) => void;
  onRecurso?: (elemento: ElementoCompuesto) => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      {parrafos.map((p, i) => {
        const elementos = p.elements?.length ? p.elements : [{ text: p.text }];
        return (
          <View key={i} style={[estilos.parrafo, i > 0 && { marginTop: espaciado.e8 }]}>
            {elementos.map((el, j) => {
              const imagen = el.image ?? el.src;

              // Recurso: imagen con su título. Va en bloque, no en línea.
              if (imagen) {
                return (
                  <Tactil
                    key={j}
                    onPress={onRecurso ? () => onRecurso(el) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={el.title ?? el.name ?? 'Recurso'}
                    style={estilos.recurso}
                  >
                    <Image source={imagen} style={estilos.recursoFoto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    <Text style={[estilos.recursoTitulo, { color: colors.textPrimary }]} numberOfLines={2}>
                      {el.title ?? el.name ?? ''}
                    </Text>
                  </Tactil>
                );
              }

              const texto = el.text ?? el.name ?? '';
              if (!texto) return null;

              // Enlace: el azul de ACCIÓN de LifeBook, no el de la referencia.
              if (el.url) {
                return (
                  <Tactil
                    key={j}
                    onPress={onEnlace ? () => onEnlace(el.url as string) : undefined}
                    accessibilityRole="link"
                    accessibilityLabel={texto}
                  >
                    <Text style={[estilos.texto, { color: brand.primary, fontWeight: peso.medio }]}>{texto}</Text>
                  </Tactil>
                );
              }

              return (
                <Text key={j} style={[estilos.texto, { color: colors.textPrimary }]}>{texto}</Text>
              );
            })}
          </View>
        );
      })}

      <View style={[estilos.separador, { backgroundColor: colors.border }]} />
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  parrafo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  texto: { fontSize: tipografia.subtitle, lineHeight: interlineado.amplio },
  recurso: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e5,
    borderRadius: radios.sm, marginVertical: espaciado.e10, width: '100%',
  },
  recursoFoto: { width: 70, height: 70, borderRadius: radios.sm },
  recursoTitulo: { flex: 1, fontSize: tipografia.detalle, lineHeight: interlineado.body },
  separador: { height: StyleSheet.hairlineWidth, marginBottom: espaciado.e10, marginTop: espaciado.e10 },
});
