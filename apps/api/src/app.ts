import 'reflect-metadata';
import { Controller, Get, Global, Inject, Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiTags, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Environment } from '@pos/config';
import { createOpenApiDocument } from '@pos/contracts/openapi';
import { AuthGuard, AuthModule, Public } from './auth.js';
import { DatabaseModule, DatabaseService, ENVIRONMENT, ErrorFilter, Problem } from './common.js';
import { AuditModule, DeviceModule, OutletModule, TenantModule } from './resources.js';

@Global()
@Module({})
class EnvironmentModule {
  static register(env: Environment): DynamicModule { return { module: EnvironmentModule, providers: [{ provide: ENVIRONMENT, useValue: env }], exports: [ENVIRONMENT] }; }
}

@Public()
@Controller('health')
@ApiTags('Health')
class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get('live') live() { return { data: { status: 'ok' } }; }
  @Get('ready') async ready() {
    try { await this.database.db.execute(sql`select 1`); return { data: { status: 'ok' } }; }
    catch { throw new Problem('DATABASE_UNAVAILABLE', 'Database is unavailable', 503); }
  }
}

@Module({})
class AppModule {
  static register(env: Environment): DynamicModule {
    return { module: AppModule, imports: [EnvironmentModule.register(env), DatabaseModule, TenantModule, AuthModule, OutletModule, DeviceModule, AuditModule], controllers: [HealthController], providers: [{ provide: APP_GUARD, useClass: AuthGuard }] };
  }
}

export async function createApplication(env: Environment, logging = false): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    bodyLimit: 1024 * 1024, genReqId: () => randomUUID(),
    logger: logging ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token', 'res.headers.set-cookie'] } : false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(env), adapter, { logger: logging ? ['log', 'warn', 'error'] : false });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute', errorResponseBuilder: request => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: request.id } }) });
  app.enableCors({ origin: env.ALLOWED_ORIGINS, credentials: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-Tenant-Id', 'X-CSRF-Token'] });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ErrorFilter());
  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder().setTitle('F&B POS Foundation API').setVersion('0.1.0').addCookieAuth('pos_session').build();
    const document = Object.assign(SwaggerModule.createDocument(app, config), createOpenApiDocument());
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });
  }
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
