/**
 * Store global de Ecomerse (Zustand v5) — estado del marketplace.
 * Carrito de compra, favoritos (Xianyu), filtros activos (categoría,
 * subcategoría, ciudad) y último catálogo cargado.
 * Persistencia (auditoría 2026-09-02): SOLO el carrito sobrevive al cierre de
 * la app (AsyncStorage). Favoritos NO se persisten: van sincronizados por API
 * y son por-usuario; filtros/búsqueda son de sesión.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CartLine {
  productId: string;
  title: string;
  priceXaf: number;
  qty: number;
  photos: string[];
  /** Techo de stock (auditoría): el carrito nunca supera el disponible. */
  stock?: number;
  /** Ciudad del producto (para tarifa logística). */
  city?: string;
  /**
   * ── LA COMBINACIÓN ELEGIDA (fase 4, 21-sep-2026) ─────────────────────────────────────────────
   *
   * Sin esto, la línea es del **anuncio entero**. Con esto, es de una combinación concreta
   * («Rojo · M»): lleva su id —que es lo que viaja al pedido—, su nombre para poder enseñarlo, y sus
   * atributos. En ese caso `priceXaf` es el de la **combinación**, no el del anuncio: el servidor
   * congela ese precio en la línea del pedido.
   */
  variantId?: string;
  variantName?: string;
  variantAttributes?: Record<string, string | number | boolean>;
  variantImageUrl?: string | null;
}

/**
 * La identidad de una línea del carrito: `producto::combinación`.
 *
 * Un anuncio CON combinaciones puede estar dos veces en el carrito —«Rojo · M» y «Azul · L» son dos
 * líneas—, y un anuncio SIN combinaciones no se parte nunca. Las dos cosas se resuelven con la misma
 * clave. Las líneas guardadas antes de la fase 4 no traen `variantId`, así que su clave es
 * `producto::`, que es exactamente lo que eran: por eso el carrito que ya estaba en el móvil sigue
 * valiendo y no hay que migrar nada (ni subir la versión de `persist`, que tiraría el carrito).
 */
export function claveLinea(l: { productId: string; variantId?: string }): string {
  return `${l.productId}::${l.variantId ?? ''}`;
}

interface EcomerseState {
  cart: CartLine[];
  categoryFilter: string;
  subcategoryFilter: string;
  /**
   * AQUÍ VIVÍA `leafFilter` (el tercer nivel del árbol), y se retiró el 23-sep-2026. No se perdió
   * ninguna capacidad: **la elige la pantalla de la subcategoría** (`app/ecomerse-subcategoria.tsx`),
   * que pide el catálogo de la familia entera y reparte los productos por subclase en memoria. Un
   * filtro de hoja mandado al servidor obligaba a volver a pedir la lista en cada toque; con la lista
   * de la familia ya en el móvil, cambiar de subclase es instantáneo y sin red.
   *
   * Se retira el CAMPO y no solo su uso porque un campo de estado que nadie puede escribir es deuda
   * invisible: el siguiente que lea el módulo creería que el tercer nivel se filtra por aquí. El
   * servidor sigue aceptando `leaf` en `catalog()` —no se toca— y devolviendo `leafId`/`leafLabel`
   * por producto, que es de donde la pantalla saca las subclases.
   */
  cityFilter: string;          // '' = todas las ciudades
  query: string;
  favIds: string[];            // productos favoritos del usuario (corazón)
  lastCatalogAt: number | null;
  addToCart: (line: CartLine) => void;
  /**
   * Las tres siguientes reciben la **clave de línea** (`claveLinea`), no el `productId`: con
   * combinaciones, un mismo anuncio puede tener varias líneas en el carrito y operar por
   * `productId` las tocaría todas a la vez. Para un anuncio sin combinaciones la clave es
   * `producto::`, así que la llamada antigua sigue significando exactamente lo mismo.
   */
  setQty: (clave: string, qty: number) => void;
  removeFromCart: (clave: string) => void;
  clearCart: () => void;
  updateLinePrice: (clave: string, priceXaf: number) => void;
  setCategoryFilter: (cat: string) => void;
  setSubcategoryFilter: (sub: string) => void;
  setCityFilter: (city: string) => void;
  setQuery: (q: string) => void;
  setFavIds: (ids: string[]) => void;
  toggleFavId: (productId: string) => void;
  markCatalogLoaded: () => void;
}

export const useEcomerseStore = create<EcomerseState>()(
  persist(
    (set) => ({
      cart: [],
      categoryFilter: '',
      subcategoryFilter: '',
      cityFilter: '',
      query: '',
      favIds: [],
      lastCatalogAt: null,

      addToCart: (line) =>
        set((s) => {
          const max = line.stock ?? 999;
          const clave = claveLinea(line);
          const existing = s.cart.find((c) => claveLinea(c) === clave);
          if (existing) {
            return {
              cart: s.cart.map((c) =>
                claveLinea(c) === clave ? { ...c, qty: Math.min(c.qty + line.qty, max) } : c),
            };
          }
          return { cart: [...s.cart, { ...line, qty: Math.min(line.qty, max) }] };
        }),

      setQty: (clave, qty) =>
        set((s) => ({
          cart:
            qty <= 0
              ? s.cart.filter((c) => claveLinea(c) !== clave)
              : s.cart.map((c) => (claveLinea(c) === clave ? { ...c, qty } : c)),
        })),

      removeFromCart: (clave) =>
        set((s) => ({ cart: s.cart.filter((c) => claveLinea(c) !== clave) })),

      updateLinePrice: (clave, priceXaf) =>
        set((s) => ({
          cart: s.cart.map((c) => (claveLinea(c) === clave ? { ...c, priceXaf } : c)),
        })),

      clearCart: () => set({ cart: [] }),
      /* Al cambiar un escalón se vacían los de ABAJO. Antes había dos niveles y la regla ya era
         esta: cambiar la categoría limpiaba la subcategoría. Con el tercer nivel fuera del store
         —vive en la pantalla de la subcategoría, ver arriba— el escalón que se vacía es uno, y la
         regla sigue siendo la misma: una familia de otro departamento no puede quedar colgando,
         porque el filtro no devolvería nada y no diría por qué. */
      setCategoryFilter: (cat) => set({ categoryFilter: cat, subcategoryFilter: '' }),
      setSubcategoryFilter: (sub) => set({ subcategoryFilter: sub }),
      setCityFilter: (city) => set({ cityFilter: city }),
      setQuery: (q) => set({ query: q }),
      setFavIds: (ids) => set({ favIds: ids }),
      toggleFavId: (productId) =>
        set((s) => ({
          favIds: s.favIds.includes(productId)
            ? s.favIds.filter((id) => id !== productId)
            : [productId, ...s.favIds],
        })),
      markCatalogLoaded: () => set({ lastCatalogAt: Date.now() }),
    }),
    {
      name: 'eg-ecomerse-cart',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ cart: s.cart }),
    },
  ),
);

/** Total del carrito en XAF (entero). */
export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((acc, c) => acc + c.priceXaf * c.qty, 0);
}
