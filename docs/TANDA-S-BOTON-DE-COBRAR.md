# TANDA S — EL BOTÓN DE «MARCAR COBRADO» EN LA APP (lo que faltaba de la §1)

> **Para quién es:** el dueño (que prueba en pantalla) y el otro agente.
>
> **De dónde sale:** el punto 5 de `docs/ACCION-INMEDIATA-PARA-EL-OTRO-AGENTE.md`. El dueño decidió que
> **entregar solo cierra el cobro de lo que se paga al recoger** (contra entrega y pago en tienda). Lo
> demás —transferencia, facturación, depósito, monedero— lo cobra la tienda **por fuera de la app**, así
> que necesita poder marcarlo. La mitad de servidor está en `docs/TANDA-R-ORDEN-Y-DINERO.md` → **R.5b**
> (`POST /lifebook/commerce/orders/:id/mark-paid`, probado con 14 comprobaciones en `pruebas/lb80a`).
> **Esto es el botón que faltaba para poder usarlo desde el móvil.**

---

## Qué se ha añadido (tres ficheros, ninguno prohibido)

| Fichero | Qué |
|---|---|
| `api/commerce.ts` | `commerceOrdersApi.marcarCobrado(id, { proofUrl, note })` → llama a `POST :id/mark-paid`. Y `LbOrder` gana `paymentProofUrl` y `paymentNote` (los devuelve el detalle para los dos). |
| `app/lifebook-order/[id].tsx` | La caja **«¿Ya te han pagado? (Transferencia)»**, solo para la tienda, con la **referencia** y el **justificante**; el bloque **Cobrado · (fecha)** en la ficha del dinero con la nota y **Ver el justificante** (que lo ven los dos); y el **visor del justificante dentro de la app** (ver el fallo del XML más abajo). |
| (se reutiliza) | `lifebookMediaApi.uploadFile` para subir la foto del justificante — el **mismo camino que usa el chat** para mandar una foto (no se ha tocado `api/lifebook.ts`, solo se importa). |

**Detalles que importan:**

* La caja sale **solo si eres la tienda**, el pedido **no está cancelado ni en reclamación**, y
  **`paymentStatus !== 'paid'`**. Si ya está cobrado, en su lugar se ve el cobro.
* El **justificante es opcional** (decisión abierta, ver abajo): el botón funciona sin foto; la foto se
  sube **antes** de marcar, y si la subida falla se dice y no se pierde nada.
* El cobro se enseña con **fecha**, **nota** y **enlace al justificante** para el comprador y para la
  tienda: el rastro es de los dos (lo garantiza el servidor, no la pantalla).
* Se respeta la regla del `width: '100%'` en fila: el `PrimaryButton` va **en columna**, dentro de la
  caja (igual que el bloque del código de entrega, que ya funciona).

## Cómo se comprueba (el dueño, en pantalla)

1. Abrir un pedido **como tienda** cuyo pago sea transferencia, facturación o depósito.
2. Tiene que salir **«¿Ya te han pagado? (Transferencia)»** con el campo de la referencia, el botón
   **Adjuntar justificante (opcional)** y el botón **Marcar cobrado**. Sale **después** de las acciones
   (aceptar/preparar/entregar), a propósito: lo principal no puede quedar debajo del pliegue.
3. Pulsar **Marcar cobrado** (con o sin foto) → mensaje «Cobrado» y, en la misma pantalla, la fila
   **Cobrado · (fecha)** dentro de la ficha del dinero, con la **referencia** y **Ver el justificante**.
4. En el **chat con el comprador** tiene que aparecer el aviso «La tienda ha marcado tu pedido como
   cobrado ✅», y en el detalle del pedido **del comprador** lo mismo.

## Lo que YA está medido en pantalla (la parte del comprador, 15/09)

El móvil tiene la sesión del dueño (comprador), así que el botón de la tienda no se puede medir desde
aquí; **la parte del comprador sí, y está medida** con el APK instalado (`lastUpdateTime=18:28:41`),
creando un pedido por transferencia en esa misma cuenta (`pruebas/lb81a-cobro-en-pantalla.cjs`) y
abriéndolo por enlace, sin tocar la pantalla:

| Momento | Textos | Lo que se ve |
|---|---|---|
| Antes de cobrar | 28 | `Pago · Transferencia / Orange Money`, **sin** ninguna caja de la tienda (correcto: el comprador no la ve) y **sin** «Cobrado» |
| Después de que la tienda lo marca (`mark-paid` → HTTP 201) | 31 | **`Cobrado` · `2026/9/15`** en la ficha del dinero, **`Cobro: Transferencia BGFI ref. 99123`** y **`Ver el justificante`** (nodo con `clickable="true"`) |

Comprobado además, con un desplazamiento (un gesto, no un toque que cree nada), que el chip **«Cancelar
pedido»** sigue en la pantalla: el bloque nuevo lo empujó **justo debajo del pliegue** y con el
desplazamiento aparece. No se ha perdido ninguna acción.

**Sin comprobar todavía:** la caja de la tienda («¿Ya te han pagado?») y el botón **Marcar cobrado** en
pantalla — eso necesita la sesión de la tienda en el móvil, y el móvil es del dueño. Es la prueba 1-3 de
arriba. Lo que **sí** está probado: el servidor (`lb80a`, 14 comprobaciones) y que la app **compila**
(`npx tsc --noEmit` en 0) y **se instala**.

Los datos de la prueba se han dejado limpios: el pedido `LB-260915-0026` quedó **cancelado** (le había
marcado el cobro el test; se devolvió a `pending` para no dejar un cancelado que figura cobrado) y el
**stock volvió a 20** con `sales_count` a 0.

## El fallo que encontró el dueño («Ver el justificante» abría una página con XML) — ARREGLADO

**Lo que pasó:** al pulsar *Ver el justificante* se abría el **navegador** y salía una página que solo
enseñaba **el XML del almacenamiento**. Eran **dos cosas mías**, las dos:

1. **La URL del justificante de mis pruebas no existía.** Me la inventé
   (`…/lb-images/justificante-de-prueba.jpg`); al pedirla, el almacén contesta **404 con un XML de
   error**. Culpa mía: para probar había que **subir un fichero de verdad**.
2. **Abrir el enlace fuera de la app es mala idea para un justificante**, aunque el enlace sea bueno:
   saca al usuario de la app y, si algo falla, le deja en una página técnica.

**El arreglo (app):** el justificante ahora se mira **dentro de la app**, en un visor oscuro a pantalla
completa (`Modal` + la foto con `contentFit="contain"`), con un botón **Cerrar**. Y si el enlace no
cargara, se dice **con palabras** («No se pudo cargar el justificante. La tienda lo tiene en su
teléfono.») en vez de mandar a nadie a una página de error. Ya **no se usa `Linking`**.

**Verificado en pantalla (15/09, APK de 18:32):** pedido `LB-260915-0027` (transferencia, en la cuenta
del móvil), marcado cobrado por la tienda con un justificante **de verdad**:

* toco *Ver el justificante* → se abre el visor (**«Justificante del cobro»** + **Cerrar**, y **sin**
  el mensaje de error);
* la captura lo confirma **midiendo píxeles**: el centro de la pantalla sale **RGB 250,250,248** (el
  color exacto de la imagen de prueba), la foto ocupa de **y 900 a 1540**, y alrededor el fondo del
  visor está **casi negro (2,2,2 / 8,8,9)**. O sea: **la foto se pinta**, no es un hueco vacío;
* al cerrar (botón atrás) se vuelve al pedido con sus 31 textos.

**Cómo se sube un justificante de verdad** (lo que faltaba para poder probar):
`pruebas/lb82a-subir-justificante-real.cjs` sube un fichero local **por el mismo camino que la app**
(`POST /lifebook/media/upload?kind=image`, multipart) y **comprueba que la URL devuelve bytes de
imagen** (no una página de error con otro nombre). Devuelve la URL para pasarla en `LB_JUSTIFICANTE`.
El fichero de prueba lo genera `.tmp-compra/justificante.png` (un recibo legible «de mentira», con la
referencia y el importe).

**Hallazgo aparte, del mismo día:** la imagen del producto de prueba que estaba usando como origen
(`…/lb-images/e2e.jpg`) **también está muerta (404 + `application/xml`)** — es un objeto que falta en el
almacén. No afecta a este arreglo, pero conviene saberlo: **un enlace caído en el catálogo se ve como un
hueco en la ficha**, y ahora mismo no hay nada que avise de eso.

## Decisión abierta (una sola)

**¿El justificante es obligatorio?** Hoy es opcional: obligarlo bloquearía a una tienda que cobró un
depósito en efectivo sin recibo. Si el dueño lo quiere obligatorio, es cambiar en `markPaid`
(`orders.service.ts`) la línea del justificante por un `throw` cuando venga vacío — está señalado en
`pruebas/parche80-justificante.py` — y volver a probar con `lb80a`.

## Hallazgo que sigue abierto (no se ha inventado nada)

Cancelar un pedido **ya cobrado** no toca el cobro: en una tienda de verdad eso es un **reembolso
pendiente**, y la app no tiene ese flujo (el patrón sí existe en Billing: `refunded`,
`refund_status_partial`). Va con el punto de **devoluciones y disputas** (`§3.7`), no aquí.
