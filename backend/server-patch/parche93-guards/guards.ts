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

import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';

export const ROLES_KEY = '***';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Usuario de la sesión (payload JWT normalizado por la estrategia). */
export interface AuthUser {
  userId: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user)
      throw err ??
        new UnauthorizedException({
          error: { code: 'UNAUTHENTICATED', message: 'Sesión inválida o expirada' },
        });
    return user; // { userId, role } — poblado por la estrategia JWT
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    // Alias de identidad unificada: los JWT mobility traen roles de dominio
    // (PASSENGER/DRIVER) y los endpoints del monedero hablan USER/AGENT.
    const role = ROLE_ALIASES[user.role] ?? user.role;
    return required.includes(role);
  }
}

/** Aliasing de roles entre contextos JWT (mobility ↔ wallet). Ver cabecera: DRIVER→USER. */
const ROLE_ALIASES: Record<string, string> = {
  PASSENGER: 'USER',
  DRIVER: 'USER',
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});

export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const key = ctx.switchToHttp().getRequest().headers['idempotency-key'];
  if (!key || typeof key !== 'string') {
    throw new BadRequestException({
      error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Falta la cabecera Idempotency-Key' },
    });
  }
  return key as string;
});

export const PaymentToken = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
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
@Injectable()
export class ShopOwnerGuard implements CanActivate {
  constructor(private readonly db: MobilityPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId;
    if (!userId) return false; // sin identidad no se pasa: la ausencia NUNCA amplía
    const pedido = req.params?.shopId;
    const tienda = pedido
      ? 'SELECT id, owner_id, name, is_hotel, is_active FROM lifebook.shops WHERE id = $1::uuid AND owner_id = $2::uuid LIMIT 1'
      : 'SELECT id, owner_id, name, is_hotel, is_active FROM lifebook.shops WHERE owner_id = $2::uuid LIMIT 1';
    const filas = pedido
      ? await this.db.$queryRawUnsafe<any[]>(tienda, pedido, userId)
      : await this.db.$queryRawUnsafe<any[]>(tienda, null, userId);
    const shop = filas[0];
    if (!shop) {
      // 🔒 Mismo 404 para «no existe» y para «es de otro»: no se filtra existencia.
      throw new NotFoundException({
        error: { code: 'SHOP_NOT_FOUND', message: 'Esa tienda no existe o no es tuya', details: {} },
      });
    }
    req.shop = shop;
    return true;
  }
}

/** La tienda que el guard dejó en la petición (o `null` en rutas públicas). */
export const CurrentShop = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().shop ?? null,
);

/** Usuario de la sesión SIN exigirlo (rutas con sesión opcional). */
export const OptionalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().user ?? null,
);
