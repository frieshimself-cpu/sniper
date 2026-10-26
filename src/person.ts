/**
 * A person, not a token. The handle's public record: every post, every wallet it can be tied to,
 * and what those wallets did while the posts were going up.
 *
 *   wallets   claimed: an address the handle posted itself (post URL is the source)
 *             probable: Arkham ties it to the handle (Arkham page is the source)
 *   claims    what the posts said, typed by Grok, every one with a post URL
 *   findings  posts against transactions:
 *             shilled then sold · "holding" while the wallet emptied · "LP locked" while it left ·
 *             promoted a launch that dumped or bundled · a claimed wallet that funded a bundle
 */
import { Arkham } from "./sources/arkham.js";
import { Grok, type PostClaim } from "./sources/grok.js";
import { ruleClaims } from "./sources/claims.js";
import { X, xCreds, type Post } from "./sources/x.js";
import { investigate as investigateToken, isService, short, type Investigation } from "./detectors.js";
import type { Sources, Transfer } from "./sources/types.js";
import type { Evidence, Finding, Hop, Severity, TokenPnl, WalletTier } from "./types.js";
import { isWallet } from "./sources/pumpfun.js";
import { normalizeHandle } from "./policy.js";
import { progress } from "./progress.js";

export interface PersonSources {
  posts(handle: string): Promise<Post[]>;
  claims(handle: string, posts: Post[], onBatch?: (done: number, total: number, fresh: PostClaim[], byRule: boolean) => Promise<void>): Promise<PostClaim[]>;
  deleted(handle: string): Promise<Array<{ url: string; quote: string; about: string }>>;
  /** what others said about the handle on X: accusations with the post that made them */
  said(handle: string): Promise<Array<{ url: string; quote: string; about: string }>>;
  wallets(handle: string): Promise<Array<{ address: string; platform?: string; url: string }>>;
  chain: Sources;
}

export interface PersonInvestigation {
  handle: string;
  posts: number;
  claims: PostClaim[];
  wallets: Array<{ address: string; tier: WalletTier; source: string; platform?: string; via?: string; peer?: string }>;
  pnl: TokenPnl[];
  findings: Finding[];
  evidence: Evidence[];
  trail: Hop[];
  score: number;
  severity: Severity;
  charge: string;
  token: { symbol: string; name: string; mint: string } | null;
  tokenCases: Investigation[];
  log: string[];
}

const MAX_POSTS = Number(process.env.PERSON_MAX_POSTS ?? 3200); // the whole record; X bills per post read, and stops at 3,200
const MAX_LINKED = Number(process.env.PERSON_MAX_LINKED ?? 10); // wallets found by following the money
const TX_LIMIT = Number(process.env.PERSON_TX_LIMIT ?? 2000); // transfers read per wallet, newest first
const MAX_TOKENS = Number(process.env.PERSON_MAX_TOKENS ?? 10);
// A person gets the hour: the work is spread across it and every step is reported as it is done. Mock runs get none.
const RUN_MINUTES = Number(process.env.PERSON_RUN_MINUTES ?? 60);
const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3_600_000;
const WSOL = "So11111111111111111111111111111111111111112";
// the majors: a post about these is market talk, not a promotion, and a symbol match on them is always a wrapper
const MAJORS = new Set(["SOL", "BTC", "ETH", "USDC", "USDT", "BNB", "XRP", "DOGE", "ADA", "WBTC", "WETH", "JUP", "RAY", "BONK", "WIF", "HYPE", "SUI", "AVAX", "LINK", "TRX", "TON", "DOT", "LTC", "PEPE", "SHIB", "USD1", "PYUSD"]);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (x: number) => `${(Math.min(1, x) * 100).toFixed(x < 0.01 ? 2 : 0)}%`;
const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / HOUR;
const when = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} minutes` : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Live sources: X for posts, Grok for reading, Arkham for wallets, the chain for the rest. */
export function livePersonSources(chain: Sources): PersonSources {
  const x = xCreds() ? new X(xCreds()!) : null;
  const grok = process.env.XAI_API_KEY ? new Grok() : null;
  const arkham = process.env.ARKHAM_API_KEY ? new Arkham() : null;
  return {
    chain,
    async posts(handle) {
      if (!x) return [];
      const u = await x.userByUsername(handle);
      return u ? x.userPosts(u.id, MAX_POSTS, u.username) : [];
    },
    async claims(handle, posts, onBatch) {
      if (!posts.length) return [];
      if (!grok) return ruleClaims(handle, posts);
      return grok.extractClaims(handle, posts, onBatch).catch((e) => {
        process.stderr.write(`grok failed (${(e as Error).message}); reading posts by rule\n`);
        return ruleClaims(handle, posts);
      });
    },
    async deleted(handle) {
      if (!grok) return [];
      return grok.searchHistory(handle).catch(() => []);
    },
    async said(handle) {
      if (!grok) return [];
      return grok.searchSaid(handle).catch(() => []);
    },
    async wallets(handle) {
      if (!arkham) return [];
      const r = await arkham.resolveHandle(handle).catch(() => null);
      return r?.wallets ?? [];
    },
  };
}

export type KnownWallet = { address: string; tier: WalletTier; source: string; platform?: string };

export async function investigatePerson(handleRaw: string, src: PersonSources, known: KnownWallet[] = []): Promise<PersonInvestigation> {
  const handle = normalizeHandle(handleRaw);
  const log: string[] = [];
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];
  let score = 0;
  const code = () => `F-${String(findings.length + 1).padStart(2, "0")}`;
  const budget = src.chain.name === "mock" ? 0 : RUN_MINUTES * 60_000;
  const t0 = Date.now();
  /** Wait until this much of the hour has passed. Work that is already late never waits. */
  const until = async (frac: number) => {
    const wait = t0 + budget * frac - Date.now();
    if (wait > 0) await SLEEP(wait);
  };
  /** Hand a list over a slice at a time, the slices spread out until this much of the hour has passed. */
  const drip = async <T>(items: T[], frac: number, size: number, fn: (sofar: T[], i: number, chunks: number) => Promise<void>) => {
    const chunks = Math.max(1, Math.ceil(items.length / size));
    for (let i = 0; i < chunks; i++) {
      await fn(items.slice(0, (i + 1) * size), i, chunks);
      const remaining = t0 + budget * frac - Date.now();
      if (remaining > 0 && i < chunks - 1) await SLEEP(remaining / (chunks - i));
    }
  };

  // ---- the record ---------------------------------------------------------
  await progress.step("record", `reading the record of ${handle}: every post the API allows, back to the first`);
  const walletsP = src.wallets(handle).catch(() => []); // Arkham, while X is read
  const posts = await src.posts(handle);
  const postUrl = (p: Post) => `https://x.com/${handle.replace(/^@/, "")}/status/${p.id}`;
  const typed: PostClaim[] = []; // what Grok has typed so far, shown as it lands
  await progress.stats({ posts_total: posts.length, posts_read: 0, typed: 0 });
  const claimsP = src.claims(handle, posts, async (done, total, fresh, byRule) => {
    typed.push(...fresh);
    await progress.stats({ typed: typed.length, posts_typed: done });
    const by = new Map<string, number>();
    for (const c of fresh) by.set(c.type, (by.get(c.type) ?? 0) + 1);
    await progress.step("record", `posts ${Math.max(1, done - 59).toLocaleString("en-US")}–${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} typed${byRule ? " by rule" : ""}: ${by.size ? [...by.entries()].map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ") : "nothing claimed"}`);
  }); // Grok types the posts while they are shown being read
  const early = await walletsP;
  if (early.length || known.length) {
    const seen = new Set<string>();
    await progress.wallets([...known.map((w) => ({ address: w.address, tier: w.tier as string })), ...early.map((w) => ({ address: w.address, tier: "probable" }))].filter((w) => !seen.has(w.address) && seen.add(w.address)));
    await progress.step("wallets", `${seen.size} wallet${seen.size === 1 ? "" : "s"} already on file: the handle's own, the registry, Arkham's entity`);
  }
  await drip(posts, 0.3, 60, async (sofar, i, chunks) => {
    await progress.posts([...typed.slice(-12).reverse().map((c) => ({ at: c.at, text: c.quote, url: c.url, type: c.type })), ...sofar.slice(-30).reverse().map((p) => ({ at: p.at, text: p.text, url: postUrl(p) }))]);
    await progress.stats({ posts_read: sofar.length });
    const last = sofar[sofar.length - 1];
    await progress.step("record", `${sofar.length.toLocaleString("en-US")} of ${posts.length.toLocaleString("en-US")} posts read, back to ${last?.at.slice(0, 10) ?? "nothing"}${i === chunks - 1 ? ". The whole record." : ""}`);
  });
  await progress.step("record", `${posts.length.toLocaleString("en-US")} post${posts.length === 1 ? "" : "s"} read, back to ${posts[posts.length - 1]?.at.slice(0, 10) ?? "nothing"}. Typing every one: shill, holding, LP locked, sold, launch, wallet`);
  const claims = await claimsP;
  await progress.posts([...claims.map((c) => ({ at: c.at, text: c.quote, url: c.url, type: c.type })), ...posts.map((p) => ({ at: p.at, text: p.text, url: postUrl(p) }))].slice(0, 40));
  {
    const by = new Map<string, number>();
    for (const c of claims) by.set(c.type, (by.get(c.type) ?? 0) + 1);
    if (by.size) await progress.step("record", `typed: ${[...by.entries()].map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}`);
  }
  log.push(`${posts.length} posts, ${claims.length} claims`);
  await progress.step("record", `${claims.length} claim${claims.length === 1 ? "" : "s"} about tokens in the posts`);

  // ---- the wallets --------------------------------------------------------
  const wallets = new Map<string, PersonInvestigation["wallets"][number]>();
  for (const c of claims) if (c.type === "wallet" && c.address) wallets.set(c.address, { address: c.address, tier: "claimed", source: c.url });
  for (const w of early) if (!wallets.has(w.address)) wallets.set(w.address, { address: w.address, tier: "probable", source: w.url, platform: w.platform });
  // already on the record, with a source link: the registry is evidence too
  for (const w of known) if (w.source && !wallets.has(w.address)) wallets.set(w.address, { address: w.address, tier: w.tier, source: w.source, platform: w.platform });
  // only accounts a person signs with: a token mint or a token account filed under the entity is not a wallet
  {
    const ok = await src.chain.wallets([...wallets.keys()]).catch(() => new Set([...wallets.keys()]));
    for (const a of [...wallets.keys()]) if (!ok.has(a)) wallets.delete(a);
  }
  log.push(`${wallets.size} wallets (${[...wallets.values()].filter((w) => w.tier === "claimed").length} claimed)`);
  await progress.step("wallets", `${wallets.size} wallet${wallets.size === 1 ? "" : "s"} on the record, ${[...wallets.values()].filter((w) => w.tier === "claimed").length} claimed by the handle itself`);
  await progress.wallets([...wallets.values()].map((w) => ({ address: w.address, tier: w.tier })));

  const history = new Map<string, Transfer[]>();
  await drip([...wallets.keys()], 0.52, 1, async (sofar) => {
    const w = sofar[sofar.length - 1];
    await progress.step("wallets", `${short(w)} (${wallets.get(w)?.tier}): reading every transfer, newest first`);
    const tx = await src.chain.transfers(w, TX_LIMIT).catch(() => []);
    history.set(w, tx);
    const sigs = new Set(tx.map((t) => t.signature)).size;
    const swaps = new Set(tx.filter((t) => t.type === "SWAP").map((t) => t.signature)).size;
    const pools = new Set(tx.filter((t) => t.type === "CREATE_POOL" || t.type === "CREATE").map((t) => t.signature)).size;
    const inflow = sum(tx.filter((t) => t.kind === "sol" && t.to === w).map((t) => t.amount));
    const outflow = sum(tx.filter((t) => t.kind === "sol" && t.from === w).map((t) => t.amount));
    await progress.step("wallets", `${short(w)} (${wallets.get(w)?.tier}): ${sigs.toLocaleString("en-US")} transaction${sigs === 1 ? "" : "s"} read${swaps ? `, ${swaps} swap${swaps === 1 ? "" : "s"}` : ""}${pools ? `, ${pools} launch${pools === 1 ? "" : "es"}` : ""}; ${fmt(inflow)} SOL in, ${fmt(outflow)} SOL out`);
    await progress.stats({ wallets: wallets.size, wallets_read: sofar.length, transfers: sum([...history.values()].map((h) => h.length)), sol_in: Math.round(sum([...history.entries()].map(([a, h]) => sum(h.filter((t) => t.kind === "sol" && t.to === a).map((t) => t.amount))))), sol_out: Math.round(sum([...history.entries()].map(([a, h]) => sum(h.filter((t) => t.kind === "sol" && t.from === a).map((t) => t.amount))))) });
  });
  log.push(`${sum([...history.values()].map((h) => h.length))} transfers on ${wallets.size} wallet${wallets.size === 1 ? "" : "s"}`);
  await progress.step("wallets", `${sum([...history.values()].map((h) => h.length)).toLocaleString("en-US")} transfers pulled; following the money between wallets`);

  // ---- the wallets they never admitted: follow the money ----------------------
  // Plain SOL transfers between a wallet on the record and another wallet, both ways, counted. Two transfers,
  // or one of five SOL or more, is a link. Services, programs and token accounts are never links.
  {
    const seeds = new Set(wallets.keys());
    const cand = new Map<string, { n: number; sol: number; sig: string; at: string; with: string; ins: number; outs: number }>();
    for (const t of [...history.values()].flat()) {
      if (t.kind !== "sol" || t.amount < 0.05 || (t.type && t.type !== "TRANSFER" && t.type !== "UNKNOWN")) continue;
      const seed = seeds.has(t.from) ? t.from : seeds.has(t.to) ? t.to : null;
      const other = seed === t.from ? t.to : t.from;
      if (!seed || !other || seeds.has(other) || !isWallet(other)) continue;
      const c = cand.get(other) ?? { n: 0, sol: 0, sig: t.signature, at: t.at, with: seed, ins: 0, outs: 0 };
      c.n++;
      c.sol += t.amount;
      if (seed === t.from) c.outs++;
      else c.ins++;
      if (t.amount > (cand.get(other)?.sol ?? 0)) Object.assign(c, { sig: t.signature, at: t.at, with: seed });
      cand.set(other, c);
    }
    const ranked = [...cand.entries()].filter(([, c]) => c.n >= 2 || c.sol >= 5).sort((a, b) => b[1].n - a[1].n || b[1].sol - a[1].sol).slice(0, MAX_LINKED * 3);
    const labels = ranked.length ? await src.chain.labels(ranked.map(([a]) => a)).catch(() => new Map()) : new Map();
    const real = ranked.length ? await src.chain.wallets(ranked.map(([a]) => a)).catch(() => new Set(ranked.map(([a]) => a))) : new Set<string>();
    let linked = 0;
    for (const [a, c] of ranked) {
      if (linked >= MAX_LINKED) break;
      if (!real.has(a)) continue;
      const l = labels.get(a);
      if (isService(l) || (l?.entity && !l?.handle)) continue; // somebody else's, or a service
      if (l?.handle && normalizeHandle(l.handle) !== handle) continue; // on record as another handle
      wallets.set(a, { address: a, tier: "probable", source: `https://solscan.io/tx/${c.sig}`, via: `${c.n} transfer${c.n === 1 ? "" : "s"} with ${short(c.with)}`, peer: c.with });
      evidence.push({ kind: "tx", ref: c.sig, wallet: a, amount: `${c.sol.toFixed(2)} SOL`, at: c.at, note: `Linked wallet: ${c.n} transfer${c.n === 1 ? "" : "s"} with ${short(c.with)} (${c.ins} in, ${c.outs} out)` });
      history.set(a, await src.chain.transfers(a, TX_LIMIT).catch(() => []));
      linked++;
    }
    if (linked) {
      findings.push({ code: code(), title: `${linked} wallet${linked === 1 ? "" : "s"} never admitted, linked by transfers`, detail: `Found by following SOL between the wallets on record and the rest of the chain: ${[...wallets.values()].filter((w) => w.via).map((w) => `${short(w.address)} (${w.via})`).join("; ")}.`, score: 10 + 5 * linked });
      score += 10 + 5 * linked;
    }
    log.push(`${cand.size} counterparties, ${linked} linked wallet${linked === 1 ? "" : "s"} added`);
    await progress.step("wallets", `${cand.size} counterpart${cand.size === 1 ? "y" : "ies"} seen; ${linked} wallet${linked === 1 ? "" : "s"} never admitted, linked by transfers`);
    await progress.wallets([...wallets.values()].map((w) => ({ address: w.address, tier: w.tier, via: w.via, peer: w.peer })));
  }
  const all = dedupe([...history.values()].flat());

  // ---- profit per token, from the swap legs --------------------------------------
  const pnl = profitPerToken(all, new Set(wallets.keys()));
  // Every token the wallets traded gets its name now, eight at a time, so a post's $TICKER can be matched later
  // without a wait in the middle of the replay; the panel is told while it happens.
  const named = new Map<string, string>();
  {
    const mints = [...new Set(all.filter((t) => t.kind === "token" && t.mint && t.mint !== WSOL).map((t) => t.mint!))];
    if (mints.length) await progress.step("replay", `naming the ${mints.length.toLocaleString("en-US")} token${mints.length === 1 ? "" : "s"} the wallets traded, so the posts can be matched to them`);
    for (let i = 0; i < mints.length; i += 8) {
      await Promise.all(mints.slice(i, i + 8).map(async (m) => named.set(m, (await src.chain.token(m).catch(() => null))?.symbol ?? "")));
    }
  }
  for (const q of pnl) q.symbol = named.get(q.mint) ?? "";
  log.push(`${pnl.length} tokens traded; biggest: ${pnl.slice(0, 3).map((p) => `${p.symbol || short(p.mint)} ${p.net_sol >= 0 ? "+" : ""}${p.net_sol.toFixed(1)} SOL`).join(", ") || "none"}`);
  await progress.step("replay", `${pnl.length} token${pnl.length === 1 ? "" : "s"} traded across the wallets${pnl.length ? `; biggest ${pnl.slice(0, 2).map((p) => `$${p.symbol || short(p.mint)} ${p.net_sol >= 0 ? "+" : ""}${p.net_sol.toFixed(0)} SOL`).join(", ")}` : ""}`);

  // ---- tokens the posts talk about ----------------------------------------
  const mentioned = new Map<string, { token: string; mint?: string; claims: PostClaim[] }>();
  for (const c of claims) {
    if (!c.token || c.type === "wallet") continue;
    if (!c.mint && MAJORS.has(c.token.replace(/^\$/, "").toUpperCase())) continue; // talking about $SOL is not a promotion
    const key = (c.mint ?? c.token).toLowerCase();
    const m = mentioned.get(key) ?? { token: c.token, mint: c.mint, claims: [] };
    m.claims.push(c);
    mentioned.set(key, m);
  }
  const traded = new Map<string, { symbol?: string }>();
  for (const t of all) if (t.kind === "token" && t.mint && t.mint !== WSOL) traded.set(t.mint, traded.get(t.mint) ?? (named.has(t.mint) ? { symbol: named.get(t.mint)!.toLowerCase() } : {}));
  // The chain talks whether or not the posts do: every launch the wallets paid for is a subject.
  {
    const launched = new Map<string, string>();
    // One launch per pool-creation transaction: the token that went in in bulk is the one launched; the quote
    // side (SOL, or a wrapper of it) is not. The wallets the handle posted itself come first.
    const bySig = new Map<string, { mint: string; at: string; amount: number; claimed: boolean }>();
    for (const [w, txs] of history) {
      const claimed = wallets.get(w)?.tier === "claimed";
      for (const t of txs) {
        if (!(t.type === "CREATE" || t.type === "CREATE_POOL") || t.kind !== "token" || !t.mint || t.mint === WSOL) continue;
        const prev = bySig.get(t.signature);
        if (!prev || t.amount > prev.amount) bySig.set(t.signature, { mint: t.mint, at: t.at, amount: t.amount, claimed: claimed || prev?.claimed === true });
      }
    }
    for (const l of [...bySig.values()].sort((a, b) => Number(b.claimed) - Number(a.claimed) || b.at.localeCompare(a.at))) if (!launched.has(l.mint)) launched.set(l.mint, l.at);
    let added = 0;
    for (const [mint, at] of launched.entries()) {
      if (mentioned.size >= MAX_TOKENS * 2) break;
      if (mentioned.has(mint.toLowerCase()) || [...mentioned.values()].some((m) => m.mint === mint)) continue;
      mentioned.set(mint.toLowerCase(), { token: mint, mint, claims: [{ post_id: "", url: "", at, type: "launch", token: mint, mint, quote: "" }] });
      added++;
    }
    if (launched.size) log.push(`${launched.size} launches found on the wallets, ${added} added to the list`);
    // a serial launcher is a finding on its own, whatever each launch did
    if (launched.size >= 3) {
      const newest = [...launched.entries()].sort((a, b) => b[1].localeCompare(a[1]));
      const w = Math.min(30, 5 + launched.size);
      findings.push({
        code: code(),
        title: `${launched.size} tokens launched from the wallets`,
        detail: `Pools or curves created from the wallets on record, the newest on ${newest[0][1].slice(0, 10)}, the oldest on ${newest[newest.length - 1][1].slice(0, 10)}. ${added ? `The newest ${added} are replayed below.` : ""}`.trim(),
        score: w,
      });
      score += w;
      for (const [mint, at] of newest.slice(0, 5)) evidence.push({ kind: "account", ref: mint, at, note: "Token launched from the wallets" });
    }
    await progress.stats({ tokens: mentioned.size, launches: launched.size });
    await progress.step("replay", `${launched.size ? `${launched.size} launch${launched.size === 1 ? "" : "es"} found on the wallets; ` : ""}${mentioned.size} token${mentioned.size === 1 ? "" : "s"} to replay, the wallets' own launches first; posts set next to transactions`);
  }
  const resolveMint = async (m: { token: string; mint?: string }): Promise<string | null> => {
    if (m.mint) return m.mint;
    const sym = m.token.replace(/^\$/, "").toLowerCase();
    for (const [mint, t] of traded) {
      if (t.symbol === undefined) t.symbol = (await src.chain.token(mint).catch(() => null))?.symbol?.toLowerCase() ?? "";
      if (t.symbol === sym) return mint;
    }
    return null;
  };

  // ---- posts against transactions -------------------------------------------
  let worst: { mint: string; symbol: string; name: string; score: number } | null = null;
  const tokenCases: Investigation[] = [];
  let checked = 0;
  const handled = new Set<string>();
  const isLaunch = (m: { claims: PostClaim[] }) => m.claims.some((c) => c.type === "launch" && !c.url);
  const queue = [...mentioned.values()].sort((a, b) => Number(isLaunch(b)) - Number(isLaunch(a)) || b.claims.length - a.claims.length);
  let qi = 0;
  for (const m of queue) {
    qi++;
    const mint = await resolveMint(m);
    if (!mint || handled.has(mint)) continue;
    handled.add(mint);
    await until(0.56 + (0.32 * qi) / Math.max(1, queue.length));
    await progress.step("replay", `replaying ${m.token.startsWith("$") ? m.token : `$${(await src.chain.token(mint).catch(() => null))?.symbol ?? short(mint)}`} (${short(mint)}): ${m.claims.filter((c) => c.url).length} post${m.claims.filter((c) => c.url).length === 1 ? "" : "s"} about it${isLaunch(m) ? ", launched from the wallets" : ""}; the launch, the first buyers, the exits, the wallets' own trades`);
    // claims about the same token under another name join this one
    for (const other of mentioned.values()) if (other !== m && (other.mint === mint || (!other.mint && (await resolveMint(other)) === mint))) m.claims.push(...other.claims);
    const info = await src.chain.token(mint).catch(() => null);
    const symbol = info?.symbol ?? m.token.replace(/^\$/, "");
    const sells = all.filter((t) => t.kind === "token" && t.mint === mint && wallets.has(t.from) && !wallets.has(t.to));
    const buys = all.filter((t) => t.kind === "token" && t.mint === mint && wallets.has(t.to) && !wallets.has(t.from));
    const soldAmt = sum(sells.map((t) => t.amount));
    const boughtAmt = sum(buys.map((t) => t.amount));

    // shilled, then sold. Needs a post: a launch the chain found on its own is not a promotion.
    for (const s of m.claims.filter((c) => (c.type === "shill" || c.type === "launch") && c.url).slice(0, 2)) {
      const after = sells.filter((t) => hours(s.at, t.at) >= 0 && hours(s.at, t.at) <= 72).sort((a, b) => a.at.localeCompare(b.at));
      const before = buys.filter((t) => hours(t.at, s.at) >= 0 && hours(t.at, s.at) <= 72);
      if (after.length && soldAmt > 0) {
        const soldAfter = sum(after.map((t) => t.amount));
        const share = boughtAmt ? Math.min(1, soldAfter / boughtAmt) : 1;
        const made = pnl.find((p) => p.mint === mint);
        const w = 30 + Math.min(20, Math.round(share * 20)) + (hours(s.at, after[0].at) <= 2 ? 10 : 0) + (made && made.net_sol >= 5 ? Math.min(20, Math.round(made.net_sol / 10)) : 0);
        findings.push({
          code: code(),
          title: made && made.net_sol >= 5 ? `Promoted $${symbol}, then sold: ${fmt(made.net_sol)} SOL out` : `Promoted $${symbol}, then sold`,
          detail: `Posted "${s.quote.slice(0, 120)}" and sold ${fmt(soldAfter)} $${symbol} (${pct(share)} of what the wallets held) starting ${when(hours(s.at, after[0].at))} after the post.${before.length ? ` The wallets had bought ${when(hours(before[0].at, s.at))} before posting.` : ""}${made ? ` Across the wallets: bought for ${made.bought_sol.toFixed(1)} SOL, sold for ${made.sold_sol.toFixed(1)} SOL, net ${made.net_sol >= 0 ? "+" : ""}${made.net_sol.toFixed(1)} SOL.` : ""}`,
          score: w,
        });
        score += w;
        if (s.url) evidence.push({ kind: "post", ref: s.url, at: s.at, note: `Promoted $${symbol}` });
        for (const t of after.slice(0, 3)) evidence.push({ kind: "tx", ref: t.signature, wallet: t.from, amount: `${fmt(t.amount)} ${symbol}`, at: t.at, note: "Sold after the post" });
        for (const t of before.slice(0, 2)) evidence.push({ kind: "tx", ref: t.signature, wallet: t.to, amount: `${fmt(t.amount)} ${symbol}`, at: t.at, note: "Bought before the post" });
        break;
      }
    }
    // "holding" or "LP locked" while the wallets emptied
    for (const c of m.claims.filter((x) => x.type === "holding" || x.type === "lp_locked").slice(0, 2)) {
      const after = sells.filter((t) => hours(c.at, t.at) >= -1 && hours(c.at, t.at) <= 168).sort((a, b) => a.at.localeCompare(b.at));
      const soldAfter = sum(after.map((t) => t.amount));
      if (after.length && boughtAmt && soldAfter / boughtAmt >= 0.5) {
        findings.push({
          code: code(),
          title: c.type === "holding" ? `Said holding $${symbol}, the wallets sold` : `Said $${symbol} was safe, the wallets sold`,
          detail: `Posted "${c.quote.slice(0, 120)}". The wallets sold ${pct(Math.min(1, soldAfter / boughtAmt))} of their $${symbol} within ${when(hours(c.at, after[after.length - 1].at))}.`,
          score: 35,
        });
        score += 35;
        evidence.push({ kind: "post", ref: c.url, at: c.at, note: c.type === "holding" ? "Said holding" : "Said safe" });
        for (const t of after.slice(0, 3)) evidence.push({ kind: "tx", ref: t.signature, wallet: t.from, amount: `${fmt(t.amount)} ${symbol}`, at: t.at, note: "Sold after the post" });
        break;
      }
    }
    // what the token itself did: the launch detectors, reused
    if (checked < MAX_TOKENS) {
      checked++;
      const inv = await investigateToken(mint, src.chain).catch(() => null);
      await progress.step("replay", inv && inv.findings.length ? `$${symbol}: ${inv.findings.slice(0, 2).map((f) => f.title.toLowerCase()).join(", ")} (weight ${inv.score})` : `$${symbol}: nothing out of order in its launch`);
      if (inv && inv.findings.length) {
        tokenCases.push(inv);
        const launched = m.claims.some((c) => c.type === "launch") || (inv.deployer ? wallets.has(inv.deployer) : false);
        const made = pnl.find((p) => p.mint === mint);
        const w = Math.round(inv.score * (launched ? 0.6 : 0.3)) + (launched && made && made.net_sol >= 5 ? Math.min(20, Math.round(made.net_sol / 10)) : 0);
        findings.push({
          code: code(),
          title: `${launched ? "Launched" : "Promoted"} $${symbol}: ${inv.charge.toLowerCase()}${launched && made && made.net_sol >= 5 ? `, ${fmt(made.net_sol)} SOL out` : ""}`,
          detail: `${launched ? "Their own launch." : "A launch they promoted."} The token's file: ${inv.findings.map((f) => f.title.toLowerCase()).join("; ")}. Score ${inv.score}.${made ? ` The wallets' trades: bought for ${made.bought_sol.toFixed(1)} SOL, sold for ${made.sold_sol.toFixed(1)} SOL, net ${made.net_sol >= 0 ? "+" : ""}${made.net_sol.toFixed(1)} SOL.` : ""}`,
          score: w,
        });
        score += w;
        if (inv.funder && wallets.has(inv.funder)) {
          findings.push({ code: code(), title: `A claimed wallet funded the $${symbol} bundle`, detail: `${short(inv.funder)} is on this handle's record and funded ${inv.bundle.length} of the first buyers.`, score: 30 });
          score += 30;
        }
        for (const e of inv.evidence.slice(0, 4)) evidence.push(e);
        if (!worst || inv.score > worst.score) worst = { mint, symbol, name: info?.name ?? symbol, score: inv.score };
      }
    }
    if (!worst && (sells.length || buys.length)) worst = { mint, symbol, name: info?.name ?? symbol, score: 0 };
  }

  // ---- what was deleted ---------------------------------------------------
  await until(0.9);
  await progress.step("findings", "asking X what the handle deleted and what other accounts posted about it; only cited posts count");
  const deleted = await src.deleted(handle);
  if (deleted.length) await progress.step("findings", `${deleted.length} promotion${deleted.length === 1 ? "" : "s"} since deleted, quoted by others`);
  if (deleted.length) {
    findings.push({ code: code(), title: `${deleted.length} promotion${deleted.length === 1 ? "" : "s"} since deleted`, detail: `Quoted by others: ${deleted.slice(0, 3).map((d) => `"${d.quote.slice(0, 80)}"`).join(" · ")}.`, score: Math.min(15, deleted.length * 5) });
    score += Math.min(15, deleted.length * 5);
    for (const d of deleted.slice(0, 3)) evidence.push({ kind: "post", ref: d.url, at: "", note: `Deleted, quoted: ${d.about}` });
  }

  // ---- what others said ------------------------------------------------------
  // Accusations are not findings on their own; they are low weight, and every one carries the post that made it.
  const said = await src.said(handle);
  await progress.step("findings", said.length ? `called out by ${said.length} other account${said.length === 1 ? "" : "s"}: ${said.slice(0, 3).map((d) => `"${d.quote.slice(0, 60)}"`).join(" · ")}` : "nobody on X has called the handle out in a cited post");
  if (said.length) {
    findings.push({ code: code(), title: `Called out by ${said.length} other account${said.length === 1 ? "" : "s"}`, detail: said.slice(0, 3).map((d) => `"${d.quote.slice(0, 100)}"${d.about ? ` (${d.about})` : ""}`).join(" · ") + ".", score: Math.min(15, said.length * 5) });
    score += Math.min(15, said.length * 5);
    for (const d of said.slice(0, 4)) evidence.push({ kind: "post", ref: d.url, at: "", note: `Said by another account: ${d.about || "accusation"}` });
  }

  // ---- the money, in one line ----------------------------------------------
  const trail: Hop[] = [];
  const first = [...wallets.values()].find((w) => w.tier === "claimed") ?? [...wallets.values()][0];
  if (first) {
    let cur = first.address;
    const seen = new Set([cur]);
    for (let i = 0; i < 4; i++) {
      const l = (await src.chain.labels([cur])).get(cur);
      if (i > 0 && isService(l)) {
        trail.push({ label: `${l!.type}${l!.entity ? ` · ${l!.entity}` : ""}`, address: cur, amount: "" });
        break;
      }
      const tx = i === 0 ? history.get(cur) ?? [] : await src.chain.transfers(cur, 100).catch(() => []);
      const out = tx.filter((t) => t.kind === "sol" && t.from === cur && !seen.has(t.to) && t.amount >= 1).sort((a, b) => b.amount - a.amount)[0];
      trail.push({ label: i === 0 ? "wallet" : `hop ${i}`, address: cur, amount: out ? `${out.amount.toFixed(out.amount >= 100 ? 0 : 2)} SOL` : "" });
      if (!out) break;
      cur = out.to;
      seen.add(cur);
    }
  }

  // worst first: the rap sheet reads down from the heaviest finding
  findings.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  findings.forEach((f, i) => (f.code = `F-${String(i + 1).padStart(2, "0")}`));
  await progress.stats({ findings: findings.length, score });
  await progress.findings(findings.map((f) => ({ title: f.title, score: f.score })));
  await progress.step("findings", findings.length ? `${findings.length} finding${findings.length === 1 ? "" : "s"}, worst first: ${findings[0].title}` : "nothing met the bar");
  evidence.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  const severity: Severity = score >= 85 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  return {
    handle,
    posts: posts.length,
    claims,
    wallets: [...wallets.values()],
    pnl,
    findings,
    evidence: evidence.slice(0, 40),
    trail,
    score: Math.min(99, score),
    severity,
    charge: findings[0]?.title ?? "",
    token: worst ? { symbol: worst.symbol, name: worst.name, mint: worst.mint } : null,
    tokenCases,
    log,
  };
}


/** The same transfer seen from two wallets' histories is one transfer. */
function dedupe(ts: Transfer[]): Transfer[] {
  const seen = new Set<string>();
  const out: Transfer[] = [];
  for (const t of ts) {
    const k = `${t.signature}|${t.from}|${t.to}|${t.amount}|${t.mint ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Profit per token for a set of wallets, from the swap legs: in one transaction, SOL leaving the set while a
 * token arrives is a buy; a token leaving while SOL arrives is a sell. Transfers between the set's own
 * wallets cancel. Net is SOL received minus SOL spent; what is still held is not priced.
 */
export function profitPerToken(all: Transfer[], set: Set<string>): TokenPnl[] {
  const byTx = new Map<string, Transfer[]>();
  for (const t of all) byTx.set(t.signature, [...(byTx.get(t.signature) ?? []), t]);
  const acc = new Map<string, TokenPnl>();
  for (const legs of byTx.values()) {
    // SOL moves as native lamports or as wrapped SOL; a routed swap often shows both for the same money, so take the larger
    const nativeOut = sum(legs.filter((l) => l.kind === "sol" && set.has(l.from) && !set.has(l.to)).map((l) => l.amount));
    const wrappedOut = sum(legs.filter((l) => l.kind === "token" && l.mint === WSOL && set.has(l.from) && !set.has(l.to)).map((l) => l.amount));
    const nativeIn = sum(legs.filter((l) => l.kind === "sol" && set.has(l.to) && !set.has(l.from)).map((l) => l.amount));
    const wrappedIn = sum(legs.filter((l) => l.kind === "token" && l.mint === WSOL && set.has(l.to) && !set.has(l.from)).map((l) => l.amount));
    const solOut = Math.max(nativeOut, wrappedOut);
    const solIn = Math.max(nativeIn, wrappedIn);
    const mints = new Set(legs.filter((l) => l.kind === "token" && l.mint && l.mint !== WSOL).map((l) => l.mint!));
    for (const mint of mints) {
      const tokIn = sum(legs.filter((l) => l.kind === "token" && l.mint === mint && set.has(l.to) && !set.has(l.from)).map((l) => l.amount));
      const tokOut = sum(legs.filter((l) => l.kind === "token" && l.mint === mint && set.has(l.from) && !set.has(l.to)).map((l) => l.amount));
      const p = acc.get(mint) ?? { mint, symbol: "", bought_sol: 0, sold_sol: 0, net_sol: 0, trades: 0 };
      if (tokIn > 0 && solOut > 0) {
        p.bought_sol += solOut / mints.size;
        p.trades++;
      } else if (tokOut > 0 && solIn > 0) {
        p.sold_sol += solIn / mints.size;
        p.trades++;
      } else continue;
      acc.set(mint, p);
    }
  }
  const out = [...acc.values()].map((p) => ({ ...p, net_sol: p.sold_sol - p.bought_sol }));
  return out.filter((p) => p.trades > 0).sort((a, b) => Math.abs(b.net_sol) - Math.abs(a.net_sol));
}
