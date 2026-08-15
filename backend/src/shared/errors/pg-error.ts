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
