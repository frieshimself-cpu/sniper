/**
 * The clock. Runs an investigation every INVESTIGATE_INTERVAL_HOURS (default 6)
 * and records when the next one is due so the site can say so.
 *
 *   npm run watch            run now, then every 6 hours
 *   npm run watch -- --wait  wait for the first interval
 *   npm run watch -- --mock  fake chain, for a demo box
 */
import { run, writeStatus } from "./investigate.js";

const HOURS = Number(process.env.INVESTIGATE_INTERVAL_HOURS ?? 6);
const INTERVAL = Math.max(0.05, HOURS) * 3_600_000;
const argv = process.argv.slice(2);
const mock = argv.includes("--mock");
const wait = argv.includes("--wait");

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

async function tick() {
  const next = new Date(Date.now() + INTERVAL);
  try {
    await run({ mock });
  } catch (err) {
    await writeStatus({ state: "error", last_run_at: iso(new Date()), message: String((err as Error).message) });
    process.stderr.write(`investigation failed: ${(err as Error).message}\n`);
  }
  await writeStatus({ next_run_at: iso(next) });
  process.stdout.write(`next run ${iso(next)}\n`);
}

(async () => {
  if (wait) await writeStatus({ next_run_at: iso(new Date(Date.now() + INTERVAL)) });
  else await tick();
  setInterval(tick, INTERVAL);
})();
