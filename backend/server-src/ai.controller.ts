// =============================================================================
// ai.controller.ts — EL ASISTENTE DE IA (tanda M)
//
// Rutas: /wallet/api/v1/lifebook/ai/*
//   GET  state    → ¿está configurado? ¿cuántos mensajes te quedan hoy?
//   GET  chat     → la conversación abierta con sus mensajes y sus tarjetas
//   POST chat     → mandar una pregunta
//   POST new      → empezar de cero
//
// Seguridad: TODO exige sesión (JwtAuthGuard) y el usuario sale del token, nunca del cuerpo. El
// asistente no acepta un `userId` de fuera: así nadie puede leer la conversación de otro ni gastar
// su cupo de mensajes.
// =============================================================================
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../http/guards';
import { LifebookAiService } from './ai.service';

@Controller('v1/lifebook/ai')
export class LifebookAiController {
  constructor(private readonly ai: LifebookAiService) {}

  /** ¿Está listo el asistente y cuánto queda del cupo de hoy? */
  @Get('state')
  @UseGuards(JwtAuthGuard)
  state(@CurrentUser() u: { userId: string }) {
    return this.ai.estado(u.userId);
  }

  /** La conversación abierta (o la que se indique) con lo que ya se habló. */
  @Get('chat')
  @UseGuards(JwtAuthGuard)
  chat(@CurrentUser() u: { userId: string }, @Query('conversationId') conversationId?: string) {
    return this.ai.conversacion(u.userId, conversationId ?? null);
  }

  /** Mandar una pregunta. */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  preguntar(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.ai.chat(u.userId, dto ?? {});
  }

  /** Empezar una conversación nueva (la anterior se queda guardada). */
  @Post('new')
  @UseGuards(JwtAuthGuard)
  nuevo(@CurrentUser() u: { userId: string }) {
    return this.ai.nueva(u.userId);
  }

  /** EL HISTORIAL: mis conversaciones, la última primero (tanda N). */
  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  conversaciones(@CurrentUser() u: { userId: string }) {
    return this.ai.conversaciones(u.userId);
  }

  /** Borrar una conversación mía. */
  @Delete('conversations/:id')
  @UseGuards(JwtAuthGuard)
  borrarConversacion(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.borrarConversacion(u.userId, id);
  }

  /** «Me gusta» a una respuesta del asistente. */
  @Patch('messages/:id/like')
  @UseGuards(JwtAuthGuard)
  megusta(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.ai.megusta(u.userId, id, dto?.liked !== false);
  }

  /** Editar un mensaje MÍO (las respuestas del asistente no se editan). */
  @Patch('messages/:id')
  @UseGuards(JwtAuthGuard)
  editar(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.ai.editarMensaje(u.userId, id, dto?.text ?? '');
  }

  /** Borrar un mensaje mío. */
  @Delete('messages/:id')
  @UseGuards(JwtAuthGuard)
  borrarMensaje(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.borrarMensaje(u.userId, id);
  }

  /** Consejos para mejorar el asistente (mejora, fallo o elogio). */
  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  consejo(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.ai.consejo(u.userId, dto ?? {});
  }
}
