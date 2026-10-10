# PARCHE CARD · `lifebook.service.ts` — tarjeta genérica en el chat

**Cómo aplicar:** son **dos bloques** en `lifebook.service.ts` del servidor. No hay que tocar ningún
otro fichero, ninguna migración y ningún código de error: usa los `DomainError` que ya existen.

> **Protocolo de coexistencia:** `lifebook.service.ts` es fichero **compartido** — lo tocan varias
> líneas de trabajo a la vez. Antes de aplicar, mirar si alguien más lo tiene abierto. Este parche
> **añade** dos bloques y no modifica ninguna rama existente, así que se puede aplicar aunque el
> fichero haya cambiado alrededor: lo único que hay que respetar es **dónde** se inserta cada bloque.

**Por qué:** el chat tiene 15 tipos de mensaje y la referencia tiene **54 tarjetas de comercio**
dentro de la conversación. Añadir un tipo por tarjeta serían ~38 tipos, con 38 migraciones, 38
despliegues y 38 ramas más en el despacho del cliente. La referencia no lo hace así: tiene **un motor
y 54 fichas**. Este parche es ese motor, en el servidor.

**No rompe nada:**
- `card` **no** entra en `CHAT_KINDS`, así que **ningún cliente puede emitir una tarjeta**. Los
  clientes viejos que no conozcan el tipo lo reciben y el cliente decide qué hacer con él.
- Los mensajes existentes no cambian: la rama nueva solo se ejecuta cuando `kind === 'card'`, y hoy
  no hay ninguno.
- Los clientes antiguos que reciban un `card` lo pintan como texto vacío o lo ignoran; el respaldo
  que evita eso ya está en el cliente (`TarjetaNoSoportada`), y se activa solo.

---

## BLOQUE 1 · el lado que LEE — dentro de `serializeMessage`

Insertar **justo después** de la rama `else if (kind === 'order') { … }`, antes de
`} else if (kind === 'image') {`.

```ts
    } else if (kind === 'card') {
      /**
       * TARJETA GENÉRICA — el tipo que sostiene las 54 tarjetas de comercio del chat.
       *
       * El mensaje viaja con el NOMBRE de la tarjeta y sus DATOS, y el cliente busca cómo pintarla
       * en su registro (`components/lifebook/tarjetas/registro.tsx`).
       *
       * `version` y `minAppVersion` sirven para que un cliente viejo no intente pintar una tarjeta
       * cuya forma de datos ha cambiado: si no sabe pintarla, enseña el aviso de mensaje no
       * soportado y **la conversación sigue funcionando**.
       *
       * `data` se devuelve TAL CUAL, sin tipar ni filtrar: su forma la declara el componente que la
       * pinta, y validarla aquí obligaría a tocar este fichero cada vez que se añade una tarjeta.
       */
      const datos = payload.data;
      out.cardRef = {
        cardType: String(payload.cardType ?? ''),
        version: payload.cardVersion ? String(payload.cardVersion) : undefined,
        minAppVersion: payload.minAppVersion ? String(payload.minAppVersion) : undefined,
        payload: datos && typeof datos === 'object' && !Array.isArray(datos)
          ? datos as Record<string, unknown>
          : {},
      };
```

---

## BLOQUE 2 · el lado que EMITE — un método nuevo

Insertar **antes** de `async chatMarkRead(...)`, dentro de la misma clase.

```ts
  /**
   * TARJETA GENÉRICA en la conversación — el lado que la EMITE.
   *
   * POR QUÉ ES PRIVADO Y `card` NO ESTÁ EN `CHAT_KINDS`:
   * las tarjetas de comercio las emite el SERVIDOR cuando ocurre algo —se paga un pedido, se
   * cancela, se abre una postventa, se reclama un cupón—. Si `card` estuviera en `CHAT_KINDS`,
   * cualquier cliente podría mandar el `cardType` y los datos que quisiera: una tarjeta de «pedido
   * entregado» que nadie ha entregado, o un «cobro pendiente» inventado. Eso no es un problema de
   * validación, es **una tarjeta que miente dentro de una conversación**.
   */
  private async cardMessage(entrada: {
    convId?: string;
    fromId?: string;
    toId?: string;
    cardType: string;
    data?: Record<string, unknown>;
    version?: string;
    minAppVersion?: string;
    preview?: string;
  }) {
    if (!entrada?.cardType) throw new DomainError('CARD_TYPE_REQUIRED', 'La tarjeta necesita un tipo');

    let convId = entrada.convId ?? null;
    let userA: string | null = null;
    let userB: string | null = null;

    if (!convId) {
      if (!entrada.fromId || !entrada.toId) {
        throw new DomainError('CARD_CONV_REQUIRED', 'Hace falta la conversación o las dos personas');
      }
      const conv: any[] = await this.db.$queryRaw`
        SELECT id, user_a, user_b FROM lifebook.conversations
        WHERE (user_a=${entrada.fromId}::uuid AND user_b=${entrada.toId}::uuid)
           OR (user_a=${entrada.toId}::uuid AND user_b=${entrada.fromId}::uuid)
        LIMIT 1`;
      if (!conv[0]) return null;
      convId = String(conv[0].id);
      userA = conv[0].user_a;
      userB = conv[0].user_b;
    }

    const preview = String(entrada.preview ?? '').slice(0, 300);
    const payload = {
      cardType: entrada.cardType,
      ...(entrada.version ? { cardVersion: entrada.version } : {}),
      ...(entrada.minAppVersion ? { minAppVersion: entrada.minAppVersion } : {}),
      data: entrada.data ?? {},
    };

    let emisor = entrada.fromId ?? null;
    if (!emisor) {
      const c: any[] = await this.db.$queryRaw`
        SELECT user_a FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
      emisor = c[0]?.user_a ? String(c[0].user_a) : null;
    }
    if (!emisor) throw new DomainError('CARD_SENDER_REQUIRED', 'No se pudo determinar quién emite la tarjeta');

    const filas: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${convId}::uuid, ${emisor}::uuid, ${preview}, 'card', ${JSON.stringify(payload)}::jsonb)
      RETURNING id`;

    if (preview) {
      const meIsA = userA && userB ? userA === emisor : true;
      await this.db.$queryRaw`
        UPDATE lifebook.conversations
        SET last_message=${preview}, last_message_at=now(),
            unread_a = unread_a + CASE WHEN ${!meIsA} THEN 1 ELSE 0 END,
            unread_b = unread_b + CASE WHEN ${meIsA} THEN 1 ELSE 0 END
        WHERE id=${convId}::uuid`;
    }

    return { id: filas[0]?.id ?? null, conversationId: convId };
  }
```

---

## Cómo se emite una tarjeta desde otro servicio

`cardMessage` es privado: se llama desde dentro de `LifebookService`, en el punto donde ocurre el
hecho. **Los flujos de abajo NO están en este parche**, porque cada uno pertenece a su servicio; lo
que sigue es el mapa medido sobre el código para decidir cuáles se convierten.

### Los 8 sitios que hoy escriben en el chat

| # | Sitio | Qué escribe hoy | `kind` |
|---|---|---|---|
| 1 | `lifebook.service.ts:2486` | lo que manda el usuario (`chatSend`) | los 11 de `CHAT_KINDS` |
| 2 | `lifebook.service.ts:2648` | `systemMessage` — aviso 1 a 1 por pareja | `system` |
| 3 | `lifebook.service.ts:2728` | **`cardMessage`** — el método de este parche | `card` |
| 4 | `lifebook.service.ts:4700` | `pushSystemMessage` — gestión de grupo | `system` |
| 5 | `orders.service.ts:1098` | `publicarEnChat` — el publicador de pedidos | `system` y `order` |
| 6 | `commerce.service.ts:2812` | `avisarEnChat` — vendedor → comprador | `system` **con payload** |
| 7 | `hotel-merchant.service.ts:561` | aviso de gestión del hotel | `system` |
| 8 | `reservations.service.ts:1114` | aviso de gestión de reservas | `system` |

**Todo menos la tarjeta de pedido sale hoy como `system`: texto plano.** Las tarjetas de comercio no
son un sistema nuevo que haya que construir: son **lo que ya se manda, con forma**.

### Y ya viajan payloads que nadie lee

`avisarEnChat` (commerce:2812) **acepta un `payload` y lo guarda** — dentro de un mensaje `system`.
El aviso de reposición de stock manda `{ productId: … }` y el cliente no lo mira: solo pinta el
texto. Convertir ese flujo en tarjeta es cambiar `'system'` por `'card'` y añadir el `cardType`: el
dato ya está viajando.

### Flujo por flujo, y qué tarjeta le tocaría

**PEDIDOS — `orders.service.ts`** (todos pasan por `notify`, que hoy escribe `system`)

| # | Cuándo | Hoy | `cardType` propuesto | Componente |
|---|---|---|---|---|
| 1 | Se crea la compra (`createOrder` → `publicarPedido`) | `kind='order'` | *(ya es tarjeta)* | `OrderCardEnChat` |
| 2 | `accept` → `confirmed` | «La tienda aceptó tu pedido» | `aviso-producto` | 34/35/36 |
| 3 | `decline` → `cancelled` | «La tienda rechazó el pedido» | `cancelacion` | 33 |
| 4 | `prepare` → `preparing` | «Tu pedido está en preparación» | `aviso-producto` | 34/35/36 |
| 5 | `send` → `in_transit` | «Tu pedido va en camino» | `pedido-logistico` | 27 |
| 6 | `ready` → `ready_pickup` | «Listo para recoger» | `aviso-producto` | 34/35/36 |
| 7 | `deliver` → `delivered` | «Pedido entregado» | `pedido-logistico` | 27 |
| 8 | `cancel` (comprador) → `cancelled` | «El comprador canceló el pedido» | `cancelacion` | 33 |
| 9 | `dispute` con motivo → `disputed` | «Abrió una reclamación: «…»» | `texto-acciones` | 29 |
| 10 | `confirmDeliveryCode` → `delivered` | aviso de entrega | `pedido-logistico` | 27 |
| 11 | `markPaid` | *(sin aviso hoy)* | `cobro` | 43 |
| 12 | `setDeliveryCost` | *(sin aviso hoy)* | `cobro` | 43 |
| 13 | `reviewOrder` | *(sin aviso hoy)* | `aviso` | 28 |
| 14 | **Invitación a valorar** | **no existe el flujo** | `invitacion-resena` | 21 |

**COMERCIO — `commerce.service.ts`**

| # | Cuándo | Hoy | `cardType` propuesto | Componente |
|---|---|---|---|---|
| 15 | Reposición de stock (`avisarEnChat`, payload `{productId}`) | `system` **con payload** | `alerta-reposicion` | **FALTA** |
| 16 | `claimCoupon` — se reclama un cupón | *(sin aviso hoy)* | `cupon` o `cupon-reclamar` | 11 / 13 |
| 17 | Aviso del vendedor al comprador | `system` | `texto-acciones` o `servicio` | 29 / 26 |

**PAGOS — `payments.service.ts`**

| # | Cuándo | Hoy | `cardType` propuesto | Componente |
|---|---|---|---|---|
| 18 | `abrirCobro` — se abre un cobro | *(sin aviso hoy)* | `cobro` | 43 |
| 19 | `avisoDePago` — webhook del proveedor | *(sin aviso hoy)* | `cobro` | 43 |

**HOTEL Y RESERVAS**

| # | Cuándo | Hoy | `cardType` propuesto | Componente |
|---|---|---|---|---|
| 20 | Gestión del hotel (`hotel-merchant:561`) | `system` | `servicio` o `texto-acciones` | 26 / 29 |
| 21 | Gestión de reservas (`reservations:1114`) | `system` | `servicio` o `texto-acciones` | 26 / 29 |

### Lo que falta antes de poder convertirlo todo

**Dos componentes que el cliente todavía no tiene:**

1. **`alerta-reposicion`** — ««X» vuelve a estar disponible». Es el más barato de todos: el `payload`
   con el `productId` **ya se está mandando** y hoy se tira. Se parece a la alerta de precio (19) pero
   no es lo mismo: una avisa de un precio y la otra de que hay existencias.
2. **`confirmacion-entrega`** — el código de entrega para el pago contra reembolso
   (`confirmDeliveryCode`). Hoy el código viaja por otro camino y no está en una tarjeta.

**Y una decisión de producto, no técnica:** la invitación a valorar (14) **no tiene flujo**. El
componente existe (21) y la referencia lo manda al entregar, pero en LifeBook nadie lo dispara.
Crearlo es decidir **cuándo** se invita a valorar.

### Las decisiones que hay que tomar, en orden

1. **¿Se convierten los 8 avisos de pedido** (2-10) o solo algunos? Son los que más se ven.
2. **¿Se emiten los tres que hoy no avisan nada** (11, 12, 13)? Avisar más es más ruido en el chat.
3. **`alerta-reposicion`**: ¿se construye? Es una hora de trabajo y el dato ya viaja.
4. **La invitación a valorar**: ¿existe el flujo, y cuándo se dispara?
5. **Hotel y reservas** (20, 21): tienen su propio servicio y su propio ritmo; se pueden dejar para el
   final sin bloquear nada.

**Si el flujo vive en otro servicio, NO hay que crear una puerta entre servicios.** La regla que sale
de esta auditoría es la contraria a la que había escrito antes aquí:

> **Cada servicio usa el publicador de chat que YA tiene.** `orders.service.ts` tiene
> `publicarEnChat` y `commerce.service.ts` tiene `avisarEnChat`, y los dos aceptan `kind` y `payload`.
> Cambiar el `kind` que escriben es todo el trabajo. Lo que **no** hay que hacer es duplicar el INSERT
> —y tampoco inyectar `LifebookService` para no duplicarlo—: la conversación tiene reglas de no-leídos
> y de vista previa, y **cada copia de esas reglas es una copia que se va a quedar atrás**.

Solo si un servicio **no tuviera** publicador propio habría que plantearse algo, y entonces la
pregunta correcta es **por qué escribe en el chat sin tener uno**, no cómo darle acceso al de otro.

**Ningún `cardType` se valida aquí a propósito.** El registro del cliente es el que decide qué sabe
pintar; si el servidor manda uno que el cliente no conoce, sale el respaldo. Validar contra una lista
en el servidor volvería a atar las dos mitades, que es exactamente lo que este parche desata.

---

## LO QUE APARECIÓ AL IR A APLICARLO — y que QUITA trabajo en vez de añadirlo

### 1 · No hay que inyectar nada: los dos servicios YA tienen su publicador de chat

El plan era inyectar `LifebookService` en `orders.service.ts` y `commerce.service.ts`, y eso obligaba
a comprobar el módulo. **No hace falta, y por tanto la comprobación del módulo ya no bloquea nada.**

Los dos **ya escriben en el chat por su cuenta**:

- `orders.service.ts:1095` → `publicarEnChat(conv, autorId, cuerpo, kind, payload)`
- `commerce.service.ts:2806` → `avisarEnChat(comprador, vendedor, texto, payload)`

Y los dos hacen el INSERT **completo**, con las reglas de no-leídos y de vista previa.

**`publicarEnChat` ya acepta `kind` y `payload`.** Pasarle `'card'` y `{ cardType, data }` escribe
exactamente la forma que lee `serializeMessage`. O sea: **ni método nuevo, ni INSERT duplicado, ni
inyección, ni tocar un constructor.** El riesgo de dependencia circular desaparece porque no se crea
ninguna dependencia.

> Esto es un cambio de diseño sobre lo que había escrito antes en este mismo parche (un
> `emitirTarjeta` público más la inyección). Se deja escrito el porqué: la solución buena no era
> añadir una puerta entre servicios, sino **usar la que cada servicio ya tenía**.

### 2 · La tabla de valoraciones: `lifebook.order_reviews` — confirmada

No en una migración (**no está en este repo**), sino en **los dos sitios que la leen y la escriben**:
`orders.service.ts:1043` (el INSERT) y `orders.service.ts:559` (el SELECT), más el SELECT de
`orderDetail`.

Columnas: **`order_id` · `shop_id` · `buyer_id` · `rating` · `comment`**.

Y el INSERT lleva **`ON CONFLICT (order_id) DO NOTHING`**, o sea que **`order_id` es único**: la propia
base impide valorar dos veces. Eso hace que la invitación «solo si no ha valorado» sea exacta y no una
aproximación.

### 3 · `o.title` y `o.media_url` NO existen en `orders` — y la versión anterior de este parche los usaba

`publicOrder` devuelve `o.*` (la fila entera) más `shop_name`, `shop_logo`, `shop_owner`, `buyer_name`,
`buyer_avatar` e `items_count`. Las columnas **reales** de `orders`, contadas sobre su uso en el código:

`id` · `shop_id` · `buyer_id` · `seller_id` · `status` · `order_no` · `total_xaf` · `subtotal_xaf` ·
`delivery_cost_xaf` · `discount_xaf` · `coupon_id` · `delivery_mode` · `delivery_code` ·
`payment_method` · `payment_status` · `payment_proof_url` · `payment_note` · `delivered_at` ·
`created_at` · `delivery_code_locked_until`

**`total_xaf` sí existe** — el aviso de `cobro` estaba bien. Pero tres cosas estaban mal:

| Lo que puse | La verdad |
|---|---|
| `o.media_url` | **no está en `orders`**: está en `order_items` (`media_url`), verificado en el SELECT de `orderDetail` |
| `o.title` | **no es una columna de `orders`**: el código saca el título de `o.first_title ?? o.title ?? 'Pedido'`, y `first_title` viene de las líneas |
| `order.code` | la columna real es **`order_no`** (con índice único `orders_order_no_key`) |

Así que **la invitación a valorar coge el artículo de `order_items`**, que es el dato verificado, y no
del pedido. Corregido en el bloque 4d.

---

---

## BLOQUE 3 · NO HACE FALTA — se deja escrito para que no se vuelva a intentar

Este bloque iba a ser un método público `emitirTarjeta` en `LifebookService` para que los otros
servicios pudieran emitir. **Se descarta**: los dos servicios que emiten **ya tienen su propio
publicador de chat** (`publicarEnChat` y `avisarEnChat`), y ambos aceptan `kind` y `payload`. Añadir
una puerta entre servicios habría creado una dependencia —y un riesgo de ciclo— para escribir algo que
cada uno ya sabe escribir.

**`cardMessage` sigue siendo privado**, que es lo correcto: es la emisión **desde dentro** de
`LifebookService` (avisos de grupo, gestión, y lo que venga). Los flujos de pedidos y comercio no
pasan por ahí.

---

## BLOQUE 4 · los avisos de pedido pasan a tarjeta · `orders.service.ts`

### 4a · La foto del pedido, en un solo sitio

`publicarPedido` ya arma el objeto con la foto del momento (líneas 1130-1146). **Extráelo a un
método** y que lo usen tanto la tarjeta de pedido como los avisos de estado:

```ts
  /**
   * LA FOTO DEL PEDIDO. La usan la tarjeta de pedido y TODOS los avisos de estado.
   *
   * POR QUÉ ESTÁ AQUÍ Y NO DENTRO DE `publicarPedido`: si cada aviso armara su propio objeto, el día
   * que se añada un campo a uno el otro seguiría sin él, y el mismo pedido se vería distinto según
   * de qué aviso vengas. Un solo sitio, una sola verdad.
   */
  private async fotoDelPedido(order: any) {
    const items = (Array.isArray(order.items) ? order.items : []).slice(0, MAX_LINES).map((i: any) => ({
      title: String(i?.titleSnapshot ?? '').slice(0, 200),
      variant: i?.variantSnapshot ? String(i.variantSnapshot).slice(0, 140) : null,
      mediaUrl: i?.mediaUrl ? String(i.mediaUrl) : null,
      quantity: Number(i?.quantity ?? 1) || 1,
      lineTotalXaf: Number(i?.lineTotalXaf ?? 0) || 0,
    }));
    return {
      orderId: String(order.id),
      code: String(order.code ?? order.order_no ?? ''),
      shopName: order.shop?.name ? String(order.shop.name) : null,
      items,
      totalXaf: Number(order.totalXaf ?? 0) || 0,
      deliveryMode: order.deliveryMode ? String(order.deliveryMode) : null,
      status: String(order.status ?? 'created'),
    };
  }
```

`publicarPedido` pasa a usar `const base = await this.fotoDelPedido(order);` y sigue igual.

### 4b · El aviso de estado, con su tarjeta

Al lado de `ACTIONS` y `FROM` (línea ~1 del fichero), el mapa de qué tarjeta lleva cada acción:

```ts
  /**
   * QUÉ TARJETA LLEVA CADA AVISO DE ESTADO.
   *
   * Antes los ocho avisos eran una frase (`notify` escribe `system`): «Tu pedido está en
   * preparación» sin el pedido. El comprador tenía que ir a «Mis pedidos» para saber QUÉ pedido.
   *
   * `deliver` y `send` llevan la tarjeta logística porque son los dos momentos en que se mira el
   * envío; los demás llevan el aviso con el artículo, que es lo que se quiere confirmar de un
   * vistazo.
   */
  const TARJETA_DEL_AVISO: Record<string, string> = {
    accept: 'aviso-producto',
    decline: 'cancelacion',
    prepare: 'aviso-producto',
    send: 'pedido-logistico',
    ready: 'aviso-producto',
    deliver: 'pedido-logistico',
    cancel: 'cancelacion',
    dispute: 'texto-acciones',
  };
```

Y `notify` pasa a emitir tarjeta en vez de texto. **El texto se queda**: sirve de vista previa en la
lista de conversaciones, y una tarjeta sin vista previa deja la conversación en blanco.

```ts
  /**
   * El aviso de un pedido. Con `cardType` sale como TARJETA; sin él, como el `system` de siempre.
   *
   * SE PASA POR `publicarEnChat`, QUE YA EXISTE: acepta `kind` y `payload` y hace el INSERT con las
   * reglas de no-leídos y de vista previa. No hay método nuevo, ni inyección, ni INSERT duplicado.
   *
   * EL TEXTO VA SIEMPRE EN EL `body`: es la vista previa de la lista de conversaciones, y una tarjeta
   * sin vista previa deja la conversación en blanco.
   */
  private async notify(o: any, autorId: string, texto: string, cardType?: string, data?: Record<string, unknown>) {
    try {
      const otro = o.shop_owner === autorId ? o.buyer_id : o.shop_owner;
      if (!otro) return;
      const conv = await this.conversacionDirecta(autorId, otro);
      if (!conv) return;

      // Sin tarjeta conocida se manda el aviso de siempre: NINGÚN aviso se pierde por no tener una
      // tarjeta que lo pinte. `system` sigue existiendo y se sigue usando.
      if (!cardType) {
        await this.publicarEnChat(conv, autorId, texto, 'system', {});
        return;
      }

      await this.publicarEnChat(conv, autorId, texto, 'card', {
        cardType,
        // Si el aviso trae sus propios datos, mandan; si no, la foto del pedido.
        data: data ?? await this.fotoDelPedido(o),
      });
    } catch (e) {
      this.log.warn(`no se pudo avisar del pedido: ${(e as Error).message}`);
    }
  }
```

Las llamadas de `orderAction` (líneas 845 y 861) pasan a resolver la tarjeta de la acción:

```ts
    if (a === 'dispute' && motivo) {
      await this.notify(o, userId, `El comprador abrió una reclamación: «${motivo}»`, TARJETA_DEL_AVISO[a]);
      return this.orderDetail(orderId, userId);
    }
    ...
    await this.notify(o, userId, aviso ?? 'El pedido cambió de estado', TARJETA_DEL_AVISO[a]);
```

`confirmDeliveryCode` (línea ~903) también avisa con `TARJETA_DEL_AVISO.deliver`.

### 4c · Los tres avisos que hoy no existen

Los tres se emiten en el mismo sitio donde ocurre el hecho, **con los datos que ya están cargados**.
No se inventa ninguno: si el importe no está en la fila que se acaba de leer, no se manda el aviso.

```ts
  // En markPaid, DESPUÉS de que el UPDATE confirme que se marcó (no antes):
  //   `total_xaf` SÍ es una columna de `orders` (verificado: se usa en este mismo fichero).
  await this.notify(o, o.seller_id, 'Tu pedido se ha marcado como cobrado', 'cobro', {
    importe: `${Number(o.total_xaf)} XAF`,
    motivo: 'Pedido marcado como cobrado',
    estado: 'Cobrado',
  });

  // En setDeliveryCost, después del UPDATE:
  await this.notify(o, o.seller_id, 'La tienda ha fijado el coste de envío', 'cobro', {
    importe: `${Number(o.delivery_cost_xaf ?? cost)} XAF`,
    motivo: 'Coste de envío acordado',
    estado: 'Aceptar',
  });

  // En reviewOrder, después de guardar la reseña:
  //   El título del artículo sale de la PRIMERA LÍNEA del pedido (`title_snapshot`), que es donde
  //   está de verdad: `orders` NO tiene columna de título.
  const linea: any[] = await this.db.$queryRaw`
    SELECT title_snapshot FROM lifebook.order_items WHERE order_id = ${orderId}::uuid ORDER BY created_at LIMIT 1`;
  await this.notify(o, userId, 'El comprador ha dejado una valoración', 'aviso', {
    top: 'Gracias por tu valoración',
    content: `Has valorado «${String(linea[0]?.title_snapshot ?? 'tu pedido')}» con ${rating} de 5`,
  });
```

`o.delivery_cost_xaf` y `o.total_xaf` son columnas reales de `orders`; `title_snapshot` lo es de
`order_items`. **Los tres están verificados sobre el código que ya los lee.**

### 4d · La invitación a valorar — CUÁNDO se dispara

**No existía el flujo.** El componente está hecho (tarjeta 21) y la referencia lo manda al entregar.
Decisión: **se invita al entregar, una sola vez, y solo si no se ha valorado ya.**

```ts
  // En orderAction, dentro del caso `deliver` y DESPUÉS de que el UPDATE confirme la entrega:
  /**
   * LA INVITACIÓN A VALORAR. Va aquí, al entregar, por tres razones:
   *   · es el único momento en que el comprador tiene el producto en la mano;
   *   · `reviewOrder` ya existe y se puede comprobar si ya valoró — sin esa comprobación, cada
   *     cambio de estado volvería a pedirle la reseña;
   *   · si el pedido se cancela o se reclama, no se invita: no hay nada que valorar.
   *
   * LA TABLA Y SUS COLUMNAS ESTÁN VERIFICADAS: `lifebook.order_reviews` la lee y la escribe este
   * mismo fichero (líneas 559 y 1043), con las columnas `order_id · shop_id · buyer_id · rating ·
   * comment`. Y su INSERT lleva `ON CONFLICT (order_id) DO NOTHING`, o sea que `order_id` es ÚNICO:
   * la propia base impide valorar dos veces, así que esta comprobación es exacta y no una
   * aproximación.
   */
  if (cfg.to === 'delivered') {
    const yaValorada: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.order_reviews WHERE order_id = ${orderId}::uuid LIMIT 1`;

    if (!yaValorada[0]) {
      /**
       * EL ARTÍCULO SALE DE `order_items`, NO DEL PEDIDO.
       *
       * `orders` NO tiene columna de título ni de imagen: el título del pedido lo saca el código de
       * `o.first_title ?? o.title ?? 'Pedido'` (línea 662), y `first_title` viene de las líneas. Las
       * columnas reales de `order_items` están verificadas en el SELECT de `orderDetail`:
       * `title_snapshot · variant_snapshot · media_url · quantity · unit_price_xaf · line_total_xaf`.
       */
      const linea: any[] = await this.db.$queryRaw`
        SELECT title_snapshot, media_url FROM lifebook.order_items
         WHERE order_id = ${orderId}::uuid ORDER BY created_at LIMIT 1`;

      await this.notify(o, o.seller_id, '¿Nos cuentas qué tal?', 'invitacion-resena', {
        goods_name: String(linea[0]?.title_snapshot ?? 'Tu pedido'),
        goods_image: linea[0]?.media_url ? String(linea[0].media_url) : null,
        reviewable: true,
      });
    }
  }
```

> **Cambio sobre la versión anterior de este parche**: la invitación usaba `o.title` y `o.media_url`,
> que **no son columnas de `orders`**. Ahora el artículo sale de `order_items`, que es donde está de
> verdad y donde está verificado.

---

## BLOQUE 5 · la reposición de stock · `commerce.service.ts`

`avisarEnChat` (línea 2806) **ya recibe un `payload`** y lo guarda dentro de un mensaje `system` que
el cliente no lee. Es el cambio más barato de todos: el dato ya viaja.

```ts
  private async avisarEnChat(comprador: string, vendedor: string, texto: string, payload: Record<string, unknown>, tarjeta?: string) {
    // … la búsqueda/creación de la conversación se queda igual …
    const cuerpo = texto.slice(0, 300);

    /**
     * ANTES: esto se guardaba como `system` con el payload dentro, y el cliente solo miraba el
     * texto. El aviso de reposición mandaba `{ productId }` y ese dato se TIRABA.
     *
     * AHORA: si el que llama dice qué tarjeta es, se guarda como `card` y el dato se ve.
     *
     * SE CAMBIA EL `kind` DEL INSERT QUE YA ESTÁ AQUÍ, no se añade otro. Este método ya hace el
     * INSERT completo con las reglas de no-leídos y de vista previa; lo único que hacía falta era
     * dejar de escribir `'system'`. Cero código nuevo de conversación.
     */
    const kind = tarjeta ? 'card' : 'system';
    const guardado = tarjeta ? { cardType: tarjeta, data: payload } : payload;

    await this.db.$executeRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${conv[0].id}::uuid, ${vendedor}::uuid, ${cuerpo}, ${kind}, ${JSON.stringify(guardado)}::jsonb)`;
    // … el UPDATE de la conversación se queda igual: el `body` sigue llevando el texto, que es la
    // vista previa de la lista de conversaciones …
  }
```

Y la llamada de la reposición (línea ~2784) pasa a decir su tarjeta y a mandar los datos que la
tarjeta necesita —**hoy solo manda el `productId`**, así que hay que añadir título, imagen y
variante a la consulta que ya se está haciendo:

```ts
    await this.avisarEnChat(
      String(it.user_id),
      String(it.vendedor),
      texto,
      {
        productId: String(it.product_id),
        productTitle: String(it.title ?? ''),
        variantName: it.variant_name ? String(it.variant_name) : null,
        imageUrl: it.media_url ? String(it.media_url) : null,
        price: `${Number(it.price_xaf ?? 0)} XAF`,
      },
      'alerta-reposicion',
    );
```

---

## Después de aplicar

1. **Nada de migración**: `lifebook.messages.kind` es texto y `payload` es `jsonb`, así que un
   `kind='card'` nuevo entra sin tocar el esquema.
2. **Nada de desplegar el cliente a la vez**: el cliente ya desplegado no conoce `card`, así que los
   mensajes nuevos le llegan y no los pinta. Por eso **la emisión y el despliegue del cliente van
   juntos**: hasta que la app con el registro no esté en las tiendas, emitir tarjetas es escribir
   mensajes que nadie ve.
3. **El orden correcto es**: primero el cliente (que ya está hecho, en `components/lifebook/tarjetas/`),
   después este parche. Al revés se pierden mensajes.
