# PARCHE · Importe mínimo de reparto visible ANTES de confirmar

**Defecto:** parte del hueco «checkout desincronizado del backend» detectado el 2026-09-12.
**Estado:** escrito, **no aplicado**. Toca `food.service.ts` → territorio del otro agente
(guardia de MD5). Este documento es la especificación.
**Depende de:** nada. Es aditivo y no rompe nada existente.

---

## 1. Qué se hizo ya en el frontend y qué falta

El checkout (`app/food-checkout.tsx`) ya quedó corregido el 2026-09-12 en lo que **no**
necesitaba backend:

| | Estado |
|---|---|
| **A1** — precios desde el servidor, no desde el snapshot del carrito | ✅ hecho. Usa `detail.menu`, que ya venía en la llamada existente a `foodApi.restaurant(rid)`. Sin petición nueva |
| Aviso de precio cambiado, con nombre del plato y las dos cifras | ✅ hecho |
| Platos ya no disponibles: detectados antes de enviar, nombrados, CTA bloqueado | ✅ hecho |
| Desglose honesto: ya no dice «Envío 0 XAF · sin recargo» | ✅ hecho. Ahora: reparto gratis para el cliente + las comisiones las paga el restaurante |
| Comisiones visibles para cliente **y** dueño en la pantalla del pedido | ✅ hecho (`food-orders.tsx`, decisión del dueño 2026-09-12) |
| **Importe mínimo de reparto avisado ANTES de confirmar** | ❌ **falta — necesita este parche** |
| Cifras exactas de comisión antes de confirmar | ❌ falta — mismo parche, opcional |

## 2. Por qué el mínimo no se puede hacer solo en frontend

El servidor ya lo impone al crear el pedido (`descargas/food.service.ts:319-325`):

```ts
if (d.pickupType === 'delivery' && !permiteReparto(total, cfg.minOrderXaf ?? 0)) {
  const minimo = Math.round(cfg.minOrderXaf ?? 0);
  throw new BadRequestException(
    `Para reparto el pedido mínimo es ${minimo} XAF (llevas ${total} XAF). ` +
    'Puedes añadir algo más o cambiar a recoger en el local.',
  );
}
```

Pero la configuración es **por restaurante** y vive en `wallet.food_commission_config`
(`:312-313`). `mapRestaurant` (`:983-997`) **no la devuelve**, así que la app no tiene
forma de saber el mínimo antes de enviar.

**Consecuencia hoy:** el cliente elige reparto con un pedido de 1 500 XAF, pulsa
«Confirmar pedido», y recibe el error **después** de enviar. El mensaje del servidor es
bueno (dice la cifra y la alternativa) y `food-checkout.tsx:116` lo muestra inline, así
que no es un fallo grave — pero el cliente descubre la restricción al final del flujo,
cuando ya había decidido.

**No se debe hardcodear 2 000 en la app.** Es un valor por restaurante y se cambia sin
desplegar código; duplicarlo en el cliente crearía exactamente la desincronización que
se está arreglando.

## 3. El parche

### CAMBIO 1 · leer la configuración en `restaurant()`

**Ancla:** el método `async restaurant(id: string)`, que hoy termina con
`return { ...this.mapRestaurant(rows[0]), menu: menu.map((m) => this.mapMenuItem(m)) };`

```ts
  async restaurant(id: string) {
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT r.*, c.label AS cuisine_label, c.icon AS cuisine_icon
       FROM wallet.food_restaurants r LEFT JOIN wallet.food_cuisines c ON c.id = r.cuisine_id
       WHERE r.id=$1::uuid AND r.status='active' LIMIT 1`, id);
    if (!rows[0]) throw new NotFoundException('Restaurante no encontrado');
    const menu: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM wallet.food_menu_items WHERE restaurant_id=$1::uuid AND status='active' AND available=true
       ORDER BY category, created_at`, id);

    // ▼▼ NUEVO — configuración de dinero, para que la app avise ANTES de confirmar ▼▼
    // La misma consulta que ya hace createOrder (:312-313). Se devuelve SOLO lo que el
    // cliente necesita ver: el mínimo de reparto. Los porcentajes de comisión NO se
    // exponen aquí a propósito — ver §5.
    const cfgRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT min_order_xaf FROM wallet.food_commission_config WHERE restaurant_id=$1::uuid LIMIT 1`, id);
    const cfg = aConfigFee(cfgRows[0] ?? {});
    // ▲▲ FIN NUEVO ▲▲

    return {
      ...this.mapRestaurant(rows[0]),
      menu: menu.map((m) => this.mapMenuItem(m)),
      minOrderXaf: Math.round(cfg.minOrderXaf ?? 0),   // ▼ NUEVO
    };
  }
```

`aConfigFee` ya está importado (`:22`) y ya maneja el caso «el restaurante no tiene
fila»: cae en `MIN_ORDER_POR_DEFECTO` y **no inventa NaN**. No hace falta añadir nada.

### CAMBIO 2 · el tipo en el frontend

En `api/food.ts`, interface `FoodRestaurant` — **añadir al final**, opcional para que un
backend sin el parche no rompa la app:

```ts
  /** 起送价: importe mínimo para pedir a DOMICILIO en este restaurante. Recoger en el
   *  local no tiene mínimo. `undefined` si el servidor aún no lo devuelve (parche
   *  CHECKOUT-fees-y-minimo.md pendiente): la app no avisa, pero el servidor sigue
   *  rechazando con su mensaje, así que no se puede pedir por debajo. */
  minOrderXaf?: number | null;
```

### CAMBIO 3 · avisar en el checkout

En `app/food-checkout.tsx`, junto a los avisos de `missing` y `priceChanges` que ya
existen. La condición importante: **solo cuando hay cifras y solo en reparto**.

```tsx
{pickup === 'delivery' && typeof detail?.minOrderXaf === 'number' && detail.minOrderXaf > 0 && total < detail.minOrderXaf && (
  <View style={[s.warnBox, { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.3) }]}>
    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.danger }}>
      Para reparto el pedido mínimo es {formatXAF(detail.minOrderXaf)}
    </Text>
    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3, lineHeight: 15 }}>
      Llevas {formatXAF(total)}. Añade algo más o cambia a recoger en el local.
    </Text>
  </View>
)}
```

Y bloquear el CTA **solo en ese caso** — recoger en el local siempre debe poder
confirmarse, que es justo lo que garantiza el servidor:

```tsx
const bloqueadoPorMinimo =
  pickup === 'delivery' &&
  typeof detail?.minOrderXaf === 'number' &&
  detail.minOrderXaf > 0 &&
  total < detail.minOrderXaf;

// en el PrimaryButton:
disabled={busy || sent || lines.length === 0 || missing.length > 0 || bloqueadoPorMinimo}
```

**No tocar el texto del botón ni el total.** El total sigue siendo el bruto: las
comisiones no se le suman al cliente.

## 4. Lo que NO hay que cambiar

- **`createOrder`**: su comprobación del mínimo (`:319-325`) se queda **tal cual**. Es la
  autoridad. El aviso del frontend es comodidad, no seguridad: un cliente con una app
  vieja, o una petición directa, sigue topando con el rechazo del servidor. Quitar la
  comprobación del servidor porque «la app ya avisa» sería abrir el agujero otra vez.
- **`food-fees.ts`**: ni se toca. Es el módulo puro con 17/17 pruebas y la regla de
  precedencia (el tope gana sobre el mínimo) escrita y probada.
- **`mapOrder`**: ya devuelve el desglose congelado. La pantalla del pedido ya lo pinta
  para ambos roles desde el 2026-09-12.

## 5. Decisión de producto que queda abierta (y por qué no la tomé yo)

El dueño decidió «la comisión se muestra a ambos». Eso ya está hecho en la **pantalla
del pedido**, con las cifras reales congeladas en el pedido. Lo que **no** hice es
mostrar cifras de comisión **antes** de confirmar, y hay una razón concreta:

Para calcularlas en el checkout haría falta exponer `platformPercent`, `platformMinXaf`,
`riderFixedXaf`, `riderPercent` y `maxTotalPercent` a **cualquier usuario sin
autenticar** — `restaurant(id)` es un endpoint público. Y replicar `computeOrderFees` en
la app sería duplicar la regla de precedencia (mínimo vs tope) en dos lenguajes: si
cambia en el servidor y no en la app, la app mostraría una comisión y se cobraría otra.
Es el mismo error que este parche viene a arreglar.

Tres opciones, y conviene que decidas:

| Opción | Qué ve el cliente antes de confirmar | Coste |
|---|---|---|
| **A** (lo que propone este parche) | Solo el mínimo de reparto. Las comisiones se ven después, en la pantalla del pedido, con cifras exactas | Un campo expuesto. Sin duplicar lógica |
| **B** | También un **endpoint nuevo de preview** que reciba el total y devuelva `computeOrderFees` calculado **en el servidor** | Un endpoint nuevo. Cero duplicación, cifras exactas antes de confirmar |
| **C** | La config completa expuesta y cálculo en la app | Duplica la lógica de dinero en dos sitios. **No lo recomiendo** |

**Mi recomendación: A ahora, B si de verdad hace falta.** A cierra el fallo operativo
(pedir por debajo del mínimo y descubrirlo al final). B es la única forma correcta de
mostrar cifras antes, y solo merece la pena si el cliente necesita ver la comisión antes
de decidir — que con el modelo actual (las comisiones las paga el restaurante, el
cliente paga el bruto) no cambia lo que el cliente paga.

## 6. Comprobación tras desplegar

```bash
# 1. El mínimo llega en el detalle del restaurante (endpoint PÚBLICO, sin token):
curl -s https://hk.egrouteplan.com/api/food/restaurants/<ID> \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('minOrderXaf =', d.get('minOrderXaf'))"
#    → un entero (2000 con la config por defecto), NO None

# 2. Que NO se hayan filtrado los porcentajes:
curl -s https://hk.egrouteplan.com/api/food/restaurants/<ID> \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print([k for k in d if 'ercent' in k or 'in_xaf' in k.lower()])"
#    → [] (lista vacía)

# 3. En el aparato, no en el log: pedido de 1 500 XAF con reparto → aviso rojo ANTES de
#    pulsar confirmar, y CTA deshabilitado. Cambiar a «recoger» → el aviso desaparece y
#    se puede confirmar. Es la distinción que el servidor ya garantiza y la app debe
#    respetar.
```

Y las suites del protocolo §5: `build` con `errores TS: 0` → `lb42e-guard-check.sh` →
`e2e-pedidos → 49/49`.

## 7. Coordinación

`food.service.ts` es territorio del otro agente. Su guardia compara el MD5 del fichero
instalado y **se niega a instalar si no coincide**, así que este cambio debe aplicarlo él
o pasar por él. MD5 de referencia en su última nota: `food.service.ts` →
`a4991c4c613b50c11a23828ec662a249`.

Los dos cambios de frontend (`api/food.ts`, `app/food-checkout.tsx`) los puedo aplicar yo
— no están bajo su guardia — pero **no conviene**: si se despliega el frontend sin el
backend, `detail.minOrderXaf` llega `undefined` y el aviso simplemente no aparece. No
rompe nada (el servidor sigue rechazando con su mensaje), pero no arregla nada tampoco.
Mejor los tres cambios juntos.
