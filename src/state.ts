/**
 * Shared mutable state: ballots, votes, disputes, leads. The site and the agent both use it.
 *   Redis (Upstash REST) when KV_REST_API_URL + KV_REST_API_TOKEN are set (Vercel + GitHub Actions)
 *   JSON files under CRIME_STATE_DIR otherwise (a VPS, local dev, the static export)
 * Values are whole JSON documents under one key each. Small, simple, no schema migrations.
 */
import fs from "node:fs";
import path from "node:path";

export type StateKey = "ballots" | "disputes" | "leads";

const url = () => process.env.KV_REST_API_URL?.replace(/\/$/, "") || process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "") || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const usingRedis = () => !!(url() && token());
const PREFIX = process.env.CRIME_STATE_PREFIX ?? "crime";

function stateDir(): string {
  const d = process.env.CRIME_STATE_DIR?.trim();
  if (d) return path.resolve(process.cwd(), d);
  // Vercel functions have a read-only project tree; /tmp works for the life of the instance. Redis is the real answer there.
  if (process.env.VERCEL) return "/tmp/crime-state";
  // the agent runs from the repo root, the site from web/: both land on web/.data
  const base = fs.existsSync(path.join(process.cwd(), "web")) ? path.join(process.cwd(), "web") : process.cwd();
  return path.join(base, ".data");
}

async function redis<T>(cmd: unknown[]): Promise<T> {
  const r = await fetch(url(), { method: "POST", headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" }, body: JSON.stringify(cmd), cache: "no-store" });
  if (!r.ok) throw new Error(`state: redis ${r.status}`);
  const j = (await r.json()) as { result?: T; error?: string };
  if (j.error) throw new Error(`state: ${j.error}`);
  return j.result as T;
}

export async function readState<T>(key: StateKey, fallback: T): Promise<T> {
  if (usingRedis()) {
    const raw = await redis<string | null>(["GET", `${PREFIX}:${key}`]);
    return raw ? (JSON.parse(raw) as T) : fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir(), `${key}.json`), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeState<T>(key: StateKey, value: T): Promise<void> {
  if (usingRedis()) {
    await redis(["SET", `${PREFIX}:${key}`, JSON.stringify(value)]);
    return;
  }
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${key}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2));
  fs.renameSync(file + ".tmp", file);
}

/** Read, change, write. Not atomic across writers, but each document is small and writers are few. */
export async function updateState<T>(key: StateKey, fallback: T, fn: (cur: T) => T | Promise<T>): Promise<T> {
  const next = await fn(await readState(key, fallback));
  await writeState(key, next);
  return next;
}
