// =============================================================================
// RideSettlementController — endpoints de la P1-c (docs/P1-c-LIQUIDACION-VIAJES.md).
//   POST /v1/rides/:tripId/lock            pasajero: PIN (X-Payment-Token TRIP) → ESCROW_LOCK
//   POST /v1/rides/:tripId/cash            pasajero: pactar en efectivo (registro, sin dinero)
//   POST /v1/rides/:tripId/arrival         conductor: «he llegado» → arranca el auto-cierre
//   POST /v1/rides/:tripId/settle          pasajero: confirmar llegada → RELEASE + FEE
//   POST /v1/rides/:tripId/cancel          pasajero: ventana gratis / cuota no-show (wallet-aware)
//   POST /v1/rides/:tripId/driver-cancel   conductor: reembolso total + strike
//   POST /v1/rides/:tripId/dispute         pasajero: disputa (lock o tras cierre, ventana 7 d)
//   GET  /v1/rides/:tripId/settlement      vista de liquidación para la app (ambas partes)
//   POST /v1/admin/rides/:tripId/dispute/resolve   ADMIN: libera / reembolsa / cierra
// El viaje sigue siendo mobility.taxi_requests; el dinero, wallet.transactions.
// =============================================================================

import {
  Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { RideSettlementService } from '../services/ride-settlement.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { CurrentUser, IdempotencyKey, JwtAuthGuard, PaymentToken } from './guards';
import { DomainError } from '../services/payment-auth.service';

@Controller('v1/rides')
@UseGuards(JwtAuthGuard)
export class RideSettlementController {
  constructor(
    private readonly settlement: RideSettlementService,
    private readonly rides: MobilityPrismaService,
  ) {}

  /** Previsualización de comisión por ciudad (el número lo pone el servidor;
   *  la app no replica fórmulas). Cualquier usuario autenticado puede cotizar. */
  @Get('quote')
  @HttpCode(200)
  async quote(@Query('city') city?: string, @Query('fare') fare?: string) {
    const f = Number(fare ?? 0);
    const q = await this.settlement.quoteView(city ?? null, f);
    return q ?? { scope: null, fee: 0, net: Math.max(0, f) };
  }

  @Post(':tripId/lock')
  @HttpCode(200)
  lock(
    @CurrentUser() u: { userId: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: { city?: string },
    @IdempotencyKey() idempotencyKey: string,
    @PaymentToken() paymentToken?: string,
  ) {
    return this.settlement.lockFare({
      passengerId: u.userId, tripId, city: body?.city,
      paymentToken, idempotencyKey,
    });
  }

  @Post(':tripId/cash')
  @HttpCode(200)
  cash(
    @CurrentUser() u: { userId: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    return this.settlement.chooseCash({ passengerId: u.userId, tripId });
  }

  @Post(':tripId/arrival')
  @HttpCode(200)
  arrival(@CurrentUser() u: { userId: string }, @Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.settlement.markArrival({ driverId: u.userId, tripId });
  }

  @Post(':tripId/settle')
  @HttpCode(200)
  settle(@CurrentUser() u: { userId: string }, @Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.settlement.settle({ tripId, actor: { type: 'PASSENGER', id: u.userId } });
  }

  @Post(':tripId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() u: { userId: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: { reason?: string },
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.settlement.cancelByPassenger({
      passengerId: u.userId, tripId, reason: body?.reason, idempotencyKey,
    });
  }

  @Post(':tripId/driver-cancel')
  @HttpCode(200)
  driverCancel(
    @CurrentUser() u: { userId: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: { reason?: string },
  ) {
    return this.settlement.cancelByDriver({ driverId: u.userId, tripId, reason: body?.reason });
  }

  @Post(':tripId/dispute')
  @HttpCode(200)
  dispute(
    @CurrentUser() u: { userId: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: { reason?: string },
  ) {
    return this.settlement.dispute({ passengerId: u.userId, tripId, reason: String(body?.reason ?? '') });
  }

  @Get(':tripId/settlement')
  view(@CurrentUser() u: { userId: string }, @Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.settlement.getSettlementView({ userId: u.userId, tripId });
  }
}

@Controller('v1/admin/rides')
@UseGuards(JwtAuthGuard)
export class AdminRideSettlementController {
  constructor(
    private readonly settlement: RideSettlementService,
    private readonly rides: MobilityPrismaService,
  ) {}

  // El rol se comprueba contra mobility.users (misma fuente que el panel de
  // documentos), no contra el JWT: el token unificado de la app no trae roles.
  private async assertAdmin(userId: string) {
    const rows: any[] = await this.rides.$queryRaw`SELECT role FROM mobility.users WHERE id = ${userId}::uuid`;
    if (rows[0]?.role !== 'ADMIN') throw new DomainError('ADMIN_REQUIRED', 'Reservado a administradores');
  }

  @Post(':tripId/dispute/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentUser() u: { userId: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: { outcome?: string; note?: string },
    @IdempotencyKey() idempotencyKey: string,
  ) {
    await this.assertAdmin(u.userId);
    const outcome = String(body?.outcome ?? '');
    if (!['RELEASE_DRIVER', 'REFUND_PASSENGER', 'CLOSE'].includes(outcome)) {
      throw new DomainError('OUTCOME_INVALID', 'outcome: RELEASE_DRIVER | REFUND_PASSENGER | CLOSE');
    }
    return this.settlement.resolveDispute({
      adminId: u.userId, tripId, outcome: outcome as any,
      note: String(body?.note ?? ''), idempotencyKey,
    });
  }

  /** Cola de disputas abiertas para el panel de soporte. */
  @Get('disputes')
  async disputes(@CurrentUser() u: { userId: string }, @Query('limit') limit?: string) {
    await this.assertAdmin(u.userId);
    const n = Math.min(Math.max(Number(limit ?? 30), 1), 100);
    const rows: any[] = await this.rides.$queryRaw`
      SELECT t.id, t.status, t.city, t.final_price, t.disputed_at, t.dispute_reason,
             up.phone AS passenger_phone, ud.phone AS driver_phone
      FROM mobility.taxi_requests t
      LEFT JOIN mobility.users up ON up.id = t.user_id
      LEFT JOIN mobility.users ud ON ud.id = t.driver_id
      WHERE t.disputed_at IS NOT NULL AND t.dispute_resolved_at IS NULL
      ORDER BY t.disputed_at DESC LIMIT ${n}::int`;
    return { disputes: rows };
  }
}
