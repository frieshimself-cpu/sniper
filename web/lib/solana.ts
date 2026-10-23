/** Token balance via JSON-RPC (Helius by default). Used only to gate the ballot. */

export function rpcUrl(): string | null {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit) return explicit;
  const key = process.env.HELIUS_API_KEY?.trim();
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null;
}

export function minVoteBalance(): number {
  const n = Number(process.env.MIN_VOTE_BALANCE ?? 1000);
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

export function balanceCheckEnabled(): boolean {
  return (process.env.VOTE_BALANCE_CHECK ?? "on").toLowerCase() !== "off";
}

export type RpcStatus = "ok" | "unset" | "off";

export function rpcStatus(): RpcStatus {
  if (!balanceCheckEnabled()) return "off";
  return rpcUrl() && process.env.CRIME_MINT ? "ok" : "unset";
}

/** Sum of CRIME_MINT held by `owner` across token accounts, in UI units. */
export async function tokenBalance(owner: string, mint: string): Promise<number> {
  const url = rpcUrl();
  if (!url) throw new Error("RPC not configured.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = (await res.json()) as {
    error?: { message: string };
    result?: { value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }> };
  };
  if (json.error) throw new Error(json.error.message);
  return (json.result?.value ?? []).reduce((n, a) => n + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
}
