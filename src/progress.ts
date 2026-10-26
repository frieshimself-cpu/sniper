/**
 * The thinking, published while it happens. Every step of an investigation is written to
 * data/progress.json and, when configured, to shared state and to the `progress` branch of the
 * repository (one commit, force-pushed, so the branch stays one file deep). The site reads it
 * and shows the work as it is done. Never fails the run: every write is best effort.
 *
 *   PROGRESS_PUSH=on   push data/progress.json to the `progress` branch after every step (GitHub Actions)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeState, usingTurso, usingRedis } from "./state.js";

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
  budget_minutes?: number; // how long a person gets: the panel counts it down
  updated_at: string;
  steps: ProgressStep[];
  wallets: Array<{ address: string; tier: string; via?: string; peer?: string }>;
  posts: Array<{ at: string; text: string; url: string; type?: string }>;
  findings: Array<{ title: string; score?: number }>;
  case_n?: number;
  message?: string;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data", "progress.json");
const PUSH = (process.env.PROGRESS_PUSH ?? "off").toLowerCase() === "on";
const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

let cur: Progress = { state: "idle", updated_at: iso(), steps: [], wallets: [], posts: [], findings: [] };
let lastPush = 0;

function git(args: string[], cwd = ROOT): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }).trim();
}

/** The `progress` branch as a worktree at .progress, one file, history rewritten every push. */
function push(force = false): void {
  if (!PUSH) return;
  const now = Date.now();
  if (!force && now - lastPush < 4_000) return; // not more than one push every few seconds
  lastPush = now;
  try {
    const dir = join(ROOT, ".progress");
    if (!existsSync(dir)) {
      git(["worktree", "add", "--detach", dir, "HEAD"]);
      git(["checkout", "--orphan", "progress"], dir);
      git(["rm", "-rfq", "--cached", "."], dir);
      try {
        execFileSync("sh", ["-c", "ls -A | grep -v '^.git$' | xargs rm -rf"], { cwd: dir, stdio: "ignore" });
      } catch {
        /* nothing to clear */
      }
    }
    writeFileSync(join(dir, "progress.json"), JSON.stringify(cur, null, 2) + "\n");
    git(["add", "progress.json"], dir);
    git(["-c", "user.name=C.R.I.M.E.", "-c", "user.email=crime@users.noreply.github.com", "commit", "-q", "--allow-empty", "-m", `progress ${cur.updated_at}`], dir);
    git(["push", "-q", "--force", "origin", "HEAD:progress"], dir);
  } catch (e) {
    process.stderr.write(`progress push failed: ${(e as Error).message.split("\n")[0]}\n`);
  }
}

async function save(force = false): Promise<void> {
  cur.updated_at = iso();
  try {
    mkdirSync(join(ROOT, "data"), { recursive: true });
    writeFileSync(FILE, JSON.stringify(cur, null, 2) + "\n");
  } catch {
    /* the file is a convenience */
  }
  if (usingTurso() || usingRedis()) await writeState("progress", cur).catch(() => {});
  push(force);
}

export const progress = {
  get(): Progress {
    return cur;
  },
  async begin(subject: string, poll?: { id: string; url: string }): Promise<void> {
    cur = { state: "running", subject, poll_id: poll?.id, poll_url: poll?.url, started_at: iso(), budget_minutes: Number(process.env.PERSON_RUN_MINUTES ?? 60), updated_at: iso(), steps: [], wallets: [], posts: [], findings: [] };
    await save(true);
  },
  async step(phase: ProgressStep["phase"], text: string): Promise<void> {
    if (cur.state !== "running") return;
    cur.steps.push({ at: iso(), phase, text });
    if (cur.steps.length > 60) cur.steps.splice(0, cur.steps.length - 60);
    process.stdout.write(`  ${text}\n`);
    await save();
  },
  async wallets(list: Array<{ address: string; tier: string; via?: string; peer?: string }>): Promise<void> {
    if (cur.state !== "running") return;
    cur.wallets = list.slice(0, 40);
    await save();
  },
  async posts(list: Array<{ at: string; text: string; url: string; type?: string }>): Promise<void> {
    if (cur.state !== "running") return;
    cur.posts = list.slice(0, 40).map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ").trim().slice(0, 180) }));
    await save();
  },
  async findings(list: Array<{ title: string; score?: number }>): Promise<void> {
    if (cur.state !== "running") return;
    cur.findings = list.slice(0, 20);
    await save();
  },
  async finish(result: { case_n?: number; message: string }): Promise<void> {
    cur.state = "done";
    cur.case_n = result.case_n;
    cur.message = result.message;
    cur.steps.push({ at: iso(), phase: "file", text: result.message });
    await save(true);
  },
  async fail(message: string): Promise<void> {
    cur.state = "error";
    cur.message = message;
    await save(true);
  },
  async idle(message?: string): Promise<void> {
    cur = { state: "idle", updated_at: iso(), steps: [], wallets: [], posts: [], findings: [], message };
    await save(true);
  },
};
