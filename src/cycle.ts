/**
 * One cycle, once an hour:
 *   1. four fresh launches go on the ballot; on X as a poll when X is configured, else on the site
 *   2. ten minutes of voting
 *   3. the winner is investigated
 *   4. the case goes back out on X with its card
 *
 *   npm run cycle              one cycle
 *   npm run cycle -- --dry     build the ballot, read nothing, investigate nothing
 */
import { join } from "node:path";
import { discover, describe } from "./sources/discover.js";
import { X, xCreds } from "./sources/x.js";
import { readState, updateState, backend } from "./state.js";
import { run, writeStatus, ROOT } from "./investigate.js";
import { enforce } from "./policy.js";
import type { CasesFile } from "./types.js";
import { readFile } from "node:fs/promises";

interface Option {
  key: string;
  kind: "token" | "handle";
  label: string;
  ref: string;
}
interface Ballot {
  id: string;
  opened_at: string;
  closes_at: string;
  options: Option[];
  votes: Record<string, string>;
  closed: boolean;
  winner?: string;
  runner_up?: string;
  carried?: string;
  source?: "x" | "site";
  poll_tweet_id?: string;
  poll_url?: string;
  x_tally?: Record<string, number>;
  case_n?: number;
}

const POLL_MINUTES = Math.max(5, Number(process.env.X_POLL_MINUTES ?? 10));
const PERIOD_MS = Math.max(0.25, Number(process.env.BALLOT_PERIOD_HOURS ?? 1)) * 3_600_000;
const SITE = (process.env.SITE_URL ?? "https://frieshimself-cpu.github.io/sniper").replace(/\/$/, "");
const REQUIRE_VOTES = (process.env.REQUIRE_VOTES ?? "on").toLowerCase() !== "off";
const POST_CASES = (process.env.X_POST_CASES ?? "on").toLowerCase() !== "off";

const iso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const periodId = (t = Date.now()) => new Date(Math.floor(t / PERIOD_MS) * PERIOD_MS).toISOString().slice(0, 13);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tally(b: Ballot): Record<string, number> {
  const t: Record<string, number> = {};
  for (const o of b.options) t[o.key] = 0;
  if (b.x_tally) {
    for (const [k, v] of Object.entries(b.x_tally)) if (k in t) t[k] = v;
  } else {
    for (const k of Object.values(b.votes)) if (k in t) t[k] += 1;
  }
  return t;
}

async function buildOptions(): Promise<{ options: Option[]; carried?: string }> {
  const ballots = await readState<Ballot[]>("ballots", []);
  const cases = JSON.parse(await readFile(join(ROOT, "data/cases.json"), "utf8").catch(() => '{"cases":[]}')) as CasesFile;
  const covered = new Set(cases.cases.map((c) => c.token.mint));
  const dayAgo = Date.now() - 86_400_000;
  const recent = new Set(ballots.filter((b) => Date.parse(b.opened_at) >= dayAgo).flatMap((b) => b.options.map((o) => o.key)));
  const prev = ballots.sort((a, b) => b.id.localeCompare(a.id)).find((b) => b.closed);
  const carried = prev?.runner_up ? prev.options.find((o) => o.key === prev.runner_up) : undefined;
  const fresh = await describe((await discover(60)).filter((c) => !covered.has(c.mint)).slice(0, 40));
  const options: Option[] = [];
  if (carried && !covered.has(carried.ref)) options.push(carried);
  for (const c of fresh) {
    if (!c.symbol || options.length >= 4) continue;
    const key = `token:${c.mint}`;
    if (recent.has(key) || options.some((o) => o.key === key)) continue;
    options.push({ key, kind: "token", label: enforce(`$${c.symbol}`), ref: c.mint });
  }
  return { options, carried: carried?.key };
}

export async function cycle(opts: { dry?: boolean } = {}): Promise<void> {
  const x = xCreds() ? new X(xCreds()!) : null;
  process.stdout.write(`cycle ${periodId()} · state ${backend()} · polls on ${x ? "X" : "the site"}\n`);
  const { options, carried } = await buildOptions();
  if (options.length < 2) {
    await writeStatus({ state: "idle", last_run_at: iso(), message: "Not enough fresh subjects for a ballot. Nothing opened.", next_run_at: iso(new Date(Date.now() + PERIOD_MS)) });
    return;
  }
  const id = periodId();
  const now = Date.now();
  let ballot: Ballot = {
    id,
    opened_at: iso(new Date(now)),
    closes_at: iso(new Date(now + POLL_MINUTES * 60_000)),
    options,
    votes: {},
    closed: false,
    carried,
    source: x ? "x" : "site",
  };
  if (x && !opts.dry) {
    const text = `Who gets investigated this hour? ${POLL_MINUTES} minutes to vote.\n\n${options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}\n\nCases opened, crimes found, convictions 0.\n${SITE}/ballot`;
    const poll = await x.postPoll(text, options.map((o) => o.label), POLL_MINUTES);
    ballot.poll_tweet_id = poll.id;
    ballot.poll_url = poll.url;
    process.stdout.write(`poll posted ${poll.url}\n`);
  }
  await updateState<Ballot[]>("ballots", [], (all) => [ballot, ...all.filter((b) => b.id !== id)].slice(0, 500));
  await writeStatus({ state: "running", message: `Ballot ${id} open for ${POLL_MINUTES} minutes: ${options.map((o) => o.label).join(", ")}.` });
  if (opts.dry) {
    process.stdout.write(`dry: ballot ${id} ${options.map((o) => o.label).join(", ")}\n`);
    return;
  }

  // ---- wait for the poll -------------------------------------------------
  await sleep(POLL_MINUTES * 60_000 + 20_000);
  if (x && ballot.poll_tweet_id) {
    const res = await x.pollResults(ballot.poll_tweet_id).catch((e) => {
      process.stderr.write(`poll read failed: ${(e as Error).message}\n`);
      return null;
    });
    if (res) {
      ballot.x_tally = {};
      res.options.forEach((o, i) => (ballot.x_tally![options[i]?.key ?? o.label] = o.votes));
    }
  } else {
    const latest = (await readState<Ballot[]>("ballots", [])).find((b) => b.id === id);
    if (latest) ballot.votes = latest.votes;
  }
  const t = tally(ballot);
  const ordered = options.map((o) => o.key).sort((a, b) => t[b] - t[a]);
  ballot = { ...ballot, closed: true, winner: ordered[0], runner_up: ordered[1] };
  await updateState<Ballot[]>("ballots", [], (all) => all.map((b) => (b.id === id ? ballot : b)));
  const winner = options.find((o) => o.key === ballot.winner)!;
  const votes = t[winner.key] ?? 0;
  process.stdout.write(`ballot closed: ${options.map((o) => `${o.label} ${t[o.key]}`).join(" · ")} → ${winner.label}\n`);
  if (REQUIRE_VOTES && votes === 0) {
    await writeStatus({ state: "idle", last_run_at: iso(), message: `Ballot ${id} closed with no votes. Nothing opened.`, next_run_at: iso(new Date(Date.now() + PERIOD_MS)) });
    return;
  }

  // ---- investigate the winner ---------------------------------------------
  const result = await run({ subject: winner.ref, via: `ballot ${id}, ${votes} vote${votes === 1 ? "" : "s"} on ${x ? "X" : "the site"}` });
  if (result.case) {
    await updateState<Ballot[]>("ballots", [], (all) => all.map((b) => (b.id === id ? { ...b, case_n: result.case!.n } : b)));
    if (x && POST_CASES) {
      const c = result.case;
      const text = `${c.headline}\n\nCase ${c.id} · ${c.findings.length} finding${c.findings.length === 1 ? "" : "s"} · severity ${c.severity}\nConvictions: 0.\n${SITE}/cases/${c.n}`;
      await x.postCase(enforce(text), join(ROOT, "out", c.png), ballot.poll_tweet_id).catch((e) => process.stderr.write(`x post failed: ${(e as Error).message}\n`));
    }
  } else if (x && POST_CASES) {
    await x
      .postCase(enforce(`${winner.label} was investigated. ${result.message} No case. Convictions: 0.`), null, ballot.poll_tweet_id)
      .catch((e) => process.stderr.write(`x post failed: ${(e as Error).message}\n`));
  }
  await writeStatus({ next_run_at: iso(new Date(Math.floor(Date.now() / PERIOD_MS) * PERIOD_MS + PERIOD_MS)) });
}

const argv = process.argv.slice(2);
cycle({ dry: argv.includes("--dry") }).catch(async (err) => {
  await writeStatus({ state: "error", last_run_at: iso(), message: String((err as Error).message) });
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exitCode = 1;
});
