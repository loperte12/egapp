/**
 * FilaServicios — los servicios en la CABECERA, como Taobao
 * ==========================================================
 *
 * **Lo pidió el dueño del producto (15/10/2026)**: los servicios que ya están en la Home, en la
 * cabecera del Mercado, **dos filas de cinco**, y **lo que sobra dentro de «Más servicios»** con su
 * icono, como Taobao.
 *
 * ## Qué NO hace
 *
 * **No reimplementa la lógica del servicio.** Pulsar «Taxi» aquí hace exactamente lo mismo que
 * pulsarlo en la Home: si el servicio tiene perfiles, pregunta (y lo recuerda); si es urgencia, abre el
 * modal —no navega—; si es «próximamente», está deshabilitado y lo dice; y la ruta pasa por el
 * validador. Todo eso vive en `useServicios`, que es el mismo que usa `ServiceGrid`.
 *
 * ## La rejilla
 *
 * Cinco columnas y el hueco de **12** que Taobao usa en su rejilla de accesos (`m_h_icons_low_purchase`,
 * `m_h_v5_dojo_icons_d3_2026`: 5 columnas, `COLUMN_SPACING=12`). La **última plaza es «Más servicios»**
 * —no un servicio más—, y por eso se ven nueve: el reparto lo hace `reparteServicios`, que además
 * decide **si hay que enseñar el botón** (si todo cupiera, no se enseña).
 *
 * «Más servicios» **abre las que sobran ahí mismo**, en una hoja con la misma rejilla y el mismo
 * comportamiento: la alternativa era mandarlas a otra pantalla, y entonces «más» sería una salida en
 * vez de una ampliación de lo que ya estás viendo.
 */

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LayoutGrid } from 'lucide-react-native';
import { espaciado, peso, radios, tipografia, useTheme, alpha } from '@egrouteplan/ui-kit';

import { colorDeServicio } from './colorServicio';
import { reparteServicios } from './repartoServicios';
import { SelectorDePerfil } from './SelectorDePerfil';
import { useServicios } from './useServicios';

/** El hueco de una rejilla de accesos en Taobao: **medido**, 12. */
const HUECO = 12;

export function FilaServicios({ alAbrirEmergencia, filas = 2, columnas = 5, testID }: {
  /** La urgencia **no navega**: la pantalla decide qué hacer (aquí se le pasa). */
  alAbrirEmergencia: () => void;
  filas?: number;
  columnas?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { servicios, prensar, mantenerPulsado, eligiendo, elegirPerfil, cerrarSelector } = useServicios(alAbrirEmergencia);
  const [masAbierto, setMasAbierto] = useState(false);

  const reparto = useMemo(() => reparteServicios(servicios, filas, columnas), [servicios, filas, columnas]);

  // El reparto da una lista plana de SERVICIOS; la rejilla la corta por columnas. La última plaza la
  // ocupa «más» cuando hay resto, así que las filas salen exactas (9 + «más» = 10 plazas en 2×5).
  const filasVisibles = useMemo(() => {
    const celdas: Array<{ tipo: 'servicio'; item: typeof servicios[number] } | { tipo: 'mas' }> =
      reparto.visibles.map((item) => ({ tipo: 'servicio' as const, item }));
    if (reparto.hayMas) celdas.push({ tipo: 'mas' });
    const out: typeof celdas[] = [];
    for (let i = 0; i < celdas.length; i += columnas) out.push(celdas.slice(i, i + columnas));
    return out;
  }, [reparto, columnas]);

  const coloresSelector = {
    card: (colors as unknown as { card?: string }).card ?? colors.surface,
    surface: colors.surface,
    border: colors.border,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
  };

  /** Una celda de servicio: círculo con su icono y su rótulo. **Con el color de su servicio**: Taobao
   *  pinta su rejilla de accesos como un mosaico de colores, no monocroma (ver `colorServicio`). */
  const celdaServicio = (item: typeof servicios[number], compacta = true) => {
    const Icon = item.icon;
    const apagado = !!item.comingSoon;
    const urgente = item.tone === 'emergency';
    const ancho = compacta ? { width: `${100 / columnas}%` as const } : { width: 64 };
    // **La urgencia manda**: el rojo crítico del tema no compite con la paleta de los servicios.
    // Y el color del servicio sale del TEMA (`colorDeServicio`), no de un hex escrito aquí: así cambia
    // con el modo claro/oscuro y pasa el contraste que el kit ya calculó.
    const color = urgente ? colors.danger : colorDeServicio(item.id, colors, colors.textSecondary);
    return (
      <Pressable
        key={item.id}
        onPress={() => prensar(item)}
        onLongPress={() => mantenerPulsado(item)}
        delayLongPress={450}
        disabled={apagado}
        accessibilityRole={apagado ? undefined : 'button'}
        accessibilityLabel={apagado ? `${item.label}, próximamente` : item.label}
        accessibilityState={apagado ? { disabled: true } : undefined}
        style={({ pressed }) => [s.celda, ancho, { opacity: apagado ? 0.45 : pressed ? 0.6 : 1 }]}
      >
        <View style={[s.circulo, {
          // El círculo lleva el color del servicio **rebajado**, y el icono a color entero: así la
          // celda tiene color sin convertirse en un bloque que compite con la foto de al lado.
          backgroundColor: alpha(color, 0.14),
          borderColor: alpha(color, 0.28),
        }]}>
          <Icon size={compacta ? 20 : 24} color={color} />
        </View>
        <Text numberOfLines={2} style={[s.rotulo, { color: colors.textPrimary }]}>{item.label}</Text>
      </Pressable>
    );
  };

  /** La plaza de «Más servicios»: mismo tamaño que las demás, para que la rejilla quede alineada. */
  const celdaMas = (compacta = true) => (
    <Pressable
      key="mas"
      onPress={() => setMasAbierto(true)}
      accessibilityRole="button"
      accessibilityLabel={`Más servicios, ${reparto.resto.length} más`}
      style={({ pressed }) => [s.celda, compacta ? { width: `${100 / columnas}%` } : { width: 64 }, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[s.circulo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <LayoutGrid size={compacta ? 20 : 24} color={colors.textSecondary} />
      </View>
      <Text numberOfLines={2} style={[s.rotulo, { color: colors.textSecondary }]}>Más servicios</Text>
    </Pressable>
  );

  return (
    <View testID={testID} style={s.contenedor}>
      {filasVisibles.map((fila, i) => (
        <View key={i} style={[s.fila, i > 0 && { marginTop: HUECO }]}>
          {fila.map((celda) => (celda.tipo === 'mas' ? celdaMas() : celdaServicio(celda.item, true)))}
        </View>
      ))}

      {/* LO QUE SOBRA, AQUÍ MISMO. Misma rejilla, mismo comportamiento, misma pregunta de perfil. */}
      <Modal visible={masAbierto} transparent animationType="fade" onRequestClose={() => setMasAbierto(false)}>
        <View style={s.backdrop}>
          <View style={[s.hoja, { backgroundColor: coloresSelector.card }]}>
            <Text style={[s.hojaTitulo, { color: colors.textPrimary }]}>Más servicios</Text>
            <Text style={[s.hojaPista, { color: colors.textSecondary }]}>
              {reparto.resto.length} servicio{reparto.resto.length === 1 ? '' : 's'} más
            </Text>
            <ScrollView contentContainerStyle={s.rejillaHoja}>
              {reparto.resto.map((item) => celdaServicio(item, false))}
            </ScrollView>
            <Pressable onPress={() => setMasAbierto(false)} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ paddingVertical: espaciado.e12 }}>
              <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: peso.fuerte }}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* El selector de perfil: **el mismo modal que la Home**, no una copia. */}
      <SelectorDePerfil solicitud={eligiendo} colores={coloresSelector} alElegir={elegirPerfil} alCerrar={cerrarSelector} />
    </View>
  );
}

const s = StyleSheet.create({
  contenedor: { paddingHorizontal: espaciado.e12, paddingTop: espaciado.e10 },
  fila: { flexDirection: 'row', flexWrap: 'nowrap' },
  celda: { alignItems: 'center', gap: espaciado.e4 },
  circulo: {
    width: 44,
    height: 44,
    borderRadius: radios.tarjeta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  rotulo: { fontSize: tipografia.sello, fontWeight: peso.fuerte, textAlign: 'center', lineHeight: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,31,0.55)', justifyContent: 'flex-end' },
  hoja: { borderTopLeftRadius: radios.panelAncho, borderTopRightRadius: radios.panelAncho, padding: espaciado.e20, paddingBottom: espaciado.e24, maxHeight: '70%' },
  hojaTitulo: { fontSize: tipografia.subCabecera, fontWeight: peso.titulo, textAlign: 'center' },
  hojaPista: { fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e4, marginBottom: espaciado.e16 },
  rejillaHoja: { flexDirection: 'row', flexWrap: 'wrap', rowGap: HUECO, columnGap: HUECO },
});

export default FilaServicios;
