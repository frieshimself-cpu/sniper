/**
 * A deterministic fake chain for one mint. Same shapes as live, so the
 * detectors and the writer are exercised end to end without keys.
 */
import type { Claim, Holder, Label, Sources, TokenInfo, Transfer } from "./types.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function mockSources(seedText: string, handle = "@wen_moon_wendy"): Sources {
  let seed = 7;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
  const b58 = (len = 44) => { let s = ""; while (s.length < len) s += B58[Math.floor(rnd() * B58.length)]; return s; };
  const mint = seedText.startsWith("@") ? b58() : seedText;
  const t0 = Date.UTC(2026, 9, 24, 3, 0, 0);
  const iso = (ms: number) => new Date(ms).toISOString();

  const deployer = b58();
  const funder = b58();
  const pool = b58();
  const cex = b58();
  const hop1 = b58();
  const hop2 = b58();
  const bundle = Array.from({ length: 14 }, () => b58());
  const retail = Array.from({ length: 30 }, () => b58());
  const SUPPLY = 1_000_000_000;

  const txs: Transfer[] = [];
  let sigN = 0;
  const sig = () => `${b58(80)}${String(sigN++).padStart(8, "0")}`;
  // funder tops up bundle wallets 12 minutes before launch
  for (const w of bundle) txs.push({ signature: sig(), at: iso(t0 - 12 * 60_000 + Math.floor(rnd() * 90_000)), from: funder, to: w, amount: 2, kind: "sol", type: "TRANSFER", feePayer: funder });
  // funder also funded the deployer a day earlier
  txs.push({ signature: sig(), at: iso(t0 - 86_400_000), from: funder, to: deployer, amount: 25, kind: "sol", type: "TRANSFER", feePayer: funder });
  // launch: deployer seeds pool
  txs.push({ signature: sig(), at: iso(t0), from: deployer, to: pool, amount: SUPPLY * 0.8, kind: "token", mint, type: "CREATE_POOL", feePayer: deployer });
  txs.push({ signature: sig(), at: iso(t0), from: deployer, to: pool, amount: 40, kind: "sol", type: "CREATE_POOL", feePayer: deployer });
  // same-block bundle buys
  for (const w of bundle) {
    const s = sig();
    txs.push({ signature: s, at: iso(t0), from: w, to: pool, amount: 1.9, kind: "sol", type: "SWAP", feePayer: w });
    txs.push({ signature: s, at: iso(t0), from: pool, to: w, amount: SUPPLY * 0.027, kind: "token", mint, type: "SWAP", feePayer: w });
  }
  // retail trickles in
  retail.forEach((w, i) => {
    const s = sig();
    const at = iso(t0 + (i + 1) * 20_000);
    txs.push({ signature: s, at, from: w, to: pool, amount: 0.3 + rnd(), kind: "sol", type: "SWAP", feePayer: w });
    txs.push({ signature: s, at, from: pool, to: w, amount: SUPPLY * 0.002, kind: "token", mint, type: "SWAP", feePayer: w });
  });
  // bundle exits 9..13 minutes after launch
  bundle.forEach((w, i) => {
    const s = sig();
    const at = iso(t0 + 9 * 60_000 + i * 17_000);
    txs.push({ signature: s, at, from: w, to: pool, amount: SUPPLY * 0.027, kind: "token", mint, type: "SWAP", feePayer: w });
    txs.push({ signature: s, at, from: pool, to: w, amount: 4 + rnd() * 6, kind: "sol", type: "SWAP", feePayer: w });
  });
  // bundle sweeps SOL back to the funder, funder moves to a hop, hop to cex
  bundle.forEach((w, i) => txs.push({ signature: sig(), at: iso(t0 + 20 * 60_000 + i * 5_000), from: w, to: funder, amount: 5, kind: "sol", type: "TRANSFER", feePayer: w }));
  txs.push({ signature: sig(), at: iso(t0 + 40 * 60_000), from: funder, to: hop1, amount: 68, kind: "sol", type: "TRANSFER", feePayer: funder });
  txs.push({ signature: sig(), at: iso(t0 + 55 * 60_000), from: hop1, to: hop2, amount: 67.5, kind: "sol", type: "TRANSFER", feePayer: hop1 });
  txs.push({ signature: sig(), at: iso(t0 + 70 * 60_000), from: hop2, to: cex, amount: 67, kind: "sol", type: "TRANSFER", feePayer: hop2 });
  // deployer pulls liquidity at +3h12m
  txs.push({ signature: sig(), at: iso(t0 + 192 * 60_000), from: pool, to: deployer, amount: 31, kind: "sol", type: "WITHDRAW_LIQUIDITY", feePayer: deployer });
  txs.push({ signature: sig(), at: iso(t0 + 200 * 60_000), from: deployer, to: hop1, amount: 30, kind: "sol", type: "TRANSFER", feePayer: deployer });

  const byAddr = (a: string) => txs.filter((t) => t.from === a || t.to === a).sort((x, y) => y.at.localeCompare(x.at));

  const holders: Holder[] = [
    { address: pool, amount: SUPPLY * 0.25, share: 0.25 },
    { address: deployer, amount: SUPPLY * 0.2, share: 0.2 },
    ...retail.slice(0, 18).map((a) => ({ address: a, amount: SUPPLY * 0.002, share: 0.002 })),
  ];

  const labels: Record<string, Label> = {
    [cex]: { address: cex, entity: "Binance", handle: null, type: "cex", url: `https://intel.arkm.com/explorer/address/${cex}` },
    [funder]: { address: funder, entity: null, handle, type: "individual", url: `https://intel.arkm.com/explorer/address/${funder}` },
  };
  const claims: Record<string, Claim[]> = {
    [deployer]: [
      { handle, address: deployer, url: `https://x.com/${handle.slice(1)}/status/1890000000000000001`, quote: `launching at ${deployer}. lp locked. still here.`, self: true },
    ],
    [hop1]: [
      { handle: "@onchain_tipster", address: hop1, url: `https://x.com/onchain_tipster/status/1890000000000000002`, quote: `${hop1} is ${handle} alt, check funding`, self: false, about: handle },
    ],
  };

  return {
    name: "mock",
    async token(m): Promise<TokenInfo> {
      return { mint: m, symbol: seedText.startsWith("@") ? "MOCK" : "MOCK", name: "Mock Token", decimals: 6, supply: SUPPLY, deployer, created_at: iso(t0), deployer_approx: false };
    },
    async transfers(a, limit = 300) {
      return byAddr(a).slice(0, limit);
    },
    async holders() {
      return holders;
    },
    async label(a) {
      return labels[a] ?? null;
    },
    async labels(as) {
      return new Map(as.filter((a) => labels[a]).map((a) => [a, labels[a]]));
    },
    async claims(a) {
      return claims[a] ?? [];
    },
  };
}
