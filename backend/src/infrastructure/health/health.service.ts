import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DependencyStatus {
  configured: boolean;
  status: 'ok' | 'not_configured' | 'pending_sprint';
  note?: string;
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  timestamp: string;
  version: string;
  dependencies: Record<string, DependencyStatus>;
}

/**
 * Sprint 0: dependencies (PostgreSQL/Redis) are NOT wired yet — they report
 * honestly as pending, not as "ok". Liveness = process alive only.
 */
@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: this.config.get<string>('app.apiVersion') ?? 'v1',
    };
  }

  readiness(): ReadinessReport {
    const dbConfigured = Boolean(this.config.get<string>('database.url'));
    const redisConfigured = Boolean(this.config.get<string>('redis.url'));
    const dependencies: Record<string, DependencyStatus> = {
      postgres: {
        configured: dbConfigured,
        status: 'pending_sprint',
        note: 'PostgreSQL connection is established in Sprint 1 (DB phase). Config presence reported only.',
      },
      redis: {
        configured: redisConfigured,
        status: 'pending_sprint',
        note: 'Redis/BullMQ connection is established in the queue phase. Config presence reported only.',
      },
    };
    /* Sprint 0 readiness = process + config present; deps intentionally pending. */
    const status = 'not_ready';
    return { status, timestamp: new Date().toISOString(), version: this.config.get<string>('app.apiVersion') ?? 'v1', dependencies };
  }
}
