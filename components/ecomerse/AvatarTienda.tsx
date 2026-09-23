/**
 * AvatarTienda — el logo de una tienda, o su inicial si no tiene.
 *
 * POR QUÉ ES UN COMPONENTE. Lo pintan DOS sitios desde la Fase 4: la fila de la lista de Mensajes y
 * la cabecera de la conversación. La regla que aplica no es trivial —«si hay `photoUrl` se pinta la
 * foto, y si la imagen falla al cargar se cae a la inicial»— y escrita dos veces se desviaría: una
 * copia acabaría enseñando el marco vacío del `Image` y la otra no. Es el mismo motivo por el que
 * existe `CabeceraTienda.tsx` (una definición, dos consumidores) y el que ya costó caro con el
 * precio, cuatro sitios y tres tratamientos para el mismo dato.
 *
 * POR QUÉ NO SE PINTA LA FOTO DE LA CABECERA DE TIENDA. `CabeceraTienda` sigue con la inicial porque
 * allí el dato llega como `photoKey` —una clave del almacenamiento, sin URL—. Aquí el servidor manda
 * `photoUrl` YA RESUELTA (`EcomerseStorageService.urlDeClave`), que es justo lo que faltaba. Cuando
 * la cabecera reciba también la URL resuelta, le bastará con usar esto.
 *
 * POR QUÉ HAY ESTADO DE FALLO. Una URL rota no avisa: `Image` se queda con el hueco en blanco y la
 * fila parece no haber cargado. Con `onError` se pasa a la inicial, que siempre se puede pintar.
 */

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { alpha, peso, radios, trazo, useTheme } from '@egrouteplan/ui-kit';

export function AvatarTienda({
  nombre,
  fotoUrl,
  tamano = 36,
}: {
  nombre: string | null | undefined;
  fotoUrl: string | null | undefined;
  tamano?: number;
}) {
  const { colors } = useTheme();
  const [rota, setRota] = useState(false);
  /* Si la tienda cambia (la lista se recarga con otro logo), el fallo anterior no la condena. */
  useEffect(() => { setRota(false); }, [fotoUrl]);

  const letra = (nombre ?? 'T').charAt(0).toUpperCase();
  const marco = {
    width: tamano,
    height: tamano,
    borderRadius: radios.md,
    borderWidth: trazo.fino,
    borderColor: colors.border,
  } as const;

  if (fotoUrl && !rota) {
    return <Image source={{ uri: fotoUrl }} style={marco} onError={() => setRota(true)} />;
  }
  return (
    <View style={[marco, styles.letra, { backgroundColor: alpha(colors.primary, 0.15) }]}>
      <Text style={[styles.inicial, { color: colors.primary, fontSize: tamano * 0.45 }]}>{letra}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  letra: { alignItems: 'center', justifyContent: 'center' },
  inicial: { fontWeight: peso.titulo },
});
