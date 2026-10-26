/**
 * Arkham Intel API (https://api.arkm.com). Header: API-Key.
 * We use it for labels (who is behind an address) and enriched transfers.
 *
 * Rules applied here, not downstream:
 *   - a label naming a person is dropped; only a handle or an organisation survives
 *   - an entity prediction (Arkham's ~80% tier) is never treated as confirmed
 */
import type { Label, Transfer } from "./types.js";

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ArkAddr {
  address?: string;
  chain?: string;
  arkhamEntity?: { id?: string; name?: string; type?: string; twitter?: string; website?: string; predicted?: boolean } | null;
  arkhamLabel?: { name?: string; predicted?: boolean } | null;
  predicted?: boolean;
  isUserAddress?: boolean;
  contract?: boolean;
}

export class Arkham {
  private readonly key: string;
  private readonly base: string;
  private lastHeavy = 0;
  constructor(key = process.env.ARKHAM_API_KEY ?? "", base = process.env.ARKHAM_API_URL ?? "https://api.arkm.com") {
    if (!key) throw new Error("ARKHAM_API_KEY is not set");
    this.key = key;
    this.base = base.replace(/\/$/, "");
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}, heavy = false): Promise<T | null> {
    if (heavy) {
      const wait = 1100 - (Date.now() - this.lastHeavy);
      if (wait > 0) await SLEEP(wait);
      this.lastHeavy = Date.now();
    }
    const u = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const r = await fetch(u, { headers: { "API-Key": this.key } });
    if (r.status === 404) return null;
    if (r.status === 429) {
      await SLEEP(2000);
      return this.get(path, params, heavy);
    }
    if (!r.ok) throw new Error(`arkham ${path} ${r.status}`);
    return (await r.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    const wait = 1100 - (Date.now() - this.lastHeavy);
    if (wait > 0) await SLEEP(wait);
    this.lastHeavy = Date.now();
    const r = await fetch(this.base + path, { method: "POST", headers: { "API-Key": this.key, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`arkham ${path} ${r.status}`);
    return (await r.json()) as T;
  }

  getPublic<T>(path: string, params: Record<string, string | number> = {}, heavy = false): Promise<T | null> {
    return this.get<T>(path, params, heavy);
  }

  resolveHandle = resolveHandle;

  async label(address: string): Promise<Label | null> {
    const j = await this.get<ArkAddr>(`/intelligence/address/${address}`, { chain: "solana" });
    return j ? toLabel(address, j) : null;
  }

  /** Up to 1000 addresses in one heavy call. Returns a map; unlabelled addresses are absent. */
  async labels(addresses: string[]): Promise<Map<string, Label>> {
    const out = new Map<string, Label>();
    const uniq = [...new Set(addresses)].slice(0, 1000);
    if (!uniq.length) return out;
    const j = await this.post<{ addresses?: Record<string, ArkAddr> } | Record<string, ArkAddr> | ArkAddr[]>("/intelligence/address/batch", { addresses: uniq, chain: "solana" });
    if (!j) return out;
    // Live shape: { addresses: { "<addr>": {...} } }. Older docs show a flat map or an array; accept all three.
    const body = !Array.isArray(j) && j && typeof j === "object" && "addresses" in j && j.addresses && typeof j.addresses === "object" ? (j.addresses as Record<string, ArkAddr>) : j;
    const entries: Array<[string, ArkAddr]> = Array.isArray(body) ? body.map((a) => [a.address ?? "", a]) : Object.entries(body as Record<string, ArkAddr>);
    for (const [addr, a] of entries) {
      const l = toLabel(addr || a.address || "", a);
      if (l) out.set(l.address, l);
    }
    return out;
  }

  /** Enriched transfers for an address on Solana, newest first. 2 credits a row. */
  async transfers(address: string, limit = 100): Promise<Transfer[]> {
    type Row = {
      fromAddress?: ArkAddr;
      toAddress?: ArkAddr;
      tokenSymbol?: string;
      tokenAddress?: string;
      unitValue?: number;
      historicalUSD?: number;
      transactionHash?: string;
      blockTimestamp?: string;
    };
    const j = await this.get<{ transfers?: Row[] }>("/transfers", { base: address, chains: "solana", limit: Math.min(limit, 500), sortKey: "time", sortDir: "desc" }, true);
    return (j?.transfers ?? []).map((t) => ({
      signature: t.transactionHash ?? "",
      at: t.blockTimestamp ?? "",
      from: t.fromAddress?.address ?? "",
      to: t.toAddress?.address ?? "",
      amount: t.unitValue ?? 0,
      kind: !t.tokenAddress || t.tokenSymbol === "SOL" ? "sol" : "token",
      mint: t.tokenAddress,
      type: "TRANSFER",
    }));
  }
}

export interface HandleWallets {
  handle: string;
  entityId: string | null;
  wallets: Array<{ address: string; label: string | null; platform?: string; url: string }>;
}

/** The Solana wallets Arkham ties to a handle. Impersonator and hacker entities are left out. */
export async function resolveHandle(this: Arkham, handle: string): Promise<HandleWallets> {
  const h = handle.replace(/^@/, "").toLowerCase();
  type Search = {
    arkhamEntities?: Array<{ id: string; name?: string; type?: string; twitter?: string }>;
    arkhamAddresses?: Array<ArkAddr & { chain?: string }>;
  };
  const j = await this.getPublic<Search>("/intelligence/search", { query: `@${h}` }, true);
  const ent = (j?.arkhamEntities ?? []).find((e) => (e.twitter ?? "").replace(/^.*\//, "").replace(/^@/, "").toLowerCase() === h && !/impersonat|hacker|scam|phish/i.test(`${e.name} ${e.type}`));
  const wallets = (j?.arkhamAddresses ?? [])
    .filter((a) => a.chain === "solana" && a.address && ent && a.arkhamEntity?.id === ent.id)
    .map((a) => {
      const pf = (a.arkhamLabel?.name ?? "").match(/^"([^"]{1,40})" on (Pump\.fun|Vector\.fun|[A-Za-z.]+)$/i);
      return { address: a.address!, label: pf ? pf[1] : a.arkhamLabel?.name ?? null, platform: pf ? pf[2].toLowerCase() : undefined, url: `https://intel.arkm.com/explorer/address/${a.address}` };
    });
  return { handle: `@${h}`, entityId: ent?.id ?? null, wallets };
}

function mapType(t: string): Label["type"] {
  const s = t.toLowerCase();
  if (!s) return null;
  if (/cex|exchange/.test(s)) return "cex";
  if (/bridge/.test(s)) return "bridge";
  if (/protocol|dex|amm|market|contract|infrastructure/.test(s)) return "protocol";
  if (/fund|vc|dao|treasury/.test(s)) return "fund";
  if (/individual|person|influencer|trader|whale|kol/.test(s)) return "individual";
  return "other";
}

export function toLabel(address: string, a: ArkAddr): Label | null {
  const ent = a.arkhamEntity ?? null;
  const lbl = a.arkhamLabel ?? null;
  if (!ent?.name && !lbl?.name && !ent?.twitter) return null;
  const predicted = a.predicted === true || ent?.predicted === true || lbl?.predicted === true;
  let type = mapType(ent?.type ?? "");
  let handle = ent?.twitter ? "@" + ent.twitter.replace(/^@/, "").replace(/^.*\//, "").toLowerCase() : null;
  let platform: string | undefined;
  // Arkham names pump.fun accounts as `"username" on Pump.fun`. A username is a handle, not a person.
  const pf = (ent?.name ?? lbl?.name ?? "").match(/^"([^"]{1,40})" on Pump\.fun$/i);
  if (pf && !handle) {
    handle = "@" + pf[1].toLowerCase().replace(/[^a-z0-9_.]/g, "");
    platform = "pump.fun";
    type = type ?? "other";
  }
  // A person's name never leaves this function. Handles and organisations only.
  const entity = pf ? null : type === "individual" || (!type && !ent?.type && handle) ? null : ent?.name ?? lbl?.name ?? null;
  return { address, entity, handle, type, url: `https://intel.arkm.com/explorer/address/${address}`, predicted, platform };
}
