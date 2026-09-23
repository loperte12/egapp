/**
 * Store global de Comida Rápida (Zustand v5) — carrito del menú.
 *
 * Auditoría senior (2026-09-02):
 *  · CADA línea lleva su `restaurantId` (un pedido = UN restaurante). La
 *    validación compara restaurante con restaurante, nunca ids de ítems.
 *  · `switchRestaurant(id)` limpia + fija tras confirmar el descarte; la
 *    pantalla decide con diálogo (nunca se borra el carrito sin avisar).
 *  · `addToCart` se niega a mezclar restaurantes (defensa dura para
 *    deep-links / estados raros).
 *  · `setQty` valida enteros ≥ 0 y capa en 99 (el backend capa en 100).
 *  · Persistencia con AsyncStorage (zustand/middleware): el carrito sobrevive
 *    al cierre de la app (entrega a domicilio = pedido en curso real).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FoodCartLine {
  itemId: string;
  /** Restaurante al que pertenece esta línea (auditoría: validación real). */
  restaurantId: string;
  name: string;
  priceXaf: number;
  qty: number;
  category: string;
}

const MAX_QTY = 99;

interface FoodState {
  restaurantId: string;
  cart: FoodCartLine[];
  /** Fija el restaurante en contexto (sin tocar el carrito). */
  setRestaurant: (id: string) => void;
  /** Cambia de restaurante DESCARTANDO el carrito (tras confirmación UX). */
  switchRestaurant: (id: string) => void;
  addToCart: (line: Omit<FoodCartLine, 'qty'>) => void;
  setQty: (itemId: string, qty: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
}

export const useFoodStore = create<FoodState>()(
  persist(
    (set) => ({
      restaurantId: '',
      cart: [],

      setRestaurant: (id) => set({ restaurantId: id }),

      switchRestaurant: (id) => set({ restaurantId: id, cart: [] }),

      addToCart: (line) =>
        set((s) => {
          // Un pedido = un restaurante: si el carrito ya tiene ítems de OTRO
          // restaurante, no mezclar (la UI confirma antes con switchRestaurant;
          // esto cubre deep-links y rehidrataciones raras).
          if (s.cart.length > 0 && s.cart[0].restaurantId !== line.restaurantId) return s;
          const existing = s.cart.find((c) => c.itemId === line.itemId);
          if (existing) {
            return {
              cart: s.cart.map((c) =>
                c.itemId === line.itemId ? { ...c, qty: Math.min(c.qty + 1, MAX_QTY) } : c),
            };
          }
          return { cart: [...s.cart, { ...line, qty: 1 }], restaurantId: line.restaurantId };
        }),

      setQty: (itemId, qty) =>
        set((s) => {
          if (!Number.isInteger(qty) || qty < 0) return s; // validación defensiva
          if (qty === 0) return { cart: s.cart.filter((c) => c.itemId !== itemId) };
          return {
            cart: s.cart.map((c) => (c.itemId === itemId ? { ...c, qty: Math.min(qty, MAX_QTY) } : c)),
          };
        }),

      removeFromCart: (itemId) =>
        set((s) => ({ cart: s.cart.filter((c) => c.itemId !== itemId) })),

      clearCart: () => set({ cart: [], restaurantId: '' }),
    }),
    {
      name: 'eg-food-cart',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Migración defensiva: las líneas viejas sin restaurantId se etiquetan
      // con el restaurante persistido (o '' y la UI decidirá).
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<FoodState> | null;
        const lines = Array.isArray(p?.cart) ? p.cart : [];
        return {
          restaurantId: typeof p?.restaurantId === 'string' ? p.restaurantId : '',
          cart: lines.map((c) => ({
            itemId: String(c.itemId ?? ''),
            restaurantId: typeof c.restaurantId === 'string' ? c.restaurantId : (p?.restaurantId ?? ''),
            name: String(c.name ?? ''),
            priceXaf: Number(c.priceXaf ?? 0),
            qty: Number(c.qty ?? 1),
            category: String(c.category ?? 'plato'),
          })),
        };
      },
      partialize: (s) => ({ restaurantId: s.restaurantId, cart: s.cart }),
    },
  ),
);

/** Total del carrito en XAF (entero). Selector puro: úsalo con useMemo. */
export function foodCartTotal(cart: FoodCartLine[]): number {
  return cart.reduce((acc, c) => acc + c.priceXaf * c.qty, 0);
}

/** Nº de ítems (suma de cantidades). Selector puro: úsalo con useMemo. */
export function foodCartCount(cart: FoodCartLine[]): number {
  return cart.reduce((acc, c) => acc + c.qty, 0);
}
