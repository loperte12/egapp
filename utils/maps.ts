/**
 * Llevar a alguien a un punto en el mapa, desde cualquier pantalla.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * La dirección de entrega es TEXTO LIBRE y en la base hay cosas como «Aeropuerto». Con eso, ni el
 * repartidor puede navegar ni el cliente puede enseñar dónde está. Con coordenadas se abre la app de
 * mapas EN EL PUNTO (`geo:` en Android, `maps:` en iOS); sin ellas se busca el texto, que es peor
 * («Aeropuerto» puede devolver media ciudad) pero sigue siendo mejor que nada.
 *
 * Si no hay ninguna app que atienda el esquema nativo, se cae al navegador con el mismo destino: en un
 * móvil recién instalado eso es lo normal, y un botón que no hace nada es peor que un enlace.
 */
import { Alert, Linking, Platform } from 'react-native';

export function abrirMapa(lat: number | null, lng: number | null, direccion: string | null) {
  const texto = (direccion ?? '').trim();
  const hayPin = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
  const web = hayPin
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
  if (!hayPin && !texto) {
    Alert.alert('Ubicación', 'Este pedido no tiene ni dirección ni ubicación a la que llevar.');
    return;
  }
  const nativo = hayPin
    ? (Platform.OS === 'ios'
      ? `maps:0,0?q=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}${texto ? `(${encodeURIComponent(texto)})` : ''}`)
    : null;
  if (!nativo) { Linking.openURL(web).catch(() => Alert.alert('Mapa', 'No se pudo abrir el mapa.')); return; }
  Linking.openURL(nativo).catch(() => {
    Linking.openURL(web).catch(() => Alert.alert('Mapa', 'No hay ninguna app de mapas instalada.'));
  });
}
