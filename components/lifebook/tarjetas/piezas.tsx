/**
 * Piezas compartidas de las TARJETAS DE CHAT (campaña de las 54 de 小红书).
 *
 * POR QUÉ EXISTEN
 * La auditoría de la mensajería midió el defecto de fondo: **cada tarjeta se construía a mano**.
 * De los 34 componentes de `components/lifebook`, 20 no los importaba nadie y los que se usaban
 * repetían el mismo esqueleto —cabecera, bloque de producto, pie débil— con medidas distintas
 * cada vez. La referencia hace lo contrario: **10 tipos de nodo describen sus 54 tarjetas**.
 *
 * Estas piezas son ese vocabulario mínimo, traducido a React Native. Se han sacado de las
 * tarjetas reales, no de una idea previa:
 *   · el bloque de 56pt aparece en **13 de las 54**;
 *   · el radio 12 es el dominante (49 usos) y el 8 el segundo (21);
 *   · el padding 12/8 y los huecos 8/4/2 se repiten en todas.
 *
 * REGLA: si una tarjeta necesita algo que no está aquí, **se añade aquí**, no se construye una
 * copia local. Es la regla que ya está escrita en `RELEVO.md` para el kit, aplicada un nivel más
 * abajo (esto es el vocabulario del comercio en el chat, no el del kit entero).
 *
 * IDENTIDAD: el azul de acción es `brand.primary`; los estados usan la semántica de la casa
 * (verde éxito · naranja proceso · ámbar pendiente) y **el rojo NO se usa para estados**: está
 * reservado a emergencias. Los textos son del kit y los tamaños salen de `tipografia` y
 * `interlineado`.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, brand, espaciado, interlineado, peso, radios, Tactil, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import { Copy, Package } from 'lucide-react-native';

/** Tono semántico de un estado. El rojo no está en la lista a propósito. */
export type Tono = 'exito' | 'proceso' | 'espera' | 'neutro';

export function colorDeTono(tono: Tono, colors: { success: string; secondary: string; warning: string; textSecondary: string }): string {
  switch (tono) {
    case 'exito': return colors.success;
    case 'proceso': return colors.secondary;
    case 'espera': return colors.warning;
    default: return colors.textSecondary;
  }
}

/**
 * EL ESTADO DE MÁQUINA, separado del rótulo que se lee.
 *
 * ── POR QUÉ SE SEPARAN ───────────────────────────────────────────────────────
 * Antes las tarjetas recibían `estado: string` y el color lo decidía quien llamaba. Eso confunde
 * dos cosas distintas: **en qué punto está** (la máquina) y **cómo se llama ese punto en la
 * pantalla** (el rótulo). Mezcladas, la tarjeta no puede decidir el color sin parsear texto —y
 * parsear texto para decidir un color es cómo se acaba pintando de rojo «No entregado» porque
 * lleva la palabra «no».
 *
 * La referencia (`content.data.content.state` frente a `statusInfo.text`) también las separa.
 *
 * ── Y LO QUE NO SE COPIA DE LA REFERENCIA ────────────────────────────────────
 * Ella manda además el color (`statusInfo.theme`). Aquí **no**: el color sale de esta función, en
 * el cliente, para que la ley visual no dependa de lo que diga un servidor.
 */
export type ClaveEstado = 'pendiente' | 'en_proceso' | 'hecho' | 'cancelado' | 'aviso';

/**
 * De la clave al tono. Un solo sitio decide, y el rojo sigue sin estar en la lista: una tarjeta de
 * chat nunca pinta un estado de emergencia (el rojo es de la infracción y de nada más).
 */
export function tonoDeClave(clave: ClaveEstado): Tono {
  switch (clave) {
    case 'hecho': return 'exito';
    case 'en_proceso': return 'proceso';
    case 'pendiente':
    case 'aviso': return 'espera';
    case 'cancelado':
    default: return 'neutro';
  }
}

/**
 * UN BOTÓN DE TARJETA, con su identidad aparte de su texto.
 *
 * ── POR QUÉ LLEVA `id` ───────────────────────────────────────────────────────
 * Antes el toque devolvía **el texto del botón** (`onBoton('Abrir')`). Eso ata el comportamiento al
 * rótulo: cambia una coma en el texto y el cableado se rompe en silencio. La referencia ya lo hace
 * bien (`buttons[].id` frente a `buttons[].buttonValue`): el `id` identifica la acción, la
 * `etiqueta` es lo que se lee.
 *
 * `estado: 'inactivo'` es un botón que se ve pero no se pulsa — la referencia lo llama
 * `buttonStatus: 'disabled'`. Un botón que no se puede usar se **enseña apagado**, no se esconde:
 * esconderlo hace que la tarjeta cambie de forma y el usuario no sepa por qué.
 */
/**
 * A DÓNDE VA UN BOTÓN. Viaja **con el botón**, como el `nav` de la referencia.
 *
 * No se usa un mapa global `id → pantalla`: dos tarjetas pueden tener un botón con el mismo texto
 * que lleva a sitios distintos, y un mapa por texto volvería a atar el destino al rótulo — el error
 * que esta adopción viene a corregir. El destino es un dato del botón.
 */
export type DestinoBoton =
  | { tipo: 'pedido'; id?: string }
  | { tipo: 'producto'; id: string }
  | { tipo: 'enlace'; url: string };

export type BotonTarjeta = {
  id: string;
  etiqueta: string;
  estado?: 'activo' | 'inactivo';
  /** Si viene, el chat navega. Si no, el botón se pinta apagado: sin destino no hay acción. */
  destino?: DestinoBoton;
};

/**
 * El armazón: una tarjeta con el radio y el padding del patrón aprobado, y **toda ella táctil**
 * cuando hay acción —como en la referencia, donde la tarjeta entera navega.
 */
export function TarjetaEnChat({ children, onPress, etiquetaAccesible, style }: {
  children: ReactNode;
  /** Si viene, toda la tarjeta es el objetivo del toque. */
  onPress?: () => void;
  etiquetaAccesible?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const base = [estilos.tarjeta, { backgroundColor: colors.card }, style];

  if (onPress) {
    return (
      <Tactil onPress={onPress} accessibilityRole="button" accessibilityLabel={etiquetaAccesible} style={base}>
        {children}
      </Tactil>
    );
  }
  return <View style={base}>{children}</View>;
}

/** Etiqueta de estado: píldora con el tono al 14 %. Tamaño `detalle` (13), no `minimo` (9,5),
 *  que en la tarjeta anterior quedaba ilegible. */
export function EtiquetaEstado({ texto, tono = 'neutro' }: { texto: string; tono?: Tono }) {
  const { colors } = useTheme();
  const color = colorDeTono(tono, colors);
  return (
    <View style={[estilos.pill, { backgroundColor: alpha(color, 0.14) }]}>
      <Text style={[estilos.pillTexto, { color }]} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

/** Cabecera del patrón: título a la izquierda (flex) y estado a la derecha.
 *  `estado` acepta `null` a propósito: viene del servidor y puede no haber llegado. */
export function CabeceraTarjeta({ titulo, estado, tono, estadoClave }: {
  titulo: string;
  /** El rótulo que se lee («En camino»). */
  estado?: string | null;
  /** El tono, si quien llama ya lo sabe. Si llega `estadoClave`, manda la clave. */
  tono?: Tono;
  /**
   * El estado de máquina. Si viene, **decide el color él** y no el llamador: así el color de un
   * estado se decide en un solo sitio y no en cada tarjeta.
   */
  estadoClave?: ClaveEstado | null;
}) {
  const { colors } = useTheme();
  const tonoFinal = estadoClave ? tonoDeClave(estadoClave) : tono;
  return (
    <View style={estilos.cabecera}>
      <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={2}>{titulo}</Text>
      {estado ? <EtiquetaEstado texto={estado} tono={tonoFinal} /> : null}
    </View>
  );
}

/**
 * Bloque del producto o del pedido: foto de 56 dentro de un fondo suave con radio pequeño.
 * Es la pieza que más se repite (13 de las 54). Si no hay foto, entra el icono de paquete:
 * una tarjeta no puede quedar con un hueco.
 */
export function BloquePedido({ imagen, titulo, subtitulo, detalle, cantidad, paquete, onPress, etiquetaAccesible }: {
  imagen?: string | null;
  titulo: string;
  subtitulo?: string | null;
  /** Tercera línea, para el importe o la cantidad. */
  detalle?: ReactNode;
  /**
   * Unidades. Se pinta «×3» al lado del nombre, como en la referencia (`orderDetail.quantity`).
   * Con 1 no se pinta: «×1» no informa de nada y ensucia la línea.
   */
  cantidad?: number | null;
  /** Número de paquete, para el pie del bloque (referencia: `orderDetail.packageId`). */
  paquete?: string | null;
  onPress?: () => void;
  etiquetaAccesible?: string;
}) {
  const { colors } = useTheme();
  const unidades = Number(cantidad ?? 0);
  const contenido = (
    <>
      {imagen ? (
        <Image source={imagen} style={estilos.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      ) : (
        <View style={[estilos.foto, estilos.fotoVacia, { backgroundColor: alpha(colors.primary, 0.08) }]}>
          <Package size={22} color={alpha(colors.text.primary, 0.55)} />
        </View>
      )}
      <View style={estilos.datos}>
        <View style={estilos.bloqueTituloFila}>
          <Text style={[estilos.bloqueTitulo, { color: colors.textPrimary }]} numberOfLines={2}>{titulo}</Text>
          {unidades > 1 ? (
            <Text style={[estilos.bloqueCantidad, { color: colors.textSecondary }]} numberOfLines={1}>×{unidades}</Text>
          ) : null}
        </View>
        {subtitulo ? (
          <Text style={[estilos.bloqueSub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitulo}</Text>
        ) : null}
        {detalle}
        {paquete ? (
          <Text style={[estilos.bloqueSub, { color: colors.textSecondary }]} numberOfLines={1}>
            Paquete {paquete}
          </Text>
        ) : null}
      </View>
    </>
  );

  const estilo = [estilos.bloque, { backgroundColor: colors.surface }];

  if (onPress) {
    return (
      <Tactil onPress={onPress} accessibilityRole="button" accessibilityLabel={etiquetaAccesible} style={estilo}>
        {contenido}
      </Tactil>
    );
  }
  return <View style={estilo}>{contenido}</View>;
}

/**
 * Una fila de dato: etiqueta arriba y valor subrayado, con botón de copiar si el campo lo pide.
 * El subrayado y el icono de copiar salen de la referencia: son números que el usuario tiene que
 * poder copiar (nº de gestión, de devolución). Un dato que hay que teclear de memoria es un dato
 * perdido.
 */
export function FilaDato({ etiqueta, valor, extra, copiable, onCopiar }: {
  etiqueta: string;
  valor: string;
  extra?: string | null;
  copiable?: boolean;
  onCopiar?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={estilos.filaDato}>
      <Text style={[estilos.datoEtiqueta, { color: colors.textSecondary }]} numberOfLines={1}>{etiqueta}</Text>
      <View style={estilos.datoLinea}>
        <Text style={[estilos.datoValor, { color: colors.textPrimary, borderBottomColor: colors.textPrimary }]} numberOfLines={1}>
          {valor}
        </Text>
        {extra ? (
          <Text style={[estilos.datoExtra, { color: colors.textSecondary }]} numberOfLines={1}> ({extra})</Text>
        ) : null}
        {copiable && onCopiar ? (
          <Tactil onPress={onCopiar} accessibilityRole="button" accessibilityLabel={`Copiar ${etiqueta}`} style={estilos.copiar}>
            <Copy size={16} color={colors.textSecondary} />
          </Tactil>
        ) : null}
      </View>
    </View>
  );
}

/** Botón en píldora. `contorno` = solo borde (secundario); si no, relleno con el azul de acción. */
export function BotonPildora({ texto, onPress, contorno, tono, inactivo }: {
  texto: string;
  onPress?: () => void;
  contorno?: boolean;
  tono?: Tono;
  /** Se ve pero no se pulsa. Un botón inactivo se apaga, no se esconde. */
  inactivo?: boolean;
}) {
  const { colors } = useTheme();
  const color = tono ? colorDeTono(tono, colors) : brand.primary;
  const tinte = inactivo ? alpha(color, 0.45) : color;
  const estilo = contorno
    ? [estilos.boton, { borderWidth: trazo.fino, borderColor: tinte, backgroundColor: 'transparent' }]
    : [estilos.boton, { backgroundColor: alpha(tinte, inactivo ? 0.06 : 0.12) }];
  return (
    <Tactil
      onPress={inactivo ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: Boolean(inactivo) }}
      style={estilo}
    >
      <Text style={[estilos.botonTexto, { color: tinte }]} numberOfLines={1}>{texto}</Text>
    </Tactil>
  );
}

/** Fila de botones; si no caben, se reparten. */
export function FilaBotones({ children }: { children: ReactNode }) {
  return <View style={estilos.filaBotones}>{children}</View>;
}

/**
 * Los botones de una tarjeta, desde su contrato. Es la pieza que cierra el hueco de la campaña:
 * antes cada tarjeta pintaba sus botones a mano y el toque devolvía el TEXTO. Aquí el toque
 * devuelve el **`id`**, que es lo que no cambia cuando cambia el rótulo.
 */
export function FilaBotonesDeTarjeta({ botones, onBoton, tono, contorno }: {
  botones: BotonTarjeta[];
  onBoton?: (id: string) => void;
  tono?: Tono;
  /** Botones de contorno (variante destacada), como en `TarjetaTextoAcciones`. */
  contorno?: boolean;
}) {
  if (!botones.length) return null;
  return (
    <FilaBotones>
      {botones.map((b) => {
        const apagado = b.estado === 'inactivo' || !onBoton;
        return (
          <BotonPildora
            key={b.id}
            texto={b.etiqueta}
            tono={tono}
            contorno={contorno}
            inactivo={apagado}
            onPress={apagado ? undefined : () => onBoton?.(b.id)}
          />
        );
      })}
    </FilaBotones>
  );
}

/** Pie débil de dos líneas (código y fecha), el cierre del patrón. */
export function PieDebil({ lineas }: { lineas: Array<string | null | undefined> }) {
  const { colors } = useTheme();
  const visibles = lineas.filter(Boolean) as string[];
  if (!visibles.length) return null;
  return (
    <View style={estilos.pie}>
      {visibles.map((t, i) => (
        <Text key={i} style={[estilos.pieLinea, { color: colors.textSecondary }]} numberOfLines={1}>{t}</Text>
      ))}
    </View>
  );
}

/** Línea de cronología: punto, raíl y texto. La usa el envío y el seguimiento. */
export function LineaCronologia({ icono, titulo, detalle, ultimo }: {
  icono?: string | null;
  titulo: string;
  detalle?: string | null;
  ultimo?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={estilos.crono}>
      <View style={estilos.cronoRaiz}>
        {icono ? (
          <Image source={icono} style={estilos.cronoIcono} contentFit="cover" transition={0} />
        ) : (
          <View style={[estilos.cronoPunto, { backgroundColor: colors.textSecondary }]} />
        )}
        {!ultimo ? <View style={[estilos.cronoRail, { backgroundColor: alpha(colors.textSecondary, 0.35) }]} /> : null}
      </View>
      <View style={estilos.cronoTexto}>
        <Text style={[estilos.cronoTitulo, { color: colors.textPrimary }]} numberOfLines={1}>{titulo}</Text>
        {detalle ? (
          <Text style={[estilos.cronoDetalle, { color: colors.textSecondary }]} numberOfLines={2}>{detalle}</Text>
        ) : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    width: 282,
    maxWidth: '100%',
    borderRadius: radios.md,
    padding: espaciado.e12,
    flexShrink: 1,
  },

  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  titulo: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.fuerte },
  pill: { borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, maxWidth: 128 },
  pillTexto: { fontSize: tipografia.detalle, lineHeight: interlineado.caption, fontWeight: peso.titulo },

  bloque: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    marginTop: espaciado.e8, borderRadius: radios.punta, padding: espaciado.e8,
  },
  foto: { width: 56, height: 56, borderRadius: radios.punta },
  fotoVacia: { alignItems: 'center', justifyContent: 'center' },
  datos: { flex: 1, minWidth: 0 },
  /** El nombre y las unidades en la misma línea: «×3» no merece una línea propia. */
  bloqueTituloFila: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.e4 },
  bloqueTitulo: { flex: 1, fontSize: tipografia.body, lineHeight: interlineado.amplio },
  bloqueCantidad: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  bloqueSub: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e2 },

  filaDato: { marginTop: espaciado.e4 },
  datoEtiqueta: { fontSize: tipografia.caption, lineHeight: interlineado.caption },
  datoLinea: { flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e2 },
  datoValor: { fontSize: tipografia.body, lineHeight: interlineado.amplio, borderBottomWidth: StyleSheet.hairlineWidth },
  datoExtra: { fontSize: tipografia.body, lineHeight: interlineado.amplio },
  copiar: { marginLeft: espaciado.e4, padding: espaciado.e2 },

  filaBotones: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e12 },
  boton: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e5 },
  botonTexto: { fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },

  pie: { marginTop: espaciado.e6 },
  pieLinea: { fontSize: tipografia.nota, lineHeight: interlineado.caption },

  crono: { flexDirection: 'row', marginTop: espaciado.e6 },
  cronoRaiz: { width: 14, alignItems: 'center' },
  /** Punto y raíl de la cronología. El punto va con `radios.full`: a 6pt, el radio mitad es 3 y
   *  sale un círculo — que es lo que la referencia dibuja con `7pt` sobre un icono de 14. */
  cronoPunto: { width: 6, height: 6, borderRadius: radios.full, marginTop: espaciado.e4 },
  cronoIcono: { width: 14, height: 14, borderRadius: radios.full },
  cronoRail: { width: 2, flex: 1, marginTop: espaciado.e2 },
  cronoTexto: { flex: 1, marginLeft: espaciado.e8 },
  cronoTitulo: { fontSize: tipografia.caption, lineHeight: interlineado.caption, fontWeight: peso.medio },
  cronoDetalle: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e2 },
});
