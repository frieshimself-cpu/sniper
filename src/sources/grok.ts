/**
 * Grok (xAI) with live X search. One job: find posts where an address was
 * published, and who published it. Every claim must carry a post URL whose
 * author matches the handle, or it is thrown away. Grok's opinion is not evidence.
 */
import type { Claim } from "./types.js";

export class Grok {
  private readonly key: string;
  private readonly model: string;
  constructor(key = process.env.XAI_API_KEY ?? "", model = process.env.XAI_MODEL ?? "grok-4") {
    if (!key) throw new Error("XAI_API_KEY is not set");
    this.key = key;
    this.model = model;
  }

  async claims(address: string): Promise<Claim[]> {
    const prompt = [
      `Search X for posts that contain the exact Solana address ${address}.`,
      `Return ONLY a JSON array. Each item: {"handle": "<author handle without @>", "url": "<full x.com status URL>", "quote": "<the sentence containing the address>", "self": <true if the author presents the address as their own wallet, else false>, "about": "<handle the post attributes the address to, without @, or null>"}.`,
      `Only include posts you actually found. If none, return [].`,
    ].join("\n");
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: "You are a retrieval tool. You output JSON only. You never guess an author or a URL." },
          { role: "user", content: prompt },
        ],
        search_parameters: { mode: "on", return_citations: true, sources: [{ type: "x" }] },
      }),
    });
    if (!r.ok) throw new Error(`xai ${r.status}`);
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; citations?: string[] };
    const text = j.choices?.[0]?.message?.content ?? "[]";
    const citations = new Set((j.citations ?? []).map(norm));
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
      if (citations.size && !citations.has(norm(url))) continue; // and Grok must have actually cited it
      const about = typeof it.about === "string" && it.about ? "@" + it.about.replace(/^@/, "").toLowerCase() : undefined;
      out.push({ handle: "@" + handle, address, url, quote: quote.slice(0, 280), self: it.self === true, about });
    }
    return out;
  }
}

const norm = (u: string) => u.replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com/, "x").replace(/[?#].*$/, "").replace(/\/$/, "");
