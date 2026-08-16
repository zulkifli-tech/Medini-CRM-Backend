import { ConflictError } from './errors';

/**
 * Structured PostgreSQL error handling (Sprint 2 remediation #7).
 *
 * Drizzle wraps pg errors: `err.cause` carries the real error with
 * `code` (SQLSTATE) and `constraint` (constraint name). String-matching the
 * wrapped message is fragile — map structured metadata instead.
 */

export interface PgErrorLike {
  code?: string;
  constraint?: string;
  message?: string;
}

/** Known unique constraints → human/business message. */
const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  patients_org_mrn_uq: 'MRN already exists',
  patients_org_ic_uq: 'IC already registered',
  appt_org_code_uq: 'Appointment code already exists',
  /* Sprint 2A T2 — payor master data (migration 0006 constraints) */
  panel_companies_org_code_uq: 'Panel code already exists',
  panel_companies_org_name_uq: 'Panel name already exists',
  insurance_companies_org_code_uq: 'Insurance code already exists',
  insurance_companies_org_name_uq: 'Insurance name already exists',
  /* Sprint 3 (S3-A) — clinical domain (migrations 0007/0008 constraints) */
  encounters_org_code_uq: 'Encounter code already exists',
  treatment_plans_org_code_uq: 'Treatment plan code already exists',
  treatment_catalog_org_code_uq: 'Treatment code already exists',
  treatment_catalog_org_name_uq: 'Treatment name already exists',
  tooth_records_enc_tooth_uq: 'Tooth record already exists for this encounter',
  treatment_sessions_plan_no_uq: 'Session number already exists for this plan',
  consent_templates_title_version_uq: 'Consent template version already exists',
};

/**
 * Map a thrown value to a domain error when it is a recognizable PostgreSQL
 * violation; otherwise return the value unchanged.
 */
export function toDomainError(e: unknown): unknown {
  const cause = (e as { cause?: PgErrorLike }).cause;
  if (!cause || typeof cause.code !== 'string') return e;

  /* 23505 = unique_violation */
  if (cause.code === '23505') {
    const message = cause.constraint
      ? UNIQUE_CONSTRAINT_MESSAGES[cause.constraint]
      : undefined;
    return new ConflictError(message ?? 'Duplicate record');
  }
  return e;
}
