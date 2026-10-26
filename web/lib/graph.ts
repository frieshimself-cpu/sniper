/**
 * The wallet graph of a case: nodes for wallets, pools, handles and services; edges for the money.
 * Built from evidence and the money trail the agent already records. No new data, just the shape.
 */
import type { Case } from "./types";
import { handleForWallet, isHiddenLabel } from "./data";

export type NodeKind = "deployer" | "funder" | "pool" | "wallet" | "service" | "handle" | "hidden";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string; // short address or handle or service name
  sub?: string; // e.g. "deployer", "cex · Binance"
  address?: string;
  handle?: string;
  weight: number; // how much flowed through, for sizing
}

export interface GraphEdge {
  from: string;
  to: string;
  amount: string;
  kind: "sol" | "token";
  note: string;
  at: string;
  ref?: string; // tx signature
}

export interface CaseGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const short = (a: string) => (a.length > 9 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const num = (s?: string) => (s ? Number(s.replace(/[^0-9.]/g, "")) || 0 : 0);

export function caseGraph(c: Case): CaseGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const roles = new Map<string, string>();
  for (const h of c.money_trail) if (!roles.has(h.address)) roles.set(h.address, h.label);

  const node = (address: string, hint?: string): string => {
    if (isHiddenLabel(address)) {
      if (!nodes.has("hidden")) nodes.set("hidden", { id: "hidden", kind: "hidden", label: "hidden", sub: "disputed", weight: 1 });
      return "hidden";
    }
    const id = address;
    if (!nodes.has(id)) {
      const role = roles.get(address) ?? hint ?? "";
      const rec = handleForWallet(address);
      let kind: NodeKind = "wallet";
      if (/^(cex|bridge|protocol|fund)/.test(role)) kind = "service";
      else if (role === "deployer") kind = "deployer";
      else if (role === "funder") kind = "funder";
      else if (/pool|curve/.test(role)) kind = "pool";
      nodes.set(id, {
        id,
        kind: rec ? "handle" : kind,
        label: rec ? rec.handle : kind === "service" ? role.replace(/^[a-z]+ · /, "") : short(address),
        sub: rec ? role || "on the record" : kind === "service" ? role.split(" · ")[0] : role || undefined,
        address,
        handle: rec?.handle,
        weight: 1,
      });
    }
    return id;
  };

  // the trail: hop to hop
  for (let i = 0; i < c.money_trail.length - 1; i++) {
    const a = c.money_trail[i];
    const b = c.money_trail[i + 1];
    const from = node(a.address);
    const to = node(b.address);
    edges.push({ from, to, amount: a.amount, kind: "sol", note: i === 0 ? "proceeds leave" : `hop ${i}`, at: "" });
    nodes.get(from)!.weight += num(a.amount);
    nodes.get(to)!.weight += num(a.amount);
  }
  // evidence: funding, buys, sells. The pool is the counterparty of the launch row (the curve or the AMM).
  const pool = c.money_trail.find((h) => /pool|curve/.test(h.label))?.address ?? c.evidence.find((e) => /^launch/i.test(e.note) && e.wallet && !isHiddenLabel(e.wallet))?.wallet;
  if (pool && !roles.has(pool)) roles.set(pool, "pool");
  for (const e of c.evidence) {
    if (e.kind !== "tx" || !e.wallet) continue;
    const w = node(e.wallet);
    const n = /funding/i.test(e.note) ? "funding" : /buy|launch/i.test(e.note) ? "buy" : /sell/i.test(e.note) ? "sell" : /hop|proceeds/i.test(e.note) ? "" : e.note.toLowerCase();
    if (!n) continue;
    // buys and sells touch the pool; funding touches the funder. Without a known counterparty we draw to a pool node.
    const poolId = pool ? node(pool, "pool") : node("pool", "pool");
    if (!pool && !nodes.get("pool")) nodes.set("pool", { id: "pool", kind: "pool", label: `$${c.token.symbol} pool`, sub: "pool", weight: 1 });
    if (w === poolId) continue; // the launch row itself: pool -> deployer is drawn by the deployer's buy below
    if (n === "buy") edges.push({ from: poolId, to: w, amount: e.amount ?? "", kind: "token", note: e.note, at: e.at, ref: e.ref });
    else if (n === "sell") edges.push({ from: w, to: poolId, amount: e.amount ?? "", kind: "token", note: e.note, at: e.at, ref: e.ref });
    else if (n === "funding") {
      const funder = c.money_trail.find((h) => h.label === "funder")?.address;
      if (funder) edges.push({ from: node(funder), to: w, amount: e.amount ?? "", kind: "sol", note: e.note, at: e.at, ref: e.ref });
    }
    nodes.get(w)!.weight += num(e.amount) > 1000 ? 1 : num(e.amount);
  }
  if (nodes.has("pool") && !pool) nodes.get("pool")!.label = `$${c.token.symbol} pool`;
  if (pool && nodes.get(pool)) Object.assign(nodes.get(pool)!, { kind: nodes.get(pool)!.kind === "handle" ? "handle" : "pool", label: `$${c.token.symbol} pool`, sub: "pool" });
  return { nodes: [...nodes.values()], edges: mergeParallel(edges) };
}

/** Several transfers between the same two nodes become one edge: "3 sells · 1,476,739 GATO". */
function mergeParallel(edges: GraphEdge[]): GraphEdge[] {
  const groups = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const k = `${e.from}>${e.to}:${e.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0];
    const total = g.reduce((a, e) => a + num(e.amount), 0);
    const unit = (g[0].amount.match(/[A-Za-z$][\w$]*$/) ?? [""])[0];
    const what = /sell/i.test(g[0].note) ? "sells" : /buy/i.test(g[0].note) ? "buys" : /fund/i.test(g[0].note) ? "transfers" : "transfers";
    return { ...g[0], amount: `${g.length} ${what} · ${Math.round(total).toLocaleString("en-US")} ${unit}`.trim(), note: `${g.length} ${what}` };
  });
}
