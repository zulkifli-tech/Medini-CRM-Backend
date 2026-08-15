import { Global, Module } from '@nestjs/common';
import { AuditService, InMemoryAuditAdapter, AUDIT_PORT } from './audit.service';

@Global()
@Module({
  providers: [InMemoryAuditAdapter, { provide: AUDIT_PORT, useExisting: InMemoryAuditAdapter }, AuditService],
  exports: [AuditService, AUDIT_PORT],
})
export class AuditModule {}
