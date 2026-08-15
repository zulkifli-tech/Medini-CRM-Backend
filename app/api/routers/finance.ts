import { z } from "zod";
import { and, eq, gte, lte, desc, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permProc, scopeBranch, audit } from "../auth";
import { getDb } from "../queries/connection";
import {
  invoices, invoiceItems, payments, patients, branches, users,
  insuranceClaims, insurancePanels,
} from "../../db/schema";

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const num = (v: unknown) => Number(v ?? 0);

async function refreshInvoiceStatus(invoiceId: number) {
  const db = getDb();
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return;
  const [paid] = await db.select({
    v: sql<string>`COALESCE(SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END),0)`,
  }).from(payments).where(eq(payments.invoiceId, invoiceId));
  const totalDue = num(inv.total);
  const paidAmt = num(paid?.v);
  const status = paidAmt >= totalDue - 0.01 ? "paid" : paidAmt > 0 ? "partial" : "issued";
  await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
  return status;
}

export const financeRouter = createRouter({
  invoices: permProc("finance", "view")
    .input(z.object({
      branchId: z.number().nullish(),
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.number().default(1), pageSize: z.number().default(15),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(invoices.deletedAt)] as any[];
      if (scoped) conds.push(eq(invoices.branchId, scoped));
      if (input.status) conds.push(eq(invoices.status, input.status as any));
      if (input.search) {
        conds.push(sql`(${invoices.number} LIKE ${"%" + input.search + "%"} OR ${patients.name} LIKE ${"%" + input.search + "%"})`);
      }
      const base = db.select({
        invoice: invoices, patientName: patients.name, branchName: branches.name,
        paidAmount: sql<string>`(SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) FROM payments WHERE payments.invoice_id = ${invoices.id})`,
      }).from(invoices)
        .leftJoin(patients, eq(invoices.patientId, patients.id))
        .leftJoin(branches, eq(invoices.branchId, branches.id))
        .where(and(...conds));
      const [count] = await db.select({ v: sql<number>`COUNT(*)` }).from(invoices)
        .leftJoin(patients, eq(invoices.patientId, patients.id)).where(and(...conds));
      const rows = await base.orderBy(desc(invoices.issuedAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
      return { total: num(count?.v), rows: rows.map((r) => ({ ...r, paidAmount: num(r.paidAmount) })) };
    }),

  invoiceDetail: permProc("finance", "view")
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [inv] = await db.select({
        invoice: invoices, patientName: patients.name, patientPhone: patients.phone, branchName: branches.name,
      }).from(invoices)
        .leftJoin(patients, eq(invoices.patientId, patients.id))
        .leftJoin(branches, eq(invoices.branchId, branches.id))
        .where(eq(invoices.id, input.id)).limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));
      const pays = await db.select({ payment: payments, receivedBy: users.name })
        .from(payments).leftJoin(users, eq(payments.receivedById, users.id))
        .where(eq(payments.invoiceId, input.id)).orderBy(desc(payments.paidAt));
      const claims = await db.select({ claim: insuranceClaims, panelName: insurancePanels.name })
        .from(insuranceClaims).leftJoin(insurancePanels, eq(insuranceClaims.panelId, insurancePanels.id))
        .where(eq(insuranceClaims.invoiceId, input.id));
      return { ...inv, items, payments: pays, claims };
    }),

  createInvoice: permProc("finance", "create")
    .input(z.object({
      branchId: z.number(), patientId: z.number(),
      items: z.array(z.object({
        treatmentId: z.number().optional(), description: z.string().min(2),
        qty: z.number().min(1).default(1), unitPrice: z.number(),
      })).min(1),
      insuranceAmount: z.number().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      if (!scoped) throw new TRPCError({ code: "BAD_REQUEST" });
      const subtotal = input.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      const [maxNum] = await db.select({ v: sql<string>`MAX(${invoices.number})` }).from(invoices);
      const nextNum = (parseInt(maxNum?.v?.replace("INV-", "") || "260000", 10) || 260000) + 1;
      const r = await db.insert(invoices).values({
        branchId: scoped, patientId: input.patientId, number: `INV-${nextNum}`,
        status: "issued", subtotal, tax: 0, total: subtotal,
        insuranceAmount: input.insuranceAmount, notes: input.notes ?? null,
        dueAt: new Date(Date.now() + 14 * 86400000), createdById: ctx.user.id,
      });
      await db.insert(invoiceItems).values(input.items.map((it) => ({
        invoiceId: Number(r.lastInsertRowid), treatmentId: it.treatmentId ?? null, description: it.description,
        qty: it.qty, unitPrice: it.unitPrice, total: it.qty * it.unitPrice,
      })));
      await audit(ctx.user, { module: "finance", action: "create_invoice", entity: "invoice", entityId: Number(r.lastInsertRowid), branchId: scoped });
      return { id: Number(r.lastInsertRowid), number: `INV-${nextNum}` };
    }),

  recordPayment: permProc("finance", "create")
    .input(z.object({
      invoiceId: z.number(), amount: z.number().positive(),
      method: z.enum(["cash", "card", "ewallet", "bank_transfer", "insurance", "deposit"]),
      kind: z.enum(["full", "partial", "installment", "deposit", "insurance", "refund"]),
      reference: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      const r = await db.insert(payments).values({
        branchId: inv.branchId, invoiceId: input.invoiceId, patientId: inv.patientId,
        amount: input.amount, method: input.method, kind: input.kind,
        reference: input.reference ?? `RCP-${Date.now().toString().slice(-6)}`, receivedById: ctx.user.id,
      });
      const status = await refreshInvoiceStatus(input.invoiceId);
      await audit(ctx.user, { module: "finance", action: "record_payment", entity: "payment", entityId: Number(r.lastInsertRowid), detail: `RM${input.amount} (${input.kind})`, branchId: inv.branchId });
      return { id: Number(r.lastInsertRowid), invoiceStatus: status };
    }),

  outstanding: permProc("finance", "view")
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [sql`${invoices.status} IN ('issued','partial')`, isNull(invoices.deletedAt)] as any[];
      if (scoped) conds.push(eq(invoices.branchId, scoped));
      const rows = await db.select({
        invoice: invoices, patientName: patients.name, patientPhone: patients.phone, branchName: branches.name,
        paidAmount: sql<string>`(SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) FROM payments WHERE payments.invoice_id = ${invoices.id})`,
      }).from(invoices)
        .leftJoin(patients, eq(invoices.patientId, patients.id))
        .leftJoin(branches, eq(invoices.branchId, branches.id))
        .where(and(...conds)).orderBy(invoices.dueAt).limit(100);
      return rows.map((r) => ({ ...r, paidAmount: num(r.paidAmount), balance: num(r.invoice.total) - num(r.paidAmount) }));
    }),

  ledger: permProc("finance", "view")
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const invs = await db.select().from(invoices).where(eq(invoices.patientId, input.patientId)).orderBy(desc(invoices.issuedAt));
      const pays = await db.select().from(payments).where(eq(payments.patientId, input.patientId)).orderBy(desc(payments.paidAt));
      return { invoices: invs, payments: pays };
    }),

  dailyClosing: permProc("finance", "view")
    .input(z.object({ branchId: z.number().nullish(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const d = input.date ?? new Date();
      const conds = [gte(payments.paidAt, dayStart(d)), lte(payments.paidAt, dayEnd(d))] as any[];
      if (scoped) conds.push(eq(payments.branchId, scoped));
      const byMethod = await db.select({
        method: payments.method,
        v: sql<string>`COALESCE(SUM(CASE WHEN ${payments.kind}='refund' THEN -${payments.amount} ELSE ${payments.amount} END),0)`,
        count: sql<number>`COUNT(*)`,
      }).from(payments).where(and(...conds)).groupBy(payments.method);
      const rows = await db.select({ payment: payments, patientName: patients.name, invoiceNo: invoices.number })
        .from(payments)
        .leftJoin(patients, eq(payments.patientId, patients.id))
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(and(...conds)).orderBy(desc(payments.paidAt));
      const total = byMethod.reduce((s, m) => s + num(m.v), 0);
      return { byMethod: byMethod.map((m) => ({ method: m.method, value: num(m.v), count: num(m.count) })), rows, total };
    }),

  claims: permProc("finance", "view")
    .input(z.object({ branchId: z.number().nullish() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scoped = scopeBranch(ctx.user, input.branchId);
      const conds = [isNull(insuranceClaims.deletedAt)] as any[];
      if (scoped) conds.push(eq(insuranceClaims.branchId, scoped));
      return db.select({
        claim: insuranceClaims, patientName: patients.name, panelName: insurancePanels.name,
        invoiceNo: invoices.number, branchName: branches.name,
      }).from(insuranceClaims)
        .leftJoin(patients, eq(insuranceClaims.patientId, patients.id))
        .leftJoin(insurancePanels, eq(insuranceClaims.panelId, insurancePanels.id))
        .leftJoin(invoices, eq(insuranceClaims.invoiceId, invoices.id))
        .leftJoin(branches, eq(insuranceClaims.branchId, branches.id))
        .where(and(...conds)).orderBy(desc(insuranceClaims.submittedAt)).limit(100);
    }),

  updateClaimStatus: permProc("finance", "approve")
    .input(z.object({ id: z.number(), status: z.enum(["submitted", "approved", "rejected", "paid"]) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().update(insuranceClaims).set({ status: input.status }).where(eq(insuranceClaims.id, input.id));
      await audit(ctx.user, { module: "finance", action: `claim:${input.status}`, entity: "insurance_claim", entityId: input.id });
      return { ok: true };
    }),
});
