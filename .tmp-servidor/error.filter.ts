// =============================================================================
// ErrorFilter — traduce DomainError de los servicios a respuestas HTTP
// coherentes con docs/API.md. Nunca expone trazas ni datos internos.
// =============================================================================

import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainError } from '../services/payment-auth.service';

const CODE_TO_STATUS: Record<string, number> = {
  // 400 — petición inválida
  AMOUNT_INVALID: HttpStatus.BAD_REQUEST,
  PIN_INVALID: HttpStatus.BAD_REQUEST,
  OTP_INVALID: HttpStatus.BAD_REQUEST,
  OTP_EXPIRED: HttpStatus.BAD_REQUEST,
  QR_INVALID: HttpStatus.BAD_REQUEST,
  QR_EXPIRED: HttpStatus.BAD_REQUEST,
  QR_ALREADY_USED: HttpStatus.BAD_REQUEST,
  PAYMENT_TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  PAYMENT_TOKEN_EXPIRED: HttpStatus.BAD_REQUEST,
  PAYMENT_TOKEN_SCOPE_MISMATCH: HttpStatus.BAD_REQUEST,
  JUSTIFICATION_REQUIRED: HttpStatus.BAD_REQUEST,
  SELF_TRADE: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  BIOMETRIC_INVALID: HttpStatus.BAD_REQUEST,

  // 403 — prohibido por política
  KYC_REQUIRED: HttpStatus.FORBIDDEN,
  KYC_IN_PROGRESS: HttpStatus.FORBIDDEN,
  KYC_REJECTED: HttpStatus.FORBIDDEN,
  KYC_EXPIRED: HttpStatus.FORBIDDEN,
  KYC_WITHDRAWAL_RESTRICTED: HttpStatus.FORBIDDEN,
  KYC_RISK_BLOCKED: HttpStatus.FORBIDDEN,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  NOT_ORDER_PARTICIPANT: HttpStatus.FORBIDDEN,
  AGENT_NOT_ASSIGNED: HttpStatus.FORBIDDEN,
  NOT_AN_AGENT: HttpStatus.FORBIDDEN,
  FACE_MISMATCH: HttpStatus.FORBIDDEN,
  // Parte 17 (grupos y ajustes del chat)
  GROUP_TITLE_REQUIRED: HttpStatus.BAD_REQUEST,
  GROUP_MEMBERS_REQUIRED: HttpStatus.BAD_REQUEST,
  GROUP_FULL: HttpStatus.BAD_REQUEST,
  GROUP_NOT_FOUND: HttpStatus.NOT_FOUND,
  GROUP_FORBIDDEN: HttpStatus.FORBIDDEN,
  // «Esa publicación no es tuya»: permiso, no petición mal formada.
  NOT_YOUR_POST: HttpStatus.FORBIDDEN,
  KIND_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  SEARCH_KIND_INVALID: HttpStatus.BAD_REQUEST,
  GROUP_META_INVALID: HttpStatus.BAD_REQUEST,
  // Parte 22 (gestión de grupo)
  GROUP_MUTED: HttpStatus.FORBIDDEN,
  // Parte 24 (G2: ubicación y votación)
  LOCATION_REQUIRED: HttpStatus.BAD_REQUEST,
  // Parte 25 (G2-b: cadena, quedada y tema)
  CHAIN_TITLE_REQUIRED: HttpStatus.BAD_REQUEST,
  CHAIN_FULL: HttpStatus.BAD_REQUEST,
  CHECKIN_REQUIRED: HttpStatus.BAD_REQUEST,
  // Parte 26 (G2-c: anuncio de grupo y Plaza de retos)
  CHALLENGE_HAS_ENTRIES: HttpStatus.BAD_REQUEST,
  // Parte 26 (G2-c: anuncio de grupo y Plaza de retos)
  AD_TEXT_REQUIRED: HttpStatus.BAD_REQUEST,
  AD_ONLY_IN_GROUPS: HttpStatus.BAD_REQUEST,
  AD_LIMIT_REACHED: 429,
  CHALLENGE_TITLE_REQUIRED: HttpStatus.BAD_REQUEST,
  // Parte 27 (Fase G3: unirse a grupos)
  REQUEST_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Parte 28 (G4: ubicación en vivo, código de ruta y reportar personas)
  LIVE_NOT_SHARING: HttpStatus.BAD_REQUEST,
  INVITE_CODE_INVALID: HttpStatus.BAD_REQUEST,
  INVITE_CODE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVITE_CODE_ERROR: HttpStatus.BAD_REQUEST,
  // El enlace ya se ha usado todas las veces que permitía: es «tu enlace ya no sirve»,
  // igual que el caducado, así que responde lo mismo (400) y la app no necesita dos caminos.
  INVITE_CODE_USED_UP: HttpStatus.BAD_REQUEST,
  CHALLENGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CHALLENGE_CLOSED: HttpStatus.BAD_REQUEST,
  NOT_CHALLENGE_AUTHOR: HttpStatus.FORBIDDEN,
  MESSAGE_NOT_JOINABLE: HttpStatus.BAD_REQUEST,
  VOTE_QUESTION_REQUIRED: HttpStatus.BAD_REQUEST,
  VOTE_OPTIONS_INVALID: HttpStatus.BAD_REQUEST,
  VOTE_OPTION_INVALID: HttpStatus.BAD_REQUEST,
  // Parte 23 (mensajes y comentarios)
  MESSAGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  MESSAGE_FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_COMMENT_AUTHOR: HttpStatus.FORBIDDEN,
  COMMENT_FORBIDDEN: HttpStatus.FORBIDDEN,
  GROUP_ADMINS_FULL: HttpStatus.BAD_REQUEST,
  // Parte 16
  INBOX_KIND_INVALID: HttpStatus.BAD_REQUEST,
  // Parte 15 (adjuntos del chat)
  CHAT_KIND_INVALID: HttpStatus.BAD_REQUEST,
  POST_ID_INVALID: HttpStatus.BAD_REQUEST,
  POST_HIDDEN: HttpStatus.FORBIDDEN,
  // Parte 14
  COMMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Contrato del cliente (Parte 12)
  CURSOR_INVALID: HttpStatus.BAD_REQUEST,
  // Búsqueda (Parte 9)
  SEARCH_FILTER_INVALID: HttpStatus.BAD_REQUEST,
  // Estado 24h — prohibido por política
  ROLE_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  CANNOT_REPORT_SELF: HttpStatus.FORBIDDEN,
  PUBLISH_SUSPENDED: HttpStatus.FORBIDDEN,

  // Estado 24h — no encontrado
  STATUS_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Estado 24h · capa social (me gusta, comentarios y avisos)
  STATUS_ID_INVALID: HttpStatus.BAD_REQUEST,
  COMMENT_ID_INVALID: HttpStatus.BAD_REQUEST,
  // «El autor lo apagó» es 400 en toda la casa (igual que COMMENTS_DISABLED
  // del Life Book); 403 se reserva a permisos y relaciones (USER_BLOCKED).
  REACTIONS_DISABLED: HttpStatus.BAD_REQUEST,

  // Estado 24h — conflicto
  ALREADY_REPORTED: HttpStatus.CONFLICT,

  // Estado 24h — petición inválida
  PRESET_NOT_FOUND: HttpStatus.BAD_REQUEST,
  STATUS_TEXT_TOO_LONG: HttpStatus.BAD_REQUEST,
  STATUS_TEXT_FORBIDDEN: HttpStatus.BAD_REQUEST,
  MEDIA_NOT_FOUND: HttpStatus.BAD_REQUEST,
  LINK_TYPE_INVALID: HttpStatus.BAD_REQUEST,
  LINK_ID_INVALID: HttpStatus.BAD_REQUEST,
  REASON_INVALID: HttpStatus.BAD_REQUEST,
  STATUS_EMPTY: HttpStatus.BAD_REQUEST,
  // Life Book — prohibido
  CANNOT_FOLLOW_SELF: HttpStatus.FORBIDDEN,
  // Life Book — comentarios con publicación adjunta
  CANNOT_ATTACH_SELF: HttpStatus.BAD_REQUEST,

  // Life Book — no encontrado
  POST_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONTENT_NOT_FOUND: HttpStatus.NOT_FOUND,

  // Life Book — conflicto

  // Life Book — petición inválida
  BODY_REQUIRED: HttpStatus.BAD_REQUEST,
  BODY_TOO_LONG: HttpStatus.BAD_REQUEST,
  COMMENT_REQUIRED: HttpStatus.BAD_REQUEST,
  COMMENT_TOO_LONG: HttpStatus.BAD_REQUEST,
  CITY_REQUIRED: HttpStatus.BAD_REQUEST,
  TEXT_FORBIDDEN: HttpStatus.BAD_REQUEST,
  CONTENT_TYPE_INVALID: HttpStatus.BAD_REQUEST,
  // Life Book Parte 6 — ajustes · bloqueos · comentarios
  USER_BLOCKED: HttpStatus.FORBIDDEN,
  // Life Book Parte 6 — ajustes · bloqueos · comentarios
  CANNOT_BLOCK_SELF: HttpStatus.BAD_REQUEST,
  COMMENTS_DISABLED: HttpStatus.BAD_REQUEST,
  SETTING_INVALID: HttpStatus.BAD_REQUEST,
  NOT_POST_AUTHOR: HttpStatus.FORBIDDEN,
  // Life Book Parte 5 — chat · pedidos · moderación
  CANNOT_CHAT_SELF: HttpStatus.BAD_REQUEST,
  CONV_NOT_FOUND: HttpStatus.NOT_FOUND,
  CHAT_NOT_PARTICIPANT: HttpStatus.FORBIDDEN,
  MESSAGE_REQUIRED: HttpStatus.BAD_REQUEST,
  ORDER_NOT_FOR_SALE: HttpStatus.BAD_REQUEST,
  CANNOT_ORDER_OWN: HttpStatus.BAD_REQUEST,
  ORDER_EXISTS: HttpStatus.CONFLICT,
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ORDER_NOT_YOURS: HttpStatus.FORBIDDEN,
  ORDER_STATE_INVALID: HttpStatus.BAD_REQUEST,
  PRICE_NOT_ACCEPTED: HttpStatus.BAD_REQUEST,
  REPORT_NOT_FOUND: HttpStatus.NOT_FOUND,
  REPORT_DECIDED: HttpStatus.CONFLICT,
  REPORT_OPEN: HttpStatus.BAD_REQUEST,
  NOT_CONTENT_AUTHOR: HttpStatus.FORBIDDEN,
  // Life Book Parte 4 — video/podcast/serie + media
  KIND_INVALID: HttpStatus.BAD_REQUEST,
  MEDIA_REQUIRED: HttpStatus.BAD_REQUEST,
  MEDIA_TOO_LARGE: HttpStatus.BAD_REQUEST,
  MEDIA_TYPE_INVALID: HttpStatus.BAD_REQUEST,
  UPLOAD_FAILED: HttpStatus.BAD_GATEWAY,
  DURATION_INVALID: HttpStatus.BAD_REQUEST,
  COVER_REQUIRED: HttpStatus.BAD_REQUEST,
  SERIE_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_SERIE_AUTHOR: HttpStatus.FORBIDDEN,
  EPISODE_EXISTS: HttpStatus.CONFLICT,
  EPISODE_INVALID: HttpStatus.BAD_REQUEST,
  // Life Book Parte 3 — canales del feed + perfil público
  CHANNEL_INVALID: HttpStatus.BAD_REQUEST,
  PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Life Book Parte 2 — venta/servicio/debate
  TITLE_TOO_SHORT: HttpStatus.BAD_REQUEST,
  PHOTO_REQUIRED: HttpStatus.BAD_REQUEST,
  PRICE_INVALID: HttpStatus.BAD_REQUEST,
  CATEGORY_INVALID: HttpStatus.BAD_REQUEST,
  DEBATE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROPOSAL_NOT_FOUND: HttpStatus.NOT_FOUND,
  PROPOSALS_DISABLED: HttpStatus.BAD_REQUEST,
  VOTES_DISABLED: HttpStatus.BAD_REQUEST,
  DEBATE_CLOSED: HttpStatus.BAD_REQUEST,
  PROPOSAL_REQUIRED: HttpStatus.BAD_REQUEST,
  NOT_DEBATE_AUTHOR: HttpStatus.FORBIDDEN,
  STATE_INVALID: HttpStatus.BAD_REQUEST,
  SUMMARY_REQUIRED: HttpStatus.BAD_REQUEST,

  // 404
  WALLET_NOT_FOUND: HttpStatus.NOT_FOUND,
  ESCROW_NOT_FOUND: HttpStatus.NOT_FOUND,
  AGENT_OP_NOT_FOUND: HttpStatus.NOT_FOUND,
  PLATFORM_WALLET_MISSING: HttpStatus.NOT_FOUND,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,

  // 409 — conflicto de estado o fondos
  INSUFFICIENT_FUNDS: HttpStatus.CONFLICT,
  DAILY_LIMIT_EXCEEDED: HttpStatus.CONFLICT,
  OPERATION_LIMIT_EXCEEDED: HttpStatus.CONFLICT,
  CONFLICT_ACTIVE_ESCROW: HttpStatus.CONFLICT,
  AGENT_OP_EXPIRED: HttpStatus.CONFLICT,
  KYC_REVIEW_PENDING: HttpStatus.CONFLICT,
  BALANCE_CAP_EXCEEDED: HttpStatus.CONFLICT,
  AGENT_UNAVAILABLE: HttpStatus.CONFLICT,
  PHONE_TAKEN: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,

  // 423 — bloqueado (HttpStatus no incluye LOCKED en NestJS 10: literal)
  PIN_LOCKED: 423,
  OTP_LOCKED: 423,
  // --- Life Book · Comercio (Parte 33) ---
  SHOP_NAME_REQUIRED: HttpStatus.BAD_REQUEST,
  PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Destacar/comprar un producto que no es tuyo o no está activo: la petición no vale (400),
  // no un 422, que obligaría a la app a tratar igual dos cosas iguales de forma distinta.
  PRODUCT_NOT_MINE: HttpStatus.BAD_REQUEST,
  TITLE_REQUIRED: HttpStatus.BAD_REQUEST,
  PRICE_REQUIRED: HttpStatus.BAD_REQUEST,
  PRICE_MODE_INVALID: HttpStatus.BAD_REQUEST,
  OLD_PRICE_INVALID: HttpStatus.BAD_REQUEST,
  STOCK_MODE_INVALID: HttpStatus.BAD_REQUEST,
  CONDITION_INVALID: HttpStatus.BAD_REQUEST,
  SERVICE_TYPE_INVALID: HttpStatus.BAD_REQUEST,
  SELLER_TYPE_INVALID: HttpStatus.BAD_REQUEST,
  REGION_INVALID: HttpStatus.BAD_REQUEST,
  LAT_INVALID: HttpStatus.BAD_REQUEST,
  LNG_INVALID: HttpStatus.BAD_REQUEST,
  CATEGORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEDIA_URL_INVALID: HttpStatus.BAD_REQUEST,
  MEDIA_LIMIT: HttpStatus.BAD_REQUEST,
  SHIPPING_POLICY_NOT_FOUND: HttpStatus.NOT_FOUND,
  PAYMENT_METHOD_INVALID: HttpStatus.BAD_REQUEST,
  COST_MODE_INVALID: HttpStatus.BAD_REQUEST,
  VARIANT_DUPLICATED: HttpStatus.BAD_REQUEST,
  ATTRIBUTE_DUPLICATED: HttpStatus.BAD_REQUEST,
  VARIANT_NAME_REQUIRED: HttpStatus.BAD_REQUEST,
  VARIANTS_LIMIT: HttpStatus.BAD_REQUEST,
  ATTRIBUTES_LIMIT: HttpStatus.BAD_REQUEST,
// --- Life Book · Panel de tienda (Parte 39) ---
  PRODUCT_NOT_PUBLISHED: HttpStatus.CONFLICT,
  STOCK_QUANTITY_INVALID: HttpStatus.BAD_REQUEST,
// --- Life Book · Media real (Parte 41) ---
  MEDIA_PURPOSE_INVALID: HttpStatus.BAD_REQUEST,
  MEDIA_KIND_INVALID: HttpStatus.BAD_REQUEST,
  MEDIA_SIZE_REQUIRED: HttpStatus.BAD_REQUEST,
  MEDIA_QUOTA_DAY: HttpStatus.TOO_MANY_REQUESTS,
  MEDIA_QUOTA_BYTES: HttpStatus.TOO_MANY_REQUESTS,
  MEDIA_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  UPLOAD_NOT_FOUND: HttpStatus.NOT_FOUND,
  UPLOAD_NOT_OWNER: HttpStatus.FORBIDDEN,
  UPLOAD_MISSING: HttpStatus.CONFLICT,
  UPLOAD_REJECTED: HttpStatus.CONFLICT,
  MEDIA_SIZE_MISMATCH: HttpStatus.CONFLICT,
  MEDIA_UNREADABLE: HttpStatus.BAD_REQUEST,
  DURATION_TOO_LONG: HttpStatus.BAD_REQUEST,
// --- Life Book · Pedidos (Parte 36) ---
  ITEMS_REQUIRED: HttpStatus.BAD_REQUEST,
  ITEMS_LIMIT: HttpStatus.BAD_REQUEST,
  DELIVERY_MODE_INVALID: HttpStatus.BAD_REQUEST,
  ADDRESS_REQUIRED: HttpStatus.BAD_REQUEST,
  QUANTITY_INVALID: HttpStatus.BAD_REQUEST,
  PRICE_ON_REQUEST: HttpStatus.BAD_REQUEST,
  PRODUCT_NOT_AVAILABLE: HttpStatus.CONFLICT,
  CANNOT_BUY_OWN: HttpStatus.BAD_REQUEST,
  MULTI_SHOP_NOT_SUPPORTED: HttpStatus.BAD_REQUEST,
  VARIANT_NOT_FOUND: HttpStatus.NOT_FOUND,
  PAYMENT_METHOD_NOT_ACCEPTED: HttpStatus.CONFLICT,
  SERVICE_NOT_ORDERABLE: HttpStatus.CONFLICT,
  STOCK_INSUFFICIENT: HttpStatus.CONFLICT,
  DELIVERY_CODE_REQUIRED: HttpStatus.BAD_REQUEST,
  DELIVERY_CODE_INVALID: HttpStatus.BAD_REQUEST,
  DELIVERY_CODE_NOT_APPLICABLE: HttpStatus.BAD_REQUEST,
  // --- Life Book · Hotel (Parte 42) ---
  NUMBER_INVALID: HttpStatus.BAD_REQUEST,
  TIME_INVALID: HttpStatus.BAD_REQUEST,
  FIELD_REQUIRED: HttpStatus.BAD_REQUEST,
  ROOM_NAME_REQUIRED: HttpStatus.BAD_REQUEST,
  ROOM_NAME_TAKEN: HttpStatus.CONFLICT,
  PROPERTY_KIND_INVALID: HttpStatus.BAD_REQUEST,
  AMENITY_INVALID: HttpStatus.BAD_REQUEST,
  AMENITIES_LIMIT: HttpStatus.BAD_REQUEST,
  IMAGES_LIMIT: HttpStatus.BAD_REQUEST,
  IMAGE_INVALID: HttpStatus.BAD_REQUEST,
  IMAGE_NOT_READY: HttpStatus.BAD_REQUEST,
  BEDS_INVALID: HttpStatus.BAD_REQUEST,
  BEDS_LIMIT: HttpStatus.BAD_REQUEST,
  NIGHTS_RANGE_INVALID: HttpStatus.BAD_REQUEST,
  MIN_NIGHTS_NOT_MET: HttpStatus.BAD_REQUEST,
  MAX_NIGHTS_EXCEEDED: HttpStatus.BAD_REQUEST,
  CAPACITY_EXCEEDED: HttpStatus.BAD_REQUEST,
  GUEST_NAME_REQUIRED: HttpStatus.BAD_REQUEST,
  GUEST_PHONE_REQUIRED: HttpStatus.BAD_REQUEST,
  PAYMENT_METHOD_REQUIRED: HttpStatus.BAD_REQUEST,
  CALENDAR_ACTION_INVALID: HttpStatus.BAD_REQUEST,
  CALENDAR_NOTHING: HttpStatus.BAD_REQUEST,
  CALENDAR_EMPTY: HttpStatus.BAD_REQUEST,
  UNITS_BELOW_BOOKED: HttpStatus.BAD_REQUEST,
  PROOF_REQUIRED: HttpStatus.BAD_REQUEST,
  PROOF_NOT_APPLICABLE: HttpStatus.BAD_REQUEST,
  CANNOT_BOOK_OWN: HttpStatus.BAD_REQUEST,
  ROOM_NOT_YOURS: HttpStatus.FORBIDDEN,
  HOTEL_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROOM_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROOM_SOLD_OUT: HttpStatus.CONFLICT,
  ROOM_NOT_AVAILABLE: HttpStatus.CONFLICT,
  DATES_CLOSED: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  IDEMPOTENCY_IN_PROGRESS: HttpStatus.CONFLICT,
  SHOP_INACTIVE: HttpStatus.CONFLICT,
  SHOP_REQUIRED: HttpStatus.CONFLICT,
  SHOP_EXISTS: HttpStatus.CONFLICT,
  // --- Life Book · Hotel (Parte 42-a): panel del hotel ---
  SHOP_NOT_FOUND: HttpStatus.NOT_FOUND,
  STATUS_INVALID: HttpStatus.BAD_REQUEST,
  RESERVATION_STATE_CHANGED: HttpStatus.CONFLICT,
  ACTION_INVALID: HttpStatus.BAD_REQUEST,
  INVALID_TRANSITION: HttpStatus.CONFLICT,
  INVALID_STATE: HttpStatus.CONFLICT,
  NOT_HOTEL_OWNER: HttpStatus.FORBIDDEN,
  RESERVATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_DEPOSIT: HttpStatus.BAD_REQUEST,
  HOLD_EXPIRED: HttpStatus.CONFLICT,
  TOO_EARLY: HttpStatus.BAD_REQUEST,
  DEPOSIT_NOT_CONFIRMED: HttpStatus.BAD_REQUEST,
  REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  NOT_RESERVATION_PARTICIPANT: HttpStatus.FORBIDDEN,
  DATE_INVALID: HttpStatus.BAD_REQUEST,
  DATE_RANGE_INVALID: HttpStatus.BAD_REQUEST,
  DATES_REQUIRED: HttpStatus.BAD_REQUEST,
  DATE_IN_PAST: HttpStatus.BAD_REQUEST,
  RANGE_TOO_LONG: HttpStatus.BAD_REQUEST,
  ID_INVALID: HttpStatus.BAD_REQUEST,
};

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof DomainError) {
      const status = CODE_TO_STATUS[exception.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
      res.status(status).json({
        error: { code: exception.code, message: exception.message, details: exception.details },
      });
      return;
    }

    // Errores HTTP del framework (validation pipe, guards, etc.)
    const status = typeof exception?.getStatus === 'function' ? exception.getStatus() : 500;
    if (status < 500) {
      const response = typeof exception?.getResponse === 'function' ? exception.getResponse() : undefined;
      // Si el body ya trae nuestro sobre { error: { code, message, details } }, respétalo.
      const shaped = (response as any)?.error?.code ? (response as any).error : null;
      res.status(status).json({
        error: {
          code: shaped?.code ?? 'HTTP_' + status,
          message: shaped?.message ?? (response as any)?.message ?? exception.message ?? 'Error de validación',
          details: shaped?.details ?? {},
        },
      });
      return;
    }

    // 500: log interno, respuesta genérica (NUNCA filtrar el error real).
    console.error('[unhandled]', exception);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno', details: {} } });
  }
}
