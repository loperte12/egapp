# ACCIÓN INMEDIATA — informe de choque (16/09/2026)

> **Para quién es:** este documento está escrito **para el otro agente** (el que ejecuta sin tener todo
> el contexto de la investigación) y **para el dueño** (la parte que solo puede hacer él).
>
> **Cómo se usa:** no hace falta leerlo entero. La §1 es lo que se hace HOY, en este orden. La §2 es la
> parte del dueño. La §3 son los arreglos de fondo. La §4 son las reglas que NO se rompen.
>
> **De dónde sale:** auditoría de código del 16/09 (con fichero:línea) + investigación de pagos y
> mercado. Todo lo afirmado aquí está verificado en el código o en la investigación; lo dudoso va
> marcado como tal.

---

# 1. LO QUE SE HACE HOY (por orden, y sin saltarse ninguno)

Cada punto trae **qué**, **dónde** y **cómo se comprueba**. Si algo no se puede comprobar, no se hace.

| # | Arreglo | Dónde | Por qué es lo primero | Cómo se comprueba |
|---|---|---|---|---|
| 1 | **Detalle del pedido en blanco** (`lifebook-order/[id]`) | `app/lifebook-order/[id].tsx` | Es el final del embudo: **el comprador no ve su código de entrega** ni el estado. Sin esto no hay compra completa | Abrir por enlace (`egrouteplan://lifebook-order/<id>`) y contar textos en el árbol: con el fallo salen ~2, sano >15. **NO es el patrón del `PrimaryButton`** (sus botones ya van envueltos, verificado) → usar el método de `docs/CAUSA-RAIZ-CUERPO-EN-BLANCO.md` §6: pintar cabecera/cuerpo/pie de colores distintos y ver qué caja se come el alto |
| 2 | **`sales_count` nunca se incrementa** | `backend/server-src/orders.service.ts` (al pasar a `delivered`) | **Una línea.** Enciende la prueba social «N ventas» que ya está pintada en la ficha y hoy está muerta (116 productos con `sales_count = 0`) | Tras un pedido de prueba: `SELECT sales_count FROM lifebook.products WHERE id = …` sube |
| 3 | **Blindar el código de entrega** | `orders.service.ts:253, 630-637` | Hoy **no hay límite de intentos** y al acertar fuerza `delivered` + `paid`. Es **fraude con dinero real** (código de 4 dígitos) | Probar 6 códigos seguidos: a partir del 5.º debe rechazar; y `confirmDeliveryCode` debe llevar `AND status = '…'` en el `UPDATE` |
| 4 | **Compare-and-set de estado** | `orders.service.ts:563-565` vs `:572-577` | Se lee el estado y luego se actualiza **sin condición**: cancelar y entregar a la vez se pisan. **El patrón correcto ya existe en el repo** | Copiar `CASE WHEN p.status = ANY(cfg.from)` de `commerce.service.ts:1426` |
| 5 | **Cerrar el pago de verdad** | `orders.service.ts:319` y el flujo de entrega | `payment_status` solo pasa a `paid` con **efectivo contra entrega**: un pedido por transferencia/facturación/tienda **se queda `pending` para siempre** → el vendedor no ve su caja y **ninguna comisión es verificable** | Marcar cobrado desde el panel del vendedor (con justificante) y ver `paid_at` en la BD |

**Regla de oro de esta sección:** cada arreglo entra **solo**, con `npx tsc --noEmit` en 0 **antes** de
`pm2 restart`, y se comprueba contra la API real antes de pasar al siguiente.

> ### ⚠️ CORRECCIÓN al punto 1 (la auditora, 15/09 18:10) — **es un falso positivo**
>
> El «detalle del pedido en blanco» salió de una medición **MÍA que estaba mal**: la cifra «93,6 % liso»
> medía «porcentaje de píxeles que son el color de fondo», y una pantalla oscura **con texto** es ~90 %
> fondo **por construcción**.
>
> Aplicando **el criterio de la propia tabla de arriba** («con el fallo ~2 textos, **sano >15**»), el
> detalle del pedido sale **SANO: 29 textos**, con geometría correcta (cabecera 0-241 · cuerpo 241-2157 ·
> pie 2157-2374, todos los hijos bien colocados) y con **colores de texto (blanco 242,243,245; gris
> 170,174,183), de botón (#3981F6) y negro** en los píxeles. Lo abrí además **con un toque real** desde
> «Mis pedidos» (no solo por enlace directo), para descartar el artefacto de navegación. **No hay que
> bisecarlo.**
>
> Lo que **sí** queda por comprobar ahí es la **caja del CÓDIGO DE ENTREGA**, que solo sale con pago
> contra entrega y no se ha visto nunca: se crea un pedido de prueba en la cuenta del móvil con
> `node /root/lb75a.cjs crear` (imprime id y enlace), se mira con `egrouteplan://lifebook-order/<id>`
> contando textos y buscando `Lee este código` + el número, y se cancela con
> `node /root/lb75a.cjs cancelar <id>` (devuelve el stock). Detalle en
> `docs/AUDITORIA-CUERPO-QUE-NO-SE-PINTA.md` → «CORRECCIÓN».
>
> **Y ojo con el móvil: dos agentes a la vez no.** Un `am start`/volcado mío mientras el otro agente está
> tocando la pantalla sale vacío (me ha pasado dos veces); antes de medir, comprobar el texto marcador.

> ### ✅ ESTADO DE ESTA §1 (la auditora, 15/09 18:20) — **los 5 puntos están hechos y verificados**
>
> El registro completo (qué se cambió, con qué prueba y qué queda pendiente) está en
> **`docs/TANDA-R-ORDEN-Y-DINERO.md`**:
>
> * **1** — la caja del código de entrega, **medida en pantalla**: 28 textos y «Lee este código a quien
>   te entregue y paga en efectivo:» + el número que da la API (pedido de prueba cancelado después).
> * **2** — `sales_count` sube al entregar por las **dos** vías (`parche76`), sin contar dos veces.
> * **3** — código de entrega blindado: **5 fallos seguidos → 15 minutos** sin admitir intentos
>   (`parche78` + migración 78), y el `UPDATE` de `confirmDeliveryCode` con `AND status <> 'delivered'`.
> * **4** — compare-and-set en el cambio de estado (`parche77`): 8 cancelaciones simultáneas → gana una,
>   **7 contestan `ORDER_CHANGED`** y el stock no se infla (sin el arreglo habría subido de 20 a 27).
> * **5** — cerrar el pago (`parche79`): al entregar quedan **cobrados** contra entrega y pago en tienda;
>   transferencia/facturación/depósito **no** (decisión del dueño). Y la tienda **ya puede marcar
>   cobrado con justificante** lo que se paga por fuera: `POST /lifebook/commerce/orders/:id/mark-paid`
>   (`parche80` + migración 79), solo la tienda, con rastro de quién y cuándo, aviso al comprador, y
>   probado con 14 comprobaciones (`lb80a`). **Falta solo el botón en la app.**

---

# 2. LO QUE SOLO PUEDE HACER EL DUEÑO (nada de esto lo puede hacer un agente)

## 2.1 Escribir a los proveedores de cobro (es el bloqueo nº1 del negocio)

**Hecho verificado:** hoy **ninguna pasarela confirmada** da de alta a un comercio de Guinea Ecuatorial
para cobrar en XAF por internet. Stripe no cubre el país; no hay M-Pesa ni MTN MoMo; «Getesa Money»
sigue sin lanzar. Los candidatos vivos son **Maviance/Smobilpay** (agregador GIMAC), **Notch Pay**
(XAF de primera clase, con split tipo Stripe Connect) y **Getesa Money**.

**Acción:** escribir a los tres. Texto listo para copiar:

> Asunto: Alta de comercio en Guinea Ecuatorial y liquidación en XAF
>
> Buenos días:
>
> Soy [nombre], de Life Book, una aplicación móvil de compraventa con sede en Guinea Ecuatorial
> (Malabo). Vendemos productos entre particulares y tiendas, con pedidos y pagos dentro de la app.
>
> Necesito saber, para un comercio **registrado en Guinea Ecuatorial**:
> 1. ¿Pueden dar de alta mi comercio y cobrar en **XAF**?
> 2. ¿Qué métodos admiten (dinero móvil, tarjeta, transferencia, QR CEMAC)?
> 3. ¿Cuál es la **comisión** y el plazo de liquidación?
> 4. ¿Tienen **split de pagos** o liquidación a terceros (los vendedores de mi plataforma)?
> 5. ¿Qué documentación piden (registro de comercio, cuenta bancaria local)?
>
> Gracias.

## 2.2 Los tres números que no se pueden sacar de internet

Los saqué a la investigación y **no existen publicados**. Solo se cierran preguntando en Malabo:

1. **Cuánto cuesta de verdad una entrega urbana** (preguntar a 5 moto-taxis y 2 mensajeros: precio por
   trayecto corto y por hora).
2. **Qué comisión aguanta el vendedor** (preguntar a 10 vendedores de los grupos de «encargos» y del
   Mercado Central: «si te quito un X % por venderte dentro de la app y cobrarte yo, ¿te vale?»).
3. **Ticket medio** (precio del producto que más se mueve en su categoría).

Sin esos tres números, el modelo de ingreso está a ciegas. Referencia de partida: **8 % con mínimo
500 XAF**, que es tu propia comisión de Comida (`docs/MODELO-DINERO-Y-PEDIDOS-PROGRAMADOS.md:22-24`).

## 2.3 Decidir una cosa antes de tocar el reparto

**¿La entrega la hace el vendedor o la plataforma?** Hoy la plataforma **no puede** cobrar la entrega
(el importe se queda en 0 cuando el envío es «a calcular» o «a consultar», `orders.service.ts:233-241`).
Decide: si la hace el vendedor, la plataforma solo la refleja; si la hace la plataforma, hay que
**cerrar el coste antes de confirmar** y hace falta gente de reparto.

## 2.4 Probar la competencia tú mismo (y no perder el tiempo con las que no existen)

Verificado el 16/09: **el competidor real es uno, y es de este año.**

* **OKOUME** — lanzada el **18-ago-2026** en Malabo (hotel Colinas), de **Iniciativas Elebi** (fundador
  **Víctor Ele Ela**), app `com.elebi.okoume`. Es **clasificados** (productos, servicios, empleo y
  eventos) con contacto directo comprador-vendedor. **No tiene confirmados ni entrega, ni pago dentro de
  la app, ni valoraciones, ni chat propio** — y en su propio acto de lanzamiento hubo una mesa sobre
  «infraestructuras de pago», señal de que **el cobro no lo tienen resuelto**. Hoy es un **directorio, no
  un mercado transaccional**. **Esta es la que hay que descargar y estudiar.**
* **EGMARKET** — app de compras con dos identificadores Android (`com.coffye.rmbmgh` y
  `app.egmarket.android`), ficha de iOS de **2021 que ya no resuelve**: **indicio claro de abandono**.
  Solo mirar si aparece algo nuevo.
* **Chekea** — **NO es competencia**: lo que se encuentra con ese nombre es una app de finanzas
  personales de **Venezuela** y otra ecuatoriana que pagaba por ver publicidad y ya no está. Descartada.
* Ninguna otra app ecuatoguineana de compraventa o reparto confirmada (Dibida es de **Guinea-Conakri**).

**Lo que el dueño debe apuntar al probar OKOUME:** ¿deriva a WhatsApp para cerrar el trato? ¿enseña
precio y stock real? ¿hay forma de pagar o solo de hablar? Todo eso es exactamente lo que Life Book ya
tiene construido (chat con tarjetas, pedido con **código de entrega**, panel del comerciante, IA que
recomienda stock real). El análisis completo está en **§B.6** del documento de negocio.

## 2.5 Normas mínimas escritas (aunque sea en una nota)

Qué se puede vender (¿medicamentos? ¿animales?), quién paga el reparto si el cliente no está, cómo se
devuelve, y qué pasa si el vendedor no entrega. Con **efectivo contra entrega** esto es obligatorio,
porque el dinero lo cobra el repartidor en mano.

---

# 3. LOS ARREGLOS DE FONDO (después de §1, y en este orden)

| # | Qué | Dónde | Nota |
|---|---|---|---|
| 6 | **Avisos de estado del pedido** (push + chat) | `expo-notifications` + el chat del pedido | Push es gratis pero **exige compilar nativo**. Hoy no existe ninguno |
| 7 | **Portar reseñas y disputas de Ecomerse** | patrón ya hecho: `api/ecomerse.ts:117-118`, `app/ecomerse-orders.tsx:6-7,113-125` | **No es I+D**: se copia tabla + endpoints + pantalla |
| 8 | **Ledger de doble partida + liquidación manual** | nuevo servicio Prisma (`LedgerEntry`) | Es la forma de cobrar comisión **sin pasarela**: venta, comisión, a pagar al vendedor, coste de reparto; y **conciliación del efectivo** de cada repartidor |
| 9 | **Interfaz `PaymentProvider`** (solo la pieza, sin proveedor) | nuevo, detrás de la caja | Para enchufar el QR CEMAC o un agregador **sin rehacer comercio** |
| 10 | **Productos agotados** fuera del catálogo | `commerce.service.ts:1673` (el catálogo no filtra por stock) | El escaparate no debe engañar |
| 11 | **Reponer stock con tope** | `orders.service.ts:583-591` | Hoy suma sin tope: infla el inventario |
| 12 | **Idempotencia**: filtrar `expires_at` + hash del contenido | `orders.service.ts:262-264` (y `commerce.service.ts:1118` vs `:1190-1193`) | Un reintento devuelve el pedido viejo; con otro contenido, también |
| 13 | **`order_no` único** | `orders.service.ts:83-90` (`count(*) + 1`, sin índice único) | Dos compras a la vez pueden repetir número |
| 14 | **Cupón**: comprobar `starts_at` al recoger | `commerce.service.ts:1932-1937` | Hoy se puede recoger un cupón que aún no vale |
| 15 | **Cerrar el coste de envío en el total** | `orders.service.ts:233-241,251,324` | Sin esto la entrega no se puede comisionar |
| 16 | **Buscador** | nuevo | Los favoritos ya existen; el buscador no |

---

# 4. LAS REGLAS QUE NO SE ROMPEN (esto ya nos ha costado caro)

1. **Nunca tocar** `api/lifebook.ts` ni `components/FloatingFooter.tsx`.
2. **`npx tsc --noEmit` ANTES de `pm2 restart`.** `tsc` **emite JS aunque falle**: ya se ha subido dos
   veces un `dist` roto por saltarse esto.
3. **Nada de toques automáticos en «Confirmar pedido»**: cada toque crea un **pedido real** (pasó dos
   veces; hubo que cancelarlos y reponer stock). Las pruebas de pantalla las hace el dueño.
4. **Medir antes de creer.** Trampas ya conocidas: el enlace directo **no siempre navega** (hay que
   comprobar un texto único de la pantalla antes de medir); `uiautomator` **no lista lo que no se
   pinta**; el fondo de página es `(23,23,26)` y las tarjetas se le parecen → **contar textos en el
   árbol, no píxeles**; y `>` en PowerShell corrompe binarios (usar `pull`).
5. **Un cambio, una compilación, una medida.** Nada de juntar tres arreglos y medir una vez.
6. **Si una pantalla sale en blanco**, el sospechoso nº1 es un componente del kit con `width: '100%'`
   (o `height: '100%'`) **dentro de una fila**. Ya pasó con `PrimaryButton`
   (`node_modules/@egrouteplan/ui-kit/src/primitives/PrimaryButton.tsx:102`) y dejó la caja del producto
   en blanco. Arreglo: meterlo en una caja de ancho fijo. Ver `docs/CAUSA-RAIZ-CUERPO-EN-BLANCO.md`.
7. **El espejo `backend/server-src/` está incompleto** (le faltan el controlador de opciones y el de
   comerciante, que **sí** existen en el servidor real). Auditar solo el espejo lleva a conclusiones
   falsas («esa ruta da 404»). El servidor real manda.
8. **No inventar nunca** productos, precios, cupones, comisiones, distancias ni recomendaciones de talla.

---

# 5. LO QUE **NO** SE HACE (para no perder el tiempo ni el dinero)

* **No migrar a MedusaJS.** Multivendedor sin soporte oficial, la alternativa seria (Mercur) **depende
  de Stripe Connect** (inservible en Guinea Ecuatorial) y el trabajo difícil (split + liquidación) es
  **el mismo con Medusa o sin él**. Se copian conceptos, no el backend.
* **No copiar las plantillas que le recomendaron al dueño**: `burakorkmez/expo-ecommerce`,
  `Amang9446/Expo-Ecommerce` y `pipesort/react-native-medusa` **no tienen licencia** («todos los
  derechos reservados»: **riesgo legal** en un producto comercial); `enatega` licencia su backend aparte.
* **No construir cobro con Stripe** ni dar por hecho que «Stripe Tax cubre Guinea» = se puede cobrar
  (es presentar impuestos, **no cobrar**).
* **No empezar por lo bonito** (rediseños, animaciones, suscripciones) con el detalle del pedido roto y
  la caja sin cuadrar.

---

# 6. LA FRASE QUE RESUME EL MOMENTO

**El producto ya está construido; lo que falta es que el dinero se pueda cobrar y cuadrar.** Los tres
arreglos de §1 que más devuelven por hora invertida son: **el detalle del pedido** (se ve el código de
entrega), **`sales_count`** (una línea, enciende la prueba social) y **cerrar el pago** (sin esto no hay
comisión ni panel de ventas que valga). Y el bloqueo de fondo —**cobrar en XAF dentro de la app**— se
desbloquea escribiendo a Maviance, Notch Pay y Getesa (§2.1).
