import {
  Controller, Post, Get, Body, Req, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { AuthService, LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public, RequirePermission } from './decorators';
import { AuthedRequest } from './auth.guard';
import { AuditService } from '../../shared/audit/audit.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Auth controller — login + a protected self endpoint.
 * /auth/login is @Public (pre-auth). /auth/me requires a valid token and
 * returns the DB-derived Principal (proves role is backend-derived, not
 * client-supplied). /auth/can-finance is a demo of @RequirePermission.
 */
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Returns a Bearer access token + safe user payload.' })
  async login(@Body() dto: LoginDto): Promise<LoginResult> {
    try {
      const { result, principal } = await this.auth.login(dto.username, dto.password);
      /* Audit login success — never log the password or token. */
      await this.safeAudit({
        actorId: principal.staffId, actorRole: principal.role, action: 'auth_login_success',
        entity: 'staff', entityId: principal.staffId, branchId: principal.branchId,
      });
      return result;
    } catch (e) {
      /* Audit login failure — generic, no username/password detail leaked. */
      await this.safeAudit({
        actorId: ORG_ID, actorRole: 'anonymous', action: 'auth_login_failure',
        entity: 'staff', entityId: 'unknown', branchId: null,
      });
      throw e;
    }
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    const p = req.principal!;
    return {
      data: {
        staffId: p.staffId,
        username: p.username,
        role: p.role,
        orgId: p.orgId,
        branchId: p.branchId,
        doctorId: p.doctorId,
      },
    };
  }

  /* Demo of @RequirePermission — finance view, branch scope. Only roles whose
   * matrix grants finance.view pass; the rest get 403. */
  @Get('can-finance')
  @RequirePermission('finance', 'view')
  canFinance(@Req() req: AuthedRequest) {
    return { data: { allowed: true, role: req.principal!.role } };
  }

  private async safeAudit(e: {
    actorId: string; actorRole: string; action: string; entity: string;
    entityId: string; branchId: string | null;
  }): Promise<void> {
    try {
      await this.audit.record({
        actorId: e.actorId, actorRole: e.actorRole, action: e.action,
        entity: e.entity, entityId: e.entityId, orgId: ORG_ID, branchId: e.branchId,
        source: 'api',
      });
    } catch (err) {
      /* audit failure must not break auth; log (no secrets) and continue */
      this.logger.warn(`audit record failed: ${(err as Error).message}`);
    }
  }
}
