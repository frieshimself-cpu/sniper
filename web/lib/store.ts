/**
 * Site state that is not the agent's: ballots, votes, disputes, leads.
 * Lives in Redis (Upstash) when configured, else JSON files. See ../src/state.ts.
 */
import { readState, updateState, writeState } from "@agent/state";

export interface BallotOption {
  key: string;
  kind: "token" | "handle";
  label: string;
  ref: string;
}

export interface Ballot {
  id: string; // period start, UTC, "YYYY-MM-DDTHH"
  opened_at: string;
  closes_at: string;
  options: BallotOption[];
  votes: Record<string, string>; // wallet -> option key
  closed: boolean;
  winner?: string;
  runner_up?: string;
  carried?: string; // option key carried from the previous period
  source?: "x" | "site"; // where the votes are cast
  poll_tweet_id?: string;
  poll_url?: string;
  x_tally?: Record<string, number>; // votes read from the X poll
  case_n?: number; // the case the winner became
}

export interface Dispute {
  wallet: string;
  at: string;
  status: "open" | "removed" | "kept";
  reviewed_at?: string;
}

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
  applied?: boolean;
}

// ---- periods --------------------------------------------------------------
export const PERIOD_MS = Math.max(0.25, Number(process.env.BALLOT_PERIOD_HOURS ?? 1)) * 3_600_000;
const periodStart = (t = Date.now()) => new Date(Math.floor(t / PERIOD_MS) * PERIOD_MS);
export const periodId = (t = Date.now()) => periodStart(t).toISOString().slice(0, 13);
export const currentId = () => periodId();

function bounds(id: string): { opened_at: string; closes_at: string } {
  const start = new Date(`${id}:00:00.000Z`);
  return { opened_at: start.toISOString(), closes_at: new Date(start.getTime() + PERIOD_MS).toISOString() };
}

// ---- disputes -----------------------------------------------------------
let hidden = new Set<string>();

/** Disputed wallets. Refreshed by primeHidden() at the start of every request. */
export function hiddenWallets(): Set<string> {
  return hidden;
}

export async function primeHidden(): Promise<void> {
  const d = await readState<Dispute[]>("disputes", []);
  hidden = new Set(d.map((x) => x.wallet));
}

export async function getDisputes(): Promise<Dispute[]> {
  return (await readState<Dispute[]>("disputes", [])).slice().sort((a, b) => b.at.localeCompare(a.at));
}

export async function addDispute(wallet: string): Promise<Dispute> {
  let out: Dispute | undefined;
  await updateState<Dispute[]>("disputes", [], (all) => {
    out = all.find((d) => d.wallet === wallet);
    if (!out) {
      out = { wallet, at: new Date().toISOString(), status: "open" };
      all.push(out);
    }
    return all;
  });
  hidden.add(wallet);
  return out!;
}

export async function reviewDispute(wallet: string, status: "removed" | "kept"): Promise<Dispute | null> {
  let out: Dispute | null = null;
  await updateState<Dispute[]>("disputes", [], (all) => {
    const d = all.find((x) => x.wallet === wallet);
    if (d) {
      d.status = status;
      d.reviewed_at = new Date().toISOString();
      out = d;
    }
    return all;
  });
  return out;
}

// ---- leads --------------------------------------------------------------
export async function getLeads(): Promise<Lead[]> {
  return (await readState<Lead[]>("leads", [])).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Approve or reject. An approved lead reaches the registry on the agent's next run. */
export async function reviewLead(id: string, status: "approved" | "rejected"): Promise<Lead | null> {
  let out: Lead | null = null;
  await updateState<Lead[]>("leads", [], (all) => {
    const l = all.find((x) => x.id === id && x.status === "open");
    if (l) {
      l.status = status;
      out = l;
    }
    return all;
  });
  return out;
}

// ---- ballots ------------------------------------------------------------
export function tally(b: Ballot): Record<string, number> {
  const t: Record<string, number> = {};
  for (const o of b.options) t[o.key] = 0;
  if (b.x_tally) {
    for (const [k, v] of Object.entries(b.x_tally)) if (k in t) t[k] = v;
  } else {
    for (const k of Object.values(b.votes)) if (k in t) t[k] += 1;
  }
  return t;
}

/** Winner and runner-up by votes; ties go to the earlier option. */
export function standings(b: Ballot): { winner?: string; runner_up?: string } {
  const t = tally(b);
  const ordered = b.options.map((o) => o.key).sort((a, c) => t[c] - t[a]);
  return { winner: ordered[0], runner_up: ordered[1] };
}

function closeStale(ballots: Ballot[], now = Date.now()): boolean {
  let changed = false;
  for (const b of ballots) {
    if (!b.closed && Date.parse(b.closes_at) <= now) {
      Object.assign(b, standings(b), { closed: true });
      changed = true;
    }
  }
  return changed;
}

export async function getBallots(): Promise<Ballot[]> {
  const ballots = await readState<Ballot[]>("ballots", []);
  if (closeStale(ballots)) await writeState("ballots", ballots);
  return ballots.sort((a, b) => b.id.localeCompare(a.id));
}

export async function getBallot(id: string): Promise<Ballot | null> {
  return (await getBallots()).find((b) => b.id === id) ?? null;
}

export async function getCurrentBallot(): Promise<Ballot | null> {
  return getBallot(currentId());
}

/** Option keys on any ballot in the last `hours`. */
export async function recentlyBalloted(hours = 24): Promise<Set<string>> {
  const cutoff = Date.now() - hours * 3_600_000;
  const s = new Set<string>();
  for (const b of await getBallots()) if (Date.parse(b.opened_at) >= cutoff) for (const o of b.options) s.add(o.key);
  return s;
}

/** The runner-up of the most recent closed ballot, which carries to the next one. */
export async function carryOver(): Promise<BallotOption | null> {
  const prev = (await getBallots()).find((b) => b.closed);
  if (!prev?.runner_up) return null;
  return prev.options.find((o) => o.key === prev.runner_up) ?? null;
}

export async function setBallot(id: string, options: BallotOption[], carried?: string): Promise<Ballot> {
  let out!: Ballot;
  await updateState<Ballot[]>("ballots", [], (ballots) => {
    const existing = ballots.find((b) => b.id === id);
    if (existing && Object.keys(existing.votes).length > 0) throw new Error("Ballot already has votes.");
    out = { id, ...bounds(id), options, votes: {}, closed: false, carried };
    const next = ballots.filter((x) => x.id !== id);
    next.push(out);
    // keep the document small: the last 500 periods
    return next.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 500);
  });
  return out;
}

export type VoteResult = { ok: true; ballot: Ballot } | { ok: false; status: number; error: string };

export async function castVote(ballotId: string, wallet: string, option: string): Promise<VoteResult> {
  let result: VoteResult = { ok: false, status: 404, error: "No such ballot." };
  await updateState<Ballot[]>("ballots", [], (ballots) => {
    closeStale(ballots);
    const b = ballots.find((x) => x.id === ballotId);
    if (!b) return ballots;
    if (b.closed || b.id !== currentId()) result = { ok: false, status: 409, error: "Ballot closed." };
    else if (!b.options.some((o) => o.key === option)) result = { ok: false, status: 400, error: "Not an option." };
    else if (wallet in b.votes) result = { ok: false, status: 409, error: "One vote per wallet." };
    else {
      b.votes[wallet] = option;
      result = { ok: true, ballot: b };
    }
    return ballots;
  });
  return result;
}
