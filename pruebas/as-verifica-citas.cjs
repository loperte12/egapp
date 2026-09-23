// AS-05 · Verifica que cada cita `archivo:linea` del informe dice lo que el informe dice.
// Falla con lista de discrepancias si no coincide. Uso: node pruebas/as-verifica-citas.cjs
'use strict';
const fs = require('fs');
const RAIZ = 'D:\\egapp\\.auditoria-servicios\\backend\\';
const RAIZ_APP = 'D:\\egapp\\';

// [fichero, linea, trozo que DEBE estar en esa linea, descripcion]
const citas = [
  ['src/http/app.module.ts', 122, 'APP_GUARD', 'throttler es la unica guarda global'],
  ['src/main.ts', 27, 'useGlobalPipes', 'ValidationPipe global'],
  ['src/main.ts', 28, 'ValidationPipe', 'ValidationPipe global'],
  ['src/main.ts', 30, 'forbidNonWhitelisted', 'forbidNonWhitelisted'],
  ['src/mobility/mobility.controller.ts', 404, "@Post('trips')", 'pedir taxi (con guarda)'],
  ['src/mobility/mobility.controller.ts', 405, 'UseGuards(JwtAuthGuard)', 'pedir taxi (con guarda)'],
  ['src/mobility/mobility.controller.ts', 417, 'PRICE_RANGE', 'limite 300-10000 en requestedPrice'],
  ['src/mobility/mobility.controller.ts', 172, "@Post('routes')", 'proponer ruta (sin guarda)'],
  ['src/mobility/mobility.controller.ts', 246, "@Put('admin/stops/:id')", 'moderar parada (sin guarda)'],
  ['src/mobility/mobility.controller.ts', 247, 'reviewerId', 'el revisor viene del cuerpo'],
  ['src/mobility/mobility.controller.ts', 251, 'reviewerId', 'solo comprueba que exista'],
  ['src/mobility/mobility.controller.ts', 258, "@Put('admin/routes/:id')", 'moderar ruta (sin guarda)'],
  ['src/mobility/mobility.controller.ts', 240, "@Get('admin/proposals')", 'panel admin (sin guarda)'],
  ['src/mobility/mobility.controller.ts', 299, "@Patch('admin/stops/:id/moderate')", 'moderar directo (sin guarda)'],
  ['src/mobility/mobility.controller.ts', 305, "@Patch('admin/routes/:id/moderate')", 'moderar directo (sin guarda)'],
  ['src/mobility/mobility.controller.ts', 367, 'INSERT INTO reservations', 'INSERT sin calificar esquema'],
  ['src/mobility/mobility.controller.ts', 420, 'INSERT INTO mobility.taxi_requests', 'el resto SI califica'],
  ['src/mobility/mobility.controller.ts', 600, "@Post('trips/:id/accept')", 'aceptar viaje'],
  ['src/mobility/mobility.controller.ts', 601, 'UseGuards(JwtAuthGuard)', 'solo sesion, sin rol'],
  ['src/mobility/mobility.controller.ts', 602, 'body: { price?: number }', 'el precio lo pone el cuerpo'],
  ['src/mobility/mobility.controller.ts', 617, "status = 'accepted'", 'fija driver_id y final_price'],
  ['src/mobility/mobility.controller.ts', 618, 'final_price = ${body.price', 'final_price desde el cuerpo'],
  ['src/mobility/mobility.controller.ts', 435, "@Get('trips/driver')", 'lista de ofertas del conductor'],
  ['src/mobility/mobility.controller.ts', 437, 'CurrentUser', 'lista de ofertas del conductor'],
  ['src/mobility/mobility.controller.ts', 230, "@Put('trips/:id/complete')", 'completar viaje'],
  ['src/services/ride-settlement.service.ts', 146, 'final_price', 'el cobro sale de final_price'],
  ['src/services/ride-settlement.service.ts', 214, 'ride.user_id !== params.passengerId', 'comprueba dueno'],
  ['src/mobility/mobility-prisma.service.ts', 203, 'roundToCustom', 'precio por defecto desde la ruta'],
  ['src/mobility/mobility-prisma.service.ts', 2, 'schema mobility', 'cliente mobility'],
  ['prisma/mobility/schema.prisma', 546, 'reviewedBy', 'reviewedBy sin FK'],
  ['prisma/schema.prisma', 7, 'env("DATABASE_URL")', 'cliente wallet'],
  ['prisma/schema.prisma', 351, '@@map("products")', 'modelo Product -> products (homonima)'],
  ['prisma/schema.prisma', 127, '@@map("ledger_entries")', 'modelo LedgerEntry (homonima)'],
  ['src/lifebook/orders.service.ts', 1269, 'lifebook.ledger_entries', 'libro mayor propio de Life Book'],
  ['src/lifebook/orders.service.ts', 1421, 'lifebook.settlements', 'liquidaciones propias'],
  ['src/http/ride-settlement.controller.ts', 24, 'UseGuards(JwtAuthGuard)', 'liquidacion con sesion'],
  ['src/http/ride-settlement.controller.ts', 126, 'assertAdmin', 'rol admin contra la base'],
  ['src/http/ride-settlement.controller.ts', 128, "'ADMIN'", 'rol admin contra la base'],
  ['src/http/guards.ts', 78, 'ROLE_ALIASES', 'alias DRIVER->USER'],
  ['src/services/ride-settlement.service.ts', 145, 'fareOf', 'el importe sale de final_price'],
  ['src/services/ride-settlement.service.ts', 253, 'balance_available', 'cobro acotado por el saldo'],
  ['src/mobility/mobility.controller.ts', 415, 'requestedPrice != null', 'unico control de rango'],
  ['D:/egapp/app/conductor.tsx', 896, 'acceptTrip(offer.id, p)', 'la app usa accept con precio'],
  ['D:/egapp/api/taxi.ts', 57, 'accept', 'cliente de accept'],
  // verificaciones de §7 (lo que esta bien)
  ['src/http/guards.ts', 120, 'ShopOwnerGuard', 'guarda de propiedad de tienda'],
  ['src/http/guards.ts', 138, 'SHOP_NOT_FOUND', 'mismo 404 para no-existe y es-de-otro'],
  ['src/billing/billing-webhook.controller.ts', 36, 'INSERT INTO wallet.billing_webhook_events', 'webhook marca valid sin mirar el resultado'],
  ['src/http/app.module.ts', 73, 'secret:', 'JWT_SECRET obligatorio'],
  ['src/http/app.module.ts', 76, 'JWT_SECRET', 'JWT_SECRET obligatorio'],
  ['src/services/ride-settlement.service.ts', 102, '.sort()', 'monederos bloqueados en orden de UUID'],
  ['src/services/ride-settlement.service.ts', 114, 'INSUFFICIENT_FUNDS', 'no se permite saldo negativo'],
  ['src/lifebook/orders.service.ts', 34, "'disputed'", 'estado disputed'],
  ['src/lifebook/orders.service.ts', 37, 'const FROM', 'tabla de transiciones permitidas'],
  ['src/rental/rental.service.ts', 106, 'docNumber', 'expone numero de documento'],
  ['src/rental/rental.service.ts', 76, 'rental_landlords', 'landlordById por SELECT *'],
  // T-08 (agente de caja) y M-04 (comision de comercio)
  ['src/http/agent.controller.ts', 19, "@Controller('v1')", 'clase del agente'],
  ['src/http/agent.controller.ts', 21, "@Roles('AGENT')", 'toda la clase exige AGENT'],
  ['src/http/agent.controller.ts', 30, 'agentProfileId', 'resuelve el perfil por identidad'],
  ['src/http/agent.controller.ts', 32, 'ACTIVE', 'comprueba el estado contra la base'],
  ['src/http/agent.controller.ts', 39, 'solo lo emite el login PIN', 'el propio codigo reconoce el problema'],
  ['src/services/wallet.service.ts', 379, 'lb-release:', 'clave de idempotencia de la liberacion'],
  ['src/services/wallet.service.ts', 410, 'receiverId: null', 'FEE sin receptor'],
  ['src/services/wallet.service.ts', 411, "'FEE'", 'tipo FEE sin apunte contable'],
  ['src/food/food.service.ts', 706, 'handed_over_at', 'solo se lee, nunca se escribe'],
  // §1.1-bis: las 8 rutas sin guarda que faltaban en el informe de movilidad
  ['src/mobility/mobility.controller.ts', 214, "@Put('trips/:id/accept')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 222, "@Put('trips/:id/reject')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 230, "@Put('trips/:id/complete')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 299, "@Patch('admin/stops/:id/moderate')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 305, "@Patch('admin/routes/:id/moderate')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 333, "@Patch('rides/:id/respond')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 1094, "@Get('driver/selfie/:id')", 'sin guarda'],
  ['src/mobility/mobility.controller.ts', 1104, "@Get('user/photo/:id')", 'sin guarda'],
  // T-09 (cerrojo reutilizable)
  ['src/services/wallet.service.ts', 283, 'findUnique', 'busca el cerrojo por clave de idempotencia'],
  ['src/services/wallet.service.ts', 284, 'replay: true', 'devuelve el cerrojo anterior'],
  ['src/services/wallet.service.ts', 285, 'requirePaymentToken', 'el PIN se pide DESPUES del return'],
  ['src/food/food.service.ts', 373, 'fd-order:', 'comida usa clave NUEVA por intento'],
  ['src/ecomerse/ecomerse.service.ts', 456, 'ec-order:', 'ecomerse usa la clave del cliente'],
  ['src/intercity/intercity.service.ts', 431, 'lb-ic:', 'intercity usa la clave del cliente'],
  ['src/lifebook/orders.service.ts', 340, 'lb-order:', 'lifebook usa la clave del cliente'],
  ['src/lifebook/reservations.service.ts', 248, 'lb-hotel:', 'hotel usa la clave del cliente'],
  ['src/ecomerse/ecomerse.service.ts', 1051, 'releasedAt', 'released_at solo se LEE, nunca se escribe'],
  // LH-01: el panel del hotelero mueve la reserva y no el monedero
  ['src/lifebook/hotel-merchant.service.ts', 391, 'payment_status', 'marca pagado sin tocar el monedero'],
  ['src/lifebook/hotel-merchant.service.ts', 392, "'refunded'", 'marca devuelto sin tocar el monedero'],
  ['src/lifebook/reservations.service.ts', 735, 'liberarSiMonederoHotel', 'la otra puerta SI libera al entrar'],
  ['src/lifebook/reservations.service.ts', 736, 'devolverSiMonederoHotel', 'la otra puerta SI devuelve al cancelar'],
  // T-06: los barridos no estan programados
  ['src/intercity/intercity.service.ts', 844, 'expireStale', 'el barrido existe...'],
  ['src/intercity/intercity.controller.ts', 12, 'admin/expire-stale', '...y solo lo alcanza una ruta ADMIN'],
];

let fallos = 0;
for (const [f, linea, trozo, desc] of citas) {
  const ruta = f.startsWith('D:/') ? f.replace(/\//g, '\\') : RAIZ + f.replace(/\//g, '\\');
  if (!fs.existsSync(ruta)) { console.log(`FALTA FICHERO  ${f}`); fallos++; continue; }
  const lineas = fs.readFileSync(ruta, 'utf8').split(/\r?\n/);
  const t = lineas[linea - 1];
  if (t === undefined) { console.log(`FUERA DE RANGO ${f}:${linea}`); fallos++; continue; }
  const ok = t.includes(trozo);
  if (!ok) {
    console.log(`MAL  ${f}:${linea}  esperaba "${trozo}"  (${desc})`);
    console.log(`     linea real: ${t.trim().slice(0, 110)}`);
    fallos++;
  } else {
    console.log(`ok   ${f}:${linea}  ${desc}`);
  }
}
console.log('');
console.log(fallos === 0 ? `TODAS LAS CITAS VERIFICADAS (${citas.length})` : `CITAS FALLIDAS: ${fallos} de ${citas.length}`);
process.exit(fallos === 0 ? 0 : 1);




