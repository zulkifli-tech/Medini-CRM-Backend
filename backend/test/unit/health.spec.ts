import { describe, it, expect } from 'vitest';
import { HealthService } from '@infrastructure/health/health.service';

function configWith(values: Record<string, unknown>) {
  return { get: (k: string) => values[k] } as never;
}

describe('health foundation (honest readiness)', () => {
  it('liveness reports the process is alive', () => {
    const svc = new HealthService(configWith({ 'app.apiVersion': 'v1' }));
    const live = svc.liveness();
    expect(live.status).toBe('alive');
    expect(typeof live.uptime).toBe('number');
  });

  it('readiness reports not_configured when no DATABASE_URL', async () => {
    const svc = new HealthService(configWith({ 'database.url': '', 'redis.url': '', 'app.apiVersion': 'v1' }));
    const ready = await svc.readiness();
    expect(ready.status).toBe('not_ready');
    expect(ready.dependencies.postgres?.status).toBe('not_configured');
    expect(ready.dependencies.redis?.status).toBe('pending_sprint');
  });

  it('readiness does NOT fake a healthy DB — reports degraded when unreachable', async () => {
    /* point at a port nothing listens on → ping fails → degraded, never 'ok' */
    const svc = new HealthService(configWith({
      'database.url': 'postgres://localhost:59999/nope',
      'redis.url': '', 'app.apiVersion': 'v1',
    }));
    const ready = await svc.readiness();
    expect(['degraded', 'not_ready']).toContain(ready.status);
    expect(ready.dependencies.postgres?.status).toBe('degraded');
    expect(ready.dependencies.postgres?.configured).toBe(true);
  }, 15000);
});
