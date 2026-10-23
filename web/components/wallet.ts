"use client";

import bs58 from "bs58";

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  signMessage(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array } | Uint8Array>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

export function provider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  return window.phantom?.solana ?? window.solana ?? null;
}

/** Connect a wallet and sign a plain-text message. Returns base58 wallet + signature. */
export async function signText(message: string): Promise<{ wallet: string; signature: string }> {
  const p = provider();
  if (!p) throw new Error("No Solana wallet found. Install Phantom or another wallet that injects window.solana.");
  const { publicKey } = await p.connect();
  const out = await p.signMessage(new TextEncoder().encode(message), "utf8");
  const sig = out instanceof Uint8Array ? out : out.signature;
  return { wallet: publicKey.toBase58(), signature: bs58.encode(sig) };
}
