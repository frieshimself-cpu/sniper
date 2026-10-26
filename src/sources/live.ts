import type { Sources } from "./types.js";
import { Helius } from "./helius.js";
import { Arkham } from "./arkham.js";
import { Grok } from "./grok.js";

/** Live sources. Arkham and Grok are optional: without them, no labels and no claims. */
export function liveSources(): Sources {
  const helius = new Helius();
  const arkham = process.env.ARKHAM_API_KEY ? new Arkham() : null;
  const grok = process.env.XAI_API_KEY ? new Grok() : null;
  const cache = new Map<string, Promise<unknown>>();
  const memo = <T>(k: string, f: () => Promise<T>) => {
    if (!cache.has(k)) cache.set(k, f());
    return cache.get(k) as Promise<T>;
  };
  return {
    name: "live",
    token: (m) => memo(`t:${m}`, () => helius.token(m)),
    transfers: (a, limit) => memo(`x:${a}:${limit}`, () => helius.transfers(a, limit)),
    firstTransfers: (a, limit) => memo(`f:${a}:${limit}`, () => helius.firstTransfers(a, limit)),
    holders: (m, n) => memo(`h:${m}:${n}`, () => helius.holders(m, n)),
    label: (a) => memo(`l:${a}`, () => (arkham ? arkham.label(a).catch(() => null) : Promise.resolve(null))),
    labels: (as) => (arkham ? arkham.labels(as).catch(() => new Map()) : Promise.resolve(new Map())),
    wallets: (as) => helius.wallets(as),
    claims: (a) => memo(`c:${a}`, () => (grok ? grok.claims(a).catch(() => []) : Promise.resolve([]))),
  };
}

export function liveConfigured(): { helius: boolean; arkham: boolean; grok: boolean } {
  return { helius: !!process.env.HELIUS_API_KEY, arkham: !!process.env.ARKHAM_API_KEY, grok: !!process.env.XAI_API_KEY };
}
