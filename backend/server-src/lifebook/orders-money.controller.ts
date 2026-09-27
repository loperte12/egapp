// =============================================================================
// orders-money.controller.ts — EL DINERO DEL COMERCIO (punto 8 de la §3)
//
// Va en un controlador APARTE, con su ruta propia (`/lifebook/commerce/money/*`), por dos razones:
//   · `orders.controller.ts` ya lo están tocando a la vez (mark-paid, reseñas, reclamación) y aquí hay
//     dos personas trabajando el mismo día;
//   · y porque estas rutas son de DINERO: conviene que se lean juntas y no mezcladas con las del pedido.
//
// Rutas:
//   GET  /lifebook/commerce/money/balance?shopId=   → lo que la plataforma le debe a MI tienda
//   POST /lifebook/commerce/money/settlements       → liquidar a una tienda (solo el admin)
//   GET  /lifebook/commerce/money/summary           → el resumen de la plataforma (solo el admin)
// =============================================================================
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../http/guards';
import { LifebookOrdersService } from './orders.service';

@Controller('v1/lifebook/commerce/money')
export class LifebookOrdersMoneyController {
  constructor(private readonly orders: LifebookOrdersService) {}

  /**
   * LO QUE HAY QUE PAGARLE A MI TIENDA: facturado, comisión de la plataforma, lo que queda pendiente y
   * las liquidaciones que ya se hicieron. Es la respuesta a «¿gano dinero dentro de la app?».
   */
  @Get('balance')
  @UseGuards(JwtAuthGuard)
  balance(@CurrentUser() u: { userId: string }, @Query() q: Record<string, string>) {
    return this.orders.saldoDeMiTienda(u.userId, q.shopId);
  }

  /** LIQUIDAR: se le paga a mano a una tienda y queda registrado quién, cuánto y por qué pedidos. */
  @Post('settlements')
  @UseGuards(JwtAuthGuard)
  settle(@CurrentUser() u: { userId: string }, @Body() body: any) {
    return this.orders.liquidarTienda(u.userId, String(body?.shopId ?? ''), body?.note);
  }

  /** EL RESUMEN DE LA PLATAFORMA (solo el admin): lo que ha ganado de comisión y lo que debe. */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  summary(@CurrentUser() u: { userId: string }) {
    return this.orders.resumenDeLaPlataforma(u.userId);
  }
}
