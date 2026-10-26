/**
 * The board. Anyone with a wallet can nominate a handle; one nomination per wallet per handle per day.
 * The most nominated handles go on the hour's ballot.
 */
import { readState, updateState } from "@agent/state";
import { normalizeHandle } from "./policy";

export interface Nomination {
  handle: string;
  wallet: string;
  at: string;
  note?: string;
}

export interface BoardEntry {
  handle: string;
  nominations: number;
  last: string;
  note?: string;
}

const DAY = 86_400_000;

export async function nominate(handle: string, wallet: string, note?: string): Promise<{ ok: true; entry: BoardEntry } | { ok: false; status: number; error: string }> {
  const h = normalizeHandle(handle);
  if (h.length < 3 || h.length > 17) return { ok: false, status: 400, error: "Not a handle." };
  let result: { ok: true; entry: BoardEntry } | { ok: false; status: number; error: string } = { ok: false, status: 500, error: "No." };
  await updateState<Nomination[]>("nominations", [], (all) => {
    const cutoff = Date.now() - DAY;
    if (all.some((n) => n.handle === h && n.wallet === wallet && Date.parse(n.at) >= cutoff)) {
      result = { ok: false, status: 409, error: "One nomination per wallet per handle per day." };
      return all;
    }
    all.push({ handle: h, wallet, at: new Date().toISOString(), note: note?.slice(0, 140) });
    const kept = all.filter((n) => Date.parse(n.at) >= Date.now() - 30 * DAY).slice(-5000);
    result = { ok: true, entry: board(kept).find((e) => e.handle === h)! };
    return kept;
  });
  return result;
}

export function board(all: Nomination[], days = 7): BoardEntry[] {
  const cutoff = Date.now() - days * DAY;
  const m = new Map<string, BoardEntry>();
  for (const n of all) {
    if (Date.parse(n.at) < cutoff) continue;
    const e = m.get(n.handle) ?? { handle: n.handle, nominations: 0, last: n.at };
    e.nominations++;
    if (n.at > e.last) e.last = n.at;
    if (n.note && !e.note) e.note = n.note;
    m.set(n.handle, e);
  }
  return [...m.values()].sort((a, b) => b.nominations - a.nominations || b.last.localeCompare(a.last));
}

export async function getBoard(days = 7): Promise<BoardEntry[]> {
  return board(await readState<Nomination[]>("nominations", []), days);
}
