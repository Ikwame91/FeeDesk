// Runs before `pnpm dev` and `pnpm demo:load`. FeeDesk uses its own local database
// (./data/pglite) unless DATABASE_URL points at Postgres. A leftover DATABASE_URL from
// another project (file:, mysql:, sqlite:...) breaks first-time setup with a vague error,
// so name the problem and where it comes from.
import { existsSync, readFileSync } from "node:fs";

const ok = (v) => /^pglite:/i.test(v) || /^postgres(ql)?:\/\//i.test(v);
const keys = ["DATABASE_URL", "FEEDESK_DATABASE_URL", "DATABASE_URL_UNPOOLED"];
const problems = [];

for (const key of keys) {
  const v = process.env[key]?.trim();
  if (v && !ok(v)) problems.push(`${key} is set in your terminal/shell to "${v.slice(0, 20)}…"`);
}
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*["']?([^"'#\s]*)/.exec(line);
    if (m && keys.includes(m[1]) && m[2] && !ok(m[2])) problems.push(`${m[1]} is set in ${file} to "${m[2].slice(0, 20)}…"`);
  }
}

if (problems.length) {
  console.error(`\nFeeDesk can't use this database setting:\n  - ${problems.join("\n  - ")}\n`);
  console.error("FeeDesk needs a Postgres URL (postgres://...) or nothing at all (then it uses ./data/pglite).");
  console.error("Fix: remove or comment out that line (in .env), or run `unset DATABASE_URL` (in your shell), then try again.\n");
  process.exit(1);
}
