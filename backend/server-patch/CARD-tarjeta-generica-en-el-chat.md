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
hecho. Ejemplos de dónde va cada una — **ninguno está en este parche**, porque cada uno pertenece al
flujo que lo provoca:

| Cuándo | `cardType` | Desde |
|---|---|---|
| Se cancela un pedido | `cancelacion` | `orders.service.ts` |
| Se acuerda otra fecha de entrega | `entrega-negociada` | `orders.service.ts` |
| Se abre una postventa | `postventa` | `commerce.service.ts` |
| Se reclama un cupón | `cupon-reclamar` | `commerce.service.ts` |
| Se acredita un cobro | `cobro` | `payments.service.ts` |
| Cambia el estado de un envío | `pedido-logistico` | logística |

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
