# Sistema de navegación — auditoría, arreglo y prueba automática

> Estado: **hecho en código y verificado por la prueba automática**; falta verlo en el teléfono
> (el móvil estaba desconectado del USB al terminar). Fecha: 14/09/2026.
> Lo pidió el dueño así: *«el sistema de navegación está fallando constantemente y dejando enlaces
> rotos […] genera un mapa de rutas global, implementa validaciones para evitar clics en enlaces
> vacíos (null) y configura una ruta de respaldo»*.

## 1. La auditoría (medida, no supuesta)

`pruebas/auditar-rutas.cjs` compara **las rutas que existen** (ficheros de `app/`) con **las que el
código navega** (`pathname:`, `router.push`, `href`, y también `route:`/`ruta:` de las listas de
menús). Números de partida:

| | |
|---|---|
| Rutas reales | **99** |
| Navegaciones en el código | **488**, a 104 destinos distintos |
| **Enlaces rotos** | **1**: `/emergencia` |
| Pantallas que nadie abría | **6** |
| Navegaciones con `as never` (el tipo NO comprueba el destino) | **204** |
| Destinos que podían quedar nulos (botón que no hace nada) | **6** |

El enlace roto con nombre y apellido: `constants/data.ts:44` — la entrada **«Emergencia»** de la
lista de servicios del inicio apuntaba a `/emergencia`, **una pantalla que no existía**. Al
tocarla, expo-router enseñaba «Unmatched Route / Page could not be found», en inglés. Es
exactamente el «enlace roto» que ve el usuario.

> Nota de método: las tres primeras pasadas del analizador dieron **falsos positivos** (contaba
> como rotas las rutas con `?param=…`, luego las que encajan en una ruta dinámica, y luego una
> línea de COMENTARIO que explicaba el arreglo). Se corrigió cada una antes de dar los números:
> un auditor que grita en falso no sirve.

## 2. Lo que se implementó (las tres decisiones del dueño)

### a) Mapa de rutas central — `constants/rutas.ts`

* **101 rutas** con sus **parámetros obligatorios**, **generado** desde los ficheros reales
  (`npm run rutas:mapa`): así el mapa no puede quedarse corto ni tener una ruta mal copiada.
* Ayudante `ir` con cuatro formas:
  * `ir.a.producto(id)` — ruta conocida, comprueba sus parámetros;
  * `ir.libre('/lo-que-sea')` — cuando la ruta viene de una lista o un menú (se valida igual);
  * `ir.destino({pathname, params})` — destinos ya construidos como objeto (los que devuelven
    `destinoMiPerfilLifeBook` y compañía);
  * `ir.inicio()` · `ir.atras()` · `ir.explicar(motivo)`.
* **Nunca navega a ciegas**: si la ruta no está en el mapa, o falta un parámetro obligatorio, o
  llega vacío, **no se navega**: se avisa por consola y se abre `/ruta-fallida` diciendo **qué**
  pasó y **a dónde** se intentaba ir.

### b) Pantalla de respaldo — `app/ruta-fallida.tsx` y `app/+not-found.tsx`

* Explica en español qué ha pasado, muestra el destino que falló y da **dos salidas**: «Ir al
  inicio» (siempre funciona) y «Volver atrás». Nada de redirección silenciosa: si te traen aquí,
  te lo dicen.
* `+not-found.tsx` (lo que expo-router abre con una dirección desconocida) **reutiliza la misma
  pantalla**, así un enlace roto y una navegación imposible se explican igual.

### c) Emergencia — `app/emergencia.tsx` (pantalla creada)

* Había **teléfonos reales** en la app (`constants/data.ts` → `EMERGENCY_CONTACTS`): **Policía
  Nacional 114** y **Hospital / Ambulancia 116**. La pantalla los usa (no se inventan números) y
  son los mismos que ya ve el conductor en su marcación 24/7: tener dos listas distintas de
  números de emergencia sería peligroso.
* Números en grande, un toque para llamar, aviso de que funcionan sin datos, y dos salidas.
  La pantalla es sobria a propósito: en una emergencia nadie lee párrafos.

### d) Los 6 destinos que podían quedar mudos

Pasados por el ayudante (zona a zona, como se decidió): `lifebook-merchant.tsx`,
`lifebook-messages.tsx`, `lifebook-post/[id].tsx`, `TarjetaAnuncio.tsx`, `ServicesDrawer.tsx`,
`StatusDetailModal.tsx`. Antes, si el destino no se podía resolver, **la pulsación no hacía nada**
y el usuario lo veía como un botón roto.

## 3. La prueba automática (para que no vuelva a pasar)

`pruebas/auditar-rutas.cjs` ya **no es un informe: es una prueba** (`npm run rutas`). Comprueba y
**falla con código de error** si:

* alguna ruta real **no está en el mapa** (o el mapa tiene rutas que ya no existen);
* **alguna navegación apunta a una pantalla que no existe**;
* **falta la pantalla de respaldo** o el `+not-found`;
* hay destinos que pueden quedar nulos sin avisar.

Y como progreso (no como fallo) informa de cuántas navegaciones ya pasan por el ayudante:
**9 de 488** hoy. El resto siguen yendo directas y se migran por zonas.

Resultado actual:

```
· Mapa de rutas: completo y al día
· Pantalla de respaldo /ruta-fallida: existe
· +not-found.tsx: existe
· Enlaces rotos: ninguno
· Destinos que pueden quedar nulos sin avisar: 0
✓ NAVEGACIÓN: todo en orden
```

Comandos:

```
npm run rutas        # auditoría + prueba (falla si hay enlaces rotos)
npm run rutas:mapa   # regenera el mapa desde las rutas reales
```

## 4. Verificado en el teléfono (14/09/2026, Poco F5)

| Qué | Lo que se leyó en pantalla |
|---|---|
| `/emergencia` (enlace directo) | «Emergencia» + aviso «Toca un número para llamar… funcionan aunque no tengas datos» + **Policía Nacional · 114 · [Llamar]** y **Hospital / Ambulancia · 116 · [Llamar]** |
| Botón «Emergencia» del inicio | Abre los números reales (114 / 116) |
| Ruta inventada (`egrouteplan://lo-que-sea`) | **«No pudimos abrir esa pantalla»** + «El enlace que has tocado no lleva a ninguna parte de la app» + **«Ir al inicio»** y **«Volver atrás»** (antes: «Unmatched Route / Page could not be found», en inglés) |

### Una corrección a lo que dije al principio

Dije que el botón «Emergencia» del inicio estaba roto. **No era exacto**: `ServiceGrid` tiene un
caso especial (`if (item.tone === 'emergency') onEmergencyPress()`) que abre el **modal** de
emergencia, y ese modal siempre funcionó. La ruta `/emergencia` **sí estaba rota**, pero se
alcanzaba por los otros dos caminos del grid (los servicios con sub-opciones y el guardado de
rol) y por **cualquier enlace o enlace profundo**. Los tres caminos pasan ya por el ayudante.

### Un fallo MÍO que costó una compilación

Al añadir los comandos `npm run rutas` al `package.json` con PowerShell, el fichero quedó con
**BOM** y la compilación de Android empezó a fallar sin decir por qué (el paso de empaquetado lee
`package.json`). Detectado y corregido (BOM fuera, JSON válido). Se apunta aquí porque el síntoma
—«compila y de repente no»— no señala al culpable.

## 6. Zona migrada: INICIO + LIFE BOOK (14/09/2026)

Primera zona de la migración por zonas que decidió el dueño. Se hizo **mecánicamente** con
`pruebas/migrar-navegacion-zona.cjs` (una transformación, recuento por fichero y copia de
seguridad antes de aplicar), porque reescribir 60 llamadas a mano es donde se cuelan los errores:

| Fichero | Navegaciones migradas |
|---|---|
| `app/index.tsx` | 3 |
| `app/profile.tsx` | 6 |
| `app/lifebook.tsx` | 3 |
| `app/lifebook-user.tsx` | 9 |
| `app/lifebook-messages.tsx` | 12 |
| `app/lifebook-search.tsx` | 1 |
| `app/lifebook-videos.tsx` | 3 |
| `app/lifebook-chat/[id].tsx` | 6 |
| `app/lifebook-post/[id].tsx` | 7 |
| `app/lifebook-groups.tsx` | 1 |
| `app/lifebook-catalog.tsx` | 2 |
| `app/lifebook-carrito.tsx` | 2 |
| `core/useAppDock.ts` | 5 |
| **Total** | **60** |

Antes de esta zona pasaban por el ayudante **10** navegaciones; ahora **70 de 430**. La auditoría
sigue en verde (`npm run rutas`) y el compilador limpio.

**Qué transforma el script** (y qué no): las llamadas de UNA línea
(`router.push({pathname, params} as never)` → `irSeguro.libre(ruta, params)`, y las de ruta suelta),
incluidas las que llevan **variable** como destino (`router.push(ruta as never)` →
`irSeguro.libre(String(ruta ?? ''))`, que es el caso que dejaba botones mudos). **No** toca las
llamadas repartidas en varias líneas: esas van a mano en la siguiente pasada.

**Un tropiezo del propio script** (anotado para no repetirlo): en `app/lifebook-videos.tsx` el
import se insertó **dentro del comentario de cabecera**, porque ese fichero tiene 90 líneas de
comentario antes del primer `import` y la búsqueda del punto de inserción miraba solo las primeras
70 líneas. Lo cazó el compilador (`Cannot find name 'irSeguro'`) y se arregló a mano. El script ya
recorre todo el bloque de cabecera.

**Verificado en el teléfono** tras migrar: en **Mensajes**, tocar una conversación abre el chat
correctamente (esa navegación pasa ya por el ayudante).

## 6.bis Zona migrada: TIENDA Y COMERCIO (14/09/2026)

Segunda zona. Es la de **rutas más dinámicas** (`/lifebook-product/[id]`, `/lifebook-shop/[id]`),
donde un id vacío deja un botón mudo o una pantalla en blanco — y el panel del comerciante es el
fichero que más navega de toda la app.

| Fichero | Migradas |
|---|---|
| `app/lifebook-merchant-gestion.tsx` | 8 |
| `app/lifebook-product/[id].tsx` | 5 |
| `app/lifebook-orders.tsx` | 5 |
| `app/lifebook-merchant-products.tsx` | 4 |
| `app/lifebook-shop/[id].tsx` | 3 |
| `app/lifebook-sell.tsx` | 3 |
| `app/lifebook-store.tsx` · `app/lifebook-merchant-settings.tsx` | 2 + 2 |
| `app/lifebook-merchant.tsx` · `app/lifebook-checkout.tsx` | 1 + 1 |
| **Total** | **34** |

Tras las dos zonas: **104 navegaciones de 398 pasan por el ayudante** (al empezar, 10). Auditoría y
compilador en verde.

**Verificado en el teléfono**: el catálogo («Tiendas y servicios») abre y pinta la rejilla con
precios después de migrar.

**NO verificado**: **tocar una tarjeta de producto para que abra su ficha**. Lo intenté dos veces y
el toque no llegó a registrarse (la segunda vez el nodo de la tarjeta ya no estaba en el volcado
que usé para las coordenadas). Es justo la ruta dinámica que más me interesaba comprobar, así que
queda pendiente: `egrouteplan://lifebook-catalog` → tocar una tarjeta → debe abrir la ficha (no el
respaldo).

**Arreglo del script**: la inserción del import buscaba el final del bloque de imports solo en las
primeras 70 líneas, y en un fichero con un comentario de cabecera largo metía el import **dentro
del comentario** (lo cazó el compilador en la zona anterior). Ahora recorre el fichero hasta la
primera declaración de verdad.

## 7. Lo que NO queda hecho (dicho claro)

1. **Los 204 `as never` siguen ahí** (ahora 9 navegaciones pasan por el ayudante). Se decidió
   migrar **por zonas**: la siguiente sería la zona de inicio + Life Book (feed, perfil, mensajes),
   que es donde más toca el usuario.
2. **Las 6 pantallas que nadie abre** siguen existiendo: `/lifebook-inbox-likes`,
   `/lifebook-inbox-followers`, `/lifebook-inbox-comments` (sustituidas por
   `/lifebook-inbox?tab=…`), `/lifebook-merchant-gestion`, `/promo/[id]`, `/settings`. O se les da
   entrada o se borran, pero eso es una decisión aparte.
3. **No verificado en el teléfono**: el móvil estaba sin USB al terminar, así que las tres
   pantallas nuevas (`/emergencia`, `/ruta-fallida`, `+not-found`) están compiladas, con tipos
   correctos y con la auditoría en verde, **pero no las he visto funcionando en el aparato**.
   Para comprobarlo cuando vuelva a estar enchufado:
   ```
   adb install -r android\app\build\outputs\apk\release\app-release.apk
   adb shell am start -a android.intent.action.VIEW -d "egrouteplan://emergencia"
   adb shell am start -a android.intent.action.VIEW -d "egrouteplan://lo-que-sea"   # debe salir el respaldo
   ```

## 8. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Mapa de rutas + ayudante | `D:\egapp\constants\rutas.ts` (generado) |
| Generador del mapa | `D:\egapp\pruebas\generar-mapa-rutas.cjs` (`npm run rutas:mapa`) |
| Auditoría / prueba | `D:\egapp\pruebas\auditar-rutas.cjs` (`npm run rutas`) |
| Pantalla de respaldo | `D:\egapp\app\ruta-fallida.tsx` |
| Dirección desconocida | `D:\egapp\app\+not-found.tsx` |
| Emergencia | `D:\egapp\app\emergencia.tsx` (+ teléfonos en `constants\data.ts`) |
| Los 6 sitios migrados | `lifebook-merchant.tsx`, `lifebook-messages.tsx`, `lifebook-post/[id].tsx`, `components/lifebook/TarjetaAnuncio.tsx`, `components/ServicesDrawer.tsx`, `components/status/StatusDetailModal.tsx` |
