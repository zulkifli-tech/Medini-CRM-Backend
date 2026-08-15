import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { users, auditLogs, type Role, type User } from "../db/schema";
import { publicQuery } from "./middleware";

// ---------------------------------------------------------------------------
// Password hashing (scrypt, salted)
// ---------------------------------------------------------------------------
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pw, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---------------------------------------------------------------------------
// Stateless session tokens (HMAC-signed)
// ---------------------------------------------------------------------------
const secret = () => process.env.APP_SECRET || "medini-dev-secret";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const SESSION_COOKIE = "medini_session";

export function signSession(userId: number): string {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifySession(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [userId, expiry, sig] = decoded.split(".");
    if (!userId || !expiry || !sig) return null;
    const expected = createHmac("sha256", secret()).update(`${userId}.${expiry}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Number(expiry) < Date.now()) return null;
    return Number(userId);
  } catch {
    return null;
  }
}

export function setSessionCookie(resHeaders: Headers, token: string) {
  resHeaders.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
  );
}

export function clearSessionCookie(resHeaders: Headers) {
  resHeaders.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------------------------------------------------------------------------
// Resolve user from request
// ---------------------------------------------------------------------------
export async function getSessionUser(req: Request): Promise<User | null> {
  // Bearer token first (immune to third-party cookie blocking in iframes),
  // then fall back to the session cookie.
  let token: string | null = null;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7).trim();
  } else {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    token = match ? decodeURIComponent(match[1]) : null;
  }
  if (!token) return null;
  const userId = verifySession(token);
  if (!userId) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) return null;
  return user;
}

// ---------------------------------------------------------------------------
// RBAC procedures
// ---------------------------------------------------------------------------
export type AuthedUser = User;

export const authedProc = publicQuery.use(async ({ ctx, next }) => {
  const user = await getSessionUser(ctx.req);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi tamat. Sila log masuk semula." });
  return next({ ctx: { ...ctx, user } });
});

export const roleProc = (allowed: Role[]) =>
  authedProc.use(async ({ ctx, next }) => {
    if (!allowed.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Anda tidak mempunyai kebenaran untuk tindakan ini." });
    }
    return next({ ctx });
  });

// ---------------------------------------------------------------------------
// Permission matrix (module -> action -> roles)
// ---------------------------------------------------------------------------
export type PermAction = "view" | "create" | "edit" | "delete" | "approve" | "export" | "print" | "assign";
export const modules = [
  "dashboard", "patients", "appointments", "clinical", "documents", "finance",
  "reports", "marketing", "operations", "whatsapp", "ai", "administration", "settings",
] as const;
export type Module = (typeof modules)[number];

export const permissionMatrix: Record<Module, Record<PermAction, Role[]>> = {
  dashboard:      { view: ["hq", "branch_manager", "branch_admin", "doctor"], create: [], edit: [], delete: [], approve: [], export: ["hq", "branch_manager"], print: ["hq", "branch_manager"], assign: [] },
  patients:       { view: ["hq", "branch_manager", "branch_admin", "doctor"], create: ["hq", "branch_manager", "branch_admin"], edit: ["hq", "branch_manager", "branch_admin"], delete: ["hq"], approve: [], export: ["hq", "branch_manager"], print: ["hq", "branch_manager", "branch_admin"], assign: ["hq", "branch_manager"] },
  appointments:   { view: ["hq", "branch_manager", "branch_admin", "doctor"], create: ["hq", "branch_manager", "branch_admin"], edit: ["hq", "branch_manager", "branch_admin"], delete: ["hq", "branch_manager"], approve: [], export: ["hq", "branch_manager"], print: ["hq", "branch_manager", "branch_admin"], assign: ["hq", "branch_manager", "branch_admin"] },
  clinical:       { view: ["hq", "branch_manager", "doctor"], create: ["doctor"], edit: ["doctor"], delete: ["hq"], approve: ["hq"], export: ["hq"], print: ["hq", "doctor"], assign: [] },
  documents:      { view: ["hq", "branch_manager", "branch_admin", "doctor"], create: ["hq", "branch_manager", "branch_admin", "doctor"], edit: ["hq", "branch_manager", "doctor"], delete: ["hq"], approve: [], export: ["hq", "branch_manager"], print: ["hq", "branch_manager", "doctor"], assign: [] },
  finance:        { view: ["hq", "branch_manager"], create: ["hq", "branch_manager"], edit: ["hq", "branch_manager"], delete: ["hq"], approve: ["hq", "branch_manager"], export: ["hq", "branch_manager"], print: ["hq", "branch_manager"], assign: [] },
  reports:        { view: ["hq", "branch_manager"], create: [], edit: [], delete: [], approve: [], export: ["hq", "branch_manager"], print: ["hq", "branch_manager"], assign: [] },
  marketing:      { view: ["hq", "branch_manager"], create: ["hq"], edit: ["hq"], delete: ["hq"], approve: ["hq"], export: ["hq"], print: [], assign: ["hq"] },
  operations:     { view: ["hq", "branch_manager", "branch_admin"], create: ["hq", "branch_manager"], edit: ["hq", "branch_manager"], delete: ["hq"], approve: ["hq"], export: ["hq"], print: ["hq", "branch_manager"], assign: ["hq", "branch_manager"] },
  whatsapp:       { view: ["hq", "branch_manager", "branch_admin"], create: ["hq", "branch_manager", "branch_admin"], edit: ["hq", "branch_manager", "branch_admin"], delete: ["hq"], approve: [], export: ["hq"], print: [], assign: ["hq", "branch_manager"] },
  ai:             { view: ["hq", "branch_manager", "branch_admin", "doctor"], create: ["hq"], edit: ["hq"], delete: ["hq"], approve: ["hq"], export: ["hq"], print: [], assign: ["hq"] },
  administration: { view: ["hq"], create: ["hq"], edit: ["hq"], delete: ["hq"], approve: ["hq"], export: ["hq"], print: [], assign: ["hq"] },
  settings:       { view: ["hq", "branch_manager", "branch_admin", "doctor"], create: ["hq"], edit: ["hq", "branch_manager"], delete: ["hq"], approve: [], export: [], print: [], assign: [] },
};

export function can(user: User, module: Module, action: PermAction): boolean {
  return permissionMatrix[module]?.[action]?.includes(user.role) ?? false;
}

export const permProc = (module: Module, action: PermAction) =>
  authedProc.use(async ({ ctx, next }) => {
    if (!can(ctx.user, module, action)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Tiada kebenaran: ${module}.${action}` });
    }
    return next({ ctx });
  });

// ---------------------------------------------------------------------------
// Branch scoping — HQ may pick any branch, others are locked to their own
// ---------------------------------------------------------------------------
export function scopeBranch(user: User, requested?: number | null): number | null {
  if (user.role === "hq") return requested ?? null; // null = all branches
  return user.branchId!;
}

// ---------------------------------------------------------------------------
// Financial truth isolation (D-026 / Phase 3.1 §18)
// Only HQ and Branch Manager may receive financial aggregates (revenue,
// outstanding, collection, claims). Receptionist (branch_admin) and Doctor
// must NEVER receive these fields — the server strips them from responses.
// ---------------------------------------------------------------------------
export function canViewFinancialTruth(user: User): boolean {
  return user.role === "hq" || user.role === "branch_manager";
}

/** Keys that carry financial truth inside dashboard.stats responses. */
export const FINANCIAL_STAT_KEYS = [
  "revenueToday", "revenueMonth", "trend", "outstanding", "momPct",
  "claimsByStatus", "collection7d",
] as const;

/**
 * Return a copy of a dashboard stats payload with financial-truth fields
 * removed when the user's role is not entitled to them. Idempotent.
 */
export function stripFinancialFields<T extends Record<string, any>>(user: User, payload: T): T {
  if (canViewFinancialTruth(user)) return payload;
  const clone: Record<string, any> = { ...payload };
  for (const k of FINANCIAL_STAT_KEYS) delete clone[k];
  return clone as T;
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------
export async function audit(
  user: User,
  entry: { module: string; action: string; entity?: string; entityId?: string | number; detail?: string; branchId?: number | null },
) {
  try {
    await getDb().insert(auditLogs).values({
      userId: user.id,
      branchId: entry.branchId ?? user.branchId ?? null,
      module: entry.module,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
