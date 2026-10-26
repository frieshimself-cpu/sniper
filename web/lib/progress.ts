/**
 * The thinking, read back. The runner publishes data/progress.json after every step: to shared
 * state when a store is configured, and to the `progress` branch of the repository. The site reads
 * the store when it has one, else the branch (a minute behind at worst), else the local file.
 */
import fs from "node:fs";
import path from "node:path";
import { AGENT_ROOT } from "./data";
import { readState, usingTurso, usingRedis } from "../../src/state";
import { enforceDeep } from "../../src/policy";

export interface ProgressStep {
  at: string;
  phase: "poll" | "record" | "wallets" | "replay" | "findings" | "file";
  text: string;
}

export interface Progress {
  state: "idle" | "running" | "done" | "error";
  subject?: string;
  poll_id?: string;
  poll_url?: string;
  started_at?: string;
  updated_at: string;
  steps: ProgressStep[];
  wallets: Array<{ address: string; tier: string; via?: string; peer?: string }>;
  findings: Array<{ title: string; score?: number }>;
  case_n?: number;
  message?: string;
}

const EMPTY: Progress = { state: "idle", updated_at: "", steps: [], wallets: [], findings: [] };
const LOCAL = path.join(AGENT_ROOT, "data", "progress.json");
const REPO = process.env.GITHUB_REPO ?? "";
let cache: { at: number; p: Progress } | null = null;
const TTL = 15_000;

function local(): Progress | null {
  try {
    return JSON.parse(fs.readFileSync(LOCAL, "utf8")) as Progress;
  } catch {
    return null;
  }
}

async function branch(): Promise<Progress | null> {
  if (!REPO) return null;
  // The raw host caches a branch path for minutes. The repository's own ref list does not: read the branch's
  // commit from it (git's smart HTTP, public, no token, no API quota) and fetch the file by commit, which never changes.
  try {
    const refs = await fetch(`https://github.com/${REPO}.git/info/refs?service=git-upload-pack`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!refs.ok) return null;
    const sha = (await refs.text()).match(/([0-9a-f]{40}) refs\/heads\/progress\b/)?.[1];
    if (!sha) return null;
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/progress.json`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return (await r.json()) as Progress;
  } catch {
    return null;
  }
}

/** A running investigation that stopped updating is over; the file does not know that, the clock does. */
function settle(p: Progress): Progress {
  if (p.state === "running" && p.updated_at && Date.now() - Date.parse(p.updated_at) > 45 * 60_000) {
    return { ...p, state: "error", message: p.message ?? "The run stopped reporting." };
  }
  return p;
}

export async function getProgress(): Promise<Progress> {
  if (cache && Date.now() - cache.at < TTL) return cache.p;
  let p: Progress | null = null;
  if (usingTurso() || usingRedis()) p = await readState<Progress | null>("progress", null).catch(() => null);
  if (!p) p = await branch();
  if (!p) p = local();
  const out = enforceDeep(settle(p ?? EMPTY));
  cache = { at: Date.now(), p: out };
  return out;
}
