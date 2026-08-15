import { mkdirSync } from "fs";
import { join } from "path";
import * as schema from "@db/schema";
import * as relations from "@db/relations";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

const fullSchema = { ...schema, ...relations };

type Db = BetterSQLite3Database<typeof fullSchema>;

// Load the driver and native binding from node_modules at runtime instead of
// letting esbuild bundle them: better-sqlite3 is a native CJS module whose
// bindings loader needs a real __filename/module path to find the .node file.
// Variable specifiers keep these dynamic imports out of the server bundle.
const driverPkg = "drizzle-orm/better-sqlite3";
const sqlitePkg = "better-sqlite3";
const { drizzle } = (await import(driverPkg)) as typeof import("drizzle-orm/better-sqlite3");
const Database = ((await import(sqlitePkg)) as { default: typeof BetterSqlite3 }).default;

let instance: Db;

export function getDb(): Db {
  if (!instance) {
    const dir = join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    // Test harnesses may override the database file via MEDINI_DB so the
    // demo/development database is never touched by automated tests.
    const file = process.env.MEDINI_DB ?? "medini.db";
    const sqlite = new Database(join(dir, file));
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    instance = drizzle(sqlite, { schema: fullSchema }) as Db;
  }
  return instance;
}
