import { Catch, Global, Inject, Injectable, Module, type ArgumentsHost, type ExceptionFilter, HttpException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { assertSafeRuntimeRole, connectDatabase, ScopeError, schema, type Transaction } from '@pos/db';
import type { Environment } from '@pos/config';

export const ENVIRONMENT = Symbol('ENVIRONMENT');
export type Identity = { user: { id: string; email: string; name: string }; sessionId: string; token: string; expiresAt: Date };
export type AuthRequest = FastifyRequest & { identity?: Identity };
export function identityOf(request: AuthRequest): Identity {
  if (!request.identity) throw new HttpException({ code: 'UNAUTHENTICATED', message: 'Authentication required' }, 401);
  return request.identity;
}
export class Problem extends HttpException {
  constructor(code: string, message: string, status: number) { super({ code, message }, status); }
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  readonly connection;
  readonly db;
  constructor(@Inject(ENVIRONMENT) env: Environment) {
    this.connection = connectDatabase(env.DATABASE_URL);
    this.db = this.connection.db;
    this.connection.pool.on('error', () => { console.error('Database pool connection failed'); });
  }
  async onModuleInit() { await assertSafeRuntimeRole(this.db); }
  async onModuleDestroy() { await this.connection.pool.end(); }
}

@Injectable()
export class AuditService {
  async append(tx: Transaction, tenantId: string, actorId: string, action: string, resourceId: string, details: Record<string, unknown>, outletId: string | null = null) {
    await tx.insert(schema.auditLogs).values({ id: randomUUID(), tenantId, outletId, actorId, action, resourceId, details });
  }
}

@Global()
@Module({ providers: [DatabaseService, AuditService], exports: [DatabaseService, AuditService] })
export class DatabaseModule {}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  if ('cause' in error) return databaseCode(error.cause);
  return undefined;
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred';
    if (error instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request data'; }
    else if (error instanceof ScopeError) { status = 403; code = 'TENANT_FORBIDDEN'; message = error.message; }
    else if (error instanceof HttpException) {
      status = error.getStatus();
      const response = error.getResponse();
      if (typeof response === 'object' && 'code' in response && typeof response.code === 'string') code = response.code;
      else code = ({ 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 503: 'UNAVAILABLE' } as Record<number, string>)[status] ?? 'HTTP_ERROR';
      if (typeof response === 'object' && 'message' in response && typeof response.message === 'string') message = response.message;
      else if (typeof response === 'string') message = response;
    } else if (databaseCode(error) === '23505') { status = 409; code = 'CONFLICT'; message = 'Resource already exists'; }
    if (status === 500) request.log.error({ requestId: request.id, errorType: error instanceof Error ? error.name : 'UnknownError' }, 'Unhandled request failure');
    reply.status(status).send({ error: { code, message, requestId: request.id } });
  }
}
