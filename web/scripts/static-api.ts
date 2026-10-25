/**
 * The API as files, for the static export. Mirrors the route handlers:
 *   /api/stats.json  /api/cases.json  /api/cases/<n>.json  /api/persons/<handle>.json  /api/ballot.json
 *   /cases/<n>/card.png  /cases/<n>/evidence.csv
 */
import fs from "node:fs";
import path from "node:path";
import { getCases, getCase, getPersons, getPerson, getStats, cardPath } from "../lib/data";
import { ensureTodayBallot } from "../lib/ballot";
import { getBallots, tally } from "../lib/store";
import { enforceDeep } from "../lib/policy";
import { atomFeed } from "../lib/feed";

const OUT = path.join(process.cwd(), "out");
const BASE = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
const withBase = (p: string) => `${BASE}${p}`;

function write(rel: string, data: unknown) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(enforceDeep(data)));
}

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

let n = 0;
write("api/stats.json", getStats());
write(
  "api/cases.json",
  {
    count: getCases().length,
    cases: getCases().map((c) => ({
      n: c.n, id: c.id, opened_at: c.opened_at, status: c.status, severity: c.severity, score: c.score, token: c.token, subjects: c.subjects,
      headline: c.headline, charge: c.charge, findings: c.findings.length, url: withBase(`/cases/${c.n}`), card: withBase(`/cases/${c.n}/card.png`),
    })),
  },
);
for (const c of getCases()) {
  const full = getCase(c.n)!;
  write(`api/cases/${c.n}.json`, { ...full, url: withBase(`/cases/${c.n}`), card: withBase(`/cases/${c.n}/card.png`), csv: withBase(`/cases/${c.n}/evidence.csv`) });
  const png = cardPath(c.n);
  if (png) write(`cases/${c.n}/card.png`, fs.readFileSync(png));
  const rows = [
    ["case", "n", "at", "kind", "ref", "wallet", "amount", "note", "explorer"],
    ...full.evidence.map((e, i) => [full.id, i + 1, e.at, e.kind, e.ref, e.wallet ?? "", e.amount ?? "", e.note, e.ref === "hidden" ? "" : e.kind === "tx" ? `https://solscan.io/tx/${e.ref}` : `https://solscan.io/account/${e.ref}`]),
  ];
  write(`cases/${c.n}/evidence.csv`, rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n");
  n++;
}
for (const p of getPersons()) {
  const d = getPerson(p.handle)!;
  const { caseList, ...rest } = d;
  write(`api/persons/${p.handle.slice(1)}.json`, { ...rest, cases_list: caseList.map((c) => ({ n: c.n, id: c.id, headline: c.headline, severity: c.severity, url: withBase(`/cases/${c.n}`) })) });
}
const b = ensureTodayBallot();
const t = b ? tally(b) : {};
write("api/ballot.json", {
  ballot: b, tally: t, total: Object.values(t).reduce((a, c) => a + c, 0),
  history: getBallots().filter((x) => x.closed).map((x) => ({ id: x.id, options: x.options, winner: x.winner, runner_up: x.runner_up, tally: tally(x), votes: Object.keys(x.votes).length })),
  static: true,
});
write("feed.xml", atomFeed());
console.log(`static api: ${n} cases, ${getPersons().length} persons`);
