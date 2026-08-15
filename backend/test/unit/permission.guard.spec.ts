import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ScopeService } from '@shared/security/scope.service';
import { PermissionGuard } from '@core/auth/permission.guard';
import { ForbiddenError, UnauthorizedError } from '@shared/errors/errors';
import type { Principal } from '@core/auth/principal';

/** Minimal HTTP context fake for guard unit tests. */
interface FakeReq { principal?: Principal; params: Record<string, string | null | undefined>; query: Record<string, string | null | undefined>; body: Record<string, string | null | undefined> }
function ctx(principal: Principal | undefined, target: { branchId?: string | null; doctorId?: string | null }, required?: { domain: string; action: string }) {
  const reflector = new Reflector();
  reflector.getAllAndOverride = (() => required ?? undefined) as never;
  const scope = new ScopeService();
  const guard = new PermissionGuard(reflector, scope);
  const req: FakeReq = { principal, params: {}, query: {}, body: {} };
  if (target.branchId !== undefined) req.params.branchId = target.branchId;
  if (target.doctorId !== undefined) req.params.doctorId = target.doctorId;
  const execCtx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard, ctx: execCtx };
}

const hq: Principal = { staffId: 's1', username: 'hq', role: 'hq', orgId: 'org-1', branchId: null, doctorId: null };
const bm: Principal = { staffId: 's2', username: 'manager', role: 'branch_manager', orgId: 'org-1', branchId: 'sentosa', doctorId: null };
const doctor: Principal = { staffId: 's3', username: 'doctor', role: 'doctor', orgId: 'org-1', branchId: 'gp', doctorId: 'dr-aina' };

describe('PermissionGuard (authorization enforcement)', () => {
  it('allows hq on finance.view (scope=all)', () => {
    const { guard, ctx: c } = ctx(hq, {}, { domain: 'finance', action: 'view' });
    expect(guard.canActivate(c)).toBe(true);
  });

  it('denies branch_manager on cross-branch finance.submit (403)', () => {
    const { guard, ctx: c } = ctx(bm, { branchId: 'pearl' }, { domain: 'finance', action: 'submit' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenError);
  });

  it('allows branch_manager on own-branch finance.submit', () => {
    const { guard, ctx: c } = ctx(bm, { branchId: 'sentosa' }, { domain: 'finance', action: 'submit' });
    expect(guard.canActivate(c)).toBe(true);
  });

  it('denies branch_manager when target branchId is missing (fail-closed)', () => {
    const { guard, ctx: c } = ctx(bm, { branchId: null }, { domain: 'finance', action: 'submit' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenError);
  });

  it('denies doctor on cross-doctor clinical.create (403)', () => {
    const { guard, ctx: c } = ctx(doctor, { branchId: 'gp', doctorId: 'dr-mei' }, { domain: 'clinical', action: 'create' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenError);
  });

  it('denies doctor when doctor context missing (fail-closed)', () => {
    const { guard, ctx: c } = ctx(doctor, { branchId: 'gp', doctorId: null }, { domain: 'clinical', action: 'create' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenError);
  });

  it('denies unknown domain (403)', () => {
    const { guard, ctx: c } = ctx(hq, {}, { domain: 'nonexistent', action: 'view' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenError);
  });

  it('throws 401 when no principal attached (guard runs before auth)', () => {
    const { guard, ctx: c } = ctx(undefined, {}, { domain: 'finance', action: 'view' });
    expect(() => guard.canActivate(c)).toThrow(UnauthorizedError);
  });

  it('passes through routes with no permission metadata (auth-only)', () => {
    const { guard, ctx: c } = ctx(bm, {}, undefined);
    expect(guard.canActivate(c)).toBe(true);
  });
});
