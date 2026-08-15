import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProc } from "../auth";
import { getDb } from "../queries/connection";
import { branches, treatments, insurancePanels, users, chairs } from "../../db/schema";

export const metaRouter = createRouter({
  branches: authedProc.query(async () => {
    return getDb().select().from(branches).where(eq(branches.isActive, true)).orderBy(branches.id);
  }),

  treatments: authedProc.query(async () => {
    return getDb().select().from(treatments).where(eq(treatments.isActive, true)).orderBy(treatments.category, treatments.name);
  }),

  insurancePanels: authedProc.query(async () => {
    return getDb().select().from(insurancePanels).where(eq(insurancePanels.isActive, true));
  }),

  doctors: authedProc
    .input(z.object({ branchId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [eq(users.role, "doctor"), eq(users.isActive, true)];
      if (input?.branchId) conds.push(eq(users.branchId, input.branchId));
      const rows = await db
        .select({ id: users.id, name: users.name, specialization: users.specialization, branchId: users.branchId })
        .from(users)
        .where(and(...conds));
      return rows;
    }),

  chairs: authedProc
    .input(z.object({ branchId: z.number() }))
    .query(async ({ input }) => {
      return getDb().select().from(chairs).where(and(eq(chairs.branchId, input.branchId), eq(chairs.isActive, true)));
    }),
});
