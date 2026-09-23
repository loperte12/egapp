/**
 * `/ecomerse-seller` — PUERTA ANTIGUA de la tienda del comerciante. Redirige a la zona.
 *
 * POR QUÉ SIGUE EXISTIENDO
 * Era la pantalla entera de «Mi tienda»: 1.110 líneas en una sola vista (requisitos + datos del
 * negocio + formulario de seis secciones + mis productos + plan). El 20-sep-2026 se partió en la
 * zona `/tienda`, que es un modo con barra propia, y su contenido se repartió: el formulario en
 * `publicar`, los anuncios en `anuncios`, las ventas en `pedidos` y el negocio en `perfil`.
 *
 * En vez de borrar la ruta —que está escrita en cuatro sitios de la app y en el historial de
 * navegación de los móviles ya instalados—, se deja como **redirección**: quien llegue por un enlace
 * viejo aterriza en la zona, no en un «Unmatched Route» en inglés (el fallo que ya encontramos una
 * vez con `/emergencia`: `components/ServiceGrid.tsx:45-53`).
 */

import React from 'react';
import { Redirect } from 'expo-router';

export default function EcomerseSellerRedirect() {
  return <Redirect href={'/tienda' as never} />;
}
