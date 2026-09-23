# La línea de tiempo en el feed inmersivo: cómo lo hacen otras plataformas

**Parte 51-e · 13 de septiembre de 2026**

> Lo pedido: *«investiga cómo plataformas como Douyin o TikTok marcan esta línea de tiempo, o
> Xiaohongshu: la línea aparece pero no de la forma correcta»*.
>
> Resultado corto: **la que estaba mal era la nuestra, y no por el color ni el grosor, sino
> porque ninguna de esas plataformas la deja ahí todo el rato.** Lo que se ha hecho es dejarla
> como la de YouTube Shorts, que sí es permanente, y **no** copiar a TikTok/Douyin sin decidirlo
> antes, porque ese cambio toca el gesto de pasar de vídeo.

---

## 1. Lo que hace cada una

| Plataforma | ¿Barra permanente en el feed? | Cómo se ve / cómo se usa |
|---|---|---|
| **TikTok** | **No** | Aparece **al mantener pulsado** el vídeo; ahí se arrastra en horizontal para avanzar y retroceder, y se suelta para seguir. El feed limpio es parte del diseño. ([Tubefilter](https://www.tubefilter.com/2021/07/08/tiktok-how-to-fast-foward-rewind-video/), [iDownloadBlog](https://www.idownloadblog.com/2021/07/14/tiktok-fast-forward-backward-video-navigation-tutorial/)) |
| **Douyin** (抖音) | **No** | Igual que TikTok. La prueba de que no es permanente son las propias preguntas de usuarios: *«抖音没有进度条是怎么回事»* — «¿por qué el Douyin no tiene barra de progreso?» ([PConline](https://g.pconline.com.cn/x/1503/15030045.html), [métodos de avance](https://g.pconline.com.cn/x/1577/15772022.html)) |
| **Xiaohongshu** (小红书) | **No** | El **mantener pulsado abre el menú de VELOCIDAD (倍速)**, no una barra permanente ([php.cn](https://www.php.cn/faq/2165184.html)) |
| **YouTube Shorts** | **Sí** | Línea fina pegada al borde inferior, a todo lo ancho |

O sea: **la barra permanente es la excepción, no la norma.** Solo Shorts la mantiene.

## 2. Por qué la nuestra estaba mal

Medido en el aparato (`dumpsys window`, Poco F5):

- La app es **edge-to-edge**: `mAppBounds = Rect(0,0 - 1080,2374)`. Ocupa la pantalla entera.
- Densidad 3,0 → la pantalla son **791 dp** de alto, y la página del feed mide exactamente eso.
- El sistema reserva una **zona de gestos obligatoria de 96 px = 32 dp** en el borde inferior
  (`mandatorySystemGestures`, `Insets{left=0, top=0, right=0, bottom=96}`). Ahí los
  deslizamientos se los queda el sistema: es el gesto de «ir a inicio». (De hecho mandó al
  launcher más de una vez durante las pruebas.)

Con eso, la versión anterior tenía **tres cosas que no se parecían a nada**:

1. Estaba a **34 dp del borde** —flotando—, precisamente porque la había subido para esquivar
   esa zona de gestos. El motivo era bueno; el resultado, raro: ninguna plataforma la flota.
2. **3 px** de grosor con una pista al 30 %, y el relleno en el color de marca.
3. Una **zona táctil invisible de 26 dp** para poder tocar y saltar. Eso añadía un elemento
   interactivo pegado al borde inferior, justo dentro de la zona de gestos, y era otra cosa que
   podía pelearse con el pase de vídeo.

## 3. Lo que hay ahora: el comportamiento de TikTok/Douyin

**Decidido: se copia a TikTok/Douyin, no a Shorts.** El feed se queda limpio y la barra
**aparece al mantener pulsado**, con el tiempo a la vista, y se arrastra en horizontal para
avanzar. Al soltar se oculta y el vídeo sigue.

- **Oculta mientras se ve.** Medido: las últimas filas dan brillo **5,3 / 20,5 / 21,9** en
  reposo, frente a **74,4** cuando la barra está pintada. Es la comprobación de que no se ve.
- **`activateAfterLongPress(280)`** es la pieza que lo hace posible sin arriesgar el pase de
  vídeo: el gesto **no puede activarse hasta que el dedo lleva 280 ms quieto**. Un toque rápido
  no lo activa y un deslizamiento normal tampoco (el dedo se mueve antes de los 280 ms, y el
  requisito deja de cumplirse), así que la lista conserva su gesto.
- **`Gesture.Race(scrub, taps)`**, no `Exclusive`: gana el primero que se active. Con un toque
  rápido gana el toque —y `Exclusive` no valdría, porque ahí el mantenido tiene prioridad y
  pausar tardaría 280 ms en responder—; con un mantenido gana el arrastre, y al soltar NO se
  dispara además un toque que pausara el vídeo.
- Mientras se arrastra: **el vídeo se pausa** (para que se vea el fotograma del punto al que
  apuntas) y se reanuda al soltar. Se muestra `mm:ss / mm:ss` en una pastilla oscura.
- `onEnd` **y** `onFinalize` llaman al cierre, con un ref para que sea idempotente: si el
  sistema se queda el gesto (una llamada entrante, por ejemplo), la barra no se queda pegada.
- La barra se pinta **solo en la página visible** (`isActive`), pegada al borde inferior, 3 px,
  pista al 35 % y relleno blanco casi opaco.

### 3.1 Lo que sí se pudo verificar y lo que no

- **Verificado:** la barra no se ve al reproducir (brillo del borde inferior 5-22 frente a 74
  con barra) y **el deslizamiento vertical sigue cambiando de vídeo** (dos deslizamientos:
  0:18 → 0:45 → 2:00). Esto último era el riesgo real, porque esta pantalla ya se rompió una
  vez con un gesto de más.
- **NO verificado por mí:** que el mantener pulsado saque la barra. No es un problema del
  código sino de las herramientas: `adb shell input swipe` **bloquea hasta que el gesto
  termina**, así que no se puede mirar a mitad del mantenido, y `input motionevent DOWN` desde
  procesos distintos no compone un gesto coherente que el reconocedor vea. **Se comprueba en el
  aparato con el dedo**, que es como se usa.
