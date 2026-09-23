# AUDITORÍA — «el cuerpo de la pantalla no se pinta» (15/09/2026, 17:00)

> ## ⚠️ CORRECCIÓN (17:20) — mi tabla de «alcance» estaba MAL MEDIDA
>
> **El detalle del pedido NO está en blanco.** Lo di por roto con la cifra «93,6 % plano» y esa cifra
> **no significa nada**: medía «% de píxeles que son exactamente el color de fondo», y una pantalla
> oscura **con texto** es ~90 % fondo **por construcción**. Mi umbral marcaba como «rota» cualquier
> pantalla normal.
>
> Comprobado con la MISMA captura, mirando **colores** en vez de porcentaje: en la banda del cuerpo del
> detalle del pedido hay **71.979 px de fondo, 1.966 px de texto blanco (242,243,245), 675 grises,
> 533 azules (#3981F6, el primario) y 239 negros** ⇒ hay texto, iconos y botones pintados. Su geometría
> es sana (cabecera 0-241 · cuerpo 241-2157 · pie 2157-2374, con todos los hijos bien colocados). Y lo
> abrí **con un toque real desde «Mis pedidos»**, no con enlace directo, para descartar el artefacto de
> navegación: sigue pintándose bien. **No hay nada que bisecar ahí.**
>
> **Por qué la caja del producto SÍ era un fallo real** (esto sigue en pie): allí la prueba no fue el
> porcentaje, sino (a) el árbol decía **2 textos** donde debían ir 24, (b) esa banda tenía **un ÚNICO
> color** en el histograma (51.840 muestras, todas el mismo valor: área realmente vacía) y (c) el otro
> agente midió el pie en **2.110 px** de alto y el cuerpo en **0 px**: un fallo de *layout* de verdad
> (el `width: '100%'` de `PrimaryButton` dentro de una fila). Ya está arreglado y **verificado por mí**
> en el móvil: 27 textos, «Recoges en Hotel Demo Malabo · Paraíso», las 5 formas de pago y el cupón.
>
> **Métrica válida de aquí en adelante:**
> 1. **Contar nodos/textos del volcado** y compararlos con los que la pantalla debería tener.
> 2. **Buscar los COLORES esperados** (el del texto, el primario de un botón) en la banda.
> 3. **Histograma**: un área vacía tiene **un solo color**; una pantalla normal tiene texto, iconos y bordes.
> 4. El «% de fondo» **solo** vale comparando la MISMA pantalla antes/después, nunca como test aislado.
>
> **La tabla de §2 queda retirada entera** (salvo la fila de la caja del producto, que sí tenía las
> pruebas (a), (b) y (c)). Lo de §4 (descartado con pruebas), §5 (trampas de medición) y §6 (pruebas
> pendientes) sigue siendo válido, **menos 6.1 y 6.2 en lo que toca al detalle del pedido**.

> Auditoría **independiente** del bug que ya está documentado en
> `docs/BUG-CAJA-DEL-PRODUCTO-SIN-CUERPO.md` (ese documento es el traspaso del arreglo; **este** es el
> informe de auditoría: qué alcanza el fallo, desde cuándo, qué está descartado con pruebas y qué
> pruebas quedan por hacer).
>
> ⚠️ **No he compilado ni instalado nada** para no pisar al otro agente (a las 16:49 había un APK suyo
> instalado y a las 16:51 estaba editando `app/lifebook-checkout.tsx`, que ya no es mi versión: tiene
> su instrumentación `MED r-1 c-1 p-1 v751 i40/0` y un `backgroundColor: '#3A0D3A'` para *ver* el
> ScrollView). **Ese fichero no lo toco.**

---

## 1. Qué es el fallo, en una frase

**El único caso confirmado** (la caja del producto, ya arreglado) era: el cuerpo no se dibujaba porque
**no le quedaba sitio** — el pie se había hinchado a 2.110 px por el `width: '100%'` de `PrimaryButton`
dentro de una fila, y el cuerpo (`flex: 1`) se quedaba en 0 px. Los nodos existían en el árbol pero no
había píxeles: esa zona era un color plano.

⚠️ Lo que sigue **describía un alcance mayor** («en algunas pantallas») y **ese alcance no está probado**:
ver la corrección del principio de este documento.

## 2. Alcance real (medido con el MÉTODO VERIFICADO, ver §5)

| Pantalla | Marcador de «estoy aquí» | Textos en el árbol | Zona del cuerpo plana | Estado |
|---|---|---|---|---|
| ~~`lifebook-order/[id]` (detalle del pedido)~~ | «Compra en Hotel Demo Malabo» ✓ | 29 | ~~93,6 %~~ | **RETIRADO: pinta bien** (ver corrección de arriba) |
| **`lifebook-checkout`** (caja del producto) | «Finalizar pedido» ✓ | **2** (debían ser 24) | **un solo color** | **ROTA → ARREGLADA y verificada** |
| `lifebook-product/[id]` (ficha) — **control** | «Pagos aceptados» ✓ | 20 | con contenido | pinta OK |
| `lifebook-carrito-checkout` (caja del carrito) | el dueño lo confirmó **en pantalla** | — | — | pinta OK |
| `lifebook-orders`, `lifebook-carrito`, `lifebook-ai`, `lifebook-inbox`, `taxi` | — | — | — | **sin verificar** (la métrica que usé no valía) |

**La única pantalla que estaba rota —y la única que llegué a medir con pruebas sólidas— es la caja del
producto**, y su causa fue de *layout* (el `width: '100%'` de `PrimaryButton` dentro de una fila), no de
pintado. Las demás filas de esta tabla **no son de fiar**: hay que rehacerlas con la métrica válida de
la corrección de arriba.

## 3. Es una REGRESIÓN (con la fecha acotada)

`docs/TANDA-E-EL-PEDIDO-EN-EL-CHAT.md` (sesión del **14/09/2026**) deja escrito lo que se veía en la
caja **en el móvil**:

```
| Caja | «Finalizar pedido» · «Recoger en tienda» · «Recoges en Hotel Demo Malabo · Paraíso» · Billing · «Confirmar pedido» |
```

«Recoges en Hotel Demo Malabo · Paraíso» es un **`<Text>` normal dentro del cuerpo** ⇒ el 14/09 los
textos del cuerpo **se dibujaban**. Hoy no. **Por tanto: algo cambió entre el 14/09 y hoy.**

### Qué cambió en esa ventana (fechas de modificación, no suposiciones)

| Fecha/hora | Qué cambió | ¿Sospechoso? |
|---|---|---|
| 15/09 **01:40** | `app/_layout.tsx` — se añadió **`<BotonCucucul />` dentro del `View` raíz, como hermano del `<Stack>`**: `position:'absolute', left:16, bottom:96, zIndex:20` | **SÍ** — es un cambio estructural en el layout raíz de TODAS las pantallas |
| 15/09 **12:15–12:16** | `package.json`, `package-lock.json`, `app.json`, `AndroidManifest.xml` — **tanda O: `expo-speech-recognition` + `<queries>` del micrófono** | **SÍ** — cambia el build nativo (autolinking + R8) |
| 15/09 15:16+ | mis edits de la caja (tanda P/Q): preselección, línea «Pagas:», sección Cupón, `ref`/`onLayout` del ScrollView, envoltorio del pie | posible, pero **el JSX del cuerpo (ficha, chips, nota) NO se tocó** |
| 15/09 16:xx | mis intentos de arreglo (quitar `KeyboardAvoidingView`, cuerpo a `View`) | ya posteriores al fallo (el fallo ya estaba) |
| sin cambios recientes | `core/AuthGate.tsx` (30/08), `components/lifebook/Chip.tsx` (11/09) | no |

**⇒ Las dos pruebas de arriba son las que hay que hacer primero (§6).**

## 4. Descartado con pruebas (no volver a mirarlo)

| Hipótesis | Prueba que la descarta |
|---|---|
| **Faltan datos** (formas de pago) | La BD tiene 5 activas; la API las devuelve para ese producto; la ficha las pinta |
| **Tipografía que no carga / mide 0** | **La app NO carga ninguna tipografía propia**: no hay `useFonts`, ni `SplashScreen`, ni `fontFamily` en el código (solo `monospace` en un panel de diagnóstico). Tampoco hay `patch-package` |
| **Área segura / insets** | Medido en pantalla: `insets.top=40`, `insets.bottom=0` en las dos cajas |
| **Paquete viejo en el móvil** | Las cadenas de mis pruebas estaban DENTRO del `assets/index.android.bundle` del APK instalado, y el proceso arrancó después del `adb install` |
| **App clonada / otro usuario / otra ruta** | Un solo usuario, un solo paquete, un solo `app/lifebook-checkout.tsx`; una marca nueva puesta **fuera** del ScrollView **sí se dibujó** |
| **El `KeyboardAvoidingView`** | Quitado de las dos cajas: arregló el carrito, **no** la caja del producto |
| **El `ref` del ScrollView / sus props** | Probado con `ref`, sin `ref`, con y sin `style` / `contentContainerStyle` / `keyboardShouldPersistTaps` |
| **El aviso de error del cuerpo** | Sin error también falla |
| **`AuthGate`** | Solo pinta un spinner mientras hidrata; el carrito lo usa igual y funciona |
| **El botón flotante de Cucucul** | Es 50×50 abajo a la izquierda con `pointerEvents="box-none"`: no tapa el cuerpo (pero **su inclusión en el layout raíz sí hay que probarla**, §6.1) |
| **`expo-image` (la foto del artículo)** | **NO está bien descartado**: la prueba se hizo con el cuerpo en `ScrollView` (que ya fallaba solo). Queda pendiente con el cuerpo en `View` (§6.2) |

## 5. Método de medición (y sus trampas, que ya me mordieron)

1. **Abrir la pantalla sin tocar el móvil** (regla del dueño: los toques automáticos crearon pedidos reales):
   `adb shell am start -a android.intent.action.VIEW -d "egrouteplan://<ruta>"`.
2. **Volcar el árbol**: `adb shell uiautomator dump /sdcard/x.xml` + `adb shell cat` (**no** `pull` para XML).
3. ⚠️ **TRAMPA 1: el enlace directo NO SIEMPRE NAVEGA.** El `am start` avisa «delivered to currently
   running top-most instance» y la app puede quedarse en la pantalla anterior. **Me pasó**: medí «Perfil»
   y los textos eran los de **Taxi**. ⇒ **Antes de creer una medida, comprobar en el volcado un texto
   único de esa pantalla** (el «marcador» de la tabla §2). Sin marcador, la medida no vale.
4. **Captura**: `adb shell screencap -p /sdcard/x.png` + `adb pull` (⚠️ **TRAMPA 2**: redirigir binario con
   `>` en PowerShell 5.1 corrompe el PNG: «Out of memory»).
5. ⚠️ **TRAMPA 3**: el móvil está en **modo oscuro** y el fondo de página es `(23,23,26)`. Medir «tinta» con
   umbral 40 **no detecta** un texto oscuro. Lo que sí separa bien las dos situaciones es **contar los
   píxeles que son EXACTAMENTE el color de página** en la banda del cuerpo:
   * pantalla sana → 20-50 % de fondo de página (hay contenido);
   * pantalla rota → **90-100 %** (el cuerpo es un color plano).
6. ⚠️ **TRAMPA 4**: `uiautomator` **lista nodos que no se dibujan**. El árbol NO prueba que algo se vea:
   hay que cruzarlo siempre con los píxeles.

## 6. Pruebas que quedan por hacer, por orden

### 6.1 Quitar el botón flotante del layout raíz (la más barata y la más prometedora)
En `app/_layout.tsx`, comentar `<BotonCucucul />` (una línea, no se toca nada más) y compilar.
* Si el cuerpo vuelve a pintarse ⇒ **el overlay absoluto con `zIndex: 20` del layout raíz es el culpable**
  (encaja con la fecha: entró el 15/09 a la 01:40, dentro de la ventana).
* Si no cambia nada ⇒ descartado y se pasa a 6.2.

### 6.2 `expo-image` con el cuerpo en `View`
Cuerpo como `View` (que ya hace que los nodos aparezcan) **y** la ficha del artículo sin `<Image>`
(siempre el hueco gris). Compilar y medir. Es el único hijo «nativo raro» que la caja tiene y la ficha
sana… también (ojo: la ficha también usa `expo-image` y va bien, así que esto es menos probable que 6.1).

### 6.3 Bisecar los hijos del cuerpo, de uno en uno
Patrón observado: **con el aviso de error delante, se dibujaba SOLO el aviso**; sin él, ni la ficha. Eso
apunta a un hijo que tumba el dibujo de los que vienen detrás. Ir dejando un hijo por vez (texto suelto →
ficha → un `Chip` → `SelectorDeCupon` → `TextInput`) midiendo cada vez.

### 6.4 Revertir la tanda O (prueba nativa, más cara)
Quitar `expo-speech-recognition` (`package.json`), su plugin en `app.json` y el `<queries>` del
`AndroidManifest.xml`, recompilar y medir la caja. Si se arregla, el culpable es el build nativo (R8 /
autolinking) y hay que mirar reglas de ProGuard.

### 6.5 Comparar los `contentContainerStyle` (pista débil, pero anotada)
Las dos pantallas rotas comparten **exactamente** `contentContainerStyle={{ padding: 16, paddingBottom: 24 }}`;
las sanas usan `paddingBottom` grande (`insets.bottom + 96` en la ficha, `pieAltura + insets.bottom` en el
carrito) o `style={{flex:1}}` (caja del carrito, que usa `paddingBottom: 30`). **Es una correlación, no una
causa**: la caja del carrito (sana) también lleva un `paddingBottom` pequeño. Aun así, probar a ponerle a
la pantalla rota el mismo `paddingBottom` grande de la ficha es una prueba de un minuto.

### 6.6 Logcat buscando quejas nativas
`adb logcat -d | Select-String 'Yoga|Mounting|ReactNoCrash|Fabric|clipped'` (en mis pruebas solo había
ruido del sistema, sin líneas `ReactNativeJS`).

## 7. Estado del código y del móvil (para no pisarse)

* **APK instalado en el momento de la auditoría: el del otro agente (16:49:43)**, y luego el suyo con el
  arreglo. Mis primeras mediciones de la caja eran de un build mío anterior (16:22). La medición del
  detalle del pedido (que decía «rota») **estaba mal: se pinta bien** (ver la corrección del principio).
* **`app/lifebook-checkout.tsx` es SUYO ahora** (editado a las 16:51, con instrumentación). **No lo toco.**
  Mi copia con el `ScrollView` está en `.tmp-compra/lifebook-checkout.con-scrollview.tsx`.
* **Mi último estado limpio**: `lifebook-carrito-checkout.tsx` (arreglada: `View` en vez de
  `KeyboardAvoidingView` + `ScrollView` con `style={{flex:1}}`, sin `ref`) y `tsc --noEmit` en 0.
* **Servidor**: parches 73/74/75 aplicados, `pm2` online, cupones verificados contra la API
  (`pruebas/lb72a-cupon-en-la-caja.cjs` → TODO OK). Nada pendiente allí.
* **Pruebas guardadas**: `pruebas/lb70a-diagnostico-compra.cjs`, `lb71a-ticket-del-pedido.cjs`,
  `lb72a-cupon-en-la-caja.cjs`. Evidencia de pantalla en `.tmp-compra/` (`ok.xml`+`ok.png`,
  `cart.xml`, `prod.xml`, `caja.png`, `au.xml`+`au.png` del barrido).

## 8. Lo que el dueño necesita

Comprar desde la **ficha del producto** (ya funciona: verificado) y ver **su pedido** después. El primer
punto está resuelto; lo segundo **también se pinta bien** (mi «no se pinta» era un error de medición, ver
la corrección del principio).

---

## 9. RESUELTO (17:05) — causa raíz, y tus dos sospechosos quedan descartados

Está en **`docs/CAUSA-RAIZ-CUERPO-EN-BLANCO.md`**. En corto:

* **La caja del producto ya pinta** (verificado en el móvil: 2 textos en el árbol → **24**; el pie abajo
  en y=2.078-2.186; artículo con contenido). El arreglo son 3 líneas en el pie de
  `app/lifebook-checkout.tsx`.
* **Causa**: `PrimaryButton` del kit trae **`width: '100%'`** (está hecho para ir a lo ancho de una
  COLUMNA). Metido en una **fila** junto a una columna `flex: 1`, se come todo el ancho → la columna se
  aplasta a ~0 px → sus textos se parten letra por letra hasta ~2.133 px de alto → **el pie mide
  2.110 px** → el cuerpo (`flex: 1`) se queda con **0 px** y sale en blanco. Medido, no supuesto.
* **⇒ NO hace falta** (§6.1) quitar `<BotonCucucul />` del layout raíz, **ni** (§6.4) revertir la tanda
  O (`expo-speech-recognition`). Encaja con la regresión: el fallo nació al rehacer el pie de la caja
  (tanda P/Q, 15/09 15:16+), justo cuando el CTA del kit entró en la fila de totales. Y explica por qué
  el carrito sano: su pie usa un `Pressable` normal, no el botón del kit.
* **`lifebook-order/[id]` sigue roto y NO es este patrón** (sus botones sí van envueltos). Queda por
  medir y bisecar aparte; es lo siguiente, porque ahí está el código de entrega.

> **CORRECCIÓN (la auditora, 17:20).** Ese último punto **sale de una medición MÍA que estaba mal**
> (ver la corrección del principio de este documento): **el detalle del pedido se pinta bien**. Lo
> comprobé de tres formas: (1) en la banda del cuerpo hay **colores de texto (blanco 242,243,245; gris
> 170,174,183), el primario azul #3981F6 y negro**, o sea texto, iconos y botón pintados; (2) su
> geometría es sana (cabecera 0-241 · cuerpo 241-2157 · pie 2157-2374, todos los hijos bien colocados);
> (3) lo abrí **con un toque real** desde «Mis pedidos» (no con enlace directo) y sigue pintándose bien.
> **No hay que bisecar nada ahí**: el «93,6 % plano» era, sencillamente, el porcentaje de fondo de una
> pantalla oscura con texto. Queda retirado.

