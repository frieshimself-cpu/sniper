import "server-only";
/**
 * The polls. A human posts them on the X account; the agent settles them into data/polls.json.
 * The site shows the live one straight from X (read only, X_BEARER_TOKEN) and the settled ones from the file.
 */
import fs from "node:fs";
import path from "node:path";
import { AGENT_ROOT } from "./data";
import { enforceDeep } from "../../src/policy";

export interface PollOptionView {
  label: string;
  votes: number;
  subject?: string;
}

export interface PollView {
  id: string;
  url: string;
  opened_at: string;
  closes_at: string;
  open: boolean;
  options: PollOptionView[];
  total: number;
  winner?: string;
  case_n?: number;
  message?: string;
}

const POLLS_PATH = path.join(AGENT_ROOT, "data", "polls.json");

export function pollHistory(): PollView[] {
  try {
    const f = JSON.parse(fs.readFileSync(POLLS_PATH, "utf8")) as { polls?: Array<Omit<PollView, "open">> };
    return (f.polls ?? []).map((p) => enforceDeep({ ...p, open: false }));
  } catch {
    return [];
  }
}

// one read of X a minute, shared by every request
let cache: { at: number; poll: PollView | null } | null = null;
const TTL = 60_000;

async function livePoll(): Promise<PollView | null> {
  const bearer = process.env.X_BEARER_TOKEN;
  const account = (process.env.X_ACCOUNT ?? "crimeislegalpf").replace(/^@/, "");
  if (!bearer) return null;
  if (cache && Date.now() - cache.at < TTL) return cache.poll;
  try {
    const u = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(account)}`, { headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(8000) });
    if (!u.ok) throw new Error(`user ${u.status}`);
    const uid = ((await u.json()) as { data?: { id: string } }).data?.id;
    if (!uid) throw new Error("no account");
    const r = await fetch(
      `https://api.x.com/2/users/${uid}/tweets?max_results=20&exclude=retweets,replies&expansions=attachments.poll_ids&poll.fields=options,voting_status,end_datetime&tweet.fields=created_at,attachments`,
      { headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw new Error(`timeline ${r.status}`);
    const j = (await r.json()) as {
      data?: Array<{ id: string; created_at: string; attachments?: { poll_ids?: string[] } }>;
      includes?: { polls?: Array<{ id: string; options: Array<{ position: number; label: string; votes: number }>; voting_status: string; end_datetime: string }> };
    };
    const polls = new Map((j.includes?.polls ?? []).map((p) => [p.id, p]));
    let poll: PollView | null = null;
    for (const t of j.data ?? []) {
      const p = polls.get(t.attachments?.poll_ids?.[0] ?? "");
      if (!p) continue;
      const options = [...p.options].sort((a, b) => a.position - b.position).map((o) => ({ label: o.label, votes: o.votes }));
      poll = {
        id: t.id,
        url: `https://x.com/${account}/status/${t.id}`,
        opened_at: t.created_at,
        closes_at: p.end_datetime,
        open: p.voting_status === "open",
        options,
        total: options.reduce((a, o) => a + o.votes, 0),
      };
      break; // newest first
    }
    cache = { at: Date.now(), poll };
    return poll;
  } catch {
    cache = { at: Date.now(), poll: cache?.poll ?? null };
    return cache.poll;
  }
}

/** The poll to show: the account's newest poll from X, with what the agent made of it, else the newest settled one. */
export async function currentPoll(): Promise<PollView | null> {
  const history = pollHistory();
  const live = await livePoll();
  if (!live) return history[0] ?? null;
  const settled = history.find((p) => p.id === live.id);
  if (!settled) {
    const ordered = [...live.options].sort((a, b) => b.votes - a.votes);
    return enforceDeep({ ...live, winner: live.open ? undefined : ordered[0]?.label });
  }
  return enforceDeep({ ...settled, options: live.options.map((o, i) => ({ ...o, subject: settled.options[i]?.subject })), total: live.total, open: false });
}
