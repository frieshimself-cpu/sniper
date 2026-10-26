/**
 * X (Twitter) API v2. Three jobs:
 *   postPoll     put the hour's ballot up as a poll
 *   pollResults  read the votes when it closes
 *   postCase     publish the case card
 * Two ways in, from developer.x.com with Read and Write:
 *   OAuth 1.0a   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET. Never expire.
 *   OAuth 2.0    X_CLIENT_ID, X_CLIENT_SECRET, X_USER_TOKEN, X_REFRESH_TOKEN. The user token lives two
 *                hours; the agent refreshes it and keeps the rotated pair in shared state (key x_oauth2).
 * X_BEARER_TOKEN (app-only) is used for reads when present, so a stale user token never blocks a read.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readState, writeState } from "../state.js";

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export interface Post {
  id: string;
  text: string;
  at: string;
  urls: string[];
}

export interface OAuth1Creds {
  kind: "oauth1";
  key: string;
  secret: string;
  token: string;
  tokenSecret: string;
  bearer?: string;
}

export interface OAuth2Creds {
  kind: "oauth2";
  clientId: string;
  clientSecret: string;
  userToken: string;
  refreshToken: string;
  bearer?: string;
}

export type XCreds = OAuth1Creds | OAuth2Creds;

export function xCreds(): XCreds | null {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_CLIENT_ID, X_CLIENT_SECRET, X_USER_TOKEN, X_REFRESH_TOKEN, X_BEARER_TOKEN } = process.env;
  const bearer = X_BEARER_TOKEN || undefined;
  if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET) return { kind: "oauth1", key: X_API_KEY, secret: X_API_SECRET, token: X_ACCESS_TOKEN, tokenSecret: X_ACCESS_SECRET, bearer };
  if (X_CLIENT_ID && X_CLIENT_SECRET && X_USER_TOKEN && X_REFRESH_TOKEN) return { kind: "oauth2", clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET, userToken: X_USER_TOKEN, refreshToken: X_REFRESH_TOKEN, bearer };
  return null;
}

/** OAuth 1.0a HMAC-SHA1 Authorization header. Body params are included only for form bodies. */
export function oauthHeader(c: OAuth1Creds, method: string, url: string, params: Record<string, string> = {}): string {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: c.token,
    oauth_version: "1.0",
  };
  const all: Record<string, string> = { ...params, ...oauth };
  u.searchParams.forEach((v, k) => (all[k] = v));
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join("&"))].join("&");
  const sig = createHmac("sha1", `${enc(c.secret)}&${enc(c.tokenSecret)}`).update(base).digest("base64");
  oauth.oauth_signature = sig;
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", ");
}

/** X allows one cashtag a post. The first $SYMBOL stays; the rest lose their dollar sign. */
export function oneCashtag(text: string): string {
  let seen = false;
  return text.replace(/\$([A-Za-z][A-Za-z0-9_]{0,24})\b/g, (m, sym: string) => {
    if (seen) return sym;
    seen = true;
    return m;
  });
}

type StoredPair = { userToken: string; refreshToken: string; at: string; scope?: string };

export class X {
  private loaded = false;
  constructor(private readonly c: XCreds) {}

  /** The rotated OAuth 2.0 pair outlives this process: the newest one wins over the environment. */
  private async load(): Promise<void> {
    if (this.loaded || this.c.kind !== "oauth2") return;
    this.loaded = true;
    const p = await readState<StoredPair | null>("x_oauth2", null).catch(() => null);
    if (p?.userToken && p.refreshToken) {
      this.c.userToken = p.userToken;
      this.c.refreshToken = p.refreshToken;
    }
  }

  /** OAuth 2.0 refresh. The old refresh token dies with this call, so the new pair is written down at once. */
  async refresh(): Promise<{ scope?: string }> {
    if (this.c.kind !== "oauth2") return {};
    await this.load();
    const r = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.c.clientId}:${this.c.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.c.refreshToken, client_id: this.c.clientId }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`x refresh ${r.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text) as { access_token: string; refresh_token?: string; scope?: string };
    this.c.userToken = j.access_token;
    if (j.refresh_token) this.c.refreshToken = j.refresh_token;
    await writeState("x_oauth2", { userToken: this.c.userToken, refreshToken: this.c.refreshToken, at: new Date().toISOString(), scope: j.scope } satisfies StoredPair);
    return { scope: j.scope };
  }

  private async auth(method: string, url: string, read: boolean): Promise<string> {
    if (read && this.c.bearer) return `Bearer ${this.c.bearer}`;
    if (this.c.kind === "oauth1") return oauthHeader(this.c, method, url);
    await this.load();
    return `Bearer ${this.c.userToken}`;
  }

  private async json<T>(method: string, url: string, body?: unknown, retried = false): Promise<T> {
    const read = method === "GET" && !/\/users\/me$/.test(new URL(url).pathname); // who am I is a user-context question
    const r = await fetch(url, {
      method,
      headers: { authorization: await this.auth(method, url, read), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (r.status === 401 && this.c.kind === "oauth2" && !(read && this.c.bearer) && !retried) {
      await this.refresh();
      return this.json<T>(method, url, body, true);
    }
    if (!r.ok) throw new Error(`x ${method} ${new URL(url).pathname} ${r.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text) as T;
  }

  async me(): Promise<{ id: string; username: string }> {
    const j = await this.json<{ data: { id: string; username: string } }>("GET", "https://api.x.com/2/users/me");
    return j.data;
  }

  async userByUsername(username: string): Promise<{ id: string; username: string; name: string; followers: number; created_at: string } | null> {
    const u = username.replace(/^@/, "");
    const j = await this.json<{ data?: { id: string; username: string; name: string; created_at?: string; public_metrics?: { followers_count?: number } } }>(
      "GET",
      `https://api.x.com/2/users/by/username/${encodeURIComponent(u)}?user.fields=created_at,public_metrics`,
    );
    if (!j.data) return null;
    return { id: j.data.id, username: j.data.username, name: j.data.name, followers: j.data.public_metrics?.followers_count ?? 0, created_at: j.data.created_at ?? "" };
  }

  /** The user's own posts, newest first, up to `max` (the API stops at 3,200). Replies kept, retweets dropped. */
  async userPosts(userId: string, max = 800): Promise<Post[]> {
    const out: Post[] = [];
    let token: string | undefined;
    let pagination: string | undefined;
    let tries = 0;
    while (out.length < max) {
      const u = new URL(`https://api.x.com/2/users/${userId}/tweets`);
      u.searchParams.set("max_results", "100");
      u.searchParams.set("tweet.fields", "created_at,entities,public_metrics,referenced_tweets");
      u.searchParams.set("exclude", "retweets");
      if (pagination) u.searchParams.set("pagination_token", pagination);
      const j = await this.json<{ data?: Array<{ id: string; text: string; created_at: string; entities?: { urls?: Array<{ expanded_url?: string }> } }>; meta?: { next_token?: string } }>("GET", u.toString());
      for (const t of j.data ?? []) out.push({ id: t.id, text: t.text, at: t.created_at, urls: (t.entities?.urls ?? []).map((x) => x.expanded_url ?? "").filter(Boolean) });
      if (process.env.X_DEBUG) process.stderr.write(`x timeline page: ${(j.data ?? []).length} posts, next ${j.meta?.next_token ? "yes" : "no"}\n`);
      token = j.meta?.next_token;
      // The same page sometimes comes back short and final (14 posts, no next). A short first page is asked for again,
      // twice at most; the same resource within a day is billed once.
      if (!token && !pagination && (j.data ?? []).length < 50 && tries++ < 2) {
        out.length = 0;
        continue;
      }
      pagination = token;
      if (!token || !(j.data ?? []).length) break;
    }
    return out;
  }

  /** Post a poll. Options: 2 to 4, 25 characters each. Returns the post id and URL. */
  async postPoll(text: string, options: string[], durationMinutes: number): Promise<{ id: string; url: string }> {
    // poll options carry no cashtags at all: X counts them against the one-cashtag limit
    const opts = options.slice(0, 4).map((o) => o.replace(/\$([A-Za-z])/g, "$1").slice(0, 25));
    if (opts.length < 2) throw new Error("a poll needs two options");
    const j = await this.json<{ data: { id: string } }>("POST", "https://api.x.com/2/tweets", {
      text: oneCashtag(text).slice(0, 280),
      poll: { options: opts, duration_minutes: Math.max(5, Math.min(10080, Math.round(durationMinutes))) },
    });
    const me = await this.me().catch(() => ({ username: "i" }));
    return { id: j.data.id, url: `https://x.com/${me.username}/status/${j.data.id}` };
  }

  /** Votes per option, in option order. */
  async pollResults(tweetId: string): Promise<{ options: Array<{ label: string; votes: number }>; status: string; ends: string } | null> {
    const j = await this.json<{ includes?: { polls?: Array<{ options: Array<{ position: number; label: string; votes: number }>; voting_status: string; end_datetime: string }> } }>(
      "GET",
      `https://api.x.com/2/tweets/${tweetId}?expansions=attachments.poll_ids&poll.fields=options,voting_status,end_datetime`,
    );
    const p = j.includes?.polls?.[0];
    if (!p) return null;
    return { options: p.options.sort((a, b) => a.position - b.position).map((o) => ({ label: o.label, votes: o.votes })), status: p.voting_status, ends: p.end_datetime };
  }

  /** Upload a PNG, then post text with it. Falls back to text only if the upload fails. */
  async postCase(text: string, pngPath: string | null, replyTo?: string): Promise<{ id: string }> {
    let mediaId: string | null = null;
    if (pngPath) {
      try {
        mediaId = await this.uploadPng(pngPath);
      } catch (err) {
        process.stderr.write(`x media upload failed: ${(err as Error).message}\n`);
      }
    }
    const body: Record<string, unknown> = { text: oneCashtag(text).slice(0, 280) };
    if (mediaId) body.media = { media_ids: [mediaId] };
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
    const j = await this.json<{ data: { id: string } }>("POST", "https://api.x.com/2/tweets", body);
    return j.data;
  }

  private async uploadPng(path: string): Promise<string> {
    const bytes = await readFile(path);
    const form = new FormData();
    form.append("media", new Blob([bytes], { type: "image/png" }), "card.png");
    form.append("media_category", "tweet_image");
    // v2 first, then the long-standing v1.1 endpoint (OAuth 1.0a only)
    const urls = this.c.kind === "oauth1" ? ["https://api.x.com/2/media/upload", "https://upload.twitter.com/1.1/media/upload.json"] : ["https://api.x.com/2/media/upload"];
    for (const url of urls) {
      const r = await fetch(url, { method: "POST", headers: { authorization: await this.auth("POST", url, false) }, body: form, signal: AbortSignal.timeout(60_000) });
      const text = await r.text();
      if (r.ok) {
        const j = JSON.parse(text) as { data?: { id?: string }; media_id_string?: string; id?: string };
        const id = j.data?.id ?? j.media_id_string ?? j.id;
        if (id) return String(id);
      }
      process.stderr.write(`x upload ${url} ${r.status}: ${text.slice(0, 120)}\n`);
    }
    throw new Error("media upload failed on both endpoints");
  }
}
