import { searchCases } from "@/lib/data";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";
export { OPTIONS } from "@/lib/api";

export function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").slice(0, 100);
  const severity = u.searchParams.get("severity") ?? "";
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 50) || 50));
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
      url: `/cases/${c.n}`,
      card: `/cases/${c.n}/card.png`,
    })),
  });
}
