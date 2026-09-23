/**
 * useAccionesProducto — lo que hace una tarjeta del Mercado cuando la pulsas, le das al corazón o la
 * añades al carrito.
 *
 * POR QUÉ ES UN MÓDULO Y NO DOS LÍNEAS EN CADA PANTALLA
 * `app/ecomerse.tsx` ya tenía escrita esta frase sobre el corazón: «**en un solo sitio**: ahora lo
 * pulsan la rejilla y el carrusel, y tener la misma regla escrita dos veces es la forma más segura de
 * que un día digan cosas distintas». Era verdad dentro de ese archivo. Al aparecer la pantalla de la
 * subcategoría, que pinta **las mismas tarjetas**, la regla se rompía en cuanto se copiara: el corazón
 * tiene una puerta de sesión, una marca optimista y una vuelta atrás si la API falla, y eso copiado es
 * garantizar que un día una pantalla deje el corazón puesto y la otra no.
 *
 * QUÉ ENTRA
 *   · **El corazón** (`alternarFavorito`): sesión, marca optimista y deshacer + aviso si la API falla.
 *   · **La sincronización de favoritos al montar**: `favIds` vive en el store, así que una pantalla
 *     abierta por enlace directo —sin pasar por la home— enseñaría todos los corazones vacíos.
 *     Se paga una petición de más al entrar en la segunda pantalla; la alternativa era un corazón que
 *     miente, que es peor.
 *   · **Abrir la ficha** y **añadir al carrito**, con la guarda del anuncio con combinaciones.
 *
 * QUÉ NO ENTRA
 *   · **Añadir al carrito desde la FICHA** (`ecomerse-detail.tsx`): la ficha tiene combinaciones,
 *     cantidad y modo «comprar ahora», y ese flujo es suyo. Lo que la ficha sí toma de aquí es el
 *     corazón y la sincronización de `favIds`.
 *   · El botón de WhatsApp y el selector de combinación: son de la ficha y de nadie más.
 *
 * ── CERRADO EL 24/09/2026 (Fase 2): YA NO HAY TRES VERSIONES ────────────────────────────────────
 * Aquí decía, y era verdad entonces: «el corazón de `ecomerse-detail.tsx` y el de `ecomerse-tienda.tsx`
 * **no** pasan por aquí; migrarlos es otra tarea». Se migraron los dos.
 *   · `ecomerse-tienda.tsx` usa el módulo entero: `favIds`, `alternarFavorito`, `abrirFicha` y
 *     `anadirAlCarrito`. Desaparecieron su `useEffect` de favoritos, su `alternarFavorito` propio
 *     **y su copia de la guarda de combinaciones** — que era el peor de los tres duplicados, porque
 *     una guarda copiada es una guarda que un día deja de coincidir.
 *   · `ecomerse-detail.tsx` usa `favIds` y `alternarFavorito` (los otros dos no le sirven: ver
 *     arriba). Y gana algo que no tenía: la sincronización al montar. Antes, abrir una ficha por
 *     enlace directo —sin pasar por la home— enseñaba el corazón vacío aunque el producto estuviera
 *     guardado. Ese era el mismo defecto que este módulo se creó para cerrar, y le quedaba una
 *     puerta abierta.
 */

import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ecomerseApi, EcomerseProduct } from '../../api/ecomerse';
import { useEcomerseStore } from '../../state/ecomerse';
import { useSession } from '../../state/session';

export function useAccionesProducto() {
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const { favIds, setFavIds, toggleFavId, addToCart } = useEcomerseStore();

  /** Sincroniza los ids de favoritos del usuario. Silencioso si no hay sesión o si la API falla: los
   *  corazones simplemente salen vacíos, que es lo que son. */
  useEffect(() => {
    let vivo = true;
    ecomerseApi.favoriteIds().then((ids) => { if (vivo) setFavIds(ids); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [setFavIds]);

  const abrirFicha = useCallback((id: string) => {
    router.push({ pathname: '/ecomerse-detail', params: { id } } as any);
  }, [router]);

  /** Corazón. Sin sesión no se escribe nada y se dice por qué: un corazón que se queda puesto sin
   *  guardarse es un favorito que el usuario cree tener y no tiene. */
  const alternarFavorito = useCallback((item: EcomerseProduct) => {
    if (!isAuthenticated) {
      Alert.alert('Inicia sesión', 'Para guardar favoritos entra en tu cuenta.');
      return;
    }
    toggleFavId(item.id);
    ecomerseApi.favoritesToggle(item.id).catch(() => {
      toggleFavId(item.id);
      Alert.alert('Favoritos', 'No se pudo guardar. Inténtalo de nuevo.');
    });
  }, [isAuthenticated, toggleFavId]);

  /**
   * Añadir al carrito desde la tarjeta. **Un anuncio CON combinaciones no se añade desde aquí**: hay
   * que elegir color y talla, y la tarjeta no tiene dónde. Se manda a la ficha, que es donde se elige.
   *
   * La guarda se apoya en `variantCount`, que hoy devuelve `myProducts`; **el catálogo todavía no lo
   * manda**, así que mientras tanto esta rama no se toma y la línea se retira con su aviso en el
   * checkout (ver `app/ecomerse-checkout.tsx`).
   */
  const anadirAlCarrito = useCallback((item: EcomerseProduct) => {
    if (item.variantCount) { abrirFicha(item.id); return; }
    addToCart({
      productId: item.id,
      title: item.title,
      priceXaf: item.priceXaf,
      qty: 1,
      photos: item.photos ?? [],
      stock: item.stock,
      city: item.city,
    });
  }, [abrirFicha, addToCart]);

  return { favIds, abrirFicha, alternarFavorito, anadirAlCarrito };
}
