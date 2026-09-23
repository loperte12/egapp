# BUG ABIERTO — La caja del PRODUCTO no pinta el cuerpo

> 15/09/2026, 16:25. Documento de traspaso para que **otro agente** siga con esto sin repetir lo que ya
> está hecho. La caja del CARRITO ya está arreglada; **la del PRODUCTO sigue rota**.
> Toda la evidencia de este documento está medida en el móvil (Poco F5), no supuesta.

---

## 1. Resumen en tres líneas

Al abrir **`/lifebook-checkout`** (la caja del producto: título «Finalizar pedido») se ven la cabecera
y el pie con el botón, pero **el cuerpo no se dibuja**: ni la ficha del artículo, ni «¿Cómo pagas?», ni
las formas de pago, ni el cupón. Y no es que falte el dato (el servidor devuelve 5 formas de pago para
ese producto): **los nodos existen, pero no se pintan**.

---

## 2. Lo que YA está arreglado (no volver a tocarlo)

| Qué | Estado |
|---|---|
| **Caja del CARRITO** (`app/lifebook-carrito-checkout.tsx`) | **ARREGLADA y confirmada por el dueño en pantalla**: se ven las formas de pago y el cupón. |
| Cupones (servidor + app) | Hechos y verificados contra la API real (`pruebas/lb72a-cupon-en-la-caja.cjs` → TODO OK). |
| Elegir la forma de pago (ya no se marca sola) | Hecho en las dos cajas. |
| Ticket del pedido en el chat + botón «escribir a la tienda» | Hecho (tandas P y Q). |

**El arreglo de la caja del carrito** (funcionó, aplicado también a la del producto):
1. Quitar el `KeyboardAvoidingView` que envolvía el `ScrollView` (en Android, con `behavior`
   indefinido, era un envoltorio inútil) y poner un `View` normal.
2. `ScrollView` con `style={{ flex: 1 }}`.
3. Quitar el `ref` del `ScrollView` y toda la maquinaria de «desplazar la vista al sitio que falta»
   (`scrollRef`, `onLayout`, `scrollTo`). El aviso de lo que falta se ve igual en el pie.

⚠️ **En la caja del producto eso NO bastó** (ver abajo).

---

## 3. El bug, con las pruebas exactas

### 3.1 Lo que se ve en pantalla
- Medido en la captura (`ok.png`) contando píxeles que se apartan del color de fondo:
  - ficha del artículo (y 292-450): **0 %** de contenido
  - formas de pago (y 585-770): **0 %**
  - cupón + nota (y 770-975): **0 %**
  - **botón de pagar (y 1660-1830): 97 %** ✓ se dibuja
- O sea: la cabecera y el pie se dibujan; **la banda del cuerpo es un color plano**.

### 3.2 Lo que dice el árbol nativo (`uiautomator dump`, `ok.xml`)
Sí aparecen los nodos del cuerpo (con su banda de pantalla):
```
Button [48,586][1032,685] D='Billing'
Button [48,610][1032,709] D='Efectivo contra entrega'
Button [48,656][1032,710] D='Señal o anticipo'
Button [48,680][1032,734] D='Pago en tienda'
Button [48,704][1032,758] D='Transferencia / Orange Money'
EditText [48,698][809,758] T='¿Tienes un código?'
EditText [48,761][1032,971] T='Ej.: llamar al llegar'
```
**Dos cosas raras y muy informativas:**
1. **Los chips se PISAN**: empiezan cada 24 px (8 dp = el `gap`), es decir, el layout cree que miden
   ~0 de alto (su vista nativa sí mide 33-42 dp → por eso se solapan). **El layout mide los hijos del
   cuerpo como 0 de alto.**
2. **Los textos propios NO están**: los únicos `TextView` del volcado son «Finalizar pedido» (la
   cabecera) y el del botón. **Faltan todos los `<Text>` del cuerpo** (título del artículo, «Cantidad:»,
   los rótulos de sección «¿Cómo lo recibes?» / «¿Cómo pagas?» / «Cupón» / «Nota para la tienda», la
   nota del pago, la coletilla final). Los que sí salen son textos **de dentro de componentes**
   (`Chip`, `TextInput` con su placeholder, `PrimaryButton`, `Notice`).

### 3.3 Con `ScrollView` en el cuerpo, en vez de `View`
El nodo `ScrollView` **ni aparece** en el árbol (y el cuerpo entero tampoco). Con un `View` normal
(`style={{ flex: 1 }}`) el contenido aparece en el árbol… pero **no se dibuja** (3.1).

### 3.4 Comparación con la caja del CARRITO (que sí funciona)
Su árbol sí tiene el cuerpo, con tamaño real:
```
ScrollView [0,243][1080,2073]
  ViewGroup [0,243][1080,683]
    TextView 'No hay nada que pagar: vuelve al carrito y marca algún producto.'
    TextView 'La tienda confirma el pedido y te escribe por el chat.'
```
Estructura **casi idéntica** a la de la caja del producto. Ahí está la pista.

---

## 4. Lo que ya está DESCARTADO (con la prueba de cada descarte)

| Sospechoso | Cómo se descartó |
|---|---|
| **Faltan datos** (formas de pago) | La BD tiene 5 activas para esa tienda y **la API las devuelve** para ese producto (`d47de72c-bf3e-4701-9535-e85f6f52d74b`). La ficha del producto las pinta bien. |
| **El móvil corre un paquete viejo** | Comprobado dentro del `assets/index.android.bundle` del APK instalado: llevaba mis cadenas de prueba (`PRUEBA-CUERPO`, luego `TEXTO-A`, `CHIP-B`…). El proceso de la app tenía 4 min de vida, arrancado **después** del `adb install` (ETIME) → corre el paquete nuevo. |
| **App clonada / otro usuario** | `pm list users` → un solo usuario; `pm list packages` → un solo `com.egrouteplan.app`; `pm path` → el APK con la fecha de mi build. |
| **Otro fichero sirviendo la ruta** | Solo existe `app/lifebook-checkout.tsx` (glob `**/*checkout*`). Los textos «Elige cómo pagas» / «Finalizar pedido» solo están ahí. Además una marca nueva puesta **fuera** del `ScrollView` («FUERA-DEL-SCROLL») **sí se dibujó** → el fichero que corre es el mío. |
| **El `ref` del `ScrollView`** | Probado sin `ref`: sigue igual. |
| **`contentContainerStyle` / `keyboardShouldPersistTaps` / `style`** | Probado con y sin: sigue igual. |
| **`expo-image` (la foto del artículo)** | Probado quitando la foto del artículo: sigue igual (⚠️ esta prueba se hizo con el `ScrollView` puesto, que ya fallaba por sí solo; **queda pendiente repetirla con el cuerpo en `View`** — ver 5.3). |
| **El aviso de error (`Notice`) del cuerpo** | Sin error también falla (el aviso no es la causa). |
| **El área segura / `insets`** | Medido en pantalla: `insets.top = 40`, **`insets.bottom = 0`** en LAS DOS cajas. El pie no se está comiendo el sitio. |
| **El `KeyboardAvoidingView`** | Quitado de las dos cajas: arregló el carrito, **no** la del producto. |
| **El layout "está bien y el volcado miente"** | No: la captura de píxeles lo confirma (la banda está plana). |
| **`AuthGate`** | Solo pinta un spinner mientras hidrata y luego los hijos; el carrito lo usa igual y funciona. |
| **Fuente del texto / medición 0 antes de cargar la tipografía** | Se probó pintar el cuerpo **después de su primer `onLayout`** (bandera `cuerpoListo`): **no arregló nada**. |

---

## 5. Siguientes pasos, por orden de probabilidad

### 5.1 `removeClippedSubviews` / `collapsable` (lo primero que probaría)
El síntoma «el nodo existe en el árbol pero no se compone/dibuja» es el clásico de recorte nativo.
Probar en el contenedor del cuerpo (y, si no, en el `View` raíz de la pantalla):
```tsx
<View style={{ flex: 1 }} collapsable={false} removeClippedSubviews={false} …>
```
Y en el `View` raíz: `renderToHardwareTextureAndroid` / `needsOffscreenAlphaCompositing` como último
recurso.

### 5.2 Bisecar los hijos del cuerpo (el patrón lo pide)
Lo observado: **con el aviso de error presente, se dibujaba el aviso y nada más**; sin él, ni la ficha.
Eso huele a que **un hijo concreto tumba el dibujo de los que vienen detrás**. Dejar **un solo hijo**
cada vez y comprobar con captura + volcado: primero un `<Text>` suelto; luego la ficha (`styles.card`);
luego un `Chip`; luego `<SelectorDeCupon>`; luego los `TextInput`.

### 5.3 Repetir el descarte de `expo-image` con el cuerpo en `View`
Cambiar la ficha por el hueco de «sin foto» (una línea, `{false ? <Image…/> : <View…/>}`) **y compilar**
(la prueba anterior no se llegó a compilar nunca con el cuerpo en `View`).

### 5.4 `FlatList` en vez de `ScrollView`
Es otro contenedor nativo distinto; si el `ScrollView` no se monta en esta pantalla, puede que la
`FlatList` sí. También vale probar `ScrollView` **anidado dentro de un `View` con altura explícita**.

### 5.5 Comparar con otras cajas del mismo estilo
`app/food-checkout.tsx` y `app/ecomerse-checkout.tsx` usan **el mismo patrón** (`KeyboardAvoidingView`
+ `ScrollView` + pie fijo). Abrirlas en el móvil: **si también fallan**, el culpable es el patrón (y el
arreglo del carrito —quitar el envoltorio— es la pista); **si funcionan**, hay algo propio de la caja
del producto. (Se abren por enlace: `/food-checkout?restaurantId=…`, `/ecomerse-checkout`.)

### 5.6 Logcat buscando quejas de Yoga/Fabric
```
adb logcat -d | Select-String 'Yoga|Mounting|ReactNoCrash|Fabric|clipped'
```
En las pruebas anteriores el logcat solo tenía ruido del sistema (Tethering, notificaciones), **sin
líneas `ReactNativeJS`** (el build es release y no parece volcar los `console.warn`).

---

## 6. Cómo reproducir y medir (comandos exactos)

```powershell
cd D:\egapp
npx tsc --noEmit -p tsconfig.json          # SIEMPRE antes de emitir (tsc emite aunque falle)
.\compilar-apk.ps1                          # compila e instala (~1-2 min; respeta .build-lock.txt)

$adb = 'D:\SDK.android studio\platform-tools\adb.exe'
& $adb shell am force-stop com.egrouteplan.app
& $adb shell monkey -p com.egrouteplan.app -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 7

# Abrir la caja SIN TOCAR LA PANTALLA (enlace directo; el `am start` avisa si ya hay instancia)
& $adb shell am start -a android.intent.action.VIEW -d "egrouteplan://lifebook-checkout?productId=d47de72c-bf3e-4701-9535-e85f6f52d74b&quantity=1"

# Árbol de la interfaz
& $adb shell uiautomator dump /sdcard/x.xml; & $adb shell cat /sdcard/x.xml > x.xml

# Captura (¡con `pull`, no redirigiendo binario en PowerShell 5.1: se corrompe!)
& $adb shell screencap -p /sdcard/x.png; & $adb pull /sdcard/x.png x.png
```
Para medir la «tinta» por zonas de una captura (es lo que destapó que el árbol y los píxeles se
contradicen): abrir el PNG con `System.Drawing` y contar píxeles que se apartan del color de fondo
⚠️ **con umbral bajo (≈25)**: el móvil está en **modo oscuro** y el fondo es `(23,23,26)`; con umbral 40
un texto negro sobre ese fondo no se detecta.

**Reglas del dueño que hay que respetar:** no tocar `api/lifebook.ts` ni
`components/FloatingFooter.tsx`; **las pruebas de pantalla las hace él** (los toques automáticos ya
crearon pedidos reales dos veces — el enlace directo del punto 6 no toca nada); y decir siempre lo que
NO queda verificado.

---

## 7. Estado del código y del APK (importante para no liarse)

- **Instalado en el móvil: el build de las 16:22.** Ese build lleva: en las dos cajas, sin
  `KeyboardAvoidingView`; la caja del carrito con `ScrollView` (`style={{flex:1}}`); **la caja del
  producto con el cuerpo en un `View` normal** + la bandera `cuerpoListo` (pinta el contenido después
  del primer `onLayout` del cuerpo).
- **En el árbol de trabajo no hay pruebas a medias**: quité la última (`{false ? <Image…/>…}`) y
  `tsc --noEmit` está en **0 errores**. La copia con `ScrollView` de la caja del producto está guardada
  en `.tmp-compra/lifebook-checkout.con-scrollview.tsx` por si hace falta comparar.
- **Evidencia guardada** en `D:\egapp\.tmp-compra\`: `ok.xml` + `ok.png` (la caja rota de ahora),
  `cart.xml` (la del carrito, que funciona), `prod.xml` (la ficha del producto, que funciona),
  `caja.png`, `x.png`, `m.xml` (insets medidos), `caja2.xml` (la primera vez que el dueño la dejó
  abierta), y las copias del servidor (`orders.service.ts`, `commerce.service.ts`,
  `lifebook.service.ts`, `orders.controller.ts`).
- **Servidor**: parches 73, 74 y 75 aplicados, `tsc --noEmit` en 0, `pm2` `online`, migración
  `pruebas/74-cupon-en-el-pedido.sql` aplicada. No hay nada pendiente allí.
- **Docs**: `docs/TANDA-P-COMPRA-PAGO-Y-TICKET.md` y `docs/TANDA-Q-CUPONES-Y-BOTON-DE-PAGAR.md` cuentan
  lo hecho antes de este bug; este documento es el traspaso del bug abierto.

## 8. Lo que el dueño necesita, en una frase

Poder comprar desde la **ficha de un producto** («Comprar» → «Finalizar pedido»): ver el artículo, el
precio, elegir la forma de pago, ver el cupón y confirmar. Hoy eso solo funciona entrando por el
**carrito**.
