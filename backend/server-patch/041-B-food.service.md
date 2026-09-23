# PARCHE 041-B · `food.service.ts` — detalle de plato

Acompaña a la migración `backend/sql/food-item-details.sql.sh` y al parche
`041-A-food.dto.md`.

> **Protocolo de coexistencia §3:** `food.service.ts` **no** aparece en la tabla
> de ficheros compartidos — los compartidos son `lifebook/orders.service.ts`,
> `lifebook/commerce.service.ts`, `http/error.filter.ts` y `http/app.module.ts`.
> Este parche **no toca ninguno de los cuatro**, así que no puede romper las
> puertas del hotel (§4). Verifícalo igualmente con
> `bash /tmp/lb42e-guard-check.sh` antes de desplegar (§5, punto 3).

Son **5 cambios quirúrgicos**. Los números de línea son orientativos (snapshot
del servidor). Reglas respetadas: SQL crudo con placeholders `$1,$2…`, dinero
entero en XAF, mismas excepciones Nest ya usadas, sin Prisma Client tipado.

---

## CAMBIO 1 · `mapMenuItem()` — devolver los campos nuevos

**Sustituye** tu método `mapMenuItem(m)` completo (línea ~754) por este. Los
campos nuevos llevan `?? null` / `?? []` para que un plato antiguo (columnas
NULL tras el ALTER) se serialice igual que uno nuevo.

```ts
  private mapMenuItem(m: any): any {
    return {
      id: String(m.id), restaurantId: String(m.restaurant_id), name: m.name,
      description: m.description ?? null, category: m.category,
      priceXaf: Number(m.price_xaf), photos: m.photos ?? [],
      available: m.available === true || m.available === 't', status: m.status,
      rejectionReason: m.rejection_reason ?? null, createdAt: m.created_at,
      // ▼▼ NUEVO (041) ▼▼
      ingredients: m.ingredients ?? null,
      spiceLevel: m.spice_level ?? null,
      portionSize: m.portion_size ?? null,
      drinkIncluded: m.drink_included === true || m.drink_included === 't',
      sides: Array.isArray(m.sides) ? m.sides : [],
      prepMinutes: m.prep_minutes === null || m.prep_minutes === undefined
        ? null
        : Number(m.prep_minutes),
      // ▲▲ FIN NUEVO ▲▲
    };
  }
```

---

## CAMBIO 2 · `createMenuItem()` — persistir los campos nuevos

**Sustituye** tu método `createMenuItem(userId, body)` completo (línea ~170).
Los placeholders se renumeran: antes llegaban hasta `$7`, ahora hasta `$13`.

```ts
  async createMenuItem(userId: string, body: any) {
    const d = this.parse(MenuItemCreateSchema, body ?? {});
    const owner = await this.requireActiveRestaurant(userId);
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `INSERT INTO wallet.food_menu_items
         (restaurant_id, name, description, category, price_xaf, photos, available, status,
          ingredients, spice_level, portion_size, drink_included, sides, prep_minutes)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, 'pending',
               $8, $9, $10, $11, $12::jsonb, $13)
       RETURNING id, status`,
      owner.id, d.name, d.description ?? null, d.category, d.priceXaf,
      JSON.stringify(d.photos), d.available,
      // ▼▼ NUEVO (041) ▼▼
      d.ingredients ?? null,
      d.spiceLevel ?? null,
      d.portionSize ?? null,
      d.drinkIncluded ?? false,
      JSON.stringify(d.sides ?? []),
      d.prepMinutes ?? null,
      // ▲▲ FIN NUEVO ▲▲
    );
    return { message: 'Ítem enviado a revisión del administrador', itemId: String(rows[0].id), status: rows[0].status };
  }
```

---

## CAMBIO 3 · `updateMenuItem()` — editar los campos nuevos

**Añade** estas 6 líneas en tu `updateMenuItem` (línea ~181), justo **después**
de `if (d.photos !== undefined) { ... }` y **antes** de `args.push(itemId);`.

Sigue el patrón existente `undefined = no tocar`. Por eso no se usa `?? null`:
un `null` explícito del cliente **sí** borra el campo (comportamiento buscado,
igual que `description` o `photoKey`).

```ts
    if (d.ingredients !== undefined) { set.push(`ingredients=$${args.length + 1}`); args.push(d.ingredients); }
    if (d.spiceLevel !== undefined) { set.push(`spice_level=$${args.length + 1}`); args.push(d.spiceLevel); }
    if (d.portionSize !== undefined) { set.push(`portion_size=$${args.length + 1}`); args.push(d.portionSize); }
    if (d.drinkIncluded !== undefined) { set.push(`drink_included=$${args.length + 1}`); args.push(d.drinkIncluded); }
    if (d.sides !== undefined) { set.push(`sides=$${args.length + 1}::jsonb`); args.push(JSON.stringify(d.sides)); }
    if (d.prepMinutes !== undefined) { set.push(`prep_minutes=$${args.length + 1}`); args.push(d.prepMinutes); }
```

---

## CAMBIO 4 · `createOrder()` — snapshot del tiempo de preparación

### 4a) Traer `prep_minutes` en la validación de ítems (línea ~244)

```sql
-- ANTES
SELECT id, name, price_xaf, status, available FROM wallet.food_menu_items
-- DESPUÉS
SELECT id, name, price_xaf, status, available, prep_minutes FROM wallet.food_menu_items
```

### 4b) Guardar `prepMinutes` en el snapshot del ítem

Dentro del bucle `for (const it of d.items) { ... }` (línea ~251), cambia el
`items.push(...)`:

```ts
      items.push({
        itemId: String(m.id), name: m.name, price: Number(m.price_xaf), qty,
        prepMinutes: m.prep_minutes === null || m.prep_minutes === undefined
          ? null : Number(m.prep_minutes),
      });
```

> ⚠️ El snapshot `items` se guarda en `wallet.food_orders.items` y se muestra en
> las pantallas de pedido. Añadir la clave es **aditivo**: los consumidores
> actuales (`food-orders.tsx`, `food-rider.tsx`) la ignoran sin romperse.

### 4c) Calcular el ETA del pedido

**Añade** justo después de ese bucle, antes del INSERT (línea ~257):

```ts
    // ETA del pedido = el plato MÁS LENTO (en cocina se preparan en paralelo).
    // NULL si ningún ítem declaró prep_minutes → la app no muestra estimación.
    const preps = items
      .map((i: any) => i.prepMinutes)
      .filter((v: any): v is number => typeof v === 'number' && v > 0);
    const estPrepMinutes = preps.length > 0 ? Math.max(...preps) : null;
```

### 4d) **Sustituye** el INSERT del pedido (línea ~269)

```ts
    const o: any[] = await this.prisma.$queryRawUnsafe(
      `INSERT INTO wallet.food_orders
         (user_id, restaurant_id, items, total_xaf, payment_method, billing_order_id,
          status, pickup_type, delivery_address, note, est_prep_minutes)
       VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5, $6::uuid, 'placed', $7, $8, $9, $10)
       RETURNING id, status`,
      userId, d.restaurantId, JSON.stringify(items), total, d.paymentMethod, billingOrderId,
      d.pickupType, d.deliveryAddress ?? null, d.note ?? null,
      estPrepMinutes);   // ▼ NUEVO (041)
```

---

## CAMBIO 5 · `mapOrder()` — exponer el ETA

**Añade** en `mapOrder(r)` (línea ~764), junto a `deliveredAt`:

```ts
      estPrepMinutes: r.est_prep_minutes === null || r.est_prep_minutes === undefined
        ? null
        : Number(r.est_prep_minutes),
```

---

## Lo que NO hay que tocar

- **`food.controller.ts`**: los endpoints de menú ya declaran `@Body() body: any`
  y delegan la validación en el service (`this.parse(...)`). Los campos nuevos
  pasan por la ruta existente sin cambio de firma.
- **Prisma schema**: este módulo usa `$queryRawUnsafe` contra el schema `wallet`,
  no modelos Prisma tipados.
- **Permisos**: `030_food.sql` ya concedió `GRANT` a nivel de tabla a `malabogo`;
  un `ALTER TABLE ADD COLUMN` no revoca privilegios existentes. La migración 041
  incluye una consulta de verificación al final.
