import { z } from 'zod';
import { dataSchema, deviceSchema, errorSchema, healthSchema, listSchema, outletSchema, sessionSchema, type DeviceInput, type OutletInput } from '@pos/contracts';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export class ApiClient {
  constructor(private readonly baseUrl: string) {}
  private async request<T extends z.ZodType>(path: string, schema: T, options: { method?: 'GET' | 'POST'; body?: unknown; tenantId?: string; csrfToken?: string } = {}): Promise<z.infer<T>> {
    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method: options.method ?? 'GET', credentials: 'include', cache: 'no-store',
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.tenantId ? { 'X-Tenant-Id': options.tenantId } : {}), ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const error = errorSchema.safeParse(payload);
      throw new ApiError(response.status, error.success ? error.data.error.code : 'REQUEST_FAILED', error.success ? error.data.error.message : 'Request failed');
    }
    return schema.parse(payload);
  }
  async session() { try { return (await this.request('/auth/session', dataSchema(sessionSchema))).data; } catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; } }
  async login(email: string, password: string) { return (await this.request('/auth/login', dataSchema(sessionSchema), { method: 'POST', body: { email, password } })).data; }
  async logout(csrfToken: string) { return this.request('/auth/logout', dataSchema(z.object({ success: z.boolean() })), { method: 'POST', csrfToken }); }
  async health() { return this.request('/health/ready', dataSchema(healthSchema)); }
  async outlets(tenantId: string, after: string | null = null) { return this.request(`/outlets?limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, listSchema(outletSchema), { tenantId }); }
  async createOutlet(tenantId: string, csrfToken: string, body: OutletInput) { return this.request('/outlets', dataSchema(outletSchema), { method: 'POST', body, tenantId, csrfToken }); }
  async devices(tenantId: string, outletId: string, after: string | null = null) { return this.request(`/outlets/${outletId}/devices?limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, listSchema(deviceSchema), { tenantId }); }
  async registerDevice(tenantId: string, outletId: string, csrfToken: string, body: DeviceInput) { return this.request(`/outlets/${outletId}/devices`, dataSchema(deviceSchema), { method: 'POST', body, tenantId, csrfToken }); }
  async revokeDevice(tenantId: string, outletId: string, deviceId: string, csrfToken: string) { return this.request(`/outlets/${outletId}/devices/${deviceId}/revoke`, dataSchema(deviceSchema), { method: 'POST', tenantId, csrfToken }); }
}
