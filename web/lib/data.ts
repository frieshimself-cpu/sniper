/**
 * The one module that reads the agent's data:
 *   ../data/cases.json      the case archive
 *   ../out/*.png            one card per case
 *   ../fixtures/registry.json   handles and wallets on the record
 *
 * Everything returned from here has been through enforce(). Disputed wallets
 * are removed before anything leaves this module.
 */
import fs from "node:fs";
import path from "node:path";
import { enforce, enforceDeep, normalizeHandle } from "./policy";
import { hiddenWallets } from "./store";
import type { Case, CasesFile, Registry, RegistryEntry, RegistryWallet, Severity } from "./types";
import { SEVERITIES } from "./types";

export const AGENT_ROOT = path.resolve(process.cwd(), "..");
const CASES_PATH = path.join(AGENT_ROOT, "data", "cases.json");
const REGISTRY_PATH = path.join(AGENT_ROOT, "fixtures", "registry.json");
const OUT_DIR = path.join(AGENT_ROOT, "out");

const HIDDEN = "hidden";

// ---- cached file reads (re-read when mtime changes) ----------------------
function cached<T>(file: string, fallback: T): () => T {
  let mtime = -1;
  let value: T = fallback;
  return () => {
    try {
      const m = fs.statSync(file).mtimeMs;
      if (m !== mtime) {
        value = JSON.parse(fs.readFileSync(file, "utf8")) as T;
        mtime = m;
      }
    } catch {
      value = fallback;
      mtime = -1;
    }
    return value;
  };
}

const readCases = cached<CasesFile>(CASES_PATH, { generated_at: "", agent: "", version: 0, cases: [] });
const readRegistry = cached<Registry>(REGISTRY_PATH, { updated_at: "", entries: [] });

// ---- wallets ------------------------------------------------------------
function hideWallet(address: string | undefined, hidden: Set<string>): string | undefined {
  if (!address) return address;
  return hidden.has(address) ? HIDDEN : address;
}

export function isHiddenLabel(address: string | undefined): boolean {
  return address === HIDDEN;
}

function scrubCase(c: Case, hidden: Set<string>): Case {
  const out: Case = {
    ...c,
    subjects: c.subjects.map(normalizeHandle),
    evidence: c.evidence.map((e) => ({
      ...e,
      wallet: hideWallet(e.wallet, hidden),
      ref: e.kind === "account" ? (hideWallet(e.ref, hidden) as string) : e.ref,
    })),
    money_trail: c.money_trail.map((h) => ({ ...h, address: hideWallet(h.address, hidden) as string })),
  };
  return enforceDeep(out);
}

// ---- cases --------------------------------------------------------------
export function getCases(): Case[] {
  const hidden = hiddenWallets();
  return readCases()
    .cases.map((c) => scrubCase(c, hidden))
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at) || b.n - a.n);
}

export function getCase(n: number): Case | null {
  const raw = readCases().cases.find((c) => c.n === n);
  return raw ? scrubCase(raw, hiddenWallets()) : null;
}

export function latestCases(limit = 6): Case[] {
  return getCases().slice(0, limit);
}

export interface CaseQuery {
  q?: string;
  severity?: string;
}

export function searchCases({ q, severity }: CaseQuery): Case[] {
  const needle = (q ?? "").trim().toLowerCase();
  const sev = SEVERITIES.includes(severity as Severity) ? (severity as Severity) : null;
  return getCases().filter((c) => {
    if (sev && c.severity !== sev) return false;
    if (!needle) return true;
    if (needle.startsWith("$")) return c.token.symbol.toLowerCase() === needle.slice(1) || c.token.symbol.toLowerCase().startsWith(needle.slice(1));
    if (needle.startsWith("@")) return c.subjects.some((s) => s.toLowerCase().startsWith(needle));
    const mint = c.token.mint.toLowerCase();
    return (
      mint === needle ||
      mint.startsWith(needle) ||
      c.token.symbol.toLowerCase().includes(needle) ||
      c.token.name.toLowerCase().includes(needle) ||
      c.subjects.some((s) => s.includes(needle)) ||
      c.headline.toLowerCase().includes(needle) ||
      c.id === needle.replace(/^#/, "").padStart(4, "0")
    );
  });
}

// ---- cards --------------------------------------------------------------
export function cardPath(n: number): string | null {
  const c = readCases().cases.find((x) => x.n === n);
  if (!c) return null;
  const file = path.join(OUT_DIR, path.basename(c.png));
  return fs.existsSync(file) ? file : null;
}

export function cardUrl(n: number): string {
  return `/cases/${n}/card.png`;
}

// ---- registry / persons -------------------------------------------------
export interface WalletOnRecord extends RegistryWallet {
  handle: string;
}

/** Wallets that may be shown next to a handle: in the registry, with a source, not disputed. */
export function walletsFor(handle: string): WalletOnRecord[] {
  const h = normalizeHandle(handle);
  const hidden = hiddenWallets();
  const entry = readRegistry().entries.find((e) => normalizeHandle(e.handle) === h);
  if (!entry) return [];
  return entry.wallets
    .filter((w) => w.source && /^https?:\/\//.test(w.source) && !hidden.has(w.address))
    .map((w) => enforceDeep({ ...w, handle: h }));
}

/** The handle a wallet is attributed to, if the registry allows it. */
export function handleForWallet(address: string): WalletOnRecord | null {
  if (!address || hiddenWallets().has(address)) return null;
  for (const e of readRegistry().entries) {
    const w = e.wallets.find((x) => x.address === address && x.source && /^https?:\/\//.test(x.source));
    if (w) return enforceDeep({ ...w, handle: normalizeHandle(e.handle) });
  }
  return null;
}

/** True if the registry has any record of this wallet (hidden or not). Used by /api/dispute. */
export function walletOnRecord(address: string): boolean {
  if (readRegistry().entries.some((e) => e.wallets.some((w) => w.address === address))) return true;
  return readCases().cases.some(
    (c) => c.evidence.some((e) => e.wallet === address || e.ref === address) || c.money_trail.some((h) => h.address === address),
  );
}

export interface PersonSummary {
  handle: string;
  note: string;
  cases: number;
  findings: number;
  topSeverity: Severity | null;
  wallets: number;
  lastSeen: string | null;
}

export interface PersonDossier extends PersonSummary {
  walletsOnRecord: WalletOnRecord[];
  tokens: Array<{ symbol: string; name: string; mint: string; caseN: number; caseId: string; severity: Severity; opened_at: string }>;
  caseList: Case[];
}

const sevRank = (s: Severity) => SEVERITIES.indexOf(s);

export function getPersons(): PersonSummary[] {
  const cases = getCases();
  const handles = new Map<string, RegistryEntry | null>();
  for (const e of readRegistry().entries) handles.set(normalizeHandle(e.handle), e);
  for (const c of cases) for (const s of c.subjects) if (!handles.has(s)) handles.set(s, null);

  return [...handles.entries()]
    .map(([handle, entry]) => {
      const mine = cases.filter((c) => c.subjects.includes(handle));
      const top = mine.reduce<Severity | null>((acc, c) => (!acc || sevRank(c.severity) > sevRank(acc) ? c.severity : acc), null);
      return {
        handle,
        note: enforce(entry?.note ?? ""),
        cases: mine.length,
        findings: mine.reduce((n, c) => n + c.findings.length, 0),
        topSeverity: top,
        wallets: walletsFor(handle).length,
        lastSeen: mine[0]?.opened_at ?? null,
      };
    })
    .sort((a, b) => b.cases - a.cases || a.handle.localeCompare(b.handle));
}

export function getPerson(handle: string): PersonDossier | null {
  const h = normalizeHandle(handle);
  const summary = getPersons().find((p) => p.handle === h);
  if (!summary) return null;
  const caseList = getCases().filter((c) => c.subjects.includes(h));
  return {
    ...summary,
    walletsOnRecord: walletsFor(h),
    tokens: caseList.map((c) => ({
      symbol: c.token.symbol,
      name: c.token.name,
      mint: c.token.mint,
      caseN: c.n,
      caseId: c.id,
      severity: c.severity,
      opened_at: c.opened_at,
    })),
    caseList,
  };
}

// ---- stats --------------------------------------------------------------
export interface Stats {
  cases_opened: number;
  crimes_found: number;
  convictions: 0;
  open_cases: number;
  persons_on_record: number;
  last_case_at: string | null;
  generated_at: string;
  agent: string;
}

export function getStats(): Stats {
  const file = readCases();
  const cases = file.cases;
  return {
    cases_opened: cases.length,
    crimes_found: cases.reduce((n, c) => n + c.findings.length, 0),
    convictions: 0,
    open_cases: cases.filter((c) => c.status === "open").length,
    persons_on_record: getPersons().length,
    last_case_at: cases.map((c) => c.opened_at).sort().at(-1) ?? null,
    generated_at: enforce(file.generated_at),
    agent: enforce(file.agent),
  };
}

/** Subjects the admin may put on a ballot: tokens over threshold and registry handles. */
export interface EligibleSubject {
  key: string;
  kind: "token" | "handle";
  label: string;
  ref: string;
  score: number;
}

export function eligibleSubjects(threshold: number): EligibleSubject[] {
  const tokens = new Map<string, EligibleSubject>();
  for (const c of getCases()) {
    if (c.score < threshold) continue;
    const key = `token:${c.token.mint}`;
    const prev = tokens.get(key);
    if (!prev || prev.score < c.score) {
      tokens.set(key, { key, kind: "token", label: `$${c.token.symbol}`, ref: c.token.mint, score: c.score });
    }
  }
  const handles: EligibleSubject[] = readRegistry().entries.map((e) => {
    const h = normalizeHandle(e.handle);
    return { key: `handle:${h}`, kind: "handle", label: h, ref: h, score: 0 };
  });
  return enforceDeep([...tokens.values(), ...handles]);
}
