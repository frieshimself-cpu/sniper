/**
 * Posts to claims without a model. Regex and a short vocabulary.
 * Grok does this better (it reads). This runs when there is no Grok, and
 * it is what Grok's output is checked against: a claim needs a post, a
 * post needs a URL, and the agent never invents either.
 */
import type { PostClaim } from "./grok.js";

const SOL_ADDR = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const TICKER = /\$([A-Za-z][A-Za-z0-9]{1,11})\b/g;
const NOT_TICKERS = new Set(["SOL", "USD", "USDC", "USDT", "BTC", "ETH", "K", "M", "B"]);

const LAUNCH = /\b(launch(ing|ed)?|deploy(ing|ed)?|just (dropped|created|minted)|my (coin|token)|our (coin|token)|ca\s*[:=]|contract\s*[:=]|contract address)\b/i;
const HOLDING = /\b(not selling|never selling|still holding|holding (strong|every|all)|diamond hands|haven'?t sold|i hold|we hold|holding since|not sold a single)\b/i;
const LP_LOCKED = /\b(lp (is )?locked|liquidity (is )?locked|lp burned|liquidity burned|mint (is )?revoked|safe(st)? (play|coin|token)|rug ?proof|can'?t rug|no rug)\b/i;
const SOLD = /\b(i sold|we sold|took profit|taking profit|sold (my|the|all|half|some)|cashed out|exited|closed (my|the) position)\b/i;
const SHILL = /\b(send it|sending|gem|100x|1000x|10x|moon|mooning|pump|pumping|bullish|accumulate|accumulating|load(ing)? up|ape(d|ing)?|buy now|get in|don'?t fade|next (big|runner)|easy money|free money|generational|lfg)\b/i;

export function ruleClaims(handle: string, posts: Array<{ id: string; text: string; at: string }>): PostClaim[] {
  const h = handle.replace(/^@/, "");
  const url = (id: string) => `https://x.com/${h}/status/${id}`;
  const out: PostClaim[] = [];
  for (const p of posts) {
    const text = p.text ?? "";
    const quote = text.slice(0, 280);
    const addrs = [...new Set(text.match(SOL_ADDR) ?? [])];
    const tickers = [...new Set([...text.matchAll(TICKER)].map((m) => m[1].toUpperCase()).filter((t) => !NOT_TICKERS.has(t)))];
    const token = tickers[0] ? `$${tickers[0]}` : addrs[0];
    const mint = addrs[0];
    // every address typed is a wallet claim, unless the post reads as a launch (then it is the mint)
    const launch = LAUNCH.test(text) && (addrs.length > 0 || tickers.length > 0);
    if (!launch) for (const a of addrs) out.push({ post_id: p.id, url: url(p.id), at: p.at, type: "wallet", address: a, quote });
    if (launch) out.push({ post_id: p.id, url: url(p.id), at: p.at, type: "launch", token, mint, quote });
    else if (!token) continue;
    else if (SOLD.test(text)) out.push({ post_id: p.id, url: url(p.id), at: p.at, type: "sold", token, mint, quote });
    else if (HOLDING.test(text)) out.push({ post_id: p.id, url: url(p.id), at: p.at, type: "holding", token, mint, quote });
    else if (LP_LOCKED.test(text)) out.push({ post_id: p.id, url: url(p.id), at: p.at, type: "lp_locked", token, mint, quote });
    else if (SHILL.test(text) || tickers.length > 0) out.push({ post_id: p.id, url: url(p.id), at: p.at, type: "shill", token, mint, quote });
  }
  return out;
}
