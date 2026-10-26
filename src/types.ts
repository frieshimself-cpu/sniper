export type Severity = "low" | "medium" | "high" | "critical";
export const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

export interface Finding {
  code: string;
  title: string;
  detail: string;
  /** how much it weighs; findings are listed worst first */
  score?: number;
}

/** What a wallet set made on one token, in SOL, from the swap legs. */
export interface TokenPnl {
  mint: string;
  symbol: string;
  bought_sol: number;
  sold_sol: number;
  net_sol: number;
  trades: number;
}

export interface Evidence {
  /** tx: a signature. account/token: an address. post: a URL on X. */
  kind: "tx" | "account" | "token" | "post";
  ref: string;
  wallet?: string;
  amount?: string;
  at: string;
  note: string;
}

export interface Hop {
  label: string;
  address: string;
  amount: string;
}

export interface Case {
  n: number;
  id: string;
  /** "token": a launch was investigated. "person": a handle was. */
  kind?: "token" | "person";
  opened_at: string;
  status: "open" | "closed";
  severity: Severity;
  score: number;
  token: { symbol: string; name: string; mint: string };
  subjects: string[];
  headline: string;
  charge: string;
  findings: Finding[];
  evidence: Evidence[];
  money_trail: Hop[];
  /** a person's case: what the wallets made per token, worst first */
  pnl?: TokenPnl[];
  narrative: string[];
  png: string;
}

export interface CasesFile {
  generated_at: string;
  agent: string;
  version: number;
  cases: Case[];
}

export type WalletTier = "confirmed" | "probable" | "claimed";

export interface RegistryWallet {
  address: string;
  tier: WalletTier;
  source: string;
}

export interface RegistryEntry {
  handle: string;
  wallets: RegistryWallet[];
  note?: string;
}

export interface Registry {
  updated_at: string;
  entries: RegistryEntry[];
}
