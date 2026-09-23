# Ubicación de entrega y punto de encuentro (comida rápida)

> Para el otro agente. Fecha: 2026-09-12. **Ojo: cambian los MD5 de `food.service.ts`**, que está bajo
> guardia. Aplicado y verificado; incluye lo que queda pendiente.

---

## 1. El hueco que se cierra

El repartidor recibía la dirección de entrega **como texto libre** y en la base hay cosas como
`Aeropuerto`. Ese texto llega bien (lo comprobé: `riderMe` lo trae y la pantalla lo pinta), pero **no
sirve para navegar** y, cuando el sitio no es una dirección —un hotel, viviendas sociales, un portal sin
número—, ninguna de las dos partes tiene forma de decir dónde se encuentran.

De ahí las dos piezas, que es lo que pidió el dueño:

1. **El cliente puede dar su ubicación exacta** al pedir a domicilio → el repartidor tiene un botón
   **«Cómo llegar»** que abre el mapa **en el punto**. Si no hay pin, el botón cae a buscar el texto
   (peor, pero mejor que nada).
2. **El repartidor anota el punto de encuentro** al llegar («entrada por la puerta lateral, junto a la
   farmacia»), con su ubicación si tiene GPS. **El cliente lo ve en su pedido** y recibe un SMS, para no
   depender de que esté mirando la app.

---

## 2. Lo que se aplicó

### Base (`wallet.food_orders`, todo opcional y aditivo)

| Columna | Para qué |
|---|---|
| `delivery_lat`, `delivery_lng` | Pin del CLIENTE (navegación real) |
| `meeting_note`, `meeting_lat`, `meeting_lng`, `meeting_at` | Punto de encuentro del REPARTIDOR |

Con una `CHECK` que impide coordenadas absurdas **y medias coordenadas** (`(lat IS NULL) = (lng IS NULL)`).
Los pedidos existentes quedan en NULL: nada se rompe.

### Servidor

- `createOrder`: acepta `deliveryLat`/`deliveryLng` opcionales y los guarda **con el pedido** (congelados,
  como el precio). Se validan en `coordsValidas()`: rango global + **dentro de Guinea Ecuatorial con la
  MISMA caja que la app** (`isInsideGq`: lng 5.0–11.6, lat −1.7–4.2). Si la app y el servidor usaran cajas
  distintas, un punto válido para una lo rechazaría el otro y el cliente vería un error incomprensible.
- `mapOrder` y `mapDelivery` devuelven pin y punto de encuentro. `riderMe` trae las columnas nuevas.
- **Ruta nueva**: `PUT /api/food/orders/:id/delivery/meeting` (`{note, lat?, lng?}`, JWT).
  - Solo el repartidor **asignado**; cualquier otro recibe **404 «No tienes esta entrega asignada»** (no
    se confirma ni que el pedido exista, igual que en `updateDeliveryStatus`).
  - No después de entregar.
  - Deja evento en `food_order_events` (`to_status` es NOT NULL: se repite el estado del pedido, porque
    esto no es un cambio de estado sino una anotación).
  - SMS `food_meeting_point` al cliente.

### App

- `utils/maps.ts` (nuevo): `abrirMapa(lat, lng, direccion)` → `geo:` en Android / `maps:` en iOS, con
  caída al navegador si no hay app de mapas. Está compartido a propósito: la pantalla del cliente
  necesita lo mismo.
- `app/food-rider.tsx`: botón **«Cómo llegar»** por entrega (dice «(dirección escrita)» cuando no hay
  pin, para que se sepa qué se está abriendo) y **«Punto de encuentro»**: campo en línea + «Usar mi
  ubicación» + «Avisar al cliente». En línea y no en diálogo, por lo mismo que el efectivo:
  `Alert.prompt` no existe en Android.
- `app/food-orders.tsx` (cliente): bloque **«🤝 El repartidor te espera aquí»** con la nota y «Ver en el
  mapa» cuando hay coordenadas.
- `app/food-checkout.tsx`: **«Añadir mi ubicación exacta»** (opcional) que manda el pin con el pedido.

---

## 3. Verificación

**Servidor: 19/19 PASS** (`lb45-prueba-ubicacion.cjs`), con las suites en verde (puertas del hotel,
e2e-pedidos 49/49, contrato 21/21, mínimo de reparto 11/11). Comprueba el camino completo —cliente →
base → repartidor → cliente— y no solo la escritura:

- el pin del cliente llega al pedido **y a la lista del repartidor**;
- el repartidor asignado anota el punto de encuentro y **el cliente lo ve** (nota, coordenadas y hora);
- se rechazan: pin en París, latitud sin longitud, latitud 500, nota de 2 caracteres, punto de encuentro
  fuera del país;
- **control negativo**: otro repartidor ACTIVO (el propio cliente de la prueba tiene perfil de
  repartidor) recibe 404 y en la base **no queda nada escrito**.

**Aparato: 10/10 PASS** (`lb45-ver-repartidor.ps1`, con el texto real leído por `uiautomator`):

```
texto=«📍 Entregar en: Hotel Bahía, habitación 214 — preguntar en recepción»
desc=«Cómo llegar a la entrega (con ubicación exacta)»     ← el pin llegó: navega al punto
texto=«¿Dónde os encontráis? (hotel, portal, entrada…)»
desc=«Usar mi ubicación para el punto de encuentro»
desc=«Avisar al cliente del punto de encuentro»
texto=«El cliente lo verá en su pedido y recibirá un SMS: no hace falta que llames.»
```

El pedido de prueba que se usó para esto **se borró** después (no queda ningún pedido de prueba).

---

## 4. Pendiente (dicho claro)

- **No he pulsado «Avisar al cliente» desde la app** en el aparato: la ruta se prueba de punta a punta
  por API (19/19, incluido el SMS y el evento) y el formulario se ve y se abre, pero el toque final no
  está ejercitado en el móvil.
- **`minOrderXaf` (parche del mínimo)**: el aviso se ve en el aparato con la cifra correcta y el servidor
  rechaza por debajo (11/11), pero **no pude confirmar el atributo `disabled` del botón**:
  `uiautomator` no refleja fiablemente el `disabled` de React Native (en el estado bloqueado seguía
  diciendo `enabled=true`). Lo correcto es comprobarlo **por comportamiento**: pulsar «Confirmar pedido»
  por debajo del mínimo y verificar que NO se crea pedido. Está escrito en `lb44-minimo-aparato.ps1`
  (paso 5b) y no llegó a ejecutarse.
- **La coordenada del cliente no se puede elegir en un mapa**: se toma su posición actual. Falta un
  selector con pin arrastrable para «entregar en otro sitio» (pedir para casa de un familiar, por
  ejemplo).

---

## 5. Ficheros y hashes (⚠️ para las guardias)

| Fichero | md5 antes | md5 ahora |
|---|---|---|
| `src/food/food.service.ts` | `7b3960400468586ecefc280ba782438a` | **`cadee18c90e4b457e796cd2674de8f3e`** |
| `src/food/food.dto.ts` | `f308c79ab731201b6b3abec0d82ede22` | **`5d1d86d2b17b6932cff109a6b48c33a5`** |
| `src/food/food.controller.ts` | `4a7c63ed26f8bb8e3b6f0f7a5021d914` | **`e39dc9cd12907fa9a69045fd94c40148`** |

⚠️ **Y antes de eso, el `food.service.ts` ya había cambiado hoy** por el parche del mínimo de reparto
(`CHECKOUT-fees-y-minimo.md`): la base con la que comparaba su guardia (`a4991c4c613b50c11a23828ec662a249`)
está obsoleta. Cadena de hoy: `a4991c4c…` → `7b396040…` (mínimo) → `cadee18c…` (ubicación).
**No desplegar `food.service.ts` desde una copia vieja**: se perderían el mínimo y la ubicación.

Copias previas: `/opt/mirror/backups/{service,dto,controller}.antes-ubicacion-2026-09-12T06-00-39`.

## 6. Herramientas nuevas

```
lb45-ubicacion-entrega.sql.sh   migración: columnas + invariantes
lb45-parche-ubicacion.cjs       parche de los 3 ficheros, con guardias (y modo --previsualizar)
lb45-aplicar-ubicacion.sh       migración → parche → build → reinicio → suites → prueba
lb45-prueba-ubicacion.cjs       la prueba de servidor (19/19)
lb45-preparar-entrega.cjs       deja un reparto asignado (para mirar la pantalla en el móvil)
lb45-ver-repartidor.ps1         lee la pantalla real del repartidor con uiautomator (10/10)
lb45-limpiar-entrega.sh         borra ese pedido de prueba
```
