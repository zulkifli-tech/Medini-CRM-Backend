/**
 * Audit abstraction — interface + in-memory reference implementation.
 * The persistent (PostgreSQL) adapter is implemented in the DB sprint (Sprint 1).
 * Sprint 0 establishes the contract + behavior only.
 */

export type AuditSource = 'api' | 'worker' | 'integration' | 'system';

export interface AuditEvent {
  readonly actorId: string;
  readonly actorRole: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly orgId: string;
  readonly branchId: string | null;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
  readonly source: AuditSource;
  readonly correlationId: string;
  readonly timestamp: string; // ISO 8601
}

/** Port — implemented by a persistent adapter later. */
export abstract class AuditPort {
  abstract record(event: AuditEvent): Promise<void> | void;
}
