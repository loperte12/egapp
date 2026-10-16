"use strict";
// =============================================================================
// Guards y decoradores transversales:
//   · JwtAuthGuard   — sesión (access token 15 min, passport-jwt).
//   · RolesGuard     — rol en el claim del JWT (USER | AGENT | ADMIN).
//   · @CurrentUser   — inyecta el tipo AuthUser { userId, role } en controladores.
//   · @IdempotencyKey() — cabecera Idempotency-Key obligatoria en POST de dinero.
//   · @PaymentToken()   — cabecera X-Payment-Token (la valida el servicio).
//
// 17/09 (parche 93) — RESTAURA Y CORRIJE:
//   El archivo quedó truncado a 0 bytes (accidente observado 09:05; ninguna
//   tanda nuestra escribe aquí) y se reconstruyó desde `dist/src/http/guards.js`
//   compilado (idéntico comportamiento, salvo el alias declarado abajo).
//   Corrección: `DRIVER` se aliasaba a `AGENT`, lo que (a) daba a cualquier
//   conductor la consola del agente de caja —única ruta `@Roles('AGENT')`— y
//   (b) le cerraba `deposits/withdrawals` (`@Roles('USER')`): el conductor no
//   podía retirar SU PROPIO neto liquidado (P1-c). El alias correcto del
//   conductor dentro del vocabulario del monedero es USER: es el dueño de su
//   dinero. El agente de caja real obtiene `role: 'AGENT'` directamente en el
//   JWT al hacer su login propio (`POST /v1/auth/login`, `issueSession`), sin
//   pasar por este alias, así que su consola sigue intacta.
// =============================================================================
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionalUser = exports.CurrentShop = exports.ShopOwnerGuard = exports.PaymentToken = exports.IdempotencyKey = exports.CurrentUser = exports.RolesGuard = exports.JwtAuthGuard = exports.Roles = exports.ROLES_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const passport_1 = require("@nestjs/passport");
const mobility_prisma_service_1 = require("../mobility/mobility-prisma.service");
exports.ROLES_KEY = '***';
const Roles = (...roles) => (0, common_1.SetMetadata)(exports.ROLES_KEY, roles);
exports.Roles = Roles;
let JwtAuthGuard = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
    handleRequest(err, user) {
        if (err || !user)
            throw err ??
                new common_1.UnauthorizedException({
                    error: { code: 'UNAUTHENTICATED', message: 'Sesión inválida o expirada' },
                });
        return user; // { userId, role } — poblado por la estrategia JWT
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)()
], JwtAuthGuard);

// Guard OPCIONAL: si no hay token, sigue (sin usuario). Para rutas que se sirven a invitados pero
// aprovechan la sesión cuando la hay — como la sección de seguidos del Mercado.
let OptionalJwtGuard = class OptionalJwtGuard extends (0, passport_1.AuthGuard)('jwt') {
    handleRequest(_err, user) {
        return user ?? null; // no lanza: no hay sesión, no hay usuario
    }
};
exports.OptionalJwtGuard = OptionalJwtGuard;
exports.OptionalJwtGuard = OptionalJwtGuard = __decorate([
    (0, common_1.Injectable)()
], OptionalJwtGuard);
let RolesGuard = class RolesGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const required = this.reflector.getAllAndOverride(exports.ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required || required.length === 0)
            return true;
        const { user } = context.switchToHttp().getRequest();
        if (!user)
            return false;
        // Alias de identidad unificada: los JWT mobility traen roles de dominio
        // (PASSENGER/DRIVER) y los endpoints del monedero hablan USER/AGENT.
        const role = ROLE_ALIASES[user.role] ?? user.role;
        return required.includes(role);
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], RolesGuard);
/** Aliasing de roles entre contextos JWT (mobility ↔ wallet). Ver cabecera: DRIVER→USER. */
const ROLE_ALIASES = {
    PASSENGER: 'USER',
    DRIVER: 'USER',
};
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    return ctx.switchToHttp().getRequest().user;
});
exports.IdempotencyKey = (0, common_1.createParamDecorator)((_data, ctx) => {
    const key = ctx.switchToHttp().getRequest().headers['idempotency-key'];
    if (!key || typeof key !== 'string') {
        throw new common_1.BadRequestException({
            error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Falta la cabecera Idempotency-Key' },
        });
    }
    return key;
});
exports.PaymentToken = (0, common_1.createParamDecorator)((_data, ctx) => {
    const token = ctx.switchToHttp().getRequest().headers['x-payment-token'];
    return typeof token === 'string' ? token : undefined; // el servicio decide si es obligatorio
});
// --- Life Book · Hotel (Parte 42-a): puerta de propiedad de tienda ---
/**
 * ShopOwnerGuard — «esta tienda es TUYA».
 *
 * Se apoya en el parámetro `:shopId` de la ruta (si existe) y en el usuario de la
 * sesión. La pertenencia se comprueba **contra la base**, no contra lo que diga el
 * cliente:
 *
 *   SELECT 1 FROM lifebook.shops WHERE id = :shopId AND owner_id = :userId
 *
 * Sin fila → **404** (no 403): un hotelero no debe poder averiguar si la tienda de
 * otro existe. Con fila, deja la tienda en `req.shop` para que el controlador no
 * tenga que volver a resolverla.
 *
 * ⚠️ Si la ruta NO trae `:shopId`, se resuelve la tienda DEL USUARIO y no se
 *    inventa ninguna comprobación (es el caso del panel por sesión, `/my/*`).
 */
let ShopOwnerGuard = class ShopOwnerGuard {
    db;
    constructor(db) {
        this.db = db;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const userId = req.user?.userId;
        if (!userId)
            return false; // sin identidad no se pasa: la ausencia NUNCA amplía
        const pedido = req.params?.shopId;
        const tienda = pedido
            ? 'SELECT id, owner_id, name, is_hotel, is_active FROM lifebook.shops WHERE id = $1::uuid AND owner_id = $2::uuid LIMIT 1'
            : 'SELECT id, owner_id, name, is_hotel, is_active FROM lifebook.shops WHERE owner_id = $2::uuid LIMIT 1';
        const filas = pedido
            ? await this.db.$queryRawUnsafe(tienda, pedido, userId)
            : await this.db.$queryRawUnsafe(tienda, null, userId);
        const shop = filas[0];
        if (!shop) {
            // 🔒 Mismo 404 para «no existe» y para «es de otro»: no se filtra existencia.
            throw new common_1.NotFoundException({
                error: { code: 'SHOP_NOT_FOUND', message: 'Esa tienda no existe o no es tuya', details: {} },
            });
        }
        req.shop = shop;
        return true;
    }
};
exports.ShopOwnerGuard = ShopOwnerGuard;
exports.ShopOwnerGuard = ShopOwnerGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mobility_prisma_service_1.MobilityPrismaService])
], ShopOwnerGuard);
/** La tienda que el guard dejó en la petición (o `null` en rutas públicas). */
exports.CurrentShop = (0, common_1.createParamDecorator)((_data, ctx) => ctx.switchToHttp().getRequest().shop ?? null);
/** Usuario de la sesión SIN exigirlo (rutas con sesión opcional). */
exports.OptionalUser = (0, common_1.createParamDecorator)((_data, ctx) => ctx.switchToHttp().getRequest().user ?? null);
//# sourceMappingURL=guards.js.map