# Decisión: el tamaño del vídeo largo

**Parte 51 · 13 de septiembre de 2026**

> Lo pedido: *«decidir el tamaño del vídeo largo con la velocidad medida»*.
>
> El dato que faltaba: la medición de 0,21 MB/s **no era limpia**. Medida en el dispositivo,
> no deducida (§1). Con el dato bueno delante, la respuesta cambia de «hay que bajar el tope»
> a «el tope está bien; lo que hay que arreglar es el camino».

---

## 0. Decisión tomada (13-sep-2026)

**Se mantiene el perfil largo en 50 min / 1200 MB. No se toca el `.env` ni el DTO.**

A cambio, el aviso de la app deja de ser una vaguedad y pasa a dar el **tiempo calculado**:

- `constants/lifebook.ts` → `LB_SUBIDA_MBPS_REFERENCIA = 0,21` (la medición real, pesimista a
  propósito) y `lbTiempoSubida(bytes)` → «~45 s» · «~24 min» · «~1,2 h».
- `app/lifebook-media.tsx`:
  - el aviso de «Vídeo grande» (>250 MB) ahora dice **«Subida estimada con datos móviles: ~X»**;
  - el aviso del perfil largo, con un archivo ya elegido, dice **su peso y su tiempo** en vez de
    «puede tardar».

Motivo de la decisión: el tope de 3000 s / 1200 MB está **desplegado y verificado** (contrato
18/18, DTO 10/10, servidor 9/9) y el almacén lo aplica él mismo; bajarlo sería revertir trabajo
bueno para resolver un problema que **no es del tope, sino del camino** (§4). Lo que sí era
inaceptable es que la app prometiera «50 minutos» sin decir lo que cuesta.

**Lo que sigue abierto:** con este tope, un vídeo de 900 MB tarda entre **26 min y 1,2 h** según
el camino. Eso solo se arregla con §4, no con un número más pequeño.

---


## 1. Las tres velocidades, y por qué la de 0,21 no es LA velocidad

| Camino | Velocidad | De dónde sale |
|---|---|---|
| **Móvil, tal como se midió** | **0,21 MB/s** | medida real, Poco F5, 13-sep-2026 |
| Móvil, red celular declarada | **0,57 MB/s** (4573 Kbps, 5G) | `dumpsys connectivity`, red `ccmni3` (NR) |
| Servidor a sí mismo | **0,65 MB/s** (~5 Mbit/s) | dos medidas independientes |

Dos hechos medidos en el aparato explican la diferencia entre 0,21 y 0,57:

1. **Todo el tráfico del móvil hacia la API pasa por una VPN** (`ip route get 8.218.88.237`
   → `dev tun0`; clientes `com.follow.clash` y `ch.protonvpn` instalados).
2. **El móvil está compartiendo conexión**: `ap0` con clientes y logcat saturado de errores
   de `Tethering`. La subida se reparte con otros aparatos.

Así que **0,21 MB/s es un suelo pesimista, no un techo físico**. Y el techo del servidor
(0,65 MB/s) está en el mismo orden que la red del móvil (0,57 MB/s): **hoy empatan como cuello
de botella**, y ninguna de las dos cosas se arregla bajando el tope del vídeo.

---

## 2. La cuenta, con el bitrate real

Referencia: **88,6 MB por 5 minutos = 0,295 MB/s (2,36 Mbit/s)**, que es el 720p que ya se midió.
Es decir: **1 minuto de vídeo 720p pesa ~17,7 MB**, y subirlo cuesta **1,4 minutos** en el peor
camino medido. Ese 1,4 es el número que resume el problema.

| Tamaño | Vídeo 720p | Móvil medido (0,21) | Red del móvil (0,57) | Techo servidor (0,65) |
|---|---|---|---|---|
| 76 MB *(el vídeo de 3:38 que se eligió hoy en el móvil)* | 4,3 min | **6,0 min** | 2,2 min | 1,9 min |
| 88,6 MB | 5 min | 7,0 min | 2,6 min | 2,3 min |
| **300 MB** | **17 min** | **23,8 min** | **8,7 min** | **7,7 min** |
| 600 MB | 33 min | 47,6 min | 17,5 min | 15,4 min |
| **900 MB** | **50 min** | **1,2 h** | **26,2 min** | **23,1 min** |
| 1200 MB *(el tope de hoy)* | 68 min | 1,6 h | 35,0 min | 30,8 min |

Y al revés, que es como se decide de verdad — **cuánto vídeo cabe en una espera que el usuario
tolera**:

| Espera máxima | Móvil medido | Red del móvil |
|---|---|---|
| 3 min | 38 MB = **2,1 min** de vídeo | 103 MB = **5,8 min** |
| 5 min | 63 MB = **3,6 min** | 171 MB = **9,7 min** |
| 10 min | 126 MB = **7,1 min** | 343 MB = **19,4 min** |
| 20 min | 252 MB = **14,2 min** | 686 MB = **38,7 min** |

---

## 3. La decisión

**Recomendación: perfil largo = 300 MB / 900 s (15 min).** Hoy es 1200 MB / 3000 s (50 min).

> **Esta recomendación NO se aplicó** (ver §0): se decidió mantener 50 min / 1200 MB y arreglar
> el aviso. Se conserva aquí porque la cuenta que la sostiene sigue siendo cierta, y porque es la
> retirada a la que volver si el número real de subidas fallidas por tiempo lo justifica.

Por qué 900 s y 300 MB juntos, y no uno solo:

- **300 MB son ~17 minutos de 720p**, así que un tope de **15 min** y un tope de **300 MB**
  cortan casi exactamente en el mismo sitio. Eso importa: con el tope de hoy (50 min / 1200 MB)
  el límite de minutos no se alcanza nunca y el de peso tampoco, o sea que **ninguno de los dos
  avisos dice la verdad** sobre lo que va a costar.
- En el peor camino medido, 300 MB son **~24 minutos**, no 1,2 horas. Sigue siendo mucho, pero
  es la diferencia entre «una espera larga» y «se fue la tarde».
- En la red real del móvil son **~9 minutos**: una espera que un usuario acepta por un contenido
  que le importa.

### Por qué NO se toca el techo técnico del servidor a la ligera

El techo de 3000 s / 1200 MB está **desplegado y verificado** (contrato 18/18, DTO 10/10,
servidor 9/9) y **el almacén lo aplica él mismo**. Bajarlo es revertir trabajo bueno. Pero
dejarlo en 3000 s mientras la app ofrece un perfil más pequeño tampoco molesta: el techo
técnico es lo que el almacén acepta, no lo que la app propone.

**Concretamente: el mínimo cambio es bajar `MEDIA_MAX_VIDEO_LONG_MB` a 300 y
`MEDIA_MAX_VIDEO_LONG_SEC` a 900 en el `.env`, y su espejo en `constants/lifebook.ts`.**

> ⚠️ **El tope vive en DOS sitios y hay que cambiar los dos.** `LB_VIDEO_PERFILES` en
> `constants/lifebook.ts` es un espejo a mano del `.env` del servidor. Si se cambia solo el
> `.env`, la app sigue ofreciendo «hasta 50 min», deja elegir el archivo, y el usuario se come
> el rechazo **después de subir** — que es exactamente el fallo que la Parte 50 arregló.
>
> Merece la pena quitar ese espejo: un `GET /lifebook/media/limits` que la app pida al abrir la
> pantalla. El servidor ya manda `maxBytes`/`maxSec` en el billete; solo falta mandarlos **antes**
> de elegir el archivo. Es pequeño y elimina la posibilidad de que los dos números se separen.

### Qué NO se debe hacer

- **No bajar el perfil corto** (60 s / 120 MB). Es el que hace que el feed cargue al instante y
  no tiene nada que ver con este problema.
- **No prometer «50 minutos» en la interfaz mientras el camino real tarde 1,2 h.** Si el perfil
  se queda en 50 min, el aviso tiene que decir el número de verdad, calculado — no un «puede
  tardar».

---

## 4. Lo que de verdad desbloquea los 50 minutos

Bajar el tope es la decisión que se puede tomar **hoy, sin código nuevo**. Pero es una retirada,
no un arreglo. Los 50 minutos se vuelven honestos con dos cambios, y **ninguno es del tope**:

1. **Sacar el servidor del camino del vídeo** (Fase 1 del plan OSS:
   `docs/PLAN-OSS-VOD-CDN-LIVE.md`). Hoy el techo de 5 Mbit/s del servidor es compartido por
   todos y es del mismo orden que la red del móvil: los dos se estorban. Con la subida directa a
   OSS, el servidor deja de estar en medio y queda **solo** la red del móvil → 900 MB pasan de
   **1,2 h a ~26 min**.
2. **Subida reanudable y en segundo plano.** Es el único cambio que convierte una espera de
   26 minutos en algo aceptable, porque deja de exigir que el usuario mire la pantalla.

Con (1) y (2), «50 minutos» es una promesa razonable. Sin ellos, el tope de 300 MB es la
promesa que sí se cumple.

---

## 5. Cómo se comprueba que la decisión fue la buena

Con el perfil en 300 MB / 900 s:

- El aviso de peso/datos (hoy salta a los 250 MB) sigue teniendo sentido: **es el 83 % del tope**.
- Un vídeo de 5 min de 720p (88,6 MB) sube en **~7 min** en el peor camino medido — el caso más
  común y el que se probó en el móvil.
- Si en un mes el 80 % de los vídeos publicados pesan menos de ~150 MB, el tope no molesta a
  nadie y se puede subir con datos en la mano en vez de con esta tabla.

**Las cifras de esta tabla se midieron; las de la última viñeta, no.** Por eso la decisión es
reversible: los dos números están en un `.env` y en un archivo de constantes.
