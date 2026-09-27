// =============================================================================
// lb42a-dtos.ts — DTOs validados de la Parte 42-a (hotel).
//
// El `ValidationPipe` global del servidor ya va con `whitelist: true` y
// `forbidNonWhitelisted: true` (verificado en `main.ts`): con estos DTOs, un estado
// inventado, una fecha basura o un `guests=abc` se convierten en **400 explicado en
// la puerta**, en vez de llegar a la base y salir como **500** (`invalid input syntax
// for type date`) o como **lista vacía silenciosa** (`capacity >= NaN` es `false`).
//
// Se colocan en `src/lifebook/dto/` como los de intercity: el módulo desplegado es
// `src/lifebook`, no `src/hotel`.
// =============================================================================
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

/** Estados de reserva sobre los que una PERSONA puede actuar (el `hold` lo pone el sistema). */
export const RESERVATION_TARGET_STATUSES = [
  'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show',
] as const;

/**
 * Cambiar el estado de una reserva.
 *
 * `reason` es obligatorio de verdad en dos casos (cancelar y no-presentar), pero eso
 * lo decide el SERVICIO: una regla cruzada en el DTO (`@ValidateIf`) es más frágil y
 * el motivo tiene que quedar registrado aunque la petición venga de otro sitio.
 */
export class UpdateReservationStatusDto {
  @IsIn(RESERVATION_TARGET_STATUSES as unknown as string[], {
    message: `status debe ser uno de: ${RESERVATION_TARGET_STATUSES.join(', ')}`,
  })
  status!: string;

  /** Motivo (obligatorio al cancelar y al marcar no-presentado). */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El motivo necesita al menos 3 letras' })
  @MaxLength(300)
  reason?: string;
}

/** Confirmar el cobro de la señal: la referencia con la que se comprobó. */
export class ConfirmDepositDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  proof?: string;
}

/**
 * Filtros del panel de reservas del hotelero.
 * `status` viaja a un `WHERE`, así que se cierra aquí (antes era un `string` libre).
 */
export class ShopReservationsQueryDto {
  @IsOptional()
  @IsIn(['hold', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * Búsqueda de alojamiento.
 *
 * Antes: `@Query('guests') guests: string` → `Number('abc')` = NaN → `capacity >= NaN`
 * es `false` en Postgres → **0 resultados y 200 OK** (el fallo más traicionero).
 * Ahora entra como número, acotado, y las fechas se validan con su formato.
 */
export class HotelSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkOut?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  guests?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  units?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  pageSize?: number;
}

/** Ficha del hotel (panel del hotelero). */
export class HotelProfileDto {
  @IsOptional()
  @IsIn(['hotel', 'hostal', 'guest_house', 'apartahotel', 'resort', 'motel'])
  propertyKind?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number;

  @IsOptional() @IsString() @MaxLength(5) checkinFrom?: string;
  @IsOptional() @IsString() @MaxLength(5) checkinUntil?: string;
  @IsOptional() @IsString() @MaxLength(5) checkoutUntil?: string;

  @IsOptional() @IsBoolean() receptionOpen24h?: boolean;
  @IsOptional() @IsBoolean() taxesIncluded?: boolean;
  @IsOptional() @IsString() @MaxLength(600) houseRules?: string;
  /** Cómo llegar y dónde hacer el check-in (entrada, piso, referencia). Lo lee el huésped al llegar. */
  @IsOptional() @IsString() @MaxLength(600) arrivalNote?: string;
  @IsOptional() @IsString() @MaxLength(600) cancellationPolicy?: string;
  @IsOptional() amenities?: unknown;
  /** Formas de pago del hotel. Acepta lo mismo que devuelve `GET my/hotel`: nombres (`"transfer"`)
   *  u objetos con `method` (`{method:"transfer"}`). Los métodos que un hotel no ofrece (contra
   *  entrega) se ignoran y se devuelven en `ignoredPaymentMethods`; una errata da 400. */
  @IsOptional() paymentMethods?: unknown;
}

/** Cierre de fechas / precio de temporada / estancia mínima en el calendario. */
export class HotelCalendarDto {
  @IsOptional()
  @IsIn(['set', 'clear'])
  action?: 'set' | 'clear';

  @IsString() @MaxLength(10) from!: string;
  @IsString() @MaxLength(10) to!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceXaf?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  minNights?: number;

  @IsOptional() @IsBoolean() isClosed?: boolean;
  @IsOptional() weekdays?: unknown;
  @IsOptional() @IsString() @MaxLength(120) note?: string;
}
