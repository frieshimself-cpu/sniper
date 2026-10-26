/**
 * Back to zero. The archive, the cards, the polls, the status and the progress feed are emptied; the
 * registry stays (wallets on the record are evidence, not a result). With PROGRESS_PUSH=on the idle
 * feed is pushed to the progress branch too, so the site goes quiet at once.
 *
 *   npm run reset
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { progress } from "./progress.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

async function main() {
  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(join(ROOT, "data", "cases.json"), JSON.stringify({ generated_at: iso(), agent: "C.R.I.M.E.", version: 1, cases: [] }, null, 2) + "\n");
  await writeFile(join(ROOT, "data", "polls.json"), JSON.stringify({ updated_at: iso(), polls: [] }, null, 2) + "\n");
  await writeFile(join(ROOT, "data", "watchlist.json"), "[]\n");
  await writeFile(join(ROOT, "data", "status.json"), JSON.stringify({ state: "idle", mode: "live", last_run_at: null, next_run_at: null, last_case: null, message: "Nobody on file yet. The first poll decides." }, null, 2) + "\n");
  await mkdir(join(ROOT, "out"), { recursive: true });
  for (const f of await readdir(join(ROOT, "out"))) if (f.startsWith("case-")) await rm(join(ROOT, "out", f), { force: true });
  await progress.idle();
  process.stdout.write("reset: no cases, no polls, no cards, the feed idle\n");
}
main().catch((e) => {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
});
