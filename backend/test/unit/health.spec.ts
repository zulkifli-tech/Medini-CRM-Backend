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

  it('readiness does NOT fake healthy deps at Sprint 0', () => {
    const svc = new HealthService(configWith({ 'database.url': '', 'redis.url': '', 'app.apiVersion': 'v1' }));
    const ready = svc.readiness();
    expect(ready.status).toBe('not_ready');
    expect(ready.dependencies.postgres?.status).toBe('pending_sprint');
    expect(ready.dependencies.redis?.status).toBe('pending_sprint');
    expect(ready.dependencies.postgres?.configured).toBe(false);
  });

  it('readiness reports config presence without claiming a live connection', () => {
    const svc = new HealthService(configWith({ 'database.url': 'postgres://x', 'redis.url': 'redis://y', 'app.apiVersion': 'v1' }));
    const ready = svc.readiness();
    expect(ready.dependencies.postgres?.configured).toBe(true);
    expect(ready.dependencies.postgres?.status).toBe('pending_sprint'); /* still honest */
  });
});
