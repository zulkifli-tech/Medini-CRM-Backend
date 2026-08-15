import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './shared/logging/logger.module';
import { AuditModule } from './shared/audit/audit.module';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';
import { GlobalExceptionFilter } from './shared/errors/global-exception.filter';
import { ScopeService } from './shared/security/scope.service';
import { HealthModule } from './infrastructure/health/health.module';
import { RootController } from './root.controller';

/**
 * Root application module — Sprint 0 Foundation.
 * Domain modules (patients/appointments/...) are registered in later sprints.
 * Correlation is handled by middleware (main.ts) so it covers 404s/errors too.
 */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    AuditModule,
    IdempotencyModule,
    HealthModule,
  ],
  controllers: [RootController],
  providers: [
    ScopeService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [ScopeService],
})
export class AppModule {}
