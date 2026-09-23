# «Búsquedas relacionadas»: cómo lo hacen otras plataformas

**Parte 51-c · 13 de septiembre de 2026**

> Lo pedido: *«además de 相关搜索, investiga cómo otras plataformas lo hacen»*, y de paso
> *«相关搜索 no en chino, en español»*.
>
> La etiqueta ya está en español (**«Búsquedas relacionadas»**). Este documento es la
> investigación: de dónde salen de verdad esos términos en las plataformas grandes, en qué se
> diferencia lo que tenemos, y qué haría falta para que lo nuestro sea «relacionado» y no
> «repetido».

---

## 1. El nombre ya no es el problema, pero conviene saber de dónde venía

Lo que estaba en pantalla era `相关搜索`, copiado tal cual del diseño de referencia de 小红书
(Xiaohongshu). En chino significa literalmente «búsquedas relacionadas», así que la traducción
es directa. Se cambió a **«Búsquedas relacionadas»**.

La misma revisión encontró **más chino visible del reportado**, en una pantalla distinta:

| Fichero | Qué estaba en chino | Ahora |
|---|---|---|
| `app/lifebook-videos.tsx` | `相关搜索` (etiqueta visible) | «Búsquedas relacionadas» |
| `app/lifebook-videos.tsx` | `全屏观看` (etiqueta de accesibilidad) | «Ver a pantalla completa» |
| `app/ecomerse-favorites.tsx` | pestañas `全部 · 上新 · 分类 · 买过 · 特别关注` | Todo · Novedades · Categorías · Comprados · Especiales |
| `app/ecomerse-favorites.tsx` | `Alert.alert('特别关注', …)` y «aparecerán en 买过» | «Especiales» · «aparecerán en Comprados» |

Regla que se deja escrita en la cabecera de `lifebook-videos.tsx`: **los nombres de las
plataformas de referencia (小红书, 美团外卖, DiDi, BOSS直聘) se quedan en los COMENTARIOS**,
porque explican de dónde sale cada decisión; lo que **no** se queda en chino es nada que el
usuario pueda leer — y `accessibilityLabel` cuenta, porque un lector de pantalla lo lee en voz
alta a alguien que no sabe leer esos caracteres.

---

## 2. De dónde salen los términos en las plataformas grandes: de la GENTE, no del contenido

Este es el hallazgo que cambia la conclusión.

La sugerencia de consultas (query suggestion / related searches) es una disciplina clásica de
recuperación de información, y su señal **no es el texto de la publicación**: es el
comportamiento agregado de los usuarios.

Los tres mecanismos que se usan de verdad:

1. **Reformulación de consultas dentro de una sesión.** El usuario busca A, no le vale, busca
   B. Ese par (A → B) es la sugerencia más valiosa que existe: es lo que alguien QUISO decir.
   Con millones de sesiones se construye un grafo de reformulaciones. Es el enfoque que
   describe la literatura de *query suggestion* para consultas sin clics
   ([Query Suggestion for Click-Absent Queries in Enterprise Search](https://ar5iv.labs.arxiv.org/html/2112.14279)).
2. **Co-clic / co-visita: grafo bipartito consulta↔documento.** Si los que ven este vídeo
   luego buscan «X», «X» es relacionado *aunque el vídeo no mencione X*. Se resuelve con
   aprendizaje sobre grafos en producción, por ejemplo en el buscador de Spotify
   ([Graph Learning for Exploratory Query Suggestions](https://www.research.atspotify.com/publications/graph-learning-for-exploratory-query-suggestions-in-an-instant-search-system)).
   Google/YouTube es explícitamente lo que ofrece como «búsquedas relacionadas» y «people also
   search for».
3. **El contenido, pero como RED DE SEGURIDAD.** Etiquetas, temas y categorías de la
   publicación sirven para arrancar cuando todavía no hay comportamiento. Es lo que
   documenta la propia literatura de SEO de 小红书 (RSO): las etiquetas y los temas de la nota
   son la puerta de entrada a la búsqueda, pero lo que ordena los resultados es la interacción
   ([小红书搜索优化 (RSO): pasos clave](https://zhuanlan.zhihu.com/p/1992998993920278705)).

Sobre lo específico de vídeo corto: TikTok publica investigación sobre sus recomendaciones de
búsqueda y su gobernanza, y ahí se ve el patrón de la industria — la caja de búsqueda dentro
del vídeo y las sugerencias se alimentan de la consulta y la interacción, no del pie de
publicación ([TikTok Search Recommendations: Governance and Research Challenges](https://ar5iv.labs.arxiv.org/html/2505.08385)).

### 2.1 Dónde va cada cosa en pantalla (lo que se copia del diseño)

| Plataforma | Dónde aparece | Qué suele alimentarlo |
|---|---|---|
| 小红书 (Xiaohongshu) | Fila de chips al final de la nota, bajo el contenido | Reformulación + co-clic; las etiquetas de la nota son la entrada |
| TikTok / Douyin | Caja de búsqueda ARRIBA del vídeo en el feed inmersivo, y otra en la zona de comentarios | Consulta + interacción de la sesión |
| YouTube | «Búsquedas relacionadas» en resultados y «people also search for» | Co-clic masivo |
| Instagram | Búsquedas relacionadas en Explorar/buscador | Co-visita |

Lo nuestro está en el sitio correcto (al final, bajo el contenido, como 小红书). El problema
nunca fue el sitio.

---

## 3. Lo que hacemos nosotros, dicho con precisión

`relTerms` en `app/lifebook-videos.tsx` construye los chips así:

1. los **temas** de la publicación (`topics`/`tags`);
2. si no hay temas: **ciudad**, **autor** y las **primeras palabras del título**.

O sea: es el mecanismo **3** (el contenido), sin el 1 ni el 2. Y hay un dato medido que lo
deja claro:

```
videos con temas: 0/3      ← consultado al servidor el 13-sep-2026
```

**Ningún vídeo publicado tiene temas.** Por eso la fila no se pintaba nunca (el `if` que se
arregló antes) y por eso, ahora que sí se pinta, los chips son la ciudad, el autor y el título
— que son términos **de esta publicación**, no «relacionados».

Dicho sin adornos: **lo que hay hoy es un buscador de lo que ya estás viendo.** Es honesto y
es útil (tocar «Malabo» te lleva a más vídeos de Malabo), pero no es lo que hace 小红书.

---

## 4. Qué haría falta para que sea de verdad «relacionado»

Por orden de coste, y sabiendo que la escala real es **11 usuarios y 999 publicaciones**:

### Paso 1 — Que existan los temas (barato, y es el bloqueo real)

Hoy la pantalla de publicar vídeo (`app/lifebook-media.tsx`) **no pide temas**, así que un
vídeo no puede tenerlos ni queriendo. Las notas sí los piden (`LB_NOTE_TOPICS_MAX = 5`). Sin
esto, cualquier sistema de búsquedas relacionadas se queda sin su única señal barata.

Es un campo en el formulario y una línea en el `createVideo`. **Es el siguiente paso lógico.**

### Paso 2 — Relacionado por contenido, entre publicaciones (medio)

Con temas ya existiendo, «relacionado» puede calcularse **sin datos de comportamiento**:
términos que aparecen en OTRAS publicaciones del mismo canal/ciudad más a menudo de lo que
aparecerían por azar (co-ocurrencia de etiquetas). Sigue siendo el mecanismo 3, pero mirando
el corpus en vez de una sola publicación: ya no repite lo que estás viendo.

En nuestro caso se puede hacer **en el cliente**, con los 40 vídeos que el feed ya tiene
cargados, sin endpoint nuevo. O en el servidor, si se quiere cachear.

### Paso 3 — Relacionado por comportamiento (caro, y hoy imposible)

El mecanismo de verdad (1 y 2) necesita **registrar las búsquedas y los clics** y tener volumen
para que las co-ocurrencias signifiquen algo. Con 11 usuarios no hay señal: dos personas
buscando lo mismo no es una tendencia, es una casualidad. Y hay que decidir antes si se
registran consultas, que es dato personal.

**Conclusión: con esta escala, el techo honesto es el paso 2.** Copiar el mecanismo 1 sin
tráfico daría sugerencias peores que las actuales, con más código.

### Lo que NO hay que hacer

- **No inventar términos «populares»** que nadie ha buscado. Un chip que promete resultados y
  lleva a una búsqueda vacía es peor que no ponerlo.
- **No poner la fila si no hay ni un término**: ya está cubierto — el título es obligatorio al
  publicar vídeo, así que siempre hay al menos uno.
