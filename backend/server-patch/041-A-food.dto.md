# PARCHE 041-A · `food.dto.ts` — detalle de plato

Acompaña a la migración `backend/sql/food-item-details.sql.sh`.

**Cómo aplicar:** sustituye los dos schemas `MenuItemCreateSchema` y
`MenuItemUpdateSchema` de tu `food.dto.ts` del servidor por los de abajo.
El resto del fichero no cambia.

> **Protocolo de coexistencia §5:** `food.dto.ts` **no** es fichero compartido
> (no está en la tabla de §3), así que lo puede escribir el agente de
> restaurante. Lo que sí hay que respetar: no declarar ningún código de error
> nuevo en `error.filter.ts` — este parche no añade ninguno, usa los
> `BadRequestException` de Zod ya existentes. Antes de desplegar, pasar las
> cuatro comprobaciones de §5.

Todos los campos nuevos son **opcionales** → los clientes viejos (E2E, app sin
actualizar) siguen creando platos sin ellos. No rompe nada.

```ts
import { z } from 'zod';

// --- Nuevos: enums y límites del detalle de plato ----------------------------
/** Nivel de picante. NULL en BD = el dueño no lo declaró (no se muestra). */
export const SPICE_LEVELS = ['none', 'mild', 'medium', 'hot', 'extra_hot'] as const;

/** Límites de validación (espejo de los CHECK de la migración 041). */
export const PREP_MINUTES_MAX = 240;
export const SIDES_MAX = 20;
export const INGREDIENTS_MAX = 1000;
export const PORTION_SIZE_MAX = 40;

const IngredientsSchema = z
  .string().trim().min(1, 'Los ingredientes no pueden estar vacíos')
  .max(INGREDIENTS_MAX, `Máximo ${INGREDIENTS_MAX} caracteres`)
  .nullable().optional();

const SidesSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(SIDES_MAX, `Máximo ${SIDES_MAX} acompañantes`)
  .default([]);

const PrepMinutesSchema = z
  .number().int('El tiempo debe ser un número entero de minutos')
  .min(1, 'Mínimo 1 minuto').max(PREP_MINUTES_MAX, `Máximo ${PREP_MINUTES_MAX} minutos`)
  .nullable().optional();

// --- REEMPLAZA tu MenuItemCreateSchema por este ------------------------------
export const MenuItemCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nombre del ítem obligatorio').max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(['bebida', 'plato', 'postre']).default('plato'),
  priceXaf: z.number().int().positive('El precio debe ser mayor que 0').max(100_000_000),
  photos: z.array(z.string().url('Foto inválida')).max(10).default([]),
  available: z.boolean().default(true),

  // ▼▼ NUEVO — detalle del plato (migración 041) ▼▼
  ingredients: IngredientsSchema,
  spiceLevel: z.enum(SPICE_LEVELS).nullable().optional(),
  portionSize: z.string().trim().max(PORTION_SIZE_MAX).nullable().optional(),
  drinkIncluded: z.boolean().default(false),
  sides: SidesSchema,
  prepMinutes: PrepMinutesSchema,
  // ▲▲ FIN NUEVO ▲▲
});

// --- REEMPLAZA tu MenuItemUpdateSchema por este ------------------------------
// Aquí NO hay .default(): en update, `undefined` = "no lo toques" (parcial,
// igual que el resto de campos) y `null` = "bórralo".
export const MenuItemUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(['bebida', 'plato', 'postre']).optional(),
  priceXaf: z.number().int().positive().max(100_000_000).optional(),
  photos: z.array(z.string().url()).max(10).optional(),
  available: z.boolean().optional(),

  // ▼▼ NUEVO — detalle del plato (migración 041) ▼▼
  ingredients: z.string().trim().min(1).max(INGREDIENTS_MAX).nullable().optional(),
  spiceLevel: z.enum(SPICE_LEVELS).nullable().optional(),
  portionSize: z.string().trim().max(PORTION_SIZE_MAX).nullable().optional(),
  drinkIncluded: z.boolean().optional(),
  sides: z.array(z.string().trim().min(1).max(60)).max(SIDES_MAX).optional(),
  prepMinutes: z.number().int().min(1).max(PREP_MINUTES_MAX).nullable().optional(),
  // ▲▲ FIN NUEVO ▲▲
});
```
