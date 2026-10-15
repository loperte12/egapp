/**
 * EcomerseUiScreen — la portada del Mercado, pintada con un árbol del SERVIDOR
 * ===========================================================================
 * Ruta: /ecomerse-ui
 *
 * ## Qué demuestra esta pantalla
 *
 * **El cliente no sabe qué hay dentro.** No hay ni un widget nombrado en este fichero: pide un
 * árbol a `/api/ecomerse/ui/home` y lo pasa al `Renderizador`. Si mañana el servidor cambia el
 * orden, los colores o añade una rejilla, **esta pantalla no se toca**.
 *
 * Eso es la UI dirigida por el servidor (D3), y es la razón de que existan los 13 tipos de nodo
 * del `Renderizador`: `Lista` (`DXRecyclerLayout`), `Condicional` (`DXConditionalNode`), `Precio`
 * (`DXMegaPriceView`)… **todo sacado de Taobao, no inventado.**
 *
 * ## Las tres decisiones que se ven en el código
 *
 * 1. **Si el árbol no llega, la sección no se pinta** — y se explica por qué, con un botón para
 *    reintentar. **No hay árbol de repuesto en el cliente**: un repuesto es una segunda fuente de
 *    verdad que se queda obsoleta en silencio, y entonces nadie sabe si lo que se ve vino del
 *    servidor o de aquí.
 *
 * 2. **El toque lo decide el árbol, no esta pantalla.** El servidor pone `EVENT_TAP: '$item.id'`
 *    y aquí sólo se recibe el id. **La pantalla no sabe que los elementos son productos** — si
 *    mañana son tiendas, el `alEvento` recibe un id de tienda y navega igual.
 *
 * 3. **Se pide una vez.** Con `AbortController`, porque una respuesta que llega después de salir
 *    de la pantalla es un `setState` sobre algo desmontado.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { espaciado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';

import { uiHome, type NodoRemoto } from '../api/ecomerseUi';
import { Renderizador } from '../components/ecomerse/Renderizador';
import { FranjaServidor } from '../components/ecomerse/FranjaServidor';
import { useAccionesProducto } from '../components/ecomerse/useAccionesProducto';
import { useEcomerseStore } from '../state/ecomerse';
import { ACCIONES } from '../components/ecomerse/valorAtributos';
import type { EcomerseProduct } from '../api/ecomerse';

/**
 * Busca una ficha de producto en los datos que mandó el servidor.
 *
 * **El árbol manda los datos con nombres cortos** (`id`, `titulo`, `precioXaf`, `foto`); la API de la
 * app habla el suyo (`id`, `title`, `priceXaf`, `photos`). El puente se hace aquí, en una función, en
 * vez de obligar al árbol a hablar el idioma de la API — que es justo lo que se quiere evitar.
 */
function buscarFicha(datos: unknown, id: string): Record<string, unknown> | null {
  if (!datos || typeof datos !== 'object') return null;
  for (const valor of Object.values(datos as Record<string, unknown>)) {
    if (!Array.isArray(valor)) continue;
    const f = valor.find((x) => x && typeof x === 'object' && (x as Record<string, unknown>).id === id);
    if (f) return f as Record<string, unknown>;
  }
  return null;
}

export default function EcomerseUiScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // **Las acciones de verdad de la app**, no una copia: el corazón tiene puerta de sesión y vuelta
  // atrás si la API falla, y el carrito respeta la guarda de combinaciones. Copiarlas aquí sería
  // garantizar que un día digan cosas distintas (es lo que dice el propio módulo).
  const { alternarFavorito, anadirAlCarrito } = useAccionesProducto();
  /** El filtro de departamento es el del listado: **una sola verdad sobre qué está filtrado**. */
  const { setCategoryFilter } = useEcomerseStore();

  // **El modo del sistema viaja al servidor**, que es quien resuelve los colores del árbol (igual
  // que Taobao resuelve `style.styleData.*`). El cliente no tiene tabla de temas.
  const tema = useColorScheme() === 'dark' ? 'oscuro' : 'claro';

  const [arbol, setArbol] = useState<NodoRemoto | null>(null);
  const [datos, setDatos] = useState<unknown>(undefined);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  const cargar = useCallback((senal: AbortSignal) => {
    setCargando(true);
    setFallo(false);
    uiHome(senal, tema).then((r) => {
      // El `AbortController` no cancela el `fetch` de verdad en todos los motores, así que se
      // comprueba aquí también. **Escribir estado tras desmontar es un aviso que ensucia el log y
      // que además puede pisar datos de una pantalla nueva.**
      if (senal.aborted) return;
      if (!r) { setFallo(true); setArbol(null); }
      else { setArbol(r.arbol); setDatos(r.datos); }
      setCargando(false);
    });
    // `tema` es dependencia: si el usuario cambia claro/oscuro, se vuelve a pedir la franja.
  }, [tema]);

  useEffect(() => {
    const c = new AbortController();
    cargar(c.signal);
    return () => c.abort();
  }, [cargar]);

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[s.titulo, { color: colors.textPrimary }]}>El servidor manda</Text>
        <View style={{ width: 22 }} />
      </View>

      {cargando ? (
        <View style={s.centro}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : fallo || !arbol ? (
        <View style={[s.centro, { paddingHorizontal: espaciado.e24 }]}>
          <Text style={[s.aviso, { color: colors.textPrimary }]}>
            El servidor no mandó la portada.
          </Text>
          {/* **Se dice POR QUÉ está vacío, y qué se puede hacer.** Un hueco en blanco sin
              explicación se lee como un fallo de la app; esto se lee como lo que es. */}
          <Text style={[s.avisoSub, { color: colors.textSecondary }]}>
            No hay árbol de reemplazo en el cliente: una sección que no llega es una sección que no
            está, y así se sabe de dónde vino lo que se ve.
          </Text>
          <Pressable
            onPress={() => cargar(new AbortController().signal)}
            accessibilityRole="button"
            style={[s.boton, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/*
            LA BARRA DE CATEGORÍAS, servida. En Taobao es la sección `categoryTab` de la portada: las
            pestañas son DATO (`content.tabs[]`) y el tema va aparte. Aquí la pinta el servidor y la
            pantalla solo dice QUÉ HACER al tocar — **el mismo filtro que usa el propio listado**
            (`useEcomerseStore`), no un camino nuevo.
          */}
          <FranjaServidor
            ruta="categorias"
            testID="categorias-servidor"
            alTocar={(id) => {
              setCategoryFilter(id);
              router.push('/ecomerse' as never);
            }}
          />
          <Renderizador
            testID="portada-servidor"
            // **El `Renderizador` NO impone `flex: 1` a propósito** — dentro de un `ScrollView` un
            // `flex: 1` colapsaría el contenido. Así que el que llama decide, y aquí toca decidirlo:
            // sin altura, el `Scroll` raíz del árbol mide cero y **la pantalla sale vacía sin ningún
            // error**, que es justo lo que pasó al probarlo la primera vez.
            style={{ flex: 1 }}
            arbol={arbol as never}
            datos={datos}
            // **La pantalla no sabe que son productos.** El servidor puso `EVENT_TAP: '$item.id'`,
            // así que aquí sólo llega un id. Si mañana son tiendas, esto navega igual.
            alEvento={(id) => router.push(`/ecomerse-arbol?id=${id}` as never)}
          />
          {/*
            LA REJILLA, en la forma de Taobao: **dos `Lista` en fila con los datos repartidos** — la
            monta el SERVIDOR (`ui/rejilla`), no esta pantalla. Aquí sólo se le da altura: un
            `FlatList` sin altura dentro de un contenedor flexible mide cero y la sección sale
            vacía sin ningún error. **La pantalla no sabe qué es una columna.**
          */}
          <FranjaServidor
            ruta="rejilla"
            testID="rejilla-servidor"
            style={{ flex: 2 }}
            alTocar={(id) => router.push(`/ecomerse-arbol?id=${id}` as never)}
            // ── LAS DOS ACCIONES, AL CONTRATO ────────────────────────────────────────────────
            // El árbol pide `ext:favorito` o `ext:carrito` sobre un id; aquí se ejecutan las
            // acciones REALES de la app. **Sin esto, la rejilla servida no podía sustituir a la
            // lista**: sería una rejilla bonita sin corazón y sin carrito.
            alAccion={(accion, id, datos) => {
              const ficha = buscarFicha(datos, id);
              if (!ficha) return;
              const producto = {
                id: String(ficha.id),
                title: String(ficha.titulo ?? ''),
                priceXaf: Number(ficha.precioXaf ?? 0),
                photos: ficha.foto ? [String(ficha.foto)] : [],
              } as unknown as EcomerseProduct;
              if (accion === ACCIONES.FAVORITO) alternarFavorito(producto);
              else if (accion === ACCIONES.CARRITO) anadirAlCarrito(producto);
            }}
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: 1 },
  titulo: { fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e12 },
  aviso: { fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center' },
  avisoSub: { fontSize: tipografia.caption, textAlign: 'center', lineHeight: 18 },
  boton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, marginTop: espaciado.e8 },
});
