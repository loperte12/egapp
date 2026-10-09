/**
 * TarjetaEvidencias — tarjeta 16 de 54 · `bcim_chat_evidence_220`
 *
 * QUÉ ES: las pruebas que el usuario ha subido a un caso (fotos de un desperfecto, de un paquete
 * abierto, de lo que no llegó). Una cabecera con el recuento y una tira de miniaturas.
 *
 * FORMA DE LOS DATOS (del DSL, un solo campo): `evidenceUrlList` — la lista de direcciones de las
 * imágenes. La referencia no manda nada más: ni pie de foto, ni orden distinto del de subida.
 *
 * ANATOMÍA DE LA REFERENCIA (8 nodos): tarjeta radio 12 con padding 16/12 · cabecera 14/20 en peso
 * medio con el estado a la derecha en gris · tira horizontal de miniaturas de 54, con **radio 6**,
 * separadas 8 y **sin separación antes de la primera** (la referencia calcula el margen con el
 * índice de la lista) · tocar una abre la vista previa.
 *
 * DECISIONES:
 *  1. **La tira se desplaza en horizontal** (`ScrollView`), no se corta. La referencia usa un
 *     `ListLayout` de 54 de alto, que también desplaza. Con seis pruebas, cortar la fila escondería
 *     las últimas sin avisar; y no se envuelve a varias filas porque entonces una tarjeta con doce
 *     fotos se come la conversación entera.
 *  2. **Sin margen antes de la primera**, como la referencia: el hueco de la izquierda se ve como un
 *     error de alineación.
 *  3. El radio 6 es `radios.marca` del kit, que existe para la micro-marca; la miniatura es
 *     exactamente eso.
 *
 * PENDIENTE DE CONTRATO: ya no. Con el tipo genérico `card`, esta tarjeta se manda como
 * `cardType: 'evidencias'` y no hace falta ningún tipo nuevo.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { espaciado, interlineado, peso, radios, Tactil, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaEvidencias({ imagenes, titulo, estado, onAbrir }: {
  /** Las direcciones de las pruebas, en orden de subida. */
  imagenes: string[];
  /** Acepta `null` porque viene del servidor y puede no llegar. */
  titulo?: string | null;
  /** Texto de estado a la derecha («Subido», «Pendiente»…). */
  estado?: string | null;
  onAbrir?: (url: string, indice: number) => void;
}) {
  const { colors } = useTheme();
  const pruebas = (imagenes ?? []).filter(Boolean);
  if (!pruebas.length) return null;

  return (
    <TarjetaEnChat style={estilos.tarjeta}>
      <View style={estilos.cabecera}>
        <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={1}>
          {titulo ?? 'Las pruebas que subí'}
        </Text>
        {estado ? (
          <Text style={[estilos.estado, { color: colors.textSecondary }]} numberOfLines={1}>{estado}</Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={estilos.tira}
      >
        {pruebas.map((url, i) => (
          <Tactil
            key={`${url}-${i}`}
            onPress={onAbrir ? () => onAbrir(url, i) : undefined}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Prueba ${i + 1} de ${pruebas.length}`}
            /* La primera sin margen: el hueco a la izquierda se ve como error de alineación. */
            style={i === 0 ? undefined : estilos.separacion}
          >
            <Image source={url} style={estilos.miniatura} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          </Tactil>
        ))}
      </ScrollView>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { paddingTop: espaciado.e16, paddingBottom: espaciado.e16 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e12 },
  titulo: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  estado: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  tira: { alignItems: 'center' },
  separacion: { marginLeft: espaciado.e8 },
  /** 54 como la referencia; radio `marca` (6), que es la micro-marca del kit. */
  miniatura: { width: 54, height: 54, borderRadius: radios.marca },
});
