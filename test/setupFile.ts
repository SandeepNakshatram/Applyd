import { readFileSync } from "node:fs";
import path from "node:path";

// Must run before any test file imports "@/lib/prisma", so the singleton
// PrismaClient is constructed against the embedded test database started in
// globalSetup.ts rather than the placeholder DATABASE_URL in .env.
const connectionFile = path.resolve(__dirname, ".pg-connection.json");
const { databaseUrl } = JSON.parse(readFileSync(connectionFile, "utf8"));

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = databaseUrl;
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
// Deliberately no GEMINI_API_KEY: the pipeline should run entirely on the
// deterministic heuristic client in tests (see src/lib/ai/index.ts).
delete process.env.GEMINI_API_KEY;
