/**
 * PHASE 3.1 — Automated Regression Tests
 *
 * Converts the verified security guarantees (17/17 attack scenarios) into
 * permanent Vitest coverage so future changes cannot silently reintroduce
 * the leaks that were found and fixed.
 *
 * Strategy: call the REAL tRPC procedures via appRouter.createCaller() with
 * forged session tokens — the same enforcement path the HTTP API uses
 * (getSessionUser → authedProc → permProc/scopeBranch → query).
 *
 * A dedicated SQLite file (data/test-medini.db) is used so the demo database
 * is never touched. The file is deleted after the run.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "fs";
import { join } from "path";

process.chdir(__dirname.replace(/[\\/]api$/, "")); // anchor cwd at app root
process.env.MEDINI_DB = "test-medini.db";

const { appRouter } = await import("./router");
const { signSession } = await import("./auth");
const { ensureDatabase } = await import("./ensureDb");
const { getDb } = await import("./queries/connection");
const schema = await import("@db/schema");
const { eq } = await import("drizzle-orm");

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
type Ctx = { req: Request; resHeaders: Headers };

function ctxFor(token: string | null): Ctx {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return { req: new Request("http://test.local/api/trpc", { headers }), resHeaders: new Headers() };
}

const users: Record<string, any> = {};
const callers: Record<string, ReturnType<typeof appRouter.createCaller>> = {};

const FINANCIAL_KEYS = [
  "revenueToday",
  "revenueMonth",
  "trend",
  "outstanding",
  "claimsByStatus",
  "momPct",
  "collection7d",
] as const;

beforeAll(async () => {
  await ensureDatabase();
  const db = getDb();
  for (const username of ["hq", "manager", "reception", "doctor"]) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    if (!u) throw new Error(`seed user '${username}' not found`);
    users[username] = u;
    callers[username] = appRouter.createCaller(ctxFor(signSession(u.id)) as any);
  }
}, 60_000);

afterAll(async () => {
  // Close the SQLite handle first — better-sqlite3 holds an OS file lock on
  // Windows, so rmSync would fail while the connection is open.
  try {
    const sqlite = (getDb() as any).$client;
    sqlite?.close?.();
  } catch {
    /* best effort */
  }
  await new Promise((r) => setTimeout(r, 100));
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(join(process.cwd(), "data", `test-medini.db${suffix}`), { force: true });
    } catch {
      /* best effort */
    }
  }
});

const expectForbidden = (p: Promise<unknown>) =>
  expect(p).rejects.toMatchObject({ code: "FORBIDDEN" });

// ---------------------------------------------------------------------------
// F. Phase 4 — Intelligence layer isolation
// ---------------------------------------------------------------------------
describe("F. Phase 4 intelligence isolation", () => {
  const INTEL_FIN_KEYS = ["revToday", "revDeltaPct"] as const;

  it("F1: Receptionist intelligence returns null financial kpis", async () => {
    const r = await callers.reception.intelligence.signals({});
    for (const k of INTEL_FIN_KEYS) expect(r.kpis, `kpi '${k}' must be null`).toHaveProperty(k, null);
    expect(r.kpis).toHaveProperty("apptToday");
  });

  it("F2: Doctor intelligence returns null financial kpis", async () => {
    const r = await callers.doctor.intelligence.signals({});
    for (const k of INTEL_FIN_KEYS) expect(r.kpis).toHaveProperty(k, null);
  });

  it("F3: HQ intelligence retains financial kpis + branch pulse", async () => {
    const r = await callers.hq.intelligence.signals({});
    expect(r.kpis.revToday).not.toBeNull();
    expect(Array.isArray(r.branchLeaders)).toBe(true);
    expect((r.branchLeaders ?? []).length).toBeGreaterThan(0);
  });

  it("F4: Manager intelligence is own-branch scoped + financial entitled", async () => {
    const r = await callers.manager.intelligence.signals({});
    expect(r.scopedBranchId).toBe(users.manager.branchId);
    expect(r.kpis.revToday).not.toBeNull();
  });

  it("F5: Manager cannot forge foreign branch via intelligence.signals", async () => {
    const r = await callers.manager.intelligence.signals({ branchId: 1 });
    expect(r.scopedBranchId).toBe(users.manager.branchId);
  });

  it("F6: All signals are deterministic + valid severity", async () => {
    const r = await callers.hq.intelligence.signals({});
    for (const s of r.signals) {
      expect(s.deterministic).toBe(true);
      expect(["critical", "high", "medium", "info"]).toContain(s.severity);
    }
    expect(r.priority.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// A. RBAC — module-level access
// ---------------------------------------------------------------------------
describe("A. RBAC", () => {
  it("A1: Receptionist cannot access Finance", async () => {
    await expectForbidden(callers.reception.finance.invoices({}));
    await expectForbidden(callers.reception.finance.outstanding({}));
    await expectForbidden(callers.reception.finance.dailyClosing({}));
    await expectForbidden(callers.reception.finance.ledger({ patientId: 1 }));
  });

  it("A2: Receptionist cannot access Reports", async () => {
    await expectForbidden(callers.reception.reports.overview({ days: 30 }));
  });

  it("A3: Receptionist cannot access Marketing", async () => {
    await expectForbidden(callers.reception.marketing.campaigns({}));
  });

  it("A4: Doctor cannot access Finance", async () => {
    await expectForbidden(callers.doctor.finance.invoices({}));
  });

  it("A5: Doctor cannot access Reports", async () => {
    await expectForbidden(callers.doctor.reports.overview({ days: 30 }));
  });

  it("A6: Doctor cannot access Marketing", async () => {
    await expectForbidden(callers.doctor.marketing.campaigns({}));
  });

  it("A7: Manager cannot access admin.users", async () => {
    await expectForbidden(callers.manager.admin.users());
  });
});

// ---------------------------------------------------------------------------
// B. Dashboard data protection — financial truth isolation
// ---------------------------------------------------------------------------
describe("B. Dashboard financial isolation", () => {
  it("B1: Receptionist dashboard.stats contains NO financial fields", async () => {
    const d = await callers.reception.dashboard.stats({});
    for (const k of FINANCIAL_KEYS) expect(d, `key '${k}' must be absent`).not.toHaveProperty(k);
    // operational fields must still be present
    expect(d).toHaveProperty("appointmentsToday");
    expect(d).toHaveProperty("totalPatients");
  });

  it("B2: Doctor dashboard.stats contains NO financial fields", async () => {
    const d = await callers.doctor.dashboard.stats({});
    for (const k of FINANCIAL_KEYS) expect(d, `key '${k}' must be absent`).not.toHaveProperty(k);
    expect(d).toHaveProperty("mySchedule");
  });

  it("B3: HQ dashboard.stats retains legitimate financial fields", async () => {
    const d = await callers.hq.dashboard.stats({});
    expect(d).toHaveProperty("revenueToday");
    expect(d).toHaveProperty("revenueMonth");
    expect(d).toHaveProperty("trend");
    expect(d).toHaveProperty("outstanding");
  });

  it("B4: Branch Manager dashboard.stats retains legitimate financial fields", async () => {
    const d = await callers.manager.dashboard.stats({});
    expect(d).toHaveProperty("revenueToday");
    expect(d).toHaveProperty("collection7d");
  });
});

// ---------------------------------------------------------------------------
// C. Branch isolation
// ---------------------------------------------------------------------------
describe("C. Branch isolation", () => {
  it("C1: Manager cannot force another branch through patients.list", async () => {
    const res = await callers.manager.patients.list({ branchId: 1, pageSize: 15 });
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.patient.branchId).toBe(users.manager.branchId);
    }
  });

  it("C2: Manager cannot access another branch patient via patients.get360", async () => {
    // find a patient on a branch other than the manager's (via HQ view)
    const res = await callers.hq.patients.list({ pageSize: 50 });
    const foreign = res.rows.find((r: any) => r.patient.branchId !== users.manager.branchId);
    expect(foreign).toBeTruthy();
    await expectForbidden(callers.manager.patients.get360({ id: foreign!.patient.id }));
  });

  it("C3: Manager Finance data remains own-branch scoped", async () => {
    const res = await callers.manager.finance.invoices({ pageSize: 15 });
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.invoice.branchId).toBe(users.manager.branchId);
    }
  });
});

// ---------------------------------------------------------------------------
// D. Doctor isolation
// ---------------------------------------------------------------------------
describe("D. Doctor isolation", () => {
  it("D1: Doctor cannot access another doctor's appointment data", async () => {
    const otherDoctorId = users.doctor.id + 1; // any id that is not self
    const from = new Date(Date.now() - 30 * 86400000);
    const to = new Date(Date.now() + 30 * 86400000);
    const rows = await callers.doctor.appointments.list({
      doctorId: otherDoctorId,
      from,
      to,
    });
    for (const row of rows) {
      expect(row.appointment.doctorId).toBe(users.doctor.id);
    }
  });

  it("D2: Server forces doctor scope to current doctor (clinical notes)", async () => {
    const rows = await callers.doctor.clinical.notes({});
    for (const row of rows) {
      expect(row.note.doctorId).toBe(users.doctor.id);
    }
  });
});

// ---------------------------------------------------------------------------
// E. Regression — legitimate access must keep working
// ---------------------------------------------------------------------------
describe("E. Regression (legitimate access)", () => {
  it("E1: HQ retains full Finance + Reports access", async () => {
    const inv = await callers.hq.finance.invoices({ pageSize: 5 });
    expect(inv.total).toBeGreaterThan(0);
    const rep = await callers.hq.reports.overview({ days: 30 });
    expect(rep.revTrend.length).toBeGreaterThan(0);
  });

  it("E2: Branch Manager retains legitimate Finance + Reports access", async () => {
    const inv = await callers.manager.finance.invoices({ pageSize: 5 });
    expect(inv.rows.length).toBeGreaterThan(0);
    const rep = await callers.manager.reports.overview({ days: 30 });
    expect(rep).toBeTruthy();
  });

  it("E3: HQ sees all branches in patients.list when no branchId given", async () => {
    const res = await callers.hq.patients.list({ pageSize: 50 });
    const branchSet = new Set(res.rows.map((r: any) => r.patient.branchId));
    expect(branchSet.size).toBeGreaterThan(1); // multi-branch proof
  });
});
