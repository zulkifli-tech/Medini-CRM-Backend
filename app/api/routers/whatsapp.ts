import { z } from "zod";
import { and, eq, desc, sql, isNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProc, permProc, scopeBranch, audit } from "../auth";
import { getDb } from "../queries/connection";
import {
  waConversations, waMessages, branches, aiLogs,
} from "../../db/schema";

// ---------------------------------------------------------------------------
// Simulated AI reply engine — pattern-matches patient messages and answers
// from the knowledge base, exactly how the WAHA + LLM pipeline will behave.
// ---------------------------------------------------------------------------
function craftAiReply(message: string, ctx: { name: string; branchName: string }): { body: string; action: string; confidence: number; escalated: boolean } {
  const m = message.toLowerCase();
  const hi = ctx.name.split(" ")[0];
  if (/(book|booking|appointment|temujanji|slot)/.test(m)) {
    return {
      body: `Hi ${hi}! 😊 Saya boleh bantu tempahkan slot. Doktor kami masih ada kekosongan esok 10:30am dan 2:30pm di ${ctx.branchName}. Yang mana sesuai untuk anda?`,
      action: "Slot recommendation", confidence: 0.93, escalated: false,
    };
  }
  if (/(price|harga|berapa|cost|rm|charge)/.test(m)) {
    const t = m.includes("braces") ? "Rawatan braces penuh bermula dari RM6,500 termasuk adjustment dan retainer. Pelan ansuran 0% sehingga 12 bulan tersedia."
      : m.includes("whit") ? "Teeth whitening ialah RM900, termasuk konsultasi doktor."
      : "Scaling & polishing ialah RM180. Boleh saya cadangkan slot untuk anda?";
    return { body: t, action: "Answered pricing enquiry", confidence: 0.91, escalated: false };
  }
  if (/(pain|sakit|emergency|urgent|bengkak)/.test(m)) {
    return {
      body: `Kesian ${hi}! Sakit gigi tidak patut ditunggu. Slot kecemasan hari ini masih ada pada 3:45pm di ${ctx.branchName}. Boleh saya tempahkan untuk anda sekarang?`,
      action: "Emergency triage", confidence: 0.96, escalated: false,
    };
  }
  if (/(insurance|insurans|panel|aia|great eastern|prudential|allianz)/.test(m)) {
    return {
      body: "Kami ialah klinik panel untuk AIA, Great Eastern, Prudential BSN, Allianz dan MiCare. Bawa IC dan kad insurans anda untuk lawatan tanpa tunai (cashless). Ada apa-apa lagi yang boleh saya bantu?",
      action: "Answered insurance enquiry", confidence: 0.88, escalated: false,
    };
  }
  if (/(hour|waktu|buka|tutup|open|close|operat)/.test(m)) {
    return {
      body: "Semua cawangan Medini Dental dibuka setiap hari 9am–9pm termasuk hujung minggu. Nak saya tempahkan slot untuk anda?",
      action: "Answered hours enquiry", confidence: 0.95, escalated: false,
    };
  }
  if (/(thank|terima kasih|tq|ok|okay|baik)/.test(m)) {
    return {
      body: "Sama-sama! 💚 Jika ada apa-apa lagi, saya di sini 24/7. Jumpa di klinik!",
      action: "Courtesy reply", confidence: 0.97, escalated: false,
    };
  }
  if (/(human|staff|orang|agent|complain|complaint|marah|refund)/.test(m)) {
    return {
      body: "Baik, saya sambungkan anda kepada staf kami sekarang. Sebentar ya 🙏",
      action: "Escalated to human", confidence: 0.41, escalated: true,
    };
  }
  return {
    body: `Terima kasih atas mesej anda, ${hi}! Untuk pertanyaan ini, izinkan saya semak dengan pasukan kami dan kami akan balas sebentar lagi. 🙏`,
    action: "Escalated to human", confidence: 0.38, escalated: true,
  };
}

export const whatsappRouter = createRouter({
  sessions: authedProc.query(async ({ ctx }) => {
    const db = getDb();
    const scoped = scopeBranch(ctx.user, null);
    const conds = [eq(branches.isActive, true)] as any[];
    if (scoped) conds.push(eq(branches.id, scoped));
    const rows = await db.select({
      branch: branches,
      open: sql<number>`(SELECT COUNT(*) FROM wa_conversations WHERE wa_conversations.branch_id = ${branches.id} AND wa_conversations.status != 'closed')`,
      unread: sql<number>`(SELECT COALESCE(SUM(unread_count),0) FROM wa_conversations WHERE wa_conversations.branch_id = ${branches.id})`,
    }).from(branches).where(and(...conds)).orderBy(branches.id);
    return rows;
  }),

  conversations: authedProc
    .input(z.object({ branchId: z.number().nullish(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(waConversations.deletedAt)] as any[];
      if (scoped) conds.push(eq(waConversations.branchId, scoped));
      if (input.status) conds.push(eq(waConversations.status, input.status as any));
      return db.select({
        conv: waConversations, branchName: branches.name,
        lastMessage: sql<string>`(SELECT body FROM wa_messages WHERE wa_messages.conversation_id = ${waConversations.id} ORDER BY created_at DESC LIMIT 1)`,
      }).from(waConversations)
        .leftJoin(branches, eq(waConversations.branchId, branches.id))
        .where(and(...conds)).orderBy(desc(waConversations.lastMessageAt)).limit(100);
    }),

  messages: authedProc
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const msgs = await db.select().from(waMessages)
        .where(eq(waMessages.conversationId, input.conversationId)).orderBy(asc(waMessages.createdAt));
      await db.update(waConversations).set({ unreadCount: 0 }).where(eq(waConversations.id, input.conversationId));
      return msgs;
    }),

  // Staff sends a message (human takeover mode) OR patient message arrives → AI replies
  sendStaffMessage: permProc("whatsapp", "create")
    .input(z.object({ conversationId: z.number(), body: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const r = await db.insert(waMessages).values({
        conversationId: input.conversationId, direction: "outbound", sender: "staff",
        body: input.body, status: "delivered",
      });
      await db.update(waConversations).set({ lastMessageAt: new Date() }).where(eq(waConversations.id, input.conversationId));
      return { id: Number(r.lastInsertRowid) };
    }),

  simulateInbound: authedProc
    .input(z.object({ conversationId: z.number(), body: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [conv] = await db.select({ conv: waConversations, branchName: branches.name })
        .from(waConversations).leftJoin(branches, eq(waConversations.branchId, branches.id))
        .where(eq(waConversations.id, input.conversationId)).limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });

      await db.insert(waMessages).values({
        conversationId: input.conversationId, direction: "inbound", sender: "patient",
        body: input.body, status: "read",
      });

      if (conv.conv.status === "human_takeover") {
        await db.update(waConversations).set({ lastMessageAt: new Date(), unreadCount: conv.conv.unreadCount + 1 })
          .where(eq(waConversations.id, input.conversationId));
        return { aiReplied: false, reason: "human_takeover" };
      }

      const reply = craftAiReply(input.body, { name: conv.conv.contactName, branchName: conv.branchName ?? "Medini Dental" });
      await db.insert(waMessages).values({
        conversationId: input.conversationId, direction: "outbound", sender: "ai",
        body: reply.body, status: "delivered",
      });
      await db.insert(aiLogs).values({
        branchId: conv.conv.branchId, agent: (conv.conv.aiAgent as any) ?? "receptionist",
        action: reply.action, conversationId: input.conversationId,
        detail: `Inbound: "${input.body.slice(0, 120)}" → ${reply.action}`,
        confidence: reply.confidence, escalated: reply.escalated,
      });
      await db.update(waConversations).set({
        lastMessageAt: new Date(),
        status: reply.escalated ? "human_takeover" : "ai_handled",
        unreadCount: reply.escalated ? conv.conv.unreadCount + 1 : 0,
      }).where(eq(waConversations.id, input.conversationId));
      return { aiReplied: true, reply: reply.body, escalated: reply.escalated, confidence: reply.confidence };
    }),

  toggleTakeover: permProc("whatsapp", "edit")
    .input(z.object({ conversationId: z.number(), human: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(waConversations)
        .set({ status: input.human ? "human_takeover" : "ai_handled" })
        .where(eq(waConversations.id, input.conversationId));
      await audit(ctx.user, { module: "whatsapp", action: input.human ? "human_takeover" : "ai_handover", entity: "conversation", entityId: input.conversationId });
      return { ok: true };
    }),

  closeConversation: permProc("whatsapp", "edit")
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().update(waConversations).set({ status: "closed" }).where(eq(waConversations.id, input.conversationId));
      return { ok: true };
    }),
});
