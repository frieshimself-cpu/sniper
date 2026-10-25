/**
 * What the agent looks for, and how sure it is. Every finding is backed by
 * transfers a reader can open. Wording is the persona's: short, dry, no verdicts.
 */
import type { Evidence, Finding, Hop, Severity } from "./types.js";
import type { Holder, Label, Sources, TokenInfo, Transfer } from "./sources/types.js";

export interface Investigation {
  token: TokenInfo;
  launch_at: string | null;
  pool: string | null;
  deployer: string | null;
  funder: string | null; // common funder of the bundle, if any
  bundle: string[];
  findings: Finding[];
  evidence: Evidence[];
  trail: Hop[];
  score: number;
  severity: Severity;
  charge: string;
  labels: Map<string, Label>;
  /** wallets whose identity matters for the headline: deployer, funder */
  principals: string[];
  log: string[];
}

const MIN = 60_000;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmtSol = (n: number) => `${n.toFixed(n >= 100 ? 0 : 2)} SOL`;
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 0)}%`;
const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MIN);

export async function investigate(mint: string, src: Sources): Promise<Investigation | null> {
  const log: string[] = [];
  const token = await src.token(mint);
  if (!token) {
    log.push("token not found");
    return null;
  }
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];
  let score = 0;
  const ev = (t: Transfer, note: string): Evidence => ({ kind: "tx", ref: t.signature, wallet: t.from, amount: t.kind === "sol" ? fmtSol(t.amount) : `${Math.round(t.amount).toLocaleString("en-US")} ${token.symbol}`, at: t.at, note });

  // ---- launch: deployer seeds a pool with most of the supply --------------
  const deployer = token.deployer;
  const dTx = deployer ? await src.transfers(deployer, 400) : [];
  const seed = dTx
    .filter((t) => t.kind === "token" && t.mint === mint && t.from === deployer && t.amount >= token.supply * 0.2)
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  const pool = seed?.to ?? null;
  const launch_at = seed?.at ?? token.created_at;
  log.push(`deployer ${deployer ?? "?"} pool ${pool ?? "?"} launch ${launch_at ?? "?"}`);
  if (seed) evidence.push(ev(seed, "Pool seeded"));

  const poolTx = pool ? await src.transfers(pool, 600) : [];
  const buys = poolTx.filter((t) => t.kind === "token" && t.mint === mint && t.from === pool).sort((a, b) => a.at.localeCompare(b.at));
  const sells = poolTx.filter((t) => t.kind === "token" && t.mint === mint && t.to === pool);

  // ---- bundle: early buyers with a common funder ---------------------------
  let funder: string | null = null;
  let bundle: string[] = [];
  if (launch_at && buys.length) {
    const early = uniq(buys.filter((t) => Date.parse(t.at) - Date.parse(launch_at) <= 90_000).map((t) => t.to)).slice(0, 25);
    const funders = new Map<string, string[]>();
    for (const w of early) {
      const tx = await src.transfers(w, 60);
      const inflow = tx
        .filter((t) => t.kind === "sol" && t.to === w && Date.parse(t.at) <= Date.parse(launch_at) && Date.parse(t.at) >= Date.parse(launch_at) - 86_400_000)
        .sort((a, b) => b.amount - a.amount)[0];
      if (inflow) funders.set(inflow.from, [...(funders.get(inflow.from) ?? []), w]);
    }
    const [top] = [...funders.entries()].sort((a, b) => b[1].length - a[1].length);
    if (top && top[1].length >= 3) {
      funder = top[0];
      bundle = top[1];
      const bundleBuys = buys.filter((t) => bundle.includes(t.to));
      const share = sum(bundleBuys.map((t) => t.amount)) / token.supply;
      const sameSlot = uniq(bundleBuys.map((t) => t.at)).length === 1;
      findings.push({
        code: `F-${String(findings.length + 1).padStart(2, "0")}`,
        title: `${bundle.length} early wallets funded from one source`,
        detail: `${bundle.length} of the first buyers received SOL from ${short(funder)} in the 24 hours before launch. ${sameSlot ? "They bought in the same slot." : "They bought within 90 seconds of launch."} Combined, ${pct(share)} of supply.`,
      });
      score += 35 + Math.min(15, Math.round(share * 50));
      for (const w of bundle.slice(0, 5)) {
        const f = (await src.transfers(w, 60)).find((t) => t.kind === "sol" && t.from === funder && t.to === w);
        if (f) evidence.push(ev(f, "Funding transfer"));
      }
      for (const t of bundleBuys.slice(0, 3)) evidence.push(ev(t, "Launch buy"));
      const exits = sells.filter((t) => bundle.includes(t.from) && minutes(launch_at, t.at) <= 30);
      if (exits.length >= Math.ceil(bundle.length / 2)) {
        const first = exits.sort((a, b) => a.at.localeCompare(b.at))[0];
        const last = exits[exits.length - 1];
        findings.push({
          code: `F-${String(findings.length + 1).padStart(2, "0")}`,
          title: "Coordinated exit",
          detail: `${exits.length} of the ${bundle.length} wallets sold between ${minutes(launch_at, first.at)} and ${minutes(launch_at, last.at)} minutes after launch.`,
        });
        score += 15;
        for (const t of exits.slice(0, 3)) evidence.push(ev(t, "Sell into launch volume"));
      }
      const funderTx = await src.transfers(funder, 200);
      if (deployer && funderTx.some((t) => t.kind === "sol" && t.from === funder && t.to === deployer)) {
        const t = funderTx.find((x) => x.kind === "sol" && x.from === funder && x.to === deployer)!;
        findings.push({
          code: `F-${String(findings.length + 1).padStart(2, "0")}`,
          title: "Funder also funded the deployer",
          detail: `${short(funder)} sent ${fmtSol(t.amount)} to the deployer wallet before launch. The bundle and the launch share a source of funds.`,
        });
        score += 15;
        evidence.push(ev(t, "Deployer funding"));
      }
    }
  }

  // ---- liquidity pulled ---------------------------------------------------
  if (pool && deployer) {
    const pull = poolTx.find((t) => t.kind === "sol" && t.from === pool && t.to === deployer && (t.type === "WITHDRAW_LIQUIDITY" || t.amount >= 10));
    if (pull) {
      findings.push({
        code: `F-${String(findings.length + 1).padStart(2, "0")}`,
        title: "Liquidity removed",
        detail: `${fmtSol(pull.amount)} left the pool to the deployer ${launch_at ? `${minutes(launch_at, pull.at)} minutes` : "some time"} after launch${pull.type === "WITHDRAW_LIQUIDITY" ? " in a liquidity withdrawal" : ""}.`,
      });
      score += 40;
      evidence.push(ev(pull, "Liquidity removal"));
    }
  }

  // ---- deployer sells -----------------------------------------------------
  if (deployer) {
    const devSells = sells.filter((t) => t.from === deployer);
    const sold = sum(devSells.map((t) => t.amount)) / token.supply;
    if (sold >= 0.03) {
      findings.push({
        code: `F-${String(findings.length + 1).padStart(2, "0")}`,
        title: "Deployer sold",
        detail: `The deployer wallet sold ${pct(sold)} of supply into the pool across ${devSells.length} transactions.`,
      });
      score += 25;
      for (const t of devSells.slice(0, 2)) evidence.push(ev(t, "Deployer sell"));
    }
  }

  // ---- concentration ------------------------------------------------------
  const holders: Holder[] = await src.holders(mint, 20).catch(() => []);
  const top = holders.filter((h) => h.address !== pool).slice(0, 10);
  const conc = sum(top.map((h) => h.share));
  if (conc >= 0.4) {
    findings.push({
      code: `F-${String(findings.length + 1).padStart(2, "0")}`,
      title: "Supply concentrated",
      detail: `The top ten non-pool holders hold ${pct(conc)} of supply.`,
    });
    score += 10;
    if (top[0]) evidence.push({ kind: "account", ref: top[0].address, wallet: top[0].address, amount: `${pct(top[0].share)} of supply`, at: new Date().toISOString(), note: "Largest holder" });
  }

  if (!findings.length) {
    log.push("no findings");
    return { token, launch_at, pool, deployer, funder, bundle, findings, evidence, trail: [], score, severity: "low", charge: "", labels: new Map(), principals: [], log };
  }

  // ---- money trail --------------------------------------------------------
  const start = funder ?? deployer;
  const trail: Hop[] = [];
  if (start && launch_at) {
    let cur = start;
    const seen = new Set([cur]);
    for (let i = 0; i < 5; i++) {
      const tx = i === 0 && funder ? await src.transfers(funder, 200) : await src.transfers(cur, 100);
      const out = tx
        .filter((t) => t.kind === "sol" && t.from === cur && !seen.has(t.to) && t.to !== pool && Date.parse(t.at) >= Date.parse(launch_at))
        .sort((a, b) => b.amount - a.amount)[0];
      trail.push({ label: i === 0 ? (funder ? "funder" : "deployer") : `hop ${i}`, address: cur, amount: out ? fmtSol(out.amount) : "—" });
      if (!out) break;
      evidence.push(ev(out, i === 0 ? "Proceeds leave" : "Hop"));
      cur = out.to;
      seen.add(cur);
      if (i === 4) trail.push({ label: "hop 5", address: cur, amount: "" });
    }
    if (trail.length && trail[trail.length - 1].address !== cur) trail.push({ label: "end", address: cur, amount: "" });
  }

  // ---- labels for every wallet we mention ---------------------------------
  const addrs = uniq([...trail.map((h) => h.address), ...evidence.map((e) => e.wallet ?? ""), deployer ?? "", funder ?? ""].filter(Boolean));
  const labels = await src.labels(addrs);
  for (const h of trail) {
    const l = labels.get(h.address);
    if (l?.type === "cex" || l?.type === "bridge") h.label = `${l.type}${l.entity ? ` · ${l.entity}` : ""}`;
  }

  const severity: Severity = score >= 85 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  const charge = findings[0].title.replace(/^\d+ /, "").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  // Who to try to put a handle on: deployer, funder, and the trail's wallets that are not a service.
  const principals = uniq([
    deployer ?? "",
    funder ?? "",
    ...trail.map((h) => h.address).filter((a) => {
      const l = labels.get(a);
      return a !== pool && l?.type !== "cex" && l?.type !== "bridge" && l?.type !== "protocol";
    }),
  ].filter(Boolean)).slice(0, 6);
  return { token, launch_at, pool, deployer, funder, bundle, findings, evidence: evidence.slice(0, 40), trail, score: Math.min(99, score), severity, charge, labels, principals, log };
}

export const short = (a: string, n = 4) => (a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
