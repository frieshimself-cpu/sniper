import nacl from "tweetnacl";
import bs58 from "bs58";

export const disputeMessage = (wallet: string) => `CRIME dispute ${wallet}`;

export function isBase58Pubkey(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}

/** Verify an ed25519 signature over a UTF-8 message, Solana wallet style. */
export function verifySigned(message: string, signature: unknown, wallet: unknown): boolean {
  if (!isBase58Pubkey(wallet) || typeof signature !== "string") return false;
  try {
    const sig = bs58.decode(signature);
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, bs58.decode(wallet));
  } catch {
    return false;
  }
}
