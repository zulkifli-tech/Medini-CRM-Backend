import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerRequest } from '@nestjs/throttler';

/**
 * AuthThrottlerGuard — S10-05 rate limiting on the pre-auth attack surface.
 *
 * Scope: ONLY the @Public() auth endpoints (login / refresh / register).
 * Authenticated business routes are unaffected — shouldSkip() returns true
 * for any route without an explicit @Throttle(...) named-limit override.
 *
 * Tracker identity: client IP. We sit behind the Docker edge proxy in
 * production, so X-Forwarded-For (leftmost entry) is used when present.
 * The value is only a rate-limit bucket key — never authenticated as identity.
 *
 * Named limits (see AuthController decorators):
 *   auth-login    : 5 requests / minute / IP
 *   auth-refresh  : 10 requests / minute / IP
 *   auth-register : 3 requests / minute / IP
 *
 * Tests/dev: rate limiting stays ACTIVE (the guard is the behaviour under
 * test in S10-05); E2E tests that need many rapid calls opt out explicitly
 * via @SkipThrottle(). Production and test behaviour are identical.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  /** Only throttle routes that declare a named throttler via @Throttle(). */
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    /* canActivate() iterates this.throttlers (the module-level named list).
     * A route without a @Throttle override inherits the module default —
     * so we register the guard with NO default throttler; every named
     * limit comes from the route decorator. Routes with no decorator
     * therefore skip entirely. The named overrides only apply when the
     * route decorator defines them (getAllAndOverride returns undefined
     * otherwise), so we skip routes carrying no THROTTLER_LIMIT metadata. */
    const handler = _context.getHandler();
    const classRef = _context.getClass();
    for (const named of this.throttlers) {
      const limit = this.reflector.getAllAndOverride<number | undefined>(
        `THROTTLER:LIMIT${named.name}`,
        [handler, classRef],
      );
      if (limit !== undefined) return false; /* route opts in → throttle it */
    }
    return true; /* no @Throttle on this route → skip */
  }

  /** IP-based tracker; proxy-aware, prefix per-request for bucketing. */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const xff = (req.headers?.['x-forwarded-for'] ?? '') as string;
    const ip = (xff.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
    return `auth:${ip}`;
  }

  /** v6 hook: pass through to the base implementation. Exposed for clarity. */
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest(requestProps);
  }
}
