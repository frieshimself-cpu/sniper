/**
 * Where subjects come from when the ballot has none: tokens paying for
 * attention. DexScreener's boost and profile feeds are public and free.
 */
export interface Candidate {
  mint: string;
  why: string;
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

export async function discover(limit = 12): Promise<Candidate[]> {
  const out = new Map<string, Candidate>();
  const top = (await getJson<Boost[]>("https://api.dexscreener.com/token-boosts/top/v1")) ?? [];
  for (const b of top) if (b.chainId === "solana") out.set(b.tokenAddress, { mint: b.tokenAddress, why: `top boosted, ${b.totalAmount ?? b.amount ?? 0} boosts` });
  const latest = (await getJson<Boost[]>("https://api.dexscreener.com/token-boosts/latest/v1")) ?? [];
  for (const b of latest) if (b.chainId === "solana" && !out.has(b.tokenAddress)) out.set(b.tokenAddress, { mint: b.tokenAddress, why: `boosted, ${b.totalAmount ?? b.amount ?? 0} boosts` });
  const profiles = (await getJson<Boost[]>("https://api.dexscreener.com/token-profiles/latest/v1")) ?? [];
  for (const b of profiles) if (b.chainId === "solana" && !out.has(b.tokenAddress)) out.set(b.tokenAddress, { mint: b.tokenAddress, why: "paid profile" });
  return [...out.values()].slice(0, limit);
}
