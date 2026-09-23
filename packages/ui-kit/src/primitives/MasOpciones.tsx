/**
 * MasOpciones — lo accesorio detrás de un enlace, en vez de delante compitiendo.
 *
 * POR QUÉ EXISTE (auditoría de diseño, Fase 2 · punto 25): los checkouts enseñaban de entrada TODO
 * lo que se puede rellenar, y lo opcional pesaba visualmente lo mismo que lo que decide la compra
 * (dirección, método de pago, zona). Un formulario donde todo importa igual no tiene jerarquía: el
 * ojo no sabe qué es obligatorio y qué es un extra.
 *
 * LO QUE NO SE PLIEGA AQUÍ: **lo que cambia el dinero**. La zona de entrega define la tarifa y el
 * cupón cambia el total; esconderlos detrás de un enlace sería lo contrario de una mejora de diseño
 * —y en el caso del cupón el propio código documenta que el descuento tiene que verse ANTES de
 * confirmar—. Esto es solo para lo que añade información sin tocar la cifra: una nota, un mensaje
 * al vendedor.
 *
 * Uso:
 *   <MasOpciones
 *     abrir="Añadir una nota para el restaurante"
 *     cerrar="Ocultar la nota"
 *     abiertoInicial={note !== ''}
 *   >
 *     <TextInput … />
 *   </MasOpciones>
 *
 * Dos detalles que no son adorno:
 *  · `abiertoInicial` — si el usuario YA escribió algo, su texto no puede quedar escondido. Quien
 *    llama pasa aquí si hay contenido.
 *  · `accessibilityState={{ expanded }}` — un despliegue que no comunica su estado deja al lector
 *    de pantalla sin saber si el contenido está abierto (es el fallo que se corrigió en la Fase 1).
 *
 * Las etiquetas se piden ENTERAS y en imperativo («Añadir una nota…»), no un «más opciones» a
 * secas: el enlace tiene que decir qué va a aparecer.
 */
import React, { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { espaciado, peso, tipografia } from '../theme/escalas';
import { Tactil } from './Tactil';

export interface MasOpcionesProps {
  /** Texto del enlace CERRADO. Dice qué se va a desplegar. */
  abrir: string;
  /** Texto del enlace ABIERTO (en negativo: «Ocultar la nota»). */
  cerrar: string;
  /** Si debe aparecer desplegado desde el principio (por ejemplo, porque ya hay texto escrito). */
  abiertoInicial?: boolean;
  children: ReactNode;
}

export function MasOpciones({ abrir, cerrar, abiertoInicial = false, children }: MasOpcionesProps) {
  const { colors } = useTheme();
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <View>
      <Tactil
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={abierto ? cerrar : abrir}
        style={styles.enlace}
      >
        <Text style={[styles.texto, { color: colors.primary }]}>
          {abierto ? cerrar : `${abrir} ›`}
        </Text>
      </Tactil>
      {abierto ? <View style={styles.cuerpo}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  enlace: { alignSelf: 'flex-start', paddingVertical: espaciado.e4 },
  texto: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  cuerpo: { marginTop: espaciado.e8 },
});
