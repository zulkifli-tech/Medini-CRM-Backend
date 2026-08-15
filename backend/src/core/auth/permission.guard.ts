import {
  Injectable, CanActivate, ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopeService } from '../../shared/security/scope.service';
import { PERMISSION_KEY, RequiredPermission } from './decorators';
import { AuthedRequest } from './auth.guard';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/errors';

/**
 * PermissionGuard — central authorization enforcement (Part 7/8).
 *
 * Runs AFTER AuthGuard (which attaches the Principal). Reads the route's
 * @RequirePermission(domain, action) metadata and calls ScopeService → can().
 * Developers declare permission once on the route; they never hand-roll checks.
 *
 * Fail-closed (Part 9): unknown role/domain/action and missing branch/doctor
 * context all DENY via the locked can() contract. Target scope (branch/doctor)
 * is taken from validated request params/query — never trusted blindly: the
 * can() matrix already enforces that a non-HQ actor's target must equal the
 * actor's own branch/doctor, so a forged foreign branchId is denied here.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scope: ScopeService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; /* no permission metadata → auth-only route */

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;
    if (!principal) throw new UnauthorizedError('Authentication required');

    /* Target context from request (params/query/body). The can() contract
     * enforces scope: a branch-scoped actor targeting a foreign branch is
     * DENIED here. Missing target context → DENY (fail-closed). */
    const target = {
      branchId: this.pick(req, 'branchId'),
      doctorId: this.pick(req, 'doctorId'),
    };

    const allowed = this.scope.can(principal, required.domain, required.action, target);
    if (!allowed) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
    return true;
  }

  private pick(req: AuthedRequest, key: string): string | null {
    const fromParams = (req.params as Record<string, string> | undefined)?.[key];
    const fromQuery = (req.query as Record<string, string> | undefined)?.[key];
    const fromBody = (req.body as Record<string, string> | undefined)?.[key];
    return fromParams ?? fromQuery ?? fromBody ?? null;
  }
}
