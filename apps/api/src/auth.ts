import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Post, Req, Res, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RouteConfig } from '@nestjs/platform-fastify';
import type { FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { csrfTokenForSession, hashPassword, hashSessionToken, newSessionToken, verifyCsrf, verifyPassword } from '@pos/auth';
import { loginSchema } from '@pos/contracts';
import type { Environment } from '@pos/config';
import { schema } from '@pos/db';
import { AuditService, DatabaseService, ENVIRONMENT, identityOf, Problem, type AuthRequest, type Identity } from './common.js';
import { TenantService } from './tenant-service.js';

export const PUBLIC_ROUTE = Symbol('PUBLIC_ROUTE');
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export function cookieName(env: Environment) { return env.NODE_ENV === 'production' ? '__Host-pos_session' : 'pos_session'; }

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(newSessionToken());
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(ENVIRONMENT) private readonly env: Environment) {}

  async login(email: string, password: string) {
    const result = await this.database.db.transaction(async tx => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
      const verified = await verifyPassword(user?.passwordHash ?? await this.dummyHash, password);
      if (!user || !user.active || !verified) {
        await tx.insert(schema.authEvents).values({ userId: user?.id ?? null, action: 'LOGIN_FAILED' });
        return null;
      }
      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_SECONDS * 1000);
      await tx.insert(schema.sessions).values({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt });
      await tx.insert(schema.authEvents).values({ userId: user.id, action: 'LOGIN_SUCCEEDED' });
      return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name } };
    });
    if (!result) throw new Problem('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
    return result;
  }

  async identify(token: string): Promise<Identity> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Problem('UNAUTHENTICATED', 'Authentication required', 401);
    const [result] = await this.database.db.select({ sessionId: schema.sessions.id, expiresAt: schema.sessions.expiresAt, user: { id: schema.users.id, email: schema.users.email, name: schema.users.name } })
      .from(schema.sessions).innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(and(eq(schema.sessions.tokenHash, hashSessionToken(token)), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date()), eq(schema.users.active, true)));
    if (!result) throw new Problem('UNAUTHENTICATED', 'Session expired or revoked', 401);
    return { ...result, token };
  }

  async logout(identity: Identity) {
    await this.database.db.transaction(async tx => {
      const updated = await tx.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.id, identity.sessionId), isNull(schema.sessions.revokedAt))).returning({ id: schema.sessions.id });
      if (updated.length) await tx.insert(schema.authEvents).values({ userId: identity.user.id, action: 'LOGOUT' });
    });
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(Reflector) private readonly reflector: Reflector, @Inject(ENVIRONMENT) private readonly env: Environment) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutating && (!request.headers.origin || !this.env.ALLOWED_ORIGINS.includes(request.headers.origin))) {
      throw new Problem('ORIGIN_FORBIDDEN', 'Request origin is not allowed', 403);
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const token = request.cookies[cookieName(this.env)];
    if (!token) throw new Problem('UNAUTHENTICATED', 'Authentication required', 401);
    request.identity = await this.auth.identify(token);
    const csrf = request.headers['x-csrf-token'];
    if (mutating && (typeof csrf !== 'string' || !verifyCsrf(token, csrf))) throw new Problem('CSRF_INVALID', 'Invalid CSRF token', 403);
    return true;
  }
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(TenantService) private readonly tenants: TenantService, @Inject(ENVIRONMENT) private readonly env: Environment) {}

  @Public()
  @Post('login')
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '1 minute' } })
  @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', maxLength: 256 } } } })
  async login(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const input = loginSchema.parse(body);
    const session = await this.auth.login(input.email, input.password);
    reply.setCookie(cookieName(this.env), session.token, { httpOnly: true, secure: this.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: this.env.SESSION_TTL_SECONDS });
    reply.header('Cache-Control', 'no-store');
    return { data: { user: session.user, csrfToken: csrfTokenForSession(session.token), memberships: await this.tenants.list(session.user.id), expiresAt: session.expiresAt.toISOString() } };
  }

  @Get('session')
  @ApiCookieAuth()
  async session(@Req() request: AuthRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const identity = identityOf(request);
    reply.header('Cache-Control', 'no-store');
    return { data: { user: identity.user, csrfToken: csrfTokenForSession(identity.token), memberships: await this.tenants.list(identity.user.id), expiresAt: identity.expiresAt.toISOString() } };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth()
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(identityOf(request));
    reply.clearCookie(cookieName(this.env), { httpOnly: true, secure: this.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    return { data: { success: true } };
  }
}

@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
