# Tanda I — Ciudad (同城): el sitio de la nota y el feed por distancia

> Estado: **servidor hecho y verificado (18/18 contra la API real)**. **La app todavía no lo usa**:
> no hay cambios visibles para el usuario todavía, y se dice aquí sin rodeos.
> Fecha: 14/09/2026.

---

## 1. El hallazgo que cambia el orden del trabajo (medido antes de tocar nada)

```sql
SELECT count(*) AS posts_activos,
       count(*) FILTER (WHERE payload ? 'lat' AND payload ? 'lng') AS con_coordenadas,
       count(*) FILTER (WHERE payload ->> 'placeName' IS NOT NULL) AS con_nombre_de_sitio,
       count(*) FILTER (WHERE barrio IS NOT NULL AND barrio <> '') AS con_barrio
  FROM lifebook.posts WHERE state = 'active';
```

| Publicaciones activas | Con coordenadas | Con nombre de sitio | Con barrio |
|---|---|---|---|
| **1.006** | **0** | **0** | 62 |

La especificación de 同城 pide que **toda tarjeta muestre un POI** y una **distancia** («3,2 km»), y
que los chips `附近 / 3km / 全城` filtren por radio. Con **cero** notas con coordenadas, esos chips no
pueden funcionar: el feed saldría vacío… o habría que **inventarse las distancias**, que es lo que no
se hace aquí.

Por eso el orden natural no es «pintar los chips», sino **primero que una nota sepa dónde está**.
Eso es lo que se ha construido y probado.

## 2. Lo que ya funciona en el servidor

### A. Una nota puede llevar SU SITIO (POI)

`POST /lifebook/posts` acepta ahora `placeName`, `placeLat`, `placeLng`, y los guarda en
`posts.payload` como `{ placeName, lat, lng }`.

* Se declaran en el **DTO** (`CreateNoteDto`): el DTO es estricto y sin declararlos el servidor
  responde `400 property placeName should not exist` (pasó, y por eso existe el parche 59).
* **Si las coordenadas no son válidas no se guarda sitio**: mejor sin POI que con uno falso, porque
  un POI falso pondría la nota en un mapa donde no está. «0,0» (el mar) también se descarta.

### B. El feed de Ciudad sabe de distancia

`GET /lifebook/posts/feed?channel=nearby&…` acepta:

| Parámetro | Qué hace |
|---|---|
| `lat`, `lng` | **Mi posición**. Con ella, cada tarjeta devuelve `distanceKm` (redondeado a 100 m) |
| `radiusKm` | **El radio**: `附近` ≈ 1 km, `3km` = 3, o **nada = 全城** (toda la ciudad, sin filtro de distancia) |
| `sort` | `distance` (más cerca primero) · `hot` (más interacción) · por defecto, lo más nuevo |
| `since` | `1h` · `24h` · `7d` · `30d` |

* La distancia se calcula **en SQL** (fórmula del círculo máximo), no en la app: una sola verdad.
* **Con radio, las notas sin coordenadas quedan fuera** (`no se puede prometer una distancia que no
  se sabe`). En 全城 salen todas las de la ciudad, con o sin sitio.
* El `payload` se comprueba con una expresión regular antes de convertir a número: un dato raro no
  puede tumbar el feed.
* Con orden por distancia o por interacción **no se pagina por cursor** (el cursor es por fecha): se
  devuelve la primera página y así no se saltan publicaciones.

### C. La tarjeta trae lo que hace falta para pintarla

`placeName` y `distanceKm` (o `null` si no se pidió con posición). El resto de la tarjeta sigue
igual: portada, título, autor, likes, y el layout waterfall es el mismo del feed global.

## 3. Verificación: `pruebas/lb58a-verificar-poi-y-distancia.cjs` → **18 PASA · 0 FALLA**

```
1. SE PUBLICA UNA NOTA CON SU SITIO       nombre + latitud + longitud guardados
2. SIN SITIO NO SE GUARDA NADA            (mejor sin POI que con uno falso)
3. CON 1 KM SALE                          con sitio y 0,4 km de distancia
4. CON 50 m NO SALE                       el radio se respeta
5. «TODA LA CIUDAD» TAMBIÉN LA ENSEÑA     y sin distancia (no sé dónde estás)
6. la distancia es la REAL                comparada a mano con la fórmula: 0,4 ≈ 0,4
7. ORDEN POR DISTANCIA                    «más cerca primero» de verdad
8. VENTANAS DE TIEMPO                     1 h · 24 h · 30 d
```

## 3-bis. Puntos 1 y 2: publicar con sitio y los chips de distancia (hecho)

### A. Publicar con sitio desde la app

En el compositor de notas hay ahora un botón **«¿Dónde es? (opcional)»** que abre el buscador de
sitios real que ya usaban las rutas y las quedadas (`LocationPickerSheet` → geocoder del mirror +
«mi ubicación»). El sitio elegido se enseña en el botón (con una ✕ para quitarlo) y viaja al
publicar como `placeName/placeLat/placeLng` (módulo propio `api/lifebookProductos.ts`, sin tocar
`api/lifebook.ts`).

**Verificado por API**: una nota publicada con `placeName` + coordenadas se lee después con su sitio
guardado, y aparece en el feed de su ciudad con `placeName`.

### B. Los chips de distancia en la sección Ciudad

Fila nueva encima de los chips de categoría, **solo en Ciudad**: `Cerca` (1 km) · `3 km` ·
`Toda la ciudad`. El chip activo va resaltado; al tocar uno se pide la ubicación (si hace falta) y el
feed se recarga con `radiusKm` y mi posición. Además:

* **Permiso de ubicación**: si no lo hay, se avisa en la fila («📍 Activa la ubicación…») y se sigue
  enseñando toda la ciudad. **Nunca un feed vacío sin explicación**.
* **Sin resultados con filtro**: se dice por qué («No hay notas con un sitio exacto a menos de 3 km»)
  y se ofrece la salida («Ver toda la ciudad ›»).
* **La distancia va en la tarjeta**: se reutiliza `toPostCard` (el mismo de siempre) y solo se
  cambia la línea de ubicación, que pasa a ser «Catedral de Santa Isabel, Malabo · 4,1 km».
* **Regla de la especificación que faltaba**: la distancia se mide desde mi posición **o desde el
  centro de la ciudad si he cambiado de ciudad a mano** (`LB_CITY_CENTERS`). Sin esto, mirar Malabo
  desde otro sitio pondría «11.000 km» en cada tarjeta.

### C. Lo que se vio en el Poco F5 (y lo que se vio en el log)

| Qué | Resultado |
|---|---|
| La fila de chips | «Cerca · 3 km · Toda la ciudad», con sus descripciones |
| El filtro, de verdad | En el log del servidor: `channel=nearby&city=Acurenam&limit=20&lat=25.31&lng=110.40&radiusKm=1` y `…&radiusKm=3` → **el radio viaja y se aplica** |
| Sin resultados | «No hay notas con un sitio exacto a menos de Cerca. Puedes mirar toda la ciudad, o publicar tú una nota con su sitio» + «Ver toda la ciudad ›» |
| **La posición del teléfono** | El GPS devuelve **Guilin (China)**, y la ciudad del perfil es **«Acurenam»**, donde no hay notas: con el radio de 1-3 km no sale nada. Con «Toda la ciudad» tampoco, porque Acurenam no tiene publicaciones (Malabo tiene 774) |

**Dos cosas que quedan pendientes por esto último, y que son las siguientes:**

1. **Ciudad vacía**: cuando la ciudad elegida no tiene nada, decirlo y ofrecer las que sí tienen
   (Malabo), en vez del «Todavía no hay publicaciones cerca de ti» genérico. (Es el mismo patrón que
   se arregló en «Para ti».)
2. **Verificar en el teléfono con la ciudad en Malabo**: el APK con la regla del centro de ciudad se
   compiló, pero **el móvil se desconectó del USB antes de instalarlo**, así que esa parte
   («4,1 km» en la tarjeta desde el centro de Malabo) **no está vista en pantalla**.

## 4. Lo que FALTA (siguiente tanda, en este orden)

1. **Publicar con sitio desde la app**: un bloque «¿Dónde es?» en el compositor usando el buscador
   de sitios que ya existe (`api/geocode.ts` + `components/lifebook/LocationPickerSheet.tsx`) y
   mandarlo al publicar. **Sin esto, el feed por distancia seguirá vacío**: la app no manda ningún
   sitio todavía.
2. **Los chips de distancia** en la sección Ciudad (`附近 · 3km · 全城`) y la posición del usuario
   (permiso de ubicación + mensaje claro si falta, nunca un feed vacío sin explicación).
3. **La distancia y el sitio en la tarjeta** («Cafetería X · 3,2 km»).
4. **El menú de orden** (综合 / 最新 / 最热 / 距离) y el **filtro de tiempo** — el servidor ya los
   acepta, falta el botón.
5. **El botón del mapa** (feed ↔ mapa con marcadores y navegación) y la **etiqueta de live**
   (`附近直播` / `同城推荐`) en las tarjetas.
6. **La fila de categorías** (美食 · 休闲娱乐 · 丽人 · 购物 · 运动健身 · 亲子 · 住宿 · 旅游): hoy la
   sección Ciudad tiene sus propios chips (Recomendado, Comercio, City walk, Comida, Turismo, Bares,
   Fiesta, Cultura) y habría que alinearlos con la lista de la especificación.
7. **La búsqueda dentro de la ciudad** (sugerencias semánticas pre-filtradas por ciudad).

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Servidor | `lifebook.service.ts` (`sitioDe`, `geoDe`, `sinceDe`, `createNote`, `feedChannel`, `feedPage`, `serializeFeed`) |
| Controlador | `lifebook.controller.ts` (`CreateNoteDto` con el sitio; `feed` pasa radio/orden/fecha) |
| Parches | `parche58-poi-y-distancia.py`, `parche59-dto-sitio.py` |
| Respaldos | `lifebook.service.ts.bak-poi-y-distancia-20260214`, `lifebook.controller.ts.bak-dto-sitio-20260214` |
| Prueba | `pruebas/lb58a-verificar-poi-y-distancia.cjs` (18 comprobaciones) |

## 6. Dos cosas aprendidas aquí

1. **El DTO estricto**: cualquier campo nuevo en una petición hay que declararlo en el DTO o el
   servidor responde `400 property X should not exist`. La primera pasada de la prueba falló por eso
   (13 de 18 comprobaciones), no por la lógica de distancia.
2. **Un dato que no existe no se simula**: si el feed de Ciudad tiene que enseñar distancias y no hay
   coordenadas, lo correcto es construir primero el camino por el que las notas **ganan** un sitio.
