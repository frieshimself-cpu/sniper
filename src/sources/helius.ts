/** Helius: enhanced transactions, DAS asset metadata, plain RPC. */
import type { Holder, TokenInfo, Transfer } from "./types.js";

const LAMPORTS = 1_000_000_000;

export class Helius {
  private readonly key: string;
  constructor(key = process.env.HELIUS_API_KEY ?? "") {
    if (!key) throw new Error("HELIUS_API_KEY is not set");
    this.key = key;
  }
  private get rpc() {
    return `https://mainnet.helius-rpc.com/?api-key=${this.key}`;
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const r = await fetch(this.rpc, {
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
      asset = await this.call<Asset>("getAsset", [{ id: mint }]);
    } catch {
      return null;
    }
    const decimals = asset?.token_info?.decimals ?? 6;
    const supply = (asset?.token_info?.supply ?? 0) / 10 ** decimals;
    const first = await this.earliest(mint);
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
  private async earliest(address: string, maxPages = 30): Promise<{ feePayer: string; at: string; approx: boolean } | null> {
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
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    const k = tx?.transaction.message.accountKeys[0];
    const feePayer = typeof k === "string" ? k : k?.pubkey;
    if (!feePayer) return null;
    return { feePayer, at: new Date((oldest.blockTime ?? 0) * 1000).toISOString(), approx: pages >= maxPages };
  }

  async transfers(address: string, limit = 300): Promise<Transfer[]> {
    type Tx = {
      signature: string;
      timestamp: number;
      type: string;
      feePayer: string;
      nativeTransfers?: Array<{ fromUserAccount: string; toUserAccount: string; amount: number }>;
      tokenTransfers?: Array<{ fromUserAccount: string; toUserAccount: string; tokenAmount: number; mint: string }>;
    };
    const out: Transfer[] = [];
    let before: string | undefined;
    while (out.length < limit) {
      const u = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
      u.searchParams.set("api-key", this.key);
      u.searchParams.set("limit", "100");
      if (before) u.searchParams.set("before", before);
      const r = await fetch(u);
      if (!r.ok) throw new Error(`helius transactions ${r.status}`);
      const txs = (await r.json()) as Tx[];
      if (!txs.length) break;
      for (const t of txs) {
        const at = new Date(t.timestamp * 1000).toISOString();
        for (const n of t.nativeTransfers ?? []) {
          if (n.amount < 0.01 * LAMPORTS) continue;
          out.push({ signature: t.signature, at, from: n.fromUserAccount, to: n.toUserAccount, amount: n.amount / LAMPORTS, kind: "sol", type: t.type, feePayer: t.feePayer });
        }
        for (const k of t.tokenTransfers ?? []) {
          if (!k.fromUserAccount || !k.toUserAccount) continue;
          out.push({ signature: t.signature, at, from: k.fromUserAccount, to: k.toUserAccount, amount: k.tokenAmount, kind: "token", mint: k.mint, type: t.type, feePayer: t.feePayer });
        }
      }
      before = txs[txs.length - 1].signature;
      if (txs.length < 100) break;
    }
    return out;
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
