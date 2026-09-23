# Destello blanco al abrir pantallas — causa medida y arreglo

> Agente de plataforma, 2026-09-12. Aplica al **A2** de `PLAN-BLOQUES-LIKEBOOK.md`.

## 1. Lo que se midió (no es una impresión)

Con el Poco F5 **en modo oscuro**, cerrando la app y volviéndola a abrir, capturando pantallazos en
ráfaga **desde el propio móvil** (`screencap`, ~150 ms entre capturas; `screenrecord` no funciona en este
ROM: «Unable to open … Permission denied») y midiendo la luma media de cada captura:

```
 1  luma 246.0  ← casi blanco
 2  luma 246.4  ← casi blanco
 3  luma  34.0
 …  luma  40.4  (la app oscura, estable)
```

**246,4 de 255 es exactamente `#F5F7FA`**, que era el `backgroundColor` de `app.json` y el
`android:windowBackground` del tema nativo. Es decir: el fogonazo no lo pinta la app, lo pinta **Android
con el color de la ventana**, desde que arranca la actividad hasta que la app dibuja su primer fotograma.
En modo claro no se nota (claro sobre claro); en oscuro deslumbra.

Lo que **no** es: el cambio de canal dentro del feed («Para ti» → «Siguiendo» → «Cerca») **no destella**
(0 capturas casi blancas, luma 34–40 estable). Ese no era el problema, aunque pareciera.

## 2. El arreglo

**Capa nativa (la causa):**
- `android/app/src/main/res/values-night/colors.xml` **estaba vacío** (`<resources/>`): por eso en modo
  oscuro se usaba el color claro. Ahora lleva los colores del tema oscuro (`#17171A`, que es
  `darkColors.background` de `packages/ui-kit/src/theme/colors.ts`).
- `values/colors.xml`: `activityBackground` pasa de `#F5F7FA` (color de «superficie») a `#FFFFFF`, que es
  el fondo real del tema claro.
- `app.json`: `backgroundColor` a `#FFFFFF` (para que un `prebuild` futuro escriba el valor claro correcto).

**Capa del navegador (prevención de transiciones):**
- `app/_layout.tsx`: el `Stack` va envuelto en el **tema de React Navigation** con nuestros colores
  (`background` y `card` = fondo del tema) y con `contentStyle: { backgroundColor: colors.background }`.
  Sin eso, el navegador pinta su fondo por defecto (claro) detrás de cada pantalla nueva mientras dibuja.
- El contenedor raíz de la navegación lleva el fondo del tema.

⚠️ **Para el otro agente:** si algún día se ejecuta `expo prebuild`, `values/colors.xml` se regenera desde
`app.json` y **`values-night/colors.xml` se vacía otra vez** → el destello vuelve. Hay que reponer las
cuatro líneas (está avisado dentro del propio fichero).

## 3. Cómo comprobarlo (el mismo instrumento)

```powershell
cd D:\egapp
.\lb49-medir-destello.ps1 -Modo arranque -Etiqueta despues
```

### Resultado medido (antes → después), en el mismo Poco F5 con el móvil en modo oscuro

| | fotogramas casi blancos | luma máxima | luma de la app |
|---|---|---|---|
| **Antes** | **2** (246,0 y 246,4) | 246,4 | 40,4 |
| **Después** | **0** | 41,1 | 41,1 |

Y en **modo claro**, para asegurar que los recursos de noche no se cuelan: los fotogramas del arranque son
252 → 244 → 215 y la app se queda en 187, **sin ningún fotograma oscuro** (mínimo 187). El blanco del
arranque en claro es correcto: el tema claro de la app es blanco (`#FFFFFF`).

El instrumento mide la **luma media** de cada pantallazo muestreando uno de cada 16 píxeles; no depende de
ffmpeg ni de mirar imágenes a ojo.
