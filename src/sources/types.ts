/** What the investigator needs from the outside world. Live = Helius + Arkham + Grok. Mock = deterministic. */

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: number; // UI units
  deployer: string | null; // fee payer of the earliest transaction we could reach
  created_at: string | null;
  deployer_approx: boolean; // true if history was too long to reach the first tx
}

export interface Transfer {
  signature: string;
  at: string;
  from: string;
  to: string;
  amount: number; // UI units
  kind: "sol" | "token";
  mint?: string;
  type?: string; // Helius type, e.g. SWAP, TRANSFER, WITHDRAW_LIQUIDITY
  feePayer?: string;
}

export interface Holder {
  address: string;
  amount: number;
  share: number; // 0..1 of supply
}

export interface Label {
  address: string;
  /** Organisation-level name only (exchange, bridge, protocol). Never a person. */
  entity: string | null;
  /** A public handle the labeller ties to the address, with the @. */
  handle: string | null;
  type: "cex" | "bridge" | "protocol" | "fund" | "individual" | "other" | null;
  url: string; // public page a reader can open
  /** true for a programmatic prediction rather than a verified label */
  predicted?: boolean;
}

export interface Claim {
  handle: string; // author of the post
  address: string;
  url: string; // the post
  quote: string;
  /** true if the author says the wallet is their own; false if they attribute it to someone else */
  self: boolean;
  about?: string; // handle the post attributes the wallet to, if not self
}

export interface Sources {
  name: "live" | "mock";
  token(mint: string): Promise<TokenInfo | null>;
  /** Parsed transfers touching an address, newest first. */
  transfers(address: string, limit?: number): Promise<Transfer[]>;
  holders(mint: string, n?: number): Promise<Holder[]>;
  label(address: string): Promise<Label | null>;
  labels(addresses: string[]): Promise<Map<string, Label>>;
  claims(address: string): Promise<Claim[]>;
}
