/**
 * pump.fun: the bonding curve for a mint is a PDA of the program. No lookup needed.
 *   seeds = ["bonding-curve", mint], program = 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 */
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

export const isPumpMint = (mint: string) => /pump$/.test(mint);

function onCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

export function findProgramAddress(seeds: Uint8Array[], programId: string): { address: string; bump: number } {
  const program = bs58.decode(programId);
  const marker = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const buf = new Uint8Array([...seeds.flatMap((s) => [...s]), bump, ...program, ...marker]);
    const h = sha256(buf);
    if (!onCurve(h)) return { address: bs58.encode(h), bump };
  }
  throw new Error("no PDA");
}

export function bondingCurve(mint: string): string {
  return findProgramAddress([new TextEncoder().encode("bonding-curve"), bs58.decode(mint)], PUMP_PROGRAM).address;
}
