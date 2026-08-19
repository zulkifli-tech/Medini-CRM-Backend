import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScopeService } from '../../shared/security/scope.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { StaffRegistrationService } from './staff-registration.service';
import { PrincipalResolver } from './principal.resolver';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { PermissionGuard } from './permission.guard';
import { DbContextService } from './db-context.service';
import { AuthController } from './auth.controller';

/**
 * AuthModule — Sprint 1 Task 2 + S10 T1. Authentication + runtime authorization.
 *
 * Global guards run in order: AuthGuard (authentication → Principal) then
 * PermissionGuard (authorization → can()). Health + /auth/login + /auth/refresh
 * + /auth/register are @Public. DbContextService applies the trusted
 * per-transaction GUC context for RLS.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TokenService,
    RefreshTokenService,
    StaffRegistrationService,
    PrincipalResolver,
    AuthService,
    DbContextService,
    ScopeService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, TokenService, RefreshTokenService, PrincipalResolver, DbContextService, PasswordService],
})
export class AuthModule {}
