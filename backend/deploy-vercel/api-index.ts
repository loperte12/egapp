/**
 * api/index.ts — WRAPPER SERVERLESS del NestJS para Vercel.
 *
 * COPIAR al proyecto real del servidor como `api/index.ts`, en la raíz del
 * proyecto Nest (junto a package.json). Ajustar las dos líneas marcadas con
 * «AJUSTAR» contra el `main.ts` real (prefijo global y módulo raíz).
 *
 * POR QUÉ ESTE WRAPPER
 * Vercel corre funciones, no procesos: no hay `app.listen()`. La función
 * mantiene el módulo de Nest en caché de instancia (cold start una vez por
 * instancia, no por petición) y adapta Express a la lambda.
 *
 * IMPORTANTE (Prisma + serverless): cada instancia abre su propio pool. Con
 * Neon hay que usar la cadena del POOLER (`-pooler.` en el host) o se agotan
 * las conexiones de la base en cuanto haya varias instancias calientes.
 */
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';

// AJUSTAR: la ruta real del AppModule del proyecto del servidor.
import { AppModule } from '../src/app.module';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

let handlerCache: Handler | null = null;

async function construir(): Promise<Handler> {
  const adapter = new ExpressAdapter();
  const app = await NestFactory.create(AppModule, adapter, { logger: ['error', 'warn'] });

  // AJUSTAR: el prefijo EXACTO que usa la app hoy (api/config.ts llama
  // https://hk.egrouteplan.com/wallet/api/v1/... — reproducirlo tal cual).
  app.setGlobalPrefix('wallet/api/v1');

  // Los CORS del main.ts real deben copiarse aquí (o quedar en AppModule).
  await app.init();

  return serverlessExpress({ app: adapter.getInstance() }) as unknown as Handler;
}

export default async function handler(req: unknown, res: unknown) {
  if (!handlerCache) handlerCache = await construir();
  return handlerCache(req, res);
}
