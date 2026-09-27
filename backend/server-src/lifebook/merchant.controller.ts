// =============================================================================
// lb39-merchant.controller.ts — LIFE BOOK · PANEL DE LA TIENDA (Parte 39)
// Rutas: /wallet/api/v1/lifebook/merchant/*
//
// Seguridad: las dos exigen sesión y NO aceptan ninguna tienda ni dueño por
// parámetro: el servidor saca el usuario del token (`@CurrentUser`). Así es
// imposible abrir el panel, los pedidos o el catálogo de otra tienda, que era
// el agujero de la propuesta recibida (`/ecommerce/shops/:shopId/...`).
// =============================================================================
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../http/guards';
import { LifebookMerchantService } from './merchant.service';

@Controller('v1/lifebook/merchant')
export class LifebookMerchantController {
  constructor(private readonly merchant: LifebookMerchantService) {}

  /** Resumen de «Mi tienda»: pedidos, caja del día (Malabo) y catálogo. */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  dashboard(@CurrentUser() u: { userId: string }) {
    return this.merchant.dashboard(u.userId);
  }

  /** Edición rápida de precio y existencias (no devuelve el producto a revisión). */
  @Patch('products/:id/quick')
  @UseGuards(JwtAuthGuard)
  quickEdit(
    @CurrentUser() u: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.merchant.quickEdit(u.userId, id, dto);
  }
}
