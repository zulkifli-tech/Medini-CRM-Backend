import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { DbContextService } from './db-context.service';
import { PasswordService } from './password.service';
import { staff } from '../../infrastructure/database/schema';
import {
  ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError,
} from '../../shared/errors/errors';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * StaffRegistrationService — HQ-controlled staff self-registration (S10 T1).
 *
 * Governance model:
 *   HQ invites (inviteStaff → status='Invited') → staff receives single-use
 *   invitation token → staff completes registration (username + password) →
 *   status='Pending' → HQ approves (activate) → 'Active' → login allowed.
 *
 * Security invariants:
 *  - No public signup: registration requires a valid, unexpired invitation token.
 *  - Staff CANNOT choose org/branch/role — those are HQ-assigned at invite time.
 *  - Passwords are Argon2id-hashed via PasswordService (never plaintext).
 *  - Invitation tokens are single-use (cleared on successful registration) and expire.
 */
@Injectable()
export class StaffRegistrationService {
  constructor(
    private readonly dbCtx: DbContextService,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Generate a single-use invitation token for an invited staff member.
   * Called by HQ after inviteStaff. Returns the raw token (to be shared
   * out-of-band, e.g. printed/WhatsApp — no notification infra in T1).
   */
  async generateInviteToken(hqPrincipal: { staffId: string; role: string; orgId: string }, staffId: string): Promise<{ token: string; expiresAt: Date }> {
    if (hqPrincipal.role !== 'hq') throw new ForbiddenError('Only HQ can generate invitation tokens');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000); /* 72h expiry */
    await this.dbCtx.runAs(hqPrincipal as never, async (tx) => {
      const row = await tx.select({ status: staff.status }).from(staff)
        .where(and(eq(staff.id, staffId), eq(staff.orgId, ORG_ID), isNull(staff.deletedAt))).limit(1);
      if (!row[0]) throw new NotFoundError('staff', staffId);
      if (row[0].status !== 'Invited') throw new ConflictError(`Staff is not in Invited status (current: ${row[0].status})`);
      await tx.update(staff).set({
        inviteToken: token,
        inviteExpiresAt: expiresAt,
        updatedAt: new Date(),
      } as never).where(eq(staff.id, staffId));
    });
    return { token, expiresAt };
  }

  /**
   * Staff self-registration: validate invite token, set username + password,
   * transition Invited → Pending. Staff CANNOT change role/branch/org.
   */
  async register(input: {
    inviteToken: string;
    name: string;
    username: string;
    password: string;
  }): Promise<{ staffId: string; status: 'Pending' }> {
    if (!input.inviteToken || !input.username || !input.password || !input.name) {
      throw new ValidationError({ _: ['inviteToken, name, username, and password are required'] });
    }
    if (input.password.length < 8) {
      throw new ValidationError({ password: ['Password must be at least 8 characters'] });
    }
    if (!/^[a-z0-9_.-]+$/.test(input.username)) {
      throw new ValidationError({ username: ['Lowercase letters, digits, _ . - only'] });
    }

    const passwordHash = await this.passwords.hash(input.password);

    /* Pre-auth path: no Principal exists yet. Use a scoped worker context so
     * RLS org-isolation applies (org is canonical single-tenant). */
    return this.dbCtx.runAsWorker(
      { orgId: ORG_ID, branchIds: [], correlationId: 'staff-registration', source: 'system_worker' },
      async (tx) => {
        const rows = await tx.select().from(staff)
          .where(and(
            eq(staff.inviteToken, input.inviteToken),
            eq(staff.orgId, ORG_ID),
            isNull(staff.deletedAt),
          )).limit(1);
        const member = rows[0];
        if (!member) throw new UnauthorizedError('Invalid or expired invitation');
        if (member.status !== 'Invited') throw new ConflictError(`Invitation already used or invalid (status: ${member.status})`);
        if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
          throw new UnauthorizedError('Invitation has expired');
        }

        /* Username uniqueness (org-scoped). */
        const existing = await tx.select({ id: staff.id }).from(staff)
          .where(and(eq(staff.orgId, ORG_ID), eq(staff.username, input.username.toLowerCase()), isNull(staff.deletedAt)))
          .limit(1);
        if (existing[0] && existing[0].id !== member.id) {
          throw new ConflictError(`Username '${input.username}' is already taken`);
        }

        /* Complete registration: set name/username/password, clear invite token,
         * transition Invited → Pending. Role/branch/org are NOT touched. */
        const updated = await tx.update(staff).set({
          name: input.name,
          username: input.username.toLowerCase(),
          passwordHash,
          status: 'Pending',
          inviteToken: null,
          inviteExpiresAt: null,
          updatedAt: new Date(),
        } as never).where(eq(staff.id, member.id)).returning({ id: staff.id });

        return { staffId: updated[0]!.id, status: 'Pending' as const };
      },
    );
  }
}
