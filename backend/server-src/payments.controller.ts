// =============================================================================
// payments.controller.ts — LA PUERTA DE LA PIEZA DE COBRO (punto 9 de la §3)
//
//   GET  /lifebook/commerce/money/payment-providers   → qué se puede cobrar hoy (con sus capacidades)
//   POST /lifebook/commerce/money/charge              → abrir un cobro de un pedido
//   POST /lifebook/commerce/payments/webhook/:id      → el aviso del proveedor (sin sesión: lo llama él)
//
// Va en su propio controlador, como el del dinero: estas rutas son de cobro y se leen juntas.
// =============================================================================
import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../http/guards';
import { LifebookPaymentsService } from './payments.service';

@Controller('v1/lifebook/commerce')
export class LifebookPaymentsController {
  constructor(private readonly pagos: LifebookPaymentsService) {}

  /** QUÉ SE PUEDE COBRAR HOY. Hoy: solo el camino manual (el dinero se mueve fuera de la app). */
  @Get('money/payment-providers')
  @UseGuards(JwtAuthGuard)
  providers() {
    return this.pagos.listar();
  }

  /** ABRIR UN COBRO de un pedido mío. El importe lo pone el pedido, no quien llama. */
  @Post('money/charge')
  @UseGuards(JwtAuthGuard)
  charge(@CurrentUser() u: { userId: string }, @Body() body: any) {
    return this.pagos.abrirCobro(u.userId, String(body?.orderId ?? ''), String(body?.provider ?? 'manual'));
  }

  /**
   * EL AVISO DEL PROVEEDOR. Sin sesión (lo llama el proveedor), y por eso **no marca nada por sí solo**:
   * se verifica la firma y se confirma el estado con el proveedor antes de tocar un pedido.
   */
  @Post('payments/webhook/:provider')
  webhook(@Param('provider') provider: string, @Headers() headers: Record<string, string>, @Body() body: any) {
    return this.pagos.avisoDePago(provider, headers ?? {}, body);
  }
}
