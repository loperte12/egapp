// =============================================================================
// lb42-hotel.controller.ts — PARTE 42 · RUTAS DEL HOTEL
// Montaje: `/v1/lifebook/commerce/hotel/*` → en producción
// `https://hk.egrouteplan.com/wallet/api/v1/lifebook/commerce/hotel/*`
// (el mismo prefijo del comercio: nginx no se toca).
//
// Puertas (regla de las Partes 40/41/48 — privado por naturaleza vs lecturas
// públicas, y por eso van RUTA A RUTA, no en la clase):
//   · PÚBLICAS: buscar hoteles, ficha del hotel, habitaciones y CALENDARIO
//     (el huésped tiene que ver disponibilidad y precios antes de tener cuenta).
//   · CON SESIÓN OPCIONAL: la ficha de una habitación (para saber si el hotel
//     es tuyo o si hay sesión).
//   · PRIVADAS: reservar, mis reservas, detalle y acciones; y todo el panel del
//     hotelero (ficha, tipos de habitación, calendario, ocupación).
// =============================================================================
import {
  Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, OptionalUser, type AuthUser, PaymentToken } from '../http/guards';
import { DomainError } from '../services/payment-auth.service';
import { LifebookHotelService } from './hotel.service';
import { LifebookReservationsService } from './reservations.service';
import { HotelProfileDto, HotelSearchQueryDto, HotelCalendarDto } from './dto/hotel-reservation.dto';

/** Sesión OPCIONAL: con token válido se usa; sin token la ruta sigue pública. */
@Injectable()
class OptionalJwtGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    return user ? user : null; // `false` de passport no puede colarse como usuario
  }
}

@Controller('v1/lifebook/commerce/hotel')
export class LifebookHotelController {
  constructor(
    private readonly hotel: LifebookHotelService,
    private readonly reservas: LifebookReservationsService,
  ) {}

  // ══════════════════════════ PÚBLICO (sin cuenta) ═══════════════════════════

  /** Buscar alojamientos: `?city=Malabo&checkIn=2026-09-20&checkOut=2026-09-22&guests=2`. */
  @Get('hotels')
  search(@Query() q: HotelSearchQueryDto) {
    return this.hotel.searchHotels(q);
  }

  /**
   * La MISMA búsqueda en la ruta que pidió el dueño (`/search`), con los MISMOS
   * parámetros y la misma respuesta: una sola implementación, dos nombres. Así la
   * pantalla que usa `/hotel/search` funciona sin que existan dos lógicas que se
   * desincronicen (que era el riesgo de tener `/hotels` y `/search` a la vez).
   *
   * El DTO valida en la puerta: `guests=abc` → **400** (antes: `capacity >= NaN` es
   * `false` en Postgres → 0 resultados y 200 OK, el fallo más traicionero) y
   * `checkIn=pepe` → **400 DATE_INVALID** (antes: 500 del driver).
   */
  @Get('search')
  searchAlias(@Query() q: HotelSearchQueryDto) {
    return this.hotel.searchHotels(q);
  }

  /**
   * Tipos de cambio de referencia (PÚBLICO) y la moneda que toca para un país.
   *
   * Va declarada ANTES de `hotels/:id` A PROPÓSITO: NestJS resuelve por orden de declaración, así que
   * si se pusiera después, «fx» entraría por `:id`, fallaría el `ParseUUIDPipe` y la app recibiría un
   * 400 incomprensible en vez de los tipos.
   */
  @Get('hotels/fx')
  fx(@Query('country') country?: string) {
    return this.hotel.fxDisponibles(country ?? null);
  }

  /** Ficha del hotel con sus tipos de habitación. `country`: para enseñar los precios en la moneda
   *  del huésped — el cobro sigue siendo en XAF (en efectivo, al llegar). */
  @Get('hotels/:id')
  hotelDetail(@Param('id', ParseUUIDPipe) id: string, @Query('country') country?: string) {
    return this.hotel.hotelByShop(id, country ?? null);
  }

  /** Habitaciones de un hotel (solo activas y aprobadas). */
  @Get('hotels/:shopId/rooms')
  rooms(@Param('shopId', ParseUUIDPipe) shopId: string) {
    return this.hotel.roomTypesPublic(shopId);
  }

  /** 🔒 CALENDARIO de un tipo de habitación: precio por noche, cerrado, ocupación. */
  @Get('rooms/:roomTypeId/calendar')
  calendar(
    @Param('roomTypeId', ParseUUIDPipe) roomTypeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('units') units?: string,
  ) {
    return this.hotel.calendar(roomTypeId, from, to, units);
  }

  /**
   * Ficha de la habitación. Sesión OPCIONAL: pública (la ve cualquiera antes de
   * reservar) y, con sesión, dice si el hotel es TUYO (para ofrecer «editar» en vez
   * de «reservar»). Era el endpoint que la pantalla de ficha llamaba y no existía
   * (`404 → catch {} → spinner eterno`).
   */
  @Get('rooms/:roomTypeId')
  @UseGuards(OptionalJwtGuard)
  async room(@Param('roomTypeId', ParseUUIDPipe) roomTypeId: string, @Req() req: any) {
    const out = await this.hotel.roomType(roomTypeId);
    const viewerId: string | undefined = req.user?.userId;
    const esMia = !!viewerId && !!out.room?.hotel?.id
      && (await this.hotel.ownsShop(viewerId, String(out.room.hotel.id)));
    return { ...out, isMine: esMia };
  }

  // ══════════════════════════ HUÉSPED (con sesión) ═══════════════════════════

  /**
   * Reservar. **`Idempotency-Key` OBLIGATORIA**: es dinero y son noches. El total
   * y la señal los calcula el servidor; el cliente no manda importes nunca.
   */
  @Post('reservations')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() u: AuthUser,
    @Body() dto: any,
    @Headers('idempotency-key') idem?: string,
    @PaymentToken() payTok?: string,
  ) {
    return this.reservas.createReservation(u.userId, dto ?? {}, idem ?? '', payTok);
  }

  /** Mis reservas como huésped (`?side=guest`) o como hotelero (`?side=hotel`). */
  @Get('reservations/mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() u: AuthUser, @Query('side') side?: string) {
    return this.reservas.myReservations(u.userId, side === 'hotel' ? 'hotel' : 'guest');
  }

  /** Detalle (solo huésped, hotel o admin). */
  @Get('reservations/:id')
  @UseGuards(JwtAuthGuard)
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservas.detail(id, u.userId);
  }

  /**
   * ALIAS del detalle, pero **solo para el huésped**: `reservations/mine/:id`.
   *
   * Existe porque el bloque recibido pedía `GET …/my-reservations/:id`: en vez de montar una
   * SEGUNDA ruta con otra lógica (lo que ya nos mordió con `/hotels` y `/search`), se ofrece el
   * mismo camino con el nombre esperado.
   *
   * La puerta, en cambio, NO es la misma que la de `reservations/:id`: aquí manda el huésped.
   * El E2E destapó que el dueño del hotel entraba por «su» ruta de huésped y el servidor
   * respondía 200; el dato salía correcto, pero un camino de huésped que acepta al hotelero es
   * el sitio exacto donde mañana aparece una acción ofrecida a quien no le toca. El hotelero
   * tiene `reservations/:id` y `my/hotel/reservations/:id`.
   */
  @Get('reservations/mine/:id')
  @UseGuards(JwtAuthGuard)
  mineDetail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservas.guestDetail(id, u.userId);
  }

  /**
   * Cancelar desde el detalle del huésped, con **motivo obligatorio**: una cancelación sin
   * motivo deja una reclamación sin explicación. El camino del bloque recibido
   * (`PATCH …/cancel` sin cuerpo) se corrige aquí y va al MISMO sitio que `…/action`.
   *
   * Igual que el detalle, esta puerta es del huésped: si el hotel tiene que cancelar (huésped
   * que no aparece, impago), usa `PATCH reservations/:id/action`, que sí admite `hotel`.
   */
  @Patch('reservations/mine/:id/cancel')
  @UseGuards(JwtAuthGuard)
  async mineCancel(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    const motivo = String(body?.reason ?? '').trim();
    if (motivo.length < 3) {
      throw new DomainError('REASON_REQUIRED', 'Indica el motivo de la cancelación (queda registrado)');
    }
    await this.reservas.assertGuestOf(id, u.userId);
    return this.reservas.action(u.userId, id, 'cancel', motivo);
  }

  /** El huésped envía la referencia de su transferencia. */
  @Post('reservations/:id/proof')
  @UseGuards(JwtAuthGuard)
  proof(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.reservas.submitProof(u.userId, id, String(body?.proof ?? ''));
  }

  /** Cancelar (huésped u hotel) — el motivo queda registrado. */
  @Patch('reservations/:id/action')
  @UseGuards(JwtAuthGuard)
  action(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.reservas.action(u.userId, id, String(body?.action ?? ''), body?.reason);
  }

  /** El hotel confirma el cobro de la señal (o el admin, con permiso). */
  @Post('reservations/:id/confirm-deposit')
  @UseGuards(JwtAuthGuard)
  confirmDeposit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.reservas.confirmDeposit(u.userId, id, body?.proof);
  }

  // ══════════════════════════ PANEL DEL HOTELERO ═════════════════════════════

  /** Mi ficha de hotel y mis tipos de habitación. */
  @Get('my/hotel')
  @UseGuards(JwtAuthGuard)
  myHotel(@CurrentUser() u: AuthUser) {
    return this.hotel.myHotel(u.userId);
  }

  /** Crear/actualizar la ficha del hotel (marca la tienda como alojamiento). */
  @Put('my/hotel')
  @UseGuards(JwtAuthGuard)
  saveProfile(@CurrentUser() u: AuthUser, @Body() dto: any) {
    return this.hotel.saveHotelProfile(u.userId, dto ?? {});
  }

  /** Mis tipos de habitación. */
  @Get('my/room-types')
  @UseGuards(JwtAuthGuard)
  myRooms(@CurrentUser() u: AuthUser) {
    return this.hotel.myRoomTypes(u.userId);
  }

  /** Alta de un tipo de habitación (crea también su publicación `hotel_room`). */
  @Post('my/room-types')
  @UseGuards(JwtAuthGuard)
  async createRoom(@CurrentUser() u: AuthUser, @Body() dto: any) {
    const images = await this.hotel.images(u.userId, dto?.images);
    return this.hotel.createRoomType(u.userId, dto ?? {}, images);
  }

  /** Editar un tipo de habitación (solo el dueño). */
  @Put('my/room-types/:id')
  @UseGuards(JwtAuthGuard)
  async updateRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    const images = dto?.images === undefined ? undefined : await this.hotel.images(u.userId, dto.images);
    return this.hotel.updateRoomType(u.userId, id, dto ?? {}, images);
  }

  /** 🔒 CALENDARIO del hotelero: cerrar fechas, precio de temporada, mínimo de noches. */
  @Put('my/room-types/:id/calendar')
  @UseGuards(JwtAuthGuard)
  saveCalendar(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.hotel.saveCalendar(u.userId, id, dto ?? {});
  }

  /** Ocupación del día: quién entra, quién sale, quién está y habitaciones libres. */
  @Get('my/day-book')
  @UseGuards(JwtAuthGuard)
  dayBook(@CurrentUser() u: AuthUser, @Query('shopId') shopId: string, @Query('date') date?: string) {
    return this.reservas.dayBook(shopId, u.userId, date);
  }

  /** Barrido de reservas vencidas: ADMIN (o cron). */
  @Post('admin/expire-stale')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  expireStale(@Body() body: any) {
    return this.reservas.expireStale(Number(body?.limit ?? 200));
  }
}
