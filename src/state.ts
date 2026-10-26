/**
 * Shared mutable state: ballots, votes, disputes, leads. The site and the agent both use it.
 *   Turso (libSQL over HTTP) when TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set (Vercel + GitHub Actions)
 *   Redis (Upstash REST) when KV_REST_API_URL + KV_REST_API_TOKEN are set
 *   JSON files under CRIME_STATE_DIR otherwise (a VPS, local dev, the static export)
 * Values are whole JSON documents under one key each. Small, simple, no schema migrations.
 */
import fs from "node:fs";
import path from "node:path";

export type StateKey = "ballots" | "disputes" | "leads" | "nominations" | "x_oauth2" | "progress";

const url = () => process.env.KV_REST_API_URL?.replace(/\/$/, "") || process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "") || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const usingRedis = () => !!(url() && token());

const tursoUrl = () => (process.env.TURSO_DATABASE_URL || "").replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
const tursoToken = () => process.env.TURSO_AUTH_TOKEN || "";
export const usingTurso = () => !!(tursoUrl() && tursoToken());
export const backend = () => (usingTurso() ? "turso" : usingRedis() ? "redis" : "files");

let tursoReady: Promise<void> | null = null;

/** One table, key -> JSON. libSQL's HTTP pipeline API, no driver needed. */
async function turso<T = unknown>(sql: string, args: Array<string> = []): Promise<T[]> {
  const r = await fetch(`${tursoUrl()}/v2/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${tursoToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: args.map((v) => ({ type: "text", value: v })) } }, { type: "close" }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`state: turso ${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = (await r.json()) as { results: Array<{ type: string; error?: { message: string }; response?: { result?: { rows?: Array<Array<{ value?: string }>> } } }> };
  const first = j.results[0];
  if (first.type === "error") throw new Error(`state: turso ${first.error?.message}`);
  return (first.response?.result?.rows ?? []).map((row) => row[0]?.value as unknown as T);
}

async function ensureTurso(): Promise<void> {
  if (!tursoReady) tursoReady = turso("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)").then(() => undefined);
  await tursoReady;
}
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
  if (usingTurso()) {
    await ensureTurso();
    const rows = await turso<string>("SELECT value FROM state WHERE key = ?", [`${PREFIX}:${key}`]);
    return rows[0] ? (JSON.parse(rows[0]) as T) : fallback;
  }
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
  if (usingTurso()) {
    await ensureTurso();
    await turso("INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [`${PREFIX}:${key}`, JSON.stringify(value), new Date().toISOString()]);
    return;
  }
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
