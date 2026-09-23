/**
 * components/ecomerse/EditorDeCombinaciones.tsx — LOS EJES DEL ANUNCIO Y SUS COMBINACIONES (Fase 4).
 *
 * EL PROBLEMA QUE CIERRA. Hasta la fase 4 el formulario del comerciante pedía «talla» y «color» como
 * TEXTO LIBRE. Eso servía para la ficha técnica —la tabla que el comprador lee— pero **no para
 * comprar**: el anuncio se vendía entero, con un solo precio y un solo stock, y el comprador no
 * elegía nada. Esta pantalla es donde el comerciante declara QUÉ SE PUEDE ELEGIR: los ejes, sus
 * valores, y una fila por combinación con su precio y sus unidades.
 *
 * DÓNDE VIVE, Y POR QUÉ AHÍ. Guarda por `PUT /ecomerse/seller/products/:id/options`, que es el
 * **carril rápido**: reponer una talla es una operación del día a día y no puede costar 24–48 h de
 * revisión. El contenido del anuncio (título, fotos, precio, categoría) sigue por el carril moderado,
 * y el servidor **rechaza** `options` en el alta a propósito para que nadie crea que las publicó.
 * Consecuencia que el comerciante nota: las combinaciones son un paso **después** de publicar.
 *
 * ES UN PORTE DEL EDITOR DE LIFE BOOK (`components/lifebook/publish/OptionGroupsEditor.tsx`), porque
 * los dos mercados comparten las REGLAS del SKU (módulo `opciones-producto.ts` del servidor) y la
 * forma de los ejes es la misma. Lo que NO se porta, y por qué:
 *
 *   · **Nada de ejes sugeridos por la categoría.** Life Book los tiene porque su categoría los trae.
 *     En el Mercado `GET /ecomerse/categories` devuelve `{id, code, label, icon, subs}`: no hay
 *     catálogo de ejes. En vez de inventar uno por categoría, hay una lista corta y visible —Color,
 *     Talla, Capacidad, Modelo, Medida— y un campo para el eje que no esté. Inventar la lista sería
 *     peor que no tenerla: el comerciante no sabría por qué su categoría no ofrece lo que espera.
 *   · **Nada de tabla de medidas.** Eso son las tallas de Life Book (`SizeChartEditor`); el Mercado no
 *     tiene tablas y no se le añaden.
 *   · **Nada de «avisar cuando llegue».** Ese endpoint es de Life Book. Sin él, quitamos la fila y ya
 *     está: el comprador no ve la combinación, que es más honesto que un botón que no hace nada.
 *   · **Nada de peso por combinación** (`weightG`, que el servidor admite): el Mercado no cobra por
 *     peso —el envío va por zonas y tarifa de agente— así que un campo así sería un dato muerto más.
 *
 * Y CINCO DECISIONES PROPIAS, tres de ellas CORRIGIENDO defectos que se vieron al portar:
 *
 *  1. **Quitar un valor SÍ limpia sus combinaciones.** En Life Book, `removeOptionValue` quita el
 *     valor del eje **sin tocar las filas**: quedan combinaciones que ya no existen, con unidades
 *     dentro, y el servidor las rechaza al guardar. Aquí se van con el valor, y si se llevan
 *     unidades **se dice cuántas antes de hacerlo** (el «botón que borra existencias sin decirlo»).
 *  2. **Una matriz incompleta es legítima.** Life Book exige `variantes.length === combinaciones
 *     posibles`; el servidor NO: valida las combinaciones que van, una a una. Y está bien que sea así,
 *     porque **no ofrecer todas es una decisión real del comerciante** («no fabrico la XL en azul»).
 *     La forma de decirla aquí es **quitar esa fila**, y el comprador ve ese valor como «no
 *     disponible» en vez de «agotado» — que son dos cosas distintas. Life Book lo diría con un flag
 *     `deshabilitado`; el Mercado no tiene ese flag y no se le añade uno al esquema por esto.
 *  3. **El relleno por lotes, aplicando sólo lo que esté escrito.** El precio vacío **hereda** el del
 *     anuncio, así que un precio común parecía salir gratis —se deja vacío y ya—. Pero eso cubre UN
 *     solo valor común, el del anuncio, y el precio que de verdad se repite en las combinaciones casi
 *     nunca es ése: el del anuncio es el «desde», y el real hay que escribirlo. Con 30 filas, 30 veces
 *     el mismo número. De ahí el bloque «Relleno por lotes»: dos campos y un botón, donde **lo que
 *     esté vacío no se toca** (no hay manera de poner un 0 sin querer) y **se avisa antes** de
 *     escribir encima de un valor ya puesto, diciendo cuántas filas pisa. Las EXISTENCIAS entran por
 *     el mismo sitio y ahí el ahorro es mayor, porque no tienen herencia posible: el servidor guarda
 *     un número y vacío significa 0 (no «las del anuncio»). Como el precio sí hereda, el bloque trae
 *     la vuelta atrás —«que todas hereden»—, que sin él sería inalcanzable después de un lote.
 *
 *     Y todo lo que se teclea se encadena con **Intro** sin cerrar el teclado: los valores de un eje
 *     («M» + Intro + «L» + Intro), el lote (precio → unidades) y las filas (precio → unidades → la
 *     siguiente). Añadir doce tallas o rellenar treinta filas no puede costar doce o sesenta viajes
 *     al dedo —el «relleno por lotes» del pliego, aplicado también al teclado—. El último campo de
 *     cada serie sí cierra el teclado, para dejar ver lo que hay debajo.
 *  4. **El resumen en vivo** (precio mín–máx y existencias totales). En el Mercado el stock del
 *     anuncio **es la suma de las combinaciones**, así que repartir 20 unidades en dos filas de 20 se
 *     guarda como 40. Eso no se ve mirando filas de una en una: se ve en un total. Y el rango de
 *     precios se avisa si pasa de 3×, porque el comprador ve el precio barato en la lista y al entrar
 *     se encuentra el caro.
 *  5. **`Sheet` para elegir la foto del color**, no un `<Modal>` a mano: se hereda el fondo, el cierre
 *     al tocar fuera, el botón físico de atrás y el tope de altura. Ojo con ese tope: `Sheet` recorta
 *     al **80 %** de la pantalla y lo que sobra se pierde, así que la rejilla lleva su alto calculado.
 *
 * LO QUE EL SERVIDOR IMPONE Y NO SE PUEDE SALTAR (mejor saberlo aquí que al guardar):
 *   · un eje de **color** exige, por cada valor, **una foto real del anuncio** —no vale un cuadradito
 *     con el color, y no vale una foto de fuera—;
 *   · cada combinación necesita un valor de **cada** eje, y no puede haber dos iguales;
 *   · **3 ejes**, **30 valores** por eje y **60 combinaciones** como máximo.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, Plus, X } from 'lucide-react-native';
import {
  GhostButton, InlineError, PrimaryButton, Sheet, alpha, altura, espaciado, icono, peso, radios, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import {
  ecomerseApi,
  type EcomerseOptionGroup,
  type EcomerseOptionKind,
  type EcomerseProductVariant,
} from '../../api/ecomerse';
import { formatXAF } from '../../utils/formatHelpers';
import {
  COMBOS_MAX, FACTOR_RANGO_AMPLIO, GRUPOS_MAX, VALORES_MAX,
  aCodigo, combinacionesDe, firmaDe, numeroDe, resumenDe,
  type BorradorVariante,
} from '../../utils/combinaciones';

/* ── Piezas del borrador ─────────────────────────────────────────────────────────────────────── */

interface ValorBorrador { value: string; imageUrl: string }
interface GrupoBorrador {
  code: string;
  label: string;
  kind: EcomerseOptionKind;
  values: ValorBorrador[];
}

/**
 * Los ejes que se ofrecen a un toque. Es una lista CORTA a propósito: son los cinco que el Mercado
 * ve de verdad (ropa, calzado, teléfonos, muebles), y el sexto caso —un eje que no esté— se escribe
 * en el campo de abajo con su tipo. No es una lista por categoría porque el Mercado no tiene ese
 * catálogo; ver la cabecera.
 */
const EJES: { label: string; kind: EcomerseOptionKind }[] = [
  { label: 'Color', kind: 'color' },
  { label: 'Talla', kind: 'size' },
  { label: 'Capacidad', kind: 'text' },
  { label: 'Modelo', kind: 'text' },
  { label: 'Medida', kind: 'text' },
];

const TIPOS: { id: EcomerseOptionKind; label: string; ayuda: string }[] = [
  { id: 'color', label: 'Color', ayuda: 'cada uno con su foto real' },
  { id: 'size', label: 'Talla', ayuda: 'S · M · L · 42…' },
  { id: 'text', label: 'Otro', ayuda: 'capacidad, modelo, formato…' },
];

/** Sólo se comparan valores sin depender de mayúsculas ni de espacios de más. */
const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Lo que devuelve el servidor → el borrador del editor (precio y stock pasan a TEXTO). */
const aBorrador = (options: EcomerseOptionGroup[] | undefined): GrupoBorrador[] =>
  (options ?? []).map((g) => ({
    code: g.code,
    label: g.label || g.code,
    kind: (g.kind ?? 'text') as EcomerseOptionKind,
    values: (g.values ?? []).map((v) => ({ value: String(v.value), imageUrl: v.imageUrl ?? '' })),
  }));

const aBorradorVariantes = (variants: EcomerseProductVariant[] | undefined): BorradorVariante[] =>
  (variants ?? []).map((v) => ({
    name: v.name,
    priceXaf: v.priceXaf === null || v.priceXaf === undefined ? '' : String(v.priceXaf),
    stockQuantity: String(v.stockQuantity ?? 0),
    attributes: Object.fromEntries(Object.entries(v.attributes ?? {}).map(([k, x]) => [k, String(x)])),
  }));

export interface ResultadoCombinaciones {
  message: string;
  options: EcomerseOptionGroup[];
  variants: EcomerseProductVariant[];
  /** El `stock` del anuncio ya espejado por el servidor (la suma de las combinaciones). */
  stock: number;
}

export default function EditorDeCombinaciones({
  productoId, precioAnuncio, stockAnuncio, fotos, inicial, onGuardado,
}: {
  productoId: string;
  /** El precio del anuncio. Es el que hereda una combinación sin precio propio. */
  precioAnuncio: number;
  /** Las existencias del anuncio AHORA. Con combinaciones ya guardadas, es su suma. */
  stockAnuncio: number;
  /** Las fotos del anuncio: la única lista de la que puede salir la foto real de un color. */
  fotos: string[];
  inicial: { options?: EcomerseOptionGroup[]; variants?: EcomerseProductVariant[] };
  onGuardado: (r: ResultadoCombinaciones) => void;
}) {
  const { colors } = useTheme();
  const { height: altoPantalla } = useWindowDimensions();
  const est = estilos(colors);

  /* El borrador. La pantalla monta este componente con `key={productoId}`, así que al cambiar de
     anuncio se vuelve a leer: no hace falta sincronizar a mano. */
  const [grupos, setGrupos] = useState<GrupoBorrador[]>(() => aBorrador(inicial.options));
  const [variantes, setVariantes] = useState<BorradorVariante[]>(() => aBorradorVariantes(inicial.variants));
  const [nuevo, setNuevo] = useState<{ label: string; kind: EcomerseOptionKind }>({ label: '', kind: 'text' });
  const [valor, setValor] = useState<Record<string, string>>({});
  /** Qué valor de color está eligiendo foto. */
  const [eligiendo, setEligiendo] = useState<{ code: string; value: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El relleno por lotes: lo que se va a aplicar a TODAS las filas. Vacío = ese campo no se toca. */
  const [lote, setLote] = useState<{ precio: string; unidades: string }>({ precio: '', unidades: '' });
  /**
   * Los campos de cada fila, para encadenar con el Intro: precio → unidades → precio de la siguiente.
   * Con 30 combinaciones eso es teclear y dar al Intro, en vez de apuntar con el dedo 60 veces.
   *
   * OJO, límite conocido: con `keyboardType="number-pad"` la tecla de acción la pone el TECLADO, no la
   * app. Los teclados que no la ofrecen en el bloque numérico dejan el encadenado sin usar, pero sin
   * romper nada: se sigue tocando el campo a mano. El relleno por lotes es el camino que no depende
   * del teclado, y por eso existe.
   */
  const refsPrecio = useRef<Array<TextInput | null>>([]);
  const refsUnidad = useRef<Array<TextInput | null>>([]);
  /** El campo de unidades del lote: el Intro del precio salta aquí y no cierra el teclado. */
  const refUnidadesLote = useRef<TextInput | null>(null);

  /** El anuncio YA venía con combinaciones: cambia lo que se propone al generar y qué se puede deshacer. */
  const yaTenia = (inicial.options ?? []).length > 0;
  /** Los ejes que cuentan: un eje sin valores no genera combinaciones (y bloquea el guardado). */
  const utiles = useMemo(() => grupos.filter((g) => g.values.length > 0), [grupos]);
  const combos = useMemo(() => combinacionesDe(utiles), [utiles]);
  const resumen = useMemo(() => resumenDe(variantes, precioAnuncio), [variantes, precioAnuncio]);
  const colorSinFoto = useMemo(
    () => utiles.find((g) => g.kind === 'color' && g.values.some((v) => !v.imageUrl)) ?? null,
    [utiles],
  );
  /** Combinaciones posibles que no tienen fila: no se venden (el comprador las ve «no disponible»). */
  const sinFila = Math.max(0, combos.length - variantes.length);

  /**
   * El semáforo. Es lo que impide guardar algo que el servidor rechazaría, con el motivo escrito en
   * el mismo sitio donde se arregla. Los tres primeros son reglas del servidor; el cuarto es una
   * consecuencia de ellas (sin filas no hay nada que vender).
   */
  const problema = useMemo((): string | null => {
    if (!grupos.length) return null;
    if (grupos.some((g) => !g.values.length)) return 'Hay un eje sin ningún valor: ponle alguno o quítalo.';
    if (colorSinFoto) {
      const v = colorSinFoto.values.find((x) => !x.imageUrl);
      return `El color «${v?.value}» necesita su foto real del producto en ese color: no vale solo el nombre.`;
    }
    if (combos.length > COMBOS_MAX) {
      return `Con esos valores salen ${combos.length} combinaciones y el máximo es ${COMBOS_MAX}: quita algún valor.`;
    }
    if (!variantes.length) return 'Pulsa «Generar combinaciones» para poner el precio y las unidades de cada una.';
    return null;
  }, [grupos, colorSinFoto, combos.length, variantes.length]);

  /* ── Los ejes ──────────────────────────────────────────────────────────────────────────────── */

  const anadirEje = (label: string, kind: EcomerseOptionKind) => {
    const code = aCodigo(label);
    if (code.length < 2) { setError('Ponle un nombre al eje (por ejemplo «Color» o «Talla»).'); return; }
    if (grupos.some((g) => g.code === code)) { setError(`Ya tienes el eje «${label.trim()}».`); return; }
    if (grupos.length >= GRUPOS_MAX) { setError(`Como máximo ${GRUPOS_MAX} ejes (por ejemplo Color y Talla).`); return; }
    setError(null);
    /* Se crea VACÍO y se dice que le faltan valores. La alternativa —inventarle un valor— es lo que
       hacía el editor de Life Book con un «—» que acababa publicado como si fuera una talla. */
    setGrupos((prev) => [...prev, { code, label: label.trim(), kind, values: [] }]);
  };

  /**
   * Quita un eje ENTERO. Se lleva sus combinaciones y, si alguna tenía unidades apuntadas, se avisa
   * ANTES con el número exacto: quitar «Color» de un anuncio con 14 unidades repartidas no puede ser
   * un toque silencioso.
   */
  const quitarEje = (code: string) => {
    const g = grupos.find((x) => x.code === code);
    const afectadas = variantes.filter((v) => v.attributes[code] !== undefined);
    const unidades = afectadas.reduce((suma, v) => suma + (numeroDe(v.stockQuantity) ?? 0), 0);
    const hacerlo = () => {
      setGrupos((prev) => prev.filter((x) => x.code !== code));
      setVariantes((prev) => prev.filter((v) => v.attributes[code] === undefined));
    };
    if (unidades > 0) {
      Alert.alert(
        `Quitar «${g?.label ?? code}»`,
        `Se van ${afectadas.length === 1 ? '1 combinación' : `${afectadas.length} combinaciones`} y con ellas ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'} apuntadas. ¿Seguir?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: hacerlo }],
      );
      return;
    }
    hacerlo();
  };

  const anadirValor = (code: string, texto: string) => {
    const v = texto.trim().slice(0, 40);
    const g = grupos.find((x) => x.code === code);
    if (!g) return;
    if (!v) { setError('El valor necesita un nombre.'); return; }
    if (g.values.some((x) => norm(x.value) === norm(v))) { setError(`«${v}» ya está en ${g.label}.`); return; }
    if (g.values.length >= VALORES_MAX) { setError(`Como máximo ${VALORES_MAX} valores por eje.`); return; }
    setError(null);
    setGrupos((prev) => prev.map((x) => (x.code === code ? { ...x, values: [...x.values, { value: v, imageUrl: '' }] } : x)));
    setValor((prev) => ({ ...prev, [code]: '' }));
  };

  /**
   * Quita un valor de un eje **y sus combinaciones**. Esto es lo que el editor de Life Book NO hace
   * (`removeOptionValue` deja las filas): quedan combinaciones de un valor que ya no existe, con sus
   * unidades dentro, y el guardado falla con un ««Rojo» no es un valor de «Color»» que no se puede
   * arreglar desde la pantalla. Aquí se van con el valor, y se dice cuántas unidades se llevan.
   */
  const quitarValor = (code: string, value: string) => {
    const afectadas = variantes.filter((v) => norm(v.attributes[code]) === norm(value));
    const unidades = afectadas.reduce((suma, v) => suma + (numeroDe(v.stockQuantity) ?? 0), 0);
    const hacerlo = () => {
      setGrupos((prev) => prev.map((x) => (x.code === code ? { ...x, values: x.values.filter((y) => y.value !== value) } : x)));
      setVariantes((prev) => prev.filter((v) => norm(v.attributes[code]) !== norm(value)));
    };
    if (unidades > 0) {
      Alert.alert(
        `Quitar «${value}»`,
        `Se van ${afectadas.length === 1 ? '1 combinación' : `${afectadas.length} combinaciones`} y ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'} apuntadas. ¿Seguir?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: hacerlo }],
      );
      return;
    }
    hacerlo();
  };

  const ponerFoto = (code: string, value: string, imageUrl: string) => {
    setGrupos((prev) => prev.map((g) => (g.code === code
      ? { ...g, values: g.values.map((v) => (v.value === value ? { ...v, imageUrl } : v)) }
      : g)));
    setEligiendo(null);
  };

  /* ── Las combinaciones ─────────────────────────────────────────────────────────────────────── */

  /**
   * Genera la matriz del producto cartesiano **conservando** lo ya escrito: una fila que ya existía
   * (misma firma) mantiene su precio y sus unidades, así que añadir un color al final no borra el
   * trabajo de media hora.
   *
   * Las filas NUEVAS no heredan el stock del anuncio a ciegas: sólo se propone cuando el anuncio no
   * tenía combinaciones. Si ya las tenía, su `stock` es la SUMA, y repartir esa suma en cada fila
   * nueva multiplicaría el total sin que nada lo dijera.
   */
  const generar = () => {
    if (!utiles.length) { setError('Primero añade un eje con sus valores (por ejemplo Color o Talla).'); return; }
    if (combos.length > COMBOS_MAX) { setError(`Con esos valores salen ${combos.length} combinaciones y el máximo es ${COMBOS_MAX}.`); return; }
    setError(null);
    const porFirma = new Map(variantes.map((v) => [firmaDe(utiles, v.attributes), v]));
    setVariantes(combos.map((c) => {
      const previo = porFirma.get(firmaDe(utiles, c.attrs));
      return {
        name: c.nombre,
        priceXaf: previo?.priceXaf ?? '',
        stockQuantity: previo?.stockQuantity ?? (yaTenia ? '' : String(stockAnuncio || 0)),
        attributes: c.attrs,
      };
    }));
  };

  const quitarFila = (i: number) => setVariantes((prev) => prev.filter((_, j) => j !== i));

  /* ── El relleno por lotes ──────────────────────────────────────────────────────────────────── */

  /**
   * Lo que va a pasar, escrito antes de pulsar. El botón no lleva un «aplicar» a secas porque son tres
   * acciones distintas según lo que haya en los campos, y adivinar cuál de las tres va a correr es la
   * clase de sorpresa que este editor evita en todo lo demás.
   */
  const etiquetaLote = useMemo(() => {
    const p = numeroDe(lote.precio);
    const u = numeroDe(lote.unidades);
    if (p !== null && u !== null) return `Se pondrán ${formatXAF(p)} y ${u} ${u === 1 ? 'unidad' : 'unidades'} en cada una.`;
    if (p !== null) return `Se pondrá solo el precio: ${formatXAF(p)} en cada una.`;
    if (u !== null) return `Se pondrán solo las unidades: ${u} en cada una.`;
    return 'Escribe un precio, unas unidades, o las dos cosas.';
  }, [lote]);

  /**
   * Aplica a TODAS las filas únicamente lo que se haya escrito.
   *
   * El «vacío no se toca» es lo que hace que este bloque sea seguro: no hay forma de poner un precio
   * de cero ni de vaciar existencias por dejar un campo en blanco. Y como sí escribe encima de lo que
   * ya había —eso es justo lo que se le pide—, cuando pisa un valor distinto **lo dice antes**, con
   * cuántas filas afecta: es de las cosas que no se deshacen con un «atrás».
   */
  const aplicarLote = () => {
    const p = numeroDe(lote.precio);
    const u = numeroDe(lote.unidades);
    if (p === null && u === null) { setError('Escribe un precio o unas unidades para aplicarlos a todas.'); return; }
    const hacerlo = () => {
      setVariantes((prev) => prev.map((v) => ({
        ...v,
        /* Sólo se pisa el precio si se pidió un precio: `null` aquí significa «no lo toques», que es
           distinto del `''` de la fila, que significa «hereda el del anuncio». */
        priceXaf: p === null ? v.priceXaf : String(p),
        stockQuantity: u === null ? v.stockQuantity : String(u),
      })));
      setLote({ precio: '', unidades: '' });
      setError(null);
    };
    const pisadas = variantes.filter((v) => (
      (p !== null && numeroDe(v.priceXaf) !== null && numeroDe(v.priceXaf) !== p)
      || (u !== null && numeroDe(v.stockQuantity) !== null && numeroDe(v.stockQuantity) !== u)
    )).length;
    if (pisadas) {
      Alert.alert(
        'Se escribe encima',
        `${pisadas === 1 ? '1 combinación ya tiene' : `${pisadas} combinaciones ya tienen`} otro valor en eso que vas a aplicar, y se pierde. ¿Seguir?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Aplicar', style: 'destructive', onPress: hacerlo }],
      );
      return;
    }
    hacerlo();
  };

  /**
   * La vuelta atrás del precio en lote: dejarlo otra vez VACÍO en todas para que vuelvan a heredar el
   * del anuncio.
   *
   * Sin esto, la regla «vacío hereda» sería inalcanzable en la práctica: después de aplicar un precio
   * a 40 filas no habría manera de deshacerlo sin vaciarlas una a una. Sólo aparece si hay algo que
   * borrar, así que no es un botón más que recordar cuando no hace falta.
   */
  const heredarPrecios = () => {
    const conPrecio = variantes.filter((v) => numeroDe(v.priceXaf) !== null);
    if (!conPrecio.length) return;
    Alert.alert(
      'Que todas hereden el precio',
      `Se borran los precios escritos en ${conPrecio.length === 1 ? '1 combinación' : `${conPrecio.length} combinaciones`}: todas pasarán a costar lo que el anuncio (${formatXAF(precioAnuncio)}). ¿Seguir?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => setVariantes((prev) => prev.map((v) => ({ ...v, priceXaf: '' }))) },
      ],
    );
  };

  /* ── Guardar ───────────────────────────────────────────────────────────────────────────────── */

  const enviar = async (
    body: { options: EcomerseOptionGroup[]; variants?: EcomerseProductVariant[] },
    /**
     * Lo que hay que hacer DESPUÉS de que el servidor confirme. Se usa para vaciar el borrador cuando
     * la propia pantalla acaba de quitar todo. Va aquí y no en `quitarTodas` a propósito: si se
     * vaciara antes y el guardado fallara, el comerciante perdería lo que tenía delante sin haber
     * cambiado nada — y el servidor seguiría teniendo los ejes viejos.
     */
    tras?: () => void,
  ) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await ecomerseApi.updateProductOptions(productoId, body);
      onGuardado(r);
      tras?.();
    } catch (e) {
      /* El servidor explica qué pasa («El color «Rojo» necesita su foto real…», «La combinación
         «Rojo · M» está repetida»). Se enseña tal cual: es más útil que un «error» genérico. */
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las combinaciones.');
    } finally {
      setGuardando(false);
    }
  };

  const guardar = () => {
    if (problema) { setError(problema); return; }
    void enviar({
      options: utiles.map((g) => ({
        code: g.code,
        label: g.label,
        kind: g.kind,
        values: g.values.map((v) => ({ value: v.value, imageUrl: v.imageUrl || null })),
      })),
      variants: variantes.map((v) => ({
        name: v.name,
        /* Vacío = `null` = hereda el precio del anuncio. NO se manda 0, que sería un precio de cero. */
        priceXaf: numeroDe(v.priceXaf),
        /* El stock SÍ es un número: el servidor no admite «hereda» aquí. Vacío = 0 (agotada). */
        stockQuantity: numeroDe(v.stockQuantity) ?? 0,
        attributes: v.attributes,
      })),
    });
  };

  /**
   * Deshacer las combinaciones: el anuncio vuelve a venderse entero.
   *
   * Se avisa de algo que el servidor NO devuelve solo: al quedarse sin combinaciones, el `stock` del
   * anuncio **deja de espejarse** y se queda con el último valor que tuvo (la suma). O sea que el
   * anuncio hereda la suma de las combinaciones, y hay que revisarla a mano en «Anuncios». Callarlo
   * dejaría un anuncio con 12 unidades que nadie apuntó en ningún sitio.
   */
  const quitarTodas = () => {
    Alert.alert(
      'Quitar las combinaciones',
      `El anuncio volverá a venderse entero, con un solo precio (${formatXAF(precioAnuncio)}). Se pierden sus ${variantes.length === 1 ? '1 combinación' : `${variantes.length} combinaciones`} y sus precios.\n\nOjo: el anuncio se queda con las ${stockAnuncio} unidades que hoy suman las combinaciones. Revísalas después en «Anuncios» — eso ya se cambia desde la lista, sin volver aquí.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () => {
            void enviar({ options: [], variants: [] }, () => {
              /* El borrador se vacía SÓLO cuando el servidor confirma, y hace falta: la pantalla no
                 vuelve a montar este editor al guardar (es lo que evita cerrarle el borrador a quien
                 está a media faena), así que sin esto seguiría enseñando los ejes y las combinaciones
                 que se acaban de quitar — y el siguiente «Guardar combinaciones» las resucitaría,
                 deshaciendo en silencio lo que el aviso acababa de dar por hecho. */
              setGrupos([]);
              setVariantes([]);
              setValor({});
              setNuevo({ label: '', kind: 'text' });
            });
          },
        },
      ],
    );
  };

  /* La rejilla de fotos dentro del `Sheet`: el alto se CALCULA, porque el `Sheet` topa la hoja al
     80 % de la pantalla y lo que desborda se pierde —incluida la salida—. Se descuenta el cromo fijo
     (relleno de la hoja, título, nota, y el botón de cancelar) y se deja margen. */
  const altoRejilla = Math.max(120, Math.round(altoPantalla * 0.8) - 260);
  const entrada = [est.entrada, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  return (
    <View>
      {/* El carril, dicho una vez y arriba: es la primera duda de quien ya publicó. */}
      <Text style={est.intro}>
        Aquí se elige QUÉ PUEDE ELEGIR el comprador. Se guarda al momento: reponer una talla no pasa por revisión.
      </Text>

      {/* ── Estado sin combinaciones: cómo se vende el anuncio AHORA ── */}
      {!grupos.length && (
        <View style={[est.tarjeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={est.etiqueta}>CÓMO SE VENDE HOY</Text>
          <Text style={est.tituloBloque}>Entero, sin nada que elegir</Text>
          <Text style={est.nota}>
            El comprador compra el anuncio tal cual: {formatXAF(precioAnuncio)} y {stockAnuncio}{' '}
            {stockAnuncio === 1 ? 'unidad' : 'unidades'}. Eso ya está bien para un artículo único
            —un móvil, un mueble— y no hay que tocar nada.
          </Text>
          <Text style={[est.nota, { marginTop: espaciado.e8 }]}>
            Añade un eje solo si el comprador tiene que <Text style={{ fontWeight: peso.fuerte, color: colors.textPrimary }}>elegir</Text>:
            una talla, un color, una capacidad.
          </Text>
        </View>
      )}

      {/* ── 1 · Los ejes ── */}
      <Text style={est.seccion}>1 · Ejes</Text>
      <Text style={est.nota}>
        Un eje es lo que se elige («Color», «Talla»); sus valores son las opciones (Rojo, Azul / S, M, L).
      </Text>

      {/* Sin fotos no hay eje de color posible: el servidor exige una foto REAL del anuncio por color. */}
      {fotos.length === 0 && (
        <View style={[est.aviso, { borderColor: colors.warning, backgroundColor: alpha(colors.warning, 0.08) }]}>
          <Text style={[est.avisoTexto, { color: colors.warning }]}>
            Este anuncio no tiene fotos, así que no puede tener un eje de <Text style={{ fontWeight: peso.fuerte }}>Color</Text>:
            cada color necesita la foto real del producto en ese color. Las fotos se cambian en «Corregir anuncio»,
            que sí vuelve a revisión.
          </Text>
        </View>
      )}

      {grupos.map((g) => (
        <View key={g.code} style={[est.tarjeta, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={est.fila}>
            <View style={{ flex: 1 }}>
              <Text style={est.tituloBloque}>{g.label}</Text>
              <Text style={est.nota}>
                {g.kind === 'color' ? 'Color · cada uno con su foto' : g.kind === 'size' ? 'Talla' : 'Valores'}
                {' · '}{g.values.length} {g.values.length === 1 ? 'valor' : 'valores'}
              </Text>
            </View>
            <Pressable
              onPress={() => quitarEje(g.code)}
              accessibilityRole="button"
              accessibilityLabel={`Quitar el eje ${g.label}`}
              hitSlop={espaciado.e8}
              style={est.botonIcono}
            >
              <X size={icono.sm} color={colors.danger} />
            </Pressable>
          </View>

          {g.kind === 'color' ? (
            /* En un eje de color cada valor lleva su FOTO, y se elige entre las del anuncio: el
               servidor rechaza una foto que no sea suya. */
            <View style={est.rejillaColores}>
              {g.values.map((v) => (
                <View key={v.value} style={est.itemColor}>
                  <Pressable
                    onPress={() => setEligiendo({ code: g.code, value: v.value })}
                    accessibilityRole="button"
                    accessibilityLabel={v.imageUrl ? `Cambiar la foto del color ${v.value}` : `Poner la foto del color ${v.value}`}
                    style={[est.marcoFoto, { borderColor: v.imageUrl ? colors.success : colors.danger, backgroundColor: colors.background }]}
                  >
                    {v.imageUrl ? (
                      <Image source={{ uri: v.imageUrl }} style={est.fotoColor} contentFit="cover" transition={0} />
                    ) : (
                      <Text style={[est.faltaFoto, { color: colors.danger }]}>FALTA{'\n'}FOTO</Text>
                    )}
                  </Pressable>
                  <Text numberOfLines={1} style={[est.valorColor, { color: colors.textPrimary }]}>{v.value}</Text>
                  <Pressable onPress={() => quitarValor(g.code, v.value)} accessibilityRole="button" accessibilityLabel={`Quitar ${v.value}`} hitSlop={espaciado.e8}>
                    <Text style={[est.quitar, { color: colors.danger }]}>quitar</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={est.chips}>
              {g.values.map((v) => (
                <Pressable
                  key={v.value}
                  onPress={() => quitarValor(g.code, v.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar el valor ${v.value} de ${g.label}`}
                  style={[est.chip, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Text style={[est.chipTexto, { color: colors.textPrimary }]}>{v.value}</Text>
                  <X size={icono.micro} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          )}

          <View style={est.filaEntrada}>
            <TextInput
              value={valor[g.code] ?? ''}
              onChangeText={(t) => setValor((prev) => ({ ...prev, [g.code]: t }))}
              placeholder={g.kind === 'color' ? 'Ej.: Rojo' : g.kind === 'size' ? 'Ej.: M' : 'Ej.: 128 GB'}
              placeholderTextColor={colors.textSecondary}
              style={[...entrada, { flex: 1 }]}
              accessibilityLabel={`Nuevo valor para ${g.label}`}
              /* Intro AÑADE el valor y NO cierra el teclado (`submitBehavior="submit"`): se encadena
                 «M» + Intro + «L» + Intro sin volver a tocar el campo ni el botón de «+». Con `blur`
                 —el comportamiento por defecto— cada valor costaría reabrir el teclado. */
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={() => anadirValor(g.code, valor[g.code] ?? '')}
            />
            <Pressable
              onPress={() => anadirValor(g.code, valor[g.code] ?? '')}
              accessibilityRole="button"
              accessibilityLabel={`Añadir un valor a ${g.label}`}
              style={[est.botonMas, { borderColor: colors.primary }]}
            >
              <Plus size={icono.md} color={colors.primary} />
            </Pressable>
          </View>
          {!g.values.length && (
            <Text style={[est.nota, { color: colors.warning, marginTop: espaciado.e4 }]}>
              Añade al menos un valor: sin valores, este eje no vale para nada.
            </Text>
          )}
          {g.kind === 'color' && g.values.some((v) => !v.imageUrl) && (
            <Text style={[est.nota, { color: colors.danger, marginTop: espaciado.e4 }]}>
              Toca el cuadro para elegir la foto real de ese color.
            </Text>
          )}
        </View>
      ))}

      {/* Añadir un eje: los cinco de siempre a un toque, y el que no esté, escrito. */}
      {grupos.length < GRUPOS_MAX && (
        <View style={[est.tarjeta, { borderColor: colors.border }]}>
          <Text style={est.etiqueta}>AÑADIR UN EJE</Text>
          <View style={est.chips}>
            {EJES.filter((e) => !grupos.some((g) => g.code === aCodigo(e.label))).map((e) => (
              <Pressable
                key={e.label}
                onPress={() => anadirEje(e.label, e.kind)}
                accessibilityRole="button"
                accessibilityLabel={`Añadir el eje ${e.label}`}
                style={[est.chip, { borderColor: colors.primary, backgroundColor: colors.card }]}
              >
                <Plus size={icono.micro} color={colors.primary} />
                <Text style={[est.chipTexto, { color: colors.primary }]}>{e.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[est.filaEntrada, { marginTop: espaciado.e8 }]}>
            <TextInput
              value={nuevo.label}
              onChangeText={(t) => setNuevo((prev) => ({ ...prev, label: t }))}
              placeholder="Otro eje: «Almacenamiento», «Formato»…"
              placeholderTextColor={colors.textSecondary}
              style={[...entrada, { flex: 1 }]}
              accessibilityLabel="Nombre de otro eje"
              /* El Intro hace lo mismo que el «+» de al lado, para no tener que apuntar al botón: se
                 escribe el nombre, se elige el tipo abajo y se remata con el Intro. */
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={() => { anadirEje(nuevo.label, nuevo.kind); setNuevo((prev) => ({ ...prev, label: '' })); }}
            />
            <Pressable
              onPress={() => { anadirEje(nuevo.label, nuevo.kind); setNuevo((prev) => ({ ...prev, label: '' })); }}
              accessibilityRole="button"
              accessibilityLabel="Añadir el eje escrito"
              style={[est.botonMas, { borderColor: colors.primary }]}
            >
              <Plus size={icono.md} color={colors.primary} />
            </Pressable>
          </View>
          <View style={[est.chips, { marginTop: espaciado.e8 }]}>
            {TIPOS.map((t) => {
              const on = nuevo.kind === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setNuevo((prev) => ({ ...prev, kind: t.id }))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Tipo: ${t.label}. ${t.ayuda}`}
                  style={[est.chip, {
                    borderColor: on ? alpha(colors.primary, 0.5) : colors.border,
                    backgroundColor: on ? alpha(colors.primary, 0.12) : colors.card,
                  }]}
                >
                  {on ? <Check size={icono.micro} color={colors.primary} /> : null}
                  <Text style={[est.chipTexto, { color: on ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[est.nota, { marginTop: espaciado.e4 }]}>
            {TIPOS.find((t) => t.id === nuevo.kind)?.ayuda} · máximo {GRUPOS_MAX} ejes.
          </Text>
        </View>
      )}

      {/* ── 2 · Las combinaciones ── */}
      {grupos.length > 0 && (
        <>
          <Text style={est.seccion}>2 · Combinaciones</Text>
          <Text style={est.nota}>
            Salen solas del cruce de los ejes: no se escriben. Pones su precio y sus unidades, y el precio
            vacío hereda el del anuncio ({formatXAF(precioAnuncio)}).
          </Text>

          <View style={{ marginTop: espaciado.e8 }}>
            <GhostButton
              title={variantes.length ? 'Volver a generar (conserva lo escrito)' : 'Generar combinaciones'}
              onPress={generar}
            />
          </View>

          {combos.length > COMBOS_MAX && (
            <View style={[est.aviso, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.08), marginTop: espaciado.e8 }]}>
              <Text style={[est.avisoTexto, { color: colors.danger }]}>
                Con esos valores salen {combos.length} combinaciones y el máximo es {COMBOS_MAX}: quita algún valor.
              </Text>
            </View>
          )}

          {/* Filas que faltan: no se venden. Se dice, no se bloquea — no ofrecer todas es una decisión
              legítima («no fabrico la XL en azul»), y quitar la fila es como se dice. */}
          {sinFila > 0 && combos.length <= COMBOS_MAX && (
            <Text style={[est.nota, { marginTop: espaciado.e8, color: colors.warning }]}>
              {sinFila === 1 ? '1 combinación posible no tiene fila' : `${sinFila} combinaciones posibles no tienen fila`}:
              no se venden. Pulsa «Volver a generar» para añadirlas conservando lo escrito.
            </Text>
          )}

          {/* ── El relleno por lotes: lo que se repite en todas se escribe UNA vez ── */}
          {variantes.length > 1 && (
            <View style={[est.tarjeta, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={est.etiqueta}>RELLENO POR LOTES</Text>
              <Text style={est.nota}>
                Lo mismo en {variantes.length} filas se escribe una vez aquí. Rellena <Text style={{ fontWeight: peso.fuerte, color: colors.textPrimary }}>solo</Text> lo
                que quieras igualar: lo que dejes vacío no se toca.
              </Text>
              <View style={est.filaEntrada}>
                <TextInput
                  value={lote.precio}
                  onChangeText={(t) => setLote((prev) => ({ ...prev, precio: t.replace(/[^\d]/g, '') }))}
                  keyboardType="number-pad"
                  placeholder={`Precio · ${precioAnuncio}`}
                  placeholderTextColor={colors.textSecondary}
                  style={[...entrada, { flex: 1 }]}
                  accessibilityLabel="Precio para todas las combinaciones"
                  /* Precio → Intro → unidades, con el teclado abierto; y el Intro de unidades lo cierra
                     (su `blurAndSubmit` por defecto). Así el lote entero se rellena sin tocar la
                     pantalla: dos números, dos Intros y el botón. */
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => refUnidadesLote.current?.focus()}
                />
                <TextInput
                  ref={refUnidadesLote}
                  value={lote.unidades}
                  onChangeText={(t) => setLote((prev) => ({ ...prev, unidades: t.replace(/[^\d]/g, '') }))}
                  keyboardType="number-pad"
                  placeholder="Unidades"
                  placeholderTextColor={colors.textSecondary}
                  style={[...entrada, { flex: 1 }]}
                  accessibilityLabel="Unidades para todas las combinaciones"
                  returnKeyType="done"
                />
              </View>
              {/* Se dice lo que va a pasar ANTES de pulsar: son tres acciones distintas según lo que
                  haya escrito, y adivinar cuál corre es la sorpresa que este editor evita en todo. */}
              <Text style={[est.nota, { marginTop: espaciado.e4 }]}>{etiquetaLote}</Text>
              <View style={{ marginTop: espaciado.e8 }}>
                <GhostButton
                  title={`Aplicar a las ${variantes.length}`}
                  onPress={aplicarLote}
                  disabled={!lote.precio && !lote.unidades}
                />
              </View>
              {/* Sólo si hay algo que borrar: es la vuelta atrás del «vacío hereda», y sin precios
                  escritos no habría nada que deshacer. */}
              {variantes.some((v) => numeroDe(v.priceXaf) !== null) && (
                <Pressable
                  onPress={heredarPrecios}
                  accessibilityRole="button"
                  accessibilityLabel="Que todas hereden el precio del anuncio"
                  hitSlop={espaciado.e8}
                >
                  <Text style={[est.enlace, { color: colors.primary }]}>Que todas hereden el precio del anuncio</Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={{ marginTop: espaciado.e8 }}>
            {variantes.map((v, i) => (
              <View key={`${v.name}-${i}`} style={[est.filaCombo, { borderBottomColor: colors.border }]}>
                <Text numberOfLines={1} style={[est.nombreCombo, { color: colors.textPrimary }]}>{v.name}</Text>
                <TextInput
                  ref={(el) => { refsPrecio.current[i] = el; }}
                  value={v.priceXaf}
                  onChangeText={(t) => setVariantes((prev) => prev.map((x, j) => (j === i ? { ...x, priceXaf: t.replace(/[^\d]/g, '') } : x)))}
                  keyboardType="number-pad"
                  placeholder={String(precioAnuncio)}
                  placeholderTextColor={colors.textSecondary}
                  style={[...entrada, est.entradaCombo]}
                  accessibilityLabel={`Precio de ${v.name}`}
                  /* El Intro salta al campo de al lado en vez de cerrar el teclado: la fila se rellena
                     de un tirón. Con la última fila, Intro suelta el teclado y deja ver el resumen. */
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => refsUnidad.current[i]?.focus()}
                />
                <TextInput
                  ref={(el) => { refsUnidad.current[i] = el; }}
                  value={v.stockQuantity}
                  onChangeText={(t) => setVariantes((prev) => prev.map((x, j) => (j === i ? { ...x, stockQuantity: t.replace(/[^\d]/g, '') } : x)))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  style={[...entrada, est.entradaCombo]}
                  accessibilityLabel={`Unidades de ${v.name}`}
                  returnKeyType={i < variantes.length - 1 ? 'next' : 'done'}
                  submitBehavior={i < variantes.length - 1 ? 'submit' : 'blurAndSubmit'}
                  onSubmitEditing={() => { if (i < variantes.length - 1) refsPrecio.current[i + 1]?.focus(); }}
                />
                <Pressable
                  onPress={() => quitarFila(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar la combinación ${v.name}`}
                  hitSlop={espaciado.e8}
                  style={est.botonIcono}
                >
                  <X size={icono.sm} color={colors.danger} />
                </Pressable>
              </View>
            ))}
            {variantes.length > 0 && (
              <View style={est.cabeceraCombo}>
                <Text style={[est.nota, { flex: 1 }]}>combinación</Text>
                <Text style={[est.nota, est.entradaCombo, { textAlign: 'center' }]}>precio</Text>
                <Text style={[est.nota, est.entradaCombo, { textAlign: 'center' }]}>unidades</Text>
                <View style={est.botonIcono} />
              </View>
            )}
          </View>

          {/* ── 3 · El resumen: las dos cifras que no se ven mirando filas de una en una ── */}
          {variantes.length > 0 && (
            <>
              <Text style={est.seccion}>3 · Resumen</Text>
              <View style={[est.tarjeta, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[est.cifra, { color: colors.textPrimary }]}>
                  {resumen.precioMin === null
                    ? 'Sin precio'
                    : resumen.precioMin === resumen.precioMax
                      ? formatXAF(resumen.precioMin)
                      : `${formatXAF(resumen.precioMin)} – ${formatXAF(resumen.precioMax!)}`}
                  <Text style={est.cifraPie}>{'  '}lo que puede pagar el comprador</Text>
                </Text>
                <Text style={[est.cifra, { color: colors.textPrimary, marginTop: espaciado.e4 }]}>
                  {resumen.stockTotal} {resumen.stockTotal === 1 ? 'unidad' : 'unidades'}
                  <Text style={est.cifraPie}>{'  '}en total, sumando las combinaciones</Text>
                </Text>

                {/* El stock del anuncio ES esta suma: sin decirlo, repartir 20 en dos filas de 20
                    se guarda como 40 y nadie se entera. */}
                <Text style={[est.nota, { marginTop: espaciado.e8 }]}>
                  El anuncio pasará a mostrar estas {resumen.stockTotal} unidades: con combinaciones, su stock es la suma.
                </Text>

                {resumen.rangoAmplio && (
                  <View style={[est.aviso, { borderColor: colors.warning, backgroundColor: alpha(colors.warning, 0.08), marginTop: espaciado.e8 }]}>
                    <Text style={[est.avisoTexto, { color: colors.warning }]}>
                      El precio más alto es más de {FACTOR_RANGO_AMPLIO} veces el más bajo. El comprador ve el barato en la lista
                      y al entrar se encuentra el caro: si la diferencia es tan grande, suelen ser dos anuncios.
                    </Text>
                  </View>
                )}
                {resumen.agotadas > 0 && (
                  <Text style={[est.nota, { marginTop: espaciado.e8, color: colors.warning }]}>
                    {resumen.agotadas === 1 ? '1 combinación se queda sin unidades' : `${resumen.agotadas} combinaciones se quedan sin unidades`}:
                    el comprador las verá como «agotado». Si no vas a reponerlas, quítales la fila y no aparecerán.
                  </Text>
                )}
              </View>
            </>
          )}
        </>
      )}

      {error && <View style={{ marginTop: espaciado.e12 }}><InlineError mensaje={error} /></View>}

      {grupos.length > 0 && (
        <View style={{ marginTop: espaciado.e16 }}>
          <PrimaryButton
            title={guardando ? 'Guardando…' : 'Guardar combinaciones'}
            onPress={guardar}
            disabled={guardando || !!problema}
          />
          {problema && !error && (
            <Text style={[est.nota, { marginTop: espaciado.e8, textAlign: 'center' }]}>{problema}</Text>
          )}
        </View>
      )}

      {/* Deshacer: sólo si el anuncio YA tenía combinaciones. Sin esto, quitar los ejes no se podría
          guardar (la lista vacía de ejes no es un «guardar», es otra cosa). */}
      {yaTenia && (
        <View style={{ marginTop: espaciado.e12 }}>
          <GhostButton title="Quitar todas las combinaciones" onPress={quitarTodas} disabled={guardando} />
        </View>
      )}

      {/* ── Elegir la foto REAL de un color, entre las fotos del anuncio ── */}
      <Sheet
        visible={eligiendo !== null}
        position="bottom"
        title="Foto real del color"
        onClose={() => setEligiendo(null)}
      >
        <Text style={est.nota}>
          «{eligiendo?.value}»: elige, entre las fotos de este anuncio, la que enseña el producto en ese color.
          Es la que verá el comprador al elegirlo.
        </Text>
        {fotos.length ? (
          <ScrollView style={{ maxHeight: altoRejilla }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: espaciado.e12 }}>
            <View style={est.rejillaFotos}>
              {fotos.map((url) => (
                <Pressable
                  key={url}
                  onPress={() => eligiendo && ponerFoto(eligiendo.code, eligiendo.value, url)}
                  accessibilityRole="button"
                  accessibilityLabel="Usar esta foto"
                  style={[est.celdaFoto, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Image source={{ uri: url }} style={est.fotoCelda} contentFit="cover" transition={0} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text style={[est.nota, { marginTop: espaciado.e12, color: colors.danger }]}>
            Este anuncio todavía no tiene fotos. Añádelas en «Corregir anuncio» y vuelve aquí.
          </Text>
        )}
        <GhostButton title="Cancelar" onPress={() => setEligiendo(null)} />
      </Sheet>
    </View>
  );
}

const estilos = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  intro: { fontSize: tipografia.caption, color: c.textSecondary, lineHeight: 18, marginBottom: espaciado.e12 },
  seccion: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary, marginTop: espaciado.e24, marginBottom: espaciado.e4 },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.fuerte, color: c.textSecondary, letterSpacing: 0.4, marginBottom: espaciado.e4 },
  tituloBloque: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary },
  nota: { fontSize: tipografia.micro, color: c.textSecondary, lineHeight: 16, marginTop: 2 },
  tarjeta: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e12, marginTop: espaciado.e12 },
  aviso: { borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e8, marginTop: espaciado.e8 },
  avisoTexto: { fontSize: tipografia.micro, lineHeight: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  filaEntrada: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8 },
  entrada: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e8, fontSize: tipografia.caption },
  botonMas: { width: altura.control, height: altura.control, borderRadius: radios.md, borderWidth: trazo.base, alignItems: 'center', justifyContent: 'center' },
  /* El 44 del kit, no un cuadrado bonito: es un botón de sólo icono y por debajo de eso el dedo falla. */
  botonIcono: { width: altura.punto, height: altura.punto, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4 + 2, borderRadius: radios.full, borderWidth: trazo.fino },
  chipTexto: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  rejillaColores: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e12, marginTop: espaciado.e8 },
  itemColor: { alignItems: 'center', gap: espaciado.e4, width: 68 },
  marcoFoto: { width: 62, height: 62, borderRadius: radios.md, borderWidth: trazo.fuerte, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fotoColor: { width: '100%', height: '100%' },
  faltaFoto: { fontSize: tipografia.micro, fontWeight: peso.fuerte, textAlign: 'center' },
  valorColor: { fontSize: tipografia.micro, fontWeight: peso.fuerte, maxWidth: 64, textAlign: 'center' },
  quitar: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  cabeceraCombo: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingTop: espaciado.e4 },
  filaCombo: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderBottomWidth: trazo.fino, paddingVertical: espaciado.e8 },
  nombreCombo: { flex: 1, fontSize: tipografia.caption, fontWeight: peso.fuerte },
  /* 72 dp: cabe un importe de seis cifras a 12 px. Vivía en 78 cuando el botón de quitar medía 32;
     con el mínimo tocable de 44 hay que devolverle 6 dp al nombre, que es lo que se lee. */
  entradaCombo: { width: 72, textAlign: 'center' },
  cifra: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  cifraPie: { fontSize: tipografia.micro, fontWeight: peso.normal, color: c.textSecondary },
  /* Acción secundaria de texto, para lo que no merece un botón propio (la vuelta atrás del lote). */
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8 },
  rejillaFotos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  celdaFoto: { width: 96, height: 96, borderRadius: radios.md, borderWidth: trazo.fino, overflow: 'hidden' },
  fotoCelda: { width: '100%', height: '100%' },
});
