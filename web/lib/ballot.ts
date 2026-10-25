/**
 * Ballot building: four subjects, eligible only, no repeat within 30 days,
 * yesterday's runner-up carried over. Used by /admin and by the daily auto-build.
 */
import { eligibleSubjects } from "./data";
import { carryOver, getTodayBallot, recentlyBalloted, setBallot, todayId, type Ballot, type BallotOption } from "./store";

export const BALLOT_SIZE = 4; // at most
export const BALLOT_MIN = 2; // at least, or there is no ballot

export function scoreThreshold(): number {
  const n = Number(process.env.BALLOT_SCORE_THRESHOLD ?? 40);
  return Number.isFinite(n) ? n : 40;
}

export interface Candidate extends BallotOption {
  score: number;
  carried: boolean;
}

/** Everything the admin may pick from today, carried runner-up first. */
export function candidates(): Candidate[] {
  const recent = recentlyBalloted(30);
  const carried = carryOver();
  const today = getTodayBallot();
  // Today's own options do not count against today.
  if (today) for (const o of today.options) recent.delete(o.key);
  const out: Candidate[] = [];
  if (carried) out.push({ ...carried, score: 0, carried: true });
  for (const s of eligibleSubjects(scoreThreshold())) {
    if (carried && s.key === carried.key) continue;
    if (recent.has(s.key)) continue;
    out.push({ key: s.key, kind: s.kind, label: s.label, ref: s.ref, score: s.score, carried: false });
  }
  return out;
}

/** Default pick: carried runner-up, then highest-scoring tokens, then handles. */
export function autoPick(): BallotOption[] {
  const all = candidates();
  const tokens = all.filter((c) => !c.carried && c.kind === "token").sort((a, b) => b.score - a.score);
  const handles = all.filter((c) => !c.carried && c.kind === "handle");
  const picked: Candidate[] = [...all.filter((c) => c.carried), ...tokens, ...handles].slice(0, BALLOT_SIZE);
  return picked.map(({ key, kind, label, ref }) => ({ key, kind, label, ref }));
}

export function buildBallot(keys?: string[]): Ballot {
  const all = candidates();
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
    options = autoPick();
  }
  if (options.length < BALLOT_MIN || options.length > BALLOT_SIZE) throw new Error(`A ballot has ${BALLOT_MIN} to ${BALLOT_SIZE} options.`);
  const carried = all.find((c) => c.carried && options.some((o) => o.key === c.key))?.key;
  return setBallot(todayId(), options, carried);
}

/** Today's ballot, built automatically if the admin has not built one. */
export function ensureTodayBallot(): Ballot | null {
  const existing = getTodayBallot();
  if (existing) return existing;
  try {
    return buildBallot();
  } catch {
    return null;
  }
}
