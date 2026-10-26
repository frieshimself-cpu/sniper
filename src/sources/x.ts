/**
 * X (Twitter) API v2, read only. The agent never writes to the account: no post, no poll, no reply,
 * no upload. There is no method here that could. Three jobs:
 *   userPosts    a handle's posts, for the person investigator
 *   latestPolls  the account's own polls, which a human posts by hand
 *   pollResults  one poll's options and votes
 * Keys from developer.x.com. Reads go through the app-only bearer when present; OAuth 1.0a or 2.0 user
 * keys serve the few reads that need a user context.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readState, writeState } from "../state.js";

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export interface Post {
  id: string;
  text: string;
  at: string;
  urls: string[];
}

export interface PollOption {
  position: number;
  label: string;
  votes: number;
}

export interface Poll {
  id: string; // the post id
  url: string;
  text: string;
  opened_at: string; // the post's created_at
  closes_at: string; // end_datetime
  status: "open" | "closed";
  options: PollOption[];
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

export interface BearerCreds {
  kind: "bearer";
  bearer: string;
}

export type XCreds = OAuth1Creds | OAuth2Creds | BearerCreds;

export function xCreds(): XCreds | null {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_CLIENT_ID, X_CLIENT_SECRET, X_USER_TOKEN, X_REFRESH_TOKEN, X_BEARER_TOKEN } = process.env;
  const bearer = X_BEARER_TOKEN || undefined;
  if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET) return { kind: "oauth1", key: X_API_KEY, secret: X_API_SECRET, token: X_ACCESS_TOKEN, tokenSecret: X_ACCESS_SECRET, bearer };
  if (X_CLIENT_ID && X_CLIENT_SECRET && X_USER_TOKEN && X_REFRESH_TOKEN) return { kind: "oauth2", clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET, userToken: X_USER_TOKEN, refreshToken: X_REFRESH_TOKEN, bearer };
  if (bearer) return { kind: "bearer", bearer };
  return null;
}

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

type StoredPair = { userToken: string; refreshToken: string; at: string; scope?: string };

const POLL_FIELDS = "expansions=attachments.poll_ids&poll.fields=options,voting_status,end_datetime&tweet.fields=created_at,attachments";

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

  private async auth(url: string, user: boolean): Promise<string> {
    if (!user && this.c.bearer) return `Bearer ${this.c.bearer}`;
    if (this.c.kind === "bearer") return `Bearer ${this.c.bearer}`;
    if (this.c.kind === "oauth1") return oauthHeader(this.c, "GET", url);
    await this.load();
    return `Bearer ${this.c.userToken}`;
  }

  /** GET only. There is no other verb in this class. */
  private async get<T>(url: string, user = false, retried = false): Promise<T> {
    const r = await fetch(url, { method: "GET", headers: { authorization: await this.auth(url, user) }, signal: AbortSignal.timeout(30_000) });
    const text = await r.text();
    if (r.status === 401 && this.c.kind === "oauth2" && user && !retried) {
      await this.refresh();
      return this.get<T>(url, user, true);
    }
    if (!r.ok) throw new Error(`x GET ${new URL(url).pathname} ${r.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text) as T;
  }

  /** Who the keys belong to. Needs a user context; with only a bearer, set X_ACCOUNT instead. */
  async me(): Promise<{ id: string; username: string }> {
    if (this.c.kind === "bearer") throw new Error("me() needs user keys; set X_ACCOUNT to the account's handle");
    const j = await this.get<{ data: { id: string; username: string } }>("https://api.x.com/2/users/me", true);
    return j.data;
  }

  async userByUsername(username: string): Promise<{ id: string; username: string; name: string; followers: number; created_at: string } | null> {
    const u = username.replace(/^@/, "");
    const j = await this.get<{ data?: { id: string; username: string; name: string; created_at?: string; public_metrics?: { followers_count?: number } } }>(
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
      const j = await this.get<{ data?: Array<{ id: string; text: string; created_at: string; entities?: { urls?: Array<{ expanded_url?: string }> } }>; meta?: { next_token?: string } }>(u.toString());
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

  /** The account's recent posts that carry a poll, newest first. */
  async latestPolls(userId: string, username: string, max = 20): Promise<Poll[]> {
    const j = await this.get<{
      data?: Array<{ id: string; text: string; created_at: string; attachments?: { poll_ids?: string[] } }>;
      includes?: { polls?: Array<{ id: string; options: PollOption[]; voting_status: string; end_datetime: string }> };
    }>(`https://api.x.com/2/users/${userId}/tweets?max_results=${Math.min(100, Math.max(5, max))}&exclude=retweets,replies&${POLL_FIELDS}`);
    const polls = new Map((j.includes?.polls ?? []).map((p) => [p.id, p]));
    const out: Poll[] = [];
    for (const t of j.data ?? []) {
      const p = polls.get(t.attachments?.poll_ids?.[0] ?? "");
      if (!p) continue;
      out.push(toPoll(t.id, username, t.text, t.created_at, p));
    }
    return out;
  }

  /** One poll by its post id. */
  async pollResults(tweetId: string, username = "i"): Promise<Poll | null> {
    const j = await this.get<{
      data?: { id: string; text: string; created_at: string };
      includes?: { polls?: Array<{ id: string; options: PollOption[]; voting_status: string; end_datetime: string }> };
    }>(`https://api.x.com/2/tweets/${tweetId}?${POLL_FIELDS}`);
    const p = j.includes?.polls?.[0];
    if (!p || !j.data) return null;
    return toPoll(j.data.id, username, j.data.text, j.data.created_at, p);
  }
}

function toPoll(id: string, username: string, text: string, at: string, p: { options: PollOption[]; voting_status: string; end_datetime: string }): Poll {
  return {
    id,
    url: `https://x.com/${username}/status/${id}`,
    text,
    opened_at: at,
    closes_at: p.end_datetime,
    status: p.voting_status === "open" ? "open" : "closed",
    options: [...p.options].sort((a, b) => a.position - b.position).map((o) => ({ position: o.position, label: o.label, votes: o.votes })),
  };
}
