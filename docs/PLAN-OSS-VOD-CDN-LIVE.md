# Plan: OSS + VOD + CDN + ApsaraVideo Live para Life Book

**Parte 51 · 13 de septiembre de 2026**

> Lo pedido: *«plan OSS + VOD + CDN + ApsaraVideo Live»*.
>
> Este documento no propone reescribir nada. Propone **mover el vídeo fuera de la máquina
> del API** apoyándose en un corte que ya existe en el código: la app **ya** sube el vídeo
> directo al almacén con URL firmada (Parte 50). Cambiar el proveedor de esa firma es el
> trabajo; la app no se entera.

---

## 1. Lo que hay hoy, medido (no supuesto)

| Cosa | Valor | Cómo se sabe |
|---|---|---|
| Máquina del API | 2 vCPU, MinIO **en la misma máquina** | `/opt/mirror/app`, pm2 `malabogo-api` |
| Subida del servidor a sí mismo | **0,65 MB/s** (~5 Mbit/s) | dos medidas independientes (215 MB y 88,6 MB) |
| Subida desde el móvil | **0,21 MB/s** | medida en el Poco F5, 13-sep-2026 |
| Subida declarada por la red del móvil | **≥ 4573 Kbps (0,57 MB/s)**, 5G | `dumpsys connectivity`, red `ccmni3` (NR) |
| Escala real | 11 usuarios · 999 posts · **331 MB** almacenados · 29 GB libres | servidor |

**El techo de ~5 Mbit/s es de la máquina del servidor y es COMPARTIDO por todos.** No es la
conexión del usuario. Eso significa que hoy *cada byte de vídeo que entra o sale* pasa por el
mismo caño de 5 Mbit/s, y encima esa máquina gasta CPU en `ffprobe` y en sacar el póster.

### 1.1 Dos matices del móvil que cambian la interpretación del 0,21 MB/s

Medidos en el dispositivo, no deducidos:

1. **Todo el tráfico del móvil hacia la API pasa por una VPN.** `ip route get 8.218.88.237`
   devuelve `dev tun0`. Hay dos clientes instalados (`com.follow.clash`, `ch.protonvpn`).
   El 0,21 MB/s es **a través de esa VPN**, no por la red celular desnuda.
2. **El móvil está compartiendo conexión.** `ap0` con clientes activos y logcat saturado de
   errores de `Tethering`. La subida del móvil se está repartiendo con otros aparatos.

Conclusión honesta: **0,21 MB/s es un suelo pesimista, no un techo físico.** El techo físico
razonable es ~0,57 MB/s (lo que declara la red del propio móvil) y el del servidor ~0,65 MB/s.
Los dos están en el mismo orden: **hoy el móvil y el servidor empatan como cuello de botella.**

---

## 2. El problema, en una frase

Todo el vídeo —subida y entrega— pasa por una máquina de 2 vCPU con ~5 Mbit/s compartidos, y
esa misma máquina es la que hace el trabajo pesado de vídeo.

La cuenta que lo hace evidente: **un vídeo de 50 minutos (900 MB) visto 10 veces son 9 GB
saliendo por el caño de 5 Mbit/s = ~4 horas de saturación para TODOS los usuarios.** Hoy, con
11 usuarios, no pasa nada. Es exactamente el tipo de cosa que no se puede arreglar el día que
pasa.

---

## 3. Arquitectura objetivo

```
                        HOY                              OBJETIVO
   móvil ──firmado──► [ nginx ─► MinIO ]        móvil ──firmado──► [ OSS ]
                            │                                        │
                            │                                    [ VOD ]  transcodifica,
                            │                                        │     saca HLS + póster
   móvil ◄──entrega─────────┘                    móvil ◄──[ CDN ]◄─────┘
     ▲                                              ▲
     │ API (metadatos, firma, cuota)                 │ API (metadatos, firma, cuota)
   [ API 2 vCPU ]                                 [ API 2 vCPU ]   ← deja de tocar el vídeo
```

Lo que se mueve: **los bytes**. Lo que se queda: el API, que solo firma, guarda metadatos y
lleva la cuota.

**Beneficio inmediato y medible:** al dejar de entrar y salir el vídeo por la máquina, el techo
de ~5 Mbit/s deja de aplicar a los vídeos. Queda solo como techo de los metadatos y las
imágenes pequeñas — que es para lo que está bien dimensionado.

---

## 4. Fases

Cada fase se puede parar y el sistema sigue funcionando. **Este es el criterio real de orden:
ninguna fase deja el producto peor que antes.**

### Fase 0 — Decisiones que hay que tomar ANTES de escribir código

| Decisión | Por qué importa |
|---|---|
| Región de OSS/VOD | Debe ser la más cercana a los usuarios reales (Malabo/Bata). *Confirmar si el bucket va en la misma región que el servidor (HK) o más cerca de África.* |
| Dominio propio para el almacén | `media.egrouteplan.com` (o similar). **No** usar la URL cruda del bucket: si mañana se cambia de proveedor, las URLs ya publicadas se rompen. |
| Buckets y visibilidad | Hoy hay buckets públicos y privados. OSS necesita su propia política por bucket. |
| Presupuesto de salida | Es el ÚNICO coste que crece con el uso. Sin alerta de facturación configurada, no se abre al público. |

### Fase 1 — OSS como almacén  ← *el corte que la app no nota*

- Bucket de media + bucket de docs, con el mismo reparto que hoy.
- Se mantiene el contrato **entero**: `billete` → POST del formulario firmado → `cerrar`.
- OSS firma "post policy" de forma parecida a MinIO pero **no idéntica** (`policy` +
  `OSSAccessKeyId` + `signature`). Es trabajo de `media.service.ts`, no de la app.

> **Las tres trampas ya conocidas, que se repetirán con OSS** (están documentadas en
> `docs/VIDEO-50-MINUTOS.md` §4.2 y son del contrato, no de MinIO):
> 1. **El archivo va el ÚLTIMO** en el formulario. OSS también ignora lo que venga detrás.
> 2. **No fijar la cabecera `Content-Type` del formulario**: si se fija a mano, el runtime no
>    puede poner su `boundary` y la subida falla con 403.
> 3. **`content-length-range` lo aplica el almacén**, no el API: el tope sigue siendo real
>    aunque el cliente mienta.

**Hecho cuando:** el contrato app↔servidor (18/18) pasa **sin tocar una línea de la app**, y
la subida de 62 s va a OSS con progreso.

### Fase 2 — VOD (transcodificado + HLS + póster)

- Salidas: **720p y 480p**, HLS para los largos y MP4 para los cortos del feed, póster
  generado por VOD.
- Resuelve tres cosas que hoy se hacen a mano o no se hacen:
  - **`faststart`**: el §7.4 del documento anterior queda resuelto por el transcodificador
    (remuxea con el índice delante). Hoy es un riesgo abierto.
  - **Peso**: 720p/480p en vez del archivo original tal cual.
  - **Póster**: deja de depender de un `ffmpeg` en la máquina del API.

> ⚠️ **Aquí sí cambia el contrato, y hay que decidirlo a conciencia.** Hoy el `durationSec`
> que se publica lo mide `ffprobe` **en el momento de cerrar la subida**, así que el post nace
> con la duración verdadera. Con VOD, la duración fiable **llega tarde**, cuando termina el
> trabajo de transcodificado. Eso obliga a:
> - un estado `processing` en el post, y
> - que el feed pinte el póster (no el reproductor) hasta que esté listo.
>
> Es un cambio de producto, no de fontanería. **No se puede meter "por debajo" como la Fase 1.**
> La alternativa que evita el cambio: seguir midiendo con `ffprobe` local al cerrar (barato:
> 0,215 s para 215 MB) y usar VOD **solo** para generar las versiones de reproducción y el
> póster, en segundo plano.

### Fase 3 — CDN

- `cdn.egrouteplan.com` por CNAME, origen OSS/VOD.
- Reglas que no son opcionales: cachear segmentos HLS (`.ts`) y `.m3u8` con TTL corto, y
  **dejar pasar los `Range`** (si el CDN no soporta peticiones parciales, el vídeo deja de
  poder saltar hacia delante).

**Hecho cuando:** el servidor deja de servir bytes de vídeo. Se comprueba mirando el tráfico
de la máquina mientras alguien reproduce un vídeo largo: debe quedarse plano.

### Fase 4 — ApsaraVideo Live

- Ingest RTMP con URL firmada, reproducción HLS/FLV.
- **El directo es lo más caro por minuto** (transcodificado en vivo + salida de CDN) y no se
  puede cachear: cada espectador es tráfico nuevo.
- Recomendación: **no entra en este plan**. Se decide aparte, con precio de venta delante,
  porque es el único trozo donde el coste escala con el número de espectadores y no con el
  catálogo.

### Fase 5 — Migración y retirada de MinIO

- Copiar los **331 MB** reales con `ossutil cp` (es una tarde, no un proyecto).
- Reescribir las URLs en `lifebook.media_uploads`.
- **Dejar las URLs viejas funcionando** (redirección) mientras haya posts publicados que las
  referencien: hay 999 posts y algunos tienen vídeo.
- MinIO en solo-lectura un tiempo, luego apagar.

---

## 5. Coste: modelo, y por qué el orden importa

Tres cosas se cobran, una no:

| Concepto | Se cobra por | Con la escala real (331 MB, 11 usuarios) |
|---|---|---|
| **Entrada** (subir el vídeo) | — | **Gratis.** El tráfico de entrada no se cobra. |
| **Almacenamiento** | GB/mes | Ridículo: OSS estándar >5 GB ≈ **USD 0,017/GB/mes** ([Alibaba Cloud](https://www.alibabacloud.com/ja/product/oss/pricing?_p_lc=1)). 100 GB ≈ USD 1,7/mes. |
| **Transcodificado** | **minuto de salida** | El coste que aparece con los vídeos largos: 50 min a 720p **+** 480p = **100 minutos de salida** por vídeo. |
| **Salida (CDN)** | GB | **El único que crece con el uso.** Y el que hay que vigilar. |

La proporción que hay que tener en la cabeza, porque decide toda la arquitectura:

> **Reproducir un vídeo de 50 minutos (900 MB) cuesta ~1000 veces más que almacenarlo un mes.**

De ahí la conclusión de negocio: el almacenamiento y el transcodificado son calderilla; **el
vídeo se paga al verlo**. Un catálogo grande y poco visto es baratísimo; poco catálogo muy
visto es donde se va el dinero. Cualquier decisión de producto sobre el vídeo largo debería
tomarse sabiendo esto.

> Las cifras de transcodificado y de salida **no se ponen aquí a propósito**: cambian por
> región y por tramo, y una cifra inventada en un plan es peor que un hueco. Se confirman en
> la consola antes de decidir, y con **alerta de facturación configurada** antes de abrir.

---

## 6. Riesgos y trampas concretas

1. **La cuota deja de estar en el disco y pasa a estar en la factura.** Hoy
   `MEDIA_MAX_PER_DAY=40` × 1200 MB = **48 GB/día** contra 29 GB libres. Con OSS el disco deja
   de ser el límite — y por eso deja de protegerte. Hace falta cuota **por persona y por
   bytes** en el mismo cambio, no después.
2. **`proxy_read_timeout` ya está en 300 s.** Al salir el vídeo del camino del API deja de
   importar para la subida, pero **sigue importando** para `cerrar`: si `cerrar` pasa a esperar
   un trabajo de VOD, la respuesta tiene que ser asíncrona o nginx cortará otra vez.
3. **Los pósteres.** Hoy el servidor saca el fotograma del segundo 1 y la app ya permite
   elegir otro (componente `VideoCoverSheet`). Con VOD hay que decidir quién manda y no perder
   ese trabajo.
4. **URLs ya publicadas.** Hay 999 posts. Cualquier cambio de dominio necesita redirección, no
   solo migración.
5. **No transcodificar en el servidor.** 2 vCPU y un 720p de 50 min: ocuparía la máquina
   durante decenas de minutos y dejaría el API sin CPU. Es justo lo que este plan evita.

---

## 7. Qué NO hacer

- **No poner el CDN delante del servidor de aplicación.** El CDN no arregla el techo de
  subida: solo reparte la entrega. Son dos problemas distintos y se arreglan en dos sitios.
- **No meter el vídeo por el proceso del API**, ni "solo para los pequeños". Es el error que
  la Parte 50 ya corrigió.
- **No hacer la Fase 2 y la 4 a la vez.** El directo y el VOD comparten palabras (transcodificar,
  HLS) y casi nada más; hacerlos juntos garantiza confundir los dos modelos de coste.
- **No cambiar la app para esto.** Si el plan obliga a tocar `app/lifebook.tsx`,
  `api/lifebook.ts` y las pantallas, el corte está mal elegido. La Fase 1 no la toca; la Fase 2
  toca solo lo que el §4 dice que tiene que tocar.

---

## 8. Anexo: por qué la Fase 1 es barata

El contrato que la app ya usa, y que no cambia:

```
1. POST /lifebook/media/billete   { purpose, kind, durationKind, mimeType, fileSizeBytes }
       ← { key, bucket, publicUrl, maxBytes, maxSec, method, fileField, expiresIn, restantesHoy }
2. POST <a donde diga el billete>   formulario firmado, el ARCHIVO EL ÚLTIMO
3. POST /lifebook/media/complete   { key, durationSec }
       ← { url, signedUrl, posterUrl, bytes, durationSec, codec, width, height, verified }
4. POST /lifebook/posts/video      { videoUrl, coverUrl, durationSec, … }
```

**La app nunca supo que detrás estaba MinIO.** Pide un billete, sube a donde le digan y
publica una URL. Cambiar MinIO por OSS es cambiar quién firma el paso 2 y qué URL sale en el
paso 3. Los pasos 1 y 4 son idénticos.

Ese es el motivo de que este plan empiece por OSS y no por VOD: **es el único trozo donde el
trabajo es del servidor y el riesgo para la app es cero.**
