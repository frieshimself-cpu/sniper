/**
 * Where subjects come from when the ballot has none: tokens paying for
 * attention (DexScreener boosts and profiles) and launchpad tokens that are
 * trending (Jupiter's token API). Both feeds are public and free.
 */
export interface Candidate {
  mint: string;
  why: string;
  symbol?: string;
  name?: string;
  /** What the feed already knows. Used to cross-check the chain, never instead of it. */
  hints?: { deployer?: string; created_at?: string; launchpad?: string };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type Boost = { chainId: string; tokenAddress: string; totalAmount?: number; amount?: number };
type JupToken = { id: string; symbol?: string; name?: string; launchpad?: string | null; organicScoreLabel?: string; dev?: string; firstPool?: { id?: string; createdAt?: string } };

const HOUR = 3_600_000;
const MIN_AGE_H = Number(process.env.DISCOVER_MIN_AGE_HOURS ?? 1); // the first half hour is where the evidence is; let it land
const MAX_AGE_D = Number(process.env.DISCOVER_MAX_AGE_DAYS ?? 10);

/** Launchpad tokens, trending by organic score, old enough to have a story and young enough to matter. */
async function jupiterLaunches(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const window of ["1h", "24h"]) {
    const list = (await getJson<JupToken[]>(`https://lite-api.jup.ag/tokens/v2/toporganicscore/${window}?limit=100`)) ?? [];
    for (const t of list) {
      const created = t.firstPool?.createdAt ? Date.parse(t.firstPool.createdAt) : NaN;
      const age = Date.now() - created;
      if (!t.launchpad || !Number.isFinite(age) || age < MIN_AGE_H * HOUR || age > MAX_AGE_D * 86_400_000) continue;
      out.push({
        mint: t.id,
        symbol: t.symbol,
        name: t.name,
        why: `trending ${window} on ${t.launchpad}${t.organicScoreLabel ? `, ${t.organicScoreLabel} organic score` : ""}`,
        hints: { deployer: t.dev || undefined, created_at: t.firstPool?.createdAt, launchpad: t.launchpad },
      });
    }
  }
  return out;
}

export async function discover(limit = 12): Promise<Candidate[]> {
  const out = new Map<string, Candidate>();
  const top = (await getJson<Boost[]>("https://api.dexscreener.com/token-boosts/top/v1")) ?? [];
  for (const b of top) if (b.chainId === "solana") out.set(b.tokenAddress, { mint: b.tokenAddress, why: `top boosted, ${b.totalAmount ?? b.amount ?? 0} boosts` });
  const latest = (await getJson<Boost[]>("https://api.dexscreener.com/token-boosts/latest/v1")) ?? [];
  for (const b of latest) if (b.chainId === "solana" && !out.has(b.tokenAddress)) out.set(b.tokenAddress, { mint: b.tokenAddress, why: `boosted, ${b.totalAmount ?? b.amount ?? 0} boosts` });
  const profiles = (await getJson<Boost[]>("https://api.dexscreener.com/token-profiles/latest/v1")) ?? [];
  for (const b of profiles) if (b.chainId === "solana" && !out.has(b.tokenAddress)) out.set(b.tokenAddress, { mint: b.tokenAddress, why: "paid profile" });
  for (const c of await jupiterLaunches()) if (!out.has(c.mint)) out.set(c.mint, c);
  return [...out.values()].slice(0, limit);
}

/** What Jupiter knows about one mint: its dev wallet and first pool. A cross-check for the chain, free. */
export async function tokenHints(mint: string): Promise<NonNullable<Candidate["hints"]>> {
  const j = await getJson<JupToken[] | JupToken>(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
  const t = Array.isArray(j) ? j.find((x) => x.id === mint) ?? j[0] : j;
  if (!t || t.id !== mint) return {};
  return { deployer: t.dev || undefined, created_at: t.firstPool?.createdAt, launchpad: t.launchpad ?? undefined };
}

/** Fill in symbol and name for candidates that came without them (DexScreener boosts). Free, 30 mints a call. */
export async function describe(cands: Candidate[]): Promise<Candidate[]> {
  const missing = cands.filter((c) => !c.symbol).map((c) => c.mint);
  type Pair = { baseToken?: { address: string; symbol: string; name: string } };
  const found = new Map<string, { symbol: string; name: string }>();
  for (let i = 0; i < missing.length; i += 30) {
    const pairs = (await getJson<Pair[]>(`https://api.dexscreener.com/tokens/v1/solana/${missing.slice(i, i + 30).join(",")}`)) ?? [];
    for (const p of pairs) if (p.baseToken && !found.has(p.baseToken.address)) found.set(p.baseToken.address, { symbol: p.baseToken.symbol, name: p.baseToken.name });
  }
  return cands.map((c) => (c.symbol ? c : { ...c, ...(found.get(c.mint) ?? {}) }));
}
