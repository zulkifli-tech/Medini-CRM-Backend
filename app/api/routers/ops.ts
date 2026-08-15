import { z } from "zod";
import { and, eq, desc, sql, isNull } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProc, permProc, roleProc, scopeBranch, audit, permissionMatrix, modules, hashPassword } from "../auth";
import { getDb } from "../queries/connection";
import {
  campaigns, tasks, incidentLogs, users, branches, chairs, treatments,
  insurancePanels, auditLogs, settings, roles, patients,
} from "../../db/schema";


export const marketingRouter = createRouter({
  campaigns: permProc("marketing", "view")
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [scoped ? sql`(${campaigns.branchId} = ${scoped} OR ${campaigns.branchId} IS NULL)` : undefined].filter(Boolean) as any[];
      return getDb().select({ campaign: campaigns, branchName: branches.name })
        .from(campaigns).leftJoin(branches, eq(campaigns.branchId, branches.id))
        .where(and(...conds)).orderBy(desc(campaigns.createdAt)).limit(50);
    }),

  createCampaign: permProc("marketing", "create")
    .input(z.object({
      name: z.string().min(3),
      type: z.enum(["broadcast", "recall", "birthday", "promotion", "review"]),
      branchId: z.number().nullish(),
      segment: z.string().optional(),
      message: z.string().min(10),
      scheduledAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await getDb().insert(campaigns).values({
        name: input.name, type: input.type, branchId: input.branchId ?? null,
        segment: input.segment ?? null, message: input.message,
        status: input.scheduledAt ? "scheduled" : "draft", scheduledAt: input.scheduledAt ?? null,
      });
      await audit(ctx.user, { module: "marketing", action: "create_campaign", entity: "campaign", entityId: Number(r.lastInsertRowid) });
      return { id: Number(r.lastInsertRowid) };
    }),
});

export const operationsRouter = createRouter({
  overview: authedProc
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const branchConds = [scoped ? eq(branches.id, scoped) : undefined, eq(branches.isActive, true)].filter(Boolean) as any[];
      const branchList = await db.select({
        branch: branches,
        doctors: sql<number>`(SELECT COUNT(*) FROM users WHERE users.branch_id = ${branches.id} AND users.role='doctor' AND users.is_active=1)`,
        staff: sql<number>`(SELECT COUNT(*) FROM users WHERE users.branch_id = ${branches.id} AND users.role!='doctor' AND users.is_active=1)`,
        chairs: sql<number>`(SELECT COUNT(*) FROM chairs WHERE chairs.branch_id = ${branches.id} AND chairs.is_active=1)`,
        patients: sql<number>`(SELECT COUNT(*) FROM patients WHERE patients.branch_id = ${branches.id})`,
      }).from(branches).where(and(...branchConds)).orderBy(branches.id);

      const taskConds = [scoped ? eq(tasks.branchId, scoped) : undefined].filter(Boolean) as any[];
      const taskList = await db.select({ task: tasks, assignee: users.name, branchName: branches.name })
        .from(tasks)
        .leftJoin(users, eq(tasks.assigneeId, users.id))
        .leftJoin(branches, eq(tasks.branchId, branches.id))
        .where(and(...taskConds)).orderBy(desc(tasks.createdAt)).limit(30);

      const incConds = [scoped ? eq(incidentLogs.branchId, scoped) : undefined].filter(Boolean) as any[];
      const incidents = await db.select({ incident: incidentLogs, branchName: branches.name })
        .from(incidentLogs).leftJoin(branches, eq(incidentLogs.branchId, branches.id))
        .where(and(...incConds)).orderBy(desc(incidentLogs.createdAt)).limit(30);

      return { branches: branchList, tasks: taskList, incidents };
    }),

  staff: authedProc
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [scoped ? eq(users.branchId, scoped) : undefined, isNull(users.deletedAt)].filter(Boolean) as any[];
      return getDb().select({
        id: users.id, name: users.name, role: users.role, email: users.email, phone: users.phone,
        title: users.title, specialization: users.specialization, isActive: users.isActive,
        branchId: users.branchId, branchName: branches.name, lastLoginAt: users.lastLoginAt,
      }).from(users).leftJoin(branches, eq(users.branchId, branches.id))
        .where(and(...conds)).orderBy(users.role, users.name);
    }),

  addTask: authedProc
    .input(z.object({ branchId: z.number(), title: z.string().min(3), dueAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scoped = scopeBranch(ctx.user, input.branchId);
      const r = await getDb().insert(tasks).values({
        branchId: scoped!, title: input.title, dueAt: input.dueAt ?? null,
      });
      return { id: Number(r.lastInsertRowid) };
    }),

  updateTask: authedProc
    .input(z.object({ id: z.number(), status: z.enum(["open", "in_progress", "done"]) }))
    .mutation(async ({ input }) => {
      await getDb().update(tasks).set({ status: input.status }).where(eq(tasks.id, input.id));
      return { ok: true };
    }),

  resolveIncident: authedProc
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(incidentLogs).set({ status: "resolved" }).where(eq(incidentLogs.id, input.id));
      await audit(ctx.user, { module: "operations", action: "resolve_incident", entity: "incident", entityId: input.id });
      return { ok: true };
    }),
});

export const adminRouter = createRouter({
  matrix: roleProc(["hq"]).query(async () => ({ matrix: permissionMatrix, modules, roles })),

  users: roleProc(["hq"]).query(async () => {
    return getDb().select({
      id: users.id, name: users.name, username: users.username, role: users.role,
      email: users.email, title: users.title, specialization: users.specialization,
      branchId: users.branchId, branchName: branches.name, isActive: users.isActive, lastLoginAt: users.lastLoginAt,
    }).from(users).leftJoin(branches, eq(users.branchId, branches.id)).orderBy(users.id);
  }),

  createUser: roleProc(["hq"])
    .input(z.object({
      name: z.string().min(2), username: z.string().min(3),
      password: z.string().min(6), role: z.enum(roles),
      branchId: z.number().nullish(), email: z.string().email().optional(),
      title: z.string().optional(), specialization: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const r = await db.insert(users).values({
        name: input.name, username: input.username.toLowerCase(),
        passwordHash: hashPassword(input.password), role: input.role,
        branchId: input.role === "hq" ? null : input.branchId ?? null,
        email: input.email ?? null, title: input.title ?? null, specialization: input.specialization ?? null,
      });
      await audit(ctx.user, { module: "administration", action: "create_user", entity: "user", entityId: Number(r.lastInsertRowid), detail: `${input.name} (${input.role})` });
      return { id: Number(r.lastInsertRowid) };
    }),

  toggleUser: roleProc(["hq"])
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(users).set({ isActive: input.isActive }).where(eq(users.id, input.id));
      await audit(ctx.user, { module: "administration", action: input.isActive ? "activate_user" : "deactivate_user", entity: "user", entityId: input.id });
      return { ok: true };
    }),

  auditLogs: roleProc(["hq"])
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ input }) => {
      return getDb().select({ log: auditLogs, userName: users.name, branchName: branches.name })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .leftJoin(branches, eq(auditLogs.branchId, branches.id))
        .orderBy(desc(auditLogs.createdAt)).limit(input.limit);
    }),

  masterData: roleProc(["hq"]).query(async () => {
    const db = getDb();
    return {
      branches: await db.select().from(branches).orderBy(branches.id),
      treatments: await db.select().from(treatments).orderBy(treatments.id),
      panels: await db.select().from(insurancePanels).orderBy(insurancePanels.id),
      chairs: await db.select().from(chairs).orderBy(chairs.branchId, chairs.id),
    };
  }),

  addTreatment: roleProc(["hq"])
    .input(z.object({ code: z.string().min(2), name: z.string().min(3), category: z.string().min(2), price: z.number(), durationMin: z.number().default(30) }))
    .mutation(async ({ ctx, input }) => {
      const r = await getDb().insert(treatments).values({ ...input, price: input.price });
      await audit(ctx.user, { module: "administration", action: "add_treatment", entity: "treatment", entityId: Number(r.lastInsertRowid), detail: input.name });
      return { id: Number(r.lastInsertRowid) };
    }),

  addBranch: roleProc(["hq"])
    .input(z.object({ code: z.string().min(2), name: z.string().min(3), city: z.string().min(2), phone: z.string().optional(), address: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const r = await getDb().insert(branches).values({
        ...input, whatsappSession: `wa-${input.code.toLowerCase()}`, whatsappConnected: false,
      });
      await audit(ctx.user, { module: "administration", action: "add_branch", entity: "branch", entityId: Number(r.lastInsertRowid), detail: input.name });
      return { id: Number(r.lastInsertRowid) };
    }),
});

export const settingsRouter = createRouter({
  get: authedProc.query(async () => {
    const rows = await getDb().select().from(settings);
    const map: Record<string, any> = {};
    for (const r of rows) {
      try { map[r.key] = JSON.parse(r.value ?? "{}"); } catch { map[r.key] = r.value; }
    }
    return map;
  }),

  update: permProc("settings", "edit")
    .input(z.object({ key: z.string(), value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const val = JSON.stringify(input.value);
      await db.run(sql`INSERT INTO settings (\`key\`, value, updated_at) VALUES (${input.key}, ${val}, ${Date.now()}) ON CONFLICT(\`key\`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
      await audit(ctx.user, { module: "settings", action: "update", entity: "setting", entityId: input.key });
      return { ok: true };
    }),
});

export const searchRouter = createRouter({
  global: authedProc
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, null);
      const q = `%${input.q}%`;
      const patConds = [sql`(${patients.name} LIKE ${q} OR ${patients.phone} LIKE ${q} OR ${patients.mrn} LIKE ${q})`, scoped ? eq(patients.branchId, scoped) : undefined].filter(Boolean) as any[];
      const pats = await db.select({ id: patients.id, name: patients.name, mrn: patients.mrn, phone: patients.phone })
        .from(patients).where(and(...patConds)).limit(6);
      const invs = await db.all(sql`SELECT i.id, i.number, i.total, p.name AS patient FROM invoices i LEFT JOIN patients p ON i.patient_id = p.id WHERE (i.number LIKE ${q} OR p.name LIKE ${q}) ${scoped ? sql`AND i.branch_id = ${scoped}` : sql``} LIMIT 5`);
      return { patients: pats, invoices: (invs as any[]) ?? [] };
    }),
});
