import { getCases } from "./data";
import { siteUrl } from "./format";
import { enforce } from "./policy";

const esc = (s: string) => enforce(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Atom feed of the archive, newest first. */
export function atomFeed(): string {
  const base = siteUrl();
  const cases = getCases().slice(0, 50);
  const updated = cases[0]?.opened_at ?? new Date().toISOString();
  const entries = cases
    .map(
      (c) => `  <entry>
    <id>${base}/cases/${c.n}</id>
    <title>${esc(`Case ${c.id}: ${c.headline}`)}</title>
    <link href="${base}/cases/${c.n}"/>
    <updated>${c.opened_at}</updated>
    <summary>${esc(`${c.charge}. ${c.findings.length} findings. $${c.token.symbol}. Severity ${c.severity}. Convictions: 0.`)}</summary>
  </entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>C.R.I.M.E. case files</title>
  <subtitle>Cases opened. Crimes found. Convictions: 0.</subtitle>
  <id>${base}/</id>
  <link href="${base}/"/>
  <link rel="self" href="${base}/feed.xml"/>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}
