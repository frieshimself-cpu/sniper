export type Severity = "low" | "medium" | "high" | "critical";
export const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

export interface Finding {
  code: string;
  title: string;
  detail: string;
}

export interface Evidence {
  kind: "tx" | "account" | "token";
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
