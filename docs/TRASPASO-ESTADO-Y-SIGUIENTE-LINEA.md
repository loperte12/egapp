# TRASPASO — estado del proyecto para abrir una línea nueva

> Última sesión: 17/09/2026. Este documento existe porque la línea se hizo muy larga: **con esto, una
> conversación nueva puede seguir sin volver a investigar nada.** Lee este fichero y los `docs/` que
> se citan; el resto ya está hecho.

---

## 1. Qué está desplegado y funcionando HOY

**Servidor** `8.218.88.237` · `/opt/mirror/app` · pm2 `malabogo-api` (compilar con
`npx tsc -p tsconfig.json`, reiniciar con `pm2 restart malabogo-api --update-env`).

| Tanda | Qué es | Verificado |
|---|---|---|
| A–D | Tienda en el perfil, tab Productos, productos en notas, producto en el chat + carrito | sí |
| E | El pedido vive en el chat | sí |
| F | Historial de productos | sí |
| G | Aviso de reposición («avísame cuando llegue») y «no llega a tu zona» | sí |
| H | Cupones (crear/recoger) — **falta aplicarlos en la caja** | parcial |
| I | Ciudad: distancia, POI, mapa, chips | sí |
| J | Tablas de tallas y medidas (servidor) | 41/41 |
| K | **Elegir antes de comprar** (ejes, colores con foto real, combinaciones sin recrear) | 54/54 |
| L | **Cucucul, el asistente**: tallas (ruletas, altura/peso/número), panel de opciones | 31/31 + en pantalla |
| M | Asistente para **todos los servicios** (comida, alquiler, trabajo, viajes, alojamiento, taxi…) | 36/36 |
| N | Chat de Cucucul: copiar, me gusta, editar/borrar, historial, consejos, **foto con visión**, tarjetas de productos guardados, **multiselección y compartir**, botón flotante en toda la app, plan de optimización (asesor de compras, fallbacks, taxonomía de calzado, idioma/memoria) | 6/6 + en pantalla |
| O | **Dictar en Cucucul** (voz de Android → texto): botón de micro en la barra de escribir | instalado; **FALLA en pantalla** (apartado por el dueño) |
| P | **Compra**: elegir la forma de pago (ya no se marca sola), la tarjeta del pedido al pulsar «escribir a la tienda», y el **ticket** (nombre, pago, entrega con dirección, nota) | API verificada con `lb71a` (TODO OK); app compilada e instalada; **sin probar en pantalla** |
| Q | **Cupones en la caja** (por tienda, con código y descuento) y **el botón de pagar que parecía muerto**: el motivo ahora sale en el pie y el botón nunca está apagado sin decir por qué | API verificada con `lb72a` (TODO OK); app instalada; **sin probar en pantalla** |
| R | **El pedido y el dinero** (los 5 puntos de la `ACCIÓN INMEDIATA` §1): la **caja del código de entrega** medida en pantalla, «N ventas» vuelve a contar al entregar, el estado del pedido **ya no se pisa** (compare-and-set → `ORDER_CHANGED`), el **código de entrega** blindado (5 fallos seguidos → 15 minutos), **cerrar el pago** (contra entrega y pago en tienda quedan cobrados al entregar) y **marcar cobrado con justificante** por API (`POST :id/mark-paid`, solo la tienda, con rastro de quién y cuándo) | API verificada con `lb76a` (ventas, 2 vías), `lb77a` (8 cancelaciones a la vez: gana una, el stock no se infla), `lb78a` (4 fases + SQL), `lb79a` (los tres métodos) y `lb80a` (14 comprobaciones: permisos, justificante, cancelado, ya cobrado) — **TODO OK**; punto 1 **medido en pantalla** (28 textos, `Lee este código` + `5826`) |
| S | **El botón de «marcar cobrado»** (lo que faltaba de la §1): la tienda cierra en la app el cobro de lo que se paga por fuera (transferencia, facturación, depósito), con **referencia y justificante**, y el cobro se ve en la ficha del dinero de las dos partes. Incluye el arreglo del **visor del justificante dentro de la app** (el dueño reportó que «Ver el justificante» abría una página con el XML del almacén: la URL de mis pruebas **no existía** y además se abría el navegador) | Servidor probado (`lb80a`, 14 comprobaciones); app compilada e instalada; **medido en pantalla**: la ficha del cobro (28 → 31 textos) y el **visor con la foto** (centro de pantalla en RGB 250,250,248 = la imagen, bloque y 900-1540). **La caja de la tienda sin probar en pantalla** (necesita su sesión) |
| T | **Arreglos de fondo de la §3**: los **avisos del pedido** (el chat, medido; el **push sigue bloqueado** por cuentas del dueño), las **reseñas del pedido** (estrellas en la app, media ponderada), el **motivo de la reclamación**, **el dinero del comercio** (comisión 8 % mínimo 500 y tope 40 %, congelada por pedido, **libro de doble partida**, saldo del vendedor y liquidación manual) y **los agotados fuera del escaparate** (catálogo, chips y contadores coherentes; la ficha sigue abriéndose) | `lb83a` (avisos), `lb84a` (reseñas, 16), `lb85a` (reclamación, 10), `lb87x` (aritmética: 6 casos + 3 propiedades), `lb87a` (dinero, 21) y `lb88a` (agotados, 4 fases) y `lb89a` (número de pedido, 4 a la vez) — **TODO OK**; **medido en pantalla**: `Tu valoración: ★★★★★` y la caja «0/10» de la reclamación; y de paso: el **número de pedido** ya no se pelea (mostrador atómico) y su índice único **ya existía** (el documento se equivocaba). **Hallazgo abierto**: con 8 compras simultáneas la mitad fallan por tiempo de transacción (medido, no arreglado). También: **un cupón que todavía no empieza ya no se puede recoger** (`lb90a`), **la tienda cierra el coste del reparto** antes de entregar, con el libro anotando `a_pagar_reparto` (`lb91a`, 16 comprobaciones; caja 14 000 = 11 040 + 960 + 2 000) y la **idempotencia** ya no devuelve el pedido viejo en silencio ni se atasca con una clave caducada (`lb92a`), y queda hecha **la pieza para enchufar un cobro real** (`PaymentProvider`, con las reglas escritas y probadas: el importe lo pone el servidor y un aviso suelto no cobra nada — `lb93a`). **La §3 queda cerrada** salvo el push (bloqueado por cuentas del dueño); el resumen punto por punto está al final de `TANDA-T-ARREGLOS-DE-FONDO.md`, donde también consta que **tres frases del documento de la §3 no eran ciertas** (el índice de `order_no`, el buscador y el detalle del pedido) |
| **P1-c (línea TAXI, otra mesa)** | **Liquidación de viajes de taxi al ledger**: precio propuesto por el conductor → confirmación del pasajero con **PIN de 6 dígitos** (`POST v1/wallet/pin`, hueco tapado) → ESCROW_LOCK con **comisión congelada por ciudad** (Malabo 20 % tope 1.500, Bata 50 plano, políticas en `wallet.fee_policies`, `GET v1/rides/quote`); cierre con RELEASE neto + FEE a plataforma, ventana gratis 5 min, cuota no-show 200/20 %, 3 canc. conductor/7 d → suspensión, auto-cierre 10 min, disputa 7 d con reversión total, barrido de reconciliación 30 s | `lb95a` **TODO OK tres corridas** (invariantes por viaje + cuadre global Δsaldo==Δlibro) y `lb96a` (el neto del conductor entra como ingreso en el cupo DEPOSIT sin bloquear pagos — decisión del dueño sobre §2.2, `parche92`); desplegado y `tsc` 0; pm2 online, routes 401 sin token. App (`taxi.tsx`, `conductor.tsx`, `trips-history.tsx`, `api/settlement.ts`) typecheck 0, **APK compilado (no instalado) y sin probar en pantalla** — y `compilar-apk.ps1` arreglado (la línea de gradlew moría con avisos normales de stderr; ahora exige ver BUILD SUCCESSFUL). Detalle: `P1-c-EJECUCION-Y-VERIFICADO.md` |

**Cucucul (el asistente)**: texto por **DeepSeek** (`deepseek-chat`); fotos por **Qwen `qwen-vl-max`**
(DashScope). Claves en **`/opt/mirror/app/.env`** (`AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`,
`AI_DAILY_MESSAGES`, `AI_VISION_KEY`, `AI_VISION_MODEL`, `AI_VISION_BASE_URL`) — **fuera del
repositorio**. Topes: 60 mensajes/persona/día, 700 tokens por respuesta.

**Ojo, dos veces tropecé con lo mismo**: `tsc` **emite igual aunque haya errores**, así que si el
chequeo falla y `pm2` reinicia, el `dist` puede quedar con código roto. **Revisar siempre con
`--noEmit` antes de emitir.**

## 2. Documentos que hay que leer (en `docs/`)

`TANDA-K-ELEGIR-ANTES-DE-COMPRAR.md` · `TANDA-L-SABER-TU-TALLA.md` · `TANDA-M-ASISTENTE-DE-IA.md` ·
`TANDA-N-CHAT-DEL-ASISTENTE.md` · `TANDA-O-DICTADO.md` · `TANDA-P-COMPRA-PAGO-Y-TICKET.md` ·
`TANDA-Q-CUPONES-Y-BOTON-DE-PAGAR.md` · **`TANDA-R-ORDEN-Y-DINERO.md`** · **`TANDA-S-BOTON-DE-COBRAR.md`** ·
**`TANDA-T-ARREGLOS-DE-FONDO.md`** ·
`PENDIENTE-COMPRA-PAGO-Y-TICKET.md` ·
`MERCADO-ANATOMIA-Y-QUE-FALTA.md` · **`BUG-CAJA-DEL-PRODUCTO-SIN-CUERPO.md`** ·
**`AUDITORIA-CUERPO-QUE-NO-SE-PINTA.md`**.

**BUG ABIERTO (15/09/2026, en curso por otro agente)**: `docs/BUG-CAJA-DEL-PRODUCTO-SIN-CUERPO.md`
(traspaso del arreglo) y `docs/AUDITORIA-CUERPO-QUE-NO-SE-PINTA.md` (auditoría: alcance medido con
marcadores, cronología de la regresión, hipótesis descartadas con su prueba y las pruebas que faltan).

**`ACCION-INMEDIATA-PARA-EL-OTRO-AGENTE.md` §1 — CERRADA entera (15/09/2026)**: los **5 puntos** están
hechos y verificados, con el registro en **`docs/TANDA-R-ORDEN-Y-DINERO.md`**. El punto 1 (la caja del
código de entrega) se midió **en pantalla**: 28 textos, «Lee este código a quien te entregue…» y el
número que da la API. Del punto 5, el dueño decidió que **entregar solo cierra el cobro** de lo que se
paga al recoger (contra entrega y pago en tienda) y **la tienda ya puede marcar cobrado** lo demás
(transferencia, facturación, depósito) **por API con justificante** (R.5b): falta el **botón en la app**.
Además, en la base de datos quedan **31 pedidos viejos** entregados sin cobrar y sin forma de pago
(09-10/09, `payment_method` a NULL): no se pueden cerrar sin inventarse el dato.

**Pendiente nuevo, encontrado al probar el justificante:** cancelar un pedido **ya cobrado** no toca el
cobro → en una tienda real eso es un **reembolso pendiente**, y la app no tiene ese flujo (el patrón sí
existe en Billing: `refunded`, `refund_status_partial`). Va con **devoluciones y disputas** (§3.7).

## 3. Lo que FALTA (en el orden que pidió el dueño)

1. ~~**Audio dictado en Cucucul** (voz de Android → texto)~~ → **probado en pantalla el 15/09/2026 y
   FALLA** («No se pudo dictar. Puedes escribir tu pregunta.»). Está instalado y documentado en
   `docs/TANDA-O-DICTADO.md`, con el diagnóstico que falta por hacer. **El dueño lo APARTA** para
   centrar el esfuerzo en la compra (punto 4 de esta lista).
2. **Verificar la visión con una foto real de zapatos** (`1000159324.jpg`): la taxonomía ya está en el
   prompt (cordones+horma cerrada = derby/oxford; sin cordones y con pala = mocasín; suela gruesa =
   zapatilla; caña alta = bota) y **no se ha probado con esa foto**.
3. **Verificar en pantalla** lo último instalado: multiselección + compartir, la cabecera nueva de
   Cucucul (🕐 historial · ⋯ más · **+ Nueva**) y el botón flotante.
4. ~~**El bug de compra que reportó el dueño**~~ → **HECHO el 15/09/2026 (tanda P,
   `docs/TANDA-P-COMPRA-PAGO-Y-TICKET.md`)**: los tres fallos, con el diagnóstico y las pruebas de API.
   Lo que queda es **probarlo en pantalla** (el ticket con un pedido de reparto de verdad no se ha
   visto). Después el dueño reportó que «el botón confirmar/pagar no reacciona»: era el aviso, que
   salía **fuera de la pantalla** — está arreglado y explicado en la **tanda Q**.
5. ~~**Cupones**: aplicarlos en la caja (segunda mitad de la tanda H)~~ → **HECHO el 15/09/2026 (tanda
   Q)**: el cupón se elige en la caja (por tienda), con su código y su descuento; el servidor decide el
   descuento, no deja gastarlo dos veces y lo devuelve si la compra se cancela. Verificado con
   `pruebas/lb72a-cupon-en-la-caja.cjs` (TODO OK). Falta **probarlo en pantalla**.

6. **Las 4 pantallas, en el orden que fijó el dueño el 18/09/2026** (`docs/DECISIONES-Y-SIGUIENTE-TRABAJO.md`
   §2, que manda sobre los documentos anteriores), una cada vez y medidas en pantalla:
   **1** panel de dinero de la tienda (saldo, comisión y liquidaciones: `GET /lifebook/commerce/money/balance`)
   — **HECHA y medida en pantalla** (`app/lifebook-dinero.tsx`, botón «El dinero de mi tienda» en el panel
   del comerciante; 18 textos, y los números con ventas probados por API en `lb87a`) → **2** campo para cerrar el coste del reparto (`PATCH /orders/:id/delivery-cost`)
   — **HECHA y medida en pantalla** (caja «El reparto (Taxi o moto)» con lo que paga ahora el comprador y
   el botón diciendo el importe; `lb91a` en el servidor) → **3** favoritos
   fuera del perfil — **HECHA y medida en pantalla** (`app/lifebook-guardados.tsx` + el corazón en la
   cabecera del catálogo; 3 productos con su precio y su botón «Quitar») → **4** aviso de bajada de precio — **NO HECHA**: localizada al detalle en
   `TANDA-T-ARREGLOS-DE-FONDO.md` (T.21: el `UPDATE` del producto ≈línea 1380 comparando con
   `p.price_xaf`, el patrón `avisarReposiciones` que hay que copiar, y la tabla `price_drops`). Es lo
   siguiente, empezando por **leer** `avisarReposiciones`. El servidor de las dos primeras **ya está hecho y
   probado** (T.8 y T.15 de `TANDA-T-ARREGLOS-DE-FONDO.md`).
   Ya hecho de este bloque: la regla de la **decisión 1** en la app (el botón «Marcar cobrado» **no deja
   continuar** sin comprobante en transferencia/facturación y dice qué falta — compilado e instalado,
   **sin medir en pantalla** porque hace falta la sesión de la tienda).
7. **El push** (punto 6 de la §3): **bloqueado por cuentas del dueño** (Expo/EAS + la clave de FCM). Los
   pasos exactos, en `TANDA-T-ARREGLOS-DE-FONDO.md` → T.6. El aviso del chat ya funciona y está medido.
8. **El proveedor de cobro** (punto 9 de la §3): la pieza está hecha, con sus reglas y probada
   (`PaymentProvider`); falta que el dueño **cierre el acuerdo** con Maviance/Notch/Getesa (§2.1) — la
   carta es suya. Con el acuerdo, conectar es una tanda corta.
9. **Hallazgo abierto y medido**: con **8 compras simultáneas** la mitad fallan con un 500 por tiempo de
   transacción (5 s). No es el número de pedido, ni la fila del producto, ni el pool. **Sin arreglar a
   ciegas**: primero hay que ver qué bloquea dentro de la transacción (`TANDA-T` → T.13).
10. **Reembolso al cancelar un pedido ya cobrado**: hoy el cobro no se toca, así que un pedido pagado y
    cancelado sigue figurando cobrado. Va con **devoluciones y disputas** (el patrón existe en Billing:
    `refunded`, `refund_status_partial`) — hallazgo del R.5b de `TANDA-R-ORDEN-Y-DINERO.md`.

## 4. Cómo se trabaja aquí (para no repetir errores)

* **SSH**: `pruebas/servidor-ssh.ps1 -Comando '...'` (añadir `2>&1` SIEMPRE: el ayudante se traga el
  `stderr` y sin eso un parche que falla parece exitoso). Subir ficheros con `servidor-subir.ps1`.
* **Parches del servidor**: ficheros Python en `pruebas/parcheNN-*.py` que **comprueban los anclajes y
  no escriben nada si no cuadran**, con copia `.bak-<sello>-20260214`.
* **Base de datos**: no hay psql en el host → `docker exec -i mirror-postgres psql -U postgres -d
  egrouteplan -f /dev/stdin < /root/x.sql`. **La app entra con `mobility_app`**, no con `postgres`:
  comprobar permisos con `has_table_privilege` **antes** de escribir consultas nuevas.
* **Pruebas**: `node pruebas/lbXXx-*.cjs` contra la API real. **Si la red del equipo falla** (proxy
  local), lanzarlas **desde el servidor**: `LB_API=http://127.0.0.1:3000/api/v1 node /root/lbXXx.cjs`.
* **Móvil**: Poco F5 por USB (`adb`), APK con `compilar-apk.ps1` (respeta `.build-lock.txt`). El USB se
  cae a menudo. **Cuidado con los toques automáticos**: dos veces crearon **pedidos reales** por caer
  en la barra de compra; el dueño hace las pruebas de pantalla.
* **Reglas del dueño**: no tocar `api/lifebook.ts` ni `components/FloatingFooter.tsx`; interfaz limpia
  (sin textos que expliquen cómo usarla); decir siempre **lo que NO queda verificado**; nada inventado
  (ni productos, ni precios, ni distancias).

## 5. Estado de los datos de prueba

Productos de prueba en la tienda `+240222000123` («Camiseta de prueba (tallas y colores)» y
«Zapatillas de prueba (número de calzado)»), con sus tablas de tallas y una nota en Acurenam para
abrirlos desde el móvil. **Pedidos accidentales de la automatización: cancelados** y el stock
restaurado (40:2 · 41:3 · 42:0 · 43:1 · 44:0), cero pedidos abiertos en la cuenta del móvil.
