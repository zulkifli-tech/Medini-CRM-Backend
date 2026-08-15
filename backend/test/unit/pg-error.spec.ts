import { describe, it, expect } from 'vitest';
import { toDomainError } from '@shared/errors/pg-error';
import { ConflictError } from '@shared/errors/errors';

function wrapped(code: string, constraint?: string): unknown {
  return {
    message: 'Failed query: insert ...',
    cause: { code, constraint, message: 'underlying' },
  };
}

describe('toDomainError — structured PG error mapping (GLM #7)', () => {
  it('maps patients_org_mrn_uq → 409 ConflictError "MRN already exists"', () => {
    const out = toDomainError(wrapped('23505', 'patients_org_mrn_uq'));
    expect(out).toBeInstanceOf(ConflictError);
    expect((out as ConflictError).message).toBe('MRN already exists');
    expect((out as ConflictError).statusCode).toBe(409);
  });

  it('maps patients_org_ic_uq → 409 "IC already registered"', () => {
    const out = toDomainError(wrapped('23505', 'patients_org_ic_uq'));
    expect((out as ConflictError).message).toBe('IC already registered');
  });

  it('maps appt_org_code_uq → 409 "Appointment code already exists"', () => {
    const out = toDomainError(wrapped('23505', 'appt_org_code_uq'));
    expect((out as ConflictError).message).toBe('Appointment code already exists');
  });

  it('maps unknown unique violation → generic 409', () => {
    const out = toDomainError(wrapped('23505', 'some_other_uq'));
    expect(out).toBeInstanceOf(ConflictError);
    expect((out as ConflictError).message).toBe('Duplicate record');
  });

  it('passes through non-unique errors unchanged', () => {
    const err = wrapped('23503', 'fk_violation');
    expect(toDomainError(err)).toBe(err);
  });

  it('passes through errors without a cause', () => {
    const err = new Error('plain');
    expect(toDomainError(err)).toBe(err);
  });
});
