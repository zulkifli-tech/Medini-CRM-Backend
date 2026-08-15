import { Injectable } from '@nestjs/common';
import {
  can, PermissionContext, RoleAction,
} from '../architecture/architecture.contract';

/**
 * Authenticated principal — resolved from the JWT by the auth layer (Sprint 1+).
 * Sprint 0 defines the shape + the scope-resolution contract only.
 */
export interface Principal {
  readonly userId: string;
  readonly role: string;
  readonly orgId: string;
  readonly branchId: string | null;
  readonly doctorId: string | null;
}

/**
 * ScopeService — single place that translates a Principal into an authorization
 * decision using the locked PERMISSION_MATRIX. Server-side only.
 */
@Injectable()
export class ScopeService {
  can(principal: Principal, domain: string, action: RoleAction | string, target: { branchId?: string | null; doctorId?: string | null } = {}): boolean {
    const ctx: PermissionContext = {
      actorBranchId: principal.branchId,
      branchId: target.branchId,
      doctorId: target.doctorId,
      actorDoctorId: principal.doctorId,
    };
    return can(principal.role, domain, action, ctx);
  }
}
