import { Injectable, Inject } from '@nestjs/common';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { DATABASE } from '../../infrastructure/database/database.module';
import { Database } from '../../infrastructure/database/database';
import { DbClient } from '../../modules/patients/infrastructure/patients.repository';
import { patients, patientRelationships, appointments } from '../../infrastructure/database/schema';

/**
 * PatientsReadPort — sanctioned CROSS-MODULE read boundary for the patients
 * domain. Lives in shared (not in the patients module) so that other modules
 * can depend on it without violating module-infra boundaries. It operates on
 * a transaction passed by the caller (already inside runAs() so RLS applies).
 * It NEVER writes.
 */
@Injectable()
export class PatientsReadPort {
  constructor(@Inject(DATABASE) private readonly db: Database | null) {}

  private requireDb(): Database {
    if (!this.db) throw new Error('Database not configured');
    return this.db;
  }

  async getPatientById(tx: DbClient, orgId: string, id: string) {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.orgId, orgId), eq(patients.id, id), isNull(patients.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async countPatients(tx: DbClient, orgId: string, branchId: string | null): Promise<number> {
    const conds = [
      eq(patients.orgId, orgId),
      isNull(patients.deletedAt),
    ];
    if (branchId) conds.push(eq(patients.branchId, branchId));
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(patients)
      .where(and(...conds));
    return rows[0]?.n ?? 0;
  }

  /** Doctor↔patient linkage via appointments (own-patients scope helper). */
  async doctorLinkedToPatient(
    tx: DbClient,
    orgId: string,
    doctorId: string,
    patientId: string,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.orgId, orgId),
          eq(appointments.doctorId, doctorId),
          eq(appointments.patientId, patientId),
          isNull(appointments.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Count relationships for a patient (dashboard context). */
  async countRelationships(tx: DbClient, orgId: string, patientId: string): Promise<number> {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(patientRelationships)
      .where(eq(patientRelationships.patientId, patientId));
    return rows[0]?.n ?? 0;
  }
}
