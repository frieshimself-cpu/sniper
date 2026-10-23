/**
 * Site state that is not the agent's: ballots, votes, disputes.
 * Plain JSON files under CRIME_STATE_DIR (default web/.data). One process, one writer.
 */
import fs from "node:fs";
import path from "node:path";

export interface BallotOption {
  key: string;
  kind: "token" | "handle";
  label: string;
  ref: string;
}

export interface Ballot {
  id: string; // YYYY-MM-DD (UTC)
  opened_at: string;
  closes_at: string;
  options: BallotOption[];
  votes: Record<string, string>; // wallet -> option key
  closed: boolean;
  winner?: string;
  runner_up?: string;
  carried?: string; // option key carried from the previous day
}

export interface Dispute {
  wallet: string;
  at: string;
  status: "open" | "removed" | "kept";
  reviewed_at?: string;
}

interface State {
  ballots: Ballot[];
  disputes: Dispute[];
}

function stateDir(): string {
  const d = process.env.CRIME_STATE_DIR?.trim();
  return d ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), d) : path.join(process.cwd(), ".data");
}

function file(name: keyof State): string {
  return path.join(stateDir(), `${name}.json`);
}

function read<K extends keyof State>(name: K): State[K] {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8")) as State[K];
  } catch {
    return [] as unknown as State[K];
  }
}

function write<K extends keyof State>(name: K, value: State[K]): void {
  fs.mkdirSync(stateDir(), { recursive: true });
  const tmp = file(name) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file(name));
}

// ---- disputes -----------------------------------------------------------
export function hiddenWallets(): Set<string> {
  // A disputed wallet is hidden from the moment the dispute lands, whatever the review says.
  return new Set(read("disputes").map((d) => d.wallet));
}

export function getDisputes(): Dispute[] {
  return read("disputes").slice().sort((a, b) => b.at.localeCompare(a.at));
}

export function addDispute(wallet: string): Dispute {
  const all = read("disputes");
  const existing = all.find((d) => d.wallet === wallet);
  if (existing) return existing;
  const d: Dispute = { wallet, at: new Date().toISOString(), status: "open" };
  all.push(d);
  write("disputes", all);
  return d;
}

export function reviewDispute(wallet: string, status: "removed" | "kept"): Dispute | null {
  const all = read("disputes");
  const d = all.find((x) => x.wallet === wallet);
  if (!d) return null;
  d.status = status;
  d.reviewed_at = new Date().toISOString();
  write("disputes", all);
  return d;
}

// ---- ballots ------------------------------------------------------------
export const todayId = (d = new Date()) => d.toISOString().slice(0, 10);

function dayBounds(id: string): { opened_at: string; closes_at: string } {
  const start = new Date(`${id}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  return { opened_at: start.toISOString(), closes_at: end.toISOString() };
}

export function tally(b: Ballot): Record<string, number> {
  const t: Record<string, number> = {};
  for (const o of b.options) t[o.key] = 0;
  for (const k of Object.values(b.votes)) if (k in t) t[k] += 1;
  return t;
}

/** Winner and runner-up by votes; ties go to the earlier option. */
export function standings(b: Ballot): { winner?: string; runner_up?: string } {
  const t = tally(b);
  const ordered = b.options.map((o) => o.key).sort((a, c) => t[c] - t[a]);
  return { winner: ordered[0], runner_up: ordered[1] };
}

function closeStale(ballots: Ballot[], today: string): boolean {
  let changed = false;
  for (const b of ballots) {
    if (!b.closed && b.id < today) {
      Object.assign(b, standings(b), { closed: true });
      changed = true;
    }
  }
  return changed;
}

export function getBallots(): Ballot[] {
  const ballots = read("ballots");
  if (closeStale(ballots, todayId())) write("ballots", ballots);
  return ballots.sort((a, b) => b.id.localeCompare(a.id));
}

export function getBallot(id: string): Ballot | null {
  return getBallots().find((b) => b.id === id) ?? null;
}

export function getTodayBallot(): Ballot | null {
  return getBallot(todayId());
}

/** Option keys that appeared on any ballot in the last `days` days. */
export function recentlyBalloted(days = 30): Set<string> {
  const cutoff = todayId(new Date(Date.now() - days * 86_400_000));
  const s = new Set<string>();
  for (const b of getBallots()) if (b.id >= cutoff) for (const o of b.options) s.add(o.key);
  return s;
}

/** The runner-up of the most recent closed ballot, which carries to the next one. */
export function carryOver(): BallotOption | null {
  const prev = getBallots().find((b) => b.closed);
  if (!prev?.runner_up) return null;
  return prev.options.find((o) => o.key === prev.runner_up) ?? null;
}

export function setBallot(id: string, options: BallotOption[], carried?: string): Ballot {
  const ballots = read("ballots");
  const existing = ballots.find((b) => b.id === id);
  if (existing && Object.keys(existing.votes).length > 0) {
    throw new Error("Ballot already has votes.");
  }
  const b: Ballot = { id, ...dayBounds(id), options, votes: {}, closed: false, carried };
  const next = ballots.filter((x) => x.id !== id);
  next.push(b);
  write("ballots", next);
  return b;
}

export type VoteResult = { ok: true; ballot: Ballot } | { ok: false; status: number; error: string };

export function castVote(ballotId: string, wallet: string, option: string): VoteResult {
  const ballots = read("ballots");
  closeStale(ballots, todayId());
  const b = ballots.find((x) => x.id === ballotId);
  if (!b) return { ok: false, status: 404, error: "No such ballot." };
  if (b.closed || b.id !== todayId()) return { ok: false, status: 409, error: "Ballot closed." };
  if (!b.options.some((o) => o.key === option)) return { ok: false, status: 400, error: "Not an option." };
  if (wallet in b.votes) return { ok: false, status: 409, error: "One vote per wallet." };
  b.votes[wallet] = option;
  write("ballots", ballots);
  return { ok: true, ballot: b };
}
