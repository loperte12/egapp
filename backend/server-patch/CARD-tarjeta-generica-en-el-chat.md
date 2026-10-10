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

**Si el flujo vive en otro servicio**, hay dos caminos y el que hay que preferir es el primero:
llamar a un método público de `LifebookService` que envuelva `cardMessage` (una línea), o mover la
emisión allí. Lo que **no** hay que hacer es duplicar el INSERT en cada servicio: la conversación
tiene reglas de no-leídos y de vista previa, y dos sitios que las escriban acaban discrepando.

**Ningún `cardType` se valida aquí a propósito.** El registro del cliente es el que decide qué sabe
pintar; si el servidor manda uno que el cliente no conoce, sale el respaldo. Validar contra una lista
en el servidor volvería a atar las dos mitades, que es exactamente lo que este parche desata.

---

## PRERREQUISITO · inyectar `LifebookService` en los dos servicios

**Ni `orders.service.ts` ni `commerce.service.ts` lo tienen hoy** (verificado: cero menciones a
`LifebookService` en los dos). Sus constructores son:

```ts
// orders.service.ts:71
constructor(
  private readonly db: MobilityPrismaService,
  private readonly wallets: WalletService,
) {}

// commerce.service.ts:137
constructor(private readonly db: MobilityPrismaService) {}
```

Hay que añadirles la dependencia:

```ts
import { LifebookService } from './lifebook.service';

// orders.service.ts
constructor(
  private readonly db: MobilityPrismaService,
  private readonly wallets: WalletService,
  private readonly lb: LifebookService,
) {}

// commerce.service.ts
constructor(
  private readonly db: MobilityPrismaService,
  private readonly lb: LifebookService,
) {}
```

### No hay dependencia circular, y está comprobado

Es la primera cosa que hay que mirar antes de inyectar un servicio en otro, porque un ciclo en NestJS
no falla al compilar: **falla al arrancar**, y con un mensaje que no dice por dónde va el ciclo.

El constructor de `LifebookService` es:

```ts
constructor(
  private readonly db: MobilityPrismaService,
  private readonly ads: AdsService,
) {}
```

**No inyecta `OrdersService` ni `CommerceService`.** La dirección es de un solo sentido
(`Orders` → `Lifebook`, `Commerce` → `Lifebook`), así que NestJS lo resuelve sin `forwardRef` y sin
tocar el orden de los `providers`.

### Lo que NO se ha podido verificar

**El fichero de módulo no está en esta copia.** `backend/server-src` no tiene ningún `*.module.ts`,
así que no se puede confirmar aquí que `OrdersService`, `CommerceService` y `LifebookService` estén
declarados **en el mismo módulo**. Si no lo están, el módulo de los dos primeros necesita
`LifebookModule` en sus `imports` — y si `LifebookModule` ya importa el de ellos, entonces sí aparece
un ciclo y hay que romperlo con `forwardRef` en los dos lados.

**Comprobarlo antes de aplicar**: buscar en el servidor real el módulo que declara los tres.

---

## BLOQUE 3 · el puente para emitir desde otro servicio · `lifebook.service.ts`

`cardMessage` es privado. Los servicios de pedidos y comercio necesitan uno público; sin él tendrían
que duplicar el INSERT, y ya sabemos cómo acaba eso.

```ts
  /**
   * Emite una tarjeta desde OTRO servicio. Es `cardMessage`, con nombre público y nada más: un
   * envoltorio de una línea.
   *
   * POR QUÉ NO SE HACE PÚBLICO `cardMessage` DIRECTAMENTE: porque su firma es la interna (admite
   * `fromId`/`toId` sueltos y busca la conversación por pareja). Esta puerta deja claro que es un
   * contrato entre servicios y permite cambiar la de dentro sin tocar a los que llaman.
   */
  async emitirTarjeta(entrada: {
    convId?: string;
    fromId?: string;
    toId?: string;
    cardType: string;
    data?: Record<string, unknown>;
    version?: string;
    minAppVersion?: string;
    preview?: string;
  }) {
    return this.cardMessage(entrada);
  }
```

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
      code: String(order.code ?? ''),
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
  private async notify(o: any, autorId: string, texto: string, accion?: string) {
    try {
      const otro = o.shop_owner === autorId ? o.buyer_id : o.shop_owner;
      if (!otro) return;
      const cardType = accion ? TARJETA_DEL_AVISO[accion] : undefined;
      // Sin tarjeta conocida, se manda el aviso de siempre: nunca se pierde un aviso por no tener
      // una tarjeta que lo pinte.
      if (!cardType) {
        const conv = await this.conversacionDirecta(autorId, otro);
        if (!conv) return;
        await this.publicarEnChat(conv, autorId, texto, 'system', {});
        return;
      }
      await this.lb.emitirTarjeta({
        fromId: autorId,
        toId: otro,
        cardType,
        data: { ...(await this.fotoDelPedido(o)), title: texto },
        preview: texto,
      });
    } catch (e) {
      this.log.warn(`no se pudo avisar del pedido: ${(e as Error).message}`);
    }
  }
```

Las llamadas de `orderAction` (líneas 845 y 861) pasan a llevar la acción:

```ts
    if (a === 'dispute' && motivo) {
      await this.notify(o, userId, `El comprador abrió una reclamación: «${motivo}»`, a);
      return this.orderDetail(orderId, userId);
    }
    ...
    await this.notify(o, userId, aviso ?? 'El pedido cambió de estado', a);
```

`confirmDeliveryCode` (línea ~903) también avisa con `deliver`.

### 4c · Los tres avisos que hoy no existen

Los tres se emiten en el mismo sitio donde ocurre el hecho, con los datos que ya están cargados. **No
se inventa ningún dato**: si el importe no está en la fila que se acaba de leer, no se manda el aviso.

```ts
  // En markPaid, DESPUÉS de que el UPDATE confirme que se marcó (no antes):
  await this.lb.emitirTarjeta({
    fromId: o.seller_id, toId: o.buyer_id,
    cardType: 'cobro',
    data: { importe: `${Number(o.total_xaf)} XAF`, motivo: 'Pedido marcado como cobrado', estado: 'Cobrado' },
    preview: 'Tu pedido se ha marcado como cobrado',
  });

  // En setDeliveryCost, después del UPDATE:
  await this.lb.emitirTarjeta({
    fromId: o.seller_id, toId: o.buyer_id,
    cardType: 'cobro',
    data: { importe: `${cost} XAF`, motivo: 'Coste de envío acordado', estado: 'Aceptar' },
    preview: 'La tienda ha fijado el coste de envío',
  });

  // En reviewOrder, después de guardar la reseña:
  await this.lb.emitirTarjeta({
    fromId: userId, toId: o.seller_id,
    cardType: 'aviso',
    data: { top: 'Gracias por tu valoración', content: `Has valorado «${o.title}» con ${rating} de 5` },
    preview: 'El comprador ha dejado una valoración',
  });
```

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
   */
  if (cfg.to === 'delivered') {
    const yaValorada: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.order_reviews WHERE order_id = ${orderId}::uuid LIMIT 1`;
    if (!yaValorada[0]) {
      await this.lb.emitirTarjeta({
        fromId: o.seller_id, toId: o.buyer_id,
        cardType: 'invitacion-resena',
        data: {
          goods_name: String(o.title ?? ''),
          goods_image: o.media_url ? String(o.media_url) : null,
          reviewable: true,
        },
        preview: '¿Nos cuentas qué tal?',
      });
    }
  }
```

> **Comprobar el nombre real de la tabla y las columnas antes de aplicar**: aquí se ha escrito
> `lifebook.order_reviews` a partir de `reviewOrder`, y `o.title` / `o.media_url` a partir de lo que
> devuelve `publicOrder`. **No se ha podido verificar contra la base de datos**, solo contra el
> código que las lee.

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
     * AHORA: si el que llama dice qué tarjeta es, se emite como tarjeta y el dato se ve. Si no,
     * sigue saliendo el texto de siempre — ningún aviso se pierde por no tener tarjeta.
     */
    if (tarjeta) {
      await this.lb.emitirTarjeta({
        convId: String(conv[0].id),
        fromId: vendedor,
        cardType: tarjeta,
        data: payload,
        preview: cuerpo,
      });
      return;
    }

    await this.db.$executeRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${conv[0].id}::uuid, ${vendedor}::uuid, ${cuerpo}, 'system', ${JSON.stringify(payload)}::jsonb)`;
    // … el UPDATE de la conversación se queda igual …
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
