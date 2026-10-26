/**
 * What the agent looks for, and how sure it is. Every finding is backed by
 * transfers a reader can open. Wording is the persona's: short, dry, no verdicts.
 */
import type { Evidence, Finding, Hop, Severity } from "./types.js";
import type { Holder, Label, Sources, TokenInfo, Transfer } from "./sources/types.js";
import { bondingCurve, isPumpMint, isWallet } from "./sources/pumpfun.js";

/** Exchanges, swap services, bridges and protocols: money passes through them, they coordinate nothing. */
export const isService = (l: Label | null | undefined) => !!l && (l.type === "cex" || l.type === "bridge" || l.type === "protocol" || l.type === "fund");

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
  /** numbers the headline can use */
  dev_sold_share?: number;
  dev_first_sell_min?: number | null;
  dev_buy_share?: number;
}

const MIN = 60_000;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const uniqBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T>();
  for (const x of xs) if (!m.has(key(x))) m.set(key(x), x);
  return [...m.values()];
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmtSol = (n: number) => `${n.toFixed(n >= 100 ? 0 : 2)} SOL`;
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 0)}%`;
const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MIN);
const mins = (n: number) => (n <= 0 ? "under a minute" : `${n} minute${n === 1 ? "" : "s"}`);

export interface Hints {
  deployer?: string;
  created_at?: string;
  launchpad?: string;
}

export async function investigate(mint: string, src: Sources, hints: Hints = {}): Promise<Investigation | null> {
  const log: string[] = [];
  let token: TokenInfo | null = await src.token(mint);
  if (!token) {
    log.push("token not found");
    return null;
  }
  const t0: TokenInfo = token;
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];
  let score = 0;
  let devSoldShare: number | undefined;
  let devFirstSellMin: number | null | undefined;
  let devBuyShare: number | undefined;
  const ev = (t: Transfer, note: string): Evidence => ({ kind: "tx", ref: t.signature, wallet: t.from, amount: t.kind === "sol" ? fmtSol(t.amount) : `${Math.round(t.amount).toLocaleString("en-US")} ${t0.symbol}`, at: t.at, note });

  // ---- launch ---------------------------------------------------------------
  // pump.fun: the bonding curve is derivable from the mint. Its first transaction is the launch,
  // tagged CREATE by Helius, paid by the deployer, with a token transfer curve -> deployer (the dev buy).
  // Elsewhere: the earliest reachable fee payer on the mint, and most of the supply moving into one account.
  let deployer = token.deployer;
  let create: Transfer | undefined;
  let curveFirst: Transfer[] = [];
  if (isPumpMint(mint)) {
    const curve = bondingCurve(mint);
    curveFirst = await src.firstTransfers(curve, 200);
    const first = curveFirst[0];
    if (first) {
      deployer = first.feePayer ?? deployer;
      create = curveFirst.find((t) => t.type === "CREATE" && t.kind === "token" && t.mint === mint && t.from === curve) ?? { ...first, from: curve, to: deployer ?? "", amount: 0, kind: "token", mint };
      token = { ...t0, deployer, created_at: first.at, deployer_approx: false };
    }
  }
  // Any launchpad: the mint's own first transactions. The first fee payer is the deployer. The pool is
  // the program-derived account the token keeps flowing out of in those first swaps.
  if (!create) {
    const mintFirst = await src.firstTransfers(mint, 100);
    const first = mintFirst[0];
    if (first) {
      const approx = mintFirst.complete === false;
      // The feed's deployer wins only when the chain walk did not reach the start.
      deployer = approx && hints.deployer ? hints.deployer : (first.feePayer ?? deployer);
      const tokenTx = mintFirst.filter((t) => t.kind === "token" && t.mint === mint);
      const counts = new Map<string, number>();
      for (const t of tokenTx) for (const a of [t.from, t.to]) if (a && !isWallet(a)) counts.set(a, (counts.get(a) ?? 0) + 1);
      const poolGuess = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (poolGuess) {
        create = tokenTx.find((t) => t.from === poolGuess && t.to === deployer) ?? { ...first, from: poolGuess, to: deployer ?? "", amount: 0, kind: "token", mint };
        curveFirst = mintFirst;
      }
      token = { ...t0, deployer, created_at: first.at, deployer_approx: approx };
      if (approx) log.push("history too deep: the deployer is the earliest reachable fee payer, not necessarily the first");
    }
  }
  if (hints.deployer && deployer && hints.deployer !== deployer) {
    log.push(`deployer on chain ${short(deployer)} differs from the feed's dev wallet ${short(hints.deployer)}${token.deployer_approx ? "; history incomplete, using the feed" : "; keeping the chain"}`);
    if (token.deployer_approx) deployer = hints.deployer;
  }
  const dTx = deployer ? await src.transfers(deployer, 400) : [];
  if (!create) {
    create = dTx
      .filter((t) => t.type === "CREATE" && t.kind === "token" && t.mint === mint && t.feePayer === deployer && t.from && t.from !== deployer)
      .sort((a, b) => a.at.localeCompare(b.at))[0];
  }
  const seed = dTx
    .filter((t) => t.kind === "token" && t.mint === mint && t.to !== deployer && t.amount >= token.supply * 0.2 && (t.from === deployer || t.feePayer === deployer))
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  const pool = create?.from ?? seed?.to ?? null;
  const launch_at = create?.at ?? seed?.at ?? token.created_at;
  log.push(`deployer ${deployer ?? "?"} pool ${pool ?? "?"} launch ${launch_at ?? "?"}${curveFirst.length && isPumpMint(mint) ? " (pump.fun curve)" : create ? " (first transactions)" : ""}`);
  if (create) {
    if (create.amount > 0) evidence.push(ev(create, "Launch, deployer's opening buy"));
    const devShare = create.amount / token.supply;
    devBuyShare = devShare;
    if (devShare >= 0.05) {
      findings.push({ code: "F-01", title: "Deployer bought at creation", detail: `The deployer wallet took ${pct(devShare)} of supply in the launch transaction.` });
      score += 5;
    }
  } else if (seed) evidence.push(ev(seed, "Pool seeded"));

  // The first 200 transactions on the pool, oldest first, and the latest 300.
  const poolFirst = curveFirst.length ? curveFirst : pool ? await src.firstTransfers(pool, 200) : [];
  const poolLate = pool ? await src.transfers(pool, 300) : [];
  const poolTx = uniqBy([...poolFirst, ...poolLate], (t) => `${t.signature}:${t.from}:${t.to}:${t.amount}`);
  const buys = poolTx.filter((t) => t.kind === "token" && t.mint === mint && t.from === pool && t.to !== deployer).sort((a, b) => a.at.localeCompare(b.at));
  const sells = poolTx.filter((t) => t.kind === "token" && t.mint === mint && t.to === pool);

  // ---- bundle: early buyers with a common funder ---------------------------
  let funder: string | null = null;
  let bundle: string[] = [];
  if (launch_at && buys.length) {
    const early = uniq(buys.filter((t) => Date.parse(t.at) - Date.parse(launch_at) <= 90_000).map((t) => t.to)).slice(0, 20);
    const funders = new Map<string, string[]>();
    for (const w of early) {
      const tx = await src.transfers(w, 60);
      const inflow = tx
        .filter((t) => t.kind === "sol" && t.to === w && Date.parse(t.at) <= Date.parse(launch_at) && Date.parse(t.at) >= Date.parse(launch_at) - 86_400_000)
        .sort((a, b) => b.amount - a.amount)[0];
      if (inflow) funders.set(inflow.from, [...(funders.get(inflow.from) ?? []), w]);
    }
    const ranked = [...funders.entries()].sort((a, b) => b[1].length - a[1].length);
    // Many strangers withdraw from the same exchange hot wallet. That is not a bundle.
    const funderLabels = await src.labels(ranked.slice(0, 3).map(([a]) => a));
    for (const [a] of ranked.slice(0, 3)) {
      const l = funderLabels.get(a);
      if (isService(l)) log.push(`funder ${short(a)} is ${l!.entity ?? l!.type}: not treated as a bundle source`);
    }
    const top = ranked.find(([a]) => !isService(funderLabels.get(a)));
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
      score += 20 + Math.min(15, bundle.length) + Math.min(15, Math.round(share * 50));
      for (const w of bundle.slice(0, 5)) {
        const f = (await src.transfers(w, 60)).find((t) => t.kind === "sol" && t.from === funder && t.to === w);
        if (f) evidence.push(ev(f, "Funding transfer"));
      }
      for (const t of bundleBuys.slice(0, 3)) evidence.push(ev(t, "Launch buy"));
      const exits: Transfer[] = [];
      for (const w of bundle) {
        const tx = await src.transfers(w, 60);
        const e = tx.filter((t) => t.kind === "token" && t.mint === mint && t.from === w && t.to !== w && minutes(launch_at, t.at) <= 30).sort((a, b) => a.at.localeCompare(b.at))[0];
        if (e) exits.push(e);
      }
      if (exits.length >= Math.ceil(bundle.length / 2)) {
        exits.sort((a, b) => a.at.localeCompare(b.at));
        const first = exits[0];
        const last = exits[exits.length - 1];
        findings.push({
          code: `F-${String(findings.length + 1).padStart(2, "0")}`,
          title: "Coordinated exit",
          detail:
            minutes(launch_at, first.at) === minutes(launch_at, last.at)
              ? `${exits.length} of the ${bundle.length} wallets sold ${mins(minutes(launch_at, first.at))} after launch.`
              : `${exits.length} of the ${bundle.length} wallets sold between ${minutes(launch_at, first.at)} and ${mins(minutes(launch_at, last.at))} after launch.`,
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
        detail: `${fmtSol(pull.amount)} left the pool to the deployer ${launch_at ? mins(minutes(launch_at, pull.at)) : "some time"} after launch${pull.type === "WITHDRAW_LIQUIDITY" ? " in a liquidity withdrawal" : ""}.`,
      });
      score += 40;
      evidence.push(ev(pull, "Liquidity removal"));
    }
  }

  // ---- deployer sells or distributes ------------------------------------------
  if (deployer) {
    const outflows = dTx.filter((t) => t.kind === "token" && t.mint === mint && t.from === deployer);
    const devSells = outflows.filter((t) => t.type === "SWAP" || t.to === pool);
    const moves = outflows.filter((t) => !devSells.includes(t));
    const sold = sum(devSells.map((t) => t.amount)) / token.supply;
    const moved = sum(moves.map((t) => t.amount)) / token.supply;
    if (sold >= 0.02) {
      const firstSellMin = launch_at && devSells[0] ? minutes(launch_at, devSells.slice().sort((a, b) => a.at.localeCompare(b.at))[0].at) : null;
      devSoldShare = sold;
      devFirstSellMin = firstSellMin;
      findings.push({
        code: `F-${String(findings.length + 1).padStart(2, "0")}`,
        title: "Deployer sold",
        detail: `The deployer wallet sold ${pct(sold)} of supply across ${devSells.length} transaction${devSells.length === 1 ? "" : "s"}${launch_at && devSells[0] ? `, the first ${mins(minutes(launch_at, devSells.sort((a, b) => a.at.localeCompare(b.at))[0].at))} after launch` : ""}.`,
      });
      score += 25 + Math.min(15, Math.round(sold * 100)) + (firstSellMin !== null && firstSellMin <= 60 ? 10 : 0);
      for (const t of devSells.slice(0, 2)) evidence.push(ev(t, "Deployer sell"));
    }
    if (moved >= 0.03) {
      const wallets = uniq(moves.map((t) => t.to));
      findings.push({
        code: `F-${String(findings.length + 1).padStart(2, "0")}`,
        title: "Deployer distributed supply",
        detail: `${pct(moved)} of supply left the deployer wallet to ${wallets.length} other wallet${wallets.length === 1 ? "" : "s"} without a swap.`,
      });
      score += 15;
      for (const t of moves.slice(0, 2)) evidence.push(ev(t, "Deployer transfer out"));
    }
  }

  // ---- concentration ------------------------------------------------------
  // Pools, vaults and curves are program-derived addresses; only on-curve keys count as holders.
  const holders: Holder[] = await src.holders(mint, 20).catch(() => []);
  const top = holders.filter((h) => h.address !== pool && h.address !== deployer && isWallet(h.address)).slice(0, 10);
  const conc = sum(top.map((h) => h.share));
  if (conc >= 0.4) {
    findings.push({
      code: `F-${String(findings.length + 1).padStart(2, "0")}`,
      title: "Supply concentrated",
      detail: `The ten largest wallets outside the pool and the deployer hold ${pct(conc)} of supply.`,
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
  const trailLabels = new Map<string, Label>();
  if (start && launch_at) {
    let cur = start;
    const seen = new Set([cur]);
    for (let i = 0; i < 6; i++) {
      const l = (await src.labels([cur])).get(cur);
      if (l) trailLabels.set(cur, l);
      if (i > 0 && isService(l)) {
        // The money reached an exchange, bridge or protocol. The trail ends here, by name.
        trail.push({ label: `${l!.type}${l!.entity ? ` · ${l!.entity}` : ""}`, address: cur, amount: "" });
        break;
      }
      const tx = i === 0 && funder ? await src.transfers(funder, 200) : await src.transfers(cur, 100);
      const out = tx
        .filter((t) => t.kind === "sol" && t.from === cur && !seen.has(t.to) && t.to !== pool && Date.parse(t.at) >= Date.parse(launch_at))
        .sort((a, b) => b.amount - a.amount)[0];
      trail.push({ label: i === 0 ? (funder ? "funder" : "deployer") : `hop ${i}`, address: cur, amount: out ? fmtSol(out.amount) : "" });
      if (!out) break;
      evidence.push(ev(out, i === 0 ? "Proceeds leave" : "Hop"));
      cur = out.to;
      seen.add(cur);
      if (i === 5) trail.push({ label: "hop 6", address: cur, amount: "" });
    }
    if (trail.length && trail[trail.length - 1].address !== cur) trail.push({ label: "end", address: cur, amount: "" });
  }

  // ---- labels for every wallet we mention ---------------------------------
  const addrs = uniq([...trail.map((h) => h.address), ...evidence.map((e) => e.wallet ?? ""), deployer ?? "", funder ?? ""].filter(Boolean));
  const labels = await src.labels(addrs);
  for (const [k, v] of trailLabels) labels.set(k, v);

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
  evidence.sort((a, b) => a.at.localeCompare(b.at));
  return { token, launch_at, pool, deployer, funder, bundle, findings, evidence: evidence.slice(0, 40), trail, score: Math.min(99, score), severity, charge, labels, principals, log, dev_sold_share: devSoldShare, dev_first_sell_min: devFirstSellMin, dev_buy_share: devBuyShare };
}

export const short = (a: string, n = 4) => (a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
