# «Para ti» devolvía 0 publicaciones (y por eso el feed de vídeos salía en blanco)

> Estado: **arreglado, desplegado y medido**. Fecha: 14/09/2026.

---

## 1. El síntoma que lo destapó

En la tanda C quedó escrito que el **sticker del producto sobre el vídeo** estaba hecho pero **no se
había podido ver nunca** porque el feed de vídeos aparecía vacío («Todavía no hay vídeos aquí»), y se
apuntaron dos pistas: (a) el vídeo de prueba apunta a un archivo que no existe, y (b) «`for_you`
vacío para esta cuenta es raro y merece mirarse aparte».

**La pista buena era la (b), y no era «raro»: era un fallo.**

## 2. Qué pasaba

```ts
/** Feed "Para ti" (ciudad del perfil + nacional, simples). */
async feedForYou(userId, opts) {
  const u = await this.db.$queryRaw`SELECT city FROM mobility.users WHERE id=${userId}::uuid`;
  const city = u[0]?.city ?? 'Malabo';
  return this.feedCity(city, { ...opts, viewerId: userId });   // ← p.city = $1
}
```

El comentario prometía «ciudad del perfil **+ nacional**», pero el código solo filtraba por la ciudad
del perfil. La cuenta del teléfono tiene ciudad **«Acurenam»**, donde no hay ni una publicación:

| Ciudad | Publicaciones públicas activas |
|---|---|
| Malabo | **774** |
| Bata | 161 |
| Luba | 2 |
| Acurenam | **0** |

Resultado: `GET /lifebook/posts/feed?channel=for_you` → **0 publicaciones**, y como el feed de vídeos
(`/lifebook-videos`) abre en `for_you` cuando no le pasan canal, la pantalla salía en blanco aunque
hubiera **29 vídeos públicos**. El sticker no era el problema: **el feed sí**.

## 3. El arreglo

`parche44-para-ti-nacional.py` (servidor, `lifebook.service.ts`): si mi ciudad **no tiene nada
público**, «Para ti» sigue con lo **nacional** (todas las ciudades). La decisión se toma **una vez, al
empezar a paginar**, para que el cursor por fecha siga siendo válido: no se cambia de feed a mitad de
página, que eso sí se saltaría publicaciones.

```ts
const hay = await this.db.$queryRawUnsafe(`SELECT 1 FROM lifebook.posts p WHERE ${cond} LIMIT 1`, ...args);
if (hay[0]) return this.feedCity(city, { ...opts, viewerId: userId });
return this.feedNational({ ...opts, viewerId: userId });
```

## 4. Medido antes y después (misma cuenta, misma consulta)

| Consulta | Antes | Después |
|---|---|---|
| `channel=for_you&limit=10` | **0 publicaciones** | **10 publicaciones** |
| `channel=for_you&type=video` | 0 vídeos | **10 vídeos** (el primero, el vídeo con producto dentro) |
| `channel=nearby&city=Malabo` | 10 | 10 (no cambia: ahí la ciudad sí manda) |

Y en el teléfono: el feed de vídeos abre con el vídeo, su **sticker de producto** («5.000 XAF · +1»)
por encima del nombre del autor y el botón «Comprar» dentro.

## 5. Lo que NO queda hecho (dicho claro)

1. **No se mezclan ciudad y nacional dentro de la misma página**: si tu ciudad tiene 2 publicaciones,
   «Para ti» te enseña esas 2 y nada más. Mezclarlas bien exige un cursor compuesto
   (ciudad-fecha) y eso es otro cambio; se prefiere no romper la paginación por fecha.
2. **No se toca la recomendación**: «Para ti» sigue siendo «lo más reciente de tu zona (o del país)».
   No hay ni intereses ni señales de consumo.
3. Los canales con ciudad (`nearby`, `bars`, `sales`…) siguen vacíos para quien viva en una ciudad sin
   contenido: eso es correcto (son canales **de esa ciudad**), pero conviene saberlo al mirar la app
   con una cuenta de Acurenam.

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Servidor | `/opt/mirror/app/src/lifebook/lifebook.service.ts` (`feedForYou`, `feedNational`) |
| Parche | `D:\egapp\pruebas\parche44-para-ti-nacional.py` |
| Respaldo | `lifebook.service.ts.bak-para-ti-nacional-20260214` |
