/**
 * TarjetaCupon — tarjeta 11 de 54 · `bcim_chat_coupon_19`
 *
 * QUÉ ES: un cupón dentro del chat. Importe grande, mínimo de gasto, tipo y nombre del cupón,
 * validez y la acción para usarlo.
 *
 * FORMA DE LOS DATOS (del DSL): `discount` · `threshold` (mínimo de gasto) · `name` ·
 * `coupon_type` · `template_subtype` · `item_name` · `start_time` · `end_time` · `url`.
 *
 * ANATOMÍA DE LA REFERENCIA (18 nodos): tarjeta de 108 de alto con radio 8 · a la izquierda el
 * importe —símbolo a 14 y cifra a **24**, el tamaño más grande de todas las tarjetas— con el mínimo
 * de gasto debajo a 10 · a la derecha el sello del tipo (radio 2, borde de 0,5, texto a 10), el
 * nombre a 14 y las fechas a 10 · separador de 0,5 · fila de acción.
 *
 * ── LA DECISIÓN DE IDENTIDAD DE ESTA TARJETA ─────────────────────────────────
 * La referencia pinta el importe entero en **rojo**. En LifeBook el rojo está reservado a
 * emergencias, así que aquí no puede ir: un descuento no es una urgencia.
 *
 * Se pinta en **verde de éxito**, y el razonamiento es el de la propia casa: un cupón es un
 * BENEFICIO para quien lo recibe —es dinero que se ahorra—, que es exactamente lo que el verde
 * significa en esta app. Las otras dos opciones se descartan con motivo: el azul es ACCIÓN (y el
 * cupón no se pulsa, se usa: la acción es el botón de abajo), y el naranja CLASIFICA (categoría,
 * sello, servicio), no valora.
 *
 * El sello del tipo sí va en gris neutro: clasifica, no celebra.
 *
 * PENDIENTE DE CONTRATO: cupón. El backend ya tiene la tabla y los endpoints de cupones; lo que
 * falta es poder mandarlo como tarjeta al chat.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  brand, espaciado, interlineado, peso, radios, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';

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
  const validez = [datos.startTime, datos.endTime].filter(Boolean).join(' — ');

  return (
    <TarjetaEnChat onPress={onAbrir} etiquetaAccesible={datos.name ? `Cupón ${datos.name}` : 'Cupón'}>
      <View style={estilos.fila}>
        {/* El importe manda: es lo que hace que el usuario siga leyendo. */}
        <View style={estilos.importe}>
          <View style={estilos.importeLinea}>
            <Text style={[estilos.simbolo, { color: brand.success }]}>XAF</Text>
            <Text style={[estilos.cifra, { color: brand.success }]} numberOfLines={1}>{datos.discount}</Text>
          </View>
          {datos.threshold ? (
            <Text style={[estilos.minimo, { color: brand.success }]} numberOfLines={1}>{datos.threshold}</Text>
          ) : null}
        </View>

        <View style={estilos.detalle}>
          <View style={estilos.nombreLinea}>
            {etiquetaTipo ? (
              <View style={[estilos.sello, { borderColor: colors.textSecondary }]}>
                <Text style={[estilos.selloTexto, { color: colors.textSecondary }]} numberOfLines={1}>
                  {etiquetaTipo}
                </Text>
              </View>
            ) : null}
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
  importeLinea: { flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e2 },
  simbolo: { fontSize: tipografia.detalle, lineHeight: interlineado.caption, fontWeight: peso.medio, marginBottom: espaciado.e2 },
  /** 24: el tamaño más grande de las 54 tarjetas, y aquí está justificado — es la cifra que decide. */
  cifra: { fontSize: tipografia.tituloFicha, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  minimo: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e2 },

  detalle: { flex: 1, minWidth: 0 },
  nombreLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  sello: { borderRadius: radios.punta, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: espaciado.e2 },
  selloTexto: { fontSize: tipografia.nota, lineHeight: interlineado.micro },
  nombre: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio },
  validez: { fontSize: tipografia.nota, lineHeight: interlineado.micro, marginTop: espaciado.e4 },

  separador: { height: StyleSheet.hairlineWidth, marginTop: espaciado.e8 },
  accion: { flexDirection: 'row', marginTop: espaciado.e8 },
});
