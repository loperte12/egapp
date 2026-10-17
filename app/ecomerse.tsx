/**
 * EcomerseScreen — Home del marketplace "Mercado" (estilo Xianyu adaptado GQ).
 * v5 (auditoría senior): error de red con Reintentar (nunca "no hay productos"),
 * sin datos stale al filtrar, subcategoría limpia al cambiar de categoría,
 * búsqueda server-side con debounce, favoritos con sesión, carrito siempre
 * navegable, sin teléfonos PII en el feed (WhatsApp solo en detalle), CTA
 * "Añadir" en tarjeta, grid par, a11y, pull-to-refresh, SafeArea y skeletons.
 * Ruta: /ecomerse
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Heart, Search, ShoppingCart, Store } from 'lucide-react-native';
import { useTheme, alpha, EmptyState, InlineError, tipografia, radios, trazo, peso, espaciado } from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseCategory, EcomerseFamily, EcomerseProduct } from '../api/ecomerse';
import { useEcomerseStore } from '../state/ecomerse';
import { brand } from '@egrouteplan/ui-kit';
import { TarjetaProducto, EsqueletoTarjeta } from '../components/ecomerse/TarjetaProducto';
import PieDelMercado, { PIE_MERCADO_H } from '../components/ecomerse/PieDelMercado';
import { useSinLeerMercado } from '../components/ecomerse/useSinLeer';
import { useAccionesProducto } from '../components/ecomerse/useAccionesProducto';
import { FranjaServidor } from '../components/ecomerse/FranjaServidor';
import { FilaServicios } from '../components/servicios/FilaServicios';
import EmergencyModal from '../components/EmergencyModal';
import { productoDeFicha } from '../components/ecomerse/fichaDeSeccion';
import { ACCIONES } from '../components/ecomerse/valorAtributos';

/**
 * LA ZONA DE CATEGORÍAS DE LA HOME — 23-sep-2026. Es la estructura de la referencia (Pinduoduo):
 * **pestañas de departamento pegadas a la barra de búsqueda y, debajo, la rejilla de familias de la
 * pestaña activa**. Sustituye a lo que había antes en este mismo sitio: un carril de ciudad, tres
 * chips de orden y una pila de avatares de categorías. Las tres cosas se retiraron a la vez y por el
 * mismo motivo: la cabecera gastaba cuatro filas en cromo y las categorías —que es a lo que se entra
 * al Mercado— empezaban demasiado abajo.
 *
 * LO QUE SE FUE, y qué se pierde con ello:
 *   · **Ciudad** (📍 + «Quitar filtro»). El filtro por ciudad **sigue existiendo en el servidor y en
 *     el `state`**, pero la home ya no lo ofrece: `catalog()` acepta `city` y el campo sigue en el
 *     store, así que devolverlo es volver a pintar la fila. Se retira de la vista, no del sistema.
 *   · **Chips de orden** (Recomendado · Mejor valorado · Novedades). El servidor **sigue ordenando**
 *     —se le manda `sort: 'recommended'`, que es su valor por defecto— y sigue aceptando los otros
 *     tres valores; lo que desaparece es el selector.
 *   · **Pila de avatares + «Ver todas (18)»**. Con las 18 pestañas a la vista, la hoja «Todas las
 *     categorías» era una segunda puerta al mismo sitio: se retiró con la pila, y con ella
 *     `CatCell`/`GRID_COLS` y su modal.
 *
 * Y EL TERCER ESCALÓN NO VIVE AQUÍ: **esta pantalla tiene los dos primeros** —departamento y familia—
 * y al tocar una familia **navega** a `/ecomerse-subcategoria`, que es donde están sus subclases con
 * los productos de cada una. Se probaron antes las dos formas de hacerlo sin cambiar de pantalla (una
 * fila de chips con un caret, y una hoja modal) y las dos se retiraron: la primera porque el caret no
 * cabía en la celda, la segunda porque una hoja sobre el catálogo no puede enseñar los productos.
 */
/**
 * COLUMNAS DE LA REJILLA, Y POR QUÉ SON 4. Lo pidió Bernardo mirando la captura del móvil: «puedes
 * volver a hacer las letras un poco más pequeñas para que puedan caber sin usar puntos suspensivos».
 * Aquello se midió en vez de estimarse, y la medición cambió las dos cosas —la letra y las columnas—
 * porque el problema no era solo el tamaño.
 *
 * EL RÓTULO ES LARGO Y ANCHO, Y LAS DOS COSAS NO CABEN A LA VEZ. La referencia (Pinduoduo) usa 5
 * columnas porque sus rótulos miden 2-5 caracteres; los de este árbol miden **14 de mediana y 30 el
 * más largo**, y muchos son de tres y cuatro palabras. En 360 dp, 5 columnas dejan **63,2 dp** de
 * texto por celda. Contado sobre el árbol real (18 departamentos / 110 familias):
 *
 * | Configuración | Texto por celda | Por línea | Rótulos que pierden texto | Alto de celda |
 * |---|---|---|---|---|
 * | 5 col · `micro` (11) · 2 líneas — lo que había | 63,2 dp | 8 car. | **45 de 110 — 41 %** | 88 dp |
 * | 5 col · `rotulo` (9) · 3 líneas | 63,2 dp | 9 car. | 5 de 110 — 5 % | 96 dp |
 * | 5 col · 8,5 · 3 líneas | 63,2 dp | 10 car. | 1 de 110 — 1 % | 93 dp |
 * | **4 col · `rotulo` (9) · 3 líneas — lo que hay** | **80,0 dp** | **12 car.** | **0 de 110** | **96 dp** |
 * | 4 col · `rotulo` (9) · 2 líneas | 80,0 dp | 12 car. | 5 de 110 — 5 % | 82 dp |
 * | 3 col · 8,5 · 2 líneas | 108,0 dp | 17 car. | 1 de 110 | 80 dp |
 *
 * NINGUNA COMBINACIÓN DE 5 COLUMNAS LLEGA A CERO, ni bajando la letra a 8 (8 dp reales, ilegible). El
 * último que se resiste es **«Fontanería y electricidad»**: 25 caracteres en dos palabras de 10 y 12,
 * que a 63,2 dp no caben en tres líneas ni con la letra más pequeña que se puede defender.
 * O dicho al revés: a 5 columnas se puede bajar la letra hasta que el 99 % quepa, pero no el 100 %.
 * La cuarta columna es lo que compra el «sin puntos suspensivos» que se pidió.
 *
 * LO QUE CUESTA LA CUARTA COLUMNA, MEDIDO Y NO SUPUESTO (`_c10-filas-por-departamento.cjs`): 6 de los
 * 18 departamentos ganan una fila, y la rejilla pasa de **142 dp de media a 187** —+45 dp antes del
 * primer producto, y +120 en el peor (Deporte y aire libre, 15 familias)—. Se paga a cambio de que
 * **ninguno de los 110 rótulos pierda una letra**. La letra baja de 11 a 9 (10,35 dp reales con la
 * escala del sistema al 1,15) y sigue leyéndose.
 *
 * POR QUÉ 3 LÍNEAS Y NO 2. Con 2 líneas y letra 9 quedan 5 fuera; la tercera cuesta 14 dp de celda y
 * los deja entrar todos. Una celda más alta es un defecto menor que una palabra cortada, que es el
 * mismo criterio con el que ya se eligió `minHeight` en vez de `height`.
 *
 * LA MEDICIÓN, Y DOS TRAMPAS QUE HAY QUE RECORDAR. La tabla que había aquí antes decía 28 % a 5
 * columnas y venía de `_c6-medir-rotulos.cjs`. El número era falso por dos motivos, y los dos se
 * descubrieron **mirando el móvil**, no razonando:
 *   · aquel medidor **no partía las palabras por la mitad** y Android sí (en la captura se leía
 *     «Chaqu etas y ab…»), así que contaba como si cupieran;
 *   · el ancho por carácter estaba en **7,2 dp a `micro`** y el del teléfono real es **≈7,9**.
 * El bueno es `_c9-medir-letra-rejilla.cjs`: reproduce el píxel en los cuatro rótulos que se usaron de
 * control —«Supermercados» → «Supermercado»+«s» en 2 líneas, «Servicios del hogar» en 2, «Farmacias» y
 * «Abacería» en 1— y da **0 cortes** para lo que hay. La tabla de arriba sale de ahí. Y de paso: el
 * medidor es **conservador**, no exacto — predice 3 líneas para «Calzado infantil y juvenil» y el móvil
 * lo pinta en 2—, que es la dirección en la que conviene equivocarse.
 *
 * **Cambiar de opinión es cambiar esta constante**: nada más del archivo depende de ella
 * (`celda.width` se calcula con `100 / COLUMNAS_REJILLA`).
 */
const COLUMNAS_REJILLA = 4;
/**
 * LÍNEAS DEL RÓTULO. Tres, y la tercera es la que hace falta para los rótulos de tres y cuatro
 * palabras —ver la tabla de `COLUMNAS_REJILLA`—. La celda reserva sitio para las tres aunque la
 * mayoría use dos: un rótulo que pide tres líneas dentro de una celda de dos no se lee, se adivina.
 */
const LINEAS_ROTULO = 3;
/**
 * Diámetro de la miniatura de una familia en la rejilla. 48 dp es el mínimo táctil que recomienda
 * Android y el mismo que usaba el avatar de categoría que esto sustituye.
 *
 * NO SUBE con la cuarta columna, aunque la celda pase de 72 a 90 dp: hoy **109 de las 110 familias no
 * tienen imagen** (la resuelve el servidor desde una tienda de esa familia), así que subirla sería
 * pagar alto en todas las celdas por un hueco que casi nunca se pinta.
 */
const DIAM_FOTO_FAMILIA = 48;
/**
 * ALTO DE LA CELDA, con la cuenta hecha y no estimada: **48 (foto) + 6 (respiro) + 3 líneas de
 * `rotulo` = 48 + 6 + 3 × 14 = 96 dp**. El alto de línea es el natural de Android (≈1,3 × 10,35 dp),
 * porque `celdaRotulo` no fija `lineHeight`.
 *
 * Existe por un caso que hay que resolver mirándolo: **hoy casi ninguna familia tiene imagen**. La
 * imagen la resuelve el servidor a partir de una tienda de esa familia, y con las tiendas que hay
 * eso da una celda con foto por cada 110. Si la celda midiera lo que mide su contenido, una fila con
 * una foto y tres sin ella quedaría a cuatro alturas distintas y el rótulo de las celdas sin foto
 * se pegaría al borde de arriba —se leería como un error de maquetación, no como «todavía no hay
 * logo»—. Con un mínimo común y el rótulo centrado verticalmente, **la celda sin imagen queda como
 * una celda con su nombre**, que es lo que es.
 *
 * ES `minHeight` Y NO `height`, a propósito. 96 dp cubre tres líneas **a la escala de referencia**;
 * con el `font_scale` del sistema al 1,3 esas tres líneas piden 102. Con `height` el rótulo se
 * cortaría; con `minHeight` la fila crece. Una fila más alta es un defecto menor que una palabra
 * cortada. Y como el mínimo es el peor caso real, en la práctica todas las filas miden 96.
 */
const ALTO_CELDA_FAMILIA = 96;
const MAX_PHOTO_MB = 8;
/**
 * LA TARJETA SE MUDÓ. El velo, la proporción, las etiquetas y los controles viven ahora en
 * `components/ecomerse/TarjetaProducto.tsx`, porque estaban duplicados en tres sitios (rejilla,
 * carrusel y Favoritos) con tres aspectros distintos.
 *
 * Lo que hay que saber desde aquí, que es la pantalla que la usa:
 *
 * **La proporción la decide la cámara, no el gusto.** El alta de vendedor sube la foto tal cual sale
 * del dispositivo (`launchCameraAsync` sin `allowsEditing` ni `aspect`) y las cámaras Android
 * arrancan en 4:3, así que el catálogo se llena de fotos 3:4. Con el marco 2:3 anterior —más alto
 * que ancho— la tarjeta venía recortando **el 11 % del ancho de todas las fotos** sin avisar a
 * nadie. Con 3:4 el recorte es **cero** y el vendedor ve en el visor exactamente lo que verá el
 * comprador. La decisión completa está en `DECISION-PROPORCION-TARJETAS.md`.
 *
 * Lo que se paga a cambio es altura: la tarjeta baja de 236 a 209 dp, y con ella la imagen limpia de
 * cada una. A cambio entra más catálogo por pantalla.
 */

/**
 * EL ORDEN DEL CATÁLOGO YA NO SE ELIGE DESDE LA HOME (23-sep-2026). Aquí vivía `SORTS` —los tres
 * chips «Recomendado · Mejor valorado · Novedades»—, construidos en la tanda A sobre el `sort` que
 * el servidor acepta desde siempre. Se retiraron con el resto del cromo de la cabecera.
 *
 * **Desde el 15/10/2026 la constante `SORT_CATALOGO` tampoco vive aquí**: el orden es un parámetro de
 * la SECCIÓN (`?orden=`), y su valor por defecto lo pone el servidor (`SORT_POR_DEFECTO`, el mismo
 * `'recommended'`). Dejarla en esta pantalla sería una segunda copia de una decisión que ya no se
 * toma aquí — y la primera que cambiara no llegaría a la otra.
 *
 * NO SE PERDIÓ CAPACIDAD: el servidor sigue aceptando `rating`, `newest`, `price_asc` y
 * `price_desc`, y los ids no cambiaron. Devolver el selector es volver a pintar los chips. Si algún
 * día se recupera, el sitio natural no es la cabecera —donde competía con las categorías— sino el
 * orden de la lista ya filtrada.
 */

export default function EcomerseScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** Los sin leer, para la insignia de «Mensajes» del pie. Ver `useSinLeer.ts`. */
  const sinLeer = useSinLeerMercado();
  const {
    query, setQuery, categoryFilter, setCategoryFilter, subcategoryFilter, setSubcategoryFilter,
    cart,
  } = useEcomerseStore();
  /**
   * El corazón, la ficha, el carrito y el filtro de sesión de los favoritos. Aquí vivían escritos a
   * mano; se mudaron a `components/ecomerse/useAccionesProducto.ts` cuando la pantalla de la
   * subcategoría empezó a pintar **las mismas tarjetas** (ver ese archivo: el corazón tiene puerta de
   * sesión, marca optimista y vuelta atrás, y eso no se copia).
   */
  const { favIds, abrirFicha, alternarFavorito, anadirAlCarrito } = useAccionesProducto();

  const [cats, setCats] = useState<EcomerseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * **EL ESTADO DE LA REJILLA SERVIDA.** Desde el 15/10/2026 los productos **no los pide esta
   * pantalla**: los manda el servidor en la sección `rejilla`. Pero la pantalla tiene que saber qué
   * enseñar mientras tanto, y por eso la sección avisa (`alEstado`):
   *
   *   · `cargando` → el esqueleto de tarjetas
   *   · `vacia`    → el vacío del kit, con su texto según los filtros
   *   · `error`    → el error con reintento. **Distinto de `vacia`**: decir «no hay productos» cuando
   *                  lo que falló es la red es una afirmación falsa sobre el catálogo.
   */
  const [estadoRejilla, setEstadoRejilla] = useState<'cargando' | 'lista' | 'vacia' | 'error'>('cargando');
  /** Cuántos productos trajo la sección: es el contador de resultados, y sale del servidor. */
  const [totalRejilla, setTotalRejilla] = useState(0);
  /** Cambia para **volver a pedir** la sección: la tirar-para-recargar y el botón de reintento. */
  const [recarga, setRecarga] = useState(0);
  /* AQUÍ VIVIÓ `clasesAbiertas`, el estado de la hoja de clases, unas horas del 23-sep-2026. Se
     retiró con la hoja entera al corregir Bernardo la forma: «me equivoqué en decir que el modal, si
     no que una pantalla completa». El tercer escalón del árbol ya no se elige en un modal sobre el
     catálogo, sino en su propia pantalla (`app/ecomerse-subcategoria.tsx`), y esta home solo tiene
     que **navegar** a ella. Por eso no queda aquí ni el booleano ni la familia: los dos los tiene la
     pantalla, que además los puede recibir por enlace directo. */
  const [imageResults, setImageResults] = useState<EcomerseProduct[]>([]);
  const [imageActive, setImageActive] = useState(false);
  /* El fallo de la búsqueda por foto se guarda para enseñarlo EN la pantalla: antes se
     convertía en una lista vacía + un Alert, o sea en un «no hay resultados» falso. */
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  /**
   * **La emergencia, con el MISMO modal que la Home.** Un servicio con `tone: 'emergency'` no navega:
   * avisa. Repetir aquí el modal sería tener dos emergencias distintas.
   */
  const [emergencia, setEmergencia] = useState(false);
  /**
   * **Qué feed se está viendo** (`Recomendado` · `Siguiendo`): el carril de arriba de Taobao. Antes de
   * esto no existía, y por eso «Siguiendo» no tenía dónde ponerse — no era un descuido de estilo.
   *
   * **Y se puede entrar directo a `Siguiendo`** con `?feed=siguiendo`: es lo que usa la fila «Tiendas
   * que sigo» del perfil desde que se retiró la pantalla vieja (`ecomerse-perfil-tiendas`). Mismo
   * patrón que `ecomerse-orders?filtro=` y `ecomerse-mensajes-avisos?canal=`.
   */
  const { feed: feedParam } = useLocalSearchParams<{ feed?: string }>();
  const [feedActivo, setFeedActivo] = useState<'recomendado' | 'siguiendo'>(
    feedParam === 'siguiendo' ? 'siguiendo' : 'recomendado',
  );
  /** El estado de la sección de seguidos, para su vacío y su error (mismo contrato que la rejilla). */
  const [estadoSiguiendo, setEstadoSiguiendo] = useState<'cargando' | 'lista' | 'vacia' | 'error'>('cargando');

  /**
   * **LAS ACCIONES DEL FEED DE SIGUIENDO**, tal como las pide Taobao en su tarjeta (`TBLFollow`, el
   * MTOP de suscripción, y 「刷新」 en la de vacío). Cada una dice lo que hace, y **ninguna finge**:
   *
   *   · `ext:seguir` / `ext:avisar` → la API real (`followStore`, `api/ecomerse.ts`). Hoy **falla**:
   *     el endpoint de seguidos no existe en el backend de ecomerse. La acción se ejecuta de verdad y
   *     el error se ve; lo que no se hace es fingir que se siguió.
   *   · `ext:refrescar` → volver a pedir la sección (lo único que hoy puede traer algo nuevo).
   *   · `ext:cargarmas` → **declarado y pendiente**: la lista no virtualizada no puede pedir la página
   *     siguiente (ver la nota de `Lista`), así que aquí no hay nada que hacer todavía.
   */
  const alAccionSiguiendo = (accion: string, id: string) => {
    // Las acciones se comparan con **las del vocabulario del cliente**, no con cadenas sueltas: el
    // árbol las manda por nombre y aquí no puede haber una segunda copia de ese nombre.
    if (accion === ACCIONES.SEGUIR || accion === ACCIONES.AVISAR) {
      const queja = accion === ACCIONES.SEGUIR ? 'No se pudo seguir la tienda.' : 'No se pudo guardar el aviso.';
      void ecomerseApi.followStore(id)
        .catch(() => Alert.alert('Seguir', queja))
        .finally(() => setRecarga((n) => n + 1));
      return;
    }
    if (accion === ACCIONES.REFRESCAR) { setRecarga((n) => n + 1); return; }
    // `ext:cargarmas`: declarado, sin hacer. Se dice en voz alta en vez de callar.
    Alert.alert('Siguiendo', 'Todavía no hay más páginas que cargar.');
  };

  /**
   * **La búsqueda con retardo.** La rejilla se pide por RUTA (`?buscar=…`), así que sin retardo habría
   * **una petición por tecla**. Es el mismo retardo de 300 ms que tenía la carga del catálogo, movido
   * del `fetch` a la ruta: el comportamiento que se ve es el de siempre.
   */
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  /**
   * Carga de las CATEGORÍAS, que es lo único del catálogo que sigue pidiendo esta pantalla.
   *
   * **Los productos ya no se piden aquí**: los manda el servidor en la sección `rejilla`, con los
   * mismos filtros (`departamento`, `familia`, `buscar`). Las categorías sí hacen falta en el cliente
   * porque la rejilla de FAMILIAS —el segundo escalón— sigue siendo suya: es taxonomía, y la pantalla
   * la usa para navegar al tercer escalón.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCats(await ecomerseApi.categories());
    } catch {
      setError('No pudimos cargar las categorías. Revisa tu conexión e inténtalo de nuevo.');
      setCats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Carga con debounce: búsqueda server-side + filtros. Nunca datos stale:
  // se vacían los productos al empezar; recomendados son globales (sin ciudad).
  /* AQUÍ VIVÍAN DOS COSAS QUE SE MUDARON A `useAccionesProducto`, y las dos por el mismo motivo —la
     pantalla de la subcategoría pinta las mismas tarjetas y las necesita iguales—:
       · la **sincronización de favoritos** al montar (`favoriteIds()`), que traía los corazones;
       · `alternarFavorito`, el corazón con puerta de sesión y vuelta atrás si la API falla.
     Se retiraron de este archivo el 23-sep-2026 junto con las importaciones que solo ellos usaban
     (`useSession` y el propio `setFavIds`/`toggleFavId` del store). */

  /** Búsqueda por foto: valida, avisa y sube; imageActive se activa al empezar
   *  para que el banner muestre "Buscando…" mientras trabaja. */
  const searchByPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso de fotos', 'Necesitamos acceso a tu galería para buscar por imagen.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return; // cancelado ≠ error
      const asset = res.assets[0];
      if ((asset.fileSize ?? 0) > MAX_PHOTO_MB * 1024 * 1024) {
        Alert.alert('Foto demasiado pesada', `Usa una imagen de menos de ${MAX_PHOTO_MB} MB.`);
        return;
      }
      const type = asset.mimeType ?? 'image/jpeg';
      if (!type.startsWith('image/')) {
        Alert.alert('Archivo no válido', 'Selecciona una imagen.');
        return;
      }
      setImageActive(true);
      setImageBusy(true);
      setImageError(null);
      try {
        const form = new FormData();
        form.append('image', { uri: asset.uri, name: 'foto.jpg', type } as unknown as Blob);
        const r = await ecomerseApi.searchImage(form);
        setImageResults(r.products ?? []);
      } catch (e) {
        /*
          NO se convierte en «sin resultados»: se guarda el fallo y se enseña con `InlineError`
          (que además lo anuncia al lector de pantalla). Antes esto era `setImageResults([])` +
          un Alert, y el usuario leía que su foto no servía cuando el problema era otro.
        */
        setImageResults([]);
        setImageError(e instanceof Error && e.message ? e.message : 'No se pudo procesar la imagen. Prueba con otra foto.');
      } finally {
        setImageBusy(false);
      }
    } catch { /* picker falló por el sistema */ }
  };

  /* El departamento y la familia activos, que son los dos primeros escalones de la navegación.
     `activeCat` conserva el nombre viejo —el árbol lo llamaba «categoría»— y lo que hace hoy es
     **alimentar la rejilla de familias**; `activeFam` es el escalón de en medio y sirve para dos
     cosas: marcar la celda elegida en la rejilla y escribir su nombre en la línea de resultados.
     Los dos se buscan por `id` y no se guardan como objeto: el árbol puede recargarse (cambian los
     filtros y el servidor lo vuelve a servir) y un objeto guardado quedaría obsoleto. */
  const activeCat = cats.find((c) => c.id === categoryFilter);
  const activeFam = activeCat?.familias?.find((f) => f.id === subcategoryFilter);
  /* LA LÍNEA DE RESULTADOS VUELVE A DECIR SOLO LA FAMILIA. Hasta el 23-sep-2026 escribía el camino
     entero —«Calzado · Zapatos de vestir»— porque la hoja de clases se cerraba al elegir y la clase
     no se veía en ningún otro sitio. Con la pantalla propia de la subcategoría el tercer escalón ya
     no se elige aquí, así que el camino que esta línea tiene que explicar es uno: qué familia está
     filtrando el catálogo que hay debajo. */
  const caminoFiltro = activeFam?.label ?? '';
  const cartCount = cart.reduce((a, c) => a + c.qty, 0);

  /**
   * **LA RUTA DE LA REJILLA, con los filtros de la pantalla dentro.**
   *
   * Es el cable que permite que la sección sustituya a la lista sin perder nada: departamento, familia
   * y búsqueda viajan al servidor, que los traduce a los suyos (`consultaDeCatalogo`) y devuelve **el
   * mismo catálogo filtrado** que antes pedía esta pantalla.
   *
   * Los nombres son los de la SECCIÓN y no los de la API: la pantalla no tiene por qué saber cómo se
   * llama cada filtro en el servicio de datos.
   */
  const rutaRejilla = useMemo(() => {
    const p = new URLSearchParams();
    if (categoryFilter) p.set('departamento', categoryFilter);
    if (subcategoryFilter) p.set('familia', subcategoryFilter);
    const t = busqueda.trim();
    if (t) p.set('buscar', t);
    const cadena = p.toString();
    return cadena ? `rejilla?${cadena}` : 'rejilla';
  }, [categoryFilter, subcategoryFilter, busqueda]);

  /** Los datos de la rejilla servida, para el contador y para el puente de las acciones. */
  const datosRejilla = useRef<unknown>(undefined);

  /** Volver a pedir la rejilla: el reintento del error y la tirar-para-recargar. */
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  /**
   * **LAS DOS ACCIONES DE LA TARJETA SERVIDA, ejecutando las de verdad.**
   *
   * El árbol pide `ext:favorito` o `ext:carrito` sobre un id; la ficha con ese id está en los datos
   * que mandó el servidor, y aquí se traduce al producto de la app (`productoDeFicha`) para llamar a
   * `useAccionesProducto`. **Sin esto, migrar la rejilla costaría el corazón y el carrito** —o peor:
   * dejaría unos iconos que no hacen nada.
   */
  const alAccionRejilla = useCallback((accion: string, id: string) => {
    const producto = productoDeFicha(datosRejilla.current, id);
    if (!producto) return;
    const p = producto as unknown as EcomerseProduct;
    if (accion === ACCIONES.FAVORITO) alternarFavorito(p);
    else if (accion === ACCIONES.CARRITO) anadirAlCarrito(p);
  }, [alternarFavorito, anadirAlCarrito]);

  /** La lista de la BÚSQUEDA POR FOTO: sigue siendo del cliente (es otra función, con otro endpoint). */
  const listData: EcomerseProduct[] = useMemo(() => {
    const base = imageResults;
    return base.length % 2 === 1 ? [...base, { id: '__spacer__' } as EcomerseProduct] : base;
  }, [imageResults]);

  const chooseCat = (catId: string) => {
    const next = categoryFilter === catId ? '' : catId;
    setCategoryFilter(next);
    setSubcategoryFilter(''); // nunca arrastrar la familia de otro departamento
  };

  /**
   * Tocar una familia: la deja elegida y **abre su pantalla**. Es el tercer escalón del árbol y desde
   * el 23-sep-2026 tiene pantalla propia (`/ecomerse-subcategoria`), no una hoja sobre el catálogo.
   *
   * POR QUÉ SE MARCA LA FAMILIA AQUÍ ADEMÁS DE NAVEGAR: al volver, el catálogo de debajo queda
   * filtrado por esa familia y la celda sale marcada. Llegar y salir sin rastro convertiría la
   * pantalla en un sitio del que se vuelve sin saber por dónde se entró.
   *
   * SE LE PASA EL NOMBRE EN LOS PARÁMETROS y no es un capricho: la pantalla pinta el nombre de la
   * subcategoría en su cabecera, y con el id solo tendría que esperar a que llegue el árbol para
   * poder escribir nada. Con `nombre` el encabezado ya está en el primer fotograma; si la pantalla se
   * abre por enlace directo (sin nombre), lo saca del árbol o del propio producto.
   */
  const abrirFamilia = (f: EcomerseFamily) => {
    setSubcategoryFilter(f.id);
    router.push({ pathname: '/ecomerse-subcategoria', params: { id: f.id, nombre: f.label } } as any);
  };

  const s = styles(colors);
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header. La barra de búsqueda vive AQUÍ, donde antes estaba el título «Mercado»: el título
          solo gastaba la fila más valiosa de la pantalla, y la búsqueda se iba hacia arriba con el
          catálogo (había que volver a subir para corregir una palabra). Es el patrón de Xianyu y de
          Dewu, y es lo que se pidió.
          Lo que se paga: la pantalla se queda **sin nombre visible**, y por tanto sin encabezado que
          el lector de pantalla anuncie al entrar. Se acepta a cambio de la barra fija. Queda dicho
          como deuda: si algún día se quiere recuperar, el sitio natural no es esta fila sino el
          `accessibilityLabel` de la pantalla, y hay un desajuste de nombre que arreglar antes —
          el cajón de servicios llama a esta pantalla «Ecomerse» (`ServicesDrawer.tsx:172`), que es
          el nombre del módulo en código, no el que usa el resto de la app («Mercado», en
          `billing-status.tsx:45` y `profile.tsx:431`). */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={s.headerSearch}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            /* «Buscar» y no «Buscar productos». El campo mide 126 dp y el texto va a `body`
               (14 → 16,1 dp con el `font_scale` 1.15 del dispositivo): a 10,08 dp por carácter,
               «Buscar productos» (16) pide 161 y se cortaba en «Buscar product». No se estrecha
               nada más para que quepa —los márgenes de la cabecera valen más que el relleno de un
               marcador—: se acorta el marcador, que es lo único prescindible. El significado entero
               sigue en el `accessibilityLabel`, que no compite por el ancho. */
            placeholder="Buscar"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Buscar productos"
            returnKeyType="search"
            autoCorrect={false}
            style={s.searchInput}
          />
          <Pressable onPress={searchByPhoto} hitSlop={10} disabled={imageBusy} accessibilityRole="button"
            accessibilityLabel="Buscar por foto">
            {imageBusy ? <ActivityIndicator size="small" color={colors.text.primary} /> : <Camera size={18} color={colors.text.primary} />}
          </Pressable>
        </View>
        <View style={s.headerActions}>
          <Pressable onPress={() => router.push('/ecomerse-favorites' as any)} hitSlop={12} accessibilityRole="button"
            accessibilityLabel={favIds.length ? `Favoritos, ${favIds.length}` : 'Favoritos'}>
            <Heart size={20} color={favIds.length ? brand.like : colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => router.push('/ecomerse-checkout' as any)} hitSlop={12} accessibilityRole="button"
            accessibilityLabel={cartCount ? `Carrito, ${cartCount} productos` : 'Carrito vacío'}>
            <ShoppingCart size={20} color={colors.textPrimary} />
            {cartCount > 0 && (
              <View style={s.cartBadge}><Text style={s.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text></View>
            )}
          </Pressable>
          {/* TIENDAS, no «mi tienda». Este icono 🏪 llevaba al panel del vendedor —una pantalla que,
              sin tienda dada de alta, solo puede decir que no tienes tienda— y no había **ninguna**
              forma de ver las tiendas de los demás. Ahora abre el directorio (`/ecomerse-tiendas`),
              y el panel del vendedor vive dentro, en su propia fila «Mi tienda». El icono deja de
              tener que adivinar si «tienda» es la tuya o las de todos: ahora son las dos, cada una
              en su fila. */}
          <Pressable onPress={() => router.push('/ecomerse-tiendas' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Tiendas">
            <Store size={20} color={colors.text.primary} />
          </Pressable>
        </View>
      </View>

      {/*
        AQUÍ ESTABA LA FRANJA SERVIDA como hermana fija de la lista (`ruta="home"`), y desde el
        15/10/2026 **vive dentro del scroll de la pantalla, con las demás secciones**. El motivo es el
        mismo que el del resto de la migración: con la rejilla servida, el Mercado ya no es «una lista
        con una franja encima» sino **una pantalla de secciones**, y la primera es esta franja. Como
        hermana fija se quedaba pegada arriba gastando altura para siempre —y en el modo de búsqueda
        por foto aparecía encima de unos resultados que no son el catálogo—.
      */}

      {imageActive ? (
        /*
          ── MODO BÚSQUEDA POR FOTO: la ÚNICA lista que sigue siendo del cliente ─────────────────
          Y a conciencia: estos resultados vienen de OTRO endpoint (buscar por imagen) y **no son el
          catálogo**. El árbol dirige el catálogo; esto es otra función, con su propio ciclo de vida
          (elegir foto → subir → buscar → pintar), y meterlo en el contrato del catálogo sería meter
          dos cosas distintas en la misma sección.
        */
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={s.colWrap}
          contentContainerStyle={[s.listContent, { paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e32 }]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[s.photoBanner, { backgroundColor: alpha(colors.primary, 0.08), borderColor: colors.border }]}>
              <Text style={[s.photoBannerTitle, { color: colors.textPrimary }]}>🔍 Resultados de tu foto</Text>
              <Text style={[s.photoBannerSub, { color: colors.textSecondary }]}>
                {imageBusy ? 'Buscando productos similares…' : `${imageResults.length} producto${imageResults.length === 1 ? '' : 's'} similar${imageResults.length === 1 ? '' : 'es'}`}
              </Text>
              <Pressable onPress={() => setImageActive(false)} style={s.photoBack} accessibilityRole="button">
                <Text style={s.photoBackText}>← Volver al catálogo</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            /* Tres estados distintos, y antes eran uno: mientras busca se enseña que busca, si falla
               se dice que falló (con reintento), y solo si de verdad no hay resultados se enseña el
               vacío. El vacío, además, es el del kit. */
            imageBusy ? (
              <View style={{ alignItems: 'center', paddingTop: 48 }}>
                <ActivityIndicator color={colors.text.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e10 }}>Buscando productos parecidos…</Text>
              </View>
            ) : imageError ? (
              <View style={{ paddingTop: 40, paddingHorizontal: espaciado.e32 }}>
                <InlineError mensaje={imageError} onReintentar={() => void searchByPhoto()} etiquetaReintento="Elegir otra foto" />
              </View>
            ) : (
              <EmptyState
                emoji="📷"
                titulo="No encontramos productos parecidos"
                texto="Prueba con otra foto más nítida, de frente y con buena luz, o busca por texto."
                accionLabel="← Volver al catálogo"
                onAccion={() => setImageActive(false)}
              />
            )
          }
          renderItem={({ item }) =>
            item.id === '__spacer__' ? (
              <View key="spacer" style={{ flex: 1 }} />
            ) : (
              <TarjetaProducto
                product={item}
                favorited={favIds.includes(item.id)}
                onPress={() => abrirFicha(item.id)}
                onFav={() => alternarFavorito(item)}
                onAdd={() => anadirAlCarrito(item)}
              />
            )
          }
        />
      ) : (
        /*
          ── EL CATÁLOGO, DIRIGIDO POR EL SERVIDOR (15/10/2026) ──────────────────────────────────
          Aquí estaba la `FlatList` del cliente con sus tarjetas. Ahora **los productos los manda el
          servidor** en la sección `rejilla` —la misma que se probó en `/ecomerse-ui`, con sus dos
          plantillas (ancha y estrecha)— y esta pantalla sólo pone el marco: la cabecera de búsqueda,
          la rejilla de familias (que es taxonomía) y el pie.

          **Los filtros no se pierden**: viajan en la ruta (`departamento`, `familia`, `buscar`) y el
          servidor filtra con ellos. Y las acciones tampoco: el árbol pide `ext:favorito` / `ext:carrito`
          y aquí se ejecutan las de verdad (`alAccionRejilla`).

          Es un `ScrollView` y no una `FlatList` porque **ya no hay lista que virtualizar en el
          cliente**: la que virtualiza es la de dentro de la sección. Una `FlatList` envolviendo a otra
          es el fallo clásico de React Native —dos scrolls anidados— y aquí no hace falta ninguna.
        */
        <ScrollView
          testID="mercado-servidor"
          // **La barra de departamentos (el hijo 1) se queda pegada arriba**: es lo que hace Taobao con
          // sus pestañas, y es lo que se pidió. El índice apunta a un hijo DIRECTO del scroll.
          stickyHeaderIndices={[1, 2]}
          contentContainerStyle={[s.listContent, { paddingBottom: PIE_MERCADO_H + insets.bottom + espaciado.e32 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              // Se recarga **la sección**, no una copia: tirar para recargar vuelve a preguntar al
              // servidor por el mismo filtro (`recarga` es el contador que lo provoca).
              refreshing={estadoRejilla === 'cargando' && totalRejilla > 0}
              onRefresh={recargar}
              tintColor={colors.textSecondary}
            />
          }
        >
          <View>
            {feedActivo === 'recomendado' ? (
            <>
            {/*
              ── LOS SERVICIOS, EN LA CABECERA (15/10/2026) ──────────────────────────────────────────

              Lo pidió el dueño del producto: **los servicios que ya están en la Home, aquí**, con la
              forma de Taobao —**dos filas de cinco** y lo que sobra dentro de «Más servicios»—.
              Van los primeros del scroll, justo bajo la barra de búsqueda (que sí es fija), y por
              tanto **se van con el contenido**: es lo que hace Taobao con su rejilla de accesos, y así
              no le roban a la pantalla dos filas permanentes.

              **No son una copia de los de la Home**: es el mismo `FilaServicios` → el mismo
              `useServicios`, con sus perfiles, su urgencia, su «próximamente» y su navegación validada.
              El servicio de urgencia abre **el mismo `EmergencyModal`** que la Home.
            */}
            <FilaServicios
              testID="servicios-cabecera"
              alAbrirEmergencia={() => setEmergencia(true)}
            />

            {/* LA PRIMERA SECCIÓN: la franja de destacados, servida. Va aquí dentro, con las demás,
                para que toda la pantalla desplace como una sola cosa. Si el servidor no responde no
                ocupa ni un píxel y el Mercado funciona igual (ver `FranjaServidor.tsx`). */}
            <FranjaServidor
              ruta="home"
              testID="franja-servidor"
              desplazable={false}
              alTocar={(id) => router.push({ pathname: '/ecomerse-detail', params: { id } } as never)}
            />
            </>
            ) : null}
          </View>

          {/*
            ── EL CARRIL DE FEED, PEGADO: `Recomendado` · `Siguiendo` (16/10/2026) ──────────────────

            **Es el carril de arriba de Taobao** (`推荐` · `关注`), y no es lo mismo que el de
            departamentos: este elige **qué feed** se ve; aquel filtra **dentro** del feed. Hasta hoy
            aquí solo estaba el segundo, así que «Siguiendo» **no tenía dónde ponerse**: no era un
            descuido de estilo, era que faltaba la estructura.

            Va el primero de los pegados (índice 1) porque es el que manda: al cambiar de feed, el de
            departamentos desaparece —filtrar un feed que no estás viendo no significa nada—.
          */}
          <View style={[s.barraPegada, { backgroundColor: colors.background }]} testID="feeds-carril">
            <FranjaServidor
              ruta={`feeds?activo=${encodeURIComponent(feedActivo)}`}
              testID="feeds-servidor"
              desplazable={false}
              alTocar={(id) => setFeedActivo(id === 'siguiendo' ? 'siguiendo' : 'recomendado')}
            />
          </View>

          {/*
            ── LA BARRA DE DEPARTAMENTOS, **PEGADA** (15/10/2026) ──────────────────────────────────

            Es el segundo de los pegados: `stickyHeaderIndices={[1, 2]}` los apila —el de feed arriba,
            este debajo—, que es como se ve en Taobao. **Es lo que hace Taobao** con `categoryTab`: con
            18 departamentos, perderlos al bajar obligaba a subir para cambiar de categoría, que es
            justo lo que se hace mientras se mira el catálogo.

            **El `backgroundColor` no es decoración**: sin él, el catálogo se ve pasar POR DEBAJO de los
            rótulos al desplazar y la barra parece rota.

            El envoltorio `<View>` hace falta aunque solo tenga un hijo: `stickyHeaderIndices` señala a un
            hijo DIRECTO, y la sección servida no puede ocupar ese sitio (necesita su propio contenedor).
            **Y el envoltorio está SIEMPRE** aunque dentro no haya nada: si el hijo desapareciera, los
            índices de los pegados se correrían y se pegaría la barra equivocada.
          */}
          <View style={[s.barraPegada, { backgroundColor: colors.background }]}>
            {feedActivo === 'recomendado' ? (
            <>
            {/* PESTAÑAS DE DEPARTAMENTOS — lo primero bajo la barra de búsqueda.
                Es la estructura de la referencia: el primer nivel son pestañas, la activa se marca
                con color y subrayado, y la fila **desliza** en vez de aplastarse (18 departamentos
                no caben en 360 dp, y con una escala de letra grande caben menos todavía).
                El emoji viaja DELANTE del nombre, y eso no es adorno: el servidor da emoji a los 18
                departamentos (`icon`), así que la pestaña se reconoce por figura antes de leerse —
                es lo único del árbol que tiene imagen propia.
                «Recomendado» es una pestaña más y NO es un departamento: es el estado de partida
                (sin departamento elegido) el que la deja activa, y al pulsarla se vuelve al feed
                entero. Va la primera porque es el camino de vuelta, y sin ella la única forma de
                quitar el filtro sería volver a pulsar la pestaña puesta. */}
            {/*
              ── EL CARRIL DE DEPARTAMENTOS, SERVIDO ──────────────────────────────────────────────
              Antes esto era `PestanasDepartamentos`: un carril pintado por el cliente, con sus
              estilos y su lógica dentro de esta pantalla. Ahora **lo manda el servidor** (en Taobao
              es la sección `categoryTab`), así que sus 18 departamentos, su tema claro/oscuro y su
              forma viven en un sitio y no en dos.

              **`?activa=` va en la ruta y no en el estado del widget**: la pestaña elegida es la que
              filtra la pantalla, y quien sabe qué está filtrado es el servidor. Al tocar, `chooseCat`
              hace lo de siempre (y alterna: volver a pulsar la puesta quita el filtro), la ruta
              cambia y el servidor devuelve el carril con esa pestaña activa.
            */}
            <FranjaServidor
              ruta={categoryFilter ? `categorias?activa=${encodeURIComponent(categoryFilter)}` : 'categorias'}
              testID="categorias-servidor"
              // **`desplazable={false}` en las tres secciones de esta pantalla**: el Mercado envuelve
              // sus secciones en SU `ScrollView` (el de la pantalla), y una lista virtualizada dentro
              // de un scroll rompe el reciclado —React Native lo avisa por consola—. El que desplaza
              // aquí es la pantalla; la sección sólo pinta.
              desplazable={false}
              alTocar={(id) => chooseCat(id)}
            />
            </>
            ) : null}
          </View>

          {/* Y AQUÍ EMPIEZA LO QUE SÍ SE VA CON EL CONTENIDO: familias, contador y rejilla. */}
          <View>
            {feedActivo === 'recomendado' ? (
            <>

            {/* LA REJILLA — las familias del departamento activo, con la imagen del servidor.
                La imagen **no es de la familia**: la familia no tiene ninguna (0 de 110 tienen
                `icon`), y el servidor la resuelve a partir de una TIENDA de esa familia —su logo, o
                si no lo tiene la foto de su anuncio más reciente—. Por eso el rótulo es estable y la
                imagen no: el día que las tiendas cambien sus fotos, o que se borren las de prueba,
                la celda se actualiza sola. Sin imagen (`foto: null`) la celda sale con su nombre y
                centrado: el hueco no se finge con un cuadro vacío, que se leería como avería.
                Tocar una familia la elige y **abre su pantalla**, donde están sus subclases y los
                productos de cada una (ver `abrirFamilia`). Volver a tocarla no la quita: el camino de
                vuelta es la pestaña del departamento —que suelta la familia— y el botón atrás de la
                pantalla de la subcategoría, que devuelve el catálogo ya filtrado por esa familia. */}
            {activeCat && (
              <RejillaFamilias
                familias={activeCat.familias ?? []}
                activeId={subcategoryFilter}
                onPick={abrirFamilia}
              />
            )}

            {/* AQUÍ ESTABA EL AVISO. Decía «No le pagamos al vendedor hasta que recibas el pedido»
                dentro de una franja verde (`<EstadoDinero activo="retenido" compacto />`) y se
                retiró en la limpieza de cromo. El argumento para quitarlo no es que sobre
                información, sino que **estaba en el sitio equivocado**: es una promesa sobre el
                dinero, y el usuario decide si le importa cuando va a pagar, no cuando está mirando
                categorías. El primitivo sigue vivo, intacto, para la ficha del producto y el
                checkout, que es donde esa frase cambia una decisión. */}

            {/* AQUÍ VIVÍAN TRES COSAS, Y SE FUERON LAS TRES EL 23-sep-2026 (mismo cambio que las
                pestañas y la rejilla, quince líneas más arriba):
                  · los chips de ORDEN («Recomendado · Mejor valorado · Novedades»), con su `SORTS`;
                  · la pila de AVATARES de categorías con su «Ver todas (18)» y su modal;
                  · el carril de FAMILIAS en chips, que la rejilla sustituye.
                El motivo es el mismo en los tres casos: la cabecera gastaba cuatro filas antes de
                enseñar el primer producto, y las dos primeras —ciudad y orden— no son categorías:
                son cromo de otra pantalla. Lo que se pierde está anotado arriba, en la cabecera de
                este fichero, para que no parezca que se perdió por descuido. */}

            {/* AQUÍ VIVIÓ EL CARRIL DE HOJAS, unas horas del 23-sep-2026: una fila de chips con un
                caret que la abría en el sitio. Duró lo que tardaron dos correcciones seguidas de
                Bernardo sobre dónde va de verdad el tercer escalón: primero «un modal con el nombre
                de la subcategoría en el encabezado y sus clases debajo», y después «me equivoqué en
                decir que el modal, si no que una pantalla completa». Las dos formas se implementaron
                y se vieron en el móvil; la que queda es la tercera, **una pantalla propia**
                (`app/ecomerse-subcategoria.tsx`), porque una familia puede tener 16 subclases con
                productos —la más larga del árbol vivo— y eso no cabe en una hoja sobre el catálogo.
                Aquí no queda nada que pintar. */}

            {/* AQUÍ ESTABA EL CARRIL «🔥 Recomendados» DEL CLIENTE, y se retiró el 15/10/2026 al
                migrar el catálogo al servidor. **No se pierde nada y se gana una verdad**: era el
                MISMO carrusel que la franja servida de arriba (`home`, los diez primeros del catálogo
                por `recommended`) — los mismos productos dos veces en la misma pantalla, uno mandado
                por el servidor y otro pedido aparte por la pantalla. Con dos fuentes para lo mismo, el
                día que una cambie de orden la pantalla se contradice sola. */}

            {/* Contador de resultados, con el CAMINO elegido delante cuando hay filtro de categoría.
                **El número sale del servidor** (las fichas que trajo la sección), que es quien sabe
                cuántos productos hay con estos filtros: contarlos aquí sería volver a tener la lista
                en el cliente, que es justo lo que se acaba de quitar. */}
            <Text style={s.resultsLabel}>
              {estadoRejilla === 'cargando' ? 'Cargando…'
                : `${caminoFiltro ? `${caminoFiltro} — ` : ''}${totalRejilla} producto${totalRejilla === 1 ? '' : 's'}`}
            </Text>

            {/* Si fallan las CATEGORÍAS, la pantalla lo dice sin tumbarse: el catálogo de abajo viene
                del servidor y se pinta igual; lo que falta es la rejilla de familias. */}
            {error ? (
              <View style={{ paddingHorizontal: espaciado.e32, paddingBottom: espaciado.e12 }}>
                <InlineError mensaje={error} onReintentar={load} />
              </View>
            ) : null}

            {/* ── LA REJILLA, SERVIDA ──────────────────────────────────────────────────────────
                Aquí estaba la `FlatList` de tarjetas del cliente. Ahora es una sección más: la pide
                el servidor con los filtros de la pantalla en la ruta, y la pantalla sólo reacciona a
                su estado. **El toque va a la ficha del producto** y **las acciones (corazón y
                carrito) son las de verdad**, no unos iconos decorativos. */}
            <FranjaServidor
              ruta={rutaRejilla}
              testID="rejilla-servidor"
              recarga={recarga}
              desplazable={false}
              alTocar={(id) => router.push({ pathname: '/ecomerse-detail', params: { id } } as never)}
              alAccion={alAccionRejilla}
              alEstado={(estado, datos) => {
                // Los datos se guardan para el puente de las acciones: el corazón necesita el
                // producto entero (precio, fotos), no sólo el id que trae el evento.
                datosRejilla.current = datos;
                setEstadoRejilla(estado);
                const fichas = (datos as { fichas?: unknown[] } | undefined)?.fichas;
                setTotalRejilla(estado === 'lista' && Array.isArray(fichas) ? fichas.length : 0);
              }}
            />

            {/* El esqueleto: **del cliente, porque es del cliente la espera**. Cuatro tarjetas en dos
                filas —la forma que va a llegar—, no un spinner suelto. */}
            {estadoRejilla === 'cargando' && (
              <View style={{ paddingHorizontal: espaciado.e16, gap: espaciado.e10, paddingTop: espaciado.e4 }}>
                {[0, 1].map((fila) => (
                  <View key={fila} style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                    <View style={{ flex: 1 }}><EsqueletoTarjeta /></View>
                    <View style={{ flex: 1 }}><EsqueletoTarjeta /></View>
                  </View>
                ))}
              </View>
            )}

            {/* VACÍO ≠ ERROR, y por eso son dos estados y no uno. El vacío lleva el texto según los
                filtros (como antes); el error trae reintento. Decir «no hay productos» cuando lo que
                falló fue la conexión sería una afirmación falsa sobre el catálogo. */}
            {estadoRejilla === 'vacia' && (
              <EmptyState
                emoji="🛍️"
                {...((!!categoryFilter || !!subcategoryFilter || !!busqueda.trim())
                  ? {
                      titulo: 'Sin resultados con estos filtros',
                      texto: 'Prueba a quitar filtros o a buscar con otras palabras.',
                      accionLabel: 'Quitar filtros',
                      onAccion: () => { setCategoryFilter(''); setSubcategoryFilter(''); setQuery(''); },
                    }
                  : {
                      titulo: 'Todavía no hay productos',
                      texto: 'Sé el primero en publicar: identidad verificada + aprobación del administrador.',
                      accionLabel: 'Publicar mi primer producto',
                      accionPrimaria: true,
                      onAccion: () => router.push('/ecomerse-seller' as any),
                    })}
              />
            )}
            {estadoRejilla === 'error' && (
              <View style={{ paddingTop: espaciado.e24, paddingHorizontal: espaciado.e32 }}>
                <InlineError
                  mensaje="No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo."
                  onReintentar={recargar}
                />
              </View>
            )}
            </>
            ) : (
            <>
              {/*
                ── EL FEED DE SIGUIENDO ────────────────────────────────────────────────────────────

                Las tiendas que sigue el usuario, **servidas** (`ui/siguiendo`) y **con su sesión**:
                son datos de quien pregunta, y un árbol público no puede servirlos (ver el
                `Cache-Control: private, no-store` de esa ruta).

                ⚠️ **HOY ESTO SALE VACÍO, Y ES LA VERDAD**: el backend de ecomerse **no tiene el
                endpoint de seguidos** (medido: `GET /sellers/following` → 400 porque `sellers/:id` se
                come la ruta; `/following/ids` → 404). El árbol, la sección con sesión y el carril de
                feed están hechos y probados; **lo que falta es el dato**, y no se rellena con nada
                inventado. El día que exista el endpoint, esto se llena sin tocar una línea del cliente.
              */}
              <FranjaServidor
                ruta="siguiendo"
                testID="siguiendo-servidor"
                desplazable={false}
                conSesion
                recarga={recarga}
                alTocar={(id) => router.push({ pathname: '/ecomerse-tienda', params: { id } } as never)}
                alEstado={setEstadoSiguiendo}
                alAccion={alAccionSiguiendo}
              />
              {/* El esqueleto de la espera: **del cliente, porque es del cliente la espera**. */}
              {estadoSiguiendo === 'cargando' && (
                <View style={{ paddingTop: espaciado.e24, alignItems: 'center' }}>
                  <ActivityIndicator color={colors.textPrimary} />
                </View>
              )}
              {/* AQUÍ HABÍA UN `EmptyState` DEL CLIENTE, Y SE RETIRÓ EL 16/10/2026: el vacío de este
                  feed **es una tarjeta de Taobao** (`taolive_channel_follow_new_empty_card`, con su
                  「刷新」 y su estado de error de red DENTRO), así que lo manda el servidor como una
                  variante más. Un vacío en el cliente y otro en el servidor serían dos vacíos
                  distintos para la misma pantalla — y el día que cambie uno, el otro miente. */}
            </>
            )}
          </View>
        </ScrollView>
      )}

      {/* AQUÍ VIVÍAN DOS MODALES: «Todas las categorías» (la hoja de la pila de avatares) y «Elige tu
          ciudad». Los dos cayeron con el cromo de la cabecera el 23-sep-2026: las 18 pestañas de
          departamento ya están todas a la vista —y deslizan—, así que la hoja era una segunda puerta
          al mismo sitio; y el filtro por ciudad dejó de ofrecerse en la home (el servidor y el
          `state` lo conservan intacto, ver la cabecera del fichero). */}

      {/* AQUÍ VIVIÓ LA HOJA DE CLASES — el `<Sheet>` del kit con el nombre de la familia en su
          encabezado y sus clases en chips debajo, que es lo que pidió Bernardo en la primera
          corrección. Se retiró con la segunda: **el tercer escalón es una pantalla entera**
          (`/ecomerse-subcategoria`), porque una hoja sobre el catálogo no puede enseñar, además de
          las subclases, los productos de cada una —y eso es lo que se viene a ver—. Los datos de
          cuando se midió para dimensionar la hoja siguen valiendo para la pantalla: las familias
          tienen entre 1 y 16 subclases (36 con 1-3, 66 con 4-6, 3 con 7-9, 4 con 10-14 y 1 con 16).
          Con la hoja se fue `SubChip`, que solo la pintaba a ella (Favoritos tiene el suyo) — y con
          él sus dos literales de diseño: un `borderWidth` de 1 y un `fontWeight` de 700 escritos a
          mano. Ojo con eso al documentar retiradas: **la guardia cuenta los literales que aparecen
          dentro de los comentarios**, así que escribir aquí el valor exacto lo devuelve a la cuenta. */}
      {/* El pie del Mercado (Home · Mensajes · Perfil). Va DENTRO del View raíz y al final, como el
          dock en las pantallas que lo pintan. El hueco que necesita la lista se lo da el
          `paddingBottom` de arriba: sin él, la última fila de productos quedaría tapada por la barra
          y no habría forma de llegar a ella. */}
      <PieDelMercado sinLeer={sinLeer} />

      {/* La emergencia de los servicios de la cabecera: el modal de la Home, no uno nuevo. */}
      <EmergencyModal visible={emergencia} onClose={() => setEmergencia(false)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

/**
 * EL CARRIL DE DEPARTAMENTOS SE MUDÓ AL SERVIDOR (15/10/2026).
 *
 * Aquí vivían `PestanasDepartamentos`, `Pestana` y `PestanasEsqueleto`: un carril pintado por el
 * cliente con sus estilos y su lógica dentro de esta pantalla. **Ahora lo manda el servidor**
 * (`components/ecomerse/Pestanas.tsx`, y en Taobao es la sección `categoryTab`), así que los 18
 * departamentos, el tema claro/oscuro y la forma de la barra viven **en un solo sitio**.
 *
 * Lo que se conservó, y por qué (cada uno está pagado con un fallo):
 *   · **La fila desliza** en vez de repartirse: 18 pestañas comprimidas serían 18 rótulos cortados.
 *   · **El subrayado se pinta siempre**, transparente cuando no toca: si no, la fila baila de alto.
 *   · **`accessibilityRole="tab"` con `selected`**: que el lector de pantalla lo sepa sin depender
 *     del color, que en el tema oscuro distingue mal.
 *   · **«Recomendado» va la primera** y no es un departamento: es el estado «sin departamento».
 *
 * Lo que CAMBIÓ, y es el punto de la mudanza: **el emoji se fue**. Medido en las 12 pestañas de la
 * portada de Taobao, el rótulo es **texto** y, cuando la pestaña lleva icono, es **un PNG** que va
 * aparte con su ubicación y su hueco. El emoji era invención nuestra.
 *
 * ⚠️ **Lo que se pierde**: el esqueleto de carga del carril (5 barras del alto de una pestaña). El
 * carril servido aparece cuando llega, sin esqueleto, así que la cabecera puede dar un salto pequeño.
 * Se quita a conciencia: un esqueleto que no mide lo que va a medir es una promesa falsa.
 */

/**
 * LA REJILLA DE FAMILIAS — el segundo nivel, con la imagen que resuelve el servidor.
 *
 * LA IMAGEN NO ES DE LA FAMILIA, y esto es lo que hay que entender antes de tocar nada: la familia
 * no tiene imagen propia (0 de las 110 traen `icon`), así que el servidor la saca de **una tienda de
 * esa familia** —su logo, o si no lo tiene la foto de su anuncio más reciente—. Consecuencia: el
 * **rótulo es estable y la imagen no**, porque el rótulo sale del árbol y la imagen de las tiendas.
 * El día que las tiendas cambien sus fotos, o que se borren las de prueba, la celda se actualiza
 * sola sin tocar este código.
 *
 * SIN IMAGEN NO SE FINGE NADA. `foto: null` es un estado legítimo —hoy es el de casi todas las
 * celdas, con dos tiendas en el Mercado— y entonces la celda sale **con su nombre, centrado**: no un
 * cuadro vacío, que se leería como una imagen rota, ni el emoji del departamento, que sería idéntico
 * en las quince celdas de una pestaña y no distinguiría nada.
 *
 * El alto de la celda es un MÍNIMO COMÚN (`ALTO_CELDA_FAMILIA`, 96 dp) justo por eso: si midiera lo
 * que mide su contenido, una fila con una foto y tres sin ella quedaría a cuatro alturas y los
 * rótulos quedarían descolgados, que es lo que se lee como error de maquetación.
 *
 * EL RÓTULO VA A TRES LÍNEAS (`numberOfLines={LINEAS_ROTULO}`) Y NO SE CORTA NINGUNO: a 4 columnas y
 * letra `rotulo` (9) los 110 entran enteros —está medido, ver `COLUMNAS_REJILLA`—. El
 * `ellipsizeMode="tail"` se queda puesto como red de seguridad, no como comportamiento esperado: solo
 * se dispararía con una escala de letra del sistema mucho mayor que la de referencia (1,15) o con un
 * rótulo nuevo más largo que «Bolsos y accesorios deportivos» (30 caracteres).
 */
function RejillaFamilias({ familias, activeId, onPick }: {
  familias: EcomerseFamily[]; activeId: string; onPick: (f: EcomerseFamily) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={s_home.rejillaContenido}>
      {familias.map((f) => {
        const on = activeId === f.id;
        return (
          <Pressable key={f.id} onPress={() => onPick(f)} accessibilityRole="button"
            accessibilityState={{ selected: on }} accessibilityLabel={f.label} style={s_home.celda}>
            {f.foto ? (
              <Image
                source={{ uri: f.foto }}
                style={[s_home.celdaFoto, {
                  backgroundColor: colors.surface,
                  borderColor: on ? colors.primary : colors.border,
                  borderWidth: on ? trazo.fuerte : trazo.fino,
                }]}
                contentFit="cover"
                transition={150}
              />
            ) : null}
            <Text numberOfLines={LINEAS_ROTULO} ellipsizeMode="tail"
              style={[s_home.celdaRotulo, { color: on ? colors.text.primary : colors.textPrimary }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s_home = StyleSheet.create({
  /* --- pestañas: los estilos se mudaron con el carril (ver `components/ecomerse/Pestanas.tsx`) --- */

  /* --- rejilla de familias --- */
  /** `flexWrap` con ancho EXPLÍCITO por celda (`100/COLUMNAS_REJILLA`): con `flex: 1` y base 0 el
   *  `flexWrap` no llega a partir la fila —las celdas «caben» en teoría y acaban comprimidas—. Es un
   *  defecto que ya apareció en la rejilla vieja de esta pantalla. */
  rejillaContenido: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: espaciado.e12, paddingTop: espaciado.e12 },
  celda: {
    width: `${100 / COLUMNAS_REJILLA}%`, minHeight: ALTO_CELDA_FAMILIA,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e2, paddingVertical: espaciado.e4,
  },
  celdaFoto: { width: DIAM_FOTO_FAMILIA, height: DIAM_FOTO_FAMILIA, borderRadius: radios.md, marginBottom: espaciado.e6 },
  /** `rotulo` (9) y no `micro` (11): el peldaño de la escala que existe para esta celda. El porqué
   *  —80 dp de ancho por celda, 110 rótulos medidos— está contado en `tipografia.rotulo`. */
  celdaRotulo: { fontSize: tipografia.rotulo, fontWeight: peso.fuerte, textAlign: 'center' },
});

/* Aquí vivía `SubChip`, el chip de la hoja de clases. Se retiró el 23-sep-2026 con la hoja: el tercer
   escalón pasó a ser una pantalla (`app/ecomerse-subcategoria.tsx`). Favoritos tiene su propio
   `SubChip`, que no se toca —es de otra pantalla y de otro filtro—. */

/** Aquí vivieron tres esqueletos de la zona de categorías, y ninguno llegó a tiempo: `CatSkeletonGrid`
 *  (5 cuadrados de 46 en fila) se retiró al pasar la home a la pila de avatares, `AvatarStackEsqueleto`
 *  (los círculos con su solape) al pasar la home a las pestañas + rejilla el 23-sep-2026. El que vive
 *  ahora es `PestanasEsqueleto`, unas barras del ancho de una pestaña: dibuja **lo que va a llegar**
 *  —nombres de departamento— y no una forma que luego no aparece. Regla que sacaron los tres: un
 *  esqueleto que no mide lo mismo que el contenido hace saltar la cabecera al cargar. */

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  /**
   * LA BARRA PEGADA (el hijo 1 del scroll). **Solo el `zIndex`**: el fondo va en línea, porque sale
   * del tema (`colors.background`) y este `StyleSheet` ya recibe los colores — pero el `zIndex` tiene
   * que ser estilo propio: sin él, en Android la barra se pinta por debajo del contenido que pasa.
   */
  barraPegada: { zIndex: 2 },
  /**
   * Fondo SÓLIDO + elevación: es lo que despega la cabecera del catálogo que se desliza por
   * debajo. Sin `backgroundColor` la barra era transparente y, al desplazar, la fila de tarjetas
   * cortada por el borde de la lista se leía pegada al título, sin separación ninguna.
   * `paddingVertical` bajó de 12 a 8 al mudarse aquí la barra de búsqueda: 8 + 40 + 8 = 56 dp de
   * cabecera, el alto estándar de una barra de app de Android. Con 12 serían 64 y se comía el
   * sitio de una tarjeta y media.
   */
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8, backgroundColor: c.background, borderBottomWidth: trazo.fino, borderBottomColor: c.border, zIndex: 2, elevation: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e14 },
  cartBadge: { position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: radios.sm, backgroundColor: brand.like, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e3 },
  cartBadgeText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.titulo },
  /**
   * La barra de búsqueda, en la cabecera. `height: 40` en vez de `paddingVertical`: es lo que la
   * hace caber junto a los tres iconos de acción y quedar centrada con ellos, y evita que el alto
   * dependa del `font_scale` del usuario (con un `paddingVertical` fijo, a 1.3 de escala la barra
   * crecía y desalineaba la fila entera). Los 40 dp son de la barra, no del área táctil: la barra
   * entera es el campo, así que el alto táctil ya es de sobra.
   */
  /**
   * La barra de búsqueda, en la cabecera. `height: 40` en vez de `paddingVertical`: es lo que la
   * hace caber junto a los tres iconos de acción y quedar centrada con ellos, y evita que el alto
   * dependa del `font_scale` del usuario (con un `paddingVertical` fijo, a 1.3 de escala la barra
   * crecía y desalineaba la fila entera). Los 40 dp son de la barra, no del área táctil: la barra
   * sigue siendo pulsable en toda su superficie.
   *
   * **El radio es `radios.chip` (10) y no `radios.md` (12) porque 10 es lo MEDIDO en el buscador de
   * Taobao** (`m_h_searchBar_slim_protocol_version`, `DXIMAGESPAN_CORNERRADIUS`: 10 en la caja, 8.5 y
   * 7 en lo de dentro, 3 en el detalle). La forma de la barra de Taobao es la de un chip alargado, no
   * la de un campo de formulario, y el token que existe para eso es este.
   */
  headerSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: espaciado.e12, height: 40, paddingHorizontal: espaciado.e12, backgroundColor: c.surface, borderRadius: radios.chip, borderWidth: trazo.fino, borderColor: c.border },
  /** `paddingVertical: 0` es obligatorio en Android: el `TextInput` trae relleno vertical propio y,
   *  sin quitarlo, desborda los 40 dp de la barra por arriba y por abajo. */
  searchInput: { flex: 1, color: c.textPrimary, fontSize: tipografia.body, marginLeft: espaciado.e8, paddingVertical: 0 },
  /* Aquí vivían `cityRow`, `cityPicker`, `cityLabel` y `cityItem` (el carril de ciudad) y `seeAll`
     («Ver todas (18)», el acceso al modal de categorías). Se retiraron el 23-sep-2026 con el cromo
     de la cabecera: sus dos pantallas ya no existen, así que eran cinco hojas de estilo que nadie
     podía aplicar. Un `StyleSheet` con claves muertas no molesta al compilador, pero hace creer que
     la ciudad y el modal siguen ahí a quien lea el archivo. */
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, marginTop: espaciado.e16, marginBottom: espaciado.e8 },
  sectionTitle: { fontSize: tipografia.body, fontWeight: peso.maximo, color: c.textPrimary },
  /* Aquí vivía `subRow`, el carril de hojas de la cabecera. Se retiró el 23-sep-2026 junto con el
     carril entero: las clases de una familia se eligen en la hoja (`<Sheet>`), no en una fila de
     chips. Dejarla habría sido una hoja de estilo que nadie aplica —el patrón del archivo es que una
     pieza que se va se lleva sus estilos—. */
  /**
   * El contador de resultados: «9 productos».
   *
   * **Va pegado al carril de arriba y a las tarjetas de abajo** (4 y 4). Antes tenía 16 arriba y 10
   * abajo, y con los 8 del margen de la rejilla sumaban **unos 47 dp entre el carril y la primera
   * tarjeta**: se veía como un hueco que no separaba nada. Los 4 dp de cada lado son una decisión
   * declarada —el corpus no trae una medida para «separación entre las pestañas y el feed»— y lo que
   * separa de verdad es la línea del propio contador.
   */
  resultsLabel: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: c.textSecondary, paddingHorizontal: espaciado.e16, marginTop: espaciado.e4, marginBottom: espaciado.e4 },
  colWrap: { gap: espaciado.e10, paddingHorizontal: espaciado.e16 },
  listContent: { paddingBottom: espaciado.e32 },
  /* `modalWrap`/`modalCard`/`modalHead`/`modalTitle` murieron con los dos modales de la home
     (ciudad y «Todas las categorías»), retirados el 23-sep-2026. El `Modal` ya no está importado
     en este archivo: si vuelve a hacer falta un modal, se trae el `Modal` y con él su envoltorio. */
  photoBanner: { marginHorizontal: espaciado.e16, marginTop: espaciado.e12, borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e14, alignItems: 'center' },
  photoBannerTitle: { fontSize: tipografia.body, fontWeight: peso.maximo },
  photoBannerSub: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  photoBack: { marginTop: espaciado.e10, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, borderRadius: radios.lg, backgroundColor: c.primary },
  photoBackText: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo },
});
