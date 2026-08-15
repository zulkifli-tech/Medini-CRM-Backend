import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE } from '../../infrastructure/database/database.module';
import { Database } from '../../infrastructure/database/database';
import { staff } from '../../infrastructure/database/schema';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { PrincipalResolver } from './principal.resolver';
import { Principal } from './principal';
import { UnauthorizedError } from '../../shared/errors/errors';

/** Safe login response — NEVER includes password/hash/secrets. */
export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    staffId: string;
    username: string;
    name: string;
    role: string;
    branchId: string | null;
    doctorId: string | null;
  };
}

const ORG_ID = '00000000-0000-0000-0000-000000000001'; /* single org */

/**
 * AuthService — login flow (Part 14):
 *   credentials → find staff → verify password (timing-safe) → check status →
 *   derive Principal (role/branch/doctor from DB) → issue JWT → safe response.
 *
 * No user enumeration: unknown user and wrong password return the SAME 401
 * message, and unknown users still run a dummy verify to equalize timing.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database | null,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly principals: PrincipalResolver,
  ) {}

  async login(username: string, password: string): Promise<{ result: LoginResult; principal: Principal }> {
    if (!this.db) throw new UnauthorizedError('Authentication unavailable');

    const rows = await this.db
      .select()
      .from(staff)
      .where(and(eq(staff.orgId, ORG_ID), eq(staff.username, username)))
      .limit(1);
    const member = rows[0];

    /* Timing-safe verify (works even when member is undefined). */
    const ok = await this.passwords.verifyLogin(member?.passwordHash ?? null, password);
    if (!member || !ok) {
      throw new UnauthorizedError('Invalid username or password'); /* single message — no enumeration */
    }

    /* Account status (Part 15): suspended/deactivated cannot authenticate. */
    if (member.status !== 'Active' || member.deletedAt) {
      throw new UnauthorizedError('Invalid username or password'); /* same message — do not leak status */
    }

    /* Derive the trusted Principal from DB (role/branch/doctor). */
    const principal = await this.principals.resolve(member.id, member.orgId);
    if (!principal) throw new UnauthorizedError('Invalid username or password');

    const accessToken = this.tokens.signAccess({
      sub: principal.staffId,
      username: principal.username,
      orgId: principal.orgId,
    });

    const result: LoginResult = {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        staffId: principal.staffId,
        username: principal.username,
        name: member.name,
        role: principal.role,
        branchId: principal.branchId,
        doctorId: principal.doctorId,
      },
    };
    return { result, principal };
  }
}
