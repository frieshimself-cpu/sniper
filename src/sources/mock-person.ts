/** A fictional handle with a fictional record, for the pipeline test. Pairs with mockSources(). */
import type { PersonSources } from "../person.js";
import { mockSources } from "./mock.js";
import type { Post } from "./x.js";
import type { PostClaim } from "./grok.js";

export function mockPersonSources(handle = "@wen_moon_wendy"): PersonSources {
  const chain = mockSources("MockMint1111111111111111111111111111111111", handle);
  const mint = "MockMint1111111111111111111111111111111111";
  const t0 = Date.UTC(2026, 9, 24, 3, 0, 0);
  const iso = (ms: number) => new Date(ms).toISOString();
  const h = handle.slice(1);
  const posts: Post[] = [
    { id: "1890000000000000001", text: `launching at ${"mPDDaHYq6QDq9qjWLXFoLd8EsvdSnvHRbsMVFDLryB5U"}. lp locked. still here.`, at: iso(t0 - 60_000), urls: [] },
    { id: "1890000000000000003", text: "$MOCK is a generational entry. not selling a single one.", at: iso(t0 + 5 * 60_000), urls: [] },
    { id: "1890000000000000004", text: "gm", at: iso(t0 + 3 * 3_600_000), urls: [] },
  ];
  const claims: PostClaim[] = [
    { post_id: posts[0].id, url: `https://x.com/${h}/status/${posts[0].id}`, at: posts[0].at, type: "wallet", address: "mPDDaHYq6QDq9qjWLXFoLd8EsvdSnvHRbsMVFDLryB5U", quote: posts[0].text },
    { post_id: posts[0].id, url: `https://x.com/${h}/status/${posts[0].id}`, at: posts[0].at, type: "launch", token: mint, mint, quote: posts[0].text },
    { post_id: posts[1].id, url: `https://x.com/${h}/status/${posts[1].id}`, at: posts[1].at, type: "shill", token: "$MOCK", quote: posts[1].text },
    { post_id: posts[1].id, url: `https://x.com/${h}/status/${posts[1].id}`, at: posts[1].at, type: "holding", token: "$MOCK", quote: posts[1].text },
  ];
  return {
    chain,
    async posts() {
      return posts;
    },
    async claims(_handle: string, _posts: unknown, _onBatch?: unknown) {
      return claims;
    },
    async deleted() {
      return [{ url: `https://x.com/onchain_tipster/status/1890000000000000009`, quote: "she said LP was locked lol", about: "$MOCK" }];
    },
    async said() {
      return [];
    },
    async wallets() {
      return [{ address: "fJkgiWmLe9zo87xSJK98z16G22cwunMScRabZgKPd28p", url: "https://intel.arkm.com/explorer/address/fJkgiWmLe9zo87xSJK98z16G22cwunMScRabZgKPd28p" }];
    },
  };
}
