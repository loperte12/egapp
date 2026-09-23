/**
 * useSinLeerMercado — cuántos mensajes sin leer tiene el comprador, para la insignia de «Mensajes».
 *
 * DE DÓNDE SALE EL NÚMERO
 * De **dos** sitios, y se suman: `GET /ecomerse/notices/counts` (los avisos del sistema, que los
 * cuenta la BASE —no se cuentan los de la bandeja, que tiene ventana de 100 y mentiría a la baja—)
 * y el `unread` de `GET /ecomerse/chats` (lo que las TIENDAS le han escrito). Desde la Fase 4
 * Mensajes tiene las dos cosas, y una insignia que sólo contara una sería una insignia a medias: el
 * vendedor podía estar esperando respuesta y la pestaña no lo decía.
 *
 * POR QUÉ ES UN MÓDULO Y NO UNA LÍNEA EN CADA PANTALLA
 * El pie lo pintan TRES pantallas (Home, Mensajes y Perfil) y la insignia tiene que decir lo mismo
 * en las tres. Con la consulta copiada en cada una, un día una pantalla contaría lo de un canal y
 * otra el total, y la insignia parpadearía al cambiar de pestaña sin que hubiera pasado nada.
 * `PieDelMercado.tsx` ya había dejado el hueco —la prop `sinLeer`, apagada a propósito hasta que
 * existiera el dato—; esto es el dato.
 *
 * SE VUELVE A PREGUNTAR AL ENTRAR EN FOCO, NO AL MONTAR
 * La pantalla se queda montada en la pila mientras navegas, así que con un `useEffect` la insignia
 * se quedaría con el número del día que abriste el Mercado: leerías los avisos, volverías, y
 * seguiría ahí. Es el mismo patrón —y el mismo fallo ya corregido— que en `ecomerse-perfil.tsx`.
 *
 * SI UNA CONSULTA FALLA, NO SE LLEVA POR DELANTE A LA OTRA
 * `allSettled` y no `all`: son dos rutas distintas y que una se caiga no borra lo que la otra sí
 * sabía. Sólo si fallan LAS DOS se devuelve 0, que en el pie significa «no hay nada sin leer» — la
 * insignia es un adorno de la navegación y no puede dejar sin pintar el pie, pero tampoco se finge
 * un número: no se inventa, se apaga.
 */

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ecomerseApi } from '../../api/ecomerse';
import { useSession } from '../../state/session';

export function useSinLeerMercado(): number {
  const { isAuthenticated } = useSession();
  const [sinLeer, setSinLeer] = useState(0);

  const preguntar = useCallback(async () => {
    if (!isAuthenticated) { setSinLeer(0); return; }
    const [avisos, chats] = await Promise.allSettled([
      ecomerseApi.noticeCounts(),
      ecomerseApi.chats(),
    ]);
    if (avisos.status === 'rejected' && chats.status === 'rejected') { setSinLeer(0); return; }
    const deAvisos = avisos.status === 'fulfilled' ? avisos.value.unread : 0;
    const deTiendas = chats.status === 'fulfilled'
      ? chats.value.chats.reduce((n, c) => n + (c.unread || 0), 0)
      : 0;
    setSinLeer(deAvisos + deTiendas);
  }, [isAuthenticated]);

  useFocusEffect(useCallback(() => { void preguntar(); }, [preguntar]));

  return sinLeer;
}
