/**
 * npm run demo — writes a deterministic, fictional archive and renders one
 * card per case. By default into web/tests/fixture (what the smoke tests
 * read), never over the real archive. `--into <dir>` writes elsewhere.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { enforceDeep } from "./policy.js";
import { renderCards } from "./render.js";
import type { Case, CasesFile, Evidence, Finding, Hop, Registry, Severity } from "./types.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const intoArg = process.argv.indexOf("--into");
const ROOT = intoArg > -1 && process.argv[intoArg + 1] ? join(REPO, process.argv[intoArg + 1]) : join(REPO, "web/tests/fixture");

// ---- deterministic prng -------------------------------------------------
let seed = 0x5eed;
const rnd = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return ((seed >>> 0) % 1_000_000) / 1_000_000;
};
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (len: number, prefix = "") => {
  let s = prefix;
  while (s.length < len) s += B58[Math.floor(rnd() * B58.length)];
  return s;
};
const pad = (n: number) => String(n).padStart(4, "0");
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// ---- fictional subjects -------------------------------------------------
const TOKENS = [
  ["GLORP", "Glorp Protocol"], ["WAGMIFY", "Wagmify"], ["SNIFF", "Sniff Finance"],
  ["BONKLET", "Bonklet"], ["YOLOX", "YoloX"], ["RUGGLE", "Ruggle"], ["DUSTCOIN", "Dust"],
  ["PUMPKIN", "Pumpkin Spice"], ["MOONTAX", "Moon Tax"], ["LARPY", "Larpy"],
  ["FOMOTRON", "Fomotron"], ["HODLR", "Hodlr Industries"],
];
const HANDLES = ["@deployer_dan", "@larp_capital", "@sniperbot_ceo", "@wen_moon_wendy", "@bundle_bob", "@kol_kevin", "@rug_rachel"];

const CHARGES: Array<{ charge: string; headline: (t: string, h: string) => string; sev: Severity[]; findings: Finding[] }> = [
  {
    charge: "Pre-funded bundle at launch",
    headline: (t, h) => `${h} funded 14 wallets before $${t} launched. They bought in the same block.`,
    sev: ["high", "critical"],
    findings: [
      { code: "F-01", title: "Fourteen wallets funded from one source", detail: "All fourteen received 2.0 SOL from the same wallet within 90 seconds, twelve minutes before the mint." },
      { code: "F-02", title: "Same-block buys", detail: "All fourteen wallets bought in the launch block. Combined, 38% of supply." },
      { code: "F-03", title: "Coordinated exit", detail: "Sells began nine minutes after launch and completed within four minutes." },
    ],
  },
  {
    charge: "Wash volume",
    headline: (t, h) => `$${t} did 2.1M in volume on its first day. 1.7M of it was ${h} trading with ${h}.`,
    sev: ["medium", "high"],
    findings: [
      { code: "F-01", title: "Circular transfers", detail: "Three wallets passed the same tokens between each other 412 times." },
      { code: "F-02", title: "Volume to holders ratio", detail: "Reported volume was 61x the value held by non-linked wallets." },
    ],
  },
  {
    charge: "Liquidity pulled",
    headline: (t, h) => `Liquidity for $${t} was removed at 03:12. ${h} posted "still here" at 03:40.`,
    sev: ["critical"],
    findings: [
      { code: "F-01", title: "LP tokens never burned", detail: "The deployer kept the LP tokens despite the launch post saying otherwise." },
      { code: "F-02", title: "Removal in one transaction", detail: "All pooled SOL left the pool in a single instruction." },
      { code: "F-03", title: "Proceeds bridged within the hour", detail: "The SOL moved through two hops to a bridge deposit address." },
    ],
  },
  {
    charge: "Shill and sell",
    headline: (t, h) => `${h} called $${t} a "generational entry". ${h} sold the top 22 minutes later.`,
    sev: ["medium", "high"],
    findings: [
      { code: "F-01", title: "Position opened before the post", detail: "The linked wallet bought 4.2% of supply 31 minutes before the post went up." },
      { code: "F-02", title: "Sold into the post", detail: "Sells began at the volume peak that followed the post." },
    ],
  },
  {
    charge: "Dev wallet dump",
    headline: (t, h) => `The $${t} dev allocation was "locked for a year". It moved on day three.`,
    sev: ["high"],
    findings: [
      { code: "F-01", title: "No lock contract", detail: "The allocation sat in a plain wallet. There was never a lock." },
      { code: "F-02", title: "Split and sold", detail: "The allocation went to six wallets, each of which sold over two hours." },
    ],
  },
  {
    charge: "Sniper bot front-run",
    headline: (t, h) => `${h} bought $${t} 400 ms after the pool opened. From the pool creator's funding wallet.`,
    sev: ["low", "medium"],
    findings: [
      { code: "F-01", title: "Funding link", detail: "The sniping wallet was funded by the wallet that funded the pool creator." },
      { code: "F-02", title: "Sub-second entry", detail: "First buy landed in the same slot as the pool initialisation." },
    ],
  },
];

const NOTES = [
  "Funding transfer", "Launch-block buy", "Sell into peak", "LP removal", "Hop to intermediate",
  "Bridge deposit", "Circular transfer", "Pre-post accumulation", "Allocation split",
];

function makeCase(n: number, openedAt: Date, registry: Registry): Case {
  const [symbol, name] = TOKENS[(n - 1) % TOKENS.length];
  const kind = CHARGES[(n - 1) % CHARGES.length];
  const primary = HANDLES[(n * 3) % HANDLES.length];
  const secondary = rnd() > 0.55 ? HANDLES[(n * 5 + 1) % HANDLES.length] : null;
  const subjects = secondary && secondary !== primary ? [primary, secondary] : [primary];
  const severity = pick(kind.sev);
  const mint = b58(44);
  const entry = registry.entries.find((e) => e.handle === primary);
  const knownWallet = entry?.wallets[0]?.address;

  const evidence: Evidence[] = [];
  const count = int(5, 9);
  let t = new Date(openedAt.getTime() - int(2, 30) * 3_600_000);
  for (let i = 0; i < count; i++) {
    t = new Date(t.getTime() + int(20, 900) * 1000);
    const wallet = i === 0 && knownWallet ? knownWallet : b58(44);
    const sol = (int(3, 900) + rnd()).toFixed(2);
    evidence.push({
      kind: i === count - 1 ? "account" : "tx",
      ref: i === count - 1 ? wallet : b58(88),
      wallet,
      amount: `${sol} SOL`,
      at: iso(t),
      note: NOTES[(n + i) % NOTES.length],
    });
  }

  const hops = int(3, 5);
  const trail: Hop[] = [];
  let amount = int(80, 2400);
  for (let i = 0; i < hops; i++) {
    const label = i === 0 ? "deployer" : i === hops - 1 ? pick(["bridge", "cex deposit", "cold"]) : `hop ${i}`;
    trail.push({ label, address: i === 0 && knownWallet ? knownWallet : b58(44), amount: `${amount} SOL` });
    amount = Math.round(amount * (0.86 + rnd() * 0.12));
  }

  const headline = kind.headline(symbol, primary);
  const narrative = [
    `${primary} is on the record for $${symbol} (${name}). The case was opened on ${openedAt.toISOString().slice(0, 10)} after the agent flagged ${kind.charge.toLowerCase()}.`,
    kind.findings.map((f) => f.detail).join(" "),
    `${trail[0].amount} left the first wallet. ${trail[trail.length - 1].amount} arrived at the last one, labelled ${trail[trail.length - 1].label}. Everything in between is in the money trail.`,
    "Convictions: 0.",
  ];

  const score = { low: 20, medium: 45, high: 70, critical: 90 }[severity] + int(0, 9);
  return {
    n,
    id: pad(n),
    opened_at: iso(openedAt),
    status: n <= 2 ? "closed" : "open",
    severity,
    score,
    token: { symbol, name, mint },
    subjects,
    headline,
    charge: kind.charge,
    findings: kind.findings,
    evidence,
    money_trail: trail,
    narrative,
    png: `case-${pad(n)}.png`,
  };
}

async function main() {
  await mkdir(join(ROOT, "fixtures"), { recursive: true });
  const registry = JSON.parse(await readFile(join(ROOT, "fixtures/registry.json"), "utf8")) as Registry;
  const total = 12;
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const cases: Case[] = [];
  for (let n = 1; n <= total; n++) {
    const opened = new Date(now.getTime() - (total - n) * (int(14, 40) * 3_600_000));
    cases.push(makeCase(n, opened, registry));
  }
  const file: CasesFile = enforceDeep({ generated_at: iso(now), agent: "C.R.I.M.E. demo", version: 1, cases });
  await mkdir(join(ROOT, "data"), { recursive: true });
  await mkdir(join(ROOT, "out"), { recursive: true });
  await writeFile(join(ROOT, "data/cases.json"), JSON.stringify(file, null, 2) + "\n");
  process.stdout.write(`wrote ${join(ROOT, "data/cases.json")} (${cases.length} cases)\n`);
  try {
    await renderCards(file.cases, join(ROOT, "out"));
  } catch (err) {
    process.stderr.write(`card render failed: ${(err as Error).message}\nInstall a browser with: npx playwright install chromium\n`);
    process.exitCode = 1;
  }
}

main();
