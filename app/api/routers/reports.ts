import { z } from "zod";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permProc, scopeBranch } from "../auth";
import { getDb } from "../queries/connection";
import {
  payments, appointments, patients, branches, users, treatments,
  aiLogs, campaigns, invoices,
} from "../../db/schema";

const num = (v: unknown) => Number(v ?? 0);

export const reportsRouter = createRouter({
  overview: permProc("reports", "view")
    .input(z.object({ branchId: z.number().nullish(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const from = new Date(Date.now() - (input.days - 1) * 86400000);
      from.setHours(0, 0, 0, 0);

      const payConds = [gte(payments.paidAt, from), scoped ? eq(payments.branchId, scoped) : undefined].filter(Boolean) as any[];
      const apptConds = [gte(appointments.startAt, from), scoped ? eq(appointments.branchId, scoped) : undefined].filter(Boolean) as any[];

      // revenue trend
      const revTrend = await db.select({
        d: sql<string>`date(${payments.paidAt}/1000,'unixepoch')`,
        v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)`,
      }).from(payments).where(and(...payConds)).groupBy(sql`date(${payments.paidAt}/1000,'unixepoch')`).orderBy(sql`date(${payments.paidAt}/1000,'unixepoch')`);

      // revenue by branch
      const revByBranch = await db.select({
        name: branches.name, v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)`,
      }).from(payments).leftJoin(branches, eq(payments.branchId, branches.id))
        .where(and(...payConds)).groupBy(payments.branchId, branches.name);
      revByBranch.sort((a, b) => Number(b.v) - Number(a.v));

      // revenue by treatment (via invoices->items)
      const revByTreatment = await db.select({
        name: sql<string>`COALESCE(${treatments.category}, 'Other')`,
        v: sql<string>`COALESCE(SUM(${sql`invoice_items.total`}),0)`,
      }).from(sql`invoice_items`)
        .leftJoin(treatments, sql`invoice_items.treatment_id = ${treatments.id}`)
        .leftJoin(invoices, sql`invoice_items.invoice_id = ${invoices.id}`)
        .where(and(gte(invoices.issuedAt, from), scoped ? eq(invoices.branchId, scoped) : undefined))
        .groupBy(sql`COALESCE(${treatments.category}, 'Other')`);
      revByTreatment.sort((a, b) => Number(b.v) - Number(a.v));

      // appointment funnel
      const apptByStatus = await db.select({ status: appointments.status, v: sql<number>`COUNT(*)` })
        .from(appointments).where(and(...apptConds)).groupBy(appointments.status);
      const statusMap = Object.fromEntries(apptByStatus.map((a) => [a.status, num(a.v)]));
      const totalAppts = Object.values(statusMap).reduce((s, v) => s + v, 0);
      const completed = statusMap["completed"] ?? 0;

      // appointment source mix
      const apptBySource = await db.select({ source: appointments.source, v: sql<number>`COUNT(*)` })
        .from(appointments).where(and(...apptConds)).groupBy(appointments.source);

      // patient growth (by month, 6 months)
      const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); sixMonthsAgo.setDate(1); sixMonthsAgo.setHours(0, 0, 0, 0);
      const patConds = [gte(patients.createdAt, sixMonthsAgo), scoped ? eq(patients.branchId, scoped) : undefined].filter(Boolean) as any[];
      const patientGrowth = await db.select({
        m: sql<string>`strftime('%Y-%m', ${patients.createdAt}/1000, 'unixepoch')`,
        v: sql<number>`COUNT(*)`,
      }).from(patients).where(and(...patConds)).groupBy(sql`strftime('%Y-%m', ${patients.createdAt}/1000, 'unixepoch')`).orderBy(sql`strftime('%Y-%m', ${patients.createdAt}/1000, 'unixepoch')`);

      // new vs returning (patients with 1 vs >1 appointments)
      const apptCounts = await db.select({
        patientId: appointments.patientId, c: sql<number>`COUNT(*)`,
      }).from(appointments).where(and(...apptConds)).groupBy(appointments.patientId);
      const newPat = apptCounts.filter((a) => num(a.c) === 1).length;
      const returning = apptCounts.filter((a) => num(a.c) > 1).length;

      // doctor KPI
      const doctorKpi = await db.select({
        name: users.name, branchName: branches.name,
        visits: sql<number>`COUNT(*)`,
        revenue: sql<string>`COALESCE(SUM(${treatments.price}),0)`,
        noShows: sql<number>`SUM(CASE WHEN ${appointments.status}='no_show' THEN 1 ELSE 0 END)`,
      }).from(appointments)
        .leftJoin(users, eq(appointments.doctorId, users.id))
        .leftJoin(branches, eq(appointments.branchId, branches.id))
        .leftJoin(treatments, eq(appointments.treatmentId, treatments.id))
        .where(and(...apptConds, eq(appointments.status, "completed")))
        .groupBy(appointments.doctorId, users.name, branches.name);
      doctorKpi.sort((a, b) => Number(b.revenue) - Number(a.revenue));
      doctorKpi.splice(15);

      // AI performance
      const aiConds = [gte(aiLogs.createdAt, from), scoped ? eq(aiLogs.branchId, scoped) : undefined].filter(Boolean) as any[];
      const aiByAgent = await db.select({ agent: aiLogs.agent, v: sql<number>`COUNT(*)` })
        .from(aiLogs).where(and(...aiConds)).groupBy(aiLogs.agent);
      const [aiEsc] = await db.select({ v: sql<number>`COUNT(*)` }).from(aiLogs).where(and(...aiConds, eq(aiLogs.escalated, true)));
      const [aiTot] = await db.select({ v: sql<number>`COUNT(*)` }).from(aiLogs).where(and(...aiConds));

      // recall rate
      const [recallDue] = await db.select({ v: sql<number>`COUNT(*)` }).from(patients)
        .where(and(scoped ? eq(patients.branchId, scoped) : undefined, lte(patients.nextRecallAt, new Date(Date.now() + 14 * 86400000))));
      const [recallBooked] = await db.select({ v: sql<number>`COUNT(DISTINCT ${appointments.patientId})` })
        .from(appointments).innerJoin(patients, eq(appointments.patientId, patients.id))
        .where(and(...apptConds, lte(patients.nextRecallAt, new Date(Date.now() + 30 * 86400000)), sql`${appointments.status} IN ('booked','confirmed','completed')`));

      // campaigns
      const camps = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(10);

      return {
        revTrend: revTrend.map((r) => ({ date: r.d, value: num(r.v) })),
        revByBranch: revByBranch.map((r) => ({ name: r.name ?? "-", value: num(r.v) })),
        revByTreatment: revByTreatment.map((r) => ({ name: r.name, value: num(r.v) })),
        apptByStatus: statusMap,
        conversionRate: totalAppts ? Math.round((completed / totalAppts) * 100) : 0,
        noShowRate: totalAppts ? Math.round(((statusMap["no_show"] ?? 0) / totalAppts) * 100) : 0,
        apptBySource: apptBySource.map((r) => ({ name: r.source, value: num(r.v) })),
        patientGrowth: patientGrowth.map((r) => ({ month: r.m, value: num(r.v) })),
        newPatients: newPat, returningPatients: returning,
        doctorKpi: doctorKpi.map((r) => ({ name: r.name, branch: r.branchName, visits: num(r.visits), revenue: num(r.revenue), noShows: num(r.noShows) })),
        aiByAgent: aiByAgent.map((r) => ({ name: r.agent, value: num(r.v) })),
        aiTotal: num(aiTot?.v), aiEscalated: num(aiEsc?.v),
        recallDue: num(recallDue?.v), recallBooked: num(recallBooked?.v),
        campaigns: camps,
      };
    }),
});
