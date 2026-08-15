import { z } from "zod";
import { and, eq, gte, lte, lt, sql, isNull } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProc, scopeBranch, canViewFinancialTruth } from "../auth";
import { getDb } from "../queries/connection";
import {
  appointments, patients, payments, waConversations, branches,
  tasks, incidentLogs, chairs, clinicalNotes,
} from "../../db/schema";

/**
 * PHASE 4 — DASHBOARD INTELLIGENCE LAYER
 *
 * Single canonical procedure that derives role-scoped signals from existing
 * data. No component-level random calculations. Financial aggregates are only
 * computed for roles entitled to financial truth (HQ + Branch Manager) —
 * Phase 3.1 guarantees are inherited, never weakened.
 */

const num = (v: unknown) => Number(v ?? 0);
const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

type Severity = "critical" | "high" | "medium" | "info";
type Signal = {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  metric?: number;
  kind: "operational" | "performance" | "financial" | "clinical" | "communication";
  deterministic: true;
};

export const intelligenceRouter = createRouter({
  signals: authedProc
    .input(z.object({ branchId: z.number().nullish() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;
      const scoped = scopeBranch(user, input?.branchId);
      const canFin = canViewFinancialTruth(user);
      const isDoctor = user.role === "doctor";

      const t0 = dayStart(), t1 = dayEnd();
      const yesterday0 = dayStart(new Date(t0.getTime() - 86400000));
      const yesterday1 = dayEnd(new Date(t0.getTime() - 86400000));
      const weekAgo = new Date(t0.getTime() - 7 * 86400000);
      const prevWeekStart = new Date(t0.getTime() - 14 * 86400000);

      const aConds = (extra?: any[]) =>
        [scoped ? eq(appointments.branchId, scoped) : undefined, isDoctor ? eq(appointments.doctorId, user.id) : undefined, ...(extra ?? [])].filter(Boolean) as any[];
      const pConds = (extra?: any[]) =>
        [scoped ? eq(payments.branchId, scoped) : undefined, ...(extra ?? [])].filter(Boolean) as any[];
      const wConds = (extra?: any[]) =>
        [scoped ? eq(waConversations.branchId, scoped) : undefined, ...(extra ?? [])].filter(Boolean) as any[];

      // ---------- Core counts ----------
      const [apptToday] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, t0), lte(appointments.startAt, t1)])));
      const [apptYesterday] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, yesterday0), lte(appointments.startAt, yesterday1)])));

      const [noShowToday] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, t0), lte(appointments.startAt, t1), eq(appointments.status, "no_show")])));
      const [waitingNow] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, t0), lte(appointments.startAt, t1), eq(appointments.status, "checked_in")])));
      const [inProgress] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, t0), lte(appointments.startAt, t1), eq(appointments.status, "in_progress")])));

      const [completedWk] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, weekAgo), eq(appointments.status, "completed")])));
      const [totalWk] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, weekAgo)])));
      const [completedPrevWk] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, prevWeekStart), lt(appointments.startAt, weekAgo), eq(appointments.status, "completed")])));

      const [waUnread] = await db.select({ v: sql<number>`COALESCE(SUM(${waConversations.unreadCount}),0)` }).from(waConversations)
        .where(and(...wConds()));
      const [waOpen] = await db.select({ v: sql<number>`COUNT(*)` }).from(waConversations)
        .where(and(...wConds([sql`${waConversations.status} != 'closed'`])));

      const [newPatientsWk] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients)
        .where(and(scoped ? eq(patients.branchId, scoped) : undefined, gte(patients.createdAt, weekAgo), isNull(patients.deletedAt)));
      const [recallDue] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients)
        .where(and(scoped ? eq(patients.branchId, scoped) : undefined, lte(patients.nextRecallAt, new Date(Date.now() + 14 * 86400000)), isNull(patients.deletedAt)));

      const [openTasks] = await db.select({ v: sql<number>`COUNT(*)` }).from(tasks)
        .where(and(scoped ? eq(tasks.branchId, scoped) : undefined, sql`${tasks.status} != 'done'`));
      const [openIncidents] = await db.select({ v: sql<number>`COUNT(*)` }).from(incidentLogs)
        .where(and(scoped ? eq(incidentLogs.branchId, scoped) : undefined, eq(incidentLogs.status, "open")));

      // chair utilization right now
      const [chairsTotal] = await db.select({ v: sql<number>`COUNT(*)` }).from(chairs)
        .where(and(scoped ? eq(chairs.branchId, scoped) : undefined, eq(chairs.isActive, true)));
      const [chairsBusy] = await db.select({ v: sql<number>`COUNT(DISTINCT ${appointments.chairId})` }).from(appointments)
        .where(and(...aConds([gte(appointments.startAt, t0), lte(appointments.startAt, t1), eq(appointments.status, "in_progress")])));

      // ---------- Deltas ----------
      const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
      const apptDeltaPct = pct(num(apptToday?.v), num(apptYesterday?.v));
      const completionWk = num(totalWk?.v) > 0 ? Math.round((num(completedWk?.v) / num(totalWk?.v)) * 100) : null;
      const completionDeltaPct = pct(num(completedWk?.v), num(completedPrevWk?.v));
      const utilPct = num(chairsTotal?.v) > 0 ? Math.round((num(chairsBusy?.v) / num(chairsTotal?.v)) * 100) : null;

      // ---------- Financial (entitled roles only) ----------
      let revToday: number | null = null;
      let revYesterday: number | null = null;
      let revDeltaPct: number | null = null;
      if (canFin) {
        const [rt] = await db.select({ v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)` })
          .from(payments).where(and(...pConds([gte(payments.paidAt, t0), lte(payments.paidAt, t1)])));
        const [ry] = await db.select({ v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)` })
          .from(payments).where(and(...pConds([gte(payments.paidAt, yesterday0), lte(payments.paidAt, yesterday1)])));
        revToday = num(rt?.v);
        revYesterday = num(ry?.v);
        revDeltaPct = pct(revToday, revYesterday);
      }

      // ---------- HQ branch comparison ----------
      let branchLeaders: Array<{ name: string; value: number }> | null = null;
      let branchLaggards: Array<{ name: string; value: number }> | null = null;
      if (user.role === "hq" && !scoped) {
        const rows = await db.select({
          name: branches.name, v: sql<number>`COUNT(*)`,
        }).from(appointments).leftJoin(branches, eq(appointments.branchId, branches.id))
          .where(and(gte(appointments.startAt, weekAgo)))
          .groupBy(appointments.branchId, branches.name);
        rows.sort((a, b) => Number(b.v) - Number(a.v));
        branchLeaders = rows.slice(0, 3).map((r) => ({ name: String(r.name).replace("Medini Dental ", ""), value: num(r.v) }));
        branchLaggards = rows.slice(-3).reverse().map((r) => ({ name: String(r.name).replace("Medini Dental ", ""), value: num(r.v) }));
      }

      // ---------- Doctor workload ----------
      let myPendingNotes = 0;
      let myFollowUps = 0;
      if (isDoctor) {
        const [pn] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
          .leftJoin(clinicalNotes, eq(clinicalNotes.appointmentId, appointments.id))
          .where(and(eq(appointments.doctorId, user.id), eq(appointments.status, "completed"),
            isNull(clinicalNotes.id), gte(appointments.startAt, prevWeekStart)));
        myPendingNotes = num(pn?.v);
        const [fu] = await db.select({ v: sql<number>`COUNT(*)` }).from(appointments)
          .where(and(eq(appointments.doctorId, user.id), gte(appointments.startAt, new Date()), sql`${appointments.status} IN ('booked','confirmed')`));
        myFollowUps = num(fu?.v);
      }

      // ---------- Signals ----------
      const signals: Signal[] = [];
      const push = (s: Signal) => signals.push(s);

      if (num(noShowToday?.v) > 0)
        push({ id: "noshow", severity: num(noShowToday?.v) >= 3 ? "high" : "medium", kind: "operational", metric: num(noShowToday?.v), deterministic: true,
          title: `${num(noShowToday?.v)} no-show hari ini`, body: "Semak corak pembatalan lewat; pertimbang panggilan pengesahan lebih awal." });

      if (num(waitingNow?.v) >= 4)
        push({ id: "waiting", severity: num(waitingNow?.v) >= 8 ? "critical" : "high", kind: "operational", metric: num(waitingNow?.v), deterministic: true,
          title: `${num(waitingNow?.v)} pesakit sedang menunggu`, body: "Beban menunggu melebihi paras biasa — semak aliran giliran & kekerapan slot." });

      if (num(waUnread?.v) >= 5)
        push({ id: "wa-unread", severity: num(waUnread?.v) >= 15 ? "high" : "medium", kind: "communication", metric: num(waUnread?.v), deterministic: true,
          title: `${num(waUnread?.v)} mesej WhatsApp belum dibaca`, body: `${num(waOpen?.v)} perbualan aktif. Mesej tertunggak >30 minit dikira amaran merah.` });

      if (completionWk !== null && completionWk < 60)
        push({ id: "completion", severity: completionWk < 40 ? "high" : "medium", kind: "performance", metric: completionWk, deterministic: true,
          title: `Kadar siap minggu ini ${completionWk}%`, body: "Di bawah paras sihat 60%. Semak punca pembatalan/no-show berulang." });

      if (utilPct !== null && utilPct < 40 && num(apptToday?.v) > 0)
        push({ id: "util", severity: "medium", kind: "performance", metric: utilPct, deterministic: true,
          title: `Penggunaan kerusi ${utilPct}%`, body: "Banyak slot kosong — pertimbang tawaran waitlist/recall untuk mengisi jadual." });

      if (num(openTasks?.v) > 0)
        push({ id: "tasks", severity: num(openTasks?.v) >= 10 ? "high" : "info", kind: "operational", metric: num(openTasks?.v), deterministic: true,
          title: `${num(openTasks?.v)} tugasan belum selesai`, body: "Semak senarai tugasan harian cawangan." });

      if (num(openIncidents?.v) > 0)
        push({ id: "incidents", severity: "high", kind: "operational", metric: num(openIncidents?.v), deterministic: true,
          title: `${num(openIncidents?.v)} insiden terbuka`, body: "Insiden operasi memerlukan tindakan segera." });

      if (num(recallDue?.v) >= 10)
        push({ id: "recall", severity: "info", kind: "operational", metric: num(recallDue?.v), deterministic: true,
          title: `${num(recallDue?.v)} pesakit patut recall dalam 14 hari`, body: "Recall automatik akan dihantar ikut jadual; pantau kadar respons." });

      if (isDoctor && myPendingNotes > 0)
        push({ id: "pending-notes", severity: myPendingNotes >= 5 ? "high" : "medium", kind: "clinical", metric: myPendingNotes, deterministic: true,
          title: `${myPendingNotes} nota klinikal belum lengkap`, body: "Nota mesti disiapkan dalam 24 jam selepas rawatan (peraturan klinik)." });

      if (isDoctor && myFollowUps > 0)
        push({ id: "followups", severity: "info", kind: "clinical", metric: myFollowUps, deterministic: true,
          title: `${myFollowUps} follow-up akan datang`, body: "Temujanji booked/confirmed milik anda." });

      if (canFin && revDeltaPct !== null && revDeltaPct <= -20)
        push({ id: "rev-drop", severity: "high", kind: "financial", metric: revDeltaPct, deterministic: true,
          title: `Jualan semalam turun ${Math.abs(revDeltaPct)}%`, body: "Banding hari sebelumnya. Semak sama ada cuti, kurang booking atau isu kutipan." });

      if (user.role === "hq" && branchLaggards && branchLaggards.length > 0)
        push({ id: "branch-laggard", severity: "info", kind: "performance", metric: branchLaggards[0].value, deterministic: true,
          title: `${branchLaggards[0].name} paling rendah aktiviti minggu ini`, body: `${branchLaggards[0].value} temujanji dalam 7 hari — semak sama ada cuti doktor atau isu cawangan.` });

      // ---------- Priority actions ("What needs my attention now") ----------
      const priority: Array<{ rank: number; action: string; why: string; severity: Severity }> = [];
      const sevOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
      const sorted = [...signals].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || (b.metric ?? 0) - (a.metric ?? 0));
      sorted.slice(0, 4).forEach((s, i) => priority.push({ rank: i + 1, action: s.title, why: s.body, severity: s.severity }));
      if (priority.length === 0)
        priority.push({ rank: 1, action: "Tiada isu kritikal", why: "Semua penunjuk operasi dalam julat normal hari ini.", severity: "info" });

      const severityRank = { critical: 0, high: 1, medium: 2, info: 3 } as const;
      signals.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

      return {
        role: user.role,
        scopedBranchId: scoped,
        kpis: {
          apptToday: num(apptToday?.v),
          apptDeltaPct,
          completionWk,
          completionDeltaPct,
          waitingNow: num(waitingNow?.v),
          inProgress: num(inProgress?.v),
          waUnread: num(waUnread?.v),
          waOpen: num(waOpen?.v),
          newPatientsWk: num(newPatientsWk?.v),
          recallDue: num(recallDue?.v),
          openTasks: num(openTasks?.v),
          openIncidents: num(openIncidents?.v),
          utilPct,
          // financial — null unless entitled (never leaks to receptionist/doctor)
          revToday: canFin ? revToday : null,
          revDeltaPct: canFin ? revDeltaPct : null,
        },
        signals,
        priority,
        branchLeaders,
        branchLaggards,
        generatedAt: new Date(),
        deterministic: true,
      };
    }),
});
