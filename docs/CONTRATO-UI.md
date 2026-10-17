# El contrato cliente ↔ servidor (documento vivo)

**Qué fija este documento.** La forma exacta de lo que el servidor manda para pintar UI, quién la
valida, y **cuándo hay que subir la versión**. Es el documento de la **costura 1** de la
[ley del proyecto](LEY-DEL-PROYECTO.md) §3. Si el código y este documento se contradicen, **el que
está mal es el código** (o este documento, y entonces se cambia aquí primero, a propósito).

**Versión actual: `1`** · congelada el **17/10/2026**.

---

## 1 · El sobre

```json
{ "esquema": 1, "arbol": { "tipo": "…", "valor": "…", "atributos": { … }, "hijos": [ … ] }, "datos": { … } }
```

| campo | qué es | obligatorio |
|---|---|---|
| `esquema` | **número** de versión de la forma. Entero. Un `"1"` en texto **no vale** | sí |
| `arbol` | el árbol de widgets. **`null` es legítimo**: «no hay nada que pintar» | sí (puede ser `null`) |
| `datos` | contra lo que se resuelven los bindings del árbol (`$item.titulo`) | no |

Y las cuatro reglas de interpretación, que son decisiones (no defectos):

| qué llega | qué se hace | por qué |
|---|---|---|
| `esquema` distinto al del cliente | **no se pinta** | un árbol de otra versión puede traer claves con otro significado; pintarlo «como se pueda» es mostrar datos equivocados con tranquilidad |
| `arbol: null` | **no se pinta, y NO es un error** | «no hay nada» es un estado legítimo; distinguirlo de un fallo importa (uno se reintenta, el otro no) |
| cuerpo vacío o no-JSON | no se pinta | un 200 con basura es un servidor mal configurado |
| `tipo` que no es texto o vacío | no se pinta | sin `tipo` no hay nada que buscar en la lista blanca |

**Ninguna de estas lanza.** Una sección que no se puede pintar no tumba la pantalla: el resto de la
vista es utilizable.

---

## 2 · Dónde vive (y por qué está tres veces)

| sitio | para qué | fichero |
|---|---|---|
| **valida** | `interpretarRespuestaUi` decide si se pinta | `components/ecomerse/uiContrato.ts` (`ESQUEMA_UI`) |
| **declara** | `capacidades().versionEsquema` le dice al servidor qué versión pinta | `components/ecomerse/renderizadorNucleo.ts` (`VERSION_ESQUEMA`) |
| **manda** | el cuerpo de la respuesta lleva `esquema` | `ecomerse-ui.controller.js` (`ESQUEMA_UI`) |

**Por qué tres copias**: el módulo del renderizador y el del contrato son **autocontenidos a propósito**
(no se importan entre sí) para poder probarlos en Node sin arrastrar React; y el servidor es otro
runtime. Es la misma razón por la que `RAIZ_ENTORNO` está dos veces y hay un test que fija que son la
misma cadena.

**Y por eso hay un test**: `mercado-fase1/o1-oraculo/test/contratoVersion.test.mjs` comprueba que
**las tres valen lo mismo**, que **lo declarado es lo aceptado** (`capacidades()` ↔ `interpretarRespuestaUi`)
y que **la lista de tipos está congelada**. Sin ese test, subir una copia y no las otras deja la
pantalla vacía y el despliegue en verde.

---

## 3 · La política de versión (lo que se puede y lo que no)

### 3.1 · Cambios COMPATIBLES — no suben la versión

- **Un valor nuevo** en un atributo que **ya existe** (p. ej. un `tipo` de botón nuevo, un `ajuste` nuevo).
  El cliente lo ignora si no lo conoce, y sigue pintando.
- **Una clave nueva en `datos`** (un campo más del modelo): los bindings que no la usan no se enteran.
- **Un `templateName` nuevo** apuntando a una plantilla **que ya viaja en el árbol**.
- **Textos, colores y medidas** (son datos/atributos, no forma).
- **Quitar un nodo** del árbol, o devolver `arbol: null` en un caso más.

### 3.2 · Cambios QUE OBLIGAN a subir la versión (a `2`)

- **Un tipo de widget nuevo** en la lista blanca, o **quitar** uno.
- **Una clave nueva** (un `atributo` que antes no existía) — porque un cliente viejo la ignora y el
  resultado es una tarjeta a medias sin avisar.
- **Cambiar el tipo de un valor**: `"180"` (texto) → `180` (número), o al revés.
- **Cambiar el significado** de una clave existente (el mismo nombre para otra cosa).
- **Cambiar la sintaxis de los bindings** (`$item.x`, prefijos `ext:`).
- **Cambiar la degradación** (qué pasa con un tipo desconocido).

### 3.3 · Cómo se sube (el procedimiento, no la intención)

1. **Cambian los dos lados en el mismo commit/despliegue**: el cliente (las dos constantes + el test)
   y el servidor. Si se despliega uno solo, hay una ventana en la que **no se pinta**.
2. **El test** `contratoVersion.test.mjs` se actualiza a propósito (dice la versión nueva y la lista
   nueva) — es el registro de la decisión.
3. **Este documento** se actualiza en el mismo commit (versión, tabla de tipos si cambia).
4. **Deshacer**: se vuelve a la versión anterior en los dos lados. Un cliente nuevo contra un servidor
   viejo **no pinta** (correcto); un cliente viejo contra un servidor nuevo **no pinta** (correcto).
   Nunca hay una combinación que pinte datos mal leídos.

> **Regla de oro**: si dudas si un cambio es compatible, **no lo es**. Subir la versión cuesta un
> despliegue; pintar datos mal leídos cuesta la confianza en todo el contrato.

---

## 4 · Los 14 tipos (lista congelada)

Añadir o quitar uno **es cambiar el contrato** (§3.2) y el test lo obliga.

| tipo canónico | alias aceptados (de Taobao, tal cual) | ¿pinta? | nota |
|---|---|---|---|
| `Vista` | `DXVIEW`, `DXVIEW_VIEW` | sí | contenedor base con transformaciones |
| `Contenedor` | `DXLinearLayout`, `DXVLayout`, + 4 contenedores anónimos por `long` | sí | vocabulario de layout |
| `Texto` | `DXTEXTVIEW`, `DXRICHTEXT`, `DXTEXTSPAN`, `DXCARTTEXTSPAN` | sí | |
| `Imagen` | `DXIMAGEVIEW` | sí | sobre `expo-image` |
| `Icono` | `DX_WIDGET_X_ICON_FONT_VIEW`, `c55f9ffeae4fd920` | sí | sobre `lucide` |
| `Rejilla` | `DX_GRID_LAYOUT` | sí | columnas |
| `CuentaAtras` | `DX_WIDGET_COUNTDOWNVIEW`, `DXCOUNTDOWNVIEW` | sí | |
| `Carrusel` | `DX_SLIDER_LAYOUT`, `DXSLIDERLAYOUT` | sí | avance automático |
| `Scroll` | `DX_SCROLLER_LAYOUT`, `DXSCROLLERLAYOUT` | sí | |
| `Lista` | `DXRECYCLERLAYOUT`, `DX_RECYCLER_LAYOUT`, `DXNATIVERECYCLERVIEW` | sí | plantilla repetida por dato |
| `Entrada` | `DXCARTTEXTINPUT`, `DXTEXTINPUTVIEW`, `DXTEXTINPUT`, + 2 hashes | sí | los dos widgets de entrada |
| `Precio` | `DXMEGAPRICEVIEW`, `2b85a6c2624a8015` | sí | cifra y símbolo a distinto tamaño |
| `Pestanas` | `categoryTab`, `ext:Pestanas` | sí | en Taobao es una **sección**, no un widget |
| `Condicional` | `DXCONDITIONALNODE`, `4861660327064501257` | **no** | **nodo de control**: elige cuál de sus hijos se pinta (1 o 2, ni más) |

---

## 5 · Claves y extensiones (lo que va dentro de `atributos`)

- Las claves de Taobao son **16 dígitos hex** (`579cb14ee9f16dfd`) o **decimales con signo**
  (`-7076735627431451296`). Las dos son legales; la prueba de claves cubre las dos formas.
- Las extensiones nuestras llevan **prefijo `ext:` en minúsculas** (`ext:aspecto`, `ext:tabla`). Es
  para que sea **imposible** confundir una decisión nuestra con una clave medida de Taobao.
- Cada clave vive en su tabla por widget (`<widget>Atributos.ts`), que declara **procedencia**
  (medida/inferida/decisión) y **confianza**. La tabla es **pura** y tiene su prueba.
- **Nada de hexadecimal suelto en el código**: los colores son tokens (`npm run diseno` lo impide).

---

## 6 · Dónde están las pruebas

| prueba | qué fija |
|---|---|
| `test/contratoVersion.test.mjs` | **una sola versión** en los tres sitios · declarado = aceptado · lista de 14 congelada · alias sin colisiones |
| `test/claves.test.mjs` (bloque «EL CONTRATO DEL CLIENTE») | la tabla de rechazo de §1, incluido que **nada lanza** |
| `test/claves.test.mjs` (tabla de claves) | que las claves son las **reales** del APK, no inventadas |
| `test/siguiendo.test.mjs` | que los tipos que el servidor manda **están** en la lista blanca |
| `npm run verificar` | que todo lo anterior corre **antes** de publicar |

---

## 7 · Cambios de este documento

| fecha | versión | qué |
|---|---|---|
| 17/10/2026 | 1 | primera versión escrita: política, 14 tipos, y el test de las tres copias |
