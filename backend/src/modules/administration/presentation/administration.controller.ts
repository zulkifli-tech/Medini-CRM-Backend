import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { RequirePermission } from '../../../core/auth/decorators';
import { AuthedRequest } from '../../../core/auth/auth.guard';
import { AdministrationService } from '../application/administration.service';

/**
 * Administration REST API v1 (Sprint 7 T1) — governance control plane.
 * RBAC via canonical matrix: admin = HQ ALL, every other role = NONE. Enforced
 * by PermissionGuard (route) + service HQ-check (defense-in-depth) + RLS (DB).
 * Identity reuses S1 staff/role_assignments — no parallel authz system.
 */
@Controller({ path: 'admin', version: '1' })
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}

  /* ---------- organization + branches ---------- */
  @Get('organization') @RequirePermission('admin', 'view') getOrg(@Req() req: AuthedRequest) { return this.service.getOrganization(req.principal!); }
  @Get('branches') @RequirePermission('admin', 'view') listBranches(@Req() req: AuthedRequest) { return this.service.listBranches(req.principal!); }

  /* ---------- staff directory + lifecycle ---------- */
  @Get('staff') @RequirePermission('admin', 'view') listStaff(@Req() req: AuthedRequest, @Query() query: Record<string, unknown>) { return this.service.listStaff(req.principal!, query); }
  @Post('staff') @RequirePermission('admin', 'create') invite(@Req() req: AuthedRequest, @Body() body: unknown) { return this.service.inviteStaff(req.principal!, body); }
  @Get('staff/:id') @RequirePermission('admin', 'view') getStaff(@Req() req: AuthedRequest, @Param('id') id: string) { return this.service.getStaff(req.principal!, id); }
  @Get('staff/:id/role-history') @RequirePermission('admin', 'view') roleHistory(@Req() req: AuthedRequest, @Param('id') id: string) { return this.service.getRoleHistory(req.principal!, id); }

  @Post('staff/:id/activate') @RequirePermission('admin', 'edit') activate(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.transitionStaff(req.principal!, id, 'activate', body); }
  @Post('staff/:id/suspend') @RequirePermission('admin', 'edit') suspend(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.transitionStaff(req.principal!, id, 'suspend', body); }
  @Post('staff/:id/deactivate') @RequirePermission('admin', 'edit') deactivate(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.transitionStaff(req.principal!, id, 'deactivate', body); }
  @Post('staff/:id/reactivate') @RequirePermission('admin', 'edit') reactivate(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.transitionStaff(req.principal!, id, 'reactivate', body); }

  @Post('staff/:id/assign-role') @RequirePermission('admin', 'edit') assignRole(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.assignRole(req.principal!, id, body); }
}
