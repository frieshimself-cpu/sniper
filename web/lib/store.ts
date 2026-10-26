/**
 * Site state that is not the agent's: disputes and attribution leads.
 * Lives in Redis (Upstash) when configured, else JSON files. See ../src/state.ts.
 */
import { readState, updateState } from "@agent/state";

export interface Dispute {
  wallet: string;
  at: string;
  status: "open" | "removed" | "kept";
  reviewed_at?: string;
}

export interface Lead {
  id: string;
  created_at: string;
  case_n: number | null;
  handle: string;
  address: string;
  tier: "probable" | "claimed";
  source: string;
  reason: string;
  status: "open" | "approved" | "rejected";
  applied?: boolean;
}

// ---- disputes -----------------------------------------------------------
let hidden = new Set<string>();

/** Disputed wallets. Refreshed by primeHidden() at the start of every request. */
export function hiddenWallets(): Set<string> {
  return hidden;
}

export async function primeHidden(): Promise<void> {
  const d = await readState<Dispute[]>("disputes", []);
  hidden = new Set(d.map((x) => x.wallet));
}

export async function getDisputes(): Promise<Dispute[]> {
  return (await readState<Dispute[]>("disputes", [])).slice().sort((a, b) => b.at.localeCompare(a.at));
}

export async function addDispute(wallet: string): Promise<Dispute> {
  let out: Dispute | undefined;
  await updateState<Dispute[]>("disputes", [], (all) => {
    out = all.find((d) => d.wallet === wallet);
    if (!out) {
      out = { wallet, at: new Date().toISOString(), status: "open" };
      all.push(out);
    }
    return all;
  });
  hidden.add(wallet);
  return out!;
}

export async function reviewDispute(wallet: string, status: "removed" | "kept"): Promise<Dispute | null> {
  let out: Dispute | null = null;
  await updateState<Dispute[]>("disputes", [], (all) => {
    const d = all.find((x) => x.wallet === wallet);
    if (d) {
      d.status = status;
      d.reviewed_at = new Date().toISOString();
      out = d;
    }
    return all;
  });
  return out;
}

// ---- leads --------------------------------------------------------------
export async function getLeads(): Promise<Lead[]> {
  return (await readState<Lead[]>("leads", [])).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Approve or reject. An approved lead reaches the registry on the agent's next run. */
export async function reviewLead(id: string, status: "approved" | "rejected"): Promise<Lead | null> {
  let out: Lead | null = null;
  await updateState<Lead[]>("leads", [], (all) => {
    const l = all.find((x) => x.id === id && x.status === "open");
    if (l) {
      l.status = status;
      out = l;
    }
    return all;
  });
  return out;
}
