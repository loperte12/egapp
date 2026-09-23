/**
 * ScreenHeader — la cabecera de pantalla: volver, título y una acción a la derecha.
 *
 * ── POR QUÉ EXISTE (Fase 2, 24/09/2026) ───────────────────────────────────────────────────────
 * El censo de formas repetidas (`_a5-censo-formas-repetidas.py`) encontró **110 formas escritas
 * en tres o más ficheros**, y la segunda mayor era esta: **21 ficheros** —todos en `app/`— con la
 * fila de cabecera declarada idéntica, byte a byte, bajo el mismo nombre (`header`). Cambiar el
 * aire de una cabecera exigía 21 ediciones y ninguna sabía de las otras.
 *
 * Pero **no eran 21 copias iguales**: medido fichero a fichero, el título se escribía de **cuatro
 * maneras distintas** y los valores no coincidían entre sí.
 *
 *   · Origen del estilo del título: **13** por clave local `headerTitle`, **8** en línea.
 *   · Tamaño: **17 en 15 ficheros · 16 en 6** (dos peldaños distintos de la escala).
 *   · Peso: **800 en 14 · 700 en 7** (dos pesos distintos para el mismo papel).
 *   · Icono de volver: **24 en 14 · 22 en 7**.
 *   · `numberOfLines`: **8 lo ponen · 13 no**. Los 13 dejan que un título largo parta en dos
 *     líneas y **la cabecera crece sola**, aunque debajo tenga un borde que la delimita.
 *
 * Es decir: lo que se repetía no era un diseño, era **la misma fila con cinco decisiones tomadas
 * por separado en cada sitio**. Este componente toma las cinco una vez.
 *
 * ── LAS DECISIONES, Y CON QUÉ SE JUSTIFICAN ───────────────────────────────────────────────────
 *  · **Título a 17 (`tipografia.subCabecera`)** — es el valor de 15 de los 21. Los 6 que escribían
 *    16 suben 1 px. Se eligió el valor mayoritario, no el que a mí me gustara.
 *  · **Peso `maximo` (800)** — el de 14 de los 21. Los 7 que escribían 700 suben un escalón:
 *    **cambia el aspecto en esos 7**, y se dice aquí en vez de dejarlo para que lo descubra quien
 *    mire la pantalla. Los siete son `alquiler-planes`, `alquiler-publicar`, `intercity-planes`,
 *    `landlord-profile`, `work-detail`, `work-planes`, `work-publish`.
 *  · **Icono a `icono.lg` (24)** — el de 14 de los 21.
 *  · **Una sola línea por defecto** (`lineasTitulo`), porque una cabecera de altura fija con un
 *    borde debajo no admite crecer. Y hay una excepción MEDIDA, no supuesta: el ancho disponible
 *    para el título es 360 dp de pantalla menos 16 de relleno a cada lado, menos los dos huecos de
 *    24 → **280 dp**. Con la calibración de ancho de letra del proyecto (**7,9 dp por carácter a
 *    tamaño 11**, medida contra el teléfono en `_c9-medir-letra-rejilla.cjs`), escalando al tamaño
 *    17 salen **12,21 dp/carácter → caben 22,9 caracteres**. OJO AL CITAR ESTO: los 7,9 están
 *    medidos en el móvil; las 22,9 son esa constante **escalada**, no una medición a tamaño 17.
 *    Los títulos reales, contados uno a uno:
 *      · `alquiler.tsx` «Alquileres en Guinea Ecuatorial» — **31 caracteres, 378 dp** → **no cabe**.
 *        Este pasa `lineasTitulo={2}`.
 *      · `food-menu.tsx` pone el **nombre del comercio** (`detail?.businessName ?? 'Menú'`), que no
 *        tiene tope conocido → pasa `lineasTitulo={2}`.
 *      · `billing-status` «Mis compras y derechos» e `intercity-planes` «Planes Ciudad a Ciudad» —
 *        **22 caracteres exactos**, en el borde del modelo (22,9). Cabe, pero sin margen.
 *      · `alquiler-planes` «Planes de suscripción» y `landlord-profile` «Perfil del anunciante» —
 *        **21**, a un carácter del borde.
 *    Es decir: los **dos** de dos líneas son seguros, y los **cuatro** de 21–22 caben por poco. Si
 *    en el móvil alguno parte, el arreglo es `lineasTitulo={2}`, no reabrir el ancho. **Esa
 *    comprobación la hace Bernardo**: aquí queda dicho dónde mirar.
 *  · **`hitSlop` por lado, no caja de 44** — el alto de la cabecera lo marca el icono (24 + 12 de
 *    relleno arriba y abajo = 48 dp). Subir la caja del botón a `altura.punto` la llevaría a 68 y
 *    **cambiaría el alto de las 21 pantallas**: eso es un rediseño, no una unificación. Con 12 por
 *    lado el dedo tiene 48 dp y no se mueve un píxel. Es exactamente la regla de §7.3 del
 *    documento de tokens, aplicada al caso que sí la admite: un control suelto, no una fila con
 *    `gap`.
 *
 * ── LO QUE MEJORA SIN QUE NADIE LO PIDIERA ───────────────────────────────────────────────────
 *  · **20 botones de volver que ahora responden al ojo.** Medido fichero a fichero: los 20 SÍ
 *    navegaban (`onPress` a `router.back()`, a `ir.atras()` o —en `food-owner`— a
 *    `dirty ? confirmLeave() : router.back()`), pero **ninguno daba señal visual**: eran
 *    `Pressable` desnudos, sin opacidad al pulsar y sin `pressed`. En una app con dinero, tocar
 *    y no ver nada durante 200 ms se lee como «no ha cogido el toque». `Tactil` baja la opacidad
 *    a 0,6 mientras el dedo está puesto. Mejora medible, no supuesta.
 *    (Corrección de una versión anterior de este comentario, que decía que «no hacían nada al
 *    pulsarse»: era falso. Navegaban todos. Lo que faltaba era la respuesta visual.)
 *  · **`landlord-profile.tsx` gana `accessibilityRole` y etiqueta**: medido, era el **único de
 *    los 20** sin ninguno de los dos (19 con · 1 sin).
 *  · **`subCabecera` (17) entra en el sistema**: 14 de los 20 lo escribían a mano, y otros 6
 *    escribían `tipografia.subtitle`. Lo mismo con `icono.lg` para el icono de volver.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────────────────────
 *   <ScreenHeader titulo="Mis pedidos" alVolver={() => router.back()} />
 *   <ScreenHeader titulo="Mi restaurante" alVolver={…} accion={<GhostButton …>} />
 *   <ScreenHeader titulo="Alquileres en Guinea Ecuatorial" subtitulo="12 anuncios"
 *                 alVolver={…} accion={<Icono…/>} lineasTitulo={2} />
 *   <ScreenHeader titulo="Producto" />
 *
 * OJO AL DOCUMENTAR ESTE FICHERO: un comentario JSX escrito dentro de este bloque —con su barra y
 * su asterisco— **cierra el bloque antes de tiempo** y el texto que sigue se lee como código. Pasó
 * al escribirlo, y lo cazó `tsc` y no la guardia: la guardia cuenta valores, no sintaxis. Es la
 * misma familia de trampa que el literal dentro del comentario de `verifica-diseno.cjs`.
 *
 * Sin `alVolver` deja un hueco del ancho del icono, que es lo que hacían los esqueletos: así el
 * título sigue centrado. **El kit no navega**: quien llama pasa la función, y el componente no
 * sabe si por debajo hay un router. `food-owner` lo necesita porque su volver pregunta antes de
 * salir si hay cambios sin guardar.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { espaciado, icono, peso, tipografia, trazo } from '../theme/escalas';
import { Tactil } from './Tactil';

/** Ancho del hueco de los extremos: es el tamaño del icono, para que el título quede centrado. */
const ANCHO_EXTREMO = icono.lg;

/**
 * Radio de toque alrededor del botón de volver. 12 por lado lleva el área táctil de 24 a 48 dp
 * (el mínimo de Android) sin tocar la caja y, por tanto, sin mover la fila. Por lado y no escalar:
 * un `hitSlop` escalar no se puede razonar por eje, y el eje vertical aquí sí importa.
 */
const TOPE_VOLVER = { top: 12, bottom: 12, left: 12, right: 12 } as const;

export interface ScreenHeaderProps {
  /** Texto de la cabecera. */
  titulo: string;
  /** Segunda línea, para un contador o un estado. Baja a `textSecondary`. */
  subtitulo?: string;
  /**
   * Qué hacer al volver. **Si falta, no hay botón** y queda un hueco del ancho del icono: es lo
   * que necesita una pantalla en estado de carga, que enseña su cabecera sin acción posible.
   */
  alVolver?: () => void;
  /** Etiqueta del botón para el lector de pantalla. «Volver» por defecto. */
  etiquetaVolver?: string;
  /** Pista del botón. Existe porque una pantalla ya la tenía; quitar un aviso de accesibilidad es perder algo. */
  pistaVolver?: string;
  /** Acción de la derecha: un icono, un botón, un texto. Se alinea al extremo. */
  accion?: ReactNode;
  /**
   * Líneas del título. **1 por defecto** — ver la cabecera de este fichero para el caso medido que
   * necesita 2.
   */
  lineasTitulo?: number;
  /** Estilo del contenedor. Se usa para el `paddingTop` de la zona segura, que no es igual en todas. */
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  titulo,
  subtitulo,
  alVolver,
  etiquetaVolver = 'Volver',
  pistaVolver,
  accion,
  lineasTitulo = 1,
  style,
}: ScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.cabecera, { borderBottomColor: colors.border }, style]}>
      {alVolver ? (
        <Tactil
          onPress={alVolver}
          hitSlop={TOPE_VOLVER}
          accessibilityRole="button"
          accessibilityLabel={etiquetaVolver}
          accessibilityHint={pistaVolver}
          style={styles.volver}
        >
          <ArrowLeft size={icono.lg} color={colors.textPrimary} />
        </Tactil>
      ) : (
        /* Sin botón: el hueco mantiene el título centrado, que es lo que hacían los esqueletos. */
        <View style={styles.extremo} />
      )}

      <View style={styles.centro}>
        <Text
          style={[styles.titulo, { color: colors.textPrimary }]}
          numberOfLines={lineasTitulo}
        >
          {titulo}
        </Text>
        {subtitulo ? (
          <Text style={[styles.subtitulo, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitulo}
          </Text>
        ) : null}
      </View>

      {/* El hueco de la derecha nunca desaparece: sin él, el título se descentra solo. */}
      <View style={styles.accion}>{accion}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: trazo.fino,
  },
  volver: { alignItems: 'center', justifyContent: 'center' },
  extremo: { width: ANCHO_EXTREMO },
  centro: { flex: 1, alignItems: 'center' },
  titulo: { fontSize: tipografia.subCabecera, fontWeight: peso.maximo, textAlign: 'center' },
  subtitulo: { fontSize: tipografia.micro, textAlign: 'center' },
  accion: {
    minWidth: ANCHO_EXTREMO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: espaciado.e12,
  },
});
