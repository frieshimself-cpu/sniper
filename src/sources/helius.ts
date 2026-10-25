/** Helius: enhanced transactions, DAS asset metadata, plain RPC. */
import type { Holder, TokenInfo, Transfer } from "./types.js";

const LAMPORTS = 1_000_000_000;
const MIN_GAP_MS = Number(process.env.HELIUS_MIN_GAP_MS ?? 130); // ~8 requests a second
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Tx {
  signature: string;
  timestamp: number;
  type: string;
  feePayer: string;
  nativeTransfers?: Array<{ fromUserAccount: string; toUserAccount: string; amount: number }>;
  tokenTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; tokenAmount: number; mint: string }>;
}

export class Helius {
  private readonly key: string;
  constructor(key = process.env.HELIUS_API_KEY ?? "") {
    if (!key) throw new Error("HELIUS_API_KEY is not set");
    this.key = key;
  }
  private get rpc() {
    return `https://mainnet.helius-rpc.com/?api-key=${this.key}`;
  }

  private last = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** One request at a time, spaced out, retried on 429 and 5xx, each capped at 30 s. */
  private request(url: string | URL, init: RequestInit): Promise<Response> {
    const job = async () => {
      for (let attempt = 0; ; attempt++) {
        const gap = MIN_GAP_MS - (Date.now() - this.last);
        if (gap > 0) await sleep(gap);
        this.last = Date.now();
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
        if ((r.status === 429 || r.status >= 500) && attempt < 5) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        return r;
      }
    };
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** params: an array for classic RPC, an object for DAS methods like getAsset. */
  async call<T>(method: string, params: unknown): Promise<T> {
    const r = await this.request(this.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!r.ok) throw new Error(`helius ${method} ${r.status}`);
    const j = (await r.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new Error(`helius ${method}: ${j.error.message}`);
    return j.result as T;
  }

  async token(mint: string): Promise<TokenInfo | null> {
    type Asset = {
      content?: { metadata?: { symbol?: string; name?: string } };
      token_info?: { supply?: number; decimals?: number };
      creators?: Array<{ address: string }>;
    };
    let asset: Asset | null = null;
    try {
      asset = await this.call<Asset>("getAsset", { id: mint });
    } catch {
      asset = null;
    }
    let decimals = asset?.token_info?.decimals ?? 6;
    let supply = (asset?.token_info?.supply ?? 0) / 10 ** decimals;
    if (!supply) {
      try {
        const s = await this.call<{ value: { uiAmount: number | null; decimals: number } }>("getTokenSupply", [mint]);
        supply = s.value.uiAmount ?? 0;
        decimals = s.value.decimals;
      } catch {
        return null; // not a token
      }
    }
    const first = null as { feePayer: string; at: string; approx: boolean } | null; // the detectors derive the launch
    return {
      mint,
      symbol: asset?.content?.metadata?.symbol?.trim() || mint.slice(0, 4),
      name: asset?.content?.metadata?.name?.trim() || "unknown",
      decimals,
      supply,
      deployer: first?.feePayer ?? asset?.creators?.[0]?.address ?? null,
      created_at: first?.at ?? null,
      deployer_approx: first?.approx ?? true,
    };
  }

  /** Walk signatures back to the oldest we can reach within the page cap. */
  private async earliest(address: string, maxPages = 8): Promise<{ feePayer: string; at: string; approx: boolean } | null> {
    type Sig = { signature: string; blockTime: number | null };
    let before: string | undefined;
    let oldest: Sig | null = null;
    let pages = 0;
    while (pages < maxPages) {
      const batch = await this.call<Sig[]>("getSignaturesForAddress", [address, { limit: 1000, before }]);
      if (!batch.length) break;
      oldest = batch[batch.length - 1];
      before = oldest.signature;
      pages++;
      if (batch.length < 1000) break;
    }
    if (!oldest) return null;
    const tx = await this.call<{ transaction: { message: { accountKeys: Array<{ pubkey: string } | string> } } } | null>("getTransaction", [
      oldest.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 },
    ]);
    const k = tx?.transaction.message.accountKeys[0];
    const feePayer = typeof k === "string" ? k : k?.pubkey;
    if (!feePayer) return null;
    return { feePayer, at: new Date((oldest.blockTime ?? 0) * 1000).toISOString(), approx: pages >= maxPages };
  }

  private parse(txs: Tx[]): Transfer[] {
    const out: Transfer[] = [];
    for (const t of txs) {
      const at = new Date(t.timestamp * 1000).toISOString();
      for (const n of t.nativeTransfers ?? []) {
        if (n.amount < 0.01 * LAMPORTS) continue;
        out.push({ signature: t.signature, at, from: n.fromUserAccount, to: n.toUserAccount, amount: n.amount / LAMPORTS, kind: "sol", type: t.type, feePayer: t.feePayer });
      }
      for (const k of t.tokenTransfers ?? []) {
        if (!k.toUserAccount) continue; // a mint has no sender; keep it, from = ""
        out.push({ signature: t.signature, at, from: k.fromUserAccount ?? "", to: k.toUserAccount, amount: k.tokenAmount, kind: "token", mint: k.mint, type: t.type, feePayer: t.feePayer });
      }
    }
    return out;
  }

  async transfers(address: string, limit = 300): Promise<Transfer[]> {
    const out: Transfer[] = [];
    let before: string | undefined;
    let seen = 0;
    while (seen < limit) {
      const u = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
      u.searchParams.set("api-key", this.key);
      u.searchParams.set("limit", "100");
      if (before) u.searchParams.set("before", before);
      const r = await this.request(u, {});
      if (!r.ok) throw new Error(`helius transactions ${r.status}`);
      const txs = (await r.json()) as Tx[];
      if (!txs.length) break;
      out.push(...this.parse(txs));
      seen += txs.length;
      before = txs[txs.length - 1].signature;
      if (txs.length < 100) break;
    }
    return out;
  }

  /** Oldest `limit` transactions of an address, parsed, oldest first. Signatures are cheap; parsing is batched. */
  async firstTransfers(address: string, limit = 200, maxPages = 25): Promise<Transfer[]> {
    type Sig = { signature: string; blockTime: number | null };
    const sigs: Sig[] = [];
    let before: string | undefined;
    for (let p = 0; p < maxPages; p++) {
      const batch = await this.call<Sig[]>("getSignaturesForAddress", [address, { limit: 1000, before }]);
      if (!batch.length) break;
      sigs.push(...batch);
      before = batch[batch.length - 1].signature;
      if (batch.length < 1000) break;
    }
    const oldest = sigs.slice(-limit).reverse().map((s) => s.signature);
    const out: Transfer[] = [];
    for (let i = 0; i < oldest.length; i += 100) {
      const r = await this.request(`https://api.helius.xyz/v0/transactions?api-key=${this.key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: oldest.slice(i, i + 100) }),
      });
      if (!r.ok) throw new Error(`helius parse ${r.status}`);
      out.push(...this.parse((await r.json()) as Tx[]));
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }

  async holders(mint: string, n = 20): Promise<Holder[]> {
    type Largest = { value: Array<{ address: string; uiAmount: number | null }> };
    type Supply = { value: { uiAmount: number | null } };
    const [largest, supply] = await Promise.all([
      this.call<Largest>("getTokenLargestAccounts", [mint]),
      this.call<Supply>("getTokenSupply", [mint]),
    ]);
    const total = supply.value.uiAmount ?? 0;
    const accounts = largest.value.slice(0, n);
    type Acct = { value: Array<{ data: { parsed: { info: { owner: string } } } } | null> };
    const owners = await this.call<Acct>("getMultipleAccounts", [accounts.map((a) => a.address), { encoding: "jsonParsed" }]);
    return accounts.map((a, i) => ({
      address: owners.value[i]?.data.parsed.info.owner ?? a.address,
      amount: a.uiAmount ?? 0,
      share: total ? (a.uiAmount ?? 0) / total : 0,
    }));
  }
}
