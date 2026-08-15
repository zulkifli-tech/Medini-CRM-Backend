import { z } from "zod";
import { and, eq, gte, lte, sql, isNull } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProc, scopeBranch, stripFinancialFields } from "../auth";
import { getDb } from "../queries/connection";
import {
  appointments, branches, invoices, payments, patients, users,
  aiLogs, waConversations, insuranceClaims, clinicalNotes, treatments, chairs,
} from "../../db/schema";

const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const num = (v: unknown) => Number(v ?? 0);

export const dashboardRouter = createRouter({
  stats: authedProc
    .input(z.object({ branchId: z.number().nullish() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;
      const scoped = scopeBranch(user, input?.branchId);
      const bFilter = scoped ? eq(payments.branchId, scoped) : undefined;
      const aFilter = scoped ? eq(appointments.branchId, scoped) : undefined;
      const pFilter = scoped ? eq(patients.branchId, scoped) : undefined;

      const t0 = dayStart(), t1 = dayEnd();
      const monthStart = new Date(t0.getFullYear(), t0.getMonth(), 1);

      // --- revenue ---
      const revenueConds = [bFilter].filter(Boolean) as any[];
      const [todayRev] = await db.select({ v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)` })
        .from(payments).where(and(...revenueConds, gte(payments.paidAt, t0), lte(payments.paidAt, t1)));
      const [monthRev] = await db.select({ v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)` })
        .from(payments).where(and(...revenueConds, gte(payments.paidAt, monthStart)));

      // previous-month revenue (for MoM % badge)
      const prevMonthStart = new Date(t0.getFullYear(), t0.getMonth() - 1, 1);
      const [prevMonthRev] = await db.select({ v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)` })
        .from(payments).where(and(...revenueConds, gte(payments.paidAt, prevMonthStart), lte(payments.paidAt, monthStart)));
      const prevV = num(prevMonthRev?.v);
      const momPct = prevV > 0 ? Math.round(((num(monthRev?.v) - prevV) / prevV) * 1000) / 10 : null;

      // 30-day trend
      const trendStart = new Date(t0.getTime() - 29 * 86400000);
      const trend = await db.select({
        d: sql<string>`date(${payments.paidAt}/1000,'unixepoch')`,
        v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)`,
      }).from(payments).where(and(...revenueConds, gte(payments.paidAt, trendStart)))
        .groupBy(sql`date(${payments.paidAt}/1000,'unixepoch')`).orderBy(sql`date(${payments.paidAt}/1000,'unixepoch')`);

      // --- appointments today ---
      const apptConds = [aFilter].filter(Boolean) as any[];
      const todayAppts = await db.select({
        id: appointments.id, status: appointments.status, source: appointments.source,
        startAt: appointments.startAt, patientName: patients.name, doctorName: users.name,
      }).from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(users, eq(appointments.doctorId, users.id))
        .where(and(...apptConds, gte(appointments.startAt, t0), lte(appointments.startAt, t1)))
        .orderBy(appointments.startAt);

      const apptCount = (st: string[]) => todayAppts.filter((a) => st.includes(a.status)).length;

      // appointments this month + conversion (completed / total)
      const [apptMonth] = await db.select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN ${appointments.status}='completed' THEN 1 ELSE 0 END)`,
      }).from(appointments).where(and(...apptConds, gte(appointments.startAt, monthStart)));

      // chair utilization right now
      const [chairsTotal] = await db.select({ v: sql<number>`COUNT(*)` }).from(chairs)
        .where(and(scoped ? eq(chairs.branchId, scoped) : undefined, eq(chairs.isActive, true)));
      const [chairsBusy] = await db.select({ v: sql<number>`COUNT(DISTINCT ${appointments.chairId})` }).from(appointments)
        .where(and(...apptConds, gte(appointments.startAt, t0), lte(appointments.startAt, t1), eq(appointments.status, "in_progress")));

      // --- outstanding payments ---
      const [outstanding] = await db.select({
        v: sql<string>`COALESCE(SUM(${invoices.total} - ${invoices.insuranceAmount} - (SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) FROM payments WHERE payments.invoice_id = ${invoices.id} AND payments.method != 'insurance')),0)`,
      }).from(invoices).where(and(scoped ? eq(invoices.branchId, scoped) : undefined, sql`${invoices.status} IN ('issued','partial')`));

      // --- patients ---
      const [newPatientsMonth] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients)
        .where(and(pFilter, gte(patients.createdAt, monthStart)));
      const [totalPatients] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients).where(and(pFilter, isNull(patients.deletedAt)));
      const [recallDue] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients)
        .where(and(pFilter, lte(patients.nextRecallAt, new Date(Date.now() + 14 * 86400000))));

      // --- AI performance (7d) ---
      const aiStart = new Date(Date.now() - 7 * 86400000);
      const aiConds = [scoped ? eq(aiLogs.branchId, scoped) : undefined].filter(Boolean) as any[];
      const [aiTotal] = await db.select({ v: sql<number>`COUNT(*)` }).from(aiLogs).where(and(...aiConds, gte(aiLogs.createdAt, aiStart)));
      const [aiEscalated] = await db.select({ v: sql<number>`COUNT(*)` }).from(aiLogs).where(and(...aiConds, gte(aiLogs.createdAt, aiStart), eq(aiLogs.escalated, true)));
      const [aiConf] = await db.select({ v: sql<string>`COALESCE(AVG(${aiLogs.confidence}),0)` }).from(aiLogs).where(and(...aiConds, gte(aiLogs.createdAt, aiStart)));

      // --- WhatsApp queue ---
      const waConds = [scoped ? eq(waConversations.branchId, scoped) : undefined].filter(Boolean) as any[];
      const [waOpen] = await db.select({ v: sql<number>`COUNT(*)` }).from(waConversations).where(and(...waConds, sql`${waConversations.status} != 'closed'`));
      const [waUnread] = await db.select({ v: sql<number>`COALESCE(SUM(${waConversations.unreadCount}),0)` }).from(waConversations).where(and(...waConds));

      // --- insurance claims ---
      const claimsByStatus = await db.select({ status: insuranceClaims.status, v: sql<number>`COUNT(*)` })
        .from(insuranceClaims).where(and(scoped ? eq(insuranceClaims.branchId, scoped) : undefined)).groupBy(insuranceClaims.status);

      const base = {
        revenueToday: num(todayRev?.v),
        revenueMonth: num(monthRev?.v),
        trend: trend.map((r) => ({ date: r.d, value: num(r.v) })),
        appointmentsToday: todayAppts.length,
        todayAppts,
        waitingNow: apptCount(["checked_in"]),
        inProgress: apptCount(["in_progress"]),
        completedToday: apptCount(["completed"]),
        noShowToday: apptCount(["no_show"]),
        walkinsToday: todayAppts.filter((a) => a.source === "walkin").length,
        aiBookedToday: todayAppts.filter((a) => a.source === "ai").length,
        outstanding: Math.max(0, num(outstanding?.v)),
        newPatientsMonth: num(newPatientsMonth?.v),
        totalPatients: num(totalPatients?.v),
        recallDue: num(recallDue?.v),
        aiActions7d: num(aiTotal?.v),
        aiEscalated7d: num(aiEscalated?.v),
        aiAvgConfidence: num(aiConf?.v),
        waOpen: num(waOpen?.v),
        waUnread: num(waUnread?.v),
        claimsByStatus: Object.fromEntries(claimsByStatus.map((c) => [c.status, num(c.v)])),
        momPct,
        appointmentsMonth: num(apptMonth?.total),
        conversionPct: num(apptMonth?.total) > 0 ? Math.round((num(apptMonth?.completed) / num(apptMonth?.total)) * 100) : 0,
        chairsTotal: num(chairsTotal?.v),
        chairsBusy: num(chairsBusy?.v),
      };

      // Phase 3.1 §18 — Receptionist & Doctor must not receive financial truth.
      // Strip financial aggregates from the shared base payload BEFORE role
      // extras are attached (HQ/BM keep them; Admin/Doctor never see them).
      const safeBase = stripFinancialFields(user, base);

      // --- HQ extras ---
      if (user.role === "hq") {
        const revByBranch = await db.select({
          branchId: payments.branchId, name: branches.name,
          v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)`,
        }).from(payments).leftJoin(branches, eq(payments.branchId, branches.id))
          .where(gte(payments.paidAt, monthStart)).groupBy(payments.branchId, branches.name);
        revByBranch.sort((a, b) => Number(b.v) - Number(a.v));

        const revByDoctor = await db.select({
          doctorId: appointments.doctorId, name: users.name,
          v: sql<string>`COALESCE(SUM(${treatments.price}),0)`, visits: sql<number>`COUNT(*)`,
        }).from(appointments)
          .leftJoin(users, eq(appointments.doctorId, users.id))
          .leftJoin(treatments, eq(appointments.treatmentId, treatments.id))
          .where(and(gte(appointments.startAt, monthStart), eq(appointments.status, "completed")))
          .groupBy(appointments.doctorId, users.name);
        revByDoctor.sort((a, b) => Number(b.v) - Number(a.v));
        revByDoctor.splice(10);

        const apptByBranch = await db.select({
          branchId: appointments.branchId, name: branches.name, v: sql<number>`COUNT(*)`,
        }).from(appointments).leftJoin(branches, eq(appointments.branchId, branches.id))
          .where(and(gte(appointments.startAt, t0), lte(appointments.startAt, t1)))
          .groupBy(appointments.branchId, branches.name);

        return { ...safeBase, role: user.role, revByBranch: revByBranch.map((r) => ({ name: r.name, value: num(r.v) })), revByDoctor: revByDoctor.map((r) => ({ name: r.name, value: num(r.v), visits: num(r.visits) })), apptByBranch: apptByBranch.map((r) => ({ name: r.name, value: num(r.v) })) };
      }

      // --- branch manager extras: 7-day collection + doctor performance ---
      // (branch_admin falls through to the safe default — no financial truth)
      if (user.role === "branch_manager") {
        const weekStart = new Date(t0.getTime() - 6 * 86400000);
        const collection7d = await db.select({
          d: sql<string>`date(${payments.paidAt}/1000,'unixepoch')`,
          v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)`,
        }).from(payments).where(and(...revenueConds, gte(payments.paidAt, weekStart)))
          .groupBy(sql`date(${payments.paidAt}/1000,'unixepoch')`).orderBy(sql`date(${payments.paidAt}/1000,'unixepoch')`);

        const docPerf = await db.select({
          doctorId: appointments.doctorId, name: users.name, visits: sql<number>`COUNT(*)`,
        }).from(appointments).leftJoin(users, eq(appointments.doctorId, users.id))
          .where(and(...apptConds, gte(appointments.startAt, monthStart), eq(appointments.status, "completed")))
          .groupBy(appointments.doctorId, users.name);
        docPerf.sort((a, b) => Number(b.visits) - Number(a.visits));

        return { ...safeBase, role: user.role, collection7d: collection7d.map((r) => ({ date: r.d, value: num(r.v) })), doctorPerformance: docPerf.map((r) => ({ name: r.name, visits: num(r.visits) })) };
      }

      // --- doctor extras ---
      if (user.role === "doctor") {
        const mySchedule = await db.select({
          id: appointments.id, status: appointments.status, startAt: appointments.startAt, endAt: appointments.endAt,
          patientName: patients.name, patientId: patients.id, notes: appointments.notes,
        }).from(appointments).leftJoin(patients, eq(appointments.patientId, patients.id))
          .where(and(eq(appointments.doctorId, user.id), gte(appointments.startAt, t0), lte(appointments.startAt, t1)))
          .orderBy(appointments.startAt);

        const [pendingNotes] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
          .leftJoin(clinicalNotes, eq(clinicalNotes.appointmentId, appointments.id))
          .where(and(eq(appointments.doctorId, user.id), eq(appointments.status, "completed"), isNull(clinicalNotes.id), gte(appointments.startAt, new Date(Date.now() - 14 * 86400000))));

        const [followUps] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
          .where(and(eq(appointments.doctorId, user.id), gte(appointments.startAt, new Date()), sql`${appointments.status} IN ('booked','confirmed')`));

        return {
          ...safeBase, role: user.role, mySchedule,
          myWaiting: mySchedule.filter((a) => a.status === "checked_in").length,
          myCompletedToday: mySchedule.filter((a) => a.status === "completed").length,
          pendingNotes: num(pendingNotes?.v), followUps: num(followUps?.v),
        };
      }

      return { ...safeBase, role: user.role };
    }),
});
