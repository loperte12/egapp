"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcomerseController = exports.EcomerseAdminExpiryController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const ecomerse_service_1 = require("./ecomerse.service");
const guards_1 = require("../http/guards");
// POST /api/ecomerse/admin/expire-stale — barrido de caducidad (auditoría 17/09, parche 106).
let EcomerseAdminExpiryController = class EcomerseAdminExpiryController {
    ecomerse;
    constructor(ecomerse) {
        this.ecomerse = ecomerse;
    }
    expire(horas, limit) {
        return this.ecomerse.expireStale(horas ? parseInt(horas, 10) : undefined, limit ? parseInt(limit, 10) : undefined);
    }
};
exports.EcomerseAdminExpiryController = EcomerseAdminExpiryController;
__decorate([
    (0, common_1.Post)('admin/expire-stale'),
    __param(0, (0, common_1.Query)('horas')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], EcomerseAdminExpiryController.prototype, "expire", null);
exports.EcomerseAdminExpiryController = EcomerseAdminExpiryController = __decorate([
    (0, common_1.Controller)('ecomerse'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:paramtypes", [ecomerse_service_1.EcomerseService])
], EcomerseAdminExpiryController);
let EcomerseController = class EcomerseController {
    ecomerse;
    constructor(ecomerse) {
        this.ecomerse = ecomerse;
    }
    // ------------------------------------------------------------------ PÚBLICO
    flags() { return this.ecomerse.flags(); }
    catalog(q) { return this.ecomerse.catalog(q); }
    product(id) { return this.ecomerse.product(id); }
    /**
     * Los EJES y las COMBINACIONES de un anuncio (Fase 4 · SKU).
     *
     * Público, como la ficha: el selector de variante tiene que saber qué se puede comprar y qué está
     * agotado **antes** de que el comprador compre. No se mete dentro de `GET products/:id` para no
     * cargar la ficha con dos consultas más cuando el anuncio no tiene ejes (que hoy son todos).
     */
    productOptions(id) { return this.ecomerse.productOptions(id); }
    categories() { return this.ecomerse.categories(); }
    /**
     * EL CENSO de tiendas. Público, como el catálogo: el directorio del comprador se abre sin sesión.
     *
     * Va aparte de `catalog` porque no es una vista del catálogo: es la lista de **quién vende**,
     * sacada de `wallet.ecomerse_sellers`. El directorio de la app se construía agrupando el catálogo
     * por tienda, y por eso no veía a una tienda sin anuncios activos y se cortaba en 200 anuncios
     * sin avisar. El detalle está en el método del servicio.
     */
    sellers(q) { return this.ecomerse.sellers(q); }
    /**
     * Una tienda suelta, para la cabecera de su página. Va declarada DESPUÉS de `sellers` a propósito:
     * Nest resuelve las rutas en orden de declaración y, aunque la literal `sellers` gana a `sellers/:id`
     * —no al revés—, leerlas en el orden en que se resuelven evita tener que pensarlo cada vez.
     */
    /**
     * LAS TIENDAS QUE SIGO. Va declarada **antes** de `seller(id)` a propósito: si `sellers/:id` se
     * declara primero, `following` entra por el parámetro y contesta «Tienda inválida» (medido: 400).
     */
    following(u) { return this.ecomerse.tiendasSeguidas(u.userId); }
    /** Los ids, para que la ficha de una tienda sepa si la sigue sin traer la lista entera. */
    followingIds(u) { return this.ecomerse.idsTiendasSeguidas(u.userId); }
    /** Alterna: seguir / dejar de seguir. */
    follow(u, id) { return this.ecomerse.seguirTienda(u.userId, id); }
    seller(id) { return this.ecomerse.seller(id); }
    reportProduct(u, id, body) {
        return this.ecomerse.reportProduct(u.userId, id, body);
    }
    // ------------------------------------------------------------------ FAVORITOS
    contactIntent(u, body) {
        return this.ecomerse.recordContactIntent(u.userId, String(body?.productId ?? ''), String(body?.channel ?? 'whatsapp'));
    }
    myShopPlan(u) { return this.ecomerse.myShopPlan(u.userId); }
    toggleFavorite(u, body) {
        return this.ecomerse.toggleFavorite(u.userId, String(body?.productId ?? ''));
    }
    useFreeFeatured(u, body) {
        return this.ecomerse.useFreeFeatured(u.userId, String(body?.productId ?? ''));
    }
    toggleSpecialFavorite(u, body) {
        return this.ecomerse.toggleSpecialFavorite(u.userId, String(body?.productId ?? ''));
    }
    favoriteIds(u) { return this.ecomerse.favoriteIds(u.userId); }
    myPurchased(u) { return this.ecomerse.myPurchased(u.userId); }
    myFavorites(u, q) {
        return this.ecomerse.myFavorites(u.userId, q);
    }
    // ------------------------------------------------------------------ BÚSQUEDA POR IMAGEN
    searchByImage(u, file) {
        return this.ecomerse.searchByImage(u.userId, file);
    }
    // ------------------------------------------------------------------ LOGÍSTICA POR ZONAS
    deliveryZones(city) { return this.ecomerse.deliveryZones(city); }
    quoteLogistics(zone, km) {
        return this.ecomerse.quoteLogistics(zone || null, km ? Number(km) : null);
    }
    updateZone(u, id, body) {
        return this.ecomerse.adminUpdateZone(u.userId, id, body);
    }
    // ------------------------------------------------------------------ VENDEDOR
    sellerMe(u) { return this.ecomerse.sellerMe(u.userId); }
    upsertSeller(u, body) {
        return this.ecomerse.upsertSeller(u.userId, body);
    }
    // ------------------------------------------------------------------ PRODUCTOS
    uploadPhoto(file) {
        return this.ecomerse.uploadPhoto(file);
    }
    myProducts(u) { return this.ecomerse.myProducts(u.userId); }
    createProduct(u, body) {
        return this.ecomerse.createProduct(u.userId, body);
    }
    updateProduct(u, id, body) {
        return this.ecomerse.updateProduct(u.userId, id, body);
    }
    /*
      ── LOS DOS CARRILES (zona del comerciante, 20-sep-2026) ──────────────────────────────────────
      `PUT products/:id` de arriba es el CARRIL MODERADO: contenido (título, descripción, fotos,
      precio, categoría) y vuelve a revisión. Los dos de abajo son el CARRIL RÁPIDO: operación del
      día a día (existencias, plazo, devoluciones, y si está a la venta o no) y **no pasan por
      moderación**.
  
      Van bajo `seller/` a propósito, para que al leer el controlador se vea de un golpe qué toca el
      vendedor sin revisión. No son rutas de admin ni de comprador: el `seller_id` sale del token
      (`requireActiveSeller`) y el `WHERE` de cada UPDATE va acotado por él — un id de otro vendedor
      devuelve «Producto no encontrado», no un 403 que confirme que existe.
    */
    updateProductOperations(u, id, body) {
        return this.ecomerse.updateProductOperations(u.userId, id, body);
    }
    updateProductState(u, id, body) {
        return this.ecomerse.updateProductState(u.userId, id, body);
    }
    /**
     * ── LOS EJES Y LAS COMBINACIONES (Fase 4 · SKU, 21-sep-2026) ─────────────────────────────────
     *
     * Va en el CARRIL RÁPIDO, con las existencias y no con el contenido, y **no es una decisión
     * cómoda**: el precio y el stock de cada combinación («Rojo · M: 3 unidades») se corrige en el
     * día a día, y hacerlo pasar por moderación significaría volver a la cola 24–48 h **cada vez que
     * se repone una talla**. Es el mismo razonamiento que llevó `operations` al carril rápido.
     *
     * Qué NO se puede colar por aquí: el `status` no se toca (no activa nada ni salta la moderación)
     * y el `seller_id` sale del token, con el `WHERE` acotado por él — el anuncio de otro vendedor
     * devuelve «no encontrado», no un 403 que confirme que existe.
     *
     * Es `PUT` y no `PATCH` porque la app manda SIEMPRE la lista completa de ejes (es su forma de
     * decir «estos son mis ejes ahora»): es una sustitución, no un parche campo a campo.
     */
    setProductOptions(u, id, body) {
        return this.ecomerse.setProductOptions(u.userId, id, body);
    }
    // ------------------------------------------------------------------ PEDIDOS
    createOrder(u, body, payTok) {
        return this.ecomerse.createOrder(u.userId, body, payTok);
    }
    /**
     * Mis pedidos, con filtro por estado y paginación (tanda B).
     * `status` es opcional: sin él se devuelven todos (comportamiento de antes).
     */
    myOrders(u, as, status, limit, offset) {
        return this.ecomerse.myOrders(u.userId, as === 'seller' ? 'seller' : 'buyer', status, limit === undefined ? undefined : Number(limit), offset === undefined ? undefined : Number(offset));
    }
    /** Cuántos pedidos hay en cada estado, para los contadores de las pestañas. */
    orderCounts(u, as) {
        return this.ecomerse.orderCounts(u.userId, as === 'seller' ? 'seller' : 'buyer');
    }
    // Rutas específicas ANTES de /orders/:id (evita matching ambiguo)
    updateStatus(u, id, body) {
        return this.ecomerse.updateOrderStatus(u.userId, id, String(body?.status ?? ''), body?.as === 'seller' ? 'seller' : 'buyer');
    }
    cancelOrder(u, id, body) {
        return this.ecomerse.cancelOrder(u.userId, id, body?.reason);
    }
    orderEvents(id) { return this.ecomerse.orderEvents(id); }
    shipment(id) { return this.ecomerse.shipment(id); }
    updateShipment(u, id, body) {
        return this.ecomerse.updateShipmentStatus(u.userId, id, body);
    }
    getOrder(u, id) {
        return this.ecomerse.getOrder(u.userId, id);
    }
    // ------------------------------------------------------------------ DISPUTAS
    openDispute(u, id, body) {
        return this.ecomerse.openDispute(u.userId, id, body);
    }
    review(u, id, body) {
        return this.ecomerse.review(u.userId, id, body);
    }
    // ------------------------------------------------------------------ ADMIN
    adminSellers(status) { return this.ecomerse.adminSellers(status); }
    decideSeller(u, id, body) {
        return this.ecomerse.adminDecideSeller(u.userId, id, body);
    }
    adminProducts(status) { return this.ecomerse.adminProducts(status); }
    decideProduct(u, id, body) {
        return this.ecomerse.adminDecideProduct(u.userId, id, body);
    }
    adminDisputes() { return this.ecomerse.adminDisputes(); }
    adminReports() { return this.ecomerse.adminReports(); }
    resolveReport(u, id, body) {
        return this.ecomerse.adminResolveReport(u.userId, id, body);
    }
    escrowPreview() { return this.ecomerse.adminEscrowPreview(); }
    /**
     * MODERACIÓN DE DOCUMENTACIÓN (tanda 4). Cola de documentos pendientes y su decisión.
     * Mismo patrón que el resto de rutas de administración de este módulo.
     */
    adminDocs(status) { return this.ecomerse.adminDocsPendientes(status); }
    /* Va ANTES de `admin/docs/:id` por el mismo motivo que `orders/counts`: si se declarara después,
       «stats» entraría por el parámetro :id. */
    adminDocsStats() { return this.ecomerse.adminDocStats(); }
    decideDoc(u, id, body) {
        return this.ecomerse.adminDecideDoc(u.userId, id, body);
    }
    embeddingsStatus() { return this.ecomerse.adminEmbeddingsStatus(); }
    adminStats() { return this.ecomerse.adminStats(); }
    embeddingsBackfill() { return this.ecomerse.adminBackfillEmbeddings(); }
    resolveDispute(u, id, body) {
        return this.ecomerse.adminResolveDispute(u.userId, id, body);
    }
};
exports.EcomerseController = EcomerseController;
__decorate([
    (0, common_1.Get)('flags'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "flags", null);
__decorate([
    (0, common_1.Get)('catalog'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)('products/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "product", null);
__decorate([
    (0, common_1.Get)('products/:id/options'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "productOptions", null);
__decorate([
    (0, common_1.Get)('categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "categories", null);
__decorate([
    (0, common_1.Get)('sellers'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "sellers", null);
__decorate([
    (0, common_1.Get)('sellers/following'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "following", null);
__decorate([
    (0, common_1.Get)('sellers/following/ids'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "followingIds", null);
__decorate([
    (0, common_1.Post)('sellers/:id/follow'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "follow", null);
__decorate([
    (0, common_1.Get)('sellers/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "seller", null);
__decorate([
    (0, common_1.Post)('products/:id/report'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "reportProduct", null);
__decorate([
    (0, common_1.Post)('contact/intent'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "contactIntent", null);
__decorate([
    (0, common_1.Get)('shop/plan'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "myShopPlan", null);
__decorate([
    (0, common_1.Post)('favorites/toggle'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "toggleFavorite", null);
__decorate([
    (0, common_1.Post)('featured/free'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "useFreeFeatured", null);
__decorate([
    (0, common_1.Post)('favorites/special'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "toggleSpecialFavorite", null);
__decorate([
    (0, common_1.Get)('favorites/ids'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "favoriteIds", null);
__decorate([
    (0, common_1.Get)('favorites/purchased'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "myPurchased", null);
__decorate([
    (0, common_1.Get)('favorites'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "myFavorites", null);
__decorate([
    (0, common_1.Post)('search/image'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image')),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "searchByImage", null);
__decorate([
    (0, common_1.Get)('delivery/zones'),
    __param(0, (0, common_1.Query)('city')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "deliveryZones", null);
__decorate([
    (0, common_1.Get)('delivery/quote'),
    __param(0, (0, common_1.Query)('zone')),
    __param(1, (0, common_1.Query)('km')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "quoteLogistics", null);
__decorate([
    (0, common_1.Put)('admin/delivery-zones/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "updateZone", null);
__decorate([
    (0, common_1.Get)('seller/me'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "sellerMe", null);
__decorate([
    (0, common_1.Post)('seller'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "upsertSeller", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('photo', { limits: { fileSize: 8 * 1024 * 1024 } })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "uploadPhoto", null);
__decorate([
    (0, common_1.Get)('products'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "myProducts", null);
__decorate([
    (0, common_1.Post)('products'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "createProduct", null);
__decorate([
    (0, common_1.Put)('products/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "updateProduct", null);
__decorate([
    (0, common_1.Patch)('seller/products/:id/operations'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "updateProductOperations", null);
__decorate([
    (0, common_1.Patch)('seller/products/:id/state'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "updateProductState", null);
__decorate([
    (0, common_1.Put)('seller/products/:id/options'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "setProductOptions", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, guards_1.PaymentToken)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('as')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "myOrders", null);
__decorate([
    (0, common_1.Get)('orders/counts'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('as')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "orderCounts", null);
__decorate([
    (0, common_1.Put)('orders/:id/status'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)('orders/:id/cancel'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "cancelOrder", null);
__decorate([
    (0, common_1.Get)('orders/:id/events'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "orderEvents", null);
__decorate([
    (0, common_1.Get)('orders/:id/shipment'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "shipment", null);
__decorate([
    (0, common_1.Put)('orders/:id/shipment/status'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "updateShipment", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Post)('orders/:id/dispute'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "openDispute", null);
__decorate([
    (0, common_1.Post)('orders/:id/review'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "review", null);
__decorate([
    (0, common_1.Get)('admin/sellers'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminSellers", null);
__decorate([
    (0, common_1.Put)('admin/sellers/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "decideSeller", null);
__decorate([
    (0, common_1.Get)('admin/products'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminProducts", null);
__decorate([
    (0, common_1.Put)('admin/products/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "decideProduct", null);
__decorate([
    (0, common_1.Get)('admin/disputes'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminDisputes", null);
__decorate([
    (0, common_1.Get)('admin/reports'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminReports", null);
__decorate([
    (0, common_1.Put)('admin/reports/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "resolveReport", null);
__decorate([
    (0, common_1.Get)('admin/escrow-preview'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "escrowPreview", null);
__decorate([
    (0, common_1.Get)('admin/docs'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminDocs", null);
__decorate([
    (0, common_1.Get)('admin/docs/stats'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminDocsStats", null);
__decorate([
    (0, common_1.Put)('admin/docs/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "decideDoc", null);
__decorate([
    (0, common_1.Get)('admin/embeddings/status'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "embeddingsStatus", null);
__decorate([
    (0, common_1.Get)('admin/stats'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "adminStats", null);
__decorate([
    (0, common_1.Post)('admin/embeddings/backfill'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "embeddingsBackfill", null);
__decorate([
    (0, common_1.Put)('admin/disputes/:id'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    (0, guards_1.Roles)('ADMIN'),
    __param(0, (0, guards_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], EcomerseController.prototype, "resolveDispute", null);

exports.EcomerseController = EcomerseController = __decorate([
    (0, common_1.Controller)('ecomerse'),
    __metadata("design:paramtypes", [ecomerse_service_1.EcomerseService])
], EcomerseController);
//# sourceMappingURL=ecomerse.controller.js.map