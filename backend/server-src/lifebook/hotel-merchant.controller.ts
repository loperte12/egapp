// =============================================================================
// lb42a-merchant.controller.ts — PARTE 42-a · RUTAS DEL PANEL DEL HOTEL
//
// Montaje (lo que ya existe, sin inventar un tercer estilo de URL):
//   · `v1/lifebook/commerce/hotel/my/hotel/*`  → panel por SESIÓN (la app no manda
//     ningún id; no hay nada que adivinar y nada que comprobar).
//   · `v1/lifebook/commerce/hotel/shops/:shopId/*` → la MISMA información con la
//     tienda en la ruta, pasando por `ShopOwnerGuard` (defensa en profundidad).
//
// 🔒 La puerta que de verdad cierra es la del SERVICE (la pertenencia viaja dentro
// del `WHERE`): el guard es la segunda capa, no la única. Un `shopId` ajeno responde
// **404** en las dos capas (ni 403 ni lista vacía: no se confirma que exista).
//
// El dueño pedía `PATCH .../status` con `{ status }`: se conserva esa ruta y se
// mantiene la que ya estaba desplegada (`.../action` con `{ action, reason }`), porque
// la app publicada la usa. Ninguna se duplica en lógica: las dos van al mismo método.
// =============================================================================
import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, ShopOwnerGuard, type AuthUser } from '../http/guards';
import { LifebookHotelMerchantService } from './hotel-merchant.service';
import {
  ConfirmDepositDto, ShopReservationsQueryDto, UpdateReservationStatusDto,
} from './dto/hotel-reservation.dto';

@Controller('v1/lifebook/commerce/hotel')
export class LifebookHotelMerchantController {
  constructor(private readonly merchant: LifebookHotelMerchantService) {}

  // ═══════════════ PANEL POR SESIÓN (lo que usa la app) ═════════════════════

  /** Resumen del día: llegadas, salidas, dentro, por confirmar, retenidas y ocupación. */
  @Get('my/hotel/dashboard')
  @UseGuards(JwtAuthGuard)
  dashboard(@CurrentUser() u: AuthUser) {
    return this.merchant.getHotelDashboard(u.userId);
  }

  /** Reservas del hotel, lo urgente primero (retenidas → por confirmar → por fecha). */
  @Get('my/hotel/reservations')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() u: AuthUser, @Query() q: ShopReservationsQueryDto) {
    return this.merchant.listReservationsForShop(u.userId, {
      status: q.status, from: q.from, to: q.to, limit: q.limit,
    });
  }

  /** Detalle (con el teléfono del huésped: hace falta para recibirlo). */
  @Get('my/hotel/reservations/:reservationId')
  @UseGuards(JwtAuthGuard)
  detail(
    @CurrentUser() u: AuthUser,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    return this.merchant.getReservationForShop(u.userId, reservationId);
  }

  /** Cambiar estado con `{ status, reason }` (DTO validado: estado cerrado + motivo). */
  @Patch('my/hotel/reservations/:reservationId/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @CurrentUser() u: AuthUser,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.merchant.updateReservationStatus(u.userId, reservationId, dto.status, { reason: dto.reason });
  }

  /** La MISMA acción, con la forma ya desplegada (`{ action, reason }`). */
  @Patch('my/hotel/reservations/:reservationId/action')
  @UseGuards(JwtAuthGuard)
  action(
    @CurrentUser() u: AuthUser,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.merchant.updateReservationStatus(u.userId, reservationId, dto.status, {
      reason: dto.reason,
      action: dto.status,
    });
  }

  /** Confirmar el cobro de la señal, con la referencia con la que se comprobó. */
  @Post('my/hotel/reservations/:reservationId/confirm-deposit')
  @UseGuards(JwtAuthGuard)
  confirmDeposit(
    @CurrentUser() u: AuthUser,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: ConfirmDepositDto,
  ) {
    return this.merchant.confirmDepositForShop(u.userId, reservationId, { proof: dto?.proof });
  }

  // ═══════════════ CON LA TIENDA EN LA RUTA (ShopOwnerGuard) ════════════════

  @Get('shops/:shopId/dashboard')
  @UseGuards(JwtAuthGuard, ShopOwnerGuard)
  dashboardDeTienda(@CurrentUser() u: AuthUser, @Param('shopId', ParseUUIDPipe) shopId: string) {
    return this.merchant.getHotelDashboard(u.userId, shopId);
  }

  @Get('shops/:shopId/reservations')
  @UseGuards(JwtAuthGuard, ShopOwnerGuard)
  reservasDeTienda(
    @CurrentUser() u: AuthUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Query() q: ShopReservationsQueryDto,
  ) {
    return this.merchant.listReservationsForShop(u.userId, {
      shopId, status: q.status, from: q.from, to: q.to, limit: q.limit,
    });
  }

  @Get('shops/:shopId/reservations/:reservationId')
  @UseGuards(JwtAuthGuard, ShopOwnerGuard)
  detalleDeTienda(
    @CurrentUser() u: AuthUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    return this.merchant.getReservationForShop(u.userId, reservationId, shopId);
  }

  @Patch('shops/:shopId/reservations/:reservationId/status')
  @UseGuards(JwtAuthGuard, ShopOwnerGuard)
  estadoDeTienda(
    @CurrentUser() u: AuthUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.merchant.updateReservationStatus(u.userId, reservationId, dto.status, {
      shopId, reason: dto.reason,
    });
  }

  @Post('shops/:shopId/reservations/:reservationId/confirm-deposit')
  @UseGuards(JwtAuthGuard, ShopOwnerGuard)
  senalDeTienda(
    @CurrentUser() u: AuthUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body() dto: ConfirmDepositDto,
  ) {
    return this.merchant.confirmDepositForShop(u.userId, reservationId, { shopId, proof: dto?.proof });
  }
}
