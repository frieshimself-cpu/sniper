/**
 * One investigation: pick a subject, look at the chain, write a case.
 *
 *   npm run investigate -- --subject <mint>        one token
 *   npm run investigate -- --subject @handle       the handle's latest launch (registry wallets)
 *   npm run investigate                            next from the ballot winner, then data/watchlist.json
 *   npm run investigate -- --mock                  deterministic fake chain, no keys needed
 *   npm run investigate -- --dry                   do everything but write
 *
 * Attribution rules (docs/RULES_OF_ENGAGEMENT.md):
 *   published automatically   a post by the handle itself containing the address (tier: claimed)
 *                             an Arkham verified label carrying a handle (tier: probable)
 *   queued for review         an Arkham prediction, or a third party saying "that's @x's wallet"
 *   never                     a person's name
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { enforceDeep, normalizeHandle } from "./policy.js";
import { renderCards } from "./render.js";
import { investigate as runDetectors, short, type Investigation } from "./detectors.js";
import { liveSources, liveConfigured } from "./sources/live.js";
import { mockSources } from "./sources/mock.js";
import { discover, tokenHints } from "./sources/discover.js";
import { investigatePerson, livePersonSources, type PersonInvestigation } from "./person.js";
import { mockPersonSources } from "./sources/mock-person.js";
import { readState, updateState, backend } from "./state.js";
import type { Claim, Label, Sources } from "./sources/types.js";
import type { Case, CasesFile, Registry, RegistryEntry } from "./types.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = join(ROOT, "data/cases.json");
const REGISTRY = join(ROOT, "fixtures/registry.json");
const STATUS = join(ROOT, "data/status.json");
const WATCHLIST = join(ROOT, "data/watchlist.json");

export interface Lead {
  id: string;
  created_at: string;
  case_n: number | null;
  handle: string;
  address: string;
  tier: "probable" | "claimed";
  source: string;
  reason: string;
  status: "open" | "approved" | "rejected";
}

export interface Status {
  state: "idle" | "running" | "error" | "unconfigured";
  mode: "live" | "mock" | "none";
  last_run_at: string | null;
  next_run_at: string | null;
  last_case: number | null;
  message: string;
}

interface Watch {
  mint: string;
  note?: string;
  done?: boolean;
  case_n?: number;
  tried_at?: string;
}

const MIN_PUBLISH_SCORE = Number(process.env.MIN_PUBLISH_SCORE ?? 35);
const STRONG_SCORE = Number(process.env.STRONG_SCORE ?? 50);
/** A case needs two findings, or one strong enough to stand alone. */
export const publishable = (inv: Investigation | null): boolean =>
  !!inv && inv.score >= MIN_PUBLISH_SCORE && (inv.findings.length >= 2 || inv.score >= STRONG_SCORE);
const INTERVAL_H = Number(process.env.INVESTIGATE_INTERVAL_HOURS ?? 1);
const nextRun = () => iso(new Date(Date.now() + Math.max(0.05, INTERVAL_H) * 3_600_000));
const iso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const pad = (n: number) => String(n).padStart(4, "0");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
const writeJson = (file: string, v: unknown) => writeFile(file, JSON.stringify(v, null, 2) + "\n");

export async function writeStatus(patch: Partial<Status>): Promise<Status> {
  const cur = await readJson<Status>(STATUS, { state: "idle", mode: "none", last_run_at: null, next_run_at: null, last_case: null, message: "" });
  const next = { ...cur, ...patch };
  await mkdir(dirname(STATUS), { recursive: true });
  await writeJson(STATUS, next);
  return next;
}

// ---- subject selection ---------------------------------------------------
interface BallotDoc {
  id: string;
  closed: boolean;
  closes_at: string;
  winner?: string;
  votes: Record<string, string>;
  options: Array<{ key: string; kind: "token" | "handle"; ref: string; label?: string }>;
}

const REQUIRE_VOTES = (process.env.REQUIRE_VOTES ?? "on").toLowerCase() !== "off";

/** The most recent finished ballot that had votes and whose winner is not yet on file. */
async function ballotWinner(): Promise<{ kind: "token" | "handle"; ref: string; ballot: string; votes: number } | null> {
  const ballots = await readState<BallotDoc[]>("ballots", []);
  const cases = await readJson<CasesFile>(CASES, { generated_at: "", agent: "", version: 1, cases: [] });
  const covered = new Set(cases.cases.map((c) => c.token.mint));
  const now = Date.now();
  for (const b of ballots.sort((a, c) => c.id.localeCompare(a.id))) {
    const finished = b.closed || Date.parse(b.closes_at) <= now;
    if (!finished) continue;
    const tally: Record<string, number> = {};
    for (const k of Object.values(b.votes ?? {})) tally[k] = (tally[k] ?? 0) + 1;
    const ordered = b.options.map((o) => o.key).sort((x, y) => (tally[y] ?? 0) - (tally[x] ?? 0));
    const winner = b.winner ?? ordered[0];
    const o = b.options.find((x) => x.key === winner);
    if (!o) continue;
    const votes = tally[winner] ?? 0;
    if (REQUIRE_VOTES && votes === 0) continue;
    if (o.kind === "token" && covered.has(o.ref)) continue;
    return { kind: o.kind, ref: o.ref, ballot: b.id, votes };
  }
  return null;
}

/** Leads a human approved on the site become registry entries on the agent's next run. */
async function applyApprovedLeads(registry: Registry): Promise<number> {
  let applied = 0;
  await updateState<Lead[]>("leads", [], (leads) => {
    for (const l of leads) {
      if (l.status !== "approved" || (l as Lead & { applied?: boolean }).applied) continue;
      const h = normalizeHandle(l.handle);
      let e = registry.entries.find((x) => normalizeHandle(x.handle) === h);
      if (!e) {
        e = { handle: h, wallets: [] };
        registry.entries.push(e);
      }
      if (!e.wallets.some((w) => w.address === l.address)) e.wallets.push({ address: l.address, tier: l.tier, source: l.source });
      (l as Lead & { applied?: boolean }).applied = true;
      applied++;
    }
    return leads;
  });
  if (applied) {
    registry.updated_at = iso();
    await writeJson(REGISTRY, enforceDeep(registry));
  }
  return applied;
}

async function latestLaunchOf(handle: string, src: Sources, registry: Registry): Promise<string | null> {
  const entry = registry.entries.find((e) => normalizeHandle(e.handle) === normalizeHandle(handle));
  let best: { mint: string; at: string } | null = null;
  for (const w of entry?.wallets ?? []) {
    const tx = await src.transfers(w.address, 200);
    for (const t of tx) {
      if (t.kind === "token" && t.mint && t.from === w.address && t.type === "CREATE_POOL") {
        if (!best || t.at > best.at) best = { mint: t.mint, at: t.at };
      }
    }
  }
  return best?.mint ?? null;
}

async function pickSubject(arg: string | undefined, src: Sources, registry: Registry, viaHint?: string): Promise<{ mint: string; via: string } | null> {
  if (arg?.startsWith("@")) {
    const mint = src.name === "mock" ? arg : await latestLaunchOf(arg, src, registry);
    return mint ? { mint, via: `handle ${arg}` } : null;
  }
  if (arg) return { mint: arg, via: viaHint ?? "argument" };
  const win = await ballotWinner();
  if (win) {
    const via = `ballot ${win.ballot}, ${win.votes} vote${win.votes === 1 ? "" : "s"}`;
    if (win.kind === "token") return { mint: win.ref, via };
    const mint = await latestLaunchOf(win.ref, src, registry);
    if (mint) return { mint, via: `${via} (${win.ref})` };
  }
  const watch = await readJson<Watch[]>(WATCHLIST, []);
  const next = watch.find((w) => !w.done);
  return next ? { mint: next.mint, via: "watchlist" } : null;
}

const DISCOVER_SCAN = Number(process.env.DISCOVER_SCAN ?? 6);
const RESCAN_DAYS = Number(process.env.RESCAN_DAYS ?? 3);
let scanned = 0;

/** No ballot winner, no watchlist: scan what is paying for attention and keep the worst one. */
async function scanDiscovered(src: Sources): Promise<{ inv: Investigation; mint: string; via: string } | null> {
  const cases = await readJson<CasesFile>(CASES, { generated_at: "", agent: "", version: 1, cases: [] });
  const covered = new Set(cases.cases.map((c) => c.token.mint));
  // A scanned token is left alone for RESCAN_DAYS, then it may come round again.
  const cutoff = Date.now() - RESCAN_DAYS * 86_400_000;
  const tried = new Set(
    (await readJson<Watch[]>(WATCHLIST, []))
      .filter((w) => w.done && (!w.tried_at || Date.parse(w.tried_at) > cutoff))
      .map((w) => w.mint),
  );
  const candidates = (await discover(DISCOVER_SCAN * 25)).filter((c) => !covered.has(c.mint) && !tried.has(c.mint)).slice(0, DISCOVER_SCAN);
  process.stdout.write(`discovery: ${candidates.length} candidates to scan\n`);
  let best: { inv: Investigation; mint: string; via: string } | null = null;
  scanned = candidates.length;
  for (const c of candidates) {
    process.stdout.write(`scan ${c.mint} (${c.why})\n`);
    try {
      const inv = await runDetectors(c.mint, src, c.hints);
      for (const l of inv?.log ?? []) process.stdout.write(`  ${l}\n`);
      if (inv) process.stdout.write(`  score ${inv.score}: ${inv.findings.map((f) => f.title).join("; ") || "nothing"}\n`);
      if (inv && publishable(inv) && (!best || inv.score > best.inv.score)) best = { inv, mint: c.mint, via: `discovery (${c.why})` };
    } catch (err) {
      process.stdout.write(`  failed: ${(err as Error).message}\n`);
    }
    await noteTried(c.mint);
  }
  return best;
}

async function noteTried(mint: string) {
  const watch = await readJson<Watch[]>(WATCHLIST, []);
  const now = iso();
  if (!watch.some((w) => w.mint === mint)) watch.push({ mint, note: "scanned", done: true, tried_at: now });
  else for (const w of watch) if (w.mint === mint) Object.assign(w, { done: true, tried_at: now });
  await writeJson(WATCHLIST, watch);
}

// ---- attribution ---------------------------------------------------------
interface Attribution {
  registry: Registry;
  added: Array<{ handle: string; address: string; tier: "probable" | "claimed"; source: string }>;
  leads: Lead[];
  subjects: string[];
}

async function attribute(inv: Investigation, src: Sources, registry: Registry, caseN: number): Promise<Attribution> {
  const added: Attribution["added"] = [];
  const leads: Lead[] = [];
  const subjects = new Set<string>();
  const put = (handle: string, address: string, tier: "probable" | "claimed", source: string, platform?: string) => {
    const h = normalizeHandle(handle);
    let e = registry.entries.find((x) => normalizeHandle(x.handle) === h);
    if (!e) {
      e = { handle: h, wallets: [], ...(platform ? { note: `${platform} username` } : {}) } satisfies RegistryEntry;
      registry.entries.push(e);
    }
    if (!e.wallets.some((w) => w.address === address)) {
      e.wallets.push({ address, tier, source });
      added.push({ handle: h, address, tier, source });
    }
    subjects.add(h);
  };
  const lead = (handle: string, address: string, tier: "probable" | "claimed", source: string, reason: string) =>
    leads.push({ id: `${caseN}-${address.slice(0, 8)}-${normalizeHandle(handle).slice(1)}`, created_at: iso(), case_n: caseN, handle: normalizeHandle(handle), address, tier, source, reason, status: "open" });

  for (const address of inv.principals) {
    // existing registry attribution wins
    for (const e of registry.entries) if (e.wallets.some((w) => w.address === address && w.source)) subjects.add(normalizeHandle(e.handle));

    const label: Label | null = inv.labels.get(address) ?? (await src.label(address));
    if (label?.handle) {
      if (label.predicted) lead(label.handle, address, "probable", label.url, "Arkham entity prediction, not a verified label.");
      else put(label.handle, address, "probable", label.url, label.platform);
    }
    const claims: Claim[] = await src.claims(address);
    for (const c of claims) {
      if (c.self) put(c.handle, address, "claimed", c.url);
      else if (c.about) lead(c.about, address, "probable", c.url, `${c.handle} attributes the wallet to ${c.about}. Not the wallet owner's own post.`);
    }
  }
  return { registry, added, leads, subjects: [...subjects] };
}

// ---- writing -------------------------------------------------------------
function headline(inv: Investigation, subjects: string[]): string {
  const sym = `$${inv.token.symbol}`;
  const f = inv.findings.map((x) => x.title);
  // Name a handle only when one is on the record. Otherwise the wallet, shortened.
  const named = (address: string | null, role: string) => (subjects[0] ? subjects[0] : address ? `${role} ${short(address)}` : role);
  if (f.some((t) => /funded from one source/.test(t))) {
    const n = inv.bundle.length;
    const exit = f.includes("Coordinated exit") ? " They sold within the half hour." : "";
    const funderIsDeployer = inv.funder && inv.funder === inv.deployer;
    const who = subjects[0] ?? (funderIsDeployer ? `The deployer ${short(inv.deployer!)}` : `Wallet ${short(inv.funder!)}`);
    return `${who} funded ${n} wallets before ${sym} launched. They bought in the first ninety seconds.${exit}`;
  }
  if (f.includes("Liquidity removed")) return `Liquidity for ${sym} went back to the deployer${subjects[0] ? `, ${subjects[0]}` : ""}. The chart went with it.`;
  if (f.includes("Deployer sold")) {
    const who = `The ${sym} deployer${subjects[0] ? `, ${subjects[0]},` : ` ${short(inv.deployer ?? "")}`}`;
    const sold = inv.dev_sold_share !== undefined ? `${Math.round(inv.dev_sold_share * 100)}% of supply` : "into its own pool";
    const when = inv.dev_first_sell_min === null || inv.dev_first_sell_min === undefined ? "" : inv.dev_first_sell_min <= 0 ? " within a minute of launch" : inv.dev_first_sell_min < 120 ? ` ${inv.dev_first_sell_min} minutes after launch` : ` ${Math.round(inv.dev_first_sell_min / 60)} hours after launch`;
    const bought = inv.dev_buy_share !== undefined && inv.dev_buy_share >= 0.05 ? ` It had taken ${Math.round(inv.dev_buy_share * 100)}% at creation.` : "";
    const moved = f.includes("Deployer distributed supply") ? " More went out to other wallets without a swap." : "";
    return `${who} sold ${sold}${when}.${bought}${moved}`;
  }
  if (f.includes("Deployer distributed supply")) return `The ${sym} deployer${subjects[0] ? `, ${subjects[0]},` : ""} moved supply to other wallets before anyone else could buy it.`;
  if (f.includes("Supply concentrated")) return `Ten wallets hold most of ${sym}. One of them is the deployer.`;
  return `${named(inv.deployer, "Deployer")} and ${sym}. ${inv.findings.length} findings.`;
}

function narrative(inv: Investigation, subjects: string[], via: string): string[] {
  const sym = `$${inv.token.symbol}`;
  const out: string[] = [];
  out.push(
    `${sym} (${inv.token.name}) was picked by ${via}. ${inv.launch_at ? `The pool opened ${inv.launch_at.slice(0, 16).replace("T", " ")}Z.` : "The launch time could not be pinned down."}${inv.token.deployer_approx ? " The deployer wallet is the earliest the agent could reach, not necessarily the first." : ""}`,
  );
  out.push(inv.findings.map((f) => f.detail).join(" "));
  if (inv.trail.length > 1) {
    const last = inv.trail[inv.trail.length - 1];
    out.push(`${inv.trail[0].amount} left ${inv.trail[0].label} ${short(inv.trail[0].address)} after launch. The trail ends at ${last.label} ${short(last.address)}.`);
  }
  out.push(subjects.length ? `${subjects.join(" and ")} ${subjects.length > 1 ? "are" : "is"} on the record for the wallets above, with sources. Disputes are honoured at once.` : "No handle is on the record for these wallets. Attribution leads, if any, are queued for review.");
  out.push("Convictions: 0.");
  return out;
}

export interface RunOptions {
  subject?: string;
  mock?: boolean;
  dry?: boolean;
  /** how the subject was chosen, for the narrative */
  via?: string;
}

export async function run(opts: RunOptions): Promise<{ case?: Case; message: string }> {
  const cfg = liveConfigured();
  if (!opts.mock && !cfg.helius) {
    await writeStatus({ state: "unconfigured", mode: "none", message: "HELIUS_API_KEY is not set." });
    return { message: "HELIUS_API_KEY is not set. Use --mock to run without keys." };
  }
  const src: Sources = opts.mock ? mockSources(opts.subject ?? `mock-${Date.now()}`) : liveSources();
  const registry = await readJson<Registry>(REGISTRY, { updated_at: "", entries: [] });
  await writeStatus({ state: "running", mode: src.name, message: "" });
  const applied = await applyApprovedLeads(registry).catch(() => 0);
  if (applied) process.stdout.write(`applied ${applied} approved lead${applied === 1 ? "" : "s"} to the registry\n`);
  process.stdout.write(`state: ${backend()}\n`);

  // ---- a person ---------------------------------------------------------------
  const handleSubject = opts.subject?.startsWith("@") ? opts.subject : (await ballotWinner())?.kind === "handle" && !opts.subject ? (await ballotWinner())!.ref : null;
  if (handleSubject) {
    return runPerson(handleSubject, src, registry, opts);
  }

  let picked = await pickSubject(opts.subject, src, registry, opts.via);
  let inv: Investigation | null = null;
  if (picked) {
    process.stdout.write(`subject ${picked.mint} via ${picked.via}\n`);
    const hints = src.name === "live" ? await tokenHints(picked.mint) : {};
    inv = await runDetectors(picked.mint, src, hints);
    for (const l of inv?.log ?? []) process.stdout.write(`  ${l}\n`);
    await markWatchlist(picked.mint, undefined);
  } else if (src.name === "live" && REQUIRE_VOTES) {
    await writeStatus({ state: "idle", last_run_at: iso(), message: "No ballot winner with votes this period. Nothing opened. The ballot is open.", next_run_at: nextRun() });
    return { message: "nothing to investigate: no votes" };
  } else if (src.name === "live") {
    const best = await scanDiscovered(src);
    if (!best) {
      await writeStatus({ state: "idle", last_run_at: iso(), message: `Scanned ${scanned} boosted tokens. Nothing above ${MIN_PUBLISH_SCORE}. No case.`, next_run_at: nextRun() });
      return { message: "nothing found in discovery" };
    }
    picked = { mint: best.mint, via: best.via };
    inv = best.inv;
  } else {
    await writeStatus({ state: "idle", last_run_at: iso(), message: "Nothing to investigate." });
    return { message: "nothing to investigate" };
  }
  if (!inv || !publishable(inv)) {
    const msg = inv ? `${picked.mint}: score ${inv.score}, ${inv.findings.length} finding${inv.findings.length === 1 ? "" : "s"}. Not enough for a case.` : `${picked.mint}: token not found.`;
    await writeStatus({ state: "idle", last_run_at: iso(), message: msg, next_run_at: nextRun() });
    return { message: msg };
  }

  const file = await readJson<CasesFile>(CASES, { generated_at: iso(), agent: "C.R.I.M.E.", version: 1, cases: [] });
  const n = (file.cases.reduce((m, c) => Math.max(m, c.n), 0) || 0) + 1;
  const att = await attribute(inv, src, registry, n);

  const c: Case = enforceDeep({
    n,
    id: pad(n),
    opened_at: iso(),
    status: "open",
    severity: inv.severity,
    score: inv.score,
    token: { symbol: inv.token.symbol, name: inv.token.name, mint: inv.token.mint },
    subjects: att.subjects,
    headline: headline(inv, att.subjects),
    charge: inv.charge,
    findings: inv.findings,
    evidence: inv.evidence,
    money_trail: inv.trail,
    narrative: narrative(inv, att.subjects, picked.via),
    png: `case-${pad(n)}.png`,
  });

  if (opts.dry) {
    process.stdout.write(JSON.stringify({ case: c, added: att.added, leads: att.leads }, null, 2) + "\n");
    await writeStatus({ state: "idle", last_run_at: iso(), message: `dry run: would open case ${c.id}` });
    return { case: c, message: "dry run" };
  }

  file.cases.push(c);
  file.generated_at = iso();
  file.agent = src.name === "mock" ? "C.R.I.M.E. mock" : "C.R.I.M.E.";
  await mkdir(join(ROOT, "data"), { recursive: true });
  await mkdir(join(ROOT, "out"), { recursive: true });
  await writeJson(CASES, file);
  if (att.added.length) {
    registry.updated_at = iso();
    await writeJson(REGISTRY, enforceDeep(registry));
  }
  if (att.leads.length) {
    await updateState<Lead[]>("leads", [], (leads) => {
      for (const l of att.leads) if (!leads.some((x) => x.id === l.id)) leads.push(enforceDeep(l));
      return leads;
    });
  }
  await markWatchlist(picked.mint, n);
  try {
    await renderCards([c], join(ROOT, "out"));
  } catch (err) {
    process.stderr.write(`card render failed: ${(err as Error).message}\n`);
  }
  const msg = `Case ${c.id} opened on $${c.token.symbol}: ${c.findings.length} findings, ${att.added.length} wallets attributed, ${att.leads.length} leads.`;
  await writeStatus({ state: "idle", last_run_at: iso(), last_case: n, message: msg, next_run_at: nextRun() });
  process.stdout.write(msg + "\n");
  return { case: c, message: msg };
}

function personHeadline(p: PersonInvestigation): string {
  const f = p.findings[0];
  if (!f) return `${p.handle}. Nothing on file.`;
  const t = p.token ? `$${p.token.symbol}` : "a token";
  if (/then sold/.test(f.title)) return `${p.handle} promoted ${t} and sold into the people who listened.`;
  if (/Said holding/.test(f.title)) return `${p.handle} said holding ${t}. The wallets were selling.`;
  if (/was safe/.test(f.title)) return `${p.handle} said ${t} was safe. The wallets left.`;
  if (/^Launched/.test(f.title)) return `${p.handle} launched ${t}. ${f.title.replace(/^Launched \$\S+: /, "").replace(/^./, (c) => c.toUpperCase())}.`;
  if (/^Promoted/.test(f.title)) return `${p.handle} promoted ${t}. ${f.title.replace(/^Promoted \$\S+: /, "").replace(/^./, (c) => c.toUpperCase())}.`;
  if (/funded the/.test(f.title)) return `A wallet ${p.handle} claims as theirs funded the ${t} bundle.`;
  if (/deleted/.test(f.title)) return `${p.handle} deleted the promotions. The quotes remain.`;
  return `${p.handle}. ${p.findings.length} findings.`;
}

async function runPerson(handle: string, src: Sources, registry: Registry, opts: RunOptions): Promise<{ case?: Case; message: string }> {
  const psrc = src.name === "mock" ? mockPersonSources(handle) : livePersonSources(src);
  process.stdout.write(`subject ${handle} via ${opts.via ?? "argument"}\n`);
  const p = await investigatePerson(handle, psrc);
  for (const l of p.log) process.stdout.write(`  ${l}\n`);
  process.stdout.write(`  score ${p.score}: ${p.findings.map((f) => f.title).join("; ") || "nothing"}\n`);
  const ok = p.score >= MIN_PUBLISH_SCORE && (p.findings.length >= 2 || p.score >= STRONG_SCORE);
  if (!ok) {
    const msg = `${handle}: score ${p.score}, ${p.findings.length} finding${p.findings.length === 1 ? "" : "s"}. Not enough for a case.`;
    await writeStatus({ state: "idle", last_run_at: iso(), message: msg, next_run_at: nextRun() });
    return { message: msg };
  }
  // wallets with a source go on the record
  const added: string[] = [];
  const h = normalizeHandle(handle);
  let entry = registry.entries.find((e) => normalizeHandle(e.handle) === h);
  for (const w of p.wallets) {
    if (!entry) {
      entry = { handle: h, wallets: [], ...(w.platform ? { note: `${w.platform} username` } : {}) };
      registry.entries.push(entry);
    }
    if (!entry.wallets.some((x) => x.address === w.address)) {
      entry.wallets.push({ address: w.address, tier: w.tier, source: w.source });
      added.push(w.address);
    }
  }
  const file = await readJson<CasesFile>(CASES, { generated_at: iso(), agent: "C.R.I.M.E.", version: 1, cases: [] });
  const n = (file.cases.reduce((m, c) => Math.max(m, c.n), 0) || 0) + 1;
  const c: Case = enforceDeep({
    n,
    id: pad(n),
    kind: "person",
    opened_at: iso(),
    status: "open",
    severity: p.severity,
    score: p.score,
    token: p.token ?? { symbol: "—", name: "no token", mint: "" },
    subjects: [h],
    headline: personHeadline(p),
    charge: p.charge,
    findings: p.findings,
    evidence: p.evidence,
    money_trail: p.trail,
    narrative: [
      `${h} was picked by ${opts.via ?? "hand"}. The agent read ${p.posts} posts and found ${p.claims.length} claims about tokens, ${p.wallets.length} wallet${p.wallets.length === 1 ? "" : "s"} on the record (${p.wallets.filter((w) => w.tier === "claimed").length} claimed by the handle itself).`,
      p.findings.map((f) => f.detail).join(" "),
      p.trail.length > 1 ? `${p.trail[0].amount} left ${short(p.trail[0].address)}. The trail ends at ${p.trail[p.trail.length - 1].label} ${short(p.trail[p.trail.length - 1].address)}.` : "No money trail could be followed from the wallets on record.",
      "Every post and every transaction above is linked. Disputes are honoured at once. Convictions: 0.",
    ],
    png: `case-${pad(n)}.png`,
  });
  if (opts.dry) {
    process.stdout.write(JSON.stringify({ case: c, added }, null, 2) + "\n");
    await writeStatus({ state: "idle", last_run_at: iso(), message: `dry run: would open case ${c.id} on ${h}` });
    return { case: c, message: "dry run" };
  }
  file.cases.push(c);
  file.generated_at = iso();
  await mkdir(join(ROOT, "data"), { recursive: true });
  await mkdir(join(ROOT, "out"), { recursive: true });
  await writeJson(CASES, file);
  if (added.length) {
    registry.updated_at = iso();
    await writeJson(REGISTRY, enforceDeep(registry));
  }
  try {
    await renderCards([c], join(ROOT, "out"));
  } catch (err) {
    process.stderr.write(`card render failed: ${(err as Error).message}\n`);
  }
  const msg = `Case ${c.id} opened on ${h}: ${c.findings.length} findings, ${added.length} wallets on the record.`;
  await writeStatus({ state: "idle", last_run_at: iso(), last_case: n, message: msg, next_run_at: nextRun() });
  process.stdout.write(msg + "\n");
  return { case: c, message: msg };
}

async function markWatchlist(mint: string, caseN: number | undefined) {
  if (!existsSync(WATCHLIST)) return;
  const watch = await readJson<Watch[]>(WATCHLIST, []);
  const w = watch.find((x) => x.mint === mint);
  if (!w) return;
  w.done = true;
  if (caseN) w.case_n = caseN;
  await writeJson(WATCHLIST, watch);
}

function parseArgs(argv: string[]): RunOptions {
  const o: RunOptions = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--subject") o.subject = argv[++i];
    else if (argv[i] === "--mock") o.mock = true;
    else if (argv[i] === "--dry") o.dry = true;
  }
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(parseArgs(process.argv.slice(2)))
    .then((r) => {
      if (!r.case && !/nothing|below|Not enough|dry/.test(r.message)) {
        process.stderr.write(`${r.message}\n`);
        process.exitCode = 1;
      }
    })
    .catch(async (err) => {
      await writeStatus({ state: "error", last_run_at: iso(), message: String((err as Error).message) });
      process.stderr.write(`${(err as Error).stack ?? err}\n`);
      process.exitCode = 1;
    });
}
