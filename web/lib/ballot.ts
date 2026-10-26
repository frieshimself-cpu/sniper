/**
 * The hourly ballot: up to four subjects, the community picks, the winner is the next case.
 * Options are fresh launches that are paying for attention (the agent's discovery feeds),
 * never anything already on file, never anything balloted in the last day. The previous
 * period's runner-up carries over. With BALLOT_SOURCE=archive (the tests) options come from
 * the archive instead.
 */
import { discover, describe } from "@agent/sources/discover";
import { eligibleSubjects, getCases } from "./data";
import { getBoard } from "./nominations";
import { carryOver, currentId, getBallots, getCurrentBallot, recentlyBalloted, setBallot, type Ballot, type BallotOption } from "./store";

export const BALLOT_SIZE = 4; // at most
export const BALLOT_MIN = 2; // at least, or there is no ballot

export function scoreThreshold(): number {
  const n = Number(process.env.BALLOT_SCORE_THRESHOLD ?? 40);
  return Number.isFinite(n) ? n : 40;
}

export interface Candidate extends BallotOption {
  score: number;
  carried: boolean;
  why?: string;
}

async function fromDiscovery(): Promise<Candidate[]> {
  const covered = new Set(getCases().map((c) => c.token.mint));
  const raw = (await discover(60)).filter((c) => !covered.has(c.mint));
  const described = await describe(raw.slice(0, 40));
  return described
    .filter((c) => c.symbol)
    .map((c) => ({ key: `token:${c.mint}`, kind: "token" as const, label: `$${c.symbol}`, ref: c.mint, score: 0, carried: false, why: c.why }));
}

function fromArchive(): Candidate[] {
  return eligibleSubjects(scoreThreshold()).map((s) => ({ key: s.key, kind: s.kind, label: s.label, ref: s.ref, score: s.score, carried: false }));
}

/** Everything the admin may pick from this period, carried runner-up first. */
export async function candidates(): Promise<Candidate[]> {
  const recent = await recentlyBalloted(24);
  const carried = await carryOver();
  const current = await getCurrentBallot();
  if (current) for (const o of current.options) recent.delete(o.key);
  const out: Candidate[] = [];
  if (carried) out.push({ ...carried, score: 0, carried: true });
  const source = (process.env.BALLOT_SOURCE ?? "board").toLowerCase();
  let pool: Candidate[] = [];
  if (source !== "archive") {
    // people first: the nominations board, minus handles on file in the last week
    const week = Date.now() - 7 * 86_400_000;
    const recentHandles = new Set(getCases().filter((c) => c.kind === "person" && Date.parse(c.opened_at) >= week).flatMap((c) => c.subjects));
    for (const e of await getBoard().catch(() => [])) {
      if (recentHandles.has(e.handle)) continue;
      pool.push({ key: `handle:${e.handle}`, kind: "handle", label: e.handle, ref: e.handle, score: e.nominations, carried: false, why: `${e.nominations} nomination${e.nominations === 1 ? "" : "s"}` });
    }
  }
  if (source !== "archive" && pool.length < BALLOT_SIZE) {
    try {
      pool.push(...(await fromDiscovery()));
    } catch {
      /* the board alone, then */
    }
  }
  if (pool.length < BALLOT_MIN) pool = [...pool, ...fromArchive()];
  for (const c of pool) {
    if (carried && c.key === carried.key) continue;
    if (recent.has(c.key) || out.some((o) => o.key === c.key)) continue;
    out.push(c);
  }
  return out;
}

export async function autoPick(): Promise<BallotOption[]> {
  const all = await candidates();
  const picked = [...all.filter((c) => c.carried), ...all.filter((c) => !c.carried)].slice(0, BALLOT_SIZE);
  return picked.map(({ key, kind, label, ref }) => ({ key, kind, label, ref }));
}

export async function buildBallot(keys?: string[]): Promise<Ballot> {
  const all = await candidates();
  let options: BallotOption[];
  if (keys && keys.length) {
    const byKey = new Map(all.map((c) => [c.key, c]));
    const missing = keys.filter((k) => !byKey.has(k));
    if (missing.length) throw new Error(`Not eligible: ${missing.join(", ")}`);
    options = keys.map((k) => {
      const { key, kind, label, ref } = byKey.get(k)!;
      return { key, kind, label, ref };
    });
  } else {
    options = await autoPick();
  }
  if (options.length < BALLOT_MIN || options.length > BALLOT_SIZE) throw new Error(`A ballot has ${BALLOT_MIN} to ${BALLOT_SIZE} options.`);
  const carried = all.find((c) => c.carried && options.some((o) => o.key === c.key))?.key;
  return setBallot(currentId(), options, carried);
}

let building: Promise<Ballot | null> | null = null;

/** This period's ballot. Built on first sight unless BALLOT_AUTOBUILD=off (set that when the agent posts X polls). */
export async function ensureCurrentBallot(): Promise<Ballot | null> {
  const existing = await getCurrentBallot();
  if (existing) return existing;
  if ((process.env.BALLOT_AUTOBUILD ?? "on").toLowerCase() === "off") return (await getBallots())[0] ?? null;
  if (!building) {
    building = buildBallot()
      .catch(() => null)
      .finally(() => {
        building = null;
      });
  }
  return building;
}
