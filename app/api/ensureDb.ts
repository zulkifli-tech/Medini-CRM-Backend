import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { getDb } from "./queries/connection";

/**
 * Self-healing database bootstrap.
 * On first server start (fresh SQLite file), applies the generated Drizzle
 * migration SQL and seeds demo data. Idempotent: skips everything when the
 * schema already exists and contains data.
 */

let bootPromise: Promise<void> | null = null;

async function tableExists(name: string): Promise<boolean> {
  const row = await getDb().get(
    sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`),
  );
  return !!row;
}

async function rowCount(name: string): Promise<number> {
  const row: any = await getDb().get(sql.raw(`SELECT COUNT(*) AS c FROM "${name}"`));
  return Number(row?.c ?? 0);
}

function loadMigrationStatements(): string[] {
  const dir = join(process.cwd(), "db", "migrations");
  const file = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()[0];
  if (!file) throw new Error("No migration SQL found in db/migrations");
  return readFileSync(join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const db = getDb();

  if (await tableExists("branches")) {
    const count = await rowCount("branches");
    if (count > 0) {
      console.log(`[ensureDb] Schema present (${count} branches) — nothing to do.`);
      return;
    }
    console.log("[ensureDb] Schema present but empty — seeding…");
    const { runSeed } = await import("../db/seed");
    await runSeed();
    console.log("[ensureDb] Seed complete.");
    return;
  }

  console.log("[ensureDb] Fresh database — applying schema migrations…");
  const statements = loadMigrationStatements();
  for (const stmt of statements) {
    await db.run(sql.raw(stmt));
  }
  console.log(`[ensureDb] ${statements.length} statements applied.`);

  console.log("[ensureDb] Seeding demo data…");
  const { runSeed } = await import("../db/seed");
  await runSeed();
  console.log("[ensureDb] Bootstrap finished.");
}

export function ensureDatabase(): Promise<void> {
  if (!bootPromise) {
    bootPromise = bootstrap().catch((e) => {
      console.error("[ensureDb] Bootstrap failed:", e?.message ?? e);
      bootPromise = null; // allow retry on next request cycle
    });
  }
  return bootPromise;
}
