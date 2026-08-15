import { z } from "zod";
import { and, eq, gte, lte, sql, lt, gt, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProc, permProc, scopeBranch, audit } from "../auth";
import { getDb } from "../queries/connection";
import { appointments, patients, users, treatments, chairs, branches, aiLogs } from "../../db/schema";

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

async function findConflict(doctorId: number, _chairId: number | null | undefined, start: Date, end: Date, excludeId?: number) {
  const db = getDb();
  const conds = [
    sql`${appointments.status} NOT IN ('cancelled','no_show')`,
    lt(appointments.startAt, end),
    gt(appointments.endAt, start),
    eq(appointments.doctorId, doctorId),
  ] as any[];
  if (excludeId) conds.push(ne(appointments.id, excludeId));
  const rows = await db.select({ id: appointments.id }).from(appointments).where(and(...conds)).limit(1);
  return rows.length > 0;
}

export const appointmentsRouter = createRouter({
  list: authedProc
    .input(z.object({
      branchId: z.number().nullish(),
      from: z.date(), to: z.date(),
      doctorId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [gte(appointments.startAt, input.from), lte(appointments.startAt, input.to)] as any[];
      if (scoped) conds.push(eq(appointments.branchId, scoped));
      if (input.doctorId) conds.push(eq(appointments.doctorId, input.doctorId));
      if (input.status) conds.push(eq(appointments.status, input.status as any));
      if (ctx.user.role === "doctor") conds.push(eq(appointments.doctorId, ctx.user.id));
      return db.select({
        appointment: appointments,
        patientName: patients.name, patientPhone: patients.phone, patientId: patients.id,
        doctorName: users.name, treatmentName: treatments.name, chairName: chairs.name,
        branchName: branches.name,
      }).from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(users, eq(appointments.doctorId, users.id))
        .leftJoin(treatments, eq(appointments.treatmentId, treatments.id))
        .leftJoin(chairs, eq(appointments.chairId, chairs.id))
        .leftJoin(branches, eq(appointments.branchId, branches.id))
        .where(and(...conds)).orderBy(appointments.startAt).limit(500);
    }),

  todayQueue: authedProc
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [gte(appointments.startAt, dayStart(new Date())), lte(appointments.startAt, dayEnd(new Date()))] as any[];
      if (scoped) conds.push(eq(appointments.branchId, scoped));
      if (ctx.user.role === "doctor") conds.push(eq(appointments.doctorId, ctx.user.id));
      return db.select({
        appointment: appointments, patientName: patients.name, doctorName: users.name,
        treatmentName: treatments.name, chairName: chairs.name,
      }).from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(users, eq(appointments.doctorId, users.id))
        .leftJoin(treatments, eq(appointments.treatmentId, treatments.id))
        .leftJoin(chairs, eq(appointments.chairId, chairs.id))
        .where(and(...conds)).orderBy(appointments.startAt);
    }),

  create: permProc("appointments", "create")
    .input(z.object({
      branchId: z.number(), patientId: z.number(), doctorId: z.number(),
      chairId: z.number().nullish(), treatmentId: z.number().nullish(),
      startAt: z.date(), durationMin: z.number().default(30),
      notes: z.string().optional(), source: z.enum(["manual", "ai", "walkin"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      if (!scoped) throw new TRPCError({ code: "BAD_REQUEST", message: "Sila pilih cawangan." });
      const end = new Date(input.startAt.getTime() + input.durationMin * 60000);
      if (await findConflict(input.doctorId, input.chairId, input.startAt, end)) {
        throw new TRPCError({ code: "CONFLICT", message: "Doktor sudah mempunyai temu janji pada masa ini. Sila pilih slot lain." });
      }
      const r = await db.insert(appointments).values({
        branchId: scoped, patientId: input.patientId, doctorId: input.doctorId,
        chairId: input.chairId ?? null, treatmentId: input.treatmentId ?? null,
        startAt: input.startAt, endAt: end,
        status: input.source === "walkin" ? "checked_in" : "booked",
        source: input.source, notes: input.notes ?? null, createdById: ctx.user.id,
      });
      await audit(ctx.user, { module: "appointments", action: "create", entity: "appointment", entityId: Number(r.lastInsertRowid), branchId: scoped });
      return { id: Number(r.lastInsertRowid) };
    }),

  updateStatus: authedProc
    .input(z.object({
      id: z.number(),
      status: z.enum(["booked", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(appointments).set({ status: input.status }).where(eq(appointments.id, input.id));
      await audit(ctx.user, { module: "appointments", action: `status:${input.status}`, entity: "appointment", entityId: input.id });
      return { ok: true };
    }),

  reschedule: permProc("appointments", "edit")
    .input(z.object({ id: z.number(), startAt: z.date(), durationMin: z.number().default(30) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [appt] = await db.select().from(appointments).where(eq(appointments.id, input.id)).limit(1);
      if (!appt) throw new TRPCError({ code: "NOT_FOUND" });
      const end = new Date(input.startAt.getTime() + input.durationMin * 60000);
      if (await findConflict(appt.doctorId, appt.chairId, input.startAt, end, appt.id)) {
        throw new TRPCError({ code: "CONFLICT", message: "Slot baru bercanggah dengan temu janji lain." });
      }
      await db.update(appointments).set({ startAt: input.startAt, endAt: end }).where(eq(appointments.id, input.id));
      await audit(ctx.user, { module: "appointments", action: "reschedule", entity: "appointment", entityId: input.id });
      return { ok: true };
    }),

  // Simulated AI Booking Manager: finds the best slot and books it
  aiBook: authedProc
    .input(z.object({
      branchId: z.number(), patientId: z.number(),
      treatmentId: z.number().optional(),
      preferredDayOffset: z.number().min(0).max(14).default(0),
      preferredTime: z.enum(["morning", "afternoon", "evening"]).default("morning"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      if (!scoped) throw new TRPCError({ code: "BAD_REQUEST" });
      const treatment = input.treatmentId
        ? (await db.select().from(treatments).where(eq(treatments.id, input.treatmentId)).limit(1))[0]
        : null;
      const duration = treatment?.durationMin ?? 30;

      const doctors = await db.select().from(users)
        .where(and(eq(users.branchId, scoped), eq(users.role, "doctor"), eq(users.isActive, true)));
      if (!doctors.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Tiada doktor aktif di cawangan ini." });

      const hourRange = input.preferredTime === "morning" ? [9, 12] : input.preferredTime === "afternoon" ? [13, 16] : [16, 20];
      const branchChairs = await db.select().from(chairs).where(and(eq(chairs.branchId, scoped), eq(chairs.isActive, true)));

      // try each day starting from preferredDayOffset until a free slot is found
      for (let dOff = input.preferredDayOffset; dOff < input.preferredDayOffset + 7; dOff++) {
        for (const doctor of doctors) {
          const day = dayStart(new Date(Date.now() + dOff * 86400000));
          const dayAppts = await db.select().from(appointments).where(and(
            eq(appointments.doctorId, doctor.id),
            gte(appointments.startAt, day), lte(appointments.startAt, dayEnd(day)),
            sql`${appointments.status} NOT IN ('cancelled','no_show')`,
          ));
          for (let h = hourRange[0]; h <= hourRange[1]; h++) {
            for (const m of [0, 30]) {
              const start = new Date(day); start.setHours(h, m, 0, 0);
              if (dOff === 0 && start.getTime() < Date.now() + 3600000) continue;
              const end = new Date(start.getTime() + duration * 60000);
              const clash = dayAppts.some((a) => a.startAt < end && a.endAt > start);
              if (!clash) {
                const chair = branchChairs[0] ?? null;
                const r = await db.insert(appointments).values({
                  branchId: scoped, patientId: input.patientId, doctorId: doctor.id,
                  chairId: chair?.id ?? null, treatmentId: treatment?.id ?? null,
                  startAt: start, endAt: end, status: "confirmed", source: "ai",
                  notes: "Ditempah oleh AI Booking Manager", createdById: ctx.user.id,
                });
                await db.insert(aiLogs).values({
                  branchId: scoped, agent: "booking", action: "Appointment booked",
                  detail: `AI booked ${treatment?.name ?? "appointment"} with ${doctor.name} on ${start.toISOString()}`,
                  confidence: 0.94, escalated: false,
                });
                await audit(ctx.user, { module: "appointments", action: "ai_book", entity: "appointment", entityId: Number(r.lastInsertRowid), branchId: scoped });
                return { id: Number(r.lastInsertRowid), startAt: start, endAt: end, doctorName: doctor.name, treatmentName: treatment?.name ?? "Consultation", chairName: chair?.name ?? null };
              }
            }
          }
        }
      }
      throw new TRPCError({ code: "CONFLICT", message: "AI tidak menemui slot kosong dalam 7 hari akan datang." });
    }),
});
