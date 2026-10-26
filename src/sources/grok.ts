/**
 * Grok (xAI) with live X search. One job: find posts where an address was
 * published, and who published it. Every claim must carry a post URL whose
 * author matches the handle, or it is thrown away. Grok's opinion is not evidence.
 */
import type { Claim } from "./types.js";

export class Grok {
  readonly key: string;
  model: string;
  extractClaims = extractClaims;
  searchHistory = searchHistory;
  readonly base: string;
  /** X live search is an xAI-only feature. Through a reseller (OpenRouter) the model still reads and classifies posts; it cannot search X. */
  readonly canSearch: boolean;

  constructor(key = process.env.XAI_API_KEY ?? "", model = process.env.XAI_MODEL ?? "grok-4.3", base = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1") {
    if (!key) throw new Error("XAI_API_KEY is not set");
    this.base = base.replace(/\/+$/, "");
    this.canSearch = /api\.x\.ai/.test(this.base);
    this.model = !this.canSearch && !/\//.test(model) ? `x-ai/${model}` : model;
    this.key = key;
  }

  /**
   * X search through xAI's Responses API (the agent tools). Returns the model's text and the status ids it cited.
   * A claim is kept only when its post id is among the citations: the model never gets to invent a URL.
   */
  async search(prompt: string, opts: { handles?: string[]; exclude?: string[] } = {}): Promise<{ text: string; cited: Set<string> }> {
    const tool: Record<string, unknown> = { type: "x_search" };
    if (opts.handles?.length) tool.allowed_x_handles = opts.handles.map((h) => h.replace(/^@/, ""));
    if (opts.exclude?.length) tool.excluded_x_handles = opts.exclude.map((h) => h.replace(/^@/, ""));
    const r = await fetch(`${this.base}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        input: [
          { role: "system", content: "You are a retrieval tool. You output JSON only. You never guess an author or a URL." },
          { role: "user", content: prompt },
        ],
        tools: [tool],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) throw new Error(`xai ${r.status}`);
    type Out = { type: string; content?: Array<{ type: string; text?: string; annotations?: Array<{ type: string; url?: string }> }> };
    const j = (await r.json()) as { output?: Out[] };
    let text = "";
    const cited = new Set<string>();
    for (const o of j.output ?? []) {
      if (o.type !== "message") continue;
      for (const c of o.content ?? []) {
        if (c.text) text += c.text;
        for (const a of c.annotations ?? []) {
          const id = statusId(a.url ?? "");
          if (id) cited.add(id);
        }
      }
    }
    return { text, cited };
  }

  async claims(address: string): Promise<Claim[]> {
    const prompt = [
      `Search X for posts that contain the exact Solana address ${address}.`,
      `Return ONLY a JSON array. Each item: {"handle": "<author handle without @>", "url": "<full x.com status URL>", "quote": "<the sentence containing the address>", "self": <true if the author presents the address as their own wallet, else false>, "about": "<handle the post attributes the address to, without @, or null>"}.`,
      `Only include posts you actually found. If none, return [].`,
    ].join("\n");
    const { text, cited } = await this.search(prompt);
    let items: Array<Record<string, unknown>> = [];
    try {
      const m = text.match(/\[[\s\S]*\]/);
      items = m ? (JSON.parse(m[0]) as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
    const out: Claim[] = [];
    for (const it of items) {
      const url = typeof it.url === "string" ? it.url : "";
      const handle = typeof it.handle === "string" ? it.handle.replace(/^@/, "").toLowerCase() : "";
      const quote = typeof it.quote === "string" ? it.quote : "";
      const m = url.match(/^https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/\d+/);
      if (!m || m[1].toLowerCase() !== handle) continue; // author must own the URL
      if (!quote.includes(address)) continue; // the address must be in the post
      if (!cited.has(statusId(url))) continue; // and Grok must have actually cited it
      const about = typeof it.about === "string" && it.about ? "@" + it.about.replace(/^@/, "").toLowerCase() : undefined;
      out.push({ handle: "@" + handle, address, url, quote: quote.slice(0, 280), self: it.self === true, about });
    }
    return out;
  }
}

export type ClaimType = "shill" | "holding" | "lp_locked" | "wallet" | "sold" | "launch" | "other";

export interface PostClaim {
  post_id: string;
  url: string;
  at: string;
  type: ClaimType;
  token?: string; // $SYMBOL or a mint
  mint?: string;
  address?: string; // a Solana address in the post
  quote: string;
}

const SOL_ADDR = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

/** Posts to claims. Cheap part first (regex), Grok on top for the reading comprehension. */
export async function extractClaims(this: Grok, handle: string, posts: Array<{ id: string; text: string; at: string }>): Promise<PostClaim[]> {
  const h = handle.replace(/^@/, "");
  const url = (id: string) => `https://x.com/${h}/status/${id}`;
  const claims: PostClaim[] = [];
  // every address a handle ever typed is a claim on its own, no model needed
  for (const p of posts) for (const m of p.text.match(SOL_ADDR) ?? []) claims.push({ post_id: p.id, url: url(p.id), at: p.at, type: "wallet", address: m, quote: p.text.slice(0, 280) });
  // the model reads the rest in batches
  const batch = 60;
  for (let i = 0; i < posts.length; i += batch) {
    const slice = posts.slice(i, i + batch);
    const prompt = [
      `Below are posts by @${h}, one per line as JSON {id, at, text}. Classify each post that makes a claim about a crypto token.`,
      `Types: shill (promotes or recommends a token), holding (says they hold or are not selling), lp_locked (says liquidity is locked or safe), sold (admits selling), launch (announces their own token), other.`,
      `Return ONLY a JSON array of {"id": "<post id>", "type": "<type>", "token": "<$SYMBOL or mint if named, else null>", "quote": "<the exact words, max 200 chars>"}. Skip posts with no token claim. Never invent a post id.`,
      ...slice.map((p) => JSON.stringify({ id: p.id, at: p.at, text: p.text.slice(0, 400) })),
    ].join("\n");
    const { text, cited } = await this.search(prompt, { exclude: [h] });
  let items: Array<Record<string, unknown>> = [];
    try {
      const m = text.match(/\[[\s\S]*\]/);
      items = m ? (JSON.parse(m[0]) as Array<Record<string, unknown>>) : [];
    } catch {
      items = [];
    }
    const byId = new Map(slice.map((p) => [p.id, p]));
    for (const it of items) {
      const p = typeof it.id === "string" ? byId.get(it.id) : undefined;
      if (!p) continue; // never a post the model made up
      const type = String(it.type ?? "other") as ClaimType;
      if (!["shill", "holding", "lp_locked", "sold", "launch"].includes(type)) continue;
      const token = typeof it.token === "string" && it.token ? it.token.trim() : undefined;
      claims.push({ post_id: p.id, url: url(p.id), at: p.at, type, token, mint: token && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token) ? token : undefined, quote: String(it.quote ?? p.text).slice(0, 280) });
    }
  }
  return claims;
}

/** What the timeline no longer shows: quotes and screenshots of the handle's deleted or older posts. Each needs a citing URL. */
export async function searchHistory(this: Grok, handle: string): Promise<Array<{ url: string; quote: string; about: string }>> {
  if (!this.canSearch) return [];
  const h = handle.replace(/^@/, "");
  const prompt = `Search X for posts quoting, screenshotting or replying to crypto token promotions by @${h} that @${h} later deleted. Return ONLY a JSON array of {"url": "<x.com status URL of the citing post>", "quote": "<what the deleted post said, as quoted>", "about": "<$SYMBOL or token named>"}. Only include posts you actually found.`;
  const { text, cited } = await this.search(prompt, { exclude: [h] });
  let items: Array<Record<string, unknown>> = [];
  try {
    const m = text.match(/\[[\s\S]*\]/);
    items = m ? (JSON.parse(m[0]) as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
  return items
    .filter((it) => typeof it.url === "string" && /^https?:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(it.url as string) && cited.has(statusId(it.url as string)))
    .map((it) => ({ url: it.url as string, quote: String(it.quote ?? "").slice(0, 280), about: String(it.about ?? "") }));
}

/** The post id in an x.com or twitter.com status URL; citations come back as x.com/i/status/<id>. */
const statusId = (u: string) => u.match(/\/status\/(\d+)/)?.[1] ?? "";
