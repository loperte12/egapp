// =============================================================================
// lb36-orders.controller.ts — LIFE BOOK · PEDIDOS DEL COMERCIO (Parte 36)
// Rutas: /wallet/api/v1/lifebook/commerce/orders/* (mismo montaje que el resto
// del comercio; no hace falta tocar nginx).
//
// Seguridad: TODO exige sesión y el pedido se resuelve por el usuario del token.
// La clave de idempotencia es OBLIGATORIA al crear (es dinero y stock).
// =============================================================================
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, PaymentToken } from '../http/guards';
import { LifebookOrdersService } from './orders.service';

@Controller('v1/lifebook/commerce/orders')
export class LifebookOrdersController {
  constructor(private readonly orders: LifebookOrdersService) {}

  /** Crear pedido. Requiere `Idempotency-Key` (un doble toque no duplica). */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() u: { userId: string },
    @Body() dto: any,
    @PaymentToken() payTok?: string,
    @Headers('idempotency-key') idem?: string,
  ) {
    return this.orders.createOrder(u.userId, dto, idem ?? '', payTok);
  }

  /** Mis pedidos: `?side=buyer` (compras) o `?side=seller` (ventas). */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() u: { userId: string }, @Query() q: Record<string, string>) {
    return this.orders.myOrders(u.userId, q.side === 'seller' ? 'seller' : 'buyer');
  }

  /** Detalle (solo comprador, vendedor o admin). */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  detail(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.orderDetail(id, u.userId);
  }

  /** Aceptar · rechazar · preparar · enviar · listo · entregar · cancelar · reclamar. */
  @Patch(':id/action')
  @UseGuards(JwtAuthGuard)
  action(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.orderAction(u.userId, id, body?.action, body?.reason);
  }

  /** El vendedor confirma la entrega con el código que le da el comprador. */
  @Post(':id/confirm-code')
  @UseGuards(JwtAuthGuard)
  confirmCode(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.confirmDeliveryCode(u.userId, id, String(body?.code ?? ''));
  }

  /** «CERRAR EL REPARTO»: la tienda fija el coste del envío antes de entregar (punto 15). */
  @Patch(':id/delivery-cost')
  @UseGuards(JwtAuthGuard)
  deliveryCost(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.setDeliveryCost(u.userId, id, body?.deliveryCostXaf);
  }

  /** «VALORAR»: el comprador puntúa un pedido entregado (1-5) y mueve la nota de tienda y productos. */
  @Post(':id/review')
  @UseGuards(JwtAuthGuard)
  review(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.reviewOrder(u.userId, id, body?.rating, body?.comment);
  }

  /** «MARCAR COBRADO»: la tienda cobra por fuera (transferencia, facturación…) y deja el justificante. */
  @Post(':id/mark-paid')
  @UseGuards(JwtAuthGuard)
  markPaid(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.orders.markPaid(u.userId, id, body?.proofUrl, body?.note);
  }

  /**
   * «ESCRIBIR A LA TIENDA»: deja la tarjeta de ESE pedido en el chat comprador↔tienda.
   *
   * Devuelve la conversación, para que la app abra la buena y no otra del mismo comerciante.
   */
  @Post(':id/chat-card')
  @UseGuards(JwtAuthGuard)
  chatCard(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.publicarTarjetaEnChat(u.userId, id);
  }
}
