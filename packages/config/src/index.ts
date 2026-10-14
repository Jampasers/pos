import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().url().refine(value => /^postgres(ql)?:/.test(value), 'PostgreSQL URL required'),
  ALLOWED_ORIGINS: z.string().min(1).transform(value => value.split(',').map(origin => origin.trim())).refine(
    origins => origins.length > 0 && origins.every(origin => { try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.origin === origin; } catch { return false; } }),
    'Explicit origins without paths or wildcards required',
  ),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(28800),
});
export type Environment = z.infer<typeof environmentSchema>;
export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  const env = environmentSchema.parse(source);
  if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.some(origin => !origin.startsWith('https://'))) {
    throw new Error('Production origins must use HTTPS');
  }
  return env;
}
