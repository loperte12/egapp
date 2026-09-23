/**
 * Layout de la ZONA DEL COMERCIANTE (`/tienda`).
 *
 * Es un modo dentro de la app: barra propia, cabeceras propias y el comerciante no sale de aquí para
 * moverse entre sus cuatro cosas. El patrón de la casa para modos era una pantalla-hub con tarjetas
 * (Ser Conductor, Mi restaurante); aquí se usa un **grupo de rutas** porque las pestañas tienen que
 * compartir la barra y el estado de cada una sin desmontarse.
 *
 * `animation: 'none'` en el Stack: cambiar de pestaña no es navegar a otro sitio, es cambiar de
 * pestaña —una transición lateral ahí miente sobre la jerarquía.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import BarraTienda from '../../components/ecomerse/BarraTienda';

export default function TiendaLayout() {
  return (
    <View style={styles.raiz}>
      <View style={styles.contenido}>
        <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
      </View>
      <BarraTienda />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  contenido: { flex: 1 },
});
