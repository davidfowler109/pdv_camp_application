import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

interface Store extends Database {
  transaction<T>(run: (tx: Database) => Promise<T>): Promise<T>;
}

async function open(): Promise<Store> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return {
      query: (sql, values) => pool.query(sql, values),
      async transaction(run) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await run(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
  }

  if (process.env.PDV_LOCAL_DEMO !== "1") throw new Error("Database configuration required");
  await mkdir(".local", { recursive: true });
  // A staged pilot can become active without moving or overwriting the previous database.
  const pointer = await readFile(".local/active-database", "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return "camp";
  });
  const folder = pointer.trim();
  if (folder !== "camp" && !/^pilot-2027-[a-zA-Z0-9]+$/.test(folder)) throw new Error("Invalid local pilot database");
  return new PGlite(path.resolve(".local", folder));
}

const migrationFiles = ["001-foundation.sql", "002-registration.sql", "003-staff-review.sql", "004-follow-up-reason.sql", "005-housing-inventory.sql", "006-desk-intake.sql", "007-check-in.sql", "008-departure.sql", "009-operational-corrections.sql", "010-open-ended-age-groups.sql", "011-weekly-staff.sql", "012-special-events.sql", "013-event-registration.sql", "014-signed-paper-forms.sql", "015-scholarship-distribution.sql", "016-scholarship-missionary.sql", "017-camp-payment.sql"];

async function upgradeLocal(db: PGlite): Promise<Store> {
  const migrations = await Promise.all(migrationFiles.map(file => readFile(path.resolve("db", file), "utf8")));
  const seed = await readFile(path.resolve("db/fictional-seed.sql"), "utf8");
  await db.transaction(async tx => {
    for (const migration of migrations) await tx.exec(migration);
    const { rows } = await tx.query("SELECT id FROM camp_week LIMIT 1");
    if (!rows.length) await tx.exec(seed);
  });
  return db;
}

const runtime = globalThis as typeof globalThis & {
  pdvStore?: Promise<Store>;
  pdvLocalUpgrade?: { store: Promise<Store>; version: string | undefined; ready: Promise<Store> };
};

export function getDatabase(): Promise<Store> {
  runtime.pdvStore ??= open().catch(error => {
    runtime.pdvStore = undefined;
    throw error;
  });
  const store = runtime.pdvStore;
  if (process.env.DATABASE_URL) return store;

  // Next.js can reload this module while the previous local connection is still open.
  const version = migrationFiles.at(-1);
  const previous = runtime.pdvLocalUpgrade;
  if (previous?.store === store && previous.version === version) return previous.ready;
  const ready = (previous?.store === store ? previous.ready : store)
    .then(db => upgradeLocal(db as PGlite))
    .catch(error => {
      if (runtime.pdvLocalUpgrade?.ready === ready) runtime.pdvLocalUpgrade = undefined;
      throw error;
    });
  runtime.pdvLocalUpgrade = { store, version, ready };
  return ready;
}
