/**
 * The cycle. A human posts a poll on the account by hand: four names, ten minutes. The agent reads it.
 *   1. read the account's recent polls
 *   2. a poll still open and closing soon: wait for it; one that closed: read the result
 *   3. the winner is investigated; the case goes on the site
 *   4. the poll and its outcome are written to data/polls.json, so the site can show them
 * The agent never writes to X. There is no code path here, or in src/sources/x.ts, that could.
 *
 *   npm run cycle                   read the polls, settle the ones that closed
 *   npm run cycle -- --poll <url>   settle this one, open or closed
 *   npm run cycle -- --dry          read and print, investigate nothing, write nothing
 */
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { X, xCreds, type Poll } from "./sources/x.js";
import { discover, describe } from "./sources/discover.js";
import { run, writeStatus, ROOT } from "./investigate.js";
import { normalizeHandle } from "./policy.js";

export interface PollRecord {
  id: string;
  url: string;
  opened_at: string;
  closes_at: string;
  options: Array<{ label: string; votes: number; subject?: string }>;
  total: number;
  winner?: string;
  case_n?: number;
  message?: string;
  processed_at?: string;
}

export interface PollsFile {
  updated_at: string;
  polls: PollRecord[];
}

const POLLS = join(ROOT, "data/polls.json");
const REQUIRE_VOTES = (process.env.REQUIRE_VOTES ?? "on").toLowerCase() !== "off";
const WAIT_MINUTES = Math.max(0, Number(process.env.POLL_WAIT_MINUTES ?? 15)); // wait for a poll closing within this long
const iso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readPolls(): Promise<PollsFile> {
  try {
    return JSON.parse(await readFile(POLLS, "utf8")) as PollsFile;
  } catch {
    return { updated_at: "", polls: [] };
  }
}

async function writePolls(f: PollsFile): Promise<void> {
  await mkdir(join(ROOT, "data"), { recursive: true });
  f.updated_at = iso();
  await writeFile(POLLS, JSON.stringify(f, null, 2) + "\n");
}

const HANDLE = /@([A-Za-z0-9_]{1,15})\b/;
const MINT = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

/** What an option names: a handle, a mint, or a token symbol the discovery feeds can place. */
async function resolve(label: string): Promise<string | null> {
  const h = label.match(HANDLE);
  if (h) return normalizeHandle("@" + h[1]);
  const m = label.match(MINT);
  if (m) return m[0];
  const sym = label.replace(/^\$/, "").trim().toUpperCase();
  if (!sym) return null;
  try {
    const found = await describe(await discover());
    for (const f of found) if ((f.symbol ?? "").toUpperCase() === sym) return f.mint;
  } catch {
    /* no feeds, no match */
  }
  return null;
}

function record(p: Poll): PollRecord {
  const total = p.options.reduce((a, o) => a + o.votes, 0);
  return { id: p.id, url: p.url, opened_at: p.opened_at, closes_at: p.closes_at, options: p.options.map((o) => ({ label: o.label, votes: o.votes })), total };
}

export async function cycle(opts: { dry?: boolean; poll?: string } = {}): Promise<void> {
  const creds = xCreds();
  if (!creds) {
    await writeStatus({ state: "unconfigured", last_run_at: iso(), message: "No X keys. The agent reads polls from the account; it needs X_BEARER_TOKEN at least." });
    process.stdout.write("no X keys; nothing to read\n");
    return;
  }
  const x = new X(creds);
  const account = process.env.X_ACCOUNT ? { username: process.env.X_ACCOUNT.replace(/^@/, "") } : await x.me();
  const user = await x.userByUsername(account.username);
  if (!user) throw new Error(`@${account.username} not found`);
  process.stdout.write(`cycle ${iso()} · reading polls on @${user.username}\n`);

  const file = await readPolls();
  const done = new Map(file.polls.map((p) => [p.id, p]));
  let polls: Poll[];
  if (opts.poll) {
    const id = opts.poll.match(/(\d{15,})/)?.[1];
    if (!id) throw new Error("--poll wants a post URL or id");
    const p = await x.pollResults(id, user.username);
    if (!p) throw new Error(`no poll on post ${id}`);
    polls = [p];
    done.delete(id); // by hand means again
  } else {
    polls = await x.latestPolls(user.id, user.username);
  }
  process.stdout.write(`  ${polls.length} poll${polls.length === 1 ? "" : "s"} on the account, ${polls.filter((p) => !done.has(p.id)).length} new\n`);

  for (const p0 of polls) {
    if (done.has(p0.id)) continue;
    let p = p0;
    const left = Date.parse(p.closes_at) - Date.now();
    if (p.status === "open" && left > WAIT_MINUTES * 60_000) {
      process.stdout.write(`  ${p.id}: open, closes ${p.closes_at}; later\n`);
      continue;
    }
    if (opts.dry) {
      process.stdout.write(`  dry: ${p.id} ${p.status} · ${p.options.map((o) => `${o.label} ${o.votes}`).join(" · ")}\n`);
      continue;
    }
    if (p.status === "open") {
      process.stdout.write(`  ${p.id}: open, closes in ${Math.ceil(left / 60_000)} min; waiting\n`);
      await writeStatus({ state: "running", message: `Poll ${p.id} closes ${p.closes_at}. Waiting.` });
      await sleep(Math.max(0, left) + 30_000);
      p = (await x.pollResults(p.id, user.username)) ?? p;
    }
    const rec = record(p);
    const ordered = [...p.options].sort((a, b) => b.votes - a.votes || a.position - b.position);
    const winner = ordered[0];
    rec.winner = winner.label;
    process.stdout.write(`  ${p.id} closed: ${p.options.map((o) => `${o.label} ${o.votes}`).join(" · ")} → ${winner.label}\n`);
    for (const o of rec.options) o.subject = (await resolve(o.label)) ?? undefined;
    const subject = rec.options.find((o) => o.label === winner.label)?.subject;
    if (REQUIRE_VOTES && rec.total === 0) {
      rec.message = "No votes. Nothing opened.";
    } else if (!subject) {
      rec.message = `Could not place "${winner.label}": not a handle, a mint or a symbol on the feeds. Nothing opened.`;
    } else {
      const result = await run({ subject, via: `poll on X, ${winner.votes} vote${winner.votes === 1 ? "" : "s"}` });
      rec.case_n = result.case?.n;
      rec.message = result.case ? `Case ${result.case.id} opened.` : result.message;
    }
    rec.processed_at = iso();
    process.stdout.write(`  ${rec.message}\n`);
    file.polls = [rec, ...file.polls.filter((q) => q.id !== rec.id)].slice(0, 500);
    await writePolls(file);
    await writeStatus({ state: "idle", last_run_at: iso(), message: `Poll ${p.id}: ${winner.label} won with ${winner.votes} vote${winner.votes === 1 ? "" : "s"}. ${rec.message}` });
  }
  if (!opts.dry && polls.every((p) => done.has(p.id) || (p.status === "open" && Date.parse(p.closes_at) - Date.now() > WAIT_MINUTES * 60_000))) {
    await writeStatus({ state: "idle", last_run_at: iso(), message: "No new closed poll on the account. Nothing opened." });
  }
}

const argv = process.argv.slice(2);
const pollArg = argv.includes("--poll") ? argv[argv.indexOf("--poll") + 1] : undefined;
cycle({ dry: argv.includes("--dry"), poll: pollArg }).catch(async (err) => {
  process.stderr.write(`${(err as Error).message}\n`);
  await writeStatus({ state: "error", last_run_at: iso(), message: (err as Error).message.slice(0, 200) }).catch(() => {});
  process.exit(1);
});
