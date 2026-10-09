/**
 * TarjetaCola — tarjeta 46 de 54 · `bcim_chat_sysqueueinfo_82`
 *
 * QUÉ ES: el estado de la **cola de atención humana**. Dice cuánta gente hay delante y, si se puede,
 * ofrece salir de la cola. Es una tarjeta que el usuario va a mirar varias veces mientras espera, así
 * que lo que tiene que hacer bien es **decir cuánto falta**, no entretener.
 *
 * FORMA DE LOS DATOS (del DSL): `queueCount` (cuántos delante) · `content` (la frase del servidor) ·
 * `enableCancel` (si se puede salir) · `cancel` (el texto del botón).
 *
 * ANATOMÍA DE LA REFERENCIA (18 nodos): tarjeta radio 12 con padding 12 y 12 de separación abajo ·
 * cabecera con el título a 16/20 en peso medio y el botón de cancelar a la derecha (80×28, radio 14,
 * borde de 0,5) · tres líneas a 14/22: cuántos van delante, cuántos esperan, y el aviso de que la
 * espera es larga · **el número de la cola en color de marca**, el resto en el color de texto.
 *
 * DECISIONES:
 *  1. **El número de la cola va en ámbar (`warning`), no en rojo.** La referencia lo pinta en su rojo
 *     de marca. En LifeBook el rojo es de emergencia y estar en una cola no lo es: es una **espera**,
 *     que es exactamente lo que el ámbar significa en esta casa. El número sigue destacando —que es
 *     para lo que la referencia lo colorea— sin romper la ley de color.
 *  2. **Se dice la espera con palabras, no solo con el número.** La referencia añade la frase «hay
 *     mucha cola, la espera es larga» cuando el servidor la manda. Se conserva: el número solo no
 *     dice si eso es mucho o poco.
 *  3. **El botón de salir solo aparece si el servidor lo permite** (`enableCancel`). Ofrecer una
 *     salida que no funciona es peor que no ofrecerla.
 *
 * CONTRATO: `cardType: 'cola'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brand, espaciado, interlineado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';

export function TarjetaCola({ delante, mensaje, etiquetaSalir, onSalir }: {
  /** Cuántas personas hay delante. */
  delante?: number | null;
  /** Frase del servidor («hay mucha cola, la espera es larga»). */
  mensaje?: string | null;
  /** Texto del botón de salir. Si no llega, no se ofrece salir. */
  etiquetaSalir?: string | null;
  onSalir?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <View style={estilos.cabecera}>
        <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={1}>
          Esperando a atención humana
        </Text>
        {etiquetaSalir && onSalir ? (
          <BotonPildora texto={etiquetaSalir} contorno onPress={onSalir} />
        ) : null}
      </View>

      {delante != null ? (
        <Text style={[estilos.linea, { color: colors.textPrimary }]} numberOfLines={1}>
          Tienes <Text style={[estilos.cifra, { color: brand.warning }]}>{delante}</Text>
          {delante === 1 ? ' persona delante' : ' personas delante'}
        </Text>
      ) : null}

      {mensaje ? (
        <Text style={[estilos.aviso, { color: colors.textSecondary }]} numberOfLines={3}>{mensaje}</Text>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e6 },
  titulo: { flex: 1, fontSize: tipografia.subtitle, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  linea: { fontSize: tipografia.body, lineHeight: interlineado.suelto, marginTop: espaciado.e2 },
  /** El número destaca sin ser rojo: una espera es ámbar, no una emergencia. */
  cifra: { fontWeight: peso.fuerte },
  aviso: { fontSize: tipografia.body, lineHeight: interlineado.suelto, marginTop: espaciado.e2 },
});
