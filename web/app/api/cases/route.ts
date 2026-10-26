import { searchCases } from "@/lib/data";
import { json } from "@/lib/api";
import { dyn } from "@/lib/request";
import { STATIC, withBase } from "@/lib/dyn";


export async function GET(req: Request) {
  await dyn();
  // The static export has no query string: it is the whole archive.
  const u = STATIC ? null : new URL(req.url);
  const q = (u?.searchParams.get("q") ?? "").slice(0, 100);
  const severity = u?.searchParams.get("severity") ?? "";
  const limit = u ? Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 50) || 50)) : 500;
  const cases = searchCases({ q, severity }).slice(0, limit);
  return json({
    count: cases.length,
    cases: cases.map((c) => ({
      n: c.n,
      id: c.id,
      opened_at: c.opened_at,
      status: c.status,
      severity: c.severity,
      score: c.score,
      token: c.token,
      subjects: c.subjects,
      headline: c.headline,
      charge: c.charge,
      findings: c.findings.length,
      url: withBase(`/cases/${c.n}`),
      card: withBase(`/cases/${c.n}/card.png`),
    })),
  });
}
