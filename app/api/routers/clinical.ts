import { z } from "zod";
import { and, eq, desc, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProc, permProc, scopeBranch, audit } from "../auth";
import { getDb } from "../queries/connection";
import {
  clinicalNotes, treatmentPlans, treatmentPlanItems, prescriptions,
  patients, users, documents, branches,
} from "../../db/schema";

export const clinicalRouter = createRouter({
  notes: authedProc
    .input(z.object({ branchId: z.number().nullish(), patientId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(clinicalNotes.deletedAt)] as any[];
      if (scoped) conds.push(eq(clinicalNotes.branchId, scoped));
      if (ctx.user.role === "doctor") conds.push(eq(clinicalNotes.doctorId, ctx.user.id));
      if (input.patientId) conds.push(eq(clinicalNotes.patientId, input.patientId));
      return db.select({
        note: clinicalNotes, patientName: patients.name, doctorName: users.name, branchName: branches.name,
      }).from(clinicalNotes)
        .leftJoin(patients, eq(clinicalNotes.patientId, patients.id))
        .leftJoin(users, eq(clinicalNotes.doctorId, users.id))
        .leftJoin(branches, eq(clinicalNotes.branchId, branches.id))
        .where(and(...conds)).orderBy(desc(clinicalNotes.createdAt)).limit(100);
    }),

  addNote: permProc("clinical", "create")
    .input(z.object({
      patientId: z.number(), appointmentId: z.number().nullish(),
      diagnosis: z.string().min(2), notes: z.string().min(2), procedures: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [patient] = await db.select().from(patients).where(eq(patients.id, input.patientId)).limit(1);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Pesakit tidak dijumpai." });
      const r = await db.insert(clinicalNotes).values({
        branchId: patient.branchId, patientId: input.patientId,
        appointmentId: input.appointmentId ?? null, doctorId: ctx.user.id,
        diagnosis: input.diagnosis, notes: input.notes, procedures: input.procedures ?? null,
      });
      await audit(ctx.user, { module: "clinical", action: "create_note", entity: "clinical_note", entityId: Number(r.lastInsertRowid), branchId: patient.branchId });
      return { id: Number(r.lastInsertRowid) };
    }),

  plans: authedProc
    .input(z.object({ branchId: z.number().nullish(), patientId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(treatmentPlans.deletedAt)] as any[];
      if (scoped) conds.push(eq(treatmentPlans.branchId, scoped));
      if (ctx.user.role === "doctor") conds.push(eq(treatmentPlans.doctorId, ctx.user.id));
      if (input.patientId) conds.push(eq(treatmentPlans.patientId, input.patientId));
      const plans = await db.select({
        plan: treatmentPlans, patientName: patients.name, doctorName: users.name,
      }).from(treatmentPlans)
        .leftJoin(patients, eq(treatmentPlans.patientId, patients.id))
        .leftJoin(users, eq(treatmentPlans.doctorId, users.id))
        .where(and(...conds)).orderBy(desc(treatmentPlans.createdAt)).limit(60);
      const ids = plans.map((p) => p.plan.id);
      // Phase 3.1 §14 — doctors only receive items belonging to their own plans
      // (the plans query above is already doctor-scoped; this just keeps items
      // aligned with those plan ids — no extra leak surface).
      const items = ids.length
        ? await db.select().from(treatmentPlanItems).where(sql`${treatmentPlanItems.planId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
        : [];
      return { plans, items };
    }),

  addPlan: permProc("clinical", "create")
    .input(z.object({
      patientId: z.number(), title: z.string().min(3),
      items: z.array(z.object({
        treatmentId: z.number().optional(), description: z.string().min(2),
        toothNo: z.string().optional(), qty: z.number().default(1), price: z.number(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [patient] = await db.select().from(patients).where(eq(patients.id, input.patientId)).limit(1);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND" });
      const r = await db.insert(treatmentPlans).values({
        branchId: patient.branchId, patientId: input.patientId, doctorId: ctx.user.id, title: input.title, status: "proposed",
      });
      await db.insert(treatmentPlanItems).values(input.items.map((it) => ({
        planId: Number(r.lastInsertRowid), treatmentId: it.treatmentId ?? null, description: it.description,
        toothNo: it.toothNo ?? null, qty: it.qty, price: it.price, status: "pending" as const,
      })));
      await audit(ctx.user, { module: "clinical", action: "create_plan", entity: "treatment_plan", entityId: Number(r.lastInsertRowid), branchId: patient.branchId });
      return { id: Number(r.lastInsertRowid) };
    }),

  updatePlanStatus: authedProc
    .input(z.object({ id: z.number(), status: z.enum(["proposed", "accepted", "in_progress", "completed"]) }))
    .mutation(async ({ input }) => {
      await getDb().update(treatmentPlans).set({ status: input.status }).where(eq(treatmentPlans.id, input.id));
      return { ok: true };
    }),

  prescriptions: authedProc
    .input(z.object({ branchId: z.number().nullish(), patientId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(prescriptions.deletedAt)] as any[];
      if (scoped) conds.push(eq(prescriptions.branchId, scoped));
      if (ctx.user.role === "doctor") conds.push(eq(prescriptions.doctorId, ctx.user.id));
      if (input.patientId) conds.push(eq(prescriptions.patientId, input.patientId));
      return db.select({ rx: prescriptions, patientName: patients.name, doctorName: users.name })
        .from(prescriptions)
        .leftJoin(patients, eq(prescriptions.patientId, patients.id))
        .leftJoin(users, eq(prescriptions.doctorId, users.id))
        .where(and(...conds)).orderBy(desc(prescriptions.createdAt)).limit(100);
    }),

  addPrescription: permProc("clinical", "create")
    .input(z.object({
      patientId: z.number(), appointmentId: z.number().nullish(),
      medication: z.string().min(2), dosage: z.string().optional(),
      frequency: z.string().optional(), durationDays: z.number().optional(), notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [patient] = await db.select().from(patients).where(eq(patients.id, input.patientId)).limit(1);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND" });
      const r = await db.insert(prescriptions).values({
        branchId: patient.branchId, patientId: input.patientId, doctorId: ctx.user.id,
        appointmentId: input.appointmentId ?? null, medication: input.medication,
        dosage: input.dosage ?? null, frequency: input.frequency ?? null,
        durationDays: input.durationDays ?? null, notes: input.notes ?? null,
      });
      await audit(ctx.user, { module: "clinical", action: "create_prescription", entity: "prescription", entityId: Number(r.lastInsertRowid), branchId: patient.branchId });
      return { id: Number(r.lastInsertRowid) };
    }),
});

export const documentsRouter = createRouter({
  list: authedProc
    .input(z.object({ branchId: z.number().nullish(), patientId: z.number().optional(), kind: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(documents.deletedAt)] as any[];
      if (scoped) conds.push(eq(documents.branchId, scoped));
      if (input.patientId) conds.push(eq(documents.patientId, input.patientId));
      if (input.kind) conds.push(eq(documents.kind, input.kind as any));
      return db.select({ doc: documents, patientName: patients.name, branchName: branches.name })
        .from(documents)
        .leftJoin(patients, eq(documents.patientId, patients.id))
        .leftJoin(branches, eq(documents.branchId, branches.id))
        .where(and(...conds)).orderBy(desc(documents.createdAt)).limit(200);
    }),

  create: permProc("documents", "create")
    .input(z.object({
      patientId: z.number(),
      kind: z.enum(["xray", "cbct", "opg", "photo", "before_after", "consent", "document"]),
      title: z.string().min(2), fileUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [patient] = await db.select().from(patients).where(eq(patients.id, input.patientId)).limit(1);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND" });
      const r = await db.insert(documents).values({
        branchId: patient.branchId, patientId: input.patientId, kind: input.kind,
        title: input.title, fileUrl: input.fileUrl ?? null, uploadedById: ctx.user.id,
      });
      await audit(ctx.user, { module: "documents", action: "upload", entity: "document", entityId: Number(r.lastInsertRowid), branchId: patient.branchId });
      return { id: Number(r.lastInsertRowid) };
    }),
});
