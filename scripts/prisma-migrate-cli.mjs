import "dotenv/config";
import { spawnSync } from "node:child_process";

/**
 * Runs a Prisma CLI command against DIRECT_URL instead of DATABASE_URL.
 *
 * Why this exists: `prisma db push` / `migrate dev` need a connection that
 * supports advisory locks and multi-statement DDL. On Supabase, DATABASE_URL
 * is meant to be the transaction-mode pooler (port 6543) for efficient app
 * runtime queries — but at least as of prisma@6.19, `db push` reads the
 * primary `url` (not `directUrl`) for its own connection, so pointing it at
 * the transaction pooler fails with "P1017: Server has closed the
 * connection." Swapping DATABASE_URL -> DIRECT_URL just for the CLI process
 * sidesteps that without touching the schema's datasource block or the
 * runtime connection string the app actually uses.
 */

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error("DIRECT_URL is not set in .env — cannot run Prisma migrations.");
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: directUrl },
});

process.exit(result.status ?? 1);
