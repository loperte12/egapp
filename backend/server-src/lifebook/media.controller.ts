// =============================================================================
// lb41-media.controller.ts — LIFE BOOK · MEDIA REAL (Parte 41)
// Rutas: /wallet/api/v1/lifebook/commerce/media/*
//
// Todo exige sesión y **nada acepta el dueño por parámetro**: el usuario sale del
// token (`AuthUser.userId`). La clave del objeto lleva la carpeta del usuario y
// se comprueba al cerrar la subida y al leer/borrar.
// =============================================================================
import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../http/guards';
import { LifebookMediaService } from './media.service';

@Controller('v1/lifebook/commerce/media')
@UseGuards(JwtAuthGuard)
export class LifebookMediaController {
  constructor(private readonly media: LifebookMediaService) {}

  /** Pide una subida firmada (POST policy con tope de tamaño en el almacenamiento). */
  @Post('upload-url')
  uploadUrl(@CurrentUser() u: AuthUser, @Body() dto: any) {
    return this.media.signUpload(u.userId, dto ?? {});
  }

  /** Cierra la subida: verifica tamaño/tipo real y duración (ffprobe) + póster. */
  @Post('complete')
  complete(@CurrentUser() u: AuthUser, @Body() dto: any) {
    return this.media.complete(u.userId, dto ?? {});
  }

  /** URL firmada de lectura (documentos privados). */
  @Post('sign-read')
  signRead(@CurrentUser() u: AuthUser, @Body() dto: any) {
    return this.media.signRead(u.userId, String(dto?.key ?? ''));
  }

  /** Cuota y material pendiente del usuario. */
  @Get('quota')
  quota(@CurrentUser() u: AuthUser) {
    return this.media.quota(u.userId);
  }

  /** Borra una subida propia (y su póster). */
  @Delete()
  remove(@CurrentUser() u: AuthUser, @Query('key') key: string) {
    return this.media.remove(u.userId, String(key ?? ''));
  }

  /** Barrido de huérfanos: solo ADMIN (o cron). */
  @Post('purge-orphans')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  purge(@Body() dto: any) {
    const dias = Number(dto?.dias ?? 7);
    return this.media.purgeOrphans(Number.isFinite(dias) && dias >= 1 ? dias : 7);
  }
}
