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

## Después de aplicar

1. **Nada de migración**: `lifebook.messages.kind` es texto y `payload` es `jsonb`, así que un
   `kind='card'` nuevo entra sin tocar el esquema.
2. **Nada de desplegar el cliente a la vez**: el cliente ya desplegado no conoce `card`, así que los
   mensajes nuevos le llegan y no los pinta. Por eso **la emisión y el despliegue del cliente van
   juntos**: hasta que la app con el registro no esté en las tiendas, emitir tarjetas es escribir
   mensajes que nadie ve.
3. **El orden correcto es**: primero el cliente (que ya está hecho, en `components/lifebook/tarjetas/`),
   después este parche. Al revés se pierden mensajes.
