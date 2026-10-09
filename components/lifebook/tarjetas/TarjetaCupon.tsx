/**
 * TarjetaCupon — tarjeta 11 de 54 · `bcim_chat_coupon_19`
 *
 * QUÉ ES: un cupón dentro del chat. Importe grande, mínimo de gasto, tipo y nombre, validez y la
 * acción para usarlo.
 *
 * FORMA DE LOS DATOS (del DSL): `discount` · `threshold` (mínimo de gasto) · `name` ·
 * `coupon_type` · `template_subtype` · `item_name` · `start_time` · `end_time` · `url`.
 *
 * ANATOMÍA DE LA REFERENCIA (18 nodos): tarjeta de 108 de alto con radio 8 · a la izquierda el
 * importe —símbolo a 14 y cifra a **24**, el tamaño más grande de las tarjetas de cupón— con el
 * mínimo de gasto debajo a 10 · a la derecha el sello del tipo (radio 2, borde de 0,5, texto a 10),
 * el nombre a 14, el artículo y las fechas a 10 · separador de 0,5 · fila de acción.
 *
 * EL COLOR DEL IMPORTE ES LA DECISIÓN DE IDENTIDAD DE ESTAS TARJETAS. La referencia lo pinta en
 * rojo. En LifeBook el rojo está reservado a emergencias, y un descuento no es una urgencia: va en
 * verde de éxito —un cupón es un BENEFICIO, dinero que el usuario se ahorra—. El azul se descarta
 * porque es ACCIÓN y el cupón no se pulsa, se usa; el naranja porque CLASIFICA, no valora.
 *
 * El importe y el sello salen de `piezas-cupon`, compartidos con las tarjetas 12 y 13: las tres son
 * el mismo contenido con tres envoltorios, y lo que se repite de verdad es el bloque del importe.
 *
 * PENDIENTE DE CONTRATO: cupón. El backend ya tiene la tabla y los endpoints; lo que falta es poder
 * mandarlo como tarjeta al chat.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';
import { ImporteCupon, SelloTipoCupon } from './piezas-cupon';

export interface DatosCupon {
  discount: string;
  threshold?: string | null;
  name?: string | null;
  couponType?: string | null;
  itemName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  url?: string | null;
}

export function TarjetaCupon({ datos, etiquetaTipo, onUsar, onAbrir }: {
  datos: DatosCupon;
  /** Texto del sello de tipo («Cupón», «Cupón de tienda»…). Lo manda el servidor. */
  etiquetaTipo?: string | null;
  onUsar?: () => void;
  onAbrir?: () => void;
}) {
  const { colors } = useTheme();
  const tipo = etiquetaTipo ?? datos.couponType;
  const validez = [datos.startTime, datos.endTime].filter(Boolean).join(' — ');

  return (
    <TarjetaEnChat onPress={onAbrir} etiquetaAccesible={datos.name ? `Cupón ${datos.name}` : 'Cupón'}>
      <View style={estilos.fila}>
        {/* El importe manda: es lo que hace que el usuario siga leyendo. */}
        <View style={estilos.importe}>
          <ImporteCupon cantidad={datos.discount} simbolo="XAF" minimo={datos.threshold} />
        </View>

        <View style={estilos.detalle}>
          <View style={estilos.nombreLinea}>
            {tipo ? <SelloTipoCupon texto={tipo} /> : null}
            {datos.name ? (
              <Text style={[estilos.nombre, { color: colors.textPrimary }]} numberOfLines={2}>{datos.name}</Text>
            ) : null}
          </View>
          {datos.itemName ? (
            <Text style={[estilos.validez, { color: colors.textSecondary }]} numberOfLines={1}>{datos.itemName}</Text>
          ) : null}
          {validez ? (
            <Text style={[estilos.validez, { color: colors.textSecondary }]} numberOfLines={1}>{validez}</Text>
          ) : null}
        </View>
      </View>

      <View style={[estilos.separador, { backgroundColor: colors.border }]} />

      {onUsar ? (
        <View style={estilos.accion}>
          <BotonPildora texto="Usar cupón" onPress={onUsar} />
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', gap: espaciado.e12 },
  importe: { minWidth: 84 },
  detalle: { flex: 1, minWidth: 0 },
  nombreLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  nombre: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio },
  validez: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e4 },
  separador: { height: StyleSheet.hairlineWidth, marginTop: espaciado.e8 },
  accion: { flexDirection: 'row', marginTop: espaciado.e8 },
});
