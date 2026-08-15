import { z } from "zod";
import { and, eq, like, or, desc, asc, sql, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProc, permProc, scopeBranch, audit } from "../auth";
import { getDb } from "../queries/connection";
import {
  patients, appointments, users, treatments, clinicalNotes, treatmentPlans, treatmentPlanItems,
  prescriptions, documents, invoices, payments, waConversations, insurancePanels, branches,
} from "../../db/schema";

export const patientsRouter = createRouter({
  list: authedProc
    .input(z.object({
      branchId: z.number().nullish(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(15),
      recallOnly: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(patients.deletedAt)] as any[];
      if (scoped) conds.push(eq(patients.branchId, scoped));
      if (input.search) {
        const q = `%${input.search}%`;
        conds.push(or(like(patients.name, q), like(patients.phone, q), like(patients.mrn, q), like(patients.email, q)));
      }
      if (input.recallOnly) conds.push(lte(patients.nextRecallAt, new Date(Date.now() + 14 * 86400000)));

      const [count] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients).where(and(...conds));
      const rows = await db.select({
        patient: patients,
        branchName: branches.name,
        panelName: insurancePanels.name,
      }).from(patients)
        .leftJoin(branches, eq(patients.branchId, branches.id))
        .leftJoin(insurancePanels, eq(patients.insurancePanelId, insurancePanels.id))
        .where(and(...conds))
        .orderBy(desc(patients.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { total: Number(count?.v ?? 0), page: input.page, pageSize: input.pageSize, rows };
    }),

  get360: authedProc
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.select({ patient: patients, branchName: branches.name, panelName: insurancePanels.name })
        .from(patients)
        .leftJoin(branches, eq(patients.branchId, branches.id))
        .leftJoin(insurancePanels, eq(patients.insurancePanelId, insurancePanels.id))
        .where(eq(patients.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pesakit tidak dijumpai." });
      if (ctx.user.role !== "hq" && row.patient.branchId !== ctx.user.branchId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Pesakit ini milik cawangan lain." });
      }
      const pid = input.id;

      const appts = await db.select({
        appointment: appointments, doctorName: users.name, treatmentName: treatments.name,
      }).from(appointments)
        .leftJoin(users, eq(appointments.doctorId, users.id))
        .leftJoin(treatments, eq(appointments.treatmentId, treatments.id))
        .where(eq(appointments.patientId, pid)).orderBy(desc(appointments.startAt)).limit(50);

      const notes = await db.select({ note: clinicalNotes, doctorName: users.name })
        .from(clinicalNotes).leftJoin(users, eq(clinicalNotes.doctorId, users.id))
        .where(eq(clinicalNotes.patientId, pid)).orderBy(desc(clinicalNotes.createdAt)).limit(30);

      const plans = await db.select().from(treatmentPlans).where(eq(treatmentPlans.patientId, pid)).orderBy(desc(treatmentPlans.createdAt));
      const planIds = plans.map((p) => p.id);
      const planItems = planIds.length
        ? await db.select().from(treatmentPlanItems).where(sql`${treatmentPlanItems.planId} IN (${sql.join(planIds.map((i) => sql`${i}`), sql`, `)})`)
        : [];

      const rx = await db.select({ rx: prescriptions, doctorName: users.name })
        .from(prescriptions).leftJoin(users, eq(prescriptions.doctorId, users.id))
        .where(eq(prescriptions.patientId, pid)).orderBy(desc(prescriptions.createdAt)).limit(30);

      const docs = await db.select().from(documents).where(eq(documents.patientId, pid)).orderBy(desc(documents.createdAt));

      const invs = await db.select().from(invoices).where(eq(invoices.patientId, pid)).orderBy(desc(invoices.issuedAt)).limit(30);
      const invIds = invs.map((i) => i.id);
      const pays = invIds.length
        ? await db.select().from(payments).where(sql`${payments.invoiceId} IN (${sql.join(invIds.map((i) => sql`${i}`), sql`, `)})`).orderBy(desc(payments.paidAt))
        : [];

      const convs = await db.select().from(waConversations).where(eq(waConversations.patientId, pid)).orderBy(desc(waConversations.lastMessageAt)).limit(10);

      return { ...row, appointments: appts, notes, plans, planItems, prescriptions: rx, documents: docs, invoices: invs, payments: pays, conversations: convs };
    }),

  create: permProc("patients", "create")
    .input(z.object({
      branchId: z.number(),
      name: z.string().min(2),
      phone: z.string().min(6),
      email: z.string().email().optional().or(z.literal("")),
      icNumber: z.string().optional(),
      dob: z.string().optional(),
      gender: z.enum(["male", "female"]).optional(),
      address: z.string().optional(),
      allergies: z.string().optional(),
      medicalNotes: z.string().optional(),
      insurancePanelId: z.number().nullish(),
      insurancePolicyNo: z.string().optional(),
      source: z.enum(["walkin", "whatsapp", "referral", "campaign"]).default("walkin"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      if (!scoped) throw new TRPCError({ code: "BAD_REQUEST", message: "Sila pilih cawangan." });
      const [maxMrn] = await db.select({ v: sql<string>`MAX(${patients.mrn})` }).from(patients);
      const nextNum = (parseInt(maxMrn?.v?.replace("MDN-", "") || "10000", 10) || 10000) + 1;
      const result = await db.insert(patients).values({
        ...input,
        branchId: scoped,
        email: input.email || null,
        mrn: `MDN-${nextNum}`,
        createdById: ctx.user.id,
      });
      await audit(ctx.user, { module: "patients", action: "create", entity: "patient", entityId: Number(result.lastInsertRowid), detail: input.name, branchId: scoped });
      return { id: Number(result.lastInsertRowid), mrn: `MDN-${nextNum}` };
    }),

  update: permProc("patients", "edit")
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      allergies: z.string().optional(),
      medicalNotes: z.string().optional(),
      address: z.string().optional(),
      insurancePanelId: z.number().nullish(),
      insurancePolicyNo: z.string().optional(),
      nextRecallAt: z.date().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb().update(patients).set(data as any).where(eq(patients.id, id));
      await audit(ctx.user, { module: "patients", action: "edit", entity: "patient", entityId: id });
      return { ok: true };
    }),

  recallDue: authedProc
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [lte(patients.nextRecallAt, new Date(Date.now() + 14 * 86400000)), isNull(patients.deletedAt)] as any[];
      if (scoped) conds.push(eq(patients.branchId, scoped));
      return getDb().select({ patient: patients, branchName: branches.name })
        .from(patients).leftJoin(branches, eq(patients.branchId, branches.id))
        .where(and(...conds)).orderBy(asc(patients.nextRecallAt)).limit(50);
    }),
});
