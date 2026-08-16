import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbContextService } from '../../../core/auth/db-context.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { Principal } from '../../../core/auth/principal';
import {
  ValidationError, ForbiddenError, NotFoundError, ConflictError,
} from '../../../shared/errors/errors';
import { FinanceIntegrationRepository } from '../infrastructure/finance-integration.repository';
import { OrgAllocator } from '../../../shared/allocators/org-allocator';
import {
  AccountingPort, UnconfiguredAccountingAdapter,
} from '../../../shared/ports/accounting.port';
import {
  ExternalInvoiceRef, BukkuSyncRecord, ReconciliationRecord,
} from '../../../infrastructure/database/schema';

const moneySchema = z.string().regex(/^\d+(\.\d{1,4})?$/, 'amount must be a non-negative decimal');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const createExternalRefSchema = z.object({
  branchId: z.string().uuid(),
  externalInvoiceNumber: z.string().trim().min(1).max(128),
  sourceSystem: z.string().trim().min(1).max(32),
  amount: moneySchema,
  invoiceDate: dateSchema,
  patientId: z.string().uuid().nullish(),
  treatmentCostId: z.string().uuid().nullish(),
  status: z.string().max(32).nullish(),
  externalRef: z.string().max(128).nullish(),
  notes: z.string().max(512).nullish(),
});

const enqueueSyncSchema = z.object({
  entityType: z.string().trim().min(1).max(64),
  entityId: z.string().uuid(),
});

const resolveReconciliationSchema = z.object({
  resolution: z.enum(['matched', 'resolved']),
  notes: z.string().max(2000).nullish(),
});

/**
 * FinanceIntegrationService — S4-T4 Bukku integration boundary.
 *
 * CRM is NOT Bukku. This service manages the sync QUEUE + reconciliation
 * metadata and delegates any real transport to the AccountingPort. The default
 * port (UnconfiguredAccountingAdapter) returns an HONEST "adapter unavailable"
 * state — no fabricated sync. Real Bukku HTTP adapter = Sprint 8.
 *
 * Sync + reconciliation are HQ-only (RLS + service). External invoice refs are
 * hq/bm. Idempotency: idempotency_key `source:entity:op:version` unique; one
 * sync record per (org, entity_type, entity_id). No blind overwrite — conflicts
 * are explicit + auditable.
 */
@Injectable()
export class FinanceIntegrationService {
  private readonly accounting: AccountingPort;

  constructor(
    private readonly dbCtx: DbContextService,
    private readonly repo: FinanceIntegrationRepository,
    private readonly audit: AuditService,
  ) {
    /* S4 boundary: real adapter not wired until Sprint 8. */
    this.accounting = new UnconfiguredAccountingAdapter();
  }

  private assertHq(p: Principal): void {
    if (p.role !== 'hq') throw new ForbiddenError('Bukku sync / reconciliation is HQ-only');
  }

  private assertCanAccess(p: Principal): void {
    if (p.role !== 'hq' && p.role !== 'branch_manager') {
      throw new ForbiddenError('Finance access is restricted to HQ and branch managers');
    }
  }

  private resolveBranch(p: Principal, requested: string): string {
    if (p.role === 'hq') return requested;
    if (p.branchId && requested !== p.branchId) {
      throw new ForbiddenError('Branch manager cannot write outside own branch');
    }
    return requested;
  }

  private scopedBranch(p: Principal, requested?: string | null): string | null {
    if (p.role === 'hq') return requested ?? null;
    return p.branchId;
  }

  private validation(parsed: { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } }) {
    return new ValidationError(
      Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), [i.message]])),
    );
  }

  /* ================= EXTERNAL INVOICE REFERENCES ================= */
  async recordExternalInvoice(principal: Principal, raw: unknown): Promise<ExternalInvoiceRef> {
    this.assertCanAccess(principal);
    const parsed = createExternalRefSchema.safeParse(raw);
    if (!parsed.success) throw this.validation(parsed);
    const input = parsed.data;
    const branchId = this.resolveBranch(principal, input.branchId);

    return this.dbCtx.runAs(principal, async (tx) => {
      /* Idempotency: one ref per (org, source, external number). */
      const dup = await this.repo.findExternalRefByNumber(tx, principal.orgId, input.sourceSystem, input.externalInvoiceNumber);
      if (dup) throw new ConflictError('External invoice already recorded for this source system');
      const refCode = await new OrgAllocator(tx).nextExternalRefCode(principal.orgId);
      const ref = await this.repo.createExternalRef(tx, principal.orgId, { ...input, branchId, refCode });
      await this.audit.record({
        actorId: principal.staffId, actorRole: principal.role,
        action: 'external_invoice_recorded', entity: 'external_invoice_refs', entityId: ref.id,
        orgId: principal.orgId, branchId, source: 'api',
        after: { code: ref.refCode, externalNumber: ref.externalInvoiceNumber, source: ref.sourceSystem, amount: ref.amount },
      }, tx);
      return ref;
    });
  }

  async listExternalInvoices(principal: Principal, q: { branchId?: string; sourceSystem?: string; limit?: number; offset?: number }): Promise<ExternalInvoiceRef[]> {
    this.assertCanAccess(principal);
    const branchId = this.scopedBranch(principal, q.branchId ?? null);
    return this.dbCtx.runAs(principal, async (tx) =>
      this.repo.listExternalRefs(tx, principal.orgId, { ...q, branchId }));
  }

  /* ================= BUKKU SYNC BOUNDARY ================= */
  /**
   * Enqueue a finance record for Bukku sync. Idempotent (one record per entity;
   * idempotency key unique). Does NOT call the real API — marks 'queued'. The
   * worker/transport is Sprint 8.
   */
  async enqueueSync(principal: Principal, raw: unknown): Promise<BukkuSyncRecord> {
    this.assertHq(principal);
    const parsed = enqueueSyncSchema.safeParse(raw);
    if (!parsed.success) throw this.validation(parsed);
    const input = parsed.data;

    return this.dbCtx.runAs(principal, async (tx) => {
      const existing = await this.repo.findSyncByEntity(tx, principal.orgId, input.entityType, input.entityId);
      if (existing) return existing; /* idempotent — already enqueued */
      const idempotencyKey = `medini:${input.entityType}:${input.entityId}:push:v1`;
      const rec = await this.repo.enqueueSync(tx, principal.orgId, { ...input, idempotencyKey });
      await this.audit.record({
        actorId: principal.staffId, actorRole: principal.role,
        action: 'bukku_sync_enqueued', entity: 'bukku_sync_records', entityId: rec.id,
        orgId: principal.orgId, branchId: null, source: 'api',
        after: { entityType: rec.entityType, entityId: rec.entityId, status: rec.syncStatus },
      }, tx);
      return rec;
    });
  }

  /**
   * Attempt to push a queued record via the AccountingPort. With the S4
   * unconfigured adapter this returns an HONEST error state (adapter
   * unavailable) and marks the record 'error' — never a fabricated 'synced'.
   */
  async pushSync(principal: Principal, syncId: string): Promise<BukkuSyncRecord> {
    this.assertHq(principal);
    return this.dbCtx.runAs(principal, async (tx) => {
      const all = await this.repo.listSync(tx, principal.orgId, { limit: 500 });
      const rec = all.find((r) => r.id === syncId);
      if (!rec) throw new NotFoundError('BukkuSyncRecord', syncId);

      const result = await this.accounting.push({
        entityType: rec.entityType,
        entityId: rec.entityId,
        idempotencyKey: rec.idempotencyKey,
        payload: {},
        version: rec.version,
      });

      const updated = await this.repo.updateSyncStatus(tx, syncId, {
        status: result.ok ? 'synced' : 'error',
        bukkuId: result.externalId ?? null,
        syncError: result.ok ? null : (result.error ?? 'sync failed'),
      });
      if (!updated) throw new NotFoundError('BukkuSyncRecord', syncId);
      await this.audit.record({
        actorId: principal.staffId, actorRole: principal.role,
        action: result.ok ? 'bukku_sync_pushed' : 'bukku_sync_failed',
        entity: 'bukku_sync_records', entityId: syncId,
        orgId: principal.orgId, branchId: null, source: 'api',
        before: { status: rec.syncStatus }, after: { status: updated.syncStatus, error: updated.syncError },
      }, tx);
      return updated;
    });
  }

  async listSync(principal: Principal, q: { status?: string; entityType?: string; limit?: number; offset?: number }): Promise<BukkuSyncRecord[]> {
    this.assertHq(principal);
    return this.dbCtx.runAs(principal, async (tx) =>
      this.repo.listSync(tx, principal.orgId, q));
  }

  /** Sync status summary for the frontend dashboard. */
  async syncStatus(principal: Principal): Promise<{
    configured: boolean; pending: number; queued: number; synced: number; error: number; conflict: number;
  }> {
    this.assertHq(principal);
    return this.dbCtx.runAs(principal, async (tx) => {
      const all = await this.repo.listSync(tx, principal.orgId, { limit: 500 });
      const count = (s: string) => all.filter((r) => r.syncStatus === s).length;
      return {
        configured: this.accounting.isConfigured(),
        pending: count('pending'),
        queued: count('queued'),
        synced: count('synced'),
        error: count('error'),
        conflict: count('conflict'),
      };
    });
  }

  /* ================= RECONCILIATION ================= */
  async listReconciliation(principal: Principal, q: { status?: string; limit?: number; offset?: number }): Promise<ReconciliationRecord[]> {
    this.assertHq(principal);
    return this.dbCtx.runAs(principal, async (tx) =>
      this.repo.listReconciliation(tx, principal.orgId, q));
  }

  /** Resolve a reconciliation conflict (HQ only, explicit + auditable). */
  async resolveReconciliation(principal: Principal, id: string, raw: unknown): Promise<ReconciliationRecord> {
    this.assertHq(principal);
    const parsed = resolveReconciliationSchema.safeParse(raw);
    if (!parsed.success) throw this.validation(parsed);
    const input = parsed.data;

    return this.dbCtx.runAs(principal, async (tx) => {
      const all = await this.repo.listReconciliation(tx, principal.orgId, { limit: 500 });
      const rec = all.find((r) => r.id === id);
      if (!rec) throw new NotFoundError('ReconciliationRecord', id);
      if (rec.reconciliationStatus === 'resolved') return rec;
      const updated = await this.repo.resolveReconciliation(tx, id, {
        status: input.resolution,
        resolvedBy: principal.staffId,
        notes: input.notes ?? null,
      });
      if (!updated) throw new NotFoundError('ReconciliationRecord', id);
      await this.audit.record({
        actorId: principal.staffId, actorRole: principal.role,
        action: 'reconciliation_resolved', entity: 'reconciliation_records', entityId: id,
        orgId: principal.orgId, branchId: null, source: 'api',
        before: { status: rec.reconciliationStatus }, after: { status: updated.reconciliationStatus, notes: input.notes },
      }, tx);
      return updated;
    });
  }
}
