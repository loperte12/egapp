# Tanda O — DICTAR en Cucucul (la voz se convierte en texto)

> Hecho el 15/09/2026. Es el **punto 1** de «lo que falta» del traspaso. El dueño eligió la vía
> (**dictado en el móvil**, la que ya estaba aprobada en la tanda N) y que se **compilara e instalara
> en el Poco F5**.

---

## 1. Qué se hizo

| Fichero | Cambio |
|---|---|
| `package.json` | Dependencia nueva: **`expo-speech-recognition@2.1.5`** (el tag `sdk-53` de npm; el proyecto es Expo 53) |
| `app.json` | El plugin `expo-speech-recognition` con los textos de permiso; `RECORD_AUDIO` en la lista de permisos de Android |
| `android/app/src/main/AndroidManifest.xml` | Bloque `<queries>` con `com.google.android.googlequicksearchbox` y `android.speech.RecognitionService` |
| `app/lifebook-ai.tsx` | El **botón de micro** en la barra de escribir, y todo el dictado |

**El bloque `<queries>` no es decorativo**: desde Android 11 una app no «ve» los servicios del
sistema salvo que los declare. Sin él, `start()` falla con `service-not-allowed` y el micro parecería
roto aunque el permiso estuviera concedido.

**El servidor NO se toca**: no hay ruta nueva ni parche. Cucucul sigue recibiendo texto por la ruta de
siempre (`POST /lifebook/ai/chat`), como si se hubiera escrito a mano.

## 2. Cómo se comporta (y por qué)

| Caso | Qué pasa |
|---|---|
| Toque en el micro | La primera vez pide el permiso del micrófono; después empieza a escuchar en **español** (`es-ES`) |
| Mientras escucha | El micro se pone **rojo** y el campo dice «Te escucho»; el texto va cayendo en el campo según se habla |
| Otro toque en el micro, o Enviar | Se para de escuchar |
| Ya había texto escrito | El dictado se **AÑADE** a lo que había: no borra nada |
| El permiso está denegado | Se avisa y se ofrecen **«Escribir»** y **«Ajustes»** (nunca un botón muerto) |
| El móvil no tiene reconocedor | Se dice: «Este móvil no sabe dictar: puedes escribir tu pregunta» |
| Sin conexión | «El dictado necesita conexión y ahora mismo no la hay» |
| Silencio (no se oye nada) | «No te he oído. Prueba otra vez» |
| Se sale de la pantalla | El micro se **apaga** (`abort`): no se queda escuchando por detrás |

Dos decisiones que conviene no deshacer sin querer:

* **No se envía solo.** El dictado llena el campo de escribir y se manda con el botón de siempre.
  Enviar media frase a medio dictar es justo lo que no quiere nadie.
* **En esta vía no se guarda el audio**: no hay burbuja de audio, sólo texto. Cucucul recibe texto
  porque **la API de DeepSeek no acepta audio**. La otra vía posible —grabar con `expo-audio` (ya
  está en la app) y transcribir en el servidor con un modelo de audio de DashScope— **no está hecha**;
  costaría por minuto de audio y daría burbuja de audio de verdad.

## 3. Lo verificado y lo que NO

| Cosa | Cómo se comprobó | Estado |
|---|---|---|
| Tipos de la app | `npx tsc --noEmit -p tsconfig.json` → 0 errores | ✅ |
| Compila e instala | `compilar-apk.ps1`: BUILD SUCCESSFUL en 2m 44s; instalado `com.egrouteplan.app` (110,9 MB) | ✅ |
| El módulo nativo entró de verdad en el APK | `classes3.dex` del APK contiene `ExpoSpeechRecognition` (el autolinking lo enlazó) | ✅ |
| Permiso y visibilidad dentro del APK | `aapt2 dump xmltree`: `RECORD_AUDIO` + `<queries>` con `googlequicksearchbox` y `RecognitionService` | ✅ |
| **Dictar hablando en español** | Probado **en pantalla** por el dueño el 15/09/2026 | ❌ **FALLA**: sale «No se pudo dictar. Puedes escribir tu pregunta.» |
| Cómo se ve el botón en la pantalla (la barra lleva ahora 3 botones) | En pantalla | ✅ el botón está y se puede tocar |

**Qué dice exactamente ese mensaje (y qué descarta).** Es el texto del caso `default` de
`mensajeDeDictado`, así que **no** es ninguna de las otras salidas: no es «Este móvil no sabe dictar»
(el reconocedor existe), no es la alerta de permiso (el permiso **se concedió**), y no es «No se pudo
empezar a dictar» (no falló el arranque). Es decir: el dictado **arrancó** y luego el reconocedor de
Android devolvió un error cuyo código no está traducido todavía — los candidatos son `client`
(`ERROR_CLIENT` = 5, el más común cuando el servicio de reconocimiento no responde), `audio-capture` o
`unknown`.

**Por dónde seguiría (cuando se retome)**: 1) coger el código exacto con `adb logcat` mientras se
pulsa el micro; 2) mirar **qué servicio de reconocimiento tiene ese móvil**
(`ExpoSpeechRecognitionModule.getSpeechRecognitionServices()` / `getDefaultRecognitionService()`) y si
su paquete está declarado en el `<queries>` del manifiesto (ahora sólo está
`com.google.android.googlequicksearchbox`; si el del Poco F5 es otro —`com.google.android.as`, etc.—
habría que añadirlo); 3) probar sin `continuous` (no está soportado en Android 12 o anterior) y con
`requiresOnDeviceRecognition` para separar «fallo de red» de «fallo del servicio».

**Decisión del dueño (15/09/2026): esto se APARTA.** El esfuerzo se pasa a
`docs/PENDIENTE-COMPRA-PAGO-Y-TICKET.md`. El botón se queda puesto: si falla, lo dice y se puede
escribir igual.

**Por qué no se probó**: el móvil estaba en uso cuando terminó la compilación y el traspaso dice que
**las pruebas de pantalla las hace el dueño** (los toques automáticos ya crearon pedidos reales dos
veces). No se tocó la pantalla.

## 4. La prueba de pantalla (para el dueño)

1. Abrir Cucucul (el botón flotante) y tocar el **micro** (🎤, a la izquierda de Enviar).
2. Conceder el permiso cuando lo pida Android.
3. Hablar en español: el texto debe ir apareciendo en el campo; el micro se pone **rojo**.
4. Tocar el micro otra vez (o Enviar) para parar y mandar la pregunta.

Si sale «Sin permiso del micrófono» aunque se haya concedido: **Ajustes → Aplicaciones → EG Route
Plan → Permisos → Micrófono**. Si sale «Este móvil no sabe dictar»: al móvil le falta el servicio de
reconocimiento de voz (la app de Google) o está deshabilitado.
