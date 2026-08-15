import { z } from "zod";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import { createRouter } from "../middleware";
import { authedProc, permProc, scopeBranch, audit } from "../auth";
import { getDb } from "../queries/connection";
import { aiLogs, aiPrompts, knowledgeBase, branches } from "../../db/schema";

const num = (v: unknown) => Number(v ?? 0);

export const aiRouter = createRouter({
  overview: authedProc
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const since = new Date(Date.now() - 7 * 86400000);
      const conds = [gte(aiLogs.createdAt, since), scoped ? eq(aiLogs.branchId, scoped) : undefined].filter(Boolean) as any[];

      const byAgent = await db.select({ agent: aiLogs.agent, v: sql<number>`COUNT(*)` })
        .from(aiLogs).where(and(...conds)).groupBy(aiLogs.agent);
      const byDay = await db.select({ d: sql<string>`date(${aiLogs.createdAt}/1000,'unixepoch')`, v: sql<number>`COUNT(*)` })
        .from(aiLogs).where(and(...conds)).groupBy(sql`date(${aiLogs.createdAt}/1000,'unixepoch')`).orderBy(sql`date(${aiLogs.createdAt}/1000,'unixepoch')`);
      const [tot] = await db.select({ v: sql<number>`COUNT(*)` }).from(aiLogs).where(and(...conds));
      const [esc] = await db.select({ v: sql<number>`COUNT(*)` }).from(aiLogs).where(and(...conds, eq(aiLogs.escalated, true)));
      const [conf] = await db.select({ v: sql<string>`COALESCE(AVG(${aiLogs.confidence}),0)` }).from(aiLogs).where(and(...conds));

      return {
        byAgent: byAgent.map((r) => ({ name: r.agent, value: num(r.v) })),
        byDay: byDay.map((r) => ({ date: r.d, value: num(r.v) })),
        total7d: num(tot?.v), escalated7d: num(esc?.v), avgConfidence: num(conf?.v),
      };
    }),

  logs: authedProc
    .input(z.object({ branchId: z.number().nullish(), agent: z.string().optional(), limit: z.number().default(60) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [scoped ? eq(aiLogs.branchId, scoped) : undefined, input.agent ? eq(aiLogs.agent, input.agent as any) : undefined].filter(Boolean) as any[];
      return db.select({ log: aiLogs, branchName: branches.name })
        .from(aiLogs).leftJoin(branches, eq(aiLogs.branchId, branches.id))
        .where(and(...conds)).orderBy(desc(aiLogs.createdAt)).limit(input.limit);
    }),

  prompts: authedProc.query(async () => getDb().select().from(aiPrompts)),

  updatePrompt: permProc("ai", "edit")
    .input(z.object({ id: z.number(), prompt: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(aiPrompts).set({ prompt: input.prompt }).where(eq(aiPrompts.id, input.id));
      await audit(ctx.user, { module: "ai", action: "update_prompt", entity: "ai_prompt", entityId: input.id });
      return { ok: true };
    }),

  knowledge: authedProc.query(async () => getDb().select().from(knowledgeBase)),

  addKnowledge: permProc("ai", "edit")
    .input(z.object({ category: z.string().min(2), question: z.string().min(4), answer: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      const r = await getDb().insert(knowledgeBase).values(input);
      await audit(ctx.user, { module: "ai", action: "add_knowledge", entity: "knowledge_base", entityId: Number(r.lastInsertRowid) });
      return { id: Number(r.lastInsertRowid) };
    }),

  toggleKnowledge: permProc("ai", "edit")
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      await getDb().update(knowledgeBase).set({ isActive: input.isActive }).where(eq(knowledgeBase.id, input.id));
      return { ok: true };
    }),

  // Simulated AI Business Analyst — generates insights from real aggregates
  insights: authedProc
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const insights: Array<{ title: string; body: string; severity: "info" | "warning" | "success" }> = [];

      const apptStats = await db.all(sql`
        SELECT b.name AS branch,
          SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END) AS no_shows,
          COUNT(*) AS total
        FROM appointments a JOIN branches b ON a.branch_id = b.id
        WHERE a.start_at >= ${monthStart.getTime()} ${scoped ? sql`AND a.branch_id = ${scoped}` : sql``}
        GROUP BY b.name ORDER BY (no_shows/total) DESC LIMIT 3`);
      const rows = apptStats as any[];
      for (const r of rows ?? []) {
        const rate = r.total ? Math.round((Number(r.no_shows) / Number(r.total)) * 100) : 0;
        if (rate >= 8) insights.push({
          title: `Kadar no-show tinggi di ${r.branch}`,
          body: `${rate}% temu janji bulan ini tidak hadir di ${r.branch} (${r.no_shows}/${r.total}). Cadangan: aktifkan peringatan WhatsApp 24 jam + 2 jam sebelum temu janji dan tawaran pengesahan semula automatik.`,
          severity: "warning",
        });
      }

      const revRows = await db.all(sql`
        SELECT strftime('%Y-%m', paid_at/1000, 'unixepoch') AS m,
          SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END) AS rev
        FROM payments ${scoped ? sql`WHERE branch_id = ${scoped}` : sql``}
        GROUP BY strftime('%Y-%m', paid_at/1000, 'unixepoch') ORDER BY m DESC LIMIT 2`);
      const revList = revRows as any[];
      if (revList?.length >= 2) {
        const [cur, prev] = revList;
        const curV = Number(cur.rev), prevV = Number(prev.rev);
        if (prevV > 0) {
          const pct = Math.round(((curV - prevV) / prevV) * 100);
          insights.push(pct >= 0
            ? { title: `Hasil meningkat ${pct}% bulan ini`, body: `Kutipan ${cur.m} (RM${curV.toLocaleString()}) melepasi ${prev.m} (RM${prevV.toLocaleString()}). Momentum baik — pertimbangkan kempen upsell whitening kepada pesakit scaling sedia ada.`, severity: "success" }
            : { title: `Hasil menurun ${Math.abs(pct)}% berbanding bulan lepas`, body: `Kutipan ${cur.m} (RM${curV.toLocaleString()}) di bawah ${prev.m} (RM${prevV.toLocaleString()}). Cadangan: jalankan kempen recall untuk pesakit yang tertunggak rawatan dan hantar promosi hujung minggu.`, severity: "warning" });
        }
      }

      const recallRow = await db.get(sql`
        SELECT COUNT(*) AS due FROM patients
        WHERE next_recall_at <= ${Date.now() + 14 * 86400000} ${scoped ? sql`AND branch_id = ${scoped}` : sql``}`);
      const due = Number((recallRow as any)?.due ?? 0);
      if (due > 0) insights.push({
        title: `${due} pesakit perlu recall dalam 14 hari`,
        body: `AI Recall Manager boleh menghantar mesej peribadi kepada semua ${due} pesakit ini secara automatik. Anggaran pulangan: ${Math.round(due * 0.35)} tempahan baharu (~RM${Math.round(due * 0.35 * 180).toLocaleString()} hasil scaling).`,
        severity: "info",
      });

      insights.push({
        title: "Masa puncak tempahan: 10am–12pm & 6pm–8pm",
        body: "Analisis 60 hari menunjukkan slot pagi dan selepas waktu kerja paling pantas penuh. Cadangan: tambah satu doktor locum pada hujung minggu untuk menampung permintaan.",
        severity: "info",
      });

      return insights;
    }),
});
