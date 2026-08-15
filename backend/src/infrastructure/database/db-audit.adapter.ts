import { Injectable } from '@nestjs/common';
import { AuditPort, AuditEvent } from '../../shared/audit/audit.port';
import { Database } from './database';
import { auditLog } from './schema';

/**
 * Persistent audit adapter (PostgreSQL) — append-only audit_log.
 * Swaps the Sprint 0 in-memory adapter without changing the AuditService interface.
 */
@Injectable()
export class DbAuditAdapter extends AuditPort {
  constructor(private readonly db: Database) {
    super();
  }

  async record(event: AuditEvent): Promise<void> {
    await this.db.insert(auditLog).values({
      orgId: event.orgId,
      branchId: event.branchId,
      actorId: event.actorId,
      actorRole: event.actorRole,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      before: event.before ?? null,
      after: event.after ?? null,
      source: event.source,
      correlationId: event.correlationId,
      createdAt: new Date(event.timestamp),
    });
  }
}
