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
import { X, xCreds, type Post } from "./sources/x.js";
import { investigate as investigateToken, isService, short, type Investigation } from "./detectors.js";
import type { Sources, Transfer } from "./sources/types.js";
import type { Evidence, Finding, Hop, Severity, WalletTier } from "./types.js";
import { normalizeHandle } from "./policy.js";

export interface PersonSources {
  posts(handle: string): Promise<Post[]>;
  claims(handle: string, posts: Post[]): Promise<PostClaim[]>;
  deleted(handle: string): Promise<Array<{ url: string; quote: string; about: string }>>;
  wallets(handle: string): Promise<Array<{ address: string; platform?: string; url: string }>>;
  chain: Sources;
}

export interface PersonInvestigation {
  handle: string;
  posts: number;
  claims: PostClaim[];
  wallets: Array<{ address: string; tier: WalletTier; source: string; platform?: string }>;
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

const MAX_POSTS = Number(process.env.PERSON_MAX_POSTS ?? 800);
const MAX_TOKENS = Number(process.env.PERSON_MAX_TOKENS ?? 5);
const HOUR = 3_600_000;
const WSOL = "So11111111111111111111111111111111111111112";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 0)}%`;
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
      return u ? x.userPosts(u.id, MAX_POSTS) : [];
    },
    async claims(handle, posts) {
      if (!grok || !posts.length) return [];
      return grok.extractClaims(handle, posts);
    },
    async deleted(handle) {
      if (!grok) return [];
      return grok.searchHistory(handle).catch(() => []);
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

  // ---- the record ---------------------------------------------------------
  const posts = await src.posts(handle);
  const claims = await src.claims(handle, posts);
  log.push(`${posts.length} posts, ${claims.length} claims`);

  // ---- the wallets --------------------------------------------------------
  const wallets = new Map<string, PersonInvestigation["wallets"][number]>();
  for (const c of claims) if (c.type === "wallet" && c.address) wallets.set(c.address, { address: c.address, tier: "claimed", source: c.url });
  for (const w of await src.wallets(handle)) if (!wallets.has(w.address)) wallets.set(w.address, { address: w.address, tier: "probable", source: w.url, platform: w.platform });
  // already on the record, with a source link: the registry is evidence too
  for (const w of known) if (w.source && !wallets.has(w.address)) wallets.set(w.address, { address: w.address, tier: w.tier, source: w.source, platform: w.platform });
  log.push(`${wallets.size} wallets (${[...wallets.values()].filter((w) => w.tier === "claimed").length} claimed)`);

  const history = new Map<string, Transfer[]>();
  for (const w of wallets.keys()) history.set(w, await src.chain.transfers(w, 400).catch(() => []));
  const all = [...history.values()].flat();

  // ---- tokens the posts talk about ----------------------------------------
  const mentioned = new Map<string, { token: string; mint?: string; claims: PostClaim[] }>();
  for (const c of claims) {
    if (!c.token || c.type === "wallet") continue;
    const key = (c.mint ?? c.token).toLowerCase();
    const m = mentioned.get(key) ?? { token: c.token, mint: c.mint, claims: [] };
    m.claims.push(c);
    mentioned.set(key, m);
  }
  const traded = new Map<string, { symbol?: string }>();
  for (const t of all) if (t.kind === "token" && t.mint && t.mint !== WSOL) traded.set(t.mint, traded.get(t.mint) ?? {});
  // No posts to read (no X or Grok key yet)? The chain still talks: every launch the wallets paid for is a subject.
  if (mentioned.size === 0) {
    const launched = new Map<string, string>();
    for (const t of all) if (t.type === "CREATE" && t.kind === "token" && t.mint && wallets.has(t.feePayer ?? "") && !launched.has(t.mint)) launched.set(t.mint, t.at);
    for (const [mint, at] of [...launched.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_TOKENS)) {
      mentioned.set(mint.toLowerCase(), { token: mint, mint, claims: [{ post_id: "", url: "", at, type: "launch", token: mint, mint, quote: "" }] });
    }
    log.push(`no posts read; ${launched.size} launches found on the wallets`);
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
  for (const m of [...mentioned.values()].sort((a, b) => b.claims.length - a.claims.length)) {
    const mint = await resolveMint(m);
    if (!mint || handled.has(mint)) continue;
    handled.add(mint);
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
        findings.push({
          code: code(),
          title: `Promoted $${symbol}, then sold`,
          detail: `Posted "${s.quote.slice(0, 120)}" and sold ${fmt(soldAfter)} $${symbol} (${pct(share)} of what the wallets held) starting ${when(hours(s.at, after[0].at))} after the post.${before.length ? ` The wallets had bought ${when(hours(before[0].at, s.at))} before posting.` : ""}`,
        });
        score += 30 + Math.min(20, Math.round(share * 20)) + (hours(s.at, after[0].at) <= 2 ? 10 : 0);
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
      if (inv && inv.findings.length) {
        tokenCases.push(inv);
        const launched = m.claims.some((c) => c.type === "launch") || (inv.deployer ? wallets.has(inv.deployer) : false);
        findings.push({
          code: code(),
          title: `${launched ? "Launched" : "Promoted"} $${symbol}: ${inv.charge.toLowerCase()}`,
          detail: `${launched ? "Their own launch." : "A launch they promoted."} The token's file: ${inv.findings.map((f) => f.title.toLowerCase()).join("; ")}. Score ${inv.score}.`,
        });
        score += Math.round(inv.score * (launched ? 0.6 : 0.3));
        if (inv.funder && wallets.has(inv.funder)) {
          findings.push({ code: code(), title: `A claimed wallet funded the $${symbol} bundle`, detail: `${short(inv.funder)} is on this handle's record and funded ${inv.bundle.length} of the first buyers.` });
          score += 30;
        }
        for (const e of inv.evidence.slice(0, 4)) evidence.push(e);
        if (!worst || inv.score > worst.score) worst = { mint, symbol, name: info?.name ?? symbol, score: inv.score };
      }
    }
    if (!worst && (sells.length || buys.length)) worst = { mint, symbol, name: info?.name ?? symbol, score: 0 };
  }

  // ---- what was deleted ---------------------------------------------------
  const deleted = await src.deleted(handle);
  if (deleted.length) {
    findings.push({ code: code(), title: `${deleted.length} promotion${deleted.length === 1 ? "" : "s"} since deleted`, detail: `Quoted by others: ${deleted.slice(0, 3).map((d) => `"${d.quote.slice(0, 80)}"`).join(" · ")}.` });
    score += Math.min(15, deleted.length * 5);
    for (const d of deleted.slice(0, 3)) evidence.push({ kind: "post", ref: d.url, at: "", note: `Deleted, quoted: ${d.about}` });
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

  evidence.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  const severity: Severity = score >= 85 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  return {
    handle,
    posts: posts.length,
    claims,
    wallets: [...wallets.values()],
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
