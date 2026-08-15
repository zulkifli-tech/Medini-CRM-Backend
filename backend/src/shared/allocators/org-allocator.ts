import { sql } from 'drizzle-orm';
import { DbClient } from '../../modules/patients/infrastructure/patients.repository';

/**
 * OrgAllocator — org-safe, concurrency-safe human-code generation (Sprint 2
 * remediation #1, #2, #8). Uses a PostgreSQL named sequence per org; nextval
 * is atomic and NOT subject to RLS, so the same org always produces a
 * globally-unique MRN/APT code regardless of which branch inserts the row.
 *
 * SECURITY: the runtime role (medini_app) has NO CREATE on schema public —
 * sequences are pre-created by the admin/migration path (0005_org_sequences
 * creates the canonical org's; other orgs via the same pattern). The
 * allocator NEVER attempts DDL inside the request transaction (a failed
 * CREATE would abort the whole transaction — pg error 25P02).
 */
export class OrgAllocator {
  constructor(private readonly tx: DbClient) {}

  private seqName(prefix: 'mrn' | 'apt', orgId: string): string {
    const key = orgId.replace(/-/g, '').slice(-8).toLowerCase();
    return `medini_${prefix}_${key}`;
  }

  /** Next MRN for the org, e.g. MDN-0001. Atomic across branches/connections. */
  async nextMrn(orgId: string): Promise<string> {
    const rows = await this.tx.execute(
      sql`SELECT nextval(${sql.raw(`'${this.seqName('mrn', orgId)}'`)})::int AS n`,
    );
    const n = (rows as unknown as { rows: Array<{ n: number }> }).rows[0]!.n;
    return `MDN-${String(n).padStart(4, '0')}`;
  }

  /** Next appointment code for the org, e.g. APT-0001. */
  async nextAptCode(orgId: string): Promise<string> {
    const rows = await this.tx.execute(
      sql`SELECT nextval(${sql.raw(`'${this.seqName('apt', orgId)}'`)})::int AS n`,
    );
    const n = (rows as unknown as { rows: Array<{ n: number }> }).rows[0]!.n;
    return `APT-${String(n).padStart(4, '0')}`;
  }
}
