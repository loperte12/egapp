# Plan B · Congelar el núcleo compartido (2–3 semanas)

**Qué es.** El plan para que los otros módulos dejen de **re-inventar** y dejen de **colisionar**. No es
un plan de pantallas: es el de las **tres costuras** de `LEY-DEL-PROYECTO.md` §3. Cuando las tres estén
cerradas, cada módulo nuevo arranca con el **mismo** contrato, el **mismo** kit y la **misma** entrega, y
la ingeniería inversa deja de pelearse con la app.

**Estado medido el 17/10/2026** (no de memoria: contado en el árbol):

| Costura | Hoy | Falta |
|---|---|---|
| Contrato | `uiContrato.ts` 65 líneas, `ESQUEMA_UI = 1`, rechazo si no coincide; `api/ecomerseUi.ts` 156 | política de versión escrita · prueba explícita de rechazo |
| Kit | 26 componentes + 25 módulos puros; `npm run diseno` verde; clave por tabla, no hexadecimal | guía de «cómo se añade un widget» · los dos fallos de maquetación documentados |
| Entrega | despliegue de **6** ficheros · oráculo **13 ficheros / 148 pruebas** · guardias `tsc`/`diseno`/`logica`/`rutas` | publicar **desde git** · guardias automáticas · checklist de móvil único |

---

## Costura 1 · Contrato (semana 1)

**Qué significa congelado**: el árbol que manda el servidor y el que pinta la app hablan **una sola
versión**, y hay una regla escrita para cambiarla.

**Tareas**

1. **Política de versión** (media página): qué es un cambio compatible (un valor nuevo en un atributo
   existente) y qué NO (un tipo nuevo, una clave nueva, un cambio de tipo de valor). Lo segundo sube
   `ESQUEMA_UI` y el cliente **deja de pintar** hasta actualizarse. Esa es la garantía, no un deseo.
2. **Prueba de rechazo explícita** en el oráculo: un cuerpo con `esquema: 2` **no se pinta** y no lanza.
   Hoy la comprobación existe (`uiContrato.ts:63`); falta la prueba que lo fije.
3. **Documento vivo del contrato**: los 14 tipos y sus claves, en un solo sitio enlazado desde la ley
   (hoy está repartido entre `uiContrato.ts`, las tablas `*Atributos.ts` y `mercado-fase1/CONTRATO-ARBOL-SERVIDOR.md`).

**Aceptación**: las 148 pasan, más la prueba de rechazo; el documento del contrato enlazado desde la ley.

---

## Costura 2 · Kit y motor de UI (semana 1–2)

**Qué significa congelado**: añadir un widget es **copiar una tabla pura, escribir su componente y
probarlo**; no se toca el motor. Y los fallos de maquetación que costaron días quedan escritos.

**Tareas**

1. **Guía «cómo se añade un widget»** (una página, con el ejemplo de `Texto`):
   - tabla de claves **pura** en `<widget>Atributos.ts` (con `PROCEDENCIA` y `CONFIANZA`);
   - componente que **sólo** lee la resolución (nada de lógica en el `.tsx`);
   - el tipo entra en `TIPOS_SOPORTADOS` (lista blanca del contrato);
   - prueba en el oráculo: la clave existe, el tipo está, y **ningún texto lleva claves de contenedor**.
2. **Dos lecciones que hoy son código pero no doctrina** (y volverán a morder si no se escriben):
   - **`LAYOUT_WIDTH` no es de un texto**: en un `Texto` se traduce a `width: -1` y el rótulo queda
     invisible. La prueba ya existe (`claves.test.mjs`); falta que esté en la guía.
   - **La celda sin ancho**: en una `Lista` de **una columna**, la celda de una fila flexbox mide su
     contenido; una tarjeta de sólo textos se colapsa. Se arregló con `flex: 1` en la celda vertical
     (`components/ecomerse/Lista.tsx`); falta que esté en la guía.
3. **Tokens de diseño**: `npm run diseno` ya impide hexadecimal fuera de los tokens. Añadir al documento
   **la tabla de tokens** con su uso (texto, fondo, acento, peligro…).

**Aceptación**: un widget de ejemplo (p. ej. `Icono`) escrito **sólo** con la guía, por alguien que no
haya tocado el kit; las 148 pruebas pasan.

---

## Costura 3 · Cadena de entrega (semana 2–3)

**Qué significa congelado**: **lo que está en producción es lo que está en git**, y las guardias corren
sin que nadie se acuerde.

**Tareas**

1. **Publicar desde git, no desde una lista escrita a mano.** Hoy
   `pruebas/desplegar-ui-mercado.cjs` empuja **6 ficheros nombrados**; eso ya falló una vez (empujaba 2 y
   el backend no viajaba). El paso siguiente es: leer los ficheros de `git ls-files` bajo `dist/src/` y
   **comparar hashes** antes y después de publicar.
2. **Guardias automáticas**: un único comando `npm run verificar` que encadene `tsc`, oráculo,
   `diseno`, `logica` y `rutas`, y que el despliegue **se niegue** a publicar si falla.
3. **Checklist de móvil único** (`docs/VERIFICACION-MOVIL.md`): arrancar la app, abrir la pantalla,
   comprobar el **estado normal** y el de **fallo**, guardar captura, y anotar la sesión (caducada o no).
   Hoy está disperso en los relevos.
4. **Entorno**: C: se quedó sin espacio (0 bytes) y tumbó un commit. Dejar una nota de higiene en el
   checklist: espacio libre mínimo y temporales.

**Aceptación**: un despliegue que (a) publica exactamente lo commiteado, (b) falla si las guardias
fallan, y (c) deja registro con los sha. Comprobado con un despliegue real y un `--comprobar`.

---

## Cómo se mide que el núcleo está congelado

| Síntoma de que faltaba | Después |
|---|---|
| «el despliegue decía OK y el backend no viajaba» | el despliegue compara git y hashes |
| «la app no usaba el servidor local» | el checklist de móvil lo comprueba **antes** de iterar |
| «el mismo fallo en dos módulos» | la guía del kit lo impide con una prueba |
| «la ficha decía una cosa y la pantalla otra» | el contrato versionado y su prueba de rechazo |
| «la RE y el código en el mismo paso» | la ficha es el único puente |

---

## La cola de módulos (C: uno en vuelo)

**No** se aprueba un módulo sin su ficha y su inventario de material. Orden por **calidad de material**:

| # | Módulo | Pantallas | Material que tenemos | Calidad | Estado |
|---|---|---|---|---|---|
| 1 | **Mercado** (compra online) | 22 | APK de Taobao (assets + capturas) + documentación propia | **alta** | **en vuelo**: ficha de 关注 hecha; quedan rebanadas |
| 2 | **Red social** (lifebook) | **48** | por inventariar | ? | pendiente de inventario |
| 3 | **Comida** | 6 | por inventariar | ? | pendiente |
| 4 | **Taxi** | 5 | por inventariar | ? | pendiente |
| 5 | **Interurbano** | 3 | por inventariar | ? | pendiente |
| 6 | **Monedero / pagos** | 6 | por inventariar | ? | pendiente |
| 7 | **Panel del comerciante** (Qianniu) | — | **instalador** (24 MB), no el cliente | **baja** → instalar y capturar | pendiente |

**Backend ya existente** (para el inventario): `ads`, `billing`, `ecomerse`, `food`, `intercity`,
`lifebook`, `mobility`, `rental`, `services`, `tts`, `work`. Cada módulo entra por su servicio.

---

## Lo que queda del Mercado como **fichas** (no como ideas sueltas)

Estas tres eran deudas de la línea anterior; así se cierran:

| Rebanada | Costura | Aceptación | Retirada |
|---|---|---|---|
| Retirar la pantalla vieja de tiendas seguidas | Kit/entrega | `关注` sin la pantalla vieja; `rutas` verde | borrar `app/ecomerse-perfil-tiendas.tsx` en el mismo commit |
| Intercalar producto en el feed (mecanismo listo) | Contrato | un feed mixto en el móvil con captura | — |
| Decidir A o B de 关注 (feed vs tiendas) | Contrato | **ficha nueva** con la captura de la página de tiendas; sin captura, **no se implementa** | — |
