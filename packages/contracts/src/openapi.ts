import { z } from 'zod';
import { auditSchema, dataSchema, deviceInputSchema, deviceSchema, errorSchema, healthSchema, listSchema, loginSchema, membershipSchema, outletInputSchema, outletSchema, sessionSchema } from './index.js';

export function createOpenApiDocument() {
  const json = (schema: z.ZodType, input = false) => z.toJSONSchema(schema, { target: 'openapi-3.0', io: input ? 'input' : 'output' });
  const endpoints: { method: 'get' | 'post'; path: string; summary: string; public?: boolean; tenant?: boolean; input?: z.ZodType; output: z.ZodType; status?: number; paginated?: boolean }[] = [
    { method: 'get', path: '/health/live', summary: 'Process liveness', public: true, output: dataSchema(healthSchema) },
    { method: 'get', path: '/health/ready', summary: 'Database readiness', public: true, output: dataSchema(healthSchema) },
    { method: 'post', path: '/auth/login', summary: 'Password login', public: true, input: loginSchema, output: dataSchema(sessionSchema), status: 201 },
    { method: 'get', path: '/auth/session', summary: 'Current session and permitted merchants', output: dataSchema(sessionSchema) },
    { method: 'post', path: '/auth/logout', summary: 'Revoke current session', output: dataSchema(z.object({ success: z.boolean() })) },
    { method: 'get', path: '/tenants', summary: 'Discover memberships', output: dataSchema(membershipSchema.array()) },
    { method: 'get', path: '/outlets', summary: 'Authorized outlets', tenant: true, output: listSchema(outletSchema), paginated: true },
    { method: 'post', path: '/outlets', summary: 'Create an outlet', tenant: true, input: outletInputSchema, output: dataSchema(outletSchema), status: 201 },
    { method: 'get', path: '/outlets/{outletId}', summary: 'Authorized outlet detail', tenant: true, output: dataSchema(outletSchema) },
    { method: 'get', path: '/outlets/{outletId}/devices', summary: 'Registered outlet devices', tenant: true, output: listSchema(deviceSchema), paginated: true },
    { method: 'post', path: '/outlets/{outletId}/devices', summary: 'Idempotent device registration', tenant: true, input: deviceInputSchema, output: dataSchema(deviceSchema), status: 201 },
    { method: 'post', path: '/outlets/{outletId}/devices/{deviceId}/revoke', summary: 'Revoke device registration', tenant: true, output: dataSchema(deviceSchema) },
    { method: 'get', path: '/audit', summary: 'Authorized audit events', tenant: true, output: listSchema(auditSchema), paginated: true },
  ];
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of endpoints) {
    const parameters: Record<string, unknown>[] = [...endpoint.path.matchAll(/\{(\w+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }));
    if (endpoint.tenant) parameters.push({ name: 'X-Tenant-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Requested context; validated against active server membership' });
    if (endpoint.method === 'post') parameters.push({ name: 'Origin', in: 'header', required: true, schema: { type: 'string' } });
    if (!endpoint.public && endpoint.method === 'post') parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' } });
    if (endpoint.paginated) parameters.push({ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }, { name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' } });
    const responses: Record<string, unknown> = { [endpoint.status ?? 200]: { description: 'Success', content: { 'application/json': { schema: json(endpoint.output) } } } };
    for (const code of [400, 401, 403, 404, 409, 429, 500, 503]) responses[code] = { description: 'Error', content: { 'application/json': { schema: json(errorSchema) } } };
    const key = `/v1${endpoint.path}`;
    paths[key] ??= {};
    paths[key][endpoint.method] = { summary: endpoint.summary, security: endpoint.public ? [] : [{ session: [] }], parameters, responses, ...(endpoint.input ? { requestBody: { required: true, content: { 'application/json': { schema: json(endpoint.input, true) } } } } : {}) };
  }
  return { openapi: '3.0.3', info: { title: 'F&B POS Foundation API', version: '0.1.0', description: 'Implemented Phase 1 contracts only. No sales or sync endpoints are served yet.' }, paths, components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'pos_session' } } } };
}
