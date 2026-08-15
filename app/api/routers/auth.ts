import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { authedProc, verifyPassword, signSession, setSessionCookie, clearSessionCookie, audit, permissionMatrix, can } from "../auth";
import { getDb } from "../queries/connection";
import { ensureDatabase } from "../ensureDb";
import { users, branches } from "../../db/schema";

export const authRouter = createRouter({
  login: publicQuery
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Make login self-healing: guarantee schema + seed are in place even if
      // the boot-time bootstrap is still running (or previously failed).
      await ensureDatabase();
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.username, input.username.trim().toLowerCase())).limit(1);
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Nama pengguna atau kata laluan salah." });
      }
      if (!user.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Akaun ini telah dinyahaktifkan." });
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const token = signSession(user.id);
      setSessionCookie(ctx.resHeaders, token);
      await audit(user, { module: "auth", action: "login", entity: "user", entityId: user.id });
      const [branch] = user.branchId
        ? await db.select().from(branches).where(eq(branches.id, user.branchId)).limit(1)
        : [null];
      const { passwordHash, ...safe } = user;
      // Token returned in the body so the frontend can use Bearer auth —
      // cookies alone are unreliable inside cross-site preview iframes.
      return { user: safe, branch, token };
    }),

  logout: authedProc.mutation(async ({ ctx }) => {
    clearSessionCookie(ctx.resHeaders);
    await audit(ctx.user, { module: "auth", action: "logout" });
    return { ok: true };
  }),

  me: authedProc.query(async ({ ctx }) => {
    const { passwordHash, ...safe } = ctx.user;
    const db = getDb();
    const [branch] = ctx.user.branchId
      ? await db.select().from(branches).where(eq(branches.id, ctx.user.branchId)).limit(1)
      : [null];
    return { user: safe, branch, permissions: permissionMatrix, can: undefined };
  }),

  checkPerm: authedProc
    .input(z.object({ module: z.string(), action: z.string() }))
    .query(({ ctx, input }) => ({ allowed: can(ctx.user, input.module as any, input.action as any) })),
});
