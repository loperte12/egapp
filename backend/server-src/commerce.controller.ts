// =============================================================================
// lb33-commerce.controller.ts — LIFE BOOK · COMERCIO (Parte 33)
// Rutas: /wallet/api/v1/lifebook/commerce/* (mismo montaje que ya existe).
//
// Seguridad (corrige el agujero del boceto original):
//   · Todo lo que ESCRIBE exige sesión (@UseGuards(JwtAuthGuard)).
//   · El dueño de la tienda sale SIEMPRE del token (@CurrentUser), nunca del
//     cuerpo ni de la URL → es imposible publicar en la tienda de otro.
//   · La moderación exige rol ADMIN (RolesGuard).
//   · Lectura pública del catálogo y de las fichas, con sesión OPCIONAL para
//     saber si el producto es mío / está guardado.
// =============================================================================
import {
  Body, Controller, Delete, Get, Headers, Injectable, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../http/guards';
import { LifebookCommerceService } from './commerce.service';

/** Sesión opcional: si viene token válido se usa; si no, la ruta sigue siendo pública. */
@Injectable()
class OptionalJwtGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    // OJO: passport devuelve `false` (no null) cuando no hay token; con ?? se
    // colaba el `false` y Nest respondía 401 en rutas que deben ser públicas.
    return user ? user : null;
  }
}

@Controller('v1/lifebook/commerce')
export class LifebookCommerceController {
  constructor(private readonly commerce: LifebookCommerceService) {}

  // ───────────────────────────── PÚBLICO ────────────────────────────────────
  @Get('categories')
  categories() {
    return this.commerce.categories();
  }

  @Get('catalog')
  catalog(@Query() q: Record<string, string>) {
    return this.commerce.catalog(q);
  }

  @Get('products/:id')
  @UseGuards(OptionalJwtGuard)
  product(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.product(id, req.user?.userId);
  }

  @Get('shops/:id')
  @UseGuards(OptionalJwtGuard)
  shop(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.shopPublic(id, req.user?.userId);
  }

  @Get('shops/:id/products')
  @UseGuards(OptionalJwtGuard)
  shopProducts(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: Record<string, string>,
  ) {
    return this.commerce.shopProducts(id, req.user?.userId, {
      cursor: q.cursor, limit: q.limit, serviceType: q.serviceType,
      // TANDA B: la fila de categorías del perfil filtra por aquí.
      categoryId: q.categoryId,
    });
  }

  /**
   * TANDA B — categorías que usa una tienda, con su cuenta, para la fila de chips del tab
   * «Productos» del perfil. Es pública: se mira el perfil de cualquiera.
   */
  @Get('shops/:id/categories')
  shopCategories(@Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.shopCategories(id);
  }

  // ───────────────────────────── MI TIENDA ──────────────────────────────────
  @Get('my/shop')
  @UseGuards(JwtAuthGuard)
  myShop(@CurrentUser() u: { userId: string }) {
    return this.commerce.myShop(u.userId);
  }

  /**
   * TANDA A — LA TARJETA DE LA TIENDA DE UN USUARIO (lo que el perfil enseña entre la bio y
   * los botones de seguir). Es PÚBLICA: se mira el perfil de cualquiera, con o sin sesión.
   * Devuelve `{ shop: null }` si esa persona no tiene tienda activa.
   */
  @Get('users/:userId/shop-card')
  usersShopCard(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.commerce.userShopCard(userId);
  }

  // ───────────────────────────── CARRITO (tanda D) ─────────────────────────
  @Get('my/cart')
  @UseGuards(JwtAuthGuard)
  myCart(@CurrentUser() u: { userId: string }) {
    return this.commerce.myCart(u.userId);
  }

  @Post('my/cart')
  @UseGuards(JwtAuthGuard)
  addToCart(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.addToCart(u.userId, dto ?? {});
  }

  @Patch('my/cart/:productId')
  @UseGuards(JwtAuthGuard)
  setCartQuantity(@CurrentUser() u: { userId: string }, @Param('productId') productId: string, @Body() dto: any) {
    return this.commerce.setCartQuantity(u.userId, String(productId ?? ''), dto?.quantity);
  }

  @Delete('my/cart/:productId')
  @UseGuards(JwtAuthGuard)
  removeFromCart(@CurrentUser() u: { userId: string }, @Param('productId') productId: string) {
    return this.commerce.removeFromCart(u.userId, String(productId ?? ''));
  }

  @Delete('my/cart')
  @UseGuards(JwtAuthGuard)
  clearCart(@CurrentUser() u: { userId: string }) {
    return this.commerce.clearCart(u.userId);
  }

  /** Cambiar la cantidad (y/o la variante) de UNA línea del carrito, por su id. */
  @Patch('my/cart/line/:id')
  @UseGuards(JwtAuthGuard)
  setCartLine(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setCartLine(u.userId, id, dto ?? {});
  }

  /** Quitar UNA línea del carrito, por su id. */
  @Delete('my/cart/line/:id')
  @UseGuards(JwtAuthGuard)
  removeCartLine(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.removeCartLine(u.userId, id);
  }

  /**
   * Modo «Editar» del carrito: quitar varias líneas y/o moverlas a favoritos.
   * Va por aquí y no línea a línea para que sea UNA operación (o se hace entera, o no se hace).
   */
  @Post('my/cart/bulk')
  @UseGuards(JwtAuthGuard)
  cartBulk(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.cartBulk(u.userId, dto ?? {});
  }

  /** TANDA A — elegir los 3 destacados (solo el dueño; la tienda sale de la sesión). */
  @Put('my/shop/featured')
  @UseGuards(JwtAuthGuard)
  setFeatured(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.setFeatured(u.userId, dto?.productIds);
  }

  @Post('shops')
  @UseGuards(JwtAuthGuard)
  createShop(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.createShop(u.userId, dto);
  }

  @Patch('my/shop')
  @UseGuards(JwtAuthGuard)
  updateShop(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.updateShop(u.userId, dto);
  }

  // ───────────────────────────── PRODUCTOS ──────────────────────────────────
  @Get('my/products')
  @UseGuards(JwtAuthGuard)
  myProducts(@CurrentUser() u: { userId: string }) {
    return this.commerce.myProducts(u.userId);
  }

  @Post('products')
  @UseGuards(JwtAuthGuard)
  createProduct(
    @CurrentUser() u: { userId: string },
    @Body() dto: any,
    @Headers('idempotency-key') idem?: string,
  ) {
    return this.commerce.createProduct(u.userId, dto, idem);
  }

  @Put('products/:id')
  @UseGuards(JwtAuthGuard)
  updateProduct(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.updateProduct(u.userId, id, dto);
  }

  @Patch('products/:id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.commerce.setProductStatus(u.userId, id, body?.action);
  }

  @Delete('products/:id')
  @UseGuards(JwtAuthGuard)
  deleteProduct(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.deleteProduct(u.userId, id);
  }

  // ─────────────────── HISTORIAL DE PRODUCTOS (tanda F) ────────────────────
  /**
   * Apuntar que he mirado este producto. Exige sesión (ver el comentario del servicio): es lo que
   * hace que un token caducado NO se trague la visita.
   */
  @Post('products/:id/view')
  @UseGuards(JwtAuthGuard)
  registrarVista(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.registrarVista(u.userId, id);
  }

  // ─────────────────── HISTORIAL DE PRODUCTOS (tanda F) ────────────────────
  /** Lo que YO he mirado, lo último primero (la misma rejilla del catálogo). */
  @Get('my/views')
  @UseGuards(JwtAuthGuard)
  myViews(@CurrentUser() u: { userId: string }, @Query() q: Record<string, string>) {
    return this.commerce.myViews(u.userId, Number(q.limit ?? 40));
  }

  /** Vaciar mi historial de productos. */
  @Delete('my/views')
  @UseGuards(JwtAuthGuard)
  clearViews(@CurrentUser() u: { userId: string }) {
    return this.commerce.clearViews(u.userId);
  }

  // ──────────────────────── TALLAS Y MEDIDAS ───────────────────────────────
  /** Las tablas de tallas de un producto (público). */
  @Get('products/:id/size-chart')
  sizeChart(@Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.sizeChart(id);
  }

  /** El comerciante guarda las tablas de tallas de SU producto (mujer/hombre/unisex). */
  @Put('products/:id/size-chart')
  @UseGuards(JwtAuthGuard)
  setSizeChart(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setSizeChart(u.userId, id, dto ?? {});
  }

  /** La recomendación de talla a partir de MIS medidas (contra la tabla del producto). */
  @Post('products/:id/size-suggestion')
  @UseGuards(JwtAuthGuard)
  sizeSuggestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.sizeSuggestion(id, dto ?? {});
  }

  /** Mis medidas: ropa (`body`) y calzado (`feet`), por separado. */
  @Get('my/measurements')
  @UseGuards(JwtAuthGuard)
  myMeasurements(@CurrentUser() u: { userId: string }) {
    return this.commerce.myMeasurements(u.userId);
  }

  @Put('my/measurements')
  @UseGuards(JwtAuthGuard)
  setMeasurements(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.setMeasurements(u.userId, dto ?? {});
  }

  @Delete('my/measurements')
  @UseGuards(JwtAuthGuard)
  clearMeasurements(@CurrentUser() u: { userId: string }, @Query() q: Record<string, string>) {
    return this.commerce.clearMeasurements(u.userId, q?.category ?? null);
  }

  // ───────────────────────────── CUPONES ───────────────────────────────────
  /** Crear un cupón de mi tienda (la tienda sale del token). */
  @Post('merchant/coupons')
  @UseGuards(JwtAuthGuard)
  createCoupon(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.createCoupon(u.userId, dto ?? {});
  }

  /** Mis cupones (los de mi tienda), con sus usos. */
  @Get('merchant/coupons')
  @UseGuards(JwtAuthGuard)
  myCoupons(@CurrentUser() u: { userId: string }) {
    return this.commerce.myCoupons(u.userId);
  }

  /** Pausar o reactivar un cupón mío. */
  @Patch('merchant/coupons/:id')
  @UseGuards(JwtAuthGuard)
  setCouponStatus(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.setCouponStatus(u.userId, id, dto?.status);
  }

  /** Recoger un cupón por su código: queda en MI cuenta. */
  @Post('coupons/claim')
  @UseGuards(JwtAuthGuard)
  claimCoupon(@CurrentUser() u: { userId: string }, @Body() dto: any) {
    return this.commerce.claimCoupon(u.userId, dto?.code);
  }

  /** Los cupones que he recogido, con su estado. */
  @Get('my/coupons')
  @UseGuards(JwtAuthGuard)
  myClaimedCoupons(@CurrentUser() u: { userId: string }) {
    return this.commerce.myClaimedCoupons(u.userId);
  }

  // ─────────────── AVISO DE REPOSICIÓN («avísame cuando llegue») ────────────
  /** Apunta que quiero saber cuándo vuelve a haber stock (producto o variante). */
  @Post('products/:id/interest')
  @UseGuards(JwtAuthGuard)
  watchProduct(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.commerce.watchProduct(u.userId, id, dto?.variantId ?? null);
  }

  /** Dejo de esperar stock. */
  @Delete('products/:id/interest')
  @UseGuards(JwtAuthGuard)
  unwatchProduct(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.unwatchProduct(u.userId, id);
  }

  // ───────────────────────── GUARDADOS Y SEGUIR ─────────────────────────────
  @Post('products/:id/save')
  @UseGuards(JwtAuthGuard)
  save(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.toggleSave(u.userId, id);
  }

  @Get('my/saved')
  @UseGuards(JwtAuthGuard)
  mySaved(@CurrentUser() u: { userId: string }) {
    return this.commerce.mySaved(u.userId);
  }

  @Post('shops/:id/follow')
  @UseGuards(JwtAuthGuard)
  follow(@CurrentUser() u: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.toggleFollow(u.userId, id);
  }

  // ───────────────────────────── MODERACIÓN (ADMIN) ─────────────────────────
  @Get('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  pending(@Query() q: Record<string, string>) {
    return this.commerce.pendingProducts(Number(q.limit ?? 40));
  }

  @Patch('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.commerce.moderate(id, body?.action, body?.reason);
  }
}
