import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Spins up a real, throwaway Postgres instance (no Docker/external service
 * required) so the pipeline test suite runs against the same database engine
 * as production (Supabase Postgres), not a mock. Started once for the whole
 * test run; see test/setupFile.ts for how each test file connects to it.
 */
const PORT = 54329;
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, ".pgdata-test");
const CONNECTION_FILE = path.join(__dirname, ".pg-connection.json");

let pg: EmbeddedPostgres;

export async function setup() {
  // Best-effort leftover from a prior run's teardown (see comment there).
  try {
    rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }

  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase("applyd_test");

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${PORT}/applyd_test?schema=public`;
  writeFileSync(CONNECTION_FILE, JSON.stringify({ databaseUrl }));

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: "inherit",
  });
}

export async function teardown() {
  await pg.stop();
  // On Windows the OS can hold the data directory's file handles open for a
  // moment after the postgres process exits. Cleanup is best-effort — a
  // leftover (gitignored) .pgdata-test dir doesn't affect test correctness,
  // it just gets reused/reinitialized on the next run.
  try {
    rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch {
    // ignore — see comment above
  }
  rmSync(CONNECTION_FILE, { force: true });
}
