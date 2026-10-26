/**
 * Case card renderer. Builds the card as HTML, screenshots it with Chromium.
 * The site (web/) reproduces this design in CSS; this is the reference.
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import type { Case } from "./types.js";
import { enforce } from "./policy.js";

const require = createRequire(import.meta.url);
const monoDir = dirname(require.resolve("@fontsource/ibm-plex-mono/package.json"));
const sansDir = dirname(require.resolve("@fontsource/ibm-plex-sans/package.json"));

export const CARD_W = 1200;
export const CARD_H = 630;

export const COLORS = {
  page: "#0e0e10",
  manila: "#ece3cc",
  ink: "#141414",
  red: "#b3121b",
};

const esc = (s: string) =>
  enforce(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function cardHtml(c: Case): string {
  const findings = c.findings
    .slice(0, 3)
    .map(
      (f, i) =>
        `<li><span class="code">${esc(f.code)}</span><span class="t">${esc(f.title)}</span></li>`,
    )
    .join("");
  const subjects = c.subjects.length ? c.subjects.map((s) => esc(s)).join(" · ") : "—";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"IBM Plex Mono";font-weight:400;src:url("file://${monoDir}/files/ibm-plex-mono-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-weight:500;src:url("file://${monoDir}/files/ibm-plex-mono-latin-500-normal.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-weight:600;src:url("file://${monoDir}/files/ibm-plex-mono-latin-600-normal.woff2") format("woff2")}
@font-face{font-family:"IBM Plex Sans";font-weight:700;src:url("file://${sansDir}/files/ibm-plex-sans-latin-700-normal.woff2") format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${CARD_W}px;height:${CARD_H}px;background:${COLORS.page};overflow:hidden}
body{padding:36px;font-family:"IBM Plex Mono",monospace;color:${COLORS.ink}}
.card{position:relative;width:100%;height:100%;background:${COLORS.manila};border:2px solid ${COLORS.ink};padding:34px 40px;display:flex;flex-direction:column}
.card:before{content:"";position:absolute;inset:6px;border:1px solid ${COLORS.ink};pointer-events:none}
.top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ${COLORS.ink};padding-bottom:14px}
.brand{font-family:"IBM Plex Sans",sans-serif;font-weight:700;font-size:34px;letter-spacing:.02em}
.no{font-size:18px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0 24px;margin-top:22px;border-bottom:1px solid ${COLORS.ink};padding-bottom:16px}
.meta div{font-size:13px;line-height:1.5}
.meta b{display:block;font-weight:600;font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.65}
.meta .v{font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sev{color:${COLORS.red};font-weight:600;text-transform:uppercase}
h1{font-family:"IBM Plex Sans",sans-serif;font-weight:700;font-size:46px;line-height:1.08;letter-spacing:-.01em;margin-top:26px;max-width:860px}
.charge{margin-top:12px;font-size:15px;letter-spacing:.1em;text-transform:uppercase;font-weight:500}
ol{list-style:none;margin-top:auto;display:flex;flex-direction:column;gap:6px;max-width:760px}
li{display:flex;gap:16px;font-size:15px;line-height:1.4}
.code{font-weight:600;color:${COLORS.red};min-width:84px}
.foot{display:flex;justify-content:space-between;margin-top:18px;padding-top:12px;border-top:1px solid ${COLORS.ink};font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:500}
.foot .conv{color:${COLORS.red};font-weight:600}
.stamp{position:absolute;right:66px;top:238px;transform:rotate(-12deg);color:${COLORS.red};border:5px solid ${COLORS.red};border-radius:10px;padding:10px 26px;font-family:"IBM Plex Sans",sans-serif;font-weight:700;font-size:96px;line-height:1;letter-spacing:.08em;mix-blend-mode:multiply;opacity:.9}
.stamp:before{content:"";position:absolute;inset:4px;border:2px solid ${COLORS.red};border-radius:6px}
.stamp small{display:block;font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.3em;text-align:center;margin-top:4px;font-weight:600}
</style></head><body><div class="card">
<div class="top"><div class="brand">C.R.I.M.E.</div><div class="no">Case file No. ${esc(c.id)}</div></div>
<div class="meta">
<div><b>Opened</b><span class="v">${esc(c.opened_at.slice(0, 10))}</span></div>
<div><b>${c.kind === "person" ? "Worst token" : "Token"}</b><span class="v">${c.token.mint ? "$" + esc(c.token.symbol) : "—"}</span></div>
<div><b>Subject</b><span class="v">${subjects}</span></div>
<div><b>Severity</b><span class="v sev">${esc(c.severity)}</span></div>
</div>
<h1>${esc(c.headline)}</h1>
<div class="charge">${esc(c.charge)}</div>
<ol>${findings}</ol>
<div class="foot"><span>${c.token.mint ? "CA " + esc(c.token.mint) : esc(c.subjects[0] ?? "")}</span><span class="conv">Convictions 0</span></div>
<div class="stamp">LEGAL<small>C.R.I.M.E.</small></div>
</div></body></html>`;
}

export async function renderCards(cases: Case[], outDir: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: CARD_W, height: CARD_H }, deviceScaleFactor: 1 });
    for (const c of cases) {
      const html = `${outDir}/${c.png.replace(/\.png$/, ".html")}`;
      await writeFile(html, cardHtml(c));
      await page.goto(`file://${html}`);
      await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
      await page.screenshot({ path: `${outDir}/${c.png}`, type: "png" });
      await unlink(html);
      process.stdout.write(`  rendered ${c.png}\n`);
    }
  } finally {
    await browser.close();
  }
}
