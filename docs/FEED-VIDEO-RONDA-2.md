# Feed de vídeo inmersivo — segunda ronda en el aparato

**Parte 51-b · 13 de septiembre de 2026**

> Lo pedido, tras probar el build: *«los botones del centro deben desaparecer (sólo play)»,
> *«demasiado zoom, no se alcanza a ver el vídeo»*, *«la entrada al feed, junto al botón de
> subir contenido y con un ▶»*, *«al pausar se ve la portada»*, *«que no se haga zoom con los
> dedos»*, *«doble clic = like, más compartir y guardar»*, *«la barra 相关搜索内容»*,
> *«el grupo del que subió el vídeo»*, *«全屏观看»*.
>
> **Siete de los nueve puntos ya estaban hechos y verificados en el build que se probó.** Lo que
> se estaba viendo era el APK **anterior** (11:01), que no llevaba los cambios de la ronda del
> otro agente (11:12 y 11:19). Este documento dice qué se comprobó, cómo, y qué se hizo de
> verdad en esta ronda.

---

## 1. Lo que se comprobó en el aparato, no lo que se supone

Se instaló el APK del 11:46:05 (con todo) y se volcó la jerarquía de vistas real con
`uiautomator dump` sobre el Poco F5. Esto es lo que hay **de verdad** en el feed inmersivo:

| Punto | Estado real medido |
|---|---|
| Botones en el centro (±5 s, ±15 s, atrás/adelante) | **No hay ninguno.** `nativeControls={false}` en las dos pantallas de vídeo; lo único que puede salir en el centro es el ▶ de pausa |
| Doble toque = me gusta | **Sí** (`Gesture.Tap().numberOfTaps(2)`) |
| Compartir | **Sí** — se abrió la hoja del sistema con el texto correcto. Confirmado por accidente al probar un gesto |
| Guardar | **Sí** (`Bookmark`, con `toggleSave` que ya existía) |
| 全屏观看 | **Sí** (icono `Maximize`, abre `/lifebook-player`) |
| Portada al pausar | **Arreglado**, y comprobado: ver §2 |
| Zoom excesivo | **Resuelto** con `contentFit="contain"` (antes `cover` recortaba) |

**Los ±5 s / ±15 s son los saltos por defecto de ExoPlayer** (`seekBackIncrementMs = 5000`,
`seekForwardIncrementMs = 15000`). Verlos era la firma inconfundible de los controles NATIVOS,
o sea del build viejo. No es que hubiera que quitarlos otra vez: es que ya no estaban.

### 2. El bug de la portada al pausar, comprobado como se puede comprobar

No se puede ver una captura desde aquí, así que se midió de otra forma: se volcó la jerarquía
de vistas **reproduciendo** y **en pausa**, y se comparó.

```
=== REPRODUCIENDO vs PAUSADO ===
=> android.view.ViewGroup   x19     (pausado tiene UNO más)
=> android.widget.TextView  x10     (pausado tiene UNO más)
```

Exactamente **una** vista nueva: el contenedor del ▶ de pausa y su texto. **Ninguna vista de
imagen.** Si la portada volviera, aparecería una vista de imagen más; no aparece.

La razón está en el código y es estructural, no cosmética: la portada se pinta con
`{src && cover && !firstFrame ? <Image …/> : null}`. Después del primer fotograma real,
`firstFrame` es `true` y **la portada deja de existir en el árbol de vistas**. Pausar no puede
traerla de vuelta porque ya no hay nada que traer. (El fallo original era
`opacity: isActive && !paused ? 0 : 1`, que la ataba justo al estado de pausa.)

---

## 3. Lo que sí faltaba, y se hizo

### 3.1 La entrada al feed, junto al botón de publicar y con un ▶

**Antes:** un icono de vídeo en la **barra superior**, entre la ciudad y el buscador.
**Ahora:** fuera de la barra, y un botón **▶ encima del de publicar**, abajo a la derecha.

- `app/lifebook.tsx`: los dos FAB van en una **columna** (`styles.fabCol`) anclada una sola vez,
  no cada uno con su `bottom` calculado a mano. Así el ▶ queda siempre «justo encima» y no se
  descuadran si el dock cambia de alto.
- El ▶ usa `colors.textPrimary` (oscuro) y no `colors.primary`: el de publicar es **la** acción
  de la pantalla y dos botones del mismo color competirían por la mirada.
- La barra superior queda para lo que es navegación (ciudad, buscar, mensajes).

Verificado en el aparato: `Vídeos en pantalla completa` en **954,1876** y
`Publicar contenido` en **954,2062** — apilados, y el icono de la barra superior ya no existe.

### 3.2 La fila 相关搜索 salía **nunca**, y eso no es un detalle

Estaba implementada, pero con `{topics.length > 0 ? … : null}`. Y resulta que **casi ningún
vídeo publicado lleva temas** (`topics`/`tags` vacíos): en la práctica la fila no se pintaba
jamás, así que desde fuera parecía que la función no existía. Una función que no se ve es una
función que no está.

**Ahora sale siempre.** Si no hay temas, se cae a lo que el post **sí** trae: ciudad, autor y
las primeras palabras del título. Como el título es obligatorio al publicar vídeo, el último
recurso nunca falta.

Verificado en el aparato, sobre un vídeo sin temas:

```
相关搜索
[Malabo]  [Usuario EG Route Plan]  [Oko]
```

### 3.3 El zoom con los dedos: quitado entero

Se eliminaron los seis `useSharedValue`, el estado `zoomed`, los dos reconocedores
(`Gesture.Pinch` y `Gesture.Pan`), el `useAnimatedStyle` que los aplicaba, el tope `MAX_SCALE`
y la prop `width` que solo servía para calcular los límites del arrastre.

**Efecto secundario bueno:** al no haber `transform` sobre el vídeo, desaparece
`surfaceType="textureView"`, que existía **solo** para que la pinza se viera. Se vuelve al
`surfaceView` por defecto, que gasta menos batería (lo dice la doc de `expo-video`).

Lo que **no** se tocó: doble toque sigue siendo ME GUSTA y el toque simple sigue pausando y
reanudando. El zoom era el único gesto que sobraba.

> **Cómo se pidió y cómo se entendió — CONFIRMADO por el dueño.** «Los vídeos deberían dejar de
> que el usuario haga zoom con sus dedos» se entendió como *quitar el zoom*, y así se confirmó
> después: **el vídeo se ve siempre a tamaño natural y no se puede ampliar con los dedos.**
> Encaja con la queja de «demasiado zoom, no se alcanza a ver bien»: en un vídeo a pantalla
> completa ampliar solo sirve para dejar de verlo.

El vídeo se ve **siempre a tamaño natural** (`contain`): entero, con bandas negras si hace
falta, que es mejor que recortado. Para verlo más grande está **全屏观看**.

---

## 4. Lo que NO se hizo, y por qué

### 4.1 El grupo del que subió el vídeo — **hace falta backend y una decisión**

No se puede pintar, y no por falta de ganas:

- Una publicación **no pertenece a ningún grupo**. `lifebook.posts` no tiene `group_id`; los
  grupos son conversaciones (`lifebook.conversations` con `kind='group'`) y su tabla de
  miembros (`lifebook.group_members`). O sea: «el grupo del autor» sería *un grupo en el que el
  autor está*, no *el grupo donde se publicó*.
- `LbAuthor` (`api/lifebook.ts:15-25`) trae id, nombre, avatar, rol y seguidoPorMí. **No trae
  grupo**, y no hay ningún endpoint de «grupos de un usuario».

Para hacerlo bien hay que decidir tres cosas que no son técnicas:

1. **Cuál**, si el autor está en varios: ¿el que administra? ¿el más grande? ¿el más activo?
2. **Privacidad**: si el grupo no es público, enseñar su nombre desde un vídeo es filtrar
   información de un tercero. ¿Se enseña solo si es público o unirse es posible?
3. **Qué pasa al tocarlo**: abrirlo lleva al chat, y las pantallas de mensajes estaban
   excluidas de este trabajo a propósito.

Es una función de verdad, no un retoque: endpoint nuevo + criterio de «cuál» + privacidad. Por
eso queda pendiente de decisión en vez de inventarse un campo que el servidor no manda.

**Decisión tomada (13-sep-2026): queda PENDIENTE a propósito.** Primero hay que decidir *cuál es
«su grupo»* (el que administra / el más grande / uno marcado como público), y solo después se
construye. No se empieza por el endpoint.

---

## 5. Cambios, para poder volver atrás

| Fichero | Qué |
|---|---|
| `app/lifebook.tsx` | Fuera el icono de vídeo de la barra superior; `styles.fabCol` nuevo, `styles.fab` sin anclaje propio; import de `Play` |
| `app/lifebook-videos.tsx` | Fuera el zoom entero ([P5]); `composed = taps`; fuera `surfaceType="textureView"`; fuera la prop `width`; `relTerms` para que 相关搜索 salga siempre; cabecera actualizada |

`npx tsc --noEmit` limpio. APK 110,6 MB compilado e instalado a las **11:46:05**.

### Verificación en el aparato (Poco F5, APK 11:46:05)

- Barra superior sin icono de vídeo; `Vídeos en pantalla completa` en 954,1876 sobre
  `Publicar contenido` en 954,2062.
- Feed inmersivo con `Me gusta · Comentarios · Guardar · Compartir · 全屏观看` y **cero** botones
  de salto.
- Fila `相关搜索` visible con chips, en un vídeo **sin** temas.
- Pausa: la jerarquía crece exactamente en el indicador ▶ (1 `ViewGroup` + 1 `TextView`) y en
  ninguna vista de imagen.
