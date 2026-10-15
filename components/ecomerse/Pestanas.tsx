/**
 * Pestanas · la barra de pestañas del Mercado (en Taobao, la sección `categoryTab`)
 * =================================================================================
 *
 * ## Qué es
 *
 * Una barra horizontal de pestañas **servida por el servidor**: el árbol trae los datos (una lista de
 * `{ id, etiqueta, emoji }`) y el TEMA (colores y tamaños de la activa y de la inactiva, el subrayado
 * y el hueco). El cliente **no tiene tabla de estilos**.
 *
 * ## De dónde salen los nombres de los atributos
 *
 * De la sección `categoryTab` de la portada de Taobao (`style.styleData.tabs`). La tabla completa, con
 * el token de Taobao del que sale cada uno, está en `pestanasAtributos.ts` (`PROCEDENCIA`) — ahí se
 * puede comprobar en vez de creer.
 *
 * ## Lo que se copia del carril que YA existe en el Mercado
 *
 * `app/ecomerse.tsx:698` (`Pestana`) llevaba tres decisiones buenas y **se mantienen**, porque están
 * pagadas con un fallo cada una:
 *
 * 1. **El subrayado se pinta SIEMPRE**, transparente cuando no toca. Si se pintara solo en la activa,
 *    la pestaña mediría distinto y **al cambiar de pestaña bailaría el alto** de toda la fila.
 * 2. `accessibilityRole="tab"` y `accessibilityState={{ selected }}`: un lector de pantalla tiene que
 *    saber cuál está elegida, no adivinarlo por el color.
 * 3. **`emoji + etiqueta` en un solo `Texto`** con `numberOfLines={1}`: el emoji entra en la medida de
 *    la pestaña, así que no hay un hueco reservado que se vea vacío.
 *
 * ## La selección la lleva el CLIENTE
 *
 * Como el borrador de una `Entrada`: el árbol declara las pestañas y **cuál empieza activa**
 * (`ext:seleccionada`); al tocar, la barra avisa (`alCambiar`) y **la pantalla decide** (filtrar,
 * navegar, pedir otra sección). **El árbol no guarda estado** — esa es la regla del contrato.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { espaciado, peso, radios, tipografia } from '@egrouteplan/ui-kit';

import { estiloDeCaja } from './layoutAtributos';
import { canonizarColor } from './textoAtributos';
import {
  resolverPestanas, etiquetaDePestana, idDePestana,
  type AtributosDxPestanas,
} from './pestanasAtributos';

export interface PestanasProps {
  /** Los atributos de la barra (tema incluido), por clave de Taobao o `ext:`. */
  dx?: AtributosDxPestanas;
  /**
   * Las pestañas. **Las resuelve el `Nodo`** desde el `valor` del nodo (un binding `$categorias`):
   * aquí llegan datos, no una ruta.
   */
  datos?: unknown[];
  /** Aviso al cambiar de pestaña: índice y el `id` de la pestaña. **La pantalla decide qué hacer.** */
  alCambiar?: (indice: number, id: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Pestanas({ dx, datos, alCambiar, style, testID }: PestanasProps) {
  const r = resolverPestanas(dx);
  const pestanas = Array.isArray(datos) ? datos : [];

  // ── LA SELECCIÓN ─────────────────────────────────────────────────────────────────────────────
  // El árbol dice cuál empieza activa; a partir de ahí manda el dedo. **Si el servidor vuelve a
  // mandar otra (porque recargó la sección), la suya gana**: el servidor es el que sabe.
  const [activa, setActiva] = useState(r.seleccionada);
  useEffect(() => { setActiva(r.seleccionada); }, [r.seleccionada]);
  // Y si la lista se acorta, la activa no puede quedar fuera: sería una barra sin ninguna elegida.
  const indiceActivo = pestanas.length === 0 ? -1 : Math.min(activa, pestanas.length - 1);

  // Sin pestañas no hay barra. **Una barra vacía es una barra que no está**, y se nota.
  if (pestanas.length === 0) return null;

  const colorNormal = canonizarColor(r.color);
  const colorActivo = canonizarColor(r.colorSeleccionado) ?? colorNormal;
  const colorIndicador = canonizarColor(r.indicadorColor) ?? colorActivo;
  const tamanoActivo = r.tamanoSeleccionado ?? r.tamano;

  return (
    <View
      testID={testID}
      style={[estiloDeCaja(dx) as StyleProp<ViewStyle>,
        r.fondo ? { backgroundColor: canonizarColor(r.fondo) } : null,
        style]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          // Las mismas medidas que el carril que ya vive en `app/ecomerse.tsx:674`: el hueco entre
          // pestañas lo dice el árbol (`ext:espacio`), el aire de los lados es el de la casa.
          { paddingHorizontal: espaciado.e16, alignItems: 'flex-end' },
          r.espacio !== undefined ? { columnGap: r.espacio } : null,
        ]}
      >
        {pestanas.map((dato, i) => {
          const etiqueta = etiquetaDePestana(dato);
          const activaEsta = i === indiceActivo;
          return (
            <Pressable
              key={idDePestana(dato) || `p_${i}`}
              onPress={() => {
                setActiva(i);
                alCambiar?.(i, idDePestana(dato));
              }}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected: activaEsta }}
              accessibilityLabel={etiqueta}
              style={estilos.pestana}
            >
              <Text
                numberOfLines={1}
                style={[
                  estilos.texto,
                  { color: activaEsta ? colorActivo : colorNormal, fontSize: activaEsta ? tamanoActivo : r.tamano },
                  // La activa va en negrita si el tema lo pide (`selectedIsBold` de Taobao). **La
                  // inactiva en peso normal**: el carril viejo ponía las 18 en negrita, y así la
                  // elegida se distinguía menos; con el color y el subrayado ya se distingue sola.
                  { fontWeight: activaEsta && r.negritaSeleccionada ? peso.fuerte : peso.normal },
                ]}
              >
                {etiqueta}
              </Text>
              {/* SIEMPRE pintado: transparente cuando no toca. Ver la cabecera del fichero. */}
              <View
                style={[
                  estilos.subrayado,
                  r.indicadorTipo === 'dot' ? estilos.punto : estilos.linea,
                  { backgroundColor: r.indicador && activaEsta ? colorIndicador : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  /** Mismo alto de pestaña que el carril del listado: aire arriba, texto, y el subrayado debajo. */
  pestana: { alignItems: 'center', paddingTop: espaciado.e8 },
  texto: { fontSize: tipografia.caption, paddingBottom: espaciado.e4, fontWeight: peso.normal },
  subrayado: { marginTop: espaciado.e2 },
  // `radios.full` y no `1` a mano: el subrayado mide 2 dp de alto, así que el radio máximo lo deja
  // con los extremos redondeados igual, y **no es un valor suelto de radio**.
  linea: { height: 2, width: '100%', minWidth: espaciado.e16, borderRadius: radios.full },
  // El punto usa el radio del kit: así es un círculo y no un cuadrado con las esquinas a mano.
  punto: { height: radios.marca, width: radios.marca, borderRadius: radios.marca },
});

export default Pestanas;

export { resolverPestanas, CLAVES_PESTANAS, PROCEDENCIA, etiquetaDePestana, idDePestana } from './pestanasAtributos';
export type { AtributosDxPestanas, ResolucionPestanas } from './pestanasAtributos';
